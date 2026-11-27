"""Seed a login user. Usage: python seed_user.py <email> <password> [full name]"""
import asyncio, sys
from sqlalchemy import select
from app.db.session import SessionLocal, init_db
from app.models.entities import User
from app.core.security import hash_password


async def seed(email: str, password: str, full_name: str) -> None:
    await init_db()
    async with SessionLocal() as db:
        user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user:
            user.password_hash = hash_password(password)  # reset, so reruns are idempotent
        else:
            db.add(User(email=email, full_name=full_name, password_hash=hash_password(password)))
        await db.commit()
    print(f"ready: {email}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    asyncio.run(seed(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else sys.argv[1]))
