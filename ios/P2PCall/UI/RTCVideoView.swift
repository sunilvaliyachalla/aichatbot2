import SwiftUI
import WebRTC

/// Bridges a WebRTC `RTCVideoTrack` to SwiftUI via `RTCMTLVideoView` (Metal),
/// with lifecycle-safe sink add/remove. The iOS counterpart to the Android
/// `SurfaceViewRenderer` bridge in `CallScreen.kt`.
struct RTCVideoView: UIViewRepresentable {
    let track: RTCVideoTrack
    var mirror: Bool = false

    func makeUIView(context: Context) -> RTCMTLVideoView {
        let view = RTCMTLVideoView()
        view.videoContentMode = .scaleAspectFill
        view.clipsToBounds = true
        // Mirror the local preview horizontally (front camera selfie view).
        if mirror {
            view.transform = CGAffineTransform(scaleX: -1, y: 1)
        }
        track.add(view)
        context.coordinator.renderer = view
        context.coordinator.track = track
        return view
    }

    func updateUIView(_ uiView: RTCMTLVideoView, context: Context) {
        // Re-bind if the track instance changed (e.g. remote peer re-joined).
        if context.coordinator.track !== track {
            context.coordinator.track?.remove(uiView)
            track.add(uiView)
            context.coordinator.track = track
        }
    }

    static func dismantleUIView(_ uiView: RTCMTLVideoView, coordinator: Coordinator) {
        coordinator.track?.remove(uiView)
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var renderer: RTCMTLVideoView?
        weak var track: RTCVideoTrack?
    }
}
