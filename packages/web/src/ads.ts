/**
 * AdSense banner slot (Home only).
 *
 * One config constant gates the slot: it renders only when BOTH the
 * publisher client id and the ad unit (slot) id are present. The
 * shipped config is empty, so production renders exactly the
 * pre-ads Home — no element, no placeholder, no reserved space.
 *
 * When configured, the slot is the approved adsense-slot-v1 block:
 * an "AD" disclosure label (11px, dim sage) above a centred
 * 320x50 creative, 86px total (14 label + 6 gap + 50 creative +
 * 16 bottom margin), placed as the last element of the Home flow.
 * The creative is the standard <ins class="adsbygoogle"> element;
 * the loader is the AdSense snippet in index.html <head>, which
 * defines window.adsbygoogle.
 */

export interface AdsenseConfig {
  /** Publisher client id, e.g. "ca-pub-2708638041809482". */
  readonly clientId: string;
  /** Ad unit (slot) id issued for the Home banner unit. */
  readonly slotId: string;
}

/** The single gate for the Home banner. Empty = dark (no slot).
 *  Go-live (only after AdSense site approval, as a deliberate
 *  one-line change): clientId "ca-pub-2708638041809482",
 *  slotId "3347682557" (the "OpenMahjong Home Banner" unit). */
export const ADSENSE_CONFIG: AdsenseConfig = {
  clientId: "",
  slotId: "",
};

export function adsConfigured(config: AdsenseConfig = ADSENSE_CONFIG): boolean {
  return config.clientId.trim() !== "" && config.slotId.trim() !== "";
}

type AdsbygoogleWindow = Window & { adsbygoogle?: Record<string, unknown>[] };

/**
 * Build the banner slot element, or null when unconfigured.
 * `doc`/`win` are injectable for tests; they default to the globals.
 */
export function adSlotEl(
  config: AdsenseConfig = ADSENSE_CONFIG,
  doc: Document = document,
  win: Window = window,
): HTMLElement | null {
  if (!adsConfigured(config)) return null;

  const slot = doc.createElement("div");
  slot.className = "adslot";
  slot.setAttribute("role", "complementary");
  slot.setAttribute("aria-label", "Advertisement");

  const label = doc.createElement("div");
  label.className = "adlab";
  label.textContent = "AD";
  slot.append(label);

  const ins = doc.createElement("ins");
  ins.className = "adsbygoogle adcreative";
  // Fixed 320x50 per the approved rendering. The console unit is
  // responsive (Google's generated code uses data-ad-format="auto");
  // that attribute is deliberately NOT set here and the dimensions
  // are pinned inline as well as in CSS, so a responsive fill can
  // never grow the slot beyond the approved 86px block.
  ins.style.display = "block";
  ins.style.width = "320px";
  ins.style.height = "50px";
  ins.setAttribute("data-ad-client", config.clientId);
  ins.setAttribute("data-ad-slot", config.slotId);
  slot.append(ins);

  const w = win as AdsbygoogleWindow;
  w.adsbygoogle = w.adsbygoogle || [];
  w.adsbygoogle.push({});
  return slot;
}
