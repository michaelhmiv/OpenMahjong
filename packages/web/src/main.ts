import { App } from "./app.js";
import { initAnalytics } from "./analytics.js";
import "./styles.css";
import "./learning.css";
import "./tools.css";
/* The medium surface system (design rules section 15) loads last:
   it is a refinement layer over the three sheets above, in the
   same cascade position the approved calc-v7 frames used. */
import "./medium.css";

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app root element");
new App(root);

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
