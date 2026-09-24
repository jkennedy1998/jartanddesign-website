/* thaum-mono subpage interactivity: snapping weight slider + glyph textbox.
   Loaded after components.js, which builds the slices asynchronously,
   so we wait for the containers.

   Weight is one of the four SET weights (80/160/320/640) — the slider is
   a 4-point snap control, not a smooth variable-font morph. Everything is
   driven through the static @font-face weights (family "ThaumMono"). */
(function () {
  "use strict";

  const WEIGHTS = [
    [80, "hairline"],
    [160, "light"],
    [320, "regular"],
    [640, "heavy"],
  ];

  /* every glyph in the typeface, one big textbox — verbatim from the atlas */
  const SHEET_TEXT = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789☺☻
!#%&$*@^?/\\|+×÷±¬§¶†‡©®™¢£¥€'"\`()[]{}⟦⟧⟨⟩⟪⟫⦇⦈⸨⁅⁆‘’“”⌂⌐⌠⌡αβΓπΣσµτΦΘΩδ∞φε∩≡√ⁿ²∟₧ƒªº¿¡≈✝✞✟✠✚✛✜♁♰♱☥☦☧☨☩☪☢☣⚠☠☤⚕⚚⚗⚘♄☿♃♅♆♇⚳⚴⚵⚶⚷⚸⚹⚺⚻♈♉♊♋♌♍♎♏♐♑♒♓
.,:;·•●○…⦸⨀∘∙∴∵∶∷◌◍◎◐◑◒◓◔◕◖◗◘◙◚◛◜◝◞◟◠◡◉⁖⁘⁙⁚⁛⁜⁝⁞․‥‧⁂_-–—=~∼≃≋Ξ≠‹›«»⟵⟶↔↕↜↝↞↠↢↣↤↦⇐⇑⇒⇓⇔⇚⇛⇦⇨←↑→↓►◄↨▲▼☚☛☜☝☞☟✌✍🖐🖑🖒🖓🖔🖕🖖➔➜➝➞➟➠➡➢➣➤➥➦➧➨🔺🔻━┃┏┓┗┛┣┫┳┻╋═║╔╗╚╝╠╣╦╩╬─│┌┐└┘├┤┬┴┼╞╟╡╢╤╥╧╨╪╫┍┎┑┒┕┖┙┚┝┞┟┠┡┢┥┦┧┨┩┪┭┮┯┰┱┲┵┶┷┸┹┺┽┾┿╀╁╂╃╄╅╆╇╈╉╊█▓▒░▁▂▃▄▅▆▇▉▊▋▌▍▎▏▀▐▔▕▘▝▖▗🙼🙽🙾🙿▚▞▙▛▜▟■□▢▣▪▫▤▥▦▧▨▩▬▭▮▯▰▱◰◱◲◳◧◨◩◪◫◻◼◽◾╱╲╳⎺⎻⎼⎽∎◩ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝŸÞŒŠŽŁßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýÿþœšžł♪♫☼★☆✢✣✤✥✦✧✩✪✫✬✭✮✯✰✱✲✳✴✵✶✷✸✹✺✻✼✽✾✿❀❁❂❃❇❈❉❊❋♡❤❥❣❦❧💕💖💗💘💙💚💛🧡💜🖤🤍🤎💝💞💟♢◆◇◈◊⬖⬗⬘⬙❖💎☀☉☽☾🌑🌒🌓🌔🌕🌖🌗🌘🌙🌚🌛🌜☁☂☃☄☇☈☊☋☌☍⛅⛈⛆⛇⛉⛊⛋⛌⛍⛎⚡❄❅❆🌟🌠☎☏✆✉︎🖂🖃🖄🖅🖆📞📟📠📧📨📩📪📫📬📭📮🕿🖁♥♦♣♠♔♕♖♗♘♙♚♛♜♝♞♟♤♧🂠🂡🂢🂣🂤🂥🂦🂧🂨🂩🂪`;

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
    WEIGHTS.forEach(([weight, name]) => {
      const span = document.createElement("span");
      span.dataset.w = String(weight);
      span.style.fontWeight = String(weight);
      span.textContent = `W${weight} ${name} — the quick brown fox 0123456789`;
      fragment.append(span, document.createElement("br"));
    });
    root.replaceChildren(fragment);
  }

  function buildSheet(root) {
    if (!root) return;
    root.textContent = SHEET_TEXT;
  }

  function initWeightSnap(echo, weightInput, weightOut) {
    if (!weightInput) return;
    const ticks = [...document.querySelectorAll("[data-tm-tick]")];
    const targets = [echo, ...document.querySelectorAll(".tm-morph-sheet, .tm-morph-sheet .tm-char")];

    const apply = () => {
      const index = Math.min(WEIGHTS.length - 1, Math.max(0, Number(weightInput.value) | 0));
      const [weight, name] = WEIGHTS[index];
      targets.forEach((node) => {
        if (!node) return;
        node.style.fontWeight = String(weight);
        node.style.fontVariationSettings = "";
      });
      ticks.forEach((tick) => {
        tick.classList.toggle("is-active", Number(tick.dataset.w) === weight);
      });
      if (weightOut) weightOut.textContent = `W${weight} · ${name}`;
    };

    weightInput.addEventListener("input", apply);
    apply();
  }

  function init() {
    buildWeightsRow(document.querySelector("[data-tm-weights-row]"));
    buildSheet(document.querySelector("[data-tm-sheet]"));
    initWeightSnap(
      document.querySelector("[data-tm-echo]"),
      document.querySelector("[data-tm-weight]"),
      document.querySelector("[data-tm-weight-out]"),
    );
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
