"""Chroma-backed semantic index.

Degrades to a no-op when chromadb is not installed or fails to open, so the
platform stays usable without the vector layer (semantic search returns empty).
"""

from __future__ import annotations

from app.core.config import get_settings

_EMPTY = {"documents": [[]], "metadatas": [[]], "distances": [[]]}


class _NullCollection:
    def upsert(self, **_kwargs) -> None:
        pass

    def count(self) -> int:
        return 0

    def query(self, **_kwargs) -> dict:
        return _EMPTY


class VectorStore:
    def __init__(self) -> None:
        settings = get_settings()
        try:
            from chromadb import PersistentClient

            self.client = PersistentClient(path=settings.chroma_path)
            self.collection = self.client.get_or_create_collection("aetheros_memory")
            self.knowledge = self.client.get_or_create_collection("aetheros_knowledge")
            self.enabled = True
        except Exception:
            self.client = None
            self.collection = _NullCollection()
            self.knowledge = _NullCollection()
            self.enabled = False

    def add_memory(self, memory_id: str, content: str, metadata: dict) -> None:
        self.collection.upsert(documents=[content], ids=[memory_id], metadatas=[metadata])

    def add_knowledge(self, node_id: str, content: str, metadata: dict) -> None:
        self.knowledge.upsert(documents=[content], ids=[node_id], metadatas=[metadata])

    def search(self, query: str, n_results: int = 5):
        count = self.collection.count()
        if count == 0:
            return _EMPTY
        return self.collection.query(query_texts=[query], n_results=min(n_results, count))

    def search_knowledge(self, query: str, n_results: int = 10):
        count = self.knowledge.count()
        if count == 0:
            return _EMPTY
        return self.knowledge.query(query_texts=[query], n_results=min(n_results, count))
