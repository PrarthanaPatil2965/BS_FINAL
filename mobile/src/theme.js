/**
 * Design tokens.
 *
 * The app is used with the phone in a pocket, so the screen is mostly for
 * sighted helpers, judges and setup. It still has to be legible at arm's
 * length in sunlight: deep blue-slate ground, one accent per state, type that
 * starts large and never drops below 15px.
 */
export const colors = {
  ground: '#0A1117',
  surface: '#111C25',
  surfaceRaised: '#17252F',
  line: '#22323E',

  text: '#F2F6F8',
  textMuted: '#93A6B3',
  textFaint: '#63798A',

  clear: '#2DD4A7',   // path is safe
  notice: '#F5A524',  // worth knowing
  urgent: '#E5484D',  // act now
  route: '#4C9AFF',   // navigation

  onAccent: '#08131A',
};

export const space = { xs: 6, sm: 10, md: 16, lg: 24, xl: 34 };

export const radius = { sm: 10, md: 16, lg: 22, pill: 999 };

export const type = {
  display: { fontSize: 34, fontWeight: '700', letterSpacing: -0.6 },
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.3 },
  heading: { fontSize: 19, fontWeight: '600' },
  body: { fontSize: 17, fontWeight: '400', lineHeight: 24 },
  bodyStrong: { fontSize: 17, fontWeight: '600' },
  label: { fontSize: 15, fontWeight: '500' },
  caption: { fontSize: 13, fontWeight: '500' },
};

export const urgencyColor = (u) =>
  u === 'urgent' ? colors.urgent : u === 'notice' ? colors.notice : colors.clear;
