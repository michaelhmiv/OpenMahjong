// @vitest-environment jsdom
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PRACTICE_CARD,
  PRACTICE_CARD_LABEL,
  checkPracticeCard,
  groupGlyph,
  handNotationSpans,
  sectionHands,
  type PracticeCard,
} from "../src/education/american-card.js";
import {
  AMERICAN_LESSONS,
  AMERICAN_PROGRESS_KEY,
  AMERICAN_TRAINING_LINE,
  registerAmericanLessonMounter,
} from "../src/education/american.js";
import {
  buildPrintableCard,
  mountAmericanCard,
} from "../src/american-card-ui.js";
import { App } from "../src/app.js";

/**
 * American training — Practice Card surfaces (brief-american-
 * training-v1; renderings american-card-v1, approved 2026-11-18).
 * Pins: the card's feasibility proof as a repo test, every hand
 * rendering from the shipped data file, the Practice Card label on
 * every card surface, the three ratified notation inks confined to
 * notation styling (design-rules §17), the training-only marking,
 * the lesson-list seam, and the absence of any American game
 * surface.
 */

const WEB = "packages/web";
const cloneCard = (): PracticeCard =>
  JSON.parse(JSON.stringify(PRACTICE_CARD)) as PracticeCard;

describe("practice card data and feasibility", () => {
  it("ships 40 hands across 9 sections under the exact label", () => {
    expect(PRACTICE_CARD.label).toBe(PRACTICE_CARD_LABEL);
    expect(PRACTICE_CARD.sections).toHaveLength(9);
    expect(PRACTICE_CARD.hands).toHaveLength(40);
    for (const section of PRACTICE_CARD.sections) {
      expect(sectionHands(section.id).length).toBeGreaterThan(0);
    }
  });

  it("is feasible: every hand is buildable from the 152-tile set", () => {
    expect(checkPracticeCard(PRACTICE_CARD)).toEqual([]);
  });

  it("the checker has teeth: a fifth copy inside a pair fails", () => {
    const card = cloneCard();
    const sp2 = card.hands.find((h) => h.id === "SP-2")!;
    // Turn three singles into 4s of the pair's suit: five copies of
    // one tile, with the overflow sitting in singles and a pair —
    // the places a joker can never stand. The hand still totals 14
    // and its notation is regenerated, so this one law is the only
    // failure the checker can report.
    const groups = sp2.groups as unknown as {
      kind: string;
      count: number;
      rank?: number;
      suit?: number;
    }[];
    for (const g of groups) {
      if (g.kind === "number" && g.count === 1 && [1, 3, 5].includes(g.rank!)) {
        g.rank = 4;
        g.suit = 2;
      }
    }
    (sp2 as unknown as { notation: string }).notation = sp2.groups
      .map((g) => groupGlyph(g))
      .join(" ");
    const failures = checkPracticeCard(card);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/SP-2: suit2:4/);
    expect(failures[0]).toMatch(/a joker can never fill/);
  });

  it("the checker has teeth: notation drift and wrong minJokers fail", () => {
    const drift = cloneCard();
    (drift.hands[0] as unknown as { notation: string }).notation =
      "999 999 9999 9999";
    expect(checkPracticeCard(drift).join("\n")).toMatch(/notation drift/);
    const jokers = cloneCard();
    (jokers.hands.find((h) => h.id === "QT-1") as unknown as {
      minJokers: number;
    }).minJokers = 0;
    expect(checkPracticeCard(jokers).join("\n")).toMatch(/minJokers/);
  });

  it("every group is a known kind with a legal suit role", () => {
    for (const hand of PRACTICE_CARD.hands) {
      for (const group of hand.groups) {
        expect(["number", "wind", "dragon", "flower"]).toContain(group.kind);
        if (group.kind === "number") expect([0, 1, 2]).toContain(group.suit);
        expect(handNotationSpans(hand)).toHaveLength(hand.groups.length);
      }
    }
  });
});

describe("practice card views", () => {
  let container: HTMLElement;
  let onBack: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.append(container);
    onBack = vi.fn();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("sections sheet: label at foot only, nine rows, key, print", () => {
    const ui = mountAmericanCard(container, { onBack });
    const sheet = container.querySelector(".amc-sheet")!;
    expect(container.querySelector(".amc-title")?.textContent).toBe(
      "Practice Card",
    );
    expect(sheet.querySelector(".amc-cardtitle")?.textContent).toBe(
      PRACTICE_CARD.title,
    );
    // C5: the label prints once, at the panel foot — the head copy
    // under the title was a duplicate of the foot label.
    expect(sheet.querySelector(".amc-label")).toBeNull();
    expect(sheet.querySelector(".amc-footlabel")?.textContent).toBe(
      PRACTICE_CARD_LABEL,
    );
    const rows = [...sheet.querySelectorAll(".amc-sec-row")];
    expect(rows.map((r) => r.querySelector(".nm")?.textContent)).toEqual(
      PRACTICE_CARD.sections.map((s) => s.name),
    );
    expect(rows.map((r) => r.querySelector(".ct")?.textContent)).toEqual(
      PRACTICE_CARD.sections.map(
        (s) => `${sectionHands(s.id).length} hands`,
      ),
    );
    expect(container.textContent).toContain("Print the Practice Card");
    const key = [...container.querySelectorAll(".amc-keyrow")].map(
      (r) => r.textContent ?? "",
    );
    expect(key).toHaveLength(7);
    expect(key.join(" ")).toContain("never as a single or in a pair");
    ui.destroy();
  });

  it("section detail renders every hand from the data, all 40 across sections", () => {
    const ui = mountAmericanCard(container, { onBack });
    let rendered = 0;
    for (const section of PRACTICE_CARD.sections) {
      const row = [...container.querySelectorAll(".amc-sec-row")].find(
        (r) => r.querySelector(".nm")?.textContent === section.name,
      )!;
      row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(container.querySelector(".amc-title")?.textContent).toBe(
        section.name,
      );
      expect(container.querySelector(".amc-blurb")?.textContent).toBe(
        section.blurb,
      );
      const hands = sectionHands(section.id);
      const blocks = [...container.querySelectorAll(".amc-hand")];
      expect(blocks).toHaveLength(hands.length);
      blocks.forEach((block, i) => {
        const hand = hands[i]!;
        const spans = handNotationSpans(hand);
        const glyphs = [...block.querySelectorAll(".amc-notation .g")];
        expect(glyphs.map((g) => g.textContent)).toEqual(
          spans.map((s) => s.text),
        );
        expect(glyphs.map((g) => g.className)).toEqual(
          spans.map((s) => `g ${s.ink}`),
        );
        expect(block.querySelector(".amc-val")?.textContent).toBe(
          String(hand.value),
        );
        expect(block.querySelector(".amc-xc")?.textContent).toBe(
          hand.exposure,
        );
        expect(block.querySelector(".amc-desc")?.textContent).toBe(
          hand.description,
        );
        const joker = block.querySelector(".amc-joker");
        if (hand.minJokers > 0) {
          expect(joker?.textContent).toBe(
            `Needs at least ${hand.minJokers} joker${hand.minJokers === 1 ? "" : "s"}.`,
          );
        } else {
          expect(joker).toBeNull();
        }
        rendered++;
      });
      // The label closes the detail sheet too.
      expect(
        container.querySelector(".amc-sheet .amc-footlabel")?.textContent,
      ).toBe(PRACTICE_CARD_LABEL);
      // Back returns to the sections sheet.
      container
        .querySelector<HTMLButtonElement>("header button")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(container.querySelector(".amc-title")?.textContent).toBe(
        "Practice Card",
      );
    }
    expect(rendered).toBe(40);
    ui.destroy();
  });

  it("back from the sections sheet leaves the card", () => {
    const ui = mountAmericanCard(container, { onBack });
    container
      .querySelector<HTMLButtonElement>("header button")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onBack).toHaveBeenCalledTimes(1);
    ui.destroy();
  });
});

describe("printable card", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("one page: all 40 hands, the label at head and foot, the joker rule in the key", () => {
    const root = buildPrintableCard();
    document.body.append(root);
    expect(root.querySelector(".p-label")?.textContent).toBe(
      PRACTICE_CARD_LABEL,
    );
    expect(root.querySelector(".p-footlabel")?.textContent).toBe(
      PRACTICE_CARD_LABEL,
    );
    expect(root.querySelector(".p-title")?.textContent).toBe(
      PRACTICE_CARD.title,
    );
    expect(root.querySelectorAll(".p-sec")).toHaveLength(9);
    expect(root.querySelectorAll(".p-hand")).toHaveLength(40);
    expect(root.querySelector(".p-key")?.textContent).toContain(
      "jokers are never printed: a joker may stand in only inside a group of three or more, never as a single or in a pair",
    );
    root.remove();
  });

  it("mounting the card mounts the print root; destroying removes it", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const ui = mountAmericanCard(container, { onBack: () => {} });
    expect(document.body.querySelector(".amc-print")).not.toBeNull();
    ui.destroy();
    expect(document.body.querySelector(".amc-print")).toBeNull();
  });
});

describe("notation ink confinement (design-rules §17)", () => {
  const srcDir = resolve(process.cwd(), `${WEB}/src`);
  const files = readdirSync(srcDir, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(".css") || f.endsWith(".ts"));
  const INKS = ["#1e4f7a", "#27632f", "#44554a"];

  it("the three ratified inks appear only in notation rules, never in code", () => {
    for (const ink of INKS) {
      let cssHits = 0;
      for (const file of files) {
        const text = readFileSync(resolve(srcDir, file), "utf8");
        for (const line of text.split("\n")) {
          if (!line.toLowerCase().includes(ink)) continue;
          if (file.endsWith(".ts")) {
            throw new Error(`${ink} appears in code file ${file}: ${line}`);
          }
          cssHits++;
          expect(line, `${ink} in ${file}`).toContain(".amc-notation");
          expect(line, `${ink} in ${file}`).toContain(".p-notation");
        }
      }
      expect(cssHits, `${ink} must style the notation exactly once`).toBe(1);
    }
  });
});

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

describe("learn: the American section", () => {
  let root: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.append(root);
    (HTMLElement.prototype as unknown as { animate: unknown }).animate =
      () => ({
        finished: Promise.resolve(),
        cancel: () => {},
        play: () => {},
        pause: () => {},
      });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
  });

  afterEach(() => {
    registerAmericanLessonMounter(null);
    vi.unstubAllGlobals();
  });

  function americanSection(): HTMLElement {
    return [...root.querySelectorAll<HTMLElement>(".learnsec")].find(
      (w) => w.querySelector('[data-section="american"]'),
    )!;
  }

  async function openLearn(): Promise<void> {
    root
      .querySelector<HTMLButtonElement>('.tabbtn[data-tab="learn"]')!
      .click();
    await settle();
  }

  it("carries the training-only marking, the card entry, and the 11 lesson rows", async () => {
    new App(root);
    await settle();
    await openLearn();
    const section = americanSection();
    expect(section).toBeTruthy();
    const head = section.querySelector(".sechead")!;
    expect(head.querySelector(".secttl")?.textContent).toBe("American");
    expect(head.querySelector(".lenbadge")?.textContent).toBe(
      "TRAINING ONLY",
    );
    expect(head.querySelector(".seccount")?.textContent).toBe(
      "0 of 11 lessons done",
    );
    expect(section.querySelector(".amc-trainline")?.textContent).toBe(
      AMERICAN_TRAINING_LINE,
    );
    const rows = [...section.querySelectorAll(".lrow")];
    expect(rows).toHaveLength(12);
    // The Practice Card entry leads: card glyph slot, title, count.
    expect(rows[0]!.querySelector(".ttl")?.textContent).toBe("Practice Card");
    expect(rows[0]!.querySelector(".st")?.textContent).toBe("40 hands");
    expect(rows.slice(1).map((r) => r.querySelector(".ttl")?.textContent))
      .toEqual(AMERICAN_LESSONS.map((l) => l.title));
    expect(rows.slice(1).map((r) => r.querySelector(".n")?.textContent))
      .toEqual(AMERICAN_LESSONS.map((_, i) => String(i + 1)));
    // Lesson 1 wears the current-row treatment, as rendered.
    expect(rows[1]!.classList.contains("current")).toBe(true);
  });

  it("the card entry opens the card screen without the tab bar", async () => {
    new App(root);
    await settle();
    await openLearn();
    const cardRow = [...americanSection().querySelectorAll(".lrow")].find(
      (r) => r.querySelector(".ttl")?.textContent === "Practice Card",
    )!;
    cardRow.click();
    await settle();
    expect(root.querySelector(".screen.active")?.id).toBe(
      "screen-american-card",
    );
    expect(root.querySelector<HTMLElement>(".tabbar")!.hidden).toBe(true);
    expect(
      root.querySelector("#screen-american-card .amc-cardtitle")
        ?.textContent,
    ).toBe(PRACTICE_CARD.title);
  });

  it("progress from the store drives the count and row states", async () => {
    localStorage.setItem(
      AMERICAN_PROGRESS_KEY,
      JSON.stringify({ completed: ["am-set"], activeId: "am-card" }),
    );
    new App(root);
    await settle();
    await openLearn();
    const section = americanSection();
    expect(
      section.querySelector(".sechead .seccount")?.textContent,
    ).toBe("1 of 11 lessons done");
    const rows = [...section.querySelectorAll(".lrow")].slice(1);
    expect(rows[0]!.querySelector(".st")?.textContent).toContain("Done");
    expect(rows[1]!.querySelector(".st")?.textContent).toBe("In progress");
    expect(rows[1]!.classList.contains("current")).toBe(true);
  });

  it("lesson rows call the registered mounter (the content seam)", async () => {
    const seen: string[] = [];
    new App(root);
    // The App registers the real lesson mounter at construction; a
    // stub registered afterwards replaces it, which is what the
    // seam promises the rows: they call whoever is registered.
    registerAmericanLessonMounter((_container, opts) => {
      seen.push(opts.lessonId);
      return { destroy() {} };
    });
    await settle();
    await openLearn();
    const rows = [...americanSection().querySelectorAll(".lrow")].slice(1);
    rows[4]!.click();
    await settle();
    expect(seen).toEqual(["am-charleston"]);
    expect(root.querySelector(".screen.active")?.id).toBe(
      "screen-american-lesson",
    );
  });

  it("there is no American game surface: Play offers no American", async () => {
    new App(root);
    await settle();
    const home = root.querySelector("#screen-home")!;
    expect(home.textContent).not.toContain("American");
    expect(
      [...home.querySelectorAll("button")].some((b) =>
        /american/i.test(b.textContent ?? ""),
      ),
    ).toBe(false);
  });
});
