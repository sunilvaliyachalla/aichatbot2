"""Phase 5 intelligence endpoints: Q&A, topic chapters, and moderation (Ollama)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import llm

router = APIRouter(tags=["intelligence"])


class AskRequest(BaseModel):
    transcript: str = Field(..., min_length=1)
    question: str = Field(..., min_length=1)


class AskResponse(BaseModel):
    answer: str


class ChaptersRequest(BaseModel):
    transcript: str = Field(..., min_length=1)


class Chapter(BaseModel):
    title: str
    summary: str


class ChaptersResponse(BaseModel):
    chapters: list[Chapter]


class ModerateRequest(BaseModel):
    text: str = Field(..., min_length=1)


class ModerateResponse(BaseModel):
    flagged: bool
    categories: list[str]
    reason: str


def _llm_guard(exc: llm.LLMError) -> HTTPException:
    return HTTPException(status_code=503, detail=str(exc))


@router.post("/ask", response_model=AskResponse)
async def ask_endpoint(req: AskRequest) -> AskResponse:
    try:
        answer = await llm.answer_question(req.transcript, req.question)
    except llm.LLMError as exc:
        raise _llm_guard(exc) from exc
    return AskResponse(answer=answer)


@router.post("/chapters", response_model=ChaptersResponse)
async def chapters_endpoint(req: ChaptersRequest) -> ChaptersResponse:
    try:
        chapters = await llm.chapters(req.transcript)
    except llm.LLMError as exc:
        raise _llm_guard(exc) from exc
    return ChaptersResponse(chapters=[Chapter(**c) for c in chapters])


@router.post("/moderate", response_model=ModerateResponse)
async def moderate_endpoint(req: ModerateRequest) -> ModerateResponse:
    try:
        result = await llm.moderate(req.text)
    except llm.LLMError as exc:
        raise _llm_guard(exc) from exc
    return ModerateResponse(**result)
