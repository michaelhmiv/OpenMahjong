#!/usr/bin/env node
// Build the staged Capacitor bundle (webDir ".mobile-web").
//
// Pattern: Munch's scripts/build-mobile-web.ts, adapted to this repo's
// npm-workspaces shape. The normal web build is untouched: this script
// runs the workspace build in the repo's own order (root `build:libs`,
// then the web package's `vite build`), then stages `dist/` into
// `.mobile-web/`.
//
// The one deliberate difference between the staged bundle and the web
// build: the service worker is inert here. Inside the packaged shell
// the bundle is served locally by Capacitor — there is nothing for a
// SW to fetch or cache-manage, and an active SW would fight the local
// serve (brief-ios-v1 hard floor: "Web is untouched … The service
// worker must be inert inside the packaged bundle"). So the staged
// copy omits `sw.js` entirely and the SW registration call in the
// staged JS is neutralized (replaced with a resolved promise, which
// keeps the surrounding `.catch(() => {})` chain valid). The `dist/`
// output — and therefore the live site — is never modified.

import { execFileSync } from "node:child_process";
import { cp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(webDir));
const stagingDir = join(webDir, ".mobile-web");
const distDir = join(webDir, "dist");

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const run = (args, cwd) =>
    execFileSync(npm, args, { cwd, stdio: "inherit" });

// Workspace build in the repo's own order: libraries first, then the
// web package build (same steps as the root `build` script, minus the
// server package, which the packaged shell does not ship).
run(["run", "build:libs"], repoRoot);
run(["run", "build", "--workspace=@openmahjong/web"], repoRoot);

// Stage dist/ as the Capacitor webDir, minus the service worker.
await rm(stagingDir, { recursive: true, force: true });
await cp(distDir, stagingDir, {
    recursive: true,
    filter: (src) => !src.endsWith("sw.js"),
});

// Neutralize the SW registration in the staged JS only. The Vite build
// emits the registration from src/main.ts as
// `navigator.serviceWorker.register("./sw.js").catch(() => {})`;
// replacing the register call with a resolved promise leaves the rest
// of the statement (and the bundle) byte-identical in behavior apart
// from the registration itself never happening.
const registerPattern =
    /[A-Za-z_$][\w$]*\.serviceWorker\.register\([^()]*\)/g;
const stagedJsFiles = [];
const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (entry.name.endsWith(".js")) stagedJsFiles.push(path);
    }
};
await walk(stagingDir);

let neutralized = 0;
for (const file of stagedJsFiles) {
    const source = await readFile(file, "utf8");
    if (!source.includes("serviceWorker")) continue;
    const staged = source.replace(registerPattern, () => {
        neutralized += 1;
        return "Promise.resolve(undefined)";
    });
    if (staged !== source) await writeFile(file, staged);
    if (staged.includes("serviceWorker.register")) {
        throw new Error(
            `Staged bundle still registers a service worker: ${file}`,
        );
    }
}
if (neutralized === 0) {
    throw new Error(
        "No service-worker registration found in the staged bundle — " +
            "src/main.ts registration shape changed; update this script " +
            "so the packaged bundle never ships an active SW.",
    );
}

console.log(
    `Built local mobile bundle in .mobile-web (service worker omitted, ${neutralized} registration call(s) neutralized)`,
);
