from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "AetherOS API"
    app_env: str = "development"
    app_debug: bool = True
    api_prefix: str = "/api/v1"

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-opus-5"
    anthropic_max_tokens: int = 16000
    anthropic_effort: str = "medium"  # low | medium | high | xhigh | max
    # Same model, up to 2.5x output speed, at double the token price
    # ($10/$50 per MTok). Opus 5 / 4.8 on the Claude API only. Off by default so
    # the speed-up is a decision, not a surprise on the bill.
    anthropic_fast_mode: bool = False

    # Free local fallback: used when no Anthropic key is set (or a call fails)
    # and an Ollama server is reachable. https://ollama.com
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"
    # A small model on CPU is the slow path, so bound it: enough tokens for a
    # useful agent step, and a read timeout short enough that one wedged
    # generation fails the step instead of parking the workflow forever.
    ollama_max_tokens: int = 700
    ollama_read_timeout: float = 90.0

    jwt_secret_key: str = "change_me_in_production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 120

    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/v1/auth/google/callback"

    # Defaults are zero-dependency (SQLite + no Redis) so the app runs with no
    # infra. Docker/production override these via .env.
    database_url: str = "sqlite+aiosqlite:///./data/aetheros.db"
    redis_url: str = ""
    chroma_path: str = "./data/chroma"
    upload_dir: str = "./data/uploads"
    cors_origins: str = "http://localhost:5173"

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
