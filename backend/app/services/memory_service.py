from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Memory
from app.schemas.memory import MemoryIn
from app.memory.manager import MemoryManager


class MemoryService:
    def __init__(self) -> None:
        self.manager = MemoryManager()

    async def create_memory(self, db: AsyncSession, user_id: int, payload: MemoryIn) -> Memory:
        return await self.manager.store_long_term(
            db, user_id, payload.content,
            tags=payload.tags, priority=payload.priority,
        )

    async def list_memories(self, db: AsyncSession, user_id: int) -> list[Memory]:
        result = await db.execute(
            select(Memory).where(Memory.user_id == user_id).order_by(Memory.created_at.desc()).limit(100)
        )
        return list(result.scalars().all())

    async def semantic_search(self, db: AsyncSession, user_id: int, query: str):
        return await self.manager.recall(db, user_id, query)
