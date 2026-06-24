import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Read overridable config from gradle.properties, with local.properties winning.
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun cfg(key: String, default: String = ""): String =
    (localProps.getProperty(key) ?: project.findProperty(key) as String?) ?: default

android {
    namespace = "com.example.p2pcall"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.example.p2pcall"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"

        // Environment-based configuration surfaced via BuildConfig.
        buildConfigField("String", "SIGNALING_URL", "\"${cfg("SIGNALING_URL", "http://10.0.2.2:4000")}\"")
        buildConfigField("String", "STUN_URLS", "\"${cfg("STUN_URLS", "stun:stun.l.google.com:19302")}\"")
        buildConfigField("String", "TURN_URL", "\"${cfg("TURN_URL")}\"")
        buildConfigField("String", "TURN_USERNAME", "\"${cfg("TURN_USERNAME")}\"")
        buildConfigField("String", "TURN_CREDENTIAL", "\"${cfg("TURN_CREDENTIAL")}\"")
        buildConfigField("String", "AI_SERVER_URL", "\"${cfg("AI_SERVER_URL")}\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
    }
    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.06.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.9.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.2")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.2")

    // Maintained WebRTC distribution (exposes the standard org.webrtc.* API).
    implementation("io.getstream:stream-webrtc-android:1.1.1")

    // Socket.IO client for the signaling layer.
    implementation("io.socket:socket.io-client:2.1.0")

    // HTTP + WebSocket client for the AI side-channel (captions/summary).
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
