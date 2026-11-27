"""Desktop actions the assistant can take on this machine.

Two tiers, enforced here rather than in the UI: anything irreversible needs
`confirmed=True`, so a misheard sentence can never reach `desktop.power`.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.deps import get_current_user
from app.models.entities import User
from app.tools import desktop, intents, youtube

router = APIRouter(prefix="/actions", tags=["actions"])

CONFIRMED_ONLY = {"shutdown", "restart", "sleep", "lock", "whatsapp"}


class ParseIn(BaseModel):
    text: str


class RunIn(BaseModel):
    intent: str
    query: str = ""
    confirmed: bool = False
    lang: str = "en"
    # WhatsApp: the name is resolved to a number in the browser's contact book,
    # because that book is the user's and never needs to reach the server.
    phone: str = ""
    message: str = ""


@router.post("/parse")
async def parse(payload: ParseIn, user: User = Depends(get_current_user)):
    """Classify a sentence. `intent: null` means conversation, not a command."""
    found = intents.detect(payload.text)
    if not found:
        return {"intent": None, "lang": intents.language_of(payload.text)}

    # The clock is the one answer that can't be baked into a phrase table.
    if found["intent"] == "time":
        now = datetime.now().strftime("%I:%M %p").lstrip("0")
        found["speak"] = {
            "hi": f"अभी {now} बजे हैं।",
            "bn": f"এখন {now} বাজে।",
        }.get(found["lang"], f"It's {now}.")
    return found


@router.post("/run")
async def run(payload: RunIn, user: User = Depends(get_current_user)):
    intent = payload.intent

    if intent in CONFIRMED_ONLY and not payload.confirmed:
        # The gate: a spoken sentence alone never powers off the machine or
        # opens a message to another human.
        raise HTTPException(status_code=428, detail="Confirmation required")

    if intent in ("shutdown", "restart", "sleep", "lock", "cancel_shutdown"):
        return desktop.power(intent)

    if intent == "whatsapp":
        return desktop.whatsapp(payload.phone, payload.message)

    if intent == "open_app":
        return desktop.open_app(payload.query)

    if intent == "volume":
        return desktop.volume(payload.query or "up")

    if intent == "search":
        return desktop.web_search(payload.query)

    if intent == "open_site":
        # Sites can't be iframed (X-Frame-Options), so a real tab it is.
        # Only *videos* play inside the app — see play_video below.
        return desktop.open_url(payload.query)

    if intent in ("play_video", "cheer_up"):
        query = payload.query or "funny videos"
        video = await youtube.first_video_id(query)
        if video:
            # Plays inside the site — no tab, no context switch.
            return {"ok": True, "embed": f"https://www.youtube.com/embed/{video}?autoplay=1",
                    "video_id": video, "query": query}
        return desktop.play_video(query)  # scrape failed — fall back to a tab

    if intent in ("time", "media_stop"):
        return {"ok": True, "intent": intent}  # answered/handled in the browser

    raise HTTPException(status_code=400, detail=f"Unknown intent: {intent}")
