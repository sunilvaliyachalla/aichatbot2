"""Meeting summary endpoint (LLM via Ollama)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import llm

router = APIRouter(tags=["summarize"])


class SummarizeRequest(BaseModel):
    transcript: str = Field(..., min_length=1, description="Full call transcript")


class SummarizeResponse(BaseModel):
    summary: str
    action_items: list[str]


@router.post("/summarize", response_model=SummarizeResponse)
async def summarize_endpoint(req: SummarizeRequest) -> SummarizeResponse:
    """Summarize a transcript into a summary + action items."""
    try:
        result = await llm.summarize(req.transcript)
    except llm.LLMError as exc:
        # 503: the LLM backend (Ollama) is unreachable or errored.
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return SummarizeResponse(**result)
