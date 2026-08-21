// Shared header + footer, one source of truth.
const NAV = [
  ["index.html", "j art and design", "j"],
  ["illustration.html", "illustration", "illus."],
  ["design.html", "design", "dsgn."],
  ["development.html", "development", "dev."],
  ["sketchbook.html", "sketchbook", "sktch."],
  ["contact.html", "about", "abt."],
];

const SITE_NAV_BREAKPOINT = "(max-width: 860px)";
const FOOTER_CTA_WORDS = ["talk.", "design.", "make art.", "collaborate.", "create.", "develop."];
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
  const [brand, ...items] = NAV;
  const renderLink = ([href, label, shortLabel], isBrand = false) => {
    const active = href === cur;
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
  };
  el.innerHTML =
    '<div class="tg-shell">' +
    '<div class="site-nav-shell">' +
    renderLink(brand, true) +
    '<nav class="site-nav" aria-label="Primary">' +
    items.map((item) => renderLink(item)).join("") +
    "</nav>" +
    "</div>" +
    "</div>";
}

function renderFooter() {
  const el = document.querySelector("footer.site");
  if (!el) return;
  el.innerHTML =
    '<div class="tg-shell">' +
    '<div class="site-footer-shell">' +
    '<div class="site-footer-sentence">' +
    '<p class="site-footer-copy">you made it this far, let\'s</p>' +
    '<span class="site-footer-gap" aria-hidden="true"> </span>' +
    `<a href="contact.html" class="site-footer-cta site-dissolve" data-weight-idle="80" data-weight-hover="160" data-weight-press="320">${FOOTER_CTA_WORDS[0]}</a>` +
    '<span class="site-footer-cta-measure" aria-hidden="true">develop.</span>' +
    '</div>' +
    '</div>' +
    '</div>';
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

  setLabel(label) {
    this.label = String(label).replace(/\n$/, "");
    this.lines = this.label.split("\n");
    if (this.element.matches("a")) {
      this.element.setAttribute("aria-label", this.label.replace(/\n/g, " "));
    }
    this.text.textContent = this.label;
    this.layerCanvases = new Map();
    this.resize();
    this.renderLayers();
    if (this.animating) {
      const visibleProgress = Math.min(1, this.progress + this.onsetLead);
      this.drawFrame(this.fromWeight, this.toWeight, visibleProgress);
      return;
    }
    this.drawFrame(this.currentWeight, this.currentWeight, 1);
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

function easeOutQuint(t) {
  return 1 - ((1 - t) ** 5);
}

function measureCharsPerLine(element, reserveCh = 0, maxChars = Infinity) {
  const style = getComputedStyle(element);
  const fontSize = Number.parseFloat(style.fontSize) || 16;
  const family = style.fontFamily || 'monospace';
  const canvas = measureCharsPerLine.canvas || (measureCharsPerLine.canvas = document.createElement("canvas"));
  const ctx = canvas.getContext("2d");
  ctx.font = `${style.fontWeight || 160} ${fontSize}px ${family}`;
  const charWidth = Math.max(1, ctx.measureText("M").width);
  const available = Math.max(1, element.clientWidth - (reserveCh * charWidth));
  return Math.max(1, Math.min(maxChars, Math.floor(available / charWidth)));
}

function resolveSliceAppearance(slice, isActive) {
  const read = (name) => slice.style.getPropertyValue(name).trim();
  return isActive
    ? {
        background: read("--slice-bg-current"),
        title: read("--slice-title-color-active"),
        subtitle: read("--slice-subtitle-color-active"),
        button: read("--slice-button-color-active"),
        desc: read("--slice-desc-color-active"),
      }
    : {
        background: read("--slice-bg-inactive"),
        title: read("--slice-title-color-inactive"),
        subtitle: read("--slice-subtitle-color-inactive"),
        button: read("--slice-button-color-inactive"),
        desc: read("--slice-desc-color-inactive"),
      };
}

function mixHexColors(base, target, amount = 0.5) {
  const parse = (value) => {
    const hex = String(value || "").trim().replace(/^#/, "");
    const normalized = hex.length === 3
      ? hex.split("").map((char) => char + char).join("")
      : hex;
    if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
    return {
      r: Number.parseInt(normalized.slice(0, 2), 16),
      g: Number.parseInt(normalized.slice(2, 4), 16),
      b: Number.parseInt(normalized.slice(4, 6), 16),
    };
  };
  const rgbToHex = ({ r, g, b }) => `#${[r, g, b].map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0")).join("")}`;
  const from = parse(base);
  const to = parse(target);
  if (!from || !to) return base;
  const mix = Math.max(0, Math.min(1, amount));
  return rgbToHex({
    r: from.r + ((to.r - from.r) * mix),
    g: from.g + ((to.g - from.g) * mix),
    b: from.b + ((to.b - from.b) * mix),
  });
}

function buildSlicePalette(colors, tone) {
  const currentBackgroundColor = colors.backgroundColor || "#222";
  const currentTitleColor = colors.titleColor || colors.textColor || "#FEFFE5";
  const currentSubtitleColor = colors.subtitleColor || colors.textColor || "#FEFFE5";
  const currentButtonColor = colors.buttonColor || colors.textColor || "#FEFFE5";
  const currentDescColor = colors.descColor || colors.textColor || "#FEFFE5";
  const inactive = tone === "dark"
    ? {
        background: mixHexColors(currentBackgroundColor, "#16110E", 0.7),
        title: mixHexColors(currentTitleColor, "#C4702B", 0.52),
        subtitle: mixHexColors(currentSubtitleColor, "#A8561A", 0.58),
        button: mixHexColors(currentButtonColor, "#894835", 0.62),
        desc: mixHexColors(currentDescColor, "#894835", 0.62),
        overlay: mixHexColors(currentBackgroundColor, "#16110E", 0.82),
      }
    : {
        background: mixHexColors(currentBackgroundColor, "#FEFFE5", 0.78),
        title: mixHexColors(currentTitleColor, "#C4702B", 0.46),
        subtitle: mixHexColors(currentSubtitleColor, "#AC9D7C", 0.52),
        button: mixHexColors(currentButtonColor, "#C5B5A8", 0.58),
        desc: mixHexColors(currentDescColor, "#C5B5A8", 0.58),
        overlay: mixHexColors(currentBackgroundColor, "#FEFFE5", 0.88),
      };

  return {
    currentBackgroundColor,
    currentTitleColor,
    currentSubtitleColor,
    currentButtonColor,
    currentDescColor,
    inactive,
  };
}

function applySlicePalette(section, colors, tone) {
  const palette = buildSlicePalette(colors, tone);
  section.style.setProperty("--slice-bg-current", palette.currentBackgroundColor);
  section.style.setProperty("--slice-bg-inactive", palette.inactive.background);
  section.style.setProperty("--slice-overlay-color", palette.inactive.overlay);
  section.style.setProperty("--slice-title-color-active", palette.currentTitleColor);
  section.style.setProperty("--slice-subtitle-color-active", palette.currentSubtitleColor);
  section.style.setProperty("--slice-button-color-active", palette.currentButtonColor);
  section.style.setProperty("--slice-desc-color-active", palette.currentDescColor);
  section.style.setProperty("--slice-title-color-inactive", palette.inactive.title);
  section.style.setProperty("--slice-subtitle-color-inactive", palette.inactive.subtitle);
  section.style.setProperty("--slice-button-color-inactive", palette.inactive.button);
  section.style.setProperty("--slice-desc-color-inactive", palette.inactive.desc);

  const isActive = section.classList.contains("is-active");
  section.style.setProperty("--slice-background", isActive ? palette.currentBackgroundColor : palette.inactive.background);
  section.style.setProperty("--slice-title-color", isActive ? palette.currentTitleColor : palette.inactive.title);
  section.style.setProperty("--slice-subtitle-color", isActive ? palette.currentSubtitleColor : palette.inactive.subtitle);
  section.style.setProperty("--slice-button-color", isActive ? palette.currentButtonColor : palette.inactive.button);
  section.style.setProperty("--slice-desc-color", isActive ? palette.currentDescColor : palette.inactive.desc);
}

function buildPortfolioSlice(slice, index) {
  const section = document.createElement("section");
  section.className = "portfolio-slice";
  section.dataset.sliceIndex = String(index);

  const tone = slice.tone === "dark" ? "dark" : "light";
  section.dataset.sliceTone = tone;
  applySlicePalette(section, slice, tone);

  const inner = document.createElement("div");
  inner.className = "portfolio-slice-inner";
  section.append(inner);

  const setRenderedLabel = (element, label) => {
    if (element.__dissolveRenderer) element.__dissolveRenderer.setLabel(label);
    else element.textContent = label;
  };

  const title = document.createElement("p");
  title.className = "portfolio-slice-title home-dissolve portfolio-dissolve";
  title.dataset.weightIdle = "160";
  title.dataset.weightHover = "320";
  title.textContent = slice.title || "";

  const subtitle = document.createElement("p");
  subtitle.className = "portfolio-slice-subtitle home-dissolve portfolio-dissolve";
  subtitle.dataset.weightIdle = "80";
  subtitle.dataset.weightHover = "160";
  subtitle.textContent = slice.subtitle || "";

  const descriptionRow = document.createElement("div");
  descriptionRow.className = "portfolio-slice-description-row";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "portfolio-slice-toggle home-dissolve portfolio-dissolve portfolio-dissolve-button";
  toggle.dataset.weightIdle = "80";
  toggle.dataset.weightHover = "160";
  toggle.dataset.weightPress = "320";
  toggle.textContent = "▧▩▨  ";
  toggle.setAttribute("aria-expanded", "false");

  const preview = document.createElement("p");
  preview.className = "portfolio-slice-description portfolio-slice-description-preview home-dissolve portfolio-dissolve";
  preview.dataset.weightIdle = "80";
  preview.dataset.weightHover = "160";

  const extra = document.createElement("p");
  extra.className = "portfolio-slice-description portfolio-slice-description-extra";

  const descriptionState = {
    text: slice.description || "",
    firstLine: "",
    remainder: "",
    frame: null,
    previewBuffer: 6,
    charMs: 22,
  };

  const buildDescriptionLayout = () => {
    const charsPerLine = measureCharsPerLine(descriptionRow, 5, 44);
    const authoredLines = descriptionState.text.replace(/\r\n?/g, "\n").split("\n");
    if (authoredLines.length > 1) {
      descriptionState.firstLine = authoredLines.shift() || "";
      descriptionState.remainder = authoredLines.join("\n").trim();
      return;
    }

    const text = descriptionState.text;
    const rawLine = text.slice(0, charsPerLine);
    const breakIndex = rawLine.lastIndexOf(" ");
    const splitIndex = breakIndex > Math.floor(charsPerLine * 0.6) ? breakIndex : charsPerLine;
    descriptionState.firstLine = text.slice(0, splitIndex);
    descriptionState.remainder = text.slice(splitIndex).trimStart();
  };

  const getPreviewBuffer = () => Math.min(descriptionState.previewBuffer, descriptionState.firstLine.length);
  const buildPreviewLabel = (revealedCount = 0) => {
    if (!descriptionState.remainder) return descriptionState.firstLine;
    const buffer = getPreviewBuffer();
    const baseCount = Math.max(0, descriptionState.firstLine.length - buffer);
    const solidCount = Math.min(descriptionState.firstLine.length, baseCount + Math.max(0, Math.min(buffer, revealedCount)));
    return `${descriptionState.firstLine.slice(0, solidCount)}${".".repeat(Math.max(0, descriptionState.firstLine.length - solidCount))}`;
  };

  const buildExtraLabel = (visibleCount = 0, { trailingHead = false } = {}) => {
    if (!descriptionState.remainder) return "";
    const safeVisibleCount = Math.max(0, Math.min(descriptionState.remainder.length, visibleCount));
    if (safeVisibleCount <= 0) return "";
    const visible = descriptionState.remainder.slice(0, safeVisibleCount);
    if (!trailingHead) return visible;
    const remaining = Math.max(0, descriptionState.remainder.length - safeVisibleCount);
    return `${visible}${".".repeat(Math.min(getPreviewBuffer(), remaining))}`;
  };

  const applyDescriptionFrame = (previewRevealCount, extraVisibleLength, options = {}) => {
    setRenderedLabel(preview, buildPreviewLabel(previewRevealCount));
    extra.textContent = buildExtraLabel(extraVisibleLength, options);
    extra.style.display = (extra.textContent || section.classList.contains("is-expanded")) ? "block" : "none";
  };

  const renderDescription = ({ expanded = section.classList.contains("is-expanded"), animate = false } = {}) => {
    buildDescriptionLayout();
    const toggleLabel = expanded ? "▨▩▧  " : "▧▩▨  ";
    setRenderedLabel(toggle, toggleLabel);
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    section.classList.toggle("is-expanded", expanded);
    if (descriptionState.frame) cancelAnimationFrame(descriptionState.frame);

    if (!expanded) {
      if (!animate || !descriptionState.remainder) {
        setRenderedLabel(preview, buildPreviewLabel(0));
        extra.textContent = "";
        extra.style.display = "none";
        return;
      }

      const buffer = getPreviewBuffer();
      const totalChars = buffer + descriptionState.remainder.length;
      const startAt = performance.now();
      const duration = 500;
      const step = (now) => {
        const progress = Math.min(1, (now - startAt) / duration);
        const remainingTotal = Math.round(totalChars * (1 - easeOutQuint(progress)));
        applyDescriptionFrame(Math.min(buffer, remainingTotal), Math.max(0, remainingTotal - buffer), { trailingHead: true });
        if (progress < 1) descriptionState.frame = requestAnimationFrame(step);
        else descriptionState.frame = null;
      };
      descriptionState.frame = requestAnimationFrame(step);
      return;
    }

    if (!descriptionState.remainder) {
      setRenderedLabel(preview, descriptionState.firstLine);
      extra.textContent = "";
      extra.style.display = "none";
      return;
    }

    if (!animate) {
      setRenderedLabel(preview, descriptionState.firstLine);
      extra.textContent = descriptionState.remainder;
      extra.style.display = "block";
      return;
    }

    applyDescriptionFrame(0, 0, { trailingHead: true });
    const buffer = getPreviewBuffer();
    const totalChars = buffer + descriptionState.remainder.length;
    const startAt = performance.now();
    const duration = 500;
    const step = (now) => {
      const progress = Math.min(1, (now - startAt) / duration);
      const revealedTotal = Math.round(totalChars * easeOutQuint(progress));
      applyDescriptionFrame(Math.min(buffer, revealedTotal), Math.max(0, revealedTotal - buffer), { trailingHead: true });
      if (progress < 1) descriptionState.frame = requestAnimationFrame(step);
      else {
        descriptionState.frame = null;
        setRenderedLabel(preview, descriptionState.firstLine);
        extra.textContent = descriptionState.remainder;
      }
    };
    descriptionState.frame = requestAnimationFrame(step);
  };

  section.__renderDescription = renderDescription;
  toggle.addEventListener("click", () => {
    renderDescription({ expanded: !section.classList.contains("is-expanded"), animate: true });
  });

  descriptionRow.append(toggle, preview, extra);

  const appendStandardCopy = () => {
    const copy = document.createElement("div");
    copy.className = "portfolio-slice-copy";
    copy.append(title, subtitle, descriptionRow);
    inner.append(copy);
  };

  if (slice.type === "single-media") {
    const mediaWrap = document.createElement("div");
    mediaWrap.className = "portfolio-slice-media-wrap";
    const image = document.createElement("img");
    image.className = "portfolio-slice-media";
    image.src = slice.media?.src || "";
    image.alt = slice.media?.alt || slice.title || "";
    mediaWrap.append(image);
    inner.append(mediaWrap);
    appendStandardCopy();
  } else if (slice.type === "video-media") {
    const mediaWrap = document.createElement("div");
    mediaWrap.className = "portfolio-slice-media-wrap";
    const video = document.createElement("video");
    video.className = "portfolio-slice-media";
    video.src = slice.media?.src || "";
    video.muted = true;
    video.loop = true;
    video.controls = false;
    video.preload = "auto";
    video.playsInline = true;
    video.dataset.videoHovering = "false";
    if (slice.media?.poster) video.poster = slice.media.poster;
    mediaWrap.append(video);
    inner.append(mediaWrap);
    appendStandardCopy();
  } else if (slice.type === "carousel-media") {
    section.classList.add("portfolio-carousel-slice");
    const controls = document.createElement("div");
    controls.className = "portfolio-carousel-controls";
    const left = document.createElement("button");
    left.type = "button";
    left.className = "portfolio-carousel-button portfolio-carousel-arrow home-dissolve portfolio-dissolve portfolio-dissolve-button";
    left.dataset.weightIdle = "80";
    left.dataset.weightHover = "160";
    left.dataset.weightPress = "320";
    left.textContent = " ◪▨\n◩▧▩\n  ▧";

    const indices = document.createElement("div");
    indices.className = "portfolio-carousel-indices";

    const right = document.createElement("button");
    right.type = "button";
    right.className = "portfolio-carousel-button portfolio-carousel-arrow home-dissolve portfolio-dissolve portfolio-dissolve-button";
    right.dataset.weightIdle = "80";
    right.dataset.weightHover = "160";
    right.dataset.weightPress = "320";
    right.textContent = "▧◪\n▩▨◪\n▨";

    const mediaWrap = document.createElement("div");
    mediaWrap.className = "portfolio-slice-media-wrap portfolio-carousel-media-wrap";
    const stage = document.createElement("div");
    stage.className = "portfolio-carousel-stage";
    const createCarouselLayer = (className = "portfolio-carousel-image") => {
      const layer = document.createElement("div");
      layer.className = className;
      const image = document.createElement("img");
      image.className = "portfolio-slice-media portfolio-carousel-image-media";
      layer.append(image);
      layer.__image = image;
      return layer;
    };
    const frontImage = createCarouselLayer("portfolio-carousel-image is-current");
    const backImage = createCarouselLayer("portfolio-carousel-image");
    stage.append(frontImage, backImage);
    mediaWrap.append(stage);

    const items = Array.isArray(slice.media?.items) ? slice.media.items : [];
    const state = { activeIndex: 0, currentLayer: frontImage, nextLayer: backImage, isAnimating: false, minAspectRatio: Infinity, autoAdvanceTimer: null };
    const indexButtons = items.map((item, itemIndex) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "portfolio-carousel-button portfolio-carousel-index home-dissolve portfolio-dissolve portfolio-dissolve-button";
      button.dataset.weightIdle = "80";
      button.dataset.weightHover = "160";
      button.dataset.weightPress = "320";
      button.addEventListener("click", () => {
        noteInteraction();
        goToIndex(itemIndex, itemIndex > state.activeIndex ? "right" : "left");
      });
      indices.append(button);
      return button;
    });

    const labelForIndex = (itemIndex, selected) => selected
      ? `┏━┓\n┃${itemIndex + 1}┃\n┗━┛`
      : "┏━┓\n┃ ┃\n┗━┛";

    const getItemFrame = (item, availableWidth = (mediaWrap.clientWidth || inner.clientWidth || 0)) => {
      const aspectRatio = Number(item?.aspectRatio);
      if (!availableWidth || !Number.isFinite(state.minAspectRatio) || !Number.isFinite(aspectRatio) || aspectRatio <= 0) return null;
      const height = Math.max(1, Math.round(availableWidth * state.minAspectRatio));
      const width = Math.min(availableWidth, Math.max(1, Math.round(height / aspectRatio)));
      return { width, height };
    };

    const applyImageFrame = (layer) => {
      const frame = getItemFrame(layer?.__carouselItem);
      if (!layer || !frame) return;
      layer.style.width = `${frame.width}px`;
      layer.style.height = `${frame.height}px`;
    };

    const setImageContent = (layer, item, itemIndex) => {
      if (!layer || !item) return;
      layer.__image.src = item.src || "";
      layer.__image.alt = item.alt || `${slice.title || "carousel image"} ${itemIndex + 1}`;
      layer.__carouselItem = item;
      const layerPalette = buildSlicePalette(item.colors || slice, item.tone || tone);
      layer.style.setProperty("--carousel-layer-background", layerPalette.inactive.background);
      applyImageFrame(layer);
    };

    const syncStageSize = (item = items[state.activeIndex], secondaryItem = null) => {
      const primaryFrame = getItemFrame(item);
      const secondaryFrame = getItemFrame(secondaryItem);
      const height = primaryFrame?.height || secondaryFrame?.height;
      const width = Math.max(primaryFrame?.width || 0, secondaryFrame?.width || 0);
      if (!height || !width) return;
      stage.style.height = `${height}px`;
      stage.style.width = `${width}px`;
      applyImageFrame(state.currentLayer);
      applyImageFrame(state.nextLayer);
    };

    const noteItemSize = (item) => {
      const aspectRatio = Number(item?.aspectRatio);
      if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return;
      if (aspectRatio < state.minAspectRatio) state.minAspectRatio = aspectRatio;
      syncStageSize(items[state.activeIndex], state.isAnimating ? state.currentLayer.__carouselItem : null);
    };

    const emitAppearanceChange = () => {
      section.dispatchEvent(new CustomEvent("portfolio:slice-appearance", { bubbles: true }));
    };

    const applyCarouselItemAppearance = (item) => {
      applySlicePalette(section, item?.colors || slice, item?.tone || tone);
      emitAppearanceChange();
    };

    const syncCarouselButtons = () => {
      indexButtons.forEach((button, itemIndex) => {
        const selected = itemIndex === state.activeIndex;
        button.classList.toggle("is-selected", selected);
        setRenderedLabel(button, labelForIndex(itemIndex, selected));
      });
    };

    const scheduleAutoAdvance = () => {
      if (state.autoAdvanceTimer) window.clearTimeout(state.autoAdvanceTimer);
      if (items.length < 2) return;
      state.autoAdvanceTimer = window.setTimeout(() => {
        goToIndex((state.activeIndex + 1) % items.length, "right");
        scheduleAutoAdvance();
      }, 60000);
    };

    const noteInteraction = () => {
      scheduleAutoAdvance();
    };

    const finishTransition = () => {
      const previousCurrent = state.currentLayer;
      const incomingCurrent = state.nextLayer;
      previousCurrent.className = "portfolio-carousel-image";
      incomingCurrent.className = "portfolio-carousel-image is-current";
      state.currentLayer = incomingCurrent;
      state.nextLayer = previousCurrent;
      state.isAnimating = false;
      previousCurrent.__carouselItem = null;
      previousCurrent.style.removeProperty("--carousel-layer-background");
      syncStageSize(items[state.activeIndex]);
    };

    const goToIndex = (nextIndex, explicitDirection = null) => {
      if (!items.length || nextIndex === state.activeIndex || state.isAnimating) return;
      const previousIndex = state.activeIndex;
      const direction = explicitDirection || (nextIndex > previousIndex ? "right" : "left");
      const outgoing = items[previousIndex];
      const incoming = items[nextIndex];
      setImageContent(state.nextLayer, incoming, nextIndex);
      state.currentLayer.__carouselItem = outgoing;
      state.currentLayer.className = `portfolio-carousel-image is-current is-leaving to-${direction}`;
      state.nextLayer.className = `portfolio-carousel-image is-entering from-${direction}`;
      state.activeIndex = nextIndex;
      state.isAnimating = true;
      applyCarouselItemAppearance(incoming);
      syncStageSize(incoming, outgoing);
      syncCarouselButtons();
      requestAnimationFrame(() => {
        state.currentLayer.classList.add("is-animating");
        state.nextLayer.classList.add("is-animating");
      });
      window.setTimeout(finishTransition, 520);
    };

    left.addEventListener("click", () => {
      if (!items.length) return;
      noteInteraction();
      goToIndex((state.activeIndex - 1 + items.length) % items.length, "left");
    });
    right.addEventListener("click", () => {
      if (!items.length) return;
      noteInteraction();
      goToIndex((state.activeIndex + 1) % items.length, "right");
    });

    controls.append(left, indices, right);
    inner.append(mediaWrap, controls);
    appendStandardCopy();

    [section, mediaWrap, controls, left, right, ...indexButtons].forEach((element) => {
      element.addEventListener("pointerenter", noteInteraction);
      element.addEventListener("focusin", noteInteraction);
    });

    items.forEach((item) => {
      if (!item?.src) return;
      const probe = new Image();
      probe.addEventListener("load", () => {
        if (!probe.naturalWidth || !probe.naturalHeight) return;
        item.aspectRatio = probe.naturalHeight / probe.naturalWidth;
        noteItemSize(item);
      }, { once: true });
      probe.src = item.src;
    });

    if (items[0]) {
      setImageContent(state.currentLayer, items[0], 0);
      applyCarouselItemAppearance(items[0]);
      noteItemSize(items[0]);
    }
    syncCarouselButtons();
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(() => syncStageSize(items[state.activeIndex]));
      observer.observe(mediaWrap);
    } else {
      window.addEventListener("resize", () => syncStageSize(items[state.activeIndex]));
    }
    requestAnimationFrame(() => syncStageSize(items[state.activeIndex]));
    scheduleAutoAdvance();
  } else if (slice.type === "custom-media" && slice.media?.html) {
    const mediaWrap = document.createElement("div");
    mediaWrap.className = "portfolio-slice-media-wrap portfolio-custom-media-wrap";
    mediaWrap.innerHTML = slice.media.html;
    inner.append(mediaWrap);
    appendStandardCopy();
  } else if (slice.type === "custom" && slice.html) {
    const custom = document.createElement("div");
    custom.innerHTML = slice.html;
    inner.append(custom);
  } else {
    appendStandardCopy();
  }

  return section;
}

function parseSketchbookEntryMarkdown(sourceText) {
  const lines = sourceText.replace(/\r\n?/g, "\n").split("\n");
  const entry = {};
  let section = null;

  lines.forEach((line) => {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      section = heading[1].trim().toLowerCase();
      if (!(section in entry)) entry[section] = "";
      return;
    }
    if (!section) return;
    entry[section] = entry[section]
      ? `${entry[section]}\n${line}`
      : line;
  });

  Object.keys(entry).forEach((key) => {
    entry[key] = entry[key].trim();
  });

  return entry;
}

function parseSketchbookColorConfig(sourceText) {
  const config = {};
  if (!sourceText) return config;

  sourceText.split("\n").forEach((line) => {
    const match = line.match(/^\s*[-*]\s*([^:]+):\s*(.*?)\s*$/);
    if (!match) return;
    config[match[1].trim().toLowerCase()] = match[2].trim();
  });

  return config;
}

function normalizeHexColor(value, fallback) {
  if (!value) return fallback;
  const trimmed = String(value).trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(trimmed) || /^[0-9a-f]{6}$/i.test(trimmed)) return `#${trimmed}`;
  return fallback;
}

function resolveEntryTone(colorConfig, preset) {
  const brightness = (colorConfig.brightness || "").trim().toLowerCase();
  return brightness === "dark" ? "dark" : brightness === "light" ? "light" : (preset === "video-media" ? "dark" : "light");
}

function resolveDefaultSliceColors(tone) {
  return tone === "dark"
    ? {
        background: "#304021",
        title: "#FEFFE5",
        subtitle: "#A9C448",
        description: "#E2E990",
      }
    : {
        background: "#E8A15D",
        title: "#120A1A",
        subtitle: "#120A1A",
        description: "#120A1A",
      };
}

function resolveSliceColors(colorConfig, defaultColors) {
  const resolvedColors = {
    backgroundColor: normalizeHexColor(colorConfig.background, defaultColors.background),
    titleColor: normalizeHexColor(colorConfig.title, defaultColors.title),
    subtitleColor: normalizeHexColor(colorConfig.subtitle, defaultColors.subtitle),
    descColor: normalizeHexColor(colorConfig.description, defaultColors.description),
  };
  resolvedColors.buttonColor = resolvedColors.descColor;
  return resolvedColors;
}

function collectCarouselItemColorSections(entry, preset) {
  const sections = new Map();
  Object.entries(entry).forEach(([key, value]) => {
    const match = key.match(/^item\s+(\d+)\s+colors$/i);
    if (!match) return;
    const colorConfig = parseSketchbookColorConfig(value);
    const tone = resolveEntryTone(colorConfig, preset);
    sections.set(Number(match[1]) - 1, {
      tone,
      colors: resolveSliceColors(colorConfig, resolveDefaultSliceColors(tone)),
    });
  });
  return sections;
}

function resolveCustomMediaHtml(sourceText, source) {
  const mediaFiles = source.mediaFiles || {};
  const images = mediaFiles.images || [];
  const videos = mediaFiles.videos || [];
  return (sourceText || "")
    .replace(/\{\{\s*mediaDir\s*\}\}/gi, source.mediaDir || "")
    .replace(/\{\{\s*image-(\d+)\s*\}\}/gi, (_, index) => images[Number(index) - 1] || "")
    .replace(/\{\{\s*video-(\d+)\s*\}\}/gi, (_, index) => videos[Number(index) - 1] || "");
}

function resolveSketchbookSourceSlice(entry, source) {
  const preset = (entry.preset || "single-media").trim().toLowerCase();
  const mediaDir = source.mediaDir || (source.entry ? source.entry.replace(/[^/]+$/, "") : "");
  const mediaFiles = source.mediaFiles || {};
  const colorConfig = parseSketchbookColorConfig(entry.colors);
  const tone = resolveEntryTone(colorConfig, preset);
  const defaultColors = resolveDefaultSliceColors(tone);
  const shared = {
    title: entry.title || "untitled",
    subtitle: entry.subtitle || "",
    description: entry.description || "",
  };
  const resolvedColors = resolveSliceColors(colorConfig, defaultColors);

  if (preset === "video-media") {
    return {
      type: "video-media",
      tone,
      ...resolvedColors,
      media: {
        type: "video",
        src: mediaFiles.videos?.[0] || `${mediaDir}video-1.mp4`,
      },
      ...shared,
    };
  }

  if (preset === "carousel-media") {
    const itemColorSections = collectCarouselItemColorSections(entry, preset);
    const firstItemAppearance = itemColorSections.get(0) || { tone: "light", colors: resolveSliceColors({}, resolveDefaultSliceColors("light")) };
    return {
      type: "carousel-media",
      tone: firstItemAppearance.tone,
      ...firstItemAppearance.colors,
      media: {
        type: "carousel",
        items: (mediaFiles.images || []).map((src, itemIndex) => {
          const itemAppearance = itemColorSections.get(itemIndex) || firstItemAppearance;
          return {
            src,
            alt: `${entry.title || "sketchbook image"} ${itemIndex + 1}`,
            colors: itemAppearance.colors,
            tone: itemAppearance.tone,
          };
        }),
      },
      ...shared,
    };
  }

  if (preset === "custom-media") {
    return {
      type: "custom-media",
      tone,
      ...resolvedColors,
      media: {
        type: "custom",
        html: resolveCustomMediaHtml(entry["media html"], { ...source, mediaDir, mediaFiles }),
      },
      ...shared,
    };
  }

  return {
    type: "single-media",
    tone,
    ...resolvedColors,
    media: {
      type: "image",
      src: mediaFiles.images?.[0] || `${mediaDir}image-1.jpg`,
      alt: entry.title || "sketchbook image",
    },
    ...shared,
  };
}

async function loadPortfolioSourceSlices(pageKey) {
  const sources = window.PORTFOLIO_PAGE_SOURCE?.[pageKey];
  if (!Array.isArray(sources) || !sources.length) return null;

  const slices = sources.map((source) => {
    const resolved = typeof source === "string" ? { sourceText: source } : source;
    if (!resolved?.sourceText) return null;
    const entry = parseSketchbookEntryMarkdown(resolved.sourceText);
    return resolveSketchbookSourceSlice(entry, resolved);
  });

  return slices.filter(Boolean);
}

async function initPortfolioPage() {
  const page = document.querySelector(".portfolio-page[data-portfolio-page]");
  const mount = page?.querySelector(".portfolio-slices");
  if (!page || !mount) return;

  const pageKey = page.dataset.portfolioPage;
  const inlineSlices = window.PORTFOLIO_PAGE_SLICES?.[pageKey];
  const sourceSlices = Array.isArray(inlineSlices) && inlineSlices.length
    ? null
    : await loadPortfolioSourceSlices(pageKey);
  const slices = Array.isArray(inlineSlices) && inlineSlices.length ? inlineSlices : sourceSlices;
  if (!Array.isArray(slices) || !slices.length) return;

  mount.replaceChildren(...slices.map((slice, index) => buildPortfolioSlice(slice, index)));

  const sliceEls = [...mount.querySelectorAll(".portfolio-slice")];
  const renderDescriptions = (animate = false) => {
    sliceEls.forEach((slice) => slice.__renderDescription?.({ expanded: slice.classList.contains("is-expanded"), animate }));
  };
  renderDescriptions(false);
  const renderers = new Map();
  mount.querySelectorAll(".portfolio-dissolve").forEach((element) => {
    const renderer = new DissolveTextRenderer(element);
    element.__dissolveRenderer = renderer;
    renderers.set(element, renderer);
  });
  const videoEls = [...mount.querySelectorAll(".portfolio-slice video")];
  const firstFrameTime = 0.01;
  const primeVideoFrame = (video) => {
    const applyFirstFrame = () => {
      const nextTime = Math.min(firstFrameTime, Math.max(0, (video.duration || firstFrameTime)));
      const finalize = () => {
        video.pause();
        video.dataset.firstFrameReady = "true";
      };
      if (Math.abs(video.currentTime - nextTime) < 0.001) {
        finalize();
        return;
      }
      const handleSeeked = () => {
        video.removeEventListener("seeked", handleSeeked);
        finalize();
      };
      video.addEventListener("seeked", handleSeeked, { once: true });
      try {
        video.currentTime = nextTime;
      } catch {
        finalize();
      }
    };

    if (video.readyState >= 2) {
      applyFirstFrame();
      return;
    }

    const handleLoadedData = () => {
      video.removeEventListener("loadeddata", handleLoadedData);
      applyFirstFrame();
    };
    video.addEventListener("loadeddata", handleLoadedData, { once: true });
  };
  const syncVideoPlayback = (activeSlice) => {
    videoEls.forEach((video) => {
      const slice = video.closest(".portfolio-slice");
      const isActive = slice === activeSlice;
      const showControls = video.dataset.videoHovering === "true";
      video.controls = showControls;
      if (isActive) {
        video.play().catch(() => {});
        return;
      }
      video.pause();
      if (video.dataset.firstFrameReady === "true") {
        try {
          video.currentTime = Math.min(firstFrameTime, Math.max(0, (video.duration || firstFrameTime)));
        } catch {}
      } else {
        primeVideoFrame(video);
      }
    });
  };
  videoEls.forEach((video) => {
    primeVideoFrame(video);
    const setVideoHovering = (value) => {
      video.dataset.videoHovering = value ? "true" : "false";
      video.controls = value;
    };
    video.addEventListener("pointerenter", () => setVideoHovering(true));
    video.addEventListener("pointerleave", () => setVideoHovering(false));
    video.addEventListener("focus", () => setVideoHovering(true));
    video.addEventListener("blur", () => setVideoHovering(false));
  });
  let hovered = null;
  let hoveredToggle = null;

  const resolveFocusSlice = () => {
    const targetY = window.scrollY + window.innerHeight * 0.33;
    let best = sliceEls[0] || null;
    let bestDistance = Infinity;
    sliceEls.forEach((slice) => {
      const rect = slice.getBoundingClientRect();
      const center = window.scrollY + rect.top + rect.height * 0.5;
      const distance = Math.abs(center - targetY);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = slice;
      }
    });
    return best;
  };

  const sync = () => {
    const active = hovered || resolveFocusSlice();
    syncVideoPlayback(active);
    sliceEls.forEach((slice) => {
      const isActive = slice === active;
      const appearance = resolveSliceAppearance(slice, isActive);
      slice.classList.toggle("is-active", isActive);
      slice.classList.toggle("is-dimmed", !isActive);
      slice.style.setProperty("--slice-background", appearance.background);
      slice.style.setProperty("--slice-title-color", appearance.title);
      slice.style.setProperty("--slice-subtitle-color", appearance.subtitle);
      slice.style.setProperty("--slice-button-color", appearance.button);
      slice.style.setProperty("--slice-desc-color", appearance.desc);
    });
    renderers.forEach((renderer, element) => {
      const slice = element.closest(".portfolio-slice");
      const isActive = slice?.classList.contains("is-active");
      const isButton = element.classList.contains("portfolio-dissolve-button");
      const isHoveredButton = hoveredToggle === element;
      const isSelectedCarouselIndex = element.classList.contains("portfolio-carousel-index") && element.classList.contains("is-selected");
      const target = isButton && isHoveredButton
        ? renderer.weightFromDataset("press", renderer.weightFromDataset("hover", renderer.currentWeight))
        : renderer.weightFromDataset(isSelectedCarouselIndex || isActive ? "hover" : "idle", renderer.currentWeight);
      const sliceStyle = slice ? getComputedStyle(slice) : null;
      const colorVar = element.classList.contains("portfolio-slice-title")
        ? "--slice-title-color"
        : element.classList.contains("portfolio-slice-subtitle")
          ? "--slice-subtitle-color"
          : element.classList.contains("portfolio-slice-toggle") || element.classList.contains("portfolio-carousel-arrow")
            ? "--slice-button-color"
            : element.classList.contains("portfolio-carousel-index")
              ? (element.classList.contains("is-selected") ? "--slice-desc-color" : "--slice-subtitle-color")
              : "--slice-desc-color";
      const nextColor = sliceStyle ? renderer.parseColor(sliceStyle.getPropertyValue(colorVar).trim()) : null;
      renderer.refreshAppearance(nextColor);
      renderer.setTarget(target);
    });

    sliceEls.forEach((slice) => {
      const descColor = getComputedStyle(slice).getPropertyValue("--slice-desc-color").trim();
      slice.querySelectorAll(".portfolio-slice-description-extra").forEach((element) => {
        element.style.color = descColor;
      });
    });
  };

  sliceEls.forEach((slice) => {
    slice.addEventListener("pointerenter", () => {
      hovered = slice;
      sync();
    });
    slice.addEventListener("pointerleave", () => {
      if (hovered === slice) hovered = null;
      sync();
    });
  });

  mount.querySelectorAll(".portfolio-dissolve-button").forEach((button) => {
    button.addEventListener("pointerenter", () => {
      hoveredToggle = button;
      sync();
    });
    button.addEventListener("pointerleave", () => {
      if (hoveredToggle === button) hoveredToggle = null;
      sync();
    });
    button.addEventListener("focus", () => {
      hoveredToggle = button;
      sync();
    });
    button.addEventListener("blur", () => {
      if (hoveredToggle === button) hoveredToggle = null;
      sync();
    });
  });

  mount.addEventListener("portfolio:slice-appearance", () => {
    sync();
  });

  window.addEventListener("scroll", () => {
    if (hovered) return;
    sync();
  }, { passive: true });
  window.addEventListener("resize", () => {
    renderDescriptions(false);
    renderers.forEach((renderer) => renderer.resize());
    sync();
  });
  document.fonts?.ready?.then(() => renderers.forEach((renderer) => renderer.resize()));
  document.addEventListener("pointerleave", (event) => {
    if (event.relatedTarget !== null) return;
    hovered = null;
    sync();
  });

  sync();
}

function initSiteFooterStates() {
  const footer = document.querySelector("footer.site");
  const cta = footer?.querySelector(".site-footer-cta");
  const copy = footer?.querySelector(".site-footer-copy");
  if (!footer || !cta || !copy) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ctaRenderer = reduceMotion ? null : new DissolveTextRenderer(cta);
  if (ctaRenderer) cta.__dissolveRenderer = ctaRenderer;
  if (ctaRenderer) ctaRenderer.durationMs = 320;
  let hovering = false;
  let nearby = false;
  let proximityStrength = 0;
  let breathTimer = null;
  let wordTimer = null;
  let breathHigh = false;
  let wordIndex = 0;

  const isEngaged = () => hovering || nearby;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const mix = (start, end, t) => start + (end - start) * t;

  const setWord = (word) => {
    if (cta.__dissolveRenderer) cta.__dissolveRenderer.setLabel(word);
    else cta.textContent = word;
  };

  const resolveCycleStrength = () => (hovering ? 1 : proximityStrength);
  const resolveBreathDelay = () => Math.round(mix(1400, 520, resolveCycleStrength()));
  const resolveWordDelay = () => Math.round(mix(480, 170, resolveCycleStrength()));

  const sync = () => {
    const engaged = isEngaged();
    const idleColor = "#E36325";
    const hoverColor = "#120A1A";
    copy.style.color = idleColor;
    cta.style.color = engaged ? hoverColor : idleColor;
    if (ctaRenderer) {
      ctaRenderer.refreshAppearance(ctaRenderer.parseColor(engaged ? hoverColor : idleColor));
      ctaRenderer.setTarget(
        engaged
          ? ctaRenderer.weightFromDataset(breathHigh ? "press" : "hover", breathHigh ? 320 : 160)
          : ctaRenderer.weightFromDataset(breathHigh ? "hover" : "idle", breathHigh ? 160 : 80)
      );
    } else {
      cta.style.fontWeight = engaged ? (breathHigh ? "320" : "160") : (breathHigh ? "160" : "80");
    }
  };

  const stopBreathing = () => {
    if (!breathTimer) return;
    window.clearTimeout(breathTimer);
    breathTimer = null;
  };

  const queueBreathing = () => {
    stopBreathing();
    if (!isEngaged()) return;
    breathTimer = window.setTimeout(() => {
      breathHigh = !breathHigh;
      sync();
      queueBreathing();
    }, resolveBreathDelay());
  };

  const stopWords = () => {
    if (!wordTimer) return;
    window.clearTimeout(wordTimer);
    wordTimer = null;
  };

  const queueWords = () => {
    stopWords();
    if (!isEngaged()) return;
    wordTimer = window.setTimeout(() => {
      wordIndex = (wordIndex + 1) % FOOTER_CTA_WORDS.length;
      setWord(FOOTER_CTA_WORDS[wordIndex]);
      queueWords();
    }, resolveWordDelay());
  };

  const refreshMotionLoops = () => {
    if (!isEngaged()) {
      stopBreathing();
      stopWords();
      sync();
      return;
    }
    queueBreathing();
    queueWords();
    sync();
  };

  const updateEngagement = ({ nextHover = hovering, nextNearby = nearby, nextStrength = proximityStrength } = {}) => {
    hovering = nextHover;
    nearby = nextNearby;
    proximityStrength = clamp(nextStrength, 0, 1);
    refreshMotionLoops();
  };

  cta.addEventListener("pointerenter", () => updateEngagement({ nextHover: true }));
  cta.addEventListener("pointerleave", () => updateEngagement({ nextHover: false }));
  cta.addEventListener("focus", () => updateEngagement({ nextHover: true }));
  cta.addEventListener("blur", () => updateEngagement({ nextHover: false }));
  const updateProximity = (event) => {
    const rect = footer.getBoundingClientRect();
    const x = Math.max(rect.left, Math.min(event.clientX, rect.right));
    const y = Math.max(rect.top, Math.min(event.clientY, rect.bottom));
    const dx = event.clientX - x;
    const dy = event.clientY - y;
    const distance = Math.hypot(dx, dy);
    const radius = 140;
    const strength = clamp(1 - (distance / radius), 0, 1);
    updateEngagement({ nextNearby: strength > 0, nextStrength: strength });
  };

  document.addEventListener("pointermove", updateProximity, { passive: true });
  document.addEventListener("pointerleave", () => updateEngagement({ nextNearby: false, nextStrength: 0 }));
  window.addEventListener("resize", () => cta.__dissolveRenderer?.resize());
  document.fonts?.ready?.then(() => cta.__dissolveRenderer?.resize());
  setWord(FOOTER_CTA_WORDS[wordIndex]);
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
  initSiteFooterStates();
  initPortfolioPage().catch((error) => console.error(error));
  initHomeStates();
});
