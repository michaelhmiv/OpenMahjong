import Capacitor
import Foundation
import GoogleSignIn
import UIKit

/// OpenMahjongGoogleSignIn — native Google sign-in for the packaged
/// iOS app, cloned from Munch's MunchGoogleSignInPlugin (the sibling
/// program's proven first-party plugin) and renamed for this app.
///
/// The contract is set by the server half (step 3a, PR #110):
/// src/native-auth.ts hands over the client identifiers that
/// GET /mobile/auth/google-config reports for the iOS platform, plus
/// a runtime-generated nonce, and this plugin returns the Google ID
/// token. The web layer then completes sign-in with
/// POST /auth/google/native { idToken }, so this plugin's whole job
/// is: configure GIDSignIn, run the interactive flow, hand back the
/// token. No authorization code is returned or exchanged here.
///
/// Identifiers: `clientId` is the iOS OAuth client (Google verifies
/// the app's bundle ID against it before returning a token);
/// `serverClientId` is the web OAuth client, which the SDK needs to
/// mint server-audience ID tokens. The server accepts both audiences,
/// so no token translation happens here. The nonce rides into the
/// SDK's sign-in call and comes back as the token's `nonce` claim.
///
/// The OAuth redirect returns on the reversed-client-ID URL scheme
/// declared in Info.plist (present only once an iOS client ID is
/// configured — see mobile/google-signin-config.json and
/// scripts/configure-mobile-ios.mjs); AppDelegate and SceneDelegate
/// both give `GIDSignIn.sharedInstance.handle` first claim on
/// incoming URLs.
@objc(OpenMahjongGoogleSignInPlugin)
public class OpenMahjongGoogleSignInPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OpenMahjongGoogleSignInPlugin"
    public let jsName = "OpenMahjongGoogleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
    ]

    @objc func signIn(_ call: CAPPluginCall) {
        guard let clientId = call.getString("clientId"),
              !clientId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let serverClientId = call.getString("serverClientId"),
              !serverClientId.trimmingCharacters(
                  in: .whitespacesAndNewlines
              ).isEmpty,
              let nonce = call.getString("nonce"),
              !nonce.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else {
            call.reject("Google sign-in is not configured")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let presenting = self?.bridge?.viewController else {
                call.reject(
                    "Google sign-in was cancelled or could not be completed"
                )
                return
            }
            GIDSignIn.sharedInstance.configuration = GIDConfiguration(
                clientID: clientId,
                serverClientID: serverClientId
            )
            GIDSignIn.sharedInstance.signIn(
                withPresenting: presenting,
                hint: nil,
                additionalScopes: nil,
                nonce: nonce
            ) { result, error in
                if error != nil {
                    // Cancellation and every other failure surface
                    // with the same shape as the Apple plugin's
                    // failure message; the sign-in surface prints it
                    // verbatim.
                    call.reject(
                        "Google sign-in was cancelled or could not be completed"
                    )
                    return
                }
                guard let idToken = result?.user.idToken?.tokenString,
                      !idToken.isEmpty else {
                    call.reject("Google did not return an ID token")
                    return
                }
                call.resolve(["idToken": idToken])
            }
        }
    }
}
