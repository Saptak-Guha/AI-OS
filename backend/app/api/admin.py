from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.entities import User, Task, AgentLog, AnalyticsEvent

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/overview")
async def admin_overview(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    users = await db.execute(select(func.count(User.id)))
    tasks = await db.execute(select(func.count(Task.id)))
    logs = await db.execute(select(func.count(AgentLog.id)))

    return {
        "total_users": users.scalar() or 0,
        "total_tasks": tasks.scalar() or 0,
        "total_agent_logs": logs.scalar() or 0,
        "platform": "AetherOS",
        "version": "1.0.0",
    }


@router.get("/users")
async def list_users(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    result = await db.execute(select(User).order_by(User.created_at.desc()).limit(100))
    return [
        {"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role, "created_at": u.created_at}
        for u in result.scalars().all()
    ]
