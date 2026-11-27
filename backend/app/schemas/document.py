from datetime import datetime
from pydantic import BaseModel


class DocumentOut(BaseModel):
    id: int
    filename: str
    file_type: str | None = None
    file_size: int | None = None
    summary: str | None = None
    insights: list = []
    status: str
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class DocumentQuery(BaseModel):
    question: str
