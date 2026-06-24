"""FastAPI application entrypoint for the AI side-channel server.

Run: ``uvicorn app.main:app --reload --port 8000``
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.config import get_settings
from app.routers import intelligence, summarize, transcribe, translate


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="P2P Call AI Server", version=__version__)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health", tags=["meta"])
    async def health() -> dict:
        return {
            "status": "ok",
            "version": __version__,
            "asr_model": settings.whisper_model,
            "llm_model": settings.ollama_model,
            "llm_backend": settings.ollama_base_url,
        }

    app.include_router(transcribe.router)
    app.include_router(summarize.router)
    app.include_router(translate.router)
    app.include_router(intelligence.router)
    return app


app = create_app()
