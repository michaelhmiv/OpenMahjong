import { utf8ByteLength } from "../encoding.js";
import type { CallAction, TurnAction } from "../game.js";
import { variantAdapter } from "./game.js";
import type { VariantId, VariantLength } from "./types.js";

export interface VariantReplay {
  readonly v: 3;
  readonly engineVersion: 3;
  readonly aiVersion: 1;
  readonly variant: VariantId;
  readonly ruleset: { readonly id: string; readonly version: 1 };
  readonly seed: string;
  readonly length: VariantLength;
  readonly humanSeat: number;
  readonly id?: string;
  readonly decisions: readonly (TurnAction | CallAction)[];
}
function object(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function uint(v: unknown, max: number): v is number {
  return Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= max;
}
export function validateVariantReplay(input: unknown): VariantReplay {
  if (
    !object(input) ||
    input["v"] !== 3 ||
    input["engineVersion"] !== 3 ||
    input["aiVersion"] !== 1 ||
    !object(input["ruleset"])
  )
    throw new Error("Unsupported variant replay version");
  const profile = input["ruleset"];
  if (typeof profile["id"] !== "string" || profile["version"] !== 1)
    throw new Error("Unsupported variant profile identity");
  const adapter = variantAdapter(
    String(profile["id"]),
    Number(profile["version"]),
  );
  if (profile["id"] !== adapter.profileId)
    throw new Error("Replay requires the canonical profile identity");
  if (input["variant"] !== adapter.variant)
    throw new Error("Variant does not match the replay profile");
  if (
    typeof input["seed"] !== "string" ||
    !input["seed"].length ||
    input["seed"].length > 128 ||
    typeof input["length"] !== "string" ||
    !["east", "south", "full"].includes(input["length"]) ||
    !uint(input["humanSeat"], 3)
  )
    throw new Error("Invalid variant replay context");
  const raw = input["decisions"];
  if (!Array.isArray(raw) || raw.length > 50000)
    throw new Error("Too many variant decisions");
  if (
    input["id"] !== undefined &&
    (typeof input["id"] !== "string" ||
      !input["id"].length ||
      input["id"].length > 128)
  )
    throw new Error("Invalid replay id");
  const decisions = raw.map(validateVariantDecision);
  const out: VariantReplay = {
    v: 3,
    engineVersion: 3,
    aiVersion: 1,
    variant: adapter.variant,
    ruleset: { id: adapter.profileId, version: 1 },
    seed: input["seed"],
    length: input["length"] as VariantLength,
    humanSeat: input["humanSeat"],
    ...(input["id"] ? { id: input["id"] as string } : {}),
    decisions,
  };
  if (utf8ByteLength(JSON.stringify(out)) > 2 * 1024 * 1024 - 4096)
    throw new Error("Variant replay exceeds size limit");
  return out;
}
export function validateVariantDecision(
  input: unknown,
): TurnAction | CallAction {
  if (!object(input)) throw new Error("Invalid variant action");
  switch (input["type"]) {
    case "discard":
      if (!uint(input["tileId"], 135) || input["riichi"] !== undefined)
        throw new Error("Invalid variant discard");
      return { type: "discard", tileId: input["tileId"] };
    case "ankan":
    case "shouminkan":
      if (!uint(input["tileType"], 33))
        throw new Error("Invalid quad tile type");
      return { type: input["type"], tileType: input["tileType"] };
    case "chi": {
      const ids = input["tileIds"];
      if (
        !Array.isArray(ids) ||
        ids.length !== 2 ||
        !uint(ids[0], 135) ||
        !uint(ids[1], 135) ||
        ids[0] === ids[1]
      )
        throw new Error("Invalid sequence tiles");
      return { type: "chi", tileIds: [ids[0], ids[1]] };
    }
    case "tsumo":
    case "ron":
    case "pass":
    case "pon":
    case "daiminkan":
      return { type: input["type"] };
    default:
      throw new Error("Unsupported variant action");
  }
}
