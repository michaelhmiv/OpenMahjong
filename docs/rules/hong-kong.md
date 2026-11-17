# OpenMahjong Hong Kong Old Style v1

Implementation brief, 2026-11-17. Identity: `openmahjong-hkos@1`, simulation 3,
policy 1, replay schema 3. This is a named Clear Chapter table, not a claim that
all Hong Kong house rules are identical. It is unavailable in public Play until
the complete parity checklist passes.

Sources verified on 2026-11-17: Mahjong Wiki's
[overview](https://mahjong.wikidot.com/rules:hong-kong-old-style-overview),
[gameplay](https://mahjong.wikidot.com/rules:hong-kong-old-style-gameplay) and
[Clear Chapter scoring](https://mahjong.wikidot.com/rules:hong-kong-old-style-scoring).
These document substantial variations, so the following choices are explicit.
Descriptions and teaching examples in OpenMahjong are original.

- Four players, 144 tiles: ordinary suits/honors plus eight unique flowers/seasons;
  no red fives. Thirteen standing tiles, four sets and a pair to win; declared
  quads add physical tiles. Thirteen Orphans is supported. Seven Pairs and other
  optional New Chapter imports are outside this profile.
- Flowers are exposed and replaced from the wall tail. A 16-tile reserve is
  replenished as replacements consume the tail; neither it nor retired tiles is
  exposed to public decision inputs. A quad requires replacement capacity.
- Win claims have priority, then triplet/open quad, then a sequence for the next
  seat only. Simultaneous win claims use nearest-in-turn priority. Added quads
  can be robbed. There is no riichi, dora, furiten or Riichi abortive-draw rule.
- Three fan minimum, including flower bonuses; cap ten fan. The half-spicy
  conversion for 0–10 is `1,2,4,8,16,24,32,48,64,96,128`. Clear Chapter payments:
  discard winner receives twice the base from the discarder and once from each
  other seat; self-draw receives twice the base from all three seats. No dealer
  payment multiplier. In-person settings may select full-spicy conversion or
  discarder-pays-all, without changing CPU rules.
- Ordinary fan: all sequences 1; each relevant wind triplet 1 (seat and round
  stack); each dragon triplet 1; all triplets 3; one suit plus honors 3; one suit
  without honors 7; little three dragons 5 and big three dragons 8 replace the
  individual dragon awards. Little four winds/all honors 10; big four winds and
  Nine Gates 15; Thirteen Orphans 13; four quads 18, all subject to the cap.
- Self-draw 1; quad-replacement win 1; robbing an added quad 1; last live draw or
  final discard 1. Initial uninterrupted dealer/nondealer self-draws are ten-fan
  hands and replace ordinary awards. The replacement and last-live conditions
  are distinct, preventing a false last-tile award on a replacement.
- No flowers earns 1; each own-seat flower/season 1; each complete quartet adds
  2 (the own-seat tile still earns its 1). All eight replaces those flower awards
  with 8. Eight flowers alone does not end this Clear Chapter hand; normal
  winning structure remains required. Seven-flower robbery is an excluded
  optional local rule.
- Four wind rounds. East repeats after its win; a non-East win or draw advances
  dealership. Starting points 1,000 each, raw net-point settlement, no bust-out,
  no uma/oka. Short East/East–South sessions are explicit length choices;
  full four-round games are available. Seat order is stable across rounds for
  deterministic local CPU play.

The adapter owns inventory, hand eligibility, legal contexts, public projection,
scoring, payments, progression and serialization identity. It shares standard
set decomposition, deterministic shuffling, event transport and UI primitives.
It does not execute the Riichi controller with flags.
