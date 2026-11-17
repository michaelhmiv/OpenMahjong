/** Authentic decorative winning hands for each released Chinese profile.
 * Physical IDs come from that adapter's non-red inventory. */
import { variantAdapter, type VariantId, type Tile } from "@openmahjong/engine";
const GROUPS: Record<VariantId, readonly (readonly number[])[]> = {
  "hong-kong": [
    [1, 2, 3],
    [41, 42, 43],
    [81, 82, 83],
    [109, 110, 111],
    [125, 126],
  ],
  mcr: [
    [1, 5, 9],
    [13, 17, 21],
    [25, 29, 33],
    [37, 41, 45],
    [109, 110],
  ],
  taiwanese: [
    [5, 9, 13],
    [45, 49, 52],
    [93, 97, 101],
    [1, 6, 10],
    [105, 106],
    [133, 134, 135],
  ],
};
export function variantHomeHand(variant: VariantId): Tile[] {
  const tiles = variantAdapter(variant).inventory();
  return GROUPS[variant].flat().map((id) => tiles[id]!);
}
