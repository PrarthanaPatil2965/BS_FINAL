import base64
import logging
import time

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import config
from .services import detector, groq_client, hazard, vocab
from .services.groq_client import RateLimitedError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("blindspot")

app = FastAPI(title="BlindSpot API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in config.ALLOWED_ORIGINS.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)

PERCEIVE_PROMPT = (
    "You are the perception module of a walking aid for a blind person. "
    "The photo comes from a phone camera facing forward at chest height. "
    "Return ONLY a JSON object, no prose:\n"
    '{"objects":[{"n":"<english noun>","pos":"left|center|right","d":<metres as number>,'
    '"m":"static|approaching|crossing"}],'
    '"path":"clear|partially_blocked|blocked",'
    '"surface":"flat|step_up|step_down|stairs|uneven|unknown",'
    '"text":"<important sign or door text, else empty>"}\n'
    "Include at most 5 objects and only things that affect walking safety. "
    "Estimate distance in metres. Use plain lowercase English nouns."
)

ASK_SYSTEM_EN = (
    "You are BlindSpot, a calm assistant for a blind user. Answer in one or two short "
    "spoken sentences. Lead with the thing that matters. Give directions as left, right, "
    "straight ahead, and distances in metres. Never mention images, photos or cameras. "
    "Reply in English."
)
ASK_SYSTEM_HI = (
    "आप BlindSpot हैं, एक दृष्टिबाधित व्यक्ति के लिए शांत सहायक। एक या दो छोटे वाक्यों में उत्तर दें। "
    "सबसे ज़रूरी बात पहले बताएं। दिशा बाएँ, दाएँ, सीधे आगे के रूप में और दूरी मीटर में बताएं। "
    "तस्वीर या कैमरे का ज़िक्र कभी न करें। केवल हिंदी में उत्तर दें।"
)


def _norm_lang(lang: str | None) -> str:
    l = (lang or "en").lower()
    return "hi" if l.startswith("hi") else "en"


class PerceiveIn(BaseModel):
    image: str = Field(..., description="base64 JPEG, no data: prefix")
    lang: str = "en"
    session_id: str = "default"


class AskIn(BaseModel):
    question: str
    image: str | None = None
    lang: str = "en"
    session_id: str = "default"


class SttIn(BaseModel):
    audio: str = Field(..., description="base64 audio clip, no data: prefix")
    ext: str = "m4a"
    lang: str = "auto"


class SosIn(BaseModel):
    name: str | None = None
    contact: str
    lat: float | None = None
    lng: float | None = None
    lang: str = "en"
    send_via_server: bool = False


@app.get("/")
def root():
    return {"service": "BlindSpot API", "docs": "/docs", "health": "/health"}


@app.get("/health")
async def health():
    return {
        "ok": True,
        "groq_key_loaded": bool(config.GROQ_API_KEY),
        "yolo": detector.available(),
        "vision_models": config.VISION_MODELS,
        "text_models": config.TEXT_MODELS,
        "stt_model": config.STT_MODEL,
        "groq_min_interval_s": config.GROQ_MIN_INTERVAL_S,
    }


def _rate_limit_response(e: RateLimitedError):
    """429s get their own status so the phone can back off instead of
    treating Groq's own rate limit as 'server unreachable'."""
    raise HTTPException(429, detail={"message": str(e), "retry_after": e.retry_after})


@app.post("/v1/perceive")
async def perceive(body: PerceiveIn):
    """One camera frame in, a speak-or-stay-silent decision out."""
    if not config.GROQ_API_KEY:
        raise HTTPException(500, "GROQ_API_KEY is not set on the server")
    started = time.perf_counter()
    lang = _norm_lang(body.lang)

    local = []
    if detector.available():
        try:
            local = detector.detect(base64.b64decode(body.image))
        except Exception as e:
            log.warning("local detect failed: %s", e)
        # Nothing close by: skip the vision call and save a round trip.
        if local and min(o["d"] for o in local) > 7.0:
            result = hazard.evaluate({"objects": local, "path": "clear", "surface": "unknown"}, lang, body.session_id)
            result["latency_ms"] = int((time.perf_counter() - started) * 1000)
            result["source"] = "yolo"
            return result

    try:
        perception = await groq_client.vision_json(PERCEIVE_PROMPT, body.image)
    except RateLimitedError as e:
        if local:
            # We already have a local YOLO read for this frame - degrade to
            # that instead of going silent for the retry_after window.
            perception = {"objects": local, "path": "unknown", "surface": "unknown", "text": ""}
        else:
            _rate_limit_response(e)
    except Exception as e:
        log.error("vision failed: %s", e)
        if local:
            perception = {"objects": local, "path": "unknown", "surface": "unknown", "text": ""}
        else:
            raise HTTPException(503, f"perception unavailable: {e}")

    if local:
        # Merge: trust YOLO's distances, keep anything the vision model adds.
        seen = {o["n"] for o in local}
        merged = local + [o for o in perception.get("objects", []) if o.get("n") not in seen]
        perception["objects"] = merged

    result = hazard.evaluate(perception, lang, body.session_id)
    result["latency_ms"] = int((time.perf_counter() - started) * 1000)
    result["source"] = "hybrid" if local else "vision"
    return result


@app.post("/v1/ask")
async def ask(body: AskIn):
    if not config.GROQ_API_KEY:
        raise HTTPException(500, "GROQ_API_KEY is not set on the server")
    lang = _norm_lang(body.lang)
    system = ASK_SYSTEM_HI if lang == "hi" else ASK_SYSTEM_EN
    started = time.perf_counter()
    try:
        answer = await groq_client.vision_text(system, body.question, body.image)
    except RateLimitedError as e:
        _rate_limit_response(e)
    except Exception as e:
        raise HTTPException(503, f"assistant unavailable: {e}")
    return {
        "answer": answer,
        "lang": lang,
        "latency_ms": int((time.perf_counter() - started) * 1000),
    }


@app.post("/v1/stt")
async def stt(body: SttIn):
    """Speech to text. Audio travels as base64 JSON, the same transport the
    camera frames already use reliably - React Native's fetch+FormData path
    for {uri, type, name} file objects is known to mangle multipart uploads
    on some builds, which Groq then reports back as an unsupported format
    even though the extension and MIME type were both correct.
    'auto' lets Whisper decide between Hindi and English."""
    if not config.GROQ_API_KEY:
        raise HTTPException(500, "GROQ_API_KEY is not set on the server")
    try:
        data = base64.b64decode(body.audio, validate=False)
    except Exception:
        raise HTTPException(400, "audio is not valid base64")

    hint = None if body.lang == "auto" else _norm_lang(body.lang)
    ext = (body.ext or "m4a").lstrip(".").lower()
    try:
        out = await groq_client.transcribe(f"clip.{ext}", data, hint)
    except RateLimitedError as e:
        _rate_limit_response(e)
    except ValueError:
        # Clip was too short/empty - a normal outcome of a quick tap, not an error.
        return {"text": "", "lang": _norm_lang(body.lang), "empty": True}
    except Exception as e:
        raise HTTPException(503, f"transcription unavailable: {e}")
    return {"text": out["text"], "lang": _norm_lang(out["language"]), "empty": not out["text"]}


@app.post("/v1/stt/multipart")
async def stt_multipart(file: UploadFile = File(...), lang: str = Form("auto")):
    """Kept for curl/debugging only. The app itself uses /v1/stt (base64 JSON)."""
    if not config.GROQ_API_KEY:
        raise HTTPException(500, "GROQ_API_KEY is not set on the server")
    data = await file.read()
    hint = None if lang == "auto" else _norm_lang(lang)
    try:
        out = await groq_client.transcribe(file.filename or "clip.m4a", data, hint)
    except RateLimitedError as e:
        _rate_limit_response(e)
    except ValueError:
        return {"text": "", "lang": "en", "empty": True}
    except Exception as e:
        raise HTTPException(503, f"transcription unavailable: {e}")
    return {"text": out["text"], "lang": _norm_lang(out["language"]), "empty": not out["text"]}


@app.post("/v1/sos")
async def sos(body: SosIn):
    """Builds the emergency text. The phone sends it; the server is a backup path."""
    lang = _norm_lang(body.lang)
    who = body.name or ("BlindSpot user" if lang == "en" else "BlindSpot उपयोगकर्ता")
    if body.lat is not None and body.lng is not None:
        link = f"https://maps.google.com/?q={body.lat},{body.lng}"
        loc_en = f"My location: {link}"
        loc_hi = f"मेरी लोकेशन: {link}"
    else:
        link = ""
        loc_en = "Location not available."
        loc_hi = "लोकेशन उपलब्ध नहीं है।"

    message = (
        f"EMERGENCY. This is {who}. I need help now. {loc_en} Sent by BlindSpot."
        if lang == "en"
        else f"आपातकाल। मैं {who} हूँ। मुझे तुरंत मदद चाहिए। {loc_hi} BlindSpot द्वारा भेजा गया।"
    )

    delivered = False
    error = None
    if body.send_via_server and config.TWILIO_SID and config.TWILIO_TOKEN and config.TWILIO_FROM:
        try:
            import httpx

            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.post(
                    f"https://api.twilio.com/2010-04-01/Accounts/{config.TWILIO_SID}/Messages.json",
                    auth=(config.TWILIO_SID, config.TWILIO_TOKEN),
                    data={"From": config.TWILIO_FROM, "To": body.contact, "Body": message},
                )
                delivered = r.status_code in (200, 201)
                if not delivered:
                    error = r.text[:200]
        except Exception as e:
            error = str(e)

    return {
        "message": message,
        "maps_link": link,
        "contact": body.contact,
        "server_delivered": delivered,
        "error": error,
        "spoken_confirmation": vocab.PHRASES[lang]["sos_sent"],
    }


@app.post("/v1/session/reset")
async def session_reset(session_id: str = Form("default")):
    hazard.reset_session(session_id)
    return {"ok": True}


@app.on_event("shutdown")
async def _shutdown():
    await groq_client.close()
