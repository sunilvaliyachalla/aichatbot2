import SwiftUI
import UIKit

/// Color palette mirroring the Android Compose theme (`ui/theme/Theme.kt`),
/// resolving differently in light vs. dark mode.
enum Palette {
    static let primary = Color(light: 0x2A6DF0, dark: 0x4C8DFF)
    static let secondary = Color(light: 0x12A37E, dark: 0x2BD9A8)
    static let error = Color(light: 0xD93544, dark: 0xFF4C5B)
}

extension Color {
    /// Builds a dynamic color from light/dark hex RGB literals, matching the
    /// Android `lightColorScheme`/`darkColorScheme` pairs.
    init(light: UInt32, dark: UInt32) {
        self = Color(UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(rgb: dark) : UIColor(rgb: light)
        })
    }
}

private extension UIColor {
    convenience init(rgb: UInt32) {
        self.init(
            red: CGFloat((rgb >> 16) & 0xFF) / 255.0,
            green: CGFloat((rgb >> 8) & 0xFF) / 255.0,
            blue: CGFloat(rgb & 0xFF) / 255.0,
            alpha: 1.0
        )
    }
}
