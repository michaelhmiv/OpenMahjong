/**
 * @openmahjong/web — the Open Mahjong web client (brief §7–§10).
 *
 * The app entry is main.ts (Vite). This module re-exports the client's
 * testable core: the event-log view model, the seat-driver seam, and the
 * deterministic game runner. The client renders engine state and holds
 * no game logic of its own.
 */
export * from "./model.js";
export * from "./drivers.js";
export * from "./runner.js";
export * from "./settings.js";
export * from "./api.js";
export * from "./records.js";
export * from "./replay.js";
export * from "./review.js";
export * from "./ads.js";
