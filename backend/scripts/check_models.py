"""Lists the models your Groq key can actually use, and flags the ones
BlindSpot is configured to call. Run this first if anything 404s.

    python scripts/check_models.py
"""
import os, sys, httpx
from dotenv import load_dotenv

load_dotenv()
key = os.getenv("GROQ_API_KEY", "")
if not key:
    sys.exit("GROQ_API_KEY missing. Copy .env.example to .env and paste your key.")

r = httpx.get("https://api.groq.com/openai/v1/models",
              headers={"Authorization": f"Bearer {key}"}, timeout=20)
r.raise_for_status()
ids = sorted(m["id"] for m in r.json()["data"])

print(f"{len(ids)} models available to this key:\n")
for i in ids:
    print("  " + i)

wanted = os.getenv("VISION_MODELS", "meta-llama/llama-4-scout-17b-16e-instruct").split(",")
print("\nConfigured vision models:")
for w in wanted:
    w = w.strip()
    print(f"  {'OK    ' if w in ids else 'MISSING'} {w}")
print("\nIf every vision model says MISSING, pick a multimodal one from the list "
      "above and put it in VISION_MODELS in your .env")
