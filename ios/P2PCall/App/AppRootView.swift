import SwiftUI
import AVFoundation

/// Routes between the lobby and the call screen and gates joining on camera +
/// microphone permissions. Mirrors the `AppRoot` composable in Android's
/// `MainActivity`.
struct AppRootView: View {
    @StateObject private var vm = CallViewModel()

    var body: some View {
        Group {
            if inCall {
                CallView(vm: vm)
            } else {
                LobbyView(error: vm.state.error) { room in
                    requestPermissionsThenJoin(room)
                }
            }
        }
    }

    private var inCall: Bool {
        switch vm.state.status {
        case .connecting, .waiting, .connected, .reconnecting:
            return true
        default:
            return false
        }
    }

    /// Requests camera + microphone access, then joins on the main actor.
    private func requestPermissionsThenJoin(_ room: String) {
        requestAccess(.video) { camGranted in
            requestAccess(.audio) { micGranted in
                Task { @MainActor in
                    // Mirror Android: only join once both permissions are
                    // granted; otherwise stay in the lobby.
                    if camGranted && micGranted {
                        vm.join(room)
                    }
                }
            }
        }
    }

    private func requestAccess(_ type: AVMediaType, completion: @escaping (Bool) -> Void) {
        switch AVCaptureDevice.authorizationStatus(for: type) {
        case .authorized:
            completion(true)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: type, completionHandler: completion)
        default:
            completion(false)
        }
    }
}
