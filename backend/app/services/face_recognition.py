import cv2
import numpy as np
import insightface
from insightface.app import FaceAnalysis

class FaceRecognitionService:
    def __init__(self):
        # We initialize the model. In production, 'buffalo_l' should be pre-downloaded.
        self.app = FaceAnalysis(name='buffalo_l', root='~/.insightface/models')
        # Setting ctx_id=0 enables GPU if available, else ctx_id=-1 for CPU
        self.app.prepare(ctx_id=-1, det_size=(640, 640))

    def process_image(self, file_path: str):
        """Processes an image, detecting faces and generating embeddings."""
        img = cv2.imread(file_path)
        if img is None:
            raise ValueError("Could not read image file.")

        faces = self.app.get(img)

        results = []
        for face in faces:
            results.append({
                "bbox": face.bbox.tolist(),
                "kps": face.kps.tolist(),
                "det_score": float(face.det_score),
                "embedding": face.embedding.tolist()
            })

        return results

face_service = FaceRecognitionService()
