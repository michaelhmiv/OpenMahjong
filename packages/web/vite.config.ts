import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The web client bundles the engine from source (the engine package's
// published entry is its dist build; in the monorepo the source is the
// same code and needs no pre-build step for the client or CI).
export default defineConfig({
  base: "./",
  resolve: {
    alias: {
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
