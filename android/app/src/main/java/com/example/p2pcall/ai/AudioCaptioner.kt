package com.example.p2pcall.ai

import android.Manifest
import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import androidx.annotation.RequiresPermission
import kotlin.concurrent.thread

/**
 * Captures microphone audio as 16 kHz mono PCM16 and streams it to an
 * [AiCaptionClient], flushing every [flushIntervalMs] to get incremental
 * captions.
 *
 * Note: this opens its own [AudioRecord] on the mic. On some devices the OS
 * does not allow a second capture while WebRTC is using the mic; in that case
 * prefer tapping WebRTC's audio samples (JavaAudioDeviceModule
 * SamplesReadyCallback). Captions are opt-in so this only runs on demand.
 */
class AudioCaptioner(
    private val client: AiCaptionClient,
    private val flushIntervalMs: Long = 3000L,
) {
    @Volatile private var running = false
    private var worker: Thread? = null

    @SuppressLint("MissingPermission")
    @RequiresPermission(Manifest.permission.RECORD_AUDIO)
    fun start() {
        if (running) return
        running = true
        client.connect()

        worker = thread(name = "AudioCaptioner") {
            val minBuf = AudioRecord.getMinBufferSize(
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
            )
            val bufferSize = maxOf(minBuf, SAMPLE_RATE) // ~1s headroom
            val record = AudioRecord(
                MediaRecorder.AudioSource.VOICE_COMMUNICATION,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                bufferSize,
            )
            if (record.state != AudioRecord.STATE_INITIALIZED) {
                Log.e(TAG, "AudioRecord failed to initialize")
                record.release()
                return@thread
            }

            val chunk = ByteArray(2048)
            var lastFlush = System.currentTimeMillis()
            try {
                record.startRecording()
                while (running) {
                    val read = record.read(chunk, 0, chunk.size)
                    if (read > 0) client.sendPcm(chunk, read)
                    val now = System.currentTimeMillis()
                    if (now - lastFlush >= flushIntervalMs) {
                        client.flush()
                        lastFlush = now
                    }
                }
                client.flush() // final flush on stop
            } catch (e: Exception) {
                Log.e(TAG, "capture loop error", e)
            } finally {
                runCatching { record.stop() }
                record.release()
            }
        }
    }

    fun stop() {
        running = false
        worker?.join(500)
        worker = null
        client.close()
    }

    private companion object {
        const val TAG = "AudioCaptioner"
        const val SAMPLE_RATE = 16000
    }
}
