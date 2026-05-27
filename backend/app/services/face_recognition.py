import os
import cv2
import numpy as np

try:
    import insightface
    from insightface.app import FaceAnalysis
    HAS_INSIGHTFACE = True
except ImportError:
    HAS_INSIGHTFACE = False

class FaceRecognitionService:
    def __init__(self):
        self.mock_mode = not HAS_INSIGHTFACE
        if not self.mock_mode:
            try:
                # We initialize the model. In production, 'buffalo_l' should be pre-downloaded.
                self.app = FaceAnalysis(name='buffalo_l', root='~/.insightface/models')
                # Setting ctx_id=0 enables GPU if available, else ctx_id=-1 for CPU
                self.app.prepare(ctx_id=-1, det_size=(640, 640))
            except Exception as e:
                print(f"Error initializing InsightFace: {e}. Falling back to mock mode.")
                self.mock_mode = True

        if self.mock_mode:
            print("Running FaceRecognitionService in Mock Mode (No C++ compiler/InsightFace required)")

    def process_image(self, file_path: str):
        """Processes an image, detecting faces and generating embeddings."""
        if self.mock_mode:
            if not os.path.exists(file_path):
                raise ValueError("Could not read image file.")

            # Generate a reproducible embedding based on the filename/size hash
            import hashlib
            basename = os.path.basename(file_path)
            file_hash = hashlib.md5(basename.encode('utf-8')).hexdigest()
            # Seed numpy random generator with the hash
            seed = int(file_hash, 16) % (2**32)
            rng = np.random.default_rng(seed)

            # Generate a random 512-dimensional vector normalized to unit length
            embedding = rng.standard_normal(512)
            embedding = embedding / np.linalg.norm(embedding)

            return [{
                "bbox": [50.0, 50.0, 200.0, 200.0],
                "kps": [[75.0, 100.0], [125.0, 100.0], [100.0, 125.0], [80.0, 150.0], [120.0, 150.0]],
                "det_score": 0.99,
                "embedding": embedding.tolist()
            }]

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
