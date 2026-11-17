import { spawn, type ChildProcess } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { get as httpGet, type IncomingMessage } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * server.mjs behavior guards (SEO plan gaps Q1 + Q2): unknown paths are
 * real 404s (the app owns no URL routes, so there is no SPA fallback),
 * real files and /privacy still serve, and text responses >= 1 KB are
 * gzip-encoded only when the client asks for gzip.
 *
 * Hermetic: copies server.mjs next to a fixture dist/ in a temp dir and
 * drives the real server over HTTP.
 */

const SHELL = "<!DOCTYPE html><html><body>app shell fixture</body></html>\n";
const PRIVACY = "<!DOCTYPE html><html><body>privacy fixture</body></html>\n";
const BIG_JS = `// fixture bundle\n${"console.log('fixture');\n".repeat(200)}`; // ~4.8 KB
const SMALL_TXT = "small fixture\n";

interface RawResponse {
  status: number;
  headers: IncomingMessage["headers"];
  body: Buffer;
}

function rawGet(port: number, path: string, headers: Record<string, string> = {}): Promise<RawResponse> {
  return new Promise((resolvePromise, reject) => {
    const req = httpGet({ host: "127.0.0.1", port, path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () =>
        resolvePromise({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }),
      );
    });
    req.on("error", reject);
  });
}

async function freePort(): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolvePromise(port));
    });
  });
}

describe("server.mjs", () => {
  let child: ChildProcess | undefined;
  let port = 0;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "om-server-test-"));
    copyFileSync(resolve(process.cwd(), "packages/web/server.mjs"), join(dir, "server.mjs"));
    mkdirSync(join(dir, "dist", "privacy"), { recursive: true });
    mkdirSync(join(dir, "dist", "assets"), { recursive: true });
    writeFileSync(join(dir, "dist", "index.html"), SHELL);
    writeFileSync(join(dir, "dist", "privacy", "index.html"), PRIVACY);
    writeFileSync(join(dir, "dist", "assets", "app.js"), BIG_JS);
    writeFileSync(join(dir, "dist", "small.txt"), SMALL_TXT);

    port = await freePort();
    child = spawn(process.execPath, [join(dir, "server.mjs")], {
      env: { ...process.env, PORT: String(port) },
      stdio: "ignore",
    });
    // Wait until the health endpoint answers.
    const deadline = Date.now() + 20_000;
    for (;;) {
      try {
        const res = await rawGet(port, "/healthz");
        if (res.status === 200) break;
      } catch {
        // not up yet
      }
      if (Date.now() > deadline) throw new Error("server.mjs did not start in time");
      await new Promise((r) => setTimeout(r, 100));
    }
  }, 30_000);

  afterAll(() => {
    child?.kill();
  });

  it("serves the app shell at /", async () => {
    const res = await rawGet(port, "/");
    expect(res.status).toBe(200);
    expect(res.body.toString("utf8")).toBe(SHELL);
  });

  it("serves /privacy as its own document", async () => {
    for (const path of ["/privacy", "/privacy/"]) {
      const res = await rawGet(port, path);
      expect(res.status, path).toBe(200);
      expect(res.body.toString("utf8")).toBe(PRIVACY);
    }
  });

  it("returns a real 404 for unknown paths (no SPA fallback)", async () => {
    for (const path of ["/nonexistent-xyz", "/learn", "/riichi", "/about"]) {
      const res = await rawGet(port, path);
      expect(res.status, path).toBe(404);
      expect(res.body.toString("utf8")).not.toContain("app shell fixture");
    }
  });

  it("returns 404 for missing files with extensions", async () => {
    for (const path of ["/assets/missing.js", "/missing.png", "/nope.txt"]) {
      const res = await rawGet(port, path);
      expect(res.status, path).toBe(404);
    }
  });

  it("gzip-encodes large text responses when the client accepts gzip", async () => {
    const res = await rawGet(port, "/assets/app.js", { "Accept-Encoding": "gzip" });
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBe("gzip");
    expect(res.body.length).toBeLessThan(Buffer.byteLength(BIG_JS));
    expect(gunzipSync(res.body).toString("utf8")).toBe(BIG_JS);
  });

  it("serves identity encoding when gzip is not accepted", async () => {
    const res = await rawGet(port, "/assets/app.js");
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBeUndefined();
    expect(res.body.toString("utf8")).toBe(BIG_JS);
  });

  it("does not gzip small responses", async () => {
    const res = await rawGet(port, "/small.txt", { "Accept-Encoding": "gzip" });
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBeUndefined();
    expect(res.body.toString("utf8")).toBe(SMALL_TXT);
  });
});
