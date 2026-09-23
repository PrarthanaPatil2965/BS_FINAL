import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as SMS from 'expo-sms';
import * as Haptics from 'expo-haptics';

import { colors, radius, space, type } from '../theme';
import { t } from '../i18n/strings';
import { useApp } from '../state/AppState';
import { buildSos } from '../api/client';
import { say, stopSpeaking } from '../lib/speech';

const HOLD_MS = 2000;
const COUNTDOWN = 3;

/**
 * Emergency SOS button.
 *
 * Flow: hold 2s -> 3s spoken countdown (tap to cancel) -> sends an SMS with
 * location -> opens the dialler with the contact ready, one tap from calling.
 *
 * This deliberately avoids any silent/background-call native module. A
 * fully silent ACTION_CALL needs CALL_PHONE plus a third-party native
 * module, which is exactly the kind of dependency that breaks across
 * Android/React-Native versions with the ABI crash you hit earlier. Opening
 * the dialler pre-filled is one tap slower but never crashes the build,
 * works identically in Expo Go and in a built APK, and needs nothing beyond
 * standard, actively-maintained Expo modules (expo-sms, expo-location,
 * Linking from react-native itself).
 */
export default function SosButton({ compact = false }) {
  const { settings, uiLang } = useApp();
  const [phase, setPhase] = useState('idle'); // idle | holding | armed | sending
  const [count, setCount] = useState(COUNTDOWN);
  const [status, setStatus] = useState(null);
  const holdTimer = useRef(null);
  const tickTimer = useRef(null);

  const clearAll = () => {
    clearTimeout(holdTimer.current);
    clearInterval(tickTimer.current);
    holdTimer.current = null;
    tickTimer.current = null;
  };

  useEffect(() => clearAll, []);

  const normalise = (n) => (n || '').replace(/[\s()-]/g, '');

  const onPressIn = () => {
    if (phase === 'armed') return cancel();
    if (phase === 'sending') return;
    setStatus(null);
    setPhase('holding');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    holdTimer.current = setTimeout(arm, HOLD_MS);
  };

  const onPressOut = () => {
    if (phase === 'holding') {
      clearAll();
      setPhase('idle');
    }
  };

  const cancel = () => {
    clearAll();
    stopSpeaking();
    setPhase('idle');
    setCount(COUNTDOWN);
    setStatus(null);
    say(uiLang === 'hi' ? 'रद्द किया गया' : 'Cancelled', { lang: uiLang, rate: settings.speechRate });
  };

  const arm = () => {
    if (!normalise(settings.emergencyContact)) {
      say(t(uiLang, 'sosNoContact'), { lang: uiLang, urgency: 'urgent', rate: settings.speechRate });
      setStatus(t(uiLang, 'sosNoContact'));
      Alert.alert(t(uiLang, 'sos'), t(uiLang, 'sosNoContact'));
      setPhase('idle');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    setPhase('armed');
    let n = COUNTDOWN;
    setCount(n);
    say(`${t(uiLang, 'sosArmed')} ${n}`, { lang: uiLang, urgency: 'urgent', rate: settings.speechRate });
    tickTimer.current = setInterval(() => {
      n -= 1;
      setCount(n);
      if (n <= 0) {
        clearAll();
        fire();
      } else {
        say(`${n}`, { lang: uiLang, urgency: 'urgent', rate: settings.speechRate });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      }
    }, 1000);
  };

  const openDialler = (number) => {
    const url = `tel:${number}`;
    Linking.openURL(url).catch(() => {
      setStatus(
        uiLang === 'hi' ? `${number} पर खुद कॉल करें।` : `Dial ${number} manually.`
      );
    });
  };

  const fire = async () => {
    setPhase('sending');
    const number = normalise(settings.emergencyContact);

    say(t(uiLang, 'sosSending'), { lang: uiLang, urgency: 'urgent', rate: settings.speechRate });
    setStatus(uiLang === 'hi' ? 'लोकेशन ली जा रही है…' : 'Getting your location…');

    let lat = null;
    let lng = null;
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) perm = await Location.requestForegroundPermissionsAsync();
      if (perm.granted) {
        const pos = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000)),
        ]);
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      }
    } catch {
      // Emergency must not wait on a GPS fix.
    }

    let message =
      uiLang === 'hi'
        ? 'आपातकाल। मुझे तुरंत मदद चाहिए। BlindSpot द्वारा भेजा गया।'
        : 'EMERGENCY. I need help now. Sent by BlindSpot.';
    try {
      const res = await buildSos({ name: settings.userName, contact: number, lat, lng, lang: uiLang });
      message = res.message;
    } catch {
      if (lat && lng) message += ` https://maps.google.com/?q=${lat},${lng}`;
    }

    let smsOk = false;
    try {
      const available = await SMS.isAvailableAsync();
      if (available) {
        setStatus(uiLang === 'hi' ? 'संदेश खुल रहा है…' : 'Opening the message…');
        const result = await SMS.sendSMSAsync([number], message);
        smsOk = result?.result === 'sent' || result?.result === 'unknown';
      } else {
        setStatus('SMS is unavailable on this device (no SIM, or an emulator). Opening the dialler.');
      }
    } catch (e) {
      setStatus(`Message step failed: ${e.message}. Opening the dialler.`);
    }

    say(t(uiLang, 'sosCalling'), { lang: uiLang, urgency: 'urgent', rate: settings.speechRate });

    // Small gap so the SMS app's exit doesn't swallow the dialler intent.
    setTimeout(() => {
      openDialler(number);
      if (smsOk) setStatus(t(uiLang, 'sosDone'));
      setPhase('idle');
      setCount(COUNTDOWN);
    }, 700);
  };

  const label =
    phase === 'armed'
      ? `${t(uiLang, 'sosArmed')} ${count} — ${t(uiLang, 'sosCancel')}`
      : phase === 'sending'
      ? t(uiLang, 'sosSending')
      : t(uiLang, 'sos');

  return (
    <View>
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={phase === 'armed' ? cancel : undefined}
        accessibilityRole="button"
        accessibilityLabel={t(uiLang, 'sos')}
        accessibilityHint={t(uiLang, 'sosHold')}
        style={({ pressed }) => [
          s.wrap,
          compact && s.compact,
          { backgroundColor: phase === 'idle' ? colors.urgent : '#B51D22', opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={[compact ? type.bodyStrong : type.title, { color: '#fff' }]}>{label}</Text>
        {phase === 'idle' && !compact && (
          <Text style={[type.caption, { color: '#FFD7D8', marginTop: 2 }]}>{t(uiLang, 'sosHold')}</Text>
        )}
        {phase === 'holding' && <View style={s.holdBar} />}
      </Pressable>

      {status ? (
        <Text style={s.status} accessibilityLiveRegion="assertive">
          {status}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 76,
  },
  compact: { minHeight: 56, paddingVertical: space.sm },
  holdBar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, backgroundColor: '#fff', opacity: 0.6 },
  status: { color: colors.notice, fontSize: 13, marginTop: 6, textAlign: 'center' },
});
