from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.core.deps import get_current_user
from app.models.entities import Memory, User
from app.schemas.memory import MemoryIn
from app.services.memory_service import MemoryService

router = APIRouter(prefix="/memory", tags=["memory"])
svc = MemoryService()


@router.post("")
async def create_memory(
    payload: MemoryIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = await svc.create_memory(db, user_id=user.id, payload=payload)
    return {
        "id": item.id,
        "content": item.content,
        "memory_type": item.memory_type,
        "tags": item.tags.split(",") if item.tags else [],
        "priority": item.priority,
    }


@router.get("")
async def list_memories(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    items = await svc.list_memories(db, user_id=user.id)
    return [
        {
            "id": i.id,
            "content": i.content,
            "memory_type": i.memory_type,
            "agent_name": i.agent_name,
            "tags": i.tags.split(",") if i.tags else [],
            "priority": i.priority,
            "created_at": i.created_at.isoformat() if i.created_at else None,
        }
        for i in items
    ]


@router.delete("/{memory_id}")
async def delete_memory(
    memory_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = await db.get(Memory, memory_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="Memory not found")
    await db.delete(item)
    await db.commit()
    return {"deleted": memory_id}


@router.get("/search")
async def semantic_search(
    q: str = Query(..., min_length=2),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await svc.semantic_search(db, user.id, q)
