// Tiny static server for the built client (dist/). Replaces the `serve`
// package, whose CLI defaults (cleanUrls redirects + SPA rewrite order)
// made /privacy unreachable. Behavior:
//   - real files are served with their content type;
//   - a directory serves its index.html;
//   - /privacy is a real directory with its own index.html, so the
//     privacy policy is served as static HTML;
//   - any other path is a real 404: the client is a single-page app
//     with internal screens and owns no URL routes, so there is no
//     legitimate SPA fallback (unknown URLs used to return the shell
//     with a 200, which search engines report as soft 404s);
//   - text responses of at least 1 KB are gzip-compressed when the
//     client sends `Accept-Encoding: gzip`.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { gzip } from "node:zlib";
import { promisify } from "node:util";

const gzipAsync = promisify(gzip);

const root = fileURLToPath(new URL("./dist", import.meta.url));
const port = Number(process.env.PORT || 8080);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

// Per-language URLs (brief-i18n-v1, Phase 2 Track A): /<locale>/ is the
// URL for a SHIPPED locale. English lives at the root. A locale prefix
// for an unshipped locale (drafts exist, nothing approved) stays a 404 —
// a crawler must never be served English content at /ja/. Keep this list
// in step with SHIPPED_LOCALES in packages/web/src/i18n/index.ts and in
// scripts/i18n-coverage.mjs; packages/web/test/i18n-routing.test.ts
// asserts the three agree. Per-language static pages (e.g. /ja/learn/)
// are a ship-step item: until they exist, a shipped locale's unmatched
// paths serve the app shell below, never another language's static page.
const SHIPPED_LOCALES = ["en"];

// MIME types worth compressing (binary formats like png/woff2 already are).
const COMPRESSIBLE = new Set([
  "text/html",
  "application/javascript",
  "text/css",
  "application/json",
  "application/xml",
  "application/manifest+json",
  "image/svg+xml",
  "text/plain",
]);
const GZIP_MIN_BYTES = 1024;

const NOT_FOUND_BODY =
  '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8" />' +
  "<title>Not found — Open Mahjong</title></head><body>" +
  "<h1>Not found</h1><p>There is no page at this address. " +
  '<a href="/">Open Mahjong</a></p></body></html>\n';

async function sendFile(req, res, path) {
  const data = await readFile(path);
  const type = TYPES[extname(path)] || "application/octet-stream";
  const headers = {
    "Content-Type": type,
    "Cache-Control": path.includes(`${join(root, "assets")}/`) ? "public, max-age=31536000, immutable" : "no-cache",
  };
  let body = data;
  const mime = type.split(";")[0];
  if (COMPRESSIBLE.has(mime)) {
    headers["Vary"] = "Accept-Encoding";
    const accept = req.headers["accept-encoding"] || "";
    if (data.length >= GZIP_MIN_BYTES && /\bgzip\b/.test(accept)) {
      body = await gzipAsync(data);
      headers["Content-Encoding"] = "gzip";
    }
  }
  headers["Content-Length"] = body.length;
  res.writeHead(200, headers);
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (url.pathname === "/healthz") {
      const ready = (await stat(join(root, "index.html")).catch(() => null))?.isFile() === true;
      res.writeHead(ready ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(JSON.stringify({ ok: ready }));
    }
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    const firstSeg = rel.split("/").filter(Boolean)[0] ?? "";
    const localePrefix =
      firstSeg !== "en" && SHIPPED_LOCALES.includes(firstSeg) ? firstSeg : null;
    // For a shipped locale prefix, try the path as-is, then with the
    // prefix stripped for file-like requests only (so /ja/assets/...
    // resolves to dist/assets/...), then fall back to the app shell (the
    // SPA owns its screens). A locale-prefixed page path never resolves
    // to another language's static page: /ja/learn/ serves the shell,
    // not the English /learn/ page.
    const stripped = `/${rel.split("/").filter(Boolean).slice(1).join("/")}`;
    const candidates = localePrefix
      ? [rel, ...(stripped.split("/").pop()?.includes(".") ? [stripped] : [])]
      : [rel];
    for (const cand of candidates) {
      let path = join(root, cand);
      let info = await stat(path).catch(() => null);
      if (info?.isDirectory()) {
        path = join(path, "index.html");
        info = await stat(path).catch(() => null);
      }
      if (info?.isFile()) return await sendFile(req, res, path);
    }
    if (localePrefix) {
      return await sendFile(req, res, join(root, "index.html"));
    }
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(NOT_FOUND_BODY);
  } catch {
    res.writeHead(500);
    res.end("error");
  }
});

server.listen(port, () => {
  console.log(`[web] serving dist on ${port}`);
});
