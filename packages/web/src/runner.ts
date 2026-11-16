/**
 * GameRunner — drives the synchronous engine from an event-driven UI.
 *
 * The engine's Game.run() is synchronous and asks each seat's Policy for
 * decisions inline. A human cannot answer synchronously, so the runner
 * exploits the engine's determinism (brief A5: same seed + same decisions
 * = identical event log):
 *
 * - Every decision ever made (human and AI seats) is appended to an
 *   ordered decision log.
 * - advance() replays a fresh Game from the seed; recorded decisions are
 *   consumed in order, AI seats decide live (and append) once the log is
 *   exhausted, and the human driver's PENDING becomes a SuspendSignal
 *   that unwinds run() with the exact PlayerView + context the UI needs.
 * - The result is an exact prefix of the one true event log plus, when
 *   the game is waiting on the human, the pending decision.
 *
 * Persistence (brief §11, A8): the saved game is { seed, length, humanSeat,
 * decisions } — restoring it replays to the identical state, event for
 * event. The runner also records which recorded chi decision produced
 * each "call" event, as a hint for the view model (see model.ts).
 */

import {
  Game,
  type CallAction,
  type CallContext,
  type GameEvent,
  type GameLength,
  type GameResult,
  type PlayerView,
  type Policy,
  type Seat,
  type TurnAction,
  type TurnContext,
} from "@openmahjong/engine";
import { HumanDriver, PENDING, type SeatDriver } from "./drivers.js";
import type { ChiHint } from "./model.js";

export type Decision = TurnAction | CallAction;

export type PendingDecision =
  | { readonly kind: "turn"; readonly seat: Seat; readonly view: PlayerView; readonly ctx: TurnContext }
  | {
      readonly kind: "call";
      readonly seat: Seat;
      readonly view: PlayerView;
      readonly ctx: CallContext;
      /**
       * The engine decides pon/kan and chi in two separate passes over
       * the same context shape (see game.ts resolveDiscardWindow): pon/
       * kan only in the first pass, chi only in the second — or in the
       * first when the seat could not pon/kan and was skipped there.
       * These flags say which actions the engine will accept right now;
       * offering the other pass's action makes the engine throw.
       */
      readonly ponDecidable: boolean;
      readonly chiDecidable: boolean;
    };

class SuspendSignal {
  constructor(readonly pending: PendingDecision) {}
}

const TURN_TYPES = new Set(["discard", "ankan", "shouminkan", "tsumo", "kyuushu"]);

export interface RunnerOptions {
  readonly seed: number | string;
  readonly length: GameLength;
  readonly humanSeat?: Seat;
  /** Driver for the three non-human seats (AiDriver: @openmahjong/ai). */
  readonly aiDriver: SeatDriver;
}

export interface SavedGame {
  readonly v: 1;
  readonly seed: string;
  readonly length: GameLength;
  readonly humanSeat: Seat;
  readonly decisions: readonly Decision[];
}

export class GameRunner {
  readonly seed: string;
  readonly length: GameLength;
  readonly humanSeat: Seat;
  private readonly aiDriver: SeatDriver;
  private readonly humanDriver = new HumanDriver();

  decisions: Decision[] = [];
  events: readonly GameEvent[] = [];
  pending: PendingDecision | null = null;
  result: GameResult | null = null;
  /** seq of a chi "call" event -> the tile ids that formed it. */
  chiHints = new Map<number, ChiHint>();

  constructor(opts: RunnerOptions) {
    this.seed = String(opts.seed);
    this.length = opts.length;
    this.humanSeat = opts.humanSeat ?? 0;
    this.aiDriver = opts.aiDriver;
  }

  private driverFor(seat: Seat): SeatDriver {
    return seat === this.humanSeat ? this.humanDriver : this.aiDriver;
  }

  /** Run (or replay) until the game ends or the human must decide. */
  advance(): void {
    let cursor = 0;
    const hints = new Map<number, ChiHint>();
    let lastChiDecision: { tileIds: readonly [number, number] } | null = null;

    const takeRecorded = (): Decision | null => {
      if (cursor >= this.decisions.length) return null;
      return this.decisions[cursor++]!;
    };

    // Watch the event log grow so chi decisions can be tied to the call
    // event they produce (the event itself names only the tile type).
    // Scanning at the top of every policy call is exact: a chi decision is
    // followed by its call event before any other decision is requested.
    const eventsRefHolder: { events: readonly GameEvent[] } = { events: [] };
    let scanned = 0;
    const scanChiHints = () => {
      const eventsRef = eventsRefHolder.events;
      for (; scanned < eventsRef.length; scanned++) {
        const ev = eventsRef[scanned]!;
        if (ev.type === "call" && ev["kind"] === "chi" && lastChiDecision) {
          hints.set(ev.seq, { tileIds: lastChiDecision.tileIds });
          lastChiDecision = null;
        }
      }
    };

    // Per-window ask counting, for the pon/chi pass flags on pending
    // call decisions. A window closes when the next turn decision is
    // requested, so the map resets there.
    const windowAsks = new Map<string, number>();

    const policy: Policy = {
      turn: (view, ctx) => {
        scanChiHints();
        windowAsks.clear();
        const recorded = takeRecorded();
        if (recorded) {
          if (!TURN_TYPES.has(recorded.type)) {
            throw new Error(`Decision log desync at ${cursor - 1}: expected a turn action, got ${recorded.type}`);
          }
          return recorded as TurnAction;
        }
        const action = this.driverFor(view.seat).turn(view, ctx);
        if (action === PENDING) {
          throw new SuspendSignal({ kind: "turn", seat: view.seat, view, ctx });
        }
        this.decisions.push(action);
        cursor++;
        return action;
      },
      call: (view, ctx) => {
        scanChiHints();
        const askKey = `${view.seat}:${ctx.tile.id}:${ctx.fromSeat}:${ctx.phase}`;
        const askCount = windowAsks.get(askKey) ?? 0;
        windowAsks.set(askKey, askCount + 1);
        const recorded = takeRecorded();
        if (recorded) {
          if (TURN_TYPES.has(recorded.type)) {
            throw new Error(`Decision log desync at ${cursor - 1}: expected a call action, got ${recorded.type}`);
          }
          if (recorded.type === "chi") {
            lastChiDecision = { tileIds: recorded.tileIds };
          }
          return recorded as CallAction;
        }
        const action = this.driverFor(view.seat).call(view, ctx);
        if (action === PENDING) {
          const firstAsk = askCount === 0;
          throw new SuspendSignal({
            kind: "call",
            seat: view.seat,
            view,
            ctx,
            ponDecidable: ctx.phase === "call" && firstAsk,
            chiDecidable:
              ctx.phase === "call" &&
              ctx.chiOptions.length > 0 &&
              (!firstAsk || (!ctx.canPon && !ctx.canKan)),
          });
        }
        this.decisions.push(action);
        cursor++;
        if (action.type === "chi") lastChiDecision = { tileIds: action.tileIds };
        return action;
      },
    };

    const game = new Game({
      seed: this.seed,
      length: this.length,
      policies: [policy, policy, policy, policy],
    });

    eventsRefHolder.events = game.events;

    this.pending = null;
    this.result = null;
    try {
      this.result = game.run();
    } catch (e) {
      if (e instanceof SuspendSignal) {
        this.pending = e.pending;
      } else {
        throw e;
      }
    } finally {
      scanChiHints();
      this.events = [...game.events];
      this.chiHints = hints;
    }
  }

  /** The human's answer to the pending decision; advances the game. */
  act(action: Decision): void {
    if (!this.pending) throw new Error("act() with no pending decision");
    if (this.pending.kind === "turn" && !TURN_TYPES.has(action.type)) {
      throw new Error(`Expected a turn action, got ${action.type}`);
    }
    if (this.pending.kind === "call" && TURN_TYPES.has(action.type)) {
      throw new Error(`Expected a call action, got ${action.type}`);
    }
    this.decisions.push(action);
    this.pending = null;
    this.advance();
  }

  serialize(): SavedGame {
    return {
      v: 1,
      seed: this.seed,
      length: this.length,
      humanSeat: this.humanSeat,
      decisions: [...this.decisions],
    };
  }

  static restore(saved: SavedGame, aiDriver: SeatDriver): GameRunner {
    if (saved.v !== 1) throw new Error(`Unsupported saved game version ${saved.v}`);
    const runner = new GameRunner({
      seed: saved.seed,
      length: saved.length,
      humanSeat: saved.humanSeat,
      aiDriver,
    });
    runner.decisions = [...saved.decisions];
    runner.advance();
    return runner;
  }
}
