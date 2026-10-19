import UIKit
import Capacitor

/// Registers the app's own native plugins with Capacitor.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(GameCenterPlugin())
    }
}
