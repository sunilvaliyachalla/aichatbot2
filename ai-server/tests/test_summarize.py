"""Tests for the LLM summary feature. The Ollama call (llm.chat) is mocked."""
import pytest

from app.services import llm


def test_extract_json_plain():
    assert llm._extract_json('{"summary": "s", "action_items": ["a"]}') == {
        "summary": "s",
        "action_items": ["a"],
    }


def test_extract_json_embedded_in_prose():
    text = 'Here you go:\n{"summary": "done", "action_items": []}\nThanks!'
    assert llm._extract_json(text)["summary"] == "done"


def test_extract_json_fallback_to_summary():
    parsed = llm._extract_json("not json at all")
    assert parsed["summary"] == "not json at all"
    assert parsed["action_items"] == []


def test_summarize_endpoint(client, monkeypatch):
    async def fake_chat(messages, model=None):
        # The system prompt asks for JSON; emulate a compliant Ollama reply.
        return '{"summary": "Discussed the launch.", "action_items": ["Email Sam", "Ship v1"]}'

    monkeypatch.setattr(llm, "chat", fake_chat)

    resp = client.post("/summarize", json={"transcript": "A: launch tomorrow..."})
    assert resp.status_code == 200
    body = resp.json()
    assert body["summary"] == "Discussed the launch."
    assert body["action_items"] == ["Email Sam", "Ship v1"]


def test_summarize_requires_transcript(client):
    resp = client.post("/summarize", json={"transcript": ""})
    assert resp.status_code == 422  # pydantic min_length


def test_summarize_llm_unreachable_returns_503(client, monkeypatch):
    async def boom(messages, model=None):
        raise llm.LLMError("connection refused")

    monkeypatch.setattr(llm, "chat", boom)
    resp = client.post("/summarize", json={"transcript": "hello"})
    assert resp.status_code == 503
