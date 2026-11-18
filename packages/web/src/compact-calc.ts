import {
  calculateDraft,
  type CalculationDraft,
  type CalculationResult,
} from "@openmahjong/engine";

/**
 * The compact calculator grammar (approved set: calc-v2 compact +
 * calc-v6 medium scorekeeper + calc-v7 compact frames 15–17;
 * design rules §16). Shared by the scorekeeper, the riichi /
 * american hand calculator, the variant calculators and the
 * standalone one-off calculator: a state strip, seat tiles in
 * table order, stepper + quick-chip value entry, and a dedicated
 * check-payments screen whose Confirm is the recording gate.
 */

export const WIND_NAMES = ["East", "South", "West", "North"] as const;
export const WIND_GLYPHS = ["東", "南", "西", "北"] as const;

/** Wind index (0 = East … 3 = North) of a seat, given the dealer. */
export function windIndex(seat: number, dealer: number): number {
  return (seat - dealer + 4) % 4;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  className = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}

export function btn(
  text: string,
  action: () => void,
  className = "",
): HTMLButtonElement {
  const b = el("button", text, className);
  b.type = "button";
  b.addEventListener("click", action);
  return b;
}

export function cxLabel(text: string): HTMLParagraphElement {
  return el("p", text, "cx-label");
}

/** The one-line session state strip: hand state left, pot right. */
export function cxStrip(main: string, sub: string): HTMLElement {
  const strip = el("section", "", "cx-strip");
  strip.append(el("span", main, "cx-strip-main"));
  if (sub) strip.append(el("span", sub, "cx-strip-sub"));
  return strip;
}

export interface SeatTileInfo {
  readonly seat: number;
  readonly name: string;
  readonly score: number;
  /** Wind index 0–3 (0 = East). */
  readonly wind: number;
  readonly dealer: boolean;
}

/**
 * A seat as a tile object (medium R3): wind chip, wind label,
 * name and score. The dealer's chip glyph and wind label carry
 * the chun red — the one color job. Interactive seats are
 * buttons; standings seats are plain tiles.
 */
export function cxSeatTile(
  info: SeatTileInfo,
  opts: {
    interactive: boolean;
    selected?: boolean;
    onTap?: (seat: number) => void;
  },
): HTMLElement {
  const wind = WIND_NAMES[info.wind]!;
  const node = opts.interactive
    ? el("button", "", "cx-seat")
    : el("div", "", "cx-seat");
  if (opts.interactive) {
    const b = node as HTMLButtonElement;
    b.type = "button";
    b.setAttribute(
      "aria-label",
      `${info.name} · ${info.score.toLocaleString("en-US")} points`,
    );
    b.setAttribute("aria-pressed", String(Boolean(opts.selected)));
    b.addEventListener("click", () => opts.onTap?.(info.seat));
  }
  if (info.dealer) node.dataset["dealer"] = "true";
  if (opts.selected) node.classList.add("sel");
  const chip = el("span", WIND_GLYPHS[info.wind]!, "cx-seat-chip");
  chip.setAttribute("aria-hidden", "true");
  const texts = el("span", "", "cx-seat-texts");
  texts.append(
    el(
      "span",
      info.dealer ? `${wind} · Dealer` : wind,
      "cx-seat-wind",
    ),
    el("span", info.name, "cx-seat-name"),
    el(
      "span",
      `${info.score.toLocaleString("en-US")} points`,
      "cx-seat-score",
    ),
  );
  node.append(chip, texts);
  return node;
}

/**
 * Seat tiles in table order: North, West across the top and
 * East, South across the bottom — the table seen from above,
 * as drawn in the approved compact frames.
 */
export function cxSeatGrid(
  seats: readonly SeatTileInfo[],
  opts: {
    interactive: boolean;
    selectedSeat?: number;
    onTap?: (seat: number) => void;
  },
): HTMLElement {
  const grid = el("div", "", "cx-seats");
  const byWind = [...seats].sort((a, b) => a.wind - b.wind);
  // byWind: [East, South, West, North] → grid [North, West, East, South]
  const order = [byWind[3]!, byWind[2]!, byWind[0]!, byWind[1]!];
  for (const info of order)
    grid.append(
      cxSeatTile(info, {
        interactive: opts.interactive,
        ...(opts.selectedSeat === info.seat ? { selected: true } : {}),
        ...(opts.onTap ? { onTap: opts.onTap } : {}),
      }),
    );
  return grid;
}

/** Read-only key/value context panel (the value screens' header). */
export function cxContextPanel(
  rows: readonly (readonly [string, string])[],
): HTMLElement {
  const panel = el("section", "", "cx-panel cx-context");
  for (const [k, v] of rows) {
    const row = el("div", "", "cx-kv");
    row.append(el("span", k, "k"), el("span", v, "v"));
    panel.append(row);
  }
  return panel;
}

export interface StepperChips {
  readonly node: HTMLElement;
  value(): number;
  setValue(n: number): void;
}

/**
 * Value entry in the compact grammar: a − / value / + stepper
 * (48px) over a row of quick chips. Stepping follows `sequence`
 * when given (fu values), otherwise ±step within [min, max].
 */
export function cxStepperChips(opts: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  sequence?: readonly number[];
  chips?: readonly number[];
  /** Grid columns for the chips (defaults to the chip count). */
  chipCols?: number;
  onChange: (n: number) => void;
}): StepperChips {
  let value = opts.value;
  const wrap = el("div", "", "cx-value-group");
  const display = el("div", String(value), "cx-stepval");
  const chipButtons = new Map<number, HTMLButtonElement>();
  const paint = () => {
    display.textContent = String(value);
    for (const [n, b] of chipButtons) {
      b.classList.toggle("on", n === value);
      b.setAttribute("aria-pressed", String(n === value));
    }
  };
  const set = (n: number) => {
    value = Math.max(opts.min, Math.min(opts.max, n));
    paint();
    opts.onChange(value);
  };
  const stepBy = (dir: 1 | -1) => {
    if (opts.sequence) {
      const seq = opts.sequence;
      let i = seq.findIndex((v) => v >= value);
      if (i < 0) i = seq.length - 1;
      if (seq[i] !== value) i = dir > 0 ? i : i - 1;
      else i += dir;
      const next = seq[Math.max(0, Math.min(seq.length - 1, i))];
      if (next !== undefined) set(next);
    } else set(value + dir * (opts.step ?? 1));
  };
  const stepper = el("div", "", "cx-stepper");
  const minus = btn("−", () => stepBy(-1), "cx-stepbtn");
  minus.setAttribute("aria-label", `Decrease ${opts.label}`);
  const plus = btn("+", () => stepBy(1), "cx-stepbtn");
  plus.setAttribute("aria-label", `Increase ${opts.label}`);
  stepper.append(minus, display, plus);
  wrap.append(cxLabel(opts.label), stepper);
  if (opts.chips?.length) {
    const chips = el(
      "div",
      "",
      `cx-chips c${opts.chipCols ?? opts.chips.length}`,
    );
    for (const n of opts.chips) {
      const c = btn(String(n), () => set(n), "cx-chip");
      c.setAttribute("aria-pressed", "false");
      chipButtons.set(n, c);
      chips.append(c);
    }
    wrap.append(chips);
  }
  paint();
  return {
    node: wrap,
    value: () => value,
    setValue: (n: number) => {
      value = Math.max(opts.min, Math.min(opts.max, n));
      paint();
    },
  };
}

/** The deep payment block shared by value screens and previews. */
export function cxPaymentBlock(opts: {
  lines: readonly string[];
  notes?: readonly string[];
  big?: string;
  lead?: string;
}): HTMLElement {
  const block = el("div", "", "payment-lines cx-pay");
  if (opts.lead) block.append(el("p", opts.lead, "cx-paynote"));
  for (const line of opts.lines) block.append(el("p", line, "cx-payline"));
  if (opts.big) block.append(el("p", opts.big, "cx-big"));
  for (const note of opts.notes ?? [])
    block.append(el("p", note, "cx-paynote"));
  return block;
}

export interface CorrectionsOptions {
  draft: CalculationDraft;
  result: CalculationResult;
  /** e.g. "Additional manual scoring units" / "Additional manual fan". */
  adjustmentLabel: string;
  /** Riichi only: the corrected-fu field rides along. */
  showFu: boolean;
  reasonLabel: string;
  onApply: (draft: CalculationDraft) => void;
  safe: (fn: () => void) => void;
}

/**
 * The correction fields, as shipped: every detected fact can be
 * restated, plus a manual adjustment, always with a reason. Lives
 * inside the check-payments screen behind "Correct the breakdown".
 */
export function cxCorrections(opts: CorrectionsOptions): HTMLElement {
  const { draft, result } = opts;
  const box = el("div", "", "cx-corrections");
  const numInput = (value: string | number): HTMLInputElement => {
    const i = el("input");
    i.type = "number";
    i.value = String(value);
    i.min = "0";
    i.max = "1000000";
    i.step = "1";
    return i;
  };
  const field = (label: string, control: HTMLElement): HTMLLabelElement => {
    const l = el("label", label, "tool-field");
    control.setAttribute("aria-label", label);
    l.append(control);
    return l;
  };
  const factFields = result.detected.map((f) => {
    const control = numInput(
      result.corrected.find((c) => c.id === f.id)?.units ?? f.units,
    );
    box.append(field(`${f.label} · Original ${f.units}`, control));
    return { id: f.id, units: f.units, control };
  });
  const adjustment = numInput(
    draft.corrections.find((c) => c.id === "table-adjustment")?.units ?? 0,
  );
  box.append(field(opts.adjustmentLabel, adjustment));
  let correctedFu: HTMLInputElement | undefined;
  if (opts.showFu) {
    correctedFu = numInput(result.fu);
    box.append(field("Corrected fu", correctedFu));
  }
  const reason = el("input");
  reason.type = "text";
  reason.value = draft.corrections[0]?.reason ?? "";
  reason.maxLength = 240;
  box.append(field(opts.reasonLabel, reason));
  box.append(
    btn("Apply corrections and recalculate", () =>
      opts.safe(() => {
        const corrections = factFields
          .filter((f) => Number(f.control.value) !== f.units)
          .map((f) => ({
            id: f.id,
            units: Number(f.control.value),
            reason: reason.value,
          }));
        if (Number(adjustment.value))
          corrections.push({
            id: "table-adjustment",
            units: Number(adjustment.value),
            reason: reason.value,
          });
        if (
          opts.showFu &&
          correctedFu &&
          Number(correctedFu.value) !== result.fu &&
          !reason.value.trim()
        )
          throw new Error("Enter a correction reason");
        opts.onApply({
          input: draft.input,
          corrections,
          ...(opts.showFu &&
          correctedFu &&
          (draft.fuCorrection !== undefined ||
            Number(correctedFu.value) !== result.fu)
            ? {
                fuCorrection: Number(correctedFu.value),
                correctionNote: reason.value,
              }
            : {}),
        });
      }),
    "cx-apply"),
  );
  return box;
}

export interface PreviewOptions {
  headMain: string;
  headSub: string;
  /** Score-change rows in display order. */
  rows: readonly {
    name: string;
    suffix: string;
    delta: number;
  }[];
  paymentLines: readonly string[];
  paymentNotes?: readonly string[];
  ineligibleNote?: string;
  corrections?: HTMLElement;
  /** Omit for the standalone calculator (nothing to record). */
  confirmLabel?: string;
  confirmDisabled?: boolean;
  onConfirm?: () => void;
  onEdit?: () => void;
  extraAction?: { label: string; action: () => void };
}

/**
 * The check-payments screen (04c): every player's score change
 * first, then the payment lines, then Edit / Confirm. Confirm is
 * the recording gate; typing in the correction fields without
 * applying disables it, as the shipped result screens did.
 */
export function cxPreview(host: HTMLElement, opts: PreviewOptions): void {
  const out = el("section", "", "calculator-output cx-preview");
  const head = el("div", "", "cx-head");
  head.append(
    el("p", opts.headMain, "cx-instruct"),
    el("p", opts.headSub, "cx-note"),
  );
  out.append(head);
  const deltas = el("section", "", "cx-panel cx-deltas");
  deltas.append(cxLabel("Score changes"));
  for (const row of opts.rows) {
    const line = el("div", "", "cx-delta");
    const who = el("span", row.name, "who");
    if (row.suffix) who.append(el("span", ` ${row.suffix}`));
    const amt = el(
      "span",
      row.delta > 0
        ? `+${row.delta.toLocaleString("en-US")}`
        : row.delta.toLocaleString("en-US"),
      row.delta === 0 ? "amt zero" : "amt",
    );
    line.append(who, amt);
    deltas.append(line);
  }
  out.append(deltas);
  out.append(
    cxPaymentBlock({
      lines: opts.paymentLines,
      ...(opts.paymentNotes ? { notes: opts.paymentNotes } : {}),
    }),
  );
  if (opts.ineligibleNote)
    out.append(el("p", opts.ineligibleNote, "cx-alert"));
  let confirm: HTMLButtonElement | undefined;
  if (opts.corrections) {
    const wrap = el("div", "", "cx-corrections-wrap");
    const body = el("div", "", "cx-corrections-body");
    body.hidden = true;
    body.append(opts.corrections);
    const dirtyNote = el("p", "", "cx-note");
    body.addEventListener("input", () => {
      if (confirm) confirm.disabled = true;
      dirtyNote.textContent =
        "Apply corrections and recalculate before confirming.";
    });
    const toggle = btn("Correct the breakdown", () => {
      body.hidden = !body.hidden;
      toggle.setAttribute("aria-expanded", String(!body.hidden));
    }, "cx-quiet");
    toggle.setAttribute("aria-expanded", "false");
    wrap.append(toggle, body, dirtyNote);
    out.append(wrap);
  }
  if (opts.extraAction)
    out.append(
      btn(opts.extraAction.label, opts.extraAction.action, "cx-quiet"),
    );
  if (opts.confirmLabel && opts.onConfirm) {
    const row = el("div", "", "cx-btnrow");
    if (opts.onEdit) row.append(btn("Edit", opts.onEdit, "cx-quiet"));
    confirm = btn(opts.confirmLabel, opts.onConfirm, "primary");
    confirm.disabled = Boolean(
      opts.confirmDisabled || opts.ineligibleNote,
    );
    row.append(confirm);
    out.append(row);
  } else if (opts.onEdit) {
    out.append(btn("Edit", opts.onEdit, "cx-quiet"));
  }
  host.append(out);
}

/** Deltas from a payment list, folded per player. */
export function foldPayments(
  count: number,
  payments: readonly { from: number; to: number; amount: number }[],
): number[] {
  const deltas = new Array<number>(count).fill(0);
  for (const p of payments) {
    deltas[p.from]! -= p.amount;
    deltas[p.to]! += p.amount;
  }
  return deltas;
}

/** Recompute a draft quietly; undefined when the entry is invalid. */
export function tryCalculate(
  draft: CalculationDraft,
): CalculationResult | undefined {
  try {
    return calculateDraft(draft);
  } catch {
    return undefined;
  }
}
