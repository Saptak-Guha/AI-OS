import asyncio, os
os.environ.setdefault("DATABASE_URL","sqlite+aiosqlite:///./data/aetheros.db")
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db.session import init_db

async def main():
    await init_db()
    t = ASGITransport(app=app)
    async with AsyncClient(transport=t, base_url="http://test") as c:
        email = "chat_smoke@example.com"
        r = await c.post("/api/v1/auth/register", json={"email":email,"full_name":"Chat Smoke","password":"pw12345678"})
        if r.status_code >= 400:
            r = await c.post("/api/v1/auth/login", json={"email":email,"password":"pw12345678"})
        tok = r.json()["access_token"]
        h = {"Authorization": f"Bearer {tok}"}

        s = (await c.post("/api/v1/chat/sessions", headers=h)).json()
        assert s["id"] and s["message_count"] == 0, s
        sid = s["id"]

        # streaming
        chunks = []
        async with c.stream("POST", f"/api/v1/chat/sessions/{sid}/stream", headers=h,
                            json={"message":"Remember I prefer terse answers."}) as resp:
            assert resp.status_code == 200, resp.status_code
            async for line in resp.aiter_lines():
                if line.startswith("data: "):
                    chunks.append(line)
        assert chunks and '"done": true' in chunks[-1], chunks[-1:]

        msgs = (await c.get(f"/api/v1/chat/sessions/{sid}/messages", headers=h)).json()
        assert [m["role"] for m in msgs] == ["user","assistant"], msgs
        assert msgs[1]["content"].strip(), "empty assistant reply"

        sessions = (await c.get("/api/v1/chat/sessions", headers=h)).json()
        me = [x for x in sessions if x["id"] == sid][0]
        assert me["message_count"] == 2 and me["title"].startswith("Remember"), me

        pin = (await c.post(f"/api/v1/chat/messages/{msgs[1]['id']}/remember", headers=h)).json()
        assert pin["memory_id"], pin
        # Un-pin, so repeated runs don't leave test text in the memory context.
        assert (await c.delete(f"/api/v1/memory/{pin['memory_id']}", headers=h)).status_code == 200

        # second turn carries history + memory context
        r2 = await c.post(f"/api/v1/chat/sessions/{sid}/message", headers=h, json={"message":"and now?"})
        assert r2.status_code == 200 and r2.json()["reply"], r2.text

        # ownership isolation
        r3 = await c.post("/api/v1/auth/register", json={"email":"other_smoke@example.com","full_name":"O","password":"pw12345678"})
        if r3.status_code >= 400:
            r3 = await c.post("/api/v1/auth/login", json={"email":"other_smoke@example.com","password":"pw12345678"})
        h2 = {"Authorization": f"Bearer {r3.json()['access_token']}"}
        assert (await c.get(f"/api/v1/chat/sessions/{sid}/messages", headers=h2)).status_code == 404

        assert (await c.delete(f"/api/v1/chat/sessions/{sid}", headers=h)).status_code == 200
    print("chat OK")

asyncio.run(main())
