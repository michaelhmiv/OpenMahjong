import {
  DEFAULT_HK_SETTINGS,
  DEFAULT_TAIWANESE_SETTINGS,
  calculateDraft,
  declaredGroup,
  derivedSessionState,
  variantAdapter,
  tileTypeName,
  type CalculationDraft,
  type CalculatorInput,
  type CalculationContext,
  type HongKongSettings,
  type TaiwaneseSettings,
  type Meld,
  type ScoringSession,
  type Tile,
  type VariantScoreInput,
} from "@openmahjong/engine";
import {
  WIND_NAMES,
  btn,
  cxContextPanel,
  cxCorrections,
  cxLabel,
  cxPaymentBlock,
  cxPreview,
  cxStepperChips,
  el,
  foldPayments,
  tryCalculate,
  windIndex,
} from "./compact-calc.js";
import { tx } from "./i18n/index.js";

function field(label: string, node: HTMLElement): HTMLLabelElement {
  const l = el("label", label, "tool-field");
  node.setAttribute("aria-label", label);
  l.append(node);
  return l;
}
function numInput(value: string | number): HTMLInputElement {
  const n = el("input");
  n.type = "number";
  n.value = String(value);
  n.min = "0";
  n.max = "100000";
  n.step = "1";
  return n;
}
function select(
  values: readonly (readonly [string, string])[],
  value: string,
): HTMLSelectElement {
  const n = el("select");
  for (const [id, label] of values) {
    const o = el("option", label);
    o.value = id;
    n.append(o);
  }
  n.value = value;
  return n;
}

export interface VariantCalculatorOptions {
  session: ScoringSession;
  existing?: CalculationDraft;
  /** Winner context from the scorekeeper's seat tap. */
  context?: { winner: number; winType: "ron" | "tsumo"; payer: number };
  renderTile: (tile: Tile) => HTMLElement;
  onRecord: (draft: CalculationDraft) => void;
  onBack: () => void;
  setTitle?: (title: string) => void;
  /** Exact score changes for a draft (session fold). */
  previewDeltas?: (draft: CalculationDraft) => number[];
}

export function mountVariantCalculator(
  host: HTMLElement,
  options: VariantCalculatorOptions,
): void {
  if (
    options.session.variant !== "hong-kong" &&
    options.session.variant !== "mcr" &&
    options.session.variant !== "taiwanese"
  )
    throw new Error(tx("calc.variant.unsupported-variant-calculator", "Unsupported variant calculator"));
  const variant = options.session.variant,
    adapter = variantAdapter(variant),
    existing = options.existing;
  const initial =
      existing?.input.variant === variant ? existing.input : undefined,
    derived = derivedSessionState(options.session),
    // The derived repeat count is a payment counter only in
    // Taiwanese. Hong Kong tracks dealer repeats for rotation,
    // but its scoring has no repeat payments and the engine
    // rejects a nonzero counter in a Hong Kong context; MCR
    // never repeats. Carry the counter only where it is paid.
    liveHonba = variant === "taiwanese" ? derived.honba : 0,
    ctx: CalculationContext = initial?.context
      ? {
          ...initial.context,
          honba: variant === "taiwanese" ? initial.context.honba : 0,
        }
      : options.context
        ? {
            winner: options.context.winner,
            payer: options.context.payer,
            dealer: derived.dealer,
            winType: options.context.winType,
            honba: liveHonba,
          }
        : {
            winner: 0,
            payer: 1,
            dealer: derived.dealer,
            winType: "ron",
            honba: liveHonba,
          },
    roundWind =
      initial?.path === "tiles" ? initial.hand.roundWind : derived.roundWind;
  const status = el("p", "", "tool-status");
  status.setAttribute("role", "status");
  const screen = el("div", "", "cx-screen");
  host.append(status, screen);
  function safe(fn: () => void): void {
    try {
      status.textContent = "";
      fn();
    } catch (e) {
      status.textContent =
        e instanceof Error ? e.message : tx("calc.variant.invalid-hand-entry", "Invalid hand entry");
    }
  }
  const show = (title: string): void => {
    options.setTitle?.(title);
    screen.replaceChildren();
  };
  const names = options.session.names;
  const name = (seat: number) => names[seat] ?? tx("calc.variant.player-0", `Player ${seat + 1}`, seat + 1);
  const windName = (seat: number) =>
    WIND_NAMES[windIndex(seat, ctx.dealer)]!;
  const variantLabel =
    variant === "hong-kong"
      ? tx("calc.variant.hong-kong-old-style", "Hong Kong Old Style")
      : variant === "mcr"
        ? "MCR"
        : "Taiwanese";
  const unitWord = variant === "taiwanese" ? "tai" : "fan";

  // ---- table settings state ----------------------------------------------
  const hkSettings: {
    minimum: number;
    cap: number;
    table: HongKongSettings["table"];
    split: HongKongSettings["split"];
  } = {
    ...(initial?.variant === "hong-kong"
      ? initial.settings
      : DEFAULT_HK_SETTINGS),
  };
  const twSettings: { base: number; unit: number } = {
    ...(initial?.variant === "taiwanese"
      ? initial.settings
      : DEFAULT_TAIWANESE_SETTINGS),
  };

  function contextRows(): (readonly [string, string])[] {
    const rows: [string, string][] = [
      ["Variant", variantLabel],
      ["Winner", `${name(ctx.winner)} · ${windName(ctx.winner)}`],
      ["Win", ctx.winType === "ron" ? tx("calc.variant.on-a-discard", "On a discard") : "Self-draw"],
    ];
    if (ctx.winType === "ron")
      rows.push([tx("calc.variant.discarded-by", "Discarded by"), `${name(ctx.payer)} · ${windName(ctx.payer)}`]);
    rows.push(["Dealer", tx("calc.variant.v-0-east", `${name(ctx.dealer)} · East`, name(ctx.dealer))]);
    if (variant === "hong-kong")
      rows.push([tx("calc.variant.table-minimum", "Table minimum"), `${hkSettings.minimum} fan`]);
    if (variant === "mcr") rows.push([tx("calc.variant.table-minimum", "Table minimum"), "8 fan"]);
    if (variant === "taiwanese" && ctx.honba > 0)
      rows.push([tx("calc.variant.dealer-repeats", "Dealer repeats"), String(ctx.honba)]);
    return rows;
  }

  // ---- fast-path state -----------------------------------------------------
  // Values live at mount level so Edit returns and path switches
  // keep the entry in progress.
  let fanVal =
      initial?.path === "fast"
        ? initial.variant === "taiwanese"
          ? initial.tai
          : initial.fan
        : variant === "mcr"
          ? 8
          : variant === "taiwanese"
            ? 0
            : 3,
    flowerVal =
      initial?.variant === "mcr" && initial.path === "fast"
        ? initial.flowers
        : 0;
  let fastLive: HTMLElement | undefined,
    fastContext: HTMLElement | undefined;

  function fastDraft(): CalculationDraft {
    const fan = fanVal;
    const entered: CalculatorInput =
      variant === "hong-kong"
        ? { variant, path: "fast", context: ctx, fan, settings: { ...hkSettings } }
        : variant === "mcr"
          ? {
              variant,
              path: "fast",
              context: ctx,
              fan,
              flowers: flowerVal,
            }
          : { variant, path: "fast", context: ctx, tai: fan, settings: { ...twSettings } };
    return { input: entered, corrections: [] };
  }

  function paintFastLive(): void {
    if (!fastLive) return;
    const result = tryCalculate(fastDraft());
    if (!result) {
      fastLive.replaceChildren();
      return;
    }
    const total = result.payments
      .filter((p) => p.to === ctx.winner)
      .reduce((a, p) => a + p.amount, 0);
    const children: HTMLElement[] = [
      cxPaymentBlock({
        lines: result.payments.map(
          (p) =>
            `${name(p.from)} pays ${name(p.to)} ${p.amount.toLocaleString("en-US")} points`,
        ),
        big: tx("calc.variant.v-0-receives-1-points", `${name(ctx.winner)} receives ${total.toLocaleString("en-US")} points`, name(ctx.winner), total.toLocaleString("en-US")),
      }),
    ];
    if (!result.eligible)
      children.push(
        el(
          "p",
          variant === "hong-kong"
            ? tx("calc.variant.hands-below-0-fan-cannot-win-at-this-table", `Hands below ${hkSettings.minimum} fan cannot win at this table.`, hkSettings.minimum)
            : tx("calc.variant.hands-below-8-fan-cannot-win", "Hands below 8 fan cannot win."),
          "cx-note",
        ),
      );
    fastLive.replaceChildren(...children);
  }

  function renderFast(): void {
    show(tx("calc.variant.hand-value", "Hand value"));
    fastContext = cxContextPanel(contextRows());
    screen.append(fastContext);
    const panel = el("section", "", "cx-panel");
    const fanCtl = cxStepperChips({
      label:
        variant === "mcr"
          ? tx("calc.variant.fan-excluding-flowers", "Fan excluding flowers")
          : variant === "taiwanese"
            ? tx("calc.variant.tai-excluding-dealer-bonus", "Tai excluding dealer bonus")
            : tx("calc.variant.fan", "Fan"),
      value: fanVal,
      min: 0,
      max: 999,
      ...(variant === "hong-kong"
        ? { chips: [3, 4, 5, 6, 7, 8, 10], chipCols: 4 }
        : {}),
      onChange: (n) => {
        fanVal = n;
        paintFastLive();
      },
    });
    panel.append(fanCtl.node);
    if (variant === "mcr") {
      const flowerCtl = cxStepperChips({
        label: tx("calc.variant.flowers", "Flowers"),
        value: flowerVal,
        min: 0,
        max: 8,
        onChange: (n) => {
          flowerVal = n;
          paintFastLive();
        },
      });
      panel.append(el("div", "", "cx-divider"), flowerCtl.node);
    }
    screen.append(panel);
    if (variant === "hong-kong") screen.append(hkSettingsDetails());
    if (variant === "taiwanese") screen.append(twSettingsPanel());
    if (variant === "mcr")
      screen.append(
        el(
          "p",
          tx("calc.variant.mcr-mahjong-competition-rules-eight-fan-from-pat", "MCR (Mahjong Competition Rules) · Eight fan from patterns are required, not counting flowers. Every player who did not win pays eight base points; the discarder — the player who threw the winning tile — also pays the hand value, which is the hand's fan plus its flower points. On a self-draw win, every opponent pays the hand value plus eight."),
          "cx-note",
        ),
      );
    fastLive = el("div");
    screen.append(fastLive);
    screen.append(
      btn(tx("calc.variant.score-it-from-the-tiles", "Score it from the tiles"), () => renderTiles(), "cx-quiet"),
      el(
        "p",
        tx("calc.variant.enter-the-tiles-instead-the-winner-and-win-type", "Enter the tiles instead. The winner and win type carry over."),
        "cx-note",
      ),
      btn(
        tx("calc.variant.show-payments", "Show payments"),
        () => safe(() => renderPreview(fastDraft())),
        "primary",
      ),
    );
    paintFastLive();
  }

  function hkSettingsDetails(): HTMLElement {
    const details = el("details", "", "cx-panel");
    details.append(el("summary", tx("calc.variant.supported-table-settings", "Supported table settings")));
    const min = numInput(hkSettings.minimum),
      cap = numInput(hkSettings.cap),
      scale = select(
        [
          ["half-spicy", tx("calc.variant.half-spicy", "Half-spicy")],
          ["full-spicy", tx("calc.variant.full-spicy", "Full-spicy")],
        ],
        hkSettings.table,
      ),
      split = select(
        [
          ["clear-chapter", tx("calc.variant.discarder-pays-twice-others-once", "Discarder pays twice; others once")],
          ["discarder-all", tx("calc.variant.discarder-pays-three-base-shares", "Discarder pays three base shares")],
        ],
        hkSettings.split,
      );
    const sync = () => {
      hkSettings.minimum = Number(min.value);
      hkSettings.cap = Number(cap.value);
      hkSettings.table = scale.value as HongKongSettings["table"];
      hkSettings.split = split.value as HongKongSettings["split"];
    };
    for (const c of [min, cap, scale, split])
      c.addEventListener("input", () => {
        sync();
        fastContext?.replaceWith((fastContext = cxContextPanel(contextRows())));
        paintFastLive();
      });
    details.append(
      field(tx("calc.variant.minimum-fan", "Minimum fan"), min),
      field(tx("calc.variant.fan-cap-3-10", "Fan cap (3–10)"), cap),
      field(tx("calc.variant.fan-conversion", "Fan conversion"), scale),
      field(tx("calc.variant.discard-payment-split", "Discard payment split"), split),
      el(
        "p",
        tx("calc.variant.half-spicy-is-the-fan-conversion-taught-in-the-l", "Half-spicy is the fan conversion taught in the lessons: three fan is 8 base points, rising through 16, 24, 32, 48, 64 and 96 to 128 at ten fan. Full-spicy doubles the base points at each fan step instead: three fan is 8, four is 16, five is 32, six is 64, and so on. Under the discard payment split, Discarder pays twice means the player who discarded the winning tile pays two shares and each other opponent pays one; Discarder pays three base shares means that player pays all three shares and the other opponents pay nothing on a discard win."),
        "cx-note",
      ),
      el(
        "p",
        tx("calc.variant.these-in-person-settings-are-recorded-with-this", "These in-person settings are recorded with this hand and do not change CPU rules."),
        "cx-note",
      ),
    );
    return details;
  }

  function twSettingsPanel(): HTMLElement {
    const panel = el("section", "", "cx-panel slim");
    const base = numInput(twSettings.base),
      unit = numInput(twSettings.unit);
    const sync = () => {
      twSettings.base = Number(base.value);
      twSettings.unit = Number(unit.value);
      paintFastLive();
    };
    base.addEventListener("input", sync);
    unit.addEventListener("input", sync);
    panel.append(
      field(tx("calc.variant.base-points", "Base points"), base),
      field(tx("calc.variant.points-per-tai", "Points per tai"), unit),
      el(
        "p",
        tx("calc.variant.every-flower-earns-one-tai-whichever-plant-or-se", "Every flower earns one tai, whichever plant or season it is. You do not need to announce a ready hand before you may win. Five sets and a pair. Enter tai without dealer bonuses; the payer lines add 1 + 2 × dealer repeats only to payments involving the dealer."),
        "cx-note",
      ),
    );
    return panel;
  }

  // ---- tiles-path state ----------------------------------------------------
  const inventory = adapter.inventory(),
    concealed: Tile[] = [],
    melds: { kind: Meld["kind"]; tiles: Tile[] }[] = [],
    flowers: Tile[] = [],
    meldDraft: Tile[] = [];
  const flags: Record<string, HTMLInputElement> = {};
  let tilesSeeded = false;
  function seedTiles(): void {
    if (tilesSeeded) return;
    tilesSeeded = true;
    if (initial?.path === "tiles") {
      const counts = [...initial.hand.counts],
        used = new Set<number>();
      const take = (type: number) => {
        const t = inventory.find((t) => t.type === type && !used.has(t.id))!;
        used.add(t.id);
        return t;
      };
      for (const m of initial.hand.melds) {
        melds.push({ kind: m.kind, tiles: m.tiles.map(take) });
        m.tiles.forEach((t) => counts[t]!--);
      }
      counts.forEach((n, t) => {
        for (let i = 0; i < n; i++) concealed.push(take(t));
      });
      flowers.push(
        ...initial.hand.flowers.map(
          (t) => inventory.find((v) => v.type === t)!,
        ),
      );
    }
  }

  function renderTiles(): void {
    seedTiles();
    show(tx("calc.variant.hand-value", "Hand value"));
    screen.append(cxContextPanel(contextRows()));
    const panel = el("section", "", "cx-panel");
    const target = select(
        [
          ["hand", tx("calc.variant.concealed-tiles-including-winning-tile", "Concealed tiles, including winning tile")],
          ["meld", tx("calc.variant.declared-meld", "Declared meld")],
        ],
        "hand",
      ),
      kind = select(
        [
          [
            "chi",
            variant === "taiwanese"
              ? tx("calc.variant.open-sequence-a-run-of-three-in-one-suit", "Open sequence — a run of three in one suit")
              : tx("calc.variant.open-sequence-chow", "Open sequence (chow)"),
          ],
          [
            "pon",
            variant === "taiwanese"
              ? tx("calc.variant.open-triplet-three-of-a-kind", "Open triplet — three of a kind")
              : tx("calc.variant.open-triplet-pung", "Open triplet (pung)"),
          ],
          ["ankan", tx("calc.variant.concealed-quad", "Concealed quad")],
          ["daiminkan", tx("calc.variant.open-quad", "Open quad")],
          ["shouminkan", tx("calc.variant.added-quad", "Added quad")],
        ],
        "chi",
      ),
      winning = select(
        inventory
          .filter((t) => t.type < 34 && t.id % 4 === 0)
          .map((t) => [String(t.type), tileTypeName(t.type)]),
        String(initial?.path === "tiles" ? initial.hand.winningTile : 0),
      );
    const display = el("div"),
      picker = el("div", "", "tool-tile-picker"),
      flowerPicker = el("div", "", "tool-tile-picker");
    function draw(): void {
      display.replaceChildren(
        el(
          "p",
          tx("calc.variant.v-0-concealed-tiles-1-declared-sets-2-flowers-seas", `${concealed.length} concealed tiles · ${melds.length} declared sets · ${flowers.length} flowers/seasons`, concealed.length, melds.length, flowers.length),
          "cx-note",
        ),
      );
      const row = el("div", "", "tool-tile-row");
      concealed.forEach((t, i) => {
        const b = btn("", () => {
          concealed.splice(i, 1);
          draw();
        });
        b.className = "tile-choice";
        b.setAttribute("aria-label", tx("calc.variant.remove-0", `Remove ${tileTypeName(t.type)}`, tileTypeName(t.type)));
        b.append(options.renderTile(t));
        row.append(b);
      });
      display.append(row);
      melds.forEach((m, i) => {
        const r = el("div", "", "tool-meld");
        r.append(
          el(
            "span",
            (
              {
                chi:
                  variant === "taiwanese"
                    ? tx("calc.variant.open-sequence", "Open sequence")
                    : tx("calc.variant.open-sequence-chow", "Open sequence (chow)"),
                pon:
                  variant === "taiwanese"
                    ? tx("calc.variant.open-triplet", "Open triplet")
                    : tx("calc.variant.open-triplet-pung", "Open triplet (pung)"),
                ankan: tx("calc.variant.concealed-quad", "Concealed quad"),
                daiminkan: tx("calc.variant.open-quad", "Open quad"),
                shouminkan: tx("calc.variant.added-quad", "Added quad"),
              } as Record<string, string>
            )[m.kind] ?? m.kind,
          ),
          ...m.tiles.map(options.renderTile),
          btn(tx("calc.variant.remove-meld", "Remove meld"), () => {
            melds.splice(i, 1);
            draw();
          }),
        );
        display.append(r);
      });
      const pending = el("div", "", "tool-tile-row");
      pending.append(
        el("span", tx("calc.variant.meld-draft", "Meld draft")),
        ...meldDraft.map(options.renderTile),
      );
      display.append(
        pending,
        btn(tx("calc.variant.clear-meld-draft", "Clear meld draft"), () => {
          meldDraft.length = 0;
          draw();
        }),
      );
      for (const b of flowerPicker.querySelectorAll<HTMLButtonElement>(
        "button",
      ))
        b.setAttribute(
          "aria-pressed",
          String(
            flowers.some((f) => f.type === Number(b.dataset["flowerType"])),
          ),
        );
    }
    for (const rep of inventory.filter((t) => t.type < 34 && t.id % 4 === 0)) {
      const b = btn("", () =>
        safe(() => {
          const dest = target.value === "meld" ? meldDraft : concealed;
          if (
            dest.length >=
            (target.value === "meld" ? 4 : adapter.standingTiles + 1)
          )
            throw new Error(tx("calc.variant.tile-group-is-full", "Tile group is full"));
          const used = [
            ...concealed,
            ...meldDraft,
            ...melds.flatMap((m) => m.tiles),
          ];
          const tile = inventory.find(
            (t) => t.type === rep.type && !used.some((u) => u.id === t.id),
          );
          if (!tile) throw new Error(tx("calc.variant.all-four-copies-have-been-entered", "All four copies have been entered"));
          dest.push(tile);
          draw();
        }),
      );
      b.className = "tile-choice";
      b.setAttribute("aria-label", tx("calc.variant.add-0", `Add ${tileTypeName(rep.type)}`, tileTypeName(rep.type)));
      b.append(options.renderTile(rep));
      picker.append(b);
    }
    for (const flower of inventory.filter((t) => t.type >= 34)) {
      const b = btn("", () => {
        const i = flowers.findIndex((t) => t.id === flower.id);
        if (i < 0) flowers.push(flower);
        else flowers.splice(i, 1);
        draw();
      });
      b.className = "tile-choice";
      b.dataset["flowerType"] = String(flower.type);
      b.setAttribute("aria-label", tx("calc.variant.flower-0", `Flower ${tileTypeName(flower.type)}`, tileTypeName(flower.type)));
      b.append(options.renderTile(flower));
      flowerPicker.append(b);
    }
    const circumstance = el("div");
    for (const [key, label] of [
      [
        "replacement",
        variant === "taiwanese"
          ? tx("calc.variant.win-on-a-quad-or-flower-replacement", "Win on a quad or flower replacement")
          : tx("calc.variant.win-on-a-quad-replacement", "Win on a quad replacement"),
      ],
      ["robbingQuad", tx("calc.variant.win-by-robbing-an-added-quad", "Win by robbing an added quad")],
      [
        "lastWall",
        variant === "taiwanese"
          ? tx("calc.variant.win-by-drawing-the-last-tile-of-the-live-wall", "Win by drawing the last tile of the live wall")
          : tx("calc.variant.win-on-the-last-live-tile-or-final-discard", "Win on the last live tile or final discard"),
      ],
      [
        "initial",
        variant === "taiwanese"
          ? tx("calc.variant.win-on-the-very-first-draw-of-the-hand", "Win on the very first draw of the hand")
          : tx("calc.variant.initial-uninterrupted-self-draw", "Initial uninterrupted self-draw"),
      ],
      [
        "lastCopy",
        variant === "taiwanese"
          ? tx("calc.variant.winning-tile-is-the-last-copy-that-is-not-showin", "Winning tile is the last copy that is not showing")
          : tx("calc.variant.winning-tile-is-the-last-unexposed-copy", "Winning tile is the last unexposed copy"),
      ],
    ]) {
      const i = numInput("");
      i.type = "checkbox";
      i.checked =
        initial?.path === "tiles"
          ? Boolean((initial.hand as unknown as Record<string, unknown>)[key!])
          : false;
      flags[key!] = i;
      circumstance.append(field(label!, i));
    }
    panel.append(
      el(
        "p",
        tx("calc.variant.build-0-sets-and-a-pair-enter-concealed-tiles-in", `Build ${adapter.sets} sets and a pair. Enter concealed tiles including the winning tile, add declared sets separately, and select exposed flowers or seasons.`, adapter.sets),
        "cx-note",
      ),
      field(tx("calc.variant.add-tiles-to", "Add tiles to"), target),
      field(tx("calc.variant.meld-type", "Meld type"), kind),
      display,
      btn(tx("calc.variant.add-declared-meld", "Add declared meld"), () =>
        safe(() => {
          if (melds.length >= adapter.sets) throw new Error(tx("calc.variant.too-many-sets", "Too many sets"));
          declaredGroup({
            kind: kind.value as Meld["kind"],
            tiles: meldDraft.map((t) => t.type),
          });
          melds.push({
            kind: kind.value as Meld["kind"],
            tiles: [...meldDraft],
          });
          meldDraft.length = 0;
          draw();
        }),
      ),
      picker,
      field(tx("calc.variant.winning-tile", "Winning tile"), winning),
      ...(variant === "hong-kong"
        ? [
            el(
              "p",
              tx("calc.variant.a-meld-is-a-set-you-have-shown-or-declared-such", "A meld is a set you have shown or declared, such as an open triplet or a quad. Flowers and seasons are the eight bonus tiles: set them apart here, as at the table. The circumstance boxes record how the hand was won: a quad replacement is the extra tile drawn after declaring a quad; robbing an added quad is winning on the fourth tile another player adds to a shown triplet; the last live tile is the last tile left to draw from the wall, and a final discard is the discard that follows it; an initial uninterrupted self-draw is a first-draw win with nothing interrupting the start (a Heavenly Hand for the dealer, an Earthly Hand for another player); the last unexposed copy is the final copy of the winning tile that no player had shown."),
              "cx-note",
            ),
          ]
        : []),
      el("h3", tx("calc.variant.flowers-and-seasons", "Flowers and seasons")),
      flowerPicker,
      circumstance,
    );
    screen.append(panel);
    screen.append(
      btn(
        tx("calc.variant.show-payments", "Show payments"),
        () =>
          safe(() => {
            if (meldDraft.length)
              throw new Error(tx("calc.variant.finish-or-clear-the-meld-draft", "Finish or clear the meld draft"));
            const counts = new Array<number>(34).fill(0);
            for (const t of [...concealed, ...melds.flatMap((m) => m.tiles)])
              counts[t.type]!++;
            const hand: VariantScoreInput = {
              counts,
              melds: melds.map((m) => ({
                kind: m.kind,
                tiles: m.tiles.map((t) => t.type),
              })),
              winningTile: Number(winning.value),
              selfDraw: ctx.winType === "tsumo",
              seatWind: 27 + windIndex(ctx.winner, ctx.dealer),
              roundWind,
              flowers: flowers.map((t) => t.type),
              replacement: flags["replacement"]!.checked,
              robbingQuad: flags["robbingQuad"]!.checked,
              lastWall: flags["lastWall"]!.checked,
              initial: flags["initial"]!.checked,
              lastCopy: flags["lastCopy"]!.checked,
            };
            const entered: CalculatorInput =
              variant === "hong-kong"
                ? { variant, path: "tiles", context: ctx, hand, settings: { ...hkSettings } }
                : variant === "mcr"
                  ? { variant, path: "tiles", context: ctx, hand }
                  : { variant, path: "tiles", context: ctx, hand, settings: { ...twSettings } };
            renderPreview({ input: entered, corrections: [] });
          }),
        "primary",
      ),
      btn(
        variant === "taiwanese" ? tx("calc.variant.fast-tai-entry", "Fast tai entry") : tx("calc.variant.fast-fan-entry", "Fast fan entry"),
        () => renderFast(),
        "cx-quiet",
      ),
    );
    draw();
  }

  // ---- check payments -------------------------------------------------------
  function renderPreview(draft: CalculationDraft): void {
    const result = calculateDraft(draft);
    show(tx("calc.variant.check-payments", "Check payments"));
    const deltas = options.previewDeltas
      ? options.previewDeltas(draft)
      : foldPayments(4, result.payments);
    const order = [
      ctx.winner,
      ...(ctx.winType === "ron" ? [ctx.payer] : []),
      ...[0, 1, 2, 3]
        .filter(
          (s) =>
            s !== ctx.winner && !(ctx.winType === "ron" && s === ctx.payer),
        )
        .sort((a, b) => windIndex(a, ctx.dealer) - windIndex(b, ctx.dealer)),
    ];
    const headSub =
      variant === "mcr"
        ? tx("calc.variant.v-0-points-1-fan-excluding-flowers-2-3", `${result.units} points · ${result.qualifyingUnits} fan excluding flowers · ${WIND_NAMES[roundWind - 27]} ${ctx.dealer + 1}`, result.units, result.qualifyingUnits, WIND_NAMES[roundWind - 27], ctx.dealer + 1)
        : tx("calc.variant.v-0-1-2-3-4", `${result.units} ${unitWord} · ${WIND_NAMES[roundWind - 27]} ${ctx.dealer + 1}${variant === "taiwanese" && ctx.honba > 0 ? " " + tx("calc.variant.dealer-repeats-0", `· Dealer repeats ${ctx.honba}`, ctx.honba) : ""}`, result.units, unitWord, WIND_NAMES[roundWind - 27], ctx.dealer + 1, variant === "taiwanese" && ctx.honba > 0 ? " " + tx("calc.variant.dealer-repeats-0", `· Dealer repeats ${ctx.honba}`, ctx.honba) : "");
    cxPreview(screen, {
      headMain:
        ctx.winType === "ron"
          ? `${name(ctx.winner)} wins on a discard from ${name(ctx.payer)}.`
          : `${name(ctx.winner)} wins by self-draw.`,
      headSub,
      rows: order.map((s) => ({
        name: name(s),
        suffix: `· ${windName(s)}${s === ctx.dealer ? " " + tx("calc.variant.dealer", "· Dealer") : ""}`,
        delta: deltas[s]!,
      })),
      paymentLines: result.payments.map(
        (p) =>
          `${name(p.from)} pays ${name(p.to)} ${p.amount.toLocaleString("en-US")} points`,
      ),
      ...(result.eligible
        ? {}
        : {
            ineligibleNote:
              tx("calc.variant.below-the-tables-minimum-fan-correct-the-breakdo", "Below the table’s minimum fan. Correct the breakdown or continue the hand."),
          }),
      corrections: cxCorrections({
        draft,
        result,
        adjustmentLabel:
          variant === "taiwanese"
            ? tx("calc.variant.additional-manual-tai", "Additional manual tai")
            : tx("calc.variant.additional-manual-fan", "Additional manual fan"),
        showFu: false,
        reasonLabel: tx("calc.variant.reason-for-correction", "Reason for correction"),
        onApply: (d) => safe(() => renderPreview(d)),
        safe,
      }),
      confirmLabel: existing ? tx("calc.variant.confirm-correction", "Confirm correction") : tx("calc.variant.confirm-and-add-to-table", "Confirm and add to table"),
      onConfirm: () =>
        safe(() => {
          if (!result.eligible)
            throw new Error(tx("calc.variant.confirm-an-eligible-breakdown-first", "Confirm an eligible breakdown first"));
          options.onRecord(draft);
        }),
      onEdit: () =>
        draft.input.path === "tiles" ? renderTiles() : renderFast(),
    });
  }

  if (existing) safe(() => renderPreview(existing));
  else renderFast();
}
