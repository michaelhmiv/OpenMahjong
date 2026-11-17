/** Index screenshots from real browser runs; no generated/mock renderings. */
import { readdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const root = resolve(process.argv[2] ?? "work/program-evidence");
const escape = (s) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
const groups = [];
function visit(dir, prefix = "") {
  const entries = readdirSync(dir, { withFileTypes: true });
  const shots = entries.filter((e) => e.isFile() && e.name.endsWith(".png"));
  const reports = entries.filter((e) => e.isFile() && e.name.endsWith(".json"));
  if (shots.length) groups.push({ prefix, shots, reports });
  for (const entry of entries
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name)))
    visit(join(dir, entry.name), `${prefix}${entry.name}/`);
}
visit(root);
const link = (s) => s.split("/").map(encodeURIComponent).join("/");
const label = (s) => s.replace(/\.png$/, "").replaceAll("-", " ");
const body = groups
  .map(
    ({ prefix, shots, reports }) => `<section>
  <h2>${escape(prefix.replace(/\/$/, "").replaceAll("/", " · "))}</h2>
  <p>${reports.map((r) => `<a href="${link(prefix + r.name)}">${escape(r.name)}</a>`).join(" · ")}</p>
  <div class="grid">${shots
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(
      (s) => `<figure>
    <a href="${link(prefix + s.name)}"><img loading="lazy" src="${link(prefix + s.name)}" alt="${escape(label(s.name))}"></a>
    <figcaption><a href="${link(prefix + s.name)}">${escape(label(s.name))}</a></figcaption>
  </figure>`,
    )
    .join("")}</div>
</section>`,
  )
  .join("");
writeFileSync(
  join(root, "index.html"),
  `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OpenMahjong implementation evidence</title>
<style>
  :root{color-scheme:dark}body{margin:0;background:#142820;color:#f5f0e5;font:16px/1.5 system-ui,sans-serif}
  main{max-width:1440px;margin:auto;padding:32px}h1{font-size:2rem}h2{margin-top:48px}a{color:#dfc16f}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}figure{margin:0;padding:12px;background:#213b2e;border-radius:12px}
  img{display:block;max-width:100%;height:300px;object-fit:contain;object-position:top;margin:auto}figcaption{margin-top:12px}
</style><main><h1>OpenMahjong implementation evidence</h1>
<p>Captured from the working application in Chromium on Linux. All game and account data are synthetic.
390 and 360 pixel captures use mobile viewports; 1440 pixel captures use a desktop viewport.
These are actual browser renderings, not physical phone benchmarks.</p>
<p>Each image opens at its original resolution. Machine-readable reports accompany each workflow.
The <a href="../browser-smoke/report.json">existing browser smoke report</a> and
<a href="../program-verification/">verification logs</a> accompany the evidence archive.</p>
${body}</main></html>\n`,
);
console.log(
  `Indexed ${groups.reduce((n, g) => n + g.shots.length, 0)} screenshots in ${root}/index.html`,
);
