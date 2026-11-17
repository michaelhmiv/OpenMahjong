import {
  evaluateVariantDiscards,
  asVariantView,
  type VariantAdvice,
} from "@openmahjong/ai";
import { tileTypeName, type PlayerView } from "@openmahjong/engine";

export function adviseVariantDiscard(view: PlayerView): {
  advice: VariantAdvice;
  explanation: string;
  limitations: string;
} {
  const v = asVariantView(view),
    advice = evaluateVariantDiscards(view),
    r = advice.recommendation;
  return {
    advice,
    explanation: `The coach prefers ${tileTypeName(r.type)}. It leaves ${r.distance === 0 ? "a hand one tile from completion" : `${r.distance} tile exchanges before a one-tile wait`} with ${r.unseenImproving} unseen improving copies. ${v.variant === "hong-kong" ? "A complete shape still needs at least three fan." : v.variant === "mcr" ? "A complete shape needs eight fan before flowers; eligible self-draw waits use the shared scorer." : "Five sets and a pair may win with zero tai; the shared scorer and your current passed-win restrictions determine eligibility."}`,
    limitations:
      "Heuristic advice uses only your hand, exposed sets, discards and visible flowers. Unseen copies may be in opponents’ hands or the reserved wall. Shape and pattern potential are not win probabilities or calibrated grades.",
  };
}
