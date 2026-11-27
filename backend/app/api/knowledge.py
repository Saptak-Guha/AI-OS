from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.entities import User, KnowledgeNode, KnowledgeEdge
from app.schemas.knowledge import KnowledgeGraphOut, KnowledgeNodeOut, KnowledgeEdgeOut
from app.services.vector_store import VectorStore

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


@router.get("/graph", response_model=KnowledgeGraphOut)
async def get_knowledge_graph(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    nodes_result = await db.execute(
        select(KnowledgeNode).where(KnowledgeNode.user_id == user.id).order_by(KnowledgeNode.created_at.desc()).limit(100)
    )
    edges_result = await db.execute(
        select(KnowledgeEdge).where(KnowledgeEdge.user_id == user.id).limit(200)
    )
    return KnowledgeGraphOut(
        nodes=[KnowledgeNodeOut.model_validate(n) for n in nodes_result.scalars().all()],
        edges=[KnowledgeEdgeOut.model_validate(e) for e in edges_result.scalars().all()],
    )


@router.get("/search")
async def semantic_search(
    q: str = Query(..., min_length=2),
    user: User = Depends(get_current_user),
):
    store = VectorStore()
    results = store.search_knowledge(q, n_results=10)
    items = []
    if results.get("documents") and results["documents"][0]:
        for i, doc in enumerate(results["documents"][0]):
            meta = results.get("metadatas", [[]])[0][i] if results.get("metadatas") else {}
            items.append({"content": doc, "metadata": meta})
    return {"query": q, "results": items}
