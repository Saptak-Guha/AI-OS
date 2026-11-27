# Environment Setup Guide

## Backend
1. Copy `backend/.env.example` to `backend/.env`.
2. Fill:
- `ANTHROPIC_API_KEY`
- `JWT_SECRET_KEY`
- `DATABASE_URL` if not using default docker compose.
3. Install dependencies from `backend/requirements.txt`.
4. Optional: `backend/requirements-vector.txt` for chromadb semantic search.

Defaults need no database server: SQLite under `backend/data/`, no Redis, and
the offline agent fallback when `ANTHROPIC_API_KEY` is empty. Tables are created
on startup.

## Frontend
1. Copy `frontend/.env.example` to `frontend/.env`.
2. Set:
- `VITE_API_URL`
- `VITE_SOCKET_URL`

## Run Stack
```bash
docker compose up --build
```

## Security Checklist
- Rotate JWT secret per environment.
- Set strict CORS origins.
- Add WAF/rate-limit in edge proxy.
- Enable TLS at ingress.
- Add malware scanning for uploaded files.
