"""Tests for Phase 5 intelligence endpoints (Ollama mocked)."""
from app.services import llm

TRANSCRIPT = "A: We ship Friday. B: I'll handle the release notes."


def _mock_chat(monkeypatch, reply: str):
    async def fake_chat(messages, model=None):
        return reply

    monkeypatch.setattr(llm, "chat", fake_chat)


def test_ask_endpoint(client, monkeypatch):
    _mock_chat(monkeypatch, "We ship on Friday.")
    resp = client.post("/ask", json={"transcript": TRANSCRIPT, "question": "When do we ship?"})
    assert resp.status_code == 200
    assert resp.json()["answer"] == "We ship on Friday."


def test_ask_requires_fields(client):
    assert client.post("/ask", json={"transcript": "", "question": "x"}).status_code == 422
    assert client.post("/ask", json={"transcript": "x", "question": ""}).status_code == 422


def test_chapters_endpoint(client, monkeypatch):
    _mock_chat(
        monkeypatch,
        '{"chapters": [{"title": "Release", "summary": "Ship Friday"},'
        ' {"title": "Docs", "summary": "B writes notes"}]}',
    )
    resp = client.post("/chapters", json={"transcript": TRANSCRIPT})
    assert resp.status_code == 200
    chapters = resp.json()["chapters"]
    assert len(chapters) == 2
    assert chapters[0]["title"] == "Release"


def test_chapters_handles_non_json(client, monkeypatch):
    _mock_chat(monkeypatch, "sorry, no chapters")
    resp = client.post("/chapters", json={"transcript": TRANSCRIPT})
    assert resp.status_code == 200
    assert resp.json()["chapters"] == []


def test_moderate_flagged(client, monkeypatch):
    _mock_chat(
        monkeypatch,
        '{"flagged": true, "categories": ["harassment"], "reason": "insult"}',
    )
    resp = client.post("/moderate", json={"text": "you are awful"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["flagged"] is True
    assert body["categories"] == ["harassment"]


def test_moderate_clean(client, monkeypatch):
    _mock_chat(monkeypatch, '{"flagged": false, "categories": [], "reason": ""}')
    resp = client.post("/moderate", json={"text": "have a nice day"})
    assert resp.status_code == 200
    assert resp.json()["flagged"] is False


def test_intelligence_llm_unreachable_returns_503(client, monkeypatch):
    async def boom(messages, model=None):
        raise llm.LLMError("connection refused")

    monkeypatch.setattr(llm, "chat", boom)
    assert client.post("/ask", json={"transcript": "x", "question": "y"}).status_code == 503
    assert client.post("/chapters", json={"transcript": "x"}).status_code == 503
    assert client.post("/moderate", json={"text": "x"}).status_code == 503
