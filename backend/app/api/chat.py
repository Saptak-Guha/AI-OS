"""AI Command Center — persistent, memory-aware, streaming conversations."""

import asyncio
import json
import os
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import iterate_in_threadpool

from app.core.deps import get_current_user
from app.db.session import get_db
from app.memory.manager import MemoryManager
from app.models.entities import ChatMessage, Conversation, Document, User
from app.schemas.chat import ChatRequest, ChatResponse, SessionOut
from app.services import llm_service
from app.tools.registry import pdf_reader

router = APIRouter(prefix="/chat", tags=["chat"])
memory = MemoryManager()

HISTORY_TURNS = 20  # ponytail: fixed window; summarize older turns if sessions get long

# Per-document slice of a turn's context. Generous enough for a report, small
# enough that three attachments can't crowd out the conversation itself.
DOC_CHARS = 6000
MAX_DOCS = 3


def _read_document(doc: Document) -> str:
    """Extract a document's text from disk, mirroring the upload-time parse.

    Read at chat time rather than stored on the row: the extracted text is
    already recoverable from storage_path, so persisting a second copy would
    mean a migration and two things to keep in sync.
    """
    if not doc.storage_path or not os.path.exists(doc.storage_path):
        return ""
    with open(doc.storage_path, "rb") as f:
        raw = f.read(DOC_CHARS * 4)  # bounded read; never slurp a huge upload
    text = raw.decode("utf-8", errors="replace")
    if (doc.file_type or "").lower() == "pdf":
        text = pdf_reader(text).get("text", text)
    return text[:DOC_CHARS]


async def _document_context(db: AsyncSession, user: User, ids: list[int]) -> str:
    """Text of the user's own attached documents, as model context."""
    if not ids:
        return ""
    rows = (await db.scalars(
        select(Document).where(Document.id.in_(ids[:MAX_DOCS]), Document.user_id == user.id)
    )).all()
    parts = []
    for doc in rows:
        body = _read_document(doc)
        if body.strip():
            parts.append(f"### {doc.filename}\n{body}")
    if not parts:
        return ""
    return (
        "\n\n## Documents the user attached to this message\n"
        "Answer from these when the question refers to them, and say so if the "
        "answer isn't in them.\n\n" + "\n\n".join(parts)
    )


async def _owned_session(db: AsyncSession, user: User, session_id: int) -> Conversation:
    convo = await db.get(Conversation, session_id)
    if not convo or convo.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    return convo


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = await db.execute(
        select(Conversation, func.count(ChatMessage.id))
        .outerjoin(ChatMessage, ChatMessage.conversation_id == Conversation.id)
        .where(Conversation.user_id == user.id)
        .group_by(Conversation.id)
        .order_by(Conversation.updated_at.desc())
        .limit(100)
    )
    return [
        SessionOut(
            id=c.id, title=c.title, message_count=n,
            updated_at=(c.updated_at or c.created_at).isoformat(),
        )
        for c, n in rows.all()
    ]


@router.post("/sessions", response_model=SessionOut)
async def create_session(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    convo = Conversation(user_id=user.id, title="New Session")
    db.add(convo)
    await db.commit()
    await db.refresh(convo)
    return SessionOut(
        id=convo.id, title=convo.title, message_count=0,
        updated_at=convo.created_at.isoformat(),
    )


@router.get("/sessions/{session_id}/messages")
async def get_messages(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _owned_session(db, user, session_id)
    rows = await db.scalars(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == session_id)
        .order_by(ChatMessage.id)
    )
    return [
        {"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at.isoformat()}
        for m in rows.all()
    ]


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _owned_session(db, user, session_id)
    await db.execute(delete(ChatMessage).where(ChatMessage.conversation_id == session_id))
    await db.execute(delete(Conversation).where(Conversation.id == session_id))
    await db.commit()
    return {"deleted": session_id}


async def _prepare(
    db: AsyncSession,
    user: User,
    session_id: int,
    message: str,
    document_ids: list[int] | None = None,
):
    """Persist the user turn and assemble memory context + history."""
    convo = await _owned_session(db, user, session_id)

    prior = list((await db.scalars(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == session_id)
        .order_by(ChatMessage.id.desc())
        .limit(HISTORY_TURNS)
    )).all())[::-1]
    history = [{"role": m.role, "content": m.content} for m in prior]

    db.add(ChatMessage(conversation_id=session_id, role="user", content=message))
    if not prior:
        convo.title = message[:60] + ("…" if len(message) > 60 else "")
    convo.updated_at = datetime.utcnow()
    await db.commit()

    recalled = await memory.recall(db, user.id, message, limit=5)
    context = "\n".join(f"- {m['content'][:300]}" for m in recalled)
    prefs = await memory.get_user_preferences(db, user.id)
    if prefs:
        context = f"{context}\n{prefs}" if context else prefs

    docs = await _document_context(db, user, document_ids or [])
    if docs:
        context = f"{context}{docs}" if context else docs
    return context, history


async def _finish(db: AsyncSession, session_id: int, reply: str) -> None:
    db.add(ChatMessage(conversation_id=session_id, role="assistant", content=reply))
    await db.commit()


@router.post("/sessions/{session_id}/stream")
async def stream_reply(
    session_id: int,
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Server-sent events: `{"delta": "..."}` chunks, then `{"done": true}`."""
    context, history = await _prepare(db, user, session_id, payload.message, payload.document_ids)

    async def events():
        parts: list[str] = []
        source = llm_service.stream(
            "Command Center", payload.message, context, history, voice=payload.voice
        )
        async for chunk in iterate_in_threadpool(source):
            parts.append(chunk)
            yield f"data: {json.dumps({'delta': chunk})}\n\n"
        await _finish(db, session_id, "".join(parts))
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/sessions/{session_id}/message", response_model=ChatResponse)
async def send_message(
    session_id: int,
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Non-streaming equivalent, for clients that can't consume SSE."""
    context, history = await _prepare(db, user, session_id, payload.message, payload.document_ids)
    # Same blocking-generator hazard the SSE route handles with
    # iterate_in_threadpool: draining it inline would stall the whole event loop.
    reply = await asyncio.to_thread(
        lambda: "".join(llm_service.stream("Command Center", payload.message, context, history))
    )
    await _finish(db, session_id, reply)
    return ChatResponse(session_id=session_id, reply=reply)


@router.post("/messages/{message_id}/remember")
async def remember(
    message_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Pin a turn into long-term memory so future sessions recall it."""
    msg = await db.get(ChatMessage, message_id)
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    await _owned_session(db, user, msg.conversation_id)
    item = await memory.store_long_term(
        db, user.id, msg.content, agent_name="Command Center",
        tags=["chat", "pinned"], priority="high",
    )
    return {"memory_id": item.id, "content": item.content}
