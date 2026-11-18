import { randomInt, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  Game,
  VariantGame,
  variantAdapter,
  buildTileSet,
  LIVE_WALL_SIZE,
  type DecisionRequest,
  type PlayerView,
  type VariantPublicView,
  type Tile,
  type TurnAction,
  type CallAction,
  type CallContext,
  type GameResult,
  type VariantId,
  type VariantLength,
} from "@openmahjong/engine";
import { createAiPolicy, createVariantPolicy } from "@openmahjong/ai";

export type Format = {
  variant: "riichi" | VariantId;
  length: VariantLength;
  pace: "live" | "correspondence";
};
export type Action = TurnAction | CallAction;
export type Answer = { action: Action; by: "human" | "bot" | "clock" };
export type Answers = Record<number, Answer>;
export type Step = { id: string; answers: Answers };
export type Journal = {
  version: 1;
  walls: number[][];
  steps: Step[];
  answers: Answers;
  deadline: number | null;
};
export function newJournal(): Journal {
  return { version: 1, walls: [], steps: [], answers: {}, deadline: null };
}

function callActions(c: CallContext): CallAction[] {
  const out: CallAction[] = [];
  if (c.canRon) out.push({ type: "ron" });
  if (c.canPon) out.push({ type: "pon" });
  if (c.canKan) out.push({ type: "daiminkan" });
  for (const tileIds of c.chiOptions) out.push({ type: "chi", tileIds });
  return out;
}

function turnActions(
  request: Extract<DecisionRequest, { kind: "turn" }>,
): TurnAction[] {
  const { view, context: c } = request;
  const ids =
    (view as Partial<VariantPublicView>).legalDiscardIds ??
    (view.players[view.seat]!.riichi && c.drawnTile
      ? [c.drawnTile.id]
      : view.hand.map((t) => t.id));
  const actions: TurnAction[] = ids.map((tileId) => ({
    type: "discard",
    tileId,
  }));
  for (const tileId of c.riichiDiscardIds)
    actions.push({ type: "discard", tileId, riichi: true });
  for (const tileType of c.ankanOptions)
    actions.push({ type: "ankan", tileType });
  for (const tileType of c.shouminkanOptions)
    actions.push({ type: "shouminkan", tileType });
  if (c.canTsumo) actions.push({ type: "tsumo" });
  if (c.canKyuushu) actions.push({ type: "kyuushu" });
  return actions;
}

function priority(action: Action, seat: number, from: number): number {
  const order = (seat - from + 4) % 4;
  switch (action.type) {
    case "ron":
      return order;
    case "daiminkan":
    case "pon":
      return 4 + order;
    case "chi":
      return 8 + order;
    default:
      return Infinity;
  }
}

export class TableEngine {
  readonly game: Game | VariantGame;
  private readonly iterator: Generator<DecisionRequest, GameResult, Action>;
  private next: IteratorResult<DecisionRequest, GameResult>;
  private journal: Journal;
  private replaying = true;
  private readonly policy;
  choices: Action[][] = [];
  calls: CallContext[][] = [];
  readonly chiHints: [number, { tileIds: readonly [number, number] }][] = [];
  readonly positions: {
    kind: DecisionRequest["kind"];
    context: DecisionRequest["context"];
    seat: number;
    event: number;
    action: Action;
    by: Answer["by"];
    view: PlayerView;
  }[] = [];
  tip: string | null = null;

  constructor(
    readonly format: Format,
    journal: Journal,
    private readonly review = false,
  ) {
    if (journal.version !== 1)
      throw new Error("Unsupported online match version");
    this.journal = journal;
    this.policy =
      format.variant === "riichi" ? createAiPolicy() : createVariantPolicy();
    const inventory =
      format.variant === "riichi"
        ? buildTileSet()
        : variantAdapter(format.variant).inventory();
    const tiles = new Map(inventory.map((t) => [t.id, t]));
    const wall = (hand: number): Tile[] => {
      let ids = this.journal.walls[hand];
      if (!ids) {
        if (this.replaying || hand !== this.journal.walls.length)
          throw new Error("Missing committed wall");
        ids = inventory.map((t) => t.id);
        for (let i = ids.length - 1; i > 0; i--) {
          const k = randomInt(i + 1);
          [ids[k], ids[i]] = [ids[i]!, ids[k]!];
        }
        this.journal.walls.push(ids);
      }
      return ids.map((id) => tiles.get(id)!);
    };
    this.game =
      format.variant === "riichi"
        ? new Game({
            seed: "online",
            length: format.length as "east" | "south",
            wallFactory(hand) {
              const shuffled = wall(hand);
              return {
                liveWall: shuffled.slice(0, LIVE_WALL_SIZE),
                deadWall: shuffled.slice(LIVE_WALL_SIZE),
              };
            },
          })
        : new VariantGame({
            seed: "online",
            variant: format.variant,
            length: format.length,
            wallFactory: wall,
          });
    this.iterator = this.game.play();
    this.replaying = journal.steps.length > 0 || journal.walls.length > 0;
    this.next = this.iterator.next();
    this.collect();
    for (const step of journal.steps) this.apply(step);
    this.replaying = false;
  }

  attach(journal: Journal) {
    this.journal = journal;
  }
  get result() {
    return this.next.done ? this.next.value : null;
  }
  get kind() {
    return this.next.done ? "finished" : this.next.value.kind;
  }
  view(seat: number) {
    return this.game.viewFor(seat);
  }

  private collect() {
    this.choices = [[], [], [], []];
    this.calls = [[], [], [], []];
    if (this.next.done) return;
    const req = this.next.value;
    if (req.kind === "turn") {
      this.choices[req.view.seat] = turnActions(req);
      return;
    }
    for (let seat = 0; seat < 4; seat++) {
      const contexts = this.game.claimContexts(req.context, seat);
      const actions = contexts.flatMap(callActions);
      if (actions.length) {
        this.calls[seat] = contexts;
        this.choices[seat] = [...actions, { type: "pass" }];
      }
    }
  }

  canAdvance(answers: Answers): boolean {
    if (this.next.done) return false;
    const req = this.next.value;
    if (req.kind === "turn") return !!answers[req.view.seat];
    let best = Infinity;
    let pending = Infinity;
    this.choices.forEach((choices, seat) => {
      const answer = answers[seat];
      if (answer)
        best = Math.min(
          best,
          priority(answer.action, seat, req.context.fromSeat),
        );
      else
        for (const action of choices)
          pending = Math.min(
            pending,
            priority(action, seat, req.context.fromSeat),
          );
    });
    return pending === Infinity || best < pending;
  }

  automatic(seat: number, bot: boolean): Action {
    if (this.next.done) throw new Error("Match has finished");
    const req = this.next.value;
    if (req.kind === "call") {
      if (bot)
        for (const ctx of this.calls[seat]!) {
          if (!callActions(ctx).length) continue;
          const action = this.policy.call(this.view(seat), ctx);
          if (action.type !== "pass") return action;
        }
      return { type: "pass" };
    }
    if (bot) return this.policy.turn(req.view, req.context);
    return (
      this.choices[seat]!.find(
        (a) => a.type === "discard" && a.tileId === req.context.drawnTile?.id,
      ) ?? this.choices[seat]![0]!
    );
  }

  get claimTile() {
    return !this.next.done && this.next.value.kind === "call"
      ? this.next.value.context.tile
      : null;
  }

  commit(journal: Journal) {
    const step = { id: randomUUID(), answers: journal.answers };
    this.apply(step);
    journal.steps.push(step);
    journal.answers = {};
  }

  private apply(step: Step) {
    if (!this.canAdvance(step.answers) || this.next.done)
      throw new Error("Incomplete recorded decision");
    const initial = this.next.value;
    do {
      if (this.next.done) break;
      const req = this.next.value;
      const seat = req.view.seat;
      const answer = step.answers[seat];
      let action = answer?.action;
      if (
        req.kind === "call" &&
        !callActions(req.context).some((a) => isDeepStrictEqual(a, action))
      )
        action = { type: "pass" };
      if (!action) throw new Error("Missing recorded action");
      if (this.review)
        this.positions.push({
          kind: req.kind,
          context: req.context,
          seat,
          event: this.game.events.length - 1,
          action,
          by: answer?.by ?? "clock",
          view: req.view,
        });
      const fromEvent = this.game.events.length;
      this.next = this.iterator.next(action);
      if (this.review && action.type === "chi") {
        const event = this.game.events
          .slice(fromEvent)
          .find((e) => e.type === "call" && e["kind"] === "chi");
        if (event) this.chiHints.push([event.seq, { tileIds: action.tileIds }]);
      }
    } while (
      initial.kind === "call" &&
      !this.next.done &&
      this.next.value.kind === "call"
    );
    this.tip = step.id;
    this.collect();
  }
}
