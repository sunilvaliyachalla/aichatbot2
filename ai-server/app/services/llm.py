"""LLM access via an Ollama server (OpenAI-compatible API).

Uses the ``/v1/chat/completions`` endpoint that Ollama exposes, so the same code
works against Ollama locally or any OpenAI-compatible gateway by changing
``OLLAMA_BASE_URL`` / ``OLLAMA_MODEL``. No proprietary API key is required.
"""
from __future__ import annotations

import json
import re
from typing import Optional

import httpx

from app.config import get_settings


class LLMError(RuntimeError):
    """Raised when the LLM backend is unreachable or returns an error."""


async def chat(messages: list[dict], model: Optional[str] = None) -> str:
    """Send a chat completion request to Ollama and return the message text."""
    s = get_settings()
    url = f"{s.ollama_base_url.rstrip('/')}/v1/chat/completions"
    payload = {
        "model": model or s.ollama_model,
        "messages": messages,
        "stream": False,
        "temperature": 0.2,
    }
    try:
        async with httpx.AsyncClient(timeout=s.llm_timeout_seconds) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as exc:  # network / status errors
        raise LLMError(f"LLM request failed: {exc}") from exc

    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise LLMError(f"Unexpected LLM response: {data}") from exc


_SUMMARY_SYSTEM = (
    "You are a meeting assistant. Given a call transcript, produce a concise "
    "summary and a list of concrete action items. Respond ONLY with JSON of the "
    'form {"summary": string, "action_items": string[]}. No prose, no markdown.'
)


def _extract_json(text: str) -> dict:
    """Best-effort parse of a JSON object from an LLM response."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass
    # Fallback: treat the whole thing as the summary.
    return {"summary": text.strip(), "action_items": []}


async def summarize(transcript: str) -> dict:
    """Summarize a transcript into ``{summary, action_items}``."""
    content = await chat(
        [
            {"role": "system", "content": _SUMMARY_SYSTEM},
            {"role": "user", "content": f"Transcript:\n{transcript}"},
        ]
    )
    parsed = _extract_json(content)
    summary = str(parsed.get("summary", "")).strip()
    items = parsed.get("action_items", [])
    if not isinstance(items, list):
        items = []
    action_items = [str(i).strip() for i in items if str(i).strip()]
    return {"summary": summary, "action_items": action_items}


def _translate_system(target_lang: str) -> str:
    return (
        f"You are a translator. Translate the user's text into {target_lang}. "
        "Respond with ONLY the translation — no quotes, no notes, no original text."
    )


async def translate(text: str, target_lang: str) -> str:
    """Translate ``text`` into ``target_lang`` (a language name or code)."""
    content = await chat(
        [
            {"role": "system", "content": _translate_system(target_lang)},
            {"role": "user", "content": text},
        ]
    )
    return content.strip()


async def answer_question(transcript: str, question: str) -> str:
    """Answer a question grounded in the call transcript (context-stuffed)."""
    system = (
        "You answer questions about a meeting using ONLY the provided transcript. "
        "If the answer isn't in the transcript, say you don't know. Be concise."
    )
    content = await chat(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": f"Transcript:\n{transcript}\n\nQuestion: {question}"},
        ]
    )
    return content.strip()


_CHAPTERS_SYSTEM = (
    "You split a meeting transcript into topical chapters. Respond ONLY with JSON "
    'of the form {"chapters": [{"title": string, "summary": string}]}. No prose.'
)


async def chapters(transcript: str) -> list[dict]:
    """Break a transcript into topical chapters ``[{title, summary}]``."""
    content = await chat(
        [
            {"role": "system", "content": _CHAPTERS_SYSTEM},
            {"role": "user", "content": f"Transcript:\n{transcript}"},
        ]
    )
    parsed = _extract_json(content)
    items = parsed.get("chapters", []) if isinstance(parsed, dict) else []
    if not isinstance(items, list):
        return []
    result = []
    for it in items:
        if isinstance(it, dict):
            title = str(it.get("title", "")).strip()
            summary = str(it.get("summary", "")).strip()
            if title or summary:
                result.append({"title": title, "summary": summary})
    return result


_MODERATION_SYSTEM = (
    "You are a content moderation classifier. Decide if the text contains "
    "harassment, hate, sexual, violence, or self-harm content. Respond ONLY with "
    'JSON {"flagged": boolean, "categories": string[], "reason": string}.'
)


async def moderate(text: str) -> dict:
    """Classify ``text`` for unsafe content -> ``{flagged, categories, reason}``."""
    content = await chat(
        [
            {"role": "system", "content": _MODERATION_SYSTEM},
            {"role": "user", "content": text},
        ]
    )
    parsed = _extract_json(content)
    flagged = bool(parsed.get("flagged", False)) if isinstance(parsed, dict) else False
    cats = parsed.get("categories", []) if isinstance(parsed, dict) else []
    if not isinstance(cats, list):
        cats = []
    categories = [str(c).strip() for c in cats if str(c).strip()]
    reason = str(parsed.get("reason", "")).strip() if isinstance(parsed, dict) else ""
    return {"flagged": flagged, "categories": categories, "reason": reason}
