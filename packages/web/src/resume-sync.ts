/**
 * Account carry-over for the in-progress game (Michael's ruling,
 * 2026-11-16): signed-in players' unfinished games follow the
 * account; guests stay device-local.
 *
 * The local save (settings.ts) remains the source of truth on this
 * device and is written first, always. This layer only mirrors it:
 *
 * - Every local save is pushed to PUT /api/resume, debounced —
 *   a game saves after every advance, so pushes coalesce to the
 *   trailing state a few seconds later (plus a flush as the page
 *   hides).
 * - Finishing or abandoning the game (the local clear points) also
 *   clears the server copy.
 * - At boot/sign-in, GET /api/resume reconciles: the newer of the
 *   local and account copies wins. A server win is written into the
 *   local slot, so the existing resume flow offers it unchanged; a
 *   local win is pushed up.
 *
 * Sync is best-effort by design: the API client resolves failures to
 * null instead of throwing, writes are serialized through one chain
 * so a clear can never be overtaken by an earlier push, and nothing
 * here ever touches the local copy on a failure path.
 */

import { deleteResume, fetchResume, putResume, type ResumePayload } from "./api.js";
import { loadGame, loadGameSavedAt, storeGame } from "./settings.js";
import type { SavedGame } from "./runner.js";

export interface ResumeAuth {
  readonly signedIn: boolean;
  readonly csrfToken: string | null;
}

const DEFAULT_DEBOUNCE_MS = 3_000;
/** fetch() keepalive bodies are capped near 64 KB by the platform. */
const KEEPALIVE_MAX_BYTES = 60_000;

export class ResumeSync {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: { state: SavedGame; savedAt: number } | null = null;
  /** Serializes server writes: call order is landing order. */
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly deps: {
      auth: () => ResumeAuth;
      fetchFn?: typeof fetch;
      debounceMs?: number;
    },
  ) {}

  /** A local resume-save just happened (App.afterAdvance). */
  noteSave(state: SavedGame, savedAt: number): void {
    if (!this.deps.auth().signedIn) {
      this.cancelPending();
      return;
    }
    this.pending = { state, savedAt };
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.enqueuePush(false);
    }, this.deps.debounceMs ?? DEFAULT_DEBOUNCE_MS);
  }

  /** The local game was cleared: finish, abandon, or restart. */
  noteClear(): void {
    this.cancelPending();
    const { signedIn, csrfToken } = this.deps.auth();
    if (!signedIn) return;
    this.enqueue(async () => {
      await deleteResume(csrfToken, this.deps.fetchFn);
    });
  }

  /** The page is hiding: push any debounced save immediately. */
  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.enqueuePush(true);
  }

  /**
   * Boot/sign-in reconciliation. Runs only when signed in; a failed
   * fetch leaves both copies exactly as they are.
   */
  async reconcile(): Promise<void> {
    const { signedIn, csrfToken } = this.deps.auth();
    if (!signedIn) return;
    const state = loadGame();
    // A save written before timestamps existed counts as oldest (0).
    const local = state ? { state, savedAt: loadGameSavedAt() ?? 0 } : null;
    const remote = await fetchResume(this.deps.fetchFn);
    if (remote === null) return; // failure: never guess, never overwrite
    if (remote === "empty") {
      if (local) await this.enqueuePushNow(local.state, local.savedAt, csrfToken);
      return;
    }
    const remoteSavedAt = Date.parse(remote.savedAt);
    if (!local || remoteSavedAt > local.savedAt) {
      // The account copy is newer: it becomes the local resume.
      storeGame(remote.state, remoteSavedAt);
      return;
    }
    if (remoteSavedAt < local.savedAt) {
      await this.enqueuePushNow(local.state, local.savedAt, csrfToken);
    }
    // Equal timestamps: the same save on both sides — nothing to do.
  }

  private cancelPending(): void {
    this.pending = null;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private enqueue(op: () => Promise<void>): Promise<void> {
    const run = this.chain.then(op);
    // The chain itself never stays rejected; ops are best-effort.
    this.chain = run.catch(() => {});
    return run.catch(() => {});
  }

  private enqueuePush(forUnload: boolean): void {
    const pending = this.pending;
    this.pending = null;
    if (!pending) return;
    const { signedIn, csrfToken } = this.deps.auth();
    if (!signedIn) return;
    void this.enqueuePushNow(pending.state, pending.savedAt, csrfToken, forUnload);
  }

  private enqueuePushNow(
    state: SavedGame,
    savedAt: number,
    csrfToken: string | null,
    forUnload = false,
  ): Promise<void> {
    return this.enqueue(async () => {
      const payload: ResumePayload = {
        state,
        savedAt: new Date(savedAt).toISOString(),
      };
      const keepalive =
        forUnload &&
        new TextEncoder().encode(JSON.stringify(payload)).length <=
          KEEPALIVE_MAX_BYTES;
      await putResume(payload, csrfToken, this.deps.fetchFn, { keepalive });
    });
  }
}
