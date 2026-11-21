#!/usr/bin/env node
// Verify the native-shell wiring that `cap sync ios` does not own.
//
// Pattern: Munch's scripts/configure-mobile-ios.ts. Canonical
// first-party plugin sources will live outside the Xcode project and
// be copied into the App target by this script in later steps of the
// iOS program (native sign-in plugins, then the ads plugin — the same
// order Munch's script grew). At this step there are no first-party
// plugins yet, so the copy step below is a deliberate no-op placeholder
// marking exactly where those copies land.
//
// Everything else here is VERIFY, NEVER REWRITE: project/plist wiring
// that `cap sync` does not own is committed project state. A missing
// piece fails loudly instead of being silently patched, and the iOS
// workflow runs this right after `cap sync ios` so the reproducibility
// check (`git status --porcelain -- packages/web/ios …`) covers both.

import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = dirname(dirname(fileURLToPath(import.meta.url)));
const appDir = join(webDir, "ios", "App", "App");

// --- First-party plugin copy step (no-op placeholder) ---------------
// Later steps extend THIS list, one entry per plugin source file, e.g.:
//   ["OpenMahjongGoogleSignInPlugin.swift", "OpenMahjongAppleSignInPlugin.swift", "OpenMahjongAdsPlugin.swift"]
// copied from the canonical location into `${appDir}/`, followed by
// bridge-name / policy greps on the copied file (Munch pattern).
const firstPartyPluginFiles = [];
for (const file of firstPartyPluginFiles) {
    // cp(canonicalSource(file), join(appDir, file)) — wired when the
    // first plugin lands; nothing to copy at the shell step.
    throw new Error(`Plugin copy not wired yet: ${file}`);
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

console.log(
    "Verified iOS shell wiring: export-compliance key (false), bundle ID app.openmahjong, 1024 app icon; no first-party plugins to copy yet",
);
