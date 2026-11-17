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
        """Processes an image, detecting faces and generating embeddings.
        Supports high-resolution DSLR images without memory exhaustion."""
        if not self.available:
            return []

        if not os.path.exists(file_path):
            raise ValueError("Could not read image file.")

        img = cv2.imread(file_path)
        if img is None:
            # Fallback for paths with special characters on Windows
            try:
                with open(file_path, "rb") as f:
                    bytes_data = bytearray(f.read())
                nparr = np.asarray(bytes_data, dtype=np.uint8)
                img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            except Exception:
                img = None

        if img is None:
            raise ValueError("Could not decode image file.")

        orig_h, orig_w = img.shape[:2]

        # For large DSLR images, scale down detection frame to a max dimension of 1920
        # while keeping the original full-resolution image for feature alignment
        max_dim = 1920
        scale = 1.0
        if max(orig_h, orig_w) > max_dim:
            scale = max_dim / float(max(orig_h, orig_w))
            detect_w = max(1, int(orig_w * scale))
            detect_h = max(1, int(orig_h * scale))
            detect_img = cv2.resize(img, (detect_w, detect_h), interpolation=cv2.INTER_AREA)
        else:
            detect_w = orig_w
            detect_h = orig_h
            detect_img = img

        self.detector.setInputSize((detect_w, detect_h))
        _, faces = self.detector.detect(detect_img)

        results = []
        if faces is not None:
            for face in faces:
                # face format: [x, y, w, h, x_re, y_re, x_le, y_le, x_nt, y_nt, x_rcm, y_rcm, x_lcm, y_lcm, score]
                face_orig = face.copy()
                if scale != 1.0:
                    # Map bounding box back to original coordinates
                    face_orig[0:4] = face_orig[0:4] / scale
                    # Map landmarks back to original coordinates
                    face_orig[4:14] = face_orig[4:14] / scale

                bbox = face_orig[0:4].tolist()
                score = float(face_orig[-1])

                # Align the face using the recognizer from original image
                try:
                    aligned_face = self.recognizer.alignCrop(img, face_orig)
                    embedding = self.recognizer.feature(aligned_face)

                    # Normalize SFace 128-dimensional embedding
                    embedding = embedding[0]
                    norm = np.linalg.norm(embedding)
                    if norm > 0:
                        embedding = embedding / norm

                    results.append({
                        "bbox": bbox,
                        "kps": face_orig[4:14].reshape(5, 2).tolist(),
                        "det_score": score,
                        "embedding": embedding.tolist()
                    })
                except Exception as crop_err:
                    print(f"Warning: Failed to align/recognize face: {crop_err}")
                    continue

        return results

face_service = FaceRecognitionService()
