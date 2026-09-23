import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, AppState as RNAppState } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { colors, radius, space, type, urgencyColor } from '../theme';
import { t } from '../i18n/strings';
import { useApp } from '../state/AppState';
import { perceive, ask } from '../api/client';
import { captureFrame } from '../lib/frame';
import { say, onSpeakingChange, stopSpeaking } from '../lib/speech';
import { Card, StatusPill, BigButton, Stat } from '../components/ui';

// Groq's free tier is roughly 30 requests/minute shared across every model
// on the account. The backend paces its own calls too, but the loop needs to
// stay under that budget on its own side as well, or every frame just queues
// up behind the server's pacing instead of actually slowing down.
const IDLE_GAP_MS = 2300;     // gap after a quiet frame (~26 requests/min)
const BUSY_GAP_MS = 1600;     // gap after something was spoken - still paced
const ERROR_GAP_MS = 3000;    // back off when the server is unreachable
const RATE_LIMIT_GAP_MS = 6000; // floor when Groq itself says slow down

export default function HomeScreen({ setScreen }) {
  const { settings, uiLang, sessionId } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  const [running, setRunning] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [online, setOnline] = useState(true);
  const [rateLimited, setRateLimited] = useState(false);
  const [latency, setLatency] = useState(null);
  const [result, setResult] = useState(null);
  const [lastAlert, setLastAlert] = useState(null);
  const [describing, setDescribing] = useState(false);

  const runningRef = useRef(true);
  const mounted = useRef(true);
  const greeted = useRef(false);

  useEffect(() => onSpeakingChange(setSpeaking), []);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  // Pause the loop when the app goes to the background.
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (st) => {
      if (st !== 'active') {
        runningRef.current = false;
        stopSpeaking();
      } else {
        runningRef.current = running;
      }
    });
    return () => sub.remove();
  }, [running]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      runningRef.current = false;
      stopSpeaking();
    };
  }, []);

  const shouldSpeak = useCallback(
    (res) => {
      if (!res.speak) return false;
      if (settings.alertLevel === 'quiet') return res.urgency === 'urgent';
      return true;
    },
    [settings.alertLevel]
  );

  // The detection loop. One frame at a time, never overlapping requests.
  useEffect(() => {
    if (!permission?.granted) return undefined;
    let cancelled = false;

    const loop = async () => {
      // Give the camera a moment to warm up before the first frame.
      await new Promise((r) => setTimeout(r, 1200));
      if (!greeted.current) {
        greeted.current = true;
        say(t(uiLang, 'startup'), { lang: uiLang, rate: settings.speechRate });
      }

      while (!cancelled && mounted.current) {
        if (!runningRef.current) {
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
        let gap = IDLE_GAP_MS;
        try {
          const b64 = await captureFrame(cameraRef);
          if (!b64) {
            await new Promise((r) => setTimeout(r, 600));
            continue;
          }
          const res = await perceive(b64, uiLang, sessionId);
          if (cancelled || !mounted.current) break;

          setOnline(true);
          setRateLimited(false);
          setLatency(res.latency_ms);
          setResult(res);

          if (shouldSpeak(res)) {
            setLastAlert({ text: res.message, urgency: res.urgency, at: Date.now() });
            say(res.message, { lang: uiLang, urgency: res.urgency, rate: settings.speechRate });
            gap = BUSY_GAP_MS;
          }
        } catch (e) {
          if (e.status === 429) {
            // Groq itself asked us to slow down - this is not a connection
            // problem, so it gets its own status rather than "offline".
            setOnline(true);
            setRateLimited(true);
            gap = Math.max(RATE_LIMIT_GAP_MS, (e.retryAfter || 5) * 1000);
          } else {
            setOnline(false);
            setRateLimited(false);
            gap = ERROR_GAP_MS;
          }
        }
        await new Promise((r) => setTimeout(r, gap));
      }
    };

    loop();
    return () => {
      cancelled = true;
    };
  }, [permission?.granted, uiLang, sessionId, settings.speechRate, shouldSpeak]);

  const describe = async () => {
    if (describing) return;
    setDescribing(true);
    try {
      const b64 = await captureFrame(cameraRef);
      if (!b64) throw new Error('no frame');
      const q =
        uiLang === 'hi'
          ? 'मेरे आसपास क्या है? संक्षेप में बताएं।'
          : 'Describe what is around me, briefly.';
      const res = await ask(q, b64, uiLang, sessionId);
      say(res.answer, { lang: uiLang, urgency: 'urgent', rate: settings.speechRate });
      setLastAlert({ text: res.answer, urgency: 'notice', at: Date.now() });
    } catch {
      say(
        uiLang === 'hi' ? 'सर्वर से संपर्क नहीं हो रहा।' : 'Cannot reach the server right now.',
        { lang: uiLang, urgency: 'urgent', rate: settings.speechRate }
      );
    } finally {
      setDescribing(false);
    }
  };

  if (!permission) return <View style={s.screen} />;

  if (!permission.granted) {
    return (
      <View style={[s.screen, s.center]}>
        <Text style={[type.title, { color: colors.text, textAlign: 'center' }]}>
          {t(uiLang, 'appName')}
        </Text>
        <Text style={[type.body, { color: colors.textMuted, textAlign: 'center', marginVertical: space.md }]}>
          {t(uiLang, 'permCamera')}
        </Text>
        <BigButton label={t(uiLang, 'grant')} tone="primary" onPress={requestPermission} style={{ alignSelf: 'stretch' }} />
      </View>
    );
  }

  const path = result?.path;
  const pathLabel =
    path === 'blocked' ? t(uiLang, 'pathBlocked')
    : path === 'partially_blocked' ? t(uiLang, 'pathPartial')
    : t(uiLang, 'pathClear');
  const pathTone = path === 'blocked' ? 'urgent' : path === 'partially_blocked' ? 'notice' : 'clear';

  const statusLabel = !online
    ? t(uiLang, 'offline')
    : rateLimited ? (uiLang === 'hi' ? 'धीमा हो रहा है' : 'Slowing down')
    : !running ? t(uiLang, 'paused')
    : speaking ? t(uiLang, 'speaking')
    : t(uiLang, 'watching');
  const statusTone = !online ? 'urgent' : rateLimited ? 'notice' : !running ? 'off' : speaking ? 'notice' : 'clear';

  const urgent = result?.urgency === 'urgent' && result?.speak;

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: space.md, paddingBottom: space.xl }}>
      <View style={s.header}>
        <View>
          <Text style={[type.display, { color: colors.text }]}>{t(uiLang, 'appName')}</Text>
          <Text style={[type.caption, { color: colors.textFaint }]}>{t(uiLang, 'tagline')}</Text>
        </View>
        <StatusPill label={statusLabel} tone={statusTone} />
      </View>

      <View style={s.cameraWrap}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          animateShutter={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <View style={[s.pathBadge, { borderColor: urgencyColor(pathTone) }]}>
          <Text style={[type.label, { color: urgencyColor(pathTone) }]}>{pathLabel}</Text>
        </View>
        {latency != null && (
          <Text style={s.latency}>{latency} ms</Text>
        )}
      </View>

      {urgent && (
        <View style={s.urgentCard} accessibilityLiveRegion="assertive">
          <Text style={[type.caption, { color: '#FFD7D8', marginBottom: space.xs }]}>
            {uiLang === 'hi' ? 'तुरंत ध्यान दें' : 'Act now'}
          </Text>
          <Text style={[type.title, { color: '#fff' }]}>{result.message}</Text>
        </View>
      )}

      <Card style={{ marginTop: space.md }}>
        <Text style={[type.caption, { color: colors.textFaint }]}>{t(uiLang, 'lastAlert')}</Text>
        <Text
          style={[
            type.bodyStrong,
            { color: lastAlert ? urgencyColor(lastAlert.urgency) : colors.textMuted, marginTop: space.xs },
          ]}
        >
          {lastAlert ? lastAlert.text : t(uiLang, 'nothingYet')}
        </Text>
        {result?.sign_text ? (
          <Text style={[type.body, { color: colors.textMuted, marginTop: space.sm }]}>
            {uiLang === 'hi' ? 'बोर्ड: ' : 'Sign: '}
            {result.sign_text}
          </Text>
        ) : null}
      </Card>

      <Card style={{ marginTop: space.sm, flexDirection: 'row' }}>
        <Stat value={`${result?.stats?.session_seconds ?? 0}s`} label={t(uiLang, 'statSession')} />
        <Stat value={result?.stats?.alerts ?? 0} label={t(uiLang, 'statAlerts')} />
        <Stat value={result?.objects?.length ?? 0} label={t(uiLang, 'statTracked')} />
      </Card>

      {result?.objects?.length ? (
        <Card style={{ marginTop: space.sm }}>
          {result.objects.map((o, i) => (
            <View key={`${o.name}-${i}`} style={s.objectRow}>
              <View style={[s.scoreDot, { backgroundColor: urgencyColor(o.score >= 0.5 ? 'urgent' : o.score >= 0.25 ? 'notice' : 'clear') }]} />
              <Text style={[type.body, { color: colors.text, flex: 1 }]}>
                {uiLang === 'hi' ? o.name_local : o.name}
              </Text>
              <Text style={[type.caption, { color: colors.textFaint }]}>
                {o.position} · {o.distance}m
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      <View style={{ gap: space.sm, marginTop: space.md }}>
        <BigButton
          label={t(uiLang, 'describe')}
          hint={uiLang === 'hi' ? 'आसपास का विवरण सुनें' : 'Hear a summary of what is around you'}
          tone="primary"
          busy={describing}
          onPress={describe}
        />
        <BigButton
          label={t(uiLang, 'askQuestion')}
          onPress={() => setScreen('ask')}
        />
        <BigButton
          label={running ? t(uiLang, 'pause') : t(uiLang, 'resume')}
          onPress={() => {
            const next = !running;
            setRunning(next);
            runningRef.current = next;
            if (!next) stopSpeaking();
          }}
        />
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  center: { justifyContent: 'center', padding: space.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  cameraWrap: {
    height: 190,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: colors.line,
  },
  pathBadge: {
    position: 'absolute',
    left: space.sm,
    bottom: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    backgroundColor: 'rgba(10,17,23,0.78)',
  },
  latency: {
    position: 'absolute',
    right: space.sm,
    bottom: space.sm,
    color: colors.textFaint,
    fontSize: 12,
    backgroundColor: 'rgba(10,17,23,0.78)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  urgentCard: {
    marginTop: space.md,
    backgroundColor: colors.urgent,
    borderRadius: radius.lg,
    padding: space.md,
  },
  objectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: 7,
  },
  scoreDot: { width: 10, height: 10, borderRadius: 5 },
});
