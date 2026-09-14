"""Real ONNX inference on a blank image, not a human accuracy or liveness test."""
import base64
import cv2
import numpy as np
import pytest
from app.face import FaceEngine, FaceError


def test_real_model_load_dimension_and_no_face():
    engine = FaceEngine()
    assert engine.dimension > 0
    ok, jpg = cv2.imencode(".jpg", np.zeros((320, 320, 3), dtype=np.uint8))
    assert ok
    with pytest.raises(FaceError, match="NO_FACE"):
        engine.analyze(base64.b64encode(jpg).decode())
