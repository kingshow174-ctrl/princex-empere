// ============================================
// PRINCEX EMPERE — Deriv Strategy Builder
// Apply strategies as overlays on chart
// ============================================

const STRATEGIES = {
  active: [],  // list of active strategy IDs
  settings: {}, // per-strategy settings
};

const STRATEGY_LIST = [
  {
    id: "ema_cross",
    name: "EMA Cross",
    icon: "📈",
    desc: "Signal when EMA20 crosses EMA50",
    category: "TREND",
    settings: [
      { key: "fast",  label: "Fast EMA",  type: "number", default: 20, min: 2,  max: 50  },
      { key: "slow",  label: "Slow EMA",  type: "number", default: 50, min: 10, max: 200 },
      { key: "color_bull", label: "Bull Color", type: "color", default: "#00e676" },
      { key: "color_bear", label: "Bear Color", type: "color", default: "#ff3b5c" },
    ]
  },
  {
    id: "supertrend",
    name: "Supertrend",
    icon: "🔺",
    desc: "ATR-based trend direction line",
    category: "TREND",
    settings: [
      { key: "period",     label: "ATR Period",    type: "number", default: 10, min: 5, max: 50 },
      { key: "multiplier", label: "ATR Multiplier", type: "number", default: 3,  min: 1, max: 10 },
    ]
  },
  {
    id: "bollinger",
    name: "Bollinger Bands",
    icon: "🔵",
    desc: "Volatility bands around price",
    category: "VOLATILITY",
    settings: [
      { key: "period", label: "Period",   type: "number", default: 20, min: 5,   max: 100 },
      { key: "std",    label: "Std Dev",  type: "number", default: 2,  min: 0.5, max: 5   },
      { key: "color",  label: "Color",    type: "color",  default: "#3b82f6" },
    ]
  },
  {
    id: "rsi_signal",
    name: "RSI Signal",
    icon: "📊",
    desc: "Mark overbought/oversold zones on chart",
    category: "MOMENTUM",
    settings: [
      { key: "period",     label: "RSI Period",    type: "number", default: 14, min: 2, max: 50 },
      { key: "overbought", label: "Overbought",    type: "number", default: 70, min: 60, max: 90 },
      { key: "oversold",   label: "Oversold",      type: "number", default: 30, min: 10, max: 40 },
      { key: "show_lines", label: "Show OB/OS Lines", type: "toggle", default: true },
    ]
  },
  {
    id: "macd_signal",
    name: "MACD Cross",
    icon: "⚡",
    desc: "Arrow markers on MACD line crossovers",
    category: "MOMENTUM",
    settings: [
      { key: "fast",   label: "Fast Period",   type: "number", default: 12, min: 5,  max: 50 },
      { key: "slow",   label: "Slow Period",   type: "number", default: 26, min: 10, max: 100 },
      { key: "signal", label: "Signal Period", type: "number", default: 9,  min: 3,  max: 30 },
    ]
  },
  {
    id: "vwap",
    name: "VWAP",
    icon: "🟡",
    desc: "Volume Weighted Average Price line",
    category: "VOLUME",
    settings: [
      { key: "color", label: "Line Color", type: "color", default: "#f5c842" },
      { key: "width", label: "Line Width", type: "number", default: 1, min: 1, max: 4 },
    ]
  },
  {
    id: "support_resistance",
    name: "Support & Resistance",
    icon: "📌",
    desc: "Auto-detect key S/R levels",
    category: "STRUCTURE",
    settings: [
      { key: "lookback", label: "Lookback Candles", type: "number", default: 20, min: 5, max: 100 },
      { key: "s_color",  label: "Support Color",   type: "color",  default: "#00e676" },
      { key: "r_color",  label: "Resistance Color", type: "color", default: "#ff3b5c" },
    ]
  },
  {
    id: "pivot_points",
    name: "Pivot Points",
    icon: "🎯",
    desc: "Classic pivot point levels",
    category: "STRUCTURE",
    settings: [
      { key: "show_r2", label: "Show R2/S2", type: "toggle", default: true },
      { key: "show_r3", label: "Show R3/S3", type: "toggle", default: false },
    ]
  },
  {
    id: "engulfing",
    name: "Engulfing Pattern",
    icon: "🕯",
    desc: "Mark bullish/bearish engulfing candles",
    category: "PATTERN",
    settings: [
      { key: "bull_color", label: "Bull Color", type: "color", default: "#00e676" },
      { key: "bear_color", label: "Bear Color", type: "color", default: "#ff3b5c" },
      { key: "show_label", label: "Show Label", type: "toggle", default: true },
    ]
  },
  {
    id: "pin_bar",
    name: "Pin Bar",
    icon: "🔨",
    desc: "Highlight hammer and shooting star candles",
    category: "PATTERN",
    settings: [
      { key: "min_ratio", label: "Min Wick Ratio", type: "number", default: 2, min: 1.5, max: 5 },
      { key: "color",     label: "Marker Color",  type: "color",  default: "#f5c842" },
    ]
  },
  {
    id: "fibonacci",
    name: "Fibonacci Levels",
    icon: "🌀",
    desc: "Auto Fibonacci retracement levels",
    category: "STRUCTURE",
    settings: [
      { key: "lookback", label: "Lookback",    type: "number", default: 30, min: 10, max: 200 },
      { key: "color",    label: "Line Color",  type: "color",  default: "#fb923c" },
      { key: "show_618", label: "Show 61.8%",  type: "toggle", default: true },
      { key: "show_382", label: "Show 38.2%",  type: "toggle", default: true },
    ]
  },
  {
    id: "smc_zones",
    name: "SMC Zones",
    icon: "🧠",
    desc: "Order blocks, FVG and BOS zones",
    category: "SMART MONEY",
    settings: [
      { key: "show_ob",  label: "Order Blocks", type: "toggle", default: true },
      { key: "show_fvg", label: "Fair Value Gap", type: "toggle", default: true },
      { key: "show_bos", label: "Break of Structure", type: "toggle", default: true },
      { key: "bull_col", label: "Bull Zone Color", type: "color", default: "#00e676" },
      { key: "bear_col", label: "Bear Zone Color", type: "color", default: "#ff3b5c" },
    ]
  },
];

// Load saved settings
function strategyLoadSaved() {
  try {
    const saved = localStorage.getItem("px_strategies");
    if (saved) {
      const data = JSON.parse(saved);
      STRATEGIES.active   = data.active   || [];
      STRATEGIES.settings = data.settings || {};
    }
  } catch(e) {}

  // Apply defaults for any strategy without settings
  STRATEGY_LIST.forEach(s => {
    if (!STRATEGIES.settings[s.id]) {
      STRATEGIES.settings[s.id] = {};
      s.settings.forEach(setting => {
        STRATEGIES.settings[s.id][setting.key] = setting.default;
      });
    }
  });
}

function strategySave() {
  localStorage.setItem("px_strategies", JSON.stringify({
    active:   STRATEGIES.active,
    settings: STRATEGIES.settings,
  }));
}

function strategyToggle(id) {
  const idx = STRATEGIES.active.indexOf(id);
  if (idx >= 0) {
    STRATEGIES.active.splice(idx, 1);
  } else {
    STRATEGIES.active.push(id);
  }
  strategySave();
  strategyRenderList();
  dcApplyStrategies(); // redraw chart
}

function strategyUpdateSetting(id, key, value) {
  if (!STRATEGIES.settings[id]) STRATEGIES.settings[id] = {};
  STRATEGIES.settings[id][key] = value;
  strategySave();
  dcApplyStrategies();
}

function strategyGetSetting(id, key) {
  return STRATEGIES.settings[id]?.[key] ??
    STRATEGY_LIST.find(s => s.id === id)?.settings.find(s => s.key === key)?.default;
}

// ── RENDER STRATEGY PAGE ──────────────────────

function renderStrategyPage() {
  const el = document.getElementById("strategy-page");
  if (!el) return;

  const categories = [...new Set(STRATEGY_LIST.map(s => s.category))];

  el.innerHTML = `
    <div class="strat-header">
      <div class="strat-title">🎨 STRATEGY BUILDER</div>
      <div class="strat-subtitle">Toggle strategies · Tap ⚙ to configure</div>
    </div>

    <div class="strat-active-bar">
      <span class="strat-active-label">ACTIVE:</span>
      <span class="strat-active-count" id="strat-active-count">
        ${STRATEGIES.active.length} strategies
      </span>
      <button class="strat-clear-btn" onclick="strategyClearAll()">✕ CLEAR ALL</button>
      <button class="strat-apply-btn" onclick="dcApplyStrategies();showStrategyApplied()">✅ APPLY</button>
    </div>

    <div id="strat-applied-msg" style="display:none;padding:8px 16px;background:rgba(0,230,118,0.1);border-bottom:1px solid rgba(0,230,118,0.2);font-family:var(--font-display);font-size:10px;color:var(--green);letter-spacing:1px">
      ✅ STRATEGIES APPLIED TO CHART
    </div>

    ${categories.map(cat => `
      <div class="strat-category">
        <div class="strat-cat-label">${cat}</div>
        ${STRATEGY_LIST.filter(s => s.category === cat).map(s => `
          <div class="strat-card ${STRATEGIES.active.includes(s.id)?"active":""}" id="strat-card-${s.id}">
            <div class="strat-card-main" onclick="strategyToggle('${s.id}')">
              <div class="strat-card-left">
                <span class="strat-icon">${s.icon}</span>
                <div>
                  <div class="strat-name">${s.name}</div>
                  <div class="strat-desc">${s.desc}</div>
                </div>
              </div>
              <div class="strat-card-right">
                <div class="strat-toggle ${STRATEGIES.active.includes(s.id)?"on":""}">
                  <div class="strat-toggle-thumb"></div>
                </div>
              </div>
            </div>
            <button class="strat-settings-btn" onclick="event.stopPropagation();renderStrategySettings('${s.id}')">
              ⚙ SETTINGS
            </button>
          </div>
        `).join("")}
      </div>
    `).join("")}
  `;
}

function renderStrategySettings(id) {
  const strategy = STRATEGY_LIST.find(s => s.id === id);
  if (!strategy) return;

  const el = document.getElementById("strategy-settings-panel");
  const overlay = document.getElementById("strategy-settings-overlay");
  if (!el || !overlay) return;

  overlay.style.display = "flex";
  el.innerHTML = `
    <div class="strat-panel-header">
      <div>
        <div class="strat-panel-title">${strategy.icon} ${strategy.name}</div>
        <div class="strat-panel-desc">${strategy.desc}</div>
      </div>
      <button class="strat-panel-close" onclick="closeStrategySettings()">✕</button>
    </div>

    <div class="strat-panel-settings">
      ${strategy.settings.map(setting => `
        <div class="strat-setting-row">
          <label class="strat-setting-label">${setting.label}</label>
          ${setting.type === "toggle" ? `
            <label class="strat-sw">
              <input type="checkbox"
                ${strategyGetSetting(id, setting.key) ? "checked" : ""}
                onchange="strategyUpdateSetting('${id}','${setting.key}',this.checked)">
              <span class="strat-sw-slider"></span>
            </label>
          ` : setting.type === "color" ? `
            <div class="strat-color-wrap">
              <input type="color"
                value="${strategyGetSetting(id, setting.key)}"
                class="strat-color-input"
                oninput="strategyUpdateSetting('${id}','${setting.key}',this.value)">
              <span class="strat-color-val">${strategyGetSetting(id, setting.key)}</span>
            </div>
          ` : `
            <div class="strat-num-wrap">
              <button class="strat-num-btn" onclick="strategyNumStep('${id}','${setting.key}',-1,${setting.min||0},${setting.max||999})">−</button>
              <span class="strat-num-val" id="sval-${id}-${setting.key}">${strategyGetSetting(id, setting.key)}</span>
              <button class="strat-num-btn" onclick="strategyNumStep('${id}','${setting.key}',1,${setting.min||0},${setting.max||999})">+</button>
            </div>
          `}
        </div>
      `).join("")}
    </div>

    <div class="strat-panel-footer">
      <button class="strat-panel-reset" onclick="strategyReset('${id}')">↺ RESET DEFAULTS</button>
      <button class="strat-panel-apply" onclick="dcApplyStrategies();showStrategyApplied();closeStrategySettings()">
        ✅ APPLY TO CHART
      </button>
    </div>
  `;
}

function strategyNumStep(id, key, delta, min, max) {
  const current = parseFloat(strategyGetSetting(id, key)) || 0;
  const step    = delta < 0 ? -0.5 : 0.5;
  const newVal  = Math.max(min, Math.min(max, current + (Number.isInteger(current) ? delta : step)));
  strategyUpdateSetting(id, key, Number.isInteger(current) ? Math.round(newVal) : newVal);
  const el = document.getElementById(`sval-${id}-${key}`);
  if (el) el.textContent = strategyGetSetting(id, key);
}

function strategyReset(id) {
  const strategy = STRATEGY_LIST.find(s => s.id === id);
  if (!strategy) return;
  STRATEGIES.settings[id] = {};
  strategy.settings.forEach(s => { STRATEGIES.settings[id][s.key] = s.default; });
  strategySave();
  renderStrategySettings(id);
  dcApplyStrategies();
}

function strategyClearAll() {
  STRATEGIES.active = [];
  strategySave();
  strategyRenderList();
  dcApplyStrategies();
}

function strategyRenderList() {
  STRATEGY_LIST.forEach(s => {
    const card = document.getElementById(`strat-card-${s.id}`);
    const tog  = card?.querySelector(".strat-toggle");
    if (card) card.classList.toggle("active", STRATEGIES.active.includes(s.id));
    if (tog)  tog.classList.toggle("on", STRATEGIES.active.includes(s.id));
  });
  const cnt = document.getElementById("strat-active-count");
  if (cnt) cnt.textContent = STRATEGIES.active.length + " strategies";
}

function closeStrategySettings() {
  const overlay = document.getElementById("strategy-settings-overlay");
  if (overlay) overlay.style.display = "none";
}

function showStrategyApplied() {
  const el = document.getElementById("strat-applied-msg");
  if (!el) return;
  el.style.display = "block";
  setTimeout(() => el.style.display = "none", 3000);
}

// ── APPLY STRATEGIES TO CHART ─────────────────
// Called by dcDraw — draws overlays on canvas

function dcApplyStrategies() {
  // Just trigger a redraw — strategies are read during draw
  // No need to do anything here as dcDraw reads STRATEGIES
}

// Strategy drawing functions called from dcDraw
function drawStrategyOverlays(ctx, candles, W, H, RPAD, TPAD, BPAD, scY, gap, CW, startI, sl, dec) {
  if (!STRATEGIES.active.length || !candles.length) return;

  const allCloses = candles.map(c => c.close);

  STRATEGIES.active.forEach(id => {
    const cfg = STRATEGIES.settings[id] || {};

    switch(id) {

      case "ema_cross": {
        const fast = cfg.fast || 20, slow = cfg.slow || 50;
        drawEMALine(ctx, allCloses, fast, cfg.color_bull||"#00e676", W, RPAD, gap, CW, startI, sl, scY, dec, "E"+fast);
        drawEMALine(ctx, allCloses, slow, cfg.color_bear||"#ff3b5c", W, RPAD, gap, CW, startI, sl, scY, dec, "E"+slow);
        // Cross arrows
        if (allCloses.length > slow) {
          for (let i = slow + 1; i < sl.length; i++) {
            const ai = startI + i;
            if (ai < 1 || ai >= allCloses.length) continue;
            const e20a = calcEMAAt(allCloses, fast, ai);
            const e50a = calcEMAAt(allCloses, slow, ai);
            const e20p = calcEMAAt(allCloses, fast, ai-1);
            const e50p = calcEMAAt(allCloses, slow, ai-1);
            if (!e20a||!e50a||!e20p||!e50p) continue;
            const x = i * gap + gap/2;
            if (e20p <= e50p && e20a > e50a) {
              // Golden cross — up arrow
              ctx.fillStyle = "#00e676";
              ctx.font = "16px monospace";
              ctx.textAlign = "center";
              ctx.fillText("▲", x, scY(sl[i].low) + 20);
              ctx.font = "8px monospace";
              ctx.fillText("BUY", x, scY(sl[i].low) + 30);
            } else if (e20p >= e50p && e20a < e50a) {
              // Death cross — down arrow
              ctx.fillStyle = "#ff3b5c";
              ctx.font = "16px monospace";
              ctx.textAlign = "center";
              ctx.fillText("▼", x, scY(sl[i].high) - 20);
              ctx.font = "8px monospace";
              ctx.fillText("SELL", x, scY(sl[i].high) - 28);
            }
            ctx.textAlign = "left";
          }
        }
        break;
      }

      case "bollinger": {
        const period = cfg.period || 20, std = cfg.std || 2;
        const color  = cfg.color || "#3b82f6";
        ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash([2,3]);
        ["upper","mid","lower"].forEach((band, bi) => {
          ctx.beginPath(); let mv = true;
          sl.forEach((_, vi) => {
            const ai = startI + vi;
            const slice = allCloses.slice(Math.max(0, ai-period+1), ai+1);
            if (slice.length < 2) return;
            const avg  = slice.reduce((a,b)=>a+b,0)/slice.length;
            const stdv = Math.sqrt(slice.reduce((s,v)=>s+Math.pow(v-avg,2),0)/slice.length);
            const v = band==="upper"?avg+std*stdv:band==="lower"?avg-std*stdv:avg;
            const x = vi*gap+gap/2, y = scY(v);
            if (y < TPAD || y > H-BPAD) { mv=true; return; }
            mv ? ctx.moveTo(x,y) : ctx.lineTo(x,y); mv=false;
          });
          ctx.stroke();
        });
        ctx.setLineDash([]);
        break;
      }

      case "vwap": {
        const color = cfg.color || "#f5c842";
        const width = cfg.width || 1;
        let pv=0, vc=0;
        ctx.beginPath(); ctx.strokeStyle=color; ctx.lineWidth=width; let mv=true;
        sl.forEach((c, vi) => {
          pv += (c.high+c.low+c.close)/3; vc++;
          const v = pv/vc, x = vi*gap+gap/2, y = scY(v);
          if (y < TPAD || y > H-BPAD) { mv=true; return; }
          mv ? ctx.moveTo(x,y) : ctx.lineTo(x,y); mv=false;
        });
        ctx.stroke();
        break;
      }

      case "supertrend": {
        const period = cfg.period || 10, mult = cfg.multiplier || 3;
        let trend="up", stVal=sl[0]?.close||0;
        ctx.lineWidth = 2;
        sl.forEach((c, vi) => {
          const ai   = startI + vi;
          const atr  = calcATRAt(candles, period, ai);
          const hl2  = (c.high+c.low)/2;
          const bU   = hl2+mult*atr, bL = hl2-mult*atr;
          if (c.close > stVal) trend="up"; else if (c.close < stVal) trend="down";
          stVal = trend==="up" ? Math.max(bL,stVal) : Math.min(bU,stVal);
          const x = vi*gap+gap/2, y = scY(stVal);
          if (y < TPAD || y > H-BPAD) return;
          ctx.fillStyle = trend==="up" ? "rgba(0,230,118,0.7)" : "rgba(255,59,92,0.7)";
          ctx.fillRect(x-1, y-1, 3, 3);
        });
        break;
      }

      case "support_resistance": {
        const lookback = cfg.lookback || 20;
        const sColor   = cfg.s_color || "#00e676";
        const rColor   = cfg.r_color || "#ff3b5c";
        const levels   = detectSRLevels(candles.slice(startI, startI+sl.length), lookback);
        levels.support.forEach(level => {
          const y = scY(level);
          if (y < TPAD || y > H-BPAD) return;
          ctx.strokeStyle = sColor; ctx.lineWidth = 1; ctx.setLineDash([4,4]);
          ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W-RPAD,y); ctx.stroke();
          ctx.fillStyle = sColor; ctx.font = "8px monospace"; ctx.setLineDash([]);
          ctx.fillText("S "+level.toFixed(dec), W-RPAD+2, y+3);
        });
        levels.resistance.forEach(level => {
          const y = scY(level);
          if (y < TPAD || y > H-BPAD) return;
          ctx.strokeStyle = rColor; ctx.lineWidth = 1; ctx.setLineDash([4,4]);
          ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W-RPAD,y); ctx.stroke();
          ctx.fillStyle = rColor; ctx.font = "8px monospace"; ctx.setLineDash([]);
          ctx.fillText("R "+level.toFixed(dec), W-RPAD+2, y+3);
        });
        ctx.setLineDash([]);
        break;
      }

      case "fibonacci": {
        const lb    = cfg.lookback || 30;
        const color = cfg.color    || "#fb923c";
        const slc   = candles.slice(Math.max(0, startI+sl.length-lb), startI+sl.length);
        const fHi   = Math.max(...slc.map(c=>c.high));
        const fLo   = Math.min(...slc.map(c=>c.low));
        const fibs  = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
        fibs.forEach(r => {
          if (r===0.618 && !cfg.show_618) return;
          if (r===0.382 && !cfg.show_382) return;
          const v = fHi - (fHi-fLo)*r;
          const y = scY(v);
          if (y < TPAD || y > H-BPAD) return;
          ctx.strokeStyle = color+"80"; ctx.lineWidth=1; ctx.setLineDash([2,4]);
          ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W-RPAD,y); ctx.stroke();
          ctx.fillStyle = color; ctx.font="8px monospace"; ctx.setLineDash([]);
          ctx.fillText((r*100).toFixed(1)+"%", W-RPAD+2, y-1);
        });
        ctx.setLineDash([]);
        break;
      }

      case "engulfing": {
        sl.forEach((c, vi) => {
          const ai = startI+vi;
          if (ai < 1) return;
          const p = candles[ai-1];
          if (!p) return;
          const x = vi*gap+gap/2;
          // Bullish engulfing
          if (c.close>c.open && p.close<p.open && c.open<=p.close && c.close>=p.open) {
            ctx.fillStyle = cfg.bull_color||"#00e676";
            ctx.font="14px monospace"; ctx.textAlign="center";
            ctx.fillText("▲", x, scY(c.low)+18);
            if (cfg.show_label!==false) {
              ctx.font="7px monospace";
              ctx.fillText("BULL ENG", x, scY(c.low)+28);
            }
          }
          // Bearish engulfing
          if (c.close<c.open && p.close>p.open && c.open>=p.close && c.close<=p.open) {
            ctx.fillStyle = cfg.bear_color||"#ff3b5c";
            ctx.font="14px monospace"; ctx.textAlign="center";
            ctx.fillText("▼", x, scY(c.high)-16);
            if (cfg.show_label!==false) {
              ctx.font="7px monospace";
              ctx.fillText("BEAR ENG", x, scY(c.high)-26);
            }
          }
          ctx.textAlign="left";
        });
        break;
      }

      case "pin_bar": {
        const minRatio = cfg.min_ratio || 2;
        const color    = cfg.color     || "#f5c842";
        sl.forEach((c, vi) => {
          const body  = Math.abs(c.close-c.open)||0.0001;
          const upper = c.high-Math.max(c.open,c.close);
          const lower = Math.min(c.open,c.close)-c.low;
          const x     = vi*gap+gap/2;
          if (lower > body*minRatio) {
            ctx.fillStyle=color; ctx.font="16px monospace"; ctx.textAlign="center";
            ctx.fillText("🔨", x, scY(c.low)+20);
          } else if (upper > body*minRatio) {
            ctx.fillStyle=color; ctx.font="16px monospace"; ctx.textAlign="center";
            ctx.fillText("⭐", x, scY(c.high)-18);
          }
          ctx.textAlign="left";
        });
        break;
      }

      case "smc_zones": {
        const bCol = cfg.bull_col||"#00e676";
        const rCol = cfg.bear_col||"#ff3b5c";
        // Order Blocks
        if (cfg.show_ob!==false) {
          for (let i=1; i<sl.length-1; i++) {
            const ai=startI+i, c=candles[ai], nx=candles[ai+1];
            if (!c||!nx) continue;
            const body=Math.abs(c.close-c.open), nbody=Math.abs(nx.close-nx.open);
            if (nbody>body*1.5) {
              const isBull=c.close<c.open&&nx.close>nx.open;
              const x1=(i-0.5)*gap, x2=(i+1.5)*gap;
              ctx.fillStyle=isBull?bCol+"20":rCol+"20";
              ctx.strokeStyle=isBull?bCol+"60":rCol+"60";
              ctx.lineWidth=1;
              const y1=scY(c.high), y2=scY(c.low);
              ctx.fillRect(x1,y1,x2-x1,y2-y1);
              ctx.strokeRect(x1,y1,x2-x1,y2-y1);
              ctx.fillStyle=isBull?bCol:rCol;
              ctx.font="7px monospace"; ctx.textAlign="left";
              ctx.fillText("OB",x1+2,y1+10);
            }
          }
        }
        // FVG
        if (cfg.show_fvg!==false) {
          for (let i=1; i<sl.length-1; i++) {
            const ai=startI+i;
            const p=candles[ai-1], nx=candles[ai+1];
            if (!p||!nx) continue;
            if (nx.low>p.high) {
              const x1=(i-0.5)*gap, x2=(i+1.5)*gap;
              ctx.fillStyle=bCol+"15";
              ctx.fillRect(x1,scY(p.high),x2-x1,scY(nx.low)-scY(p.high));
              ctx.fillStyle=bCol+"80"; ctx.font="7px monospace";
              ctx.fillText("FVG",x1+2,scY(p.high)+10);
            } else if (nx.high<p.low) {
              const x1=(i-0.5)*gap, x2=(i+1.5)*gap;
              ctx.fillStyle=rCol+"15";
              ctx.fillRect(x1,scY(nx.high),x2-x1,scY(p.low)-scY(nx.high));
              ctx.fillStyle=rCol+"80"; ctx.font="7px monospace";
              ctx.fillText("FVG",x1+2,scY(nx.high)+10);
            }
          }
        }
        ctx.textAlign="left";
        break;
      }

      case "pivot_points": {
        if (sl.length < 2) break;
        const prev = candles[startI];
        if (!prev) break;
        const P  = (prev.high+prev.low+prev.close)/3;
        const R1 = 2*P-prev.low, S1 = 2*P-prev.high;
        const R2 = P+(prev.high-prev.low), S2 = P-(prev.high-prev.low);
        const R3 = prev.high+2*(P-prev.low), S3 = prev.low-2*(prev.high-P);
        const lvls=[
          {v:P,  c:"#fff",      l:"P"},
          {v:R1, c:"#ff6b6b",   l:"R1"},
          {v:S1, c:"#00e676",   l:"S1"},
          ...(cfg.show_r2!==false?[{v:R2,c:"#ff3b5c",l:"R2"},{v:S2,c:"#00b388",l:"S2"}]:[]),
          ...(cfg.show_r3?[{v:R3,c:"#ff0000",l:"R3"},{v:S3,c:"#005f3f",l:"S3"}]:[]),
        ];
        lvls.forEach(({v,c,l}) => {
          const y=scY(v);
          if (y<TPAD||y>H-BPAD) return;
          ctx.strokeStyle=c; ctx.lineWidth=1; ctx.setLineDash([3,3]);
          ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W-RPAD,y); ctx.stroke();
          ctx.fillStyle=c; ctx.font="8px monospace"; ctx.setLineDash([]);
          ctx.fillText(l,W-RPAD+2,y-1);
        });
        ctx.setLineDash([]);
        break;
      }
    }
  });
}

// ── INDICATOR HELPERS ─────────────────────────

function drawEMALine(ctx, closes, period, color, W, RPAD, gap, CW, startI, sl, scY, dec, label) {
  if (closes.length < period) return;
  const k = 2/(period+1);
  let e = closes.slice(0,period).reduce((a,b)=>a+b,0)/period;
  for (let i=period; i<closes.length; i++) e=closes[i]*k+e*(1-k);
  // Build series
  const series = new Array(closes.length).fill(null);
  let ev = closes.slice(0,period).reduce((a,b)=>a+b,0)/period;
  series[period-1] = ev;
  for (let i=period; i<closes.length; i++) { ev=closes[i]*k+ev*(1-k); series[i]=ev; }

  ctx.beginPath(); ctx.strokeStyle=color; ctx.lineWidth=1.5;
  let mv=true, lastV=null;
  sl.forEach((_,vi) => {
    const v=series[startI+vi];
    if (!v) { mv=true; return; }
    const x=vi*gap+gap/2, y=scY(v);
    mv?ctx.moveTo(x,y):ctx.lineTo(x,y); mv=false; lastV={x,y,v};
  });
  ctx.stroke();
  if (lastV) {
    ctx.fillStyle=color; ctx.font="8px monospace";
    ctx.fillText(label+" "+lastV.v.toFixed(dec), W-RPAD+2, lastV.y-4);
  }
}

function calcEMAAt(closes, period, idx) {
  if (idx < period) return null;
  const k = 2/(period+1);
  let e = closes.slice(0,period).reduce((a,b)=>a+b,0)/period;
  for (let i=period; i<=idx; i++) e=closes[i]*k+e*(1-k);
  return e;
}

function calcATRAt(candles, period, idx) {
  if (idx < 1) return 0.001;
  let sum=0, count=0;
  for (let i=Math.max(1,idx-period+1); i<=idx; i++) {
    const c=candles[i], p=candles[i-1];
    if (!c||!p) continue;
    sum+=Math.max(c.high-c.low,Math.abs(c.high-p.close),Math.abs(c.low-p.close));
    count++;
  }
  return count>0?sum/count:0.001;
}

function detectSRLevels(candles, lookback) {
  const highs=[], lows=[];
  for (let i=2; i<candles.length-2; i++) {
    const w=candles.slice(i-2,i+3);
    if (candles[i].high===Math.max(...w.map(c=>c.high))) highs.push(candles[i].high);
    if (candles[i].low===Math.min(...w.map(c=>c.low)))   lows.push(candles[i].low);
  }
  return { resistance: [...new Set(highs)].slice(-3), support: [...new Set(lows)].slice(-3) };
}

// ── INIT ──────────────────────────────────────

function strategyInit() {
  strategyLoadSaved();
}

document.addEventListener("DOMContentLoaded", strategyInit);
