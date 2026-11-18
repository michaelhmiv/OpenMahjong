/**
 * The Practice Card screens (renderings american-card-v1, approved
 * 2026-11-18): the card as one sheet object — a sections sheet with
 * the Practice Card label at its head and foot, a section detail
 * sheet (hands in coloured notation, values, X/C chips,
 * descriptions, the label at the foot), the notation key, and the
 * Print action, which prints the one-page letter layout of frame
 * 07 (label at the page head and foot, the key with the joker rule).
 *
 * Everything renders from the shipped card data
 * (education/american-card.ts); nothing is re-keyed here.
 */
import {
  PRACTICE_CARD,
  PRACTICE_CARD_LABEL,
  cardSections,
  handNotationSpans,
  sectionHands,
  type AmericanHand,
} from "./education/american-card.js";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  className = "",
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.textContent = text;
  n.className = className;
  return n;
}

const CHEV = `<svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>`;

/** The notation key rows under the card (frame 02 wording — the
 * card file's own notationKey, shortened for the screen as the
 * approved rendering shortened it). */
const KEY_ROWS: readonly { k: string; d: string }[] = [
  {
    k: "X",
    d: "Exposures allowed — groups may be shown on your rack as you call them.",
  },
  {
    k: "C",
    d: "Concealed only — the whole hand must be built without calling any tile.",
  },
  { k: "F", d: "A flower. FFF is a pung of flowers." },
  {
    k: "D",
    d: "A dragon of one kind; the kind is named in the hand's description.",
  },
  { k: "N E W S", d: "The four winds." },
  {
    k: "Digits",
    d: "A group of number tiles of that rank: 444 is a pung of 4s. A change of color is a change of suit.",
  },
  {
    k: "Jokers",
    d: "Never printed in a pattern. A joker may stand in only inside a group of three or more — never as a single or in a pair.",
  },
];

function notationEl(hand: AmericanHand, className: string): HTMLElement {
  const wrap = el("span", "", className);
  for (const span of handNotationSpans(hand)) {
    wrap.append(el("span", span.text, `g ${span.ink}`));
  }
  return wrap;
}

function handEl(hand: AmericanHand, first: boolean): HTMLElement {
  const block = el("div", "", first ? "amc-hand first" : "amc-hand");
  const line = el("div", "", "amc-noteline");
  line.append(notationEl(hand, "amc-notation"));
  line.append(el("span", String(hand.value), "amc-val"));
  line.append(
    el("span", hand.exposure, hand.exposure === "C" ? "amc-xc c" : "amc-xc"),
  );
  block.append(line, el("p", hand.description, "amc-desc"));
  if (hand.minJokers > 0) {
    block.append(
      el(
        "p",
        `Needs at least ${hand.minJokers} joker${hand.minJokers === 1 ? "" : "s"}.`,
        "amc-joker",
      ),
    );
  }
  return block;
}

/** The printable card (frame 07): one letter page, all hands in two
 * columns, descriptions omitted as on a printed card, the key and
 * the label on the page. Rendered into a print-only root on
 * document.body; @media print shows it and nothing else. */
export function buildPrintableCard(): HTMLElement {
  const root = el("div", "", "amc-print");
  const page = el("div", "", "p-page");
  page.append(el("p", PRACTICE_CARD_LABEL, "p-label"));
  page.append(el("div", PRACTICE_CARD.title, "p-title"));
  page.append(
    el(
      "p",
      `${PRACTICE_CARD.hands.length} hands in ${PRACTICE_CARD.sections.length} sections. Values are points.`,
      "p-sub",
    ),
  );
  const cols = el("div", "", "p-cols");
  for (const section of cardSections()) {
    const hands = sectionHands(section.id);
    const sec = el("div", "", "p-sec");
    const head = el("div", "", "p-sechead");
    head.append(
      document.createTextNode(section.name),
      el("span", `${hands.length} hands`, "ct"),
    );
    sec.append(head);
    for (const hand of hands) {
      const row = el("div", "", "p-hand");
      row.append(notationEl(hand, "p-notation"));
      row.append(el("span", String(hand.value), "p-val"));
      row.append(el("span", hand.exposure, "p-xc"));
      sec.append(row);
    }
    cols.append(sec);
  }
  page.append(cols);
  const key = el("div", "", "p-key");
  const keyParts: (string | [string])[] = [
    ["X"],
    " exposures allowed · ",
    ["C"],
    " concealed only · ",
    ["F"],
    " flower · ",
    ["D"],
    " a dragon of one kind · ",
    ["N E W S"],
    " the four winds · digits are groups of that rank (444 = a pung of 4s) · a change of color is a change of suit · jokers are never printed: a joker may stand in only inside a group of three or more, never as a single or in a pair · the number after each hand is its value in points.",
  ];
  for (const part of keyParts) {
    key.append(
      Array.isArray(part) ? el("b", part[0]) : document.createTextNode(part),
    );
  }
  page.append(key);
  page.append(el("p", PRACTICE_CARD_LABEL, "p-footlabel"));
  root.append(page);
  return root;
}

export function mountAmericanCard(
  container: HTMLElement,
  options: { onBack: () => void },
): { destroy(): void } {
  let alive = true;
  let sectionId: string | null = null;

  const shell = el("div", "", "learning-shell american-card");
  const header = el("header");
  const back = el("button", "‹");
  back.type = "button";
  back.setAttribute("aria-label", "Back");
  const title = el("h1", "", "amc-title");
  header.append(back, title, el("span", "", "amc-hspacer"));
  const main = el("main", "", "learning-content");
  main.setAttribute("aria-label", "Practice Card");
  shell.append(header, main);
  container.replaceChildren(shell);

  const printRoot = buildPrintableCard();
  document.body.append(printRoot);

  back.addEventListener("click", () => {
    if (sectionId !== null) {
      sectionId = null;
      render();
    } else {
      options.onBack();
    }
  });

  function renderSections(): void {
    title.textContent = "Practice Card";
    const sheet = el("div", "", "amc-sheet");
    sheet.append(el("div", PRACTICE_CARD.title, "amc-cardtitle"));
    sheet.append(el("p", PRACTICE_CARD_LABEL, "amc-label"));
    for (const section of cardSections()) {
      const hands = sectionHands(section.id);
      const row = el("button", "", "amc-sec-row");
      row.type = "button";
      row.append(
        el("span", section.name, "nm"),
        el("span", `${hands.length} hands`, "ct"),
      );
      row.insertAdjacentHTML("beforeend", CHEV);
      row.addEventListener("click", () => {
        sectionId = section.id;
        render();
      });
      sheet.append(row);
    }
    sheet.append(el("p", PRACTICE_CARD_LABEL, "amc-footlabel"));
    main.append(sheet);

    const printRow = el("div", "", "practicerow");
    const printBtn = el("button", "Print the Practice Card", "pillbtn");
    printBtn.type = "button";
    printBtn.addEventListener("click", () => window.print());
    printRow.append(printBtn);
    main.append(printRow);

    main.append(el("h2", "How to read a hand line", "amc-keyhead"));
    for (const row of KEY_ROWS) {
      const keyRow = el("div", "", "amc-keyrow");
      keyRow.append(el("span", row.k, "k"), el("span", row.d, "d"));
      main.append(keyRow);
    }
  }

  function renderSectionDetail(id: string): void {
    const section = cardSections().find((s) => s.id === id);
    if (!section) {
      sectionId = null;
      renderSections();
      return;
    }
    title.textContent = section.name;
    main.append(el("p", section.blurb, "amc-blurb"));
    main.append(
      el(
        "p",
        "In each hand line, a change of color is a change of suit. Which suits you use is your choice.",
        "amc-conv",
      ),
    );
    const sheet = el("div", "", "amc-sheet");
    sectionHands(id).forEach((hand, i) => sheet.append(handEl(hand, i === 0)));
    sheet.append(el("p", PRACTICE_CARD_LABEL, "amc-footlabel"));
    main.append(sheet);
  }

  function render(): void {
    if (!alive) return;
    main.replaceChildren();
    main.scrollTop = 0;
    if (sectionId === null) renderSections();
    else renderSectionDetail(sectionId);
  }

  render();
  return {
    destroy() {
      alive = false;
      printRoot.remove();
      container.replaceChildren();
    },
  };
}
