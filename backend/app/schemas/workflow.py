from pydantic import BaseModel, Field


class WorkflowRequest(BaseModel):
    objective: str = Field(..., min_length=5)
    context: str = ""
    requires_approval: bool = False


class WorkflowResult(BaseModel):
    objective: str
    status: str
    plan: list
    output: str
