"""End-to-end smoke test: register -> run task -> agents produce output.

Run: .venv/Scripts/python -m pytest test_smoke.py   (or: python test_smoke.py)
Uses a throwaway SQLite file and no external services.
"""

import asyncio
import os
import tempfile

os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tempfile.mkdtemp()}/test.db"
os.environ["REDIS_URL"] = ""
os.environ["ANTHROPIC_API_KEY"] = ""


async def main() -> None:
    from sqlalchemy import select

    from app.db.session import init_db, async_session
    from app.models.entities import Task, User, AgentLog
    from app.core.security import hash_password, verify_password
    from app.agents.orchestrator import Orchestrator
    from app.workflows.generator import generate_workflow, classify_task

    await init_db()

    assert classify_task("Write a blog post") == "content"
    wf = generate_workflow("Write a blog post")
    assert wf.nodes, "workflow must have nodes"

    pw = hash_password("secret123")
    assert verify_password("secret123", pw)
    assert not verify_password("wrong", pw)

    async with async_session() as db:
        user = User(email="smoke@test.dev", full_name="Smoke", password_hash=pw)
        db.add(user)
        await db.commit()
        await db.refresh(user)

        task = Task(user_id=user.id, title="t", objective="Write a blog post about AI agents")
        db.add(task)
        await db.commit()
        await db.refresh(task)

        events: list[dict] = []
        orch = Orchestrator(db, emit=lambda e: _collect(events, e))
        result = await orch.execute_task(task)

        assert result["status"] == "completed", result
        assert task.progress == 100
        assert task.output and len(task.output) > 100, "agents produced no output"
        assert any(e["type"] == "task_completed" for e in events)

        logs = (await db.execute(select(AgentLog).where(AgentLog.task_id == task.id))).scalars().all()
        assert len(logs) >= len(wf.nodes), f"expected a log per agent, got {len(logs)}"

    # Approval path pauses instead of running.
    async with async_session() as db:
        t2 = Task(user_id=1, title="t2", objective="Research the AI agent market")
        db.add(t2)
        await db.commit()
        await db.refresh(t2)
        r2 = await Orchestrator(db).execute_task(t2, requires_approval=True)
        assert r2["status"] == "awaiting_approval"
        assert t2.status == "awaiting_approval"

    print("smoke test OK")


async def _collect(events: list[dict], event: dict) -> None:
    events.append(event)


def test_smoke() -> None:
    asyncio.run(main())


if __name__ == "__main__":
    asyncio.run(main())
