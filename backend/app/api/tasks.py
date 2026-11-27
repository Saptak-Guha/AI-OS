import asyncio
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db, async_session
from app.core.deps import get_current_user
from app.models.entities import User, Task, AgentLog
from app.schemas.task import TaskCreate, TaskOut, TaskApproval, AgentLogOut
from app.agents.orchestrator import Orchestrator
from app.monitoring.events import event_bus

router = APIRouter(prefix="/tasks", tags=["tasks"])


async def _run_task_background(task_id: int, requires_approval: bool) -> None:
    async with async_session() as db:
        result = await db.execute(select(Task).where(Task.id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            return

        async def emit(event: dict) -> None:
            await event_bus.publish(task_id, event)

        orchestrator = Orchestrator(db, emit=emit)
        await orchestrator.execute_task(task, requires_approval)


@router.post("", response_model=TaskOut)
async def create_task(
    payload: TaskCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    title = payload.title or payload.objective[:80]
    task = Task(
        user_id=user.id,
        title=title,
        objective=payload.objective,
        requires_approval=payload.requires_approval,
        status="queued",
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    background_tasks.add_task(_run_task_background, task.id, payload.requires_approval)
    return task


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Task).where(Task.user_id == user.id).order_by(Task.created_at.desc()).limit(50)
    )
    return list(result.scalars().all())


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Task).where(Task.id == task_id, Task.user_id == user.id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.get("/{task_id}/logs", response_model=list[AgentLogOut])
async def get_task_logs(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task_result = await db.execute(select(Task).where(Task.id == task_id, Task.user_id == user.id))
    if not task_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Task not found")

    result = await db.execute(
        select(AgentLog).where(AgentLog.task_id == task_id).order_by(AgentLog.created_at)
    )
    return list(result.scalars().all())


@router.post("/{task_id}/approve", response_model=TaskOut)
async def approve_task(
    task_id: int,
    payload: TaskApproval,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Task).where(Task.id == task_id, Task.user_id == user.id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status != "awaiting_approval":
        raise HTTPException(status_code=400, detail="Task is not awaiting approval")

    if not payload.approved:
        task.status = "rejected"
        task.approval_status = "rejected"
        await db.commit()
        return task

    async def _continue() -> None:
        async with async_session() as session:
            r = await session.execute(select(Task).where(Task.id == task_id))
            t = r.scalar_one_or_none()
            if not t:
                return

            async def emit(event: dict) -> None:
                await event_bus.publish(task_id, event)

            orchestrator = Orchestrator(session, emit=emit)
            await orchestrator.approve_and_continue(t)

    background_tasks.add_task(_continue)
    task.approval_status = "approved"
    await db.commit()
    return task
