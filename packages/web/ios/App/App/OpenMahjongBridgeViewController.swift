import Capacitor
import UIKit

/// The bridge view controller the iOS app actually runs.
///
/// Capacitor 8 discovers plugins shipped as npm packages from the
/// generated `packageClassList` in capacitor.config.json, but
/// App-target plugin classes are NOT discovered automatically —
/// `registerPluginType` is a no-op while auto-registration is on and
/// there is no runtime subclass scan. First-party plugins compiled
/// into the App target (OpenMahjongSecureSession,
/// OpenMahjongAppleSignIn, OpenMahjongGoogleSignIn) must therefore be
/// registered as instances once the bridge exists, which is what
/// `capacitorDidLoad()` is for. SceneDelegate instantiates this
/// subclass instead of a plain CAPBridgeViewController.
///
/// Any future App-target plugin (e.g. an ads bridge) registers here
/// too — one registration point, so two slices never race to wire
/// the same bridge.
///
/// Cloned from Munch's MunchBridgeViewController.
public class OpenMahjongBridgeViewController: CAPBridgeViewController {
    override public func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(OpenMahjongSecureSessionPlugin())
        bridge?.registerPluginInstance(OpenMahjongAppleSignInPlugin())
        bridge?.registerPluginInstance(OpenMahjongGoogleSignInPlugin())
    }
}
