/**
 * Open Mahjong web client (brief §7–§10).
 *
 * The client renders engine state and holds no game logic of its own:
 * the table is a fold of the engine event log (model.ts), decisions are
 * collected through the seat-driver seam (drivers.ts) and executed by
 * the deterministic runner (runner.ts). Animation is state-to-state:
 * the playback loop folds events one at a time and FLIP-animates the
 * tile elements that moved (brief §9).
 */

import {
  doraFromIndicator,
  tileTypeName,
  type CallAction,
  type GameEvent,
  type GameLength,
  type Seat,
  type Tile,
  type TileType,
  type TurnAction,
  type VariantId,
  type VariantLength,
} from "@openmahjong/engine";
import {
  countsOfTiles,
  doraWeightsOf,
  evaluateDiscards,
} from "@openmahjong/ai";
import {
  GOOGLE_START_URL,
  deleteAccount,
  fetchGame,
  fetchGames,
  fetchServerSettings,
  fetchStats,
  initAuth,
  postGame,
  postImport,
  putSettings,
  signOut,
  type ApiUser,
  type GameRecord,
  type GameSummary,
  type StatsSums,
} from "./api.js";
import {
  SOURCE_LOCALE,
  firstVisitDetectedLocale,
  getCurrentLocale,
  improveTranslationUrl,
  isMachineTranslated,
  localeMeta,
  pathForLocale,
  setRememberedLocale,
  shippedLocaleMeta,
  slugify,
  t,
  tForLocale,
  tx,
} from "./i18n/index.js";
import { AiDriver } from "./drivers.js";
import { TableModel, foldEvents, tileById, type WinInfo } from "./model.js";
import {
  ZERO_HAND_STATS,
  buildGameRecord,
  formatRecordStrip,
  formatStandingsPoints,
  formatStatsView,
  historyDateLabel,
  mergeLocalGameRecords,
  placementLabel,
  shouldOfferImport,
  sumRecords,
} from "./records.js";
import { GameRunner, type SavedGame } from "./runner.js";
import { type DecisionReview, type MomentGrade, type ReviewDecision } from "./review.js";
import { momentTexts, type MomentText } from "./moment-text.js";
import { type ReviewUIController } from "./review-ui.js";
import { buildBoardReview, type BoardTimeline } from "./board-review.js";
import { mountBoardReview, mountGameDetail } from "./board-review-ui.js";
import { mountInPerson } from "./in-person-ui.js";
import { readTables, deleteTableAccountCache, rememberTableAccount, offlineTableAccount } from "./in-person-store.js";
import { VariantRunner } from "./variant-runner.js";
import { variantHomeHand } from "./variant-motifs.js";
import { mountVariantTable } from "./variant-table-ui.js";
import { mountVariantEducation } from "./variant-education-ui.js";
import { mountAmericanCard } from "./american-card-ui.js";
import { registerAmericanLessons } from "./american-lesson-ui.js";
import {
  AMERICAN_LESSONS,
  AMERICAN_SECTION_ID,
  AMERICAN_SECTION_NAME,
  AMERICAN_TRAINING_LINE,
  americanLessonMounter,
  readAmericanProgress,
} from "./education/american.js";
import { cardHandCount } from "./education/american-card.js";
import { VARIANT_RELEASES, VARIANT_LEARNING_KEY, variantLessons } from "./education/variant-content.js";
import { emptyVariantProgress, mergeVariantProgress, parseVariantProgress, type VariantLearningProgress } from "./education/variant-progress.js";
import { createPracticeView } from "./practice-ui.js";
import { SKILLS, type SkillId } from "./education/curriculum.js";
import { loadPracticeProgress, savePracticeProgress, parsePracticeProgress, mergePracticeProgress, PRACTICE_STORAGE_KEY, type PracticeProgress } from "./education/practice-progress.js";
import { loadReviewCollection, saveReviewCollection, parseReviewCollection, mergeReviewCollections, addReviewPosition, REVIEW_COLLECTION_KEY } from "./education/review-collection.js";
import {
  appendRecord,
  clearGame,
  focusFrameTaught,
  importHandled,
  loadGame,
  loadHistory,
  loadRecords,
  loadSettings,
  markFocusFrameTaught,
  markImportHandled,
  osPrefersReducedMotion,
  saveGame,
  saveSettings,
  type Settings,
} from "./settings.js";
import { ResumeSync } from "./resume-sync.js";
import { ClickSound } from "./sound.js";
import { TILE_SPRITE_SVG } from "./tiles-sprite.js";
import { adviseCall, adviseDiscard, adviseKan, adviseRiichi, adviseWin, tileName, type TurnAdvice } from "@openmahjong/coach";
import { tileIndexEl } from "./tile-index.js";
import { decomposeHand, segmentTileIds, type HandSegment } from "./hand-groups.js";

/** Does adding tile `type` to the counts complete a run through it? */
function suitedWaitRun(counts: readonly number[], type: TileType): boolean {
  if (type >= 27) return false;
  const rank = (type % 9) + 1;
  const base = Math.floor(type / 9) * 9;
  const has = (r: number) => r >= 1 && r <= 9 && (counts[base + r - 1] ?? 0) > 0;
  return (
    (has(rank - 2) && has(rank - 1)) ||
    (has(rank - 1) && has(rank + 1)) ||
    (has(rank + 1) && has(rank + 2))
  );
}
import { tileInfo } from "./tile-info.js";
import { adSlotEl } from "./ads.js";
import {
  trackGameFinished,
  trackGameStarted,
  trackLessonCompleted,
  trackLessonStarted,
  trackReviewOpened,
  trackSignInCompleted,
} from "./analytics.js";
import {
  LessonController,
  MODULES,
  TUTORIAL_SETTINGS_KEY,
  loadTutorialProgress,
  mergeProgress,
  moduleDef,
  parseProgress,
  saveTutorialProgress,
  type LessonAction,
  type ModuleId,
  type TutorialProgress,
} from "./tutorial.js";

/** sessionStorage flag set when the user leaves for Google sign-in,
 *  so the returning boot can tell a just-completed sign-in from an
 *  already-signed-in one (analytics sign_in_completed). */
const SIGN_IN_PENDING_KEY = "om.signin.pending";

// ---------------------------------------------------------------------------
// Presentation data (names only — all values come from the engine)
// ---------------------------------------------------------------------------

/** Yaku id -> { key, label, han }. Presentation table for the breakdown;
 *  han values are the standard ones the engine's scorer awards. `label`
 *  is the English display name (the extractor's source for the key);
 *  `key` is the en.json key the render site resolves with t() — this
 *  record is built at module scope (before initI18n), so it must not
 *  call t()/tx() here (see fillWinBreakdown). Unknown ids fall back to
 *  the id itself. */
const YAKU: Record<string, { key: string; label: string; han: number }> = {
  riichi: { key: "ui.app.riichi", label: "Riichi", han: 1 },
  "double-riichi": { key: "ui.app.double-riichi", label: "Double Riichi", han: 2 },
  ippatsu: { key: "ui.app.ippatsu", label: "Ippatsu", han: 1 },
  "menzen-tsumo": { key: "ui.app.menzen-tsumo", label: "Menzen Tsumo", han: 1 },
  pinfu: { key: "ui.app.pinfu", label: "Pinfu", han: 1 },
  iipeikou: { key: "ui.app.iipeikou", label: "Iipeikou", han: 1 },
  ryanpeikou: { key: "ui.app.ryanpeikou", label: "Ryanpeikou", han: 3 },
  tanyao: { key: "ui.app.tanyao", label: "Tanyao", han: 1 },
  "yakuhai-haku": { key: "ui.app.yakuhai-haku", label: "Yakuhai (Haku)", han: 1 },
  "yakuhai-hatsu": { key: "ui.app.yakuhai-hatsu", label: "Yakuhai (Hatsu)", han: 1 },
  "yakuhai-chun": { key: "ui.app.yakuhai-chun", label: "Yakuhai (Chun)", han: 1 },
  "yakuhai-seat": { key: "ui.app.yakuhai-seat-wind", label: "Yakuhai (Seat Wind)", han: 1 },
  "yakuhai-round": { key: "ui.app.yakuhai-round-wind", label: "Yakuhai (Round Wind)", han: 1 },
  chankan: { key: "ui.app.chankan", label: "Chankan", han: 1 },
  rinshan: { key: "ui.app.rinshan-kaihou", label: "Rinshan Kaihou", han: 1 },
  haitei: { key: "ui.app.haitei-raoyue", label: "Haitei Raoyue", han: 1 },
  houtei: { key: "ui.app.houtei-raoyui", label: "Houtei Raoyui", han: 1 },
  chiitoitsu: { key: "ui.app.chiitoitsu", label: "Chiitoitsu", han: 2 },
  ittsu: { key: "ui.app.ittsu", label: "Ittsu", han: 2 },
  "sanshoku-doujun": { key: "ui.app.sanshoku-doujun", label: "Sanshoku Doujun", han: 2 },
  "sanshoku-doukou": { key: "ui.app.sanshoku-doukou", label: "Sanshoku Doukou", han: 2 },
  sanankou: { key: "ui.app.sanankou", label: "Sanankou", han: 2 },
  sankantsu: { key: "ui.app.sankantsu", label: "Sankantsu", han: 2 },
  toitoi: { key: "ui.app.toitoi", label: "Toitoi", han: 2 },
  honchan: { key: "ui.app.honchantai", label: "Honchantai", han: 2 },
  shousuushi: { key: "ui.app.shousuushi", label: "Shousuushi", han: 13 },
  shousangen: { key: "ui.app.shousangen", label: "Shousangen", han: 2 },
  daisangen: { key: "ui.app.daisangen", label: "Daisangen", han: 13 },
  chinroutou: { key: "ui.app.chinroutou", label: "Chinroutou", han: 13 },
  honitsu: { key: "ui.app.honitsu", label: "Honitsu", han: 3 },
  junchan: { key: "ui.app.junchan", label: "Junchan", han: 3 },
  honroutou: { key: "ui.app.honroutou", label: "Honroutou", han: 2 },
  chinitsu: { key: "ui.app.chinitsu", label: "Chinitsu", han: 6 },
  tenhou: { key: "ui.app.tenhou", label: "Tenhou", han: 13 },
  chiihou: { key: "ui.app.chiihou", label: "Chiihou", han: 13 },
  kokushi: { key: "ui.app.kokushi-musou", label: "Kokushi Musou", han: 13 },
  "kokushi-13": { key: "ui.app.kokushi-musou-13-wait", label: "Kokushi Musou (13-wait)", han: 26 },
  suuankou: { key: "ui.app.suuankou", label: "Suuankou", han: 13 },
  "suuankou-tanki": { key: "ui.app.suuankou-tanki", label: "Suuankou Tanki", han: 26 },
  chuuren: { key: "ui.app.chuuren-poutou", label: "Chuuren Poutou", han: 13 },
  "chuuren-junsei": { key: "ui.app.junsei-chuuren-poutou", label: "Junsei Chuuren Poutou", han: 26 },
  daisuushi: { key: "ui.app.daisuushi", label: "Daisuushi", han: 26 },
  tsuiisou: { key: "ui.app.tsuiisou", label: "Tsuiisou", han: 13 },
  ryuuiisou: { key: "ui.app.ryuuiisou", label: "Ryuuiisou", han: 13 },
  suukantsu: { key: "ui.app.suukantsu", label: "Suukantsu", han: 13 },
};

const WIND_NAMES: Record<number, string> = { 27: "East", 28: "South", 29: "West", 30: "North" };
const WIND_KANJI: Record<number, string> = { 27: "東", 28: "南", 29: "西", 30: "北" };
/** Generic fallback when the abortive-draw id is unknown (same
 *  module-scope pattern: the label is the extractor's English source,
 *  the key is what the render site resolves with t()). */
const ABORTIVE_DRAW_FALLBACK = { key: "ui.app.abortive-draw", label: "Abortive draw" };
/** Abortive-draw id -> { key, label } (same module-scope rule as YAKU
 *  above: the label is the extractor's English source, the key is what
 *  the render site resolves with t()). */
const ABORTIVE_NAMES: Record<string, { key: string; label: string }> = {
  "kyuushu-kyuuhai": { key: "ui.app.kyuushu-kyuuhai-nine-terminals", label: "Kyuushu Kyuuhai (nine terminals)" },
  "suucha-riichi": { key: "ui.app.suucha-riichi-four-riichi", label: "Suucha Riichi (four riichi)" },
  "suufon-renda": { key: "ui.app.suufon-renda-four-winds", label: "Suufon Renda (four winds)" },
  suukaikan: { key: "ui.app.suukaikan-four-kan", label: "Suukaikan (four kan)" },
};

/**
 * The home tile strip's hand (design rules section 4): tile ids in
 * set groups of 3-3-3-2-3 — 2m 3m 4m · 3p 4p red-5p · 6s 7s 8s ·
 * 9s 9s · chun x3. Copy 0 of a five is the red five, so id 52 is the
 * red 5p.
 */
export const HOME_STRIP_GROUPS: number[][] = [
  [5, 9, 13],
  [45, 49, 52],
  [93, 97, 101],
  [105, 106],
  [133, 134, 135],
];

export function tileSymbol(tile: Tile): string {
  if (tile.type >= 34 && tile.type < 42) return `t-f${tile.type - 34}`;
  if (tile.type < 9) return tile.red ? "t-m5r" : `t-m${tile.type + 1}`;
  if (tile.type < 18) return tile.red ? "t-p5r" : `t-p${tile.type - 8}`;
  if (tile.type < 27) return tile.red ? "t-s5r" : `t-s${tile.type - 17}`;
  return ["t-ew", "t-sw", "t-ww", "t-nw", "t-haku", "t-hatsu", "t-chun"][tile.type - 27]!;
}

export function tileLabel(tile: Tile): string {
  if (tile.type < 27) {
    const suit = ["characters", "circles", "bamboo"][Math.floor(tile.type / 9)]!;
    return tx("ui.app.v-0-of-1-2", `${(tile.type % 9) + 1} of ${suit}${tile.red ? " " + tx("ui.app.red-five", "(red five)") : ""}`, (tile.type % 9) + 1, suit, tile.red ? " " + tx("ui.app.red-five", "(red five)") : "");
  }
  return { 27: "East wind", 28: "South wind", 29: "West wind", 30: "North wind", 31: "White dragon", 32: "Green dragon", 33: "Red dragon" }[tile.type]!;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}



// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

type Child = Node | string;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) el.append(c);
  return el;
}

/** A tile element: FLIP wrapper (never transformed by layout classes)
 *  around the visual tile (which may rotate/lift). `index` lays the
 *  corner index over the face — inspect surfaces only (the Inspect
 *  hand sheet, Focus Frames, the explanation sheet, lesson surfaces
 *  under the no-leak law); board tiles never pass it. */
function tileEl(tile: Tile, cls: string, opts: { flip?: boolean; index?: boolean } = {}): HTMLSpanElement {
  const inner = h("span", { class: `tile ${cls}`, role: "img", "aria-label": tileLabel(tile) });
  inner.innerHTML = `<svg viewBox="0 0 40 56"><use href="#${tileSymbol(tile)}"/></svg>`;
  if (opts.index) {
    const index = tileIndexEl(tile);
    if (index) inner.append(index);
  }
  const wrap = h("span", { class: "twrap" });
  wrap.append(inner);
  if (opts.flip !== false) wrap.dataset["flip"] = `tile-${tile.id}`;
  return wrap;
}

const ICON_CHECK = `<svg viewBox="0 0 24 24"><path d="M4.5 12.5l5 5L19.5 7"/></svg>`;

/** The discard-safety badge (guided-play package): a state-green
 *  disc with a cream check, riding the top-right corner of a tile
 *  that cannot deal in — safe against every riichi player, a
 *  certainty, never a likelihood. */
function safetyBadgeEl(): HTMLSpanElement {
  const badge = h("span", { class: "safebadge", "aria-hidden": "true" });
  badge.innerHTML = ICON_CHECK;
  return badge;
}

/**
 * The safety reason the hint bubble states when a badged tile is
 * selected — the fact in words, naming each riichi player the tile
 * is safe against (the badge is never colour alone).
 */
export function safetyLineText(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) {
    return tx("ui.app.safe-against-0-1-has-discarded-this-tile-so-2-ca", `Safe against ${names[0]} — ${names[0]} has discarded this tile, so ${names[0]} cannot win on it.`, names[0], names[0], names[0]);
  }
  const list =
    names.length === 2
      ? tx("ui.app.v-0-and-1", `${names[0]} and ${names[1]}`, names[0], names[1])
      : tx("ui.app.v-0-and-1-2", `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`, names.slice(0, -1).join(", "), names[names.length - 1]);
  return names.length === 2
    ? tx("ui.app.safe-against-0-both-have-discarded-this-tile-so", `Safe against ${list} — both have discarded this tile, so neither can win on it.`, list)
    : tx("ui.app.safe-against-0-all-of-them-have-discarded-this-t", `Safe against ${list} — all of them have discarded this tile, so none of them can win on it.`, list);
}

/** The faces of a call option's resulting set, in display order: the
 *  call word's tiles as the app draws them everywhere else, with the
 *  called tile sideways — the same grammar a meld uses on the table.
 *  Decorative beside the button's aria-label, which names the tiles. */
function chiFacesEl(faces: readonly { readonly tile: Tile; readonly side?: boolean }[]): HTMLElement {
  const strip = h("span", { class: "callfaces", "aria-hidden": "true" });
  for (const f of faces) {
    strip.append(tileEl(f.tile, `t-meld${f.side ? " side" : ""}`, { flip: false }));
  }
  return strip;
}

/** A chi option's faces: the called tile plus the hand tiles it
 *  pairs with, sorted into sequence order. */
function chiOptionFaces(called: Tile, handTiles: readonly Tile[]): { tile: Tile; side?: boolean }[] {
  return [called, ...handTiles]
    .sort((a, b) => a.type - b.type)
    .map((t) => (t.id === called.id ? { tile: t, side: true } : { tile: t }));
}

/** Preserve the approved tile geometry while exposing the same action
 * to keyboard and assistive-technology users. Repainting must not lose
 * focus between selecting a tile and discarding it. */
function tileControl(el: HTMLElement, key: string, label: string, action: () => void, selected = false): void {
  el.setAttribute("role", "button");
  el.tabIndex = 0;
  el.setAttribute("aria-label", label);
  el.setAttribute("aria-pressed", String(selected));
  el.dataset["controlKey"] = key;
  el.querySelectorAll("[role=img]").forEach((img) => img.setAttribute("aria-hidden", "true"));
  const activate = () => {
    const focused = document.activeElement === el;
    action();
    if (focused && !el.isConnected) {
      const next = [...document.querySelectorAll<HTMLElement>("[data-control-key]")]
        .find((candidate) => candidate.dataset["controlKey"] === key);
      next?.focus();
    }
  };
  el.addEventListener("click", activate);
  el.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (!event.repeat) activate();
  });
}

function focusByKey(key: string | undefined): void {
  if (!key) return;
  [...document.querySelectorAll<HTMLElement>("[data-control-key]")]
    .find((el) => el.dataset["controlKey"] === key)?.focus();
}

function accessibleDialog(dialog: HTMLElement, label: string, close: () => void): void {
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", label);
  dialog.tabIndex = -1;
  const controls = () => [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]')];
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const items = controls();
    if (!items.length) { event.preventDefault(); dialog.focus(); return; }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
      event.preventDefault(); first.focus();
    }
  });
  (controls()[0] ?? dialog).focus();
}

function backEl(cls: string, flipKey?: string): HTMLSpanElement {
  const inner = h("span", { class: `tile ${cls}` });
  inner.innerHTML = `<svg viewBox="0 0 40 56"><use href="#t-back"/></svg>`;
  const wrap = h("span", { class: "twrap" });
  wrap.append(inner);
  if (flipKey) wrap.dataset["flip"] = flipKey;
  return wrap;
}

const ICON_MENU = `<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`;
const ICON_SOUND_ON = `<svg viewBox="0 0 24 24"><path d="M4 10v4h3l5 4V6l-5 4H4z"/><path d="M16 9c1.2 1.6 1.2 4.4 0 6M18.5 6.5c2.4 3.2 2.4 7.8 0 11"/></svg>`;
const ICON_SOUND_OFF = `<svg viewBox="0 0 24 24"><path d="M4 10v4h3l5 4V6l-5 4H4z"/><path d="M16.5 9.5l5 5m0-5l-5 5"/></svg>`;
const ICON_CLOSE = `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
const ICON_EXPAND = `<svg viewBox="0 0 24 24"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/></svg>`;
const ICON_SORT = `<svg viewBox="0 0 24 24"><path d="M7 5v13M7 18l-3.5-3.5M7 18l3.5-3.5M17 19V6M17 6L13.5 9.5M17 6l3.5 3.5"/></svg>`;

/**
 * First-visit language sheet (i18n switcher v1, frame 03): the quiet,
 * dismissible confirmation shown when the browser language matches a
 * shipped locale the user has not chosen yet. The title and primary
 * button are in the *detected* language (read from that locale's
 * approved strings via tForLocale — never from a draft), while the
 * decline is always readable in English. The sheet's English sources
 * below are the keys' sources — the frame's Japanese strings were
 * mock copy for the rendering only and are never used here.
 */
export function buildFirstVisitSheet(
  detected: string,
  callbacks: { onAccept: () => void; onDecline: () => void },
): { scrim: HTMLElement; sheet: HTMLElement } {
  const meta = localeMeta(detected);
  const native = meta?.native ?? detected;
  const english = meta?.english ?? detected;
  const scrim = h("div", { class: "i18n-scrim" });
  const sheet = h("div", { class: "sheet i18n-sheet" });
  const dismiss = h("button", {
    class: "i18n-x",
    "aria-label": tx("ui.app.language.sheet.dismiss", "Dismiss"),
  }, "×");
  dismiss.addEventListener("click", () => callbacks.onDecline());
  const useBtn = h(
    "button",
    { class: "pillbtn primary" },
    tForLocale("ui.app.language.sheet.use", detected, "Use {0}", native),
  );
  useBtn.addEventListener("click", () => callbacks.onAccept());
  const stayBtn = h(
    "button",
    { class: "pillbtn ghost" },
    tx("ui.app.language.sheet.stay", "Continue in English"),
  );
  stayBtn.addEventListener("click", () => callbacks.onDecline());
  const col = h("div", { class: "col" }, useBtn, stayBtn);
  sheet.append(
    dismiss,
    h("div", { class: "t" }, tForLocale("ui.app.language.sheet.title", detected, "Display in {0}?", native)),
    h("div", { class: "s" }, tx("ui.app.language.sheet.sub", "Your browser is set to {0}. Switch Open Mahjong to {0}?", english)),
    col,
    h("div", { class: "fine" }, tx("ui.app.language.sheet.fine", "You can change this later in More → Language.")),
    // Machine-translation marking (owner ruling Nov 19, 2026): the
    // detected locale ships as a machine translation, so the sheet
    // says so at the decision point, in English, before the user
    // accepts. A second .fine line in the shipped sheet grammar —
    // the sheet grows one line upward; nothing else moves.
    ...(isMachineTranslated(detected)
      ? [h("div", { class: "fine" }, tx("ui.app.language.sheet.machine", "{0} is machine translated and awaiting community review.", english))]
      : []),
  );
  accessibleDialog(sheet, tx("ui.app.language", "Language"), () => callbacks.onDecline());
  return { scrim, sheet };
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

/**
 * "Improve this translation" link (community review path,
 * ~/workspace/mahjong-prep/community-review-design.md §1). Rendered in the
 * More tab footer, below the AGPL line, only when the current locale is
 * not English — in English there is no translation to improve. It opens
 * the contributor guide (docs/translating.md on GitHub), which names the
 * exact locale file per language and the no-git web-editor flow. The
 * label is a literal here like the other unwired strings in this file:
 * the extractor inventories it into en.json and Phase 2 wiring picks it
 * up; in a draft locale it renders in English, which is the honest
 * rendering for a guide written in English. Returns null in English.
 * Same external-link pattern as the About screen (target _blank,
 * rel noreferrer) and the same .footer treatment as the AGPL line.
 */
export function buildImproveTranslationLink(): HTMLAnchorElement | null {
  const url = improveTranslationUrl(getCurrentLocale());
  if (!url) return null;
  return h(
    "a",
    { href: url, target: "_blank", rel: "noreferrer" },
    tx("ui.app.improve-this-translation", "Improve this translation"),
  );
}

type ScreenName =
  | "home"
  | "table"
  | "rules"
  | "about"
  | "privacy"
  | "language"
  | "variant-table"
  | "variant-learn"
  | "american-card"
  | "american-lesson"
  | "tables"
  | "details"
  | "results"
  | "games"
  | "learn"
  | "practice"
  | "review"
  | "more";

/** The four tab roots of the app shell (approved 2026-11-16). The
 *  "home" screen is the Play tab. */
type TabRoot = "home" | "learn" | "games" | "more";
const TAB_ROOTS: readonly TabRoot[] = ["home", "learn", "games", "more"];

/** Tab bar definitions (app shell, renderings 01-06): labels and
 *  icon geometry are the approved mocks', verbatim. Labels are keys,
 *  resolved with t() when the tab bar is built (in the App
 *  constructor, after main.ts runs initI18n) — never at module scope:
 *  module-scope t() runs at import time, before initI18n, so it
 *  would always render English. */
const TAB_DEFS: { name: TabRoot; key: string; icon: string }[] = [
  {
    name: "home",
    // Phase 1 i18n wiring: tab labels come from the key file. In English
    // these resolve to exactly the previous literals ("Play", "Learn",
    // "Games", "More") — byte-identical output, no visible change.
    key: "ui.app.play",
    icon: `<rect x="5" y="3" width="14" height="18" rx="3"/><circle cx="9.2" cy="9.2" r="1.7" style="fill:currentColor;stroke:none"/><circle cx="14.8" cy="9.2" r="1.7" style="fill:currentColor;stroke:none"/><circle cx="12" cy="15" r="1.7" style="fill:currentColor;stroke:none"/>`,
  },
  {
    name: "learn",
    key: "ui.app.learn",
    icon: `<path d="M12 6.2C10.2 4.7 8 4.2 4 4.2v13.6c4 0 6.2.5 8 2 1.8-1.5 4-2 8-2V4.2c-4 0-6.2.5-8 2z"/><path d="M12 6.2v13.6"/>`,
  },
  {
    name: "games",
    key: "ui.app.games",
    icon: `<path d="M9 5.5h11M9 12h11M9 18.5h11"/><circle cx="4.5" cy="5.5" r="1.3" style="fill:currentColor;stroke:none"/><circle cx="4.5" cy="12" r="1.3" style="fill:currentColor;stroke:none"/><circle cx="4.5" cy="18.5" r="1.3" style="fill:currentColor;stroke:none"/>`,
  },
  {
    name: "more",
    key: "ui.app.more",
    icon: `<path d="M3.5 8h9M18 8h2.5M3.5 16h3M12 16h8.5"/><circle cx="15.2" cy="8" r="2.3"/><circle cx="9.2" cy="16" r="2.3"/>`,
  },
];

/** Collapsed Learn sections persist on this device only — a display
 *  preference, never account data. */
const LEARN_COLLAPSED_KEY = "openmahjong.learn.collapsed.v1";

function loadCollapsedSections(): Set<string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(LEARN_COLLAPSED_KEY) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

/** Learn's per-variant sections (Michael's build requirement,
 *  2026-11-16): lessons are grouped by variant from the start, so
 *  the Hong Kong, MCR, and Taiwanese sections slot in here later
 *  without restructuring the tab. */
const LEARN_SECTIONS: { id: string; key: string; title: string; modules: typeof MODULES }[] = [
  { id: "riichi", key: "learn.riichi.section-title", title: "Riichi", modules: MODULES },
];

/** A variant release's display name in the session locale
 *  (`common.variant.<slug>` — "Hong Kong Old Style" renders 香港旧式 in
 *  ja, 香港老式规则 in zh-Hans, and so on). The raw release name is
 *  English; rendering it raw is the same bug the rewire fixes. */
function releaseName(release: { name: string }): string {
  return t(`common.variant.${slugify(release.name)}`);
}

/** Live state of an in-progress game, derived from its saved record
 *  by the engine — the only source the Continue card and the Games
 *  in-progress row may read. */
interface SavedSummary {
  round: string;
  lengthLabel: string;
  standing: string;
  humanScore: number;
  scores: { name: string; score: number }[];
}


/** Pick the known settings keys out of a server payload, typed. */
function mergeServerSettings(local: Settings, srv: Partial<Settings>): Settings {
  return {
    sound: typeof srv.sound === "boolean" ? srv.sound : local.sound,
    motion: srv.motion === "reduced" || srv.motion === "standard" ? srv.motion : local.motion,
    largeTiles: typeof srv.largeTiles === "boolean" ? srv.largeTiles : local.largeTiles,
    lastLength: srv.lastLength === "east" || srv.lastLength === "south" ? srv.lastLength : local.lastLength,
    guided: typeof srv.guided === "boolean" ? srv.guided : local.guided,
  };
}
type FrameState =
  | { kind: "player"; seat: Seat }
  | { kind: "center" }
  | { kind: "hand"; mode: "inspect" | "chi" | "kan" }
  | { kind: "guide" }
  | { kind: "moment" }
  | null;

const EVENT_DELAYS: Record<string, number> = {
  "game-start": 0,
  "hand-start": 350,
  deal: 90,
  draw: 200,
  discard: 260,
  call: 340,
  riichi: 420,
  kan: 380,
  indicator: 200,
  win: 650,
  "drawn-hand": 650,
  score: 260,
  "hand-end": 200,
  "game-end": 400,
};

export class App {
  private settings: Settings = loadSettings();
  private readonly sound = new ClickSound();
  private runner: GameRunner | null = null;
  private variantRunner: VariantRunner | null = null;
  private variantUI: {destroy():void} | null = null;
  private variantEducationUI: {destroy():void} | null = null;
  private americanCardUI: {destroy():void} | null = null;
  private americanLessonUI: {destroy():void} | null = null;
  private americanLessonId: string | undefined;
  private variantChoice: VariantId | "riichi" = "riichi";
  private variantLength: VariantLength = "full";
  private historyVariant: VariantId | "riichi" = "riichi";
  private variantProgress: VariantLearningProgress = emptyVariantProgress();
  private variantLessonId: string | undefined;
  private variantLearningId: VariantId = "hong-kong";
  private variantPracticeMode = false;
  private variantPracticeTopic: string | undefined;
  private variantReturnReview = false;
  private model = new TableModel(0);
  private cursor = 0;
  private playing = false;
  private skipPlayback = false;
  private generation = 0;
  private selectedTileId: number | null = null;
  private riichiArmed = false;
  private riichiDismissed = false;
  private frame: FrameState = null;
  private frameReturnFocus: string | undefined;
  /** Coach advice for the pending turn decision, memoised on the
   *  pending object so the hint overlay, the hand ring, and the
   *  inspect readout share one evaluation per decision. */
  private guideCacheFor: unknown = null;
  private guideCacheAdvice: TurnAdvice | null = null;
  /** The coaching moment (call / win / riichi / kan) for the pending
   *  decision, memoised on the pending object like the discard
   *  advice, so the prompt-row hint and the moment sheet share one
   *  evaluation per decision. */
  private guideMomentFor: unknown = null;
  private guideMomentGrade: MomentGrade | null = null;
  /** Manual hand arrangement (guided-play package): the player's own
   *  tile order from a press-and-hold shift, as tile ids. Validity is
   *  scoped by the runner identity plus a stamp — the cursor in
   *  guided mode (a manual order there lasts until the next event,
   *  when grouping re-sorts) or the hand-start index otherwise (the
   *  arrangement persists across draws within the hand). */
  private handOrder: number[] | null = null;
  private handOrderRunner: GameRunner | null = null;
  private handOrderStamp = "";
  /** The drawn tile at the moment the arrangement was made — that
   *  tile is part of the arrangement; a later draw is not. */
  private handOrderDrawnId: number | null = null;
  /** An in-progress press-and-hold tile grab, or null. */
  private tileDrag: {
    tileId: number;
    wrap: HTMLElement;
    inner: HTMLElement;
    ghost: HTMLElement | null;
    startX: number;
    dx: number;
    grabbed: boolean;
    moved: boolean;
    order: number[];
    timer: ReturnType<typeof setTimeout> | null;
    onMove: (ev: PointerEvent) => void;
    onUp: (ev: PointerEvent) => void;
  } | null = null;
  /** Hand-tile taps are ignored until this time — a grab's release
   *  (or a drag that never armed) must not read as a tap. */
  private suppressHandTapUntil = 0;
  /** Lesson strip tiles whose corner index the learner has tapped
   *  into view, keyed `${moduleId}:${stepIndex}:${position}`. */
  private lessonIndexRevealed = new Set<string>();
  private currentScreen: ScreenName = "home";
  /** The first-visit language sheet, while it is open on Play. */
  private firstVisitSheet: { scrim: HTMLElement; sheet: HTMLElement } | null = null;
  private practice: PracticeProgress = loadPracticeProgress();
  private practiceInitialSkill: SkillId | undefined;
  private reviewData: DecisionReview | null = null;
  private reviewTimeline: BoardTimeline | null = null;
  private reviewHandIndex = 0;
  private tableUI: {destroy():void} | null = null;
  private tableSessionId: string | undefined;
  private reviewRecordId: string | null = null;
  private reviewResumeDecision: number | undefined;
  private reviewUI: ReviewUIController | null = null;
  private reviewCollection = loadReviewCollection();
  private accountLoaded = false;
  private accountSyncRunning = false;
  private accountSyncWanted = false;
  private learningAccountId: string | null = null;
  private readonly pendingAccountSession = String(Date.now()) + Math.random().toString(36).slice(2);
  private frameChangedTiles = new Set<number>();
  private continueWaiter: (() => void) | null = null;
  private historyRecorded = false;
  private hintShownThisGame = false;
  private scale = 1;
  /** Account state (slice 2): null user = signed out or API unreachable;
   *  play never depends on it. */
  private user: ApiUser | null = null;
  private csrfToken: string | null = null;
  /** In-progress game carry-over (ruling, 2026-11-16): mirrors the
   *  local resume save to the account when signed in. */
  private readonly resumeSync = new ResumeSync({
    auth: () => ({ signedIn: !!this.user, csrfToken: this.csrfToken }),
  });
  private statsSums: StatsSums | null = null;
  private serverGameCount: number | null = null;
  /** The account's game summaries, kept for the home Last game card;
   *  null until bootAuth has fetched them. */
  private serverGames: GameSummary[] | null = null;
  private importOfferCount = 0;
  /** Tutorial state (slice-2 brief §9): progress persists locally and
   *  rides the account settings blob under a namespaced key. */
  private tutorial: TutorialProgress = loadTutorialProgress();
  private lesson: LessonController | null = null;
  /** True while the game on the table is TU-11 (the tutorial's full
   *  guided game): hints are forced on and finishing the game
   *  completes the module. */
  private tu11Active = false;

  constructor(private readonly root: HTMLElement) {
    // American training: register the lesson mounter behind the
    // Learn section's seam (education/american.ts), rendered with
    // the app's own tile renderer.
    registerAmericanLessons((tile) => this.learningTile(tile));
    this.sound.enabled = this.settings.sound;
    this.buildShell();
    this.fit();
    window.addEventListener("resize", () => this.fit());
    window.visualViewport?.addEventListener("resize", () => this.fit());
    this.applyTheme();
    this.renderPlay();
    // Browser history survives reload; the in-memory runner does not.
    // Reconcile this entry with the actual landing before navigation.
    window.history.replaceState({ openmahjongScreen: "home" }, "");
    this.showScreen("home");
    // First-visit language sheet (i18n switcher v1): offered once,
    // only when the browser language matches a shipped locale the
    // user has not chosen yet. Dormant while only English ships.
    this.maybeShowFirstVisitSheet();
    window.addEventListener("popstate", () => {
      const name = (window.history.state as { openmahjongScreen?: unknown } | null)?.openmahjongScreen;
      if (typeof name === "string" && this.screens.has(name as ScreenName)) {
        // A browser-back gesture leaves the current position saved;
        // returning to the table shows the same in-memory game.
        const target = name === "table" && !this.runner && !this.lesson ? "home" : name as ScreenName;
        if (target !== name) window.history.replaceState({ openmahjongScreen: target }, "");
        this.showScreen(target, false);
      }
    });
    window.addEventListener("online", () => { void this.bootAuth(); });
    // Carry-over: don't let a debounced resume push die with the tab.
    window.addEventListener("pagehide", () => { this.resumeSync.flush(); });
    // Account probe runs after first paint and never blocks play:
    // signed-out (or unreachable API) is the default landing state.
    void this.bootAuth();
  }

  private get humanSeat(): Seat {
    return this.runner?.humanSeat ?? 0;
  }

  private get reducedMotion(): boolean {
    return this.settings.motion === "reduced" || osPrefersReducedMotion();
  }

  // -- shell ---------------------------------------------------------------

  private stage!: HTMLElement;
  private screens = new Map<ScreenName, HTMLElement>();
  private tableEl!: HTMLElement;
  private tabbar!: HTMLElement;
  private tabBtns: HTMLButtonElement[] = [];
  /** The tab root a drilled-in screen returns to. */
  private lastRoot: TabRoot = "home";
  private swipeStart: { x: number; y: number } | null = null;
  private collapsedSections = loadCollapsedSections();

  private buildShell(): void {
    this.root.innerHTML = "";
    const sprite = h("div", { "aria-hidden": "true" });
    sprite.innerHTML = TILE_SPRITE_SVG;
    this.root.append(sprite);
    this.stage = h("div", { id: "stage" });
    this.root.append(this.stage);
    const screensWrap = h("div", { class: "screens" });
    this.stage.append(screensWrap);
    for (const name of ["home", "table", "rules", "about", "privacy", "language", "variant-table", "variant-learn", "american-card", "american-lesson", "tables", "details", "results", "games", "learn", "practice", "review", "more"] as ScreenName[]) {
      const s = h("section", { class: "screen", id: `screen-${name}` });
      this.screens.set(name, s);
      screensWrap.append(s);
    }
    this.tableEl = h("div", { id: "table" });
    this.screens.get("table")!.append(this.tableEl);
    // App shell (approved 2026-11-16): one persistent tab bar whose
    // visibility showScreen governs — it exists ONLY on the four tab
    // roots (nav law, design rules section 13).
    this.tabbar = h("nav", { class: "tabbar", "aria-label": tx("ui.app.main", "Main") });
    for (const def of TAB_DEFS) {
      const b = h("button", { class: "tabbtn", "data-tab": def.name });
      b.innerHTML = `<svg viewBox="0 0 24 24">${def.icon}</svg>`;
      b.append(h("span", {}, t(def.key)));
      b.addEventListener("click", () => this.showScreen(def.name));
      this.tabBtns.push(b);
      this.tabbar.append(b);
    }
    this.stage.append(this.tabbar);
    this.buildTextScreens();
    this.installSwipeBack();
  }

  private fit(): void {
    if (this.currentScreen === "practice" || this.currentScreen === "review" || this.currentScreen === "details" || this.currentScreen === "tables" || this.currentScreen === "variant-table" || this.currentScreen === "variant-learn" || this.currentScreen === "american-card" || this.currentScreen === "american-lesson") {
      // Approved learning layouts use physical pixels, so a 44px
      // control remains 44px even on a 360px-wide phone.
      this.scale = 1;
      this.stage.style.width = `${Math.min(window.innerWidth, 430)}px`;
      this.stage.style.height = `${window.innerHeight}px`;
      this.stage.style.transform = "none";
      return;
    }
    this.stage.style.width = "390px";
    // Width-locked scaling with a fluid stage height (brief section 8:
    // responsive scale-up). The 390x844 composition is the floor case:
    // at exactly 390x844 nothing changes. Taller screens get a taller
    // stage (the table's middle band and the screens' spacers absorb
    // the extra height) so the app fills the phone edge to edge at any
    // aspect ratio; shorter or capped screens letterbox onto the same
    // ground colour, so no seam ever shows.
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let s = vw / 390;
    let stageH = vh / s;
    if (stageH < 844) {
      s = vh / 844;
      stageH = 844;
    }
    if (s > 1.75) {
      s = 1.75;
      stageH = Math.max(844, vh / s);
    }
    this.scale = s;
    this.stage.style.height = `${stageH}px`;
    this.stage.style.transform = `scale(${s})`;
  }

  private showScreen(name: ScreenName, pushHistory = true): void {
    const previous = this.currentScreen;
    this.currentScreen = name;
    this.fit();
    if (pushHistory) {
      const state = { openmahjongScreen: name };
      if (window.history.state?.openmahjongScreen === undefined) window.history.replaceState(state, "");
      else if (previous !== name) window.history.pushState(state, "");
    }
    for (const [n, el] of this.screens) el.classList.toggle("active", n === name);
    // Nav law: the tab bar exists only on the four tab roots; every
    // drilled-in screen renders without it.
    const isRoot = (TAB_ROOTS as readonly string[]).includes(name);
    if (isRoot) this.lastRoot = name as TabRoot;
    this.tabbar.hidden = !isRoot;
    for (const b of this.tabBtns) {
      const on = b.dataset["tab"] === name;
      b.classList.toggle("on", on);
      if (on) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    }
    if (name === "home") this.renderPlay();
    if (name === "more") this.renderMore();
    if (name === "language") this.renderLanguage();
    if (name === "games") void this.renderGames();
    if (name === "learn") this.renderLearn();
    if (name === "practice") this.renderPractice();
    if (name === "review") this.renderReview();
    if (name === "details") this.renderGameDetail();
    if (name === "tables") this.renderInPerson();
    if (name === "variant-table") this.renderVariantTable();
    if (name === "variant-learn") this.renderVariantEducation();
    if (name === "american-card") this.renderAmericanCard();
    if (name === "american-lesson") this.renderAmericanLesson();
    if (previous === "variant-table" && name !== "variant-table") { this.variantUI?.destroy(); this.variantUI = null; }
    if (previous === "variant-learn" && name !== "variant-learn") { this.variantEducationUI?.destroy(); this.variantEducationUI = null; }
    if (previous === "american-card" && name !== "american-card") { this.americanCardUI?.destroy(); this.americanCardUI = null; }
    if (previous === "american-lesson" && name !== "american-lesson") { this.americanLessonUI?.destroy(); this.americanLessonUI = null; }
    if (previous === "tables" && name !== "tables") { this.tableUI?.destroy(); this.tableUI = null; }
    if (previous !== name) this.screens.get(name)?.querySelector<HTMLElement>("button, input, [tabindex='0']")?.focus();
  }

  /** Swipe-back for drilled-in screens (nav law): a left-edge
   *  swipe returns the way the top-area Back control does, on the
   *  web where no platform gesture covers it. The table and any
   *  open dialog are excluded — the game has its own menu, and a
   *  dialog's own dismissal wins. */
  private installSwipeBack(): void {
    this.stage.addEventListener(
      "touchstart",
      (e) => {
        const t = e.touches[0];
        if (!t) return;
        const rect = this.stage.getBoundingClientRect();
        const x = (t.clientX - rect.left) / this.scale;
        this.swipeStart = x <= 24 ? { x: t.clientX, y: t.clientY } : null;
      },
      { passive: true },
    );
    this.stage.addEventListener(
      "touchend",
      (e) => {
        const start = this.swipeStart;
        this.swipeStart = null;
        if (!start) return;
        const t = e.changedTouches[0];
        if (!t) return;
        const dx = (t.clientX - start.x) / this.scale;
        const dy = (t.clientY - start.y) / this.scale;
        if (dx > 60 && Math.abs(dy) < 40) this.swipeBack();
      },
      { passive: true },
    );
  }

  private swipeBack(): void {
    if (document.querySelector('[role="dialog"]')) return;
    switch (this.currentScreen) {
      case "rules":
      case "about":
      case "privacy":
      case "language":
        this.showScreen(this.lastRoot);
        break;
      case "results":
        this.showScreen("home");
        break;
      case "variant-table":
        this.showScreen("home");
        break;
      case "variant-learn":
        this.showScreen(this.variantReturnReview ? "review" : "learn");
        break;
      case "american-card":
      case "american-lesson":
        this.showScreen("learn");
        break;
      case "tables":
        this.showScreen(this.lastRoot);
        break;
      case "details":
        this.showScreen("games");
        break;
      case "review":
        this.showScreen("details");
        break;
      case "practice":
        this.showScreen("learn");
        break;
      default:
        break;
    }
  }

  private applyTheme(): void {
    // Dark theme only (Michael, 2026-11-16).
    document.documentElement.dataset["theme"] = "dark";
    document.documentElement.classList.toggle("large", this.settings.largeTiles);
    document.documentElement.classList.toggle("reduced-motion", this.settings.motion === "reduced");
  }

  // -- Play tab --------------------------------------------------------------

  /**
   * The Play tab (app shell renderings 01/02, approved 2026-11-16):
   * the wordmark standing alone (the companion tagline line is
   * retired) over the fan of the section-4 hand, the motif row in
   * the fresh state or the Continue card when a game is in progress,
   * the length seg, the guided row, one-tap Play, the record strip
   * when the account has stats, the one-time import offer, and the
   * tile-back wall over the reserved AdSense slot. Sign-in lives on
   * the More tab; the old hub's identity chip, Last game / Learn
   * progress cards, secondary row, and quiet row are retired (their
   * content lives on the Games and Learn tabs now).
   */
  private renderPlay(): void {
    const el = this.screens.get("home")!;
    // The first-visit language sheet lives on the home screen
    // (frame 03): renderPlay rebuilds the screen, so preserve the
    // sheet across the rebuild instead of dropping it without a
    // choice. Focus inside the sheet is restored to its dismiss
    // control afterwards.
    const sheetOpen = this.firstVisitSheet;
    const focusWasInSheet = sheetOpen?.sheet.contains(document.activeElement) ?? false;
    el.innerHTML = "";
    // Glow centre per state (design rules section 1).
    el.style.setProperty("--glow-y", this.user ? "22%" : "27%");
    const saved = loadGame();
    const body = h("div", { class: "playbody" });
    el.append(body);

    body.append(h("div", { class: "spacer" }));
    body.append(h("div", { class: "wordmark" }, tx("ui.app.open-mahjong", "OPEN MAHJONG")));
    body.append(this.fanEl());

    const summary = saved ? this.savedGameSummary(saved) : null;
    if (summary) body.append(this.continueCardEl(summary));
    else body.append(this.motifRowEl());

    const releases = VARIANT_RELEASES.filter(v => v.released);
    if (releases.length) {
      // Variant picker: a .seg control, not a select (approved rendering
      // play-picker-v1 option B, Michael 2026-11-17; design rules
      // section 6). Content-sized segments at 12px so the four shipped
      // names fit four-across; radio-group semantics with roving
      // tabindex and arrow-key movement, matching the old select's
      // behaviour exactly (set variantChoice, re-render).
      const wrap = h("div", { class: "play-variant-label" }, tx("ui.app.variant", "Variant"));
      const picker = h("div", { class: "seg play-variant-seg", role: "radiogroup", "aria-label": tx("ui.app.play-variant", "Play variant") });
      const choices: [VariantId | "riichi", string][] = [
        ["riichi", tx("ui.app.riichi", "Riichi")],
        ...releases.map(v => [v.id, releaseName(v)] as [VariantId | "riichi", string]),
      ];
      const choose = (id: VariantId | "riichi") => {
        if (this.variantChoice === id) return;
        this.variantChoice = id;
        this.renderPlay();
      };
      choices.forEach(([id, name], i) => {
        const selected = this.variantChoice === id;
        const b = h("button", {
          type: "button",
          class: selected ? "on" : "",
          role: "radio",
          "aria-checked": String(selected),
          tabindex: selected ? "0" : "-1",
        }, name);
        b.addEventListener("click", () => choose(id));
        b.addEventListener("keydown", (ev) => {
          let next: number | null = null;
          if (ev.key === "ArrowRight" || ev.key === "ArrowDown") next = (i + 1) % choices.length;
          else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") next = (i + choices.length - 1) % choices.length;
          else if (ev.key === tx("ui.app.home", "Home")) next = 0;
          else if (ev.key === "End") next = choices.length - 1;
          if (next === null || next === i) return;
          ev.preventDefault();
          choose(choices[next]![0]);
          // renderPlay rebuilt the seg; move focus to the new selection.
          el.querySelectorAll<HTMLButtonElement>(".play-variant-seg button")[next]?.focus();
        });
        picker.append(b);
      });
      wrap.append(picker);
      body.append(wrap);
    }
    const seg = h("div", { class: "seg" });
    const mkSeg = (label: string, len: GameLength) => {
      const b = h("button", { class: this.settings.lastLength === len ? "on" : "" }, label);
      b.addEventListener("click", () => {
        this.settings = { ...this.settings, lastLength: len };
        this.persistSettings();
        this.renderPlay();
      });
      return b;
    };
    if (this.variantChoice === "riichi") seg.append(mkSeg(tx("ui.app.east-only", "East only"), "east"), mkSeg(tx("ui.app.east-south", "East + South"), "south"));
    else for (const [length,label] of [["east",tx("ui.app.east", "East")],["south",tx("ui.app.east-south", "East + South")],["full",tx("ui.app.four-rounds", "Four rounds")]] as const) {
      const b=h("button",{class:this.variantLength===length?"on":""},label);
      b.addEventListener("click",()=>{this.variantLength=length;this.renderPlay();});seg.append(b);
    }
    body.append(seg);

    body.append(this.guidedRowEl());

    const play = h("button", { class: "pillbtn primary play" }, tx("ui.app.play", "Play"));
    play.addEventListener("click", () => {
      this.sound.unlock();
      if (this.variantChoice === "riichi") this.startGame(this.settings.lastLength);
      else this.startVariantGame(this.variantChoice);
    });
    body.append(play);
    const tableTools = h("button", { class:"pillbtn table-tools-entry" }, tx("ui.app.in-person-calculator-and-scorekeeper", "In-person calculator and scorekeeper"));
    tableTools.addEventListener("click", () => { this.tableSessionId = undefined; this.showScreen("tables"); });
    body.append(tableTools);

    if (this.user && this.statsSums && this.variantChoice === "riichi") {
      const strip = formatRecordStrip(this.statsSums);
      const part = (label: string, value: string): HTMLElement => {
        const s = h("span", {}, tx("ui.app.v-0", `${label}`, label) + " ");
        s.append(h("b", {}, value));
        return s;
      };
      const rs = h("div", { class: "recstrip" });
      rs.append(
        part(tx("ui.app.games", "Games"), String(strip.games)),
        h("span", { class: "sep" }, "·"),
        part(tx("ui.app.won", "Won"), String(strip.wins)),
        h("span", { class: "sep" }, "·"),
        part(tx("ui.app.avg-place", "Avg place"), strip.avgPlace),
      );
      body.append(rs);
    }

    if (this.importOfferCount > 0) {
      const box = h("div", { class: "importbox" });
      box.append(
        h("div", { class: "txt" }, tx("ui.app.import-0-games-from-this-device", `Import ${this.importOfferCount} games from this device`, this.importOfferCount)),
      );
      const rowEl = h("div", { class: "row" });
      const imp = h("button", { class: "pillbtn primary" }, tx("ui.app.import", "Import"));
      imp.addEventListener("click", () => void this.doImport());
      const dis = h("button", { class: "pillbtn ghost" }, tx("ui.app.language.sheet.dismiss", "Dismiss"));
      dis.addEventListener("click", () => {
        markImportHandled();
        this.importOfferCount = 0;
        this.renderPlay();
      });
      rowEl.append(imp, dis);
      box.append(rowEl);
      body.append(box);
    }

    body.append(h("div", { class: "spacer" }));
    body.append(this.wallEl());
    // AdSense banner (adsense-slot-v1): last element of the Play
    // flow. adSlotEl returns null while ADSENSE_CONFIG is empty, so
    // the shipped tab is unchanged until both ids are configured.
    const adSlot = adSlotEl();
    if (adSlot) body.append(adSlot);
    if (sheetOpen) {
      el.append(sheetOpen.scrim, sheetOpen.sheet);
      if (focusWasInSheet) sheetOpen.sheet.querySelector<HTMLElement>(".i18n-x")?.focus();
    }
  }

  /** The Play fan (rendering 01): the section-4 hand fanned over its
   *  ground shadow, display only. Geometry is the approved mock's:
   *  23px steps with 6px group gaps, arc translate/rotate pairs. */
  private fanEl(): HTMLElement {
    const wrap = h("div", { class: "fanwrap", "aria-hidden": "true" });
    const lefts = [17, 40, 63, 92, 115, 138, 167, 190, 213, 242, 265, 294, 317, 340];
    const arcs: [number, number][] = [
      [0, -8], [-2.3, -6.77], [-4.2, -5.54], [-5.7, -4.31], [-6.8, -3.08],
      [-7.6, -1.85], [-8, -0.62], [-8, 0.62], [-7.6, 1.85], [-6.8, 3.08],
      [-5.7, 4.31], [-4.2, 5.54], [-2.3, 6.77], [0, 8],
    ];
    const tiles = this.variantChoice === "riichi" ? HOME_STRIP_GROUPS.flat().map(tileById) : variantHomeHand(this.variantChoice);
    tiles.forEach((tile, i) => {
      const extended = tiles.length > 14;
      const [ty, rot] = extended ? [-8 * Math.sin(Math.PI * i / (tiles.length - 1)), -8 + 16 * i / (tiles.length - 1)] : arcs[i]!;
      const left = extended ? 17 + 323 * i / (tiles.length - 1) : lefts[i];
      const t = h("span", {
        class: "tile t-fan",
        style: `left:${left}px;top:18px;z-index:${i + 1};transform:translateY(${ty}px) rotate(${rot}deg)`,
      });
      t.innerHTML = `<svg viewBox="0 0 40 56"><use href="#${tileSymbol(tile)}"/></svg>`;
      t.append(h("i", { class: "edge" }));
      wrap.append(t);
    });
    return wrap;
  }

  /** The fresh-state motif row (rendering 01): the dora indicator
   *  beside the tile it indicates, and the four seat winds. */
  private motifRowEl(): HTMLElement {
    const row = h("div", { class: "motifrow", "aria-hidden": "true" });
    const left = h("div", { class: "motif" });
    left.append(h("span", { class: "cap" }, this.variantChoice === "riichi" ? tx("ui.app.dora", "Dora") : tx("ui.app.flowers", "Flowers")));
    const dora = h("span", { class: "tile t-dora" });
    dora.innerHTML = `<svg viewBox="0 0 40 56"><use href="#${this.variantChoice === "riichi" ? tileSymbol(tileById(49)) : "t-f0"}"/></svg>`;
    left.append(dora);
    const right = h("div", { class: "motif" });
    const winds = h("span", { class: "winds" });
    for (const id of [109, 113, 117, 121]) {
      const w = h("span", { class: "tile t-meld" });
      w.innerHTML = `<svg viewBox="0 0 40 56"><use href="#${tileSymbol(tileById(id))}"/></svg>`;
      winds.append(w);
    }
    right.append(winds, h("span", { class: "cap" }, tx("ui.app.winds", "Winds")));
    row.append(left, right);
    return row;
  }

  /** The tile-back wall at the Play tab's foot (rendering 01). QC
   *  note N3: row 2 drops one back so its brick offset never pushes
   *  a tile past the stage edge. */
  private wallEl(): HTMLElement {
    const wall = h("div", { class: "wall", "aria-hidden": "true" });
    const mkRow = (count: number, cls: string) => {
      const row = h("div", { class: `wrow ${cls}` });
      for (let i = 0; i < count; i++) {
        const t = h("span", { class: "tile" });
        t.innerHTML = `<svg viewBox="0 0 40 56"><use href="#t-back"/></svg>`;
        row.append(t);
      }
      return row;
    };
    wall.append(mkRow(16, "r1"), mkRow(15, "r2"));
    return wall;
  }

  /** Guided mode row (renderings 01/03): the pre-game on/off choice
   *  for CPU games — the same single setting as on the More tab and
   *  in the in-game menu. */
  private guidedRowEl(): HTMLElement {
    const grow = h("div", { class: "growrow" });
    const glab = h("div", {});
    glab.append(
      h("div", { class: "lab" }, tx("ui.app.guided-mode", "Guided mode")),
      h("div", { class: "note" }, tx("ui.app.hints-and-explanations-during-cpu-games", "Hints and explanations during CPU games.")),
    );
    const gsw = h("label", { class: "switch" });
    const ginput = h("input", { type: "checkbox", "aria-label": tx("ui.app.guided-mode", "Guided mode") });
    ginput.checked = this.settings.guided;
    ginput.addEventListener("change", () => {
      this.settings = { ...this.settings, guided: ginput.checked };
      this.persistSettings();
    });
    gsw.append(ginput, h("span", { class: "tr" }));
    grow.append(glab, gsw);
    return grow;
  }

  /** Restore the saved game and read its live state off the folded
   *  model. A finished or unreadable save yields null — the card
   *  and the row only ever describe a game actually in progress. */
  private savedGameSummary(saved: SavedGame): SavedSummary | null {
    try {
      const runner = saved.v === 3 ? VariantRunner.restore(saved) : GameRunner.restore(saved, new AiDriver());
      if (runner.result) return null;
      const model = foldEvents(runner.events, runner.humanSeat, runner.chiHints);
      const human = model.players[runner.humanSeat]!;
      const release = saved.v === 3 ? VARIANT_RELEASES.find(v => v.id === saved.variant) : undefined;
      const ranked = [...model.players].sort(
        (a, b) => b.score - a.score || a.seatWind - b.seatWind,
      );
      const byWind = [...model.players].sort((a, b) => a.seatWind - b.seatWind);
      return {
        round: tx("ui.app.v-0-1-3", `${WIND_NAMES[model.roundWind]} ${model.kyoku}`, WIND_NAMES[model.roundWind], model.kyoku),
        lengthLabel: tx("ui.app.v-0-1", `${saved.v === 3 ? (release?.name ?? saved.variant) + " · " : ""}${saved.length === "full" ? "Four rounds" : saved.length === "south" ? "East + South" : tx("ui.app.east-only", "East only")}`, saved.v === 3 ? (release ? releaseName(release) : saved.variant) + " · " : "", saved.length === "full" ? "Four rounds" : saved.length === "south" ? "East + South" : tx("ui.app.east-only", "East only")),
        standing: `You are ${placementLabel(ranked.indexOf(human) + 1)}`,
        humanScore: human.score,
        scores: byWind.map((p) => ({
          name: p === human ? tx("ui.app.you-3", "You") : WIND_NAMES[p.seatWind]!,
          score: p.score,
        })),
      };
    } catch {
      return null;
    }
  }

  /** The Continue card (rendering 02): the production infocard
   *  grammar carrying the saved game's live state, gold Continue. */
  private continueCardEl(summary: SavedSummary): HTMLElement {
    const card = h("button", { class: "infocard contcard", "aria-label": tx("ui.app.resume-game", "Resume game") });
    const top = h("span", { class: "ic-top" });
    top.append(
      h("span", { class: "ic-label" }, tx("ui.app.game-in-progress", "Game in progress")),
      h("span", { class: "ic-date" }, summary.lengthLabel),
    );
    card.append(
      top,
      h("span", { class: "ic-result" }, tx("ui.app.v-0-1-2", `${summary.round} · ${summary.standing}`, summary.round, summary.standing)),
    );
    const scores = h("span", { class: "ic-scores" });
    for (const s of summary.scores) {
      const span = h("span", {}, tx("ui.app.v-0", `${s.name}`, s.name) + " ");
      span.append(h("b", {}, fmt(s.score)));
      scores.append(span);
    }
    card.append(scores);
    const foot = h("span", { class: "ic-foot" });
    foot.append(h("span", { class: "ic-cta" }, tx("ui.app.continue", "Continue ›")));
    card.append(foot);
    card.addEventListener("click", () => {
      this.sound.unlock();
      this.resumeGame();
    });
    return card;
  }

  /** The Games tab's in-progress row (rendering 07's inset
   *  treatment): state-green dot, IN PROGRESS pill, live state,
   *  Resume action. Tapping it resumes — never a review. */
  private inProgressRowEl(summary: SavedSummary): HTMLElement {
    const row = h("button", { class: "iprow", "aria-label": tx("ui.app.resume-game", "Resume game") });
    const main = h("span", { class: "ipmain" });
    main.append(
      h("span", { class: "l1" }, tx("ui.app.v-0-1-2", `${summary.round} · ${summary.lengthLabel}`, summary.round, summary.lengthLabel)),
      h("span", { class: "l2" }, tx("ui.app.v-0-1-points", `${summary.standing} · ${fmt(summary.humanScore)} points`, summary.standing, fmt(summary.humanScore))),
    );
    const right = h("span", { class: "ipright" });
    const pill = h("span", { class: "ippill" });
    pill.append(h("span", { class: "ipdot" }), document.createTextNode(tx("ui.app.in-progress", "IN PROGRESS")));
    const resume = h("span", { class: "resume" }, tx("ui.app.resume", "Resume"));
    resume.insertAdjacentHTML(
      "beforeend",
      `<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>`,
    );
    right.append(pill, resume);
    row.append(main, right);
    row.addEventListener("click", () => {
      this.sound.unlock();
      this.resumeGame();
    });
    return row;
  }

  private avatarEl(user: ApiUser, lg = false): HTMLElement {
    const a = h("span", { class: lg ? "avatar lg" : "avatar" });
    if (user.avatarUrl) {
      a.append(h("img", { src: user.avatarUrl, alt: "" }));
    } else {
      a.append(document.createTextNode((user.name.trim()[0] ?? "?").toUpperCase()));
    }
    return a;
  }

  // -- account (slice 2) -----------------------------------------------------

  private async bootAuth(): Promise<void> {
    const me = await initAuth();
    if (!me.user) return; // signed out or API down: guest landing stands
    this.user = me.user;
    try {
      if (sessionStorage.getItem(SIGN_IN_PENDING_KEY)) {
        sessionStorage.removeItem(SIGN_IN_PENDING_KEY);
        trackSignInCompleted();
      }
    } catch {
      // Storage unavailable: nothing to count.
    }
    this.csrfToken = me.csrfToken;
    this.accountLoaded = false;
    const accountId = me.user.id ?? null;
    if (this.learningAccountId !== accountId) {
      this.learningAccountId = accountId;
      this.tutorial = mergeProgress(loadTutorialProgress(), parseProgress(this.readLearningCache(TUTORIAL_SETTINGS_KEY)));
      this.practice = mergePracticeProgress(loadPracticeProgress(), parsePracticeProgress(this.readLearningCache(PRACTICE_STORAGE_KEY)));
      this.reviewCollection = mergeReviewCollections(loadReviewCollection(), parseReviewCollection(this.readLearningCache(REVIEW_COLLECTION_KEY)));
      this.variantProgress = mergeVariantProgress(this.variantProgress, parseVariantProgress(this.readLearningCache(VARIANT_LEARNING_KEY)));
    }
    // Settings sync (brief A4): on sign-in the server's saved settings
    // win over this device's — one account, one set of preferences.
    // After this first sync, every local change is pushed back up
    // (persistSettings), so the two never silently diverge again.
    const [serverSettings, stats, games] = await Promise.all([
      fetchServerSettings(),
      fetchStats(),
      fetchGames(),
    ]);
    if (serverSettings) {
      this.settings = mergeServerSettings(this.settings, serverSettings);
      saveSettings(this.settings);
      this.sound.enabled = this.settings.sound;
      this.applyTheme();
      // Tutorial progress syncs the same way, under its namespaced
      // key in the settings blob: union of this device and the
      // account, pushed back so both stores agree.
      const serverProgress = parseProgress(
        (serverSettings as Record<string, unknown>)[TUTORIAL_SETTINGS_KEY],
      );
      const merged = mergeProgress(this.tutorial, serverProgress);
      this.tutorial = merged;
      this.saveLearningCache(TUTORIAL_SETTINGS_KEY, merged);
      this.practice = mergePracticeProgress(this.practice, parsePracticeProgress((serverSettings as Record<string, unknown>)[PRACTICE_STORAGE_KEY]));
      this.saveLearningCache(PRACTICE_STORAGE_KEY, this.practice);
      this.reviewCollection = mergeReviewCollections(this.reviewCollection, parseReviewCollection((serverSettings as Record<string, unknown>)[REVIEW_COLLECTION_KEY]));
      this.saveLearningCache(REVIEW_COLLECTION_KEY, this.reviewCollection);
      this.variantProgress = mergeVariantProgress(this.variantProgress, parseVariantProgress((serverSettings as Record<string,unknown>)[VARIANT_LEARNING_KEY]));
      this.saveLearningCache(VARIANT_LEARNING_KEY, this.variantProgress);
      this.accountLoaded = true;
      this.queueAccountSettings();
    }
    // Resume carry-over (ruling, 2026-11-16): reconcile the local
    // in-progress game with the account copy before Home renders —
    // the newer of the two is what Resume will offer.
    await this.resumeSync.reconcile();
    this.statsSums = stats;
    this.serverGameCount = games ? games.length : null;
    this.serverGames = games;
    this.refreshImportOffer();
    this.renderPlay();
    if (this.currentScreen === "games") void this.renderGames();
    if (this.currentScreen === "more") this.renderMore();
    if (this.currentScreen === "learn") this.renderLearn();
  }

  /** Save settings locally; when signed in, also sync them (brief A4).
   *  The synced blob carries the tutorial progress under its
   *  namespaced key, so a settings save never wipes it server-side. */
  private persistSettings(): void {
    saveSettings(this.settings);
    this.applyTheme();
    this.queueAccountSettings();
  }

  /** Save tutorial progress locally and (when signed in) in the
   *  account settings blob. */
  private persistTutorial(): void {
    this.saveLearningCache(TUTORIAL_SETTINGS_KEY, this.tutorial);
    this.queueAccountSettings();
  }

  private learningCacheKey(key: string): string {
    if (this.learningAccountId) return `${key}.account.${encodeURIComponent(this.learningAccountId)}`;
    // Older APIs did not return an account ID. Keep their private
    // in-memory session separate until the new backend is available.
    return this.user ? `${key}.account.pending.${this.pendingAccountSession}` : key;
  }

  private readLearningCache(key: string): unknown {
    try { const raw = localStorage.getItem(this.learningCacheKey(key)); return raw && raw.length <= 2 * 1024 * 1024 ? JSON.parse(raw) : null; }
    catch { return null; }
  }

  private saveLearningCache(key: string, value: unknown): void {
    if (this.user && !this.learningAccountId) return;
    if (!this.learningAccountId) {
      if (key === TUTORIAL_SETTINGS_KEY) saveTutorialProgress(value as TutorialProgress);
      else if (key === PRACTICE_STORAGE_KEY) savePracticeProgress(value as PracticeProgress);
      else if (key === REVIEW_COLLECTION_KEY) saveReviewCollection(value as typeof this.reviewCollection);
      else if (key === VARIANT_LEARNING_KEY) { try { localStorage.setItem(key,JSON.stringify(value)); } catch { /* Keep progress in memory. */ } }
      return;
    }
    try { localStorage.setItem(this.learningCacheKey(key), JSON.stringify(value)); } catch { /* Keep in memory. */ }
  }

  /** Serialize this client's writes; keep local evidence on failure and
   * merge cloud evidence on the next boot/online event before retrying. */
  private queueAccountSettings(): void {
    this.accountSyncWanted = true;
    if (this.accountSyncRunning || !this.user || !this.accountLoaded) return;
    this.accountSyncRunning = true;
    void (async () => {
      try {
        while (this.accountSyncWanted && this.user && this.accountLoaded) {
          this.accountSyncWanted = false;
          const saved = { ...this.settings, [TUTORIAL_SETTINGS_KEY]: this.tutorial,
            [PRACTICE_STORAGE_KEY]: this.practice, [REVIEW_COLLECTION_KEY]: this.reviewCollection, [VARIANT_LEARNING_KEY]: this.variantProgress };
          if (!(await putSettings(saved, this.csrfToken))) { this.accountSyncWanted = true; break; }
        }
      } finally { this.accountSyncRunning = false; }
    })();
  }

  /**
   * Every finished game this device knows about, oldest first: full
   * local records, plus legacy slice-1 history lines converted with
   * zeroed hand stats and no log (they predate both).
   */
  private localGameRecords(): GameRecord[] {
    return mergeLocalGameRecords(loadRecords(), loadHistory());
  }

  private refreshImportOffer(): void {
    const local = this.localGameRecords();
    this.importOfferCount = shouldOfferImport({
      signedIn: !!this.user,
      localCount: local.length,
      serverGames: this.serverGameCount,
      handled: importHandled(),
    })
      ? local.length
      : 0;
  }

  private async doImport(): Promise<void> {
    const records = this.localGameRecords();
    // Hide while in flight; mark only after success so an offline
    // attempt can be retried when the account service returns.
    this.importOfferCount = 0;
    this.renderPlay();
    if (await postImport(records, this.csrfToken)) {
      markImportHandled();
      this.serverGameCount = records.length;
      this.serverGames = records;
      const stats = await fetchStats();
      if (stats) this.statsSums = stats;
      this.renderPlay();
    } else {
      this.refreshImportOffer();
      this.renderPlay();
    }
  }

  /** POST a finished game; one retry, then give up silently — the
   *  results screen and the local record never depend on it. */
  private async postRecord(record: GameRecord): Promise<void> {
    if (await postGame(record, this.csrfToken)) {
      if (this.serverGameCount !== null) this.serverGameCount++;
      this.serverGames = [
        record,
        ...(this.serverGames ?? []).filter((g) => g.id !== record.id),
      ];
      const stats = await fetchStats();
      if (stats) this.statsSums = stats;
      return;
    }
    await sleep(1500);
    await postGame(record, this.csrfToken);
  }

  private clearAccountState(): void {
    if (this.user?.id) deleteTableAccountCache(this.user.id);
    this.tableUI?.destroy(); this.tableUI = null;
    this.screens.get("tables")?.replaceChildren();
    this.screens.get("details")?.replaceChildren();
    this.accountLoaded = false;
    this.learningAccountId = null;
    this.tutorial = loadTutorialProgress();
    this.practice = loadPracticeProgress();
    this.variantProgress = parseVariantProgress(this.readLearningCache(VARIANT_LEARNING_KEY));
    this.reviewCollection = loadReviewCollection();
    this.reviewData = null;
    this.reviewTimeline = null;
    this.reviewRecordId = null;
    this.reviewUI?.destroy();
    this.reviewUI = null;
    this.screens.get("review")?.replaceChildren();
    this.screens.get("practice")?.replaceChildren();
    this.user = null;
    this.csrfToken = null;
    this.statsSums = null;
    this.serverGameCount = null;
    this.serverGames = null;
    this.importOfferCount = 0;
  }

  private async signOutFlow(): Promise<void> {
    if (!(await signOut(this.csrfToken))) return;
    this.clearAccountState();
    this.renderPlay();
    if (this.screens.get("more")!.classList.contains("active")) this.renderMore();
  }

  private async deleteAccountFlow(): Promise<void> {
    if (!(await deleteAccount(this.csrfToken))) return;
    if (this.learningAccountId) {
      for (const key of [TUTORIAL_SETTINGS_KEY, PRACTICE_STORAGE_KEY, REVIEW_COLLECTION_KEY, VARIANT_LEARNING_KEY, "openmahjong.practice-session.v1"]) {
        try { localStorage.removeItem(this.learningCacheKey(key)); } catch { /* Storage can be blocked. */ }
      }
    }
    this.clearAccountState();
    this.renderPlay();
    if (this.screens.get("more")!.classList.contains("active")) this.renderMore();
  }

  // -- text screens ----------------------------------------------------------

  private buildPage(title: string): HTMLElement {
    const page = h("div", { class: "page", tabindex: "0", role: "region", "aria-label": title });
    page.append(h("h2", {}, title));
    return page;
  }

  private textScreen(name: ScreenName, title: string, fill: (page: HTMLElement) => void): void {
    const screen = this.screens.get(name)!;
    screen.innerHTML = "";
    const bar = h("header", { class: "bar" });
    const back = h("button", { class: "iconbtn", "aria-label": tx("ui.app.back", "Back") });
    back.innerHTML = `<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>`;
    back.addEventListener("click", () => this.showScreen(this.runner && !this.runner.result ? "table" : this.lastRoot));
    bar.append(back, h("span", { class: "word" }, tx("ui.app.open-mahjong", "OPEN MAHJONG")), h("span", { class: "iconbtn" }));
    screen.append(bar);
    const page = this.buildPage(title);
    fill(page);
    screen.append(page);
  }

  private buildTextScreens(): void {
    this.textScreen("rules", "Rules", (page) => {
      const p = (text: string) => h("p", {}, text);
      const li = (text: string) => h("li", {}, text);
      page.append(
        p("Open Mahjong plays modern online-standard riichi mahjong. Every rules choice the engine makes is listed here."),
        h("h3", {}, tx("ui.app.stakes-and-settlement", "Stakes and settlement")),
        h("ul", {},
          li("Start 25,000 points; return 30,000. Uma +15 / +5 / −5 / −15, oka 20 to first place. Tied seats split the uma (and oka) of the ranks they occupy."),
          li("A game ends early (tobi) as soon as any player is below zero at the end of a hand."),
          li("Riichi sticks left on the table when the game ends go to the first-place player."),
          li("If the dealer repeats on the final hand, the game extends until a hand ends without a dealer repeat (no agari-yame)."),
        ),
        h("h3", {}, tx("ui.app.hands-and-calls", "Hands and calls")),
        h("ul", {},
          li("Red fives (aka dora) are in: one each of 5m, 5p, 5s. Open tanyao is allowed."),
          li("Chi may only be called from the player on your left. Pon and kan from anyone."),
          li("Double ron does not pay twice: atama-hane (head bump) — the winner nearest the discarder in turn order takes all."),
          li("Chankan (robbing a kan) applies to shouminkan; against an ankan only kokushi may rob."),
        ),
        h("h3", {}, tx("ui.app.riichi", "Riichi")),
        h("ul", {},
          li("Riichi costs 1,000 points, needs a closed tenpai hand, at least 1,000 points, and at least 4 tiles left in the wall."),
          li("Ippatsu and double riichi count. After riichi you discard what you draw; an ankan is allowed only if it leaves your waits unchanged."),
          li("Furiten applies in all three forms: discard furiten, temporary furiten (passing a winning tile blocks ron until your next draw), and riichi furiten (permanent after passing in riichi)."),
        ),
        h("h3", {}, tx("ui.app.dora", "Dora")),
        h("ul", {},
          li("One indicator at the start; each kan flips one more (ankan flips before the rinshan draw; open kans flip after it). Uradora are revealed under the indicators when a riichi hand wins."),
          li("Kiriage mangan is OFF: 4 han 30 fu is 7,700 (dealer 11,600), 3 han 60 fu is 7,700 — no rounding up to mangan."),
        ),
        h("h3", {}, tx("ui.app.draws", "Draws")),
        h("ul", {},
          li("Exhaustive draw: tenpai players split 3,000 from noten players. Nagashi mangan pays as a mangan tsumo instead, when a player's discards are all terminals/honors and none were called."),
          li("Abortive draws are on: kyuushu kyuuhai (nine different terminals/honors on your first draw), suufon renda (all four first discards the same wind), suucha riichi (four riichi), and suukaikan (four kan by two or more players). The hand restarts with one more honba; the dealer repeats."),
        ),
      );
    });

    this.textScreen("about", "About", (page) => {
      page.append(
        h("p", {}, tx("ui.app.open-mahjong-is-a-free-open-source-mahjong-platf", "Open Mahjong is a free, open-source mahjong platform. Play Riichi, Hong Kong Old Style, MCR or Taiwanese against CPU opponents, study games, and keep an in-person score ledger.")),
        h("p", {}, tx("ui.app.free-forever-as-a-guest-your-settings-and-game-h", "Free forever. As a guest, your settings and game history live only in this browser. Signed in, they are saved to your account.")),
        h("h3", {}, tx("ui.app.license", "License")),
        h("p", {}, tx("ui.app.open-mahjong-is-free-software-under-the-gnu-affe", "Open Mahjong is free software under the GNU Affero General Public License v3 (AGPLv3). The rules engine is a separate library, so anyone can build their own client on it. MCR includes the MIT-licensed mahjong-algorithm scorer by Jeff Wang (2016–2023); its readable source, full license and reproducible build ship in the repository.")),
        h("p", {}, h("a", {href:"./third-party-notices.txt",target:"_blank",rel:"noreferrer"}, tx("ui.app.third-party-notices", "Third-party notices"))),
        h("h3", {}, tx("ui.app.source", "Source")),
        (() => {
          const para = h("p", {});
          const a = h("a", { href: "https://github.com/michaelhmiv/OpenMahjong", target: "_blank", rel: "noreferrer" }, "github.com/michaelhmiv/OpenMahjong");
          para.append(a);
          return para;
        })(),
      );
    });

    this.textScreen("privacy", "Privacy", (page) => {
      page.append(
        h("p", {}, tx("ui.app.last-updated-november-17-2026", "Last updated: November 17, 2026.")),
        h("h3", {}, tx("ui.app.playing-as-a-guest", "Playing as a guest")),
        h("p", {}, tx("ui.app.games-you-play-as-a-guest-your-settings-and-your", "Games you play as a guest, your settings, and your game history are stored only in your browser on your device. They are not sent to our servers.")),
        h("h3", {}, tx("ui.app.accounts", "Accounts")),
        h("p", {}, tx("ui.app.if-you-sign-in-with-google-we-store-your-google", "If you sign in with Google, we store your Google account identifier, the display name and profile photo from your Google profile, the date you created your account, records of your finished games (date, game length, placement, score, the game's move record, and game statistics), and your settings, so they follow you between devices. We do not receive or store your email address or your Google password.")),
        h("p", {}, tx("ui.app.if-you-choose-private-sync-for-an-in-person-sess", 'If you choose private sync for an in-person session, we also store its player names, entered completed hands, scoring corrections, ledger and settlement. These sessions are separate from CPU statistics. Local-only sessions stay on your device; conflicting offline copies are preserved for your review.')),
        h("h3", {}, tx("ui.app.cookies", "Cookies")),
        h("p", {}, tx("ui.app.we-use-one-cookie-to-keep-you-signed-in-advertis", "We use one cookie to keep you signed in. Advertising cookies are described in the Advertising section below.")),
        h("h3", {}, tx("ui.app.advertising", "Advertising")),
        (() => {
          const para = h("p", {}, tx("ui.app.this-site-uses-google-adsense-to-display-ads-goo", "This site uses Google AdSense to display ads. Google and its partners use cookies to serve and measure ads. The ads shown on this site are non-personalized: they are based on the content of the page and general location, not on your visits to other sites. Google describes how it uses information from sites that use its services at") + " ");
          const partner = h("a", { href: "https://policies.google.com/technologies/partner-sites", target: "_blank", rel: "noreferrer" }, "policies.google.com/technologies/partner-sites");
          const settings = h("a", { href: "https://adssettings.google.com", target: "_blank", rel: "noreferrer" }, "adssettings.google.com");
          para.append(partner, document.createTextNode(tx("ui.app.you-can-review-and-control-ad-settings-at", ". You can review and control ad settings at") + " "), settings, document.createTextNode("."));
          return para;
        })(),
        h("h3", {}, tx("ui.app.sharing", "Sharing")),
        h("p", {}, tx("ui.app.we-do-not-sell-personal-information-your-informa", "We do not sell personal information. Your information is processed by Google (sign-in and advertising) and Railway (hosting) only to operate the service.")),
        h("h3", {}, tx("ui.app.deletion", "Deletion")),
        h("p", {}, tx("ui.app.more-then-delete-account-permanently-deletes-you", "More, then Delete account, permanently deletes your account and everything stored with it. Guest data can be removed by clearing your browser's site data.")),
        h("h3", {}, tx("ui.app.children", "Children")),
        h("p", {}, tx("ui.app.open-mahjong-is-not-directed-to-children-under-1", "Open Mahjong is not directed to children under 13.")),
        h("h3", {}, tx("ui.app.changes", "Changes")),
        h("p", {}, tx("ui.app.if-this-policy-changes-the-new-version-will-be-p", "If this policy changes, the new version will be posted on this page with an updated date.")),
        h("h3", {}, tx("ui.app.contact", "Contact")),
        h("p", {}, "sportfolioholdings@gmail.com"),
      );
    });
  }

  // -- More tab --------------------------------------------------------------

  /**
   * The More tab (renderings 05/06): the account block, every
   * existing setting as a functional row, the About section, and
   * the AGPL footer. This is the old Settings screen re-homed as a
   * tab root — its guest History/Stats rows are gone because the
   * Games tab absorbed them.
   */
  private renderMore(): void {
    const el = this.screens.get("more")!;
    el.innerHTML = "";
    const page = h("div", { class: "tabpage" });
    el.append(page);
    page.append(h("h2", {}, tx("ui.app.more", "More")));
    const row = (label: string, note: string, control: HTMLElement) => {
      const wrap = h("div", { class: "setrow" });
      const lab = h("div", {});
      lab.append(h("div", { class: "lab" }, label), h("div", { class: "note" }, note));
      wrap.append(lab, control);
      control.querySelector("input")?.setAttribute("aria-label", label);
      return wrap;
    };
    const toggle = (on: boolean, disabled: boolean, onChange: (v: boolean) => void) => {
      const sw = h("label", { class: "switch" });
      const input = h("input", { type: "checkbox" });
      input.checked = on;
      input.disabled = disabled;
      input.addEventListener("change", () => onChange(input.checked));
      sw.append(input, h("span", { class: "tr" }));
      return sw;
    };

    page.append(h("div", { class: "sec-label" }, tx("ui.app.account", "ACCOUNT")));
    if (this.user) {
      const idRow = h("div", { class: "setrow" });
      const acct = h("div", { class: "acctid" });
      acct.append(this.avatarEl(this.user, true));
      const who = h("div", {});
      who.append(
        h("div", { class: "lab" }, this.user.name),
        h("div", { class: "note" }, tx("ui.app.signed-in-with-google", "Signed in with Google")),
      );
      acct.append(who);
      const outBtn = h("button", { class: "pillbtn ghost" }, tx("ui.app.sign-out", "Sign out"));
      outBtn.addEventListener("click", () => void this.signOutFlow());
      idRow.append(acct, outBtn);
      page.append(idRow);

      const delRow = h("div", { class: "setrow" });
      const delLab = h("div", {});
      delLab.append(
        h("div", { class: "lab" }, tx("ui.app.delete-account", "Delete account")),
        h("div", { class: "note" }, tx("ui.app.removes-your-profile-game-history-and-stats-this", "Removes your profile, game history, and stats. This cannot be undone.")),
      );
      const delBtn = h("button", { class: "pillbtn ghost" }, tx("ui.app.delete", "Delete"));
      delBtn.addEventListener("click", () => {
        // Two-step confirm in place: the first tap arms the button.
        if (delBtn.dataset["confirm"] === "1") {
          void this.deleteAccountFlow();
          return;
        }
        delBtn.dataset["confirm"] = "1";
        delBtn.textContent = tx("ui.app.confirm-delete", "Confirm delete");
      });
      delRow.append(delLab, delBtn);
      page.append(delRow);
    } else {
      const signInBtn = h("button", { class: "pillbtn ghost" }, tx("ui.app.sign-in-with-google", "Sign in with Google"));
      signInBtn.addEventListener("click", () => {
        try {
          sessionStorage.setItem(SIGN_IN_PENDING_KEY, "1");
        } catch {
          // Storage unavailable: the sign-in still proceeds; the
          // completion is simply not counted.
        }
        window.location.href = GOOGLE_START_URL;
      });
      page.append(row(tx("ui.app.account-2", "Account"), tx("ui.app.not-signed-in", "Not signed in."), signInBtn));
    }

    page.append(h("div", { class: "sec-label" }, tx("ui.app.settings", "SETTINGS")));
    page.append(
      row(tx("ui.app.sound", "Sound"), tx("ui.app.quiet-tile-clicks-only-no-music-no-voices", "Quiet tile clicks only. No music, no voices."), toggle(this.settings.sound, false, (v) => {
        this.settings = { ...this.settings, sound: v };
        this.sound.enabled = v;
        this.persistSettings();
      })),
      row(tx("ui.app.reduced-motion", "Reduced motion"), tx("ui.app.collapses-animation-to-near-instant-your-operati", "Collapses animation to near-instant. Your operating system's reduced-motion setting is always respected too."), toggle(this.settings.motion === "reduced", false, (v) => {
        this.settings = { ...this.settings, motion: v ? "reduced" : "standard" };
        this.persistSettings();
      })),
      row(tx("ui.app.large-tiles", "Large tiles"), tx("ui.app.hand-tiles-step-up-to-28px-in-two-rows-of-seven", "Hand tiles step up to 28px in two rows of seven; ponds step down to 22px; the panel type grows. The approved large layout (table-large-v1)."), toggle(this.settings.largeTiles, false, (v) => {
        this.settings = { ...this.settings, largeTiles: v };
        this.persistSettings();
        this.applyTheme();
        if (this.runner) this.renderTable();
      })),
      row(tx("ui.app.guided-mode", "Guided mode"), tx("ui.app.hints-and-explanations-on-the-table-during-cpu-g", "Hints and explanations on the table during CPU games. The same switch is on the Play tab and in the in-game menu."), toggle(this.settings.guided, false, (v) => {
        this.settings = { ...this.settings, guided: v };
        this.persistSettings();
        if (this.runner) this.renderTable();
      })),
    );

    // LANGUAGE (i18n switcher v1, frames 01/02): the section sits
    // between SETTINGS and ABOUT — language is a preference, not an
    // account fact, and it is used far more often than the document
    // links. The row is the shipped .hrow grammar with the current
    // locale's own name as the dim value; it opens the drilled-in
    // Language screen.
    page.append(h("div", { class: "sec-label" }, tx("ui.app.language.section", "LANGUAGE")));
    const langRow = h("button", { class: "hrow" });
    langRow.append(
      h("span", { class: "ttl2" }, tx("ui.app.language", "Language")),
      h("span", { class: "i18n-val" }, localeMeta(getCurrentLocale())?.native ?? getCurrentLocale()),
    );
    langRow.insertAdjacentHTML(
      "beforeend",
      `<svg class="chev" style="margin-left:auto" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>`,
    );
    langRow.addEventListener("click", () => this.showScreen("language"));
    page.append(langRow);

    page.append(h("div", { class: "sec-label" }, tx("ui.app.about", "ABOUT")));
    for (const [label, screen] of [["Rules", "rules"], ["About", "about"], ["Privacy", "privacy"]] as [string, ScreenName][]) {
      const b = h("button", { class: "hrow" });
      b.append(h("span", { class: "ttl2" }, label));
      b.insertAdjacentHTML(
        "beforeend",
        `<svg class="chev" style="margin-left:auto" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>`,
      );
      b.addEventListener("click", () => this.showScreen(screen));
      page.append(b);
    }
    page.append(
      h("div", { class: "footer" }, tx("ui.app.open-source-under-agplv3-github-com-michaelhmiv", "Open source under AGPLv3 · github.com/michaelhmiv/OpenMahjong")),
    );
    const improveLink = buildImproveTranslationLink();
    if (improveLink) {
      const improveFooter = h("div", { class: "footer" });
      improveFooter.append(improveLink);
      page.append(improveFooter);
    }
  }

  /**
   * The Language screen (i18n switcher v1, frame 05): a drilled-in
   * screen with the medium header grammar (bare back glyph, Fraunces
   * title) and the §15 de-boxed list — one container, hairline
   * dividers, no boxes. Each row shows the language's own name over
   * its English name; the current locale is marked twice (bold name
   * + state-green check), never by colour alone. Only shipped
   * locales are listed; unshipped locales stay hidden. Shipped
   * locales that are machine translations (owner ruling Nov 19,
   * 2026) carry " · Machine translated" on the English-name line
   * plus a footnote stating the status. No tab bar, per the nav
   * law — this is a drilled-in screen, not a tab root.
   */
  private renderLanguage(): void {
    const el = this.screens.get("language")!;
    el.innerHTML = "";
    const current = getCurrentLocale();
    const head = h("header", { class: "i18n-head" });
    const back = h("button", { class: "i18n-back", "aria-label": t("ui.app.back") }, "‹");
    back.addEventListener("click", () => this.showScreen("more"));
    head.append(back, h("h1", {}, tx("ui.app.language", "Language")));
    el.append(head);
    const page = h("div", { class: "i18n-page" });
    const list = h("div", { class: "i18n-list", role: "listbox", "aria-label": tx("ui.app.language", "Language") });
    for (const meta of shippedLocaleMeta()) {
      const isCurrent = meta.id === current;
      const row = h("button", {
        class: `i18n-row${isCurrent ? " cur" : ""}`,
        role: "option",
        ...(isCurrent ? { "aria-current": "true" } : {}),
      });
      const names = h("div", {});
      names.append(h("div", { class: "nm" }, meta.native));
      if (meta.id !== "en") {
        // Machine-translation marking (owner ruling Nov 19, 2026):
        // the English-name line carries " · Machine translated" on
        // every shipped locale that is a machine translation. Same
        // two-line row, same 13px dim line — no layout change.
        const enLine = isMachineTranslated(meta.id)
          ? tx("ui.app.v-0-1-2", `${meta.english} · ${tx("ui.app.language.machine-translated", "Machine translated")}`, meta.english, tx("ui.app.language.machine-translated", "Machine translated"))
          : meta.english;
        names.append(h("div", { class: "en" }, enLine));
      }
      row.append(names);
      if (isCurrent) {
        const check = h("span", { class: "i18n-check", "aria-hidden": "true" });
        check.innerHTML = `<svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5"/></svg>`;
        row.append(check);
      }
      row.addEventListener("click", () => this.chooseLocale(meta.id));
      list.append(row);
    }
    page.append(list);
    // Machine-translation footnote, shown only while a shipped
    // locale is machine translated (dormant in the English-only
    // state). It states the status plainly; the rows mark which
    // locales it covers.
    const anyMachineTranslated = shippedLocaleMeta().some((m) => isMachineTranslated(m.id));
    page.append(
      h("p", { class: "i18n-note" }, tx("ui.app.language.url-note", "Switching languages opens the matching page address — for example, /ja/ for Japanese. Your choice is remembered; the browser language is only used on your first visit.")),
      ...(anyMachineTranslated
        ? [h("p", { class: "i18n-note" }, tx("ui.app.language.machine-note", "Non-English languages are machine translated and awaiting community review."))]
        : []),
      h("p", { class: "i18n-note" }, tx("ui.app.language.wave2-note", "More languages are coming: Vietnamese, Thai, Indonesian, French, German, and Spanish.")),
    );
    el.append(page);
  }

  /** A switcher pick: remember it, then navigate to that locale's
   *  URL (brief: one URL per language; English lives at the root),
   *  preserving the rest of the path plus query and hash. The
   *  navigation reloads the app in the new locale. Tapping the
   *  current locale navigates nowhere and just returns to More. */
  private chooseLocale(locale: string): void {
    setRememberedLocale(locale);
    const target = pathForLocale(locale, location.pathname) + location.search + location.hash;
    const current = location.pathname + location.search + location.hash;
    if (target !== current) {
      location.assign(target);
      return;
    }
    this.showScreen("more");
  }

  /** First-visit language sheet (i18n switcher v1, frame 03). Shown
   *  once, on Play, when the browser language matches a shipped
   *  locale the user has not chosen yet. Either direction remembers
   *  the choice, so the sheet never re-asks; declining (including
   *  the × and Escape) remembers English. */
  private maybeShowFirstVisitSheet(): void {
    const detected = firstVisitDetectedLocale();
    if (!detected) return;
    const { scrim, sheet } = buildFirstVisitSheet(detected, {
      onAccept: () => {
        setRememberedLocale(detected);
        this.dismissFirstVisitSheet();
        location.assign(pathForLocale(detected, location.pathname) + location.search + location.hash);
      },
      onDecline: () => {
        // Declining (or dismissing) stays in English — and remembers
        // it, so the sheet never re-asks.
        setRememberedLocale(SOURCE_LOCALE);
        this.dismissFirstVisitSheet();
      },
    });
    this.firstVisitSheet = { scrim, sheet };
    this.screens.get("home")!.append(scrim, sheet);
  }

  private dismissFirstVisitSheet(): void {
    const open = this.firstVisitSheet;
    this.firstVisitSheet = null;
    open?.scrim.remove();
    open?.sheet.remove();
  }

  // -- history & stats (slice 2, renderings 03/04) ---------------------------

  /**
   * The Games tab (rendering 04): the stats header — placement
   * distribution plus the six shipped stat blocks, labels and
   * formulas unchanged — over the finished-games list, with the
   * in-progress game listed first when one exists. This merges the
   * old History and Stats screens into one tab root.
   */
  private async renderGames(): Promise<void> {
    let rows: (GameSummary | GameRecord)[];
    let sums: StatsSums;
    let handStats: boolean;
    const selectedVariant = this.historyVariant;
    if (this.user) {
      const [games, fresh] = await Promise.all([fetchGames(), fetchStats(fetch, selectedVariant)]);
      rows = (games ?? []).filter(r => (r.variant ?? "riichi") === selectedVariant);
      this.serverGameCount = rows.length;
      this.serverGames = rows;
      if (fresh && selectedVariant === "riichi") this.statsSums = fresh;
      sums = fresh ?? (selectedVariant === "riichi" ? this.statsSums : null) ?? {
        games: 0, wins: 0, placementSum: 0,
        hands: 0, riichi: 0, dealIns: 0, handsWon: 0, winPoints: 0, since: null,
      };
      handStats = true;
    } else {
      const local = this.localGameRecords().filter(r => (r.variant ?? "riichi") === selectedVariant);
      rows = local;
      // Guest: game-level sums over every local record; hand-level
      // sums only over records that actually carry them — rates are
      // never invented from records that lack the data (brief T3).
      const base = sumRecords(local);
      const hand = sumRecords(loadRecords().filter(r => (r.variant ?? "riichi") === selectedVariant));
      sums = {
        ...base,
        hands: hand.hands,
        riichi: hand.riichi,
        dealIns: hand.dealIns,
        handsWon: hand.handsWon,
        winPoints: hand.winPoints,
      };
      handStats = loadRecords().some(r => (r.variant ?? "riichi") === selectedVariant);
    }
    rows = [...rows].sort((a, b) => (a.finishedAt < b.finishedAt ? 1 : -1));
    if (!this.screens.get("games")!.classList.contains("active") || this.historyVariant !== selectedVariant) return;
    const el = this.screens.get("games")!;
    el.innerHTML = "";
    const page = h("div", { class: "tabpage" });
    el.append(page);
    page.append(h("h2", {}, tx("ui.app.games", "Games")));
    if (VARIANT_RELEASES.some(v=>v.released)) {
      const picker=h("select",{"aria-label":tx("ui.app.games-variant", "Games variant"),class:"play-variant"});
      for (const [id,name] of [["riichi",tx("ui.app.riichi", "Riichi")],...VARIANT_RELEASES.filter(v=>v.released).map(v=>[v.id,releaseName(v)])]) picker.append(h("option",{value:id!},name!));
      picker.value=selectedVariant;picker.addEventListener("change",()=>{this.historyVariant=picker.value as VariantId | "riichi";void this.renderGames();});page.append(picker);
    }
    const east = rows.filter((r) => r.length === "east").length;
    page.append(
      h("p", { class: "count" }, tx("ui.app.v-0-recorded-game-1-2-east-3-east-south-4", `${rows.length} recorded game${rows.length === 1 ? "" : "s"} — ${east} East, ${rows.filter(r=>r.length==="south").length} East + South${rows.some(r=>r.length==="full")?tx("ui.app.v-0-four-rounds", `, ${rows.filter(r=>r.length==="full").length} four rounds`, rows.filter(r=>r.length==="full").length):""}`, rows.length, rows.length === 1 ? "" : "s", east, rows.filter(r=>r.length==="south").length, rows.some(r=>r.length==="full")?tx("ui.app.v-0-four-rounds", `, ${rows.filter(r=>r.length==="full").length} four rounds`, rows.filter(r=>r.length==="full").length):"")),
    );
    const saved = loadGame();
    const summary = saved ? this.savedGameSummary(saved) : null;
    if (summary) page.append(this.inProgressRowEl(summary));
    if (rows.length > 0) page.append(this.distCardEl(rows));
    const grid = h("div", { class: "statgrid" });
    for (const b of formatStatsView(sums, { handStats }).filter(b => selectedVariant === "riichi" || b.id !== "riichi-rate")) {
      const st = h("div", { class: "stat" });
      st.append(h("div", { class: "v" }, b.value), h("div", { class: "l" }, b.label));
      if (b.sample) st.append(h("div", { class: "s" }, b.sample));
      grid.append(st);
    }
    page.append(grid);
    if (rows.length === 0) {
      page.append(h("p", { class: "dim" }, tx("ui.app.no-games-recorded-yet", "No games recorded yet.")));
    }
    for (const r of rows) page.append(this.historyRowEl(r));
    const tables = readTables(this.user?.id);
    if (tables.length) {
      page.append(h("h3", {}, tx("ui.app.at-the-table", "At the table")), h("p", { class: "dim" }, tx("ui.app.in-person-sessions-excluded-from-cpu-game-statis", "In-person sessions · Excluded from CPU-game statistics")));
      for (const copy of [...tables].reverse()) {
        const row = h("button", { class: "hrow" }, tx("ui.app.v-0-1-2-2", `${copy.session.variant === "american" ? tx("ui.app.american-helper", "American helper") : copy.session.variant === "hong-kong" ? tx("ui.app.hong-kong-old-style", "Hong Kong Old Style") : copy.session.variant === "mcr" ? tx("ui.app.mcr", "MCR") : copy.session.variant === "taiwanese" ? tx("ui.app.taiwanese", "Taiwanese") : "Riichi"} · ${copy.session.finished ? tx("ui.app.finished", "Finished") : tx("ui.app.in-progress-2", "In progress")} · ${copy.session.names.join(", ")}`, copy.session.variant === "american" ? tx("ui.app.american-helper", "American helper") : copy.session.variant === "hong-kong" ? tx("ui.app.hong-kong-old-style", "Hong Kong Old Style") : copy.session.variant === "mcr" ? tx("ui.app.mcr", "MCR") : copy.session.variant === "taiwanese" ? tx("ui.app.taiwanese", "Taiwanese") : "Riichi", copy.session.finished ? tx("ui.app.finished", "Finished") : tx("ui.app.in-progress-2", "In progress"), copy.session.names.join(", ")));
        row.addEventListener("click", () => { this.tableSessionId = copy.session.id; this.showScreen("tables"); });
        page.append(row);
      }
    }
  }

  /** The placement distribution card (rendering 04): one segment
   *  per placement, sized by its share of the recorded games. */
  private distCardEl(rows: (GameSummary | GameRecord)[]): HTMLElement {
    const counts = [0, 0, 0, 0];
    for (const r of rows) counts[r.placement - 1] = (counts[r.placement - 1] ?? 0) + 1;
    const card = h("div", { class: "distcard" });
    card.append(h("div", { class: "l" }, tx("ui.app.placements", "Placements")));
    const bar = h("div", { class: "distbar" });
    const labs = h("div", { class: "distlab" });
    const names = ["1st", "2nd", "3rd", "4th"];
    const colors = ["var(--state)", "var(--dim)", "var(--line)", "var(--panel-hi)"];
    counts.forEach((c, i) => {
      const seg = h("i", { style: `flex:${c};background:${colors[i]}` });
      bar.append(seg);
      const lab = h("span", { style: `flex:${c}` }, tx("ui.app.v-0-2", `${names[i]} ·`, names[i]) + " ");
      lab.append(h("b", {}, String(c)));
      labs.append(lab);
    });
    card.append(bar, labs);
    return card;
  }

  private historyRowEl(r: GameSummary | GameRecord): HTMLElement {
    const row = h("button", { class: "hrow" });
    row.append(
      h("span", { class: "when" }, historyDateLabel(r.finishedAt)),
      h("span", { class: "lenbadge" }, r.length === "full" ? tx("ui.app.four-rounds-2", "FOUR ROUNDS") : r.length === "east" ? tx("ui.app.east-2", "EAST") : tx("ui.app.east-south-2", "EAST + SOUTH")),
    );
    const res = h("span", { class: "res" });
    res.append(h("b", {}, placementLabel(r.placement)), document.createTextNode(" "));
    res.append(h("span", { class: "sc" }, tx("ui.app.v-0-3", `· ${fmt(r.score)}`, fmt(r.score))));
    row.append(res);
    row.insertAdjacentHTML(
      "beforeend",
      `<svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>`,
    );
    if (!("log" in r)) {
      row.addEventListener("click", async () => {
        row.disabled = true;
        const generation = this.generation;
        const record = await fetchGame(r.id);
        row.disabled = false;
        if (record && generation === this.generation && this.currentScreen === "games") this.openRecord(record);
      });
    } else if (r.log) {
      row.addEventListener("click", () => this.openRecord(r));
    } else {
      // Legacy slice-1 lines carry no decision log, so there is
      // nothing to replay; the row stays listed but inert.
      row.disabled = true;
    }
    return row;
  }

  /** History is reconstructed independently of the live runner and resume slot. */
  private openRecord(record: GameRecord): void {
    if (!record.log) return;
    try {
      const timeline = buildBoardReview({ ...record.log, id: record.id });
      if (!timeline.data.review.complete) return;
      this.reviewTimeline = timeline;
      this.reviewData = timeline.data.review;
      this.reviewRecordId = record.id;
      this.reviewResumeDecision = undefined;
      this.showScreen("details");
      trackReviewOpened();
    } catch { /* Corrupt history leaves the active game and stored bytes intact. */ }
  }

  private startVariantGame(variant: VariantId, seed = `om-${Date.now().toString(36)}`): void {
    this.generation++;this.playing=false;this.runner=null;
    this.variantRunner=new VariantRunner({seed,variant,length:this.variantLength,humanSeat:0});
    trackGameStarted(variant, this.variantLength, this.settings.guided);
    this.variantRunner.advance();this.saveVariantGame();this.showScreen("variant-table");
  }

  private saveVariantGame(): void {
    if(!this.variantRunner)return;
    const state=this.variantRunner.serialize();const savedAt=saveGame(state);this.resumeSync.noteSave(state,savedAt);
    if(this.variantRunner.result)this.recordVariantGame();
  }

  private recordVariantGame(): GameRecord | null {
    const r=this.variantRunner;if(!r?.result)return null;
    const existing=loadRecords().find(record=>record.id===r.id);if(existing){clearGame();this.resumeSync.noteClear();return existing;}
    const mine=r.result.settlement.find(s=>s.seat===r.humanSeat)!;
    const record=buildGameRecord({id:r.id,variant:r.variant,length:r.length,placement:mine.rank,score:mine.score,finishedAt:new Date().toISOString(),log:r.serialize(),events:r.events,humanSeat:r.humanSeat});
    appendRecord(record);clearGame();this.resumeSync.noteClear();if(this.user)void this.postRecord(record);
    trackGameFinished(r.variant, r.length, this.settings.guided);
    return record;
  }

  private renderVariantTable(): void {
    this.variantUI?.destroy();if(!this.variantRunner)return;
    this.variantUI=mountVariantTable(this.screens.get("variant-table")!,{runner:this.variantRunner,renderTile:t=>this.learningTile(t),onBack:()=>this.showScreen("home"),
      onSave:()=>this.saveVariantGame(),onFinish:()=>{this.recordVariantGame();},onReview:()=>{const record=this.recordVariantGame();if(record)this.openRecord(record);},onSound:kind=>this.sound.click(kind),soundEnabled:this.settings.sound,onSettings:settings=>{this.settings={...this.settings,...settings};this.sound.enabled=this.settings.sound;this.persistSettings();},guided:this.settings.guided,largeTiles:this.settings.largeTiles,reducedMotion:this.reducedMotion,resume:true});
  }

  private renderVariantEducation(): void {
    this.variantProgress=mergeVariantProgress(this.variantProgress,parseVariantProgress(this.readLearningCache(VARIANT_LEARNING_KEY)));
    this.variantEducationUI?.destroy();
    this.variantEducationUI=mountVariantEducation(this.screens.get("variant-learn")!,{variant:this.variantLearningId,...(this.variantLessonId?{lessonId:this.variantLessonId}:{}),practice:this.variantPracticeMode,
      ...(this.variantPracticeTopic?{initialTopic:this.variantPracticeTopic}:{}),progress:this.variantProgress,renderTile:t=>this.learningTile(t),
      onProgress:progress=>{this.variantProgress=progress;this.saveLearningCache(VARIANT_LEARNING_KEY,progress);this.queueAccountSettings();},
      onBack:()=>this.showScreen(this.variantReturnReview?"review":"learn"),onPlay:()=>{this.variantChoice=this.variantLearningId;this.startVariantGame(this.variantLearningId);}});
  }

  private renderInPerson(): void {
    this.tableUI?.destroy();
    if(this.user?.id)rememberTableAccount(this.user.id);
    // The network hint can remain "online" when requests fail, including
    // after an offline reload. A remembered ID selects local data only.
    const accountId=this.user?.id??offlineTableAccount();
    this.tableUI = mountInPerson(this.screens.get("tables")!, {
      onBack: () => this.showScreen(this.lastRoot), renderTile: tile => this.learningTile(tile),
      ...(accountId ? { accountId } : {}), ...(this.csrfToken ? { csrfToken: this.csrfToken } : {}),
      savedAccountCopy:!!accountId&&!this.user,
      getAuth:()=>this.user?.id&&this.csrfToken?{accountId:this.user.id,csrfToken:this.csrfToken}:undefined,
      ...(this.tableSessionId ? { initialId: this.tableSessionId } : {}),
    });
  }

  private renderGameDetail(): void {
    if (!this.reviewTimeline) return;
    mountGameDetail(this.screens.get("details")!, this.reviewTimeline,
      () => this.showScreen("games"), (index) => {
        this.reviewHandIndex = index;
        this.reviewResumeDecision = undefined;
        this.showScreen("review");
      });
  }

  // -- game lifecycle --------------------------------------------------------

  private startGame(length: GameLength, opts: { seed?: string } = {}): void {
    this.generation++;
    const seed = opts.seed ?? `om-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
    this.variantRunner = null;
    this.runner = new GameRunner({ seed, length, humanSeat: 0, aiDriver: new AiDriver() });
    trackGameStarted("riichi", length, this.settings.guided);
    this.resetDisplay();
    this.historyRecorded = false;
    this.hintShownThisGame = false;
    this.runner.advance();
    this.afterAdvance();
    this.showScreen("table");
    void this.playEvents();
  }

  private resumeGame(): void {
    const saved = loadGame();
    if (!saved) return;
    if (saved.v === 3) { try { this.variantRunner = VariantRunner.restore(saved); this.runner = null; this.generation++; this.showScreen("variant-table"); } catch { /* Preserve incompatible bytes. */ } return; }
    let restored: GameRunner;
    try { restored = GameRunner.restore(saved, new AiDriver()); }
    catch { return; }
    this.generation++;
    this.runner = restored;
    this.resetDisplay();
    this.historyRecorded = this.runner.result !== null;
    // Resume lands on the settled current state (A8: same game, same
    // state, event for event) rather than replaying the whole log.
    this.model = foldEvents(this.runner.events, this.humanSeat, this.runner.chiHints);
    this.cursor = this.runner.events.length;
    this.showScreen("table");
    this.renderTable();
    this.onSettled();
  }

  private resetDisplay(): void {
    this.model = new TableModel(this.humanSeat);
    this.cursor = 0;
    this.selectedTileId = null;
    this.riichiArmed = false;
    this.riichiDismissed = false;
    this.frame = null;
    this.frameChangedTiles.clear();
    this.playing = false;
    this.skipPlayback = false;
  }

  private afterAdvance(): void {
    if (!this.runner) return;
    if (this.runner.result) {
      clearGame();
      this.resumeSync.noteClear();
      if (this.tu11Active) {
        // TU-11 completes when its game finishes (§9): the results
        // screen the player is looking at is the lesson's end.
        this.tu11Active = false;
        if (!this.tutorial.done.includes("tu11")) {
          this.tutorial = { done: [...this.tutorial.done, "tu11"], active: null };
          this.persistTutorial();
          trackLessonCompleted("tu11");
        }
      }
      if (!this.historyRecorded) {
        this.historyRecorded = true;
        const mine = this.runner.result.settlement.find((s) => s.seat === this.humanSeat);
        // Slice 2 (brief T1): the full record — decision log + hand
        // stats — is stored locally for everyone and posted when
        // signed in. Posting is fire-and-forget; the results screen
        // never waits on it.
        const record = buildGameRecord({
          id: this.runner.id,
          length: this.runner.length,
          placement: mine?.rank ?? 0,
          score: mine?.score ?? this.runner.result.scores[this.humanSeat] ?? 0,
          finishedAt: new Date().toISOString(),
          log: this.runner.serialize(),
          events: this.runner.events,
          humanSeat: this.humanSeat,
        });
        appendRecord(record);
        if (this.user) void this.postRecord(record);
        trackGameFinished("riichi", this.runner.length, this.settings.guided);
      }
    } else {
      const state = this.runner.serialize();
      const savedAt = saveGame(state);
      this.resumeSync.noteSave(state, savedAt);
    }
  }

  private quitToHome(): void {
    this.generation++;
    this.playing = false;
    this.frame = null;
    this.lesson = null;
    this.tu11Active = false;
    this.showScreen("home");
  }

  private restartGame(): void {
    if (!this.runner) return;
    clearGame();
    this.resumeSync.noteClear();
    this.startGame(this.runner.length);
  }

  // -- playback ---------------------------------------------------------------

  private delayFor(ev: GameEvent): number {
    if (this.reducedMotion || this.skipPlayback) return 0;
    return EVENT_DELAYS[ev.type] ?? 150;
  }

  private async playEvents(): Promise<void> {
    if (this.playing || !this.runner) return;
    this.playing = true;
    const gen = this.generation;
    this.tableEl.classList.add("animating");
    try {
      while (this.runner && this.cursor < this.runner.events.length) {
        if (gen !== this.generation) return;
        const ev = this.runner.events[this.cursor]!;
        const before = this.flipSnapshot();
        this.model.apply(ev, this.runner.chiHints.get(ev.seq));
        this.cursor++;
        if (this.frame && (ev.type === "discard" || ev.type === "draw" || ev.type === "call")) {
          const tileId = Number(ev["tile"] ?? -1);
          if (tileId >= 0) this.frameChangedTiles.add(tileId);
        }
        this.renderTable();
        this.flipPlay(before);
        if (!this.reducedMotion && !this.skipPlayback) {
          if (ev.type === "discard") this.sound.click("discard");
          else if (ev.type === "call" || ev.type === "kan") this.sound.click("call");
          else if (ev.type === "win") this.sound.click("win");
        }
        this.maybeShowHint(ev);
        const delay = this.delayFor(ev);
        if (delay > 0) await sleep(delay);
        if (gen !== this.generation) return;
        if (ev.type === "hand-end") {
          await this.showBreakdown();
          if (gen !== this.generation) return;
        }
      }
    } finally {
      this.playing = false;
      this.tableEl.classList.remove("animating");
    }
    this.onSettled();
  }

  private onSettled(): void {
    if (!this.runner) return;
    if (this.runner.result) {
      this.renderTable();
      this.renderResults();
      this.showScreen("results");
      return;
    }
    if (this.runner.pending?.kind === "call" && this.frame) {
      // A call window auto-dismisses any open frame (Focus Frame law).
      this.closeFrame();
    }
    this.renderTable();
  }

  private humanAct(action: TurnAction | CallAction): void {
    if (!this.runner || !this.runner.pending) return;
    this.selectedTileId = null;
    this.riichiArmed = false;
    this.riichiDismissed = false;
    this.runner.act(action);
    this.afterAdvance();
    void this.playEvents();
  }

  // -- FLIP --------------------------------------------------------------------

  private flipSnapshot(): Map<string, { x: number; y: number }> {
    const map = new Map<string, { x: number; y: number }>();
    this.tableEl.querySelectorAll<HTMLElement>("[data-flip]").forEach((el) => {
      const r = el.getBoundingClientRect();
      map.set(el.dataset["flip"]!, { x: r.left / this.scale, y: r.top / this.scale });
    });
    return map;
  }

  private flipPlay(before: Map<string, { x: number; y: number }>): void {
    if (this.reducedMotion) return;
    this.tableEl.querySelectorAll<HTMLElement>("[data-flip]").forEach((el) => {
      const key = el.dataset["flip"]!;
      const prev = before.get(key);
      if (!prev) {
        el.animate(
          [{ opacity: "0", transform: "scale(0.7)" }, { opacity: "1", transform: "scale(1)" }],
          { duration: 160, easing: "ease-out" },
        );
        return;
      }
      const r = el.getBoundingClientRect();
      const dx = prev.x - r.left / this.scale;
      const dy = prev.y - r.top / this.scale;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        el.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
          { duration: 210, easing: "cubic-bezier(.2,.8,.3,1)" },
        );
      }
    });
  }

  // -- hints (first-game Focus Frame teaching) --------------------------------

  private maybeShowHint(ev: GameEvent): void {
    if (focusFrameTaught() || this.hintShownThisGame) return;
    const seat = Number(ev["seat"] ?? -1);
    if (ev.type === "discard" && seat !== this.humanSeat) {
      this.showHint(tx("ui.app.tap-any-pond-to-inspect-it-up-close-melds-includ", "Tap any pond to inspect it up close — melds included."));
    }
  }

  private showHint(text: string): void {
    this.hintShownThisGame = true;
    const hint = h("div", { class: "hint" }, text);
    hint.addEventListener("click", () => hint.remove());
    this.tableEl.append(hint);
    window.setTimeout(() => hint.remove(), 7000);
  }

  // -- table rendering ----------------------------------------------------------

  private rel(seat: Seat): number {
    return (seat - this.humanSeat + 4) % 4; // 0 bottom, 1 right, 2 top, 3 left
  }

  private seatAt(rel: number): Seat {
    return (this.humanSeat + rel) % 4;
  }

  private lastDiscardRef(): { seat: Seat; tileId: number } | null {
    if (!this.runner) return null;
    for (let i = this.cursor - 1; i >= 0; i--) {
      const ev = this.runner.events[i]!;
      if (ev.type === "discard") return { seat: Number(ev["seat"]) as Seat, tileId: Number(ev["tile"]) };
      if (ev.type === "hand-start") return null;
    }
    return null;
  }

  private humanDrawnTileId(): number | null {
    if (!this.runner) return null;
    let drawn: number | null = null;
    for (let i = 0; i < this.cursor; i++) {
      const ev = this.runner.events[i]!;
      if (ev.type === "hand-start") drawn = null;
      else if (ev.type === "draw" && Number(ev["seat"]) === this.humanSeat) drawn = Number(ev["tile"]);
      else if (ev.type === "discard" && Number(ev["seat"]) === this.humanSeat) drawn = null;
      else if (ev.type === "call" && Number(ev["seat"]) === this.humanSeat) drawn = null;
    }
    return drawn;
  }

  private chip(seat: Seat, extraCls = ""): HTMLElement {
    const p = this.model.players[seat]!;
    const wind = WIND_NAMES[p.seatWind]!;
    const isTurn = this.model.currentTurn === seat && this.model.handInProgress;
    const chip = h("div", { class: `chip ${extraCls} ${isTurn ? "turn" : ""}` });
    if (seat === this.humanSeat) {
      const d = h("span", { class: "dealer" }, tx("ui.app.v-0-you", `${wind} · You`, wind));
      chip.append(d, document.createTextNode(`  `));
    } else {
      chip.append(document.createTextNode(tx("ui.app.v-0-1", `${wind}${p.riichi ? " " + tx("ui.app.riichi-2", "· Riichi") : ""}`, wind, p.riichi ? " " + tx("ui.app.riichi-2", "· Riichi") : "") + "  "));
    }
    chip.append(h("b", {}, fmt(p.score)));
    return chip;
  }

  private meldEl(
    meld: { kind: string; tiles: readonly Tile[]; calledFrom?: Seat; calledTile?: Tile },
    cls: string,
    ownerSeat?: Seat,
  ): HTMLElement {
    const wrap = h("span", { class: "meld" });
    // The called tile sits in the meld on the side it was called from,
    // relative to the meld's owner on screen: from the owner's left ->
    // first, across -> middle, from the right -> last.
    const others = meld.calledTile
      ? meld.tiles.filter((t) => t.id !== meld.calledTile!.id)
      : [...meld.tiles];
    const seq: { tile: Tile; side: boolean }[] = others.map((t) => ({ tile: t, side: false }));
    if (meld.calledTile && meld.calledFrom !== undefined && ownerSeat !== undefined) {
      const dir = (this.rel(meld.calledFrom) - this.rel(ownerSeat) + 4) % 4;
      const insertAt = dir === 3 ? 0 : dir === 2 ? 1 : seq.length;
      seq.splice(Math.min(insertAt, seq.length), 0, { tile: meld.calledTile, side: true });
    } else if (meld.calledTile) {
      seq.push({ tile: meld.calledTile, side: true });
    }
    for (const { tile, side } of seq) {
      wrap.append(tileEl(tile, tx("ui.app.v-0-1-3", `${cls} ${side ? "side" : ""}`, cls, side ? "side" : "")));
    }
    return wrap;
  }

  private pondEl(seat: Seat, variant: "grid" | "left" | "right"): HTMLElement {
    const p = this.model.players[seat]!;
    const last = this.lastDiscardRef();
    const entries = p.pond.filter((e) => !e.called);
    if (variant === "grid") {
      const pond = h("div", { class: `pond ${seat === this.seatAt(2) ? "flip" : ""}` });
      for (const e of entries) {
        const isLast = last && last.seat === seat && last.tileId === e.tile.id;
        const wrap = tileEl(e.tile, `t-pond ${e.riichiDeclaration ? "side" : ""}`);
        if (isLast) {
          wrap.style.boxShadow = "0 0 0 2px var(--decisive)";
          wrap.style.borderRadius = "7px";
        }
        pond.append(wrap);
      }
      pond.addEventListener("click", () => this.openFrame({ kind: "player", seat }));
      return pond;
    }
    const sp = h("div", { class: `sp ${variant}` });
    for (const e of entries) {
      const cell = h("span", { class: "cell" });
      const isLast = last && last.seat === seat && last.tileId === e.tile.id;
      if (isLast) cell.classList.add("hl");
      cell.append(tileEl(e.tile, `t-pond ${e.riichiDeclaration ? "riichi" : "rot"}`));
      sp.append(cell);
    }
    sp.addEventListener("click", () => this.openFrame({ kind: "player", seat }));
    return sp;
  }

  private renderTable(): void {
    // A re-render replaces the hand's DOM; a grab whose tile left
    // with it is over (its commit never lands).
    if (this.tileDrag && !this.tileDrag.wrap.isConnected) this.endTileDrag();
    const m = this.model;
    const t = this.tableEl;
    t.innerHTML = "";
    t.className = this.frame ? "framed" : "";
    t.id = "table";
    if (this.riichiArmed) t.classList.add("armed");

    // Header
    const header = h("header", { class: "bar" });
    const menuBtn = h("button", { class: "iconbtn", "aria-label": tx("ui.app.menu", "Menu"), "data-control-key": "menu" });
    menuBtn.innerHTML = ICON_MENU;
    menuBtn.addEventListener("click", () => {
      if (this.lesson) this.showLessonMenu();
      else this.showPause();
    });
    const soundBtn = h("button", { class: "iconbtn", "aria-label": tx("ui.app.sound", "Sound") });
    soundBtn.innerHTML = this.settings.sound ? ICON_SOUND_ON : ICON_SOUND_OFF;
    soundBtn.addEventListener("click", () => {
      this.settings = { ...this.settings, sound: !this.settings.sound };
      this.sound.enabled = this.settings.sound;
      this.persistSettings();
      this.renderTable();
    });
    header.append(menuBtn, h("span", { class: "word" }, tx("ui.app.open-mahjong", "OPEN MAHJONG")), soundBtn);
    t.append(header);

    // Lesson surfaces (§9, tutorial renderings): a finished lesson
    // shows its completion panel; a panel lesson shows its stage —
    // neither uses the game zones.
    if (this.lesson?.done) {
      t.append(this.lessonCompleteEl());
      return;
    }
    if (this.lesson && !this.lesson.usesTable) {
      t.append(this.lessonStageEl());
      return;
    }

    const top = this.seatAt(2);
    const right = this.seatAt(1);
    const left = this.seatAt(3);
    const me = this.humanSeat;

    // Top opponent zone
    const zoneTop = h("div", { class: "zone-top" });
    const oppHand = h("div", { class: "opp-hand" });
    const topP = m.players[top]!;
    for (let i = 0; i < topP.handIds.length; i++) oppHand.append(backEl("t-back", `back-${top}-${i}`));
    for (const meld of topP.melds) oppHand.append(this.meldEl(meld, "t-meld", top));
    zoneTop.append(oppHand);
    const topPondWrap = h("div", { class: "pondwrap" });
    topPondWrap.append(this.pondEl(top, "grid"));
    zoneTop.append(topPondWrap);
    t.append(zoneTop);

    // Middle band
    const band = h("div", { class: "band" });
    const bandtop = h("div", { class: "bandtop" });
    bandtop.append(this.chip(left), this.chip(top, "west"), this.chip(right));
    band.append(bandtop);
    const stageMid = h("div", { class: "stage-mid" });
    for (const [seat, side] of [[left, "left"], [right, "right"]] as [Seat, string][]) {
      const sh = h("div", { class: `sidehand ${side}` });
      const sp = m.players[seat]!;
      for (let i = 0; i < sp.handIds.length; i++) sh.append(backEl("t-back", `back-${seat}-${i}`));
      stageMid.append(sh);
      stageMid.append(this.pondEl(seat, side as "left" | "right"));
    }
    stageMid.append(this.centerEl());
    band.append(stageMid);
    const bandbot = h("div", { class: "bandbot" });
    bandbot.append(this.chip(me));
    band.append(bandbot);
    t.append(band);

    // Player zone
    const zonePlayer = h("div", { class: `zone-player ${this.pendingVisible() ? "with-prompt" : ""}` });
    const myPondWrap = h("div", { class: "pondwrap" });
    myPondWrap.append(this.pondEl(me, "grid"));
    zonePlayer.append(myPondWrap);
    zonePlayer.append(this.promptRowEl());
    zonePlayer.append(this.handRowEl());
    const handctl = h("div", { class: "handctl" });
    if (this.handOutOfOrderNow()) {
      // The player's own arrangement is showing; one tap restores
      // the resting order (the sort, or group order in guided mode).
      const sortBtn = h("button", { "data-control-key": "hand-sort" }, tx("ui.app.sort", "Sort"));
      sortBtn.innerHTML = `${ICON_SORT}<span>Sort</span>`;
      sortBtn.addEventListener("click", () => {
        this.sound.unlock();
        this.handOrder = null;
        this.handOrderDrawnId = null;
        this.renderTable();
      });
      handctl.append(sortBtn);
    }
    const expandBtn = h("button", { "data-control-key": "inspect-open" }, tx("ui.app.inspect-hand", "Inspect hand"));
    expandBtn.innerHTML = tx("ui.app.v-0-span-inspect-hand-span", `${ICON_EXPAND}<span>Inspect hand</span>`, ICON_EXPAND);
    expandBtn.addEventListener("click", () => this.openFrame({ kind: "hand", mode: "inspect" }));
    handctl.append(expandBtn);
    zonePlayer.append(handctl);
    t.append(zonePlayer);

    // Focus frame layer
    if (this.frame) {
      const scrim = h("button", { class: "scrim", "aria-label": tx("ui.app.close", "Close") });
      scrim.addEventListener("click", () => this.closeFrame());
      t.append(scrim);
      const dialog = this.frameEl();
      t.append(dialog);
      // Underlying table controls stay out of the modal tab sequence.
      for (const child of [...t.children]) {
        if (child !== dialog && child !== scrim && child instanceof HTMLElement) child.inert = true;
      }
      accessibleDialog(dialog, this.frame.kind === "hand" ? tx("ui.app.your-hand-2", "Your hand") : this.frame.kind === "guide" || this.frame.kind === "moment" ? tx("ui.app.why-this-move", "Why this move?") : this.frame.kind === "center" ? "Round details" : "Player details", () => this.closeFrame());
    }

    // Guided hint overlay (HINT PLACEMENT ruling): a floating layer
    // anchored above the player's hand — never in table layout, so
    // pond growth and Large Tiles cannot collide with it.
    const guide = this.guideHintEl();
    if (guide) t.append(guide);
  }

  /**
   * The coach's advice for the pending draw decision, or null
   * whenever guided help must not speak: guided off, a lesson scene
   * running, playback running, or no discard decision pending. The
   * advice is the coach's — the CPU policy's own evaluation, opened
   * up. Shared by the hint overlay, the recommendation ring on the
   * hand, and the inspect readout's waits rule.
   */
  private guideAdvice(): TurnAdvice | null {
    // Current strategic analysis must not be attributed to historical
    // rules. Legacy saves retain their original simulation revision.
    if (this.runner?.replayVersion === 1) return null;
    if (this.lesson || this.playing || !this.runner) return null;
    if (!this.tu11Active && !this.settings.guided) return null;
    const pending = this.runner.pending;
    if (!pending || pending.kind !== "turn" || !this.pendingVisible()) return null;
    if (this.guideCacheFor === pending) return this.guideCacheAdvice;
    const advice = adviseDiscard(pending.view, pending.ctx);
    this.guideCacheFor = pending;
    this.guideCacheAdvice = advice;
    return advice;
  }

  /**
   * The coaching moment for the pending decision — a call window, a
   * win offer, a riichi choice, or a kan offer — graded by the same
   * coach evaluators Review uses, under the same gates as the
   * discard advice. One moment speaks per decision, in the brief's
   * priority: a call window stands alone; at a turn, a win offer
   * outranks the riichi choice, which outranks a kan offer. The
   * hint lives in the prompt row that owns the moment — never on
   * the base table (brief G5 surface law).
   */
  private guideMoment(): MomentGrade | null {
    if (this.runner?.replayVersion === 1) return null;
    if (this.lesson || this.playing || !this.runner) return null;
    if (!this.tu11Active && !this.settings.guided) return null;
    const pending = this.runner.pending;
    if (!pending || !this.pendingVisible()) return null;
    if (this.guideMomentFor === pending) return this.guideMomentGrade;
    let grade: MomentGrade | null = null;
    if (pending.kind === "call") {
      const ctx = pending.ctx;
      if (ctx.canRon || ctx.canPon || ctx.canKan || ctx.chiOptions.length > 0) {
        grade = { kind: "call", advice: adviseCall(pending.view, ctx) };
      }
    } else {
      const ctx = pending.ctx;
      if (ctx.canTsumo) {
        const win = adviseWin(pending.view, ctx);
        if (win) grade = { kind: "win", advice: win };
      }
      if (!grade && ctx.riichiDiscardIds.length > 0 && !this.riichiDismissed) {
        const riichi = adviseRiichi(pending.view, ctx);
        if (riichi) grade = { kind: "riichi", advice: riichi };
      }
      if (!grade && (ctx.ankanOptions.length > 0 || ctx.shouminkanOptions.length > 0)) {
        const kan = adviseKan(pending.view, ctx);
        if (kan) grade = { kind: "kan", advice: kan };
      }
    }
    this.guideMomentFor = pending;
    this.guideMomentGrade = grade;
    return grade;
  }

  /**
   * The guided hint overlay: the coach's headline with the named
   * tile's face beside it (approved rendering A), floating above the
   * hand. The bubble itself is tappable — it opens the "Why this
   * move?" explanation sheet — and nothing else about the layer
   * intercepts touches: the hand and call buttons stay live around
   * it. Hidden while any Focus Frame (or the sheet itself) is open.
   */
  private guideHintEl(): HTMLElement | null {
    if (this.frame) return null;
    // A win offer owns the turn: the discard headline would argue
    // with the win moment's read in the prompt row, so the floating
    // overlay stays silent while a tsumo is on offer.
    if (this.guideMoment()?.kind === "win") return null;
    const advice = this.guideAdvice();
    if (!advice) return null;
    const el = h("div", {
      class: "guidehint",
      role: "button",
      tabindex: "0",
      "aria-label": tx("ui.app.why-this-move", "Why this move?"),
    });
    el.append(
      tileEl(tileById(advice.recommendation.tileId), "gface", { flip: false }),
      h("span", { class: "gtext" }, advice.headline),
    );
    // When the player's selected tile carries the safety badge, the
    // bubble states the reason in words — the badge is never colour
    // alone (guided-play package).
    if (this.selectedTileId !== null) {
      const selected = advice.options.find((o) => o.tileId === this.selectedTileId);
      if (selected?.genbutsu) {
        const names = selected.genbutsuAgainst.map(
          (seat) => WIND_NAMES[this.model.players[seat]!.seatWind]!,
        );
        el.append(h("div", { class: "gsafe" }, safetyLineText(names)));
      }
    }
    el.addEventListener("click", () => {
      this.sound.unlock();
      this.openFrame({ kind: "guide" });
    });
    el.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      this.openFrame({ kind: "guide" });
    });
    return el;
  }

  private centerEl(): HTMLElement {
    const m = this.model;
    const center = h("button", { class: "center", "data-control-key": "round-details" });
    const round = h("div", { class: "round" });
    const wind = h("span", { class: "wind kj" }, WIND_KANJI[m.roundWind]!);
    const rname = h("span", { class: "rname" }, tx("ui.app.v-0-1-3", `${WIND_NAMES[m.roundWind]} ${m.kyoku}`, WIND_NAMES[m.roundWind], m.kyoku));
    round.append(wind, rname);
    center.append(round);
    center.append(h("div", { class: "sub" }, tx("ui.app.v-0-honba-wall-1", `${m.honba} honba · Wall ${m.wallRemaining}`, m.honba, m.wallRemaining)));
    if (m.sticks > 0) {
      const sr = h("div", { class: "stickrow" });
      sr.append(h("span", { class: "stick" }), h("span", { class: "n" }, tx("ui.app.v-0-4", `× ${m.sticks}`, m.sticks)));
      center.append(sr);
    }
    const dr = h("div", { class: "dorarow" });
    dr.append(h("span", { class: "lbl" }, tx("ui.app.dora", "Dora")));
    for (const ind of m.doraIndicators) dr.append(tileEl(ind, "t-dora", { flip: false }));
    // Unrevealed indicator slots ride face-down beside the revealed ones
    // (the approved base state shows indicator + two backs).
    const slots = Math.min(5, Math.max(3, m.doraIndicators.length));
    for (let i = m.doraIndicators.length; i < slots; i++) dr.append(backEl("t-dora"));
    center.append(dr);
    center.addEventListener("click", () => this.openFrame({ kind: "center" }));
    return center;
  }

  private pendingVisible(): boolean {
    return !!this.runner?.pending && !this.playing && this.cursor >= (this.runner?.events.length ?? 0);
  }

  private handTilesSorted(): { tiles: Tile[]; drawnId: number | null } {
    const me = this.model.players[this.humanSeat]!;
    const drawnId = this.humanDrawnTileId();
    const tiles = me.handIds.map(tileById).sort((a, b) => a.type - b.type || a.id - b.id);
    if (drawnId !== null) {
      const i = tiles.findIndex((t) => t.id === drawnId);
      if (i >= 0) {
        const [d] = tiles.splice(i, 1);
        tiles.push(d!);
        return { tiles, drawnId };
      }
    }
    return { tiles, drawnId: null };
  }

  /** Index of the most recent hand-start event at or before the
   *  cursor — the epoch a non-guided manual arrangement lives in. */
  private handEpoch(): number {
    if (!this.runner) return -1;
    let epoch = -1;
    for (let i = 0; i < this.cursor && i < this.runner.events.length; i++) {
      if (this.runner.events[i]!.type === "hand-start") epoch = i;
    }
    return epoch;
  }

  /** Guided grouping regime: a live, non-lesson game with guided on. */
  private groupingLive(): boolean {
    return !!this.runner && !this.playing && !this.lesson && this.settings.guided;
  }

  /** The stamp the stored manual order must carry to still apply. */
  private manualOrderStampNow(): string {
    return this.groupingLive() ? `cur:${this.cursor}` : `hand:${this.handEpoch()}`;
  }

  private manualOrderApplies(): boolean {
    return (
      !!this.handOrder &&
      !!this.runner &&
      this.handOrderRunner === this.runner &&
      this.handOrderStamp === this.manualOrderStampNow()
    );
  }

  /**
   * The hand as it is displayed (guided-play package): in the guided
   * grouping regime, group order from the decomposition — grouping
   * is itself a sort — with the decomposition attached for the label
   * strip; a manual arrangement the player made by shifting tiles
   * wins over both, within its stamp's lifetime; otherwise the
   * shipped sorted order with the drawn tile apart. `segments` is
   * null whenever the display order is not the decomposition's —
   * labels then stay hidden until grouping re-sorts.
   */
  private handDisplayTiles(): {
    tiles: Tile[];
    drawnId: number | null;
    drawnApart: boolean;
    grouped: boolean;
    segments: HandSegment[] | null;
  } {
    const sorted = this.handTilesSorted();
    const live = !!this.runner && !this.playing && !this.lesson;
    if (!live) {
      return {
        tiles: sorted.tiles,
        drawnId: sorted.drawnId,
        drawnApart: sorted.drawnId !== null,
        grouped: false,
        segments: null,
      };
    }
    const me = this.model.players[this.humanSeat]!;
    const byId = new Map(sorted.tiles.map((t) => [t.id, t]));
    const grouped = this.settings.guided;

    if (grouped) {
      const segments = decomposeHand(sorted.tiles, me.melds.length);
      const groupOrder = segmentTileIds(segments);
      if (this.manualOrderApplies()) {
        const arranged = this.handOrder!.filter((id) => byId.has(id));
        const rest = sorted.tiles.filter((t) => !arranged.includes(t.id));
        const tiles = [...arranged, ...rest.map((t) => t.id)].map((id) => byId.get(id)!);
        const matches =
          tiles.length === groupOrder.length &&
          tiles.every((t, i) => groupOrder[i] === t.id);
        return {
          tiles,
          drawnId: sorted.drawnId,
          drawnApart: false,
          grouped: true,
          segments: matches ? segments : null,
        };
      }
      return {
        tiles: groupOrder.map((id) => byId.get(id)!),
        drawnId: sorted.drawnId,
        drawnApart: false,
        grouped: true,
        segments,
      };
    }

    if (this.manualOrderApplies()) {
      // A tile drawn after the arrangement was made is not part of
      // it: it arrives apart at the right, and the arranged tiles
      // keep exactly the order the player left them in.
      const drawnArranged =
        sorted.drawnId !== null && sorted.drawnId === this.handOrderDrawnId;
      const pool =
        drawnArranged || sorted.drawnId === null
          ? sorted.tiles
          : sorted.tiles.filter((t) => t.id !== sorted.drawnId);
      const arranged = this.handOrder!.filter((id) => pool.some((t) => t.id === id));
      const rest = pool.filter((t) => !arranged.includes(t.id));
      const tiles = [...arranged, ...rest.map((t) => t.id)].map((id) => byId.get(id)!);
      let drawnApart = false;
      if (!drawnArranged && sorted.drawnId !== null) {
        tiles.push(byId.get(sorted.drawnId)!);
        drawnApart = true;
      }
      return { tiles, drawnId: sorted.drawnId, drawnApart, grouped: false, segments: null };
    }
    return {
      tiles: sorted.tiles,
      drawnId: sorted.drawnId,
      drawnApart: sorted.drawnId !== null,
      grouped: false,
      segments: null,
    };
  }

  /** Whether the hand currently sits out of its resting order and
   *  the Sort control should offer to restore it. */
  private handOutOfOrderNow(): boolean {
    if (!this.handOrder || !this.manualOrderApplies()) return false;
    if (!this.runner || this.playing || this.lesson) return false;
    const display = this.handDisplayTiles();
    if (display.grouped) return display.segments === null;
    const sorted = this.handTilesSorted();
    const dispBase =
      display.drawnApart && display.tiles.length > 0
        ? display.tiles.slice(0, -1)
        : display.tiles;
    const sortBase = sorted.drawnId !== null ? sorted.tiles.slice(0, -1) : sorted.tiles;
    if (dispBase.length !== sortBase.length) return true;
    return dispBase.some((t, i) => t.id !== sortBase[i]!.id);
  }

  /** Tiles may be shifted by press-and-hold whenever the player's
   *  own hand is live and unlocked: never during playback, lessons,
   *  an open frame, a finished game, or after the player's own
   *  riichi declaration (the rules lock the hand). */
  private canShiftTiles(): boolean {
    if (!this.runner || this.playing || this.lesson || this.frame) return false;
    if (this.runner.result) return false;
    const me = this.model.players[this.humanSeat];
    if (!me || me.riichi) return false;
    return true;
  }

  // -- tile shifting (press-and-hold) ------------------------------------------
  //
  // A quick tap stays a tap (select/discard, untouched). Holding a
  // tile for a beat grabs it: the tile lifts, a dashed ghost marks
  // the slot it came from, and sliding sideways walks it through the
  // row — neighbours part as it passes. Release drops it and the
  // order is committed as the manual arrangement. A grab never
  // discards, and any pointer travel that was really a swipe
  // suppresses the tap that would otherwise follow it.

  private onTilePointerDown(ev: PointerEvent, tile: Tile, wrap: HTMLElement, inner: HTMLElement): void {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    if (!this.canShiftTiles() || this.tileDrag) return;
    const drag: NonNullable<App["tileDrag"]> = {
      tileId: tile.id,
      wrap,
      inner,
      ghost: null,
      startX: ev.clientX,
      dx: 0,
      grabbed: false,
      moved: false,
      order: this.handDisplayTiles().tiles.map((t) => t.id),
      timer: null,
      onMove: (e: PointerEvent) => this.onTilePointerMove(e),
      onUp: (e: PointerEvent) => this.onTilePointerUp(e),
    };
    drag.timer = setTimeout(() => this.beginTileGrab(), 260);
    this.tileDrag = drag;
    window.addEventListener("pointermove", drag.onMove);
    window.addEventListener("pointerup", drag.onUp);
    window.addEventListener("pointercancel", drag.onUp);
  }

  private beginTileGrab(): void {
    const drag = this.tileDrag;
    if (!drag || drag.grabbed) return;
    drag.grabbed = true;
    const rect = drag.inner.getBoundingClientRect();
    const ghost = h("span", { class: "hshift-ghost" });
    ghost.style.width = `${rect.width / this.scale}px`;
    ghost.style.height = `${rect.height / this.scale}px`;
    drag.wrap.before(ghost);
    drag.ghost = ghost;
    drag.wrap.classList.add("grabbing");
    drag.wrap.style.width = "0px";
    this.applyDragTransform(0);
  }

  private applyDragTransform(dx: number): void {
    const drag = this.tileDrag;
    if (!drag) return;
    drag.inner.style.transform = tx("ui.app.translate-0-px-6px-scale-1-12", `translate(${dx}px, -6px) scale(1.12)`, dx);
    drag.inner.style.zIndex = "6";
    drag.inner.style.position = "relative";
  }

  private onTilePointerMove(ev: PointerEvent): void {
    const drag = this.tileDrag;
    if (!drag) return;
    const totalDx = (ev.clientX - drag.startX) / this.scale;
    if (!drag.grabbed) {
      // Travel before the hold arms means a swipe, not a grab: the
      // arm is cancelled and the release will not read as a tap.
      if (Math.abs(totalDx) > 10) {
        drag.moved = true;
        if (drag.timer) clearTimeout(drag.timer);
      }
      return;
    }
    drag.moved = true;
    const ghost = drag.ghost!;
    const gr = ghost.getBoundingClientRect();
    const visualCenter = (gr.left + gr.width / 2) / this.scale + totalDx;
    const row = drag.wrap.closest(".handrow");
    if (!row) return;
    // Only the concealed hand's own wraps take part — meld tiles
    // share the row but are never part of the arrangement.
    const orderSet = new Set(drag.order);
    const others = [...row.querySelectorAll<HTMLElement>(".twrap")].filter(
      (w) => w !== drag.wrap && orderSet.has(Number((w.dataset["flip"] ?? "").slice(5))),
    );
    let insertAt = others.length;
    for (let i = 0; i < others.length; i++) {
      const r = others[i]!.getBoundingClientRect();
      if (visualCenter < (r.left + r.width / 2) / this.scale) {
        insertAt = i;
        break;
      }
    }
    const currentIdx = drag.order.indexOf(drag.tileId);
    if (insertAt !== currentIdx && others.length > 0) {
      if (insertAt >= others.length) others[others.length - 1]!.after(drag.wrap);
      else others[insertAt]!.before(drag.wrap);
      const rest = drag.order.filter((id) => id !== drag.tileId);
      rest.splice(insertAt, 0, drag.tileId);
      drag.order = rest;
      drag.dx += (insertAt - currentIdx) * (gr.width / this.scale + 1);
    }
    this.applyDragTransform(totalDx - drag.dx);
  }

  private onTilePointerUp(_ev: PointerEvent): void {
    const drag = this.tileDrag;
    if (!drag) return;
    const wasGrabbed = drag.grabbed;
    const order = drag.order;
    const wasMoved = drag.moved;
    this.endTileDrag();
    if (wasGrabbed) {
      this.suppressHandTapUntil = Date.now() + 400;
      this.handOrder = [...order];
      this.handOrderRunner = this.runner;
      this.handOrderStamp = this.manualOrderStampNow();
      this.handOrderDrawnId = this.handTilesSorted().drawnId;
      this.renderTable();
    } else if (wasMoved) {
      this.suppressHandTapUntil = Date.now() + 400;
    }
  }

  private endTileDrag(): void {
    const drag = this.tileDrag;
    if (!drag) return;
    if (drag.timer) clearTimeout(drag.timer);
    window.removeEventListener("pointermove", drag.onMove);
    window.removeEventListener("pointerup", drag.onUp);
    window.removeEventListener("pointercancel", drag.onUp);
    this.tileDrag = null;
  }

  private handTileSize(): number {
    // Large mode (table-large-v1): the size is fixed at 28 — the §8 meld
    // dividend is capped there; stability outranks maximal size.
    if (this.settings.largeTiles) return 28;
    const me = this.model.players[this.humanSeat]!;
    const n = me.handIds.length;
    if (me.melds.length === 0 || n === 0) return 25;
    const meldWidth = me.melds.reduce((w, meld) => w + meld.tiles.length * 21.5 + 10, 0);
    const per = Math.floor((368 - meldWidth) / n);
    return Math.max(25, Math.min(34, per));
  }

  private handRowEl(): HTMLElement {
    const me = this.model.players[this.humanSeat]!;
    const row = h("div", { class: "handrow" });
    const display = this.handDisplayTiles();
    const { tiles, drawnId } = display;
    const size = this.handTileSize();
    const pending = this.runner?.pending;
    const myTurn = pending?.kind === "turn" && !this.playing;
    const advice = this.guideAdvice();
    // The coach's recommended discard instance carries the ring
    // (rendering A) for exactly as long as the hint speaks for this
    // decision; a fresh render for a new decision recomputes it.
    const recId = advice?.recommendation.tileId ?? null;
    // Safety badges and the grouping labels belong to the guided
    // overlay family: they speak only while the hint does, and hide
    // with it during call prompts and Focus Frames.
    const guidedFamily = advice !== null && !this.frame;
    const badgedIds = new Set<number>(
      guidedFamily
        ? advice!.options.filter((o) => o.genbutsu).map((o) => o.tileId)
        : [],
    );
    const wraps = new Map<number, HTMLElement>();
    tiles.forEach((tile, idx) => {
      const isDrawn =
        display.drawnApart && drawnId !== null && tile.id === drawnId && idx === tiles.length - 1;
      const wrap = tileEl(tile, "t-hand");
      const inner = wrap.firstElementChild as HTMLElement;
      if (size !== 25) {
        inner.style.width = `${size}px`;
        inner.style.height = `${Math.round(size * 1.4)}px`;
      }
      if (isDrawn) wrap.classList.add("drawn-host");
      if (isDrawn) inner.classList.add("drawn");
      if (recId !== null && tile.id === recId) inner.classList.add("coach-rec");
      if (badgedIds.has(tile.id)) inner.append(safetyBadgeEl());
      if (this.selectedTileId === tile.id) inner.classList.add("sel");
      if (this.riichiArmed && pending?.kind === "turn" && pending.ctx.riichiDiscardIds.includes(tile.id)) {
        inner.classList.add("riichi-ok");
      }
      if (this.lesson?.view().highlightRiichi) {
        const stop = this.lesson.scene?.stop;
        if (stop?.kind === "turn" && stop.ctx.riichiDiscardIds.includes(tile.id)) {
          inner.classList.add("riichi-ok");
        }
      }
      if (myTurn || this.lesson?.view().acceptsTiles) {
        tileControl(wrap, `hand-${tile.id}`, tx("ui.app.v-0-1-2-3", `${tileLabel(tile)}${badgedIds.has(tile.id) ? tx("ui.app.safe-against-every-riichi-player", ", safe against every riichi player") : ""}${this.selectedTileId === tile.id ? tx("ui.app.selected-activate-to-discard", ", selected; activate to discard") : tx("ui.app.activate-to-select", "; activate to select")}`, tileLabel(tile), badgedIds.has(tile.id) ? tx("ui.app.safe-against-every-riichi-player", ", safe against every riichi player") : "", this.selectedTileId === tile.id ? tx("ui.app.selected-activate-to-discard", ", selected; activate to discard") : tx("ui.app.activate-to-select", "; activate to select")), () => this.onHandTileTap(tile), this.selectedTileId === tile.id);
      }
      if (this.canShiftTiles()) {
        wrap.addEventListener("pointerdown", (ev) =>
          this.onTilePointerDown(ev, tile, wrap, inner),
        );
      }
      wraps.set(tile.id, wrap);
    });
    if (display.segments && guidedFamily) {
      // Group order with a plain-words label under each group. The
      // segments add no width: every tile keeps its shipped size
      // and margin, so the grouped row spans exactly what the
      // ungrouped row spans.
      for (const segment of display.segments) {
        const seg = h("div", { class: "hseg" });
        const segTiles = h("div", { class: "hseg-tiles" });
        for (const tile of segment.tiles) segTiles.append(wraps.get(tile.id)!);
        seg.append(segTiles, h("div", { class: "hseg-label" }, segment.label));
        row.append(seg);
      }
    } else {
      for (const tile of tiles) row.append(wraps.get(tile.id)!);
    }
    for (const meld of me.melds) row.append(this.meldEl(meld, "t-meld", me.seat));
    return row;
  }

  private onHandTileTap(tile: Tile): void {
    // The release of a grab (or of a swipe that never armed) fires
    // a click on the tile — it is not a tap.
    if (Date.now() < this.suppressHandTapUntil) return;
    if (this.lesson) {
      // Lesson gates read hand tiles directly (§9): a tap is the
      // discard/gate action the current step is waiting for.
      if (this.lesson.view().acceptsTiles) {
        this.lessonAct({ kind: "tile", tileId: tile.id });
      }
      return;
    }
    const pending = this.runner?.pending;
    if (!pending || pending.kind !== "turn" || this.playing) return;
    this.sound.unlock();
    if (this.riichiArmed) {
      if (pending.ctx.riichiDiscardIds.includes(tile.id)) {
        this.humanAct({ type: "discard", tileId: tile.id, riichi: true });
      }
      return;
    }
    if (this.selectedTileId === tile.id) {
      this.humanAct({ type: "discard", tileId: tile.id });
      return;
    }
    this.selectedTileId = tile.id;
    this.renderTable();
  }

  // -- prompts -------------------------------------------------------------------

  private promptRowEl(): HTMLElement {
    if (this.lesson) return this.lessonPanelEl();
    const row = h("div", { class: "promptrow" });
    const pending = this.runner?.pending;
    if (!pending || !this.pendingVisible()) return row;
    const btn = (label: string, cls: string, fn: () => void) => {
      const b = h("button", { class: `cbtn ${cls}` }, label);
      b.addEventListener("click", () => {
        this.sound.unlock();
        fn();
      });
      return b;
    };
    // The coaching moment's one-line hint, inside the prompt row
    // that owns the moment (never on the base table). Tapping it
    // opens the moment sheet; it never blocks or times the decision.
    const momentHint = (): HTMLElement | null => {
      const grade = this.guideMoment();
      if (!grade) return null;
      const b = h("button", { class: "cbtn momenthint", "aria-label": tx("ui.app.why-this-move", "Why this move?") }, grade.advice.headline);
      b.addEventListener("click", () => {
        this.sound.unlock();
        this.openFrame({ kind: "moment" });
      });
      return b;
    };

    if (pending.kind === "call") {
      const ctx = pending.ctx;
      row.classList.add("show");
      if (ctx.canRon) row.append(btn(tx("ui.app.ron", "Ron"), "ron", () => this.humanAct({ type: "ron" })));
      if (ctx.phase === "call" && pending.ponDecidable) {
        if (ctx.canPon) row.append(btn(tx("ui.app.pon", "Pon"), "pon", () => this.humanAct({ type: "pon" })));
        if (ctx.canKan) row.append(btn(tx("ui.app.kan", "Kan"), "pon", () => this.humanAct({ type: "daiminkan" })));
      }
      if (ctx.phase === "call" && pending.chiDecidable) {
        if (ctx.chiOptions.length === 1) {
          row.append(btn(tx("ui.app.chi", "Chi"), "chi", () => this.humanAct({ type: "chi", tileIds: ctx.chiOptions[0]! })));
        } else if (ctx.chiOptions.length > 1) {
          row.append(btn(tx("ui.app.chi", "Chi"), "chi", () => this.openFrame({ kind: "hand", mode: "chi" })));
        }
      }
      row.append(btn(tx("ui.app.pass", "Pass"), "pass", () => this.humanAct({ type: "pass" })));
      const callHint = momentHint();
      if (callHint) row.append(callHint);
      return row;
    }

    // Turn decision.
    const ctx = pending.ctx;
    const kanCount = ctx.ankanOptions.length + ctx.shouminkanOptions.length;
    const selected = this.selectedTileId !== null
      ? tileById(this.selectedTileId)
      : null;
    const selectedRiichi = selected !== null && ctx.riichiDiscardIds.includes(selected.id);

    if (this.riichiArmed) {
      row.classList.add("show");
      row.append(btn(tx("ui.app.riichi", "Riichi"), "riichi", () => {}));
      row.append(btn(tx("ui.app.cancel", "Cancel"), "pass", () => {
        this.riichiArmed = false;
        this.renderTable();
      }));
      // The declaration deducts the 1,000-point stake the moment the
      // discard lands; the armed confirmation row states the cost
      // before the player commits (panel rebuild finding, TU-11).
      row.append(
        h("span", { class: "pill" }, tx("ui.app.costs-1-000-points-paid-as-a-stake", "Costs 1,000 points — paid as a stake")),
      );
      return row;
    }
    if (ctx.canTsumo) {
      row.classList.add("show");
      row.append(btn(tx("ui.app.tsumo", "Tsumo"), "tsumo", () => this.humanAct({ type: "tsumo" })));
    }
    if (selectedRiichi) {
      row.classList.add("show");
      row.append(btn(tx("ui.app.riichi", "Riichi"), "riichi", () =>
        this.humanAct({ type: "discard", tileId: selected!.id, riichi: true }),
      ));
      // Same stake statement as the armed row: this button declares
      // immediately, so the cost stands next to it before the tap.
      row.append(
        h("span", { class: "pill" }, tx("ui.app.costs-1-000-points-paid-as-a-stake", "Costs 1,000 points — paid as a stake")),
      );
    } else if (ctx.riichiDiscardIds.length > 0 && !this.riichiDismissed && !selected) {
      row.classList.add("show");
      row.append(btn(tx("ui.app.riichi", "Riichi"), "riichi", () => {
        this.riichiArmed = true;
        this.renderTable();
      }));
      row.append(btn(tx("ui.app.pass", "Pass"), "pass", () => {
        this.riichiDismissed = true;
        this.renderTable();
      }));
    }
    if (kanCount === 1) {
      row.classList.add("show");
      const action: TurnAction =
        ctx.ankanOptions.length === 1
          ? { type: "ankan", tileType: ctx.ankanOptions[0]! }
          : { type: "shouminkan", tileType: ctx.shouminkanOptions[0]! };
      row.append(btn(tx("ui.app.kan", "Kan"), "pon", () => this.humanAct(action)));
    } else if (kanCount > 1) {
      row.classList.add("show");
      row.append(btn(tx("ui.app.kan", "Kan"), "pon", () => this.openFrame({ kind: "hand", mode: "kan" })));
    }
    if (ctx.canKyuushu) {
      row.classList.add("show");
      row.append(btn(tx("ui.app.kyuushu", "Kyuushu"), "pass", () => this.humanAct({ type: "kyuushu" })));
      row.append(
        h("span", { class: "pill" }, tx("ui.app.end-the-hand-as-a-draw-nine-different-terminals", "End the hand as a draw — nine different terminals or honors on your first draw")),
      );
    }
    const turnHint = momentHint();
    if (turnHint) {
      row.classList.add("show");
      row.append(turnHint);
    }
    return row;
  }

  // -- focus frames ---------------------------------------------------------------

  private openFrame(frame: NonNullable<FrameState>): void {
    this.frameReturnFocus = (document.activeElement as HTMLElement | null)?.dataset["controlKey"];
    this.frame = frame;
    this.frameChangedTiles.clear();
    markFocusFrameTaught();
    this.tableEl.querySelector(".hint")?.remove();
    this.renderTable();
  }

  private closeFrame(): void {
    const changed = this.frameChangedTiles;
    this.frame = null;
    this.frameChangedTiles = new Set();
    this.renderTable();
    focusByKey(this.frameReturnFocus);
    // Tiles that changed while zoomed pulse briefly on the table (§8).
    for (const id of changed) {
      const el = this.tableEl.querySelector(`[data-flip="tile-${id}"] .tile`);
      el?.classList.add("pulse");
    }
  }

  private frameEl(): HTMLElement {
    const frame = this.frame!;
    if (frame.kind === "hand") return this.handSheetEl(frame.mode);
    if (frame.kind === "guide") return this.guideSheetEl();
    if (frame.kind === "moment") return this.momentSheetEl();
    if (frame.kind === "center") return this.centerFrameEl();
    return this.playerFrameEl(frame.seat);
  }

  private frameShell(title: string, sub: string): { frame: HTMLElement; head: HTMLElement } {
    const frame = h("div", { class: "frame" });
    const head = h("div", { class: "fhead" });
    const left = h("div", {});
    left.append(h("div", { class: "ftitle" }, title), h("div", { class: "fsub" }, sub));
    const close = h("button", { class: "fclose", "aria-label": tx("ui.app.close", "Close") });
    close.innerHTML = ICON_CLOSE;
    close.addEventListener("click", () => this.closeFrame());
    head.append(left, close);
    frame.append(head);
    return { frame, head };
  }

  private playerFrameEl(seat: Seat): HTMLElement {
    const m = this.model;
    const p = m.players[seat]!;
    const title = tx("ui.app.v-0-1", `${WIND_NAMES[p.seatWind]}${seat === this.humanSeat ? " " + tx("ui.app.you", "· You") : ""}`, WIND_NAMES[p.seatWind], seat === this.humanSeat ? " " + tx("ui.app.you", "· You") : "");
    const { frame } = this.frameShell(
      title,
      tx("ui.app.v-0-points-1", `${fmt(p.score)} points${p.isDealer ? " " + tx("ui.app.dealer", "· Dealer") : ""}`, fmt(p.score), p.isDealer ? " " + tx("ui.app.dealer", "· Dealer") : ""),
    );
    if (p.riichi) {
      frame.querySelector(".ftitle")!.append(h("span", { class: "pill" }, p.doubleRiichi ? tx("ui.app.double-riichi", "Double Riichi") : tx("ui.app.riichi", "Riichi")));
    }
    frame.append(h("div", { class: "fsec" }, tx("ui.app.discards", "DISCARDS")));
    const fpond = h("div", { class: "fpond" });
    const entries = p.pond.filter((e) => !e.called);
    entries.forEach((e, i) => {
      const cell = h("span", { class: `cell ${e.tsumogiri ? "tg" : ""}` });
      if (e.riichiDeclaration) cell.classList.add("riichi");
      if (i === entries.length - 1) cell.classList.add("latest");
      cell.append(tileEl(e.tile, "", { flip: false, index: true }));
      fpond.append(cell);
    });
    if (entries.length === 0) fpond.append(h("span", { class: "fsub" }, tx("ui.app.no-discards-yet", "No discards yet")));
    frame.append(fpond);
    const legend = h("div", { class: "legend" });
    const li1 = h("span", { class: "li" });
    li1.append(h("span", { class: "swatch dim" }), document.createTextNode(tx("ui.app.drawn-discard-tsumogiri", "Drawn discard (tsumogiri)")));
    const li2 = h("span", { class: "li" });
    li2.append(h("span", { class: "swatch" }), document.createTextNode(tx("ui.app.hand-discard-tedashi", "Hand discard (tedashi)")));
    legend.append(li1, li2);
    frame.append(legend);

    frame.append(h("div", { class: "fsec" }, tx("ui.app.melds", "MELDS")));
    if (p.melds.length === 0) {
      frame.append(h("div", { class: "fsub" }, tx("ui.app.none-closed-hand", "None — closed hand")));
    } else {
      const row = h("div", { class: "fmelds" });
      for (const meld of p.melds) {
        const meldNode = this.meldEl(meld, "fmeld", seat);
        // A Focus Frame is an inspect surface: corner indices ride
        // its magnified faces (the board's melds never carry them).
        const inners = meldNode.querySelectorAll(".tile");
        meld.tiles.forEach((t, i) => {
          const index = tileIndexEl(t);
          if (index && inners[i]) inners[i]!.append(index);
        });
        row.append(meldNode);
      }
      frame.append(row);
    }

    frame.append(h("div", { class: "fsec" }, tx("ui.app.your-hand", "YOUR HAND")));
    const anchor = h("div", { class: "anchor" });
    const { tiles } = this.handDisplayTiles();
    for (const tile of tiles) anchor.append(tileEl(tile, "t-meld", { flip: false, index: true }));
    frame.append(anchor);

    if (this.runner?.pending?.kind === "turn" && !this.playing) {
      frame.append(h("div", { class: "turnbanner" }, tx("ui.app.your-turn-close-this-view-to-play", "Your turn — close this view to play.")));
    }
    return frame;
  }

  private centerFrameEl(): HTMLElement {
    const m = this.model;
    const { frame } = this.frameShell(
      tx("ui.app.round", "Round"),
      tx("ui.app.v-0-honba-wall-1-2-riichi-stick-3-on-the-table", `${m.honba} honba · Wall ${m.wallRemaining} · ${m.sticks} riichi stick${m.sticks === 1 ? "" : "s"} on the table`, m.honba, m.wallRemaining, m.sticks, m.sticks === 1 ? "" : "s"),
    );
    const crow = h("div", { class: "crow" });
    crow.append(
      h("span", { class: "wind kj" }, WIND_KANJI[m.roundWind]!),
      h("span", { class: "rname" }, tx("ui.app.v-0-1-3", `${WIND_NAMES[m.roundWind]} ${m.kyoku}`, WIND_NAMES[m.roundWind], m.kyoku)),
    );
    frame.append(crow);
    frame.append(h("div", { class: "fsec" }, tx("ui.app.dora-indicator-shows-dora", "DORA — INDICATOR SHOWS DORA")));
    const doraTypes = m.doraTypes();
    m.doraIndicators.forEach((ind, i) => {
      const row = h("div", { class: "dpair" });
      const doraTile = tileById(doraTypes[i]! * 4 + 1);
      row.append(
        tileEl(ind, "ind", { flip: false, index: true }),
        h("span", { class: "arr" }, "→"),
        tileEl(doraTile, "dor", { flip: false, index: true }),
        h("span", { class: "dlab" }, tileLabel(doraTile)),
      );
      frame.append(row);
    });
    frame.append(h("div", { class: "fsec" }, tx("ui.app.scores", "SCORES")));
    for (let rel = 0; rel < 4; rel++) {
      const seat = this.seatAt(rel);
      const p = m.players[seat]!;
      const row = h("div", { class: "scorerow" });
      const who = h("span", { class: "who" });
      who.append(
        h("b", {}, WIND_NAMES[p.seatWind]!),
        document.createTextNode(
          tx("ui.app.v-0-1-2-3", `${seat === this.humanSeat ? " " + tx("ui.app.you", "· You") : ""}${p.isDealer ? " " + tx("ui.app.dealer", "· Dealer") : ""}${p.riichi ? " " + tx("ui.app.riichi-2", "· Riichi") : ""}`, seat === this.humanSeat ? " " + tx("ui.app.you", "· You") : "", p.isDealer ? " " + tx("ui.app.dealer", "· Dealer") : "", p.riichi ? " " + tx("ui.app.riichi-2", "· Riichi") : ""),
        ),
      );
      row.append(who, h("span", {}, fmt(p.score)));
      frame.append(row);
    }
    if (this.runner?.pending?.kind === "turn" && !this.playing) {
      frame.append(h("div", { class: "turnbanner" }, tx("ui.app.your-turn-close-this-view-to-play", "Your turn — close this view to play.")));
    }
    return frame;
  }

  /**
   * The explanation sheet behind a coaching moment's prompt-row
   * hint: the same xsheet grammar as the discard sheet — the moment
   * in plain words (every term defined at first use), the coach's
   * read, and the facts it rests on. Text is shared with Review
   * (moment-text.ts) so a moment reads identically live and
   * post-game. Like the guide sheet it is a Focus Frame: the
   * pending decision waits untouched behind it.
   */
  private momentSheetEl(): HTMLElement {
    const sheet = h("div", { class: "sheet xsheet" });
    const pending = this.runner?.pending;
    const grade = this.guideMoment();
    const { frame: headShell } = this.frameShell(tx("ui.app.guided-hint", "Guided hint"), "");
    headShell.querySelector(".fsub")?.remove();
    sheet.append(...headShell.childNodes);
    sheet.firstElementChild!.classList.remove("frame");
    if (!grade || !pending) return sheet;
    const text: MomentText = momentTexts([grade], { kind: pending.kind, view: pending.view, action: null })[0]!;
    const sec = (label: string) => sheet.append(h("div", { class: "fsec" }, label));
    const body = (line: string) => sheet.append(h("p", { class: "xbody" }, line));
    sec(tx("ui.app.the-moment", "The moment"));
    for (const term of text.terms) body(term);
    sec(tx("ui.app.the-read", "The read"));
    body(text.headline);
    sec(tx("ui.app.the-facts", "The facts"));
    for (const fact of text.facts) body(fact);
    return sheet;
  }

  /**
   * The explanation sheet behind the guided hint (rendering C):
   * the coach's recommendation in plain beginner language — the
   * goal for this hand right now, the move, why this tile, and
   * what the player is waiting for. Every line is template-rendered
   * from the same adviseDiscard facts the headline uses; no new
   * evaluator, no free text. The sheet is a Focus Frame: it pauses
   * nothing and the pending decision waits untouched behind it.
   */
  private guideSheetEl(): HTMLElement {
    const sheet = h("div", { class: "sheet xsheet" });
    const pending = this.runner?.pending;
    const advice = this.guideAdvice();
    const { frame: headShell } = this.frameShell(tx("ui.app.guided-hint", "Guided hint"), "");
    headShell.querySelector(".fsub")?.remove(); // rendering C: no sub line
    sheet.append(...headShell.childNodes);
    sheet.firstElementChild!.classList.remove("frame");
    if (!advice || !pending || pending.kind !== "turn") return sheet;

    const view = pending.view;
    const ctx = pending.ctx;
    const rec = advice.recommendation;
    const sec = (label: string) => sheet.append(h("div", { class: "fsec" }, label));
    const body = (text: string) => sheet.append(h("p", { class: "xbody" }, text));
    const display = (name: string) =>
      name.replace(/ of (characters|dots|bamboo)$/, (m) => ` of ${m[4]!.toUpperCase()}${m.slice(5)}`);
    const recName = display(rec.tileName);
    const numWord = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight"];

    // The goal for this hand right now.
    sec(tx("ui.app.the-goal", "The goal"));
    if (advice.canTsumo) {
      body(tx("ui.app.you-are-holding-a-finished-hand-four-groups-of-t", "You are holding a finished hand — four groups of three tiles, plus one pair. Declare the win."));
    } else if (rec.shantenAfter === 0) {
      // The composition sentence names the hand's own groups when a
      // plain decomposition leaves exactly one group open (the
      // rendering's scene); exotic shapes keep the general sentence.
      const work = countsOfTiles(view.hand);
      work[rec.tileType]!--;
      let sets = view.melds.length;
      let triplets = 0;
      let runs = 0;
      for (let t = 0; t < 34; t++) {
        while (work[t]! >= 3) { work[t]! -= 3; triplets++; sets++; }
      }
      for (let t = 0; t < 25; t++) {
        if ((t % 9) > 6) continue;
        while (work[t]! > 0 && work[t + 1]! > 0 && work[t + 2]! > 0) {
          work[t]!--; work[t + 1]!--; work[t + 2]!--; runs++; sets++;
        }
      }
      let pair = false;
      for (let t = 0; t < 34; t++) {
        if (work[t] === 2) { work[t]! -= 2; pair = true; break; }
      }
      const remainder = work.reduce((a, b) => a + b, 0);
      let composition = "";
      if (sets === 3 && pair && remainder === 2) {
        const parts = ["the pair"];
        if (triplets > 0) parts.push(tx("ui.app.v-0-triplet-1", `${numWord[triplets] ?? triplets} triplet${triplets > 1 ? "s" : ""}`, numWord[triplets] ?? triplets, triplets > 1 ? "s" : ""));
        if (runs > 0) parts.push(tx("ui.app.v-0-run-1", `${numWord[runs] ?? runs} run${runs > 1 ? "s" : ""}`, numWord[runs] ?? runs, runs > 1 ? "s" : ""));
        const list = parts.length > 1
          ? tx("ui.app.v-0-and-1", `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`, parts.slice(0, -1).join(", "), parts[parts.length - 1])
          : parts[0]!;
        composition = " " + tx("ui.app.you-have-0-one-group-is-still-open", `You have ${list}; one group is still open.`, list);
      }
      body(
        tx("ui.app.you-are-one-tile-from-a-finished-hand-four-group", `You are one tile from a finished hand: four groups of three tiles — three in a row, or three of a kind — plus one pair.${composition} One tile from finished is called ready.`, composition),
      );
    } else if (rec.shantenAfter === 1) {
      body(
        tx("ui.app.you-are-building-toward-a-finished-hand-four-gro", "You are building toward a finished hand: four groups of three tiles — three in a row, or three of a kind — plus one pair. This move leaves the hand one good draw away from ready — one tile from finished."),
      );
    } else {
      body(
        tx("ui.app.you-are-building-toward-a-finished-hand-four-gro-2", `You are building toward a finished hand: four groups of three tiles — three in a row, or three of a kind — plus one pair. This move leaves the hand ${rec.shantenAfter} steps away from ready.`, rec.shantenAfter),
      );
    }

    // The move: the tile's face beside its name and the plain order.
    sec(tx("ui.app.the-move", "The move"));
    const recTile = tileById(rec.tileId);
    const moveRow = h("div", { class: "xmove" });
    if (recTile) moveRow.append(tileEl(recTile, "", { flip: false, index: true }));
    const drawn = ctx.drawnTile !== null && ctx.drawnTile.id === rec.tileId;
    const tenpaiDiscards = evaluateDiscards(view, ctx).filter(
      (c) => c.shantenAfter === rec.shantenAfter,
    ).length;
    const moveFacts: string[] = [];
    if (advice.riichi?.recommended && advice.riichi.tileId === rec.tileId) {
      moveFacts.push(tx("ui.app.discard-it-and-declare-riichi", "Discard it and declare riichi."));
    } else {
      moveFacts.push(tx("ui.app.discard-it", "Discard it."));
    }
    if (drawn) moveFacts.push(tx("ui.app.you-just-drew-this-tile", "You just drew this tile,"));
    if (rec.shantenAfter === 0 && tenpaiDiscards === 1) {
      moveFacts.push(
        drawn
          ? tx("ui.app.and-it-is-the-only-discard-that-leaves-the-hand", "and it is the only discard that leaves the hand ready.")
          : tx("ui.app.it-is-the-only-discard-that-leaves-the-hand-read", "It is the only discard that leaves the hand ready."),
      );
    } else if (rec.shantenAfter === 0) {
      moveFacts.push(
        drawn ? tx("ui.app.and-the-hand-is-ready-after-it", "and the hand is ready after it.") : tx("ui.app.the-hand-is-ready-after-it", "The hand is ready after it."),
      );
    }
    const moveText = h("div", {},
      h("div", { class: "mname" }, recName),
      h("div", { class: "msub" }, moveFacts.join(" ")),
    );
    moveRow.append(moveText);
    sheet.append(moveRow);

    // Why this tile.
    sec(tx("ui.app.why-this-tile", "Why this tile"));
    const counts = countsOfTiles(view.hand);
    const type = rec.tileType;
    const inHand = counts[type] ?? 0;
    const suited = type < 27;
    const rank = suited ? (type % 9) + 1 : 0;
    const base = suited ? Math.floor(type / 9) * 9 : 0;
    const near = (r: number) => r >= 1 && r <= 9 && (counts[base + r - 1] ?? 0) > 0;
    const neighbours = suited && (near(rank - 2) || near(rank - 1) || near(rank + 1) || near(rank + 2));
    if (inHand === 1 && !neighbours) {
      const suitName = recName.split(" of ")[1] ?? "";
      const partners = [rank - 2, rank - 1, rank + 1, rank + 2].filter((r) => r >= 1 && r <= 9);
      const partnerList = partners.length > 1
        ? tx("ui.app.v-0-or-1", `${partners.slice(0, -1).join(", ")} or ${partners[partners.length - 1]}`, partners.slice(0, -1).join(", "), partners[partners.length - 1])
        : tx("ui.app.v-0", `${partners[0] ?? ""}`, partners[0] ?? "");
      const isolated = suited
        ? tx("ui.app.the-0-connects-to-nothing-no-second-copy-to-pair", `The ${recName} connects to nothing — no second copy to pair with, no ${partnerList} of ${suitName} to make a run.`, recName, partnerList, suitName)
        : tx("ui.app.the-0-connects-to-nothing-no-second-copy-to-pair-2", `The ${recName} connects to nothing — no second copy to pair with.`, recName);
      body(
        rec.shantenAfter === 0 && tenpaiDiscards === 1
          ? tx("ui.app.v-0-every-other-tile-is-part-of-a-group-or-your-pa", `${isolated} Every other tile is part of a group or your pair — discard one, its group breaks, and the hand is no longer ready.`, isolated)
          : isolated,
      );
    } else if (rec.improvingTotal > 0) {
      body(
        tx("ui.app.v-0-unseen-tiles-improve-the-hand-after-this-disca", `${rec.improvingTotal} unseen tiles improve the hand after this discard — the most of any discard.`, rec.improvingTotal),
      );
    } else {
      body(tx("ui.app.it-leaves-the-hand-as-close-to-ready-as-any-disc", "It leaves the hand as close to ready as any discard can."));
    }
    if (rec.doraDiscarded > 0) {
      body(tx("ui.app.it-throws-away-a-dora-but-the-shape-it-leaves-is", "It throws away a dora, but the shape it leaves is worth more."));
    }
    if (rec.genbutsu) {
      body(tx("ui.app.every-riichi-opponent-has-already-discarded-it-s", "Every riichi opponent has already discarded it, so none of them can win off it."));
    } else if (rec.reasons.includes("safe-vs-riichi")) {
      body(tx("ui.app.no-riichi-opponent-can-win-off-it", "No riichi opponent can win off it."));
    }
    if (rec.reasons.includes("dangerous-vs-riichi")) {
      body(tx("ui.app.a-riichi-opponent-could-win-off-it-it-is-still-t", "A riichi opponent could win off it — it is still the best move toward winning."));
    }
    if (rec.furiten) {
      body(tx("ui.app.one-catch-a-tile-the-hand-waits-on-is-in-your-ow", "One catch: a tile the hand waits on is in your own discards, so you can only win by drawing it yourself."));
    }
    // The value paragraph: why a ready hand stays quiet, or why
    // riichi is worth declaring — dora named from the indicators.
    const closed = view.melds.every((m) => m.kind === "ankan");
    if (!view.players[view.seat]!.riichi && closed && rec.shantenAfter === 0) {
      const doraWeights = doraWeightsOf(view);
      let dora = 0;
      const groups = new Map<string, number>();
      const tally = (t: Tile, red: boolean) => {
        const w = (doraWeights.get(t.type) ?? 0) + (red ? 1 : 0);
        if (w === 0) return;
        dora += w;
        const key = red && (doraWeights.get(t.type) ?? 0) === 0
          ? `red:${t.type}`
          : `ind:${t.type}`;
        groups.set(key, (groups.get(key) ?? 0) + w);
      };
      for (const t of view.hand) if (t.id !== rec.tileId) tally(t, t.red);
      for (const m of view.melds) for (const t of m.tiles) tally(t, t.red);
      if (advice.riichi?.recommended && advice.riichi.tileId === rec.tileId) {
        body(tx("ui.app.riichi-an-optional-declaration-made-when-your-ha", "Riichi — an optional declaration made when your hand is ready — raises the score here. Declaring it costs 1,000 points, paid as a stake at once. It also locks your hand to discarding only what you draw."));
      } else if (dora >= 2) {
        // The approved paragraph (rendering C, final): riichi and
        // dora defined at first use, the dora named group by group
        // (indicator groups first, red fives last), then the
        // indicator itself defined where it is named.
        const parts: string[] = [];
        for (const wantKind of ["ind", "red"]) {
          for (const [key, c] of groups) {
            const [kind, tStr] = key.split(":");
            if (kind !== wantKind) continue;
            const t = Number(tStr) as TileType;
            const name = display(tileName(t));
            if (kind === "red") {
              parts.push(parts.length === 0 ? tx("ui.app.one-is-the-red-0", `one is the red ${name}`, name) : tx("ui.app.one-the-red-0", `one the red ${name}`, name));
            } else {
              parts.push(c === 1 ? tx("ui.app.one-is-the-0", `one is the ${name}`, name) : tx("ui.app.v-0-are-1", `${numWord[c] ?? c} are ${name}`, numWord[c] ?? c, name));
            }
          }
        }
        const partsSentence = parts.length > 0
          ? tx("ui.app.v-0-1", `${parts.join(", ")[0]!.toUpperCase()}${parts.join(", ").slice(1)}`, parts.join(", ")[0]!.toUpperCase(), parts.join(", ").slice(1))
          : "";
        const indSentences: string[] = [];
        const seenInd = new Set<TileType>();
        for (const [key] of groups) {
          const [kind, tStr] = key.split(":");
          if (kind !== "ind") continue;
          const t = Number(tStr) as TileType;
          const ind = view.doraIndicators.find((i) => doraFromIndicator(i.type) === t);
          if (!ind || seenInd.has(ind.type)) continue;
          seenInd.add(ind.type);
          indSentences.push(
            tx("ui.app.the-face-up-tile-in-the-middle-of-the-table-the", `The face-up tile in the middle of the table, the indicator, is the ${display(tileName(ind.type))}; the tile one step above is a dora.`, display(tileName(ind.type))),
          );
        }
        body(
          tx("ui.app.already-valuable-the-hand-needs-no-riichi-an-opt", `Already valuable, the hand needs no riichi — an optional declaration made when your hand is ready — with ${numWord[dora] ?? dora} dora — bonus tiles worth extra score.${partsSentence ? " " + tx("ui.app.v-0-5", `${partsSentence}.`, partsSentence) : ""}${indSentences.length ? ` ${indSentences.join(" ")}` : ""} Riichi can raise the score, but declaring it costs 1,000 points, and it locks your hand to discarding only what you draw.`, numWord[dora] ?? dora, partsSentence ? " " + tx("ui.app.v-0-5", `${partsSentence}.`, partsSentence) : "", indSentences.length ? ` ${indSentences.join(" ")}` : ""),
        );
      }
    }

    // What the player is waiting for (ready hands).
    if (rec.shantenAfter === 0 && rec.waits.length > 0) {
      sec(tx("ui.app.what-youre-waiting-for", "What you're waiting for"));
      const words = ["", "One", "Two", "Three", "Four"];
      body(
        tx("ui.app.v-0-1-the-hand-their-other-copies-are-unseen-in-th", `${words[rec.waits.length] ?? rec.waits.length} ${rec.waits.length === 1 ? tx("ui.app.tile-finishes", "tile finishes") : tx("ui.app.tiles-finish", "tiles finish")} the hand. Their other copies are unseen — in the wall — the pile of tiles everyone draws from — or in another player's hand.`, words[rec.waits.length] ?? rec.waits.length, rec.waits.length === 1 ? tx("ui.app.tile-finishes", "tile finishes") : tx("ui.app.tiles-finish", "tiles finish")),
      );
      const after = counts.slice();
      after[type] = (after[type] ?? 0) - 1;
      for (const w of rec.waits) {
        const row = h("div", { class: "xwait" });
        row.append(tileEl({ id: -1, type: w.type, red: false }, "", { flip: false, index: true }));
        const held = after[w.type] ?? 0;
        let fact: string;
        if (suitedWaitRun(after, w.type)) {
          // Name the run the wait actually completes: the first
          // start (lowest first, as the inspect readout reads runs)
          // whose other two tiles are in hand.
          const r = (w.type % 9) + 1;
          const baseW = Math.floor(w.type / 9) * 9;
          const has = (rr: number) => rr >= 1 && rr <= 9 && (after[baseW + rr - 1] ?? 0) > 0;
          let start = r;
          for (const s of [r - 2, r - 1, r]) {
            if (s < 1 || s + 2 > 9) continue;
            if ([s, s + 1, s + 2].every((rr) => rr === r || has(rr))) { start = s; break; }
          }
          fact = tx("ui.app.completes-the-0-1-2-run-3-4-still-unseen", `Completes the ${start}, ${start + 1}, ${start + 2} run · ${w.live} ${w.live === 1 ? "copy" : "copies"} still unseen.`, start, start + 1, start + 2, w.live, w.live === 1 ? "copy" : "copies");
        } else if (held >= 2) {
          fact = tx("ui.app.completes-three-of-a-kind-0-1-still-unseen", `Completes three of a kind · ${w.live} ${w.live === 1 ? "copy" : "copies"} still unseen.`, w.live, w.live === 1 ? "copy" : "copies");
        } else if (held === 1) {
          fact = tx("ui.app.completes-your-pair-0-1-still-unseen", `Completes your pair · ${w.live} ${w.live === 1 ? "copy" : "copies"} still unseen.`, w.live, w.live === 1 ? "copy" : "copies");
        } else {
          fact = tx("ui.app.v-0-1-still-unseen", `${w.live} ${w.live === 1 ? "copy" : "copies"} still unseen.`, w.live, w.live === 1 ? "copy" : "copies");
        }
        row.append(h("div", {},
          h("div", { class: "wname" }, display(w.name)),
          h("div", { class: "wfact" }, fact),
        ));
        sheet.append(row);
      }
      body(tx("ui.app.draw-one-or-claim-one-an-opponent-discards-with", "Draw one, or claim one an opponent discards with the Ron button, and the hand is complete."));
    }
    return sheet;
  }

  private handSheetEl(mode: "inspect" | "chi" | "kan"): HTMLElement {
    const sheet = h("div", { class: "sheet" });
    const pending = this.runner?.pending;
    const { tiles, drawnId } = this.handDisplayTiles();
    const selected = this.selectedTileId !== null ? tileById(this.selectedTileId) : null;

    if (selected && mode === "inspect") {
      const preview = h("div", { class: "selpreview" });
      preview.append(tileEl(selected, "", { flip: false, index: true }));
      const readout = h("div", { class: "readout" });
      // The approved readout (rendering B): the plain name first,
      // then the tile's facts — each line only when it is true of
      // this position. Legacy replays keep the plain label: current
      // facts must not be attributed to historical rules.
      const view = pending?.view;
      if (view && this.runner?.replayVersion !== 1) {
        let recommendedTileId = this.guideAdvice()?.recommendation.tileId ?? null;
        if (recommendedTileId === null && pending?.kind === "turn" && !this.lesson) {
          // The waits rule names the coach-recommended discard
          // whether or not guided mode is on; the inspect sheet is
          // the player's own invoked surface.
          recommendedTileId = adviseDiscard(pending.view, pending.ctx).recommendation.tileId;
        }
        const info = tileInfo(view, selected, {
          drawnTile: pending?.kind === "turn" ? pending.ctx.drawnTile : null,
          recommendedTileId,
        });
        readout.append(h("div", { class: "tname" }, info.name));
        for (const line of info.lines) readout.append(h("div", { class: "iline" }, line));
        if (info.waitsLine) readout.append(h("div", { class: "iline waits" }, info.waitsLine));
      } else {
        readout.append(h("div", { class: "tname" }, tileLabel(selected)));
      }
      preview.append(readout);
      sheet.append(preview);
    } else {
      const { frame: headShell } = this.frameShell(
        mode === "chi" ? tx("ui.app.choose-a-chi", "Choose a chi") : mode === "kan" ? tx("ui.app.declare-a-kan", "Declare a kan") : tx("ui.app.your-hand-2", "Your hand"),
        mode === "inspect" ? tx("ui.app.tap-a-tile-to-select-it-everything-here-is-playa", "Tap a tile to select it. Everything here is playable.") : tx("ui.app.pick-one-it-happens-right-away", "Pick one — it happens right away."),
      );
      sheet.append(...headShell.childNodes);
      // frameShell builds a .frame; reuse only its header row.
      sheet.firstElementChild!.classList.remove("frame");
    }

    const grid = h("div", { class: "hgrid" });
    tiles.forEach((tile) => {
      const cell = h("span", { class: "cell" });
      if (drawnId === tile.id) cell.classList.add("drawn");
      if (this.selectedTileId === tile.id) cell.classList.add("sel");
      cell.append(tileEl(tile, "", { flip: false, index: true }));
      tileControl(cell, `inspect-${tile.id}`, tileLabel(tile), () => {
        this.sound.unlock();
        this.selectedTileId = tile.id;
        if (this.frame?.kind === "hand") this.renderTable();
      }, this.selectedTileId === tile.id);
      grid.append(cell);
    });
    sheet.append(grid);

    const act = h("div", { class: "hact" });
    const hbtn = (label: string, cls: string, fn: () => void) => {
      const b = h("button", { class: `hbtn ${cls}` }, label);
      b.addEventListener("click", () => {
        this.sound.unlock();
        fn();
      });
      return b;
    };
    if (mode === "chi" && pending?.kind === "call") {
      for (const option of pending.ctx.chiOptions) {
        // The option as tile faces, not a text label (issue #35):
        // the resulting set, called tile sideways.
        const faces = chiOptionFaces(
          pending.ctx.tile,
          option.map((id) => tileById(id)),
        );
        const b = h("button", {
          class: "hbtn primary",
          "aria-label": tx("ui.app.chi-0", `Chi — ${faces.map((f) => tileLabel(f.tile)).join(", ")}`, faces.map((f) => tileLabel(f.tile)).join(", ")),
        });
        b.append(h("span", {}, tx("ui.app.chi", "Chi")), chiFacesEl(faces));
        b.addEventListener("click", () => {
          this.sound.unlock();
          this.closeFrame();
          this.humanAct({ type: "chi", tileIds: option });
        });
        act.append(b);
      }
    } else if (mode === "kan" && pending?.kind === "turn") {
      for (const t of pending.ctx.ankanOptions) {
        act.append(hbtn(tx("ui.app.kan-0-closed", `Kan ${tileTypeName(t)} (closed)`, tileTypeName(t)), "primary", () => {
          this.closeFrame();
          this.humanAct({ type: "ankan", tileType: t });
        }));
      }
      for (const t of pending.ctx.shouminkanOptions) {
        act.append(hbtn(tx("ui.app.kan-0-added", `Kan ${tileTypeName(t)} (added)`, tileTypeName(t)), "primary", () => {
          this.closeFrame();
          this.humanAct({ type: "shouminkan", tileType: t });
        }));
      }
    } else if (pending?.kind === "turn" && !this.playing) {
      const ctx = pending.ctx;
      if (selected && ctx.riichiDiscardIds.includes(selected.id)) {
        act.append(hbtn(tx("ui.app.riichi-discard", "Riichi + discard"), "decisive", () => {
          this.closeFrame();
          this.humanAct({ type: "discard", tileId: selected.id, riichi: true });
        }));
      }
      if (selected) {
        act.append(hbtn(tx("ui.app.discard", "Discard"), "primary", () => {
          this.closeFrame();
          this.humanAct({ type: "discard", tileId: selected.id });
        }));
      }
      if (ctx.canTsumo) {
        act.append(hbtn(tx("ui.app.tsumo", "Tsumo"), "decisive", () => {
          this.closeFrame();
          this.humanAct({ type: "tsumo" });
        }));
      }
      if (ctx.ankanOptions.length + ctx.shouminkanOptions.length > 0) {
        act.append(hbtn(tx("ui.app.kan-2", "Kan…"), "", () => {
          this.frame = { kind: "hand", mode: "kan" };
          this.renderTable();
        }));
      }
      if (ctx.canKyuushu) {
        act.append(hbtn(tx("ui.app.kyuushu", "Kyuushu"), "", () => {
          this.closeFrame();
          this.humanAct({ type: "kyuushu" });
        }));
      }
    } else if (pending?.kind === "call" && !this.playing) {
      const ctx = pending.ctx;
      if (ctx.canRon) act.append(hbtn(tx("ui.app.ron", "Ron"), "decisive", () => {
        this.closeFrame();
        this.humanAct({ type: "ron" });
      }));
      if (ctx.phase === "call" && pending.ponDecidable && ctx.canPon) act.append(hbtn(tx("ui.app.pon", "Pon"), "primary", () => {
        this.closeFrame();
        this.humanAct({ type: "pon" });
      }));
      if (ctx.phase === "call" && pending.chiDecidable && ctx.chiOptions.length > 0) {
        act.append(hbtn(tx("ui.app.chi-2", "Chi…"), "primary", () => {
          this.frame = { kind: "hand", mode: "chi" };
          this.renderTable();
        }));
      }
      act.append(hbtn(tx("ui.app.pass", "Pass"), "", () => {
        this.closeFrame();
        this.humanAct({ type: "pass" });
      }));
    }
    if (act.childNodes.length > 0) sheet.append(act);
    return sheet;
  }

  // -- tutorial (slice-2 brief §9) ------------------------------------------

  private learningTile(tile: Tile): HTMLElement {
    return tileEl(tile, "", { flip: false }).firstElementChild as HTMLElement;
  }

  private renderPractice(): void {
    const screen = this.screens.get("practice")!;
    screen.replaceChildren(createPracticeView({
      progress: this.practice,
      persistLocally: false,
      sessionKey: this.learningCacheKey("openmahjong.practice-session.v1"),
      ...(this.practiceInitialSkill ? { initialSkill: this.practiceInitialSkill } : {}),
      renderTile: (type) => this.learningTile(tileById(type * 4 + 1)),
      onChangeProgress: (progress) => { this.practice = mergePracticeProgress(this.practice, progress); this.saveLearningCache(PRACTICE_STORAGE_KEY, this.practice); this.queueAccountSettings(); },
      renderSupplement: () => this.savedReviewSupplement(),
      onBack: () => this.showScreen("learn"),
      ...((this.reviewData || this.reviewCollection.items.length) ? { onReview: () => {
        if (this.reviewData) this.showScreen("review");
        else void this.openSavedReview(this.reviewCollection.items[0]!.recordId, this.reviewCollection.items[0]!.decisionIndex);
      } } : {}),
    }));
  }

  private savedReviewSupplement(): HTMLElement | null {
    if (!this.reviewCollection.items.length) return null;
    const details = h("details", { class: "saved-reviews" });
    details.append(h("summary", {}, tx("ui.app.saved-decisions-0", `Saved decisions (${this.reviewCollection.items.length})`, this.reviewCollection.items.length)));
    for (const item of this.reviewCollection.items) {
      const button = h("button", { class: "primary" }, tx("ui.app.return-to-decision-0", `Return to decision ${item.decisionIndex + 1}`, item.decisionIndex + 1));
      button.addEventListener("click", () => void this.openSavedReview(item.recordId, item.decisionIndex));
      details.append(button);
    }
    return details;
  }

  private openReview(): void {
    if (!this.runner) return;
    try { this.reviewTimeline = buildBoardReview(this.runner.serialize()); this.reviewData = this.reviewTimeline.data.review; }
    catch { return; }
    this.reviewRecordId = this.runner.id;
    this.reviewResumeDecision = undefined;
    this.reviewHandIndex = 0;
    this.showScreen("details");
  }

  private renderReview(): void {
    this.reviewUI?.destroy();
    const screen = this.screens.get("review")!;
    if (!this.reviewData || !this.reviewTimeline) {
      this.textScreen("review", "Review", (page) => page.append(h("p", {}, tx("ui.app.open-a-finished-game-in-games-then-select-a-hand", "Open a finished game in Games, then select a hand to review its board."))));
      return;
    }
    this.reviewUI = mountBoardReview(screen, { timeline: this.reviewTimeline, handIndex: this.reviewHandIndex,
      renderTile: (tile) => this.learningTile(tile),
      onBack: () => this.showScreen("details"),
      onPractice: (position, skills) => this.practiceFromReview(position, skills),
    });
    const resume = this.reviewData.positions.findIndex((position) => position.decisionIndex === this.reviewResumeDecision);
    if (resume >= 0) this.reviewUI.goToDecision(resume);
  }

  private practiceFromReview(position: ReviewDecision, skills: readonly string[]): void {
    this.reviewResumeDecision = position.decisionIndex;
    const selected = skills.filter((skill): skill is SkillId => SKILLS.includes(skill as SkillId));
    this.practiceInitialSkill = selected[0] ?? "ukeire";
    if (this.reviewRecordId) {
      this.reviewCollection = addReviewPosition(this.reviewCollection, { recordId: this.reviewRecordId,
        decisionIndex: position.decisionIndex, skills: selected.length ? selected : ["ukeire"], addedAt: Date.now() });
      this.saveLearningCache(REVIEW_COLLECTION_KEY, this.reviewCollection);
      this.queueAccountSettings();
    }
    if (position.variant) {
      this.variantLearningId=position.variant;this.variantPracticeMode=true;this.variantReturnReview=true;
      this.variantPracticeTopic=position.variant==="mcr"?(position.kind==="call"?"mcr-claims":"mcr-eligibility"):position.variant==="taiwanese"?(position.kind==="call"?"tw-turns":"tw-waits"):(position.kind==="call"?"hk-turns":"hk-minimum");
      this.showScreen("variant-learn");
    } else this.showScreen("practice");
  }

  private async openSavedReview(recordId: string, decisionIndex: number): Promise<void> {
    const record = loadRecords().find((candidate) => candidate.id === recordId) ?? (this.user ? await fetchGame(recordId) : null);
    if (!record?.log) {
      this.screens.get("practice")?.querySelector(".saved-reviews")?.append(h("p", { role: "status" }, tx("ui.app.this-game-record-is-unavailable-try-again-when-i", "This game record is unavailable. Try again when it has synced.")));
      return;
    }
    this.openRecord(record);
    if (this.reviewRecordId !== recordId) return;
    this.showScreen("review");
    const index = this.reviewData?.positions.findIndex((position) => position.decisionIndex === decisionIndex) ?? -1;
    if (index >= 0) { this.reviewResumeDecision = decisionIndex; this.reviewUI?.goToDecision(index); }
  }

  /**
   * The Learn tab (rendering 03 + Michael's build requirement,
   * 2026-11-16): Practice and the guided row sit above collapsible
   * per-variant sections, each with its own
   * progress. Future variant sections append to LEARN_SECTIONS.
   */
  private renderLearn(): void {
    const el = this.screens.get("learn")!;
    el.innerHTML = "";
    const page = h("div", { class: "tabpage" });
    el.append(page);
    page.append(h("h2", {}, tx("ui.app.learn", "Learn")));
    page.append(h("p", { class: "dim" }, tx("ui.app.lessons-teach-each-game-from-the-first-tile-star", "Lessons teach each game from the first tile. Start with lesson 1 of the game you want to learn.")));
    page.append(this.guidedRowEl());
    for (const section of LEARN_SECTIONS) page.append(this.learnSectionEl(section));
    const practice = h("button", { class: "pillbtn", "aria-label": tx("ui.app.practice", "Practice") }, tx("ui.app.practice", "Practice"));
    practice.addEventListener("click", () => { this.practiceInitialSkill = undefined; this.showScreen("practice"); });
    const prow = h("div", { class: "practicerow" });
    prow.append(practice);
    page.append(prow);
    this.variantProgress = mergeVariantProgress(this.variantProgress, parseVariantProgress(this.readLearningCache(VARIANT_LEARNING_KEY)));
    for (const release of VARIANT_RELEASES.filter((v) => v.released)) {
      page.append(this.variantLearnSectionEl(release));
    }
    page.append(this.americanLearnSectionEl());
  }

  private renderAmericanCard(): void {
    this.americanCardUI?.destroy();
    this.americanCardUI = mountAmericanCard(this.screens.get("american-card")!, {
      onBack: () => this.showScreen("learn"),
    });
  }

  /** A tap on an American lesson row: the lesson runner registers
   *  its mounter in education/american.ts; until it does, the row
   *  is the list entry point and the tap goes nowhere. */
  private openAmericanLesson(lessonId: string): void {
    if (!americanLessonMounter()) return;
    this.americanLessonId = lessonId;
    this.showScreen("american-lesson");
  }

  private renderAmericanLesson(): void {
    this.americanLessonUI?.destroy();
    this.americanLessonUI = null;
    const mounter = americanLessonMounter();
    if (!mounter || !this.americanLessonId) return;
    this.americanLessonUI = mounter(this.screens.get("american-lesson")!, {
      lessonId: this.americanLessonId,
      onBack: () => this.showScreen("learn"),
    });
  }

  /** The American section (renderings american-card-v1 frames
   *  01/06, approved 2026-11-18): the variant-section grammar —
   *  sechead, state-green progbar, lrow rows — with the training-
   *  only marking the brief requires: a TRAINING ONLY badge in the
   *  head and one factual line under it. The Practice Card entry
   *  leads the lesson rows (a card glyph in the number slot, the
   *  hand count as its status). There is no Practice button and no
   *  Play entry: this track is lessons and a card, never a game. */
  private americanLearnSectionEl(): HTMLElement {
    const progress = readAmericanProgress();
    const isDone = (id: string) => progress.completed.includes(id);
    const doneCount = AMERICAN_LESSONS.filter((l) => isDone(l.id)).length;
    const collapsed = this.collapsedSections.has(AMERICAN_SECTION_ID);
    const wrap = h("div", { class: "learnsec" });
    const head = h("button", {
      class: "sechead amc-head",
      "aria-expanded": String(!collapsed),
      "data-section": AMERICAN_SECTION_ID,
    });
    head.append(
      h("span", { class: "secttl" }, tx("learn.american.section-title", AMERICAN_SECTION_NAME)),
      h("span", { class: "lenbadge" }, tx("ui.app.training-only", "TRAINING ONLY")),
      h("span", { class: "seccount" }, tx("ui.app.v-0-of-1-lessons-done", `${doneCount} of ${AMERICAN_LESSONS.length} lessons done`, doneCount, AMERICAN_LESSONS.length)),
    );
    head.insertAdjacentHTML(
      "beforeend",
      `<svg class="chev${collapsed ? " closed" : ""}" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>`,
    );
    head.addEventListener("click", () => {
      if (this.collapsedSections.has(AMERICAN_SECTION_ID)) this.collapsedSections.delete(AMERICAN_SECTION_ID);
      else this.collapsedSections.add(AMERICAN_SECTION_ID);
      try {
        localStorage.setItem(LEARN_COLLAPSED_KEY, JSON.stringify([...this.collapsedSections]));
      } catch { /* A display preference; losing it is harmless. */ }
      this.renderLearn();
    });
    wrap.append(head);
    if (collapsed) return wrap;
    wrap.append(h("p", { class: "amc-trainline" }, tx("learn.american.training-only-lessons-and-a-practice-card-there", AMERICAN_TRAINING_LINE)));
    const bar = h("div", { class: "progbar" });
    const fill = h("i");
    fill.style.width = `${Math.round((doneCount / AMERICAN_LESSONS.length) * 100)}%`;
    bar.append(fill);
    wrap.append(bar);
    const cardRow = h("button", { class: "hrow lrow" });
    const cardGlyph = h("span", { class: "n" });
    cardGlyph.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" style="stroke:var(--dim);fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 10h17"/></svg>`;
    cardRow.append(
      cardGlyph,
      h("span", { class: "ttl" }, tx("ui.app.practice-card", "Practice Card")),
      h("span", { class: "st" }, tx("ui.app.v-0-hands", `${cardHandCount()} hands`, cardHandCount())),
    );
    cardRow.insertAdjacentHTML(
      "beforeend",
      `<svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>`,
    );
    cardRow.addEventListener("click", () => this.showScreen("american-card"));
    wrap.append(cardRow);
    const activeId = progress.activeId;
    const firstOpen = AMERICAN_LESSONS.find((l) => !isDone(l.id))?.id;
    AMERICAN_LESSONS.forEach((lesson, i) => {
      const done = isDone(lesson.id);
      const isActive = activeId === lesson.id;
      const isCurrent = isActive || (!activeId && firstOpen === lesson.id);
      const row = h("button", { class: `hrow lrow${isCurrent ? " current" : ""}` });
      row.append(h("span", { class: "n" }, String(i + 1)));
      row.append(h("span", { class: "ttl" }, t(`learn.american.${slugify(lesson.title)}`)));
      if (done) {
        const st = h("span", { class: "st" });
        st.innerHTML = `<svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5"/></svg>`;
        st.append(document.createTextNode(tx("ui.app.done", "Done")));
        row.append(st);
      } else if (isActive) {
        row.append(h("span", { class: "st now" }, tx("ui.app.in-progress-2", "In progress")));
      }
      row.insertAdjacentHTML(
        "beforeend",
        `<svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>`,
      );
      row.addEventListener("click", () => this.openAmericanLesson(lesson.id));
      wrap.append(row);
    });
    return wrap;
  }

  /** A variant's Learn section, in the same grammar as the Riichi
   *  section (design-rules §13: variant sections slot into the same
   *  structure without restructuring the tab): sechead, state-green
   *  progbar, and lrow lesson rows with number, title, status, and
   *  chevron. Variant lessons carry no minutes metadata, so an
   *  untouched row shows no status span rather than an invented
   *  duration. Collapse state persists with the Riichi section's,
   *  keyed by the variant id. */
  private variantLearnSectionEl(release: (typeof VARIANT_RELEASES)[number]): HTMLElement {
    const lessons = variantLessons(release.id);
    const isDone = (id: string) => this.variantProgress.completed.some((c) => c.lessonId === id);
    const doneCount = lessons.filter((l) => isDone(l.id)).length;
    const collapsed = this.collapsedSections.has(release.id);
    const wrap = h("div", { class: "learnsec" });
    const head = h("button", {
      class: "sechead",
      "aria-expanded": String(!collapsed),
      "data-section": release.id,
    });
    head.append(
      h("span", { class: "secttl" }, release.id === "mcr" ? tx("ui.app.mcr-mahjong-competition-rules", "MCR (Mahjong Competition Rules)") : releaseName(release)),
      h("span", { class: "seccount" }, tx("ui.app.v-0-of-1-lessons-done", `${doneCount} of ${lessons.length} lessons done`, doneCount, lessons.length)),
    );
    head.insertAdjacentHTML(
      "beforeend",
      `<svg class="chev${collapsed ? " closed" : ""}" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>`,
    );
    head.addEventListener("click", () => {
      if (this.collapsedSections.has(release.id)) this.collapsedSections.delete(release.id);
      else this.collapsedSections.add(release.id);
      try {
        localStorage.setItem(LEARN_COLLAPSED_KEY, JSON.stringify([...this.collapsedSections]));
      } catch { /* A display preference; losing it is harmless. */ }
      this.renderLearn();
    });
    wrap.append(head);
    if (collapsed) return wrap;
    const bar = h("div", { class: "progbar" });
    const fill = h("i");
    fill.style.width = `${lessons.length ? Math.round((doneCount / lessons.length) * 100) : 0}%`;
    bar.append(fill);
    wrap.append(bar);
    const practice = h("button", { class: "pillbtn" }, tx("ui.app.practice-0", `Practice ${release.name}`, releaseName(release)));
    practice.addEventListener("click", () => {
      this.variantLearningId = release.id;
      this.variantPracticeMode = true;
      this.variantReturnReview = false;
      this.showScreen("variant-learn");
    });
    const activeId = lessons.find((l) => this.variantProgress.active[l.id] && !isDone(l.id))?.id;
    const firstOpen = lessons.find((l) => !isDone(l.id))?.id;
    lessons.forEach((lesson, i) => {
      const done = isDone(lesson.id);
      const isActive = activeId === lesson.id;
      const isCurrent = isActive || (!activeId && firstOpen === lesson.id);
      const row = h("button", { class: `hrow lrow${isCurrent ? " current" : ""}` });
      row.append(h("span", { class: "n" }, String(i + 1)));
      row.append(h("span", { class: "ttl" }, t(`learn.${lesson.variant}.${lesson.id.slice(lesson.id.indexOf("-") + 1)}.title`)));
      if (done) {
        const st = h("span", { class: "st" });
        st.innerHTML = `<svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5"/></svg>`;
        st.append(document.createTextNode(tx("ui.app.done", "Done")));
        row.append(st);
      } else if (isActive) {
        row.append(h("span", { class: "st now" }, tx("ui.app.in-progress-2", "In progress")));
      }
      row.insertAdjacentHTML(
        "beforeend",
        `<svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>`,
      );
      row.addEventListener("click", () => {
        this.variantLearningId = release.id;
        this.variantLessonId = lesson.id;
        this.variantPracticeMode = false;
        this.variantReturnReview = false;
        this.showScreen("variant-learn");
      });
      wrap.append(row);
    });
    wrap.append(practice);
    return wrap;
  }

  private learnSectionEl(section: (typeof LEARN_SECTIONS)[number]): HTMLElement {
    const doneCount = section.modules.filter((m) => this.tutorial.done.includes(m.id)).length;
    const collapsed = this.collapsedSections.has(section.id);
    const wrap = h("div", { class: "learnsec" });
    const head = h("button", {
      class: "sechead",
      "aria-expanded": String(!collapsed),
      "data-section": section.id,
    });
    head.append(
      h("span", { class: "secttl" }, tx(section.key, section.title)),
      h("span", { class: "seccount" }, tx("ui.app.v-0-of-1-lessons-done", `${doneCount} of ${section.modules.length} lessons done`, doneCount, section.modules.length)),
    );
    head.insertAdjacentHTML(
      "beforeend",
      `<svg class="chev${collapsed ? " closed" : ""}" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>`,
    );
    head.addEventListener("click", () => {
      if (this.collapsedSections.has(section.id)) this.collapsedSections.delete(section.id);
      else this.collapsedSections.add(section.id);
      try {
        localStorage.setItem(LEARN_COLLAPSED_KEY, JSON.stringify([...this.collapsedSections]));
      } catch { /* A display preference; losing it is harmless. */ }
      this.renderLearn();
    });
    wrap.append(head);
    if (collapsed) return wrap;
    const bar = h("div", { class: "progbar" });
    const fill = h("i");
    fill.style.width = `${Math.round((doneCount / section.modules.length) * 100)}%`;
    bar.append(fill);
    wrap.append(bar);
    const activeId = this.tutorial.active?.module;
    const firstOpen = section.modules.find((m) => !this.tutorial.done.includes(m.id))?.id;
    section.modules.forEach((mod, i) => {
      const isDone = this.tutorial.done.includes(mod.id);
      const isActive = activeId === mod.id;
      const isCurrent = isActive || (!activeId && firstOpen === mod.id);
      const row = h("button", { class: `hrow lrow${isCurrent ? " current" : "" }` });
      row.dataset["module"] = mod.id;
      row.append(h("span", { class: "n" }, String(i + 1)));
      row.append(h("span", { class: "ttl" }, t(`learn.riichi.${mod.id}.title`)));
      if (mod.optional) row.append(h("span", { class: "lenbadge" }, tx("ui.app.optional", "OPTIONAL")));
      if (isDone) {
        const st = h("span", { class: "st" });
        st.innerHTML = `<svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5"/></svg>`;
        st.append(document.createTextNode(tx("ui.app.done", "Done")));
        row.append(st);
      } else if (isActive) {
        row.append(h("span", { class: "st now" }, tx("ui.app.in-progress-2", "In progress")));
      } else {
        row.append(h("span", { class: "st" }, tx("ui.app.v-0-min", `${mod.minutes} min`, mod.minutes)));
      }
      row.insertAdjacentHTML(
        "beforeend",
        `<svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>`,
      );
      row.addEventListener("click", () => this.startLesson(mod.id));
      wrap.append(row);
    });
    return wrap;
  }

  private startLesson(id: ModuleId): void {
    trackLessonStarted(id);
    if (id === "tu11") {
      this.startTu11();
      return;
    }
    this.generation++;
    this.playing = false;
    this.frame = null;
    this.runner = null;
    this.tu11Active = false;
    const saved = this.tutorial.active?.module === id ? this.tutorial.active : null;
    this.lesson = new LessonController(id, saved);
    this.syncLessonProgress();
    this.syncLessonModel();
    this.showScreen("table");
    this.renderTable();
  }

  /** TU-11 is a real game: the fixed tutorial seed, an East game,
   *  guided hints forced on. It completes when the game finishes
   *  (afterAdvance), and its record is a normal game record. */
  private startTu11(): void {
    this.lesson = null;
    this.tutorial = {
      ...this.tutorial,
      active: { module: "tu11", step: 0, scene: null, counters: {}, found: [] },
    };
    this.persistTutorial();
    this.tu11Active = true;
    this.startGame("east", { seed: "om-tu11" });
  }

  private exitLesson(): void {
    this.lesson = null;
    this.showScreen("learn");
  }

  private lessonAct(action: LessonAction): void {
    if (!this.lesson) return;
    this.sound.unlock();
    this.lesson.handle(action);
    this.syncLessonProgress();
    this.syncLessonModel();
    this.renderTable();
  }

  private syncLessonProgress(): void {
    if (!this.lesson) return;
    if (this.lesson.done) {
      const id = this.lesson.moduleId;
      const isNew = !this.tutorial.done.includes(id);
      this.tutorial = {
        done: isNew ? [...this.tutorial.done, id] : this.tutorial.done,
        active: null,
      };
      if (isNew) trackLessonCompleted(id);
    } else {
      this.tutorial = { ...this.tutorial, active: this.lesson.serialize() };
    }
    this.persistTutorial();
  }

  /** The lesson table is the same fold of the event log as a real
   *  game — the scene's events, folded whole (lessons do not animate
   *  playback; the panel is the pace). */
  private syncLessonModel(): void {
    if (this.lesson?.scene) {
      this.model = foldEvents(this.lesson.scene.events, 0, this.lesson.scene.chiHints);
      this.cursor = this.lesson.scene.events.length;
    }
  }

  private showLessonMenu(): void {
    const overlay = h("div", { class: "overlay show" });
    const card = h("div", { class: "card" });
    card.append(
      h("h2", {}, this.lesson ? t(`learn.riichi.${this.lesson.moduleId}.title`) : tx("ui.app.lesson", "Lesson")),
      h("div", { class: "sub" }, tx("ui.app.your-place-in-the-lesson-is-saved", "Your place in the lesson is saved.")),
    );
    const col = h("div", { class: "col" });
    const resume = h("button", { class: "pillbtn primary" }, tx("ui.app.resume", "Resume"));
    resume.addEventListener("click", () => this.dismissOverlay(overlay));
    const leave = h("button", { class: "pillbtn" }, tx("ui.app.leave-lesson", "Leave lesson"));
    leave.addEventListener("click", () => {
      this.dismissOverlay(overlay);
      this.exitLesson();
    });
    col.append(resume, leave);
    card.append(col);
    overlay.append(card);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) this.dismissOverlay(overlay);
    });
    this.mountOverlay(overlay);
  }

  /**
   * A lesson's pictured tiles. On teaching steps (`inspectable`)
   * each tile can be tapped to inspect it — the corner index fades
   * in over the face, the lesson's magnifier. On check steps the
   * strip is never inspectable: a check must not be tappable into
   * revealing its answer (the standing no-leak law).
   */
  private lessonStripEl(types: readonly number[], inspectable = false): HTMLElement {
    const strip = h("div", { class: "lstrip" });
    const stepKey = `${this.lesson?.moduleId ?? ""}:${this.lesson?.stepIndex ?? 0}`;
    types.forEach((type, i) => {
      const key = `${stepKey}:${i}`;
      const tile = tileById(type * 4 + 1);
      const w = tileEl(tile, "t-meld", {
        flip: false,
        index: inspectable && this.lessonIndexRevealed.has(key),
      });
      if (inspectable) {
        w.classList.add("stripinspect");
        w.setAttribute("role", "button");
        w.setAttribute("aria-label", tx("ui.app.inspect-the-0", `Inspect the ${tileLabel(tile)}`, tileLabel(tile)));
        w.addEventListener("click", () => {
          if (this.lessonIndexRevealed.has(key)) this.lessonIndexRevealed.delete(key);
          else this.lessonIndexRevealed.add(key);
          this.renderTable();
        });
      }
      strip.append(w);
    });
    return strip;
  }

  private lessonChoicesEl(): HTMLElement | null {
    const view = this.lesson!.view();
    if (!view.choices) return null;
    const box = h("div", { class: "lchoices" });
    view.choices.forEach((choice, i) => {
      const b = h("button", { class: "pillbtn lchoice" });
      b.append(h("span", {}, choice.label));
      if (choice.tiles) b.append(this.lessonStripEl(choice.tiles));
      b.addEventListener("click", () => this.lessonAct({ kind: "choice", index: i }));
      box.append(b);
    });
    return box;
  }

  private lessonCtlEl(inPanel: boolean): HTMLElement {
    const view = this.lesson!.view();
    const ctl = h("div", { class: "revctl" });
    if (!inPanel) {
      const leave = h("button", { class: "pillbtn ghost" }, tx("ui.app.leave", "Leave"));
      leave.addEventListener("click", () => this.exitLesson());
      ctl.append(leave);
    }
    ctl.append(
      h("span", { class: "step" }, tx("ui.app.step-0-of-1", `Step ${view.stepIndex + 1} of ${view.stepCount}`, view.stepIndex + 1, view.stepCount)),
    );
    for (const b of view.buttons) {
      const btn = h("button", { class: `pillbtn ${b.cls}` });
      // Shared module-scope buttons (CONTINUE/BACK) carry their en.json
      // key; render-time buttons carry the label directly.
      const label = b.key ? t(b.key) : b.label;
      btn.append(h("span", {}, label));
      if (b.faces) {
        btn.classList.add("callopt");
        btn.append(chiFacesEl(b.faces.map((f) => ({ tile: tileById(f.id), ...(f.side ? { side: true as const } : {}) }))));
        btn.setAttribute(
          "aria-label",
          tx("ui.app.v-0-1-4", `${label} — ${b.faces.map((f) => tileLabel(tileById(f.id))).join(", ")}`, label, b.faces.map((f) => tileLabel(tileById(f.id))).join(", ")),
        );
      }
      btn.addEventListener("click", () => this.lessonAct({ kind: "button", id: b.id }));
      ctl.append(btn);
    }
    return ctl;
  }

  /** The lesson panel docked in the player zone (rendering 03) —
   *  scene lessons ride the real table. */
  private lessonPanelEl(): HTMLElement {
    const view = this.lesson!.view();
    const panel = h("div", { class: "revpanel lessonpanel" });
    // The text block is the panel's scroll region (fix round,
    // 2026-11-17): choices and the control row stay pinned below it
    // while long step text — TU-8's worked breakdown is the floor
    // case — scrolls inside the panel instead of pushing the panel
    // past the bottom of the table.
    const scroll = h("div", { class: "lessonscroll" });
    scroll.append(h("div", { class: "lab" }, view.lab), h("p", {}, view.text));
    if (view.note) scroll.append(h("p", { class: "dim" }, view.note));
    if (view.strip) {
      scroll.append(this.lessonStripEl(view.strip, view.choices === null && view.drill === null));
    }
    panel.append(scroll);
    const choices = this.lessonChoicesEl();
    if (choices) panel.append(choices);
    panel.append(this.lessonCtlEl(true));
    return panel;
  }

  /** The panel-lesson stage (rendering 02): prompt panel, drill grid,
   *  step dots, controls — on the table screen's chrome. */
  private lessonStageEl(): HTMLElement {
    const view = this.lesson!.view();
    const wrap = h("div", { class: "lstage" });
    const panel = h("div", { class: "revpanel" });
    panel.append(h("div", { class: "lab" }, view.lab), h("p", {}, view.text));
    if (view.note && !view.drill) panel.append(h("p", { class: "dim" }, view.note));
    if (view.strip) {
      panel.append(this.lessonStripEl(view.strip, view.choices === null && view.drill === null));
    }
    wrap.append(panel);
    if (view.drill) {
      const drill = h("div", { class: "drillpanel" });
      const grid = h("div", { class: "dgrid" });
      view.drill.tiles.forEach((type, i) => {
        const found = view.drill!.found.includes(i);
        const cell = h("span", {
          class: `cell${found ? " sel" : ""}`,
        });
        // A found tile is an answered tile: its corner index may
        // show. Unfound tiles never carry one — the drill's answer
        // must not be tappable into view (the no-leak law).
        cell.append(tileEl(tileById(type * 4 + 1), "", { flip: false, index: found }));
        tileControl(cell, `drill-${i}`, tileTypeName(type), () => this.lessonAct({ kind: "drill", index: i }), found);
        grid.append(cell);
      });
      drill.append(grid);
      if (view.note) drill.append(h("p", { class: "dnote" }, view.note));
      wrap.append(drill);
    }
    const choices = this.lessonChoicesEl();
    if (choices) wrap.append(choices);
    wrap.append(h("div", { class: "tspacer" }));
    const dots = h("div", { class: "dots" });
    for (let i = 0; i < view.stepCount; i++) {
      const d = h("i");
      if (i < view.stepIndex) d.className = "done";
      else if (i === view.stepIndex) d.className = "now";
      dots.append(d);
    }
    wrap.append(dots);
    wrap.append(this.lessonCtlEl(false));
    return wrap;
  }

  /** The completion panel (rendering 05): covered lines, course
   *  progress, and the next lesson offered. */
  private lessonCompleteEl(): HTMLElement {
    const def = moduleDef(this.lesson!.moduleId);
    const wrap = h("div", { class: "revwrap" });
    wrap.append(h("h2", {}, t(`learn.riichi.${def.id}.title`)));
    const panel = h("div", { class: "revpanel" });
    panel.append(h("div", { class: "lab" }, tx("ui.app.lesson-complete", "LESSON COMPLETE")));
    def.covered.forEach((_line, i) => panel.append(h("p", {}, t(`learn.riichi.${def.id}.covered${i}`))));
    wrap.append(panel);
    const prog = h("div", { class: "progrow" });
    prog.append(
      h("p", { class: "count" }, tx("ui.app.v-0-of-1-lessons-done", `${this.tutorial.done.length} of ${MODULES.length} lessons done`, this.tutorial.done.length, MODULES.length)),
    );
    const bar = h("div", { class: "progbar" });
    const fill = h("i");
    fill.style.width = `${Math.round((this.tutorial.done.length / MODULES.length) * 100)}%`;
    bar.append(fill);
    prog.append(bar);
    wrap.append(prog);
    const ctl = h("div", { class: "revctl" });
    const all = h("button", { class: "pillbtn ghost" }, tx("ui.app.all-lessons", "All lessons"));
    all.addEventListener("click", () => this.exitLesson());
    ctl.append(all);
    // Next is the first incomplete module AFTER the one just
    // completed; only when none remains after it do we fall back to
    // the first incomplete module overall.
    const completedIndex = MODULES.findIndex((m) => m.id === this.lesson!.moduleId);
    const next = MODULES.slice(completedIndex + 1).find((m) => !this.tutorial.done.includes(m.id))
      ?? MODULES.find((m) => !this.tutorial.done.includes(m.id));
    if (next) {
      const nb = h("button", { class: "pillbtn primary" }, tx("ui.app.next-0", `Next: ${next.title}`, next.title));
      nb.addEventListener("click", () => this.startLesson(next.id));
      ctl.append(nb);
    }
    wrap.append(ctl);
    return wrap;
  }

  // -- pause + breakdown + results -------------------------------------------------

  private mountOverlay(overlay: HTMLElement, onClose?: () => void): void {
    overlay.dataset["returnFocus"] = (document.activeElement as HTMLElement | null)?.dataset["controlKey"] ?? "menu";
    for (const child of [...this.tableEl.children]) {
      if (child instanceof HTMLElement) child.inert = true;
    }
    this.tableEl.append(overlay);
    accessibleDialog(overlay, overlay.querySelector("h2")?.textContent ?? "Game information", onClose ?? (() => this.dismissOverlay(overlay)));
  }

  private dismissOverlay(overlay: HTMLElement): void {
    overlay.remove();
    for (const child of [...this.tableEl.children]) {
      if (child instanceof HTMLElement) child.inert = false;
    }
    focusByKey(overlay.dataset["returnFocus"]);
  }

  private showPause(): void {
    const overlay = h("div", { class: "overlay show" });
    const card = h("div", { class: "card" });
    card.append(h("h2", {}, tx("ui.app.paused", "Paused")), h("div", { class: "sub" }, tx("ui.app.the-game-waits-nothing-moves-without-you", "The game waits — nothing moves without you.")));
    const col = h("div", { class: "col" });
    const mk = (label: string, cls: string, fn: () => void) => {
      const b = h("button", { class: `pillbtn ${cls}` }, label);
      b.addEventListener("click", fn);
      return b;
    };
    col.append(
      mk(tx("ui.app.resume", "Resume"), "primary", () => this.dismissOverlay(overlay)),
      mk(this.settings.guided ? tx("ui.app.guided-on", "Guided: on") : tx("ui.app.guided-off", "Guided: off"), "ghost", () => {
        this.settings = { ...this.settings, guided: !this.settings.guided };
        this.persistSettings();
        this.dismissOverlay(overlay);
        this.renderTable();
      }),
      mk(this.settings.sound ? tx("ui.app.sound-on", "Sound: on") : tx("ui.app.sound-off", "Sound: off"), "ghost", () => {
        this.settings = { ...this.settings, sound: !this.settings.sound };
        this.sound.enabled = this.settings.sound;
        this.persistSettings();
        this.dismissOverlay(overlay);
        this.renderTable();
      }),
      mk(tx("ui.app.restart-game", "Restart game"), "", () => {
        this.dismissOverlay(overlay);
        this.restartGame();
      }),
      mk(tx("ui.app.quit-to-home", "Quit to home"), "", () => {
        this.dismissOverlay(overlay);
        this.quitToHome();
      }),
    );
    card.append(col);
    overlay.append(card);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) this.dismissOverlay(overlay);
    });
    this.mountOverlay(overlay);
  }

  private showBreakdown(): Promise<void> {
    this.frame = null;
    const win = this.model.lastWin;
    const drawn = this.model.lastDrawnHand;
    if (!win && !drawn) return Promise.resolve();
    return new Promise((resolve) => {
      const overlay = h("div", { class: "overlay show" });
      const card = h("div", { class: "card" });
      if (win) this.fillWinBreakdown(card, win);
      else this.fillDrawBreakdown(card, drawn!);
      const nextIsGameEnd =
        this.runner?.result !== null ||
        this.runner?.events[this.cursor]?.type === "game-end";
      const cont = h("button", { class: "pillbtn primary" }, nextIsGameEnd ? tx("ui.app.final-results", "Final results") : tx("ui.app.next-hand", "Next hand"));
      cont.style.width = "100%";
      cont.style.marginTop = "16px";
      cont.addEventListener("click", () => {
        this.dismissOverlay(overlay);
        resolve();
      });
      card.append(cont);
      overlay.append(card);
      this.mountOverlay(overlay, () => { this.dismissOverlay(overlay); resolve(); });
    });
  }

  private fillWinBreakdown(card: HTMLElement, win: WinInfo): void {
    const winner = this.model.players[win.seat]!;
    const title = win.winType === "ron" ? `Ron — ${WIND_NAMES[winner.seatWind]}` : tx("ui.app.tsumo-0", `Tsumo — ${WIND_NAMES[winner.seatWind]}`, WIND_NAMES[winner.seatWind]);
    card.append(h("h2", {}, title));
    if (win.winType === "ron" && win.fromSeat !== undefined) {
      const from = this.model.players[win.fromSeat]!;
      card.append(h("div", { class: "sub" }, tx("ui.app.on-0-s-discard", `On ${WIND_NAMES[from.seatWind]}'s discard`, WIND_NAMES[from.seatWind])));
    }
    // In-place glosses (definition audit, 2026-11-17): a player can
    // reach this sheet from the land-and-play home before any
    // lesson, so the win type is defined here, in the same plain
    // words the lessons use. The wind in the title is the winner's
    // seat wind — the wind of the seat the winner is sitting in.
    card.append(h("p", { class: "dim" }, win.winType === "ron"
      ? tx("ui.app.ron-winning-on-a-tile-another-player-discarded-o", "Ron: winning on a tile another player discarded. Only the player who discarded it pays. The wind in the title is the winner's seat wind.")
      : tx("ui.app.tsumo-winning-on-a-tile-you-drew-yourself-all-th", "Tsumo: winning on a tile you drew yourself. All three opponents pay. The wind in the title is the winner's seat wind.")));
    const handRow = h("div", { class: "bk-hand" });
    for (const meld of win.winnerMelds) handRow.append(this.meldEl(meld, "t-meld", win.seat));
    const sorted = [...win.handTiles].sort((a, b) => a.type - b.type || a.id - b.id);
    for (const tile of sorted) handRow.append(tileEl(tile, "", { flip: false }));
    const winWrap = tileEl(win.winningTile, "win", { flip: false });
    handRow.append(winWrap);
    card.append(handRow);

    const yakuBox = h("div", { class: "bk-yaku" });
    let yakuHan = 0;
    const open = win.winnerMelds.some((meld) => meld.kind !== "ankan");
    for (const id of win.yaku) {
      const entry = YAKU[id];
      const nameKey = entry?.key ?? id;
      const closedHan = entry?.han ?? 0;
      const han = win.yakuDetails?.find((yaku) => yaku.id === id)?.han ??
        (open && ["ittsu", "sanshoku-doujun", "honchan", "junchan", "honitsu", "chinitsu"].includes(id) ? closedHan - 1 : closedHan);
      yakuHan += han;
      const row = h("div", { class: "row" });
      row.append(h("span", {}, t(nameKey)), h("span", { class: "han" }, win.yakumanMultiple > 0 ? tx("ui.app.yakuman", "Yakuman") : tx("ui.app.v-0-han", `${han} han`, han)));
      yakuBox.append(row);
    }
    if (win.yakumanMultiple === 0) {
      const dora = win.dora ?? Math.max(0, win.han - yakuHan);
      if (dora > 0) {
        const row = h("div", { class: "row" });
        row.append(h("span", {}, tx("ui.app.dora", "Dora")), h("span", { class: "han" }, tx("ui.app.v-0-han", `${dora} han`, dora)));
        yakuBox.append(row);
      }
      const total = h("div", { class: "row total" });
      const gained = win.payments.reduce((s, p) => s + p.amount, 0) + win.stickPoints;
      total.append(
        h("span", {}, tx("ui.app.v-0-han-1-fu", `${win.han} han · ${win.fu} fu`, win.han, win.fu)),
        h("span", {}, tx("ui.app.v-0", `${fmt(gained)}`, fmt(gained))),
      );
      yakuBox.append(total);
    } else {
      const total = h("div", { class: "row total" });
      const gained = win.payments.reduce((s, p) => s + p.amount, 0) + win.stickPoints;
      total.append(
        h("span", {}, win.yakumanMultiple > 1 ? tx("ui.app.yakuman-0", `Yakuman ×${win.yakumanMultiple}`, win.yakumanMultiple) : tx("ui.app.yakuman", "Yakuman")),
        h("span", {}, tx("ui.app.v-0", `${fmt(gained)}`, fmt(gained))),
      );
      yakuBox.append(total);
    }
    card.append(yakuBox);
    card.append(h("p", { class: "dim" }, win.yakumanMultiple > 0
      ? tx("ui.app.a-yakuman-is-the-highest-value-kind-of-hand-it-p", "A yakuman is the highest-value kind of hand. It pays a fixed large amount.")
      : tx("ui.app.han-count-the-hands-scoring-patterns-and-bonus-d", "Han count the hand's scoring patterns and bonus dora. Fu are minipoints from the hand's shape. Han and fu together set the points.")));
    card.append(h("p", { class: "dim" }, tx("ui.app.honba-the-repeat-counter-stands-at-0-each-honba", `Honba — the repeat counter — stands at ${this.model.honba}. Each honba adds 300 points to a winning hand.`, this.model.honba)));

    const pay = h("div", { class: "bk-pay" });
    for (const p of win.payments) {
      const payer = this.model.players[p.seat]!;
      pay.append(h("div", {}, tx("ui.app.v-0-pays", `${WIND_NAMES[payer.seatWind]} pays`, WIND_NAMES[payer.seatWind]) + " ", h("b", {}, fmt(p.amount))));
    }
    if (win.stickPoints > 0) {
      pay.append(h("div", {}, tx("ui.app.riichi-sticks", `Riichi sticks`) + " ", h("b", {}, tx("ui.app.v-0-6", `+${fmt(win.stickPoints)}`, fmt(win.stickPoints)))));
    }
    card.append(pay);
    if (win.stickPoints > 0) {
      card.append(h("p", { class: "dim" }, tx("ui.app.a-riichi-stick-is-a-1-000-point-stake-a-player-p", "A riichi stick is a 1,000-point stake a player paid when declaring riichi. The winner collects the sticks on the table.")));
    }

    const doraRow = h("div", { class: "bk-dora" });
    doraRow.append(h("span", { class: "lbl" }, tx("ui.app.dora-indicator", "Dora indicator")));
    for (const ind of this.model.doraIndicators) doraRow.append(tileEl(ind, "", { flip: false }));
    card.append(doraRow);
    card.append(h("p", { class: "dim" }, tx("ui.app.the-dora-indicator-points-to-a-bonus-tile-the-ti", "The dora indicator points to a bonus tile: the tile one step on from the indicator, in the same suit, is a dora, worth extra han in a winning hand.")));
    if (winner.riichi) {
      const ura = this.model.uraIndicators();
      if (ura) {
        const uraRow = h("div", { class: "bk-dora" });
        uraRow.append(h("span", { class: "lbl" }, tx("ui.app.uradora-indicator", "Uradora indicator")));
        for (const ind of ura) uraRow.append(tileEl(ind, "", { flip: false }));
        card.append(uraRow);
        card.append(h("p", { class: "dim" }, tx("ui.app.uradora-indicators-sit-hidden-under-the-dora-ind", "Uradora indicators sit hidden under the dora indicators. They are revealed only when a riichi hand wins, and the tile one step on from each is also a bonus tile.")));
      }
    }
  }

  private fillDrawBreakdown(card: HTMLElement, drawn: NonNullable<TableModel["lastDrawnHand"]>): void {
    if (drawn.kind === "abortive") {
      card.append(
        h("h2", {}, tx("ui.app.hand-drawn", "Hand drawn")),
        h("div", { class: "sub" }, t(ABORTIVE_NAMES[drawn.abortive ?? ""]?.key ?? ABORTIVE_DRAW_FALLBACK.key)),
        h("p", { class: "dim" }, tx("ui.app.the-hand-restarts-with-one-more-honba-the-repeat", "The hand restarts with one more honba — the repeat counter rises by one. The dealer repeats.")),
      );
      return;
    }
    card.append(h("h2", {}, tx("ui.app.exhaustive-draw", "Exhaustive draw")));
    if (drawn.nagashi && drawn.nagashi.length > 0) {
      const names = drawn.nagashi.map((s) => WIND_NAMES[this.model.players[s]!.seatWind]).join(", ");
      card.append(h("div", { class: "sub" }, tx("ui.app.nagashi-mangan-0-that-players-discards-were-all", `Nagashi mangan: ${names} — that player's discards were all terminals or honors and none were claimed, so the drawn hand pays that player as a large fixed-value win.`, names)));
    } else {
      const names = (drawn.tenpai ?? []).map((s) => WIND_NAMES[this.model.players[s]!.seatWind]).join(", ") || "None";
      card.append(h("div", { class: "sub" }, tx("ui.app.tenpai-0-tenpai-players-players-one-tile-from-a", `Tenpai: ${names}. Tenpai players — players one tile from a complete hand — split 3,000 points paid by the players who were not tenpai.`, names)));
    }
    for (const [seat, tiles] of drawn.revealedHands) {
      const p = this.model.players[seat]!;
      const label = h("div", { class: "fsec" }, tx("ui.app.v-0-1-tenpai", `${WIND_NAMES[p.seatWind]}${seat === this.humanSeat ? " " + tx("ui.app.you-2", "· YOU") : ""} — TENPAI`, WIND_NAMES[p.seatWind], seat === this.humanSeat ? " " + tx("ui.app.you-2", "· YOU") : ""));
      const row = h("div", { class: "bk-hand" });
      const sorted = [...tiles].sort((a, b) => a.type - b.type || a.id - b.id);
      for (const tile of sorted) row.append(tileEl(tile, "", { flip: false }));
      card.append(label, row);
    }
  }

  private renderResults(): void {
    const result = this.runner?.result;
    if (!result) return;
    const screen = this.screens.get("results")!;
    screen.innerHTML = "";
    const bar = h("header", { class: "bar" });
    bar.append(h("span", { class: "iconbtn" }), h("span", { class: "word" }, tx("ui.app.open-mahjong", "OPEN MAHJONG")), h("span", { class: "iconbtn" }));
    screen.append(bar);
    const page = this.buildPage(tx("ui.app.final-results", "Final results"));
    const table = h("div", { class: "results-table" });
    const sorted = [...result.settlement].sort((a, b) => a.rank - b.rank || a.seat - b.seat);
    for (const entry of sorted) {
      const p = this.model.players[entry.seat]!;
      const row = h("div", { class: "row" });
      const pts = tx("ui.app.v-0-1", `${entry.points > 0 ? "+" : ""}${formatStandingsPoints(entry.points)}`, entry.points > 0 ? "+" : "", formatStandingsPoints(entry.points));
      row.append(
        h("span", { class: "rank" }, tx("ui.app.v-0", `${entry.rank}`, entry.rank)),
        h("span", { class: "who" }, entry.seat === this.humanSeat ? tx("ui.app.you-3", "You") : WIND_NAMES[p.seatWind]!),
        h("span", { class: "score" }, fmt(entry.score)),
        h("span", { class: `pts ${entry.points > 0 ? "pos" : entry.points < 0 ? "neg" : ""}` }, pts),
      );
      table.append(row);
    }
    page.append(table);
    page.append(h("p", { class: "dim" }, tx("ui.app.v-0-points-include-uma-place-bonuses-of-15-5-5-15", `${this.runner?.replayVersion === 1 ? tx("ui.app.historical-rules-v1-saved-results-preserved", "Historical rules v1; saved results preserved.") + " " : ""}Points include uma — place bonuses of +15/+5/−5/−15 for finishing first to fourth — and the oka, a 20-point bonus to first place.`, this.runner?.replayVersion === 1 ? tx("ui.app.historical-rules-v1-saved-results-preserved", "Historical rules v1; saved results preserved.") + " " : "")));
    const col = h("div", { class: "col" });
    col.style.display = "flex";
    col.style.flexDirection = "column";
    col.style.gap = "10px";
    col.style.marginTop = "18px";
    const again = h("button", { class: "pillbtn primary" }, tx("ui.app.play-again", "Play again"));
    again.addEventListener("click", () => this.startGame(this.runner?.length ?? "south"));
    const home = h("button", { class: "pillbtn ghost" }, tx("ui.app.home", "Home"));
    home.addEventListener("click", () => this.showScreen("home"));
    col.append(again, home);
    const review = h("button", { class: "pillbtn", "aria-label": tx("ui.app.review-game", "Review game") }, tx("ui.app.review-game", "Review game"));
    review.addEventListener("click", () => this.openReview());
    col.prepend(review);
    page.append(col);
    screen.append(page);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}
