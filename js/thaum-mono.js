/* thaum-mono subpage interactivity: ascii weight bar + glyph textbox.
   Loaded after components.js, which builds the slices asynchronously,
   so we wait for the containers.

   Weight is one of the four SET weights (80/160/320/640) — the bar is a
   4-point snap control, not a smooth variable-font morph. Everything is
   driven through the static @font-face weights (family "ThaumMono"). */
(function () {
  "use strict";

  const WEIGHTS = [
    [80, "hairline"],
    [160, "light"],
    [320, "regular"],
    [640, "heavy"],
  ];

  const DEFAULT_INDEX = 1;
  const SEG = 5; /* dashes between weight points on the ascii bar */

  /* every glyph in the typeface, one dense responsive block — verbatim chars */
  const SHEET_TEXT = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789☺☻!#%&$*@^?/\\|+×÷±¬§¶†‡©®™¢£¥€'"\`()[]{}⟦⟧⟨⟩⟪⟫⦇⦈⸨⁅⁆‘’“”⌂⌐⌠⌡αβΓπΣσµτΦΘΩδ∞φε∩≡√ⁿ²∟₧ƒªº¿¡≈✝✞✟✠✚✛✜♁♰♱☥☦☧☨☩☪☢☣⚠☠☤⚕⚚⚗⚘♄☿♃♅♆♇⚳⚴⚵⚶⚷⚸⚹⚺⚻♈♉♊♋♌♍♎♏♐♑♒♓.,:;·•●○…⦸⨀∘∙∴∵∶∷◌◍◎◐◑◒◓◔◕◖◗◘◙◚◛◜◝◞◟◠◡◉⁖⁘⁙⁚⁛⁜⁝⁞․‥‧⁂_-–—=~∼≃≋Ξ≠‹›«»⟵⟶↔↕↜↝↞↠↢↣↤↦⇐⇑⇒⇓⇔⇚⇛⇦⇨←↑→↓►◄↨▲▼☚☛☜☝☞☟✌✍🖐🖑🖒🖓🖔🖕🖖➔➜➝➞➟➠➡➢➣➤➥➦➧➨🔺🔻━┃┏┓┗┛┣┫┳┻╋═║╔╗╚╝╠╣╦╩╬─│┌┐└┘├┤┬┴┼╞╟╡╢╤╥╧╨╪╫┍┎┑┒┕┖┙┚┝┞┟┠┡┢┥┦┧┨┩┪┭┮┯┰┱┲┵┶┷┸┹┺┽┾┿╀╁╂╃╄╅╆╇╈╉╊█▓▒░▁▂▃▄▅▆▇▉▊▋▌▍▎▏▀▐▔▕▘▝▖▗🙼🙽🙾🙿▚▞▙▛▜▟■□▢▣▪▫▤▥▦▧▨▩▬▭▮▯▰▱◰◱◲◳◧◨◩◪◫◻◼◽◾╱╲╳⎺⎻⎼⎽∎◩ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝŸÞŒŠŽŁßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýÿþœšžł♪♫☼★☆✢✣✤✥✦✧✩✪✫✬✭✮✯✰✱✲✳✴✵✶✷✸✹✺✻✼✽✾✿❀❁❂❃❇❈❉❊❋♡❤❥❣❦❧💕💖💗💘💙💚💛🧡💜🖤🤍🤎💝💞💟♢◆◇◈◊⬖⬗⬘⬙❖💎☀☉☽☾🌑🌒🌓🌔🌕🌖🌗🌘🌙🌚🌛🌜☁☂☃☄☇☈☊☋☌☍⛅⛈⛆⛇⛉⛊⛋⛌⛍⛎⚡❄❅❆🌟🌠☎☏✆✉︎🖂🖃🖄🖅🖆📞📟📠📧📨📩📪📫📬📭📮🕿🖁♥♦♣♠♔♕♖♗♘♙♚♛♜♝♞♟♤♧🂠🂡🂢🂣🂤🂥🂦🂧🂨🂩🂪`;

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

  function buildSheet(root) {
    if (!root) return;
    root.textContent = SHEET_TEXT;
  }

  /* ascii weight bar: ◀┼─────┼─────┼─────┼─────▶ with 80/160/320/640 under
     the points — box-drawing chars, same vibes as the portfolio carousels */
  function buildWeightBar(root, onIndex) {
    if (!root) return null;

    const state = { index: DEFAULT_INDEX };
    const track = document.createElement("div");
    track.className = "tm-weight-track";

    const cells = [];
    function appendCell(char, idx, kind) {
      const span = document.createElement("span");
      span.textContent = char;
      if (idx !== null) span.dataset.idx = String(idx);
      if (kind) span.className = kind;
      track.append(span);
      cells.push(span);
    }

    appendCell("◀", null, "tm-weight-arrow");
    const pointIdx = [];
    for (let w = 0; w < WEIGHTS.length; w += 1) {
      if (w > 0) for (let d = 0; d < SEG; d += 1) appendCell("─", null, "tm-weight-dash");
      pointIdx.push(track.childElementCount);
      appendCell("┼", w, "tm-weight-point");
    }
    appendCell("▶", null, "tm-weight-arrow");

    const labels = document.createElement("div");
    labels.className = "tm-weight-labels";
    const labelLine = [];
    for (let i = 0; i < track.childElementCount; i += 1) labelLine.push(" ");
    WEIGHTS.forEach(([weight], w) => {
      const text = String(weight);
      const center = pointIdx[w];
      const start = Math.max(0, center - Math.floor(text.length / 2));
      for (let c = 0; c < text.length; c += 1) labelLine[start + c] = text[c];
    });
    const labelSpan = document.createElement("span");
    labelSpan.textContent = labelLine.join("");
    labels.append(labelSpan);

    function render() {
      cells.forEach((cell, idx) => {
        if (pointIdx.includes(idx)) {
          cell.textContent = pointIdx[state.index] === idx ? "█" : "┼";
          cell.classList.toggle("is-active", pointIdx[state.index] === idx);
        }
      });
      root.setAttribute("aria-valuenow", String(state.index));
      root.setAttribute("aria-valuetext", `W${WEIGHTS[state.index][0]} ${WEIGHTS[state.index][1]}`);
      onIndex(state.index);
    }

    function setIndex(next) {
      state.index = Math.min(WEIGHTS.length - 1, Math.max(0, next));
      render();
    }

    track.addEventListener("click", (event) => {
      const target = event.target.closest("span");
      if (!target) return;
      if (target.classList.contains("tm-weight-arrow")) {
        setIndex(state.index + (target === cells[0] ? -1 : 1));
        return;
      }
      const idx = Number(target.dataset.idx);
      if (!Number.isNaN(idx)) setIndex(idx);
    });

    root.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        setIndex(state.index - 1);
        event.preventDefault();
      } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        setIndex(state.index + 1);
        event.preventDefault();
      }
    });

    root.append(track, labels);
    render();
    return { setIndex };
  }

  function init() {
    buildSheet(document.querySelector("[data-tm-sheet]"));
    const sheet = document.querySelector("[data-tm-sheet]");
    buildWeightBar(document.querySelector("[data-tm-weight-bar]"), (index) => {
      if (!sheet) return;
      sheet.style.fontWeight = String(WEIGHTS[index][0]);
      sheet.style.fontVariationSettings = "";
    });
  }

  function start() {
    waitForAll([".portfolio-slices [data-tm-weight-bar]", "[data-tm-sheet]"], 8000)
      .then(() => init())
      .catch(() => {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
