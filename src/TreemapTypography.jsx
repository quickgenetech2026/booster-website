/**
 * TreemapTypography.jsx
 * ──────────────────────────────────────────────────────────────────────────
 * Product-category treemap with GPU-accelerated, RAF-driven text layout.
 *
 * Tech stack (all requirements met):
 *  1. Pure hand-written JS — all logic & DOM ops
 *  2. Pretext-style Canvas measureText() — prepare/cache/layout, zero reflow
 *  3. Squarified Treemap — Bruls / Huizing / van Wijk algorithm
 *  4. CSS transform:translate() + will-change:transform — GPU compositing
 *  5. Hand-written JS Lerp animation — CSS transition:0s on positions
 *  6. Single requestAnimationFrame loop: update→layout→Pretext→batch-write
 * ──────────────────────────────────────────────────────────────────────────
 */

import { useRef, useEffect } from "react";

/* ── tunables ─────────────────────────────────────────────────────────────── */
const GAP            = 10;     // px between blocks
const LERP_K         = 0.088;  // per-frame factor (≈ smooth 12-frame settle)
const HOVER_BOOST    = 0.30;   // weight multiplier when a block is hovered
const BREATHE_AMP    = 0.06;   // ±6 % gentle weight oscillation per category
const BREATHE_FREQ   = 0.00022; // rad / ms  (~28s full cycle)
const SELECT_BOOST   = 3.5;   // selected block gets 3.5× weight
const DESELECT_FACTOR = 0.55; // unselected blocks shrink to 55% when something is selected

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   1. PRETEXT — Canvas text measurement (no DOM, no reflow)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export class Pretext {
  constructor() {
    this._cv = document.createElement("canvas");
    this._cx = this._cv.getContext("2d");
    this._cache = new Map();
  }

  /** Returns the pixel width of `text` rendered with `font`. Cached. */
  measure(text, font) {
    const k = font + "\0" + text;
    if (!this._cache.has(k)) {
      this._cx.font = font;
      this._cache.set(k, this._cx.measureText(text).width);
    }
    return this._cache.get(k);
  }

  /**
   * Binary-search the largest integer px size in [minPx, maxPx] where
   * `text` fits within `maxW`.
   * `fontTpl` must contain the literal "{S}" which is replaced by the size.
   * Returns the matching px size, or null if even minPx doesn't fit.
   */
  fitSize(text, fontTpl, minPx, maxPx, maxW) {
    let lo = minPx, hi = maxPx, best = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.measure(text, fontTpl.replace("{S}", mid)) <= maxW) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return best;
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   2. SQUARIFIED TREEMAP — Bruls / Huizing / van Wijk
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/** Worst aspect ratio of a candidate row. */
function _worstAR(row, rowArea, shorter) {
  if (rowArea === 0 || shorter === 0) return Infinity;
  let w = 0;
  for (const { _a } of row) {
    if (_a <= 0) continue;
    const r1 = (shorter * shorter * _a) / (rowArea * rowArea);
    const r2 = (rowArea * rowArea) / (shorter * shorter * _a);
    const ar = Math.max(r1, r2);
    if (ar > w) w = ar;
  }
  return w;
}

/** Commit a row to `out`, return the remaining sub-rectangle. */
function _commitRow(row, rowArea, rect, out) {
  const { x, y, w, h } = rect;
  const horiz = w >= h;
  const strip = rowArea / (horiz ? h : w);
  if (strip <= 0) return rect;

  let pos = horiz ? y : x;
  for (const item of row) {
    const len = item._a / strip;
    if (horiz) {
      out.push({ ...item, bx: x + GAP / 2, by: pos + GAP / 2, bw: strip - GAP, bh: len - GAP });
    } else {
      out.push({ ...item, bx: pos + GAP / 2, by: y + GAP / 2, bw: len - GAP, bh: strip - GAP });
    }
    pos += len;
  }
  return horiz
    ? { x: x + strip, y, w: w - strip, h }
    : { x, y: y + strip, w, h: h - strip };
}

/**
 * Compute a squarified treemap layout.
 * @param {Array<{id, weight, ...}>} items  — pre-sorted descending by weight
 * @param {{x,y,w,h}} container
 * @returns {Array<{...item, bx, by, bw, bh}>}
 */
function squarify(items, container) {
  const { x, y, w, h } = container;
  const totalW = items.reduce((s, i) => s + i.weight, 0);
  if (totalW <= 0 || w <= 0 || h <= 0) return [];

  const norm = items.map(i => ({ ...i, _a: (i.weight / totalW) * w * h }));
  const out = [];
  let row = [];
  let remaining = [...norm];
  let rect = { x, y, w, h };

  while (remaining.length > 0) {
    const item = remaining[0];
    const shorter = Math.min(rect.w, rect.h);
    if (shorter <= 0) {
      for (const r of remaining) out.push({ ...r, bx: rect.x, by: rect.y, bw: 0, bh: 0 });
      break;
    }
    const rowArea    = row.reduce((s, i) => s + i._a, 0);
    const newRow     = [...row, item];
    const newRowArea = rowArea + item._a;

    if (
      row.length === 0 ||
      _worstAR(newRow, newRowArea, shorter) <= _worstAR(row, rowArea, shorter)
    ) {
      row.push(remaining.shift());
    } else {
      rect = _commitRow(row, rowArea, rect, out);
      row = [];
    }
  }

  if (row.length > 0) {
    const rowArea = row.reduce((s, i) => s + i._a, 0);
    _commitRow(row, rowArea, rect, out);
  }

  return out;
}

/**
 * Fixed-structure layout — blocks never swap positions, only sizes change.
 * Structure: [col1: item0] [col2: item1] [col3: 2×2 grid of items 2-5]
 * Items must be in the same fixed order as CATEGORIES (sorted by count desc).
 */
function fixedLayout(items, container) {
  const { x, y, w, h } = container;
  if (items.length < 6 || w <= 0 || h <= 0) return [];

  const [a, b, c, d, e, f] = items;
  const totalW = items.reduce((s, i) => s + i.weight, 0);
  if (totalW <= 0) return [];

  // Three-column widths proportional to weights
  const colA = (a.weight / totalW) * w;
  const colB = (b.weight / totalW) * w;
  const colC = w - colA - colB;

  const out = [];

  // Column 1 — full height
  out.push({ ...a, bx: x + GAP / 2, by: y + GAP / 2, bw: colA - GAP, bh: h - GAP });

  // Column 2 — full height
  out.push({ ...b, bx: x + colA + GAP / 2, by: y + GAP / 2, bw: colB - GAP, bh: h - GAP });

  // Column 3 — 2×2 grid
  if (colC > GAP * 2) {
    const x3   = x + colA + colB;
    const wTop = c.weight + d.weight;
    const wBot = e.weight + f.weight;
    const rowTop = (wTop / (wTop + wBot)) * h;
    const rowBot = h - rowTop;
    const fracC  = c.weight / wTop;
    const fracE  = e.weight / (e.weight + f.weight);

    out.push({ ...c, bx: x3 + GAP / 2,               by: y + GAP / 2,         bw: fracC * colC - GAP,       bh: rowTop - GAP });
    out.push({ ...d, bx: x3 + fracC * colC + GAP / 2, by: y + GAP / 2,         bw: (1 - fracC) * colC - GAP, bh: rowTop - GAP });
    out.push({ ...e, bx: x3 + GAP / 2,               by: y + rowTop + GAP / 2, bw: fracE * colC - GAP,       bh: rowBot - GAP });
    out.push({ ...f, bx: x3 + fracE * colC + GAP / 2, by: y + rowTop + GAP / 2, bw: (1 - fracE) * colC - GAP, bh: rowBot - GAP });
  }

  return out;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   3. TEXT TIER RESOLUTION (Pretext layout)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const NAME_TPL  = "bold {S}px Fustat, sans-serif";
const COUNT_TPL = "{S}px Inter, sans-serif";

const TIERS = [
  // Full: icon + name + count + subs
  { minW: 185, minH: 160, iconPx: 48, nameMax: 28, nameMin: 17, countPx: 13, showCount: true,  showSubs: true  },
  // Medium: icon + name + count
  { minW: 115, minH:  95, iconPx: 34, nameMax: 19, nameMin: 12, countPx: 11, showCount: true,  showSubs: false },
  // Compact: icon + abbreviated name
  { minW:  68, minH:  68, iconPx: 26, nameMax: 13, nameMin:  9, countPx:  0, showCount: false, showSubs: false },
  // Micro: icon only (proportional)
  { minW:   0, minH:   0, iconPx:  0, nameMax:  0, nameMin:  0, countPx:  0, showCount: false, showSubs: false },
];

function resolveText(pt, cat, bw, bh, lang) {
  const name  = lang === "zh" ? cat.zh : cat.en;
  const count = lang === "zh"
    ? `${cat.count.toLocaleString()} 个产品`
    : `${cat.count.toLocaleString()} Products`;
  const pad = 26;

  for (const tier of TIERS) {
    if (bw < tier.minW || bh < tier.minH) continue;

    if (tier.nameMax === 0) {
      // Micro: just icon
      return { icon: cat.icon, iconPx: Math.min(bw, bh) * 0.36, name: "", namePx: 0, count: "", countPx: 0 };
    }

    const namePx = pt.fitSize(name, NAME_TPL, tier.nameMin, tier.nameMax, bw - pad);
    if (!namePx) continue;

    return {
      icon:     cat.icon,
      iconPx:   tier.iconPx,
      name,
      namePx,
      count:    tier.showCount ? count : "",
      countPx:  tier.countPx,
      showSubs: tier.showSubs,
    };
  }

  // Absolute fallback
  return { icon: cat.icon, iconPx: Math.min(bw, bh) * 0.36, name: "", namePx: 0, count: "", countPx: 0, showSubs: false };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   4. DOM FACTORY — create once, mutate via RAF only
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function makeBlockEl(cat) {
  const el = document.createElement("div");
  el.style.cssText = [
    "position:absolute",
    "top:0",
    "left:0",
    // ── GPU compositing ──────────────────────────────────────────────────
    "will-change:transform",
    "contain:layout style paint",
    // ── Disable CSS positional transitions (pure-JS Lerp owns this) ──────
    "transition:background 0.16s ease,box-shadow 0.16s ease,border-color 0.16s ease",
    // ── Appearance ──────────────────────────────────────────────────────
    "overflow:hidden",
    "border-radius:20px",
    "background:rgba(255,255,255,0.84)",
    "backdrop-filter:blur(18px) saturate(160%)",
    "-webkit-backdrop-filter:blur(18px) saturate(160%)",
    `border:1.5px solid ${cat.accent}30`,
    "box-shadow:0 4px 20px rgba(0,0,0,0.07)",
    "display:flex",
    "flex-direction:column",
    "align-items:center",
    "justify-content:center",
    "gap:5px",
    "padding:16px",
    "box-sizing:border-box",
    "cursor:pointer",
    "user-select:none",
  ].join(";");

  // Accent stripe
  const stripe = document.createElement("div");
  stripe.style.cssText = `position:absolute;top:0;left:0;right:0;height:3px;background:${cat.accent};border-radius:20px 20px 0 0;opacity:0.78`;
  el.appendChild(stripe);

  // Large decorative background icon
  const bgIcon = document.createElement("div");
  bgIcon.style.cssText = "position:absolute;bottom:-10px;right:-6px;font-size:78px;opacity:0.055;pointer-events:none;line-height:1";
  bgIcon.textContent = cat.icon;
  el.appendChild(bgIcon);

  // Content nodes
  const iconEl  = document.createElement("div");
  iconEl.style.cssText = "line-height:1;text-align:center;position:relative;z-index:1";

  const nameEl  = document.createElement("div");
  nameEl.style.cssText = [
    "font-family:Fustat,sans-serif",
    "font-weight:700",
    "color:#1a1a1a",
    "text-align:center",
    "line-height:1.25",
    "letter-spacing:-0.01em",
    "position:relative",
    "z-index:1",
  ].join(";");

  const countEl = document.createElement("div");
  countEl.style.cssText = [
    "font-family:Inter,sans-serif",
    `color:${cat.accent}cc`,
    "text-align:center",
    "line-height:1.2",
    "font-weight:600",
    "position:relative",
    "z-index:1",
  ].join(";");

  // Sub-category chips container
  const subsEl = document.createElement("div");
  subsEl.style.cssText = [
    "display:none",
    "flex-wrap:wrap",
    "gap:4px",
    "justify-content:center",
    "position:relative",
    "z-index:1",
    "margin-top:2px",
  ].join(";");
  // Pre-create up to 3 chip spans
  for (let i = 0; i < 3; i++) {
    const chip = document.createElement("span");
    chip.style.cssText = [
      `background:${cat.accent}18`,
      `color:${cat.accent}`,
      "font-size:10px",
      "font-family:Inter,sans-serif",
      "font-weight:600",
      "padding:2px 8px",
      "border-radius:10px",
      `border:1px solid ${cat.accent}30`,
      "white-space:nowrap",
      "display:none",
    ].join(";");
    subsEl.appendChild(chip);
  }

  el.appendChild(iconEl);
  el.appendChild(nameEl);
  el.appendChild(countEl);
  el.appendChild(subsEl);

  // Hover (background/shadow only — position handled by JS Lerp)
  el.addEventListener("mouseenter", () => {
    el.style.background   = cat.color;
    el.style.boxShadow    = `0 10px 48px ${cat.accent}44, 0 2px 12px rgba(0,0,0,0.10)`;
    el.style.borderColor  = `${cat.accent}88`;
  });
  el.addEventListener("mouseleave", () => {
    el.style.background   = "rgba(255,255,255,0.84)";
    el.style.boxShadow    = "0 4px 20px rgba(0,0,0,0.07)";
    el.style.borderColor  = `${cat.accent}30`;
  });

  return { el, iconEl, nameEl, countEl, subsEl };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   5. LERP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const lerp = (a, b, t) => a + (b - a) * t;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   6. ENGINE — single RAF loop
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function initEngine(host, categories, initialLang, onCategoryClick) {
  const pt     = new Pretext();
  let lang     = initialLang;
  let hovId    = null;
  let selId    = null;   // currently selected (expanded) block id
  let rafId    = null;

  // Build block state (sorted desc by count — fixed order for stable treemap)
  const cats = [...categories].sort((a, b) => b.count - a.count);

  const blocks = cats.map(cat => {
    const { el, iconEl, nameEl, countEl, subsEl } = makeBlockEl(cat);
    host.appendChild(el);
    el.addEventListener("click", () => {
      // Toggle selection: click same block again → deselect; click new → select
      selId = selId === cat.id ? null : cat.id;
    });
    el.addEventListener("mouseenter",  () => { hovId = cat.id; });
    el.addEventListener("mouseleave",  () => { hovId = null; });
    return {
      cat,
      el, iconEl, nameEl, countEl, subsEl,
      cur: { x: 0, y: 0, w: 0, h: 0 },  // current (lerped) rect
      tgt: { x: 0, y: 0, w: 0, h: 0 },  // target from squarify
      _tk: "",                            // last text cache key
    };
  });

  const byId = Object.fromEntries(blocks.map(b => [b.cat.id, b]));

  let isVisible = true;
  let isTabActive = !document.hidden;

  function scheduleNext() {
    if (rafId || !isVisible || !isTabActive) return;
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  /* ── RAF tick ──────────────────────────────────────────────────────────── */
  function tick(ts) {
    rafId = null;
    if (!isVisible || !isTabActive) return;
    const cw = host.clientWidth;
    const ch = host.clientHeight;
    if (cw < 10 || ch < 10) { scheduleNext(); return; }

    // ── 1. Update weights (sqrt-normalised + breathe + hover + select) ──────
    // sqrt(count) compresses the 53:1 range to ~7:1 so small blocks stay legible
    const weighted = cats.map((cat, i) => {
      const breathe = 1 + BREATHE_AMP * Math.sin(ts * BREATHE_FREQ + i * 1.13);
      const hover   = cat.id === hovId ? (1 + HOVER_BOOST) : 1;
      const select  = selId === null ? 1
                    : cat.id === selId ? SELECT_BOOST
                    : DESELECT_FACTOR;
      return { ...cat, weight: Math.sqrt(cat.count) * breathe * hover * select };
    });

    // ── 2. Fixed-structure layout → update targets ───────────────────────
    const cells = fixedLayout(weighted, { x: 0, y: 0, w: cw, h: ch });
    for (const cell of cells) {
      const b = byId[cell.id];
      if (!b) continue;
      b.tgt.x = cell.bx;
      b.tgt.y = cell.by;
      b.tgt.w = Math.max(cell.bw, 0);
      b.tgt.h = Math.max(cell.bh, 0);
    }

    // ── READ PHASE: Pretext text resolution (Canvas, zero DOM reads) ──────
    const texts = blocks.map(b => resolveText(pt, b.cat, b.cur.w, b.cur.h, lang));

    // ── 3. Lerp current → target ─────────────────────────────────────────
    for (const b of blocks) {
      b.cur.x = lerp(b.cur.x, b.tgt.x, LERP_K);
      b.cur.y = lerp(b.cur.y, b.tgt.y, LERP_K);
      b.cur.w = lerp(b.cur.w, b.tgt.w, LERP_K);
      b.cur.h = lerp(b.cur.h, b.tgt.h, LERP_K);
    }

    // ── WRITE PHASE: batch all DOM mutations ─────────────────────────────
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const { x, y, w, h } = b.cur;

      // Position via transform (GPU layer — no layout trigger)
      b.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      b.el.style.width     = `${w.toFixed(1)}px`;
      b.el.style.height    = `${h.toFixed(1)}px`;

      // Selected highlight (persistent, overrides hover)
      const isSelected = selId === b.cat.id;
      if (isSelected !== b._selected) {
        b._selected = isSelected;
        if (isSelected) {
          b.el.style.background    = b.cat.color;
          b.el.style.boxShadow     = `0 16px 56px ${b.cat.accent}55, 0 4px 16px rgba(0,0,0,0.12)`;
          b.el.style.borderColor   = b.cat.accent;
          b.el.style.borderWidth   = "2.5px";
          b.el.style.zIndex        = "10";
        } else {
          b.el.style.background    = "rgba(255,255,255,0.84)";
          b.el.style.boxShadow     = "0 4px 20px rgba(0,0,0,0.07)";
          b.el.style.borderColor   = `${b.cat.accent}30`;
          b.el.style.borderWidth   = "1.5px";
          b.el.style.zIndex        = "";
        }
      }

      // Text — only write if content/size changed (skip unnecessary repaints)
      const tl  = texts[i];
      const key = `${tl.iconPx.toFixed(0)}|${tl.namePx}|${tl.name}|${tl.countPx}|${tl.showSubs}`;
      if (b._tk !== key) {
        b._tk = key;
        b.iconEl.textContent       = tl.icon;
        b.iconEl.style.fontSize    = `${tl.iconPx.toFixed(1)}px`;
        b.nameEl.textContent       = tl.name;
        b.nameEl.style.fontSize    = tl.namePx ? `${tl.namePx}px` : "0";
        b.nameEl.style.display     = tl.name   ? ""    : "none";
        b.countEl.textContent      = tl.count;
        b.countEl.style.fontSize   = tl.countPx ? `${tl.countPx}px` : "0";
        b.countEl.style.display    = tl.count  ? ""    : "none";

        // Sub-category chips
        const showSubs = tl.showSubs && b.cat.subs.length > 0;
        b.subsEl.style.display = showSubs ? "flex" : "none";
        if (showSubs) {
          const chips = b.subsEl.children;
          for (let ci = 0; ci < chips.length; ci++) {
            const label = b.cat.subs[ci];
            chips[ci].textContent  = label || "";
            chips[ci].style.display = label ? "" : "none";
          }
        }
      }
    }

    scheduleNext();
  }

  const io = typeof IntersectionObserver !== "undefined"
    ? new IntersectionObserver(([entry]) => {
        isVisible = Boolean(entry?.isIntersecting);
        if (isVisible) scheduleNext();
        else stopLoop();
      }, { threshold: 0.01 })
    : null;
  if (io) io.observe(host);

  const onVisibilityChange = () => {
    isTabActive = !document.hidden;
    if (isTabActive) scheduleNext();
    else stopLoop();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  scheduleNext();

  return {
    setLang(l) { lang = l; },
    destroy() {
      stopLoop();
      if (io) io.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      while (host.firstChild) host.removeChild(host.firstChild);
    },
  };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   7. DATA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const CATEGORIES = [
  { id: "实验耗材",        zh: "实验耗材",         en: "Lab Consumables",       count: 1164, icon: "🧪", color: "#FFF0F2", accent: "#C8102E", subs: ["吸头", "低吸附吸头", "试剂瓶"] },
  { id: "化学试剂与小分子", zh: "化学试剂与小分子", en: "Chemical Reagents",     count: 662,  icon: "⚗️",  color: "#FFFBEC", accent: "#E6A817", subs: ["有机溶剂", "SiRNA", "PROTAC"] },
  { id: "超滤离心管",      zh: "超滤离心管",       en: "Ultrafiltration Tubes", count: 53,   icon: "🔬", color: "#FFF4EC", accent: "#E65100", subs: [] },
  { id: "质控试剂盒",      zh: "质控试剂盒",       en: "QC Kits",               count: 37,   icon: "💊", color: "#FDE8F0", accent: "#AD1457", subs: [] },
  { id: "早期研发",        zh: "早期研发",         en: "Early R&D",             count: 36,   icon: "🧫", color: "#E6F9FB", accent: "#00838F", subs: [] },
  { id: "质控分析工具酶",   zh: "质控分析工具酶",   en: "QC Enzymes",            count: 22,   icon: "🔭", color: "#EBF5EC", accent: "#2E7D32", subs: [] },
];

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   8. REACT SHELL — mount once, delegate everything to pure-JS engine
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export function TreemapTypography({ lang = "zh", onCategoryClick, style }) {
  const hostRef   = useRef(null);
  const engineRef = useRef(null);

  // Mount once — engine manages its own RAF loop and DOM
  useEffect(() => {
    if (!hostRef.current) return;
    const eng = initEngine(hostRef.current, CATEGORIES, lang, onCategoryClick);
    engineRef.current = eng;
    return () => eng.destroy();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Language hot-swap (no remount needed)
  useEffect(() => {
    engineRef.current?.setLang(lang);
  }, [lang]);

  return (
    <div
      ref={hostRef}
      style={{ position: "relative", width: "100%", height: "100%", ...style }}
    />
  );
}
