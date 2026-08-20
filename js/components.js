// Shared header + footer, one source of truth.
const NAV = [
  ["index.html", "j art and design", "j"],
  ["illustration.html", "illustration", "illus."],
  ["design.html", "design", "dsgn."],
  ["development.html", "development", "dev."],
  ["sketchbook.html", "sketchbook", "sktch."],
  ["contact.html", "about", "abt."],
];

const SITE_NAV_BREAKPOINT = "(max-width: 640px)";
let siteHeaderCompact = null;
let siteHeaderResizeHandler = null;

function currentPage() {
  const p = location.pathname.split("/").pop() || "index.html";
  return p;
}

function renderHeader() {
  const el = document.querySelector("header.site");
  if (!el) return;
  const cur = currentPage();
  const compact = window.matchMedia(SITE_NAV_BREAKPOINT).matches;
  siteHeaderCompact = compact;
  el.innerHTML =
    '<div class="tg-shell">' +
    '<nav class="site-nav" aria-label="Primary">' +
    NAV.map(([href, label, shortLabel]) => {
      const active = href === cur;
      const isBrand = href === "index.html";
      const text = compact ? shortLabel : label;
      const idleWeight = active ? (isBrand ? 640 : 320) : 160;
      const hoverWeight = idleWeight >= 640 ? 640 : idleWeight * 2;
      const className = [
        "site-nav-link",
        "site-dissolve",
        isBrand ? "site-nav-brand" : "",
        active ? "active" : "",
      ].filter(Boolean).join(" ");
      return `<a href="${href}" class="${className}" data-weight-idle="${idleWeight}" data-weight-hover="${hoverWeight}" data-weight-press="640" data-weight-inactive="80">${text}</a>`;
    }).join("") +
    "</nav>" +
    "</div>";
}

function renderFooter() {
  const el = document.querySelector("footer.site");
  if (!el) return;
  el.innerHTML = `<div class="tg-shell">&copy; ${new Date().getFullYear()} Jart &amp; Design</div>`;
}

function initHomeVideoBackgrounds() {
  const buttons = [...document.querySelectorAll(".home-btn[data-video]")];
  if (!buttons.length) return { setActiveButton() {} };

  const transitionMs = 1400;
  const videos = new Map();

  buttons.forEach((btn) => {
    const video = document.createElement("video");
    video.src = btn.dataset.video;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.className = "home-bg-video";
    video.style.setProperty("--home-video-fade-ms", `${transitionMs}ms`);
    document.body.appendChild(video);
    videos.set(btn, video);
  });

  const stopVideo = (video) => {
    if (!video) return;
    video.classList.remove("is-playing");
    const token = String(performance.now());
    video.dataset.stopToken = token;
    window.setTimeout(() => {
      if (video.dataset.stopToken !== token) return;
      video.pause();
      video.currentTime = 0;
    }, transitionMs);
  };

  return {
    setActiveButton(button) {
      videos.forEach((video, owner) => {
        if (owner !== button) stopVideo(video);
      });
      if (!button) return;
      const video = videos.get(button);
      if (!video) return;
      delete video.dataset.stopToken;
      video.classList.add("is-playing");
      video.play().catch(() => {});
    },
  };
}

class DissolveTextRenderer {
  constructor(element) {
    this.element = element;
    this.label = element.textContent.replace(/\n$/, "");
    this.lines = this.label.split("\n");
    this.mode = element.dataset.dissolveMode || "char";
    this.palette = [80, 160, 320, 640];
    this.currentWeight = this.weightFromDataset("idle", 160);
    this.fromWeight = this.currentWeight;
    this.toWeight = this.currentWeight;
    this.progress = 1;
    this.animating = false;
    this.startAt = 0;
    this.durationMs = 1400;
    this.colorDurationMs = 220;
    this.seed = Math.random() * 1000;
    this.bandCount = this.mode === "grid" ? 36 : 28;
    this.bandFadeWindow = this.mode === "grid" ? 0.22 : 0.18;
    this.thresholdSpan = this.mode === "grid" ? 0.72 : 0.64;
    this.onsetLead = 0.01;
    this.transitionFrameCount = 6;

    element.textContent = "";
    if (element.matches("a")) {
      element.setAttribute("aria-label", this.label.replace(/\n/g, " "));
    }

    this.text = document.createElement("span");
    this.text.className = "home-dissolve-text";
    this.text.textContent = this.label;

    this.canvas = document.createElement("canvas");
    this.canvas.className = "home-dissolve-canvas";
    this.ctx = this.canvas.getContext("2d");

    element.append(this.text, this.canvas);

    this.layerCanvases = new Map();
    this.layerCtxs = new Map();
    this.currentColor = this.readElementColor();
    this.fromColor = this.currentColor;
    this.toColor = this.currentColor;
    this.colorStartAt = 0;
    this.colorAnimating = false;
    this.resize();
  }

  weightFromDataset(name, fallback) {
    const key = `weight${name[0].toUpperCase()}${name.slice(1)}`;
    return Number(this.element.dataset[key] || fallback);
  }

  resize() {
    const rect = this.element.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.ceil(rect.width * dpr));
    const height = Math.max(1, Math.ceil(rect.height * dpr));
    if (this.canvas.width === width && this.canvas.height === height) return;

    this.canvas.width = width;
    this.canvas.height = height;
    this.layerCanvases = new Map();

    this.renderLayers();
    this.drawFrame(this.currentWeight, this.currentWeight, 1);
  }

  refreshAppearance(nextColor = null) {
    if (!this.canvas.width || !this.canvas.height) return;
    nextColor = nextColor || this.readElementColor();
    if (!this.currentColor || this.colorsEqual(this.currentColor, nextColor)) {
      this.currentColor = nextColor;
      this.fromColor = nextColor;
      this.toColor = nextColor;
      this.colorAnimating = false;
      this.layerCanvases = new Map();
      this.renderLayers();
      if (this.animating) {
        const visibleProgress = Math.min(1, this.progress + this.onsetLead);
        this.drawFrame(this.fromWeight, this.toWeight, visibleProgress);
        return;
      }
      this.drawFrame(this.currentWeight, this.currentWeight, 1);
      return;
    }

    this.fromColor = this.currentColor;
    this.toColor = nextColor;
    this.colorStartAt = performance.now();
    this.colorAnimating = true;
    DissolveTextRenderer.queue(this);
  }

  renderLayers() {
    const style = getComputedStyle(this.element);
    const dpr = window.devicePixelRatio || 1;
    const fontSize = parseFloat(style.fontSize);
    const lineHeight = parseFloat(style.lineHeight) || fontSize;
    const family = style.fontFamily;
    this.metrics = {
      dpr,
      fontSize,
      lineHeight,
      charWidth: fontSize * 0.62,
      maxCols: Math.max(...this.lines.map((line) => line.length), 1),
    };

    for (const weight of this.palette) {
      this.metrics.charWidth = Math.max(this.metrics.charWidth, this.renderWeightLayer(weight, { measureOnly: true }));
    }

    for (const weight of this.palette) {
      this.renderWeightLayer(weight);
    }

    this.buildTransitionCells();
  }

  renderWeightLayer(weight, { measureOnly = false } = {}) {
    const key = Math.round(weight);
    const { dpr, fontSize, lineHeight } = this.metrics;
    const style = getComputedStyle(this.element);
    const family = style.fontFamily;
    const color = this.colorToCss(this.currentColor || this.readElementColor());

    let layer = this.layerCanvases.get(key);
    if (!layer) {
      layer = document.createElement("canvas");
      layer.width = this.canvas.width;
      layer.height = this.canvas.height;
      this.layerCanvases.set(key, layer);
    }

    const ctx = layer.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.scale(dpr, dpr);
    ctx.fillStyle = color;
    ctx.textBaseline = "top";
    ctx.font = `${key} ${fontSize}px ${family}`;
    const charWidth = ctx.measureText("M").width;

    if (!measureOnly) {
      this.lines.forEach((line, index) => {
        ctx.fillText(line, 0, index * lineHeight);
      });
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return charWidth;
  }

  buildTransitionCells() {
    const { dpr, lineHeight, charWidth, maxCols } = this.metrics;
    const cellW = Math.max(1, Math.ceil(charWidth * dpr));
    const cellH = Math.max(1, Math.ceil(lineHeight * dpr));
    const columns = this.mode === "grid"
      ? maxCols
      : Math.max(...this.lines.map((line) => line.length), 1);

    this.transitionCells = [];

    for (let row = 0; row < this.lines.length; row += 1) {
      const line = this.lines[row];
      const rowCols = this.mode === "grid" ? columns : line.length;
      for (let col = 0; col < rowCols; col += 1) {
        const xNorm = columns <= 1 ? 0.5 : col / (columns - 1);
        const yNorm = this.lines.length <= 1 ? 0.5 : row / (this.lines.length - 1);
        const n0 = this.perlin2d(xNorm * 2.3 + this.seed * 0.003, yNorm * 2.1 + 11.0);
        const n1 = this.perlin2d(xNorm * 4.9 + 17.0, yNorm * 4.3 + this.seed * 0.005);
        const n2 = this.perlin2d(xNorm * 9.4 + 29.0, yNorm * 8.7 + 41.0);
        const noise = Math.min(1, Math.max(0, n0 * 0.58 + n1 * 0.29 + n2 * 0.13));
        const bandIndex = Math.round(noise * (this.bandCount - 1));
        const threshold = this.bandCount <= 1 ? 0 : bandIndex / (this.bandCount - 1);
        const x = col * cellW;
        const y = row * cellH;
        const w = Math.min(cellW, this.canvas.width - x);
        const h = Math.min(cellH, this.canvas.height - y);
        if (w <= 0 || h <= 0) continue;
        this.transitionCells.push({ x, y, w, h, threshold });
      }
    }

    if (!this.transitionCells.length) return;

    let minThreshold = Infinity;
    let maxThreshold = -Infinity;
    for (const cell of this.transitionCells) {
      minThreshold = Math.min(minThreshold, cell.threshold);
      maxThreshold = Math.max(maxThreshold, cell.threshold);
    }

    const range = Math.max(0.0001, maxThreshold - minThreshold);
    for (const cell of this.transitionCells) {
      cell.threshold = ((cell.threshold - minThreshold) / range) * this.thresholdSpan;
    }
  }

  setTarget(weight) {
    if (this.toWeight === weight && this.progress < 1) return;
    if (this.currentWeight === weight && this.progress === 1) return;
    this.fromWeight = this.animating ? this.getVisibleWeight() : this.currentWeight;
    this.currentWeight = this.fromWeight;
    this.toWeight = weight;
    this.progress = 0;
    this.startAt = performance.now();
    this.animating = true;
    this.drawFrame(this.fromWeight, this.toWeight, this.onsetLead);
    DissolveTextRenderer.queue(this);
  }

  tick(now) {
    let active = false;

    if (this.colorAnimating) {
      const colorProgress = Math.min(1, (now - this.colorStartAt) / this.colorDurationMs);
      const easedColor = colorProgress * colorProgress * (3 - 2 * colorProgress);
      this.currentColor = this.mixColor(this.fromColor, this.toColor, easedColor);
      this.layerCanvases = new Map();
      this.renderLayers();
      active = colorProgress < 1 || active;
      if (colorProgress >= 1) {
        this.currentColor = this.toColor;
        this.colorAnimating = false;
      }
    }

    if (!this.animating) {
      if (this.colorAnimating) {
        this.drawFrame(this.currentWeight, this.currentWeight, 1);
      }
      return active;
    }

    this.progress = Math.min(1, (now - this.startAt) / this.durationMs);
    const eased = this.progress * this.progress * (3 - 2 * this.progress);
    this.drawFrame(this.fromWeight, this.toWeight, eased);
    if (this.progress >= 1) {
      this.currentWeight = this.toWeight;
      this.animating = false;
      return this.colorAnimating;
    }
    return true;
  }

  drawFrame(fromWeight, toWeight, progress) {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const fromLayer = this.layerCanvases.get(fromWeight);
    const toLayer = this.layerCanvases.get(toWeight);

    ctx.clearRect(0, 0, width, height);
    if (progress <= 0 || fromWeight === toWeight || !this.transitionCells?.length) {
      ctx.drawImage(fromLayer, 0, 0);
      return;
    }

    this.drawSteppedFrame(ctx, fromWeight, toWeight, progress);
  }

  drawSteppedFrame(ctx, fromWeight, toWeight, progress) {
    const frameCount = Math.max(2, this.transitionFrameCount);
    const fadeWindow = this.bandFadeWindow;
    const effectiveProgress = Math.min(1, progress + this.onsetLead);

    for (const cell of this.transitionCells) {
      const localProgress = Math.max(
        0,
        Math.min(1, (effectiveProgress - cell.threshold + fadeWindow * 0.5) / fadeWindow),
      );
      const frameIndex = Math.min(frameCount - 1, Math.floor(localProgress * frameCount));
      const weight = this.resolvePaletteWeight(fromWeight, toWeight, frameIndex, frameCount);
      let layer = this.layerCanvases.get(weight);
      if (!layer) {
        this.renderWeightLayer(weight);
        layer = this.layerCanvases.get(weight);
      }
      ctx.drawImage(layer, cell.x, cell.y, cell.w, cell.h, cell.x, cell.y, cell.w, cell.h);
    }

    ctx.globalAlpha = 1;
  }

  getVisibleWeight() {
    const frameCount = Math.max(2, this.transitionFrameCount);
    const eased = this.progress * this.progress * (3 - 2 * this.progress);
    const visibleProgress = Math.min(1, eased + this.onsetLead);
    const frameIndex = Math.min(frameCount - 1, Math.floor(visibleProgress * frameCount));
    return this.resolvePaletteWeight(this.fromWeight, this.toWeight, frameIndex, frameCount);
  }

  readElementColor() {
    return this.parseColor(getComputedStyle(this.element).color);
  }

  parseColor(color) {
    const value = String(color).trim();
    if (value.startsWith("#")) {
      const hex = value.slice(1);
      if (hex.length === 3) {
        return {
          r: Number.parseInt(hex[0] + hex[0], 16),
          g: Number.parseInt(hex[1] + hex[1], 16),
          b: Number.parseInt(hex[2] + hex[2], 16),
          a: 1,
        };
      }
      if (hex.length === 6) {
        return {
          r: Number.parseInt(hex.slice(0, 2), 16),
          g: Number.parseInt(hex.slice(2, 4), 16),
          b: Number.parseInt(hex.slice(4, 6), 16),
          a: 1,
        };
      }
    }

    const match = value.match(/rgba?\(([^)]+)\)/i);
    if (!match) return { r: 255, g: 255, b: 255, a: 1 };
    const [r, g, b, a = 1] = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
    return { r, g, b, a };
  }

  colorToCss(color) {
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
  }

  colorsEqual(a, b) {
    return a && b && a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
  }

  mixColor(from, to, t) {
    const mix = (start, end) => start + (end - start) * t;
    return {
      r: mix(from.r, to.r),
      g: mix(from.g, to.g),
      b: mix(from.b, to.b),
      a: mix(from.a, to.a),
    };
  }

  resolvePaletteWeight(fromWeight, toWeight, frameIndex, frameCount) {
    const minWeight = Math.min(fromWeight, toWeight);
    const maxWeight = Math.max(fromWeight, toWeight);
    const direction = fromWeight <= toWeight ? 1 : -1;
    const available = this.palette.filter((weight) => weight >= minWeight && weight <= maxWeight);
    const ordered = direction > 0 ? available : [...available].reverse();
    const usable = ordered.length ? ordered : [fromWeight, toWeight];
    const stepProgress = frameCount <= 1 ? 1 : frameIndex / (frameCount - 1);
    const stepIndex = Math.min(usable.length - 1, Math.round(stepProgress * (usable.length - 1)));
    return usable[stepIndex];
  }

  hash1(x) {
    const n = Math.sin((x + this.seed) * 127.1) * 43758.5453123;
    return n - Math.floor(n);
  }

  grad1(i, seed) {
    return this.hash1(i * 1.17 + seed * 19.31) * 2 - 1;
  }

  fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  smoothstep(min, max, value) {
    if (min === max) return value >= max ? 1 : 0;
    const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return t * t * (3 - 2 * t);
  }

  perlin1d(x, seed) {
    const i0 = Math.floor(x);
    const i1 = i0 + 1;
    const t = x - i0;
    const g0 = this.grad1(i0, seed);
    const g1 = this.grad1(i1, seed);
    const v0 = g0 * t;
    const v1 = g1 * (t - 1);
    const u = this.fade(t);
    const value = v0 + (v1 - v0) * u;
    return value * 0.5 + 0.5;
  }

  grad2(ix, iy) {
    const angle = this.hash1(ix * 37.0 + iy * 57.0 + this.seed * 0.01) * Math.PI * 2;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  }

  dotGridGradient(ix, iy, x, y) {
    const gradient = this.grad2(ix, iy);
    const dx = x - ix;
    const dy = y - iy;
    return dx * gradient.x + dy * gradient.y;
  }

  perlin2d(x, y) {
    const x0 = Math.floor(x);
    const x1 = x0 + 1;
    const y0 = Math.floor(y);
    const y1 = y0 + 1;
    const sx = this.fade(x - x0);
    const sy = this.fade(y - y0);

    const n0 = this.dotGridGradient(x0, y0, x, y);
    const n1 = this.dotGridGradient(x1, y0, x, y);
    const ix0 = n0 + (n1 - n0) * sx;

    const n2 = this.dotGridGradient(x0, y1, x, y);
    const n3 = this.dotGridGradient(x1, y1, x, y);
    const ix1 = n2 + (n3 - n2) * sx;

    return (ix0 + (ix1 - ix0) * sy) * 0.5 + 0.5;
  }

  static queue(instance) {
    DissolveTextRenderer.instances.add(instance);
    if (DissolveTextRenderer.frame) return;
    const step = (now) => {
      let active = false;
      for (const item of DissolveTextRenderer.instances) {
        active = item.tick(now) || active;
      }
      if (active) {
        DissolveTextRenderer.frame = requestAnimationFrame(step);
      } else {
        DissolveTextRenderer.frame = null;
      }
    };
    DissolveTextRenderer.frame = requestAnimationFrame(step);
  }
}

DissolveTextRenderer.instances = new Set();
DissolveTextRenderer.frame = null;

function initSiteHeaderStates() {
  const header = document.querySelector("header.site");
  const links = [...document.querySelectorAll(".site-nav-link")];
  const dissolveEls = [...document.querySelectorAll(".site-dissolve")];
  if (!header || !links.length || !dissolveEls.length) return;

  const syncClasses = (active) => {
    header.classList.toggle("is-hovering", Boolean(active));
    links.forEach((link) => link.classList.toggle("is-hovered", link === active));
  };

  const resolveLinkColor = (link, hoveredLink) => {
    if (!hoveredLink) {
      return link.classList.contains("active") ? "#E36325" : "#C4702B";
    }
    if (link === hoveredLink) return "#120A1A";
    return link.classList.contains("active") ? "#C4702B" : "#AC9D7C";
  };

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    let active = null;
    const sync = () => {
      syncClasses(active);
      links.forEach((link) => {
        const idle = link.classList.contains("active")
          ? (link.classList.contains("site-nav-brand") ? 640 : 320)
          : (link.classList.contains("site-nav-brand") ? 320 : 160);
        const weight = !active
          ? idle
          : link === active
            ? Number(link.dataset.weightHover || idle)
            : Number(link.dataset.weightInactive || 80);
        link.style.fontWeight = String(weight);
      });
    };
    links.forEach((link) => {
      link.addEventListener("pointerenter", () => { active = link; sync(); });
      link.addEventListener("pointerleave", () => { if (active === link) active = null; sync(); });
      link.addEventListener("focus", () => { active = link; sync(); });
      link.addEventListener("blur", () => { if (active === link) active = null; sync(); });
    });
    sync();
    return;
  }

  const renderers = new Map(dissolveEls.map((el) => [el, new DissolveTextRenderer(el)]));
  let active = null;

  const sync = () => {
    syncClasses(active);
    links.forEach((link) => {
      const renderer = renderers.get(link);
      if (!renderer) return;
      renderer.refreshAppearance(renderer.parseColor(resolveLinkColor(link, active)));
    });
    links.forEach((link) => {
      const renderer = renderers.get(link);
      if (!renderer) return;
      let target;
      if (!active) {
        target = renderer.weightFromDataset("idle", renderer.currentWeight);
      } else if (link === active) {
        target = renderer.weightFromDataset("hover", renderer.currentWeight);
      } else {
        target = renderer.weightFromDataset("inactive", renderer.currentWeight);
      }
      renderer.setTarget(target);
    });
  };

  links.forEach((link) => {
    link.addEventListener("pointerenter", () => { active = link; sync(); });
    link.addEventListener("pointerleave", () => { if (active === link) active = null; sync(); });
    link.addEventListener("pointerdown", () => { active = link; sync(); });
    link.addEventListener("focus", () => { active = link; sync(); });
    link.addEventListener("blur", () => { if (active === link) active = null; sync(); });
  });

  if (siteHeaderResizeHandler) {
    window.removeEventListener("resize", siteHeaderResizeHandler);
  }
  siteHeaderResizeHandler = () => {
    const compact = window.matchMedia(SITE_NAV_BREAKPOINT).matches;
    if (compact !== siteHeaderCompact) {
      renderHeader();
      initSiteHeaderStates();
      return;
    }
    renderers.forEach((renderer) => renderer.resize());
  };
  window.addEventListener("resize", siteHeaderResizeHandler);
  document.fonts?.ready?.then(() => renderers.forEach((renderer) => renderer.resize()));

  sync();
}

function initHomeStates() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const home = document.querySelector(".home");
    const buttons = [...document.querySelectorAll(".home-btn")];
    if (!home || !buttons.length) return;
    let active = null;
    let pressed = false;
    const sync = () => {
      home.dataset.homeState = active ? (pressed ? "press" : "hover") : "idle";
      buttons.forEach((button) => button.classList.toggle("is-active", button === active));
    };
    buttons.forEach((button) => {
      button.addEventListener("pointerenter", () => { active = button; pressed = false; sync(); });
      button.addEventListener("pointerleave", () => { if (active === button) active = null; pressed = false; sync(); });
      button.addEventListener("pointerdown", () => { active = button; pressed = true; sync(); });
      button.addEventListener("pointerup", () => { if (active === button) pressed = false; sync(); });
      button.addEventListener("focus", () => { active = button; pressed = false; sync(); });
      button.addEventListener("blur", () => { if (active === button) active = null; pressed = false; sync(); });
    });
    sync();
    return;
  }

  const home = document.querySelector(".home");
  const buttonEls = [...document.querySelectorAll(".home-btn")];
  const buttonGroup = document.querySelector(".home-buttons");
  const dissolveEls = [...document.querySelectorAll(".home-dissolve")];
  if (!home || !buttonGroup || !buttonEls.length || !dissolveEls.length) return;

  const videoState = initHomeVideoBackgrounds();
  const renderers = new Map(dissolveEls.map((el) => [el, new DissolveTextRenderer(el)]));

  let active = null;
  let pressed = false;

  const sync = () => {
    const state = !active ? "idle" : pressed ? "press" : "hover";
    home.dataset.homeState = state;

    buttonEls.forEach((button) => button.classList.toggle("is-active", button === active));
    videoState.setActiveButton(active);

    renderers.forEach((renderer, element) => {
      let target;
      if (element.classList.contains("home-btn") && active && element !== active) {
        target = renderer.weightFromDataset("inactive", renderer.weightFromDataset(state, 80));
      } else {
        target = renderer.weightFromDataset(state, renderer.currentWeight);
      }
      renderer.setTarget(target);
    });
  };

  const clearPress = () => {
    if (!pressed) return;
    pressed = false;
    sync();
  };

  const resolveButtonFromEvent = (event) => event.target.closest?.(".home-btn") || null;

  buttonGroup.addEventListener("pointermove", (event) => {
    const next = resolveButtonFromEvent(event);
    if (next === active) return;
    active = next;
    sync();
  });

  buttonGroup.addEventListener("pointerleave", () => {
    active = null;
    pressed = false;
    sync();
  });

  buttonGroup.addEventListener("pointerdown", (event) => {
    const next = resolveButtonFromEvent(event);
    if (!next) return;
    active = next;
    pressed = true;
    sync();
  });

  buttonGroup.addEventListener("pointerup", (event) => {
    const next = resolveButtonFromEvent(event);
    active = next;
    pressed = false;
    sync();
  });

  buttonEls.forEach((button) => {
    button.addEventListener("pointerenter", () => {
      active = button;
      pressed = false;
      sync();
    });
    button.addEventListener("pointerleave", () => {
      if (active !== button) return;
      active = null;
      pressed = false;
      sync();
    });
    button.addEventListener("focus", () => {
      active = button;
      pressed = false;
      sync();
    });
    button.addEventListener("blur", () => {
      if (document.activeElement && document.activeElement.closest?.(".home-btn")) return;
      if (active === button) active = null;
      pressed = false;
      sync();
    });
  });

  window.addEventListener("pointerup", clearPress);
  window.addEventListener("resize", () => renderers.forEach((renderer) => renderer.resize()));
  document.fonts?.ready?.then(() => renderers.forEach((renderer) => renderer.resize()));

  sync();
}

document.addEventListener("DOMContentLoaded", () => {
  renderHeader();
  renderFooter();
  initSiteHeaderStates();
  initHomeStates();
});
