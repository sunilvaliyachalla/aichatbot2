# Keep WebRTC classes (they are accessed via JNI).
-keep class org.webrtc.** { *; }

# Socket.IO / Engine.IO rely on reflection in places.
-keep class io.socket.** { *; }
-dontwarn io.socket.**
