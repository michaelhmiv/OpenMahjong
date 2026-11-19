#!/usr/bin/env node
/**
 * extract-i18n.mjs — Phase 1 i18n inventory (brief-i18n-v1, Phase 1).
 *
 * Extracts every user-facing English string in packages/web/src (plus the
 * static content pages) into packages/web/src/i18n/locales/en.json, with
 * a stable namespaced key, the English source string, its SHA-256 source
 * hash (translation memory is keyed by this hash: an unchanged string is
 * never re-translated), and the source location it came from.
 *
 * Extraction only: this script never rewrites application code and never
 * rewords a string. If a string's meaning is ambiguous it is still
 * extracted verbatim; ambiguity is reported in the PR, not fixed here.
 *
 * Deterministic: re-running produces byte-identical output unless a
 * source string changed. CI runs `node scripts/extract-i18n.mjs --check`
 * and fails on drift, so a hardcoded string added without regenerating
 * en.json cannot merge silently.
 *
 * Strings that only exist behind a translate call use `tx("key",
 * "English source", ...)` or `tForLocale("key", locale, "English
 * source", ...)` (packages/web/src/i18n/index.ts): the fallback
 * argument is the key's English source, recorded here under the
 * explicit key. Plain `t("key")` calls carry no source string, so the
 * extractor cannot invent one for them.
 *
 * Usage:
 *   node scripts/extract-i18n.mjs            # regenerate en.json
 *   node scripts/extract-i18n.mjs --check    # exit 1 if en.json is stale
 *   node scripts/extract-i18n.mjs --report   # print key counts, no write
 *
 * Cost: $0. No network, no translation API, no API keys.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = resolve(ROOT, "packages/web");
const OUT = resolve(WEB, "src/i18n/locales/en.json");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Property names whose string value (or string array elements) is UI text. */
const TEXT_PROPS = new Set([
  "title", "text", "prompt", "explanation", "hint", "label",
  "completionCriteria", "wrongNote", "correctNote",
  "choiceLine", "headline", "blurb", "description", "d", "placeholder",
  "note", "ineligibleNote", "aria-label", "sample", "big", "lead",
]);

/** Thrown Error messages are user-facing ONLY in these files, where the
 *  UI demonstrably displays e.message (calculator safe() -> status text,
 *  in-person-ui safe() -> status text). Elsewhere (replay/runner/review/
 *  tutorial/education validators) they are internal consistency
 *  assertions and are NOT inventoried. */
const THROW_FILES = new Set([
  "variant-calculator-ui.ts", "riichi-calculator-ui.ts", "compact-calc.ts",
  "in-person-store.ts", "in-person-ui.ts",
]);

/** Property names whose string ARRAY elements are UI text. */
const TEXT_ARRAY_PROPS = new Set(["objectives", "covered", "choices", "facts"]);

/** Local UI helpers and methods: labelled string arg indices.
 *  h(tag, attrs, ...children) is handled separately (children are args ≥ 2).
 *  el(tag, text, className) — text is arg 1. row(label, note, control) —
 *  both the label and the note are display text. tileControl(el, key,
 *  label, action) — label is arg 2. frameShell(title, sub) — both args.
 *  body(line) / sec(label) / showHint(text) / button(text, action) /
 *  createTextNode(text) — arg 0. */
const LABEL_HELPERS = new Map([
  ["btn", [0]], ["part", [0]], ["row", [0, 1]], ["sec", [0]], ["mk", [0]],
  ["hbtn", [0]], ["tileControl", [2]], ["body", [0]], ["el", [1]],
  ["button", [0]], ["createTextNode", [0]], ["showHint", [0]],
  ["frameShell", [0, 1]], ["field", [0]], ["check", [0]], ["checkBox", [0]],
  ["cxLabel", [0]], ["actionBtn", [0]],
]);

/** Same-named helpers with a different signature in one file:
 *  practice-ui.ts el(tag, className, text) — text is arg 2, not 1;
 *  its hand(types, label) takes the label at arg 1; review-ui.ts
 *  node(tag, className, text) — text is arg 2. */
const FILE_HELPERS = {
  "practice-ui.ts": new Map([["el", [2]], ["hand", [1]]]),
  "review-ui.ts": new Map([["node", [2]]]),
  // Same-named helpers with a different signature elsewhere: in-person-ui
  // start(titleText) sets the screen title; the two calculators' local
  // show(title) sets the screen title; variant-table-ui toggle(label, get,
  // set) labels a switch (app.ts toggle(value, ...) is different);
  // variant-board-ui inspect(node, label, seat) labels a discard inspector.
  // Its el(tag, className) takes NO display text at all — the 2nd arg is a
  // CSS class (band, cell, pondwrap, ...), so an empty index list keeps
  // the extractor from minting keys for class names (rewire PR: 25
  // class-name keys had to be removed).
  "in-person-ui.ts": new Map([["start", [0]]]),
  "riichi-calculator-ui.ts": new Map([["show", [0]]]),
  "variant-calculator-ui.ts": new Map([["show", [0]]]),
  "variant-table-ui.ts": new Map([["toggle", [0]]]),
  "variant-board-ui.ts": new Map([["inspect", [1]], ["el", []]]),
};

/** Lesson-builder calls: (id, title, steps). */
const LESSON_CALLS = new Set(["lesson", "hkSteps"]);

/** Question-builder calls: choice(id, prompt, choices, answer, explanation, hint),
 *  pick(id, prompt, tiles, picks, explanation, hint). */
const QUESTION_CALLS = new Set(["choice", "pick"]);

/** Namespace per source file (relative to packages/web/src). */
const FILE_NAMESPACES = {
  "education/variant-content.ts": "learn.hong-kong",
  "education/mcr-lessons.ts": "learn.mcr",
  "education/taiwanese-lessons.ts": "learn.taiwanese",
  "education/american-lessons.ts": "learn.american",
  "education/american-card.ts": "learn.american.card",
  "education/american.ts": "learn.american",
  "education/curriculum.ts": "learn.riichi",
  "tutorial.ts": "learn.riichi",
  "education/practice.ts": "learn.practice",
  "education/mcr-guide.ts": "learn.mcr.guide",
  "education/review-collection.ts": "review.collection",
  "education/american-card.ts": "learn.american.card",
  "moment-text.ts": "review.moment",
  "review.ts": "review",
  "review-ui.ts": "review",
  "board-review.ts": "review.board",
  "board-review-ui.ts": "review.board",
  "riichi-calculator-ui.ts": "calc.riichi",
  "variant-calculator-ui.ts": "calc.variant",
  "compact-calc.ts": "calc.compact",
  "practice-ui.ts": "learn.practice.ui",
  "in-person-ui.ts": "tools.inperson",
  "in-person-store.ts": "tools.inperson",
  "variant-education-ui.ts": "learn.variant.ui",
  "variant-table-ui.ts": "play.variant",
  "variant-board-ui.ts": "play.variant",
  "american-card-ui.ts": "learn.american.ui",
  "american-lesson-ui.ts": "learn.american.ui",
  "tile-info.ts": "ui.tiles",
  "app.ts": "ui.app",
  "records.ts": "ui.stats",
  "hand-groups.ts": "play.groups",
};

/** Files scanned for UI strings (relative to packages/web/src). */
const SOURCE_FILES = Object.keys(FILE_NAMESPACES);

/** Static content pages inventoried (route -> file, relative to packages/web). */
const CONTENT_PAGES = [
  { route: "/", file: "index.html" },
  { route: "/riichi/", file: "public/riichi/index.html" },
  { route: "/learn/", file: "public/learn/index.html" },
  { route: "/hong-kong/", file: "public/hong-kong/index.html" },
  { route: "/mcr/", file: "public/mcr/index.html" },
  { route: "/taiwanese/", file: "public/taiwanese/index.html" },
  { route: "/calculator/", file: "public/calculator/index.html" },
  { route: "/privacy/", file: "public/privacy/index.html" },
];

/**
 * Exact user-facing strings that are NOT inventory (reviewed 2026-11-18):
 * code-adjacent display values that are not translatable prose — tile
 * notation shown as data, aria-only tokens, and the like. Anything added
 * here must be named in the PR; the default is to inventory, not exclude.
 */
const EXCLUDED_VALUES = new Set([
  // Tile/hand notation rendered as data, not prose (kept untranslated by design).
  "123456789m", "123456789p", "123456789s", "1234567z",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Placeholders in a (template-normalised) value: {name} / {0}. */
function placeholdersOf(value) {
  const out = [];
  for (const m of value.matchAll(/\{([^{}]+)\}/g)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out.sort();
}

function slugify(value) {
  const slug = value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  if (!slug) return "v";
  return /^[0-9]/.test(slug) ? `v-${slug}` : slug;
}

/** Tile/hand notation or other code data that is never prose. */
function isCodeData(value) {
  if (EXCLUDED_VALUES.has(value)) return true;
  if (/^[0-9]+[mpsz]+$/.test(value) && value.length > 3) return true; // "123456789m"
  if (/^[0-9mpsz]+$/.test(value) && /[mpsz]/.test(value) && value.length > 6) return true; // hands
  if (/^openmahjong\./.test(value)) return true; // storage keys
  if (/^(https?:\/\/|\/)[^\s]*$/.test(value)) return true; // URLs / paths
  // Bare domain / email shown as link text (e.g. adssettings.google.com):
  // displayed, but not translatable prose.
  if (!/\s/.test(value) && /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(value)) return true;
  if (!/\s/.test(value) && /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(value) && value.includes(".")) return true;
  if (value.length <= 1) return true;
  return false;
}

/** Normalise a template literal to a translatable value: ${...} -> {0}, {1} ... */
function templateValue(node) {
  let out = node.head.text;
  let i = 0;
  for (const span of node.templateSpans) {
    out += `{${i++}}${span.literal.text}`;
  }
  return out;
}

function literalValue(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return templateValue(node);
  return null;
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

// ---------------------------------------------------------------------------
// Key registry
// ---------------------------------------------------------------------------

/** key -> entry. Lesson keys are positional (stable per lesson/step/field);
 *  UI keys are deduplicated by (namespace, value): one key per distinct
 *  string, so translation memory is shared across repeated labels. */
const keys = new Map();
const uiKeysByValue = new Map(); // `${namespace}::${value}` -> key
const stats = { lesson: 0, ui: 0, page: 0, skippedCode: 0, dynamic: 0 };

function addKey(key, value, file, line, extra = {}) {
  if (!value || !value.trim() || isCodeData(value.trim())) {
    stats.skippedCode++;
    return null;
  }
  value = value.trim();
  if (keys.has(key)) {
    const prev = keys.get(key);
    if (prev.value !== value) {
      throw new Error(
        `Key collision: ${key} already holds ${JSON.stringify(prev.value)} ` +
          `(${prev.source.file}:${prev.source.line}), cannot also hold ` +
          `${JSON.stringify(value)} (${file}:${line})`,
      );
    }
    return key; // same key, same value: dedupe
  }
  keys.set(key, {
    value,
    hash: sha256(value),
    source: { file, line },
    placeholders: placeholdersOf(value),
    status: "approved",
    ...extra,
  });
  return key;
}

/** Lesson step keys: one step field can hold several conditional branches
 *  (e.g. a wrongNote function returning different feedback per tapped
 *  tile). Suffix colliding branches -2, -3, ... in source order, which is
 *  deterministic, so the keys stay stable across runs. */
function addStepKey(base, value, file, line, extra = {}) {
  let key = base;
  let n = 2;
  while (keys.has(key) && keys.get(key).value !== value.trim()) {
    key = `${base}-${n++}`;
  }
  return addKey(key, value, file, line, extra);
}

function addUiKey(namespace, value, file, line, extra = {}) {
  // Dedupe on the STORED value: addKey() trims, so the dedupe key, the
  // slug, and the collision comparison must all use the trimmed value —
  // otherwise " {0}", "{0} " and "{0}" mint three keys for one string
  // (ui.app.v-0 vs ui.app.v-0-6 on main), and a tx() fallback that
  // strips the whitespace reassigns the suffixed key and collides
  // (rewire PR). First-claims-wins, as before.
  value = value.trim();
  const dedupe = `${namespace}::${value}`;
  if (uiKeysByValue.has(dedupe)) return uiKeysByValue.get(dedupe);
  let base = `${namespace}.${slugify(value)}`;
  let key = base;
  let n = 2;
  while (keys.has(key) && keys.get(key).value !== value) key = `${base}-${n++}`;
  uiKeysByValue.set(dedupe, key);
  return addKey(key, value, file, line, extra);
}

// ---------------------------------------------------------------------------
// AST walkers
// ---------------------------------------------------------------------------

/** Find the enclosing lesson/module context for a node via ancestor chain. */
function lessonContext(ancestors, file) {
  // ancestors: innermost-first list of { node, call? } built by the walker.
  for (const a of ancestors) {
    if (a.call && LESSON_CALLS.has(a.call.name)) {
      const args = a.call.node.arguments;
      const id = args[0] && ts.isStringLiteral(args[0]) ? args[0].text : null;
      const title = args[1] && ts.isStringLiteral(args[1]) ? args[1].text : null;
      return { kind: "lesson", id, title, node: a.call.node };
    }
    if (a.caseClause) return { kind: "module", id: a.caseClause, node: null };
  }
  return null;
}

function extractSourceFile(rel, absPath) {
  const namespace = FILE_NAMESPACES[rel];
  const text = readFileSync(absPath, "utf8");
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true);

  // Per-file lesson/module state, computed in a first pass: for each
  // lesson()/hkSteps() call, record its range + id + step object order;
  // for each tutorial case, record its range + module id + step order.
  const lessons = []; // { start, end, id, title, steps: [{start,end,index}] }
  const modules = []; // { start, end, id, steps: [{start,end,index}] }

  function collectLesson(node) {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && LESSON_CALLS.has(callee.text)) {
        const args = node.arguments;
        const id = args[0] && ts.isStringLiteral(args[0]) ? args[0].text : null;
        const title = args[1] && ts.isStringLiteral(args[1]) ? args[1].text : null;
        const stepsArg = args[2];
        const steps = [];
        if (stepsArg && ts.isArrayLiteralExpression(stepsArg)) {
          stepsArg.elements.forEach((el, i) => {
            if (ts.isObjectLiteralExpression(el)) {
              steps.push({ start: el.getStart(sf), end: el.end, index: i + 1 });
            }
          });
        }
        if (id) lessons.push({ start: node.getStart(sf), end: node.end, id, title, steps });
      }
    }
    if (ts.isCaseClause(node)) {
      const expr = node.expression;
      if (ts.isStringLiteral(expr) && /^tu\d+$/.test(expr.text)) {
        const steps = [];
        let count = 0;
        const visit = (n) => {
          if (
            ts.isObjectLiteralExpression(n) &&
            n.properties.some(
              (p) =>
                ts.isPropertyAssignment(p) &&
                ts.isIdentifier(p.name) &&
                p.name.text === "kind",
            )
          ) {
            steps.push({ start: n.getStart(sf), end: n.end, index: ++count });
          }
          ts.forEachChild(n, visit);
        };
        node.statements.forEach((s) => visit(s));
        modules.push({ start: node.getStart(sf), end: node.end, id: expr.text, steps });
      }
    }
    ts.forEachChild(node, collectLesson);
  }
  collectLesson(sf);

  function lessonAt(pos) {
    return lessons.find((l) => pos >= l.start && pos <= l.end) ?? null;
  }
  function moduleAt(pos) {
    return modules.find((m) => pos >= m.start && pos <= m.end) ?? null;
  }
  function stepIndexFor(lesson, pos) {
    const step = lesson.steps.find((s) => pos >= s.start && pos <= s.end);
    return step ? step.index : null;
  }

  // Question context: enclosing choice()/pick() call and the arg index.
  function questionContext(node, ancestors) {
    for (const a of ancestors) {
      if (a.call && QUESTION_CALLS.has(a.call.name)) {
        const call = a.call.node;
        const argIndex = call.arguments.indexOf(a.child);
        const idArg = call.arguments[0];
        const qid = idArg && ts.isStringLiteral(idArg) ? idArg.text : null;
        return { call: a.call.name, qid, argIndex, argNode: a.child };
      }
    }
    return null;
  }

  const visit = (node, ancestors) => {
    const children = [];
    ts.forEachChild(node, (child) => {
      let call = null;
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        // `bare` distinguishes a local helper call (toggle(...)) from a
        // method call (shell.classList.toggle(...)): FILE_HELPERS entries
        // describe local helpers, so they must only match bare calls
        // (rewire PR: classList.toggle("variant-large") was claimed as
        // a labelled arg of the local toggle(label, get, set) helper).
        if (ts.isIdentifier(callee)) call = { name: callee.text, node, bare: true };
        else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name)) {
          call = { name: callee.name.text, node, bare: false };
        }
      }
      const caseClause =
        ts.isCaseClause(node) && ts.isStringLiteral(node.expression)
          ? node.expression.text
          : null;
      children.push({ node: child, call, caseClause, child });
    });

    // --- string literals -------------------------------------------------
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateExpression(node)
    ) {
      handleLiteral(node, ancestors);
    }

    for (const c of children) visit(c.node, [...ancestors, c]);
  };

  function handleLiteral(node, ancestors) {
    const value = literalValue(node);
    if (value === null || !value.trim()) return;
    const pos = node.getStart(sf);
    const line = lineOf(sf, node);

    // Comparison operands are code, not prose: `variant === "american"`,
    // `r.length === "south"`, `a.id.startsWith("chi:")` arguments aside,
    // a literal compared with ===/!== is an id, never display text.
    // (The display branch of the same ternary IS captured below.)
    const parent0 = ancestors.length >= 2 ? ancestors[ancestors.length - 2].node : null;
    if (
      parent0 &&
      ts.isBinaryExpression(parent0) &&
      (parent0.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        parent0.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
        parent0.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken ||
        parent0.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken) &&
      (parent0.left === node || parent0.right === node)
    ) {
      return;
    }

    // Skip literals that are themselves structural (ids, keys, notation).
    // NOTE: ancestors[ancestors.length - 1] is the literal itself (its
    // entry carries its parent's call info); the parent is at length - 2.
    const parent = parent0;

    // Property assignment: `key: "value"` (or array elements under it).
    // Walk up through arrays / parens / arrow functions (tutorial step
    // text is often `(c) => `...``); stop at a call boundary so a
    // choice()/pick() argument is not mistaken for a property value.
    let propName = null;
    let propNode = null;
    for (let i = ancestors.length - 2; i >= 0; i--) {
      const a = ancestors[i].node;
      // The literal IS the property name (e.g. "aria-label" in
      // `"aria-label": tileLabel(tile)`) — an attribute name, not a
      // value. Stop here; it is not display text (rewire PR: the
      // name was inventoried as ui.app.aria-label).
      if (
        ts.isPropertyAssignment(a) &&
        ancestors[i + 1] &&
        ancestors[i + 1].node === a.name
      ) {
        break;
      }
      if (ts.isPropertyAssignment(a) && ts.isIdentifier(a.name)) {
        propName = a.name.text;
        propNode = a;
        break;
      }
      // Quoted "aria-label" / "title" attributes in h() attrs objects.
      if (
        ts.isPropertyAssignment(a) &&
        ts.isStringLiteral(a.name) &&
        (a.name.text === "aria-label" || a.name.text === "title")
      ) {
        propName = a.name.text;
        propNode = a;
        break;
      }
      if (
        ts.isArrayLiteralExpression(a) ||
        ts.isParenthesizedExpression(a) ||
        ts.isArrowFunction(a) ||
        ts.isFunctionExpression(a) ||
        ts.isConditionalExpression(a) ||
        ts.isBlock(a) ||
        ts.isReturnStatement(a)
      ) {
        continue;
      }
      break;
    }

    const lesson = lessonAt(pos);
    const mod = moduleAt(pos);
    const q = questionContext(node, ancestors);

    // -- Question-builder calls: positional args carry the fields. -------
    if (q && q.qid) {
      const ns = namespace;
      const lessonId = lesson ? lesson.id : mod ? mod.id : "unknown";
      const prefix = `${ns}.${lessonId}.q-${q.qid}`;
      if (q.call === "choice") {
        if (q.argIndex === 1) return void addKey(`${prefix}.prompt`, value, rel, line);
        if (q.argIndex === 2) {
          // choices array element: index within the array
          const choiceIdx =
            parent && ts.isArrayLiteralExpression(parent)
              ? parent.elements.indexOf(node)
              : 0;
          return void addKey(`${prefix}.choice${choiceIdx}`, value, rel, line);
        }
        if (q.argIndex === 4) return void addKey(`${prefix}.explanation`, value, rel, line);
        if (q.argIndex === 5) return void addKey(`${prefix}.hint`, value, rel, line);
        return; // id / answer / tiles / picks: not prose
      }
      if (q.call === "pick") {
        if (q.argIndex === 1) return void addKey(`${prefix}.prompt`, value, rel, line);
        if (q.argIndex === 4) return void addKey(`${prefix}.explanation`, value, rel, line);
        if (q.argIndex === 5) return void addKey(`${prefix}.hint`, value, rel, line);
        return;
      }
    }

    // -- Lesson title (2nd arg of lesson()/hkSteps()). --------------------
    if (lesson && parent === null) {
      // handled below via call-arg detection; fall through
    }

    // -- Lesson / module step text via property names. --------------------
    // Any *Label property (adjustmentLabel, reasonLabel, ...) is UI text.
    if ((propName && TEXT_PROPS.has(propName)) || (propName && /Label$/.test(propName))) {
      // `d:` is the notation-key description in american-card-ui.ts — but
      // the same property name holds SVG path data elsewhere; path data
      // uses only path commands, digits and separators, so exclude it.
      if (propName === "d" && /^[MLCQZAHVmlcqzahv\d\s.,\-e]+$/.test(value)) return;
      if (lesson) {
        const stepIdx = stepIndexFor(lesson, pos);
        const base = `${namespace}.${lesson.id}`;
        if (propName === "title") return void addKey(`${base}.title`, value, rel, line);
        if (stepIdx !== null) {
          // `label` inside a step: choice options live under `options:`,
          // scene buttons under `buttons:` — different keys, same value
          // may legitimately appear in both (e.g. "Chi").
          if (propName === "label") {
            const enclosing = enclosingPropName(node, ancestors, propNode);
            if (enclosing === "options") {
              const optIdx = optionIndex(node, ancestors);
              return void addStepKey(`${base}.step${pad(stepIdx)}.option${optIdx}.label`, value, rel, line);
            }
            stats.ui++;
            return void addUiKey(namespace, value, rel, line);
          }
          stats.lesson++;
          return void addStepKey(`${base}.step${pad(stepIdx)}.${propName}`, value, rel, line, {
            ...(ts.isTemplateExpression(node) ? { dynamic: true } : {}),
          });
        }
        // lesson-level title handled above; other lesson-level props fall to UI
      }
      if (mod) {
        const stepIdx = stepIndexFor(mod, pos);
        const base = `${namespace}.${mod.id}`;
        if (stepIdx !== null) {
          if (propName === "label") {
            const enclosing = enclosingPropName(node, ancestors, propNode);
            if (enclosing === "options") {
              const optIdx = optionIndex(node, ancestors);
              return void addStepKey(`${base}.step${pad(stepIdx)}.option${optIdx}.label`, value, rel, line);
            }
            stats.ui++;
            return void addUiKey(namespace, value, rel, line);
          }
          stats.lesson++;
          return void addStepKey(`${base}.step${pad(stepIdx)}.${propName}`, value, rel, line, {
            ...(ts.isTemplateExpression(node) ? { dynamic: true } : {}),
          });
        }
      }
      // Curriculum MODULES fields (objectives/covered/completionCriteria
      // are TEXT_ARRAY_PROPS / TEXT_PROPS; title handled by module id).
      if (rel === "education/curriculum.ts") {
        const moduleId = enclosingModuleId(node, ancestors);
        if (moduleId) {
          const base = `${namespace}.${moduleId}`;
          if (propName === "title") return void addKey(`${base}.title`, value, rel, line);
          if (propName === "completionCriteria") return void addKey(`${base}.completion`, value, rel, line);
        }
      }
      // Generic UI text property (label/title/text/... outside lessons).
      stats.ui++;
      return void addUiKey(namespace, value, rel, line, {
        ...(ts.isTemplateExpression(node) ? { dynamic: true } : {}),
      });
    }

    if (propName && TEXT_ARRAY_PROPS.has(propName)) {
      // Array elements under objectives / covered / choices (object form).
      if (rel === "education/curriculum.ts") {
        const moduleId = enclosingModuleId(node, ancestors);
        if (moduleId && parent && ts.isArrayLiteralExpression(parent)) {
          const idx = parent.elements.indexOf(node);
          const field = propName === "objectives" ? "objective" : "covered";
          stats.lesson++;
          return void addKey(`${namespace}.${moduleId}.${field}${idx}`, value, rel, line);
        }
      }
      if (lesson) {
        const stepIdx = stepIndexFor(lesson, pos);
        if (stepIdx !== null && parent && ts.isArrayLiteralExpression(parent)) {
          const idx = parent.elements.indexOf(node);
          stats.lesson++;
          return void addKey(
            `${namespace}.${lesson.id}.step${pad(stepIdx)}.choice${idx}`,
            value, rel, line,
          );
        }
      }
      return; // choices in other contexts are handled by the question rule
    }

    // -- `name` property: variant / domain display names only. ------------
    if (propName === "name" && rel === "education/variant-content.ts") {
      stats.ui++;
      return void addUiKey("common.variant", value, rel, line);
    }
    // -- curriculum.ts DOMAINS: { A: "Fundamentals", ... } ------------------
    if (rel === "education/curriculum.ts") {
      for (let i = ancestors.length - 1; i >= 0; i--) {
        const a = ancestors[i].node;
        if (
          ts.isVariableDeclaration(a) &&
          ts.isIdentifier(a.name) &&
          a.name.text === "DOMAINS"
        ) {
          const letter = propName; // "A".."I"
          if (letter && /^[A-I]$/.test(letter)) {
            stats.lesson++;
            return void addKey(`learn.riichi.domain.${letter.toLowerCase()}`, value, rel, line);
          }
          break;
        }
        if (ts.isCallExpression(a) || ts.isFunctionDeclaration(a)) break;
      }
    }

    // -- Call arguments ----------------------------------------------------
    // Only a literal that IS the direct argument of a call can match a
    // call rule (a.child === node for the self entry). A literal nested
    // inside a child's template/ternary falls through to the rules below.
    for (let i = ancestors.length - 1; i >= 0; i--) {
      const a = ancestors[i];
      if (!a.call) continue;
      const call = a.call;
      // lesson()/hkSteps() title arg
      if (LESSON_CALLS.has(call.name) && a.child === call.node.arguments[1]) {
        const idArg = call.node.arguments[0];
        const id = idArg && ts.isStringLiteral(idArg) ? idArg.text : null;
        if (id) {
          stats.lesson++;
          return void addKey(`${namespace}.${id}.title`, value, rel, line);
        }
        return;
      }
      // tx("key", "English source", ...args) and tForLocale("key",
      // locale, "English source", ...args): the fallback argument is
      // the key's English source — the mechanism by which a string
      // that only exists behind a translate call gets its en.json
      // entry (packages/web/src/i18n/index.ts). The key is explicit,
      // never slug-derived. The key id, the locale, and args >= the
      // fallback are not prose, so they are skipped.
      // The literal must BE the fallback argument itself: a display
      // fragment nested inside the fallback template's ${...} spans
      // (or inside a later arg) is NOT the fallback — it is its own
      // string, inventoried by the rules below under its slug key
      // (the template-branch rule). Claiming it under the outer key
      // misattributes it and collides when the values differ
      // (rewire PR: nested tx() composition, e.g. a translated
      // sentence whose ${...} branch is itself a tx() call).
      if (call.name === "tx" || call.name === "tForLocale") {
        const fallbackIdx = call.name === "tx" ? 1 : 2;
        if (call.node.arguments[fallbackIdx] === node) {
          const keyArg = call.node.arguments[0];
          if (keyArg && ts.isStringLiteral(keyArg)) {
            stats.ui++;
            // Claim the UI-dedupe slot for the explicit key (first
            // claim wins): a raw literal with the same trimmed value
            // elsewhere in this file is the same string, so it must
            // resolve to this key rather than minting a suffixed twin
            // (rewire PR: tx() fallbacks strip the extractor-trimmed
            // whitespace, so without the claim a shadow literal
            // reassigns the suffix and collides).
            const slot = `${namespace}::${value.trim()}`;
            if (!uiKeysByValue.has(slot)) uiKeysByValue.set(slot, keyArg.text);
            return void addKey(keyArg.text, value, rel, line, {
              ...(ts.isTemplateExpression(node) ? { dynamic: true } : {}),
            });
          }
          return;
        }
        continue;
      }
      // h(tag, attrs, ...children): string children are UI text. The
      // literal may be nested inside a child argument (a ternary choosing
      // between display branches); comparison operands inside it are
      // skipped above, and a nested call on the path stops the search.
      if (call.name === "h") {
        const idx = call.node.arguments.indexOf(a.child);
        if (idx >= 2) {
          stats.ui++;
          return void addUiKey(namespace, value, rel, line, {
            ...(ts.isTemplateExpression(node) ? { dynamic: true } : {}),
          });
        }
        return;
      }
      // Local label helpers (per-file signatures override the global map).
      // FILE_HELPERS entries describe local helpers, so they only match
      // bare calls — a method of the same name (classList.toggle) is not
      // the local helper. A literal inside a NON-labelled argument (e.g.
      // a button callback that sets status text) is not the helper's
      // label — fall through to the other rules instead of dropping it.
      const helperIdx =
        (a.call.bare ? FILE_HELPERS[rel]?.get(call.name) : undefined) ??
        LABEL_HELPERS.get(call.name);
      if (helperIdx) {
        const idx = call.node.arguments.indexOf(a.child);
        if (helperIdx.includes(idx)) {
          stats.ui++;
          return void addUiKey(namespace, value, rel, line, {
            ...(ts.isTemplateExpression(node) ? { dynamic: true } : {}),
          });
        }
        continue;
      }
      // `.push("...")` of a sentence: move facts, indicator sentences.
      // Code pushes (tiles, ids) are short/id-like and fail the test.
      // `errors.push(...)` is a dev validation report, never rendered.
      if (call.name === "push") {
        const calleeObj =
          ts.isCallExpression(call.node) &&
          ts.isPropertyAccessExpression(call.node.expression)
            ? call.node.expression.expression
            : null;
        if (calleeObj && ts.isIdentifier(calleeObj) && calleeObj.text === "errors") {
          continue;
        }
        const idx = call.node.arguments.indexOf(a.child);
        const trimmed = value.trim();
        if (
          idx === 0 &&
          trimmed.length >= 10 &&
          /\s/.test(trimmed) &&
          /^(?:[A-Z{]|and |the |it |you )/i.test(trimmed)
        ) {
          stats.ui++;
          return void addUiKey(namespace, value, rel, line, {
            ...(ts.isTemplateExpression(node) ? { dynamic: true } : {}),
          });
        }
        continue;
      }
      // `setAttribute("aria-label" | "title", "...")` — screen-reader and
      // tooltip text is UI text.
      if (call.name === "setAttribute") {
        const idx = call.node.arguments.indexOf(a.child);
        const first = call.node.arguments[0];
        if (
          idx === 1 &&
          first &&
          ts.isStringLiteral(first) &&
          (first.text === "aria-label" || first.text === "title")
        ) {
          stats.ui++;
          return void addUiKey(namespace, value, rel, line);
        }
        continue;
      }
      break; // only the innermost call matters
    }

    // -- moment-text.ts: sentence templates --------------------------------
    // Coaching-moment prose is built as template literals in function
    // bodies (choice lines, headlines, facts), not under text properties.
    // Any sentence-like literal here is displayed text. TERMS values are
    // excluded (they have their own keys via the TERMS rule below).
    if (rel === "moment-text.ts") {
      const trimmed = value.trim();
      const inTerms = ancestors.some(
        (a) =>
          ts.isVariableDeclaration(a.node) &&
          ts.isIdentifier(a.node.name) &&
          a.node.name.text === "TERMS",
      );
      if (!inTerms && trimmed.length >= 6 && /\s/.test(trimmed) && /[A-Za-z]/.test(trimmed)) {
        stats.ui++;
        return void addUiKey("review.moment", value, rel, line, {
          ...(ts.isTemplateExpression(node) ? { dynamic: true } : {}),
        });
      }
    }

    // -- Template-branch display strings -----------------------------------
    // A literal nested inside a template's ${...} (e.g. a ternary branch
    // choosing "American helper" vs "MCR"): the composite template key
    // alone cannot be translated, because the branch is chosen at
    // runtime — so each display branch gets its own key. Code branches
    // (ids like "american", "t-f0") are excluded by the shape test.
    {
      let inTemplate = false;
      for (let i = ancestors.length - 2; i >= 0; i--) {
        const a = ancestors[i].node;
        if (ts.isTemplateExpression(a) || ts.isTemplateSpan(a)) inTemplate = true;
        if (ts.isPropertyAssignment(a) || ts.isSourceFile(a)) break;
      }
      const trimmed = value.trim();
      const looksDisplay =
        (/\s/.test(trimmed) && /[A-Za-z]/.test(trimmed)) ||
        /^[A-Z][A-Za-z]+( [A-Z][A-Za-z]+)*$/.test(trimmed) ||
        /^[A-Z]{2,}$/.test(trimmed);
      if (inTemplate && looksDisplay && trimmed.length >= 2 && !isCodeData(trimmed)) {
        stats.ui++;
        return void addUiKey(namespace, value, rel, line, {
          ...(ts.isTemplateExpression(node) ? { dynamic: true } : {}),
        });
      }
    }

    // -- Assigned sentence variables ----------------------------------------
    // `fact = `...``, `isolated = cond ? `...` : `...``, `composition = ...`:
    // display text held in a variable before it is rendered. Walk up to
    // the enclosing assignment / declaration; a nested call on the path
    // means the literal belongs to that call, not the assignment.
    {
      let assigned = false;
      for (let i = ancestors.length - 2; i >= 0; i--) {
        const a = ancestors[i].node;
        // A literal inside `throw new Error(...)` is an error message, not
        // assigned display text — stop the walk there (and at any `new`
        // expression, whose args are constructor inputs, not prose).
        if (
          ts.isCallExpression(a) ||
          ts.isPropertyAssignment(a) ||
          ts.isReturnStatement(a) ||
          ts.isThrowStatement(a) ||
          ts.isNewExpression(a)
        ) {
          break;
        }
        // `host.className = `...`` is a CSS class list, not prose — the
        // literal belongs to that assignment, so stop the walk here
        // (rewire PR: variant-board-ui "variant-public-board
        // variant-v4{0}" was inventoried as a UI string).
        if (
          ts.isBinaryExpression(a) &&
          a.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isPropertyAccessExpression(a.left) &&
          a.left.name.text === "className"
        ) {
          break;
        }
        if (
          (ts.isBinaryExpression(a) &&
            a.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            (ts.isIdentifier(a.left) || ts.isPropertyAccessExpression(a.left))) ||
          ts.isVariableDeclaration(a)
        ) {
          assigned = true;
          break;
        }
        if (ts.isSourceFile(a)) break;
      }
      const trimmed = value.trim();
      if (
        assigned &&
        trimmed.length >= 10 &&
        /\s/.test(trimmed) &&
        /^(?:[A-Za-z{“"])/.test(trimmed) &&
        !trimmed.startsWith("<")
      ) {
        stats.ui++;
        return void addUiKey(namespace, value, rel, line, {
          ...(ts.isTemplateExpression(node) ? { dynamic: true } : {}),
        });
      }
    }

    // -- Bare string-list elements -------------------------------------------
    // A sentence-like element of a string array (e.g. the card key's
    // fragments, " exposures allowed · "). Choice arrays and id lists
    // fail the sentence test and are handled by their own rules above.
    // An `errors: [...]` array is a dev validation report, never rendered.
    if (parent && ts.isArrayLiteralExpression(parent) && parent.elements.includes(node)) {
      const arrParent = ancestors[ancestors.length - 3]?.node;
      const isErrorsArray =
        arrParent &&
        ts.isPropertyAssignment(arrParent) &&
        ts.isIdentifier(arrParent.name) &&
        arrParent.name.text === "errors";
      const trimmed = value.trim();
      if (
        !isErrorsArray &&
        trimmed.length >= 10 && /\s/.test(trimmed) && /[A-Za-z]/.test(trimmed)
      ) {
        stats.ui++;
        return void addUiKey(namespace, value, rel, line, {
          ...(ts.isTemplateExpression(node) ? { dynamic: true } : {}),
        });
      }
    }

    // -- textContent / innerHTML assignments ---------------------------------
    // The literal may be nested inside the assigned value (a ternary
    // choosing between display branches, or a `+` concatenation). Walk
    // up to the assignment; a nested call on the path stops the search.
    for (let i = ancestors.length - 2; i >= 0; i--) {
      const a = ancestors[i].node;
      if (
        ts.isBinaryExpression(a) &&
        a.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(a.left) &&
        a.left.name.text === "textContent"
      ) {
        stats.ui++;
        return void addUiKey(namespace, value, rel, line, {
          ...(ts.isTemplateExpression(node) ? { dynamic: true } : {}),
        });
      }
      if (
        ts.isBinaryExpression(a) &&
        a.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(a.left) &&
        a.left.name.text === "innerHTML"
      ) {
        // innerHTML templates: extract visible text fragments between tags
        for (const frag of innerHtmlFragments(value)) {
          stats.ui++;
          addUiKey(namespace, frag, rel, line);
        }
        return;
      }
      if (
        ts.isCallExpression(a) ||
        ts.isPropertyAssignment(a) ||
        ts.isReturnStatement(a) ||
        ts.isSourceFile(a)
      ) {
        break;
      }
    }

    // -- mcr-guide.ts pattern reference ------------------------------------
    // entries: Record<pattern name, [family, recognition, exclusions]>.
    // The quoted key is the pattern's display name; the tuple elements
    // are its family, recognition text and exclusions text.
    if (rel === "education/mcr-guide.ts") {
      // Tuple element: parent array's parent is the quoted-key property.
      if (parent && ts.isArrayLiteralExpression(parent)) {
        const grand = ancestors.length >= 3 ? ancestors[ancestors.length - 3].node : null;
        if (
          grand &&
          ts.isPropertyAssignment(grand) &&
          ts.isStringLiteral(grand.name)
        ) {
          const slug = slugify(grand.name.text);
          const idx = parent.elements.indexOf(node);
          const field = ["family", "recognition", "exclusions"][idx] ?? `field${idx}`;
          stats.lesson++;
          return void addKey(`learn.mcr.guide.pattern.${slug}.${field}`, value, rel, line);
        }
      }
      // The quoted key itself (property name is a string literal).
      if (
        parent &&
        ts.isPropertyAssignment(parent) &&
        parent.name === node &&
        (ts.isArrayLiteralExpression(parent.initializer) ||
          ts.isObjectLiteralExpression(parent.initializer))
      ) {
        const trimmed = value.trim();
        if (
          trimmed.length >= 3 &&
          (/\s/.test(trimmed) || /^[A-Z][A-Za-z'’ -]+$/.test(trimmed))
        ) {
          stats.lesson++;
          return void addKey(
            `learn.mcr.guide.pattern.${slugify(trimmed)}.name`, value, rel, line,
          );
        }
      }
    }

    // -- board-review.ts event verbs -----------------------------------------
    // eventLabel's `names` record: draw/discard/flower/... -> display verb.
    if (rel === "board-review.ts" && propName) {
      for (let i = ancestors.length - 2; i >= 0; i--) {
        const a = ancestors[i].node;
        if (
          ts.isVariableDeclaration(a) &&
          ts.isIdentifier(a.name) &&
          a.name.text === "names"
        ) {
          stats.ui++;
          return void addKey(`review.board.event.${propName}`, value, rel, line, {
            ...(ts.isTemplateExpression(node) ? { dynamic: true } : {}),
          });
        }
        if (ts.isSourceFile(a) || ts.isFunctionDeclaration(a)) break;
      }
    }

    // -- practice-ui.ts skill / yaku display names --------------------------
    // NAMES: Partial<Record<SkillId, string>> — "tile-recognition":
    // "Tile recognition"; YAKU: { tanyao: "Tanyao", chiitoitsu: "Seven pairs" }.
    // (A literal that IS a quoted property name is an id, not a value.)
    if (
      rel === "practice-ui.ts" &&
      !(parent && ts.isPropertyAssignment(parent) && parent.name === node)
    ) {
      for (let i = ancestors.length - 2; i >= 0; i--) {
        const a = ancestors[i].node;
        if (ts.isVariableDeclaration(a) && ts.isIdentifier(a.name)) {
          const vname = a.name.text;
          if (vname === "NAMES" || vname === "YAKU") {
            // The value's property assignment sits between the
            // declaration and the literal (ancestors are outermost-first).
            const pa = ancestors
              .slice(i + 1)
              .map((x) => x.node)
              .findLast((x) => ts.isPropertyAssignment(x));
            if (pa) {
              const keyName = ts.isIdentifier(pa.name)
                ? pa.name.text
                : ts.isStringLiteral(pa.name)
                  ? pa.name.text
                  : null;
              if (keyName) {
                stats.lesson++;
                return void addKey(
                  `learn.practice.${vname === "NAMES" ? "skill" : "yaku"}.${slugify(keyName)}`,
                  value, rel, line,
                );
              }
            }
          }
          break;
        }
        if (ts.isSourceFile(a) || ts.isFunctionDeclaration(a)) break;
      }
    }

    // -- Record<string, string> display maps --------------------------------
    // e.g. tutorial.ts winBreakdown() glosses: { riichi: "Riichi — ..." }.
    // The object literal initialises a variable typed Record<string,string>.
    {
      let recProp = null;
      for (let i = ancestors.length - 2; i >= 0; i--) {
        const a = ancestors[i].node;
        if (ts.isPropertyAssignment(a) && ts.isIdentifier(a.name)) {
          recProp = a;
          break;
        }
        if (ts.isCallExpression(a) || ts.isSourceFile(a)) break;
      }
      if (recProp) {
        const objLit = ancestors[ancestors.findIndex((a) => a.node === recProp) - 1]?.node;
        const varDecl = ancestors[ancestors.findIndex((a) => a.node === recProp) - 2]?.node;
        if (
          objLit &&
          ts.isObjectLiteralExpression(objLit) &&
          varDecl &&
          ts.isVariableDeclaration(varDecl) &&
          varDecl.type &&
          /Record<[^>]*,\s*string\s*>/.test(varDecl.type.getText(sf))
        ) {
          stats.ui++;
          return void addUiKey(namespace, value, rel, line);
        }
      }
    }

    // -- [display name, number] array pairs (score tables) and
    //    [id, display label] pairs (option lists, circumstance pickers).
    //    The label may be nested inside the pair element (a ternary
    //    choosing between display branches); find the element on the path.
    {
      let arrIdx = -1;
      for (let i = ancestors.length - 2; i >= 0; i--) {
        const a = ancestors[i].node;
        if (ts.isArrayLiteralExpression(a)) {
          arrIdx = i;
          break;
        }
        if (ts.isCallExpression(a) || ts.isPropertyAssignment(a) || ts.isSourceFile(a)) break;
      }
      if (arrIdx >= 0) {
        const arr = ancestors[arrIdx].node;
        const elem = ancestors[arrIdx + 1]?.node;
        if (ts.isArrayLiteralExpression(arr) && arr.elements.length === 2 && elem) {
          const [first, second] = arr.elements;
          const displayLike =
            /[A-Za-z]/.test(value.trim()) &&
            (/\s/.test(value.trim()) ||
              /^[A-Z][A-Za-z'’ -]+$/.test(value.trim()) ||
              /^[A-Z]{2,}$/.test(value.trim()));
          if (elem === first && second && ts.isNumericLiteral(second) && displayLike) {
            stats.ui++;
            return void addUiKey(namespace, value, rel, line);
          }
          if (elem === second && first && displayLike) {
            // First element is an id: a string literal id, or an
            // identifier (e.g. a .map() key). A display-looking first
            // element is not an id pair, so it does not qualify.
            const firstIsId =
              ts.isIdentifier(first) ||
              (ts.isStringLiteral(first) && !/\s/.test(first.text) && !/^[A-Z][a-z]+$/.test(first.text));
            if (firstIsId) {
              stats.ui++;
              return void addUiKey(namespace, value, rel, line);
            }
          }
        }
      }
    }

    // -- Quoted-key record values (display-name maps, e.g. ABORTIVE_NAMES).
    // The property name is a string literal id; the value reads as prose.
    // (A literal that IS a property name is an id, not a value — skip it.)
    {
      const isPropName =
        parent && ts.isPropertyAssignment(parent) && parent.name === node;
      let quotedKey = false;
      for (let i = ancestors.length - 2; i >= 0; i--) {
        const a = ancestors[i].node;
        if (ts.isPropertyAssignment(a) && ts.isStringLiteral(a.name)) {
          quotedKey = true;
          break;
        }
        if (ts.isArrayLiteralExpression(a) || ts.isCallExpression(a)) break;
      }
      const trimmed = value.trim();
      if (
        !isPropName &&
        quotedKey &&
        trimmed.length >= 3 &&
        /[A-Za-z]/.test(trimmed) &&
        (/\s/.test(trimmed) || /^[A-Z][A-Za-z'’ -]+$/.test(trimmed))
      ) {
        stats.ui++;
        return void addUiKey(namespace, value, rel, line);
      }
    }

    // -- Return-value sentence strings --------------------------------------
    // e.g. safetyLineText(): `Safe against {0} — ...` (possibly nested in
    // a ternary), or handValueNote(): "Before the repeat counter.". A
    // returned string that reads as a sentence is displayed text. Code
    // templates (SVG, styles, selectors, URLs) start with <, a letter +
    // ":" or a symbol, so the letter/{ start + space test keeps them out.
    {
      let returned = false;
      for (let i = ancestors.length - 2; i >= 0; i--) {
        const a = ancestors[i].node;
        if (ts.isReturnStatement(a)) {
          returned = true;
          break;
        }
        if (
          !ts.isConditionalExpression(a) &&
          !ts.isParenthesizedExpression(a)
        ) {
          break;
        }
      }
      const trimmed = value.trim();
      if (
        returned &&
        trimmed.length >= 10 &&
        /^(?:[A-Za-z{])/.test(trimmed) &&
        /\s/.test(trimmed) &&
        !trimmed.startsWith("<")
      ) {
        stats.ui++;
        return void addUiKey(namespace, value, rel, line, {
          ...(ts.isTemplateExpression(node) ? { dynamic: true } : {}),
        });
      }
    }

    // -- Thrown validation messages (displayed via safe() status text) ------
    // Only in THROW_FILES, where the UI demonstrably renders e.message.
    if (THROW_FILES.has(rel)) {
      for (let i = ancestors.length - 2; i >= 0; i--) {
        const a = ancestors[i].node;
        if (
          ts.isNewExpression(a) &&
          ts.isIdentifier(a.expression) &&
          a.expression.text === "Error" &&
          a.arguments?.[0] === node
        ) {
          const trimmed = value.trim();
          if (trimmed.length >= 8 && /[A-Za-z]/.test(trimmed)) {
            stats.ui++;
            return void addUiKey(namespace, value, rel, line, {
              ...(ts.isTemplateExpression(node) ? { dynamic: true } : {}),
            });
          }
          break;
        }
        if (ts.isSourceFile(a)) break;
      }
    }

    // Thrown error messages are NOT inventoried: they are dev assertions
    // (e.g. review.ts "Decision log desync …"), not UI copy. The one
    // user-visible failure string ("Compatible variant content is
    // unavailable", variant-education-ui.ts) is listed as a known gap in
    // src/i18n/README.md instead of being silently reworded or dropped.

    // -- `.note = "..."` gate feedback (tutorial.ts): shown as the lesson
    //    note, so it is user-facing prose, not a code string. ------------
    for (let i = ancestors.length - 2; i >= 0; i--) {
      const a = ancestors[i].node;
      if (
        ts.isBinaryExpression(a) &&
        a.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(a.left) &&
        a.left.name.text === "note" &&
        a.right === node
      ) {
        if (lesson) {
          const s = stepIndexFor(lesson, pos);
          if (s !== null) {
            stats.lesson++;
            return void addKey(noteKey(`${namespace}.${lesson.id}`, s), value, rel, line, {
              ...(ts.isTemplateExpression(node) ? { dynamic: true } : {}),
            });
          }
        }
        if (mod) {
          const s = stepIndexFor(mod, pos);
          if (s !== null) {
            stats.lesson++;
            return void addKey(noteKey(`${namespace}.${mod.id}`, s), value, rel, line, {
              ...(ts.isTemplateExpression(node) ? { dynamic: true } : {}),
            });
          }
        }
        stats.ui++;
        return void addUiKey(namespace, value, rel, line, {
          ...(ts.isTemplateExpression(node) ? { dynamic: true } : {}),
        });
      }
      if (ts.isSourceFile(a)) break;
    }

    // -- TERMS map in moment-text.ts (const TERMS = { key: "..." }) -------
    // Only inside the TERMS declaration itself — other `kind:` / short
    // properties in the file are code, not prose.
    if (rel === "moment-text.ts" && propName && /^[a-z]+$/.test(propName)) {
      for (let i = ancestors.length - 2; i >= 0; i--) {
        const a = ancestors[i].node;
        if (
          ts.isVariableDeclaration(a) &&
          ts.isIdentifier(a.name) &&
          a.name.text === "TERMS"
        ) {
          stats.ui++;
          return void addKey(`review.terms.${propName}`, value, rel, line);
        }
        if (ts.isSourceFile(a) || ts.isFunctionDeclaration(a)) break;
      }
    }

    // Anything else is code, not UI text: skip silently.
  }

  function enclosingPropName(node, ancestors, propNode) {
    // Name of the nearest PropertyAssignment *above* propNode (e.g.
    // "options" vs "buttons" for a step's `label:` strings).
    const idx = ancestors.findIndex((a) => a.node === propNode);
    for (let i = idx - 1; i >= 0; i--) {
      const a = ancestors[i].node;
      if (ts.isPropertyAssignment(a) && ts.isIdentifier(a.name)) return a.name.text;
      if (ts.isCallExpression(a) || ts.isSourceFile(a)) break;
    }
    return null;
  }

  /** Per-step `c.note = "..."` counter: first note is `.note`, then `.note2`... */
  const noteCounts = new Map();
  function noteKey(base, stepIdx) {
    const stem = `${base}.step${pad(stepIdx)}.note`;
    const n = (noteCounts.get(stem) ?? 0) + 1;
    noteCounts.set(stem, n);
    return n === 1 ? stem : `${stem}${n}`;
  }

  function optionIndex(node, ancestors) {
    // Index of the enclosing { label } object within its options array.
    for (let i = ancestors.length - 1; i >= 0; i--) {
      const a = ancestors[i].node;
      if (ts.isArrayLiteralExpression(a)) {
        // find the object literal ancestor that is an element of this array
        for (let j = ancestors.length - 1; j > i; j--) {
          const cand = ancestors[j].node;
          if (ts.isObjectLiteralExpression(cand) && a.elements.includes(cand)) {
            return a.elements.indexOf(cand);
          }
        }
        return 0;
      }
    }
    return 0;
  }

  function enclosingModuleId(node, ancestors) {
    for (let i = ancestors.length - 1; i >= 0; i--) {
      const a = ancestors[i].node;
      if (ts.isObjectLiteralExpression(a)) {
        const idProp = a.properties.find(
          (p) =>
            ts.isPropertyAssignment(p) &&
            ts.isIdentifier(p.name) &&
            p.name.text === "id" &&
            ts.isStringLiteral(p.initializer),
        );
        if (idProp && ts.isPropertyAssignment(idProp)) {
          return idProp.initializer.text;
        }
      }
    }
    return null;
  }

  visit(sf, []);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

/** Visible text fragments inside an innerHTML template (e.g. <span>Sort</span>). */
function innerHtmlFragments(html) {
  const text = html
    .replace(/<svg[\s\S]*?<\/svg>/g, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&amp;/g, "&");
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && /[A-Za-z]{2}/.test(s) && !/^[{}0-9\s.,;:·\-–—]+$/.test(s));
}

// ---------------------------------------------------------------------------
// Static content pages
// ---------------------------------------------------------------------------

/**
 * The Practice Card's copy lives in data, not code:
 * packages/web/src/education/practice-card.json (title, label, section
 * names/blurbs, hand descriptions, notation key). The typed view in
 * american-card.ts reads it verbatim, so this is the canonical copy.
 */
function extractPracticeCard() {
  const card = JSON.parse(
    readFileSync(resolve(WEB, "src/education/practice-card.json"), "utf8"),
  ).card;
  const file = "src/education/practice-card.json";
  const put = (key, value) => {
    stats.lesson++;
    addKey(key, value, file, 1);
  };
  put("learn.american.pcard.title", card.title);
  put("learn.american.pcard.label", card.label);
  for (const s of card.sections ?? []) {
    put(`learn.american.pcard.section.${s.id}.name`, s.name);
    put(`learn.american.pcard.section.${s.id}.blurb`, s.blurb);
  }
  for (const h of card.hands ?? []) {
    put(`learn.american.pcard.hand.${h.id}.description`, h.description);
  }
  for (const [k, v] of Object.entries(card.notationKey ?? {})) {
    put(`learn.american.pcard.notation.${slugify(k)}`, v);
  }
}

function extractContentPages() {
  for (const page of CONTENT_PAGES) {
    const html = readFileSync(resolve(WEB, page.file), "utf8");
    const routeSlug = page.route === "/" ? "root" : page.route.replace(/\//g, "");
    let n = 0;
    const push = (value, source) => {
      if (!value || isCodeData(value)) return;
      const key = `pages.${routeSlug}.${pad(++n)}`;
      stats.page++;
      addKey(key, value, `public/${page.file}`, 1, { page: page.route, ...source });
    };
    const title = html.match(/<title>([\s\S]*?)<\/title>/i);
    if (title) push(decodeEntities(title[1]));
    const desc = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
    if (desc) push(decodeEntities(desc[1]));
    // Visible text: headings, paragraphs, list items, links, table cells.
    const body = html.replace(/<head>[\s\S]*?<\/head>/i, "");
    const blocks = [...body.matchAll(/<(h1|h2|h3|p|li|a|td|th|figcaption|summary)[^>]*>([\s\S]*?)<\/\1>/gi)];
    for (const [, , inner] of blocks) {
      const text = decodeEntities(inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
      // Skip nav chrome that duplicates app keys and pure boilerplate.
      if (!text || text.length < 2) continue;
      if (/^(Play|Learn|Games|More|Open Mahjong)$/.test(text)) continue;
      push(text);
    }
  }
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function build() {
  keys.clear();
  uiKeysByValue.clear();
  stats.lesson = 0;
  stats.ui = 0;
  stats.page = 0;
  stats.skippedCode = 0;
  stats.dynamic = 0;

  for (const rel of SOURCE_FILES) {
    extractSourceFile(rel, resolve(WEB, "src", rel));
  }
  extractPracticeCard();
  extractContentPages();

  // Dynamic (template) strings are counted inside addKey extras; recount:
  for (const entry of keys.values()) if (entry.dynamic) stats.dynamic++;

  const sorted = [...keys.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  const namespaces = {};
  for (const [key] of sorted) {
    const ns = key.split(".").slice(0, 2).join(".");
    namespaces[ns] = (namespaces[ns] ?? 0) + 1;
  }
  const out = {
    meta: {
      generatedBy: "scripts/extract-i18n.mjs",
      sourceLocale: "en",
      generatedAt: new Date().toISOString(),
      keyCount: sorted.length,
      namespaces,
      note: "English is the source. Translation memory is keyed by each key's hash: an unchanged string is never re-translated. Keys marked dynamic contain {n} placeholders filled at runtime.",
    },
    keys: Object.fromEntries(sorted),
  };
  return { out, json: JSON.stringify(out, null, 2) + "\n" };
}

const args = process.argv.slice(2);
const check = args.includes("--check");
const reportOnly = args.includes("--report");

const { out, json } = build();

if (reportOnly) {
  console.log(JSON.stringify({ keyCount: out.meta.keyCount, namespaces: out.meta.namespaces, stats }, null, 2));
  process.exit(0);
}

if (check) {
  let current = null;
  try {
    current = readFileSync(OUT, "utf8");
  } catch {
    console.error(`extract-i18n: ${OUT} does not exist — run without --check to generate it.`);
    process.exit(1);
  }
  const currentParsed = JSON.parse(current);
  const freshParsed = JSON.parse(json);
  // generatedAt differs by design; compare keys only.
  if (JSON.stringify(currentParsed.keys) !== JSON.stringify(freshParsed.keys)) {
    const cur = new Set(Object.keys(currentParsed.keys));
    const fresh = new Set(Object.keys(freshParsed.keys));
    const missing = [...fresh].filter((k) => !cur.has(k));
    const extra = [...cur].filter((k) => !fresh.has(k));
    const changed = [...fresh].filter(
      (k) => cur.has(k) && JSON.stringify(currentParsed.keys[k]) !== JSON.stringify(freshParsed.keys[k]),
    );
    console.error("extract-i18n: en.json is stale — regenerate with `node scripts/extract-i18n.mjs`.");
    console.error(`  new keys: ${missing.length}, removed keys: ${extra.length}, changed keys: ${changed.length}`);
    for (const k of [...missing.slice(0, 10), ...extra.slice(0, 10), ...changed.slice(0, 10)]) {
      console.error(`    ${k}`);
    }
    process.exit(1);
  }
  console.log(`extract-i18n: en.json is in sync (${freshParsed.meta.keyCount} keys).`);
  process.exit(0);
}

writeFileSync(OUT, json);
console.log(`extract-i18n: wrote ${OUT} (${out.meta.keyCount} keys).`);
console.log(JSON.stringify({ namespaces: out.meta.namespaces, stats }, null, 2));
