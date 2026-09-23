"""Optional on-server YOLOv8n detector (ONNX Runtime).

This is a bonus fast path. If models/yolov8n.onnx is not present the whole
module stays dormant and BlindSpot runs on the vision model alone, which is
what the default setup does. Run scripts/export_yolo.py once to enable it.

When enabled it gives a sub-100ms class + bounding-box pass that we use to
gate the slower vision call: if YOLO sees nothing within 6 metres, we skip
the vision request entirely and save both latency and free-tier quota.
"""
import io
import logging
import os

import numpy as np
from PIL import Image

from .. import config

log = logging.getLogger("blindspot.detector")

COCO = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
    "traffic signal", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat",
    "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "bag",
    "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball",
    "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket",
    "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
    "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake",
    "chair", "couch", "plant", "bed", "table", "toilet", "tv", "laptop", "mouse",
    "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
    "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier",
    "toothbrush",
]

# Rough real-world heights in metres, used for the monocular distance estimate.
REAL_HEIGHT = {
    "person": 1.7, "car": 1.5, "bus": 3.2, "truck": 3.2, "motorcycle": 1.4,
    "bicycle": 1.1, "dog": 0.5, "cow": 1.4, "chair": 0.9, "bench": 0.9,
    "table": 0.75, "traffic signal": 3.0, "stop sign": 2.2, "plant": 0.8,
}
DEFAULT_HEIGHT = 1.0
FOCAL_PX = 640.0  # approximate for a 640px-tall frame on a typical phone lens

_session = None
_enabled = None


def available() -> bool:
    global _session, _enabled
    if _enabled is not None:
        return _enabled
    if config.USE_YOLO == "off":
        _enabled = False
        return False
    path = config.YOLO_ONNX_PATH
    if not os.path.exists(path):
        log.info("YOLO model not found at %s - running vision-only", path)
        _enabled = False
        return False
    try:
        import onnxruntime as ort

        _session = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
        log.info("YOLO enabled from %s", path)
        _enabled = True
    except Exception as e:
        log.warning("YOLO could not be loaded (%s) - running vision-only", e)
        _enabled = False
    return _enabled


def _letterbox(img: Image.Image, size: int = 640):
    w, h = img.size
    scale = min(size / w, size / h)
    nw, nh = int(w * scale), int(h * scale)
    resized = img.resize((nw, nh), Image.BILINEAR)
    canvas = Image.new("RGB", (size, size), (114, 114, 114))
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2))
    return canvas, scale, (size - nw) // 2, (size - nh) // 2


def detect(image_bytes: bytes, conf_thres: float = 0.35) -> list[dict]:
    if not available():
        return []
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    orig_w, orig_h = img.size
    canvas, scale, padx, pady = _letterbox(img)

    arr = np.asarray(canvas, dtype=np.float32) / 255.0
    arr = np.transpose(arr, (2, 0, 1))[None]

    out = _session.run(None, {_session.get_inputs()[0].name: arr})[0]
    preds = np.squeeze(out)               # (84, 8400) for yolov8
    if preds.shape[0] < preds.shape[1]:
        preds = preds.T                   # -> (8400, 84)

    boxes = preds[:, :4]
    scores_all = preds[:, 4:]
    cls_ids = scores_all.argmax(axis=1)
    confs = scores_all.max(axis=1)
    keep = confs > conf_thres
    boxes, cls_ids, confs = boxes[keep], cls_ids[keep], confs[keep]

    results = []
    for (cx, cy, bw, bh), cid, cf in zip(boxes, cls_ids, confs):
        name = COCO[int(cid)] if int(cid) < len(COCO) else "obstacle"
        x = (cx - padx) / scale
        y = (cy - pady) / scale
        h_px = bh / scale
        if h_px <= 1:
            continue
        real_h = REAL_HEIGHT.get(name, DEFAULT_HEIGHT)
        dist = max(0.3, min((real_h * FOCAL_PX) / h_px, 20.0))
        frac = x / max(orig_w, 1)
        pos = "left" if frac < 0.38 else "right" if frac > 0.62 else "center"
        results.append({"n": name, "pos": pos, "d": round(float(dist), 1), "m": "static", "conf": float(cf)})

    results.sort(key=lambda r: r["d"])
    return results[:8]
