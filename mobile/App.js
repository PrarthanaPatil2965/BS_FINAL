import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native';

import { colors, space, type } from './src/theme';
import { t } from './src/i18n/strings';
import { AppStateProvider, useApp } from './src/state/AppState';
import HomeScreen from './src/screens/HomeScreen';
import AskScreen from './src/screens/AskScreen';
import MapScreen from './src/screens/MapScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SosButton from './src/components/SosButton';

const TABS = [
  { key: 'home', label: 'tabHome' },
  { key: 'ask', label: 'tabAsk' },
  { key: 'map', label: 'tabMap' },
  { key: 'settings', label: 'tabSettings' },
];

function Shell() {
  const { uiLang, ready } = useApp();
  const [screen, setScreen] = useState('home');

  if (!ready) {
    return <View style={s.root} />;
  }

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.ground} />

      <View style={{ flex: 1 }}>
        {screen === 'home' && <HomeScreen setScreen={setScreen} />}
        {screen === 'ask' && <AskScreen />}
        {screen === 'map' && <MapScreen />}
        {screen === 'settings' && <SettingsScreen />}
      </View>

      {/* Emergency stays reachable from every screen, never more than one press away. */}
      <View style={s.sosBar}>
        <SosButton compact />
      </View>

      <View style={s.tabs} accessibilityRole="tablist">
        {TABS.map((tab) => {
          const active = screen === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setScreen(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t(uiLang, tab.label)}
              style={s.tab}
            >
              <View style={[s.tabMark, active && { backgroundColor: colors.clear }]} />
              <Text style={[type.label, { color: active ? colors.text : colors.textFaint }]}>
                {t(uiLang, tab.label)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.ground,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0,
  },
  sosBar: {
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    backgroundColor: colors.ground,
  },
  tabs: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
    paddingBottom: Platform.OS === 'ios' ? 0 : space.xs,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.sm,
    gap: 6,
    minHeight: 58,
    justifyContent: 'center',
  },
  tabMark: {
    width: 22,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
});
