import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The web client bundles the engine and the AI from source (their
// packages' published entries are their dist builds; in the monorepo
// the source is the same code and needs no pre-build step for the
// client or CI).
export default defineConfig({
  base: "./",
  resolve: {
    alias: {
      "@openmahjong/ai": fileURLToPath(
        new URL("../ai/src/index.ts", import.meta.url),
      ),
      "@openmahjong/engine": fileURLToPath(
        new URL("../engine/src/index.ts", import.meta.url),
      ),
    },
  },
  build: {
    outDir: "dist",
    assetsInlineLimit: 0,
  },
});
