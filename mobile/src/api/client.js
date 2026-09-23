/**
 * Every network call the app makes. One place to change the base URL,
 * one place to handle timeouts.
 */

const DEFAULT_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.5:8000';

let baseUrl = DEFAULT_URL;

export const setBaseUrl = (url) => {
  if (url && url.trim()) baseUrl = url.trim().replace(/\/+$/, '');
};
export const getBaseUrl = () => baseUrl;

async function request(path, { method = 'POST', body, isForm = false, timeout = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: isForm ? undefined : { 'Content-Type': 'application/json' },
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      const err = new Error(`Bad response from server (${res.status})`);
      err.status = res.status;
      throw err;
    }
    if (!res.ok) {
      const detail = json.detail;
      const message = typeof detail === 'string' ? detail : detail?.message || `Server error ${res.status}`;
      const err = new Error(message);
      err.status = res.status;
      if (detail?.retry_after) err.retryAfter = detail.retry_after;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

export const health = () => request('/health', { method: 'GET', timeout: 8000 });

export const perceive = (imageBase64, lang, sessionId) =>
  request('/v1/perceive', {
    body: { image: imageBase64, lang, session_id: sessionId },
    timeout: 15000,
  });

export const ask = (question, imageBase64, lang, sessionId) =>
  request('/v1/ask', {
    body: { question, image: imageBase64, lang, session_id: sessionId },
    timeout: 25000,
  });

/**
 * React Native's fetch+FormData path for {uri, type, name} file objects is a
 * known source of silently-corrupted uploads on newer RN/Hermes builds - the
 * request "succeeds" but Groq receives bytes that don't decode as any real
 * audio format, which surfaces as a confusing "unsupported format" error.
 * Reading the clip as base64 and sending it as JSON sidesteps that path
 * entirely; it's exactly how the camera frames already travel, reliably.
 */
export async function transcribe(uri, lang = 'auto') {
  const ext = (uri.split('.').pop() || 'm4a').split('?')[0].toLowerCase();

  let base64;
  try {
    // expo-file-system v19 (SDK 54+) replaced the old function-based API
    // with this object-based File class - readAsStringAsync still exists
    // under expo-file-system/legacy but is deprecated, so we use the
    // current one directly rather than carrying a warning forward.
    const { File } = require('expo-file-system');
    base64 = await new File(uri).base64();
  } catch (e) {
    throw new Error(`Could not read the recorded clip: ${e.message}`);
  }

  if (!base64 || base64.length < 200) {
    return { text: '', lang: lang === 'auto' ? 'en' : lang, empty: true };
  }

  return request('/v1/stt', {
    body: { audio: base64, ext, lang },
    timeout: 25000,
  });
}

export const buildSos = ({ name, contact, lat, lng, lang, sendViaServer = false }) =>
  request('/v1/sos', {
    body: { name, contact, lat, lng, lang, send_via_server: sendViaServer },
    timeout: 15000,
  });