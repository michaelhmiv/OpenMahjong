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
          ? `Ron on the ${tile} scores ${option.win.points} points (${option.win.yaku.join(", ")})${option.win.yakuman ? " — a yakuman, the highest hand rank" : ""}.`
          : `Ron on the ${tile} completes the shape.`,
      );
      continue;
    }
    const label =
      option.action === "pon" ? `Pon the ${tile}` : option.action === "daiminkan" ? `Kan the ${tile}` : option.label;
    facts.push(
      `${label}: leaves the hand ${option.shantenAfter} shanten with ${option.improvingTotal} unseen improving copies${option.opensHand ? ", and opens the hand" : ""}.`,
    );
    if (option.noYakuPath) {
      facts.push(`The ${option.action} opens the hand with no yaku path left — the shape can finish and still never win.`);
    } else if (option.yakuPaths.length > 0) {
      facts.push(`Yaku paths after the ${option.action}: ${option.yakuPaths.join("; ")}.`);
    }
    if (option.kanDora) {
      facts.push(
        `The kan flips a new dora indicator: the kan tiles themselves hold ${option.kanDora.doraInKan} dora, and up to ${option.kanDora.potentialNewDora} of your other tiles could become dora — the same flip can also pay an opponent.`,
      );
    }
  }
  if (advice.ronPass) {
    facts.push(
      advice.ronPass.permanentFuriten
        ? "Passing this ron while in riichi makes you furiten for the rest of the hand — no discard can win for you after this pass."
        : "Passing this ron makes you furiten until your next draw — no discard can win for you in between.",
    );
    for (const wait of advice.ronPass.ownPondWaits) {
      facts.push(
        `Your own discards already include the ${wait.name}: ron on it was barred by discard furiten before this pass.`,
      );
    }
  }
  if (advice.riichiThreat) {
    facts.push("An opponent is in riichi: calling opens your hand while a declared hand is waiting.");
  }
  const choiceLine =
    action === null
      ? ""
      : action.type === "ron"
        ? `You took the ron on the ${tile}.`
        : action.type === "pon"
          ? `You called pon on the ${tile}.`
          : action.type === "daiminkan"
            ? `You called kan on the ${tile}.`
            : action.type === "chi"
              ? `You called chi on the ${tile}.`
              : advice.ronPass
                ? `You passed — the ron on the ${tile} included.`
                : "You passed.";
  const terms: string[] = [TERMS.shanten, TERMS.yaku];
  if (advice.ronPass) terms.push(TERMS.furiten);
  if (advice.options.some((o) => o.action === "daiminkan")) terms.push(TERMS.kan, TERMS.dora);
  return {
    kind: "call",
    title: advice.phase === "ron" ? "The ron decision" : "The call window",
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
      `The ${option.kind === "ankan" ? "closed kan (ankan)" : "added kan (shouminkan)"} on the ${option.tileName} holds ${option.doraInKan} dora in its four tiles and leaves the hand ${option.shantenAfter} shanten.`,
    );
    if (option.breaksChiitoi) {
      facts.push("Declaring it breaks the seven-pairs (chiitoitsu) shape this hand is chasing — a kan commits the hand to the standard shape.");
    }
    if (option.waitsPreserved === true) {
      facts.push("Your waits are unchanged by this kan — the engine only offers a riichi player's kan when that holds.");
    }
  }
  facts.push(
    `The new indicator the kan flips could make up to ${advice.potentialNewDora} of your tiles dora — and could just as well feed an opponent. That risk runs both directions.`,
  );
  facts.push(`You already hold ${advice.handDora} dora across your hand and melds.`);
  if (advice.riichiThreat) {
    facts.push(
      advice.shantenNow > 0
        ? "An opponent is in riichi and your hand is not ready: an added kan also gives that player a chance to win on the kan tile itself (a robbed kan, chankan)."
        : "An opponent is in riichi: the new indicator can raise their hand too.",
    );
  }
  if (advice.ownIppatsuLoss) {
    facts.push("Declaring now spends your live ippatsu chance — the bonus for winning within one round of declaring riichi.");
  }
  const action = position.kind === "turn" ? position.action : null;
  const chosen = advice.options.find((o) => action && action.type === o.kind);
  const choiceLine =
    action === null
      ? ""
      : action.type === "ankan" || action.type === "shouminkan"
        ? `You declared the kan${chosen ? ` on the ${chosen.tileName}` : ""}.`
        : `You held the kan and discarded the ${discardName(position)}.`;
  return {
    kind: "kan",
    title: "The kan decision",
    choiceLine,
    headline: advice.headline,
    facts,
    terms: [TERMS.kan, TERMS.dora, TERMS.shanten],
  };
}

function riichiText(advice: RiichiGrade, position: MomentPosition): MomentText {
  const facts: string[] = [];
  const waitList = advice.waits.map((w) => `the ${w.name}`).join(" and ");
  facts.push(
    `The wait is on ${waitList} — ${advice.liveTotal} unseen copies in total${advice.twoSided ? ", a two-sided wait (it completes a run from either end)" : advice.tanki ? ", a single-tile (tanki) wait on one tile type" : ""}.`,
  );
  if (advice.damaRon) {
    facts.push(
      `Staying silent, the hand already scores: ron pays ${advice.damaRon.points} points (${advice.damaRon.yaku.join(", ")}), so it can win without riichi.`,
    );
  } else {
    facts.push("Staying silent, the hand holds no yaku of its own — silently it can only win on its own draw (tsumo). Riichi is what lets it win on a discard.");
  }
  if (advice.reasons.includes("leader-late")) {
    facts.push(`You lead by ${advice.leadOverSecond} points late in the game: extra points cannot change the placement, and a silent win ends the game the same way.`);
  }
  if (advice.reasons.includes("chaser-late")) {
    facts.push(`You are ${advice.behindLeader} points behind the leader late in the game: the declaration's extra value is worth chasing.`);
  }
  if (advice.riichiRon) {
    facts.push(`With riichi declared, ron pays at least ${advice.riichiRon.points} points — a minimum: the bonus tiles under the indicator (ura dora) only show if you win.`);
  }
  const action = position.kind === "turn" ? position.action : null;
  const declared = action?.type === "discard" && action.riichi === true;
  return {
    kind: "riichi",
    title: "The riichi decision",
    choiceLine:
      action === null
        ? ""
        : declared
          ? `You declared riichi, discarding the ${discardName(position)}.`
          : `You stayed silent, discarding the ${discardName(position)}.`,
    headline: advice.headline,
    facts,
    terms: [TERMS.riichi, TERMS.dama, TERMS.yaku],
  };
}

function winText(advice: WinAdvice, position: MomentPosition): MomentText {
  const facts: string[] = [];
  facts.push(
    `Tsumo pays ${advice.value.points} points now (${advice.value.yaku.join(", ")})${advice.uraUnknown ? " — at least that much: in riichi the bonus tiles under the indicator (ura dora) only show on a win" : ""}.`,
  );
  if (advice.ceiling) {
    facts.push(
      `Declining — discarding the ${advice.declineTileName} — keeps a wait on ${advice.declineWaits.map((w) => `the ${w.name}`).join(" and ")} worth up to ${advice.ceiling.points} points${advice.ceiling.yakuman ? " (a yakuman, the highest hand rank)" : ""}, with ${advice.declineLive} unseen copies and ${advice.turnsRemaining} tiles left in the wall.`,
    );
  } else {
    facts.push("Declining leaves the hand short of ready — no win stays reachable from the kept shape.");
  }
  const action = position.kind === "turn" ? position.action : null;
  return {
    kind: "win",
    title: "The win decision",
    choiceLine:
      action === null
        ? ""
        : action.type === "tsumo"
          ? "You took the tsumo."
          : `You declined the tsumo and discarded the ${discardName(position)}.`,
    headline: advice.headline,
    facts,
    terms: [TERMS.tsumo, TERMS.yaku],
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
