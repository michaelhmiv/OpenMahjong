# Translating Open Mahjong — correcting a translation

Open Mahjong is translated by its community. The English strings are the
source; every other language is a translation of them. If you see a wrong
string while using the app in your language, you can correct it here.
No account beyond a GitHub account is needed, and you do not need to
install anything: the whole correction can be done in the browser.

Design record: `~/workspace/mahjong-prep/community-review-design.md`
(in the maintainer's workspace; this guide is the contributor-facing
version of it). The brief is `brief-i18n-v1.md`.

## Which file to edit

One file per language, in the repository `michaelhmiv/OpenMahjong`:

| Language | File |
| --- | --- |
| Simplified Chinese | [`packages/web/src/i18n/locales/zh-Hans.json`](https://github.com/michaelhmiv/OpenMahjong/blob/main/packages/web/src/i18n/locales/zh-Hans.json) |
| Traditional Chinese | [`packages/web/src/i18n/locales/zh-Hant.json`](https://github.com/michaelhmiv/OpenMahjong/blob/main/packages/web/src/i18n/locales/zh-Hant.json) |
| Japanese | [`packages/web/src/i18n/locales/ja.json`](https://github.com/michaelhmiv/OpenMahjong/blob/main/packages/web/src/i18n/locales/ja.json) |
| Korean | [`packages/web/src/i18n/locales/ko.json`](https://github.com/michaelhmiv/OpenMahjong/blob/main/packages/web/src/i18n/locales/ko.json) |

The English source is
[`packages/web/src/i18n/locales/en.json`](https://github.com/michaelhmiv/OpenMahjong/blob/main/packages/web/src/i18n/locales/en.json).
Do not edit it — it is generated from the app's code.

The locked mahjong terms are in
[`packages/web/src/i18n/glossary.json`](https://github.com/michaelhmiv/OpenMahjong/blob/main/packages/web/src/i18n/glossary.json)
(see "Locked terms" below).

## How to correct a string (no git needed)

1. Open your language's file above on GitHub.
2. Find the string: use the browser's find (Ctrl+F / Cmd+F) and search
   for the English text or the mistranslated text. Each entry looks like
   this (key ids are stable names such as `learn.riichi.tu1.step01.text`):
   ```json
   "learn.riichi.tu1.step01.text": {
     "value": "The corrected translation goes here.",
     "hash": "0123456789abcdef…",
     "status": "draft",
     "source": { "file": "curriculum.ts", "line": 123 },
     "placeholders": []
   }
   ```
3. Click the pencil icon ("Edit this file") on GitHub.
4. Change **only** the `"value"` — the translated text. Do not change
   `"hash"` (it records which English string this was translated from),
   do not change `"status"` (see "What happens after", below), and do
   not rename the key.
5. Keep `{0}`, `{1}`, … exactly as they are (they may be reordered, but
   never dropped or invented), and keep tile notation such as `5m`, `2p`,
   `9s`, `1z` exactly as it is.
6. At the bottom of the editor, choose "Create a new branch for this
   commit and start a pull request", write a short description (which
   string, what was wrong, what you changed), and click "Propose changes".
   That opens a pull request — the correction is reviewed, not applied
   silently.

If you work with git locally instead, the same rules apply: edit the one
file, commit, open a pull request.

## Locked terms

Mahjong terms have one fixed form per language, in `glossary.json`: Ron,
Riichi, Tsumo, Dora, Kan, Pon, Pung, Chi, Han, Fu, Yakuman, Honba, Furiten,
the seven MCR pattern names, the four winds, the three dragons, and Bot.
Pon and Pung are separate locked terms: Pon is the call that claims a
discard, Pung is the triplet itself — most languages use different words
for the two, so a correction must use the form for the meaning in the
string. The MCR pattern names are proper names with their own locked
entries, not spellings built from the word Pung. A correction must use the locked
form for its language. A correction that renders a locked term differently
is rejected by the automated checks — it is a defect, not a style
preference.

The CPU opponent is always called **Bot**, never "AI", in every language.

If you believe a **locked form itself** is wrong, do not change it inside
a correction. Open a separate pull request that changes `glossary.json`,
with a reason (what the form should be and why — ideally with a source,
such as how the term is written in that language's mahjong community)
and update every translated string that used the old form in the same
pull request.

## What happens after your pull request

A correction moves through three states, one per string per language.
The state is the `"status"` field in the file; only the state changes
listed here are allowed, and the automated checks enforce them.

1. **`draft`** — your correction, as submitted. The wording is new and
   unreviewed.
2. **`reviewed`** — a second community member, who did not write the
   wording, has read the string in the app in that language and confirms
   it. A reviewer marks this in a separate pull request that changes only
   `"status"` from `"draft"` to `"reviewed"`. You cannot mark your own
   correction reviewed — the checks reject it.
3. **`approved`** — a native speaker of that language has read the string
   in context and confirmed it is final. (For lessons, this includes the
   lesson's transfer checks done by a native reader.) This is the
   long-term bar; the release gate runs on `reviewed` + `approved`
   together, so community review is what ships a correction.

Other states you may see: `stale` (the English source changed since the
translation was written — the string falls back to English until it is
re-translated and re-reviewed) and `missing` (no translation for that
string yet — the app shows English).

## If the English source is wrong

Fix the English string in the app's code or lesson data first — the
English file is generated, so editing it directly does not work. Run
`node scripts/extract-i18n.mjs` from the repository root and commit the
regenerated `en.json` with your change. Every translation of that string
goes stale automatically until it is re-translated and re-reviewed.

## If a correction turns out to be wrong

Corrections are ordinary pull requests, so a wrong one is reverted like
any other change: the maintainer reverts the merged pull request and the
string returns to its previous wording and state. A reverted string that
had been approved stops showing in the app until it is reviewed again.
For repeated bad-faith corrections, the maintainer blocks the account
from the repository.

## What the automated checks enforce on every pull request

- No key is missing in any shipped language; no `t()` call-site key is
  missing from the English file.
- Placeholders and tile references in a translation match the English
  source.
- Locked glossary terms are rendered with the locked forms.
- A translation whose stored hash no longer matches the English source
  is stale.
- The English key file is exactly what the extractor produces.
- **No self-approval:** a pull request that changes a string's wording
  cannot mark it `reviewed` or `approved` in the same pull request, and
  a pull request that flips a string to `reviewed`/`approved` cannot be
  authored by the person who wrote the current wording.

## Copy rules (apply in every language)

- Informational only. No slogans, no "no ads" / "no gacha" claims.
- No content about the NMJL (North American Mahjong League) in the
  American training track, in any language.
- A translation that breaks the layout is a translation bug: reword the
  string, do not shrink the type. Minimum type is 11px; tap targets are
  at least 44px.
