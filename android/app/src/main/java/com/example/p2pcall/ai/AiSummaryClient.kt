package com.example.p2pcall.ai

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Result of a meeting summary request. */
data class CallSummary(val summary: String, val actionItems: List<String>)

/**
 * REST client for end-of-call summaries. Posts the accumulated transcript to
 * the FastAPI AI server (`/summarize`), which uses the local Ollama LLM.
 */
class AiSummaryClient(private val summaryUrl: String) {
    private val httpClient = OkHttpClient.Builder()
        .callTimeout(90, TimeUnit.SECONDS)
        .build()

    /** Blocking call; invoke from a background coroutine/dispatcher. */
    fun summarize(transcript: String): CallSummary {
        val body = JSONObject().put("transcript", transcript)
            .toString()
            .toRequestBody(JSON)
        val request = Request.Builder().url(summaryUrl).post(body).build()

        httpClient.newCall(request).execute().use { resp ->
            val text = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) {
                throw RuntimeException("Summary failed (${resp.code}): $text")
            }
            val obj = JSONObject(text)
            return CallSummary(
                summary = obj.optString("summary"),
                actionItems = obj.optJSONArray("action_items").toStringList(),
            )
        }
    }

    private fun JSONArray?.toStringList(): List<String> {
        if (this == null) return emptyList()
        return (0 until length()).map { getString(it) }
    }

    private companion object {
        val JSON = "application/json; charset=utf-8".toMediaType()
    }
}
