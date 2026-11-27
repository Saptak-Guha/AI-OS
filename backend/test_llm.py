"""Provider routing check: Anthropic -> Ollama -> template fallback."""

import httpx

from app.core.config import get_settings
from app.services import llm_service as svc


REAL_OLLAMA = svc._ollama_stream  # captured before any test monkeypatches it


def _no_anthropic():
    get_settings().anthropic_api_key = ""


def test_ollama_used_when_no_key():
    _no_anthropic()
    svc._ollama_stream = lambda system, messages: iter(["Hello ", "from ", "Ollama"])
    assert "".join(svc.stream("Command Center", "hi")) == "Hello from Ollama"
    assert svc.generate("Writer Agent", "hi") == "Hello from Ollama"


def test_template_used_when_ollama_down():
    _no_anthropic()

    def dead(system, messages):
        raise httpx.ConnectError("connection refused")
        yield  # pragma: no cover — makes this a generator

    svc._ollama_stream = dead
    out = "".join(svc.stream("Research Agent", "market size?"))
    assert "Research Summary" in out and "connection refused" in out


def test_partial_stream_is_not_restarted():
    """A mid-stream failure must not replay the template on top of real text."""
    _no_anthropic()

    def flaky(system, messages):
        yield "partial answer"
        raise RuntimeError("boom")

    svc._ollama_stream = flaky
    out = "".join(svc.stream("Command Center", "hi"))
    assert out.startswith("partial answer") and "stream interrupted" in out
    assert "Command Center Output" not in out


def test_live_ollama_if_running():
    try:
        httpx.get(f"{get_settings().ollama_url}/api/tags", timeout=2)
    except Exception:
        print("  (skipped live check — no Ollama server on", get_settings().ollama_url + ")")
        return
    _no_anthropic()
    svc._ollama_stream = REAL_OLLAMA
    out = "".join(svc.stream("Command Center", "Say the single word: ready"))
    assert out.strip(), "live Ollama returned nothing"
    print("  live Ollama replied:", out[:80])


if __name__ == "__main__":
    for fn in (
        test_ollama_used_when_no_key,
        test_template_used_when_ollama_down,
        test_partial_stream_is_not_restarted,
        test_live_ollama_if_running,
    ):
        fn()
        print("ok:", fn.__name__)
    print("llm routing OK")
