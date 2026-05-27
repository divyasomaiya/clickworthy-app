import os
import faiss
import numpy as np

class FaissIndex:
    def __init__(self, index_file: str = "faces.index", dimension: int = 512):
        self.index_file = index_file
        self.dimension = dimension
        if os.path.exists(self.index_file):
            self.index = faiss.read_index(self.index_file)
        else:
            self.index = faiss.IndexFlatL2(self.dimension)

        # In a robust system we map FAISS ID -> Firestore Face ID
        self.face_id_map = {}
        self.current_id = self.index.ntotal

    def add_embedding(self, embedding: list, face_id: str):
        emb_array = np.array([embedding]).astype('float32')
        self.index.add(emb_array)
        self.face_id_map[self.current_id] = face_id
        self.current_id += 1
        self.save_index()

    def search(self, query_embedding: list, k: int = 5):
        if self.index.ntotal == 0:
            return []

        query_array = np.array([query_embedding]).astype('float32')
        distances, indices = self.index.search(query_array, k)

        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx != -1:
                results.append({
                    "distance": float(dist),
                    "face_id": self.face_id_map.get(idx, str(idx))
                })
        return results

    def save_index(self):
        faiss.write_index(self.index, self.index_file)

faiss_index = FaissIndex()
