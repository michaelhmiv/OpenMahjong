/** Verify the built public packages without Vite/Vitest source aliases. */
import assert from "node:assert/strict";
import { access } from "node:fs/promises";

for (const name of ["engine", "ai", "coach"]) {
  const specifier = `@openmahjong/${name}`;
  const entry = import.meta.resolve(specifier);
  assert.ok(entry.endsWith(`/packages/${name}/dist/index.js`), `${specifier}: unexpected entry ${entry}`);
  await access(new URL("./index.d.ts", entry));
}

const engine = await import("@openmahjong/engine");
const ai = await import("@openmahjong/ai");
const coach = await import("@openmahjong/coach");

const complete = engine.parseCounts("123m123p123s11122z");
assert.equal(engine.shanten(complete), -1);
assert.equal(ai.shantenFast(complete), -1);
assert.equal(typeof engine.Game, "function");
assert.equal(typeof engine.scoreHand, "function");
assert.equal(typeof ai.createAiPolicy().turn, "function");
assert.equal(typeof coach.adviseDiscard, "function");
assert.equal(typeof coach.tileName(27), "string");

console.log("Built engine, AI, and coach package imports passed.");
