import {
  tileName,
  type CallAction,
  type TurnAction,
  type VariantPublicView,
  type Tile,
  type SettlementEntry,
} from "@openmahjong/engine";
import { API_BASE } from "./api.js";
import { tileSymbol } from "./app.js";
import { TILE_SPRITE_SVG } from "./tiles-sprite.js";
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
type Format = { variant: string; length: string; pace: string };
type Summary = Format & {
  id: string;
  origin: string;
  state: string;
  yourMove?: boolean;
};
type Lobby = {
  games: Summary[];
  open: (Summary & { occupied: number; bots: number })[];
  enabled: Record<string, boolean>;
};
type Snapshot = Summary & {
  host: boolean;
  generation: number;
  controlling: boolean;
  redirect?: string;
  offer?: Format & {
    id: string;
    occupied: number;
    bots: number;
    expires_at: string;
  };
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
  }[];
  choices?: Action[];
  claimTile?: Tile;
  revision?: number;
  view?: VariantPublicView;
  deadline?: number | null;
  result?: SettlementEntry[];
  ratings?: { seat: number; before_rating: number; after_rating: number }[];
};
const variants: Record<string, string> = {
  riichi: "Riichi",
  "hong-kong": "Hong Kong Old Style",
  mcr: "MCR (WMO 2006)",
  taiwanese: "Taiwanese Every-flower",
};
const lengths: Record<string, string> = {
  east: "East only · 1 round",
  south: "East + South · 2 rounds",
  full: "Four rounds",
};
const paces = {
  live: "Live",
  correspondence: "Correspondence · No time limit",
};
const winds = ["East", "South", "West", "North"];
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
function tile(t: Tile) {
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
function format(f: Format) {
  return [
    variants[f.variant],
    lengths[f.length],
    f.pace === "live" ? "Live" : "Unlimited",
  ].join(" · ");
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
  const sprite = el("div");
  sprite.setAttribute("aria-hidden", "true");
  sprite.innerHTML = TILE_SPRITE_SVG;
  const shell = el("main", "", "online-shell"),
    top = el("header"),
    error = el("p", "", "online-error"),
    content = el("div");
  const network = el("span", "", "online-network");
  error.setAttribute("role", "alert");
  shell.append(sprite, top, error, content);
  root.replaceChildren(shell);
  root.classList.add("online-root");
  function button(
    title: string,
    action: () => Promise<void> | void,
    primary = false,
  ) {
    const b = el("button", title, primary ? "primary" : "");
    b.type = "button";
    b.onclick = async () => {
      if (busy) return;
      busy = true;
      b.disabled = true;
      error.textContent = "";
      try {
        await action();
      } catch (e) {
        error.textContent = e instanceof Error ? e.message : String(e);
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
  function header(title: string) {
    const home = el("a", "Open Mahjong");
    home.href = "/";
    top.replaceChildren(home, el("h1", title), network);
  }
  function signIn() {
    sessionStorage.setItem("om-online-return", location.hash);
    if (me && !me.account) sessionStorage.setItem("om-online-upgrade", "1");
    location.assign(origin + "/auth/google/start");
  }
  function field(label: string, input: HTMLElement) {
    const n = el("label", label);
    n.append(input);
    return n;
  }
  function login() {
    header("Join a table");
    const name = el("input");
    name.maxLength = 32;
    name.setAttribute("autocomplete", "nickname");
    const code = el("input");
    code.type = "password";
    code.autocomplete = "off";
    const recover = el("details");
    recover.append(
      el("summary", "Recover a guest seat"),
      field("Recovery code", code),
      button("Recover", async () => {
        await guest("recover", { code: code.value });
      }),
    );
    async function guest(path: string, b: unknown) {
      me = await api<Profile>(path, b);
      const recovery = el("code", me.recovery);
      content.replaceChildren(
        el("h2", "Save your guest recovery code"),
        el(
          "p",
          "Use this private code to recover your seats on another device.",
        ),
        recovery,
        button(
          "Continue",
          async () => {
            await route();
          },
          true,
        ),
      );
    }
    content.replaceChildren(
      field("Display name", name),
      button(
        "Play as guest",
        async () => {
          await guest("guests", { name: name.value });
        },
        true,
      ),
      button("Sign in with Google", signIn),
      recover,
    );
  }

  function select(
    label: string,
    values: Record<string, string>,
    current: string,
    onChange: (v: string) => void,
  ) {
    const s = el("select");
    for (const [v, name] of Object.entries(values)) {
      const o = el("option", name);
      o.value = v;
      o.selected = current === v;
      s.append(o);
    }
    s.onchange = () => onChange(s.value);
    return field(label, s);
  }
  async function lobby(current: number) {
    const data = await api<Lobby>("games");
    if (current !== epoch) return;
    header("Multiplayer");
    const form = el("section", "", "online-card"),
      settings = el("div", "", "online-settings"),
      actions = el("div", "", "online-actions");
    const renderSettings = () => {
      const allowed = { ...lengths };
      if (selected.variant === "riichi") delete allowed.full;
      settings.replaceChildren(
        select("Rules", variants, selected.variant, (v) => {
          selected.variant = v;
          if (v === "riichi" && selected.length === "full")
            selected.length = "east";
          renderSettings();
        }),
        select("Length", allowed, selected.length, (v) => {
          selected.length = v;
        }),
        select("Pace", paces, selected.pace, (v) => {
          selected.pace = v;
        }),
      );
    };
    renderSettings();
    const fill = el("input");
    fill.type = "checkbox";
    fill.checked = acceptCustom;
    fill.onchange = () => {
      acceptCustom = fill.checked;
    };
    form.append(
      field("Offer me matching Friendly seats at custom tables", fill),
    );
    const policy = el("p");
    const showPreset = () => {
      policy.textContent =
        selected.pace === "live"
          ? "20 seconds to play · 5 seconds to claim · Bot cover after 60 seconds away."
          : "Turns and claims wait until answered. You can close the browser between decisions.";
    };
    settings.addEventListener("change", showPreset);
    showPreset();
    const enter = async (path: string, mode?: string) =>
      toRoom(
        (await api<{ id: string }>(path, { ...selected, mode, acceptCustom }))
          .id,
      );
    if (data.enabled.friendly)
      actions.append(
        button("Find Friendly game", () => enter("queue", "friendly"), true),
      );
    if (data.enabled.ranked)
      actions.append(
        button(me!.account ? "Find Ranked game" : "Sign in for Ranked", () =>
          me!.account ? enter("queue", "ranked") : signIn(),
        ),
      );
    if (data.enabled.custom)
      actions.append(button("Create custom room", () => enter("rooms")));
    form.prepend(el("h2", "Open play"), settings, policy);
    form.append(actions);
    if (data.enabled.ranked)
      form.append(
        el(
          "p",
          "Ranked starts with four accounts. Once a bot plays for your seat, your rating can stay level or fall for that match.",
        ),
      );
    const mine = el("section", "", "online-card"),
      games = el("div");
    const showGames = () => {
      games.replaceChildren();
      for (const g of data.games.filter(
        (g) =>
          filter === "all" ||
          (g.state === "playing" &&
            (filter === "move" ? g.yourMove : !g.yourMove)),
      )) {
        games.append(
          button(
            format(g) +
              " · " +
              g.origin +
              " · " +
              (g.state === "playing"
                ? g.yourMove
                  ? "Your move"
                  : "Waiting for table"
                : g.state),
            () => toRoom(g.id),
          ),
        );
      }
      if (!games.childElementCount) games.append(el("p", "No games here yet."));
    };
    mine.append(
      el("h2", "My games"),
      select(
        "Show",
        { all: "All games", move: "Your move", waiting: "Waiting for table" },
        filter,
        (v) => {
          filter = v;
          showGames();
        },
      ),
      games,
    );
    showGames();
    const publicRooms = el("section", "", "online-card");
    publicRooms.append(el("h2", "Friendly seats at custom tables"));
    for (const r of data.open)
      publicRooms.append(
        button(
          format(r) + " · " + r.occupied + "/4 seated · " + r.bots + " bots",
          async () => {
            toRoom((await api<{ id: string }>("rooms/join", { id: r.id })).id);
          },
        ),
      );
    if (!data.open.length)
      publicRooms.append(el("p", "No open seats advertised."));
    const profile = el("details");
    profile.append(
      el("summary", me!.name + " · " + (me!.account ? "Account" : "Guest")),
    );
    const name = el("input");
    name.value = me!.name;
    name.maxLength = 32;
    profile.append(
      field("Display name", name),
      button("Save name", async () => {
        await api("profile", { name: name.value });
        me!.name = name.value;
        await route();
      }),
    );
    if (!me!.account)
      profile.append(
        button("Create or sign in to an account", signIn),
        button("Replace recovery code", async () => {
          if (!window.confirm("Replace your previous guest recovery code?"))
            return;
          const code = await api<{ recovery: string }>("guest/recovery", {});
          let display = profile.querySelector("code");
          if (!display) {
            display = el("code");
            profile.append(display);
          }
          display.textContent = code.recovery;
        }),
      );
    content.replaceChildren(
      form,
      mine,
      publicRooms,
      profile,
      button("Refresh games", () => route()),
    );
  }

  function drawTable(s: Snapshot, id: string) {
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
    const v = s.view!,
      table = el("section", "", "online-board");
    table.append(
      el(
        "h2",
        winds[v.roundWind - 27] +
          " " +
          v.kyoku +
          " · " +
          v.wallRemaining +
          " tiles left",
      ),
    );
    if (s.handResult) {
      const last = s.handResult,
        winner = s.seats.find((p) => p.seat === last.seat);
      table.append(
        el(
          "p",
          "Previous hand · " + (winner ? winner.name + " · " : "") + last.kind,
        ),
      );
    }
    if (v.doraIndicators.length) {
      const indicators = el("div", "Dora ");
      indicators.append(...v.doraIndicators.map(tile));
      table.append(indicators);
    }
    if (s.variant === "riichi")
      table.append(
        el("p", v.honba + " repeats · " + v.sticks + " riichi sticks"),
      );
    for (let i = 0; i < 4; i++) {
      const seat = (s.seat + i) % 4,
        p = v.players[seat]!,
        m = s.seats.find((x) => x.seat === seat)!;
      const area = el("section", "", "online-seat");
      area.dataset.own = String(i === 0);
      area.append(
        el(
          "h3",
          winds[p.seatWind - 27] +
            " · " +
            m.name +
            (i === 0 ? " (you)" : "") +
            (m.covered ? " · Bot covering" : "") +
            (p.isDealer ? " · Dealer" : "") +
            (p.riichi ? " · Riichi" : "") +
            " · " +
            p.score,
        ),
      );
      if (m.coverAt)
        area.append(
          el(
            "small",
            "Disconnected · bot cover at " +
              new Date(m.coverAt).toLocaleTimeString(),
          ),
        );
      if (i === 0) {
        const hand = el("div", "", "online-hand");
        for (const t of [...v.hand].sort((a, b) => a.id - b.id)) {
          const index =
            s.choices?.findIndex(
              (a) => a.type === "discard" && !a.riichi && a.tileId === t.id,
            ) ?? -1;
          if (index < 0) {
            hand.append(tile(t));
            continue;
          }
          const actionId = crypto.randomUUID();
          const pick = button("", () => move(index, actionId));
          pick.setAttribute("aria-label", "Discard " + tileName(t));
          pick.className = "online-pick";
          pick.append(tile(t));
          hand.append(pick);
        }
        area.append(hand);
      } else area.append(el("small", p.handCount + " concealed tiles"));
      for (const meld of p.melds) {
        const group = el("div", meld.kind + " ");
        group.append(...meld.tiles.map(tile));
        area.append(group);
      }
      if (v.flowerTiles?.[seat]?.length) {
        const flowers = el("div", "Flowers ");
        flowers.append(...v.flowerTiles[seat]!.map(tile));
        area.append(flowers);
      }
      const river = el("div", "", "online-pond");
      river.setAttribute("aria-label", "Discards");
      for (const d of p.discards) {
        const face = tile(d.tile);
        if (d.called) face.classList.add("called");
        river.append(face);
      }
      area.append(river);
      table.append(area);
    }
    const choices = el("section", "", "online-card");
    choices.append(
      el("h2", s.choices?.length ? "Your move" : "Waiting for table"),
      ...(s.choices?.some((a) => a.type === "discard")
        ? [el("p", "Select a tile in your hand to discard.")]
        : []),
    );
    if (s.claimTile) {
      const offered = el("p", "Claim ");
      offered.append(tile(s.claimTile));
      choices.append(offered);
    }
    if (s.deadline && s.choices?.length) {
      const clock = el("p");
      const update = () => {
        clock.textContent =
          Math.max(0, Math.ceil((s.deadline! - Date.now()) / 1000)) +
          " seconds remaining";
      };
      update();
      timer = window.setInterval(update, 250);
      choices.append(clock);
    }
    for (const [index, a] of (s.choices ?? []).entries()) {
      if (a.type === "discard" && !a.riichi) continue;
      const label =
        a.type === "discard"
          ? (a.riichi ? "Riichi · " : "Discard ") +
            tileName(v.hand.find((t) => t.id === a.tileId)!)
          : a.type === "chi"
            ? "Chi " +
              a.tileIds
                .map((id) => tileName(v.hand.find((t) => t.id === id)!))
                .join(" + ")
            : "tileType" in a
              ? a.type +
                " " +
                tileName({ id: -1, type: a.tileType, red: false })
              : a.type;
      const actionId = crypto.randomUUID();
      choices.append(button(label, () => move(index, actionId)));
    }
    const own = s.seats.find((p) => p.seat === s.seat)!;
    if (!s.controlling || (own.covered && s.pace === "live"))
      choices.append(
        button("Reclaim my seat", async () => {
          await api("matches/" + id + "/presence", {
            reclaim: true,
            claimControl: true,
            client,
          });
          await refreshRoom(id);
        }),
      );
    return [choices, table];
  }

  async function analyze(id: string) {
    type Wire = Omit<ReconstructedReview, "chiHints" | "result"> & {
      chiHints: [number, { tileIds: [number, number] }][];
      result: NonNullable<ReconstructedReview["result"]>;
    };
    const current = epoch;
    const d = await api<Wire>("matches/" + id + "/review");
    if (current !== epoch) return;
    reviewing = true;
    const timeline = new BoardTimeline({
      ...d,
      chiHints: new Map(d.chiHints),
      result: { ...d.result, events: d.events },
    });
    mountBoardReview(content, {
      timeline,
      allowReveal: true,
      renderTile: tile,
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
    const id = s.id,
      prefix = "matches/" + id + "/room";
    header(
      s.state === "finished"
        ? "Results"
        : s.state === "waiting"
          ? "Waiting room"
          : "Mahjong table",
    );
    const back = el("a", "My games");
    back.href = "#/online";
    const h = el("div", "", "online-meta");
    h.append(back, el("p", format(s) + " · " + s.origin));
    const action = async (kind: string, seat?: number) => {
      await api(prefix, { kind, seat });
      await refreshRoom(id);
    };
    const leave = button(
      s.state === "waiting" ? "Leave waiting room" : "Leave table",
      async () => {
        if (
          !window.confirm(
            s.state === "playing"
              ? "Withdraw from this table? A bot will finish in your seat."
              : "Leave your seat?",
          )
        )
          return;
        await api(prefix, { kind: "leave" });
        location.hash = "/online";
      },
    );
    if (s.state === "waiting") {
      const room = el("section", "", "online-card");
      room.append(el("h2", "Seats"));
      for (let i = 0; i < 4; i++) {
        const p = s.seats.find((p) => p.seat === i);
        const row = el(
          "p",
          winds[i] +
            " · " +
            (p
              ? p.name + (p.bot ? " · Bot" : p.ready ? " · Ready" : " · Seated")
              : "Open"),
        );
        if (p?.bot && s.host)
          row.append(button("Remove bot", () => action("removeBot", i)));
        room.append(row);
      }
      if (s.invite) {
        const link = el("input");
        link.readOnly = true;
        link.value = location.origin + "/#/join/" + s.invite;
        room.append(
          field("Invite link", link),
          button("Copy invite", () =>
            navigator.clipboard.writeText(link.value),
          ),
        );
      }
      const mine = s.seats.find((p) => p.seat === s.seat);
      if (!mine?.ready)
        room.append(button("Ready", () => action("ready"), true));
      if (s.origin === "custom" && s.host) {
        if (s.seats.length < 4)
          room.append(
            button("Add bot", () => action("bot")),
            button(
              s.listed ? "Close public seats" : "Offer seats in Friendly",
              () => action(s.listed ? "unlist" : "list"),
            ),
          );
        if (s.seats.length === 4 && s.seats.every((p) => p.ready))
          room.append(button("Start match", () => action("start"), true));
      }
      if (s.offer) {
        const o = s.offer;
        room.append(
          el("h3", "Friendly room offer"),
          el(
            "p",
            format(o) +
              " · " +
              o.occupied +
              "/4 seated · " +
              o.bots +
              " bots · Expires " +
              new Date(o.expires_at).toLocaleTimeString(),
          ),
          button("Accept seat", async () =>
            toRoom(
              (await api<{ id: string }>("offers", { id: o.id, accept: true }))
                .id,
            ),
          ),
          button("Keep waiting", async () => {
            await api("offers", { id: o.id, accept: false });
            await refreshRoom(id);
          }),
        );
      }
      room.append(leave);
      content.replaceChildren(h, room);
    } else if (s.state === "finished") {
      const result = el("section", "", "online-card");
      result.append(el("h2", "Final standings"));
      if (s.ratingVoid)
        result.append(el("p", "Unrated result · " + s.ratingVoid));
      for (const entry of [...s.result!].sort((a, b) => a.rank - b.rank)) {
        const score = s.ratings?.find((r) => r.seat === entry.seat);
        result.append(
          el(
            "p",
            entry.rank +
              ". " +
              s.seats.find((x) => x.seat === entry.seat)!.name +
              " · " +
              entry.score +
              " points · Settlement " +
              entry.points +
              (score
                ? " · Rating " +
                  score.before_rating +
                  " → " +
                  score.after_rating
                : ""),
          ),
        );
      }
      result.append(
        button("Analyze", () => analyze(id), true),
        button("Friendly rematch", async () =>
          toRoom((await api<{ id: string }>(prefix, { kind: "rematch" })).id),
        ),
      );
      if (s.origin === "ranked")
        result.append(
          button("Play Ranked Again", async () =>
            toRoom(
              (
                await api<{ id: string }>("queue", {
                  variant: s.variant,
                  length: s.length,
                  pace: s.pace,
                  mode: "ranked",
                })
              ).id,
            ),
          ),
        );
      content.replaceChildren(h, result);
    } else if (s.state === "playing") {
      content.replaceChildren(h, ...drawTable(s, id), leave);
      if (s.pace === "correspondence") {
        const votes = s.seats.filter((p) => p.endRequested).length;
        const mine = s.seats.find((p) => p.seat === s.seat)!;
        content.append(
          button(
            mine.endRequested
              ? "End requested (" + votes + ")"
              : "Propose ending by agreement",
            async () => {
              if (!mine.endRequested) await action("end");
            },
          ),
        );
      }
    } else content.replaceChildren(h, el("p", "Table closed."));
  }

  async function route() {
    const current = ++epoch;
    reviewing = false;
    source?.close();
    source = null;
    clearInterval(timer);
    network.textContent = "";
    const hash = location.hash;
    try {
      if (!me) me = await api<Profile | null>("me");
      if (current !== epoch) return;
      if (!me) {
        login();
        return;
      }
      if (me.account && sessionStorage.getItem("om-online-upgrade")) {
        sessionStorage.removeItem("om-online-upgrade");
        await api("claim-guest", {});
      }
      if (hash.startsWith("#/join/")) {
        header("Room invitation");
        content.replaceChildren(
          el("p", "Join this custom room as " + me.name + "?"),
          button(
            "Join room",
            async () => {
              const r = await api<{ id: string }>("rooms/join", {
                invite: hash.slice(7),
              });
              location.replace("#/match/" + r.id);
            },
            true,
          ),
        );
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
          {
            withCredentials: true,
          },
        );
        source.onmessage = (e) => {
          if (current === epoch) renderRoom(JSON.parse(e.data));
        };
        source.onerror = () => {
          if (current === epoch) network.textContent = "Reconnecting…";
        };
        source.onopen = () => {
          if (current === epoch) network.textContent = "";
        };
        return;
      }
      await lobby(current);
    } catch (e) {
      if (current === epoch) {
        error.textContent = e instanceof Error ? e.message : String(e);
        content.replaceChildren(
          button("Try again", () => route()),
          button("My games", () => {
            location.hash = "/online";
          }),
        );
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
