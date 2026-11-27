from pydantic import BaseModel


class MemoryIn(BaseModel):
    content: str
    tags: list[str] = []
    priority: str = "normal"


class MemoryOut(BaseModel):
    id: int
    content: str
    tags: list[str]
    priority: str
