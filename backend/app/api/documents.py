import os
import uuid
from fastapi import APIRouter, BackgroundTasks, Depends, UploadFile, File, HTTPException
from starlette.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import get_settings
from app.core.deps import get_current_user
from app.db.session import async_session, get_db
from app.models.entities import User, Document
from app.schemas.document import DocumentOut, DocumentQuery
from app.services.llm_service import generate as llm_generate
from app.tools.registry import document_parser, pdf_reader

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("/upload", response_model=DocumentOut)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    settings = get_settings()
    os.makedirs(settings.upload_dir, exist_ok=True)

    ext = (file.filename or "file.txt").rsplit(".", 1)[-1].lower()
    file_id = str(uuid.uuid4())
    storage_path = os.path.join(settings.upload_dir, f"{file_id}.{ext}")

    content = await file.read()
    with open(storage_path, "wb") as f:
        f.write(content)

    text_content = content.decode("utf-8", errors="replace")
    if ext == "pdf":
        parsed = pdf_reader(text_content)
        text_content = parsed.get("text", text_content)
    else:
        parsed = document_parser(text_content, ext)

    insights = parsed.get("key_phrases", []) if isinstance(parsed, dict) else []
    if parsed.get("sections"):
        insights = insights + [f"Section: {s[:80]}" for s in parsed["sections"][:5]]

    doc = Document(
        user_id=user.id,
        filename=file.filename or "unknown",
        file_type=ext,
        file_size=len(content),
        storage_path=storage_path,
        insights=insights,
        status="summarizing",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    # Summarise after responding, not before. The summary is a Document
    # Intelligence nicety; attaching a file to a chat turn doesn't use it and
    # shouldn't wait on a full model round trip to get the upload acknowledged.
    background_tasks.add_task(_summarize, doc.id, text_content[:4000])
    return doc


async def _summarize(doc_id: int, excerpt: str) -> None:
    summary = await run_in_threadpool(
        llm_generate,
        "Document Intelligence Agent",
        f"Summarize this document and extract key insights:\n\n{excerpt}",
    )
    async with async_session() as session:
        doc = await session.get(Document, doc_id)
        if doc:
            doc.summary = summary
            doc.status = "processed"
            await session.commit()


@router.get("", response_model=list[DocumentOut])
async def list_documents(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document).where(Document.user_id == user.id).order_by(Document.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("/{doc_id}/query")
async def query_document(
    doc_id: int,
    payload: DocumentQuery,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Document).where(Document.id == doc_id, Document.user_id == user.id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    answer = llm_generate(
        "Document Intelligence Agent",
        f"Question: {payload.question}\n\nDocument summary: {doc.summary}\n\nInsights: {doc.insights}",
    )
    return {"question": payload.question, "answer": answer, "document_id": doc_id}
