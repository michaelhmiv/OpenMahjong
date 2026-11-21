import Capacitor
import Foundation
import Security

/// OpenMahjongSecureSession — the packaged iOS app's persistent
/// session store, cloned from Munch's MunchSecureSessionPlugin and
/// renamed for this app.
///
/// JS bridge surface (called through src/native-auth.ts):
/// getToken() -> { token }, setToken({ token }), clearToken().
/// The web layer treats a missing plugin as signed-out.
///
/// Deliberate omission vs Munch: Munch's pending-auth trio
/// (getPendingAuth / setPendingAuth / clearPendingAuth) is NOT
/// carried over. It exists for Munch's web-redirect OAuth handoff,
/// where a sign-in started in the browser must be picked up by the
/// app; Open Mahjong's native flows never leave the app (the plugins
/// return ID tokens directly), so there is no pending auth to store.
///
/// Storage is the iOS Keychain: items are OS-encrypted at rest and
/// bound to this device (kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
/// — usable after the first unlock following a reboot, which is when
/// a cold app launch restores its session, and never synced to
/// iCloud or migrated to another device). The service is this app's
/// own: `app.openmahjong.secure-session`.
///
/// The stored value is the web layer's session bundle — a small JSON
/// string carrying the session token and its CSRF token together
/// (see src/native-auth.ts); this plugin stores it opaquely, exactly
/// as Munch's stores its token.
///
/// Semantics mirror Munch's plugin exactly:
/// - Reads resolve with an EMPTY STRING when nothing is stored
///   (never null), so the web layer's `|| ""` handling behaves
///   identically.
/// - A stored value that cannot be read back is deleted and the call
///   rejects — the user signs in again rather than the app trusting
///   damaged state.
/// - Writes reject blank values and values over the same ceiling as
///   Munch's session token (16,384 chars).
@objc(OpenMahjongSecureSessionPlugin)
public class OpenMahjongSecureSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OpenMahjongSecureSessionPlugin"
    public let jsName = "OpenMahjongSecureSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearToken", returnType: CAPPluginReturnPromise),
    ]

    private static let service = "app.openmahjong.secure-session"
    private static let tokenAccount = "session-token"
    private static let tokenLimit = 16384

    @objc func getToken(_ call: CAPPluginCall) {
        readValue(account: Self.tokenAccount, call: call, resultKey: "token") {
            "Unable to read the installed Open Mahjong session"
        }
    }

    @objc func setToken(_ call: CAPPluginCall) {
        writeValue(
            account: Self.tokenAccount,
            value: call.getString("token"),
            limit: Self.tokenLimit,
            call: call,
            invalidMessage: "A valid Open Mahjong session token is required",
            storeMessage: "Unable to store the installed Open Mahjong session"
        )
    }

    @objc func clearToken(_ call: CAPPluginCall) {
        deleteValue(account: Self.tokenAccount)
        call.resolve()
    }

    // MARK: - Keychain plumbing

    private func baseQuery(account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.service,
            kSecAttrAccount as String: account,
        ]
    }

    private func readValue(
        account: String,
        call: CAPPluginCall,
        resultKey: String,
        unreadableMessage: () -> String
    ) {
        var query = baseQuery(account: account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        switch status {
        case errSecSuccess:
            if let data = item as? Data,
               let value = String(data: data, encoding: .utf8) {
                call.resolve([resultKey: value])
            } else {
                deleteValue(account: account)
                call.reject(unreadableMessage())
            }
        case errSecItemNotFound:
            call.resolve([resultKey: ""])
        default:
            deleteValue(account: account)
            call.reject(unreadableMessage())
        }
    }

    private func writeValue(
        account: String,
        value: String?,
        limit: Int,
        call: CAPPluginCall,
        invalidMessage: String,
        storeMessage: String
    ) {
        guard let value,
              !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              value.utf8.count <= limit else {
            call.reject(invalidMessage)
            return
        }
        let data = Data(value.utf8)
        let query = baseQuery(account: account)
        let updateStatus = SecItemUpdate(
            query as CFDictionary,
            [kSecValueData as String: data] as CFDictionary
        )
        if updateStatus == errSecSuccess {
            call.resolve()
            return
        }
        if updateStatus == errSecItemNotFound {
            var insert = query
            insert[kSecValueData as String] = data
            insert[kSecAttrAccessible as String] =
                kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            if SecItemAdd(insert as CFDictionary, nil) == errSecSuccess {
                call.resolve()
                return
            }
        }
        call.reject(storeMessage)
    }

    private func deleteValue(account: String) {
        SecItemDelete(baseQuery(account: account) as CFDictionary)
    }
}
