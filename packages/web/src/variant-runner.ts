import {
  VariantGame,
  assertVariantAction,
  validateVariantDecision,
  validateVariantReplay,
  type VariantGameResult,
  type VariantReplay,
  type VariantRequest,
  type VariantId,
  type VariantLength,
} from "@openmahjong/engine";
import { PENDING, VariantAiDriver, type SeatDriver } from "./drivers.js";
import { newGameId } from "./records.js";
import type { Decision } from "./runner.js";

/** Incremental coordinator for new variants; restoration consumes exactly the
 * recorded prefix before invoking a seat driver for any new decision. */
export class VariantRunner {
  readonly id: string;
  readonly humanSeat: number;
  readonly variant: VariantId;
  readonly length: VariantLength;
  readonly seed: string;
  private game: VariantGame;
  private iterator: ReturnType<VariantGame["play"]>;
  private next: IteratorResult<VariantRequest, VariantGameResult> | undefined;
  readonly decisions: Decision[] = [];
  pending: VariantRequest | null = null;
  result: VariantGameResult | null = null;
  constructor(
    readonly options: {
      seed: string;
      variant: VariantId;
      length: VariantLength;
      humanSeat?: number;
      id?: string;
      aiDriver?: SeatDriver;
    },
  ) {
    this.seed = options.seed;
    this.variant = options.variant;
    this.length = options.length;
    this.humanSeat = options.humanSeat ?? 0;
    this.id = options.id ?? newGameId();
    this.game = new VariantGame({
      seed: this.seed,
      variant: this.variant,
      length: this.length,
    });
    this.iterator = this.game.play();
  }
  get events() {
    return this.game.events;
  }
  get chiHints() {
    return new Map(
      this.events
        .filter((e) => e.type === "call" && e["kind"] === "chi")
        .map((e) => [
          e.seq,
          { tileIds: e["tileIds"] as readonly [number, number] },
        ]),
    );
  }
  advance(): void {
    const driver = this.options.aiDriver ?? new VariantAiDriver();
    if (!this.next) this.next = this.iterator.next();
    this.pending = null;
    while (!this.next.done) {
      const request = this.next.value;
      if (request.view.seat === this.humanSeat) {
        this.pending = request;
        return;
      }
      const action =
        request.kind === "turn"
          ? driver.turn(request.view, request.context)
          : driver.call(request.view, request.context);
      if (action === PENDING) throw new Error("CPU driver cannot pend");
      assertVariantAction(request, action);
      this.decisions.push(action);
      this.next = this.iterator.next(action);
    }
    this.result = this.next.value;
  }
  act(input: Decision): void {
    if (!this.pending) throw new Error("No variant decision pending");
    const action = validateVariantDecision(input);
    assertVariantAction(this.pending, action);
    this.next = this.iterator.next(action);
    this.decisions.push(action);
    this.pending = null;
    this.advance();
  }
  serialize(): VariantReplay {
    return {
      v: 3,
      engineVersion: 3,
      aiVersion: 1,
      variant: this.variant,
      ruleset: { id: this.game.adapter.profileId, version: 1 },
      seed: this.seed,
      length: this.length,
      humanSeat: this.humanSeat,
      id: this.id,
      decisions: [...this.decisions],
    };
  }
  static restore(
    input: unknown,
    aiDriver: SeatDriver = new VariantAiDriver(),
  ): VariantRunner {
    const saved = validateVariantReplay(input),
      runner = new VariantRunner({
        seed: saved.seed,
        variant: saved.variant,
        length: saved.length,
        humanSeat: saved.humanSeat,
        ...(saved.id ? { id: saved.id } : {}),
        aiDriver,
      });
    runner.next = runner.iterator.next();
    for (const action of saved.decisions) {
      if (runner.next.done) throw new Error("Unused variant replay decisions");
      assertVariantAction(runner.next.value, action);
      runner.next = runner.iterator.next(action);
      runner.decisions.push(action);
    }
    runner.advance();
    return runner;
  }
}
