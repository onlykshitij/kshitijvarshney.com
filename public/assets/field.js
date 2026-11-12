// ASCII wave field drawn on the <canvas data-field> behind the hero.
// Each cell's character comes from a brightness ramp. A few summed sine waves move the
// field; the pointer adds a blue glow and spawns rings that spread out and fade.
// The element marked data-field-clear gets a dimmed zone so the text on top stays legible.
(() => {
  "use strict";

  const canvas = document.querySelector("[data-field]");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d", { alpha: false });

  const RAMP = " .·:-=+*#%@";
  const FONT_PX = 13;
  const LINE = 1.3;
  const FPS = 30;
  const BG = "#0b0d10";
  const GREY_LO = [40, 45, 53];
  const GREY_HI = [150, 158, 170];
  const BLUE = [76, 141, 255];
  const TONES = 8;
  const BLUES = 8;

  const GLOW_RADIUS = 150;
  const RING_SPEED = 280;
  const RING_WIDTH = 34;
  const RING_DECAY = 1.5;
  const MAX_RINGS = 14;

  const params = new URLSearchParams(location.search);
  const ogMode = params.has("og");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let dpr = 1, cssW = 0, cssH = 0, cols = 0, rows = 0, cellW = 0, cellH = 0;
  let atlas = null, glyphW = 0, glyphH = 0;
  let colPhase = null, rowPhase = null, radial = null, clear = null;
  let fontSpec = "";

  const pointer = { x: -1e4, y: -1e4, strength: 0, target: 0, lastX: -1e4, lastY: -1e4, lastRing: 0 };
  const rings = [];
  let running = false, visible = true, rafId = 0, lastFrame = 0;
  const t0 = performance.now();

  const mix = (a, b, k) => a + (b - a) * k;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

  function buildAtlas() {
    const probe = document.createElement("canvas").getContext("2d");
    probe.font = fontSpec;
    cellW = probe.measureText("M").width || FONT_PX * 0.6;
    cellH = Math.round(FONT_PX * LINE);
    glyphW = Math.ceil(cellW * dpr);
    glyphH = Math.ceil(cellH * dpr);

    atlas = document.createElement("canvas");
    atlas.width = glyphW * RAMP.length;
    atlas.height = glyphH * TONES * BLUES;
    const a = atlas.getContext("2d");
    a.font = fontSpec.replace(`${FONT_PX}px`, `${FONT_PX * dpr}px`);
    a.textBaseline = "middle";
    a.textAlign = "center";
    for (let t = 0; t < TONES; t++) {
      const k = t / (TONES - 1);
      const grey = GREY_LO.map((v, i) => mix(v, GREY_HI[i], k));
      const blue = BLUE.map((v) => v * (0.5 + 0.5 * k));
      for (let b = 0; b < BLUES; b++) {
        const m = b / (BLUES - 1);
        const c = grey.map((v, i) => Math.round(mix(v, blue[i], m)));
        a.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
        const y = (t * BLUES + b) * glyphH + glyphH / 2;
        for (let i = 1; i < RAMP.length; i++) a.fillText(RAMP[i], i * glyphW + glyphW / 2, y);
      }
    }
  }

  function layout() {
    const rect = canvas.getBoundingClientRect();
    cssW = Math.max(1, Math.round(rect.width));
    cssH = Math.max(1, Math.round(rect.height));
    const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
    if (nextDpr !== dpr || !atlas) { dpr = nextDpr; buildAtlas(); }
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    cols = Math.ceil(cssW / cellW) + 1;
    rows = Math.ceil(cssH / cellH) + 1;
    colPhase = new Float32Array(cols);
    rowPhase = new Float32Array(rows);
    radial = new Float32Array(cols * rows);
    clear = new Float32Array(cols * rows);

    // Dim zone around the content block, as an ellipse with a soft edge.
    const zone = document.querySelector("[data-field-clear]");
    let zx = cssW / 2, zy = cssH / 2, zrx = cssW * 0.3, zry = cssH * 0.25;
    if (zone) {
      const z = zone.getBoundingClientRect();
      zx = z.left - rect.left + z.width / 2;
      zy = z.top - rect.top + z.height / 2;
      zrx = Math.max(120, z.width / 2 + 40);
      zry = Math.max(80, z.height / 2 + 40);
    }
    const ox = cssW * 0.72, oy = cssH * 0.18;
    for (let r = 0; r < rows; r++) {
      const py = r * cellH;
      for (let c = 0; c < cols; c++) {
        const px = c * cellW;
        const i = r * cols + c;
        radial[i] = Math.hypot(px - ox, py - oy);
        const ex = (px - zx) / zrx, ey = (py - zy) / zry;
        clear[i] = 0.18 + 0.82 * smooth(0.55, 1.35, ex * ex + ey * ey);
      }
    }
  }

  function frame(now) {
    const t = ogMode ? 7.5 : reduceMotion.matches ? 4 : (now - t0) / 1000;

    pointer.strength += (pointer.target - pointer.strength) * 0.12;

    // Two families of bands, each bent by a slow sine along the other axis, so they read as waves.
    for (let c = 0; c < cols; c++) {
      const px = c * cellW;
      colPhase[c] = Math.sin(px * 0.0062 - t * 0.27) * 1.8;
    }
    for (let r = 0; r < rows; r++) {
      const py = r * cellH;
      rowPhase[r] = Math.sin(py * 0.0095 + t * 0.32) * 2.4;
    }

    for (let k = rings.length - 1; k >= 0; k--) {
      const ring = rings[k];
      ring.age = t - ring.born;
      ring.amp = ring.power * Math.exp(-ring.age * RING_DECAY);
      ring.radius = ring.age * RING_SPEED;
      if (ring.amp < 0.03) rings.splice(k, 1);
    }

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const glowR2 = GLOW_RADIUS * GLOW_RADIUS;
    const ps = pointer.strength;
    const maxChar = RAMP.length - 1;
    const ringCount = rings.length;
    const reach = RING_WIDTH * 3;

    for (let r = 0; r < rows; r++) {
      const py = r * cellH;
      const rp = rowPhase[r];
      const dy = py - pointer.y;
      const dy2 = dy * dy;
      for (let c = 0; c < cols; c++) {
        const px = c * cellW;
        const i = r * cols + c;

        const s1 = Math.sin(px * 0.0115 + rp + t * 0.45);
        const s2 = Math.sin(py * 0.021 + colPhase[c] - t * 0.3);
        let w = (s1 * 0.55 + s2 * 0.45 + 1) * 0.5;
        w *= 0.62 + 0.38 * Math.sin(radial[i] * 0.004 - t * 0.2);
        w = w * w * w * 1.2;

        let glow = 0;
        if (ps > 0.01) {
          const dx = px - pointer.x;
          const d2 = dx * dx + dy2;
          if (d2 < glowR2 * 6) glow = ps * Math.exp(-d2 / glowR2);
        }

        let ring = 0;
        for (let k = 0; k < ringCount; k++) {
          const g = rings[k];
          const rx = px - g.x, ry = py - g.y;
          const off = Math.sqrt(rx * rx + ry * ry) - g.radius;
          if (off > -reach && off < reach) ring += g.amp * Math.exp(-(off * off) / (RING_WIDTH * RING_WIDTH));
        }

        const cl = clear[i];
        const intensity = clamp01((w * 0.85 + glow * 0.32 + ring * 0.7) * cl);
        const ch = Math.round(intensity * maxChar);
        if (ch === 0) continue;
        const blue = clamp01((glow * 1.25 + ring * 1.5) * (0.35 + 0.65 * cl));
        const tone = Math.min(TONES - 1, Math.floor(intensity * TONES));
        const b = Math.round(blue * (BLUES - 1));
        ctx.drawImage(
          atlas,
          ch * glyphW, (tone * BLUES + b) * glyphH, glyphW, glyphH,
          Math.round(px * dpr), Math.round(py * dpr), glyphW, glyphH
        );
      }
    }
  }

  function loop(now) {
    rafId = 0;
    if (!running) return;
    if (now - lastFrame >= 1000 / FPS - 2) { lastFrame = now; frame(now); }
    rafId = requestAnimationFrame(loop);
  }

  function updateRunning() {
    const should = visible && !document.hidden && !reduceMotion.matches && !ogMode;
    if (should && !running) { running = true; if (!rafId) rafId = requestAnimationFrame(loop); }
    else if (!should && running) { running = false; if (rafId) cancelAnimationFrame(rafId); rafId = 0; }
    if (!should) frame(performance.now());
  }

  function addRing(x, y, power) {
    if (reduceMotion.matches) return;
    rings.push({ x, y, power, born: (performance.now() - t0) / 1000, age: 0, amp: power, radius: 0 });
    if (rings.length > MAX_RINGS) rings.shift();
  }

  function localPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top, rect];
  }

  function onMove(e) {
    const [x, y, rect] = localPoint(e);
    const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
    pointer.x = x; pointer.y = y;
    pointer.target = inside && (e.pointerType === "mouse" || e.buttons) ? 1 : 0;
    if (!inside) return;
    const now = performance.now();
    if (Math.hypot(x - pointer.lastX, y - pointer.lastY) > 56 && now - pointer.lastRing > 90) {
      addRing(x, y, e.pointerType === "mouse" ? 0.55 : 0.75);
      pointer.lastX = x; pointer.lastY = y; pointer.lastRing = now;
    }
  }

  function onDown(e) {
    const [x, y, rect] = localPoint(e);
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
    pointer.x = x; pointer.y = y; pointer.target = 1;
    addRing(x, y, 1);
    pointer.lastX = x; pointer.lastY = y; pointer.lastRing = performance.now();
  }

  function onLeave(e) { if (e.pointerType !== "mouse" || !e.relatedTarget) pointer.target = 0; }

  async function start() {
    const family = getComputedStyle(document.body).fontFamily;
    fontSpec = `300 condensed ${FONT_PX}px ${family}`;
    try { await document.fonts.load(`300 condensed ${FONT_PX}px "Martian Mono"`, RAMP); } catch (_) {}

    layout();
    if (ogMode) addOgRings();
    updateRunning();

    let resizeTimer = 0;
    const relayout = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { layout(); updateRunning(); }, 120); };
    window.addEventListener("resize", relayout);
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", relayout);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") pointer.target = 0; }, { passive: true });
    window.addEventListener("pointercancel", () => { pointer.target = 0; }, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", updateRunning);
    if (reduceMotion.addEventListener) reduceMotion.addEventListener("change", updateRunning);

    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        updateRunning();
      }).observe(canvas);
    }
  }

  // Fixed rings and glow for the link-preview render, so the still shows the effect.
  function addOgRings() {
    const t = 7.5;
    rings.push({ x: cssW * 0.78, y: cssH * 0.3, power: 1.6, born: t - 0.55, age: 0, amp: 0, radius: 0 });
    rings.push({ x: cssW * 0.78, y: cssH * 0.3, power: 1.2, born: t - 0.15, age: 0, amp: 0, radius: 0 });
    pointer.x = cssW * 0.78; pointer.y = cssH * 0.3; pointer.strength = 1; pointer.target = 1;
  }

  start();
})();
