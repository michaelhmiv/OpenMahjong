/**
 * Seat drivers (brief §5 architecture seam): a driver is asked, given the
 * seat's public PlayerView and the engine's decision context, which legal
 * action to take. Two implementations:
 *
 * - HumanDriver — always returns PENDING; the runner turns that into a
 *   suspension and the UI collects the action from the player.
 * - AiDriver — the real slice-1 opponent from @openmahjong/ai (brief §6:
 *   efficiency core, hand-value judgment, basic defense against riichi),
 *   adapted to this interface. The AI policy is a pure function of the
 *   public PlayerView and never pends, so the adapter is a thin wrapper.
 *   One instance is shared by the three AI seats — the policy keys its
 *   per-discard call bookkeeping by seat, the same shape its own
 *   10,000-game soak runs (PR #5, acceptance A3).
 *
 * This replaces the TEMPORARY efficiency-greedy TempAiDriver that stood
 * in for the AI seats until packages/ai merged; that class is deleted,
 * not kept as a fixture — the tests exercise the real opponent.
 *
 * Drivers never invent legality: contexts come from the engine, and the
 * engine throws on an illegal action, so a driver bug fails loudly in
 * tests rather than corrupting a game.
 */

import { createAiPolicy, createLegacyAiPolicy, createVariantPolicy } from "@openmahjong/ai";
import type {
  CallAction,
  CallContext,
  PlayerView,
  TurnAction,
  TurnContext,
} from "@openmahjong/engine";

export const PENDING: unique symbol = Symbol("driver-pending");

export interface SeatDriver {
  readonly name: string;
  turn(view: PlayerView, ctx: TurnContext): TurnAction | typeof PENDING;
  call(view: PlayerView, ctx: CallContext): CallAction | typeof PENDING;
}

/** The human seat: every decision is collected through the UI. */
export class HumanDriver implements SeatDriver {
  readonly name = "human";
  turn(): typeof PENDING {
    return PENDING;
  }
  call(): typeof PENDING {
    return PENDING;
  }
}

/** The AI seats: @openmahjong/ai's policy behind the seat-driver seam. */
export class AiDriver implements SeatDriver {
  readonly name = "ai";
  private readonly policy;

  constructor(legacy = false) {
    this.policy = legacy ? createLegacyAiPolicy() : createAiPolicy();
  }

  turn(view: PlayerView, ctx: TurnContext): TurnAction {
    return this.policy.turn(view, ctx);
  }

  call(view: PlayerView, ctx: CallContext): CallAction {
    return this.policy.call(view, ctx);
  }
}
/** Variant-owned policy behind the same public seat-driver boundary. */
export class VariantAiDriver implements SeatDriver {
  readonly name="variant-ai";
  private readonly policy=createVariantPolicy();
  turn(view:PlayerView,context:TurnContext):TurnAction{return this.policy.turn(view,context);}
  call(view:PlayerView,context:CallContext):CallAction{return this.policy.call(view,context);}
}
