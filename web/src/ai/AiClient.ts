/**
 * REST client for the FastAPI ai-server's LLM features (Ollama-backed).
 * Mirrors the Android AiSummaryClient / AiQaClient. Pure fetch; the caller
 * handles loading/errors in the UI.
 */

export interface CallSummary {
  summary: string;
  actionItems: string[];
}

async function postJson(url: string, body: unknown): Promise<unknown> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Request failed (${resp.status}): ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

/** Summarize a transcript into a paragraph + action items (`/summarize`). */
export async function summarize(
  url: string,
  transcript: string
): Promise<CallSummary> {
  const obj = (await postJson(url, { transcript })) as {
    summary?: string;
    action_items?: string[];
  };
  return { summary: obj.summary ?? "", actionItems: obj.action_items ?? [] };
}

/** Ask a question grounded in the transcript (`/ask`). */
export async function ask(
  url: string,
  transcript: string,
  question: string
): Promise<string> {
  const obj = (await postJson(url, { transcript, question })) as {
    answer?: string;
  };
  return obj.answer ?? "";
}
