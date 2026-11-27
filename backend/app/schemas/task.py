from datetime import datetime
from pydantic import BaseModel, Field


class TaskCreate(BaseModel):
    objective: str = Field(..., min_length=10)
    title: str | None = None
    requires_approval: bool = False
    context: str = ""


class TaskOut(BaseModel):
    id: int
    title: str
    objective: str
    task_type: str
    status: str
    progress: int
    plan: list
    output: str | None = None
    requires_approval: bool
    approval_status: str | None = None
    created_at: datetime | None = None
    completed_at: datetime | None = None

    class Config:
        from_attributes = True


class TaskApproval(BaseModel):
    approved: bool
    feedback: str = ""


class AgentLogOut(BaseModel):
    id: int
    agent_name: str
    event_type: str
    message: str | None = None
    reasoning: str | None = None
    tool_used: str | None = None
    progress: int
    duration_ms: int | None = None
    created_at: datetime | None = None

    class Config:
        from_attributes = True
