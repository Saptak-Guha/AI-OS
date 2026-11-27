# Vector Store Module

AetherOS uses the Chroma persistent client for local semantic memory
(`backend/app/services/vector_store.py`). It is optional: install it with
`pip install -r backend/requirements-vector.txt`. When absent, the store
degrades to a no-op and semantic search returns empty results.

Switchable adapters can route to Pinecone, Weaviate, or pgvector.
