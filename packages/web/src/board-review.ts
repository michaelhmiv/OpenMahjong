/** Indexed board history. Reconstruction runs once; seeking folds at most
 * CHECKPOINT_INTERVAL events. Full replay material never enters coach inputs. */
import type { GameEvent } from "@openmahjong/engine";
import { TableModel } from "./model.js";
import { reconstructReview, type ReconstructedReview } from "./review.js";
import { tx } from "./i18n/index.js";

export const CHECKPOINT_INTERVAL = 16;
const WINDS = ["East", "South", "West", "North"];
const SIGNIFICANT = new Set([
  "hand-start",
  "call",
  "riichi",
  "kan",
  "win",
  "drawn-hand",
  "hand-end",
  "flower",
  "robbed-kong",
]);
export interface ReviewHand {
  readonly index: number;
  readonly start: number;
  end: number;
  readonly label: string;
  result: string;
}
export class BoardTimeline {
  readonly hands: ReviewHand[] = [];
  readonly significant: number[] = [];
  readonly decisionsByEvent = new Map<number, number[]>();
  private readonly checkpoints = new Map<number, object>();
  constructor(readonly data: ReconstructedReview) {
    data.review.positions.forEach((position, index) => {
      const indices = this.decisionsByEvent.get(position.eventSequence) ?? [];
      indices.push(index);
      this.decisionsByEvent.set(position.eventSequence, indices);
    });
    const model = new TableModel(data.humanSeat);
    this.checkpoints.set(-1, structuredClone(model));
    data.events.forEach((event, index) => {
      model.apply(event, data.chiHints.get(event.seq));
      if (index % CHECKPOINT_INTERVAL === 0)
        this.checkpoints.set(index, structuredClone(model));
      if (SIGNIFICANT.has(event.type)) this.significant.push(index);
      if (event.type === "hand-start") {
        if (this.hands.length) this.hands.at(-1)!.end = index - 1;
        this.hands.push({
          index: this.hands.length,
          start: index,
          end: data.events.length - 1,
          label: tx("review.board.v-0-1-repeat-2", `${WINDS[Number(event["roundWind"]) - 27]} ${event["kyoku"]} · Repeat ${event["honba"]}`, WINDS[Number(event["roundWind"]) - 27], event["kyoku"], event["honba"]),
          result: tx("review.board.recorded-prefix", "Recorded prefix"),
        });
      }
      if (event.type === "win")
        this.hands.at(-1)!.result =
          tx("review.board.won-by-0", `Won by ${WINDS[(Number(event["seat"]) - model.dealer + 4) % 4]}`, WINDS[(Number(event["seat"]) - model.dealer + 4) % 4]);
      if (event.type === "drawn-hand")
        this.hands.at(-1)!.result =
          event[tx("review.board.kind", "kind")] === "exhaustive"
            ? tx("review.board.no-winner-wall-exhausted", "No winner · Wall exhausted")
            : tx("review.board.no-winner-aborted-hand", "No winner · Aborted hand");
    });
  }
  seek(index: number): TableModel {
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this.data.events.length
    )
      throw new RangeError("Timeline event out of range");
    const checkpoint =
      Math.floor(index / CHECKPOINT_INTERVAL) * CHECKPOINT_INTERVAL;
    const model = Object.assign(
      new TableModel(this.data.humanSeat),
      structuredClone(this.checkpoints.get(checkpoint)!),
    );
    for (let i = checkpoint + 1; i <= index; i++) {
      const event = this.data.events[i]!;
      model.apply(event, this.data.chiHints.get(event.seq));
    }
    return model;
  }
  handAt(index: number): ReviewHand | undefined {
    return this.hands.find((hand) => index >= hand.start && index <= hand.end);
  }
}
export function buildBoardReview(input: unknown): BoardTimeline {
  return new BoardTimeline(reconstructReview(input));
}
export function eventLabel(event: GameEvent, model: TableModel): string {
  const seat = Number(event["seat"]);
  const who = Number.isInteger(seat)
    ? WINDS[(seat - model.dealer + 4) % 4]
    : "";
  const names: Record<string, string> = {
    draw: tx("review.board.event.draw", "draws"),
    discard: tx("review.board.event.discard", "discards"),
    flower: tx("review.board.event.flower", "exposes a flower or season"),
    "robbed-kong": tx("review.board.has-an-added-quad-robbed", "has an added quad robbed"),
    call: tx("review.board.event.call", `calls ${event[tx("review.board.kind", "kind")]}`, event[tx("review.board.kind", "kind")]),
    kan: tx("review.board.event.kan", "declares a quad"),
    riichi: tx("review.board.event.riichi", "declares riichi"),
    win: tx("review.board.event.win", "wins"),
    "drawn-hand": tx("review.board.hand-without-a-winner", "Hand without a winner"),
    "hand-start": tx("review.board.hand-begins", "Hand begins"),
    "hand-end": tx("review.board.hand-ends", "Hand ends"),
    indicator: tx("review.board.event.indicator", "Indicator revealed"),
    score: tx("review.board.event.score", "score updated"),
    deal: tx("review.board.event.deal", "receives tiles"),
    "game-start": tx("review.board.game-begins", "Game begins"),
    "game-end": tx("review.board.game-ends", "Game ends"),
  };
  return `${who ?? ""} ${names[event.type] ?? event.type}`.trim();
}
