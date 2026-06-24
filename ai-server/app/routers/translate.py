"""Translation endpoint (LLM via Ollama)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import llm

router = APIRouter(tags=["translate"])


class TranslateRequest(BaseModel):
    text: str = Field(..., min_length=1)
    target_lang: str = Field(..., min_length=1, description="Language name or code, e.g. 'Spanish' or 'es'")


class TranslateResponse(BaseModel):
    translated: str
    target_lang: str


@router.post("/translate", response_model=TranslateResponse)
async def translate_endpoint(req: TranslateRequest) -> TranslateResponse:
    try:
        translated = await llm.translate(req.text, req.target_lang)
    except llm.LLMError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return TranslateResponse(translated=translated, target_lang=req.target_lang)
