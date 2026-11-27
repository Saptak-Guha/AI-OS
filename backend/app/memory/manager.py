"""AetherOS Memory System — Short-term, Long-term, Semantic, and Task memory."""

from __future__ import annotations

import functools
import json
from datetime import datetime

import anyio.to_thread
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import get_settings
from app.models.entities import Memory
from app.services.vector_store import VectorStore

MEMORY_TYPES = ("short_term", "long_term", "semantic", "task")


class _DictCache:
    """In-process stand-in for Redis. ponytail: no TTL/eviction, single process.

    Swap back to Redis by setting REDIS_URL — needed once you run >1 worker.
    """

    def __init__(self) -> None:
        self._data: dict[str, str] = {}

    def setex(self, key: str, _ttl: int, value: str) -> None:
        self._data[key] = value

    def get(self, key: str) -> str | None:
        return self._data.get(key)

    def keys(self, pattern: str) -> list[str]:
        prefix = pattern.rstrip("*")
        return [k for k in self._data if k.startswith(prefix)]


def _make_cache(url: str):
    if not url:
        return _DictCache()
    import redis

    client = redis.from_url(url, decode_responses=True)
    try:
        client.ping()
        return client
    except Exception:
        return _DictCache()


class MemoryManager:
    def __init__(self) -> None:
        settings = get_settings()
        self.cache = _make_cache(settings.redis_url)
        self.vector = VectorStore()

    def store_short_term(self, task_id: int, key: str, value: dict) -> None:
        self.cache.setex(f"stm:{task_id}:{key}", 3600, json.dumps(value))

    def get_short_term(self, task_id: int, key: str) -> dict | None:
        raw = self.cache.get(f"stm:{task_id}:{key}")
        return json.loads(raw) if raw else None

    def get_task_context(self, task_id: int) -> dict:
        keys = self.cache.keys(f"stm:{task_id}:*")
        ctx = {}
        for k in keys:
            short_key = k.split(":", 2)[-1]
            raw = self.cache.get(k)
            if raw:
                ctx[short_key] = json.loads(raw)
        return ctx

    async def store_long_term(
        self, db: AsyncSession, user_id: int, content: str,
        task_id: int | None = None, agent_name: str | None = None,
        tags: list[str] | None = None, priority: str = "normal",
    ) -> Memory:
        item = Memory(
            user_id=user_id,
            task_id=task_id,
            agent_name=agent_name,
            memory_type="long_term",
            content=content,
            tags=",".join(tags or []),
            priority=priority,
        )
        db.add(item)
        await db.commit()
        await db.refresh(item)
        self.vector.add_memory(
            f"ltm_{item.id}", content,
            {"user_id": user_id, "type": "long_term", "agent": agent_name or ""},
        )
        return item

    async def store_semantic(
        self, db: AsyncSession, user_id: int, content: str,
        task_id: int | None = None, agent_name: str | None = None,
    ) -> Memory:
        item = Memory(
            user_id=user_id,
            task_id=task_id,
            agent_name=agent_name,
            memory_type="semantic",
            content=content,
            tags="semantic,auto",
            priority="high",
        )
        db.add(item)
        await db.commit()
        await db.refresh(item)
        self.vector.add_memory(
            f"sem_{item.id}", content,
            {"user_id": user_id, "type": "semantic"},
        )
        return item

    async def store_task_memory(
        self, db: AsyncSession, user_id: int, task_id: int,
        content: str, agent_name: str | None = None,
    ) -> Memory:
        item = Memory(
            user_id=user_id,
            task_id=task_id,
            agent_name=agent_name,
            memory_type="task",
            content=content,
            tags="task,execution",
            priority="normal",
        )
        db.add(item)
        await db.commit()
        await db.refresh(item)
        return item

    async def recall(self, db: AsyncSession, user_id: int, query: str, limit: int = 10) -> list[dict]:
        # Chroma's search is synchronous; called directly it blocks the event
        # loop for every other request while one chat turn is being prepared.
        vector_results = await anyio.to_thread.run_sync(
            functools.partial(self.vector.search, query, n_results=limit)
        )
        db_results = await db.execute(
            select(Memory)
            .where(Memory.user_id == user_id)
            .order_by(Memory.created_at.desc())
            .limit(limit)
        )
        memories = list(db_results.scalars().all())
        combined = []
        for m in memories:
            combined.append({
                "id": m.id,
                "type": m.memory_type,
                "content": m.content,
                "tags": m.tags,
                "agent": m.agent_name,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            })
        if vector_results and vector_results.get("documents"):
            for i, doc in enumerate(vector_results["documents"][0]):
                combined.append({
                    "id": f"vec_{i}",
                    "type": "semantic",
                    "content": doc,
                    "source": "vector_search",
                })
        return combined[:limit]

    async def get_user_preferences(self, db: AsyncSession, user_id: int) -> str:
        result = await db.execute(
            select(Memory)
            .where(Memory.user_id == user_id, Memory.memory_type == "long_term")
            .order_by(Memory.created_at.desc())
            .limit(5)
        )
        items = list(result.scalars().all())
        if not items:
            return ""
        return "\n".join(f"- {m.content}" for m in items)
