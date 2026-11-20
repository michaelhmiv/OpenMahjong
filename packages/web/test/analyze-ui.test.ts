// @vitest-environment jsdom
/** Analyze UI (brief-analyze-v1): the two scopes render the staged
 * game's numbers — Overall shows 99.5% / 3 misses / 0 blunders with
 * the honesty lock, and Move by move at decision 419 shows the
 * riichi-miss verdict with the staged dama/riichi values. The staged
 * grading build runs once for the whole file (it grades 576
 * decisions through the real coach pipeline). */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import type { Tile } from "@openmahjong/engine";
import { buildAnalyze, type AnalyzeData, type GradeFact } from "../src/analyze.js";
import { mountAnalyze, type AnalyzeUIController } from "../src/analyze-ui.js";
import { initI18n } from "../src/i18n/index.js";

const fixture = JSON.parse(
  readFileSync("packages/web/test/fixtures/om-analyze-1.json", "utf8"),
) as { saved: unknown };

const built = buildAnalyze(fixture.saved);
if (!built.available) throw new Error(`staged game not analyzable: ${built.reason}`);
const data: AnalyzeData = built;

const renderTile = (tile: Tile): HTMLElement => {
  const s = document.createElement("span");
  s.className = "tile";
  s.dataset["type"] = String(tile.type);
  return s;
};

/** Mirror of analyze-ui's symbolForType (sprite symbol per tile type). */
const symbolForType = (type: number): string =>
  type < 9 ? `t-m${type + 1}` : type < 18 ? `t-p${type - 8}` : type < 27 ? `t-s${type - 17}`
    : ["t-ew", "t-sw", "t-ww", "t-nw", "t-haku", "t-hatsu", "t-chun"][type - 27]!;

const useHrefs = (row: Element): (string | null)[] =>
  [...row.querySelectorAll("use")].map((u) => u.getAttribute("href"));

function mountStaged(): { host: HTMLElement; ui: AnalyzeUIController } {
  const host = document.createElement("div");
  document.body.append(host);
  const ui = mountAnalyze(host, { data, renderTile, onBack: () => {} });
  return { host, ui };
}

beforeAll(() => {
  initI18n({ pathname: "/" });
});

describe("Analyze UI — Overall scope (staged game)", () => {
  it("renders the staged accuracy, misses and the honesty lock", () => {
    const { host, ui } = mountStaged();
    const text = host.textContent ?? "";
    expect(text).toContain("99.5%");
    expect(text).toContain("Misses — 3");
    expect(text).toContain("Read this first.");
    expect(text).toContain("The coach grades its own policy");
    expect(text).toContain("It is not a measure of anyone's skill.");
    // The three staged misses: two Seat 2 riichi calls, one Seat 1.
    expect(text).toContain("Stayed silent · Coach: declare");
    expect(text).toContain("Declared riichi · Coach: stay silent");
    expect(text).toContain("Dama ron 1,300 · Riichi ron 2,300");
    expect(text).toContain("Dama ron 8,000 = Riichi ron 8,000");
    expect(text).toContain("Discard misses: 0. Blunders: 0.");
    // Match summary + score spine + per-player detail are present.
    expect(text).toContain("Match summary");
    expect(text).toContain("Score after each hand");
    expect(text).toContain("Key moments — tap to jump");
    expect(text).toContain("Win grade: no samples.");
    ui.destroy();
    host.remove();
  });
});

describe("Analyze UI — Move by move scope (staged game)", () => {
  it("decision 419 shows the riichi-miss verdict with staged values", () => {
    const { host, ui } = mountStaged();
    ui.goToDecision(419);
    const text = host.textContent ?? "";
    expect(text).toContain("Miss — stayed silent, coach says declare");
    expect(text).toContain("Seat 2 · East 2 · Hand 4 · Decision 420 of 576 · Dealer Seat 1");
    // The ron values live in the eval-gap note (lowercase, mid-sentence),
    // not in a compare row — the frame's attribution.
    expect(text).toContain("dama ron 1,300 · riichi ron 2,300");
    expect(text).toContain("Eval change (no combined score yet).");
    expect(text).toContain("The discard itself graded best.");
    // Compare-row attribution (approved frame P2): the Played row
    // carries the played discard's icon, names that discard, and
    // shows its OWN wait and shanten pair; the Coach row names the
    // coach's discard and carries the riichi line's wait, with the
    // wait-tile faces at its right. The riichi line's wait never
    // leads the Played row, and the ron values stay in the eval note.
    const rows = host.querySelectorAll(".an-cmp");
    expect(rows).toHaveLength(2);
    const playedRow = rows[0]!, coachRow = rows[1]!;
    expect(playedRow.textContent).toContain("Played — discard 9 of bamboo, no riichi.");
    expect(playedRow.textContent).toContain("Tenpai · Wait 3 of bamboo (1 unseen)");
    expect(playedRow.textContent).toContain("Shanten 0 → 0");
    expect(playedRow.textContent).not.toContain("5 of bamboo");
    expect(useHrefs(playedRow)).toEqual(["#t-s9"]);
    expect(coachRow.textContent).toContain("Coach — declare riichi, discard 2 of bamboo.");
    expect(coachRow.textContent).toContain("Wait 5 of bamboo (3 unseen) + 8 of bamboo (3 unseen) — 6 unseen, two-sided.");
    expect(coachRow.textContent).not.toContain("Dama ron");
    expect(useHrefs(coachRow)).toEqual(["#t-s2", "#t-s5", "#t-s8"]);
    // The board centre line carries the honba (Repeat 1).
    expect(host.querySelector(".an-eventline")?.textContent).toContain("East 2 · Repeat 1 · 8 tiles left · 2 deposits");
    // The board shows four seats: the reviewed seat face-up, the
    // other three as tile backs.
    expect(host.querySelectorAll(".an-seat")).toHaveLength(4);
    expect(host.querySelectorAll(".an-hand .tile").length).toBeGreaterThan(0);
    expect(host.querySelectorAll(".an-backs .tile").length).toBeGreaterThan(0);
    ui.destroy();
    host.remove();
  });

  it("a declared-riichi miss gives the Coach row the dama line's own facts", () => {
    const entry = data.missesList.find(
      (m) => m.grade.kind === "riichi" && m.grade.declared,
    );
    expect(entry).toBeTruthy();
    const riichi = entry!.grade as Extract<GradeFact, { kind: "riichi" }>;
    expect(riichi.verdict).toBe("dama");
    const discard = entry!.decision.grades.find(
      (g): g is Extract<GradeFact, { kind: "discard" }> => g.kind === "discard",
    )!;
    const { host, ui } = mountStaged();
    ui.goToDecision(entry!.decision.position.decisionIndex);
    const rows = host.querySelectorAll(".an-cmp");
    expect(rows).toHaveLength(2);
    const playedRow = rows[0]!, coachRow = rows[1]!;
    // Played row: the declaration as played — the played discard's
    // icon and name, and the played line's own wait.
    expect(playedRow.textContent).toContain(`declared riichi, discard ${discard.tileName}.`);
    expect(useHrefs(playedRow)).toEqual([`#${symbolForType(discard.tileType)}`]);
    if (discard.shantenAfter === 0 && discard.waits.length) {
      expect(playedRow.textContent).toContain(
        `Wait ${discard.waits[0]!.name} (${discard.waits[0]!.live} unseen)`,
      );
    }
    // Coach row: the dama line — the discard grade's best discard,
    // its icon, and its own wait. Not the riichi line the player took.
    expect(coachRow.textContent).toContain(`discard ${discard.bestTileName}, no riichi.`);
    expect(useHrefs(coachRow)).toEqual([`#${symbolForType(discard.bestTileType)}`]);
    if (discard.bestShantenAfter === 0 && discard.bestWaits.length) {
      expect(coachRow.textContent).toContain(
        `Wait ${discard.bestWaits[0]!.name} (${discard.bestWaits[0]!.live} unseen)`,
      );
    }
    ui.destroy();
    host.remove();
  });

  it("discard rows carry each line's own tile and shanten pair", () => {
    const target = data.decisions.find((d) => {
      const g = d.grades[0];
      return d.grades.length === 1 && g?.kind === "discard" && g.shantenBefore !== null;
    });
    expect(target).toBeTruthy();
    const discard = target!.grades[0] as Extract<GradeFact, { kind: "discard" }>;
    const { host, ui } = mountStaged();
    ui.goToDecision(target!.position.decisionIndex);
    const rows = host.querySelectorAll(".an-cmp");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain(`Discard ${discard.tileName}`);
    expect(rows[0]!.textContent).toContain(`Shanten ${discard.shantenBefore} → ${discard.shantenAfter}`);
    expect(useHrefs(rows[0]!)).toEqual([`#${symbolForType(discard.tileType)}`]);
    expect(rows[1]!.textContent).toContain(`Discard ${discard.bestTileName}`);
    expect(rows[1]!.textContent).toContain(`Shanten ${discard.shantenBefore} → ${discard.bestShantenAfter}`);
    expect(useHrefs(rows[1]!)).toEqual([`#${symbolForType(discard.bestTileType)}`]);
    ui.destroy();
    host.remove();
  });

  it("the segment switches scopes", () => {
    const { host, ui } = mountStaged();
    const buttons = host.querySelectorAll<HTMLButtonElement>(".an-seg button");
    expect(buttons).toHaveLength(2);
    buttons[1]!.click();
    expect(host.textContent).toContain("Event 1 of 1013");
    buttons[0]!.click();
    expect(host.textContent).toContain("Match summary");
    ui.destroy();
    host.remove();
  });
});
