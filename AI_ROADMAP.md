# AI Roadmap — FastAPI + Android

AI capabilities that can be added to this video-call app using **only a Python
FastAPI backend and the Android client** (the existing Node.js service stays a
pure WebRTC signaling relay). This document lists the realistic AI "facilities,"
where each runs, the models/libraries to use, the data flow, and a phased plan.

> Scope note: media stays peer-to-peer over WebRTC. AI features add a **side
> channel** — Android sends audio chunks / transcripts / frames to the FastAPI
> service, which returns results (captions, summaries, etc.). This never
> replaces the P2P media path.

---

## 1. Where AI runs

| Tier | Runs on | Good for | Examples |
| --- | --- | --- | --- |
| **On-device (Android)** | Phone NPU/GPU/CPU | Low latency, privacy, no upload | Background blur, face/landmark detection, on-device wake word, light noise suppression |
| **FastAPI server** | Your backend (CPU/GPU) | Heavy models, LLMs, cross-call analytics | Transcription (ASR), translation, summaries, diarization, moderation, RAG Q&A |

On-device uses **ML Kit / MediaPipe / TFLite**. The server hosts open models
(e.g. Whisper) and/or calls hosted LLM APIs (Ollama).

---

## 2. Proposed component: `ai-server/` (FastAPI)

A new, independent service — does **not** touch signaling or media relay.

```
android app ──(audio chunks / transcript / frames)──▶  FastAPI  ──▶  AI models
     ▲                                                    │            • Whisper (ASR)
     └──────────(captions / summary / alerts)─────────────┘            • Ollama (LLM)
                  REST for batch, WebSocket for streaming               • diarization, etc.
```

Suggested layout:

```
ai-server/
├── app/
│   ├── main.py            # FastAPI app + routers
│   ├── config.py          # env-based config (model paths, API keys)
│   ├── routers/
│   │   ├── transcribe.py  # POST /transcribe, WS /stream/transcribe
│   │   ├── summarize.py   # POST /summarize  (LLM)
│   │   ├── translate.py   # POST /translate  (LLM or NMT)
│   │   └── moderate.py    # POST /moderate
│   └── services/
│       ├── asr.py         # faster-whisper wrapper
│       ├── llm.py         # Ollama API client
│       └── diarize.py     # speaker diarization
├── requirements.txt       # fastapi, uvicorn, faster-whisper, httpx, ...
└── .env.example           # OLLAMA_BASE_URL=, OLLAMA_MODEL=, WHISPER_MODEL=base, ...
```

Transport choices:
- **WebSocket** (`/ws/...`) for streaming/low-latency (live captions).
- **REST** for request/response (summary at call end, translate a line).

LLM features use a **local Ollama** server via its OpenAI-compatible API
(`/v1/chat/completions`), so there are no proprietary keys and data stays local
— configurable with `OLLAMA_BASE_URL` / `OLLAMA_MODEL` (e.g. `llama3.1`).
Because the endpoint is OpenAI-compatible, swapping in a hosted gateway later is
a config change only. Use streaming responses for anything shown live.

---

## 3. AI facilities (what to implement)

### A. Speech & language (server, FastAPI)

| Facility | How | Model / lib | Latency |
| --- | --- | --- | --- |
| **Live transcription / captions** | Android streams 16 kHz PCM over WS; server runs streaming ASR; emits partial+final text | `faster-whisper` (or `whisper.cpp`) | ~0.5–2 s |
| **Live translation captions** | Pipe ASR text → translate per utterance | Ollama, or NLLB/Marian (offline) | +0.3–1 s |
| **Meeting summary & action items** | Buffer transcript; at end (or every N min) summarize | Ollama (local LLM) | batch |
| **Speaker diarization ("who spoke")** | Segment audio by speaker; label transcript | `pyannote.audio` | batch/near-RT |
| **Topic detection / chapters** | LLM over transcript → timestamped sections | Ollama | batch |
| **Q&A over the meeting (RAG)** | Embed transcript chunks; answer questions | embeddings + Ollama | on demand |
| **Sentiment / tone** | Classify utterances | small classifier or Ollama | near-RT |

### B. Audio enhancement

| Facility | Where | Lib |
| --- | --- | --- |
| **Noise suppression** | On-device (preferred) or server | WebRTC NS / RNNoise; or `df`/DeepFilterNet on server |
| **Auto-gain / VAD (voice activity)** | On-device | WebRTC VAD, Silero VAD |
| **Wake word / voice commands** ("mute me") | On-device | Porcupine / TFLite KWS |

### C. Vision (mostly on-device Android)

| Facility | Where | Lib |
| --- | --- | --- |
| **Background blur / virtual background** | On-device | MediaPipe Selfie Segmentation |
| **Face / landmark / gaze detection** | On-device | ML Kit Face Detection / MediaPipe |
| **Auto-framing ("follow speaker")** | On-device | MediaPipe + crop transform |
| **Gesture shortcuts** (👍 to react) | On-device | MediaPipe Hands |
| **Low-light enhancement** | On-device or server | TFLite model |

### D. Safety & ops (server)

| Facility | How | Model |
| --- | --- | --- |
| **Content / toxicity moderation** | Run on transcript stream; flag/alert | Ollama or a moderation classifier |
| **PII redaction in transcripts** | NER + mask before storage | spaCy / Presidio |
| **Call analytics** (talk-time, sentiment trend) | Aggregate per call | server logic + LLM |

---

## 4. Reference data flow (live captions example)

```
Android: AudioRecord (16kHz mono PCM)
   └─ chunk every ~250 ms ─▶ WS  ws://ai-server/ws/transcribe
                                   └─ faster-whisper streaming
                                        └─ {partial|final, text, ts} ─▶ Android
Android: overlay captions on CallScreen (Compose), optional translate toggle
At call end: POST /summarize {transcript} ─▶ Ollama ─▶ summary + action items
```

Privacy: make AI **opt-in per call**, show an "AI on" indicator to both
parties, and prefer on-device for anything that can run locally.

---

## 5. Phased plan

| Phase | Deliverable | Components | Status |
| --- | --- | --- | --- |
| **0 — Scaffold** | `ai-server/` FastAPI skeleton, `/health`, env config, Android HTTP/WS client + opt-in toggle | FastAPI, Android | ✅ done |
| **1 — Captions** | Live transcription over WebSocket + on-screen captions | faster-whisper, Compose overlay | ✅ done |
| **2 — Summaries** | End-of-call summary + action items | **Ollama** (local, OpenAI-compatible) | ✅ done |
| **3 — Translation** | Toggle translated captions (live, via captions WS + `/translate`) | Ollama / NLLB | ✅ done |
| **4 — On-device polish** | Background blur, noise suppression, VAD | MediaPipe, WebRTC NS | planned |
| **5 — Intelligence** | Q&A, topic chapters, moderation done (`/ask`, `/chapters`, `/moderate`); diarization still planned | pyannote, embeddings, Ollama | 🟡 partial |
| **6 — Hardening** | Auth on AI endpoints, rate limits, PII redaction, GPU autoscale | FastAPI middleware, infra | planned |

---

## 6. Tech checklist

- **FastAPI** + **Uvicorn** (ASGI); WebSocket for streaming, REST for batch.
- **ASR:** `faster-whisper` (CTranslate2) — runs on CPU, much faster on GPU.
- **LLM:** local **Ollama** via its OpenAI-compatible API (`httpx`); pick the
  model with `OLLAMA_MODEL` by latency/quality (small models for high-volume
  captions/translation, larger for summaries/analysis). OpenAI-compatible, so a
  hosted gateway can replace it via config only.
- **Diarization:** `pyannote.audio`. **Embeddings/RAG:** a vector store +
  Ollama for answers.
- **Android:** `AudioRecord` for raw PCM, OkHttp WebSocket to FastAPI, MediaPipe
  Tasks / ML Kit / TFLite for on-device vision & audio.
- **Ops:** API-key auth on AI endpoints, per-user rate limiting, GPU batching,
  and clear consent/indicators for recording & AI processing.
