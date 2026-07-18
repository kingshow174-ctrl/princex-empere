// ============================================
// PRINCEX EMPERE — Chart v7 REBUILT
// Clean, fast, auto-scaling for all pairs
// ============================================

const DC = {
  candles: [], live: null, offset: 0, zoom: 1,
  drag: false, dragX: 0, dragOff: 0,
  pinch: 0, pinchZ: 1,
  raf: null, canvas: null, ctx: null,
  signal: null, price: null, sym: "V50",
};

// ── INIT ─────────────────────────────────────
function dcInit() {
  const cv = document.getElementById("dc-canvas");
  if (!cv) return;
  DC.canvas = cv;

  // Touch
  cv.addEventListener("touchstart", e => {
    e.preventDefault();
    if (e.touches.length === 1) {
      DC.drag = true;
      DC.dragX = e.touches[0].clientX;
      DC.dragOff = DC.offset;
    } else {
      DC.drag = false;
      DC.pinch = dcDist(e.touches);
      DC.pinchZ = DC.zoom;
    }
  }, { passive: false });

  cv.addEventListener("touchmove", e => {
    e.preventDefault();
    if (e.touches.length === 1 && DC.drag) {
      const dx = DC.dragX - e.touches[0].clientX;
      const step = Math.round(dx / dcSlotW());
      DC.offset = Math.max(0, Math.min(dcMaxOff(), DC.dragOff + step));
    } else if (e.touches.length === 2) {
      const d = dcDist(e.touches);
      DC.zoom = Math.max(0.2, Math.min(10, DC.pinchZ * d / (DC.pinch || d)));
    }
  }, { passive: false });

  cv.addEventListener("touchend", () => DC.drag = false);

  // Mouse
  cv.addEventListener("mousedown", e => { DC.drag = true; DC.dragX = e.clientX; DC.dragOff = DC.offset; });
  cv.addEventListener("mousemove", e => {
    if (!DC.drag) return;
    const step = Math.round((DC.dragX - e.clientX) / dcSlotW());
    DC.offset = Math.max(0, Math.min(dcMaxOff(), DC.dragOff + step));
  });
  cv.addEventListener("mouseup",    () => DC.drag = false);
  cv.addEventListener("mouseleave", () => DC.drag = false);
  cv.addEventListener("wheel", e => {
    e.preventDefault();
    DC.zoom = Math.max(0.2, Math.min(10, DC.zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
  }, { passive: false });

  dcFitCanvas();
  window.addEventListener("resize", dcFitCanvas);
  if (!DC.raf) dcRun();
}

function dcFitCanvas() {
  const cv = DC.canvas; if (!cv) return;
  const dpr = window.devicePixelRatio || 1;
  const W = cv.offsetWidth, H = cv.offsetHeight;
  cv.width  = W * dpr; cv.height = H * dpr;
  DC.ctx = cv.getContext("2d");
  DC.ctx.scale(dpr, dpr);
}

function dcDist(t) {
  return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
}

function dcVisible()  { return Math.max(5, Math.round(40 / DC.zoom)); }
function dcSlotW()    { const W = DC.canvas?.offsetWidth || 360; return (W - 65) / dcVisible(); }
function dcMaxOff()   { return Math.max(0, dcAllCandles().length - dcVisible()); }
function dcAllCandles() {
  return DC.live ? [...DC.candles, { ...DC.live, _live: true }] : [...DC.candles];
}

// ── DRAW LOOP ─────────────────────────────────
function dcRun() {
  dcFrame();
  DC.raf = requestAnimationFrame(dcRun);
}

function dcFrame() {
  const cv = DC.canvas, ctx = DC.ctx;
  if (!cv || !ctx) return;
  const W = cv.offsetWidth, H = cv.offsetHeight;
  if (!W || !H) return;

  // BG
  ctx.fillStyle = "#0b0f1a";
  ctx.fillRect(0, 0, W, H);

  const RPAD = 65, TPAD = 10, BPAD = 26;
  const CW   = dcSlotW();
  const cW   = Math.max(1.5, CW * 0.65);
  const all  = dcAllCandles();

  if (all.length === 0) {
    ctx.fillStyle = "#334155"; ctx.font = "13px monospace";
    ctx.textAlign = "center";
    ctx.fillText("Waiting for data...", (W - RPAD) / 2, H / 2);
    ctx.textAlign = "left"; return;
  }

  // Visible slice
  const vis   = dcVisible();
  const total = all.length;
  const endI  = Math.min(total, Math.max(vis, total - DC.offset));
  const startI= Math.max(0, endI - vis);
  const sl    = all.slice(startI, endI);
  if (!sl.length) return;

  // ── AUTO SCALE: use only visible candles ──
  let hi = -Infinity, lo = Infinity;
  sl.forEach(c => { hi = Math.max(hi, c.high); lo = Math.min(lo, c.low); });
  const rng  = hi - lo || hi * 0.01 || 1;
  const pad  = rng * 0.1;
  hi += pad; lo -= pad;
  const drawH = H - TPAD - BPAD;
  const scY   = v => TPAD + drawH * (1 - (v - lo) / (hi - lo));

  // ── GRID ─────────────────────────────────────
  const gridN = 5;
  const dec   = hi < 10 ? 5 : hi < 100 ? 3 : hi < 10000 ? 2 : 0;
  ctx.strokeStyle = "rgba(255,255,255,0.04)"; ctx.lineWidth = 1;
  for (let i = 0; i <= gridN; i++) {
    const v = lo + (hi - lo) * i / gridN;
    const y = scY(v);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W - RPAD, y); ctx.stroke();
    ctx.fillStyle = "#475569"; ctx.font = "9px monospace"; ctx.textAlign = "left";
    ctx.fillText(v.toFixed(dec), W - RPAD + 3, y + 3);
  }

  // ── EMA ───────────────────────────────────────
  const closes = all.map(c => c.close);
  function ema(p) {
    if (closes.length < p) return [];
    const k = 2 / (p + 1), out = new Array(closes.length).fill(null);
    let e = closes.slice(0, p).reduce((a, b) => a + b, 0) / p;
    out[p - 1] = e;
    for (let i = p; i < closes.length; i++) { e = closes[i] * k + e * (1 - k); out[i] = e; }
    return out;
  }
  function drawEma(p, color, lbl) {
    const s = ema(p); if (!s.length) return;
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    let mv = true, last = null;
    sl.forEach((_, vi) => {
      const v = s[startI + vi];
      if (!v || v < lo || v > hi) { mv = true; return; }
      const x = vi * CW + CW / 2, y = scY(v);
      if (mv) { ctx.moveTo(x, y); mv = false; } else ctx.lineTo(x, y);
      last = { x, y, v };
    });
    ctx.stroke();
    if (last) {
      ctx.fillStyle = color; ctx.font = "8px monospace"; ctx.textAlign = "left";
      ctx.fillText(lbl + " " + last.v.toFixed(dec), W - RPAD + 3, last.y - 5);
    }
  }
  drawEma(20, "#3b82f6", "E20");
  drawEma(50, "#f59e0b", "E50");

  // ── VWAP ──────────────────────────────────────
  let pv = 0, vc = 0;
  all.slice(0, endI).forEach(c => { pv += (c.high + c.low + c.close) / 3; vc++; });
  const vwap = vc ? pv / vc : 0;
  if (vwap >= lo && vwap <= hi) {
    const vy = scY(vwap);
    ctx.strokeStyle = "rgba(245,200,66,0.4)"; ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(0, vy); ctx.lineTo(W - RPAD, vy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#f5c842"; ctx.font = "8px monospace"; ctx.textAlign = "left";
    ctx.fillText("VWAP", W - RPAD + 3, vy - 2);
  }

  // ── SL/TP ─────────────────────────────────────
  if (DC.signal?.fired) {
    const lvl = (price, color, lbl) => {
      const p = parseFloat(price);
      if (!p || p < lo || p > hi) return;
      const y = scY(p);
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash([5, 3]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W - RPAD, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color; ctx.font = "9px monospace";
      ctx.fillText(lbl, W - RPAD + 3, y + 3);
    };
    lvl(DC.signal.entry, "#fff",     "EN");
    lvl(DC.signal.sl,    "#ff3b5c",  "SL");
    lvl(DC.signal.tp1,   "#00e676",  "T1");
    lvl(DC.signal.tp2,   "#00ff88",  "T2");
  }

  // ── CANDLES ───────────────────────────────────
  sl.forEach((c, i) => {
    const live  = c._live === true;
    const bull  = c.close >= c.open;
    const color = live ? "#a78bfa" : (bull ? "#00e676" : "#ff3b5c");
    const x     = i * CW + CW / 2;
    const hY    = scY(c.high), lY = scY(c.low);
    const oY    = scY(c.open), cY = scY(c.close);
    const bTop  = Math.min(oY, cY);
    const bH    = Math.max(1.5, Math.abs(oY - cY));

    // Wick
    ctx.strokeStyle = live ? "#c4b5fd" : color;
    ctx.lineWidth   = Math.max(1, cW * 0.1);
    ctx.beginPath(); ctx.moveTo(x, hY); ctx.lineTo(x, lY); ctx.stroke();

    // Body
    if (live) {
      ctx.fillStyle = "rgba(167,139,250,0.4)";
      ctx.fillRect(x - cW/2, bTop, cW, bH);
      ctx.strokeStyle = "#a78bfa"; ctx.lineWidth = 1;
      ctx.strokeRect(x - cW/2, bTop, cW, bH);
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(x - cW/2, bTop, cW, bH);
    }
  });

  // ── GHOST CANDLES (predictions) ───────────────
  if (DC.signal?.fired && DC.signal.predictions && DC.offset === 0) {
    const atr  = parseFloat(DC.signal.details?.atr) || rng * 0.3;
    const base = sl[sl.length - 1]?.close || (hi + lo) / 2;
    DC.signal.predictions.forEach((p, i) => {
      const x = (sl.length + i) * CW + CW / 2;
      if (x > W - RPAD - 5) return;
      const rise  = p.dir === "RISE";
      const gc    = rise ? base + atr * 0.5 : base - atr * 0.5;
      const go    = base;
      const gh    = rise ? gc + atr*0.3 : go + atr*0.15;
      const gl    = rise ? go - atr*0.15 : gc - atr*0.3;
      if (gh > hi || gl < lo) return;
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = "#a855f7"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, scY(gh)); ctx.lineTo(x, scY(gl)); ctx.stroke();
      const bt = Math.min(scY(go), scY(gc)), bh2 = Math.max(2, Math.abs(scY(go) - scY(gc)));
      ctx.fillStyle = rise ? "rgba(124,58,237,0.5)" : "rgba(147,51,234,0.5)";
      ctx.fillRect(x - cW/2, bt, cW, bh2);
      ctx.strokeRect(x - cW/2, bt, cW, bh2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#a855f7"; ctx.font = "8px monospace"; ctx.textAlign = "center";
      ctx.fillText("C" + p.index, x, H - BPAD + 12);
      ctx.textAlign = "left";
    });
  }

  // ── LIVE PRICE LABEL ──────────────────────────
  const lp = DC.live?.close || DC.price || all[all.length-1]?.close;
  if (lp && lp >= lo && lp <= hi) {
    const py = scY(lp);
    // dashed line
    ctx.strokeStyle = "rgba(245,200,66,0.5)"; ctx.lineWidth = 1; ctx.setLineDash([2,3]);
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W - RPAD, py); ctx.stroke();
    ctx.setLineDash([]);
    // price box
    ctx.fillStyle = "#f5c842";
    ctx.fillRect(W - RPAD, py - 9, RPAD - 1, 18);
    ctx.fillStyle = "#000"; ctx.font = "bold 9px monospace"; ctx.textAlign = "center";
    ctx.fillText(lp.toFixed(dec), W - RPAD + (RPAD - 1) / 2, py + 4);
    ctx.textAlign = "left";
  }

  // ── TIME AXIS ─────────────────────────────────
  const ts = Math.max(1, Math.floor(sl.length / 5));
  ctx.fillStyle = "#334155"; ctx.font = "8px monospace";
  sl.forEach((c, i) => {
    if (i % ts !== 0) return;
    const dt = new Date((c.epoch || 0) * 1000);
    const t  = dt.getUTCHours().toString().padStart(2,"0") + ":" + dt.getUTCMinutes().toString().padStart(2,"0");
    ctx.fillText(t, i * CW + 2, H - 6);
  });

  // ── OVERLAYS ──────────────────────────────────
  // LIVE badge
  if (DC.live) {
    ctx.fillStyle = "rgba(0,230,118,0.12)"; ctx.fillRect(4, 4, 44, 16);
    ctx.fillStyle = "#00e676"; ctx.font = "bold 9px monospace";
    ctx.fillText("● LIVE", 7, 15);
  }

  // Right axis separator
  ctx.strokeStyle = "#1e2d45"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(W - RPAD, TPAD); ctx.lineTo(W - RPAD, H - BPAD); ctx.stroke();

  // Scroll hint
  if (DC.offset > 0) {
    ctx.fillStyle = "rgba(10,14,26,0.7)"; ctx.fillRect(0, TPAD, W - RPAD, 18);
    ctx.fillStyle = "#f5c842"; ctx.font = "9px monospace"; ctx.textAlign = "center";
    ctx.fillText("◀ " + DC.offset + " candles back — swipe right for latest ▶", (W-RPAD)/2, TPAD + 13);
    ctx.textAlign = "left";
  }

  // Info
  ctx.fillStyle = "#1e293b"; ctx.font = "8px monospace";
  ctx.fillText(DC.sym + "  " + all.length + " candles  x" + DC.zoom.toFixed(1), 4, H - 8);
}

// ── PUBLIC API ────────────────────────────────
function loadDerivChart(sym, gran) {
  const c = document.getElementById("deriv-chart-container");
  if (!c) return;
  if (DC.raf) { cancelAnimationFrame(DC.raf); DC.raf = null; }
  DC.sym = sym || "V50"; DC.offset = 0; DC.zoom = 1;
  c.innerHTML = `<canvas id="dc-canvas" style="width:100%;height:100%;display:block;touch-action:none;cursor:grab"></canvas>`;
  derivAddFullscreenBtn();
  dcInit();
}

function dcUpdateCandles(c)  { DC.candles = c; DC.offset = 0; }
function dcUpdateLiveCandle(c){ DC.live   = c; }
function dcUpdateSignal(s)   { DC.signal  = s; }
function dcUpdatePrice(p)    { DC.price   = p; }

function derivAddFullscreenBtn() {
  const c = document.getElementById("deriv-chart-container");
  if (!c) return;
  c.querySelector(".deriv-chart-fullscreen")?.remove();
  const b = document.createElement("button");
  b.className = "deriv-chart-fullscreen";
  b.textContent = "⛶";
  b.onclick = () => {
    const o = document.querySelector(".deriv-chart-outer");
    if (!o) return;
    o.classList.toggle("fullscreen");
    b.textContent = o.classList.contains("fullscreen") ? "✕" : "⛶";
    setTimeout(dcFitCanvas, 100);
  };
  c.appendChild(b);
}

function derivToggleFullscreen() {
  document.querySelector(".deriv-chart-fullscreen")?.click();
}
