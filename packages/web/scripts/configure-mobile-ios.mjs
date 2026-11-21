#!/usr/bin/env node
// Verify the native-shell wiring that `cap sync ios` does not own.
//
// Pattern: Munch's scripts/configure-mobile-ios.ts. Canonical
// first-party plugin sources live outside the Xcode project
// (mobile/ios/) and are copied into the App target by this script,
// where the copies are committed and the Xcode project references
// them. Capacitor's `cap sync ios` only manages the CapApp-SPM
// package — App-target Swift files survive it — so this copy step is
// the whole drift surface for plugin sources.
//
// Everything else here is VERIFY, NEVER REWRITE: project/plist wiring
// that `cap sync` does not own is committed project state. A missing
// piece fails loudly instead of being silently patched, and the iOS
// workflow runs this right after `cap sync ios` so the reproducibility
// check (`git status --porcelain -- packages/web/ios …`) covers both.

import { cp, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = dirname(dirname(fileURLToPath(import.meta.url)));
const appDir = join(webDir, "ios", "App", "App");
const mobileDir = join(webDir, "mobile");

// --- First-party plugin copy step ------------------------------------
// Step 3b (native sign-in): the three sign-in plugins plus the bridge
// view controller that registers them. Later steps extend THIS list
// (the ads plugin follows the same pattern).
const firstPartyPluginFiles = [
    "OpenMahjongGoogleSignInPlugin.swift",
    "OpenMahjongAppleSignInPlugin.swift",
    "OpenMahjongSecureSessionPlugin.swift",
    "OpenMahjongBridgeViewController.swift",
];
for (const file of firstPartyPluginFiles) {
    await cp(join(mobileDir, "ios", file), join(appDir, file));
}

// Bridge-contract greps on the copied files (Munch pattern): a plugin
// that loses its JS bridge name or a load-bearing constant fails the
// lane here instead of silently breaking sign-in in the packaged app.
const bridgeContracts = [
    ["OpenMahjongGoogleSignInPlugin.swift", 'public let jsName = "OpenMahjongGoogleSignIn"'],
    ["OpenMahjongAppleSignInPlugin.swift", 'public let jsName = "OpenMahjongAppleSignIn"'],
    ["OpenMahjongSecureSessionPlugin.swift", 'public let jsName = "OpenMahjongSecureSession"'],
    ["OpenMahjongSecureSessionPlugin.swift", '"app.openmahjong.secure-session"'],
    ["OpenMahjongBridgeViewController.swift", "registerPluginInstance(OpenMahjongSecureSessionPlugin())"],
    ["OpenMahjongBridgeViewController.swift", "registerPluginInstance(OpenMahjongAppleSignInPlugin())"],
    ["OpenMahjongBridgeViewController.swift", "registerPluginInstance(OpenMahjongGoogleSignInPlugin())"],
];
for (const [file, needle] of bridgeContracts) {
    const source = await readFile(join(appDir, file), "utf8");
    if (!source.includes(needle)) {
        throw new Error(`${file} lost its bridge contract: ${needle}`);
    }
}

// --- Export compliance (CyberCache pattern) --------------------------
// ITSAppUsesNonExemptEncryption = false is self-declared in the plist
// so no build ever stops at the App Store compliance prompt. The app
// uses only standard HTTPS/TLS.
const infoPlist = await readFile(join(appDir, "Info.plist"), "utf8");
if (!infoPlist.includes("<key>ITSAppUsesNonExemptEncryption</key>")) {
    throw new Error(
        "Info.plist is missing the ITSAppUsesNonExemptEncryption export-compliance key",
    );
}
const encryptionDecl = infoPlist.slice(
    infoPlist.indexOf("<key>ITSAppUsesNonExemptEncryption</key>"),
);
if (!encryptionDecl.startsWith(
    "<key>ITSAppUsesNonExemptEncryption</key>\n\t<false/>",
) && !encryptionDecl.startsWith(
    "<key>ITSAppUsesNonExemptEncryption</key>\n\t<false />",
)) {
    // Accept any plist formatting where <false/> directly follows the key.
    if (!/^<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\s*\/>/.test(encryptionDecl)) {
        throw new Error(
            "Info.plist ITSAppUsesNonExemptEncryption must be set to false",
        );
    }
}

// --- Bundle identity ---------------------------------------------------
const project = await readFile(
    join(webDir, "ios", "App", "App.xcodeproj", "project.pbxproj"),
    "utf8",
);
const bundleIds = [
    ...project.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g),
].map((m) => m[1].trim());
if (bundleIds.length === 0) {
    throw new Error("project.pbxproj declares no PRODUCT_BUNDLE_IDENTIFIER");
}
for (const id of bundleIds) {
    // The App target must be app.openmahjong; test targets legitimately
    // append a suffix (app.openmahjong.tests / .uitests).
    if (id !== "app.openmahjong" && !id.startsWith("app.openmahjong.")) {
        throw new Error(
            `project.pbxproj PRODUCT_BUNDLE_IDENTIFIER is ${id}, expected app.openmahjong`,
        );
    }
}
if (!bundleIds.includes("app.openmahjong")) {
    throw new Error(
        "project.pbxproj has no target with PRODUCT_BUNDLE_IDENTIFIER = app.openmahjong",
    );
}

// --- App icon ------------------------------------------------------------
// The AppIcon.appiconset must contain the single 1024 marketing icon
// seeded from packages/web/public/icon-1024.png (opaque, no alpha —
// App Store icons must be opaque).
const iconSetDir = join(appDir, "Assets.xcassets", "AppIcon.appiconset");
const iconSet = JSON.parse(
    await readFile(join(iconSetDir, "Contents.json"), "utf8"),
);
const marketing = (iconSet.images ?? []).filter(
    (img) => img.size === "1024x1024",
);
if (marketing.length !== 1 || !marketing[0].filename) {
    throw new Error(
        "AppIcon.appiconset must declare exactly one 1024x1024 icon with a filename",
    );
}
const iconFiles = await readdir(iconSetDir);
if (!iconFiles.includes(marketing[0].filename)) {
    throw new Error(
        `AppIcon.appiconset is missing its 1024 icon file: ${marketing[0].filename}`,
    );
}

// --- Smoke target (AppUITests) -----------------------------------------
// The XCUITest smoke target is committed project state (step 2 of the
// iOS program, modeled on Munch's AppUITests/MunchSmokeTests.swift
// wiring). `cap sync ios` does not own it, so — verify, never rewrite —
// a missing target, source file, scheme entry, or bundle suffix fails
// the lane instead of being silently patched.
for (const required of [
    "AppUITests",
    "OpenMahjongSmokeTests.swift",
    "com.apple.product-type.bundle.ui-testing",
    "app.openmahjong.uitests",
    "TEST_TARGET_NAME = App",
]) {
    if (!project.includes(required)) {
        throw new Error(
            `project.pbxproj is missing smoke-target wiring: ${required}`,
        );
    }
}
const smokeSources = await readdir(
    join(webDir, "ios", "App", "AppUITests"),
).catch(() => []);
if (!smokeSources.includes("OpenMahjongSmokeTests.swift")) {
    throw new Error(
        "ios/App/AppUITests/OpenMahjongSmokeTests.swift is missing",
    );
}
const scheme = await readFile(
    join(
        webDir,
        "ios",
        "App",
        "App.xcodeproj",
        "xcshareddata",
        "xcschemes",
        "App.xcscheme",
    ),
    "utf8",
).catch(() => "");
if (
    !scheme.includes('BlueprintName = "App"') ||
    !scheme.includes('BlueprintName = "AppUITests"') ||
    !scheme.includes("<Testables>")
) {
    throw new Error(
        "App.xcscheme must be a shared scheme building App and testing AppUITests",
    );
}

// --- Distribute signing (committed Release settings) -------------------
// The distribute leg archives with NO command-line signing overrides
// (xcodebuild applies those to every target, and the SPM package
// targets reject a manual profile — the Munch/PitTech lesson), so the
// App target's Release configuration carries the manual signing
// settings as committed project state: shared-cert team, Apple
// Distribution identity, and the per-app CI profile the workflow
// creates fresh on every distribute run.
for (const required of [
    "CODE_SIGN_STYLE = Manual",
    "DEVELOPMENT_TEAM = R42LWFBXBH",
    '"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "Apple Distribution"',
    'PROVISIONING_PROFILE_SPECIFIER = "Open Mahjong App Store CI"',
]) {
    if (!project.includes(required)) {
        throw new Error(
            `project.pbxproj is missing Release signing setting: ${required}`,
        );
    }
}

// --- Native sign-in wiring (step 3b) ----------------------------------
// Verify, never rewrite (Munch pattern): the plugin files' App-target
// membership, the GoogleSignIn Swift package dependency + product,
// and the Sign in with Apple entitlements wiring are committed
// project state; a missing piece fails the lane.
for (const required of [
    ...firstPartyPluginFiles,
    "google/GoogleSignIn-iOS.git",
    "productName = GoogleSignIn;",
    "CODE_SIGN_ENTITLEMENTS = App/App.entitlements",
]) {
    if (!project.includes(required)) {
        throw new Error(
            `project.pbxproj is missing native sign-in wiring: ${required}`,
        );
    }
}
const entitlements = await readFile(join(appDir, "App.entitlements"), "utf8");
if (
    !entitlements.includes("<key>com.apple.developer.applesignin</key>") ||
    !entitlements.includes("<string>Default</string>")
) {
    throw new Error(
        "App.entitlements must declare com.apple.developer.applesignin = [Default]",
    );
}

// The bridge view controller is only wired if SceneDelegate actually
// instantiates it, and the Google redirect only returns if both
// delegates give GIDSignIn first claim on incoming URLs (Munch's
// AppDelegate/SceneDelegate shape).
const sceneDelegate = await readFile(join(appDir, "SceneDelegate.swift"), "utf8");
if (!sceneDelegate.includes("OpenMahjongBridgeViewController()")) {
    throw new Error(
        "SceneDelegate does not instantiate OpenMahjongBridgeViewController",
    );
}
if (!sceneDelegate.includes("GIDSignIn.sharedInstance.handle")) {
    throw new Error("SceneDelegate does not give GIDSignIn first claim on URLs");
}
const appDelegate = await readFile(join(appDir, "AppDelegate.swift"), "utf8");
if (!appDelegate.includes("GIDSignIn.sharedInstance.handle")) {
    throw new Error("AppDelegate does not give GIDSignIn first claim on URLs");
}

// --- Google redirect URL scheme (config-gated) -------------------------
// ONE source of truth: mobile/google-signin-config.json carries the
// iOS OAuth client ID. It is empty until the client is created in the
// Google Cloud console; while empty there is no redirect scheme to
// declare and this single check is skipped. Once an ID is set, the
// reversed-client-ID scheme MUST be in Info.plist or the Google
// OAuth redirect cannot return to the app.
const googleConfig = JSON.parse(
    await readFile(join(mobileDir, "google-signin-config.json"), "utf8"),
);
const iosClientId = typeof googleConfig.iosClientId === "string"
    ? googleConfig.iosClientId.trim()
    : "";
let urlSchemeNote = "Google URL scheme check skipped (no iOS client ID configured)";
if (iosClientId) {
    const suffix = ".apps.googleusercontent.com";
    if (!iosClientId.endsWith(suffix)) {
        throw new Error(
            `google-signin-config.json iosClientId is not a Google iOS client ID: ${iosClientId}`,
        );
    }
    const reversed = `com.googleusercontent.apps.${iosClientId.slice(0, -suffix.length)}`;
    if (!infoPlist.includes(`<string>${reversed}</string>`)) {
        throw new Error(
            `Info.plist is missing the Google sign-in redirect URL scheme: ${reversed}`,
        );
    }
    urlSchemeNote = `Google URL scheme verified (${reversed})`;
}

console.log(
    `Verified iOS shell wiring: export-compliance key (false), bundle ID app.openmahjong, 1024 app icon, AppUITests smoke target + shared scheme, Release manual signing (team R42LWFBXBH, Open Mahjong App Store CI profile); native sign-in: ${firstPartyPluginFiles.length} first-party plugin sources copied + bridge contracts, GoogleSignIn SPM package + product, Sign in with Apple entitlements; ${urlSchemeNote}`,
);
