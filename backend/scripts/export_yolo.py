"""Optional. Exports yolov8n to ONNX so the backend gets a fast local pass.

    pip install ultralytics
    python scripts/export_yolo.py

Skip this entirely if you are short on time - BlindSpot works without it.
"""
import shutil, pathlib
from ultralytics import YOLO

out = pathlib.Path("models"); out.mkdir(exist_ok=True)
m = YOLO("yolov8n.pt")
path = m.export(format="onnx", imgsz=640, opset=12, simplify=False)
shutil.copy(path, out / "yolov8n.onnx")
print("Wrote models/yolov8n.onnx")
