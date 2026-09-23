"""Thin async wrapper over Groq's OpenAI-compatible API.

Handles the one thing that reliably breaks hackathon demos: a model ID that was
deprecated last month. We walk a candidate list and cache the winner.
"""
import asyncio
import json
import logging
import re
import time

import httpx

from .. import config

log = logging.getLogger("blindspot.groq")

_working = {"vision": None, "text": None}

_client: httpx.AsyncClient | None = None

# Groq's free tier counts vision AND text calls against the SAME per-minute
# quota (Whisper is separate and far more generous), so pacing is global
# rather than per-kind. One lock keeps concurrent perceive()/ask() calls from
# both racing to the front of the queue.
_pace_lock = asyncio.Lock()
_last_call_at = 0.0

_RETRY_RE = re.compile(r"try again in ([\d.]+)\s*s", re.IGNORECASE)


async def _pace():
    """Sleep just enough that calls never leave less than GROQ_MIN_INTERVAL_S
    between them. This is what keeps a busy detection loop under the free
    tier's ~30 requests/minute instead of hitting 429s and stalling."""
    global _last_call_at
    async with _pace_lock:
        wait = config.GROQ_MIN_INTERVAL_S - (time.monotonic() - _last_call_at)
        if wait > 0:
            await asyncio.sleep(wait)
        _last_call_at = time.monotonic()


class RateLimitedError(RuntimeError):
    """Raised on a 429 after Groq's own suggested wait has already been
    tried once. Carries retry_after so callers can back off intelligently
    instead of guessing."""

    def __init__(self, message: str, retry_after: float = 5.0):
        super().__init__(message)
        self.retry_after = retry_after


def _parse_retry_after(response: httpx.Response, body: str) -> float:
    header = response.headers.get("retry-after")
    if header:
        try:
            return max(0.5, float(header))
        except ValueError:
            pass
    m = _RETRY_RE.search(body)
    if m:
        try:
            return max(0.5, float(m.group(1)))
        except ValueError:
            pass
    return 5.0


def client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            base_url=config.GROQ_BASE_URL,
            timeout=httpx.Timeout(30.0, connect=5.0),
            headers={"Authorization": f"Bearer {config.GROQ_API_KEY}"},
        )
    return _client


async def close():
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def _is_model_error(status: int, body: str) -> bool:
    if status in (400, 404):
        low = body.lower()
        return "model" in low and ("not found" in low or "decommission" in low or "does not exist" in low)
    return False


async def _chat(kind: str, messages: list, max_tokens: int, temperature: float, json_mode: bool):
    candidates = config.VISION_MODELS if kind == "vision" else config.TEXT_MODELS
    if _working[kind]:
        candidates = [_working[kind]] + [m for m in candidates if m != _working[kind]]

    last_err = None
    for model in candidates:
        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        await _pace()
        try:
            r = await client().post("/chat/completions", json=payload)
        except Exception as e:  # network hiccup: try next model
            last_err = str(e)
            continue

        if r.status_code == 200:
            _working[kind] = model
            return r.json()["choices"][0]["message"]["content"]

        body = r.text[:400]
        last_err = f"{r.status_code} {body}"

        if r.status_code == 429:
            retry_after = _parse_retry_after(r, body)
            log.warning("rate limited on %s, retry after %.1fs", model, retry_after)
            # One short, bounded wait-and-retry on the SAME model rather than
            # burning through the fallback list, which would just hit 429 on
            # every other model too since the quota is account-wide.
            if retry_after <= 8:
                await asyncio.sleep(retry_after)
                r2 = await client().post("/chat/completions", json=payload)
                if r2.status_code == 200:
                    _working[kind] = model
                    return r2.json()["choices"][0]["message"]["content"]
                body = r2.text[:400]
                retry_after = _parse_retry_after(r2, body)
            raise RateLimitedError(f"Groq rate limit: {body}", retry_after=retry_after)

        if _is_model_error(r.status_code, body):
            log.warning("model %s unavailable, falling back", model)
            continue
        break

    raise RuntimeError(f"Groq {kind} call failed: {last_err}")


async def vision_json(prompt: str, image_b64: str, max_tokens: int = 320) -> dict:
    """Ask a vision model for a strict JSON object."""
    content = [
        {"type": "text", "text": prompt},
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
    ]
    raw = await _chat("vision", [{"role": "user", "content": content}], max_tokens, 0.0, True)
    return _parse_json(raw)


async def vision_text(system: str, question: str, image_b64: str | None, max_tokens: int = 220) -> str:
    parts: list = [{"type": "text", "text": question}]
    if image_b64:
        parts.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}})
    kind = "vision" if image_b64 else "text"
    return (
        await _chat(
            kind,
            [{"role": "system", "content": system}, {"role": "user", "content": parts if image_b64 else question}],
            max_tokens,
            0.2,
            False,
        )
    ).strip()


async def text(system: str, user: str, max_tokens: int = 200) -> str:
    return (
        await _chat(
            "text",
            [{"role": "system", "content": system}, {"role": "user", "content": user}],
            max_tokens,
            0.2,
            False,
        )
    ).strip()


async def transcribe(filename: str, data: bytes, language_hint: str | None = None) -> dict:
    if len(data) < 500:
        # A file this small is silence or a truncated recording; sending it
        # anyway just gets Groq's generic decode error, which reads as
        # "unsupported format" but really means "there is nothing here".
        raise ValueError("audio clip is empty or too short")

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "m4a"
    mime = {
        "m4a": "audio/mp4",
        "mp4": "audio/mp4",
        "wav": "audio/wav",
        "webm": "audio/webm",
        "ogg": "audio/ogg",
        "caf": "audio/x-caf",
        "flac": "audio/flac",
        "mp3": "audio/mpeg",
    }.get(ext, "audio/mp4")
    log.info("STT request: filename=%s ext=%s mime=%s size=%d lang_hint=%s", filename, ext, mime, len(data), language_hint)

    files = {"file": (filename, data, mime)}
    form = {"model": config.STT_MODEL, "response_format": "verbose_json", "temperature": "0"}
    if language_hint:
        form["language"] = language_hint

    await _pace()
    r = await client().post("/audio/transcriptions", files=files, data=form)
    if r.status_code != 200:
        body = r.text[:500]
        log.error("Groq STT error %d: %s", r.status_code, body)
        if r.status_code == 429:
            raise RateLimitedError(f"Groq STT rate limit: {body}", retry_after=_parse_retry_after(r, body))
        raise RuntimeError(f"Groq STT failed ({r.status_code}): {body}")

    j = r.json()
    return {"text": (j.get("text") or "").strip(), "language": j.get("language") or language_hint or "en"}


def _parse_json(raw: str) -> dict:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    start, end = raw.find("{"), raw.rfind("}")
    if start != -1 and end != -1:
        raw = raw[start : end + 1]
    try:
        return json.loads(raw)
    except Exception:
        log.warning("bad JSON from model: %s", raw[:200])
        return {}
