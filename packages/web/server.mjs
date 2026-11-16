// Tiny static server for the built client (dist/). Replaces the `serve`
// package, whose CLI defaults (cleanUrls redirects + SPA rewrite order)
// made /privacy unreachable. Behavior:
//   - real files are served with their content type;
//   - a directory serves its index.html;
//   - any other path serves the app shell (the client is a single-page
//     app with internal screens; it owns no URL routes);
//   - /privacy is a real directory with its own index.html, so the
//     privacy policy is served as static HTML.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./dist", import.meta.url));
const port = Number(process.env.PORT || 8080);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

async function sendFile(res, path) {
  const data = await readFile(path);
  res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream" });
  res.end(data);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    let path = join(root, rel);
    let info = await stat(path).catch(() => null);
    if (info?.isDirectory()) {
      path = join(path, "index.html");
      info = await stat(path).catch(() => null);
    }
    if (info?.isFile()) return await sendFile(res, path);
    // SPA fallback: the app shell.
    return await sendFile(res, join(root, "index.html"));
  } catch {
    res.writeHead(500);
    res.end("error");
  }
});

server.listen(port, () => {
  console.log(`[web] serving dist on ${port}`);
});
