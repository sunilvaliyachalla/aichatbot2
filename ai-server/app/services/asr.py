"""Speech-to-text using faster-whisper.

The model is heavy and imported lazily so the rest of the app (and the test
suite) can run without the dependency installed. Call ``transcribe`` with the
bytes of an audio container (wav/ogg/webm/mp3 — anything ffmpeg/av can decode).
"""
from __future__ import annotations

import io
from typing import Any, Optional

from app.config import get_settings

# Cached model instance (lazy). Loading is expensive, so do it once.
_model: Any = None


def get_model() -> Any:
    """Load (once) and return the faster-whisper model."""
    global _model
    if _model is None:
        # Imported here so importing this module never requires faster-whisper.
        from faster_whisper import WhisperModel  # type: ignore

        s = get_settings()
        _model = WhisperModel(
            s.whisper_model,
            device=s.whisper_device,
            compute_type=s.whisper_compute_type,
        )
    return _model


def _format(segments_iter: Any, info: Any, lang: Optional[str]) -> dict:
    segments = [
        {"start": round(seg.start, 3), "end": round(seg.end, 3), "text": seg.text.strip()}
        for seg in segments_iter
    ]
    text = " ".join(seg["text"] for seg in segments).strip()
    return {
        "text": text,
        "language": getattr(info, "language", lang),
        "segments": segments,
    }


def transcribe(audio: bytes, language: Optional[str] = None) -> dict:
    """Transcribe an audio *container* (wav/ogg/webm/mp3...) to text.

    Returns ``{text, language, segments: [{start, end, text}]}``.
    """
    s = get_settings()
    lang = language or s.default_language or None
    model = get_model()
    segments_iter, info = model.transcribe(io.BytesIO(audio), language=lang)
    return _format(segments_iter, info, lang)


def transcribe_pcm16(
    pcm: bytes, language: Optional[str] = None, sample_rate: int = 16000
) -> dict:
    """Transcribe raw mono PCM16 (little-endian) audio, e.g. from Android's
    ``AudioRecord``. Whisper expects 16 kHz; resampling is the caller's job.
    """
    import numpy as np  # local import; numpy ships with faster-whisper

    s = get_settings()
    lang = language or s.default_language or None
    # PCM16 -> float32 normalized to [-1, 1].
    audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
    model = get_model()
    segments_iter, info = model.transcribe(audio, language=lang)
    return _format(segments_iter, info, lang)
