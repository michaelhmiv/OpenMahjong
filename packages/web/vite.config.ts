import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defineConfig } from "vite";

// The web client bundles the engine and the AI from source (their
// packages' published entries are their dist builds; in the monorepo
// the source is the same code and needs no pre-build step for the
// client or CI).
export default defineConfig({
  base: "./",
  plugins: [{
    name: "versioned-offline-shell",
    async closeBundle() {
      const out = fileURLToPath(new URL("./dist/", import.meta.url));
      const files: string[] = [];
      const walk = async (dir: string, prefix = ""): Promise<void> => {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
          const relative = `${prefix}${entry.name}`;
          if (entry.isDirectory()) await walk(join(dir, entry.name), `${relative}/`);
          else if (entry.name !== "sw.js" && !entry.name.endsWith(".map")) files.push(relative);
        }
      };
      await walk(out);
      files.sort();
      const hash = createHash("sha256");
      for (const file of files) { hash.update(file); hash.update(await readFile(join(out, file))); }
      const template = await readFile(fileURLToPath(new URL("./public/sw.js", import.meta.url)), "utf8");
      const source = template.replace("__OM_CACHE_REVISION__", hash.digest("hex").slice(0, 16))
        .replace('/*__OM_PRECACHE__*/ ["./", "./index.html"]', JSON.stringify(["./", ...files.map((file) => `./${file}`)]));
      await writeFile(join(out, "sw.js"), source);
    },
  }],
  resolve: {
    alias: {
      "@openmahjong/engine/legacy/v1": fileURLToPath(new URL("../engine/src/legacy/v1/index.ts", import.meta.url)),
      "@openmahjong/ai": fileURLToPath(
        new URL("../ai/src/index.ts", import.meta.url),
      ),
      "@openmahjong/coach": fileURLToPath(
        new URL("../coach/src/index.ts", import.meta.url),
      ),
      "@openmahjong/engine": fileURLToPath(
        new URL("../engine/src/index.ts", import.meta.url),
      ),
    },
  },
  build: {
    outDir: "dist",
    assetsInlineLimit: 0,
    rollupOptions: {output: {manualChunks(id) {
      if(id.includes("/variants/mcr-runtime."))return "mcr-scorer";
      if(id.includes("/legacy/v1/"))return "legacy-v1";
    }}},
  },
});
