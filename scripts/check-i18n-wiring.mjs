#!/usr/bin/env node
/**
 * check-i18n-wiring.mjs — the enforcement that let the untranslated
 * screen bodies ship (brief-i18n-v1 rewire, CI layer 3).
 *
 * Fails when a user-facing literal in a RENDER file is rendered without
 * t()/tx()/tForLocale(). Detection is the migration rewriter's logic:
 * for every en.json key sourced in a render file, the literal on that
 * source line whose trimmed value matches must already sit inside a
 * translate call (or be a module-scope record that stores the key and
 * resolves it at the site). The shadow pass catches the second
 * occurrence of a value whose key is sourced at another line in the
 * same file.
 *
 * It composes with the other two gates, in order:
 *   1. `node scripts/extract-i18n.mjs --check` — a NEW literal mints a
 *      new en.json key, so en.json goes stale until regenerated.
 *   2. This check — after regeneration the literal has a key sourced
 *      in its file, so it fails until the literal is wired through
 *      t()/tx() (or the record carries the key and resolves at the
 *      site, as YAKU/ABORTIVE_NAMES/NAMES/TERMS do).
 *   3. `packages/web/test/i18n-derived-keys.test.ts` — derived keys
 *      computed from ids at render time exist in en.json with the
 *      matching English value (t() returns the key id on a miss).
 *
 * What this check does NOT do: it cannot see a literal whose value has
 * no en.json key at all — that is layer 1's job (the extractor mints
 * the key, --check fails, the developer regenerates, and then this
 * check fails until it is wired). It also does not verify that a
 * module-scope record's key is the right one — only that the record's
 * literal matches en.json (layer 1) and that no t() call runs at
 * module scope (the audit in the rewire PR; keep it in CI alongside
 * this script if it is ever promoted).
 *
 * Render files are the UI surfaces: screens, calculators, review,
 * lesson runners, card UI, and the records helpers whose labels reach
 * the screen. Lesson DATA files (education/*-lessons.ts,
 * education/variant-content.ts, education/curriculum.ts,
 * education/mcr-guide.ts, education/practice-card.json) are the
 * extractor's source of truth and are deliberately NOT scanned — their
 * strings resolve at the render sites through derived keys.
 *
 * Usage: node scripts/check-i18n-wiring.mjs (run from the repo root).
 * Exit 0 when nothing is wrappable; exit 1 listing every offending
 * literal with file:line and its value.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "packages", "web", "src");
const en = JSON.parse(
  readFileSync(resolve(SRC, "i18n", "locales", "en.json"), "utf8"),
);

/** UI surfaces: every file whose string literals reach the screen. */
const RENDER_FILES = [
  "app.ts",
  "riichi-calculator-ui.ts",
  "variant-calculator-ui.ts",
  "compact-calc.ts",
  "in-person-ui.ts",
  "in-person-store.ts",
  "review-ui.ts",
  "board-review-ui.ts",
  "variant-table-ui.ts",
  "variant-board-ui.ts",
  "variant-education-ui.ts",
  "american-lesson-ui.ts",
  "tile-info.ts",
  "records.ts",
  "american-card-ui.ts",
  "tutorial.ts",
  "board-review.ts",
  "practice-ui.ts",
  "moment-text.ts",
  "hand-groups.ts",
];

function literalValue(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return node.text;
  if (ts.isTemplateExpression(node)) {
    let out = node.head.text;
    let i = 0;
    for (const span of node.templateSpans)
      out += `{${i++}}${span.literal.text}`;
    return out;
  }
  return null;
}

const isFunctionLike = (n) =>
  ts.isFunctionDeclaration(n) ||
  ts.isMethodDeclaration(n) ||
  ts.isArrowFunction(n) ||
  ts.isFunctionExpression(n) ||
  ts.isConstructorDeclaration(n) ||
  ts.isGetAccessorDeclaration(n) ||
  ts.isSetAccessorDeclaration(n);

let failures = 0;
let ambiguous = 0;

for (const rel of RENDER_FILES) {
  const abs = resolve(SRC, rel);
  const text = readFileSync(abs, "utf8");
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true);
  const keysForFile = Object.entries(en.keys).filter(
    ([, v]) => v.source.file === rel,
  );
  const nodes = [];
  const walk = (node, ancestors) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateExpression(node)
    ) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      const parent = ancestors.length ? ancestors[ancestors.length - 1] : null;
      const inTranslateCall = ancestors.some(
        (a) =>
          ts.isCallExpression(a) &&
          ((ts.isIdentifier(a.expression) &&
            ["t", "tx", "tForLocale"].includes(a.expression.text)) ||
            (ts.isPropertyAccessExpression(a.expression) &&
              ["t", "tx", "tForLocale"].includes(a.expression.name.text))),
      );
      const isPropName =
        (parent && ts.isPropertyAssignment(parent) && parent.name === node) ||
        (parent && ts.isPropertySignature(parent) && parent.name === node) ||
        (parent && ts.isComputedPropertyName(parent));
      // Literals that are NOT runtime display values: type positions,
      // switch-case labels, enum initializers, module specifiers,
      // setAttribute attribute names, className assignments, and
      // classList.* arguments (CSS class names).
      const isTypeLiteral = parent && ts.isLiteralTypeNode(parent);
      const inEnum = ancestors.some((a) => ts.isEnumDeclaration(a));
      const isCaseLabel = parent && ts.isCaseClause(parent);
      const isModuleSpecifier =
        (parent && ts.isImportDeclaration(parent)) ||
        (parent && ts.isExportDeclaration(parent)) ||
        (parent && ts.isImportEqualsDeclaration(parent));
      const isSetAttrName = ancestors.some(
        (a) =>
          ts.isCallExpression(a) &&
          ts.isPropertyAccessExpression(a.expression) &&
          a.expression.name.text === "setAttribute" &&
          a.arguments[0] === node,
      );
      const isClassNameAssign = ancestors.some(
        (a) =>
          ts.isBinaryExpression(a) &&
          (a.operatorToken.kind === ts.SyntaxKind.EqualsToken ||
            a.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken) &&
          ts.isPropertyAccessExpression(a.left) &&
          a.left.name.text === "className",
      );
      const isClassListArg = ancestors.some(
        (a) =>
          ts.isCallExpression(a) &&
          ts.isPropertyAccessExpression(a.expression) &&
          ts.isPropertyAccessExpression(a.expression.expression) &&
          a.expression.expression.name.text === "classList",
      );
      const notAValue =
        isTypeLiteral ||
        inEnum ||
        isCaseLabel ||
        isModuleSpecifier ||
        isSetAttrName ||
        isClassNameAssign ||
        isClassListArg;
      // Module scope = no function-like ancestor: t()/tx() there runs at
      // import time, before initI18n, so it would always render English.
      // Such literals are records that must store the key and resolve it
      // at the site — reported only if the site never resolves them,
      // which the derived-key test and the render verification cover.
      const moduleScope = !ancestors.some(isFunctionLike);
      nodes.push({
        node,
        line: line + 1,
        value: literalValue(node),
        inTranslateCall,
        isPropName,
        moduleScope,
        notAValue,
      });
    }
    ts.forEachChild(node, (c) => walk(c, [...ancestors, node]));
  };
  walk(sf, []);

  const planned = [];
  for (const [key, entry] of keysForFile) {
    const cands = nodes.filter(
      (n) =>
        n.line === entry.source.line &&
        n.value !== null &&
        n.value.trim() === entry.value,
    );
    for (const c of cands) {
      if (c.inTranslateCall || c.isPropName || c.notAValue) continue;
      if (c.moduleScope) continue;
      planned.push({ key, line: c.line, value: c.value });
    }
  }
  // Shadow pass: a literal whose value already has a key sourced at
  // another line in this file is a shadow of that key — it must be
  // wired with the same key. Only when the value maps to exactly one
  // key sourced in this file; an ambiguous value (two keys, same
  // value, same file) needs a human to pick the right one.
  const valueToKeys = new Map();
  for (const [key, entry] of keysForFile) {
    const list = valueToKeys.get(entry.value) ?? [];
    list.push(key);
    valueToKeys.set(entry.value, list);
  }
  const plannedNodes = new Set();
  for (const [key, entry] of keysForFile) {
    const cands = nodes.filter(
      (n) =>
        n.line === entry.source.line &&
        n.value !== null &&
        n.value.trim() === entry.value,
    );
    for (const c of cands) plannedNodes.add(c.node);
  }
  for (const c of nodes) {
    if (c.inTranslateCall || c.isPropName || c.notAValue || c.value === null)
      continue;
    if (plannedNodes.has(c.node)) continue;
    const trimmed = c.value.trim();
    if (!trimmed) continue;
    const keys = valueToKeys.get(trimmed);
    if (!keys) continue;
    if (keys.length !== 1) {
      if (!c.moduleScope) {
        ambiguous++;
        console.log(
          `  AMBIGUOUS ${rel}:${c.line} ${JSON.stringify(trimmed.slice(0, 60))} -> ${keys.join(", ")} (wire it explicitly with tx())`,
        );
      }
      continue;
    }
    if (c.moduleScope) continue;
    planned.push({ key: keys[0], line: c.line, value: c.value });
  }

  if (planned.length > 0) {
    failures += planned.length;
    for (const p of planned) {
      console.log(
        `  UNWIRED ${rel}:${p.line} key ${p.key} value ${JSON.stringify((p.value ?? "").slice(0, 80))}`,
      );
    }
  }
}

if (ambiguous > 0) {
  console.log(
    `check-i18n-wiring: FAIL — ${ambiguous} ambiguous literal(s) need an explicit tx() key`,
  );
  process.exit(1);
}
if (failures > 0) {
  console.log(
    `check-i18n-wiring: FAIL — ${failures} user-facing literal(s) rendered without t()/tx() (wire them, then re-run)`,
  );
  process.exit(1);
}
console.log(
  `check-i18n-wiring: OK — no unwired literals in ${RENDER_FILES.length} render files`,
);
