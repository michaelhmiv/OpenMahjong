import AuthenticationServices
import Capacitor
import CryptoKit
import Foundation
import UIKit

/// OpenMahjongAppleSignIn — native Sign in with Apple for the
/// packaged iOS app, cloned from Munch's MunchAppleSignInPlugin with
/// one deliberate extension (below).
///
/// The server half (step 3a, PR #110) dictates this shape:
/// POST /auth/apple/native verifies the identity token locally
/// against Apple's JWKS with the app bundle ID (`app.openmahjong`)
/// as audience. So this plugin's whole job is: run ASAuthorization,
/// hand the resulting ID token (and the raw nonce) to
/// src/native-auth.ts, and let the web layer establish the session.
/// No authorization code is returned or exchanged here.
///
/// Nonce handling mirrors the server verifier: the web layer
/// generates the raw nonce and sends it in the POST body; this
/// plugin puts the SHA-256 hex of that nonce on the authorization
/// request (Apple copies the request nonce verbatim into the ID
/// token's `nonce` claim). The server accepts the claim when it
/// equals the raw nonce OR its SHA-256 hex, so the raw nonce itself
/// never has to appear in the authorization request. Identical to
/// Munch's handling.
///
/// Scopes: email + fullName are requested so a first sign-in can
/// carry the user's name and email. Apple returns them on the
/// credential only — never inside the ID token — and only on the
/// very first authorization.
///
/// EXTENSION over Munch's plugin: Munch resolves only { idToken }
/// because its server derives identity from the token alone. Open
/// Mahjong's server captures the display name from the request's
/// `fullName` on first sign-in (Apple tokens carry no name claim),
/// so this plugin also resolves `fullName` ({ givenName, familyName }
/// from the credential's PersonNameComponents) and `email` whenever
/// Apple provides them. Both keys are simply absent on later
/// authorizations, when Apple no longer sends them.
@objc(OpenMahjongAppleSignInPlugin)
public class OpenMahjongAppleSignInPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OpenMahjongAppleSignInPlugin"
    public let jsName = "OpenMahjongAppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
    ]

    private var pendingCall: CAPPluginCall?
    private var authorizationController: ASAuthorizationController?

    @objc func signIn(_ call: CAPPluginCall) {
        guard let nonce = call.getString("nonce"),
              !nonce.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            call.reject("A sign-in nonce is required")
            return
        }
        if pendingCall != nil {
            call.reject("Sign in with Apple is already in progress")
            return
        }
        pendingCall = call

        let hashedNonce = SHA256.hash(data: Data(nonce.utf8))
            .map { String(format: "%02x", $0) }
            .joined()

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            request.nonce = hashedNonce
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            self.authorizationController = controller
            controller.performRequests()
        }
    }

    private func finish(with result: (CAPPluginCall) -> Void) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        authorizationController = nil
        result(call)
    }
}

extension OpenMahjongAppleSignInPlugin: ASAuthorizationControllerDelegate {
    public func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard let credential = authorization.credential
                as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let idToken = String(data: tokenData, encoding: .utf8),
              !idToken.isEmpty else {
            finish { $0.reject("Apple did not return an ID token") }
            return
        }
        var result: [String: Any] = ["idToken": idToken]
        // First authorization only: Apple attaches the person's name
        // and email to the credential. Forward whatever is present —
        // the server stores the name as the account's display name
        // and the token's email claim remains the identity source.
        var fullName: [String: String] = [:]
        if let givenName = credential.fullName?.givenName, !givenName.isEmpty {
            fullName["givenName"] = givenName
        }
        if let familyName = credential.fullName?.familyName, !familyName.isEmpty {
            fullName["familyName"] = familyName
        }
        if !fullName.isEmpty {
            result["fullName"] = fullName
        }
        if let email = credential.email, !email.isEmpty {
            result["email"] = email
        }
        let resolved = result
        finish { $0.resolve(resolved) }
    }

    public func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        // Cancellation and every other failure surface with the same
        // shape as the Google plugin's failure message; the sign-in
        // surface prints it verbatim.
        finish {
            $0.reject("Sign in with Apple was cancelled or could not be completed")
        }
    }
}

extension OpenMahjongAppleSignInPlugin: ASAuthorizationControllerPresentationContextProviding {
    public func presentationAnchor(
        for controller: ASAuthorizationController
    ) -> ASPresentationAnchor {
        if let window = bridge?.viewController?.view.window {
            return window
        }
        let keyWindow = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }
        return keyWindow ?? ASPresentationAnchor()
    }
}
