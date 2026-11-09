import os
import cv2
import numpy as np

class FaceRecognitionService:
    def __init__(self):
        # Paths to the downloaded ONNX models
        yunet_path = os.path.join(os.path.dirname(__file__), '../../models/face_detection_yunet_2023mar.onnx')
        sface_path = os.path.join(os.path.dirname(__file__), '../../models/face_recognition_sface_2021dec.onnx')

        self.available = os.path.exists(yunet_path) and os.path.exists(sface_path)

        if self.available:
            self.detector = cv2.FaceDetectorYN.create(
                model=yunet_path,
                config="",
                input_size=(320, 320),
                score_threshold=0.8,
                nms_threshold=0.3,
                top_k=5000
            )
            self.recognizer = cv2.FaceRecognizerSF.create(
                model=sface_path,
                config=""
            )
        else:
            print(f"Warning: ONNX models not found. FaceRecognitionService is disabled. Paths expected: {yunet_path}")

    def process_image(self, file_path: str):
        """Processes an image, detecting faces and generating embeddings."""
        if not self.available:
            return []

        if not os.path.exists(file_path):
            raise ValueError("Could not read image file.")

        img = cv2.imread(file_path)
        if img is None:
            raise ValueError("Could not read image file.")

        # OpenCV YuNet requires input size matching the image size for detection
        height, width, _ = img.shape
        self.detector.setInputSize((width, height))

        _, faces = self.detector.detect(img)

        results = []
        if faces is not None:
            for face in faces:
                # face format: [x, y, w, h, x_re, y_re, x_le, y_le, x_nt, y_nt, x_rcm, y_rcm, x_lcm, y_lcm, score]
                bbox = face[0:4].tolist()
                score = float(face[-1])

                # Align the face using the recognizer
                aligned_face = self.recognizer.alignCrop(img, face)

                # Extract features
                embedding = self.recognizer.feature(aligned_face)

                # SFace embeddings are typically 128-dimensional. Let's normalize it.
                embedding = embedding[0] # remove batch dim
                embedding = embedding / np.linalg.norm(embedding)

                results.append({
                    "bbox": bbox,
                    "kps": face[4:14].reshape(5, 2).tolist(), # 5 landmarks
                    "det_score": score,
                    "embedding": embedding.tolist()
                })

        return results

face_service = FaceRecognitionService()
