import base64
import io
import os
import threading
import time

import cv2
import numpy as np
from PIL import Image

from app.models import MODELS, MODEL_VERSION, model_dir, verify


class FaceError(ValueError):
    pass


def normalize(vector):
    vector = np.asarray(vector, dtype=np.float32).reshape(-1)
    length = np.linalg.norm(vector)
    if not np.isfinite(vector).all() or length <= 1e-8: raise FaceError("LOW_QUALITY")
    return vector / length


def decode_frame(encoded):
    try:
        if len(encoded) > 1_000_000: raise ValueError()
        data = base64.b64decode(encoded, validate=True)
        if len(data) > 750_000 or not data.startswith(b"\xff\xd8\xff"): raise ValueError()
        # Inspect dimensions before allocating decoded pixels in OpenCV.
        with Image.open(io.BytesIO(data)) as header:
            w, h = header.size
            if header.format != "JPEG" or min(w, h) < 160 or max(w, h) > 1920 or w*h > 2_073_600: raise ValueError()
            header.verify()
        decoded = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
        if decoded is None: raise ValueError()
        return decoded
    except (ValueError, OSError, cv2.error, Image.DecompressionBombError) as exc:
        raise FaceError("LOW_QUALITY") from exc


def match_identity(query, templates, threshold, margin):
    best = {}
    for employee_id, vector in templates:
        score = float(np.dot(query, vector))
        best[employee_id] = max(best.get(employee_id, -1.), score)
    ranked = sorted(best.items(), key=lambda item: item[1], reverse=True)
    if not ranked: return "NO_ENROLLED_PROFILES", None
    if ranked[0][1] < threshold: return "UNKNOWN_PERSON", None
    if len(ranked) > 1 and ranked[0][1] - ranked[1][1] < margin: return "AMBIGUOUS_MATCH", None
    return "MATCHED", ranked[0][0]


def check_liveness(yaws, timestamps, direction):
    if not 5 <= len(yaws) <= 10 or len(yaws) != len(timestamps): return False
    gaps = np.diff(timestamps)
    duration = timestamps[-1] - timestamps[0]
    if np.any(gaps < 100) or np.any(gaps > 3000) or not 1200 <= duration <= 15000: return False
    neutral = float(os.environ.get("FACE_LIVENESS_NEUTRAL", ".14"))
    turn = float(os.environ.get("FACE_LIVENESS_TURN", ".18"))
    if abs(yaws[0]) > neutral or abs(yaws[-1]) > neutral: return False
    # Unmirrored camera pixels: turning to the subject's left shifts the nose right.
    sign = 1 if direction == "LEFT" else -1
    delta = [sign * (yaw-yaws[0]) for yaw in yaws]
    return max(delta[1:-1]) >= turn and abs(yaws[-1]-yaws[0]) < neutral


class FaceEngine:
    def __init__(self):
        directory = model_dir()
        for name, (_, size, checksum) in MODELS.items():
            if not verify(directory/name, size, checksum): raise ValueError("MODEL_MISSING_OR_CORRUPT")
        cv2.setNumThreads(int(os.environ.get("FACE_CPU_THREADS", "2")))
        self.detector = cv2.FaceDetectorYN.create(str(directory/"face_detection_yunet_2023mar.onnx"), "", (320, 320), .9, .3, 5000)
        self.recognizer = cv2.FaceRecognizerSF.create(str(directory/"face_recognition_sface_2021dec.onnx"), "")
        self.lock = threading.Lock()
        # Real detector and recognizer execution, blank inputs only; never persisted as identities.
        self.detector.detect(np.zeros((320, 320, 3), dtype=np.uint8))
        self.dimension = len(normalize(self.recognizer.feature(np.zeros((112, 112, 3), dtype=np.uint8))))
        self.model_version = MODEL_VERSION
        self.threshold = float(os.environ.get("FACE_MATCH_THRESHOLD", ".50"))
        self.margin = float(os.environ.get("FACE_MATCH_MARGIN", ".08"))
        if not 0 < self.threshold < 1 or not 0 < self.margin < 1: raise ValueError("INVALID_FACE_THRESHOLDS")

    def analyze(self, encoded):
        frame = decode_frame(encoded)
        h, w = frame.shape[:2]
        scale = min(1., 640/max(w, h))
        frame = cv2.resize(frame, (round(w*scale), round(h*scale)))
        h, w = frame.shape[:2]
        # ponytail: one inference lock per process; add a bounded process pool if throughput requires it.
        with self.lock:
            self.detector.setInputSize((w, h))
            _, faces = self.detector.detect(frame)
            if faces is None or len(faces) == 0: raise FaceError("NO_FACE")
            if len(faces) != 1: raise FaceError("MULTIPLE_FACES")
            face = faces[0]
            x, y, fw, fh = face[:4]
            if min(fw, fh) < 70 or x < 3 or y < 3 or x+fw > w-3 or y+fh > h-3: raise FaceError("LOW_QUALITY")
            crop = frame[int(y):int(y+fh), int(x):int(x+fw)]
            gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            if not 40 <= float(gray.mean()) <= 225 or cv2.Laplacian(gray, cv2.CV_64F).var() < float(os.environ.get("FACE_MIN_SHARPNESS", "45")):
                raise FaceError("LOW_QUALITY")
            landmarks = face[4:14].reshape(5, 2)
            eye_vector = landmarks[1] - landmarks[0]
            distance = float(np.linalg.norm(eye_vector))
            if distance < 20: raise FaceError("LOW_QUALITY")
            # Image-coordinate nose shift, robust to small head roll. LEFT means subject's left.
            yaw = float(np.dot(landmarks[2] - (landmarks[0]+landmarks[1])/2, eye_vector/distance) / distance)
            aligned = self.recognizer.alignCrop(frame, face)
            vector = normalize(self.recognizer.feature(aligned))
        return vector, yaw

    def sequence(self, frames, challenge):
        timestamps = [f.captured_at for f in frames]
        now = time.time()*1000
        if timestamps[0] < challenge["created_at"].timestamp()*1000-1000 or timestamps[-1] > now+1000 or now-timestamps[-1] > 20000:
            raise FaceError("LIVENESS_FAILED")
        vectors, yaws = [], []
        start = time.monotonic()
        for frame in frames:
            if time.monotonic()-start > 15: raise FaceError("LOW_QUALITY")
            vector, yaw = self.analyze(frame.image)
            vectors.append(vector)
            yaws.append(yaw)
        # Every pair must agree, not only each sample against a permissive mean.
        similarities = np.asarray(vectors) @ np.asarray(vectors).T
        if float(similarities.min()) < self.threshold: raise FaceError("LOW_QUALITY")
        if not check_liveness(yaws, timestamps, challenge["direction"]): raise FaceError("LIVENESS_FAILED")
        return vectors, normalize(np.mean(vectors, axis=0))
