# AetherOS

AetherOS is an autonomous multi-agent platform: you give it an objective, a
Manager Agent picks a workflow, and a team of specialist agents (planner,
research, writer, reviewer, QA, delivery, memory, …) executes it while
streaming their reasoning to the UI in real time.

## Architecture

```text
frontend/        React + Vite + Tailwind + Zustand + Socket.IO client
backend/         FastAPI + Socket.IO + JWT auth + async SQLAlchemy
  app/agents/    Orchestration engine + agent definitions
  app/workflows/ Objective classification -> workflow generation
  app/tools/     Tool registry the agents invoke
  app/memory/    Short-term cache + long-term / semantic memory
database/        PostgreSQL schema (used by Docker; SQLite is created automatically)
docs/            Architecture + environment notes
```

## Quick Start (no Docker, no database server)

Defaults are zero-infrastructure: SQLite, no Redis, and an offline structured
fallback when no LLM key is set. Tables and the built-in agents are created on
first boot.

Backend:
```bash
cd backend
cp .env.example .env
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # Linux/macOS: .venv/bin/python
.venv/Scripts/python -m uvicorn asgi:app --reload
```

Frontend:
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173, create an account, and submit an objective from
Task Workspace. API docs: http://localhost:8000/docs

### Optional extras
- **Real LLM output** — set `ANTHROPIC_API_KEY` in `backend/.env`. Without it the
  agents return structured template output so the whole flow still works.
- **Semantic search** — `pip install -r backend/requirements-vector.txt`
  (chromadb). Without it, vector search returns empty and nothing else breaks.
- **Redis / PostgreSQL** — set `REDIS_URL` / `DATABASE_URL`.

## Run with Docker

```bash
cp backend/.env.example backend/.env
docker compose up --build
```

Compose overrides the local defaults with PostgreSQL, Redis, and persistent
volumes. Frontend: http://localhost:5173 · API: http://localhost:8000

## Tests

```bash
cd backend && .venv/Scripts/python test_smoke.py   # agents, workflows, approval
cd backend && .venv/Scripts/python test_chat.py    # command center end-to-end
```

`test_smoke.py` covers schema creation, auth hashing, workflow generation, a
full agent run and the approval path. `test_chat.py` drives the chat API over
ASGI: sessions, SSE streaming, persistence, memory pinning, cross-user isolation.

## Implemented
- **AI Command Center** — multi-session chat with token streaming (SSE),
  markdown rendering, long-term memory recall injected as context, "pin to
  memory", and browser-native voice in (speech recognition) / out (speech
  synthesis). Chrome/Edge for the mic.
- JWT auth (+ optional Google OAuth) with protected routes
- Task submission with live Socket.IO agent-activity stream
- 11 specialist agents, workflow auto-selection per objective type
- Human-in-the-loop approval gate before execution
- Memory vault, auto-built knowledge graph, document upload + Q&A
- Analytics dashboard, agent performance metrics, admin console

## Scaling Steps
1. Distributed workers (Celery/RQ) with retries — background tasks are in-process today.
2. Per-agent DB sessions + an async LLM client to make parallel workflow groups truly concurrent.
3. Alembic migrations instead of `create_all`.
4. OpenTelemetry tracing and centralized logs.
