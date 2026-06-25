"""Tests for translation (REST + live-caption WS). The Ollama call is mocked."""
from app.services import asr, llm


def test_translate_endpoint(client, monkeypatch):
    async def fake_chat(messages, model=None):
        return "Hola mundo"

    monkeypatch.setattr(llm, "chat", fake_chat)

    resp = client.post("/translate", json={"text": "Hello world", "target_lang": "Spanish"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["translated"] == "Hola mundo"
    assert body["target_lang"] == "Spanish"


def test_translate_requires_fields(client):
    assert client.post("/translate", json={"text": "", "target_lang": "es"}).status_code == 422
    assert client.post("/translate", json={"text": "hi", "target_lang": ""}).status_code == 422


def test_translate_llm_unreachable_returns_503(client, monkeypatch):
    async def boom(messages, model=None):
        raise llm.LLMError("connection refused")

    monkeypatch.setattr(llm, "chat", boom)
    resp = client.post("/translate", json={"text": "hi", "target_lang": "es"})
    assert resp.status_code == 503


def test_ws_captions_with_translation(client, monkeypatch):
    monkeypatch.setattr(
        asr, "transcribe_pcm16",
        lambda pcm, language=None: {"text": "hello", "language": "en", "segments": []},
    )

    async def fake_translate(text, target_lang):
        return "hola"

    monkeypatch.setattr(llm, "translate", fake_translate)

    with client.websocket_connect("/ws/transcribe") as ws:
        ws.send_text("lang:Spanish")
        ws.send_bytes(b"\x00\x01\x00\x01")
        ws.send_text("flush")
        msg = ws.receive_json()
        assert msg["type"] == "final"
        assert msg["text"] == "hello"
        assert msg["translation"] == "hola"
        assert msg["target_lang"] == "Spanish"
        ws.send_text("close")


def test_ws_translation_disabled_by_default(client, monkeypatch):
    monkeypatch.setattr(
        asr, "transcribe_pcm16",
        lambda pcm, language=None: {"text": "hello", "language": "en", "segments": []},
    )

    with client.websocket_connect("/ws/transcribe") as ws:
        ws.send_bytes(b"\x00\x01")
        ws.send_text("flush")
        msg = ws.receive_json()
        assert "translation" not in msg
        ws.send_text("close")
