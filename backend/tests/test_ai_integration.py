import pytest
import os
import cv2
import numpy as np
from app.services.face_recognition import face_service

@pytest.mark.skipif(not face_service.available, reason="ONNX models are not available")
def test_face_detection_and_recognition_pipeline():
    # Create a dummy image mimicking a face
    img = np.zeros((320, 320, 3), dtype=np.uint8)
    # Give it a generic gradient background
    for i in range(320):
        img[i, :, 0] = i % 255

    temp_path = "temp_synthetic_face.jpg"
    cv2.imwrite(temp_path, img)

    try:
        # Just verifying the code executes end-to-end without failing.
        # Since it's an empty synthetic image, it may return 0 faces.
        faces = face_service.process_image(temp_path)
        assert isinstance(faces, list)
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
