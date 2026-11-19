/**
 * Shared text for coaching moments (brief G1–G4): the same wording
 * serves the post-game Review panels and the guided-mode sheet, so a
 * moment reads identically wherever it is explained. Every line is
 * template-rendered from the coach's structured facts — no outcome
 * language, and every technical term is defined in the `terms`
 * lines at its first use (the standing guided-explanation law).
 */
import type { PlayerView } from "@openmahjong/engine";
import type { CallAdvice, KanAdvice, RiichiGrade, WinAdvice } from "@openmahjong/coach";
import { tileName } from "@openmahjong/coach";
import type { Decision } from "./runner.js";
import type { MomentGrade } from "./review.js";
import { t, tx } from "./i18n/index.js";

/** The minimum a moment text needs: whose view, which window, and
 * the action taken (null while the decision is still live, as in
 * guided mode — the choice line is then omitted). */
export interface MomentPosition {
  readonly kind: "call" | "turn";
  readonly view: PlayerView;
  readonly action: Decision | null;
}

export interface MomentText {
  readonly kind: MomentGrade["kind"];
  readonly title: string;
  /** What the player actually did at this moment. */
  readonly choiceLine: string;
  /** The coach's one-line read. */
  readonly headline: string;
  readonly facts: readonly string[];
  /** "The moment" explainer lines: terms defined at first use. */
  readonly terms: readonly string[];
}

const TERMS = {
  shanten: "Shanten counts the tile exchanges between this hand and ready (tenpai): 0 shanten is ready, 1 shanten is one exchange away.",
  yaku: "A yaku is a scoring pattern — a hand cannot win without one, however complete its shape.",
  furiten:
    "Furiten is a barred-win state: while it lasts you may not win on any discard, even a tile you are waiting on. It lifts at your next draw — unless you are in riichi, where it lasts the rest of the hand.",
  riichi:
    "Riichi is a 1,000-point declaration made with a closed, ready hand: it adds a yaku, but locks the hand — after declaring you can only discard what you draw.",
  dama: "Staying silent (often called dama, short for damaten) means keeping a ready hand undeclared: it can still win on a discard if it holds a yaku of its own.",
  kan: "A kan is a four-of-a-kind meld. Declaring one draws a replacement tile and flips a new dora indicator for the whole table — it can raise any player's score, including an opponent's.",
  dora: "Dora are bonus tiles worth one extra han each. Each dora indicator on the table names the tile after it in sequence as dora.",
  tsumo: "Tsumo is winning on your own draw. Declining it means discarding instead and keeping the hand going.",
} as const;

function discardName(position: MomentPosition): string {
  if (position.kind !== "turn" || position.action?.type !== "discard") return "";
  const tile = position.view.hand.find((t) => t.id === (position.action as { tileId: number }).tileId);
  return tile ? tileName(tile.type) : "tile";
}

function callText(advice: CallAdvice, position: MomentPosition): MomentText {
  const action = position.kind === "call" ? position.action : null;
  const tile = advice.tileName;
  const facts: string[] = [];
  for (const option of advice.options) {
    if (option.action === "pass") continue;
    if (option.action === "ron") {
      facts.push(
        option.win
          ? tx("review.moment.ron-on-the-0-scores-1-points-2-3", `Ron on the ${tile} scores ${option.win.points} points (${option.win.yaku.join(", ")})${option.win.yakuman ? " " + tx("review.moment.a-yakuman-the-highest-hand-rank", "— a yakuman, the highest hand rank") : ""}.`, tile, option.win.points, option.win.yaku.join(", "), option.win.yakuman ? " " + tx("review.moment.a-yakuman-the-highest-hand-rank", "— a yakuman, the highest hand rank") : "")
          : tx("review.moment.ron-on-the-0-completes-the-shape", `Ron on the ${tile} completes the shape.`, tile),
      );
      continue;
    }
    const label =
      option.action === "pon" ? tx("review.moment.pon-the-0", `Pon the ${tile}`, tile) : option.action === "daiminkan" ? tx("review.moment.kan-the-0", `Kan the ${tile}`, tile) : option.label;
    facts.push(
      tx("review.moment.v-0-leaves-the-hand-1-shanten-with-2-unseen-improv", `${label}: leaves the hand ${option.shantenAfter} shanten with ${option.improvingTotal} unseen improving copies${option.opensHand ? tx("review.moment.and-opens-the-hand", ", and opens the hand") : ""}.`, label, option.shantenAfter, option.improvingTotal, option.opensHand ? tx("review.moment.and-opens-the-hand", ", and opens the hand") : ""),
    );
    if (option.noYakuPath) {
      facts.push(tx("review.moment.the-0-opens-the-hand-with-no-yaku-path-left-the", `The ${option.action} opens the hand with no yaku path left — the shape can finish and still never win.`, option.action));
    } else if (option.yakuPaths.length > 0) {
      facts.push(tx("review.moment.yaku-paths-after-the-0-1", `Yaku paths after the ${option.action}: ${option.yakuPaths.join("; ")}.`, option.action, option.yakuPaths.join("; ")));
    }
    if (option.kanDora) {
      facts.push(
        tx("review.moment.the-kan-flips-a-new-dora-indicator-the-kan-tiles", `The kan flips a new dora indicator: the kan tiles themselves hold ${option.kanDora.doraInKan} dora, and up to ${option.kanDora.potentialNewDora} of your other tiles could become dora — the same flip can also pay an opponent.`, option.kanDora.doraInKan, option.kanDora.potentialNewDora),
      );
    }
  }
  if (advice.ronPass) {
    facts.push(
      advice.ronPass.permanentFuriten
        ? tx("review.moment.passing-this-ron-while-in-riichi-makes-you-furit", "Passing this ron while in riichi makes you furiten for the rest of the hand — no discard can win for you after this pass.")
        : tx("review.moment.passing-this-ron-makes-you-furiten-until-your-ne", "Passing this ron makes you furiten until your next draw — no discard can win for you in between."),
    );
    for (const wait of advice.ronPass.ownPondWaits) {
      facts.push(
        tx("review.moment.your-own-discards-already-include-the-0-ron-on-i", `Your own discards already include the ${wait.name}: ron on it was barred by discard furiten before this pass.`, wait.name),
      );
    }
  }
  if (advice.riichiThreat) {
    facts.push(tx("review.moment.an-opponent-is-in-riichi-calling-opens-your-hand", "An opponent is in riichi: calling opens your hand while a declared hand is waiting."));
  }
  const choiceLine =
    action === null
      ? ""
      : action.type === "ron"
        ? tx("review.moment.you-took-the-ron-on-the-0", `You took the ron on the ${tile}.`, tile)
        : action.type === "pon"
          ? tx("review.moment.you-called-pon-on-the-0", `You called pon on the ${tile}.`, tile)
          : action.type === "daiminkan"
            ? tx("review.moment.you-called-kan-on-the-0", `You called kan on the ${tile}.`, tile)
            : action.type === "chi"
              ? tx("review.moment.you-called-chi-on-the-0", `You called chi on the ${tile}.`, tile)
              : advice.ronPass
                ? tx("review.moment.you-passed-the-ron-on-the-0-included", `You passed — the ron on the ${tile} included.`, tile)
                : tx("review.moment.you-passed", "You passed.");
  const terms: string[] = [t("review.terms.shanten"), t("review.terms.yaku")];
  if (advice.ronPass) terms.push(t("review.terms.furiten"));
  if (advice.options.some((o) => o.action === "daiminkan")) terms.push(t("review.terms.kan"), t("review.terms.dora"));
  return {
    kind: "call",
    title: advice.phase === "ron" ? tx("review.moment.the-ron-decision", "The ron decision") : tx("review.moment.the-call-window", "The call window"),
    choiceLine,
    headline: advice.headline,
    facts,
    terms,
  };
}

function kanText(advice: KanAdvice, position: MomentPosition): MomentText {
  const facts: string[] = [];
  for (const option of advice.options) {
    facts.push(
      tx("review.moment.the-0-on-the-1-holds-2-dora-in-its-four-tiles-an", `The ${option.kind === "ankan" ? tx("review.moment.closed-kan-ankan", "closed kan (ankan)") : tx("review.moment.added-kan-shouminkan", "added kan (shouminkan)")} on the ${option.tileName} holds ${option.doraInKan} dora in its four tiles and leaves the hand ${option.shantenAfter} shanten.`, option.kind === "ankan" ? tx("review.moment.closed-kan-ankan", "closed kan (ankan)") : tx("review.moment.added-kan-shouminkan", "added kan (shouminkan)"), option.tileName, option.doraInKan, option.shantenAfter),
    );
    if (option.breaksChiitoi) {
      facts.push(tx("review.moment.declaring-it-breaks-the-seven-pairs-chiitoitsu-s", "Declaring it breaks the seven-pairs (chiitoitsu) shape this hand is chasing — a kan commits the hand to the standard shape."));
    }
    if (option.waitsPreserved === true) {
      facts.push(tx("review.moment.your-waits-are-unchanged-by-this-kan-the-engine", "Your waits are unchanged by this kan — the engine only offers a riichi player's kan when that holds."));
    }
  }
  facts.push(
    tx("review.moment.the-new-indicator-the-kan-flips-could-make-up-to", `The new indicator the kan flips could make up to ${advice.potentialNewDora} of your tiles dora — and could just as well feed an opponent. That risk runs both directions.`, advice.potentialNewDora),
  );
  facts.push(tx("review.moment.you-already-hold-0-dora-across-your-hand-and-mel", `You already hold ${advice.handDora} dora across your hand and melds.`, advice.handDora));
  if (advice.riichiThreat) {
    facts.push(
      advice.shantenNow > 0
        ? tx("review.moment.an-opponent-is-in-riichi-and-your-hand-is-not-re", "An opponent is in riichi and your hand is not ready: an added kan also gives that player a chance to win on the kan tile itself (a robbed kan, chankan).")
        : tx("review.moment.an-opponent-is-in-riichi-the-new-indicator-can-r", "An opponent is in riichi: the new indicator can raise their hand too."),
    );
  }
  if (advice.ownIppatsuLoss) {
    facts.push(tx("review.moment.declaring-now-spends-your-live-ippatsu-chance-th", "Declaring now spends your live ippatsu chance — the bonus for winning within one round of declaring riichi."));
  }
  const action = position.kind === "turn" ? position.action : null;
  const chosen = advice.options.find((o) => action && action.type === o.kind);
  const choiceLine =
    action === null
      ? ""
      : action.type === "ankan" || action.type === "shouminkan"
        ? tx("review.moment.you-declared-the-kan-0", `You declared the kan${chosen ? " " + tx("review.moment.on-the-0", `on the ${chosen.tileName}`, chosen.tileName) : ""}.`, chosen ? " " + tx("review.moment.on-the-0", `on the ${chosen.tileName}`, chosen.tileName) : "")
        : tx("review.moment.you-held-the-kan-and-discarded-the-0", `You held the kan and discarded the ${discardName(position)}.`, discardName(position));
  return {
    kind: "kan",
    title: tx("review.moment.the-kan-decision", "The kan decision"),
    choiceLine,
    headline: advice.headline,
    facts,
    terms: [t("review.terms.kan"), t("review.terms.dora"), t("review.terms.shanten")],
  };
}

function riichiText(advice: RiichiGrade, position: MomentPosition): MomentText {
  const facts: string[] = [];
  const waitList = advice.waits.map((w) => tx("review.moment.the-0", `the ${w.name}`, w.name)).join(" and ");
  facts.push(
    tx("review.moment.the-wait-is-on-0-1-unseen-copies-in-total-2", `The wait is on ${waitList} — ${advice.liveTotal} unseen copies in total${advice.twoSided ? tx("review.moment.a-two-sided-wait-it-completes-a-run-from-either", ", a two-sided wait (it completes a run from either end)") : advice.tanki ? tx("review.moment.a-single-tile-tanki-wait-on-one-tile-type", ", a single-tile (tanki) wait on one tile type") : ""}.`, waitList, advice.liveTotal, advice.twoSided ? tx("review.moment.a-two-sided-wait-it-completes-a-run-from-either", ", a two-sided wait (it completes a run from either end)") : advice.tanki ? tx("review.moment.a-single-tile-tanki-wait-on-one-tile-type", ", a single-tile (tanki) wait on one tile type") : ""),
  );
  if (advice.damaRon) {
    facts.push(
      tx("review.moment.staying-silent-the-hand-already-scores-ron-pays", `Staying silent, the hand already scores: ron pays ${advice.damaRon.points} points (${advice.damaRon.yaku.join(", ")}), so it can win without riichi.`, advice.damaRon.points, advice.damaRon.yaku.join(", ")),
    );
  } else {
    facts.push(tx("review.moment.staying-silent-the-hand-holds-no-yaku-of-its-own", "Staying silent, the hand holds no yaku of its own — silently it can only win on its own draw (tsumo). Riichi is what lets it win on a discard."));
  }
  if (advice.reasons.includes("leader-late")) {
    facts.push(tx("review.moment.you-lead-by-0-points-late-in-the-game-extra-poin", `You lead by ${advice.leadOverSecond} points late in the game: extra points cannot change the placement, and a silent win ends the game the same way.`, advice.leadOverSecond));
  }
  if (advice.reasons.includes("chaser-late")) {
    facts.push(tx("review.moment.you-are-0-points-behind-the-leader-late-in-the-g", `You are ${advice.behindLeader} points behind the leader late in the game: the declaration's extra value is worth chasing.`, advice.behindLeader));
  }
  if (advice.riichiRon) {
    facts.push(tx("review.moment.with-riichi-declared-ron-pays-at-least-0-points", `With riichi declared, ron pays at least ${advice.riichiRon.points} points — a minimum: the bonus tiles under the indicator (ura dora) only show if you win.`, advice.riichiRon.points));
  }
  const action = position.kind === "turn" ? position.action : null;
  const declared = action?.type === "discard" && action.riichi === true;
  return {
    kind: "riichi",
    title: tx("review.moment.the-riichi-decision", "The riichi decision"),
    choiceLine:
      action === null
        ? ""
        : declared
          ? tx("review.moment.you-declared-riichi-discarding-the-0", `You declared riichi, discarding the ${discardName(position)}.`, discardName(position))
          : tx("review.moment.you-stayed-silent-discarding-the-0", `You stayed silent, discarding the ${discardName(position)}.`, discardName(position)),
    headline: advice.headline,
    facts,
    terms: [t("review.terms.riichi"), t("review.terms.dama"), t("review.terms.yaku")],
  };
}

function winText(advice: WinAdvice, position: MomentPosition): MomentText {
  const facts: string[] = [];
  facts.push(
    tx("review.moment.tsumo-pays-0-points-now-1-2", `Tsumo pays ${advice.value.points} points now (${advice.value.yaku.join(", ")})${advice.uraUnknown ? " " + tx("review.moment.at-least-that-much-in-riichi-the-bonus-tiles-und", "— at least that much: in riichi the bonus tiles under the indicator (ura dora) only show on a win") : ""}.`, advice.value.points, advice.value.yaku.join(", "), advice.uraUnknown ? " " + tx("review.moment.at-least-that-much-in-riichi-the-bonus-tiles-und", "— at least that much: in riichi the bonus tiles under the indicator (ura dora) only show on a win") : ""),
  );
  if (advice.ceiling) {
    facts.push(
      tx("review.moment.declining-discarding-the-0-keeps-a-wait-on-1-wor", `Declining — discarding the ${advice.declineTileName} — keeps a wait on ${advice.declineWaits.map((w) => tx("review.moment.the-0", `the ${w.name}`, w.name)).join(" and ")} worth up to ${advice.ceiling.points} points${advice.ceiling.yakuman ? " " + tx("review.moment.a-yakuman-the-highest-hand-rank-2", "(a yakuman, the highest hand rank)") : ""}, with ${advice.declineLive} unseen copies and ${advice.turnsRemaining} tiles left in the wall.`, advice.declineTileName, advice.declineWaits.map((w) => tx("review.moment.the-0", `the ${w.name}`, w.name)).join(" and "), advice.ceiling.points, advice.ceiling.yakuman ? " " + tx("review.moment.a-yakuman-the-highest-hand-rank-2", "(a yakuman, the highest hand rank)") : "", advice.declineLive, advice.turnsRemaining),
    );
  } else {
    facts.push(tx("review.moment.declining-leaves-the-hand-short-of-ready-no-win", "Declining leaves the hand short of ready — no win stays reachable from the kept shape."));
  }
  const action = position.kind === "turn" ? position.action : null;
  return {
    kind: "win",
    title: tx("review.moment.the-win-decision", "The win decision"),
    choiceLine:
      action === null
        ? ""
        : action.type === "tsumo"
          ? tx("review.moment.you-took-the-tsumo", "You took the tsumo.")
          : tx("review.moment.you-declined-the-tsumo-and-discarded-the-0", `You declined the tsumo and discarded the ${discardName(position)}.`, discardName(position)),
    headline: advice.headline,
    facts,
    terms: [t("review.terms.tsumo"), t("review.terms.yaku")],
  };
}

/** Render every grade at a position into display text. */
export function momentTexts(grades: readonly MomentGrade[], position: MomentPosition): MomentText[] {
  return grades.map((grade) => {
    switch (grade.kind) {
      case "call": return callText(grade.advice, position);
      case "kan": return kanText(grade.advice, position);
      case "riichi": return riichiText(grade.advice, position);
      case "win": return winText(grade.advice, position);
    }
  });
}
