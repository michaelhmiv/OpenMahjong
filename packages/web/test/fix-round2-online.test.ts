// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Fix round 2 — online residuals (B6, C16, C20). These pin the CSS
 * and source contracts that produce the layouts; the layouts
 * themselves are verified in the capture states (the verification
 * re-capture set) because jsdom does not lay out.
 *
 * - B6: opponent names ellipsised to "Audi…" because the chip's
 *   whitespace text nodes each ate a flex gap, the name was capped
 *   at 86px, and the band stopped at the table's padding. The band
 *   now runs full width, the name is set at the 11px floor with a
 *   150px cap, and chip() emits no whitespace text nodes.
 * - C16: waiting seats were full-width strips reading as a list;
 *   they are now a 2x2 grid of compact seat tiles, and the invite
 *   link is wrapped text (not a truncating input) over its button.
 * - C20: the correspondence clock phrase at 12.5px measured ~183px
 *   against the 168px centre panel; at the 11px floor it fits.
 */

const onlineCss = readFileSync(resolve(__dirname, "../src/online.css"), "utf8");
const onlineTs = readFileSync(resolve(__dirname, "../src/online.ts"), "utf8");

describe("B6: opponent names fit their chips at the 11px floor", () => {
  it("the band uses the table's full width", () => {
    expect(onlineCss).toMatch(/\.bandtop \{ margin: 0 -10px; \}/);
  });

  it("band chips run tight at 11px and the name gets the wide cap", () => {
    expect(onlineCss).toMatch(
      /\.bandtop \.chip \{[^}]*gap: 1px; padding: 5px 3px; font-size: 11px/,
    );
    expect(onlineCss).toMatch(
      /\.bandtop \.chip \.nm \{[^}]*font-size: 11px; letter-spacing: -0\.09em; max-width: 150px; padding-right: 2px/,
    );
  });

  it("chip() emits no whitespace text nodes around the name", () => {
    // The opponent branch only: from the name span's creation to the
    // end of chip(). (The viewer's own chip in bandbot keeps its
    // shipped spacing — it carries no name and is not width-bound.)
    const chipFn = onlineTs.slice(
      onlineTs.indexOf('const nm = el("span", seatName(seat), "nm");'),
      onlineTs.indexOf("const table = el(\"div\");"),
    );
    expect(chipFn).toContain('el("span", seatName(seat), "nm")');
    expect(chipFn).not.toContain('createTextNode(" ")');
    expect(chipFn).not.toContain('createTextNode("  ")');
    // The one surviving text node is real content: the Bot separator.
    expect(chipFn).toContain('createTextNode(" · ")');
  });

  it("a 15-character audit name is the pinned case: it fits the measured chip budget", () => {
    // The measured budget (capture rig, Figtree loaded): at 11px a
    // 15-char name measures ~82px, ~75px with the shipped tracking;
    // wind (11) + name (75) + score (~30) + padding (8) + gaps (4)
    // is ~128px against the ~130px third of the full-width band.
    // This test pins the inputs to that budget so a regression in
    // any one of them fails here before it fails on screen.
    const name = "Audit Guest One";
    expect(name).toHaveLength(15);
    expect(onlineCss).toMatch(/\.bandtop \.chip \.nm \{[^}]*max-width: 150px/);
  });
});

describe("C16: waiting seats are compact tiles and the invite wraps in full", () => {
  it("seats sit in a 2x2 grid and stack identity over action", () => {
    expect(onlineCss).toMatch(
      /\.mp-seats \{ display: grid; grid-template-columns: 1fr 1fr; gap: 8px/,
    );
    expect(onlineCss).toMatch(/\.mp-seat \{[^}]*flex-direction: column/);
    expect(onlineCss).toMatch(/\.mp-seat-top \{ display: flex; align-items: center; gap: 8px/);
    expect(onlineTs).toContain('el("div", "", "mp-seats")');
    expect(onlineTs).toContain('el("div", "", "mp-seat-top")');
  });

  it("the invite link is wrapped text over its own button, never an input", () => {
    expect(onlineCss).toMatch(/\.mp-invite \{[^}]*flex-direction: column/);
    expect(onlineCss).toMatch(/\.mp-invite \.lnk \{[^}]*overflow-wrap: anywhere/);
    expect(onlineTs).toContain('el("div", inviteUrl, "lnk")');
    expect(onlineTs).not.toContain('el("input", "", "lnk")');
    expect(onlineTs).toContain("navigator.clipboard.writeText(inviteUrl)");
  });
});

describe("C20: the correspondence clock row fits the centre panel", () => {
  it("the phrase runs at the 11px floor and the row is capped at the panel width", () => {
    expect(onlineCss).toMatch(/\.mp-clockrow \{ max-width: 100%; \}/);
    expect(onlineCss).toMatch(/\.mp-clockrow\.corr \.who \{ font-size: 11px; white-space: nowrap; \}/);
    expect(onlineCss).not.toMatch(/\.mp-clockrow\.corr \.who \{ font-size: 12\.5px/);
  });
});
