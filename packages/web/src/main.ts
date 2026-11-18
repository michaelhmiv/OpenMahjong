import { App } from "./app.js";
import { applyLocaleDocumentTags, getCurrentLocale, initI18n } from "./i18n/index.js";
import { initAnalytics } from "./analytics.js";
import "./styles.css";
import "./learning.css";
import "./tools.css";
/* The medium surface system (design rules section 15) loads after
   the base sheets: it is a refinement layer over them, in the
   same cascade position the approved calc-v7 frames used. */
import "./medium.css";
/* The compact calculator layer (design rules section 16) builds
   on the medium system and loads after it. */
import "./compact.css";

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app root element");
// Phase 2 Track A i18n: resolve the locale (URL path > remembered
// choice > browser detection, among shipped locales — English only for
// now) before the app renders, so every t() call below sees the active
// locale; then set the document language + canonical / hreflang tags for
// it. With only English shipped this is lang="en" and the root canonical,
// exactly as before.
initI18n();
applyLocaleDocumentTags(getCurrentLocale());
const returnRoute = sessionStorage.getItem("om-online-return");
if (!location.hash && returnRoute && /^#\/(online$|join\/[\w-]+$|match\/[\w-]+$)/.test(returnRoute)) {
  history.replaceState(null, "", returnRoute);
}
sessionStorage.removeItem("om-online-return");
const onlineRoute = () => /^#\/(online$|join\/|match\/)/.test(location.hash);
const startedOnline = onlineRoute();
window.addEventListener("hashchange", () => { if (onlineRoute() !== startedOnline) location.reload(); });
if (startedOnline) void import("./online.js").then(({ onlineApp }) => onlineApp(root));
else new App(root);

// Google Analytics ships dark: with ANALYTICS_CONFIG empty this is
// a no-op — no script, no network, nothing tracked. Go-live is a
// separate one-value PR (see analytics.ts).
initAnalytics();

// PWA (brief §11): the service worker caches the app shell and assets so
// the game is fully playable offline after the first load.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Offline support is progressive enhancement; the game still runs.
    });
  });
}
