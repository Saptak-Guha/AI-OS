import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.config import get_settings

settings = get_settings()

if settings.database_url.startswith("sqlite"):
    os.makedirs(os.path.dirname(settings.database_url.split("///")[-1]) or ".", exist_ok=True)

engine = create_async_engine(settings.database_url, future=True, echo=False)
SessionLocal = async_sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
async_session = SessionLocal


async def get_db():
    async with SessionLocal() as session:
        yield session


async def init_db() -> None:
    """Create tables and seed the built-in agents. Idempotent."""
    from sqlalchemy import select
    from app.db.base import Base
    from app.models import entities  # noqa: F401 — registers mappers
    from app.models.entities import Agent
    from app.agents.definitions import AGENT_DEFINITIONS

    from sqlalchemy import text

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # create_all never alters existing tables. ponytail: one-off patch for
        # databases created before chat sessions existed — swap for Alembic
        # the next time a column changes.
        try:
            await conn.execute(text("ALTER TABLE conversations ADD COLUMN updated_at TIMESTAMP"))
        except Exception:
            pass

    async with SessionLocal() as db:
        existing = set((await db.scalars(select(Agent.name))).all())
        for d in AGENT_DEFINITIONS.values():
            if d.name not in existing:
                db.add(Agent(
                    name=d.name, role=d.role, goal=d.goal, backstory=d.backstory,
                    tools=list(d.tools), specialization=d.specialization,
                ))
        await db.commit()
