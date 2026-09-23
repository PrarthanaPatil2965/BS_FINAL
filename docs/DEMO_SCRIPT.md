# Demo script — 4 minutes

Set up before you walk on: backend awake (hit `/health`), phone on the venue
Wi-Fi or a hotspot, emergency contact set to a teammate's phone, screen
mirrored, volume at maximum. Have the backup video ready.

Bring props: a chair, a bag on the floor, a printed sign.

---

**0:00 — The gap (30s)**

"2.2 billion people live with vision impairment. A cane finds an obstacle but
cannot tell you what it is. Smart glasses can, and they cost 35,000 to 3 lakh
rupees. 43 million visually impaired Indians, 80 percent priced out.

BlindSpot runs on the phone already in their pocket."

Put the phone in your shirt pocket, camera facing out.

---

**0:30 — Intelligent silence (45s)**

Walk a few steps across a clear floor. Nothing is spoken.

"Notice what it is not doing. A detector that narrates every object is
exhausting after ten minutes. Our context engine scores every object by what
it is, how close it is, whether it is in your path and whether it is moving
toward you. Below the threshold, it stays quiet."

---

**1:15 — A real hazard (45s)**

Have a teammate wheel a bicycle across your path, or step toward the chair.

> "Bicycle approaching fast on your left, 3 metres"

Point at the latency number on the mirrored screen.

"Frame to voice, under a second and a half. That number is on screen because
for someone walking, latency is a safety property, not a spec."

---

**2:00 — Hindi (40s)**

Open Settings, switch to हिन्दी. Repeat the hazard.

> "आपकी बाईं ओर तेज़ी से आ रही साइकिल, 3 मीटर"

Go to Ask, hold the button: "मेरे सामने क्या है?" Release. It answers in Hindi.

"Same model, same engine. Whisper detects the language, the answer comes back
in it. For most of the users we are building for, this is the difference
between usable and unusable."

---

**2:40 — Emergency (40s)**

"Independence needs a floor under it."

Hold the red bar. Countdown speaks. The SMS composer opens with a Google Maps
pin already in it; send it, and the dialler starts calling your teammate. Let
their phone ring on stage.

Two deliberate steps — a two second hold, then a countdown you can cancel —
so a pocket press never reaches a real person.

---

**3:20 — Close (40s)**

"Zero additional hardware. Zero additional cost. It runs on free-tier
inference today, and the architecture is modular, so depth estimation, traffic
signal detection and more languages drop in without a rewrite.

It does not replace a cane. It gives the cane context."

---

## Questions you will get

**How accurate is the distance?** Monocular estimate from object size, so
approximate — good enough to say "3 metres, on your left", not good enough for
surgery. LiDAR-equipped phones improve it; that is in the roadmap.

**What if there is no network?** Detection pauses and the app says so. The
local YOLO path already runs on-device logic; full offline inference is the
next milestone.

**What does it cost to run?** Free tier today. At roughly one frame per second
with 640px images, a user walking for an hour is a few cents of inference.

**Why not just use existing apps?** Most describe a scene when you ask. The
hard part is deciding *when to speak without being asked*, and staying quiet
the rest of the time. That decision engine is what we built.

**Is this safe to rely on?** We say plainly in the app and the pitch that it
assists a cane, it does not replace one.
