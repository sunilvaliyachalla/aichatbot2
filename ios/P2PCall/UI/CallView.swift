import SwiftUI
import WebRTC

/// Active-call screen: remote video, local preview thumbnail, live caption
/// overlay, AI controls, and the mic/cam/end controls. Mirrors Android's
/// `CallScreen`.
struct CallView: View {
    @ObservedObject var vm: CallViewModel

    @State private var showAsk = false
    @State private var question = ""

    private var state: CallState { vm.state }

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Text(state.status.label)
                    .foregroundColor(Palette.secondary)
                Spacer()
                if let room = state.roomId {
                    Text("Room: \(room)")
                }
            }
            .padding(.vertical, 8)

            videoArea

            if state.aiAvailable {
                aiControls
            }

            controls
        }
        .padding(12)
        .alert("Ask about this call", isPresented: $showAsk) {
            TextField("Your question", text: $question)
            Button("Ask") {
                vm.ask(question)
                question = ""
            }
            .disabled(question.trimmingCharacters(in: .whitespaces).isEmpty)
            Button("Cancel", role: .cancel) { }
        }
        .alert("Answer", isPresented: answerBinding) {
            Button("Close") { vm.dismissAnswer() }
        } message: {
            Text(state.answer ?? "")
        }
        .alert("Call summary", isPresented: summaryBinding) {
            Button("Close") { vm.dismissSummary() }
        } message: {
            Text(summaryMessage)
        }
    }

    // MARK: - Sections

    private var videoArea: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.black)

            if let remote = vm.remoteTrack {
                RTCVideoView(track: remote, mirror: false)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
            } else {
                Text(state.status.label)
                    .foregroundColor(.white)
            }

            // Live caption overlay (original + optional translation).
            if state.captionsEnabled && !state.caption.isEmpty {
                VStack {
                    Spacer()
                    VStack(alignment: .leading, spacing: 2) {
                        Text(state.caption)
                            .foregroundColor(.white)
                        if !state.captionTranslation.isEmpty {
                            Text(state.captionTranslation)
                                .foregroundColor(Palette.secondary)
                                .fontWeight(.medium)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color.black.opacity(0.6))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .padding(.bottom, 24)
                    .padding(.horizontal, 16)
                }
            }

            // Local preview thumbnail.
            if let local = vm.localTrack {
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        RTCVideoView(track: local, mirror: true)
                            .frame(width: 110, height: 160)
                            .background(Color(.darkGray))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .padding(16)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var aiControls: some View {
        HStack(spacing: 12) {
            Button(state.captionsEnabled ? "Captions: On" : "Captions: Off") {
                vm.toggleCaptions()
            }
            .frame(maxWidth: .infinity)

            Button("Translate: \(state.captionLanguage ?? "Off")") {
                vm.cycleCaptionLanguage()
            }
            .frame(maxWidth: .infinity)
            .disabled(!state.captionsEnabled)

            Button(state.summarizing ? "Summarizing…" : "Summarize") {
                vm.requestSummary()
            }
            .frame(maxWidth: .infinity)
            .disabled(state.summarizing)

            Button(state.asking ? "Asking…" : "Ask") {
                showAsk = true
            }
            .frame(maxWidth: .infinity)
            .disabled(state.asking)
        }
        .buttonStyle(.bordered)
        .font(.footnote)
    }

    private var controls: some View {
        HStack(spacing: 12) {
            Button(state.micEnabled ? "Mute" : "Unmute") {
                vm.toggleMic()
            }
            .frame(maxWidth: .infinity)
            .buttonStyle(.borderedProminent)
            .tint(Palette.primary)

            Button(state.cameraEnabled ? "Cam off" : "Cam on") {
                vm.toggleCamera()
            }
            .frame(maxWidth: .infinity)
            .buttonStyle(.borderedProminent)
            .tint(Palette.primary)

            Button("End") {
                vm.hangup()
            }
            .frame(maxWidth: .infinity)
            .buttonStyle(.borderedProminent)
            .tint(Palette.error)
        }
    }

    // MARK: - Bindings / helpers

    private var answerBinding: Binding<Bool> {
        Binding(get: { state.answer != nil }, set: { if !$0 { vm.dismissAnswer() } })
    }

    private var summaryBinding: Binding<Bool> {
        Binding(get: { state.summary != nil }, set: { if !$0 { vm.dismissSummary() } })
    }

    private var summaryMessage: String {
        guard let summary = state.summary else { return "" }
        if state.actionItems.isEmpty { return summary }
        let items = state.actionItems.map { "• \($0)" }.joined(separator: "\n")
        return summary + "\n\nAction items\n" + items
    }
}
