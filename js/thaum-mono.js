/* thaum-mono subpage interactivity: weight rider and glyph sheet.
   Loaded after components.js, which builds the slices asynchronously,
   so we wait for the containers. */
(function () {
  "use strict";

  const SHEET_GROUPS = [
    ["ascii", "abcdefghijklmnopqrstuvwxyz 0123456789 ?!#%&$*@"],
    ["borders light", "─│┌┐└┘├┤┬┴┼╞╟╡╢╤╥╧╨╪╫"],
    ["borders heavy", "━┃┏┓┗┛┣┫┳┻╋═║╔╗╚╝╠╣╦╩╬"],
    ["blocks", "█▓▒░▁▂▃▄▅▆▇▉▊▋▌▍▎▏▀▐"],
    ["arrows", "←↑→↓↔↕⇐⇑⇒⇓⇔►◄▲▼"],
    ["dots", "·•●○◌◍◎◉◐◑◒◓◔◕"],
    ["dashes", "_-–—=~≠"],
    ["ornaments", "♪♫★☆✦✧✩✪✫✬✭✮✯❀❁♡❤♢◆◇◈❖"],
    ["faces", "☺☻"],
    ["games", "♠♡♢♣♔♕♖♗♘♙♚♛♜♝♞♟"],
  ];

  const SHEET_PER_ROW = 24;

  function waitForAll(selectors, timeoutMs) {
    const started = performance.now();
    return new Promise((resolve) => {
      const probe = () => {
        const nodes = selectors.map((selector) => document.querySelector(selector));
        if (nodes.every(Boolean)) return resolve(nodes);
        if (timeoutMs && performance.now() - started > timeoutMs) return resolve(nodes);
        requestAnimationFrame(probe);
      };
      probe();
    });
  }

  function buildWeightsRow(root) {
    if (!root) return;
    const fragment = document.createDocumentFragment();
    [[80, "W80"], [160, "W160"], [320, "W320"], [640, "W640"]].forEach(([weight, label]) => {
      const span = document.createElement("span");
      span.dataset.w = String(weight);
      span.style.fontWeight = String(weight);
      span.textContent = `${weight} — the quick brown fox 0123456789`;
      fragment.append(span, document.createElement("br"));
    });
    root.replaceChildren(fragment);
  }

  function buildSheet(root) {
    if (!root) return;
    SHEET_GROUPS.forEach(([label, chars]) => {
      const group = document.createElement("div");
      group.className = "tm-sheet-group";

      const labelNode = document.createElement("span");
      labelNode.className = "tm-sheet-label";
      labelNode.textContent = label;
      group.append(labelNode);

      const cells = [...chars].filter((char) => char !== " ");
      for (let start = 0; start < cells.length; start += SHEET_PER_ROW) {
        const row = document.createElement("div");
        row.className = "tm-sheet-row";
        cells.slice(start, start + SHEET_PER_ROW).forEach((char) => {
          const span = document.createElement("span");
          span.className = "tm-char";
          span.textContent = char;
          row.append(span);
        });
        group.append(row);
      }
      root.append(group);
    });
  }

  function initTester(echo, weightInput, weightOut) {
    if (!echo || !weightInput) return;
    const apply = () => {
      const weight = Number(weightInput.value);
      echo.style.fontVariationSettings = `'wght' ${weight}`;
      if (weightOut) weightOut.textContent = String(weight);
    };
    weightInput.addEventListener("input", apply);
    apply();
  }

  function init() {
    buildWeightsRow(document.querySelector("[data-tm-weights-row]"));
    initTester(
      document.querySelector("[data-tm-echo]"),
      document.querySelector("[data-tm-weight]"),
      document.querySelector("[data-tm-weight-out]"),
    );
    buildSheet(document.querySelector("[data-tm-sheet]"));
  }

  function start() {
    waitForAll([".portfolio-slices [data-tm-echo]", "[data-tm-sheet]"], 8000)
      .then(() => init())
      .catch(() => {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
