from pydantic import BaseModel


class KnowledgeNodeOut(BaseModel):
    id: int
    label: str
    node_type: str
    content: str | None = None
    source_type: str | None = None

    class Config:
        from_attributes = True


class KnowledgeEdgeOut(BaseModel):
    id: int
    source_node_id: int
    target_node_id: int
    relationship: str
    weight: float

    class Config:
        from_attributes = True


class KnowledgeGraphOut(BaseModel):
    nodes: list[KnowledgeNodeOut]
    edges: list[KnowledgeEdgeOut]
