import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable } from 'react-native';

import { colors, radius, space, type } from '../theme';
import { t } from '../i18n/strings';
import { useApp } from '../state/AppState';
import { health, setBaseUrl } from '../api/client';
import { say } from '../lib/speech';
import { Card, BigButton } from '../components/ui';

function Field({ label, hint, value, onChangeText, keyboardType, placeholder }) {
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={[type.label, { color: colors.text }]}>{label}</Text>
      {hint ? (
        <Text style={[type.caption, { color: colors.textFaint, marginTop: 2 }]}>{hint}</Text>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={label}
        style={s.input}
      />
    </View>
  );
}

function Choice({ label, options, value, onChange }) {
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={[type.label, { color: colors.text, marginBottom: space.sm }]}>{label}</Text>
      <View style={s.choiceRow}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={o.label}
              style={[s.choice, active && s.choiceActive]}
            >
              <Text style={[type.label, { color: active ? colors.onAccent : colors.textMuted }]}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const { settings, update, uiLang } = useApp();
  const [status, setStatus] = useState(null);
  const [testing, setTesting] = useState(false);

  const test = async () => {
    setTesting(true);
    setStatus(null);
    try {
      setBaseUrl(settings.apiUrl);
      const h = await health();
      const msg = h.groq_key_loaded
        ? `${t(uiLang, 'connected')} · ${h.yolo ? 'YOLO + vision' : 'vision'}`
        : 'Server is up but GROQ_API_KEY is missing';
      setStatus({ ok: h.groq_key_loaded, msg });
      say(msg, { lang: uiLang, urgency: 'urgent', rate: settings.speechRate });
    } catch (e) {
      setStatus({ ok: false, msg: `${t(uiLang, 'connectionFailed')}: ${e.message}` });
      say(t(uiLang, 'connectionFailed'), { lang: uiLang, urgency: 'urgent', rate: settings.speechRate });
    } finally {
      setTesting(false);
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: space.md, paddingBottom: space.xl }}>
      <Text style={[type.title, { color: colors.text, marginBottom: space.md }]}>
        {t(uiLang, 'settings')}
      </Text>

      <Card>
        <Choice
          label={t(uiLang, 'language')}
          value={settings.lang}
          onChange={(v) => update({ lang: v })}
          options={[
            { value: 'en', label: t(uiLang, 'langEn') },
            { value: 'hi', label: t(uiLang, 'langHi') },
            { value: 'auto', label: t(uiLang, 'langAuto') },
          ]}
        />
        <Choice
          label={t(uiLang, 'alertLevel')}
          value={settings.alertLevel}
          onChange={(v) => update({ alertLevel: v })}
          options={[
            { value: 'quiet', label: t(uiLang, 'alertQuiet') },
            { value: 'normal', label: t(uiLang, 'alertNormal') },
            { value: 'chatty', label: t(uiLang, 'alertChatty') },
          ]}
        />
        <Choice
          label={t(uiLang, 'speechRate')}
          value={String(settings.speechRate)}
          onChange={(v) => update({ speechRate: Number(v) })}
          options={[
            { value: '0.85', label: '0.85x' },
            { value: '1', label: '1x' },
            { value: '1.2', label: '1.2x' },
          ]}
        />
      </Card>

      <Card style={{ marginTop: space.sm }}>
        <Field
          label={t(uiLang, 'yourName')}
          hint={t(uiLang, 'yourNameHint')}
          value={settings.userName}
          onChangeText={(v) => update({ userName: v })}
          placeholder="Riya"
        />
        <Field
          label={t(uiLang, 'emergencyContact')}
          hint={t(uiLang, 'emergencyContactHint')}
          value={settings.emergencyContact}
          onChangeText={(v) => update({ emergencyContact: v })}
          keyboardType="phone-pad"
          placeholder="+919876543210"
        />
      </Card>

      <Card style={{ marginTop: space.sm }}>
        <Field
          label={t(uiLang, 'serverUrl')}
          hint={t(uiLang, 'serverUrlHint')}
          value={settings.apiUrl}
          onChangeText={(v) => update({ apiUrl: v })}
          placeholder="http://192.168.1.5:8000"
        />
        <BigButton label={t(uiLang, 'testConnection')} busy={testing} onPress={test} />
        {status && (
          <Text
            style={[
              type.body,
              { color: status.ok ? colors.clear : colors.urgent, marginTop: space.sm },
            ]}
          >
            {status.msg}
          </Text>
        )}
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  input: {
    marginTop: space.sm,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.md,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 17,
  },
  choiceRow: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  choice: {
    paddingHorizontal: space.md,
    paddingVertical: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.line,
    minWidth: 92,
    alignItems: 'center',
  },
  choiceActive: { backgroundColor: colors.clear, borderColor: colors.clear },
});
