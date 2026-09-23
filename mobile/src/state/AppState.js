import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setBaseUrl, getBaseUrl } from '../api/client';

const KEY = 'blindspot.settings.v1';

const DEFAULTS = {
  lang: 'en',            // 'en' | 'hi' | 'auto'
  userName: '',
  emergencyContact: '',
  apiUrl: getBaseUrl(),
  speechRate: 1.0,
  alertLevel: 'normal',  // 'quiet' | 'normal' | 'chatty'
};

const Ctx = createContext(null);

export function AppStateProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [ready, setReady] = useState(false);
  const [sessionId] = useState(() => `s-${Date.now()}-${Math.floor(Math.random() * 9999)}`);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) {
          const saved = { ...DEFAULTS, ...JSON.parse(raw) };
          setSettings(saved);
          setBaseUrl(saved.apiUrl);
        }
      } catch {}
      setReady(true);
    })();
  }, []);

  const update = async (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (patch.apiUrl !== undefined) setBaseUrl(patch.apiUrl);
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  };

  // 'auto' resolves per utterance; everywhere else we need a concrete language.
  const uiLang = settings.lang === 'hi' ? 'hi' : 'en';

  const value = useMemo(
    () => ({ settings, update, ready, sessionId, uiLang }),
    [settings, ready, sessionId, uiLang]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useApp = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppStateProvider');
  return v;
};
