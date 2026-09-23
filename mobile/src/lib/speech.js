import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';

const VOICE_LANG = { en: 'en-IN', hi: 'hi-IN' };

let speaking = false;
let currentUrgency = 'notice';
let listeners = new Set();

const notify = () => listeners.forEach((fn) => fn(speaking));
export const onSpeakingChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/**
 * Speak a line.
 * Urgent lines cut off whatever is being said; normal lines wait their turn
 * and are simply dropped if something more important is already talking.
 */
export async function say(text, { lang = 'en', urgency = 'notice', rate = 1.0 } = {}) {
  if (!text) return;

  if (speaking) {
    if (urgency !== 'urgent' || currentUrgency === 'urgent') return;
    Speech.stop();
  }

  if (urgency === 'urgent') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  } else if (urgency === 'notice') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }

  speaking = true;
  currentUrgency = urgency;
  notify();

  return new Promise((resolve) => {
    Speech.speak(text, {
      language: VOICE_LANG[lang] || 'en-IN',
      rate: urgency === 'urgent' ? Math.min(rate + 0.08, 1.4) : rate,
      pitch: 1.0,
      onDone: () => {
        speaking = false;
        notify();
        resolve();
      },
      onStopped: () => {
        speaking = false;
        notify();
        resolve();
      },
      onError: () => {
        speaking = false;
        notify();
        resolve();
      },
    });
  });
}

export function stopSpeaking() {
  Speech.stop();
  speaking = false;
  notify();
}

export const isSpeaking = () => speaking;
