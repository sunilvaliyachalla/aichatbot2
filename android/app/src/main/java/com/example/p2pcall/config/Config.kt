package com.example.p2pcall.config

import com.example.p2pcall.BuildConfig
import org.webrtc.PeerConnection.IceServer

/**
 * Environment-based configuration sourced from BuildConfig (populated from
 * gradle.properties / local.properties). See android/gradle.properties.
 */
object Config {
    val signalingUrl: String = BuildConfig.SIGNALING_URL

    /** Builds the ICE server list: STUN by default, TURN only when configured. */
    fun iceServers(): List<IceServer> {
        val servers = mutableListOf<IceServer>()

        BuildConfig.STUN_URLS.split(",")
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .forEach { servers.add(IceServer.builder(it).createIceServer()) }

        val turnUrl = BuildConfig.TURN_URL.trim()
        val turnUser = BuildConfig.TURN_USERNAME.trim()
        val turnCred = BuildConfig.TURN_CREDENTIAL.trim()
        if (turnUrl.isNotEmpty() && turnUser.isNotEmpty() && turnCred.isNotEmpty()) {
            servers.add(
                IceServer.builder(turnUrl)
                    .setUsername(turnUser)
                    .setPassword(turnCred)
                    .createIceServer()
            )
        }
        return servers
    }
}
