# BlindSpot

AI companion for visually impaired independence. Team MERIDIAN.

The phone stays in the pocket. The app watches the path through the camera,
speaks only when something matters, answers questions by voice in Hindi or
English, and puts emergency help one press away.

```
mobile/          Expo React Native app (the product)
backend/         FastAPI service: perception, context engine, voice, SOS text
docs/            Demo script and architecture notes
```

---

## What it actually does

| Piece | How it works |
|---|---|
| Hazard detection | Camera frame every ~1 second, analysed by a Groq vision model, returned as structured JSON |
| Context engine | Python scoring: object danger weight x proximity x position x motion |
| Intelligent silence | Per-object cooldowns and a rising-risk rule, so it stays quiet unless something changed |
| Voice out | Device text-to-speech, `en-IN` and `hi-IN`, urgent lines interrupt normal ones |
| Voice in | Groq Whisper, auto-detects Hindi vs English, replies in the language you spoke |
| Map | Live position, spoken address, share location by SMS |
| Emergency SOS | Hold 2s, 3s spoken countdown, SMS with a maps link, then dials the contact |

Alerts are built from templates, not from the language model, so the spoken
warning costs no extra time once the frame has been read.

---

## Before you start

You need three things:

1. **Groq API key** — free, no card. https://console.groq.com/keys
2. **Python 3.11+** and **Node 20+**
3. **An Android phone** with Expo Go installed, on the same Wi-Fi as your laptop

---

## Part 1 — Backend (20 minutes)

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# Mac / Linux
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env          # Windows: copy .env.example .env
```

Open `.env` and paste your key:

```
GROQ_API_KEY=gsk_your_real_key_here
```

Check which models your key can reach. Groq deprecates models often and this
is the single most common reason a demo breaks:

```bash
python scripts/check_models.py
```

If every configured vision model says MISSING, copy a multimodal model ID from
the printed list into `VISION_MODELS` in `.env`.

Run it:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Open http://127.0.0.1:8000/health — you should see `"groq_key_loaded": true`.

Test perception with any street photo:

```bash
python scripts/smoke_test.py http://127.0.0.1:8000 street.jpg
```

You should get an English line and a Hindi line describing the same hazard,
with the latency in milliseconds.

### Optional: local YOLO fast path

Skip this if you are short on time. It adds a sub-100ms local pass that filters
out frames with nothing nearby, saving both latency and free-tier quota.

```bash
pip install ultralytics
python scripts/export_yolo.py
```

Restart the server. `/health` will show `"yolo": true`.

---

## Part 2 — Mobile app (25 minutes)

```bash
cd mobile
npm install
npx expo install --fix      # aligns every package with your Expo SDK
```

If `npm install` fights you over versions, scaffold clean instead:

```bash
npx create-expo-app@latest blindspot-app --template blank
cd blindspot-app
npx expo install expo-camera expo-speech expo-location expo-sms expo-haptics \
  expo-audio expo-image-manipulator @react-native-async-storage/async-storage \
  react-native-maps
```

then copy `App.js`, `src/`, `app.json` and `eas.json` from this repo over the
new project.

### Point the app at your backend

Find your laptop's LAN IP:

```bash
ipconfig            # Windows, look for IPv4 Address
ifconfig | grep inet   # Mac / Linux
```

```bash
cp .env.example .env
```

Set `EXPO_PUBLIC_API_URL=http://192.168.1.5:8000` using your real IP.
`localhost` will not work — that points at the phone itself.

You can also change it inside the app under Settings without rebuilding.

### Run

```bash
npx expo start
```

Scan the QR code with Expo Go. Grant camera, microphone and location when
asked. Go to **Settings**, enter your emergency number with the country code,
then press **Test connection**. It should speak "Connected".

---

## Part 3 — Check it end to end

1. **Home** — point the camera at a chair or a doorway. It should speak only
   when something is genuinely close, and stay silent otherwise.
2. Switch language to हिन्दी in Settings. The same hazards should now be
   spoken in Hindi.
3. **Ask** — hold the big button, say "मेरे सामने क्या है?", release. It should
   transcribe, answer and speak back in Hindi.
4. **Map** — press "Speak my location". It should read out your street.
5. **Emergency** — set your own second number as the contact first. Hold the
   red bar for 2 seconds, let the countdown run, and confirm the SMS composer
   opens with a maps link, then the dialler.

---

## Part 4 — Deploy the backend

### Render (recommended, free)

1. Push this repo to GitHub.
2. render.com → New → Web Service → connect the repo.
3. Root directory `backend`, runtime Python.
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Environment variables: `GROQ_API_KEY` = your key, `USE_YOLO` = `off`.
5. Deploy, then open `https://your-service.onrender.com/health`.

`render.yaml` is already in `backend/` if you prefer Blueprint deploys.

Free instances sleep after inactivity. Hit `/health` a minute before you
present so the first frame is not slow.

### Hugging Face Spaces (backup)

New Space → Docker → SDK blank. Upload the contents of `backend/`, add
`GROQ_API_KEY` as a Space secret. The included `Dockerfile` works as is.

Once deployed, change the server address in the app's Settings screen to the
public URL. No rebuild needed.

---

## Part 5 — Build the APK

```bash
npm install -g eas-cli
eas login
eas build:configure
```

Set the deployed URL in `eas.json` under `preview.env.EXPO_PUBLIC_API_URL`, then:

```bash
eas build -p android --profile preview
```

You get a downloadable APK link in about 15 minutes. That is your demo
artefact — judges can install it without Expo Go.

---

## Two-day plan

**Day 1, morning** — Backend running locally, `/health` green, smoke test
producing English and Hindi alerts from a real photo.

**Day 1, afternoon** — Mobile app on the phone via Expo Go. Home screen
detection loop working, speech coming out.

**Day 1, evening** — Ask screen with voice in both languages. Settings saved.

**Day 2, morning** — Map, emergency SOS end to end with a real second phone.
Tune `URGENT_THRESHOLD` and cooldowns in `backend/.env` until it feels calm
rather than chatty.

**Day 2, afternoon** — Deploy to Render, point the app at the public URL,
build the APK.

**Day 2, evening** — Rehearse with `docs/DEMO_SCRIPT.md`. Record a 90-second
backup video in case the venue Wi-Fi fails.

---

## Tuning the alerts

Everything lives in `backend/.env` and takes effect on reload:

| Setting | Effect |
|---|---|
| `URGENT_THRESHOLD` (0.50) | Lower = interrupts more often |
| `NOTICE_THRESHOLD` (0.25) | Lower = mentions more things |
| `NOTICE_COOLDOWN_S` (6.0) | Seconds before repeating the same object |
| `URGENT_COOLDOWN_S` (2.5) | Same, for dangerous things |

Object danger weights are in `backend/app/services/vocab.py`. Add Indian
street objects there — open drains, cattle, parked scooters — and the Hindi
noun next to it.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Could not reach the server" in the app | Use the LAN IP, not localhost. Both devices on the same Wi-Fi. Allow port 8000 through the laptop firewall. |
| `model_not_found` in the backend log | Run `scripts/check_models.py`, put a working ID in `VISION_MODELS`. |
| No Hindi voice | Android Settings → System → Languages → Text-to-speech → install the Hindi voice data. |
| Detection feels slow | Check the `ms` counter on the Home screen. Over 1500ms is usually upload size — confirm `expo-image-manipulator` installed. |
| 429 rate limit | Free tier. Raise the gap in `HomeScreen.js` (`IDLE_GAP_MS`) to 1500. |
| SMS does not auto-send | Android does not allow silent SMS from a normal app. The composer opens pre-filled; that is expected and safe. Add Twilio credentials in `backend/.env` if you want true server-side sending. |

---

## Honest limits, worth saying out loud in the pitch

- Distance is estimated from a single camera, so it is approximate, not lidar.
- The app assists; it does not replace a cane or a guide dog.
- Detection needs a data connection. Offline on-device inference is the next
  step, and is in the future scope.
