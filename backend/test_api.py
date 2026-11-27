"""HTTP-level check that every API route works end to end.

Run: .venv/Scripts/python test_api.py
Throwaway SQLite + upload dir, no external services.
"""

import os
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_tmp}/api.db"
os.environ["REDIS_URL"] = ""
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["UPLOAD_DIR"] = os.path.join(_tmp, "uploads")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


def main() -> None:
    with TestClient(app) as c:
        # --- auth ---
        reg = c.post("/api/v1/auth/register", json={
            "email": "smoke@example.com", "password": "pw12345678", "full_name": "Smoke"})
        assert reg.status_code == 200, reg.text
        token = reg.json()["access_token"]
        h = {"Authorization": f"Bearer {token}"}

        assert c.post("/api/v1/auth/login", json={
            "email": "smoke@example.com", "password": "pw12345678"}).status_code == 200
        assert c.post("/api/v1/auth/login", json={
            "email": "smoke@example.com", "password": "wrong"}).status_code == 401
        assert c.get("/api/v1/auth/me", headers=h).json()["email"] == "smoke@example.com"
        assert c.get("/api/v1/auth/me").status_code == 401, "unauthenticated must be rejected"

        # --- agents / workflows ---
        assert c.get("/api/v1/agents", headers=h).json(), "agents must be seeded"
        assert c.post("/api/v1/workflows/classify", json={"objective": "Write a blog post"},
                      headers=h).json()["task_type"] == "content"
        assert c.post("/api/v1/workflows/preview", json={"objective": "Write a blog post"},
                      headers=h).json()["nodes"]
        run = c.post("/api/v1/workflows/run", json={"objective": "Write a blog post"}, headers=h)
        assert run.status_code == 200, run.text

        # --- tasks + approval gate ---
        task = c.post("/api/v1/tasks", json={"objective": "Research quantum computing"}, headers=h)
        assert task.status_code == 200, task.text
        tid = task.json()["id"]
        assert c.get("/api/v1/tasks", headers=h).json()
        assert c.get(f"/api/v1/tasks/{tid}", headers=h).json()["id"] == tid
        # The approval gate, without waiting on a live agent run. This task was
        # created without requires_approval, so it is not awaiting one — both
        # guards should fire. (The old assertion posted no body at all and
        # expected 200; TaskApproval requires `approved`, so it could only ever
        # have been a 422.)
        assert c.post(f"/api/v1/tasks/{tid}/approve", headers=h).status_code == 422
        assert c.post(f"/api/v1/tasks/{tid}/approve", json={"approved": True},
                      headers=h).status_code == 400
        assert c.post("/api/v1/tasks/999999/approve", json={"approved": True},
                      headers=h).status_code == 404
        assert isinstance(c.get(f"/api/v1/tasks/{tid}/logs", headers=h).json(), list)

        # --- documents ---
        up = c.post("/api/v1/documents/upload", headers=h,
                    files={"file": ("note.txt", b"AetherOS runs multi-agent workflows.", "text/plain")})
        assert up.status_code == 200, up.text
        did = up.json()["id"]
        assert c.get("/api/v1/documents", headers=h).json()
        q = c.post(f"/api/v1/documents/{did}/query", json={"question": "What does it run?"}, headers=h)
        assert q.status_code == 200, q.text

        # --- memory ---
        assert c.post("/api/v1/memory", json={"content": "user prefers concise output",
                                           "kind": "preference"}, headers=h).status_code == 200
        assert c.get("/api/v1/memory", headers=h).json()
        assert c.get("/api/v1/memory/search", params={"q": "concise"}, headers=h).status_code == 200

        # --- knowledge / analytics / admin ---
        assert c.get("/api/v1/knowledge/graph", headers=h).status_code == 200
        assert c.get("/api/v1/knowledge/search", params={"q": "quantum"}, headers=h).status_code == 200
        assert c.get("/api/v1/analytics/dashboard", headers=h).status_code == 200
        assert isinstance(c.get("/api/v1/analytics/agents", headers=h).json(), list)
        assert c.get("/api/v1/admin/overview", headers=h).status_code in (200, 403)
        assert c.get("/api/v1/admin/users", headers=h).status_code in (200, 403)

        # --- chat ---
        # Session lifecycle, not a live turn: sending a message invokes the LLM,
        # which on the local fallback takes tens of seconds per call. (The old
        # assertion posted to /chat/command, which no longer exists — it had
        # been asserting against a 404.)
        s = c.post("/api/v1/chat/sessions", headers=h)
        assert s.status_code == 200, s.text
        sid = s.json()["id"]
        assert c.get("/api/v1/chat/sessions", headers=h).status_code == 200
        assert c.get(f"/api/v1/chat/sessions/{sid}/messages", headers=h).json() == []
        assert c.delete(f"/api/v1/chat/sessions/{sid}", headers=h).status_code == 200
        assert c.get(f"/api/v1/chat/sessions/{sid}/messages", headers=h).status_code == 404

    print("api test OK")


if __name__ == "__main__":
    main()
