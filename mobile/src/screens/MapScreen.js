import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Linking, ScrollView } from 'react-native';
import * as Location from 'expo-location';
import * as SMS from 'expo-sms';

import { colors, radius, space, type } from '../theme';
import { t } from '../i18n/strings';
import { useApp } from '../state/AppState';
import { say } from '../lib/speech';
import { Card, BigButton } from '../components/ui';

/**
 * Leaflet inside a WebView rather than react-native-maps.
 *
 * react-native-maps needs a Google Maps API key, and its auth reliably fails
 * inside Expo Go, which shows as a blank grey box with no error. OpenStreetMap
 * tiles need no key and render identically in Expo Go and in the built APK,
 * so there is nothing that works on your laptop but not on stage.
 */
let WebView = null;
try {
  WebView = require('react-native-webview').WebView;
} catch {}

const leafletHtml = (lat, lng, label) => `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html, body, #map { height: 100%; margin: 0; background: #111C25; }
  .leaflet-control-attribution { font-size: 9px; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', { zoomControl: true, attributionControl: true })
    .setView([${lat}, ${lng}], 17);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
  L.circle([${lat}, ${lng}], { radius: 25, color: '#2DD4A7', fillColor: '#2DD4A7', fillOpacity: 0.25 }).addTo(map);
  L.marker([${lat}, ${lng}]).addTo(map).bindPopup(${JSON.stringify(label)}).openPopup();
</script>
</body>
</html>`;

export default function MapScreen() {
  const { settings, uiLang } = useApp();
  const [coords, setCoords] = useState(null);
  const [address, setAddress] = useState(null);
  const [error, setError] = useState(null);

  const locate = async () => {
    setError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setError(t(uiLang, 'noLocation'));
        return;
      }
      const enabled = await Location.hasServicesEnabledAsync();
      if (!enabled) {
        setError(t(uiLang, 'noLocation'));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      try {
        const [place] = await Location.reverseGeocodeAsync({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        if (place) {
          setAddress(
            [place.name, place.street, place.district, place.city, place.postalCode]
              .filter(Boolean)
              .join(', ')
          );
        }
      } catch {}
    } catch (e) {
      setError(`${t(uiLang, 'noLocation')} (${e.message})`);
    }
  };

  useEffect(() => {
    locate();
  }, []);

  const html = useMemo(
    () => (coords ? leafletHtml(coords.latitude, coords.longitude, address || t(uiLang, 'mapTitle')) : null),
    [coords, address, uiLang]
  );

  const speakLocation = () => {
    if (!coords) return say(t(uiLang, 'noLocation'), { lang: uiLang, rate: settings.speechRate });
    const text = address
      ? uiLang === 'hi'
        ? `आप इस समय ${address} के पास हैं।`
        : `You are near ${address}.`
      : uiLang === 'hi'
      ? `आपकी लोकेशन ${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)} है।`
      : `Your location is ${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}.`;
    say(text, { lang: uiLang, urgency: 'urgent', rate: settings.speechRate });
  };

  const openMaps = () => {
    if (!coords) return;
    Linking.openURL(`https://maps.google.com/?q=${coords.latitude},${coords.longitude}`).catch(() => {});
  };

  const shareLocation = async () => {
    if (!coords || !settings.emergencyContact) {
      say(t(uiLang, 'sosNoContact'), { lang: uiLang, rate: settings.speechRate });
      return;
    }
    const link = `https://maps.google.com/?q=${coords.latitude},${coords.longitude}`;
    const body =
      uiLang === 'hi' ? `मैं यहाँ हूँ: ${link} — BlindSpot` : `Here is where I am: ${link} — BlindSpot`;
    try {
      if (await SMS.isAvailableAsync()) {
        await SMS.sendSMSAsync([settings.emergencyContact], body);
      } else {
        setError('SMS is not available on this device. Use a real phone with a SIM.');
      }
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: space.md, gap: space.sm }}>
      <Text style={[type.title, { color: colors.text }]}>{t(uiLang, 'mapTitle')}</Text>

      <View style={s.mapWrap}>
        {WebView && html ? (
          <WebView
            originWhitelist={['*']}
            source={{ html }}
            style={StyleSheet.absoluteFill}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, s.mapFallback]}>
            <Text style={[type.body, { color: colors.textMuted, textAlign: 'center' }]}>
              {error ||
                (coords
                  ? `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`
                  : t(uiLang, 'locating'))}
            </Text>
            {!WebView && (
              <Text style={[type.caption, { color: colors.textFaint, marginTop: space.sm, textAlign: 'center' }]}>
                Run: npx expo install react-native-webview
              </Text>
            )}
          </View>
        )}
      </View>

      {address ? (
        <Card>
          <Text style={[type.body, { color: colors.text }]}>{address}</Text>
          {coords && (
            <Text style={[type.caption, { color: colors.textFaint, marginTop: 4 }]}>
              {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
            </Text>
          )}
        </Card>
      ) : null}

      {error ? (
        <Text style={[type.caption, { color: colors.notice }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <BigButton label={t(uiLang, 'mapSpeak')} tone="primary" onPress={speakLocation} />
      <BigButton label={t(uiLang, 'mapOpen')} onPress={openMaps} />
      <BigButton label={t(uiLang, 'mapShare')} onPress={shareLocation} />
      <BigButton label={uiLang === 'hi' ? 'लोकेशन फिर से खोजें' : 'Refresh location'} onPress={locate} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  mapWrap: {
    height: 300,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  mapFallback: { alignItems: 'center', justifyContent: 'center', padding: space.md },
});
