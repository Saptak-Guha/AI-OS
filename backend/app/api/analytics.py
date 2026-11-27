from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.entities import User, Task, Agent, Memory, KnowledgeNode, Document, AgentLog
from app.schemas.analytics import DashboardStats, AgentPerformance

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/dashboard", response_model=DashboardStats)
async def dashboard_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    total = await db.execute(select(func.count(Task.id)).where(Task.user_id == user.id))
    completed = await db.execute(
        select(func.count(Task.id)).where(Task.user_id == user.id, Task.status == "completed")
    )
    active = await db.execute(
        select(func.count(Task.id)).where(
            Task.user_id == user.id,
            Task.status.in_(["running", "planning", "queued", "awaiting_approval"]),
        )
    )
    agents = await db.execute(select(func.count(Agent.id)).where(Agent.is_active == True))
    memories = await db.execute(select(func.count(Memory.id)).where(Memory.user_id == user.id))
    knowledge = await db.execute(select(func.count(KnowledgeNode.id)).where(KnowledgeNode.user_id == user.id))
    docs = await db.execute(select(func.count(Document.id)).where(Document.user_id == user.id))

    total_n = total.scalar() or 0
    completed_n = completed.scalar() or 0
    rate = (completed_n / total_n * 100) if total_n > 0 else 0.0

    return DashboardStats(
        total_tasks=total_n,
        completed_tasks=completed_n,
        active_tasks=active.scalar() or 0,
        total_agents=agents.scalar() or 0,
        memory_nodes=memories.scalar() or 0,
        avg_completion_rate=round(rate, 1),
        knowledge_nodes=knowledge.scalar() or 0,
        documents_processed=docs.scalar() or 0,
    )


@router.get("/agents", response_model=list[AgentPerformance])
async def agent_performance(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(
            AgentLog.agent_name,
            func.count(AgentLog.id).label("count"),
            func.avg(AgentLog.duration_ms).label("avg_duration"),
            func.count(AgentLog.tool_used).label("tools"),
        )
        .join(Task, Task.id == AgentLog.task_id)
        .where(Task.user_id == user.id, AgentLog.event_type == "completed")
        .group_by(AgentLog.agent_name)
    )
    return [
        AgentPerformance(
            agent_name=row.agent_name,
            tasks_completed=row.count,
            avg_duration_ms=round(row.avg_duration or 0, 1),
            tools_used=row.tools or 0,
        )
        for row in result.all()
    ]
