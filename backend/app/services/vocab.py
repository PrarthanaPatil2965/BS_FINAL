"""English / Hindi vocabulary and sentence templates.

Alerts are built from templates, not from an LLM call. That keeps the spoken
warning at roughly zero extra latency once the frame has been analysed.
"""

# Danger weight per object class (0 = harmless, 1 = can seriously injure)
DANGER = {
    "car": 1.00, "bus": 1.00, "truck": 1.00, "van": 0.95, "auto rickshaw": 0.95,
    "rickshaw": 0.9, "motorcycle": 0.95, "scooter": 0.92, "bicycle": 0.85,
    "train": 1.0, "cart": 0.7, "stairs": 0.95, "staircase": 0.95, "step": 0.8,
    "pit": 1.0, "hole": 1.0, "manhole": 1.0, "open drain": 1.0, "drain": 0.9,
    "kerb": 0.7, "curb": 0.7, "pole": 0.65, "pillar": 0.65, "barrier": 0.7,
    "construction": 0.8, "wet floor": 0.7, "glass door": 0.8, "door": 0.35,
    "wall": 0.6, "fence": 0.5, "gate": 0.45, "person": 0.40, "child": 0.5,
    "crowd": 0.55, "dog": 0.55, "cow": 0.8, "animal": 0.6,
    "chair": 0.4, "table": 0.4, "bench": 0.4, "bin": 0.4, "trash can": 0.4,
    "signboard": 0.25, "tree": 0.5, "plant": 0.25, "bag": 0.35, "box": 0.4,
    "escalator": 0.85, "lift": 0.3, "elevator": 0.3, "traffic signal": 0.3,
    "zebra crossing": 0.3, "road": 0.5, "puddle": 0.45, "wire": 0.6,
}
DEFAULT_DANGER = 0.45

HI_NOUNS = {
    "car": "कार", "bus": "बस", "truck": "ट्रक", "van": "वैन",
    "auto rickshaw": "ऑटो", "rickshaw": "रिक्शा", "motorcycle": "मोटरसाइकिल",
    "scooter": "स्कूटर", "bicycle": "साइकिल", "train": "ट्रेन", "cart": "ठेला",
    "stairs": "सीढ़ियाँ", "staircase": "सीढ़ियाँ", "step": "सीढ़ी",
    "pit": "गड्ढा", "hole": "गड्ढा", "manhole": "मैनहोल", "open drain": "खुली नाली",
    "drain": "नाली", "kerb": "फुटपाथ का किनारा", "curb": "फुटपाथ का किनारा",
    "pole": "खंभा", "pillar": "खंभा", "barrier": "बैरियर",
    "construction": "निर्माण कार्य", "wet floor": "गीला फर्श",
    "glass door": "काँच का दरवाज़ा", "door": "दरवाज़ा", "wall": "दीवार",
    "fence": "बाड़", "gate": "गेट", "person": "व्यक्ति", "child": "बच्चा",
    "crowd": "भीड़", "dog": "कुत्ता", "cow": "गाय", "animal": "जानवर",
    "chair": "कुर्सी", "table": "मेज़", "bench": "बेंच", "bin": "कूड़ेदान",
    "trash can": "कूड़ेदान", "signboard": "साइनबोर्ड", "tree": "पेड़",
    "plant": "पौधा", "bag": "बैग", "box": "डिब्बा", "escalator": "एस्केलेटर",
    "lift": "लिफ्ट", "elevator": "लिफ्ट", "traffic signal": "ट्रैफिक सिग्नल",
    "zebra crossing": "ज़ेबरा क्रॉसिंग", "road": "सड़क", "puddle": "पानी",
    "wire": "तार", "obstacle": "रुकावट",
}

POS = {
    "en": {"left": "on your left", "right": "on your right", "center": "straight ahead"},
    "hi": {"left": "आपकी बाईं ओर", "right": "आपकी दाईं ओर", "center": "आपके ठीक सामने"},
}

MOTION = {
    "en": {"approaching": "approaching fast", "crossing": "crossing", "static": ""},
    "hi": {"approaching": "तेज़ी से आ रही", "crossing": "रास्ता पार कर रही", "static": ""},
}

SURFACE = {
    "en": {
        "step_up": "Step up ahead",
        "step_down": "Step down ahead",
        "stairs": "Stairs ahead",
        "uneven": "Uneven ground ahead",
    },
    "hi": {
        "step_up": "आगे ऊपर की सीढ़ी है",
        "step_down": "आगे नीचे की सीढ़ी है",
        "stairs": "आगे सीढ़ियाँ हैं",
        "uneven": "आगे ज़मीन ऊबड़-खाबड़ है",
    },
}

PHRASES = {
    "en": {
        "clear": "Path is clear.",
        "blocked": "Path is blocked ahead.",
        "partial": "Path is partly blocked.",
        "metres": "{d} metres",
        "sign": "The sign reads: {t}",
        "no_camera": "Camera is not ready.",
        "listening": "Listening.",
        "sos_sent": "Emergency message sent. Calling now.",
        "offline": "Cannot reach the server. Detection paused.",
    },
    "hi": {
        "clear": "रास्ता साफ़ है।",
        "blocked": "आगे रास्ता बंद है।",
        "partial": "रास्ता आंशिक रूप से बंद है।",
        "metres": "{d} मीटर",
        "sign": "बोर्ड पर लिखा है: {t}",
        "no_camera": "कैमरा तैयार नहीं है।",
        "listening": "सुन रहा हूँ।",
        "sos_sent": "आपातकालीन संदेश भेज दिया गया है। कॉल की जा रही है।",
        "offline": "सर्वर से संपर्क नहीं हो रहा। पहचान रुकी हुई है।",
    },
}


def noun(name: str, lang: str) -> str:
    name = (name or "obstacle").lower().strip()
    if lang == "hi":
        return HI_NOUNS.get(name, HI_NOUNS.get("obstacle"))
    return name


def danger_weight(name: str) -> float:
    n = (name or "").lower().strip()
    if n in DANGER:
        return DANGER[n]
    for key, val in DANGER.items():
        if key in n:
            return val
    return DEFAULT_DANGER
