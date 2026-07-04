package com.example.p2pcall.config

import android.content.Context

/**
 * Small persistent store for user-overridable runtime settings.
 *
 * The signaling server URL can be typed on the lobby screen so the app can be
 * pointed at any private IP / LAN host / public URL without rebuilding. The
 * value survives app restarts; it falls back to the build-time default
 * ([Config.signalingUrl]) when unset.
 */
class Prefs(context: Context) {
    private val sp = context.applicationContext
        .getSharedPreferences("p2p_prefs", Context.MODE_PRIVATE)

    /** Signaling server URL, defaulting to the build-time [Config.signalingUrl]. */
    var signalingUrl: String
        get() = sp.getString(KEY_SIGNALING_URL, null)
            ?.takeIf { it.isNotBlank() }
            ?: Config.signalingUrl
        set(value) {
            val trimmed = value.trim()
            sp.edit().apply {
                if (trimmed.isEmpty()) remove(KEY_SIGNALING_URL)
                else putString(KEY_SIGNALING_URL, trimmed)
            }.apply()
        }

    /** Forget any override and revert to the build-time default. */
    fun resetSignalingUrl() {
        sp.edit().remove(KEY_SIGNALING_URL).apply()
    }

    private companion object {
        const val KEY_SIGNALING_URL = "signaling_url"
    }
}
