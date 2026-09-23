/**
 * Microphone capture.
 *
 * expo-audio only supports the hook form - constructing AudioRecorder by hand
 * gives you an object whose native side was never wired up, so record() looks
 * like it works and stop() hands back nothing. This must be called at the top
 * level of a component.
 */
import { useCallback, useState } from 'react';
import {
  useAudioRecorder,
  useAudioRecorderState,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
} from 'expo-audio';

export function useRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [error, setError] = useState(null);

  const ensurePermission = useCallback(async () => {
    try {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        setError('Microphone permission denied');
        return false;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      return true;
    } catch (e) {
      setError(`Audio setup failed: ${e.message}`);
      return false;
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      return true;
    } catch (e) {
      setError(`Could not start recording: ${e.message}`);
      return false;
    }
  }, [recorder]);

  const stop = useCallback(async () => {
    try {
      await recorder.stop();
      // Release the audio session so text-to-speech is not muted afterwards.
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      return recorder.uri || null;
    } catch (e) {
      setError(`Could not stop recording: ${e.message}`);
      return null;
    }
  }, [recorder]);

  return {
    start,
    stop,
    ensurePermission,
    isRecording: !!state?.isRecording,
    durationMs: state?.durationMillis ?? 0,
    error,
  };
}
