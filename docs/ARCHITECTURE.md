# Architecture

```
                 ┌──────────────────────────────┐
                 │        Phone (Expo RN)       │
                 │  camera · mic · GPS · TTS    │
                 └───────────────┬──────────────┘
                   640px JPEG    │   base64 over HTTPS
                   ~1 per second │
                 ┌───────────────▼──────────────┐
                 │      FastAPI backend         │
                 │                              │
   optional ┌────┤  1. YOLOv8n ONNX (local)     │  <100ms, gates the next step
            │    │  2. Groq vision → JSON       │  objects, distance, surface
            │    │  3. Context engine           │  danger scoring
            └────┤  4. Speak-or-silent          │  cooldowns, rising-risk rule
                 │  5. Bilingual templating     │  0ms, no LLM in the hot path
                 └───────────────┬──────────────┘
                                 │  {speak, urgency, message, objects}
                 ┌───────────────▼──────────────┐
                 │  Device TTS (en-IN / hi-IN)  │
                 └──────────────────────────────┘
```

## Why the alert text is templated, not generated

A language model writing each warning would add 300-800ms to every alert and
introduce phrasing drift: the same hazard described differently twice in a row
is confusing when you cannot see it. Templates give identical phrasing for
identical situations, instantly, in both languages. The language model is used
where variety is an asset — free-form questions on the Ask screen.

## Why the context engine sits on the server

Thresholds, danger weights and vocabulary are the parts you will tune most
during testing. Keeping them in `backend/.env` and `vocab.py` means a reload,
not an app rebuild.

## Request path, timed

| Stage | Typical |
|---|---|
| Capture and downscale to 640px | 120-200ms |
| Upload (~50KB on 4G) | 100-300ms |
| Groq vision JSON | 400-900ms |
| Context engine + templating | <5ms |
| Device TTS start | ~100ms |

Around 0.9 to 1.5 seconds from frame to first spoken syllable.

## Session state

Each app launch gets a session ID. The backend keeps per-session history of
what was said and when, which is what makes the cooldowns and the rising-risk
rule work. State is in memory and expires after three hours — no user data is
stored anywhere.

## What scales where

- **Different phones** — image is downscaled client-side, so camera quality
  barely changes the payload.
- **Different environments** — swap `vocab.py` weights; no code change.
- **Different modules** — perception, context and voice are separate services
  behind one API; any one can be replaced independently.
