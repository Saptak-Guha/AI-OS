from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str
    voice: bool = False
    # Documents to read for this turn. Ids only — the text is loaded server-side
    # from the user's own uploads, so a client can't inject arbitrary content.
    document_ids: list[int] = []


class ChatResponse(BaseModel):
    session_id: int
    reply: str


class SessionOut(BaseModel):
    id: int
    title: str
    message_count: int
    updated_at: str
