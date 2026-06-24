"""Transcription endpoints: REST (batch) and WebSocket (live captions)."""
from __future__ import annotations

import anyio
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect

from app.services import asr

router = APIRouter(tags=["transcribe"])


@router.post("/transcribe")
async def transcribe_endpoint(
    file: UploadFile = File(...),
    language: str | None = Form(default=None),
) -> dict:
    """Transcribe an uploaded audio file (wav/ogg/webm/mp3...)."""
    audio = await file.read()
    if not audio:
        raise HTTPException(status_code=400, detail="Empty audio upload")
    try:
        # ASR is CPU-bound and blocking; run it off the event loop.
        return await anyio.to_thread.run_sync(asr.transcribe, audio, language)
    except Exception as exc:  # noqa: BLE001 - surface decode/model errors as 422
        raise HTTPException(status_code=422, detail=f"Transcription failed: {exc}") from exc


@router.websocket("/ws/transcribe")
async def transcribe_ws(websocket: WebSocket) -> None:
    """Live captions over WebSocket.

    Protocol:
      • client streams binary chunks of **raw mono PCM16 @ 16 kHz** (e.g. from
        Android ``AudioRecord``); the server accumulates them;
      • client sends the text message ``"flush"`` to request a transcription of
        everything received since the last flush;
      • server replies with JSON ``{type: "final", text, segments}``;
      • text message ``"reset"`` clears the buffer; ``"close"`` ends the session.
    """
    await websocket.accept()
    buffer = bytearray()
    try:
        while True:
            message = await websocket.receive()
            if message.get("bytes") is not None:
                buffer.extend(message["bytes"])
                continue

            text = message.get("text")
            if text in ("flush", "close") and buffer:
                audio = bytes(buffer)
                buffer.clear()
                try:
                    result = await anyio.to_thread.run_sync(asr.transcribe_pcm16, audio, None)
                    await websocket.send_json({"type": "final", **result})
                except Exception as exc:  # noqa: BLE001
                    await websocket.send_json({"type": "error", "detail": str(exc)})
            elif text == "reset":
                buffer.clear()

            if text == "close":
                break
    except WebSocketDisconnect:
        pass
