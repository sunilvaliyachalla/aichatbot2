package com.example.p2pcall.ai

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * REST client for meeting Q&A. Posts the transcript + a question to the FastAPI
 * AI server (`/ask`), which answers using the local Ollama LLM.
 */
class AiQaClient(private val askUrl: String) {
    private val httpClient = OkHttpClient.Builder()
        .callTimeout(90, TimeUnit.SECONDS)
        .build()

    /** Blocking call; invoke from a background coroutine/dispatcher. */
    fun ask(transcript: String, question: String): String {
        val body = JSONObject()
            .put("transcript", transcript)
            .put("question", question)
            .toString()
            .toRequestBody(JSON)
        val request = Request.Builder().url(askUrl).post(body).build()

        httpClient.newCall(request).execute().use { resp ->
            val text = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) {
                throw RuntimeException("Ask failed (${resp.code}): $text")
            }
            return JSONObject(text).optString("answer")
        }
    }

    private companion object {
        val JSON = "application/json; charset=utf-8".toMediaType()
    }
}
