import asyncio
import os
from contextlib import asynccontextmanager

import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.monitoring.events import event_bus, set_socketio
from app.db.session import init_db
from app.api import auth, chat, memory, workflows, tasks, agents, documents, knowledge, analytics, admin, actions

settings = get_settings()
configure_logging()
os.makedirs(settings.upload_dir, exist_ok=True)

limiter = Limiter(key_func=get_remote_address)

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
set_socketio(sio)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title=settings.app_name,
    description="AetherOS — Autonomous Multi-Agent Intelligence Platform",
    version="1.0.0",
    lifespan=lifespan,
)
app.state.limiter = limiter

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(tasks.router, prefix=settings.api_prefix)
app.include_router(agents.router, prefix=settings.api_prefix)
app.include_router(chat.router, prefix=settings.api_prefix)
app.include_router(memory.router, prefix=settings.api_prefix)
app.include_router(workflows.router, prefix=settings.api_prefix)
app.include_router(documents.router, prefix=settings.api_prefix)
app.include_router(knowledge.router, prefix=settings.api_prefix)
app.include_router(analytics.router, prefix=settings.api_prefix)
app.include_router(admin.router, prefix=settings.api_prefix)
app.include_router(actions.router, prefix=settings.api_prefix)


@app.get("/health")
async def health():
    from app.services.llm_service import active_provider

    return {
        "status": "ok",
        "service": settings.app_name,
        "version": "1.0.0",
        # Probes the provider, so it is a network call — kept off the hot path
        # by living on /health, which nothing polls in a loop.
        "llm": await asyncio.to_thread(active_provider),
        "agents": ["manager", "planner", "research", "writer", "reviewer", "qa", "memory", "tool", "delivery", "strategy", "architect"],
    }


@sio.event
async def connect(sid, environ):
    await sio.emit("connected", {"message": "Connected to AetherOS Agent Monitor", "sid": sid}, to=sid)


@sio.event
async def join_task(sid, data):
    task_id = data.get("task_id")
    if task_id:
        await sio.enter_room(sid, f"task_{task_id}")
        await sio.emit("joined", {"task_id": task_id, "room": f"task_{task_id}"}, to=sid)


@sio.event
async def leave_task(sid, data):
    task_id = data.get("task_id")
    if task_id:
        await sio.leave_room(sid, f"task_{task_id}")


@sio.event
async def command(sid, data):
    """Legacy command channel — redirects to task submission guidance."""
    message = data.get("message", "")
    await sio.emit("agent_event", {
        "type": "info",
        "message": f"Use POST /api/v1/tasks to submit goals. Received: {message[:100]}",
        "agent": "manager",
    }, to=sid)


asgi_app = socketio.ASGIApp(sio, other_asgi_app=app)
