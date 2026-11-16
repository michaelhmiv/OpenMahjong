import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Monorepo: packages consume the engine from source in tests (its
      // published entry is the dist build, which CI does not pre-build).
      "@openmahjong/engine": fileURLToPath(
        new URL("./packages/engine/src/index.ts", import.meta.url),
      ),
      // Same for the AI package: the web tests exercise the real
      // opponent from source.
      "@openmahjong/ai": fileURLToPath(
        new URL("./packages/ai/src/index.ts", import.meta.url),
      ),
      // And the coach package (tutorial/coaching tests run it from
      // source the same way).
      "@openmahjong/coach": fileURLToPath(
        new URL("./packages/coach/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts", "packages/*/src/**/*.test.ts"],
  },
});
