# AI Server (FastAPI)

AI side-channel for the video-call app. Implements the first AI features from
[`../AI_ROADMAP.md`](../AI_ROADMAP.md):

- **Live captions** — speech-to-text via `faster-whisper` (REST + WebSocket).
- **Meeting summary & action items** — LLM via **Ollama** (OpenAI-compatible,
  local; no proprietary API key).

It does **not** touch signaling or WebRTC media — clients send audio/transcripts
to this service over a separate channel and receive captions/summaries back.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Status + configured models |
| `POST` | `/transcribe` | Transcribe an uploaded audio *file* (multipart `file`, optional `language`) |
| `WS` | `/ws/transcribe` | Live captions: stream raw **PCM16 @ 16 kHz** chunks, send text `flush` to get `{type:"final", text, segments}`; `reset` clears, `close` ends |
| `POST` | `/summarize` | `{ "transcript": "..." }` → `{ "summary", "action_items": [] }` (uses Ollama) |

## Setup

```bash
cd ai-server
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

### Ollama (for /summarize)

```bash
# Install from https://ollama.com, then:
ollama pull llama3.1        # or any model; set OLLAMA_MODEL to match
ollama serve                # exposes OpenAI-compatible API on :11434
```

Point at a different model/host via `OLLAMA_MODEL` / `OLLAMA_BASE_URL`.

## Run

```bash
uvicorn app.main:app --reload --port 8000
curl http://localhost:8000/health
```

The Android app reaches this at `http://10.0.2.2:8000` from the emulator (set
`AI_SERVER_URL` in `android/gradle.properties` or `local.properties`).

## Test

```bash
pip install -r requirements-dev.txt
pytest -q          # ASR and the LLM call are mocked — no model download needed
```

## Notes

- `faster-whisper` downloads the chosen model on first transcription. Pick a
  smaller `WHISPER_MODEL` (`tiny`/`base`) for CPU; larger for GPU.
- The `/ws/transcribe` stream expects raw mono PCM16 @ 16 kHz, which matches
  Android `AudioRecord`. The `/transcribe` upload accepts any container ffmpeg
  can decode.
- Production: add auth + rate limiting to these endpoints, and serve over
  HTTPS/WSS.
