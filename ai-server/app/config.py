"""Environment-based configuration for the AI server.

All values come from environment variables (see .env.example). The LLM is an
Ollama server exposing the OpenAI-compatible API, so no proprietary keys are
required for local development.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field


def _origins(value: str) -> list[str]:
    value = value.strip()
    if value in ("", "*"):
        return ["*"]
    return [o.strip() for o in value.split(",") if o.strip()]


@dataclass(frozen=True)
class Settings:
    # HTTP server
    host: str = os.getenv("AI_HOST", "0.0.0.0")
    port: int = int(os.getenv("AI_PORT", "8000"))
    cors_origins: list[str] = field(
        default_factory=lambda: _origins(os.getenv("AI_CORS_ORIGIN", "*"))
    )

    # ASR (faster-whisper)
    whisper_model: str = os.getenv("WHISPER_MODEL", "base")
    whisper_device: str = os.getenv("WHISPER_DEVICE", "cpu")
    whisper_compute_type: str = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
    # Language hint; empty -> auto-detect.
    default_language: str = os.getenv("ASR_LANGUAGE", "")

    # LLM via Ollama (OpenAI-compatible endpoint).
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "llama3.1")
    llm_timeout_seconds: float = float(os.getenv("LLM_TIMEOUT_SECONDS", "60"))


def get_settings() -> Settings:
    """Construct settings from the current environment.

    Not cached so tests can monkeypatch os.environ between cases.
    """
    return Settings()
