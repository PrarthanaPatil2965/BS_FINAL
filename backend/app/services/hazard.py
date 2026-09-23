"""Context engine: score hazards, then decide whether to speak at all.

This is the part of BlindSpot that makes it usable rather than exhausting.
A naive detector narrates everything; this one keeps quiet unless something
actually matters, and interrupts itself only when the risk goes up.
"""
import time
from dataclasses import dataclass, field

from .. import config
from . import vocab


@dataclass
class Session:
    last_spoken_at: float = 0.0
    last_key: str = ""
    last_score: float = 0.0
    history: dict = field(default_factory=dict)  # key -> (timestamp, score)
    frames: int = 0
    alerts: int = 0
    started_at: float = field(default_factory=time.time)


_sessions: dict[str, Session] = {}


def get_session(sid: str) -> Session:
    s = _sessions.get(sid)
    if s is None:
        s = Session()
        _sessions[sid] = s
    return s


def reset_session(sid: str):
    _sessions.pop(sid, None)


def _prune():
    now = time.time()
    for sid, s in list(_sessions.items()):
        if now - s.started_at > 3 * 3600:
            _sessions.pop(sid, None)


def score_object(obj: dict) -> float:
    name = str(obj.get("n") or obj.get("name") or "").lower()
    try:
        dist = float(obj.get("d", obj.get("distance", 5)))
    except (TypeError, ValueError):
        dist = 5.0
    dist = max(0.3, min(dist, 20.0))
    pos = str(obj.get("pos", "center")).lower()
    motion = str(obj.get("m", obj.get("motion", "static"))).lower()

    weight = vocab.danger_weight(name)
    proximity = max(0.0, (10.0 - dist) / 10.0) ** 1.15
    position = 1.0 if pos == "center" else 0.75
    move = {"approaching": 1.35, "crossing": 1.15}.get(motion, 1.0)
    return round(min(1.0, weight * proximity * position * move), 3)


def _fmt_distance(d: float, lang: str) -> str:
    val = int(round(d)) if d >= 1 else round(d, 1)
    return vocab.PHRASES[lang]["metres"].format(d=val)


def sentence(obj: dict, lang: str) -> str:
    name = str(obj.get("n") or obj.get("name") or "obstacle").lower()
    pos = str(obj.get("pos", "center")).lower()
    motion = str(obj.get("m", "static")).lower()
    try:
        dist = float(obj.get("d", 5))
    except (TypeError, ValueError):
        dist = 5.0

    n = vocab.noun(name, lang)
    p = vocab.POS[lang].get(pos, vocab.POS[lang]["center"])
    m = vocab.MOTION[lang].get(motion, "")
    dtxt = _fmt_distance(dist, lang)

    if lang == "hi":
        # "आपकी बाईं ओर तेज़ी से आ रही कार, 3 मीटर"
        core = f"{p} {m} {n}".replace("  ", " ").strip() if m else f"{p} {n}"
        return f"{core}, {dtxt}"
    core = f"{n} {m} {p}".replace("  ", " ").strip() if m else f"{n} {p}"
    return f"{core.capitalize()}, {dtxt}"


def surface_alert(surface: str, lang: str) -> str | None:
    if surface in vocab.SURFACE[lang]:
        return vocab.SURFACE[lang][surface]
    return None


def evaluate(perception: dict, lang: str, sid: str) -> dict:
    """Turn raw perception into a speak / stay-silent decision."""
    _prune()
    s = get_session(sid)
    s.frames += 1
    now = time.time()

    objects = perception.get("objects") or []
    scored = []
    for o in objects[:8]:
        if not isinstance(o, dict):
            continue
        sc = score_object(o)
        scored.append({**o, "score": sc})
    scored.sort(key=lambda x: x["score"], reverse=True)

    surface = str(perception.get("surface", "unknown")).lower()
    top = scored[0] if scored else None
    top_score = top["score"] if top else 0.0

    # Surface hazards get their own floor: a step down is dangerous even when
    # nothing else is in the frame.
    surface_msg = surface_alert(surface, lang)
    surface_score = 0.0
    if surface in ("step_down", "stairs"):
        surface_score = 0.7
    elif surface in ("step_up", "uneven"):
        surface_score = 0.40

    if surface_score > top_score:
        key = f"surface:{surface}"
        message = surface_msg or ""
        score = surface_score
    elif top:
        key = f"{str(top.get('n','')).lower()}:{top.get('pos','center')}"
        message = sentence(top, lang)
        score = top_score
    else:
        key, message, score = "", "", 0.0

    urgency = (
        "urgent" if score >= config.URGENT_THRESHOLD
        else "notice" if score >= config.NOTICE_THRESHOLD
        else "silent"
    )

    speak = False
    reason = "below_threshold"
    if urgency != "silent" and message:
        since_any = now - s.last_spoken_at
        prev_ts, prev_score = s.history.get(key, (0.0, 0.0))
        since_key = now - prev_ts
        cooldown = config.URGENT_COOLDOWN_S if urgency == "urgent" else config.NOTICE_COOLDOWN_S

        if since_any < config.GLOBAL_MIN_GAP_S and urgency != "urgent":
            reason = "global_gap"
        elif since_key < cooldown and score < prev_score + 0.15:
            reason = "repeat_suppressed"
        else:
            speak = True
            reason = "spoken"

    if speak:
        s.last_spoken_at = now
        s.last_key = key
        s.last_score = score
        s.history[key] = (now, score)
        s.alerts += 1

    return {
        "speak": speak,
        "reason": reason,
        "urgency": urgency,
        "score": score,
        "message": message if speak else "",
        "objects": [
            {
                "name": o.get("n") or o.get("name"),
                "name_local": vocab.noun(str(o.get("n") or ""), lang),
                "position": o.get("pos", "center"),
                "distance": o.get("d"),
                "motion": o.get("m", "static"),
                "score": o["score"],
            }
            for o in scored[:6]
        ],
        "path": perception.get("path", "unknown"),
        "surface": surface,
        "sign_text": perception.get("text") or "",
        "stats": {
            "frames": s.frames,
            "alerts": s.alerts,
            "session_seconds": int(now - s.started_at),
        },
    }
