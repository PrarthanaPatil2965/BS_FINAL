"""Central configuration. Everything is overridable from .env"""
import os
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/")

# Groq rotates its catalogue often. We try these in order and remember the first
# one that works, so a deprecated model never breaks the app mid-demo.
VISION_MODELS = [
    m.strip()
    for m in os.getenv(
        "VISION_MODELS",
        "meta-llama/llama-4-scout-17b-16e-instruct,"
        "meta-llama/llama-4-maverick-17b-128e-instruct,"
        "qwen/qwen3.6-27b",
    ).split(",")
    if m.strip()
]

TEXT_MODELS = [
    m.strip()
    for m in os.getenv("TEXT_MODELS", "openai/gpt-oss-20b,openai/gpt-oss-120b").split(",")
    if m.strip()
]

STT_MODEL = os.getenv("STT_MODEL", "whisper-large-v3-turbo")

# Groq's free tier is ~30 requests/minute shared across every chat/vision
# model on the account (Whisper has its own, much larger daily allowance).
# This is a hard floor between the *starts* of two chat/vision calls so a
# busy demo backs off before Groq does it for us with a 429.
GROQ_MIN_INTERVAL_S = float(os.getenv("GROQ_MIN_INTERVAL_S", "2.1"))

# Perception tuning
URGENT_THRESHOLD = float(os.getenv("URGENT_THRESHOLD", "0.50"))
NOTICE_THRESHOLD = float(os.getenv("NOTICE_THRESHOLD", "0.25"))
GLOBAL_MIN_GAP_S = float(os.getenv("GLOBAL_MIN_GAP_S", "1.2"))
NOTICE_COOLDOWN_S = float(os.getenv("NOTICE_COOLDOWN_S", "6.0"))
URGENT_COOLDOWN_S = float(os.getenv("URGENT_COOLDOWN_S", "2.5"))

# Optional: real outbound SMS/voice. Leave blank to use the phone's own dialler.
TWILIO_SID = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
TWILIO_FROM = os.getenv("TWILIO_FROM_NUMBER", "").strip()

YOLO_ONNX_PATH = os.getenv("YOLO_ONNX_PATH", "models/yolov8n.onnx")
USE_YOLO = os.getenv("USE_YOLO", "auto").lower()  # auto | on | off

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*")
