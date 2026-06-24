"""Functional tests for transcription. ASR is mocked so no model is downloaded."""
from app.services import asr

FAKE_RESULT = {
    "text": "hello world",
    "language": "en",
    "segments": [{"start": 0.0, "end": 1.0, "text": "hello world"}],
}


def test_transcribe_returns_text(client, monkeypatch):
    monkeypatch.setattr(asr, "transcribe", lambda audio, language=None: FAKE_RESULT)

    resp = client.post(
        "/transcribe",
        files={"file": ("clip.wav", b"RIFFfakeaudio", "audio/wav")},
        data={"language": "en"},
    )
    assert resp.status_code == 200
    assert resp.json() == FAKE_RESULT


def test_transcribe_rejects_empty_upload(client):
    resp = client.post("/transcribe", files={"file": ("clip.wav", b"", "audio/wav")})
    assert resp.status_code == 400


def test_transcribe_surfaces_failure_as_422(client, monkeypatch):
    def boom(audio, language=None):
        raise RuntimeError("bad audio")

    monkeypatch.setattr(asr, "transcribe", boom)
    resp = client.post(
        "/transcribe",
        files={"file": ("clip.wav", b"data", "audio/wav")},
    )
    assert resp.status_code == 422


def test_ws_live_captions(client, monkeypatch):
    monkeypatch.setattr(asr, "transcribe_pcm16", lambda pcm, language=None: FAKE_RESULT)

    with client.websocket_connect("/ws/transcribe") as ws:
        ws.send_bytes(b"chunk-1")
        ws.send_bytes(b"chunk-2")
        ws.send_text("flush")
        msg = ws.receive_json()
        assert msg["type"] == "final"
        assert msg["text"] == "hello world"
        ws.send_text("close")
