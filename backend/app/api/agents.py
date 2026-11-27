from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.entities import Agent
from app.agents.definitions import AGENT_DEFINITIONS

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("")
async def list_agents(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Agent).where(Agent.is_active == True))
    db_agents = list(result.scalars().all())
    if db_agents:
        return [
            {
                "name": a.name,
                "role": a.role,
                "goal": a.goal,
                "tools": a.tools,
                "specialization": a.specialization,
                "performance_score": a.performance_score,
            }
            for a in db_agents
        ]
    return [
        {
            "name": d.name,
            "role": d.role,
            "goal": d.goal,
            "tools": d.tools,
            "specialization": d.specialization,
            "performance_score": 0.0,
        }
        for d in AGENT_DEFINITIONS.values()
    ]
