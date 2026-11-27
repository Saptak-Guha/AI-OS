"""Check that the chat path actually gets tools and resumes a paused turn.

The Messi-birthday bug was silent: no error, just a confident wrong date. The
only thing that would have caught it is asserting tools reach the request.
"""

import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.services import llm_service  # noqa: E402


class _Stream:
    def __init__(self, calls, texts, stop):
        self.calls, self.texts, self.stop = calls, texts, stop

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    @property
    def text_stream(self):
        return iter(self.texts)

    def get_final_message(self):
        return types.SimpleNamespace(stop_reason=self.stop, content=[])


def _fake_client(script):
    """script: list of (texts, stop_reason) — one entry per expected request."""
    calls = []

    def stream(**kw):
        calls.append(kw)
        texts, stop = script[len(calls) - 1]
        return _Stream(calls, texts, stop)

    client = types.SimpleNamespace(
        beta=types.SimpleNamespace(messages=types.SimpleNamespace(stream=stream))
    )
    return client, calls


def test_tools_are_sent():
    client, calls = _fake_client([(["Messi was born 24 June 1987."], "end_turn")])
    llm_service._client = lambda: client

    out = "".join(llm_service.stream("Command Center", "when is messi's birthday"))

    assert len(calls) == 1
    names = {t["name"] for t in calls[0]["tools"]}
    assert names == {"web_search", "web_fetch", "code_execution"}, names
    assert "verify" in calls[0]["system"] or "search" in calls[0]["system"]
    assert "24 June" in out


def test_paused_turn_resumes():
    client, calls = _fake_client(
        [(["searching"], "pause_turn"), ([" 24 June 1987."], "end_turn")]
    )
    llm_service._client = lambda: client

    out = "".join(llm_service.stream("Command Center", "q"))

    assert len(calls) == 2, "a paused turn must be re-sent, not silently truncated"
    assert len(calls[1]["messages"]) > len(calls[0]["messages"])
    assert out == "searching 24 June 1987."


def test_voice_budget_survives_a_tool_call():
    client, calls = _fake_client([(["ok"], "end_turn")])
    llm_service._client = lambda: client

    llm_service.stream("Command Center", "q", voice=True).__next__()

    # 400 tokens was the old cap; a search consumes that before the first word.
    assert calls[0]["max_tokens"] >= 2000, calls[0]["max_tokens"]


def test_health_probe_catches_a_broken_key():
    """models.retrieve() succeeds on a zero balance; messages.create() does not.

    This is the exact shape of the bug: the old probe called the free endpoint,
    so a key that could not complete a single request reported healthy.
    """

    class _Msgs:
        def create(self, **kw):
            raise RuntimeError(
                "Error code: 400 - Your credit balance is too low to "
                "access the Anthropic API."
            )

    probed = []

    class _Models:
        def retrieve(self, m):
            probed.append(m)  # the free call the old probe used to make
            return types.SimpleNamespace(id=m)

    llm_service.anthropic.Anthropic = lambda **kw: types.SimpleNamespace(
        messages=_Msgs(), models=_Models()
    )
    llm_service._ollama_health = lambda: {
        "provider": "template", "model": None, "ok": False,
    }
    llm_service._health_cache = None

    out = llm_service.active_provider(force=True)

    assert out["degraded_from"] == "anthropic", out
    assert "credits" in out["reason"], out["reason"]
    assert not probed, "health must not probe via the free models endpoint"


def test_attached_documents_reach_the_model_and_stay_per_user():
    """Attachments become context — and only the owner's attachments do.

    document_ids arrive from the client, so the ownership filter is the whole
    security boundary here: without it, guessing an integer id would read
    someone else's upload.
    """
    import asyncio, tempfile, os as _os
    from app.api import chat as chat_api

    tmp = tempfile.mkdtemp()
    mine = _os.path.join(tmp, "mine.txt")
    with open(mine, "w", encoding="utf-8") as f:
        f.write("The quarterly revenue was 42 million.")

    class _Doc:
        def __init__(self, i, uid, path):
            self.id, self.user_id = i, uid
            self.filename, self.file_type, self.storage_path = "mine.txt", "txt", path

    owned = [_Doc(1, 7, mine)]

    class _DB:
        async def scalars(self, q):
            # Stand in for the WHERE user_id == user.id filter.
            return types.SimpleNamespace(all=lambda: owned)

    user = types.SimpleNamespace(id=7)
    out = asyncio.run(chat_api._document_context(_DB(), user, [1]))
    assert "42 million" in out, out
    assert "mine.txt" in out

    owned.clear()  # same id, different owner -> filtered out upstream
    empty = asyncio.run(chat_api._document_context(_DB(), user, [1]))
    assert empty == "", empty

    # No ids attached must not cost a query at all.
    assert asyncio.run(chat_api._document_context(None, user, [])) == ""


if __name__ == "__main__":
    test_tools_are_sent()
    test_paused_turn_resumes()
    test_voice_budget_survives_a_tool_call()
    test_health_probe_catches_a_broken_key()
    test_attached_documents_reach_the_model_and_stay_per_user()
    print("ok")
