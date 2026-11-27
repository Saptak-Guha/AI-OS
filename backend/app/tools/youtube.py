"""Resolve a search phrase to a YouTube video id, so the site can embed it.

ponytail: scrapes the first videoId out of the results page instead of taking
the Data API. No key to provision, no quota, no new dependency — httpx is
already here. The trade is fragility: if YouTube changes its payload shape the
regex stops matching, and the caller falls back to opening a real tab.
Swap for the Data API if embedding ever becomes load-bearing.
"""

from __future__ import annotations

import re
import urllib.parse

import httpx

_VIDEO_ID = re.compile(r'"videoId":"([\w-]{11})"')

# Without a desktop UA, YouTube serves a consent wall with no results in it.
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}


async def first_video_id(query: str) -> str | None:
    url = "https://www.youtube.com/results?search_query=" + urllib.parse.quote(query)
    try:
        async with httpx.AsyncClient(timeout=6, follow_redirects=True) as client:
            res = await client.get(url, headers=_HEADERS)
        match = _VIDEO_ID.search(res.text)
    except Exception:
        return None  # offline, blocked, or slow — caller opens a tab instead
    return match.group(1) if match else None
