/* thaum-mono subpage interactivity: ascii weight bar + glyph block.
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

  /* every glyph in the typeface, one dense typegrid block — verbatim chars */
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

  /* ascii weight bar: ┣┼─────┼─────┼─────┼─────┫ with 80/160/320/640 under
     the points — box-drawing chars only, all from the typeface.
     Drag moves the █ along the dashes; releasing snaps to the nearest
     weight point. Keyboard arrows snap directly. */
  /* ascii weight bar: ┣┼─────┼─────┼─────┼─────┫ with 80/160/320/640 under
     the points — box-drawing chars only, all from the typeface.
     click anywhere on the line to jump; drag slides the █ cell by cell
     with the bar's own weight tracking the nearest point live; release
     snaps to the nearest weight. Keyboard arrows snap directly. */
  function buildWeightBar(root, onIndex) {
    if (!root) return null;

    const state = { index: DEFAULT_INDEX, thumb: pointIndex(DEFAULT_INDEX), dragging: false };
    const track = document.createElement("div");
    track.className = "tm-weight-track";

    const cells = [];
    function appendCell(char, kind, weightIndex) {
      const span = document.createElement("span");
      span.textContent = char;
      span.dataset.base = char; /* render() always restores this first */
      if (kind) span.className = kind;
      if (weightIndex !== undefined) span.dataset.idx = String(weightIndex);
      track.append(span);
      cells.push(span);
      return cells.length - 1;
    }

    function pointIndex(weightIndex) {
      return 1 + weightIndex * (SEG + 1);
    }

    function nearestIndex(thumb) {
      return Math.min(WEIGHTS.length - 1, Math.max(0, Math.round((thumb - 1) / (SEG + 1))));
    }

    appendCell("┣", "tm-weight-cap");
    for (let w = 0; w < WEIGHTS.length; w += 1) {
      if (w > 0) for (let d = 0; d < SEG; d += 1) appendCell("─", "tm-weight-dash");
      appendCell("┼", "tm-weight-point", w);
    }
    appendCell("┫", "tm-weight-cap");
    const total = cells.length;

    const labels = document.createElement("div");
    labels.className = "tm-weight-labels";
    const labelLine = [];
    for (let i = 0; i < total; i += 1) labelLine.push(" ");
    WEIGHTS.forEach(([weight], w) => {
      const text = String(weight);
      /* center under the point but never spill onto the ┣/┫ end columns */
      const start = Math.min(
        Math.max(1, pointIndex(w) - Math.floor(text.length / 2)),
        total - 2 - (text.length - 1),
      );
      for (let c = 0; c < text.length; c += 1) labelLine[start + c] = text[c];
    });
    const labelSpan = document.createElement("span");
    labelSpan.textContent = labelLine.join("");
    labels.append(labelSpan);

    /* stateless: every render resets all cells from dataset.base, then
       paints the thumb — no character can ever be left behind */
    function render() {
      cells.forEach((cell, idx) => {
        cell.textContent = cell.dataset.base;
        cell.classList.toggle("is-active", idx === state.thumb);
      });
      cells[state.thumb].textContent = "█";
      const nearest = nearestIndex(state.thumb);
      /* the bar itself renders at the nearest weight — live feedback */
      track.style.fontWeight = String(WEIGHTS[nearest][0]);
      root.setAttribute("aria-valuenow", String(nearest));
      root.setAttribute("aria-valuetext", `W${WEIGHTS[nearest][0]} ${WEIGHTS[nearest][1]}`);
      onIndex(nearest);
    }

    function snapIndex(next) {
      state.index = Math.min(WEIGHTS.length - 1, Math.max(0, next));
      state.thumb = pointIndex(state.index);
      render();
    }

    function thumbFromEvent(event) {
      const rect = track.getBoundingClientRect();
      if (!rect.width) return state.thumb;
      const cellWidth = rect.width / total;
      const raw = Math.round((event.clientX - rect.left - cellWidth / 2) / cellWidth);
      return Math.min(total - 2, Math.max(1, raw));
    }

    function onPointerMove(event) {
      if (!state.dragging) return;
      const next = thumbFromEvent(event);
      if (next !== state.thumb) {
        state.thumb = next;
        render();
      }
    }

    function onPointerUp(event) {
      if (!state.dragging) return;
      state.dragging = false;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      snapIndex(nearestIndex(state.thumb));
    }

    /* whole bar is live, cell included: pointerdown grabs at the pointer
       position (so the █ can be grabbed directly and slid), sliding moves
       the thumb, and release snaps to the nearest weight — a click without
       movement is just a drag that snaps where you pressed */
    root.addEventListener("pointerdown", (event) => {
      state.dragging = true;
      state.thumb = thumbFromEvent(event);
      render();
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      event.preventDefault();
    });

    root.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        snapIndex(state.index - 1);
        event.preventDefault();
      } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        snapIndex(state.index + 1);
        event.preventDefault();
      }
    });

    root.append(track, labels);
    render();
    return { snapIndex };
  }

  function init() {
    const sheet = document.querySelector("[data-tm-sheet]");
    buildSheet(sheet);
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
