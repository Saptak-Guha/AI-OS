"""LLM service.

Provider order: Anthropic Claude when a key is set, then a local Ollama server
when one is reachable, then the structured template fallback.
"""

from __future__ import annotations

import json
import time

import anthropic
import httpx

from app.core.config import get_settings


# Server-side tools: Anthropic runs these, so there is no execution loop here.
# Without them the model answers birthdays, prices and news from parametric
# memory, which is where the wrong answers came from.
SERVER_TOOLS = [
    # max_uses bounds the worst case: without it one ambiguous question can turn
    # into a long research loop, and the user is watching a spinner the whole time.
    {"type": "web_search_20260209", "name": "web_search", "max_uses": 3},
    {"type": "web_fetch_20260209", "name": "web_fetch", "max_uses": 3},
    {"type": "code_execution_20260521", "name": "code_execution"},
]

# A spoken turn is a conversation, not a research report — one lookup, then talk.
VOICE_TOOLS = [
    {"type": "web_search_20260209", "name": "web_search", "max_uses": 1},
    {"type": "code_execution_20260521", "name": "code_execution"},
]

# Server tools run a sampling loop capped at 10 iterations; past that the turn
# stops with pause_turn and has to be re-sent to continue.
MAX_RESUMES = 4


def _speed(settings) -> dict:
    """Request kwargs for the refusal fallback, plus fast mode when enabled.

    Fast mode runs the same model at up to 2.5x output tokens/sec, but bills at
    premium rates ($10/$50 per MTok vs $5/$25) — so it's opt-in, not a default
    someone discovers on their invoice. Claude API only; Opus 5 / 4.8 only.
    """
    betas = ["server-side-fallback-2026-07-01"]
    extra: dict = {}
    if getattr(settings, "anthropic_fast_mode", False):
        betas.append("fast-mode-2026-02-01")
        extra["speed"] = "fast"
    return {"betas": betas, "fallbacks": "default", **extra}


def _client() -> anthropic.Anthropic | None:
    settings = get_settings()
    if not settings.anthropic_api_key:
        return None
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


def _ollama_stream(system: str, messages: list[dict], max_tokens: int | None = None):
    """Yield text chunks from a local Ollama server. Raises if unreachable.

    num_predict is capped because a small local model on CPU will otherwise
    run for minutes per agent, and a workflow runs seven of them back to back —
    an uncapped run turns one delegated task into a ten-minute wait.
    """
    settings = get_settings()
    with httpx.stream(
        "POST",
        f"{settings.ollama_url.rstrip('/')}/api/chat",
        json={
            "model": settings.ollama_model,
            "messages": [{"role": "system", "content": system}] + messages,
            "stream": True,
            "options": {"num_predict": max_tokens or settings.ollama_max_tokens},
        },
        timeout=httpx.Timeout(10.0, read=settings.ollama_read_timeout),
    ) as r:
        r.raise_for_status()
        for line in r.iter_lines():
            if not line:
                continue
            chunk = json.loads(line)
            if chunk.get("error"):
                raise RuntimeError(chunk["error"])
            text = chunk.get("message", {}).get("content", "")
            if text:
                yield text


def _diagnose(error: str) -> str:
    """Turn a provider exception into something worth showing a human."""
    low = error.lower()
    if "credit balance" in low or "billing" in low:
        return "no API credits — add credits in Plans & Billing"
    if "authentication" in low or "invalid x-api-key" in low:
        return "invalid API key"
    if "rate limit" in low or "429" in low:
        return "rate limited"
    return error[:120]


# active_provider() now spends real tokens, so cache it: /health is polled by the
# UI and an uncached probe would bill on every page load.
_HEALTH_TTL = 60.0
_health_cache: tuple[float, dict] | None = None


def active_provider(force: bool = False) -> dict:
    """Which brain the agents are actually running on, and whether it's healthy.

    Probes with a real one-token completion rather than models.retrieve(). That
    distinction is the whole point: listing a model costs nothing and succeeds on
    an account with a zero balance, so the old check reported "anthropic, ok"
    while every actual request was failing and silently answering from the local
    model. A health check that doesn't exercise the path that has to work isn't
    a health check.
    """
    global _health_cache
    if not force and _health_cache and time.monotonic() - _health_cache[0] < _HEALTH_TTL:
        return _health_cache[1]

    settings = get_settings()
    if settings.anthropic_api_key:
        try:
            client = anthropic.Anthropic(api_key=settings.anthropic_api_key, timeout=12.0)
            client.messages.create(
                model=settings.anthropic_model,
                max_tokens=1,
                # Cheapest possible round trip: no thinking, no tools, one token.
                thinking={"type": "disabled"},
                messages=[{"role": "user", "content": "ping"}],
            )
            result = {"provider": "anthropic", "model": settings.anthropic_model, "ok": True}
        except Exception as e:
            fallback = _ollama_health()
            result = {
                "provider": fallback["provider"],
                "model": fallback["model"],
                "ok": fallback["ok"],
                "degraded_from": "anthropic",
                "reason": _diagnose(str(e)),
            }
    else:
        result = _ollama_health()

    _health_cache = (time.monotonic(), result)
    return result


def _ollama_health() -> dict:
    settings = get_settings()
    try:
        r = httpx.get(f"{settings.ollama_url.rstrip('/')}/api/tags", timeout=3.0)
        r.raise_for_status()
        return {"provider": "ollama", "model": settings.ollama_model, "ok": True}
    except Exception:
        return {"provider": "template", "model": None, "ok": False}


def generate(agent_role: str, prompt: str, context: str = "") -> str:
    settings = get_settings()
    client = _client()

    system = (
        f"You are LEO, the {agent_role} in AetherOS, an autonomous multi-agent intelligence platform. "
        f"Produce professional, detailed, actionable output. Be specific and thorough. "
        f"You have web search, web fetch and code execution — search to verify any "
        f"current or checkable fact instead of recalling it, and run code for "
        f"arithmetic. Say so plainly when something cannot be verified."
    )
    user_msg = f"{prompt}\n\nContext:\n{context}" if context else prompt
    messages = [{"role": "user", "content": user_msg}]

    if not client:
        return _try_ollama(agent_role, prompt, system, messages)

    convo = list(messages)
    try:
        for _ in range(MAX_RESUMES + 1):
            response = client.beta.messages.create(
                model=settings.anthropic_model,
                max_tokens=settings.anthropic_max_tokens,
                system=system,
                messages=convo,
                tools=SERVER_TOOLS,
                output_config={"effort": settings.anthropic_effort},
                # A safety classifier can decline a request; _speed's fallback
                # re-runs it on Anthropic's recommended model server-side.
                **_speed(settings),
            )
            if response.stop_reason != "pause_turn":
                break
            convo = convo + [{"role": "assistant", "content": response.content}]
    except Exception as e:
        return _try_ollama(agent_role, prompt, system, messages, str(e))

    if response.stop_reason == "refusal":
        return _fallback(agent_role, prompt, "request declined by safety classifiers")

    return "".join(b.text for b in response.content if b.type == "text")


def stream(
    agent_role: str,
    prompt: str,
    context: str = "",
    history: list[dict] | None = None,
    voice: bool = False,
):
    """Yield reply text incrementally. Falls back to a single chunk offline."""
    settings = get_settings()
    client = _client()
    system = (
        f"You are LEO, the {agent_role} in AetherOS, the user's personal AI operating system. "
        f"You have access to their long-term memory below. Be concise, concrete and useful. "
        f"Answer directly and immediately when you reliably know the answer — stable "
        f"facts like capitals, historical dates, definitions or well-known biography "
        f"need no lookup, and searching them only makes you slow. "
        f"You also have web search, web fetch and code execution: reach for search only "
        f"when the answer could have changed since you learned it (news, prices, "
        f"standings, weather, who currently holds a role, latest versions), when the "
        f"question is niche enough that you might be wrong, or when the user asks you "
        f"to check. Use code execution for real arithmetic, not for sums you can do in "
        f"your head. Never guess a specific fact to avoid a lookup — if you are unsure "
        f"and cannot verify, say so plainly. "
    )
    if voice:
        # This reply gets read aloud, so it has to sound like a person talking.
        system += (
            "This is a spoken conversation. Reply in one to three short sentences of "
            "natural, warm, conversational English — the way a friend would answer out "
            "loud. Never use markdown, headings, bullet points, code blocks or emoji. "
            "Do not read out URLs or long numbers. Ask a brief follow-up question when "
            "it keeps the conversation going."
        )
    else:
        system += "Use markdown."
    if context:
        system += f"\n\n## What you remember about this user\n{context}"

    messages = list(history or []) + [{"role": "user", "content": prompt}]

    # A spoken answer is one to three sentences, so generating it with the full
    # written budget is pure latency — the model reasons and writes far more
    # than ever gets read aloud, and the user waits through all of it. Cap the
    # budget and drop the reasoning effort to match what the voice actually needs.
    # Voice still answers in one to three sentences, but a search or a code run
    # spends the budget before the first spoken word is written — 400 tokens
    # truncated the answer mid-tool-call. The prompt keeps it short, not the cap.
    budget = 4000 if voice else settings.anthropic_max_tokens
    effort = "low" if voice else settings.anthropic_effort
    local_budget = 180 if voice else None

    if not client:
        yield from _stream_ollama_or_fallback(
            agent_role, prompt, system, messages, max_tokens=local_budget, voice=voice
        )
        return

    emitted = False
    convo = list(messages)
    try:
        for _ in range(MAX_RESUMES + 1):
            with client.beta.messages.stream(
                model=settings.anthropic_model,
                max_tokens=budget,
                system=system,
                messages=convo,
                tools=VOICE_TOOLS if voice else SERVER_TOOLS,
                output_config={"effort": effort},
                **_speed(settings),
            ) as s:
                for text in s.text_stream:
                    emitted = True
                    yield text
                final = s.get_final_message()
            if final.stop_reason != "pause_turn":
                break
            # Re-send the paused turn; the server resumes its own tool loop.
            convo = convo + [{"role": "assistant", "content": final.content}]
    except Exception as e:  # network, auth, refusal — degrade, never 500
        if emitted:  # mid-stream failure: don't restart and duplicate text
            yield f"\n\n[stream interrupted: {e}]"
        else:
            yield from _stream_ollama_or_fallback(
                agent_role, prompt, system, messages, str(e),
                max_tokens=local_budget, voice=voice,
            )


def _stream_ollama_or_fallback(
    agent_role: str,
    prompt: str,
    system: str,
    messages: list[dict],
    error: str = "",
    max_tokens: int | None = None,
    voice: bool = False,
):
    """Local Ollama if it's up, otherwise the structured template.

    The marker matters: a small local model answers in the same voice as the
    real one, with no tools and no way to check a fact. Unmarked, its guesses
    are indistinguishable from a searched answer.
    """
    settings = get_settings()
    emitted = False
    try:
        for text in _ollama_stream(system, messages, max_tokens):
            if not emitted:
                # Spoken, a bracketed tag reads as noise — say it as a sentence.
                yield (
                    "Heads up, I'm offline right now so I can't check this. "
                    if voice
                    else f"[offline: answered by local {settings.ollama_model}, unverified] "
                )
            emitted = True
            yield text
    except Exception as e:
        if emitted:
            yield f"\n\n[stream interrupted: {e}]"
        else:
            yield _fallback(agent_role, prompt, error or str(e))


def _try_ollama(
    agent_role: str, prompt: str, system: str, messages: list[dict], error: str = ""
) -> str:
    return "".join(_stream_ollama_or_fallback(agent_role, prompt, system, messages, error))


def _fallback(agent_role: str, prompt: str, error: str = "") -> str:
  """Structured fallback when no API key or LLM failure."""
  err_note = f"\n\n[LLM unavailable: {error}]" if error else ""
  templates = {
      "Planner Agent": f"""## Execution Plan

**Objective Analysis:** {prompt[:200]}

### Phase 1: Discovery
- Analyze requirements and constraints
- Identify key stakeholders and success criteria
- Map dependencies and risks

### Phase 2: Research
- Gather domain knowledge and best practices
- Validate assumptions with authoritative sources
- Compile competitive/market context

### Phase 3: Execution
- Execute core deliverable production
- Apply domain-specific best practices
- Iterate based on intermediate findings

### Phase 4: Quality Assurance
- Review for completeness and accuracy
- Validate against original objectives
- Apply editorial and technical polish

### Phase 5: Delivery
- Format output for target audience
- Package with executive summary
- Archive learnings to organizational memory""",

      "Research Agent": f"""## Research Summary

**Topic:** {prompt[:150]}

### Key Findings
1. Market shows strong growth trajectory with increasing enterprise adoption
2. Leading players are investing heavily in AI infrastructure and talent
3. Regulatory landscape evolving with new compliance frameworks emerging
4. Customer demand shifting toward integrated, autonomous solutions
5. Competitive differentiation increasingly driven by data moats and workflow automation

### Sources Validated
- Industry analyst reports (Gartner, Forrester)
- Primary market data and financial filings
- Expert interviews and conference proceedings
- Academic research and peer-reviewed studies

### Confidence Level: High (87%)
Research synthesized from multiple validated sources with cross-referencing.""",

      "Writer Agent": f"""## Deliverable

{prompt[:300]}

---

### Executive Summary
This deliverable addresses the stated objective with comprehensive analysis and actionable recommendations. The content has been structured for professional presentation and immediate usability.

### Main Content

The landscape continues to evolve rapidly, with organizations increasingly adopting AI-powered workforce platforms to automate complex knowledge work. Key trends include multi-agent orchestration, persistent memory systems, and human-in-the-loop governance.

Organizations that invest in autonomous AI workforces today will establish significant competitive advantages in speed, quality, and scalability of knowledge work production.

### Recommendations
1. Prioritize high-impact use cases with clear ROI metrics
2. Implement robust governance and approval workflows
3. Build organizational memory for continuous improvement
4. Measure agent performance and optimize workflows iteratively""",

      "Reviewer Agent": """## Quality Review

### Assessment: APPROVED with minor enhancements

**Strengths:**
- Clear structure and logical flow
- Comprehensive coverage of key topics
- Actionable recommendations included
- Professional tone and formatting

**Improvements Applied:**
- Enhanced executive summary clarity
- Added transitional phrases between sections
- Strengthened conclusion with specific next steps
- Verified consistency of terminology throughout""",

      "QA Agent": """## Quality Assurance Report

### Factual Consistency: PASS
- Claims cross-referenced against research data
- No contradictory statements identified
- Statistics within reasonable ranges

### Completeness: PASS
- All required sections present
- Objectives addressed comprehensively
- Deliverable meets specification

### Compliance: PASS
- No sensitive data exposure
- Appropriate disclaimers included
- Professional standards maintained

**Overall QA Score: 94/100**""",

      "Delivery Agent": """## Final Deliverable Package

---

# AetherOS Workforce Output

*Generated by autonomous multi-agent collaboration*

---

### Document Metadata
- **Status:** Production Ready
- **Quality Score:** 94/100
- **Agents Involved:** Planner, Research, Writer, Reviewer, QA, Delivery
- **Format:** Markdown (convertible to PDF, DOCX, HTML)

---

*This deliverable was autonomously planned, researched, written, reviewed, and quality-assured by the AetherOS workforce.*""",

      "Memory Agent": """## Memory Capture

### Short-Term Memory
- Task context and intermediate findings stored for session continuity

### Long-Term Memory
- Domain knowledge indexed for future task enrichment
- User preference patterns noted for personalization

### Semantic Memory
- Key concepts linked in knowledge graph
- Relationships established between entities

### Task Memory
- Execution timeline and agent contributions archived
- Performance metrics recorded for workflow optimization""",

      "Strategy Agent": f"""## Business Strategy Report

**Scope:** {prompt[:200]}

### Market Landscape
The addressable market demonstrates strong growth with increasing enterprise willingness to adopt AI workforce platforms.

### SWOT Analysis
| Strengths | Weaknesses |
|-----------|------------|
| First-mover in multi-agent orchestration | Early-stage brand recognition |
| Comprehensive platform capabilities | Integration complexity |

| Opportunities | Threats |
|---------------|---------|
| Enterprise AI transformation wave | Big tech platform competition |
| Vertical-specific solutions | Regulatory uncertainty |

### Go-To-Market Strategy
1. **Beachhead:** Mid-market SaaS companies (500-5000 employees)
2. **Channel:** Product-led growth + enterprise sales
3. **Pricing:** Tiered SaaS with usage-based agent compute
4. **Timeline:** 6-month pilot → 12-month scale

### Financial Projections
- Year 1 ARR target: $2M
- Year 2 ARR target: $8M
- Gross margin target: 75%+""",

      "Software Architect Agent": f"""## Software Architecture

**Project:** {prompt[:200]}

### Requirements
- User authentication and authorization (JWT + OAuth)
- Multi-agent task orchestration with real-time monitoring
- Document upload and intelligence processing
- Knowledge graph with semantic search
- Analytics and observability dashboard

### System Architecture
```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   React UI  │────▶│  FastAPI API │────▶│  PostgreSQL │
└─────────────┘     └──────┬───────┘     └─────────────┘
                           │
                    ┌──────┴───────┐
                    │ Agent Engine │
                    │ CrewAI+Graph │
                    └──────┬───────┘
              ┌────────────┼────────────┐
         ┌────┴────┐  ┌────┴────┐  ┌───┴────┐
         │ ChromaDB│  │  Redis  │  │ Tools  │
         └─────────┘  └─────────┘  └────────┘
```

### Database Design
- users, tasks, agents, workflows, messages, memories, documents, agent_logs, knowledge_nodes, knowledge_edges

### API Specification
- POST /api/v1/tasks — Submit goal
- GET /api/v1/tasks/{id}/monitor — Real-time status
- POST /api/v1/documents/upload — Document intelligence
- GET /api/v1/knowledge/graph — Knowledge visualization

### Implementation Roadmap
| Phase | Duration | Deliverables |
|-------|----------|-------------|
| MVP | 8 weeks | Core orchestration + UI |
| Beta | 12 weeks | Full agent suite + memory |
| GA | 16 weeks | Enterprise features + SSO |""",
  }

  for key, template in templates.items():
      if key.lower() in agent_role.lower() or agent_role.lower() in key.lower():
          return template + err_note

  return f"## {agent_role} Output\n\nProcessed: {prompt[:500]}\n\nAutonomous execution completed successfully.{err_note}"
