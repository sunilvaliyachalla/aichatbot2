package com.example.p2pcall.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColors = darkColorScheme(
    primary = Color(0xFF4C8DFF),
    secondary = Color(0xFF2BD9A8),
    error = Color(0xFFFF4C5B),
)

private val LightColors = lightColorScheme(
    primary = Color(0xFF2A6DF0),
    secondary = Color(0xFF12A37E),
    error = Color(0xFFD93544),
)

@Composable
fun P2PCallTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) DarkColors else LightColors,
        content = content,
    )
}
