// app.js - Full file with normalizeDepthsToHops and renderChainGraph integrated
'use strict';

/* ===============================
   Configuration & Constants
   =============================== */
const MACHINE_COL_WIDTH = 220;
const GRAPH_ROW_HEIGHT = 120;
const GRAPH_LABEL_OFFSET = 40;
const GRAPH_CONTENT_PAD = 64;

const MACHINE_COLORS = {
  "Smelter":      "#e67e22",
  "Furnace":      "#d63031",
  "Fabricator":   "#0984e3",
  "Mega Press":   "#6c5ce7",
  "Assembler":    "#00b894",
  "Refinery":     "#e84393",
  "Compounder":   "#00cec9",
  "Pyro Forge":   "#a55eea"
};

const SPECIAL_EXTRACTORS = {
  "Helium-3": 240,
  "Goethite Ore": 400,
  "Sulphur Ore": 240
};

const DRAG_THRESHOLD_PX = 8;
const TOUCH_THRESHOLD_PX = 12;
const PULSE_PROPAGATION_DEPTH = 1;
const PULSE_STAGGER_MS = 90;

const FORCED_RAW_ORES = ['Calcium Ore', 'Titanium Ore', 'Wolfram Ore'];
const LEFT_OF_CONSUMER_RAWS = ['Helium-3', 'Sulphur Ore'];
const BBM_ID = 'Basic Building Material';

/* ===============================
   Globals
   =============================== */
let RECIPES = {};
let TIERS = {};

/* ===============================
   Utilities
   =============================== */
function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function getTextColor(bg) {
  if (!bg || bg[0] !== "#") return "#000000";
  const r = parseInt(bg.substr(1, 2), 16);
  const g = parseInt(bg.substr(3, 2), 16);
  const b = parseInt(bg.substr(5, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
  return luminance > 150 ? "#000000" : "#ffffff";
}

/* ===============================
   Theme helpers
   =============================== */
function isDarkMode() {
  if (document.documentElement.classList.contains('dark')) return true;
  if (document.body.classList.contains('dark') || document.body.classList.contains('dark-mode')) return true;
  const saved = localStorage.getItem('darkMode');
  if (saved === 'true') return true;
  if (saved === 'false') return false;
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return true;
  return false;
}

function applyThemeClass(dark) {
  if (dark) {
    document.documentElement.classList.add('dark');
    document.body.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
    document.body.classList.remove('dark');
  }
  if (typeof window._updateGraphThemeVars === 'function') {
    try { window._updateGraphThemeVars(); } catch (e) { /* ignore */ }
  } else {
    const vars = {
      '--line-color': dark ? '#dcdcdc' : '#444444',
      '--spine-color': dark ? '#bdbdbd' : '#666666',
      '--raw-edge-color': '#333333',
      '--label-box-fill': dark ? 'rgba(0,0,0,0.88)' : 'rgba(255,255,255,0.92)',
      '--label-box-stroke': dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      '--label-text-fill': dark ? '#ffffff' : '#111111',
      '--label-text-stroke': dark ? '#000000' : '#ffffff',
      '--label-text-stroke-width': dark ? '1.0' : '0.6',
      '--anchor-dot-fill': dark ? '#ffffff' : '#2c3e50',
      '--anchor-dot-stroke': dark ? '#000000' : '#ffffff',
      '--bypass-fill': dark ? '#ffffff' : '#2c3e50',
      '--bypass-stroke': dark ? '#000000' : '#ffffff'
    };
    document.querySelectorAll('.graphWrapper').forEach(w => {
      for (const [k, v] of Object.entries(vars)) w.style.setProperty(k, v);
    });
  }
}

function setupDarkMode() {
  const toggle = document.getElementById("darkModeToggle");
  if (!toggle) return;

  const dark = isDarkMode();
  applyThemeClass(dark);
  toggle.textContent = dark ? "☀️ Light Mode" : "🌙 Dark Mode";

  toggle.addEventListener("click", () => {
    const nowDark = !document.documentElement.classList.contains('dark');
    applyThemeClass(nowDark);
    localStorage.setItem('darkMode', nowDark ? 'true' : 'false');
    toggle.textContent = nowDark ? "☀️ Light Mode" : "🌙 Dark Mode";
  });
}

/* ===============================
   Toast helper
   =============================== */
function showToast(message) {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

/* ===============================
   Info bubble behavior
   =============================== */
(function () {
  const infoBtn = document.getElementById('infoButton');
  const infoPanel = document.getElementById('infoPanel');
  const infoClose = document.getElementById('infoClose');

  if (!infoBtn || !infoPanel) return;

  function openPanel() {
    const btnRect = infoBtn.getBoundingClientRect();
    infoPanel.style.top = (window.scrollY + btnRect.bottom + 8) + 'px';
    infoPanel.style.left = (window.scrollX + btnRect.left) + 'px';
    infoPanel.classList.add('open');
    infoPanel.setAttribute('aria-hidden', 'false');
    infoBtn.setAttribute('aria-expanded', 'true');
    infoClose.focus();
  }

  function closePanel() {
    infoPanel.classList.remove('open');
    infoPanel.setAttribute('aria-hidden', 'true');
    infoBtn.setAttribute('aria-expanded', 'false');
    infoBtn.focus();
  }

  infoBtn.addEventListener('click', function () {
    const expanded = infoBtn.getAttribute('aria-expanded') === 'true';
    if (expanded) closePanel(); else openPanel();
  });

  infoClose.addEventListener('click', closePanel);

  document.addEventListener('click', function (e) {
    if (!infoPanel.classList.contains('open')) return;
    if (infoPanel.contains(e.target) || infoBtn.contains(e.target)) return;
    closePanel();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && infoPanel.classList.contains('open')) closePanel();
  });

  window.addEventListener('resize', function () {
    if (infoPanel.classList.contains('open')) openPanel();
  });
  window.addEventListener('scroll', function () {
    if (infoPanel.classList.contains('open')) openPanel();
  });
})();

/* ===============================
   Data loading & recipe helpers
   =============================== */
async function fetchJson(url) {
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`Fetch failed: ${url} (${resp.status})`);
  return resp.json();
}

async function loadRecipes() {
  const localPath = "data/recipes.json";
  const remotePath = "https://srcraftingcalculations.github.io/sr-crafting-calculator/data/recipes.json";

  let data = null;
  try {
    data = await fetchJson(localPath);
    console.info("Loaded recipes from local data/recipes.json");
  } catch (localErr) {
    console.warn("Local recipes.json not found or failed to load, falling back to remote:", localErr);
    try {
      data = await fetchJson(remotePath);
      console.info("Loaded recipes from remote URL");
    } catch (remoteErr) {
      console.error("Failed to load recipes from remote URL as well:", remoteErr);
      const out = document.getElementById("outputArea");
      if (out) out.innerHTML = `<p style="color:red;">Error loading recipe data. Please try again later.</p>`;
      return {};
    }
  }

  if (!data || typeof data !== "object") {
    console.error("Invalid recipe data format");
    return {};
  }

  // Assign RECIPES and compute TIERS purely in memory
  RECIPES = data;
  TIERS = {};

  for (const [name, recipe] of Object.entries(RECIPES)) {
    if (typeof recipe?.tier === "number") TIERS[name] = recipe.tier;
    else TIERS[name] = 0;
  }

  // propagate tiers until stable (bounded passes)
  let changed = true;
  for (let pass = 0; pass < 50 && changed; pass++) {
    changed = false;
    for (const [name, recipe] of Object.entries(RECIPES)) {
      if (!recipe || !recipe.inputs) continue;
      let maxInputTier = -1;
      for (const inputName of Object.keys(recipe.inputs)) {
        const t = TIERS[inputName] ?? 0;
        if (t > maxInputTier) maxInputTier = t;
      }
      const newTier = (maxInputTier >= 0) ? (maxInputTier + 1) : 1;
      if (TIERS[name] !== newTier) {
        TIERS[name] = newTier;
        changed = true;
      }
    }
  }

  // Ensure BBM exists and is at least 0
  TIERS[BBM_ID] = TIERS[BBM_ID] ?? 0;

  window.RECIPES = RECIPES;
  window.TIERS = TIERS;
  console.info("Recipes loaded:", Object.keys(RECIPES).length, "items");
  return RECIPES;
}

/* ===============================
   Expand production chain
   =============================== */
function getRecipe(name) {
  return RECIPES[name] || null;
}

function expandChain(item, targetRate) {
  const chain = {};
  const machineTotals = {};
  const extractorTotals = {};
  const pending = {};
  const processed = {};
  const queue = [];

  function trackExtractor(name, rate) {
    extractorTotals[name] = (extractorTotals[name] || 0) + rate;
  }

  function enqueue(name, rate) {
    const recipe = getRecipe(name);
    if (!recipe) {
      trackExtractor(name, rate);
      if (!chain[name]) {
        chain[name] = { rate, raw: true, building: "RAW", machines: 0, inputs: {} };
      } else {
        chain[name].rate += rate;
      }
      return;
    }
    pending[name] = (pending[name] || 0) + rate;
    if (!processed[name]) queue.push(name);
  }

  enqueue(item, targetRate);

  while (queue.length > 0) {
    queue.sort((a, b) => (TIERS[b] ?? 0) - (TIERS[a] ?? 0));
    const current = queue.shift();
    if (processed[current]) continue;
    processed[current] = true;

    const rate = pending[current];
    const recipe = getRecipe(current);
    if (!recipe) {
      trackExtractor(current, rate);
      continue;
    }

    const craftsPerMin = rate / recipe.output;
    const outputPerMinPerMachine = (recipe.output * 60) / recipe.time;
    const machines = Math.ceil(rate / outputPerMinPerMachine);

    chain[current] = {
      rate,
      raw: false,
      building: recipe.building,
      machines,
      inputs: {}
    };

    machineTotals[recipe.building] = (machineTotals[recipe.building] || 0) + machines;

    for (const [input, qty] of Object.entries(recipe.inputs)) {
      const inputRate = craftsPerMin * qty;
      chain[current].inputs[input] = inputRate;
      enqueue(input, inputRate);
    }
  }

  return { chain, machineTotals, extractorTotals };
}

/* ===============================
   Depth computation & graph data
   =============================== */
function computeDepthsFromTiers(chain, rootItem) {
  const depths = {};
  const MAX_PASSES = 6;

  // Helper: initialize base depths from TIERS (no +1)
  function initBaseDepths() {
    for (const item of Object.keys(chain || {})) {
      const tableLevel = Number(TIERS?.[item] ?? 0);
      depths[item] = Number.isFinite(tableLevel) ? Math.floor(tableLevel) : 0;
    }

    // Raw defaults
    for (const item of Object.keys(chain || {})) {
      if (chain[item].raw) {
        if (FORCED_RAW_ORES.includes(item)) depths[item] = 0;
        else if (!(item in TIERS)) depths[item] = 0;
      }
    }

    // Heuristic: items whose inputs are all raw -> depth 0
    for (const [item, data] of Object.entries(chain || {})) {
      const inputs = data.inputs || {};
      const inputNames = Object.keys(inputs);
      if (inputNames.length > 0) {
        const allInputsRaw = inputNames.every(inName => {
          const inNode = chain[inName];
          return !!(inNode && inNode.raw);
        });
        if (allInputsRaw) depths[item] = 0;
      }
    }

    // Normalize
    for (const k of Object.keys(depths)) {
      let v = Number(depths[k]);
      if (!Number.isFinite(v) || isNaN(v)) v = 0;
      depths[k] = Math.max(0, Math.floor(v));
    }
  }

  // Helper: compute earliest consumer depth for a given raw name
  function earliestConsumerDepth(rawName) {
    let min = Infinity;
    for (const [consumerName, consumerData] of Object.entries(chain || {})) {
      const inputs = consumerData.inputs || {};
      if (Object.prototype.hasOwnProperty.call(inputs, rawName)) {
        const d = Number(depths[consumerName] ?? (Number(TIERS?.[consumerName] ?? 0)));
        if (Number.isFinite(d) && d < min) min = d;
      }
    }
    return min;
  }

  // Start with base depths
  initBaseDepths();

  // Iteratively apply raw-placement and optional shifting until stable or max passes
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const prev = {};
    for (const k of Object.keys(depths)) prev[k] = depths[k];

    // 1) Place LEFT_OF_CONSUMER_RAWS one column left of earliest consumer (if any)
    for (const rawName of LEFT_OF_CONSUMER_RAWS) {
      if (!(rawName in chain)) continue;
      const minConsumer = earliestConsumerDepth(rawName);
      if (minConsumer === Infinity) {
        // no consumer in this chain — keep existing or default 0
        depths[rawName] = Math.max(0, depths[rawName] ?? 0);
      } else {
        // place raw immediately left of earliest consumer
        const target = Math.max(0, Math.floor(minConsumer) - 1);
        depths[rawName] = target;
      }
    }

    // 2) For any raw that exists only because it's an input (i.e., present but not a table item),
    //    ensure it sits immediately left of its earliest consumer as well.
    for (const item of Object.keys(chain || {})) {
      if (!chain[item].raw) continue;
      // If this raw has consumers, place it left of earliest consumer
      const minConsumer = earliestConsumerDepth(item);
      if (minConsumer !== Infinity) {
        depths[item] = Math.max(0, Math.floor(minConsumer) - 1);
      } else {
        // otherwise keep current/default
        depths[item] = Math.max(0, depths[item] ?? 0);
      }
    }

    // 3) Normalize before deciding shift
    for (const k of Object.keys(depths)) {
      let v = Number(depths[k]);
      if (!Number.isFinite(v) || isNaN(v)) v = 0;
      depths[k] = Math.max(0, Math.floor(v));
    }

    // 4) If any raw is at depth 0, enforce raw-left rule: set all raws to 0 and shift non-raw +1
    const rawItems = Object.keys(chain || {}).filter(i => chain[i] && chain[i].raw);
    const anyRawAtZero = rawItems.length > 0 && rawItems.some(r => depths[r] === 0);
    if (anyRawAtZero) {
      for (const r of rawItems) depths[r] = 0;
      for (const k of Object.keys(depths)) {
        if (!(chain[k] && chain[k].raw)) depths[k] = Math.max(0, Math.floor(depths[k]) + 1);
      }
    }

    // 5) Final normalization for this pass
    for (const k of Object.keys(depths)) {
      let v = Number(depths[k]);
      if (!Number.isFinite(v) || isNaN(v)) v = 0;
      depths[k] = Math.max(0, Math.floor(v));
    }

    // 6) If stable, break early
    let stable = true;
    for (const k of Object.keys(depths)) {
      if (prev[k] !== depths[k]) { stable = false; break; }
    }
    if (stable) break;
  }

  // Final clamp and return
  for (const k of Object.keys(depths)) {
    let v = Number(depths[k]);
    if (!Number.isFinite(v) || isNaN(v)) v = 0;
    depths[k] = Math.max(0, Math.floor(v));
  }

  return depths;
}

/* ===============================
   Helper: detect if pointer target is a node
   =============================== */
function pointerIsOnNode(ev) {
  return !!(ev.target && ev.target.closest && ev.target.closest('g.graph-node[data-id]'));
}

/* ===============================
   Zoom / pan utilities (pointer-based)
   =============================== */
function ensureResetButton() {
  let btn = document.querySelector('.graphResetButton');
  const graphArea = document.getElementById('graphArea');
  if (!graphArea) return null;

  if (btn && btn.nextElementSibling !== graphArea) {
    btn.remove();
    btn = null;
  }

  if (!btn) {
    btn = document.createElement('div');
    btn.className = 'graphResetButton';
    btn.innerHTML = `<button id="resetViewBtn" type="button">Reset view</button>`;
    graphArea.parentNode.insertBefore(btn, graphArea);
    btn.style.display = 'flex';
    btn.style.justifyContent = 'center';
    btn.style.alignItems = 'center';
    btn.style.padding = '8px 12px';
    btn.style.boxSizing = 'border-box';
    btn.style.background = 'transparent';
    btn.style.zIndex = '20';
    btn.style.pointerEvents = 'auto';
  }

  function adjustGraphTopPadding() {
    if (!btn || !graphArea) return;
    const h = Math.max(0, btn.offsetHeight || 0);
    const gap = 8;
    graphArea.style.paddingTop = (h + gap) + 'px';
  }

  requestAnimationFrame(() => adjustGraphTopPadding());

  let resizeTimer = null;
  function onResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => adjustGraphTopPadding(), 80);
  }
  window.removeEventListener('resize', onResize);
  window.addEventListener('resize', onResize);

  return btn;
}

function setupGraphZoom(containerEl, { autoFit = true, resetButtonEl = null } = {}) {
  if (!containerEl) return;

  const svg = containerEl.querySelector('svg.graphSVG');
  const zoomLayer = svg.querySelector('#zoomLayer');
  const resetBtn = resetButtonEl || document.querySelector('#resetViewBtn');

  let scale = 1;
  let tx = 0;
  let ty = 0;
  let isPanning = false;
  let startX = 0;
  let startY = 0;
  let activePointerId = null;

  function getContentBBox() {
    const vb = svg.viewBox.baseVal;
    if (vb && vb.width && vb.height) return { x: vb.x, y: vb.y, width: vb.width, height: vb.height };
    try { return zoomLayer.getBBox(); } catch (e) { return { x: 0, y: 0, width: svg.clientWidth, height: svg.clientHeight }; }
  }

  function getViewSizeInSvgCoords() {
    const rect = svg.getBoundingClientRect();
    const ptTL = svg.createSVGPoint(); ptTL.x = 0; ptTL.y = 0;
    const ptBR = svg.createSVGPoint(); ptBR.x = rect.width; ptBR.y = rect.height;
    const svgTL = ptTL.matrixTransform(svg.getScreenCTM().inverse());
    const svgBR = ptBR.matrixTransform(svg.getScreenCTM().inverse());
    return { width: svgBR.x - svgTL.x, height: svgBR.y - svgTL.y };
  }

  function clampTranslation(proposedTx, proposedTy, proposedScale) {
    const bbox = getContentBBox();
    const view = getViewSizeInSvgCoords();
    const layerW = bbox.width * proposedScale;
    const layerH = bbox.height * proposedScale;

    // small buffer in SVG coords
    const marginSvgY = Math.max(8, view.height * 0.03);

    const minTxLarge = view.width - layerW - bbox.x * proposedScale;
    const maxTxLarge = -bbox.x * proposedScale;
    // Correct vertical bounds: use content bottom explicitly and add a small margin
    const minTyLarge = view.height - (bbox.y + bbox.height) * proposedScale - marginSvgY;
    const maxTyLarge = -bbox.y * proposedScale + marginSvgY;

    const overlapFraction = 0.12;
    const allowedExtraX = Math.max((view.width - layerW) * (1 - overlapFraction), 0);
    const allowedExtraY = Math.max((view.height - layerH) * (1 - overlapFraction), 0);

    let clampedTx = proposedTx;
    let clampedTy = proposedTy;

    if (layerW > view.width) {
      clampedTx = Math.min(maxTxLarge, Math.max(minTxLarge, proposedTx));
    } else {
      const centerTx = (view.width - layerW) / 2 - bbox.x * proposedScale;
      const minTxSmall = centerTx - allowedExtraX / 2;
      const maxTxSmall = centerTx + allowedExtraX / 2;
      clampedTx = Math.min(maxTxSmall, Math.max(minTxSmall, proposedTx));
    }

    if (layerH > view.height) {
      clampedTy = Math.min(maxTyLarge, Math.max(minTyLarge, proposedTy));
    } else {
      const centerTy = (view.height - layerH) / 2 - bbox.y * proposedScale;
      const minTySmall = centerTy - allowedExtraY / 2 - marginSvgY;
      const maxTySmall = centerTy + allowedExtraY / 2 + marginSvgY;
      clampedTy = Math.min(maxTySmall, Math.max(minTySmall, proposedTy));
    }

    return { tx: clampedTx, ty: clampedTy };
  }

  function applyTransform() {
    const clamped = clampTranslation(tx, ty, scale);
    tx = clamped.tx;
    ty = clamped.ty;
    zoomLayer.setAttribute('transform', `scale(${scale}) translate(${tx},${ty})`);
  }

  function zoomAt(newScale, cx, cy) {
    const pt = svg.createSVGPoint();
    pt.x = cx; pt.y = cy;
    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());

    const localX = (svgP.x - tx) / scale;
    const localY = (svgP.y - ty) / scale;

    const newTx = svgP.x - newScale * localX;
    const newTy = svgP.y - newScale * localY;

    scale = newScale;
    tx = newTx;
    ty = newTy;

    applyTransform();
  }

  svg.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const delta = -ev.deltaY;
    const factor = delta > 0 ? 1.08 : 0.92;
    const newScale = Math.min(3, Math.max(0.25, +(scale * factor).toFixed(3)));
    zoomAt(newScale, ev.clientX, ev.clientY);
  }, { passive: false });

  svg.addEventListener('pointerdown', (ev) => {
    if (pointerIsOnNode(ev)) return;
    if (ev.button !== 0) return;
    isPanning = true;
    activePointerId = ev.pointerId;
    startX = ev.clientX;
    startY = ev.clientY;
    try { svg.setPointerCapture(ev.pointerId); } catch (e) {}
    svg.style.cursor = 'grabbing';
  });

  window.addEventListener('pointermove', (ev) => {
    if (!isPanning || ev.pointerId !== activePointerId) return;
    const dxScreen = ev.clientX - startX;
    const dyScreen = ev.clientY - startY;
    startX = ev.clientX;
    startY = ev.clientY;

    const p0 = svg.createSVGPoint(); p0.x = 0; p0.y = 0;
    const p1 = svg.createSVGPoint(); p1.x = dxScreen; p1.y = dyScreen;
    const svg0 = p0.matrixTransform(svg.getScreenCTM().inverse());
    const svg1 = p1.matrixTransform(svg.getScreenCTM().inverse());
    const dxSvg = svg1.x - svg0.x;
    const dySvg = svg1.y - svg0.y;

    tx += dxSvg;
    ty += dySvg;
    applyTransform();
  });

  window.addEventListener('pointerup', (ev) => {
    if (!isPanning || ev.pointerId !== activePointerId) return;
    isPanning = false;
    activePointerId = null;
    try { svg.releasePointerCapture(ev.pointerId); } catch (e) {}
    svg.style.cursor = 'grab';
  });

  svg.style.cursor = 'grab';

  function computeAutoFit() {
    const bbox = getContentBBox();
    const view = getViewSizeInSvgCoords();
    if (bbox.width === 0 || bbox.height === 0) {
      scale = 1; tx = 0; ty = 0; applyTransform(); return;
    }

    const pad = 0.92;
    const scaleX = (view.width * pad) / bbox.width;
    const scaleY = (view.height * pad) / bbox.height;
    const fitScale = Math.min(scaleX, scaleY);

    scale = Math.min(3, Math.max(0.25, fitScale));

    const layerW = bbox.width * scale;
    const layerH = bbox.height * scale;
    tx = (view.width - layerW) / 2 - bbox.x * scale;
    ty = (view.height - layerH) / 2 - bbox.y * scale;

    applyTransform();
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      computeAutoFit();
      showToast("View reset");
    });
  }

  if (autoFit) requestAnimationFrame(() => computeAutoFit());
  else applyTransform();

  containerEl._teardownGraphZoom = () => { /* no-op */ };

  function getContentBBox() {
    try { return zoomLayer.getBBox(); } catch (e) { return { x: 0, y: 0, width: svg.clientWidth, height: svg.clientHeight }; }
  }
  function getViewSizeInSvgCoords() {
    const rect = svg.getBoundingClientRect();
    const ptTL = svg.createSVGPoint(); ptTL.x = 0; ptTL.y = 0;
    const ptBR = svg.createSVGPoint(); ptBR.x = rect.width; ptBR.y = rect.height;
    const svgTL = ptTL.matrixTransform(svg.getScreenCTM().inverse());
    const svgBR = ptBR.matrixTransform(svg.getScreenCTM().inverse());
    return { width: svgBR.x - svgTL.x, height: svgBR.y - svgTL.y };
  }
}

/* ===============================
   Build graph nodes and logical links from the expanded chain
   =============================== */
function buildGraphData(chain, rootItem) {
  const nodes = [];
  const links = [];
  const nodeMap = new Map();

  // Create node objects for every item in the chain
  for (const [item, data] of Object.entries(chain || {})) {
    const node = {
      id: item,
      label: item,
      raw: !!data.raw,
      building: data.building || null,
      machines: data.machines || 0,
      inputs: Object.assign({}, data.inputs || {})
    };
    nodes.push(node);
    nodeMap.set(item, node);
  }

  // Create logical links: consumer -> input
  for (const [consumer, data] of Object.entries(chain || {})) {
    const inputs = data.inputs || {};
    for (const inputName of Object.keys(inputs)) {
      // Only add links when both ends exist in the node set
      if (nodeMap.has(consumer) && nodeMap.has(inputName)) {
        links.push({ from: consumer, to: inputName });
      }
    }
  }

  // Compute depths (columns) using existing tier logic
  const depths = typeof computeDepthsFromTiers === 'function'
    ? computeDepthsFromTiers(chain, rootItem || null)
    : {};

  // Attach depth to nodes (default to 0)
  for (const n of nodes) {
    n.depth = Number.isFinite(Number(depths[n.id])) ? Number(depths[n.id]) : 0;
  }

  return { nodes, links };
}

/* ===============================
   Normalize node depths so raw nodes are depth 0 and every column is one hop higher
   (BFS-based, compacts to contiguous integers starting at 0)
   =============================== */
function normalizeDepthsToHops(nodes, links) {
  nodes = nodes || window._graphNodes || [];
  links = links || window._graphLinks || [];

  const byId = new Map(nodes.map(n => [n.id, n]));
  const adj = new Map(nodes.map(n => [n.id, []]));
  for (const l of links) {
    if (adj.has(l.from) && adj.has(l.to)) adj.get(l.from).push(l.to);
  }

  // BFS from raw nodes
  const dist = new Map();
  const q = [];
  for (const n of nodes) {
    if (n.raw) { dist.set(n.id, 0); q.push(n.id); }
  }
  while (q.length) {
    const cur = q.shift();
    for (const nb of adj.get(cur) || []) {
      if (!dist.has(nb)) { dist.set(nb, dist.get(cur) + 1); q.push(nb); }
    }
  }

  // provisional depths and fallback for unreachable nodes
  const maxDist = dist.size ? Math.max(...dist.values()) : 0;
  const unreachableDepth = maxDist + 1;
  for (const n of nodes) {
    n._provisionalDepth = dist.has(n.id) ? dist.get(n.id) : unreachableDepth;
  }

  // compact provisional depths to contiguous integers starting at 0
  const unique = Array.from(new Set(nodes.map(n => n._provisionalDepth))).sort((a,b)=>a-b);
  const map = new Map(unique.map((d,i)=>[d,i]));
  for (const n of nodes) {
    n.depth = map.get(n._provisionalDepth);
    delete n._provisionalDepth;
  }

  // expose for debugging and return
  window._graphNodes = nodes;
  window._graphLinks = links;
  window._depthNormalizationMap = map;
  return { nodes, links, depthMap: map };
}

/* ===============================
   Render graph (core)
   - This is a condensed, self-contained renderer that uses node.depth values.
   - It includes the left-helper suppression logic: if a node is routed via bypass,
     the vertical node->helper connector is suppressed (helper dot/anchor still rendered).
   =============================== */
function renderGraph(nodes, links, rootItem) {
  const nodeRadius = 22;
  const ANCHOR_RADIUS = 5;
  const ANCHOR_HIT_RADIUS = 12;
  const ANCHOR_OFFSET = 18;

  function roundCoord(v) { return Math.round(v * 100) / 100; }
  function anchorRightPos(node) { return { x: roundCoord(node.x + nodeRadius + ANCHOR_OFFSET), y: roundCoord(node.y) }; }
  function anchorLeftPos(node)  { return { x: roundCoord(node.x - nodeRadius - ANCHOR_OFFSET), y: roundCoord(node.y) }; }

  // Ensure defaults
  for (const n of nodes) {
    if (typeof n.hasInputAnchor === 'undefined') n.hasInputAnchor = true;
    if (typeof n.hasOutputAnchor === 'undefined') n.hasOutputAnchor = true;
    if (typeof n.depth === 'undefined') n.depth = 0;
    if (typeof n.machines === 'undefined') n.machines = 0;
  }

  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const columns = {};
  for (const node of nodes) {
    if (!columns[node.depth]) columns[node.depth] = [];
    columns[node.depth].push(node);
  }
  const depthsSorted = Object.keys(columns).map(Number).sort((a,b)=>a-b);
  const _depthIndex = new Map(depthsSorted.map((d,i)=>[d,i]));

  // Layout nodes in columns and rows
  for (const [depth, colNodes] of Object.entries(columns)) {
    colNodes.sort((a,b) => String(a.label || a.id).localeCompare(String(b.label || b.id), undefined, { sensitivity: 'base' }));
    const idx = _depthIndex.get(Number(depth)) ?? 0;
    colNodes.forEach((node, i) => {
      node.x = roundCoord(idx * MACHINE_COL_WIDTH + 100);
      node.y = roundCoord(i * GRAPH_ROW_HEIGHT + 100);
    });
  }

  // Compute bypass maps (needsOutputBypass / needsInputBypass) similar to prior logic
  const needsOutputBypass = new Map();
  const needsInputBypass = new Map();

  // Build columns array for easier access
  const columnsArr = depthsSorted.map(d => columns[d] || []);

  // For each output column, determine if an output bypass is needed (consumer depths > outDepth+1)
  for (const outDepth of depthsSorted) {
    const col = columns[outDepth] || [];
    // find consumers that are more than one column to the right
    const causingConsumers = new Set();
    for (const node of col) {
      for (const l of links) {
        if (l.from === node.id) {
          const dst = nodeById.get(l.to);
          if (!dst) continue;
          if (dst.depth > outDepth + 1) causingConsumers.add(dst.depth);
        }
      }
    }
    if (causingConsumers.size > 0) {
      // choose a y position roughly at the top of the column for the bypass spine
      const y = col.length ? Math.min(...col.map(n => n.y)) : 0;
      needsOutputBypass.set(outDepth, { x: (outDepth + 0.5) * MACHINE_COL_WIDTH + 100, y, causingConsumers });
    }
  }

  // For each consumer column that receives bypasses, compute input bypass helper center
  for (const consumerDepth of depthsSorted) {
    // find top-most input node in this column that has an input anchor
    const col = columns[consumerDepth] || [];
    const inputNodes = col.filter(n => n.hasInputAnchor && !(n.raw && n.depth === 0));
    if (!inputNodes.length) continue;
    // find any output bypass that targets this consumerDepth
    for (const [outDepth, info] of needsOutputBypass.entries()) {
      if (info.causingConsumers && info.causingConsumers.has(consumerDepth)) {
        // choose the top input node as the anchor for the bypass
        const topInputNode = inputNodes.reduce((a,b)=> a.y < b.y ? a : b);
        const helperCenter = anchorLeftPos(topInputNode);
        needsInputBypass.set(consumerDepth, { x: helperCenter.x, y: info.y, helperCenter, routedNodeIds: new Set(inputNodes.map(n=>n.id)) });
        break;
      }
    }
  }

  // Build a set of specifically routed input node ids for quick lookup
  const routedInputNodeIds = new Set();
  for (const [cd, info] of needsInputBypass.entries()) {
    if (info && info.routedNodeIds) {
      for (const id of info.routedNodeIds) routedInputNodeIds.add(id);
    }
  }
  // expose for debugging
  window._needsOutputBypass = needsOutputBypass;
  window._needsInputBypass = needsInputBypass;
  window._routedInputNodeIds = routedInputNodeIds;

  // Begin building SVG inner markup (string assembly)
  let inner = '';

  // Content background and container
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
  const minX = nodes.length ? Math.min(...xs) : 0;
  const maxX = nodes.length ? Math.max(...xs) : 0;
  const minY = nodes.length ? Math.min(...ys) : 0;
  const maxY = nodes.length ? Math.max(...ys) : 0;
  const contentX = minX - nodeRadius - GRAPH_CONTENT_PAD;
  const contentY = minY - nodeRadius - GRAPH_CONTENT_PAD;
  const contentW = (maxX - minX) + (nodeRadius*2) + GRAPH_CONTENT_PAD*2;
  const contentH = (maxY - minY) + (nodeRadius*2) + GRAPH_CONTENT_PAD*2;

  inner += `<g id="graphContent" transform="translate(${contentX},${contentY})">`;

  // Emit bypass spines (visual rails)
  for (const [outDepth, info] of needsOutputBypass.entries()) {
    const x = roundCoord(info.x);
    const y = roundCoord(info.y);
    inner += `<line class="bypass-spine" x1="${x}" y1="${y}" x2="${x + 0.1}" y2="${y}" stroke="var(--spine-color)" stroke-width="2" stroke-linecap="round" />`;
  }

  // Emit bypass connectors from output column to input column helper centers
  for (const [consumerDepth, info] of needsInputBypass.entries()) {
    const x = roundCoord(info.x);
    const y = roundCoord(info.y);
    // small horizontal connector to helper center
    inner += `<line class="bypass-connector" x1="${x}" y1="${y}" x2="${info.helperCenter.x}" y2="${info.helperCenter.y}" stroke="var(--line-color)" stroke-width="1.4" stroke-linecap="round" />`;
    // helper dot will be rendered with node anchors below
  }

  // Emit direct center->center lines for raw->consumer (including flipped reversed links)
  (function emitDirectNodeLines() {
    const lineColor = isDarkMode() ? '#dcdcdc' : '#444444';
    const rawLineColor = '#333333';

    for (const link of links || []) {
      const a = nodeById.get(link.from);
      const b = nodeById.get(link.to);
      if (!a || !b) continue;

      // Determine which endpoint is the raw source.
      // Prefer the explicit raw source (a.raw). If the data is reversed (consumer -> raw),
      // flip it so we draw raw->consumer.
      let src = null, dst = null;
      if (a.raw && a.depth === Math.min(...depthsSorted)) {
        src = a; dst = b;
      } else if (b.raw && b.depth === Math.min(...depthsSorted)) {
        src = b; dst = a;
      } else {
        // neither endpoint qualifies as a raw in the far-left column; skip
        continue;
      }

      // Destination must be in minDepth or minDepth+1 to be eligible
      const minDepth = Math.min(...depthsSorted);
      if (!(dst.depth === minDepth || dst.depth === (minDepth + 1))) continue;

      // If there is a bypass that routes into dst.depth, skip emitting the vertical input connector
      // (we still want the center->center raw->consumer line to show the level step)
      const x1 = roundCoord(src.x);
      const y1 = roundCoord(src.y);
      const x2 = roundCoord(dst.x);
      const y2 = roundCoord(dst.y);

      const isRawDirect = (dst.building === 'Smelter' || dst.id === BBM_ID);
      const stroke = isRawDirect ? rawLineColor : lineColor;
      const width = isRawDirect ? 2.6 : 1.6;

      inner += `<line class="graph-edge direct-node-line" data-from="${escapeHtml(src.id)}" data-to="${escapeHtml(dst.id)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" />`;
    }
  })();

  // Emit nodes, anchors, and helper dots
  const defaultLineColor = isDarkMode() ? '#dcdcdc' : '#444444';
  const nodeFill = isDarkMode() ? '#111' : '#fff';
  const labelFill = isDarkMode() ? '#fff' : '#111';

  for (const node of nodes) {
    const x = roundCoord(node.x);
    const y = roundCoord(node.y);
    const fill = node.building ? (MACHINE_COLORS[node.building] || '#888') : nodeFill;
    const textColor = getTextColor(fill);

    // Node group
    inner += `<g class="graph-node" data-id="${escapeHtml(node.id)}" transform="translate(${x},${y})">`;
    inner += `<circle r="${nodeRadius}" fill="${fill}" stroke="#222" stroke-width="1.2" />`;
    inner += `<text x="0" y="6" text-anchor="middle" fill="${textColor}" font-size="11">${escapeHtml(node.label)}</text>`;
    inner += `</g>`;

    // Right helper (output anchor)
    if (node.hasOutputAnchor && !(node.raw && node.depth === Math.min(...depthsSorted))) {
      const a = anchorRightPos(node);
      inner += `<g class="helper-dot helper-output" data-node="${escapeHtml(node.id)}" data-side="right" transform="translate(${a.x},${a.y})" aria-hidden="true"><circle cx="0" cy="0" r="${ANCHOR_RADIUS}" fill="var(--bypass-fill)" stroke="var(--bypass-stroke)" stroke-width="1.2" /></g>`;
      inner += `<g class="anchor anchor-right" data-node="${escapeHtml(node.id)}" data-side="right" transform="translate(${a.x},${a.y})" tabindex="0" role="button" aria-label="Output anchor for ${escapeHtml(node.label)}"><circle class="anchor-hit" cx="0" cy="0" r="${ANCHOR_HIT_RADIUS}" fill="transparent" pointer-events="all" /><circle class="anchor-dot" cx="0" cy="0" r="${ANCHOR_RADIUS}" fill="var(--anchor-dot-fill)" stroke="var(--anchor-dot-stroke)" stroke-width="1.2" /></g>`;
      // short connector from node center to right helper
      inner += `<line class="node-to-helper" data-node="${escapeHtml(node.id)}" data-side="right" x1="${roundCoord(node.x + nodeRadius)}" y1="${node.y}" x2="${a.x}" y2="${a.y}" stroke="${defaultLineColor}" stroke-width="1.2" />`;
    }

    // Left helper (input anchor) - suppress vertical connector if this node is routed via bypass
    if (node.hasInputAnchor && !node.raw) {
      const a = anchorLeftPos(node);
      // helper center stored for anchors
      inner += `<g class="helper-dot helper-input" data-node="${escapeHtml(node.id)}" data-side="left" transform="translate(${a.x},${a.y})" aria-hidden="true"><circle cx="0" cy="0" r="${ANCHOR_RADIUS}" fill="var(--bypass-fill)" stroke="var(--bypass-stroke)" stroke-width="1.2" /></g>`;
      inner += `<g class="anchor anchor-left" data-node="${escapeHtml(node.id)}" data-side="left" transform="translate(${a.x},${a.y})" tabindex="0" role="button" aria-label="Input anchor for ${escapeHtml(node.label)}"><circle class="anchor-hit" cx="0" cy="0" r="${ANCHOR_HIT_RADIUS}" fill="transparent" pointer-events="all" /><circle class="anchor-dot" cx="0" cy="0" r="${ANCHOR_RADIUS}" fill="var(--anchor-dot-fill)" stroke="var(--anchor-dot-stroke)" stroke-width="1.2" /></g>`;

      // Only draw the short vertical connector if this node is NOT routed via bypass
      const routedToThisNode = routedInputNodeIds.has(node.id);
      if (!routedToThisNode) {
        inner += `<line class="node-to-helper" data-node="${escapeHtml(node.id)}" data-side="left" x1="${roundCoord(node.x - nodeRadius)}" y1="${node.y}" x2="${a.x}" y2="${a.y}" stroke="${defaultLineColor}" stroke-width="1.2" />`;
      }
    }
  }

  inner += `</g>`; // end graphContent

  // Insert into DOM (assumes container exists)
  const wrapper = document.querySelector('.graphWrapper');
  if (!wrapper) {
    console.warn('No .graphWrapper element found; skipping DOM render.');
    // expose inner for debugging
    window._graphInner = inner;
    return;
  }

  // Build full SVG if not present
  let svg = wrapper.querySelector('svg.graphSVG');
  if (!svg) {
    wrapper.innerHTML = `
      <svg class="graphSVG" xmlns="http://www.w3.org/2000/svg" width="100%" height="600" viewBox="0 0 ${contentW + 200} ${contentH + 200}">
        <defs></defs>
        <g id="zoomLayer">${inner}</g>
      </svg>
    `;
    svg = wrapper.querySelector('svg.graphSVG');
  } else {
    const zoomLayer = svg.querySelector('#zoomLayer');
    if (zoomLayer) zoomLayer.innerHTML = inner;
    else {
      svg.innerHTML = `<g id="zoomLayer">${inner}</g>`;
    }
  }

  // Setup zoom/pan if not already
  try {
    const containerEl = wrapper;
    if (!containerEl._teardownGraphZoom) setupGraphZoom(containerEl, { autoFit: true });
  } catch (e) {
    console.warn('Failed to setup graph zoom:', e);
  }
}

/* ===============================
   Orchestrator: expand chain, build graph, normalize depths, render
   - This is the canonical place to call when you want to render a chain.
   =============================== */
function renderChainGraph(item, targetRate, rootItem) {
  const { chain, machineTotals, extractorTotals } = expandChain(item, targetRate);
  const { nodes, links } = buildGraphData(chain, rootItem);

  // Normalize depths so raw nodes are depth 0 and every column is one hop higher
  normalizeDepthsToHops(nodes, links);

  // Expose for debugging
  window._graphNodes = nodes;
  window._graphLinks = links;
  window._chain = chain;
  window._machineTotals = machineTotals;
  window._extractorTotals = extractorTotals;

  // Render
  if (typeof renderGraph === 'function') {
    renderGraph(nodes, links, rootItem);
  } else {
    console.error('renderGraph is not defined; cannot render graph.');
  }

  return { nodes, links, chain, machineTotals, extractorTotals };
}

/* ===============================
   Initialization & UI wiring
   - Minimal init that loads recipes and renders a default graph.
   - Replace or extend with your app's UI handlers as needed.
   =============================== */
async function initApp() {
  try {
    await loadRecipes();
  } catch (e) {
    console.error('Failed to load recipes during init:', e);
  }

  setupDarkMode();

  // Wire a simple "render" button if present
  const renderBtn = document.getElementById('renderGraphBtn');
  if (renderBtn) {
    renderBtn.addEventListener('click', () => {
      const itemInput = document.getElementById('itemInput');
      const rateInput = document.getElementById('rateInput');
      const item = itemInput && itemInput.value ? itemInput.value : BBM_ID;
      const rate = rateInput && Number(rateInput.value) ? Number(rateInput.value) : 1;
      renderChainGraph(item, rate, item);
      showToast('Graph rendered');
    });
  }

  // If there is a default area to render on load, render Basic Building Material at rate 1
  try {
    renderChainGraph(BBM_ID, 1, BBM_ID);
  } catch (e) {
    console.error('Initial render failed:', e);
  }
}

// Auto-init on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  try { initApp(); } catch (e) { console.error('initApp error', e); }
});
