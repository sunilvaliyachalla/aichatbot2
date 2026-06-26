import SwiftUI

/// Lobby / join screen. Mirrors Android's `LobbyScreen`.
struct LobbyView: View {
    let error: String?
    let onJoin: (String) -> Void

    @State private var roomId = ""

    var body: some View {
        VStack(spacing: 16) {
            Spacer()

            Text("P2P Video Call")
                .font(.title)
                .fontWeight(.semibold)

            Text("Share a room ID with one other person to start a 1:1 call.")
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)

            TextField("Room ID", text: $roomId)
                .textFieldStyle(.roundedBorder)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .submitLabel(.done)
                .onSubmit { onJoin(roomId) }

            HStack(spacing: 12) {
                Button {
                    roomId = String(Int.random(in: 100000...999999))
                } label: {
                    Text("Random ID").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)

                Button {
                    onJoin(roomId)
                } label: {
                    Text("Join / Create").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(Palette.primary)
            }

            if let error = error {
                Text(error)
                    .foregroundColor(Palette.error)
                    .multilineTextAlignment(.center)
            }

            Spacer()
        }
        .padding(24)
    }
}
