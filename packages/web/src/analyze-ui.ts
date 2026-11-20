/** Analyze UI (brief-analyze-v1, approved design frames P1–P4).
 * Two scopes reached from a finished game's Review: Overall (match
 * summary, per-player accuracy, misses, biggest swings, score spine,
 * key moments, per-player detail) and Move by move (board panels in
 * the shipped board-review grammar, the decision's grade, the raw
 * chosen-vs-best gap — eval basis D, no combined score, no
 * probability). The honesty lock rides on the Overall scope: the
 * coach grades its own policy, stated plainly. */
import type { Tile } from "@openmahjong/engine";
import { tileById, type TableModel } from "./model.js";
import { formatStandingsPoints } from "./records.js";
import { pluralS, tx } from "./i18n/index.js";
import {
  type AnalyzeData, type AnalyzeMoment, type GradeClass, type GradeFact,
  type GradedDecision, type WaitFact,
} from "./analyze.js";

const WINDS = ["East", "South", "West", "North"];
const SVG_NS = "http://www.w3.org/2000/svg";

/** Plain yaku display names, as the approved frames print them
 * ("Seven pairs", "All simples", "Round wind") — data values
 * interpolated into sentences, like the coach's tile names. */
const YAKU_NAMES: Record<string, string> = {
  riichi: "Riichi", "double-riichi": "Double Riichi", ippatsu: "Ippatsu",
  "menzen-tsumo": "Menzen Tsumo", pinfu: "Pinfu", iipeikou: "Iipeikou",
  ryanpeikou: "Ryanpeikou", tanyao: "All simples",
  "yakuhai-haku": "White dragon", "yakuhai-hatsu": "Green dragon",
  "yakuhai-chun": "Red dragon", "yakuhai-seat": "Seat wind", "yakuhai-round": "Round wind",
  chankan: "Chankan", rinshan: "Rinshan Kaihou", haitei: "Haitei Raoyue",
  houtei: "Houtei Raoyui", chiitoitsu: "Seven pairs", ittsu: "Ittsu",
  "sanshoku-doujun": "Sanshoku Doujun", "sanshoku-doukou": "Sanshoku Doukou",
  sanankou: "Sanankou", sankantsu: "Sankantsu", toitoi: "Toitoi",
  honchan: "Honchantai", shousuushi: "Shousuushi", shousangen: "Shousangen",
  daisangen: "Daisangen", chinroutou: "Chinroutou", honitsu: "Honitsu",
  junchan: "Junchan", honroutou: "Honroutou", chinitsu: "Chinitsu",
  tenhou: "Tenhou", chiihou: "Chiihou", kokushi: "Kokushi Musou",
  "kokushi-13": "Kokushi Musou (13-wait)", suuankou: "Suuankou",
  "suuankou-tanki": "Suuankou Tanki", chuuren: "Chuuren Poutou",
  "chuuren-junsei": "Junsei Chuuren Poutou", daisuushi: "Daisuushi",
  tsuiisou: "Tsuiisou", ryuuiisou: "Ryuuiisou", suukantsu: "Suukantsu",
};

export interface AnalyzeUIOptions {
  readonly data: AnalyzeData;
  readonly renderTile: (tile: Tile) => HTMLElement;
  readonly onBack: () => void;
}
export interface AnalyzeUIController {
  goToDecision(decisionIndex: number): void;
  destroy(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className = "", text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function fmt(n: number): string { return n.toLocaleString("en-US"); }
function fmtSigned(n: number): string { return `${n > 0 ? "+" : ""}${fmt(n)}`; }
function fmtPoints(n: number): string { return `${n > 0 ? "+" : ""}${formatStandingsPoints(n)}`; }
function ordinal(n: number): string {
  const mod100 = n % 100, mod10 = n % 10;
  if (mod10 === 1 && mod100 !== 11) return `${n}st`;
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
  return `${n}th`;
}

/** Sprite symbol for a tile face (same table the app renders with;
 * red fives use their red symbols). */
function symbolFor(tile: Tile): string {
  if (tile.type >= 34 && tile.type < 42) return `t-f${tile.type - 34}`;
  if (tile.type < 9) return tile.red ? "t-m5r" : `t-m${tile.type + 1}`;
  if (tile.type < 18) return tile.red ? "t-p5r" : `t-p${tile.type - 8}`;
  if (tile.type < 27) return tile.red ? "t-s5r" : `t-s${tile.type - 17}`;
  return ["t-ew", "t-sw", "t-ww", "t-nw", "t-haku", "t-hatsu", "t-chun"][tile.type - 27]!;
}
function symbolForType(type: number): string {
  if (type < 9) return `t-m${type + 1}`;
  if (type < 18) return `t-p${type - 8}`;
  if (type < 27) return `t-s${type - 17}`;
  return ["t-ew", "t-sw", "t-ww", "t-nw", "t-haku", "t-hatsu", "t-chun"][type - 27]!;
}
function svgUse(symbol: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 40 56");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `#${symbol}`);
  svg.append(use);
  return svg;
}

export function mountAnalyze(container: HTMLElement, options: AnalyzeUIOptions): AnalyzeUIController {
  const { data } = options;
  const humanSeat = data.humanSeat;
  let destroyed = false;
  let scope: "overall" | "moves" = "overall";
  let cursor = 0;
  let selected: number | null = null;

  const seatName = (seat: number): string =>
    seat === humanSeat ? tx("analyze.you", "You") : tx("analyze.seat-0", `Seat ${seat}`, seat);
  const seatShort = (seat: number): string =>
    seat === humanSeat ? tx("analyze.you", "You") : tx("analyze.s-0", `S${seat}`, seat);
  const seatOrder: number[] = [humanSeat, ...[0, 1, 2, 3].filter((s) => s !== humanSeat)];
  const roundLabel = (roundWind: number, kyoku: number): string =>
    tx("analyze.v-0-1", `${WINDS[roundWind - 27]} ${kyoku}`, WINDS[roundWind - 27], kyoku);
  const handLabel = (handIndex: number): string => {
    const hand = data.hands[handIndex];
    return hand ? roundLabel(hand.roundWind, hand.kyoku) : "";
  };
  const handIndexAt = (eventIndex: number): number => {
    let found = 0;
    for (const hand of data.hands) if (eventIndex >= hand.eventStart) found = hand.index;
    return found;
  };
  const waitsText = (waits: readonly WaitFact[]): string =>
    waits.map((w) => tx("analyze.v-0-1-unseen", `${w.name} (${w.live} unseen)`, w.name, w.live)).join(" + ");
  const accuracyText = (value: number | null): string =>
    value === null ? "—" : tx("analyze.accuracy-value", `${value.toFixed(1)}%`, value.toFixed(1));

  // -- tile elements ---------------------------------------------------------
  const face = (tile: Tile, cls: "t-hand" | "t-pond"): HTMLElement => {
    const inner = options.renderTile(tile);
    inner.classList.add(cls);
    const wrap = el("span", "twrap");
    wrap.append(inner);
    return wrap;
  };
  const faceByType = (type: number, cls: "t-hand" | "t-pond"): HTMLElement => {
    const inner = el("span", `tile ${cls}`);
    inner.setAttribute("role", "img");
    inner.append(svgUse(symbolForType(type)));
    const wrap = el("span", "twrap");
    wrap.append(inner);
    return wrap;
  };
  const back = (): HTMLElement => {
    const inner = el("span", "tile t-back");
    inner.setAttribute("role", "img");
    inner.setAttribute("aria-label", tx("analyze.concealed-tile", "Concealed tile"));
    inner.append(svgUse("t-back"));
    const wrap = el("span", "twrap");
    wrap.append(inner);
    return wrap;
  };

  // -- Overall ---------------------------------------------------------------
  function sectionLabel(text: string): HTMLElement { return el("div", "an-seclab", text); }
  function panel(...children: (Node | string)[]): HTMLElement {
    const node = el("div", "an-panel");
    node.append(...children);
    return node;
  }
  function note(...children: (Node | string)[]): HTMLElement {
    const node = el("p", "an-note");
    node.append(...children);
    return node;
  }
  function rowsPanel(build: (rows: HTMLElement) => void): HTMLElement {
    const rows = el("div", "an-rows");
    build(rows);
    return panel(rows);
  }
  function row(main: (k: HTMLElement) => void, ...values: (string | HTMLElement)[]): HTMLElement {
    const node = el("div", "row");
    const k = el("span", "k");
    main(k);
    node.append(k);
    for (const value of values) {
      if (typeof value === "string") node.append(el("span", "v", value));
      else node.append(value);
    }
    return node;
  }
  function boldLine(k: HTMLElement, boldText: string, rest: string, sub?: string): void {
    k.append(el("b", "", boldText), document.createTextNode(rest));
    if (sub) k.append(el("span", "s", sub));
  }

  function summarySection(): (Node | string)[] {
    const finalHand = data.hands[data.hands.length - 1];
    const dealer = finalHand?.dealer ?? 0;
    const sorted = [...data.settlement].sort((a, b) => a.rank - b.rank || a.seat - b.seat);
    const out: (Node | string)[] = [
      sectionLabel(tx("analyze.match-summary", "Match summary")),
      rowsPanel((rows) => {
        for (const entry of sorted) {
          const wind = WINDS[(entry.seat - dealer + 4) % 4]!;
          rows.append(row(
            (k) => boldLine(k, tx("analyze.v-0-1-2", `${entry.rank} · ${seatName(entry.seat)} · ${wind}`, entry.rank, seatName(entry.seat), wind), ""),
            fmt(entry.score), fmtPoints(entry.points),
          ));
        }
        const lengthWord = data.length === "east" ? tx("analyze.east", "East") : tx("analyze.east-south", "East + South");
        rows.append(note(tx(
          "analyze.v-riichi-0-length-1-hands-seed-2-points-include",
          `Riichi · ${lengthWord} length · ${data.hands.length} hands · Seed ${data.seed}. Points include uma +15/+5/−5/−15 and the 20-point oka to first place.`,
          lengthWord,
          data.hands.length, data.seed,
        )));
      }),
    ];
    return out;
  }

  function accuracySection(): (Node | string)[] {
    const table = el("table", "an-tab");
    const head = el("tr");
    for (const label of [
      tx("analyze.player", "Player"), tx("analyze.accuracy", "Accuracy"),
      tx("analyze.graded", "Graded"), tx("analyze.miss", "Miss"), tx("analyze.blunder", "Blunder"),
    ]) head.append(el("th", "", label));
    table.append(head);
    const addRow = (name: string, graded: number, correct: number, misses: number, blunders: number, total: boolean) => {
      const tr = el("tr", total ? "tot" : "");
      tr.append(el("td", "", name));
      const acc = el("td");
      acc.append(el("b", "", accuracyText(graded ? Math.round((1000 * correct) / graded) / 10 : null)));
      tr.append(acc, el("td", "", String(graded)), el("td", "", String(misses)), el("td", "", String(blunders)));
      table.append(tr);
    };
    for (const seat of seatOrder) {
      const s = data.seats[seat]!;
      addRow(seatName(seat), s.graded, s.correct, s.misses, s.blunders, false);
    }
    addRow(tx("analyze.all-seats", "All seats"), data.overall.graded, data.overall.correct, data.overall.misses, data.overall.blunders, true);
    return [
      sectionLabel(tx("analyze.accuracy-all-seats", "Accuracy — all seats")),
      panel(table, note(tx(
        "analyze.accuracy-correct-graded-one-turn-can-carry-two-g",
        `Accuracy = correct ÷ graded. One turn can carry two grades (discard + riichi), so ${data.totalGrades} grades cover ${data.totalDecisions} decisions.`,
        data.totalGrades, data.totalDecisions,
      ))),
    ];
  }

  function missMain(grade: GradeFact): { main: string; sub: string } {
    switch (grade.kind) {
      case "discard": {
        const sub = grade.shantenDifference === 0
          ? tx("analyze.v-same-shanten-0-fewer-unseen-improving-copies", `Same shanten · ${-grade.unseenImprovingDifference} fewer unseen improving copies`, -grade.unseenImprovingDifference)
          : tx("analyze.v-leaves-0-shanten-coach-leaves-1-shanten", `Leaves ${grade.shantenAfter} shanten · Coach leaves ${grade.bestShantenAfter} shanten`, grade.shantenAfter, grade.bestShantenAfter);
        return {
          main: tx("analyze.v-discarded-0-coach-1", `Discarded ${grade.tileName} · Coach: ${grade.bestTileName}`, grade.tileName, grade.bestTileName),
          sub,
        };
      }
      case "call": {
        const played = {
          pass: tx("analyze.passed", "Passed"), ron: tx("analyze.took-ron", "Took ron"),
          pon: tx("analyze.called-pon", "Called pon"), chi: tx("analyze.called-chi", "Called chi"),
          daiminkan: tx("analyze.called-kan", "Called kan"),
        }[grade.chosenAction] ?? grade.chosenAction;
        const coach = {
          pass: tx("analyze.pass", "pass"), ron: tx("analyze.ron", "ron"),
          pon: tx("analyze.pon", "pon"), chi: tx("analyze.chi", "chi"),
          daiminkan: tx("analyze.kan", "kan"),
        }[grade.recommendedAction] ?? grade.recommendedAction;
        const sub = grade.blunder === "passed-ron"
          ? tx("analyze.v-the-ron-was-worth-0-points", `The ron was worth ${fmt(grade.ronValue ?? 0)} points`, fmt(grade.ronValue ?? 0))
          : grade.blunder === "no-yaku-path"
            ? tx("analyze.the-call-leaves-no-yaku-path", "The call leaves no yaku path.")
            : tx("analyze.v-shanten-0-1-coach-2", `Shanten ${grade.shantenBefore} → ${grade.chosenShantenAfter ?? "—"} · Coach ${grade.recommendedShantenAfter ?? "—"}`, grade.shantenBefore, grade.chosenShantenAfter ?? "—", grade.recommendedShantenAfter ?? "—");
        return { main: tx("analyze.v-0-coach-1", `${played} · Coach: ${coach}`, played, coach), sub };
      }
      case "kan":
        return {
          main: tx("analyze.v-declared-kan-coach-hold", `Declared kan · Coach: hold`),
          sub: grade.blunder === "breaks-chiitoi"
            ? tx("analyze.the-kan-breaks-a-seven-pairs-shape", "The kan breaks a seven-pairs shape.")
            : tx("analyze.v-kan-of-0", `Kan of ${grade.chosenTileName}`, grade.chosenTileName),
        };
      case "riichi": {
        const waitPart = grade.waits.length
          ? tx("analyze.v-wait-0", `Wait ${waitsText(grade.waits)}`, waitsText(grade.waits))
          : "";
        const values = grade.damaRon !== null && grade.riichiRon !== null
          ? grade.damaRon === grade.riichiRon
            ? tx("analyze.v-dama-ron-0-riichi-ron-1", `Dama ron ${fmt(grade.damaRon)} = Riichi ron ${fmt(grade.riichiRon)}`, fmt(grade.damaRon), fmt(grade.riichiRon))
            : tx("analyze.v-dama-ron-0-riichi-ron-1-2", `Dama ron ${fmt(grade.damaRon)} · Riichi ron ${fmt(grade.riichiRon)}`, fmt(grade.damaRon), fmt(grade.riichiRon))
          : "";
        return {
          main: grade.declared
            ? tx("analyze.declared-riichi-coach-stay-silent", "Declared riichi · Coach: stay silent")
            : tx("analyze.stayed-silent-coach-declare", "Stayed silent · Coach: declare"),
          sub: [waitPart, values].filter(Boolean).join(" · "),
        };
      }
      case "win":
        return {
          main: tx("analyze.declined-the-win-coach-take", "Declined the win · Coach: take"),
          sub: tx("analyze.v-tsumo-worth-0-points", `Tsumo worth ${fmt(grade.value)} points`, fmt(grade.value)),
        };
    }
  }

  function missesSection(): (Node | string)[] {
    const out: (Node | string)[] = [
      sectionLabel(tx("analyze.v-misses-0", `Misses — ${data.missesList.length}`, data.missesList.length)),
    ];
    if (!data.missesList.length) {
      out.push(panel(note(tx("analyze.no-misses-or-blunders-in-this-game", "No misses or blunders in this game."))));
      return out;
    }
    out.push(rowsPanel((rows) => {
      for (const { decision, grade } of data.missesList) {
        const position = decision.position;
        const { main, sub } = missMain(grade);
        rows.append(row((k) => boldLine(
          k,
          tx("analyze.v-0-1-hand-2", `${seatName(position.view.seat)} · ${handLabel(position.handIndex)} · Hand ${position.handIndex}`, seatName(position.view.seat), handLabel(position.handIndex), position.handIndex),
          " " + tx("analyze.v-0", ` — ${main}`, main),
          sub || undefined,
        )));
      }
      const sentences: string[] = [];
      if (data.missesList.every((m) => m.grade.kind === "riichi")) {
        sentences.push(tx(
          "analyze.v-all-0-are-riichi-calls-the-policys-riichi-heuri",
          `All ${data.missesList.length} are riichi calls — the policy's riichi heuristic disagreeing with the coach's weighted verdict.`,
          data.missesList.length,
        ));
      }
      sentences.push(tx(
        "analyze.v-discard-misses-0-blunders-1-unseen-copies-may",
        `Discard misses: ${data.missesList.filter((m) => m.grade.kind === "discard").length}. Blunders: ${data.overall.blunders}. Unseen copies may be in opponents' hands or the dead wall.`,
        data.missesList.filter((m) => m.grade.kind === "discard").length, data.overall.blunders,
      ));
      rows.append(note(sentences.join(" ")));
    }));
    return out;
  }

  function swingResultText(handIndex: number): string {
    const hand = data.hands[handIndex];
    if (!hand?.result) return "";
    const result = hand.result;
    if (result.outcome === "drawn-hand") {
      return result.kind === "exhaustive"
        ? tx("analyze.exhaustive-draw", "Exhaustive draw")
        : tx("analyze.abortive-draw", "Abortive draw");
    }
    const value = result.yakumanMultiple > 0
      ? result.yakumanMultiple > 1
        ? tx("analyze.v-0-yakuman", `${result.yakumanMultiple}× yakuman`, result.yakumanMultiple)
        : tx("analyze.yakuman", "Yakuman")
      : tx("analyze.v-0-han-1-fu", `${result.han} han ${result.fu} fu`, result.han, result.fu);
    return result.winType === "ron" && result.fromSeat !== null
      ? tx("analyze.v-0-ron-from-1-2-3", `${seatName(result.winner)} ron from ${seatName(result.fromSeat)} — ${fmt(result.points)} · ${value}`, seatName(result.winner), seatName(result.fromSeat), fmt(result.points), value)
      : tx("analyze.v-0-tsumo-1-2", `${seatName(result.winner)} tsumo — ${fmt(result.points)} · ${value}`, seatName(result.winner), fmt(result.points), value);
  }

  function swingsSection(): (Node | string)[] {
    const top = data.swings.slice(0, 3).filter((s) => s.delta !== 0);
    if (!top.length) return [];
    return [
      sectionLabel(tx("analyze.biggest-swings", "Biggest swings")),
      rowsPanel((rows) => {
        for (const swing of top) {
          const hand = data.hands[swing.handIndex]!;
          const deltas = swing.scoreDelta
            .map((d, seat) => ({ d, seat }))
            .filter((x) => x.d !== 0)
            .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
            .slice(0, 2);
          rows.append(row((k) => boldLine(
            k,
            tx("analyze.v-0-honba-1", `${handLabel(swing.handIndex)} · honba ${hand.honba}`, handLabel(swing.handIndex), hand.honba),
            " " + tx("analyze.v-0", ` — ${swingResultText(swing.handIndex)}`, swingResultText(swing.handIndex)),
            deltas.length
              ? tx("analyze.v-score-change-0", `Score change ${deltas.map((x) => `${seatName(x.seat)} ${fmtSigned(x.d)}`).join(" · ")}`, deltas.map((x) => `${seatName(x.seat)} ${fmtSigned(x.d)}`).join(" · "))
              : undefined,
          )));
        }
      }),
    ];
  }

  function honestyNote(): HTMLElement {
    const node = note();
    node.append(
      el("b", "", tx("analyze.read-this-first", "Read this first.")),
      document.createTextNode(" "),
      document.createTextNode(tx(
        "analyze.v-the-coach-grades-its-own-policy-the-same-polic",
        ` The coach grades its own policy — the same policy that plays the bot seats — so ${accuracyText(data.overall.accuracy)} means play matched that policy. It is not a measure of anyone's skill.`,
        accuracyText(data.overall.accuracy),
      )),
    );
    return node;
  }

  function chartSection(): (Node | string)[] {
    const chart = document.createElementNS(SVG_NS, "svg");
    chart.setAttribute("class", "an-chart");
    chart.setAttribute("viewBox", "0 0 358 150");
    chart.setAttribute("role", "img");
    chart.setAttribute("aria-label", tx("analyze.score-after-each-hand", "Score after each hand"));
    const y = (score: number) => 143.2 - score * 0.00305;
    const x = (i: number) => 28 + i * (324 / Math.max(1, data.trajectory.length - 1));
    const line = (x1: number, y1: number, x2: number, y2: number) => {
      const node = document.createElementNS(SVG_NS, "line");
      node.setAttribute("x1", String(x1)); node.setAttribute("y1", y1.toFixed(1));
      node.setAttribute("x2", String(x2)); node.setAttribute("y2", y2.toFixed(1));
      node.setAttribute("stroke", "var(--line)"); node.setAttribute("stroke-width", "1");
      chart.append(node);
    };
    const text = (content: string, tx_: number, ty: number, anchor = "middle") => {
      const node = document.createElementNS(SVG_NS, "text");
      node.setAttribute("x", String(tx_)); node.setAttribute("y", String(ty));
      node.setAttribute("text-anchor", anchor); node.setAttribute("font-size", "11");
      node.setAttribute("fill", "var(--dim)");
      node.textContent = content;
      chart.append(node);
    };
    for (const gridScore of [10000, 20000, 30000, 40000]) {
      line(28, y(gridScore), 352, y(gridScore));
      text(tx("analyze.v-0k", `${gridScore / 1000}k`, gridScore / 1000), 24, y(gridScore) + 3.5, "end");
    }
    const styles = [
      { stroke: "var(--ink)", width: "2.5", dash: "" },
      { stroke: "var(--state)", width: "2", dash: "5 3" },
      { stroke: "var(--dim)", width: "2", dash: "2 3" },
      { stroke: "var(--deep)", width: "2", dash: "" },
    ];
    seatOrder.forEach((seat, i) => {
      const style = styles[i]!;
      const path = document.createElementNS(SVG_NS, "path");
      const d = data.trajectory.map((scores, j) => `${j === 0 ? "M" : "L"}${x(j).toFixed(1)},${y(scores[seat]!).toFixed(1)}`).join(" ");
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", style.stroke);
      path.setAttribute("stroke-width", style.width);
      if (style.dash) path.setAttribute("stroke-dasharray", style.dash);
      chart.append(path);
      const end = document.createElementNS(SVG_NS, "circle");
      end.setAttribute("cx", x(data.trajectory.length - 1).toFixed(1));
      end.setAttribute("cy", y(data.trajectory[data.trajectory.length - 1]![seat]!).toFixed(1));
      end.setAttribute("r", "3");
      end.setAttribute("fill", style.stroke);
      chart.append(end);
    });
    text(tx("analyze.start", "Start"), x(0), 144);
    for (let j = 1; j < data.trajectory.length; j++) text(String(j), x(j), 144);
    const legend = el("div", "an-legend");
    seatOrder.forEach((seat, i) => {
      const item = el("span");
      const sw = el("span", `sw${i === 1 ? " g" : i === 2 ? " d" : i === 3 ? " p" : ""}`);
      item.append(sw, document.createTextNode(seatName(seat) + " "), el("b", "", fmt(data.finals[seat]!)));
      legend.append(item);
    });
    const top = data.swings[0];
    const swingHand = top ? data.hands[top.handIndex] : undefined;
    const swingClause = top && swingHand?.result
      ? swingHand.result.outcome === "win"
        ? swingHand.result.winType === "ron" && swingHand.result.fromSeat !== null
          ? tx("analyze.v-0s-1-point-ron-from-2", `${seatName(swingHand.result.winner)}'s ${fmt(swingHand.result.points)}-point ron from ${seatName(swingHand.result.fromSeat)}`, seatName(swingHand.result.winner), fmt(swingHand.result.points), seatName(swingHand.result.fromSeat))
          : tx("analyze.v-0s-1-point-tsumo", `${seatName(swingHand.result.winner)}'s ${fmt(swingHand.result.points)}-point tsumo`, seatName(swingHand.result.winner), fmt(swingHand.result.points))
        : tx("analyze.an-exhaustive-draw", "an exhaustive draw")
      : "";
    const swingSentence = top
      ? " " + tx("analyze.v-the-swing-is-the-0-hand-1-2", ` The swing is the ${ordinal(top.handIndex + 1)} hand (${handLabel(top.handIndex)}): ${swingClause}.`, ordinal(top.handIndex + 1), handLabel(top.handIndex), swingClause)
      : "";
    return [
      sectionLabel(tx("analyze.score-after-each-hand", "Score after each hand")),
      panel(
        chart, legend,
        note(tx(
          "analyze.v-scores-after-each-of-the-0-hands-from-the-scor",
          `Scores after each of the ${data.hands.length} hands, from the score events.${swingSentence}`,
          data.hands.length, swingSentence,
        )),
      ),
    ];
  }

  function momentText(moment: AnalyzeMoment): { main: string; sub: string; pill: string } {
    if (moment.kind === "win") {
      const value = (moment.yakumanMultiple ?? 0) > 0
        ? (moment.yakumanMultiple! > 1 ? tx("analyze.v-0-yakuman", `${moment.yakumanMultiple}× yakuman`, moment.yakumanMultiple) : tx("analyze.yakuman", "Yakuman"))
        : tx("analyze.v-0-han-1-fu", `${moment.han ?? 0} han ${moment.fu ?? 0} fu`, moment.han ?? 0, moment.fu ?? 0);
      const yaku = moment.yaku?.length ? ` · ${moment.yaku.map((id) => YAKU_NAMES[id] ?? id).join(", ")}` : "";
      return {
        main: moment.winType === "ron" && moment.fromSeat !== null && moment.fromSeat !== undefined
          ? tx("analyze.v-0-ron-from-1-2", `${seatName(moment.seat)} ron from ${seatName(moment.fromSeat)} · ${fmt(moment.points ?? 0)}`, seatName(moment.seat), seatName(moment.fromSeat), fmt(moment.points ?? 0))
          : tx("analyze.v-0-tsumo-1", `${seatName(moment.seat)} tsumo · ${fmt(moment.points ?? 0)}`, seatName(moment.seat), fmt(moment.points ?? 0)),
        sub: `${value}${yaku}`,
        pill: tx("analyze.win", "Win"),
      };
    }
    if (moment.kind === "riichi") {
      return {
        main: moment.double
          ? tx("analyze.v-0-declared-double-riichi", `${seatName(moment.seat)} declared double riichi`, seatName(moment.seat))
          : tx("analyze.v-0-declared-riichi", `${seatName(moment.seat)} declared riichi`, seatName(moment.seat)),
        sub: tx("analyze.riichi-stick-1000", "Riichi stick 1,000"),
        pill: tx("analyze.riichi", "Riichi"),
      };
    }
    const kanWord = moment.kanKind === "ankan"
      ? { declared: tx("analyze.declared-ankan", "declared ankan"), sub: tx("analyze.closed-kan-new-dora-indicator", "Closed kan · new dora indicator") }
      : moment.kanKind === "shouminkan"
        ? { declared: tx("analyze.declared-shouminkan", "declared shouminkan"), sub: tx("analyze.added-kan-new-dora-indicator", "Added kan · new dora indicator") }
        : { declared: tx("analyze.declared-daiminkan", "declared daiminkan"), sub: tx("analyze.open-kan-new-dora-indicator", "Open kan · new dora indicator") };
    return {
      main: tx("analyze.seat-action", `${seatName(moment.seat)} ${kanWord.declared}`, seatName(moment.seat), kanWord.declared),
      sub: kanWord.sub,
      pill: tx("analyze.kan-2", "Kan"),
    };
  }

  function momentsSection(): (Node | string)[] {
    const wins = data.moments.filter((m) => m.kind === "win").length;
    const riichis = data.moments.filter((m) => m.kind === "riichi").length;
    const kans = data.moments.filter((m) => m.kind === "kan").length;
    const draws = data.hands.filter((h) => h.result?.outcome === "drawn-hand" && h.result.kind === "exhaustive").length;
    return [
      sectionLabel(tx("analyze.key-moments-tap-to-jump", "Key moments — tap to jump")),
      rowsPanel((rows) => {
        for (const moment of data.moments) {
          const hand = data.hands[moment.handIndex]!;
          const { main, sub, pill } = momentText(moment);
          const node = el("button", "row");
          node.type = "button";
          const k = el("span", "k");
          boldLine(k, tx("analyze.v-0-repeat-1", `${handLabel(moment.handIndex)} · Repeat ${hand.honba}`, handLabel(moment.handIndex), hand.honba), " " + tx("analyze.v-0", ` — ${main}`, main), sub);
          node.append(k, el("span", "an-pill", pill));
          node.addEventListener("click", () => jumpToMoment(moment));
          rows.append(node);
        }
        const counts = tx(
          "analyze.v-0-win-1-2-riichi-declaration-3-4-kan-5",
          `${wins} win${pluralS(wins)}, ${riichis} riichi declaration${pluralS(riichis)}, ${kans} kan.`,
          wins, pluralS(wins), riichis, pluralS(riichis), kans,
        );
        rows.append(note(draws
          ? counts + " " + tx(
            "analyze.v-the-0-exhaustive-draw-1-are-not-listed-as-jump",
            ` The ${draws} exhaustive draw${pluralS(draws)} are not listed as jump targets.`,
            draws, pluralS(draws),
          )
          : counts));
      }),
    ];
  }

  function kindNote(): string {
    const kinds: { kind: "discard" | "call" | "kan" | "riichi" | "win"; label: string; plural: string }[] = [
      { kind: "discard", label: tx("analyze.discard", "Discard"), plural: tx("analyze.discard-2", "discard") },
      { kind: "call", label: tx("analyze.call", "Call"), plural: tx("analyze.call-2", "call") },
      { kind: "kan", label: tx("analyze.kan-2", "Kan"), plural: tx("analyze.kan-3", "kan") },
      { kind: "riichi", label: tx("analyze.riichi", "Riichi"), plural: tx("analyze.riichi-2", "riichi") },
      { kind: "win", label: tx("analyze.win", "Win"), plural: tx("analyze.win-2", "win") },
    ];
    const sentences: string[] = [];
    const clean: string[] = [];
    for (const { kind, label, plural } of kinds) {
      const withMisses = seatOrder.filter((seat) => {
        const t = data.seats[seat]!.byKind[kind];
        return t.total > 0 && t.correct < t.total;
      });
      if (withMisses.length) {
        const went = withMisses.map((seat) => tx(
          "analyze.v-0-went-1-2",
          `${seatName(seat)} went ${data.seats[seat]!.byKind[kind].correct}/${data.seats[seat]!.byKind[kind].total}`,
          seatName(seat), data.seats[seat]!.byKind[kind].correct, data.seats[seat]!.byKind[kind].total,
        )).join(", ");
        sentences.push(tx(
          "analyze.v-0-is-where-the-misses-live-1",
          `${label} is where the misses live: ${went}.`,
          label, went,
        ));
      } else if (seatOrder.some((seat) => data.seats[seat]!.byKind[kind].total > 0)) {
        clean.push(plural);
      }
    }
    if (clean.length && sentences.length) {
      sentences.push(tx(
        "analyze.v-every-0-decision-in-this-game-matched-the-coach",
        `Every ${clean.join(", ")} decision in this game matched the coach.`,
        clean.join(", "),
      ));
    }
    if (!sentences.length) sentences.push(tx("analyze.every-graded-decision-in-this-game-matched-the-c", "Every graded decision in this game matched the coach."));
    return sentences.join(" ");
  }

  function playerSection(): (Node | string)[] {
    const table = (headers: string[], rowsData: (string[])[]): HTMLTableElement => {
      const node = el("table", "an-tab");
      const head = el("tr");
      for (const label of headers) head.append(el("th", "", label));
      node.append(head);
      for (const cells of rowsData) {
        const tr = el("tr");
        cells.forEach((cell, i) => tr.append(el("td", "", cell)));
        node.append(tr);
      }
      return node;
    };
    const seatHeaders = seatOrder.map((seat) => seatShort(seat));
    const kindRows: [string, "discard" | "call" | "kan" | "riichi" | "win"][] = [
      [tx("analyze.discard", "Discard"), "discard"],
      [tx("analyze.call", "Call"), "call"],
      [tx("analyze.kan-2", "Kan"), "kan"],
      [tx("analyze.riichi", "Riichi"), "riichi"],
      [tx("analyze.win", "Win"), "win"],
    ];
    const byKind = table(
      [tx("analyze.decision", "Decision"), ...seatHeaders],
      kindRows.map(([label, kind]) => [
        label,
        ...seatOrder.map((seat) => {
          const t = data.seats[seat]!.byKind[kind];
          return `${t.correct}/${t.total}`;
        }),
      ]),
    );
    const handStats = table(
      [tx("analyze.hand-stat", "Hand stat"), ...seatHeaders],
      [
        [tx("analyze.hands", "Hands"), ...seatOrder.map((seat) => String(data.seats[seat]!.handStats.hands))],
        [tx("analyze.riichi-declared", "Riichi declared"), ...seatOrder.map((seat) => String(data.seats[seat]!.handStats.riichi))],
        [tx("analyze.deal-ins", "Deal-ins"), ...seatOrder.map((seat) => String(data.seats[seat]!.handStats.dealIns))],
        [tx("analyze.hands-won", "Hands won"), ...seatOrder.map((seat) => String(data.seats[seat]!.handStats.handsWon))],
        [tx("analyze.win-points", "Win points"), ...seatOrder.map((seat) => fmt(data.seats[seat]!.handStats.winPoints))],
        [tx("analyze.tenpai-at-draws", "Tenpai at draws"), ...seatOrder.map((seat) => {
          const s = data.seats[seat]!.handStats;
          return s.exhaustiveDraws ? `${s.tenpaiDraws}/${s.exhaustiveDraws}` : "—";
        })],
      ],
    );
    const averages = table(
      [tx("analyze.average", "Average"), ...seatHeaders],
      [
        [tx("analyze.avg-shanten-after-discard", "Avg shanten after discard"), ...seatOrder.map((seat) => data.seats[seat]!.avgShantenAfter?.toFixed(1) ?? "—")],
        [tx("analyze.avg-improving-copies", "Avg improving copies"), ...seatOrder.map((seat) => data.seats[seat]!.avgImprovingTotal?.toFixed(1) ?? "—")],
      ],
    );
    const spacer = el("div");
    spacer.style.height = "14px";
    const out: (Node | string)[] = [
      sectionLabel(tx("analyze.decisions-by-kind-best-total", "Decisions by kind — best / total")),
      panel(byKind, note(kindNote())),
      sectionLabel(tx("analyze.hand-stats-averages", "Hand stats & averages")),
      panel(
        handStats, spacer, averages,
        note(tx("analyze.improving-copies-are-unseen-copies-they-may-sit", "Improving copies are unseen copies — they may sit in opponents' hands or the dead wall, not necessarily the live wall.")),
      ),
    ];
    if (data.winGrades === 0) {
      const ronClause = data.winsTotal > 0 && data.ronWins === data.winsTotal
        ? " " + tx("analyze.v-all-0-wins-were-ron", ` (all ${data.winsTotal} wins were ron)`, data.winsTotal)
        : "";
      const reason = data.tsumoOffered === 0
        ? tx(
          "analyze.v-no-tsumo-was-ever-offered-in-this-game-0-so-ta",
          `No tsumo was ever offered in this game${ronClause}, so take-vs-decline has nothing to grade.`,
          ronClause,
        )
        : tx("analyze.no-win-decision-could-be-graded-in-this-game", "No win decision could be graded in this game.");
      const node = note();
      node.append(el("b", "", tx("analyze.win-grade-no-samples", "Win grade: no samples.")), document.createTextNode(" " + reason));
      out.push(node);
    }
    return out;
  }

  function renderOverall(host: HTMLElement): void {
    host.append(
      ...summarySection(),
      ...accuracySection(),
      ...missesSection(),
      ...swingsSection(),
      honestyNote(),
      ...chartSection(),
      ...momentsSection(),
      ...playerSection(),
    );
  }

  // -- Move by move ------------------------------------------------------------
  let boardHost: HTMLElement | null = null;
  let panelHost: HTMLElement | null = null;
  let stripHost: HTMLElement | null = null;
  let fillEl: HTMLElement | null = null;
  let knobEl: HTMLElement | null = null;
  let labEl: HTMLElement | null = null;
  let handEl: HTMLElement | null = null;
  let navButtons: { prev: HTMLButtonElement; next: HTMLButtonElement } | null = null;
  let movesNoteEl: HTMLElement | null = null;

  function classWord(cls: GradeClass): string {
    switch (cls) {
      case "best": return tx("analyze.best", "Best");
      case "equivalent": return tx("analyze.equivalent", "Equivalent");
      case "better-shanten": return tx("analyze.better-than-the-coachs-pick", "Better than the coach's pick");
      case "minor-miss": return tx("analyze.minor-miss", "Minor miss");
      case "miss": return tx("analyze.miss", "Miss");
      case "blunder": return tx("analyze.blunder", "Blunder");
    }
  }
  function classSeverity(cls: GradeClass): number {
    return cls === "blunder" ? 4 : cls === "miss" ? 3 : cls === "minor-miss" ? 2 : 0;
  }
  function kindPriority(kind: GradeFact["kind"]): number {
    return kind === "riichi" ? 0 : kind === "win" ? 1 : kind === "call" ? 2 : kind === "kan" ? 3 : 4;
  }
  function headlineGrade(decision: GradedDecision): GradeFact {
    let bestGrade = decision.grades[0]!;
    for (const grade of decision.grades.slice(1)) {
      const sev = classSeverity(grade.grade) - classSeverity(bestGrade.grade);
      if (sev > 0 || (sev === 0 && kindPriority(grade.kind) < kindPriority(bestGrade.kind))) bestGrade = grade;
    }
    return bestGrade;
  }

  function verdictLine(grade: GradeFact, decision: GradedDecision): string {
    const word = classWord(grade.grade);
    const position = decision.position;
    switch (grade.kind) {
      case "discard":
        if (grade.grade === "best") return tx("analyze.best-discard", "Best — the coach's pick");
        if (grade.grade === "better-shanten") return tx("analyze.v-better-than-the-coachs-pick-fewer-steps-from-re", `Better than the coach's pick — fewer steps from ready`);
        if (grade.grade === "equivalent") return tx("analyze.v-equivalent-same-speed-equal-or-wider", `Equivalent — same speed, equal or wider`);
        return tx("analyze.v-0-discard-1-coach-2", `${word} — discard ${grade.tileName} · Coach: ${grade.bestTileName}`, word, grade.tileName, grade.bestTileName);
      case "call": {
        const played = {
          pass: tx("analyze.passed-2", "passed"), ron: tx("analyze.took-ron-2", "took ron"),
          pon: tx("analyze.called-pon-2", "called pon"), chi: tx("analyze.called-chi-2", "called chi"),
          daiminkan: tx("analyze.called-kan-2", "called kan"),
        }[grade.chosenAction] ?? grade.chosenAction;
        const coach = {
          pass: tx("analyze.pass-2", "pass"), ron: tx("analyze.take-ron", "take ron"),
          pon: tx("analyze.call-pon", "call pon"), chi: tx("analyze.call-chi", "call chi"),
          daiminkan: tx("analyze.call-kan", "call kan"),
        }[grade.recommendedAction] ?? grade.recommendedAction;
        const target = grade.tileName
          ? " " + tx("analyze.v-on-the-0", ` on the ${grade.tileName}`, grade.tileName)
          : "";
        return tx("analyze.v-0-played-1-coach-says-2-3", `${word} — played ${played}, coach says ${coach}${target}`, word, played, coach, target);
      }
      case "kan":
        return tx("analyze.v-0-declared-kan-coach-says-hold", `${word} — declared kan, coach says hold`, word);
      case "riichi":
        return grade.declared
          ? tx("analyze.v-0-declared-riichi-coach-says-stay-silent", `${word} — declared riichi, coach says stay silent`, word)
          : tx("analyze.v-0-stayed-silent-coach-says-declare", `${word} — stayed silent, coach says declare`, word);
      case "win":
        return grade.took
          ? tx("analyze.best-took-the-win", "Best — took the win")
          : tx("analyze.v-0-declined-the-win-coach-says-take", `${word} — declined the win, coach says take`, word);
      default:
        void position;
        return word;
    }
  }

  function evalGapNote(grade: GradeFact): string {
    const lead = tx("analyze.eval-change-no-combined-score-yet", "Eval change (no combined score yet).");
    switch (grade.kind) {
      case "discard": {
        if (grade.grade === "best") return `${lead} ${tx("analyze.no-gap-the-played-discard-is-the-coachs-pick", "No gap — the played discard is the coach's pick.")}`;
        const parts: string[] = [];
        if (grade.shantenDifference > 0) {
          parts.push(tx("analyze.v-0-more-1-from-ready", `${grade.shantenDifference} more ${grade.shantenDifference === 1 ? tx("analyze.step", "step") : tx("analyze.steps", "steps")} from ready`, grade.shantenDifference, grade.shantenDifference === 1 ? tx("analyze.step", "step") : tx("analyze.steps", "steps")));
        } else if (grade.shantenDifference < 0) {
          parts.push(tx("analyze.v-0-fewer-1-from-ready", `${-grade.shantenDifference} fewer ${-grade.shantenDifference === 1 ? tx("analyze.step", "step") : tx("analyze.steps", "steps")} from ready`, -grade.shantenDifference, -grade.shantenDifference === 1 ? tx("analyze.step", "step") : tx("analyze.steps", "steps")));
        }
        if (grade.unseenImprovingDifference < 0) {
          parts.push(tx("analyze.v-0-fewer-unseen-improving-copies", `${-grade.unseenImprovingDifference} fewer unseen improving copies`, -grade.unseenImprovingDifference));
        } else if (grade.unseenImprovingDifference > 0) {
          parts.push(tx("analyze.v-0-more-unseen-improving-copies", `${grade.unseenImprovingDifference} more unseen improving copies`, grade.unseenImprovingDifference));
        }
        if (!parts.length) parts.push(tx("analyze.same-shanten-same-unseen-improving-copies", "Same shanten, same unseen improving copies."));
        return tx("analyze.v-0-the-played-discard-leaves-1-than-the-coachs", `${lead} The played discard leaves ${parts.join(", ")} than the coach's pick.`, lead, parts.join(", "));
      }
      case "call":
        return tx(
          "analyze.v-0-the-gap-is-the-call-itself-the-coach-weights",
          `${lead} The gap is the call itself: the coach weights shanten, improving copies and yaku path; the position after the played call and after the coach's choice differ by that choice, not by a single number.`,
          lead,
        );
      case "kan":
        return tx(
          "analyze.v-0-the-gap-is-the-kan-itself-the-coach-holds-it",
          `${lead} The gap is the kan itself: the coach holds it back for this hand shape; the gap is not a single number.`,
          lead,
        );
      case "riichi": {
        const base = grade.damaRon !== null && grade.riichiRon !== null
          ? tx("analyze.v-0-the-gap-is-the-riichi-call-itself-dama-ron-1", `${lead} The gap is the riichi call itself: dama ron ${fmt(grade.damaRon)} · riichi ron ${fmt(grade.riichiRon)} — a minimum, ura dora excluded.`, lead, fmt(grade.damaRon), fmt(grade.riichiRon))
          : tx("analyze.v-0-the-gap-is-the-riichi-call-itself", `${lead} The gap is the riichi call itself.`, lead);
        const tail = grade.grade === "miss"
          ? ` ${tx("analyze.a-miss-not-a-blunder-the-policy-heuristic-differs", "A miss, not a blunder — the policy heuristic differs from the coach's weighted verdict here.")}`
          : grade.grade === "blunder"
            ? ` ${tx("analyze.a-blunder-the-coachs-verdict-is-dama-with-the-le", "A blunder: the coach's verdict is dama with the leader late in the game.")}`
            : "";
        return base + tail;
      }
      case "win":
        return tx(
          "analyze.v-0-the-gap-is-the-win-itself-taking-it-was-worth",
          `${lead} The gap is the win itself: taking it was worth ${fmt(grade.value)} points.`,
          lead, fmt(grade.value),
        );
    }
  }

  function playedCoachRows(grade: GradeFact, decision: GradedDecision, panelNode: HTMLElement): void {
    const discardGrade = decision.grades.find((g): g is Extract<GradeFact, { kind: "discard" }> => g.kind === "discard");
    const cmpRow = (label: string, mainText: string, sub: string, tiles: readonly number[], trailingTiles: readonly number[] = []): void => {
      const node = el("div", "an-cmp");
      if (tiles.length) {
        const faces = el("span", "faces");
        for (const type of tiles) faces.append(faceByType(type, "t-pond"));
        node.append(faces);
      }
      const text = el("span", "tx");
      text.append(el("b", "", tx("analyze.label-dash-text", `${label} — ${mainText}`, label, mainText)));
      if (sub) text.append(el("span", "s", sub));
      node.append(text);
      // Wait-tile faces at the right, as the approved frame shows them
      // on the coach's riichi row.
      if (trailingTiles.length) {
        const faces = el("span", "faces");
        for (const type of trailingTiles) faces.append(faceByType(type, "t-pond"));
        node.append(faces);
      }
      panelNode.append(node);
    };
    const tenpaiFacts = (shanten: number, waits: readonly WaitFact[], improvingTotal: number): string =>
      shanten === 0
        ? tx("analyze.v-tenpai-wait-0", `Tenpai · Wait ${waitsText(waits)}`, waitsText(waits))
        : tx("analyze.v-0-shanten-1-unseen-improving-copies", `${shanten} shanten · ${improvingTotal} unseen improving copies`, shanten, improvingTotal);
    const shantenPair = (before: number | null, after: number): string =>
      before === null ? "" : tx("analyze.v-shanten-0-1", `Shanten ${before} → ${after}`, before, after);
    // One line's own facts: its tenpai/wait position plus its shanten
    // pair (before → after this action).
    const lineFacts = (shantenBefore: number | null, shantenAfter: number, waits: readonly WaitFact[], improvingTotal: number): string =>
      [tenpaiFacts(shantenAfter, waits, improvingTotal), shantenPair(shantenBefore, shantenAfter)].filter(Boolean).join(" · ");
    switch (grade.kind) {
      case "discard": {
        if (discardGrade) {
          cmpRow(tx("analyze.played", "Played"),
            tx("analyze.v-discard-0", `Discard ${discardGrade.tileName}`, discardGrade.tileName),
            lineFacts(discardGrade.shantenBefore, discardGrade.shantenAfter, discardGrade.waits, discardGrade.improvingTotal),
            [discardGrade.tileType]);
          cmpRow(tx("analyze.coach", "Coach"),
            tx("analyze.v-discard-0-2", `Discard ${discardGrade.bestTileName}`, discardGrade.bestTileName),
            lineFacts(discardGrade.shantenBefore, discardGrade.bestShantenAfter, discardGrade.bestWaits, discardGrade.bestImprovingTotal),
            [discardGrade.bestTileType]);
        }
        break;
      }
      case "call": {
        const verb = {
          pass: tx("analyze.passed-3", "Passed"), ron: tx("analyze.took-ron-3", "Took ron"),
          pon: tx("analyze.called-pon-3", "Called pon"), chi: tx("analyze.called-chi-3", "Called chi"),
          daiminkan: tx("analyze.called-kan-3", "Called kan"),
        }[grade.chosenAction] ?? grade.chosenAction;
        const coachVerb = {
          pass: tx("analyze.pass-3", "Pass"), ron: tx("analyze.take-ron-2", "Take ron"),
          pon: tx("analyze.call-pon-2", "Call pon"), chi: tx("analyze.call-chi-2", "Call chi"),
          daiminkan: tx("analyze.call-kan-2", "Call kan"),
        }[grade.recommendedAction] ?? grade.recommendedAction;
        const shantenSub = (after: number | null) => after === null
          ? ""
          : tx("analyze.v-shanten-0-1", `Shanten ${grade.shantenBefore} → ${after}`, grade.shantenBefore, after);
        cmpRow(tx("analyze.played", "Played"), verb,
          grade.chosenAction === "ron" && grade.ronValue !== null
            ? tx("analyze.v-ron-worth-0-points", `Ron worth ${fmt(grade.ronValue)} points`, fmt(grade.ronValue))
            : shantenSub(grade.chosenShantenAfter),
          [grade.tileType]);
        cmpRow(tx("analyze.coach", "Coach"), coachVerb,
          grade.recommendedAction === "ron" && grade.ronValue !== null
            ? tx("analyze.v-ron-worth-0-points-2", `Ron worth ${fmt(grade.ronValue)} points`, fmt(grade.ronValue))
            : shantenSub(grade.recommendedShantenAfter),
          [grade.tileType]);
        break;
      }
      case "kan": {
        cmpRow(tx("analyze.played", "Played"), tx("analyze.declared-kan", "Declared kan"), grade.chosenTileName, [grade.chosenTileType]);
        cmpRow(tx("analyze.coach", "Coach"),
          grade.recommended
            ? tx("analyze.v-declare-kan-0", `Declare kan · ${grade.recommended.tileName}`, grade.recommended.tileName)
            : tx("analyze.hold", "Hold"),
          "", grade.recommended ? [grade.recommended.tileType] : []);
        break;
      }
      case "riichi": {
        // Each row renders its OWN line's facts (approved frame P2).
        // The played line is the discard actually made — the paired
        // discard grade. The coach's riichi line is the riichi grade's
        // own discard and wait; the coach's dama line is the discard
        // grade's best line. The riichi grade's wait belongs to the
        // coach's riichi line only: it never leads the Played row, and
        // the ron values live in the eval-gap note, not in a row.
        if (discardGrade) {
          const playedMain = grade.declared
            ? tx("analyze.v-declared-riichi-discard-0", `declared riichi, discard ${discardGrade.tileName}.`, discardGrade.tileName)
            : tx("analyze.v-discard-0-no-riichi", `discard ${discardGrade.tileName}, no riichi.`, discardGrade.tileName);
          const playedSub = [
            lineFacts(discardGrade.shantenBefore, discardGrade.shantenAfter, discardGrade.waits, discardGrade.improvingTotal),
            tx("analyze.v-the-discard-itself-graded-0", `The discard itself graded ${classWord(discardGrade.grade).toLowerCase()}.`, classWord(discardGrade.grade).toLowerCase()),
          ].filter(Boolean).join(" · ");
          cmpRow(tx("analyze.played", "Played"), playedMain, playedSub, [discardGrade.tileType]);
        }
        // The coach's row shows the line the coach prefers — or, when
        // the verdict is "either", the line the player did not take.
        const coachRiichi = grade.verdict === "declare" || (grade.verdict === "either" && !grade.declared);
        if (coachRiichi) {
          const waitSub = !grade.waits.length
            ? ""
            : grade.waits.length === 1
              ? tx("analyze.v-wait-0-3", `Wait ${waitsText(grade.waits)}.`, waitsText(grade.waits))
              : grade.twoSided
                ? tx("analyze.v-wait-0-1-unseen-two-sided", `Wait ${waitsText(grade.waits)} — ${grade.liveTotal} unseen, two-sided.`, waitsText(grade.waits), grade.liveTotal)
                : tx("analyze.v-wait-0-1-unseen-2", `Wait ${waitsText(grade.waits)} — ${grade.liveTotal} unseen.`, waitsText(grade.waits), grade.liveTotal);
          cmpRow(tx("analyze.coach", "Coach"),
            tx("analyze.v-declare-riichi-discard-0", `declare riichi, discard ${grade.tileName}.`, grade.tileName),
            waitSub,
            [grade.tileType],
            grade.waits.map((w) => w.type));
        } else if (discardGrade) {
          cmpRow(tx("analyze.coach", "Coach"),
            tx("analyze.v-discard-0-no-riichi", `discard ${discardGrade.bestTileName}, no riichi.`, discardGrade.bestTileName),
            lineFacts(discardGrade.shantenBefore, discardGrade.bestShantenAfter, discardGrade.bestWaits, discardGrade.bestImprovingTotal),
            [discardGrade.bestTileType]);
        }
        break;
      }
      case "win": {
        cmpRow(tx("analyze.played", "Played"), grade.took ? tx("analyze.took-the-win", "Took the win") : tx("analyze.declined-the-win", "Declined the win"), "", []);
        cmpRow(tx("analyze.coach", "Coach"), tx("analyze.take", "Take"),
          tx("analyze.v-tsumo-worth-0-points-2", `Tsumo worth ${fmt(grade.value)} points`, fmt(grade.value)), []);
        break;
      }
    }
  }

  function seatHead(model: TableModel, seat: number, reviewed: boolean): HTMLElement {
    const player = model.players[seat]!;
    const head = el("div", "an-seathead");
    let label = tx("analyze.wind-name", `${WINDS[player.seatWind - 27]}`, WINDS[player.seatWind - 27]);
    if (reviewed) label += " " + tx("analyze.v-0-2", ` · ${seatName(seat)}`, seatName(seat));
    head.append(document.createTextNode(label));
    if (player.riichi || player.doubleRiichi) {
      const stick = el("span", "an-stick");
      stick.setAttribute("aria-label", tx("analyze.in-riichi", "In riichi"));
      head.append(stick);
    }
    head.append(el("span", "sc", fmt(player.score)));
    return head;
  }

  function boardFor(model: TableModel, reviewedSeat: number, decision: GradedDecision | null): HTMLElement {
    const board = el("div", "an-board");
    const seatCell = (seat: number): HTMLElement => {
      const player = model.players[seat]!;
      const cell = el("div", "an-seat");
      cell.append(seatHead(model, seat, seat === reviewedSeat));
      if (seat === reviewedSeat) {
        const hand = el("div", "an-hand");
        const drawnEvent = decision && decision.position.eventSequence === cursor
          ? data.timeline.data.events[cursor]
          : undefined;
        const drawnId = drawnEvent?.type === "draw" ? Number(drawnEvent["tileId"]) : undefined;
        const ids = [...player.handIds].sort((a, b) => {
          const ta = tileById(a), tb = tileById(b);
          return ta.type - tb.type || (ta.red ? 1 : 0) - (tb.red ? 1 : 0) || a - b;
        });
        for (const id of ids) {
          const tile = tileById(id);
          const wrap = face(tile, "t-hand");
          if (id === drawnId) wrap.firstElementChild?.classList.add("drawn");
          hand.append(wrap);
        }
        cell.append(hand);
      } else {
        const backs = el("div", "an-backs");
        for (let n = 0; n < player.handIds.length; n++) backs.append(back());
        cell.append(backs);
      }
      if (player.melds.length) {
        const melds = el("div", "an-melds");
        for (const meld of player.melds) {
          const group = el("span", "meld");
          for (const tile of meld.tiles) group.append(face(tile, "t-pond"));
          melds.append(group);
        }
        cell.append(melds);
      }
      return cell;
    };
    board.append(seatCell((reviewedSeat + 2) % 4));
    const middle = el("div", "an-seatrow");
    middle.append(seatCell((reviewedSeat + 3) % 4), seatCell((reviewedSeat + 1) % 4));
    board.append(middle);
    const center = el("div", "an-eventline");
    const hand = data.hands[handIndexAt(cursor)];
    const centreLabel = hand && hand.honba > 0
      ? tx("analyze.v-0-repeat-1", `${handLabel(hand.index)} · Repeat ${hand.honba}`, handLabel(hand.index), hand.honba)
      : hand ? handLabel(hand.index) : "";
    center.append(document.createTextNode(tx(
      "analyze.v-0-1-tiles-left-2-deposit-3-dora",
      `${centreLabel} · ${model.wallRemaining} tiles left · ${model.sticks} deposit${pluralS(model.sticks)} · Dora`,
      centreLabel, model.wallRemaining, model.sticks, pluralS(model.sticks),
    )));
    for (const tile of model.doraIndicators) {
      const holder = el("span", "an-dora");
      holder.append(svgUse(symbolFor(tile)));
      center.append(holder);
    }
    board.append(center, seatCell(reviewedSeat));
    return board;
  }

  function renderMovesStatic(host: HTMLElement): void {
    boardHost = el("div");
    panelHost = el("div");
    stripHost = el("div");
    host.append(boardHost, panelHost);
    const strip = el("div", "an-strip");
    stripHost = strip;
    host.append(strip);
    const sliderWrap = el("div", "an-slider");
    const track = el("div", "track");
    fillEl = el("div", "fill");
    knobEl = el("div", "knob");
    const hit = el("div", "hit");
    hit.tabIndex = 0;
    hit.setAttribute("role", "slider");
    hit.setAttribute("aria-label", tx("analyze.event-position", "Event position"));
    track.append(fillEl, knobEl, hit);
    const labs = el("div", "labs");
    labEl = el("span");
    handEl = el("span");
    labs.append(labEl, handEl);
    sliderWrap.append(track, labs);
    host.append(sliderWrap);
    const navRow = (prevLabel: string, nextLabel: string, onPrev: () => void, onNext: () => void) => {
      const nav = el("div", "an-navrow");
      const prev = el("button", "an-nav", prevLabel);
      prev.type = "button";
      const next = el("button", "an-nav", nextLabel);
      next.type = "button";
      prev.addEventListener("click", onPrev);
      next.addEventListener("click", onNext);
      nav.append(prev, next);
      host.append(nav);
      return { prev, next };
    };
    navButtons = navRow(
      tx("analyze.previous-decision", "‹ Previous decision"), tx("analyze.next-decision", "Next decision ›"),
      () => stepDecision(-1), () => stepDecision(1),
    );
    navRow(
      tx("analyze.previous-event", "‹ Previous event"), tx("analyze.next-event", "Next event ›"),
      () => seekEvent(cursor - 1), () => seekEvent(cursor + 1),
    );
    movesNoteEl = note();
    host.append(movesNoteEl);
    const seekFromPointer = (event: PointerEvent) => {
      const rect = track.getBoundingClientRect();
      if (!rect.width) return;
      const frac = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      seekEvent(Math.round(frac * (data.timeline.data.events.length - 1)));
    };
    hit.addEventListener("pointerdown", (event) => {
      hit.setPointerCapture(event.pointerId);
      seekFromPointer(event);
      const move = (ev: PointerEvent) => seekFromPointer(ev);
      const up = () => {
        hit.removeEventListener("pointermove", move);
        hit.removeEventListener("pointerup", up);
        hit.removeEventListener("pointercancel", up);
      };
      hit.addEventListener("pointermove", move);
      hit.addEventListener("pointerup", up);
      hit.addEventListener("pointercancel", up);
    });
    hit.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") { seekEvent(cursor - 1); event.preventDefault(); }
      else if (event.key === "ArrowRight") { seekEvent(cursor + 1); event.preventDefault(); }
      else if (event.key === "Home") { seekEvent(0); event.preventDefault(); }
      else if (event.key === "End") { seekEvent(data.timeline.data.events.length - 1); event.preventDefault(); }
    });
    updateMoves();
  }
  function selectedSeatName(): string {
    if (selected === null) return tx("analyze.the-player", "the player");
    const decision = data.decisions[selected];
    if (!decision) return tx("analyze.the-player", "the player");
    return decision.position.view.seat === humanSeat
      ? tx("analyze.you-knew", "you")
      : seatName(decision.position.view.seat);
  }

  function updateMoves(): void {
    if (destroyed || !boardHost || !panelHost || !stripHost) return;
    const model = data.timeline.seek(cursor);
    const decision = selected !== null ? data.decisions[selected] ?? null : null;
    boardHost.replaceChildren(boardFor(model, decision?.position.view.seat ?? humanSeat, decision));
    panelHost.replaceChildren();
    if (decision) {
      const grade = headlineGrade(decision);
      const position = decision.position;
      const panelNode = el("div", "an-panel");
      const verdict = el("div", "an-verdict", verdictLine(grade, decision));
      const sub = el("div", "an-sub", tx(
        "analyze.v-0-1-hand-2-decision-3-of-4-dealer-5",
        `${seatName(position.view.seat)} · ${handLabel(position.handIndex)} · Hand ${position.handIndex} · Decision ${selected! + 1} of ${data.decisions.length} · Dealer ${seatName(position.view.dealer)}`,
        seatName(position.view.seat), handLabel(position.handIndex), position.handIndex, selected! + 1, data.decisions.length, seatName(position.view.dealer),
      ));
      panelNode.append(verdict, sub);
      playedCoachRows(grade, decision, panelNode);
      panelNode.append(note(evalGapNote(grade)));
      panelHost.append(panelNode);
    }
    stripHost.replaceChildren();
    for (let seat = 0; seat < 4; seat++) {
      const player = model.players[seat]!;
      const cell = el("div", "cell");
      cell.append(
        el("div", "l", player.riichi || player.doubleRiichi
          ? tx("analyze.v-0-riichi", `${seatName(seat)} · Riichi`, seatName(seat))
          : seatName(seat)),
        el("div", "n", fmt(player.score)),
      );
      stripHost.append(cell);
    }
    const total = data.timeline.data.events.length;
    const frac = total > 1 ? cursor / (total - 1) : 0;
    if (fillEl) fillEl.style.width = `${(frac * 100).toFixed(2)}%`;
    if (knobEl) knobEl.style.left = `${(frac * 100).toFixed(2)}%`;
    if (labEl) labEl.textContent = tx("analyze.v-event-0-of-1", `Event ${fmt(cursor + 1)} of ${fmt(total)}`, fmt(cursor + 1), fmt(total));
    if (handEl) {
      const hi = handIndexAt(cursor);
      handEl.textContent = tx("analyze.v-0-hand-1", `${handLabel(hi)} · Hand ${hi}`, handLabel(hi), hi);
    }
    if (navButtons) {
      navButtons.prev.disabled = selected === null || selected <= 0;
      navButtons.next.disabled = selected === null || selected >= data.decisions.length - 1;
    }
    if (movesNoteEl) {
      movesNoteEl.textContent = tx(
        "analyze.v-unseen-copies-may-be-in-opponents-hands-or-the",
        `Unseen copies may be in opponents' hands or the dead wall. Coach advice uses only what ${selectedSeatName()} knew at this decision.`,
        selectedSeatName(),
      );
    }
  }

  function seekEvent(index: number): void {
    const total = data.timeline.data.events.length;
    cursor = Math.min(total - 1, Math.max(0, index));
    const at = data.decisions.findIndex((d) => d.position.eventSequence === cursor);
    selected = at >= 0 ? at : null;
    updateMoves();
  }
  function stepDecision(delta: number): void {
    if (selected === null) return;
    const next = Math.min(data.decisions.length - 1, Math.max(0, selected + delta));
    const decision = data.decisions[next];
    if (!decision) return;
    selected = next;
    cursor = decision.position.eventSequence;
    updateMoves();
  }
  function jumpToMoment(moment: AnalyzeMoment): void {
    let target = -1;
    data.decisions.forEach((decision, i) => {
      if (decision.position.eventSequence < moment.eventIndex) target = i;
    });
    scope = "moves";
    render();
    if (target >= 0) {
      selected = target;
      cursor = data.decisions[target]!.position.eventSequence;
    } else {
      selected = null;
      cursor = Math.min(moment.eventIndex, data.timeline.data.events.length - 1);
    }
    updateMoves();
  }

  // -- shell -------------------------------------------------------------------
  const root = el("div", "an-screen");
  const head = el("div", "an-head");
  const backButton = el("button", "an-back", "‹");
  backButton.type = "button";
  backButton.setAttribute("aria-label", tx("analyze.back-to-review", "Back to review"));
  backButton.addEventListener("click", () => options.onBack());
  head.append(backButton, el("h1", "", tx("analyze.analyze", "Analyze")), el("span", "sp"));
  const seg = el("div", "seg an-seg");
  const overallButton = el("button", "", tx("analyze.overall", "Overall"));
  overallButton.type = "button";
  const movesButton = el("button", "", tx("analyze.move-by-move", "Move by move"));
  movesButton.type = "button";
  overallButton.addEventListener("click", () => { scope = "overall"; render(); });
  movesButton.addEventListener("click", () => { scope = "moves"; render(); });
  seg.append(overallButton, movesButton);
  const content = el("div");
  root.append(head, seg, content);
  container.append(root);

  function render(): void {
    if (destroyed) return;
    overallButton.classList.toggle("on", scope === "overall");
    movesButton.classList.toggle("on", scope === "moves");
    content.replaceChildren();
    boardHost = panelHost = stripHost = null;
    if (scope === "overall") renderOverall(content);
    else renderMovesStatic(content);
  }
  render();

  return {
    goToDecision(decisionIndex: number): void {
      const index = data.decisions.findIndex((d) => d.position.decisionIndex === decisionIndex);
      if (index < 0) return;
      scope = "moves";
      render();
      selected = index;
      cursor = data.decisions[index]!.position.eventSequence;
      updateMoves();
    },
    destroy(): void {
      destroyed = true;
      root.remove();
    },
  };
}
