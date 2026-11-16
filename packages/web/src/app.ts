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
  tileTypeName,
  type CallAction,
  type GameEvent,
  type GameLength,
  type Seat,
  type Tile,
  type TurnAction,
} from "@openmahjong/engine";
import { AiDriver } from "./drivers.js";
import { TableModel, foldEvents, tileById, type WinInfo } from "./model.js";
import { GameRunner } from "./runner.js";
import {
  appendHistory,
  clearGame,
  focusFrameTaught,
  loadGame,
  loadHistory,
  loadSettings,
  markFocusFrameTaught,
  osPrefersReducedMotion,
  saveGame,
  saveSettings,
  type Settings,
} from "./settings.js";
import { ClickSound } from "./sound.js";
import { TILE_SPRITE_SVG } from "./tiles-sprite.js";

// ---------------------------------------------------------------------------
// Presentation data (names only — all values come from the engine)
// ---------------------------------------------------------------------------

/** Yaku id -> [display name, han]. Presentation table for the breakdown;
 *  han values are the standard ones the engine's scorer awards. */
const YAKU: Record<string, readonly [string, number]> = {
  riichi: ["Riichi", 1],
  "double-riichi": ["Double Riichi", 2],
  ippatsu: ["Ippatsu", 1],
  "menzen-tsumo": ["Menzen Tsumo", 1],
  pinfu: ["Pinfu", 1],
  iipeikou: ["Iipeikou", 1],
  ryanpeikou: ["Ryanpeikou", 3],
  tanyao: ["Tanyao", 1],
  "yakuhai-haku": ["Yakuhai (Haku)", 1],
  "yakuhai-hatsu": ["Yakuhai (Hatsu)", 1],
  "yakuhai-chun": ["Yakuhai (Chun)", 1],
  "yakuhai-seat": ["Yakuhai (Seat Wind)", 1],
  "yakuhai-round": ["Yakuhai (Round Wind)", 1],
  chankan: ["Chankan", 1],
  rinshan: ["Rinshan Kaihou", 1],
  haitei: ["Haitei Raoyue", 1],
  houtei: ["Houtei Raoyui", 1],
  chiitoitsu: ["Chiitoitsu", 2],
  ittsu: ["Ittsu", 2],
  "sanshoku-doujun": ["Sanshoku Doujun", 2],
  "sanshoku-doukou": ["Sanshoku Doukou", 2],
  sanankou: ["Sanankou", 2],
  sankantsu: ["Sankantsu", 2],
  toitoi: ["Toitoi", 2],
  honchan: ["Honchantai", 2],
  shousuushi: ["Shousuushi", 13],
  honitsu: ["Honitsu", 3],
  junchan: ["Junchan", 3],
  honroutou: ["Honroutou", 2],
  chinitsu: ["Chinitsu", 6],
  tenhou: ["Tenhou", 13],
  chiihou: ["Chiihou", 13],
  kokushi: ["Kokushi Musou", 13],
  "kokushi-13": ["Kokushi Musou (13-wait)", 26],
  suuankou: ["Suuankou", 13],
  "suuankou-tanki": ["Suuankou Tanki", 26],
  chuuren: ["Chuuren Poutou", 13],
  "chuuren-junsei": ["Junsei Chuuren Poutou", 26],
  daisuushi: ["Daisuushi", 26],
  tsuiisou: ["Tsuiisou", 13],
  ryuuiisou: ["Ryuuiisou", 13],
  suukantsu: ["Suukantsu", 13],
};

const WIND_NAMES: Record<number, string> = { 27: "East", 28: "South", 29: "West", 30: "North" };
const WIND_KANJI: Record<number, string> = { 27: "東", 28: "南", 29: "西", 30: "北" };
const ABORTIVE_NAMES: Record<string, string> = {
  "kyuushu-kyuuhai": "Kyuushu Kyuuhai (nine terminals)",
  "suucha-riichi": "Suucha Riichi (four riichi)",
  "suufon-renda": "Suufon Renda (four winds)",
  suukaikan: "Suukaikan (four kan)",
};

export function tileSymbol(tile: Tile): string {
  if (tile.type < 9) return tile.red ? "t-m5r" : `t-m${tile.type + 1}`;
  if (tile.type < 18) return tile.red ? "t-p5r" : `t-p${tile.type - 8}`;
  if (tile.type < 27) return tile.red ? "t-s5r" : `t-s${tile.type - 17}`;
  return ["t-ew", "t-sw", "t-ww", "t-nw", "t-haku", "t-hatsu", "t-chun"][tile.type - 27]!;
}

export function tileLabel(tile: Tile): string {
  if (tile.type < 27) {
    const suit = ["characters", "circles", "bamboo"][Math.floor(tile.type / 9)]!;
    return `${(tile.type % 9) + 1} of ${suit}${tile.red ? " (red five)" : ""}`;
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
 *  around the visual tile (which may rotate/lift). */
function tileEl(tile: Tile, cls: string, opts: { flip?: boolean } = {}): HTMLSpanElement {
  const inner = h("span", { class: `tile ${cls}` });
  inner.innerHTML = `<svg viewBox="0 0 40 56"><use href="#${tileSymbol(tile)}"/></svg>`;
  const wrap = h("span", { class: "twrap" });
  wrap.append(inner);
  if (opts.flip !== false) wrap.dataset["flip"] = `tile-${tile.id}`;
  return wrap;
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

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

type ScreenName = "home" | "table" | "rules" | "settings" | "about" | "results";
type FrameState =
  | { kind: "player"; seat: Seat }
  | { kind: "center" }
  | { kind: "hand"; mode: "inspect" | "chi" | "kan" }
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
  private model = new TableModel(0);
  private cursor = 0;
  private playing = false;
  private skipPlayback = false;
  private generation = 0;
  private selectedTileId: number | null = null;
  private riichiArmed = false;
  private riichiDismissed = false;
  private frame: FrameState = null;
  private frameChangedTiles = new Set<number>();
  private continueWaiter: (() => void) | null = null;
  private historyRecorded = false;
  private hintShownThisGame = false;
  private scale = 1;

  constructor(private readonly root: HTMLElement) {
    this.sound.enabled = this.settings.sound;
    this.buildShell();
    this.fit();
    window.addEventListener("resize", () => this.fit());
    this.applyTheme();
    this.renderHome();
    this.showScreen("home");
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

  private buildShell(): void {
    this.root.innerHTML = "";
    const sprite = h("div", { "aria-hidden": "true" });
    sprite.innerHTML = TILE_SPRITE_SVG;
    this.root.append(sprite);
    this.stage = h("div", { id: "stage" });
    this.root.append(this.stage);
    for (const name of ["home", "table", "rules", "settings", "about", "results"] as ScreenName[]) {
      const s = h("section", { class: "screen", id: `screen-${name}` });
      this.screens.set(name, s);
      this.stage.append(s);
    }
    this.tableEl = h("div", { id: "table" });
    this.screens.get("table")!.append(this.tableEl);
    this.buildTextScreens();
  }

  private fit(): void {
    this.scale = Math.min(window.innerWidth / 390, window.innerHeight / 844, 1.75);
    this.stage.style.transform = `scale(${this.scale})`;
  }

  private showScreen(name: ScreenName): void {
    for (const [n, el] of this.screens) el.classList.toggle("active", n === name);
    if (name === "home") this.renderHome();
    if (name === "settings") this.renderSettings();
  }

  private applyTheme(): void {
    // Dark theme only (Michael, 2026-11-16).
    document.documentElement.dataset["theme"] = "dark";
    document.documentElement.classList.toggle("large", this.settings.largeTiles);
  }

  // -- home ------------------------------------------------------------------

  private renderHome(): void {
    const el = this.screens.get("home")!;
    el.innerHTML = "";
    const saved = loadGame();
    const history = loadHistory().slice(-3).reverse();

    el.append(h("div", { class: "spacer" }));
    const wm = h("div", { class: "wordmark" }, "OPEN MAHJONG");
    wm.append(h("span", { class: "sub" }, "Free forever."));
    el.append(wm);

    const seg = h("div", { class: "seg" });
    const mkSeg = (label: string, len: GameLength) => {
      const b = h("button", { class: this.settings.lastLength === len ? "on" : "" }, label);
      b.addEventListener("click", () => {
        this.settings = { ...this.settings, lastLength: len };
        saveSettings(this.settings);
        this.renderHome();
      });
      return b;
    };
    seg.append(mkSeg("East only", "east"), mkSeg("East + South", "south"));
    el.append(seg);

    const play = h("button", { class: "pillbtn primary play" }, "Play");
    play.addEventListener("click", () => {
      this.sound.unlock();
      this.startGame(this.settings.lastLength);
    });
    el.append(play);

    if (saved) {
      const resume = h("button", { class: "pillbtn ghost resume" }, "Resume game");
      resume.addEventListener("click", () => {
        this.sound.unlock();
        this.resumeGame();
      });
      el.append(resume);
    }

    if (history.length > 0) {
      const box = h("div", { class: "history" });
      box.append(h("h3", {}, "RECENT GAMES"));
      for (const line of history) {
        const d = new Date(line.date);
        box.append(
          h(
            "div",
            { class: "row" },
            h("span", {}, `${d.toLocaleDateString()} · ${line.length === "east" ? "East" : "East+South"}`),
            h("span", {}, `Placed `, h("b", {}, `#${line.humanRank}`), ` · ${fmt(line.scores[0] ?? 0)}`),
          ),
        );
      }
      el.append(box);
    }

    el.append(h("div", { class: "spacer" }));
    const quiet = h("div", { class: "quietrow" });
    for (const [label, screen] of [["Rules", "rules"], ["Settings", "settings"], ["About", "about"]] as [string, ScreenName][]) {
      const b = h("button", { class: "linkbtn" }, label);
      b.addEventListener("click", () => this.showScreen(screen));
      quiet.append(b);
    }
    el.append(quiet);
  }

  // -- text screens ----------------------------------------------------------

  private buildPage(title: string): HTMLElement {
    const page = h("div", { class: "page" });
    page.append(h("h2", {}, title));
    return page;
  }

  private textScreen(name: ScreenName, title: string, fill: (page: HTMLElement) => void): void {
    const screen = this.screens.get(name)!;
    screen.innerHTML = "";
    const bar = h("header", { class: "bar" });
    const back = h("button", { class: "iconbtn", "aria-label": "Back" });
    back.innerHTML = `<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>`;
    back.addEventListener("click", () => this.showScreen(this.runner && !this.runner.result ? "table" : "home"));
    bar.append(back, h("span", { class: "word" }, "OPEN MAHJONG"), h("span", { class: "iconbtn" }));
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
        h("h3", {}, "Stakes and settlement"),
        h("ul", {},
          li("Start 25,000 points; return 30,000. Uma +15 / +5 / −5 / −15, oka 20 to first place. Tied seats split the uma (and oka) of the ranks they occupy."),
          li("A game ends early (tobi) as soon as any player is below zero at the end of a hand."),
          li("Riichi sticks left on the table when the game ends go to the first-place player."),
          li("If the dealer repeats on the final hand, the game extends until a hand ends without a dealer repeat (no agari-yame)."),
        ),
        h("h3", {}, "Hands and calls"),
        h("ul", {},
          li("Red fives (aka dora) are in: one each of 5m, 5p, 5s. Open tanyao is allowed."),
          li("Chi may only be called from the player on your left. Pon and kan from anyone."),
          li("Double ron does not pay twice: atama-hane (head bump) — the winner nearest the discarder in turn order takes all."),
          li("Chankan (robbing a kan) applies to shouminkan; against an ankan only kokushi may rob."),
        ),
        h("h3", {}, "Riichi"),
        h("ul", {},
          li("Riichi costs 1,000 points, needs a closed tenpai hand, at least 1,000 points, and at least 4 tiles left in the wall."),
          li("Ippatsu and double riichi count. After riichi you discard what you draw; an ankan is allowed only if it leaves your waits unchanged."),
          li("Furiten applies in all three forms: discard furiten, temporary furiten (passing a winning tile blocks ron until your next draw), and riichi furiten (permanent after passing in riichi)."),
        ),
        h("h3", {}, "Dora"),
        h("ul", {},
          li("One indicator at the start; each kan flips one more (ankan flips before the rinshan draw; open kans flip after it). Uradora are revealed under the indicators when a riichi hand wins."),
          li("Kiriage mangan is OFF: 4 han 30 fu is 7,700 (dealer 11,600), 3 han 60 fu is 7,700 — no rounding up to mangan."),
        ),
        h("h3", {}, "Draws"),
        h("ul", {},
          li("Exhaustive draw: tenpai players split 3,000 from noten players. Nagashi mangan pays as a mangan tsumo instead, when a player's discards are all terminals/honors and none were called."),
          li("Abortive draws are on: kyuushu kyuuhai (nine different terminals/honors on your first draw), suufon renda (all four first discards the same wind), suucha riichi (four riichi), and suukaikan (four kan by two or more players). The hand restarts with one more honba; the dealer repeats."),
        ),
      );
    });

    this.textScreen("about", "About", (page) => {
      page.append(
        h("p", {}, "Open Mahjong is a free, open-source mahjong platform — the lichess of mahjong. Riichi ships first; Hong Kong, MCR, and American rules follow as rule packs on the same engine."),
        h("p", {}, "Free forever. Your settings and game history live only in this browser."),
        h("h3", {}, "License"),
        h("p", {}, "Open Mahjong is free software under the GNU Affero General Public License v3 (AGPLv3). The rules engine is its own TypeScript library, so anyone can build their own client on it."),
        h("h3", {}, "Source"),
        (() => {
          const para = h("p", {});
          const a = h("a", { href: "https://github.com/michaelhmiv/OpenMahjong", target: "_blank", rel: "noreferrer" }, "github.com/michaelhmiv/OpenMahjong");
          para.append(a);
          return para;
        })(),
      );
    });
  }

  private renderSettings(): void {
    this.textScreen("settings", "Settings", (page) => {
      const row = (label: string, note: string, control: HTMLElement) => {
        const wrap = h("div", { class: "setrow" });
        const lab = h("div", {});
        lab.append(h("div", { class: "lab" }, label), h("div", { class: "note" }, note));
        wrap.append(lab, control);
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

      page.append(
        row("Sound", "Quiet tile clicks only. No music, no voices.", toggle(this.settings.sound, false, (v) => {
          this.settings = { ...this.settings, sound: v };
          this.sound.enabled = v;
          saveSettings(this.settings);
        })),
        row("Reduced motion", "Collapses animation to near-instant. Your operating system's reduced-motion setting is always respected too.", toggle(this.settings.motion === "reduced", false, (v) => {
          this.settings = { ...this.settings, motion: v ? "reduced" : "standard" };
          saveSettings(this.settings);
        })),
        row("Large tiles", "Hand tiles step up to 28px in two rows of seven; ponds step down to 22px; the panel type grows. The approved large layout (table-large-v1).", toggle(this.settings.largeTiles, false, (v) => {
          this.settings = { ...this.settings, largeTiles: v };
          saveSettings(this.settings);
          this.applyTheme();
          if (this.runner) this.renderTable();
        })),
      );
    });
  }

  // -- game lifecycle --------------------------------------------------------

  private startGame(length: GameLength): void {
    this.generation++;
    const seed = `om-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
    this.runner = new GameRunner({ seed, length, humanSeat: 0, aiDriver: new AiDriver() });
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
    this.generation++;
    this.runner = GameRunner.restore(saved, new AiDriver());
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
      if (!this.historyRecorded) {
        this.historyRecorded = true;
        const mine = this.runner.result.settlement.find((s) => s.seat === this.humanSeat);
        appendHistory({
          date: new Date().toISOString(),
          length: this.runner.length,
          scores: this.runner.result.scores,
          humanRank: mine?.rank ?? 0,
        });
      }
    } else {
      saveGame(this.runner.serialize());
    }
  }

  private quitToHome(): void {
    this.generation++;
    this.playing = false;
    this.frame = null;
    this.showScreen("home");
  }

  private restartGame(): void {
    if (!this.runner) return;
    clearGame();
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
      this.showHint("Tap any pond to inspect it up close — melds included.");
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
      const d = h("span", { class: "dealer" }, `${wind} · You`);
      chip.append(d, document.createTextNode(`  `));
    } else {
      chip.append(document.createTextNode(`${wind}${p.riichi ? " · Riichi" : ""}  `));
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
      wrap.append(tileEl(tile, `${cls} ${side ? "side" : ""}`));
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
    const m = this.model;
    const t = this.tableEl;
    t.innerHTML = "";
    t.className = this.frame ? "framed" : "";
    t.id = "table";
    if (this.riichiArmed) t.classList.add("armed");

    // Header
    const header = h("header", { class: "bar" });
    const menuBtn = h("button", { class: "iconbtn", "aria-label": "Menu" });
    menuBtn.innerHTML = ICON_MENU;
    menuBtn.addEventListener("click", () => this.showPause());
    const soundBtn = h("button", { class: "iconbtn", "aria-label": "Sound" });
    soundBtn.innerHTML = this.settings.sound ? ICON_SOUND_ON : ICON_SOUND_OFF;
    soundBtn.addEventListener("click", () => {
      this.settings = { ...this.settings, sound: !this.settings.sound };
      this.sound.enabled = this.settings.sound;
      saveSettings(this.settings);
      this.renderTable();
    });
    header.append(menuBtn, h("span", { class: "word" }, "OPEN MAHJONG"), soundBtn);
    t.append(header);

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
    const expandBtn = h("button", {}, "Inspect hand");
    expandBtn.innerHTML = `${ICON_EXPAND}<span>Inspect hand</span>`;
    expandBtn.addEventListener("click", () => this.openFrame({ kind: "hand", mode: "inspect" }));
    handctl.append(expandBtn);
    zonePlayer.append(handctl);
    t.append(zonePlayer);

    // Focus frame layer
    if (this.frame) {
      const scrim = h("button", { class: "scrim", "aria-label": "Close" });
      scrim.addEventListener("click", () => this.closeFrame());
      t.append(scrim);
      t.append(this.frameEl());
    }
  }

  private centerEl(): HTMLElement {
    const m = this.model;
    const center = h("button", { class: "center", "aria-label": "Round details" });
    const round = h("div", { class: "round" });
    const wind = h("span", { class: "wind kj" }, WIND_KANJI[m.roundWind]!);
    const rname = h("span", { class: "rname" }, `${WIND_NAMES[m.roundWind]} ${m.kyoku}`);
    round.append(wind, rname);
    center.append(round);
    center.append(h("div", { class: "sub" }, `${m.honba} honba · Wall ${m.wallRemaining}`));
    if (m.sticks > 0) {
      const sr = h("div", { class: "stickrow" });
      sr.append(h("span", { class: "stick" }), h("span", { class: "n" }, `× ${m.sticks}`));
      center.append(sr);
    }
    const dr = h("div", { class: "dorarow" });
    dr.append(h("span", { class: "lbl" }, "Dora"));
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
    const { tiles, drawnId } = this.handTilesSorted();
    const size = this.handTileSize();
    const pending = this.runner?.pending;
    const myTurn = pending?.kind === "turn" && !this.playing;
    tiles.forEach((tile, idx) => {
      const isDrawn = drawnId !== null && tile.id === drawnId && idx === tiles.length - 1;
      const wrap = tileEl(tile, "t-hand");
      const inner = wrap.firstElementChild as HTMLElement;
      if (size !== 25) {
        inner.style.width = `${size}px`;
        inner.style.height = `${Math.round(size * 1.4)}px`;
      }
      if (isDrawn) wrap.classList.add("drawn-host");
      if (isDrawn) inner.classList.add("drawn");
      if (this.selectedTileId === tile.id) inner.classList.add("sel");
      if (this.riichiArmed && pending?.kind === "turn" && pending.ctx.riichiDiscardIds.includes(tile.id)) {
        inner.classList.add("riichi-ok");
      }
      wrap.addEventListener("click", () => this.onHandTileTap(tile));
      row.append(wrap);
    });
    for (const meld of me.melds) row.append(this.meldEl(meld, "t-meld", me.seat));
    return row;
  }

  private onHandTileTap(tile: Tile): void {
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

    if (pending.kind === "call") {
      const ctx = pending.ctx;
      row.classList.add("show");
      if (ctx.canRon) row.append(btn("Ron", "ron", () => this.humanAct({ type: "ron" })));
      if (ctx.phase === "call" && pending.ponDecidable) {
        if (ctx.canPon) row.append(btn("Pon", "pon", () => this.humanAct({ type: "pon" })));
        if (ctx.canKan) row.append(btn("Kan", "pon", () => this.humanAct({ type: "daiminkan" })));
      }
      if (ctx.phase === "call" && pending.chiDecidable) {
        if (ctx.chiOptions.length === 1) {
          row.append(btn("Chi", "chi", () => this.humanAct({ type: "chi", tileIds: ctx.chiOptions[0]! })));
        } else if (ctx.chiOptions.length > 1) {
          row.append(btn("Chi", "chi", () => this.openFrame({ kind: "hand", mode: "chi" })));
        }
      }
      row.append(btn("Pass", "pass", () => this.humanAct({ type: "pass" })));
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
      row.append(btn("Riichi", "riichi", () => {}));
      row.append(btn("Cancel", "pass", () => {
        this.riichiArmed = false;
        this.renderTable();
      }));
      return row;
    }
    if (ctx.canTsumo) {
      row.classList.add("show");
      row.append(btn("Tsumo", "tsumo", () => this.humanAct({ type: "tsumo" })));
    }
    if (selectedRiichi) {
      row.classList.add("show");
      row.append(btn("Riichi", "riichi", () =>
        this.humanAct({ type: "discard", tileId: selected!.id, riichi: true }),
      ));
    } else if (ctx.riichiDiscardIds.length > 0 && !this.riichiDismissed && !selected) {
      row.classList.add("show");
      row.append(btn("Riichi", "riichi", () => {
        this.riichiArmed = true;
        this.renderTable();
      }));
      row.append(btn("Pass", "pass", () => {
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
      row.append(btn("Kan", "pon", () => this.humanAct(action)));
    } else if (kanCount > 1) {
      row.classList.add("show");
      row.append(btn("Kan", "pon", () => this.openFrame({ kind: "hand", mode: "kan" })));
    }
    if (ctx.canKyuushu) {
      row.classList.add("show");
      row.append(btn("Kyuushu", "pass", () => this.humanAct({ type: "kyuushu" })));
    }
    return row;
  }

  // -- focus frames ---------------------------------------------------------------

  private openFrame(frame: NonNullable<FrameState>): void {
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
    // Tiles that changed while zoomed pulse briefly on the table (§8).
    for (const id of changed) {
      const el = this.tableEl.querySelector(`[data-flip="tile-${id}"] .tile`);
      el?.classList.add("pulse");
    }
  }

  private frameEl(): HTMLElement {
    const frame = this.frame!;
    if (frame.kind === "hand") return this.handSheetEl(frame.mode);
    if (frame.kind === "center") return this.centerFrameEl();
    return this.playerFrameEl(frame.seat);
  }

  private frameShell(title: string, sub: string): { frame: HTMLElement; head: HTMLElement } {
    const frame = h("div", { class: "frame" });
    const head = h("div", { class: "fhead" });
    const left = h("div", {});
    left.append(h("div", { class: "ftitle" }, title), h("div", { class: "fsub" }, sub));
    const close = h("button", { class: "fclose", "aria-label": "Close" });
    close.innerHTML = ICON_CLOSE;
    close.addEventListener("click", () => this.closeFrame());
    head.append(left, close);
    frame.append(head);
    return { frame, head };
  }

  private playerFrameEl(seat: Seat): HTMLElement {
    const m = this.model;
    const p = m.players[seat]!;
    const title = `${WIND_NAMES[p.seatWind]}${seat === this.humanSeat ? " · You" : ""}`;
    const { frame } = this.frameShell(
      title,
      `${fmt(p.score)} points${p.isDealer ? " · Dealer" : ""}`,
    );
    if (p.riichi) {
      frame.querySelector(".ftitle")!.append(h("span", { class: "pill" }, p.doubleRiichi ? "Double Riichi" : "Riichi"));
    }
    frame.append(h("div", { class: "fsec" }, "DISCARDS"));
    const fpond = h("div", { class: "fpond" });
    const entries = p.pond.filter((e) => !e.called);
    entries.forEach((e, i) => {
      const cell = h("span", { class: `cell ${e.tsumogiri ? "tg" : ""}` });
      if (e.riichiDeclaration) cell.classList.add("riichi");
      if (i === entries.length - 1) cell.classList.add("latest");
      cell.append(tileEl(e.tile, "", { flip: false }));
      fpond.append(cell);
    });
    if (entries.length === 0) fpond.append(h("span", { class: "fsub" }, "No discards yet"));
    frame.append(fpond);
    const legend = h("div", { class: "legend" });
    const li1 = h("span", { class: "li" });
    li1.append(h("span", { class: "swatch dim" }), document.createTextNode("Drawn discard (tsumogiri)"));
    const li2 = h("span", { class: "li" });
    li2.append(h("span", { class: "swatch" }), document.createTextNode("Hand discard (tedashi)"));
    legend.append(li1, li2);
    frame.append(legend);

    frame.append(h("div", { class: "fsec" }, "MELDS"));
    if (p.melds.length === 0) {
      frame.append(h("div", { class: "fsub" }, "None — closed hand"));
    } else {
      const row = h("div", { class: "fmelds" });
      for (const meld of p.melds) row.append(this.meldEl(meld, "fmeld", seat));
      frame.append(row);
    }

    frame.append(h("div", { class: "fsec" }, "YOUR HAND"));
    const anchor = h("div", { class: "anchor" });
    const { tiles } = this.handTilesSorted();
    for (const tile of tiles) anchor.append(tileEl(tile, "t-meld", { flip: false }));
    frame.append(anchor);

    if (this.runner?.pending?.kind === "turn" && !this.playing) {
      frame.append(h("div", { class: "turnbanner" }, "Your turn — close this view to play."));
    }
    return frame;
  }

  private centerFrameEl(): HTMLElement {
    const m = this.model;
    const { frame } = this.frameShell(
      "Round",
      `${m.honba} honba · Wall ${m.wallRemaining} · ${m.sticks} riichi stick${m.sticks === 1 ? "" : "s"} on the table`,
    );
    const crow = h("div", { class: "crow" });
    crow.append(
      h("span", { class: "wind kj" }, WIND_KANJI[m.roundWind]!),
      h("span", { class: "rname" }, `${WIND_NAMES[m.roundWind]} ${m.kyoku}`),
    );
    frame.append(crow);
    frame.append(h("div", { class: "fsec" }, "DORA — INDICATOR SHOWS DORA"));
    const doraTypes = m.doraTypes();
    m.doraIndicators.forEach((ind, i) => {
      const row = h("div", { class: "dpair" });
      const doraTile = tileById(doraTypes[i]! * 4 + 1);
      row.append(
        tileEl(ind, "ind", { flip: false }),
        h("span", { class: "arr" }, "→"),
        tileEl(doraTile, "dor", { flip: false }),
        h("span", { class: "dlab" }, tileLabel(doraTile)),
      );
      frame.append(row);
    });
    frame.append(h("div", { class: "fsec" }, "SCORES"));
    for (let rel = 0; rel < 4; rel++) {
      const seat = this.seatAt(rel);
      const p = m.players[seat]!;
      const row = h("div", { class: "scorerow" });
      const who = h("span", { class: "who" });
      who.append(
        h("b", {}, WIND_NAMES[p.seatWind]!),
        document.createTextNode(
          `${seat === this.humanSeat ? " · You" : ""}${p.isDealer ? " · Dealer" : ""}${p.riichi ? " · Riichi" : ""}`,
        ),
      );
      row.append(who, h("span", {}, fmt(p.score)));
      frame.append(row);
    }
    if (this.runner?.pending?.kind === "turn" && !this.playing) {
      frame.append(h("div", { class: "turnbanner" }, "Your turn — close this view to play."));
    }
    return frame;
  }

  private handSheetEl(mode: "inspect" | "chi" | "kan"): HTMLElement {
    const sheet = h("div", { class: "sheet" });
    const pending = this.runner?.pending;
    const { tiles, drawnId } = this.handTilesSorted();
    const selected = this.selectedTileId !== null ? tileById(this.selectedTileId) : null;

    if (selected && mode === "inspect") {
      const preview = h("div", { class: "selpreview" });
      preview.append(tileEl(selected, "", { flip: false }));
      const readout = h("div", { class: "readout" },
        `Selected — ${tileLabel(selected)}`,
      );
      readout.append(h("span", { class: "dim" },
        drawnId === selected.id ? "Your draw" : tileTypeName(selected.type),
      ));
      preview.append(readout);
      sheet.append(preview);
    } else {
      const { frame: headShell } = this.frameShell(
        mode === "chi" ? "Choose a chi" : mode === "kan" ? "Declare a kan" : "Your hand",
        mode === "inspect" ? "Tap a tile to select it. Everything here is playable." : "Pick one — it happens right away.",
      );
      sheet.append(...headShell.childNodes);
      // frameShell builds a .frame; reuse only its header row.
      sheet.firstElementChild!.classList.remove("frame");
    }

    const grid = h("div", { class: "hgrid" });
    tiles.forEach((tile, idx) => {
      const cell = h("span", { class: "cell" });
      if (drawnId === tile.id && idx === tiles.length - 1) cell.classList.add("drawn");
      if (this.selectedTileId === tile.id) cell.classList.add("sel");
      cell.append(tileEl(tile, "", { flip: false }));
      cell.addEventListener("click", () => {
        this.sound.unlock();
        this.selectedTileId = tile.id;
        if (this.frame?.kind === "hand") this.renderTable();
      });
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
        const names = option.map((id) => tileTypeName(tileById(id).type)).join(" · ");
        act.append(hbtn(`Chi ${names}`, "primary", () => {
          this.closeFrame();
          this.humanAct({ type: "chi", tileIds: option });
        }));
      }
    } else if (mode === "kan" && pending?.kind === "turn") {
      for (const t of pending.ctx.ankanOptions) {
        act.append(hbtn(`Kan ${tileTypeName(t)} (closed)`, "primary", () => {
          this.closeFrame();
          this.humanAct({ type: "ankan", tileType: t });
        }));
      }
      for (const t of pending.ctx.shouminkanOptions) {
        act.append(hbtn(`Kan ${tileTypeName(t)} (added)`, "primary", () => {
          this.closeFrame();
          this.humanAct({ type: "shouminkan", tileType: t });
        }));
      }
    } else if (pending?.kind === "turn" && !this.playing) {
      const ctx = pending.ctx;
      if (selected && ctx.riichiDiscardIds.includes(selected.id)) {
        act.append(hbtn("Riichi + discard", "decisive", () => {
          this.closeFrame();
          this.humanAct({ type: "discard", tileId: selected.id, riichi: true });
        }));
      }
      if (selected) {
        act.append(hbtn("Discard", "primary", () => {
          this.closeFrame();
          this.humanAct({ type: "discard", tileId: selected.id });
        }));
      }
      if (ctx.canTsumo) {
        act.append(hbtn("Tsumo", "decisive", () => {
          this.closeFrame();
          this.humanAct({ type: "tsumo" });
        }));
      }
      if (ctx.ankanOptions.length + ctx.shouminkanOptions.length > 0) {
        act.append(hbtn("Kan…", "", () => {
          this.frame = { kind: "hand", mode: "kan" };
          this.renderTable();
        }));
      }
      if (ctx.canKyuushu) {
        act.append(hbtn("Kyuushu", "", () => {
          this.closeFrame();
          this.humanAct({ type: "kyuushu" });
        }));
      }
    } else if (pending?.kind === "call" && !this.playing) {
      const ctx = pending.ctx;
      if (ctx.canRon) act.append(hbtn("Ron", "decisive", () => {
        this.closeFrame();
        this.humanAct({ type: "ron" });
      }));
      if (ctx.phase === "call" && pending.ponDecidable && ctx.canPon) act.append(hbtn("Pon", "primary", () => {
        this.closeFrame();
        this.humanAct({ type: "pon" });
      }));
      if (ctx.phase === "call" && pending.chiDecidable && ctx.chiOptions.length > 0) {
        act.append(hbtn("Chi…", "primary", () => {
          this.frame = { kind: "hand", mode: "chi" };
          this.renderTable();
        }));
      }
      act.append(hbtn("Pass", "", () => {
        this.closeFrame();
        this.humanAct({ type: "pass" });
      }));
    }
    if (act.childNodes.length > 0) sheet.append(act);
    return sheet;
  }

  // -- pause + breakdown + results -------------------------------------------------

  private showPause(): void {
    const overlay = h("div", { class: "overlay show" });
    const card = h("div", { class: "card" });
    card.append(h("h2", {}, "Paused"), h("div", { class: "sub" }, "The game waits — nothing moves without you."));
    const col = h("div", { class: "col" });
    const mk = (label: string, cls: string, fn: () => void) => {
      const b = h("button", { class: `pillbtn ${cls}` }, label);
      b.addEventListener("click", fn);
      return b;
    };
    col.append(
      mk("Resume", "primary", () => overlay.remove()),
      mk(this.settings.sound ? "Sound: on" : "Sound: off", "ghost", () => {
        this.settings = { ...this.settings, sound: !this.settings.sound };
        this.sound.enabled = this.settings.sound;
        saveSettings(this.settings);
        overlay.remove();
        this.renderTable();
      }),
      mk("Restart game", "", () => {
        overlay.remove();
        this.restartGame();
      }),
      mk("Quit to home", "", () => {
        overlay.remove();
        this.quitToHome();
      }),
    );
    card.append(col);
    overlay.append(card);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
    this.tableEl.append(overlay);
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
      const cont = h("button", { class: "pillbtn primary" }, nextIsGameEnd ? "Final results" : "Next hand");
      cont.style.width = "100%";
      cont.style.marginTop = "16px";
      cont.addEventListener("click", () => {
        overlay.remove();
        resolve();
      });
      card.append(cont);
      overlay.append(card);
      this.tableEl.append(overlay);
    });
  }

  private fillWinBreakdown(card: HTMLElement, win: WinInfo): void {
    const winner = this.model.players[win.seat]!;
    const title = win.winType === "ron" ? `Ron — ${WIND_NAMES[winner.seatWind]}` : `Tsumo — ${WIND_NAMES[winner.seatWind]}`;
    card.append(h("h2", {}, title));
    if (win.winType === "ron" && win.fromSeat !== undefined) {
      const from = this.model.players[win.fromSeat]!;
      card.append(h("div", { class: "sub" }, `On ${WIND_NAMES[from.seatWind]}'s discard`));
    }
    const handRow = h("div", { class: "bk-hand" });
    for (const meld of win.winnerMelds) handRow.append(this.meldEl(meld, "t-meld", win.seat));
    const sorted = [...win.handTiles].sort((a, b) => a.type - b.type || a.id - b.id);
    for (const tile of sorted) handRow.append(tileEl(tile, "", { flip: false }));
    const winWrap = tileEl(win.winningTile, "win", { flip: false });
    handRow.append(winWrap);
    card.append(handRow);

    const yakuBox = h("div", { class: "bk-yaku" });
    let yakuHan = 0;
    for (const id of win.yaku) {
      const [name, han] = YAKU[id] ?? [id, 0];
      yakuHan += han;
      const row = h("div", { class: "row" });
      row.append(h("span", {}, name), h("span", { class: "han" }, win.yakumanMultiple > 0 ? "Yakuman" : `${han} han`));
      yakuBox.append(row);
    }
    if (win.yakumanMultiple === 0) {
      const dora = Math.max(0, win.han - yakuHan);
      if (dora > 0) {
        const row = h("div", { class: "row" });
        row.append(h("span", {}, "Dora"), h("span", { class: "han" }, `${dora} han`));
        yakuBox.append(row);
      }
      const total = h("div", { class: "row total" });
      const gained = win.payments.reduce((s, p) => s + p.amount, 0) + win.stickPoints;
      total.append(
        h("span", {}, `${win.han} han · ${win.fu} fu`),
        h("span", {}, `${fmt(gained)}`),
      );
      yakuBox.append(total);
    } else {
      const total = h("div", { class: "row total" });
      const gained = win.payments.reduce((s, p) => s + p.amount, 0) + win.stickPoints;
      total.append(
        h("span", {}, win.yakumanMultiple > 1 ? `Double Yakuman ×${win.yakumanMultiple}` : "Yakuman"),
        h("span", {}, `${fmt(gained)}`),
      );
      yakuBox.append(total);
    }
    card.append(yakuBox);

    const pay = h("div", { class: "bk-pay" });
    for (const p of win.payments) {
      const payer = this.model.players[p.seat]!;
      pay.append(h("div", {}, `${WIND_NAMES[payer.seatWind]} pays `, h("b", {}, fmt(p.amount))));
    }
    if (win.stickPoints > 0) {
      pay.append(h("div", {}, `Riichi sticks `, h("b", {}, `+${fmt(win.stickPoints)}`)));
    }
    card.append(pay);

    const doraRow = h("div", { class: "bk-dora" });
    doraRow.append(h("span", { class: "lbl" }, "Dora indicator"));
    for (const ind of this.model.doraIndicators) doraRow.append(tileEl(ind, "", { flip: false }));
    card.append(doraRow);
    if (winner.riichi) {
      const ura = this.model.uraIndicators();
      if (ura) {
        const uraRow = h("div", { class: "bk-dora" });
        uraRow.append(h("span", { class: "lbl" }, "Uradora indicator"));
        for (const ind of ura) uraRow.append(tileEl(ind, "", { flip: false }));
        card.append(uraRow);
      }
    }
  }

  private fillDrawBreakdown(card: HTMLElement, drawn: NonNullable<TableModel["lastDrawnHand"]>): void {
    if (drawn.kind === "abortive") {
      card.append(
        h("h2", {}, "Hand drawn"),
        h("div", { class: "sub" }, ABORTIVE_NAMES[drawn.abortive ?? ""] ?? "Abortive draw"),
        h("p", { class: "dim" }, "The hand restarts with one more honba. The dealer repeats."),
      );
      return;
    }
    card.append(h("h2", {}, "Exhaustive draw"));
    if (drawn.nagashi && drawn.nagashi.length > 0) {
      const names = drawn.nagashi.map((s) => WIND_NAMES[this.model.players[s]!.seatWind]).join(", ");
      card.append(h("div", { class: "sub" }, `Nagashi mangan: ${names} — pays as a mangan tsumo.`));
    } else {
      const names = (drawn.tenpai ?? []).map((s) => WIND_NAMES[this.model.players[s]!.seatWind]).join(", ") || "None";
      card.append(h("div", { class: "sub" }, `Tenpai: ${names}. Tenpai players split 3,000 from noten players.`));
    }
    for (const [seat, tiles] of drawn.revealedHands) {
      const p = this.model.players[seat]!;
      const label = h("div", { class: "fsec" }, `${WIND_NAMES[p.seatWind]}${seat === this.humanSeat ? " · YOU" : ""} — TENPAI`);
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
    bar.append(h("span", { class: "iconbtn" }), h("span", { class: "word" }, "OPEN MAHJONG"), h("span", { class: "iconbtn" }));
    screen.append(bar);
    const page = this.buildPage("Final results");
    const table = h("div", { class: "results-table" });
    const sorted = [...result.settlement].sort((a, b) => a.rank - b.rank || a.seat - b.seat);
    for (const entry of sorted) {
      const p = this.model.players[entry.seat]!;
      const row = h("div", { class: "row" });
      const pts = `${entry.points > 0 ? "+" : ""}${entry.points.toFixed(1)}`;
      row.append(
        h("span", { class: "rank" }, `${entry.rank}`),
        h("span", { class: "who" }, entry.seat === this.humanSeat ? "You" : WIND_NAMES[p.seatWind]!),
        h("span", { class: "score" }, fmt(entry.score)),
        h("span", { class: `pts ${entry.points > 0 ? "pos" : entry.points < 0 ? "neg" : ""}` }, pts),
      );
      table.append(row);
    }
    page.append(table);
    page.append(h("p", { class: "dim" }, "Points include uma (+15/+5/−5/−15) and the 20-point oka to first place."));
    const col = h("div", { class: "col" });
    col.style.display = "flex";
    col.style.flexDirection = "column";
    col.style.gap = "10px";
    col.style.marginTop = "18px";
    const again = h("button", { class: "pillbtn primary" }, "Play again");
    again.addEventListener("click", () => this.startGame(this.runner?.length ?? "south"));
    const home = h("button", { class: "pillbtn ghost" }, "Home");
    home.addEventListener("click", () => this.showScreen("home"));
    col.append(again, home);
    page.append(col);
    screen.append(page);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}
