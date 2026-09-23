"""End to end check against a running backend.

    python scripts/smoke_test.py http://127.0.0.1:8000 path/to/street.jpg
"""
import base64, sys, json, httpx

base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
img = sys.argv[2] if len(sys.argv) > 2 else None

print(json.dumps(httpx.get(f"{base}/health", timeout=20).json(), indent=2))
if not img:
    sys.exit("Pass a JPEG path as the second argument to test perception.")

b64 = base64.b64encode(open(img, "rb").read()).decode()
for lang in ("en", "hi"):
    r = httpx.post(f"{base}/v1/perceive",
                   json={"image": b64, "lang": lang, "session_id": f"smoke-{lang}"},
                   timeout=40).json()
    print(f"\n[{lang}] {r['latency_ms']}ms  speak={r['speak']}  urgency={r['urgency']}")
    print("  message:", r["message"] or "(silent)")
    print("  objects:", [o["name"] for o in r["objects"]])

r = httpx.post(f"{base}/v1/ask",
               json={"question": "What is in front of me?", "image": b64, "lang": "en"},
               timeout=40).json()
print("\nAsk:", r["answer"])
