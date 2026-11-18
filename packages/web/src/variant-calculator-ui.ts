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

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  className = "",
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.textContent = text;
  n.className = className;
  return n;
}
function button(text: string, action: () => void): HTMLButtonElement {
  const b = el("button", text, "primary");
  b.type = "button";
  b.addEventListener("click", action);
  return b;
}
function input(value: string | number, type = "number"): HTMLInputElement {
  const n = el("input");
  n.type = type;
  n.value = String(value);
  if (type === "number") {
    n.min = "0";
    n.max = "100000";
    n.step = "1";
  }
  return n;
}
function field(label: string, node: HTMLElement): HTMLLabelElement {
  const l = el("label", label, "tool-field");
  node.setAttribute("aria-label", label);
  l.append(node);
  return l;
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
export function mountVariantCalculator(
  host: HTMLElement,
  options: {
    session: ScoringSession;
    existing?: CalculationDraft;
    renderTile: (tile: Tile) => HTMLElement;
    onRecord: (draft: CalculationDraft) => void;
    onBack: () => void;
  },
): void {
  if (
    options.session.variant !== "hong-kong" &&
    options.session.variant !== "mcr" &&
    options.session.variant !== "taiwanese"
  )
    throw new Error("Unsupported variant calculator");
  const variant = options.session.variant,
    adapter = variantAdapter(variant),
    existing = options.existing;
  const initial =
      existing?.input.variant === variant ? existing.input : undefined,
    // Dealer, round wind and dealer repeats are derived from the
    // session ledger, never asked. A correction keeps the context its
    // entry was recorded in.
    derived = derivedSessionState(options.session),
    ctx = initial?.context ?? {
      winner: 0,
      payer: 1,
      dealer: derived.dealer,
      winType: "ron",
      honba: derived.honba,
    },
    roundWind =
      initial?.path === "tiles" ? initial.hand.roundWind : derived.roundWind;
  let path: "tiles" | "fast" = initial?.path ?? "tiles";
  const status = el("p", "", "tool-status");
  status.setAttribute("role", "status");
  const form = el("form"),
    output = el("section", "", "calculator-output"),
    names = options.session.names.map((n, i) => [String(i), n] as const),
    winner = select(names, String(ctx.winner)),
    payer = select(names, String(ctx.payer)),
    win = select(
      [
        ["ron", "Win on a discard"],
        ["tsumo", "Self-draw"],
      ],
      ctx.winType,
    );
  form.append(
    el(
      "p",
      variant === "hong-kong"
        ? "Fan are scoring units awarded for hand patterns. This profile requires three fan by default, then converts fan into base points and applies the payer split."
        : variant === "mcr"
          ? "Fan are additive pattern points in MCR (Mahjong Competition Rules). Flowers are separate points and cannot meet the eight-fan minimum."
          : "Tai are scoring points added together. Each payment is base points plus tai times the points per tai, with the dealer bonus added only to a payment involving the dealer.",
      "dim",
    ),
  );
  const context = el("div", "", "tool-grid");
  context.append(
    field("Winner", winner),
    field("Discarding player", payer),
    field("Win type", win),
    el(
      "p",
      `${["East", "South", "West", "North"][roundWind - 27]} round · Dealer (East): ${options.session.names[ctx.dealer]}${variant === "taiwanese" ? ` · Dealer repeats: ${ctx.honba}` : ""}`,
      "dim",
    ),
  );
  form.append(context);
  const house =
      initial?.variant === "hong-kong" ? initial.settings : DEFAULT_HK_SETTINGS,
    min = input(house.minimum),
    cap = input(house.cap),
    scale = select(
      [
        ["half-spicy", "Half-spicy"],
        ["full-spicy", "Full-spicy"],
      ],
      house.table,
    ),
    split = select(
      [
        ["clear-chapter", "Discarder pays twice; others once"],
        ["discarder-all", "Discarder pays three base shares"],
      ],
      house.split,
    );
  const settings = el("details");
  settings.append(
    el("summary", "Supported table settings"),
    field("Minimum fan", min),
    field("Fan cap (3–10)", cap),
    field("Fan conversion", scale),
    field("Discard payment split", split),
    el(
      "p",
      "Half-spicy is the fan conversion taught in the lessons: three fan is 8 base points, rising through 16, 24, 32, 48, 64 and 96 to 128 at ten fan. Full-spicy doubles the base points at each fan step instead: three fan is 8, four is 16, five is 32, six is 64, and so on. Under the discard payment split, Discarder pays twice means the player who discarded the winning tile pays two shares and each other opponent pays one; Discarder pays three base shares means that player pays all three shares and the other opponents pay nothing on a discard win.",
      "dim",
    ),
    el(
      "p",
      "These in-person settings are recorded with this hand and do not change CPU rules.",
      "dim",
    ),
  );
  const taiHouse =
      initial?.variant === "taiwanese"
        ? initial.settings
        : DEFAULT_TAIWANESE_SETTINGS,
    base = input(taiHouse.base),
    unit = input(taiHouse.unit);
  if (variant === "hong-kong") form.append(settings);
  else if (variant === "taiwanese")
    form.append(
      field("Base points", base),
      field("Points per tai", unit),
      el(
        "p",
        "Every flower earns one tai, whichever plant or season it is. You do not need to announce a ready hand before you may win. Five sets and a pair. Enter tai without dealer bonuses; the payer lines add 1 + 2 × dealer repeats only to payments involving the dealer.",
        "dim",
      ),
    );
  else
    form.append(
      el(
        "p",
        "MCR (Mahjong Competition Rules) · Eight fan from patterns are required, not counting flowers. Every player who did not win pays eight base points; the discarder — the player who threw the winning tile — also pays the hand value, which is the hand's fan plus its flower points. On a self-draw win, every opponent pays the hand value plus eight.",
        "dim",
      ),
    );
  const paths = el("div", "", "tool-grid"),
    tilesButton = button("Enter actual tiles", () => setPath("tiles")),
    fastButton = button(
      variant === "taiwanese" ? "Fast tai entry" : "Fast fan entry",
      () => setPath("fast"),
    );
  paths.append(tilesButton, fastButton);
  form.append(paths);
  const tilesPanel = el("section"),
    fastPanel = el("section"),
    fan = input(
      initial?.path === "fast"
        ? initial.variant === "taiwanese"
          ? initial.tai
          : initial.fan
        : variant === "mcr"
          ? 8
          : variant === "taiwanese"
            ? 0
            : 3,
    );
  const flowerCount = input(
    initial?.variant === "mcr" && initial.path === "fast" ? initial.flowers : 0,
  );
  fastPanel.append(
    field(
      variant === "mcr"
        ? "Fan excluding flowers"
        : variant === "taiwanese"
          ? "Tai excluding dealer bonus"
          : "Fan · Scoring units",
      fan,
    ),
  );
  if (variant === "mcr")
    fastPanel.append(field("Number of flowers (0–8)", flowerCount));
  const inventory = adapter.inventory(),
    concealed: Tile[] = [],
    melds: { kind: Meld["kind"]; tiles: Tile[] }[] = [],
    flowers: Tile[] = [],
    meldDraft: Tile[] = [];
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
      ...initial.hand.flowers.map((t) => inventory.find((v) => v.type === t)!),
    );
  }
  const target = select(
      [
        ["hand", "Concealed tiles, including winning tile"],
        ["meld", "Declared meld"],
      ],
      "hand",
    ),
    kind = select(
      [
        [
          "chi",
          variant === "taiwanese"
            ? "Open sequence — a run of three in one suit"
            : "Open sequence (chow)",
        ],
        [
          "pon",
          variant === "taiwanese"
            ? "Open triplet — three of a kind"
            : "Open triplet (pung)",
        ],
        ["ankan", "Concealed quad"],
        ["daiminkan", "Open quad"],
        ["shouminkan", "Added quad"],
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
  function safe(fn: () => void): void {
    try {
      status.textContent = "";
      fn();
    } catch (e) {
      status.textContent =
        e instanceof Error ? e.message : "Invalid hand entry";
    }
  }
  function draw(): void {
    display.replaceChildren(
      el(
        "p",
        `${concealed.length} concealed tiles · ${melds.length} declared sets · ${flowers.length} flowers/seasons`,
        "dim",
      ),
    );
    const row = el("div", "", "tool-tile-row");
    concealed.forEach((t, i) => {
      const b = button("", () => {
        concealed.splice(i, 1);
        draw();
        output.replaceChildren();
      });
      b.className = "tile-choice";
      b.setAttribute("aria-label", `Remove ${tileTypeName(t.type)}`);
      b.append(options.renderTile(t));
      row.append(b);
    });
    display.append(row);
    melds.forEach((m, i) => {
      const row = el("div", "", "tool-meld");
      row.append(
        el(
          "span",
          (
            {
              chi:
                variant === "taiwanese"
                  ? "Open sequence"
                  : "Open sequence (chow)",
              pon:
                variant === "taiwanese"
                  ? "Open triplet"
                  : "Open triplet (pung)",
              ankan: "Concealed quad",
              daiminkan: "Open quad",
              shouminkan: "Added quad",
            } as Record<string, string>
          )[m.kind] ?? m.kind,
        ),
        ...m.tiles.map(options.renderTile),
        button("Remove meld", () => {
          melds.splice(i, 1);
          draw();
          output.replaceChildren();
        }),
      );
      display.append(row);
    });
    const pending = el("div", "", "tool-tile-row");
    pending.append(
      el("span", "Meld draft"),
      ...meldDraft.map(options.renderTile),
    );
    display.append(
      pending,
      button("Clear meld draft", () => {
        meldDraft.length = 0;
        draw();
        output.replaceChildren();
      }),
    );
    for (const b of flowerPicker.querySelectorAll<HTMLButtonElement>("button"))
      b.setAttribute(
        "aria-pressed",
        String(flowers.some((f) => f.type === Number(b.dataset["flowerType"]))),
      );
  }
  for (const rep of inventory.filter((t) => t.type < 34 && t.id % 4 === 0)) {
    const b = button("", () =>
      safe(() => {
        const dest = target.value === "meld" ? meldDraft : concealed;
        if (
          dest.length >=
          (target.value === "meld" ? 4 : adapter.standingTiles + 1)
        )
          throw new Error("Tile group is full");
        const used = [
          ...concealed,
          ...meldDraft,
          ...melds.flatMap((m) => m.tiles),
        ];
        const tile = inventory.find(
          (t) => t.type === rep.type && !used.some((u) => u.id === t.id),
        );
        if (!tile) throw new Error("All four copies have been entered");
        dest.push(tile);
        draw();
        output.replaceChildren();
      }),
    );
    b.className = "tile-choice";
    b.setAttribute("aria-label", `Add ${tileTypeName(rep.type)}`);
    b.append(options.renderTile(rep));
    picker.append(b);
  }
  for (const flower of inventory.filter((t) => t.type >= 34)) {
    const b = button("", () => {
      const i = flowers.findIndex((t) => t.id === flower.id);
      if (i < 0) flowers.push(flower);
      else flowers.splice(i, 1);
      draw();
      output.replaceChildren();
    });
    b.className = "tile-choice";
    b.dataset["flowerType"] = String(flower.type);
    b.setAttribute("aria-label", `Flower ${tileTypeName(flower.type)}`);
    b.append(options.renderTile(flower));
    flowerPicker.append(b);
  }
  const flags: Record<string, HTMLInputElement> = {};
  const circumstance = el("div");
  for (const [key, label] of [
    [
      "replacement",
      variant === "taiwanese"
        ? "Win on a quad or flower replacement"
        : "Win on a quad replacement",
    ],
    ["robbingQuad", "Win by robbing an added quad"],
    [
      "lastWall",
      variant === "taiwanese"
        ? "Win by drawing the last tile of the live wall"
        : "Win on the last live tile or final discard",
    ],
    [
      "initial",
      variant === "taiwanese"
        ? "Win on the very first draw of the hand"
        : "Initial uninterrupted self-draw",
    ],
    [
      "lastCopy",
      variant === "taiwanese"
        ? "Winning tile is the last copy that is not showing"
        : "Winning tile is the last unexposed copy",
    ],
  ]) {
    const i = input("", "checkbox");
    i.checked =
      initial?.path === "tiles"
        ? Boolean((initial.hand as unknown as Record<string, unknown>)[key!])
        : false;
    flags[key!] = i;
    circumstance.append(field(label!, i));
  }
  tilesPanel.append(
    el(
      "p",
      `Build ${adapter.sets} sets and a pair. Enter concealed tiles including the winning tile, add declared sets separately, and select exposed flowers or seasons.`,
      "dim",
    ),
    field("Add tiles to", target),
    field("Meld type", kind),
    display,
    button("Add declared meld", () =>
      safe(() => {
        if (melds.length >= adapter.sets) throw new Error("Too many sets");
        declaredGroup({
          kind: kind.value as Meld["kind"],
          tiles: meldDraft.map((t) => t.type),
        });
        melds.push({ kind: kind.value as Meld["kind"], tiles: [...meldDraft] });
        meldDraft.length = 0;
        draw();
        output.replaceChildren();
      }),
    ),
    picker,
    field("Winning tile", winning),
    ...(variant === "hong-kong"
      ? [
          el(
            "p",
            "A meld is a set you have shown or declared, such as an open triplet or a quad. Flowers and seasons are the eight bonus tiles: set them apart here, as at the table. The circumstance boxes record how the hand was won: a quad replacement is the extra tile drawn after declaring a quad; robbing an added quad is winning on the fourth tile another player adds to a shown triplet; the last live tile is the last tile left to draw from the wall, and a final discard is the discard that follows it; an initial uninterrupted self-draw is a first-draw win with nothing interrupting the start (a Heavenly Hand for the dealer, an Earthly Hand for another player); the last unexposed copy is the final copy of the winning tile that no player had shown.",
            "dim",
          ),
        ]
      : []),
    el("h3", "Flowers and seasons"),
    flowerPicker,
    circumstance,
  );
  form.append(tilesPanel, fastPanel);
  const submit = el("button", "Calculate payments", "primary");
  submit.type = "submit";
  form.append(submit);
  function setPath(next: "tiles" | "fast"): void {
    path = next;
    tilesPanel.hidden = path !== "tiles";
    fastPanel.hidden = path !== "fast";
    tilesButton.setAttribute("aria-pressed", String(path === "tiles"));
    fastButton.setAttribute("aria-pressed", String(path === "fast"));
    output.replaceChildren();
  }
  function draft(): CalculationDraft {
    const context: CalculationContext = {
      winner: Number(winner.value),
      payer: Number(payer.value),
      dealer: ctx.dealer,
      winType: win.value as "ron" | "tsumo",
      honba: variant === "taiwanese" ? ctx.honba : 0,
    };
    const settings: HongKongSettings = {
      minimum: Number(min.value),
      cap: Number(cap.value),
      table: scale.value as HongKongSettings["table"],
      split: split.value as HongKongSettings["split"],
    };
    const taiSettings: TaiwaneseSettings = {
      base: Number(base.value),
      unit: Number(unit.value),
    };
    let entered: CalculatorInput;
    if (path === "fast")
      entered =
        variant === "hong-kong"
          ? { variant, path, context, fan: Number(fan.value), settings }
          : variant === "mcr"
            ? {
                variant,
                path,
                context,
                fan: Number(fan.value),
                flowers: Number(flowerCount.value),
              }
            : {
                variant,
                path,
                context,
                tai: Number(fan.value),
                settings: taiSettings,
              };
    else {
      if (meldDraft.length) throw new Error("Finish or clear the meld draft");
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
        selfDraw: context.winType === "tsumo",
        seatWind: 27 + ((context.winner - context.dealer + 4) % 4),
        roundWind: roundWind,
        flowers: flowers.map((t) => t.type),
        replacement: flags["replacement"]!.checked,
        robbingQuad: flags["robbingQuad"]!.checked,
        lastWall: flags["lastWall"]!.checked,
        initial: flags["initial"]!.checked,
        lastCopy: flags["lastCopy"]!.checked,
      };
      entered =
        variant === "hong-kong"
          ? { variant, path, context, hand, settings }
          : variant === "mcr"
            ? { variant, path, context, hand }
            : { variant, path, context, hand, settings: taiSettings };
    }
    return { input: entered, corrections: [] };
  }
  function result(value: CalculationDraft): void {
    const score = calculateDraft(value);
    output.replaceChildren(el("h2", "Who pays"));
    for (const p of score.payments)
      output.append(
        el(
          "p",
          `${options.session.names[p.from]} pays ${options.session.names[p.to]} ${p.amount.toLocaleString("en-US")} points`,
          "payment-lines",
        ),
      );
    if (!score.eligible)
      output.append(
        el(
          "p",
          "Below the table’s minimum fan. Correct the breakdown or continue the hand.",
          "card",
        ),
      );
    output.append(
      el(
        "h3",
        variant === "mcr"
          ? `${score.units} points · ${score.qualifyingUnits} fan excluding flowers`
          : `${score.units} ${variant === "taiwanese" ? "tai" : "fan"}`,
      ),
      el(
        "p",
        value.input.path === "tiles"
          ? "Detected from entered tiles and circumstances"
          : variant === "taiwanese"
            ? "Tai entered by the player; dealer bonus is applied per payer"
            : "Fan entered by the player",
        "dim",
      ),
    );
    const fields = score.detected.map((f) => {
        const control = input(
          score.corrected.find((c) => c.id === f.id)?.units ?? f.units,
        );
        output.append(field(`${f.label} · Original ${f.units}`, control));
        return { id: f.id, units: f.units, control };
      }),
      extra = input(
        value.corrections.find((c) => c.id === "table-adjustment")?.units ?? 0,
      ),
      reason = input(value.corrections[0]?.reason ?? "", "text");
    reason.maxLength = 240;
    output.append(
      field(
        variant === "taiwanese"
          ? "Additional manual tai"
          : "Additional manual fan",
        extra,
      ),
      field("Reason for correction", reason),
      button("Apply corrections and recalculate", () =>
        safe(() => {
          const corrections = fields
            .filter((f) => Number(f.control.value) !== f.units)
            .map((f) => ({
              id: f.id,
              units: Number(f.control.value),
              reason: reason.value,
            }));
          if (Number(extra.value))
            corrections.push({
              id: "table-adjustment",
              units: Number(extra.value),
              reason: reason.value,
            });
          result({ input: value.input, corrections });
        }),
      ),
    );
    const confirm = input("", "checkbox"),
      record = button(
        options.existing ? "Confirm correction" : "Confirm and add to table",
        () =>
          safe(() => {
            if (!confirm.checked || !score.eligible)
              throw new Error("Confirm an eligible breakdown first");
            options.onRecord(value);
          }),
      );
    let dirty = false;
    record.disabled = true;
    output.append(field("I confirm the payment breakdown", confirm), record);
    output.addEventListener("input", (e) => {
      if (e.target !== confirm) {
        dirty = true;
        confirm.checked = false;
        record.disabled = true;
      }
    });
    confirm.addEventListener(
      "change",
      () => (record.disabled = dirty || !confirm.checked || !score.eligible),
    );
  }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    safe(() => result(draft()));
  });
  form.addEventListener("input", () => output.replaceChildren());
  host.append(
    status,
    form,
    output,
    button("Return to scorekeeper", options.onBack),
  );
  draw();
  setPath(path);
  if (existing) safe(() => result(existing));
}
