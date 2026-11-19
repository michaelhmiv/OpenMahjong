/**
 * Multiplayer UI v1 (approved renderings multiplayer-ui-v1, Michael
 * 2026-11-18; governing design skill: Impeccable). This module is a
 * wholesale replacement of PR #87's rejected web UI on its preserved
 * backend: the same endpoints, SSE stream and payloads, re-housed in
 * the app's shipped surfaces.
 *
 * - The lobby is Option B: the Play tab itself, with a Solo/Online
 *   segment — one scrolling surface carrying the setup segments, the
 *   queue actions, public Friendly seats, My games and the identity
 *   row.
 * - Guest entry, recovery, join-by-link, the waiting room (host /
 *   guest / Friendly queue / Ranked queue) and the room offer are
 *   sheets or cards over that lobby, never separate pages.
 * - The online table IS the solo four-sided table: the same DOM and
 *   classes renderTable() builds in app.ts, with online states in
 *   its furniture (clock row in the center panel, the riichi point
 *   stick on a chip, bot cover as a strip + cover bar).
 * - Results ride the solo results grammar plus a rating block.
 * - Analyze stays the existing Board review, untouched.
 */
import {
  tileName,
  type CallAction,
  type TurnAction,
  type VariantPublicView,
  type Tile,
  type SettlementEntry,
} from "@openmahjong/engine";
import { API_BASE } from "./api.js";
import { tileLabel, tileSymbol } from "./app.js";
import { TILE_SPRITE_SVG } from "./tiles-sprite.js";
import { tileIndexEl } from "./tile-index.js";
import type { ReconstructedReview } from "./review.js";
import { BoardTimeline } from "./board-review.js";
import { mountBoardReview } from "./board-review-ui.js";
import "./online.css";

type Action = TurnAction | CallAction;
type Profile = {
  name: string;
  account: boolean;
  csrf: string;
  recovery?: string;
};
type Pace = "live" | "relaxed" | "correspondence";
type Format = { variant: string; length: string; pace: Pace };
type Summary = Format & {
  id: string;
  origin: string;
  state: string;
  yourMove?: boolean;
};
type Lobby = {
  games: Summary[];
  open: (Summary & { occupied: number; bots: number; host?: string | null })[];
  enabled: Record<string, boolean>;
};
type Snapshot = Summary & {
  host: boolean;
  generation: number;
  controlling: boolean;
  redirect?: string;
  offer?: (Format & {
    id: string;
    occupied: number;
    bots: number;
    expires_at: string;
    host?: string | null;
  }) | null;
  ratingVoid?: string;
  handResult?: { kind: string; seat?: number; han?: number };
  listed: boolean;
  invite: string | null;
  seat: number;
  seats: {
    seat: number;
    name: string;
    bot: boolean;
    covered: boolean;
    endRequested: boolean;
    coverAt: number | null;
    ready: boolean;
    host?: boolean;
  }[];
  choices?: Action[];
  claimTile?: Tile;
  revision?: number;
  view?: VariantPublicView;
  deadline?: number | null;
  reserve?: number | null;
  result?: SettlementEntry[];
  ratings?: { seat: number; before_rating: number; after_rating: number }[];
};
const variants: Record<string, string> = {
  riichi: "Riichi",
  "hong-kong": "Hong Kong Old Style",
  mcr: "MCR",
  taiwanese: "Taiwanese",
};
const lengths: Record<string, string> = {
  east: "East only",
  south: "East + South",
  full: "Four rounds",
};
const paceLabels: Record<Pace, string> = {
  live: "Live · 5+20",
  relaxed: "Relaxed · 10+40",
  correspondence: "Correspondence",
};
const paceShort: Record<Pace, string> = {
  live: "Live",
  relaxed: "Relaxed",
  correspondence: "Correspondence",
};
const winds = ["East", "South", "West", "North"];
const windKanji = ["東", "南", "西", "北"];
const originLabels: Record<string, string> = {
  friendly: "Friendly",
  ranked: "Ranked",
  custom: "Custom room",
};
const ICON_MENU = `<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`;
const ICON_SOUND_ON = `<svg viewBox="0 0 24 24"><path d="M4 10v4h3l5 4V6l-5 4H4z"/><path d="M16 9c1.2 1.6 1.2 4.4 0 6M18.5 6.5c2.4 3.2 2.4 7.8 0 11"/></svg>`;
const ICON_SOUND_OFF = `<svg viewBox="0 0 24 24"><path d="M4 10v4h3l5 4H4z"/><path d="M16.5 9.5l5 5m0-5l-5 5"/></svg>`;
const ICON_EXPAND = `<svg viewBox="0 0 24 24"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/></svg>`;
const ICON_CLOSE = `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
const FRIENDS_ICON =
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
  `<circle cx="9" cy="8" r="3.5"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/>` +
  `<path d="M16 5.5a3.5 3.5 0 0 1 0 6.5M17.5 14.5c1.8.7 3 2.3 3 4.5"/></svg>`;
const TAB_DEFS: { name: string; label: string; icon: string }[] = [
  {
    name: "home",
    label: "Play",
    icon: `<rect x="5" y="3" width="14" height="18" rx="3"/><circle cx="9.2" cy="9.2" r="1.7" style="fill:currentColor;stroke:none"/><circle cx="14.8" cy="9.2" r="1.7" style="fill:currentColor;stroke:none"/><circle cx="12" cy="15" r="1.7" style="fill:currentColor;stroke:none"/>`,
  },
  {
    name: "learn",
    label: "Learn",
    icon: `<path d="M12 6.2C10.2 4.7 8 4.2 4 4.2v13.6c4 0 6.2.5 8 2 1.8-1.5 4-2 8-2V4.2c-4 0-6.2.5-8 2z"/><path d="M12 6.2v13.6"/>`,
  },
  {
    name: "games",
    label: "Games",
    icon: `<path d="M9 5.5h11M9 12h11M9 18.5h11"/><circle cx="4.5" cy="5.5" r="1.3" style="fill:currentColor;stroke:none"/><circle cx="4.5" cy="12" r="1.3" style="fill:currentColor;stroke:none"/><circle cx="4.5" cy="18.5" r="1.3" style="fill:currentColor;stroke:none"/>`,
  },
  {
    name: "more",
    label: "More",
    icon: `<path d="M3.5 8h9M18 8h2.5M3.5 16h3M12 16h8.5"/><circle cx="15.2" cy="8" r="2.3"/><circle cx="9.2" cy="16" r="2.3"/>`,
  },
];
const origin =
  (import.meta as ImportMeta & { env?: { VITE_ONLINE_API_ORIGIN?: string } })
    .env?.VITE_ONLINE_API_ORIGIN ?? API_BASE;
const base = origin + "/api/online/";
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  cls = "",
) {
  const n = document.createElement(tag);
  n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
function fmt(n: number) {
  return n.toLocaleString("en-US");
}
function format(f: Format) {
  return [variants[f.variant], lengths[f.length], paceShort[f.pace]].join(" · ");
}
/** A tile in the shipped markup (app.ts tileEl): FLIP wrapper around
 *  the visual tile; board tiles carry no corner index. */
function tileEl(tile: Tile, cls: string, index = false) {
  const inner = el("span", "", `tile ${cls}`);
  inner.setAttribute("role", "img");
  inner.setAttribute("aria-label", tile.type < 0 ? "Concealed tile" : tileLabel(tile));
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 40 56");
  const use = document.createElementNS(svg.namespaceURI, "use");
  use.setAttribute("href", "#" + (tile.type < 0 ? "t-back" : tileSymbol(tile)));
  svg.append(use);
  inner.append(svg);
  if (index) {
    const idx = tileIndexEl(tile);
    if (idx) inner.append(idx);
  }
  const wrap = el("span", "", "twrap");
  wrap.append(inner);
  if (tile.type >= 0) wrap.dataset["flip"] = `tile-${tile.id}`;
  return wrap;
}
function backEl(cls: string) {
  const inner = el("span", "", `tile ${cls}`);
  inner.innerHTML = `<svg viewBox="0 0 40 56"><use href="#t-back"/></svg>`;
  const wrap = el("span", "", "twrap");
  wrap.append(inner);
  return wrap;
}
/** Small tile for the Board review renderer (Analyze). */
function reviewTile(t: Tile) {
  const face = el("span", "", "online-tile");
  face.setAttribute("role", "img");
  face.setAttribute("aria-label", t.type < 0 ? "Concealed tile" : tileName(t));
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 40 56");
  const use = document.createElementNS(svg.namespaceURI, "use");
  use.setAttribute("href", "#" + (t.type < 0 ? "t-back" : tileSymbol(t)));
  svg.append(use);
  face.append(svg);
  return face;
}

export async function onlineApp(root: HTMLElement) {
  const client = crypto.randomUUID();
  sessionStorage.setItem("om-online-client", client);
  let me: Profile | null = null,
    source: EventSource | null = null,
    epoch = 0,
    busy = false,
    timer = 0;
  let selected: Format = { variant: "riichi", length: "east", pace: "live" },
    filter = "all";
  let reviewing = false;
  let acceptCustom = false;
  let lastLobby: Lobby | null = null;
  let pendingJoin: string | null = null;
  let soundOn = true;
  let clockDeadline: number | null = null;
  const sprite = el("div");
  sprite.setAttribute("aria-hidden", "true");
  sprite.innerHTML = TILE_SPRITE_SVG;
  const stage = el("div");
  stage.id = "stage";
  const screens = el("div", "", "screens");
  stage.append(screens);
  root.replaceChildren(sprite, stage);
  root.classList.add("online-root");
  /** The solo app's fit (app.ts): width-locked scaling, fluid height. */
  function fit() {
    stage.style.width = "390px";
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
    stage.style.height = `${stageH}px`;
    stage.style.transform = `scale(${s})`;
  }
  fit();
  window.addEventListener("resize", fit);
  let currentError: HTMLElement | null = null;
  function showScreen(screen: HTMLElement) {
    screen.classList.add("screen", "active");
    screens.replaceChildren(screen);
    currentError = screen.querySelector(".online-error");
  }
  function fail(e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (currentError) currentError.textContent = msg;
  }
  function button(
    title: string,
    action: () => Promise<void> | void,
    cls = "",
  ) {
    const b = el("button", title, cls);
    b.type = "button";
    b.onclick = async () => {
      if (busy) return;
      busy = true;
      b.disabled = true;
      if (currentError) currentError.textContent = "";
      try {
        await action();
      } catch (e) {
        fail(e);
      } finally {
        busy = false;
        b.disabled = false;
      }
    };
    return b;
  }
  async function api<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "include",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
      ...(body === undefined
        ? {}
        : {
            headers: {
              "content-type": "application/json",
              "x-csrf-token": me?.csrf ?? "",
            },
            body: JSON.stringify(body),
          }),
    });
    const data = await res.json();
    if (res.status === 401) me = null;
    if (!res.ok) throw new Error(data.error ?? "Unable to reach this table");
    return data as T;
  }
  function toRoom(id: string) {
    location.hash = "/match/" + id;
  }
  function toLobby() {
    location.hash = "/online";
  }
  function gotoSolo() {
    location.assign(location.pathname);
  }
  function signIn() {
    sessionStorage.setItem("om-online-return", location.hash);
    if (me && !me.account) sessionStorage.setItem("om-online-upgrade", "1");
    location.assign(origin + "/auth/google/start");
  }
  /** A .seg control in the Play picker grammar (radiogroup, roving
   *  selection rendered by re-render, as the solo pickers do). */
  function seg(
    label: string,
    options: [string, string][],
    current: string,
    onPick: (v: string) => void,
    small = false,
  ) {
    const s = el("div", "", "seg" + (small ? " mp-seg-sm" : ""));
    s.setAttribute("role", "radiogroup");
    s.setAttribute("aria-label", label);
    for (const [v, name] of options) {
      const b = el("button", name, v === current ? "on" : "");
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(v === current));
      b.onclick = () => onPick(v);
      s.append(b);
    }
    return s;
  }
  function tabbar() {
    const nav = el("nav", "", "tabbar");
    nav.setAttribute("aria-label", "Main");
    for (const def of TAB_DEFS) {
      const b = el("button", "", "tabbtn" + (def.name === "home" ? " on" : ""));
      b.type = "button";
      b.innerHTML = `<svg viewBox="0 0 24 24">${def.icon}</svg>`;
      b.append(el("span", def.label));
      if (def.name === "home") b.setAttribute("aria-current", "page");
      else b.onclick = () => gotoSolo();
      nav.append(b);
    }
    return nav;
  }
  /** The Play fan: the section-4 hand, as the solo Play tab deals it. */
  function fanEl() {
    const wrap = el("div", "", "fanwrap");
    wrap.setAttribute("aria-hidden", "true");
    const lefts = [17, 40, 63, 92, 115, 138, 167, 190, 213, 242, 265, 294, 317, 340];
    const arcs: [number, number][] = [
      [0, -8], [-2.3, -6.77], [-4.2, -5.54], [-5.7, -4.31], [-6.8, -3.08],
      [-7.6, -1.85], [-8, -0.62], [-8, 0.62], [-7.6, 1.85], [-6.8, 3.08],
      [-5.7, 4.31], [-4.2, 5.54], [-2.3, 6.77], [0, 8],
    ];
    const tiles: Tile[] = [
      { id: 1, type: 1, red: false }, { id: 2, type: 2, red: false },
      { id: 3, type: 3, red: false }, { id: 4, type: 11, red: false },
      { id: 5, type: 12, red: false }, { id: 6, type: 13, red: true },
      { id: 7, type: 23, red: false }, { id: 8, type: 24, red: false },
      { id: 9, type: 25, red: false }, { id: 10, type: 26, red: false },
      { id: 11, type: 26, red: false }, { id: 12, type: 33, red: false },
      { id: 13, type: 33, red: false }, { id: 14, type: 33, red: false },
    ];
    tiles.forEach((tile, i) => {
      const [ty, rot] = arcs[i]!;
      const t = el("span", "", "tile t-fan");
      t.style.cssText = `left:${lefts[i]}px;top:18px;z-index:${i + 1};transform:translateY(${ty}px) rotate(${rot}deg)`;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 40 56");
      const use = document.createElementNS(svg.namespaceURI, "use");
      use.setAttribute("href", "#" + tileSymbol(tile));
      svg.append(use);
      t.append(svg, el("i", "", "edge"));
      wrap.append(t);
    });
    return wrap;
  }
  function wallEl() {
    const wall = el("div", "", "wall");
    wall.setAttribute("aria-hidden", "true");
    const mkRow = (count: number, cls: string) => {
      const row = el("div", "", `wrow ${cls}`);
      for (let i = 0; i < count; i++) row.append(backEl(""));
      return row;
    };
    wall.append(mkRow(16, "r1"), mkRow(15, "r2"));
    return wall;
  }
  function head(title: string, back: (() => void) | null) {
    const h = el("div", "", "mp-head");
    if (back) {
      const b = el("button", "‹", "mp-back");
      b.type = "button";
      b.setAttribute("aria-label", "Back");
      b.onclick = () => back();
      h.append(b);
    } else h.append(el("span"));
    const t = el("h1", title);
    h.append(t, el("span", "", "spacer"));
    return h;
  }
  function sheetHead(title: string, sub: string, onClose?: () => void) {
    const fh = el("div", "", "fhead");
    const left = el("div");
    left.append(el("h2", title, "ftitle"));
    if (sub) left.append(el("div", sub, "fsub"));
    fh.append(left);
    if (onClose) {
      const x = el("button", "", "fclose");
      x.type = "button";
      x.setAttribute("aria-label", "Close");
      x.innerHTML = ICON_CLOSE;
      x.onclick = () => onClose();
      fh.append(x);
    }
    return fh;
  }
  /** Open a sheet (shipped .sheet grammar) over a screen; returns the
   *  close function. The scrim is the shipped overlay colour. */
  function openSheet(screen: HTMLElement, content: HTMLElement) {
    const scrim = el("div", "", "mp-scrim");
    const sheet = el("div", "", "sheet");
    sheet.append(content);
    const close = () => {
      scrim.remove();
      sheet.remove();
    };
    scrim.onclick = () => close();
    screen.append(scrim, sheet);
    return close;
  }

  // -- Lobby (Option B: the Play tab, Online segment) ----------------

  function lobbyScreen(data: Lobby, inert = false): HTMLElement {
    const screen = el("section");
    screen.id = "screen-home";
    const body = el("div", "", "playbody mp-lobby");
    body.append(el("div", "", "spacer"));
    body.append(el("div", "OPEN MAHJONG", "wordmark"));
    body.append(fanEl());
    const col = el("div", "", "mp-lobby-col");
    col.append(
      seg(
        "Play mode",
        [
          ["solo", "Solo"],
          ["online", "Online"],
        ],
        "online",
        (v) => {
          if (v === "solo") gotoSolo();
        },
      ),
    );
    const variantOptions: [string, string][] = [
      ["riichi", "Riichi"],
      ["hong-kong", "Hong Kong Old Style"],
      ["mcr", "MCR"],
      ["taiwanese", "Taiwanese"],
    ];
    const lengthOptions: [string, string][] =
      selected.variant === "riichi"
        ? [
            ["east", "East only"],
            ["south", "East + South"],
          ]
        : [
            ["east", "East"],
            ["south", "East + South"],
            ["full", "Four rounds"],
          ];
    const rerender = () => {
      if (lastLobby) showScreen(lobbyScreen(lastLobby, inert));
    };
    col.append(
      seg("Rules", variantOptions, selected.variant, (v) => {
        selected.variant = v;
        if (v === "riichi" && selected.length === "full")
          selected.length = "east";
        rerender();
      }, true),
      seg("Length", lengthOptions, selected.length, (v) => {
        selected.length = v;
        rerender();
      }),
      seg(
        "Pace",
        [
          ["live", paceLabels.live],
          ["relaxed", paceLabels.relaxed],
          ["correspondence", paceLabels.correspondence],
        ],
        selected.pace,
        (v) => {
          selected.pace = v as Pace;
          rerender();
        },
        true,
      ),
    );
    const error = el("p", "", "online-error");
    error.setAttribute("role", "alert");
    col.append(error);
    const enter = async (path: string, body?: unknown) =>
      toRoom((await api<{ id: string }>(path, body)).id);
    const actions = el("div", "", "mp-actions");
    const duo = el("div", "", "mp-duo");
    if (data.enabled.friendly)
      duo.append(
        button("Find Friendly game", () =>
          enter("queue", { ...selected, mode: "friendly", acceptCustom }),
          "pillbtn primary",
        ),
      );
    if (data.enabled.ranked)
      duo.append(
        button(
          me?.account ? "Find Ranked game" : "Sign in for Ranked",
          () =>
            me?.account
              ? // Ranked runs at the Live pace only (server-enforced).
                enter("queue", { ...selected, pace: "live", mode: "ranked" })
              : signIn(),
          "pillbtn ghost",
        ),
      );
    actions.append(duo);
    if (data.enabled.custom) {
      const create = button("Create custom room", () =>
        enter("rooms", { ...selected }), "pillbtn mp-create");
      create.innerHTML = FRIENDS_ICON + "<span>Create custom room</span>";
      actions.append(create);
    }
    col.append(actions);
    if (data.enabled.ranked && me && !me.account)
      col.append(el("p", "Ranked needs an account.", "mp-note"));
    const toggle = el("div", "", "mp-toggle");
    const fill = el("input");
    fill.type = "checkbox";
    fill.checked = acceptCustom;
    fill.onchange = () => {
      acceptCustom = fill.checked;
    };
    const sw = el("label", "", "switch");
    const tr = el("span", "", "tr");
    sw.append(fill, tr);
    toggle.append(
      el("span", "Offer me matching Friendly seats at custom tables", "lab"),
      sw,
    );
    col.append(toggle);
    body.append(col);
    const wide = el("div", "", "mp-wide");
    // Public Friendly seats at custom tables.
    wide.append(el("h2", "Friendly seats at custom tables", "sec-label"));
    if (!data.open.length)
      wide.append(el("p", "No open seats advertised.", "mp-note"));
    for (const r of data.open) {
      const row = el("div", "", "hrow");
      const main = el("div");
      main.style.cssText = "flex:1; min-width:0;";
      const title = el("div", format(r));
      title.style.cssText = "font-size:15px; font-weight:600;";
      const sub = el("div",
        `Host ${r.host ?? "—"} · ${4 - r.occupied} seat${4 - r.occupied === 1 ? "" : "s"} open`);
      sub.style.cssText = "font-size:12.5px; color:var(--dim); margin-top:2px;";
      main.append(title, sub);
      const join = button("Join", async () => {
        toRoom((await api<{ id: string }>("rooms/join", { id: r.id })).id);
      }, "pillbtn");
      join.style.height = "44px";
      join.style.padding = "0 18px";
      row.append(main, join);
      wide.append(row);
    }
    // My games: your-move first, All / Your move / Waiting filter.
    wide.append(el("h2", "My games", "sec-label"));
    const filterRow = el("div", "", "mp-filter");
    for (const [v, name] of [
      ["all", "All"],
      ["move", "Your move"],
      ["waiting", "Waiting"],
    ] as [string, string][]) {
      const b = el("button", name, v === filter ? "on" : "");
      b.type = "button";
      b.onclick = () => {
        filter = v;
        rerender();
      };
      filterRow.append(b);
    }
    wide.append(filterRow);
    const games = [...data.games].sort(
      (a, b) => Number(b.yourMove ?? false) - Number(a.yourMove ?? false),
    );
    const shown = games.filter(
      (g) =>
        filter === "all" ||
        (g.state === "playing" &&
          (filter === "move" ? g.yourMove : !g.yourMove)),
    );
    if (!shown.length) wide.append(el("p", "No games here yet.", "mp-note"));
    for (const g of shown) {
      const row = el("button", "", "iprow");
      row.type = "button";
      const main = el("span", "", "ipmain");
      const stateText =
        g.state === "playing"
          ? g.yourMove
            ? "Your move"
            : "Waiting for table"
          : g.state === "waiting"
            ? "Waiting room"
            : "Finished";
      main.append(
        el("span", `${variants[g.variant]} · ${lengths[g.length]}`, "l1"),
        el("span",
          `${originLabels[g.origin] ?? g.origin} · ${paceShort[g.pace]} · ${stateText}`,
          "l2"),
      );
      const right = el("span", "", "ipright");
      const pill = el("span", "", "ippill");
      if (g.yourMove) pill.append(el("span", "", "ipdot"));
      pill.append(
        document.createTextNode(
          g.yourMove
            ? "YOUR MOVE"
            : g.state === "playing"
              ? "LIVE"
              : g.state === "waiting"
                ? "WAITING"
                : "FINISHED",
        ),
      );
      const resume = el("span", "", "resume");
      resume.append(document.createTextNode("Open"));
      const chev = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      chev.setAttribute("viewBox", "0 0 24 24");
      chev.innerHTML = `<path d="M9 6l6 6-6 6"/>`;
      resume.append(chev);
      right.append(pill, resume);
      row.append(main, right);
      row.onclick = () => toRoom(g.id);
      wide.append(row);
    }
    // Identity row.
    if (me) {
      const idRow = el("div", "", "mp-identity");
      const avatar = el("span", me.name.charAt(0).toUpperCase() || "?", "avatar");
      avatar.style.background = me.account ? "var(--gold)" : "var(--panel-hi)";
      if (me.account) avatar.style.color = "var(--on-tint)";
      const who = el("span", "", "who");
      const sub = el("span", me.account ? "Account" : "Guest account", "s");
      sub.style.display = "block";
      who.append(el("span", me.name, "n"), sub);
      idRow.append(avatar, who);
      if (!me.account) {
        idRow.append(
          button("Replace recovery code", async () => {
            if (!window.confirm("Replace your previous guest recovery code?"))
              return;
            const code = await api<{ recovery: string }>("guest/recovery", {});
            recoverySheet(screen, code.recovery);
          }, "linkbtn"),
        );
      }
      wide.append(idRow);
      const nameRow = el("div", "", "mp-toggle");
      const name = el("input", "", "mp-field");
      name.value = me.name;
      name.maxLength = 32;
      name.setAttribute("aria-label", "Display name");
      name.style.maxWidth = "200px";
      nameRow.append(el("span", "Display name", "lab"), name,
        button("Save name", async () => {
          await api("profile", { name: name.value });
          me!.name = name.value;
          await route();
        }, "pillbtn ghost"));
      wide.append(nameRow);
    }
    body.append(wide);
    body.append(el("div", "", "spacer"));
    body.append(wallEl());
    screen.append(body, tabbar());
    if (inert) {
      screen.setAttribute("aria-hidden", "true");
      screen.style.pointerEvents = "none";
    }
    return screen;
  }

  /** Frame 06: the recovery code sheet, shown once after guest entry
   *  and again when the code is replaced from the identity row. */
  function recoverySheet(screen: HTMLElement, code: string, after?: () => void) {
    const content = el("div");
    const closeRef: { fn?: () => void } = {};
    content.append(sheetHead("Save your guest recovery code", "", () => closeRef.fn?.()));
    content.append(
      el("p", "Use this private code to recover your seats on another device.", "mp-note"),
    );
    (content.lastChild as HTMLElement).style.cssText =
      "font-size:13.5px; margin-top:10px;";
    content.append(el("div", code, "mp-code"));
    const hact = el("div", "", "hact");
    const cont = button("Continue", () => {
      closeRef.fn?.();
      if (after) after();
      else void route();
    }, "hbtn primary");
    hact.append(cont);
    content.append(hact);
    closeRef.fn = openSheet(screen, content);
  }

  /** Frame 05: guest entry as a sheet over the lobby. With a pending
   *  join code the flow continues into the join sheet (frame 07's
   *  signed-out form carries the same display-name field). */
  function guestSheet(screen: HTMLElement) {
    const content = el("div");
    const closeRef: { fn?: () => void } = {};
    const renderMain = () => {
      content.replaceChildren();
      content.append(
        sheetHead("Play online", "Guest games are kept on this device.", () =>
          closeRef.fn?.(),
        ),
      );
      const fieldWrap = el("div");
      fieldWrap.style.marginTop = "14px";
      const name = el("input", "", "mp-field");
      name.placeholder = "Display name";
      name.maxLength = 32;
      name.setAttribute("aria-label", "Display name");
      name.setAttribute("autocomplete", "nickname");
      fieldWrap.append(name);
      content.append(fieldWrap);
      const hact = el("div", "", "hact");
      hact.append(
        button("Play as guest", async () => {
          me = await api<Profile>("guests", { name: name.value });
          closeRef.fn?.();
          recoverySheet(screen, me.recovery ?? "", () => {
            if (pendingJoin) void openJoinSheet(screen, pendingJoin);
            else void route();
          });
        }, "hbtn primary"),
      );
      content.append(hact);
      const hact2 = el("div", "", "hact");
      hact2.style.marginTop = "10px";
      hact2.append(button("Sign in with Google", () => signIn(), "hbtn"));
      content.append(hact2);
      const note = el("p", "", "mp-note");
      note.style.textAlign = "center";
      note.append(document.createTextNode("Have a recovery code? "));
      const rec = el("button", "Recover a guest seat", "linkbtn");
      rec.type = "button";
      rec.style.cssText = "color:var(--ink); padding:0; min-height:0;";
      rec.onclick = () => renderRecover();
      note.append(rec);
      content.append(note);
      const err = el("p", "", "online-error");
      err.setAttribute("role", "alert");
      content.append(err);
      currentError = err;
    };
    const renderRecover = () => {
      content.replaceChildren();
      content.append(
        sheetHead("Recover a guest seat", "", () => closeRef.fn?.()),
      );
      const fieldWrap = el("div");
      fieldWrap.style.marginTop = "14px";
      const code = el("input", "", "mp-field");
      code.type = "password";
      code.autocomplete = "off";
      code.setAttribute("aria-label", "Recovery code");
      code.placeholder = "Recovery code";
      fieldWrap.append(code);
      content.append(fieldWrap);
      const hact = el("div", "", "hact");
      hact.append(
        button("Recover", async () => {
          me = await api<Profile>("recover", { code: code.value });
          closeRef.fn?.();
          if (pendingJoin) void openJoinSheet(screen, pendingJoin);
          else void route();
        }, "hbtn primary"),
        button("Back", () => renderMain(), "hbtn"),
      );
      content.append(hact);
      const err = el("p", "", "online-error");
      err.setAttribute("role", "alert");
      content.append(err);
      currentError = err;
    };
    renderMain();
    closeRef.fn = openSheet(screen, content);
  }

  /** Frame 07: join-by-invite-link as a sheet over the lobby, with
   *  the room's facts from the preview endpoint before joining. */
  async function openJoinSheet(screen: HTMLElement, code: string) {
    pendingJoin = null;
    const content = el("div");
    const closeRef: { fn?: () => void } = {};
    content.append(sheetHead("Room invitation", "", () => {
      closeRef.fn?.();
      toLobby();
    }));
    const err = el("p", "", "online-error");
    err.setAttribute("role", "alert");
    try {
      const facts = await api<Format & { host: string | null }>(
        "rooms/preview?invite=" + encodeURIComponent(code),
      );
      const p = el("p", `Join this custom room as ${me!.name}?`);
      p.style.cssText = "font-size:15px; margin-top:10px;";
      const factsEl = el("div", "", "mp-facts");
      for (const [k, v] of [
        ["Host", facts.host ?? "—"],
        ["Rules", variants[facts.variant] ?? facts.variant],
        ["Length", lengths[facts.length] ?? facts.length],
        ["Pace", paceShort[facts.pace]],
      ] as [string, string][]) {
        const row = el("div", "", "row");
        row.append(el("span", k, "k"), el("span", v, "v"));
        factsEl.append(row);
      }
      const hact = el("div", "", "hact");
      hact.append(
        button("Join room", async () => {
          const r = await api<{ id: string }>("rooms/join", { invite: code });
          location.replace("#/match/" + r.id);
        }, "hbtn primary"),
        button("Not now", () => {
          closeRef.fn?.();
          toLobby();
        }, "hbtn"),
      );
      content.append(p, factsEl, hact, err);
    } catch (e) {
      content.append(err);
      fail(e);
      const hact = el("div", "", "hact");
      hact.append(button("Back to lobby", () => {
        closeRef.fn?.();
        toLobby();
      }, "hbtn"));
      content.append(hact);
    }
    currentError = err;
    closeRef.fn = openSheet(screen, content);
  }

  // -- Waiting (frames 08/19/09/20: a sheet over the lobby) ---------

  function seatRow(s: Snapshot, seatIdx: number, kind: string,
    action: (kind: string, seat?: number) => Promise<void>) {
    const occupant = s.seats.find((p) => p.seat === seatIdx);
    const row = el("div", "", "mp-seat");
    const wch = el("span", "", "wch" + (seatIdx === 0 ? " dealer" : ""));
    wch.append(el("span", windKanji[seatIdx]!, "kj"));
    row.append(wch);
    const who = el("span", "", "who");
    const isMe = occupant?.seat === s.seat;
    const name = occupant
      ? occupant.bot
        ? "Bot"
        : isMe
          ? "You"
          : occupant.name
      : "Open seat";
    who.append(el("span", name, "n"));
    const subParts: string[] = [];
    if (occupant?.host) subParts.push("Host");
    subParts.push(winds[seatIdx]!);
    if (occupant?.bot) subParts.push("Bot");
    const sub = el("span", subParts.join(" · "), "s");
    sub.style.display = "block";
    who.append(sub);
    row.append(who);
    if (!occupant) {
      if (kind === "custom" && s.host)
        row.append(button("Add bot", () => action("bot"), "mini"));
      else row.append(el("span", "Waiting", "st wait"));
      return row;
    }
    if (kind === "queue") {
      row.append(el("span", s.origin === "ranked" ? "In queue" : "Seated", "st"));
      return row;
    }
    // Custom room.
    if (occupant.bot) {
      if (s.host) row.append(button("Remove bot", () => action("removeBot", seatIdx), "mini"));
      else row.append(el("span", "Ready", "st"));
    } else if (occupant.ready) row.append(el("span", "Ready", "st"));
    else if (isMe)
      row.append(button("Ready up", () => action("ready"), "pillbtn primary mp-ready"));
    else row.append(el("span", "Not ready", "st wait"));
    return row;
  }

  function waitingSheet(screen: HTMLElement, s: Snapshot,
    action: (kind: string, seat?: number) => Promise<void>,
    leave: () => Promise<void>) {
    const content = el("div");
    const kind = s.origin === "custom" ? "custom" : "queue";
    const title =
      s.origin === "custom"
        ? "Waiting room"
        : s.origin === "ranked"
          ? "Ranked queue"
          : "Finding a table";
    const sub =
      s.origin === "custom"
        ? `${format(s)} · Custom room`
        : s.origin === "ranked"
          ? `Ranked · ${variants[s.variant]} · ${lengths[s.length]} · 5+20`
          : `Friendly · ${format(s)}`;
    content.append(sheetHead(title, sub));
    const err = el("p", "", "online-error");
    err.setAttribute("role", "alert");
    content.append(err);
    currentError = err;
    for (let i = 0; i < 4; i++) content.append(seatRow(s, i, kind, action));
    if (s.origin === "custom" && s.host && s.invite) {
      const inv = el("div", "", "mp-invite");
      const link = el("input", "", "lnk");
      link.readOnly = true;
      link.value = location.origin + location.pathname + "#/join/" + s.invite;
      link.setAttribute("aria-label", "Invite link");
      const copy = el("button", "Copy invite", "mini");
      copy.type = "button";
      copy.onclick = () => void navigator.clipboard.writeText(link.value);
      inv.append(link, copy);
      content.append(inv);
      const toggle = el("div", "", "mp-toggle");
      toggle.style.paddingTop = "14px";
      const fill = el("input");
      fill.type = "checkbox";
      fill.checked = s.listed;
      fill.onchange = () => void action(s.listed ? "unlist" : "list");
      const sw = el("label", "", "switch");
      sw.append(fill, el("span", "", "tr"));
      const lab = el("span", "Offer seats in Friendly", "lab");
      lab.style.fontSize = "13.5px";
      toggle.append(lab, sw);
      content.append(toggle);
    }
    if (kind === "queue")
      content.append(
        el("p", "The game starts when four players are seated.", "mp-note"),
      );
    const actions = el("div", "", "mp-sheet-actions");
    if (s.origin === "custom" && s.host) {
      const startable =
        s.seats.length === 4 && s.seats.every((p) => p.ready);
      actions.append(
        button("Leave", leave, "pillbtn ghost"),
        button("Start match", () => action("start"), "pillbtn primary"),
      );
      (actions.lastChild as HTMLButtonElement).disabled = !startable;
      content.append(actions);
      if (!startable)
        content.append(
          el("p", "Start match unlocks when every seat is filled and ready.", "mp-note"),
        );
    } else if (s.origin === "custom") {
      actions.append(button("Leave", leave, "pillbtn ghost"));
      content.append(actions);
      content.append(
        el("p", "The host starts the match when every seat is ready.", "mp-note"),
      );
    } else {
      actions.append(
        button(s.origin === "ranked" ? "Leave queue" : "Leave", leave, "pillbtn ghost"),
      );
      content.append(actions);
    }
    openSheet(screen, content);
    // Frame 10: a Friendly room offer rides over the waiting sheet.
    if (s.offer) {
      const o = s.offer;
      const overlay = el("div", "", "overlay show");
      const card = el("div", "", "card");
      card.append(el("h2", "Friendly room offer"));
      card.append(el("p", "A seat is open at a custom table.", "sub"));
      const facts = el("div", "", "mp-facts");
      for (const [k, v] of [
        ["Host", o.host ?? "—"],
        ["Rules", variants[o.variant] ?? o.variant],
        ["Length", lengths[o.length] ?? o.length],
        ["Pace", paceShort[o.pace]],
      ] as [string, string][]) {
        const row = el("div", "", "row");
        row.append(el("span", k, "k"), el("span", v, "v"));
        facts.append(row);
      }
      const colEl = el("div", "", "col");
      colEl.append(
        button("Accept seat", async () => {
          toRoom((await api<{ id: string }>("offers", { id: o.id, accept: true })).id);
        }, "pillbtn primary"),
        button("Keep waiting", async () => {
          await api("offers", { id: o.id, accept: false });
          await refreshRoom(s.id);
        }, "pillbtn ghost"),
      );
      card.append(facts, colEl);
      overlay.append(card);
      screen.append(overlay);
    }
  }

  // -- The table (frames 11–15: the solo four-sided table) ----------

  function meldEl(
    meld: VariantPublicView["players"][number]["melds"][number],
    cls: string,
    ownerSeat: number,
    mySeat: number,
  ) {
    const wrap = el("span", "", "meld");
    const rel = (seat: number) => (seat - mySeat + 4) % 4;
    const others = meld.calledTile
      ? meld.tiles.filter((t) => t.id !== meld.calledTile!.id)
      : [...meld.tiles];
    const seq: { tile: Tile; side: boolean }[] = others.map((t) => ({
      tile: t,
      side: false,
    }));
    if (meld.calledTile && meld.calledFrom !== undefined) {
      const dir = (rel(meld.calledFrom) - rel(ownerSeat) + 4) % 4;
      const insertAt = dir === 3 ? 0 : dir === 2 ? 1 : seq.length;
      seq.splice(Math.min(insertAt, seq.length), 0, {
        tile: meld.calledTile,
        side: true,
      });
    } else if (meld.calledTile) seq.push({ tile: meld.calledTile, side: true });
    for (const { tile, side } of seq)
      wrap.append(tileEl(tile, `${cls} ${side ? "side" : ""}`));
    return wrap;
  }

  function drawTable(s: Snapshot, id: string): HTMLElement {
    const v = s.view!;
    const mySeat = s.seat;
    const topSeat = (mySeat + 2) % 4;
    const rightSeat = (mySeat + 1) % 4;
    const leftSeat = (mySeat + 3) % 4;
    const seatName = (seat: number) =>
      seat === mySeat
        ? "You"
        : (s.seats.find((p) => p.seat === seat)?.name ?? winds[seat]!);
    const move = async (index: number, actionId: string) => {
      await api("matches/" + id + "/actions", {
        actionId,
        choice: index,
        revision: s.revision,
        version: 1,
        client,
        generation: s.generation,
      });
      await refreshRoom(id);
    };
    // The most recent discard: the previous seat's last uncalled pond
    // entry (the solo table's decisive ring marks the same tile).
    const prev = v.players[(v.currentTurn + 3) % 4]!;
    const lastEntry = [...prev.discards].reverse().find((d) => !d.called);
    const lastRef = lastEntry
      ? { seat: prev.seat, tileId: lastEntry.tile.id }
      : null;
    const pondGrid = (seat: number) => {
      const p = v.players[seat]!;
      const pond = el("div", "", `pond ${seat === topSeat ? "flip" : ""}`);
      for (const e of p.discards) {
        if (e.called) continue;
        const wrap = tileEl(e.tile, `t-pond ${e.riichiDeclaration ? "side" : ""}`);
        if (lastRef && lastRef.seat === seat && lastRef.tileId === e.tile.id) {
          wrap.style.boxShadow = "0 0 0 2px var(--decisive)";
          wrap.style.borderRadius = "7px";
        }
        pond.append(wrap);
      }
      return pond;
    };
    const pondSide = (seat: number, side: string) => {
      const p = v.players[seat]!;
      const sp = el("div", "", `sp ${side}`);
      for (const e of p.discards) {
        if (e.called) continue;
        const cell = el("span", "", "cell");
        if (lastRef && lastRef.seat === seat && lastRef.tileId === e.tile.id)
          cell.classList.add("hl");
        cell.append(tileEl(e.tile, `t-pond ${e.riichiDeclaration ? "riichi" : "rot"}`));
        sp.append(cell);
      }
      return sp;
    };
    const chip = (seat: number, extraCls = "") => {
      const p = v.players[seat]!;
      const meta = s.seats.find((x) => x.seat === seat);
      const isTurn = v.currentTurn === seat;
      const chipEl = el("div", "", `chip ${extraCls} ${isTurn ? "turn" : ""}`);
      if (seat === mySeat) {
        chipEl.append(
          el("span", `${winds[p.seatWind - 27]} · You`, "dealer"),
          document.createTextNode("  "),
        );
      } else {
        chipEl.append(
          el("span", windKanji[p.seatWind - 27]!, "kj"),
          document.createTextNode(" "),
        );
        const nm = el("span", seatName(seat), "nm");
        chipEl.append(nm);
        if (p.riichi) {
          chipEl.append(document.createTextNode(" "));
          chipEl.append(el("span", "", "mp-stick"));
        }
        if (meta?.covered) {
          const bot = el("span", "Bot", "bot");
          chipEl.append(document.createTextNode(" · "), bot);
        }
        chipEl.append(document.createTextNode("  "));
      }
      chipEl.append(el("b", fmt(p.score)));
      return chipEl;
    };
    const table = el("div");
    table.id = "table";
    // Header (the solo table's bar).
    const header = el("header", "", "bar");
    const menuBtn = el("button", "", "iconbtn");
    menuBtn.type = "button";
    menuBtn.setAttribute("aria-label", "Menu");
    menuBtn.innerHTML = ICON_MENU;
    menuBtn.onclick = () => toLobby();
    const soundBtn = el("button", "", "iconbtn");
    soundBtn.type = "button";
    soundBtn.setAttribute("aria-label", "Sound");
    soundBtn.innerHTML = soundOn ? ICON_SOUND_ON : ICON_SOUND_OFF;
    soundBtn.onclick = () => {
      soundOn = !soundOn;
      soundBtn.innerHTML = soundOn ? ICON_SOUND_ON : ICON_SOUND_OFF;
    };
    header.append(menuBtn, el("span", "OPEN MAHJONG", "word"), soundBtn);
    table.append(header);
    const net = el("div", "Reconnecting…", "mp-netstrip");
    net.hidden = true;
    table.append(net);
    if (s.handResult) {
      const last = s.handResult;
      const winner = s.seats.find((p) => p.seat === last.seat);
      table.append(
        el("div",
          "Previous hand · " + (winner ? winner.name + " · " : "") + last.kind,
          "mp-lastline"),
      );
    }
    // Top opponent zone.
    const zoneTop = el("div", "", "zone-top");
    const oppHand = el("div", "", "opp-hand");
    const topP = v.players[topSeat]!;
    for (let i = 0; i < topP.handCount; i++) oppHand.append(backEl("t-back"));
    for (const meld of topP.melds) oppHand.append(meldEl(meld, "t-meld", topSeat, mySeat));
    zoneTop.append(oppHand);
    const topPondWrap = el("div", "", "pondwrap");
    topPondWrap.append(pondGrid(topSeat));
    zoneTop.append(topPondWrap);
    table.append(zoneTop);
    // Middle band.
    const band = el("div", "", "band");
    const bandtop = el("div", "", "bandtop");
    bandtop.append(chip(leftSeat), chip(topSeat, "west"), chip(rightSeat));
    band.append(bandtop);
    const stageMid = el("div", "", "stage-mid");
    for (const [seat, side] of [
      [leftSeat, "left"],
      [rightSeat, "right"],
    ] as [number, string][]) {
      const sh = el("div", "", `sidehand ${side}`);
      const sp = v.players[seat]!;
      for (let i = 0; i < sp.handCount; i++) sh.append(backEl("t-back"));
      stageMid.append(sh);
      stageMid.append(pondSide(seat, side));
    }
    // Center panel, with the clock as a named row under the dora row.
    const center = el("button", "", "center");
    center.type = "button";
    center.setAttribute("aria-label", "Round details");
    const round = el("div", "", "round");
    round.append(
      el("span", windKanji[v.roundWind - 27]!, "wind kj"),
      el("span", `${winds[v.roundWind - 27]} ${v.kyoku}`, "rname"),
    );
    center.append(round);
    center.append(el("div", `${v.honba} honba · Wall ${v.wallRemaining}`, "sub"));
    if (v.sticks > 0) {
      const sr = el("div", "", "stickrow");
      sr.append(el("span", "", "stick"), el("span", `× ${v.sticks}`, "n"));
      center.append(sr);
    }
    const dr = el("div", "", "dorarow");
    dr.append(el("span", "Dora", "lbl"));
    for (const ind of v.doraIndicators) dr.append(tileEl(ind, "t-dora"));
    const slots = Math.min(5, Math.max(3, v.doraIndicators.length));
    for (let i = v.doraIndicators.length; i < slots; i++) dr.append(backEl("t-dora"));
    center.append(dr);
    const choices = s.choices ?? [];
    const isTurnChoice = choices.some(
      (a) => a.type === "discard" || a.type === "tsumo" || a.type === "ankan" ||
        a.type === "shouminkan" || a.type === "kyuushu",
    );
    const clockRow = el("div", "", "mp-clockrow");
    if (s.pace === "correspondence") {
      clockRow.append(el("span", "Correspondence", "who"));
      const t = el("span", "No time limit", "t");
      t.style.fontSize = "13px";
      clockRow.append(t);
      clockDeadline = null;
    } else {
      const label = isTurnChoice
        ? "Your move"
        : choices.length
          ? "Your claim"
          : seatName(v.currentTurn);
      const who = el("span", label, "who" + (isTurnChoice || choices.length ? " you" : ""));
      if (isTurnChoice || choices.length) {
        who.setAttribute("role", "heading");
        who.setAttribute("aria-level", "2");
      }
      clockRow.append(who);
      const t = el("span", "", "t");
      t.dataset["clock"] = "1";
      clockRow.append(t);
      clockDeadline = s.deadline ?? null;
      const paint = () => {
        if (clockDeadline === null) {
          t.textContent = "";
          return;
        }
        const secs = Math.max(0, Math.ceil((clockDeadline - Date.now()) / 1000));
        t.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
      };
      paint();
      timer = window.setInterval(paint, 250);
    }
    center.append(clockRow);
    stageMid.append(center);
    band.append(stageMid);
    const bandbot = el("div", "", "bandbot");
    bandbot.append(chip(mySeat));
    band.append(bandbot);
    table.append(band);
    // Player zone.
    const own = s.seats.find((p) => p.seat === mySeat)!;
    const covered = own.covered && s.pace !== "correspondence";
    const hasPrompt = choices.length > 0 || covered || !s.controlling;
    const zonePlayer = el("div", "", `zone-player ${hasPrompt ? "with-prompt" : ""}`);
    const myPondWrap = el("div", "", "pondwrap");
    myPondWrap.append(pondGrid(mySeat));
    zonePlayer.append(myPondWrap);
    if (covered || !s.controlling) {
      const bar = el("div", "", "mp-coverbar");
      const txt = el("div", "", "txt");
      txt.append(document.createTextNode("A bot is playing your seat"));
      txt.append(el("span", "Your connection dropped. The game continues.", "s"));
      bar.append(txt);
      bar.append(
        button("Reclaim my seat", async () => {
          await api("matches/" + id + "/presence", {
            reclaim: true,
            claimControl: true,
            client,
          });
          await refreshRoom(id);
        }, "pillbtn primary"),
      );
      zonePlayer.append(bar);
    } else if (choices.length) {
      const row = el("div", "", "promptrow show");
      const cbtn = (label: string, cls: string, index: number) => {
        const actionId = crypto.randomUUID();
        const b = button(label, () => move(index, actionId), `cbtn ${cls}`);
        return b;
      };
      choices.forEach((a, index) => {
        if (a.type === "discard" && !a.riichi) return;
        if (a.type === "discard" && a.riichi) row.append(cbtn("Riichi", "riichi", index));
        else if (a.type === "ron") row.append(cbtn("Ron", "ron", index));
        else if (a.type === "tsumo") row.append(cbtn("Tsumo", "tsumo", index));
        else if (a.type === "pon") row.append(cbtn("Pon", "pon", index));
        else if (a.type === "daiminkan" || a.type === "ankan" || a.type === "shouminkan")
          row.append(cbtn("Kan", "pon", index));
        else if (a.type === "chi") {
          const names = a.tileIds
            .map((tid) => tileName(v.hand.find((t) => t.id === tid) ?? { id: tid, type: -1, red: false } as Tile))
            .join(" + ");
          const b = cbtn("Chi", "chi", index);
          b.setAttribute("aria-label", `Chi ${names}`);
          row.append(b);
        } else if (a.type === "pass") row.append(cbtn("Pass", "pass", index));
        else if (a.type === "kyuushu") row.append(cbtn("Kyuushu", "pass", index));
      });
      zonePlayer.append(row);
    }
    // Hand: sorted, melds at the right, in the shipped hand row.
    const handRow = el("div", "", "handrow" + (covered ? " mp-dim" : ""));
    const sorted = [...v.hand].sort((a, b) => a.type - b.type || a.id - b.id);
    for (const t of sorted) {
      const index = choices.findIndex(
        (a) => a.type === "discard" && !a.riichi && a.tileId === t.id,
      );
      if (index < 0 || covered) {
        handRow.append(tileEl(t, "t-hand"));
        continue;
      }
      const actionId = crypto.randomUUID();
      const pick = button("", () => move(index, actionId), "mp-pick");
      pick.setAttribute("aria-label", "Discard " + tileName(t));
      pick.append(tileEl(t, "t-hand"));
      handRow.append(pick);
    }
    const meP = v.players[mySeat]!;
    for (const meld of meP.melds) handRow.append(meldEl(meld, "t-meld", mySeat, mySeat));
    const flowers = v.flowerTiles?.[mySeat];
    if (flowers?.length) {
      const fl = el("span", "", "meld");
      for (const t of flowers) fl.append(tileEl(t, "t-meld"));
      handRow.append(fl);
    }
    zonePlayer.append(handRow);
    const handctl = el("div", "", "handctl");
    if (s.pace === "correspondence") {
      const votes = s.seats.filter((p) => p.endRequested).length;
      const mine = own;
      const propose = el("button");
      propose.type = "button";
      propose.innerHTML = `<span>${mine.endRequested ? `End requested (${votes} of 4)` : "Propose ending by agreement"}</span>`;
      propose.disabled = mine.endRequested;
      propose.onclick = async () => {
        try {
          await api("matches/" + id + "/room", { kind: "end" });
          await refreshRoom(id);
        } catch (e) {
          fail(e);
        }
      };
      handctl.append(propose);
    }
    const inspect = el("button");
    inspect.type = "button";
    inspect.innerHTML = `${ICON_EXPAND}<span>Inspect hand</span>`;
    inspect.onclick = () => inspectSheet(v, table.closest(".screen") as HTMLElement);
    handctl.append(inspect);
    const leaveBtn = el("button");
    leaveBtn.type = "button";
    leaveBtn.innerHTML = `<span>Leave table</span>`;
    leaveBtn.onclick = async () => {
      if (!window.confirm("Withdraw from this table? A bot will finish in your seat."))
        return;
      try {
        await api("matches/" + id + "/room", { kind: "leave" });
        toLobby();
      } catch (e) {
        fail(e);
      }
    };
    handctl.append(leaveBtn);
    zonePlayer.append(handctl);
    table.append(zonePlayer);
    const screen = el("section");
    const err = el("p", "", "online-error");
    err.setAttribute("role", "alert");
    table.insertBefore(err, table.firstChild);
    screen.append(table);
    currentError = err;
    return screen;
  }

  /** The Inspect hand sheet: the shipped hand focus grammar — the
   *  hand at inspect size with corner indices (inspect surfaces
   *  only, design rules section 12) and the plain tile name. */
  function inspectSheet(v: VariantPublicView, screen: HTMLElement) {
    const content = el("div");
    const closeRef: { fn?: () => void } = {};
    content.append(sheetHead("Your hand", "", () => closeRef.fn?.()));
    const readout = el("div", "", "mp-note");
    readout.style.cssText = "font-size:15px; color:var(--ink); font-weight:600;";
    const grid = el("div", "", "hgrid");
    const sorted = [...v.hand].sort((a, b) => a.type - b.type || a.id - b.id);
    for (const t of sorted) {
      const cell = el("div", "", "cell");
      const face = tileEl(t, "", true);
      face.style.cursor = "pointer";
      face.onclick = () => {
        readout.textContent = tileLabel(t);
      };
      cell.append(face);
      grid.append(cell);
    }
    if (sorted[0]) readout.textContent = tileLabel(sorted[0]);
    content.append(readout, grid);
    closeRef.fn = openSheet(screen, content);
  }

  // -- Results (frames 16–18: solo results grammar + rating) -------

  function resultsScreen(s: Snapshot): HTMLElement {
    const screen = el("section");
    screen.append(head("Results", null));
    const scroll = el("div", "", "mp-scroll");
    const err = el("p", "", "online-error");
    err.setAttribute("role", "alert");
    scroll.append(err);
    currentError = err;
    scroll.append(
      el("p", `Final standings · ${format(s)}`, "mp-note"),
    );
    (scroll.lastChild as HTMLElement).style.marginTop = "2px";
    const table = el("div", "", "results-table");
    const entries = [...(s.result ?? [])].sort((a, b) => a.rank - b.rank);
    for (const entry of entries) {
      const row = el("div", "", "row");
      const name =
        entry.seat === s.seat
          ? "You"
          : (s.seats.find((x) => x.seat === entry.seat)?.name ?? "");
      const pts =
        (entry.points > 0 ? "+" : entry.points < 0 ? "−" : "") +
        Math.abs(entry.points).toFixed(1);
      row.append(
        el("span", String(entry.rank), "rank"),
        el("span", name, "who"),
        el("span", fmt(entry.score), "score"),
        el("span", pts, "pts " + (entry.points >= 0 ? "pos" : "neg")),
      );
      table.append(row);
    }
    scroll.append(table);
    if (s.ratingVoid) {
      scroll.append(el("p", `Unrated result · ${s.ratingVoid}`, "mp-unrated"));
    } else if (s.ratings?.length) {
      const block = el("div", "", "mp-rating");
      block.append(el("p", "Rating", "mp-seclab"));
      for (const entry of entries) {
        const r = s.ratings.find((x) => x.seat === entry.seat);
        if (!r) continue;
        const row = el("div", "", "row");
        const name =
          entry.seat === s.seat
            ? "You"
            : (s.seats.find((x) => x.seat === entry.seat)?.name ?? "");
        const change = el("span");
        change.append(
          document.createTextNode(`${r.before_rating} → `),
          el("span", String(r.after_rating), "chg"),
        );
        row.append(el("span", name, "who"), change);
        block.append(row);
      }
      scroll.append(block);
    }
    const actions = el("div", "", "mp-actions");
    actions.style.marginTop = "18px";
    if (s.origin === "ranked") {
      actions.append(
        button("Play Ranked Again", async () => {
          toRoom(
            (await api<{ id: string }>("queue", {
              variant: s.variant,
              length: s.length,
              pace: "live",
              mode: "ranked",
            })).id,
          );
        }, "pillbtn primary"),
      );
    } else {
      actions.append(
        button("Friendly rematch", async () => {
          toRoom(
            (await api<{ id: string }>("matches/" + s.id + "/room", { kind: "rematch" })).id,
          );
        }, "pillbtn primary"),
      );
    }
    actions.append(
      button("Analyze", () => analyze(s.id), "pillbtn"),
      button("Leave", () => toLobby(), "pillbtn ghost"),
    );
    scroll.append(actions);
    screen.append(scroll);
    return screen;
  }

  // -- Room rendering / routing --------------------------------------

  async function analyze(id: string) {
    type Wire = Omit<ReconstructedReview, "chiHints" | "result"> & {
      chiHints: [number, { tileIds: [number, number] }][];
      result: NonNullable<ReconstructedReview["result"]>;
    };
    const current = epoch;
    const d = await api<Wire>("matches/" + id + "/review");
    if (current !== epoch) return;
    reviewing = true;
    const screen = el("section");
    screen.append(head("Board review", () => void route()));
    const container = el("div", "", "mp-review");
    screen.append(container);
    showScreen(screen);
    const timeline = new BoardTimeline({
      ...d,
      chiHints: new Map(d.chiHints),
      result: { ...d.result, events: d.events },
    });
    mountBoardReview(container, {
      timeline,
      allowReveal: true,
      renderTile: reviewTile,
      onBack: () => {
        void route();
      },
    });
  }

  async function refreshRoom(id: string) {
    const current = epoch;
    const data = await api<Snapshot>("matches/" + id + "?client=" + client);
    if (current === epoch && !reviewing) renderRoom(data);
  }

  function renderRoom(s: Snapshot) {
    if (reviewing) return;
    if (s.redirect) {
      toRoom(s.redirect);
      return;
    }
    clearInterval(timer);
    clockDeadline = null;
    const id = s.id;
    const prefix = "matches/" + id + "/room";
    const action = async (kind: string, seat?: number) => {
      await api(prefix, { kind, seat });
      await refreshRoom(id);
    };
    if (s.state === "waiting") {
      const screen = el("section");
      const backdrop = el("div");
      backdrop.style.cssText = "position:absolute; inset:0; overflow:hidden;";
      backdrop.append(
        lobbyScreen(
          lastLobby ?? { games: [], open: [], enabled: { custom: true, friendly: true, ranked: true } },
          true,
        ),
      );
      screen.append(backdrop);
      showScreen(screen);
      const leave = async () => {
        await api(prefix, { kind: "leave" });
        toLobby();
      };
      waitingSheet(screen, s, action, leave);
    } else if (s.state === "finished") {
      showScreen(resultsScreen(s));
    } else if (s.state === "playing") {
      showScreen(drawTable(s, id));
    } else {
      const screen = el("section");
      screen.append(head("Table closed", () => toLobby()));
      const scroll = el("div", "", "mp-scroll");
      scroll.append(el("p", "Table closed.", "mp-note"));
      screen.append(scroll);
      showScreen(screen);
    }
  }

  async function route() {
    const current = ++epoch;
    reviewing = false;
    source?.close();
    source = null;
    clearInterval(timer);
    clockDeadline = null;
    const hash = location.hash;
    try {
      if (!me) me = await api<Profile | null>("me");
      if (current !== epoch) return;
      if (me?.account && sessionStorage.getItem("om-online-upgrade")) {
        sessionStorage.removeItem("om-online-upgrade");
        await api("claim-guest", {});
      }
      if (hash.startsWith("#/join/")) {
        const code = hash.slice(7);
        pendingJoin = code;
        if (!me) {
          const screen = lobbyScreen(
            lastLobby ?? { games: [], open: [], enabled: { custom: true, friendly: true, ranked: true } },
            true,
          );
          showScreen(screen);
          guestSheet(screen);
          return;
        }
        const data = await api<Lobby>("games");
        if (current !== epoch) return;
        lastLobby = data;
        const screen = lobbyScreen(data);
        showScreen(screen);
        await openJoinSheet(screen, code);
        return;
      }
      if (hash.startsWith("#/match/")) {
        const id = hash.slice(8);
        await api("matches/" + id + "/presence", {
          client,
          claimControl: true,
          reclaim: true,
        });
        await refreshRoom(id);
        if (current !== epoch) return;
        source = new EventSource(
          base + "matches/" + id + "/stream?client=" + client,
          { withCredentials: true },
        );
        source.onmessage = (e) => {
          if (current === epoch) renderRoom(JSON.parse(e.data));
        };
        source.onerror = () => {
          if (current !== epoch) return;
          stage.querySelectorAll(".mp-netstrip").forEach((n) => {
            (n as HTMLElement).hidden = false;
          });
        };
        source.onopen = () => {
          if (current !== epoch) return;
          stage.querySelectorAll(".mp-netstrip").forEach((n) => {
            (n as HTMLElement).hidden = true;
          });
        };
        return;
      }
      // Lobby.
      if (!me) {
        const screen = lobbyScreen(
          lastLobby ?? { games: [], open: [], enabled: { custom: true, friendly: true, ranked: true } },
          true,
        );
        showScreen(screen);
        guestSheet(screen);
        return;
      }
      const data = await api<Lobby>("games");
      if (current !== epoch) return;
      lastLobby = data;
      const screen = lobbyScreen(data);
      showScreen(screen);
      if (pendingJoin) await openJoinSheet(screen, pendingJoin);
    } catch (e) {
      if (current === epoch) {
        const screen = el("section");
        screen.append(head("Play", null));
        const scroll = el("div", "", "mp-scroll");
        const err = el("p", "", "online-error");
        err.setAttribute("role", "alert");
        err.textContent = e instanceof Error ? e.message : String(e);
        scroll.append(
          err,
          button("Try again", () => route(), "pillbtn primary"),
          button("My games", () => toLobby(), "pillbtn ghost"),
        );
        screen.append(scroll);
        showScreen(screen);
        currentError = err;
      }
    }
  }
  window.addEventListener("hashchange", () => void route());
  window.addEventListener("pagehide", () => {
    source?.close();
    clearInterval(timer);
  });
  await route();
}
