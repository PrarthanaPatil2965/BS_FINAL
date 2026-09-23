import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, radius, space, type } from '../theme';

export function Card({ children, style, ...rest }) {
  return (
    <View style={[s.card, style]} {...rest}>
      {children}
    </View>
  );
}

export function StatusPill({ label, tone = 'clear' }) {
  const tint =
    tone === 'urgent' ? colors.urgent : tone === 'notice' ? colors.notice : tone === 'off' ? colors.textFaint : colors.clear;
  return (
    <View style={s.pill} accessibilityRole="text" accessibilityLabel={label}>
      <View style={[s.dot, { backgroundColor: tint }]} />
      <Text style={[type.caption, { color: tint }]}>{label}</Text>
    </View>
  );
}

export function BigButton({ label, hint, onPress, onPressIn, onPressOut, tone = 'surface', busy, disabled, style }) {
  const bg =
    tone === 'urgent' ? colors.urgent : tone === 'primary' ? colors.clear : colors.surfaceRaised;
  const fg = tone === 'surface' ? colors.text : colors.onAccent;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={({ pressed }) => [
        s.button,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[type.bodyStrong, { color: fg, textAlign: 'center' }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Stat({ value, label }) {
  return (
    <View style={s.stat} accessibilityLabel={`${label}: ${value}`}>
      <Text style={[type.title, { color: colors.text }]}>{value}</Text>
      <Text style={[type.caption, { color: colors.textFaint, marginTop: 2 }]}>{label}</Text>
    </View>
  );
}

export function Divider() {
  return <View style={s.divider} />;
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  button: {
    minHeight: 60,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  stat: { flex: 1, alignItems: 'center', paddingVertical: space.sm },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: space.sm },
});
