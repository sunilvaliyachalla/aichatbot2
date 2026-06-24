"""Transcription endpoints: REST (batch) and WebSocket (live captions)."""
from __future__ import annotations

import anyio
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect

from app.services import asr, llm

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
      • text ``"lang:<code>"`` enables live translation of captions into that
        language (the reply then also carries ``translation`` + ``target_lang``);
        ``"lang:off"`` (or empty) disables it;
      • text message ``"reset"`` clears the buffer; ``"close"`` ends the session.
    """
    await websocket.accept()
    buffer = bytearray()
    target_lang: str | None = None
    try:
        while True:
            message = await websocket.receive()
            if message.get("bytes") is not None:
                buffer.extend(message["bytes"])
                continue

            text = message.get("text")
            if isinstance(text, str) and text.startswith("lang:"):
                value = text[len("lang:"):].strip()
                target_lang = None if value in ("", "off") else value
                continue

            if text in ("flush", "close") and buffer:
                audio = bytes(buffer)
                buffer.clear()
                try:
                    result = await anyio.to_thread.run_sync(asr.transcribe_pcm16, audio, None)
                    payload = {"type": "final", **result}
                    if target_lang and result.get("text"):
                        try:
                            payload["translation"] = await llm.translate(result["text"], target_lang)
                            payload["target_lang"] = target_lang
                        except llm.LLMError:
                            pass  # captions still work if translation is unavailable
                    await websocket.send_json(payload)
                except Exception as exc:  # noqa: BLE001
                    await websocket.send_json({"type": "error", "detail": str(exc)})
            elif text == "reset":
                buffer.clear()

            if text == "close":
                break
    except WebSocketDisconnect:
        pass
