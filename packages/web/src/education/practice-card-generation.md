# Generation Record — Open Mahjong Practice Card

**Practice Card — an original training card, not the official National Mah Jongg League card**

This record documents how the card in `practice-card.json` (rendered for humans in
`practice-card.md`) was made, so its originality is auditable, and quotes the
feasibility evidence produced by `check-card.mjs`.

## Originality statement

- Every hand on this card was invented from scratch for Open Mahjong, working only
  from the structural pattern grammar of American mahjong (the families listed
  below) and the tile counts of the standard 152-tile set.
- **No official National Mah Jongg League card — of any year — was consulted,
  opened, read, transcribed, paraphrased, or reconstructed from memory at any
  point in making this card.** No published card of any kind was used as a source.
- There are **no year hands** on this card. Year-specific hands are the official
  card's signature and are excluded by design.
- All section names, section descriptions, hand descriptions, and the value ladder
  are original wording written for this card. Section names are plain descriptions
  of a pattern family (e.g. "Even Numbers"), and two families (In Bloom, Bookends)
  were invented for this card and are flagged as such in their section text.
- Any resemblance between a hand here and a hand on any published card is the
  expected result of independent invention inside a small, heavily constrained
  pattern grammar (a hand is 14 tiles drawn from a fixed set, grouped as singles,
  pairs, pungs, kongs and quints). The generation method below — grammar first,
  hands second — is the audit trail for that.

## Generation method

Hands were composed **grammar-first**: for each section, a pattern family was
fixed in words, then hands were written as structured tile groups (kind, rank,
relative suit) against that family, with values assigned from the ladder below.
Suits in every pattern are relative — "a suit", "a second suit", "a third suit" —
so each hand describes a shape a player can build with whichever physical suits
they hold.

### Section grammar

1. **Even Numbers** (5 hands) — only ranks 2/4/6/8. Group shapes rotate through
   pung/kong grids, mixed pair-and-pung layouts, and one concealed all-even hand;
   one hand adds a flower pair.
2. **Odd Numbers** (5 hands) — only ranks 1/3/5/7/9. Same shape rotation as Even
   Numbers with the extra rank in play; one concealed pairs hand with a hidden
   pung and a single flower.
3. **Consecutive Runs** (6 hands) — consecutive rank sequences (e.g. 1-2-3-4,
   3-4-5-6-7) in one suit or split across two, groups growing pair → pung → kong
   along the run; one concealed pairs-along-the-run hand.
4. **Like Numbers** (4 hands) — one or two ranks repeated across two or three
   suits (kongs of one rank in every suit; two ranks sharing two suits; a
   concealed all-pairs version). Flowers fill the slots a fourth suit would
   have taken, because a rank exists in only three suits.
5. **Winds & Dragons** (5 hands) — honor-led shapes: pungs of all four winds,
   kongs of two winds with dragon support, a pung of each dragon, dragons mixed
   with number pungs, and one concealed all-honor hand.
6. **Quints** (4 hands) — every hand contains at least one five-of-a-kind. Since
   only four natural copies of any tile exist, each quint's fifth tile must be a
   joker standing inside the group — the section doubles as joker teaching.
   Includes a two-quint hand (minimum two jokers) and a dragon quint.
7. **Singles & Pairs** (4 hands) — no group larger than a pair, concealed only.
   Because a joker may never stand in a single or a pair, these hands are
   provably joker-proof (the checker enforces the structure). Includes a hand
   of four single winds and the card's hardest hand: twelve singles and one pair.
8. **In Bloom** (3 hands) — *invented for this card.* Flower-led shapes: a flower
   kong with a low run, five flowers (pair + pung) mid-hand, and all eight
   flowers as two kongs.
9. **Bookends** (4 hands) — *invented for this card.* Only ranks 1 and 9 (the
   ends of every suit): pungs split across suits, crossed kongs, a flower pung
   version, and a concealed seven-pairs version.

### Value ladder (our own)

Values are points on a ladder invented for this card, rising with difficulty:

| Range | Meaning |
|---|---|
| 25–40 | Exposed hands of straightforward pungs and kongs |
| 40–55 | Exposed hands with quints, heavy flowers, or tighter structure |
| 50–60 | Concealed hands that still use groups |
| 65–85 | Concealed singles-and-pairs hands, where no joker can ever help |

### Notation

Patterns use plain card notation: a repeated digit is a group of that rank
(`444` = a pung of 4s), `F` is a flower, `N/E/W/S` are winds, `D` is a dragon of
one kind, `X` = exposures allowed, `C` = concealed only. Jokers are never printed
in a pattern; the rules for where a joker may stand are stated on the card itself.

## Feasibility evidence

Feasibility law (from the brief): every hand must be physically buildable from
the 152-tile set — at most 4 copies of any suit tile, wind, or dragon; at most 8
flowers; at most 8 jokers; and a joker may stand in only inside a group of three
or more — **never as a single and never in a pair**. `check-card.mjs` proves this
for every hand from the structured group data (it also proves each hand totals
exactly 14 tiles and that the printed notation matches the group data exactly).
Run it with:

```
node check-card.mjs
```

Output of the run against the card as delivered (exit code 0):

```
PASS EV-1: 14 tiles, notation consistent, copies within the set, value 25, exposed ok
PASS EV-2: 14 tiles, notation consistent, copies within the set, value 30, exposed ok
PASS EV-3: 14 tiles, notation consistent, copies within the set, value 35, exposed ok
PASS EV-4: 14 tiles, notation consistent, copies within the set, value 50, concealed
PASS EV-5: 14 tiles, notation consistent, copies within the set, value 40, exposed ok
PASS OD-1: 14 tiles, notation consistent, copies within the set, value 25, exposed ok
PASS OD-2: 14 tiles, notation consistent, copies within the set, value 30, exposed ok
PASS OD-3: 14 tiles, notation consistent, copies within the set, value 35, exposed ok
PASS OD-4: 14 tiles, notation consistent, copies within the set, value 50, concealed
PASS OD-5: 14 tiles, notation consistent, copies within the set, value 40, exposed ok
PASS RN-1: 14 tiles, notation consistent, copies within the set, value 25, exposed ok
PASS RN-2: 14 tiles, notation consistent, copies within the set, value 25, exposed ok
PASS RN-3: 14 tiles, notation consistent, copies within the set, value 30, exposed ok
PASS RN-4: 14 tiles, notation consistent, copies within the set, value 35, exposed ok
PASS RN-5: 14 tiles, notation consistent, copies within the set, value 40, exposed ok
PASS RN-6: 14 tiles, notation consistent, copies within the set, value 55, concealed
PASS LK-1: 14 tiles, notation consistent, copies within the set, value 40, exposed ok
PASS LK-2: 14 tiles, notation consistent, copies within the set, value 35, exposed ok
PASS LK-3: 14 tiles, notation consistent, copies within the set, value 50, exposed ok
PASS LK-4: 14 tiles, notation consistent, copies within the set, value 60, concealed
PASS WD-1: 14 tiles, notation consistent, copies within the set, value 30, exposed ok
PASS WD-2: 14 tiles, notation consistent, copies within the set, value 35, exposed ok
PASS WD-3: 14 tiles, notation consistent, copies within the set, value 40, exposed ok
PASS WD-4: 14 tiles, notation consistent, copies within the set, value 45, exposed ok
PASS WD-5: 14 tiles, notation consistent, copies within the set, value 60, concealed
PASS QT-1: 14 tiles, notation consistent, copies within the set, requires 1 joker(s) [suit0:5 x1], value 45, exposed ok
PASS QT-2: 14 tiles, notation consistent, copies within the set, requires 1 joker(s) [suit0:7 x1], value 50, exposed ok
PASS QT-3: 14 tiles, notation consistent, copies within the set, requires 2 joker(s) [suit0:1 x1, suit1:9 x1], value 55, exposed ok
PASS QT-4: 14 tiles, notation consistent, copies within the set, requires 1 joker(s) [dragon:green x1], value 50, exposed ok
PASS SP-1: 14 tiles, notation consistent, copies within the set, value 65, concealed
PASS SP-2: 14 tiles, notation consistent, copies within the set, value 70, concealed
PASS SP-3: 14 tiles, notation consistent, copies within the set, value 75, concealed
PASS SP-4: 14 tiles, notation consistent, copies within the set, value 85, concealed
PASS IB-1: 14 tiles, notation consistent, copies within the set, value 30, exposed ok
PASS IB-2: 14 tiles, notation consistent, copies within the set, value 40, exposed ok
PASS IB-3: 14 tiles, notation consistent, copies within the set, value 55, exposed ok
PASS BK-1: 14 tiles, notation consistent, copies within the set, value 30, exposed ok
PASS BK-2: 14 tiles, notation consistent, copies within the set, value 40, exposed ok
PASS BK-3: 14 tiles, notation consistent, copies within the set, value 45, exposed ok
PASS BK-4: 14 tiles, notation consistent, copies within the set, value 60, concealed

Sections: 9
  Even Numbers: 5 hands
  Odd Numbers: 5 hands
  Consecutive Runs: 6 hands
  Like Numbers: 4 hands
  Winds & Dragons: 5 hands
  Quints: 4 hands
  Singles & Pairs: 4 hands
  In Bloom: 3 hands
  Bookends: 4 hands
Hands checked: 40
Failures: 0
RESULT: ALL HANDS FEASIBLE
```

### Negative tests (the checker must also fail bad cards)

The checker was deliberately fed three corrupted copies of the card (in a
scratch directory, since removed). All three were rejected with exit code 1:

1. A Singles & Pairs pair enlarged to a pung — rejected for the 15-tile total,
   the notation drift, and the section's no-group-larger-than-a-pair law.
2. A Bookends hand given an extra pair — rejected for the 16-tile total and
   notation drift.
3. A Bookends hand rewritten so six copies of one tile were demanded entirely
   inside pairs — rejected with: *"needs 6 copies but only 4 exist, and only 0
   of them sit in groups of 3+ where a joker may stand — the overflow lands in
   a single or pair, which a joker can never fill."* This is the joker-legality
   law firing exactly as specified.

## Files in this phase

- `practice-card.json` — the card as structured data (source of truth).
- `practice-card.md` — the same card rendered for humans, generated from the JSON.
- `check-card.mjs` — the feasibility checker quoted above.
- `generation-record.md` — this document.

**Practice Card — an original training card, not the official National Mah Jongg League card**
