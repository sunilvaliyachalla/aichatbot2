pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // JitPack is used by some WebRTC distributions; harmless to keep.
        maven { url = uri("https://jitpack.io") }
    }
}

rootProject.name = "P2PCall"
include(":app")
