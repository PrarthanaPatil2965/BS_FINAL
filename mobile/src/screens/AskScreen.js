import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';

import { colors, radius, space, type } from '../theme';
import { t } from '../i18n/strings';
import { useApp } from '../state/AppState';
import { ask, transcribe } from '../api/client';
import { captureFrame } from '../lib/frame';
import { say } from '../lib/speech';
import { useRecorder } from '../lib/useRecorder';
import { Card, BigButton } from '../components/ui';

const MIN_RECORDING_MS = 400;

export default function AskScreen() {
  const { settings, uiLang, sessionId } = useApp();
  const [permission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const scrollRef = useRef(null);
  const startedAt = useRef(0);

  const recorder = useRecorder();
  const [turns, setTurns] = useState([]);
  const [phase, setPhase] = useState('idle'); // idle | listening | thinking
  const [note, setNote] = useState(null);

  const push = (role, text) =>
    setTurns((prev) => [...prev, { role, text, id: `${Date.now()}-${Math.random()}` }]);

  const scrollDown = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

  const runQuestion = async (question, spokenLang) => {
    setPhase('thinking');
    const replyLang = settings.lang === 'auto' ? spokenLang || uiLang : uiLang;
    try {
      const b64 = await captureFrame(cameraRef);
      const res = await ask(question, b64, replyLang, sessionId);
      push('assistant', res.answer);
      say(res.answer, { lang: replyLang, urgency: 'urgent', rate: settings.speechRate });
    } catch (e) {
      const msg =
        e.status === 429
          ? replyLang === 'hi'
            ? 'अभी बहुत सारे अनुरोध हो रहे हैं। कुछ सेकंड में फिर पूछें।'
            : 'Too many requests right now. Try again in a few seconds.'
          : replyLang === 'hi'
          ? 'सर्वर से संपर्क नहीं हो रहा।'
          : 'Cannot reach the server right now.';
      push('assistant', msg);
      setNote(e.message);
      say(msg, { lang: replyLang, urgency: 'urgent', rate: settings.speechRate });
    } finally {
      setPhase('idle');
      scrollDown();
    }
  };

  const onPressIn = async () => {
    if (phase !== 'idle') return;
    setNote(null);
    const ok = await recorder.ensurePermission();
    if (!ok) {
      setNote(recorder.error || t(uiLang, 'permMic'));
      say(t(uiLang, 'permMic'), { lang: uiLang, rate: settings.speechRate });
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const started = await recorder.start();
    if (!started) {
      setNote(recorder.error || 'Recording did not start');
      return;
    }
    startedAt.current = Date.now();
    setPhase('listening');
  };

  const onPressOut = async () => {
    if (phase !== 'listening') return;

    // A tap that is too quick produces an empty file that Whisper rejects.
    const held = Date.now() - startedAt.current;
    if (held < MIN_RECORDING_MS) {
      await new Promise((r) => setTimeout(r, MIN_RECORDING_MS - held));
    }

    setPhase('thinking');
    const uri = await recorder.stop();
    if (!uri) {
      setNote(recorder.error || 'No audio captured. Hold the button down while you speak.');
      setPhase('idle');
      return;
    }

    try {
      const hint = settings.lang === 'auto' ? 'auto' : uiLang;
      const stt = await transcribe(uri, hint);
      if (!stt.text) {
        setNote(
          uiLang === 'hi'
            ? 'कुछ सुनाई नहीं दिया। बटन दबाए रखते हुए बोलें।'
            : 'I heard nothing. Hold the button down while you speak.'
        );
        setPhase('idle');
        return;
      }
      push('user', stt.text);
      scrollDown();
      await runQuestion(stt.text, stt.lang);
    } catch (e) {
      setNote(e.message);
      setPhase('idle');
      say(
        uiLang === 'hi' ? 'आवाज़ समझ नहीं आई। फिर कोशिश करें।' : 'I did not catch that. Try again.',
        { lang: uiLang, rate: settings.speechRate }
      );
    }
  };

  const quick = (key) => {
    const q = t(uiLang, key);
    push('user', q);
    runQuestion(q, uiLang);
  };

  const buttonLabel =
    phase === 'listening'
      ? `${t(uiLang, 'releaseToSend')} · ${(recorder.durationMs / 1000).toFixed(1)}s`
      : phase === 'thinking'
      ? t(uiLang, 'thinking')
      : t(uiLang, 'holdToAsk');

  return (
    <View style={s.screen}>
      {permission?.granted && (
        <CameraView
          ref={cameraRef}
          style={s.hiddenCamera}
          facing="back"
          animateShutter={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      )}

      <View style={{ padding: space.md, paddingBottom: 0 }}>
        <Text style={[type.title, { color: colors.text }]}>{t(uiLang, 'askQuestion')}</Text>
        <Text style={[type.caption, { color: colors.textFaint, marginTop: 4 }]}>
          {t(uiLang, 'askIntro')}
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: space.md, gap: space.sm }}
      >
        {turns.length === 0 && (
          <Card>
            <Text style={[type.caption, { color: colors.textFaint, marginBottom: space.sm }]}>
              {uiLang === 'hi' ? 'कुछ उदाहरण' : 'Try one of these'}
            </Text>
            {['askExample1', 'askExample2', 'askExample3'].map((k) => (
              <Pressable key={k} onPress={() => quick(k)} accessibilityRole="button" style={s.suggestion}>
                <Text style={[type.body, { color: colors.clear }]}>{t(uiLang, k)}</Text>
              </Pressable>
            ))}
          </Card>
        )}

        {turns.map((turn) => (
          <View
            key={turn.id}
            style={[s.bubble, turn.role === 'user' ? s.user : s.assistant]}
            accessibilityLabel={`${turn.role === 'user' ? t(uiLang, 'you') : t(uiLang, 'blindspot')}: ${turn.text}`}
          >
            <Text
              style={[type.caption, { color: turn.role === 'user' ? 'rgba(8,19,26,0.65)' : colors.textFaint }]}
            >
              {turn.role === 'user' ? t(uiLang, 'you') : t(uiLang, 'blindspot')}
            </Text>
            <Text
              style={[type.body, { color: turn.role === 'user' ? colors.onAccent : colors.text, marginTop: 3 }]}
            >
              {turn.text}
            </Text>
          </View>
        ))}
      </ScrollView>

      {note ? (
        <Text style={s.note} accessibilityLiveRegion="polite">
          {note}
        </Text>
      ) : null}

      <View style={{ padding: space.md, paddingTop: 0 }}>
        <BigButton
          label={buttonLabel}
          tone={phase === 'listening' ? 'urgent' : 'primary'}
          busy={phase === 'thinking'}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          hint={t(uiLang, 'holdToAsk')}
          style={{ minHeight: 84 }}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  hiddenCamera: { position: 'absolute', width: 1, height: 1, opacity: 0.01 },
  bubble: { borderRadius: radius.md, padding: space.md, maxWidth: '88%' },
  user: { alignSelf: 'flex-end', backgroundColor: colors.clear },
  assistant: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  suggestion: { paddingVertical: space.sm },
  note: { color: colors.notice, paddingHorizontal: space.md, paddingBottom: space.sm, fontSize: 14 },
});
