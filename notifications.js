// ============================================
// PRINCEX EMPERE — Notification System v2
// EMA Cross Monitor + 15 Second Ring
// Custom Ringtone Upload + 8 Presets
// ============================================

const NOTIF = {
  permission:   false,
  customSound:  null,
  customName:   null,
  monitoring:   false,
  monitorTimer: null,
  crossAlerts:  [],
  lastCross:    {},
  THROTTLE:     5 * 60 * 1000,
  ringTimeout:  null,
  ringAudio:    null,
};

const PRESETS = [
  { id:"chime",    name:"🔔 Chime",         freqs:[523,659,784,1047],        durs:[0.15,0.15,0.15,0.4]  },
  { id:"alert",    name:"🚨 Alert",          freqs:[880,0,880,0,880],         durs:[0.1,0.1,0.1,0.1,0.2] },
  { id:"trumpet",  name:"🎺 Trumpet",        freqs:[523,659,784,659,784,1047],durs:[0.1,0.1,0.1,0.1,0.1,0.5] },
  { id:"bell",     name:"🔕 Bell",           freqs:[1047,784,1047],           durs:[0.1,0.1,0.4]         },
  { id:"ping",     name:"✨ Ping",           freqs:[1319],                    durs:[0.6]                 },
  { id:"siren",    name:"🚔 Siren",          freqs:[440,880,440,880,440,880], durs:[0.2,0.2,0.2,0.2,0.2,0.2] },
  { id:"casino",   name:"🎰 Casino",         freqs:[523,659,784,1047,1319,784,523], durs:[0.08,0.08,0.08,0.08,0.08,0.08,0.3] },
  { id:"rising",   name:"📈 Rising",         freqs:[262,330,392,523,659,784,1047], durs:[0.1,0.1,0.1,0.1,0.1,0.1,0.5] },
];

let selectedPreset = localStorage.getItem("px_preset") || "chime";

// ── AUDIO HELPERS ─────────────────────────────

function _playTones(freqs, durs) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    let t = ctx.currentTime;
    freqs.forEach((f, i) => {
      if (!f) { t += durs[i] || 0.1; return; }
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = f;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + (durs[i] || 0.2));
      osc.start(t);
      osc.stop(t + (durs[i] || 0.2));
      t += (durs[i] || 0.2) * 0.95;
    });
    return t - ctx.currentTime; // total duration
  } catch(e) { return 0; }
}

// ── PLAY FOR 15 SECONDS ───────────────────────

function notifRing15sec() {
  notifStopRing(); // stop any current ring

  const endTime = Date.now() + 15000;

  if (NOTIF.customSound) {
    // Loop uploaded audio for 15 seconds
    const audio = new Audio(NOTIF.customSound);
    audio.loop   = true;
    audio.volume = 0.85;
    audio.play().catch(() => {});
    NOTIF.ringAudio = audio;
    NOTIF.ringTimeout = setTimeout(() => notifStopRing(), 15000);
  } else {
    // Loop preset tones for 15 seconds
    const preset = PRESETS.find(p => p.id === selectedPreset) || PRESETS[0];
    let remaining = 15000;

    const loopTones = () => {
      if (Date.now() >= endTime) return;
      const dur = _playTones(preset.freqs, preset.durs) * 1000 + 300;
      remaining -= dur;
      if (remaining > 0) {
        NOTIF.ringTimeout = setTimeout(loopTones, dur);
      }
    };
    loopTones();
  }

  // Auto stop after 15s
  setTimeout(notifStopRing, 15000);

  // Show stop button
  const stopBtn = document.getElementById("notif-stop-ring-btn");
  if (stopBtn) stopBtn.style.display = "block";
}

function notifStopRing() {
  clearTimeout(NOTIF.ringTimeout);
  if (NOTIF.ringAudio) {
    NOTIF.ringAudio.pause();
    NOTIF.ringAudio.currentTime = 0;
    NOTIF.ringAudio = null;
  }
  const stopBtn = document.getElementById("notif-stop-ring-btn");
  if (stopBtn) stopBtn.style.display = "none";
}

function notifPreviewSound() {
  notifStopRing();
  if (NOTIF.customSound) {
    const audio = new Audio(NOTIF.customSound);
    audio.volume = 0.85;
    audio.play().catch(() => {});
    setTimeout(() => audio.pause(), 3000);
  } else {
    const preset = PRESETS.find(p => p.id === selectedPreset) || PRESETS[0];
    _playTones(preset.freqs, preset.durs);
  }
}

// ── PRESET SELECT ─────────────────────────────

function notifSelectPreset(id) {
  selectedPreset = id;
  localStorage.setItem("px_preset", id);
  document.querySelectorAll(".preset-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.id === id));
  // Preview
  const preset = PRESETS.find(p => p.id === id);
  if (preset) _playTones(preset.freqs, preset.durs);
}

// ── FILE UPLOAD ───────────────────────────────

function rtHandleUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    notifShowStatus("❌ File too large — max 5MB", "error"); return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    NOTIF.customSound = e.target.result;
    NOTIF.customName  = file.name;
    localStorage.setItem("px_ringtone",      e.target.result);
    localStorage.setItem("px_ringtone_name", file.name);
    notifShowStatus("✅ Ringtone saved: " + file.name, "success");
    renderRingtoneManager("rt-manager");
    // Preview 3 seconds
    const audio = new Audio(e.target.result);
    audio.volume = 0.8;
    audio.play().catch(() => {});
    setTimeout(() => { audio.pause(); }, 3000);
  };
  reader.readAsDataURL(file);
}

function rtRemoveCustom() {
  NOTIF.customSound = null;
  NOTIF.customName  = null;
  localStorage.removeItem("px_ringtone");
  localStorage.removeItem("px_ringtone_name");
  notifShowStatus("🔕 Removed — using preset", "info");
  renderRingtoneManager("rt-manager");
}

function notifLoadSaved() {
  const s = localStorage.getItem("px_ringtone");
  const n = localStorage.getItem("px_ringtone_name");
  if (s) { NOTIF.customSound = s; NOTIF.customName = n; }
  selectedPreset = localStorage.getItem("px_preset") || "chime";
}

// ── RENDER RINGTONE MANAGER ───────────────────

function renderRingtoneManager(id) {
  const el = document.getElementById(id);
  if (!el) return;

  el.innerHTML = `
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-top:4px">

      <div style="padding:12px 14px">
        <div style="font-family:var(--font-display);font-size:9px;color:var(--gold);letter-spacing:2px;margin-bottom:10px">🎵 SELECT PRESET</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px" id="preset-grid-${id}">
          ${PRESETS.map(p => `
            <button class="preset-btn ${p.id===selectedPreset?"active":""}"
              data-id="${p.id}"
              onclick="notifSelectPreset('${p.id}')">
              ${p.name}
            </button>`).join("")}
        </div>
      </div>

      <div style="border-top:1px solid var(--border);padding:10px 14px;text-align:center;font-family:var(--font-display);font-size:9px;color:var(--muted);letter-spacing:1px">
        — OR UPLOAD YOUR OWN FILE —
      </div>

      <div style="padding:0 14px 12px">
        <div style="position:relative;background:var(--bg2);border:2px dashed ${NOTIF.customName?"var(--green)":"var(--border)"};border-radius:10px;padding:16px;text-align:center;cursor:pointer" onclick="document.getElementById('rt-file-${id}').click()">
          <input type="file" id="rt-file-${id}" accept="audio/*" style="display:none" onchange="rtHandleUpload(this)">
          <span style="font-size:26px;display:block;margin-bottom:6px">🎵</span>
          <span style="font-family:var(--font-display);font-size:10px;color:${NOTIF.customName?"var(--green)":"var(--text)"};display:block;margin-bottom:4px">
            ${NOTIF.customName || "TAP TO UPLOAD MP3 / WAV / OGG"}
          </span>
          <span style="font-family:var(--font-display);font-size:8px;color:var(--muted)">Max 5MB · plays for 15 seconds on EMA cross</span>
        </div>
      </div>

      <div style="border-top:1px solid var(--border);padding:12px 14px">
        <div style="font-family:var(--font-display);font-size:8px;color:var(--muted);letter-spacing:1px;margin-bottom:6px">ACTIVE RINGTONE</div>
        <div style="font-family:var(--font-display);font-size:13px;font-weight:700;color:var(--gold);margin-bottom:10px">
          ${NOTIF.customName || PRESETS.find(p=>p.id===selectedPreset)?.name || "Default"}
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="notifPreviewSound()" style="flex:1;padding:9px;background:var(--green);color:#000;border:none;border-radius:8px;font-family:var(--font-display);font-size:10px;font-weight:700;cursor:pointer;letter-spacing:1px">▶ PREVIEW (3s)</button>
          <button onclick="notifRing15sec()" style="flex:1;padding:9px;background:var(--bg2);color:var(--gold);border:1px solid var(--gold);border-radius:8px;font-family:var(--font-display);font-size:10px;cursor:pointer;letter-spacing:1px">🔔 TEST 15s</button>
          ${NOTIF.customName?`<button onclick="rtRemoveCustom()" style="padding:9px 12px;background:transparent;color:var(--red);border:1px solid var(--red);border-radius:8px;font-size:11px;cursor:pointer">✕</button>`:""}
        </div>
      </div>

    </div>

    <!-- STOP RING BUTTON -->
    <button id="notif-stop-ring-btn" onclick="notifStopRing()" style="display:none;width:100%;margin-top:8px;padding:12px;background:var(--red);color:#fff;border:none;border-radius:10px;font-family:var(--font-display);font-size:12px;font-weight:700;letter-spacing:2px;cursor:pointer;animation:pulse 0.5s infinite">
      ⏹ STOP RINGING
    </button>
  `;
}

// ── EMA CROSS DETECTION ───────────────────────

function detectEMACross(candles) {
  if (candles.length < 52) return null;
  const cl = candles.map(c => c.close);

  function ema(arr, p) {
    const k = 2/(p+1);
    let e = arr.slice(0,p).reduce((a,b)=>a+b,0)/p;
    for (let i=p; i<arr.length; i++) e = arr[i]*k+e*(1-k);
    return e;
  }

  const e20now  = ema(cl, 20);
  const e50now  = ema(cl, 50);
  const e20prev = ema(cl.slice(0,-1), 20);
  const e50prev = ema(cl.slice(0,-1), 50);
  const last    = candles[candles.length-1];

  if (e20prev <= e50prev && e20now > e50now) {
    return { type:"GOLDEN CROSS 🟢", signal:"BUY",  e20:e20now.toFixed(5), e50:e50now.toFixed(5), price:last.close.toFixed(5) };
  }
  if (e20prev >= e50prev && e20now < e50now) {
    return { type:"DEATH CROSS 🔴",  signal:"SELL", e20:e20now.toFixed(5), e50:e50now.toFixed(5), price:last.close.toFixed(5) };
  }
  return null;
}

// ── FETCH CANDLES ─────────────────────────────

// Deriv synthetic symbols — fetch via WebSocket
const DERIV_SYMS = ["1HZ10V","1HZ25V","1HZ50V","1HZ75V","1HZ100V",
  "R_10","R_25","R_50","R_75","R_100",
  "CRASH300N","CRASH500","CRASH900","CRASH1000","CRASH2000",
  "BOOM300N","BOOM500","BOOM1000","BOOM2000"];

async function notifFetchCandles(pair) {
  try {
    // Deriv synthetic — use WebSocket API
    if (DERIV_SYMS.includes(pair)) {
      return await notifFetchDerivCandles(pair);
    }
    // Forex — use Twelve Data
    const url  = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(pair)}&interval=1min&outputsize=60&apikey=${CONFIG.TWELVE_DATA_KEY}`;
    const res  = await fetch(url);
    const data = await res.json();
    if (data.status === "error" || !data.values) return null;
    return data.values.reverse().slice(0,-1).map(c=>({
      open:parseFloat(c.open),high:parseFloat(c.high),
      low:parseFloat(c.low),close:parseFloat(c.close)
    }));
  } catch(e) { return null; }
}

async function notifFetchDerivCandles(symbol) {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket("wss://ws.binaryws.com/websockets/v3?app_id=1089");
      const timeout = setTimeout(() => { ws.close(); resolve(null); }, 10000);
      ws.onopen = () => {
        ws.send(JSON.stringify({
          ticks_history: symbol, count: 60,
          end: "latest", granularity: 60,
          style: "candles", adjust_start_time: 1
        }));
      };
      ws.onmessage = e => {
        const data = JSON.parse(e.data);
        clearTimeout(timeout);
        ws.close();
        if (data.candles && data.candles.length > 1) {
          resolve(data.candles.slice(0,-1).map(c=>({
            open:parseFloat(c.open), high:parseFloat(c.high),
            low:parseFloat(c.low),  close:parseFloat(c.close)
          })));
        } else resolve(null);
      };
      ws.onerror = () => { clearTimeout(timeout); resolve(null); };
    } catch(e) { resolve(null); }
  });
}

// ── SCAN ONE PAIR ─────────────────────────────

async function notifScanPair(pair) {
  const last = NOTIF.lastCross[pair] || 0;
  if (Date.now() - last < NOTIF.THROTTLE) return;

  const candles = await notifFetchCandles(pair);
  if (!candles || candles.length < 52) return;

  const cross = detectEMACross(candles);
  if (!cross) return;

  NOTIF.lastCross[pair] = Date.now();

  const alert = {
    id:        Date.now(),
    pair,
    type:      cross.type,
    signal:    cross.signal,
    price:     cross.price,
    ema20:     cross.e20,
    ema50:     cross.e50,
    time:      new Date().toLocaleTimeString(),
  };

  NOTIF.crossAlerts.unshift(alert);
  if (NOTIF.crossAlerts.length > 100) NOTIF.crossAlerts.pop();

  // 🔔 RING FOR 15 SECONDS
  notifRing15sec();

  // Browser notification
  if (NOTIF.permission) {
    try {
      const n = new Notification(
        `${cross.signal === "BUY" ? "🟢" : "🔴"} ${cross.type} — ${pair}`,
        {
          body:  `Entry: ${cross.price} · EMA20: ${cross.e20} · EMA50: ${cross.e50}`,
          icon:  "/icon.svg",
          tag:   pair,
          requireInteraction: true,
        }
      );
      n.onclick = () => { window.focus(); switchTab("signals"); n.close(); };
      setTimeout(() => n.close(), 15000);
    } catch(e) {}
  }

  // Add to signal list
  notifAddCard(alert);
  notifUpdateBadge();
  notifRenderPairChips();
}

// ── SCAN ALL MARKETS ──────────────────────────

async function notifScanAll() {
  if (!NOTIF.monitoring) return;

  const pairs = [
    // ── FOREX ──
    "EUR/USD","GBP/USD","USD/JPY","AUD/USD","USD/CAD",
    "EUR/GBP","GBP/JPY","EUR/JPY","NZD/USD","USD/CHF",
    "GBP/AUD","EUR/AUD","AUD/JPY","CAD/JPY","XAU/USD",
    "EUR/CAD","GBP/CAD","AUD/NZD","NZD/JPY","CHF/JPY",
    // ── VOLATILITY INDICES ──
    "1HZ10V","1HZ25V","1HZ50V","1HZ75V","1HZ100V",
    "R_10","R_25","R_50","R_75","R_100",
    // ── CRASH INDICES ──
    "CRASH300N","CRASH500","CRASH900","CRASH1000","CRASH2000",
    // ── BOOM INDICES ──
    "BOOM300N","BOOM500","BOOM1000","BOOM2000",
  ];

  const statusEl = document.getElementById("notif-monitor-status");
  if (statusEl) statusEl.textContent = "SCANNING " + pairs.length + " PAIRS...";

  for (let i = 0; i < pairs.length; i++) {
    if (!NOTIF.monitoring) break;
    // Highlight current pair
    document.querySelectorAll(".notif-pair-chip").forEach(c => {
      c.classList.toggle("scanning", c.textContent === pairs[i]);
    });
    await notifScanPair(pairs[i]);
    await new Promise(r => setTimeout(r, 400));
  }

  document.querySelectorAll(".notif-pair-chip").forEach(c => c.classList.remove("scanning"));
  if (statusEl && NOTIF.monitoring) statusEl.textContent = "MONITORING · Next scan in 60s";
}

// ── START / STOP ──────────────────────────────

async function notifStartMonitoring() {
  // Request notification permission
  if ("Notification" in window && Notification.permission !== "granted") {
    await Notification.requestPermission();
  }
  NOTIF.permission = Notification?.permission === "granted";
  NOTIF.monitoring = true;

  notifUpdateUI();
  notifShowStatus("🔍 Monitoring ALL markets for EMA crosses...", "success");
  notifScanAll();
  NOTIF.monitorTimer = setInterval(notifScanAll, 60000);
}

function notifStopMonitoring() {
  NOTIF.monitoring = false;
  clearInterval(NOTIF.monitorTimer);
  notifStopRing();
  notifUpdateUI();
  notifShowStatus("⏸ Monitoring stopped", "info");
  const statusEl = document.getElementById("notif-monitor-status");
  if (statusEl) statusEl.textContent = "IDLE";
}

// ── SIGNAL CARDS ──────────────────────────────

function notifAddCard(alert) {
  const list = document.getElementById("cross-signal-list");
  if (!list) return;
  list.querySelector(".notif-empty")?.remove();

  const isBuy = alert.signal === "BUY";
  const card  = document.createElement("div");
  card.className = "cross-signal-item " + (isBuy ? "buy" : "sell");
  card.innerHTML = `
    <div class="cs-header">
      <span class="cs-pair">${alert.pair}</span>
      <span class="cs-type ${isBuy?"bull":"bear"}">${isBuy?"⬆ BUY":"⬇ SELL"}</span>
      <span class="cs-time">${alert.time}</span>
    </div>
    <div class="cs-body">
      <span class="cs-cross-type">${alert.type}</span>
      <span class="cs-price">Entry: <b>${alert.price}</b></span>
    </div>
    <div class="cs-emas">
      <span>EMA20: ${alert.ema20}</span>
      <span>EMA50: ${alert.ema50}</span>
    </div>
    <div class="cs-actions">
      <button class="cs-btn-trade" onclick="window.selectedPair='${alert.pair}';document.querySelectorAll('.pair-btn').forEach(b=>{b.classList.toggle('active',b.textContent==='${alert.pair}')});switchTab('forex')">
        📊 OPEN CHART
      </button>
      <button onclick="notifRing15sec()" style="padding:8px 12px;background:var(--bg2);border:1px solid var(--border);color:var(--muted);border-radius:8px;font-size:11px;cursor:pointer">
        🔔 RING
      </button>
    </div>
  `;
  list.prepend(card);
}

function notifClearAlerts() {
  NOTIF.crossAlerts = [];
  const list = document.getElementById("cross-signal-list");
  if (list) list.innerHTML = '<div class="notif-empty">No signals yet. Start monitoring.</div>';
  const badge = document.getElementById("notif-badge");
  if (badge) badge.style.display = "none";
}

function notifUpdateBadge() {
  const badge = document.getElementById("notif-badge");
  if (!badge) return;
  const count = NOTIF.crossAlerts.length;
  badge.textContent = count > 9 ? "9+" : count;
  badge.style.display = count > 0 ? "flex" : "none";
}

// ── UI ────────────────────────────────────────

function notifUpdateUI() {
  const btn = document.getElementById("notif-monitor-btn");
  if (btn) {
    btn.textContent = NOTIF.monitoring ? "⏹ STOP MONITORING" : "🔍 START MONITORING ALL MARKETS";
    btn.className   = NOTIF.monitoring ? "notif-btn-stop" : "notif-btn-start";
  }
  const dot = document.getElementById("notif-status-dot");
  if (dot) dot.className = "notif-dot " + (NOTIF.monitoring ? "active" : "");
}

function notifShowStatus(msg, type) {
  const el = document.getElementById("notif-status-msg");
  if (!el) return;
  el.textContent   = msg;
  el.className     = "notif-status " + type;
  el.style.display = "block";
  setTimeout(() => el.style.display = "none", 4000);
}

function notifRenderPairChips() {
  const el = document.getElementById("notif-scan-pairs");
  if (!el) return;
  const pairs = [
    // ── FOREX ──
    "EUR/USD","GBP/USD","USD/JPY","AUD/USD","USD/CAD",
    "EUR/GBP","GBP/JPY","EUR/JPY","NZD/USD","USD/CHF",
    "GBP/AUD","EUR/AUD","AUD/JPY","CAD/JPY","XAU/USD",
    "EUR/CAD","GBP/CAD","AUD/NZD","NZD/JPY","CHF/JPY",
    // ── VOLATILITY INDICES ──
    "1HZ10V","1HZ25V","1HZ50V","1HZ75V","1HZ100V",
    "R_10","R_25","R_50","R_75","R_100",
    // ── CRASH INDICES ──
    "CRASH300N","CRASH500","CRASH900","CRASH1000","CRASH2000",
    // ── BOOM INDICES ──
    "BOOM300N","BOOM500","BOOM1000","BOOM2000",
  ];
  el.innerHTML = pairs.map(p => {
    const cross = NOTIF.crossAlerts.find(a => a.pair === p);
    const cls   = cross ? (cross.signal==="BUY"?"crossed-buy":"crossed-sell") : "";
    return `<span class="notif-pair-chip ${cls}">${p}</span>`;
  }).join("");
}

// ── INIT ──────────────────────────────────────

function notifInitSignalsTab() {
  notifLoadSaved();
  notifUpdateUI();
  notifRenderPairChips();
  renderRingtoneManager("rt-manager");
  // Clear badge
  const badge = document.getElementById("notif-badge");
  if (badge) badge.style.display = "none";
}

function notifInit() {
  notifLoadSaved();
}

document.addEventListener("DOMContentLoaded", notifInit);
