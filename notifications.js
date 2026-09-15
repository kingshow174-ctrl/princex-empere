// ============================================
// PRINCEX EMPERE — Smart Notification System
// EMA Cross Monitor + Custom Ringtone Upload
// ============================================

const NOTIF = {
  permission: false,
  customSound: null,      // user uploaded audio
  customSoundName: null,
  audioCtx: null,
  monitoring: false,
  monitorTimer: null,
  crossAlerts: [],        // history of cross alerts
  lastCrossTime: {},      // throttle: pair → last alert time
  THROTTLE_MS: 5 * 60 * 1000, // 5 min between same pair alerts
};

// ── REQUEST PERMISSION ────────────────────────

async function notifRequestPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") {
    NOTIF.permission = true; return true;
  }
  const result = await Notification.requestPermission();
  NOTIF.permission = result === "granted";
  return NOTIF.permission;
}

// ── CUSTOM RINGTONE UPLOAD ────────────────────

function notifHandleFileUpload(input) {
  const file = input.files[0];
  if (!file) return;

  const allowed = ["audio/mpeg","audio/wav","audio/ogg","audio/mp4","audio/webm"];
  if (!allowed.includes(file.type)) {
    notifShowStatus("❌ Use MP3, WAV, OGG or M4A files only", "error");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    notifShowStatus("❌ File too large (max 5MB)", "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    NOTIF.customSound     = e.target.result;
    NOTIF.customSoundName = file.name;
    localStorage.setItem("princex_ringtone_name", file.name);
    localStorage.setItem("princex_ringtone",      e.target.result);
    notifUpdateUI();
    notifShowStatus("✅ Ringtone saved: " + file.name, "success");
    notifPlayCustomSound(); // preview
  };
  reader.readAsDataURL(file);
}

function notifLoadSavedSound() {
  const saved = localStorage.getItem("princex_ringtone");
  const name  = localStorage.getItem("princex_ringtone_name");
  if (saved) {
    NOTIF.customSound     = saved;
    NOTIF.customSoundName = name;
  }
}

function notifClearSound() {
  NOTIF.customSound     = null;
  NOTIF.customSoundName = null;
  localStorage.removeItem("princex_ringtone");
  localStorage.removeItem("princex_ringtone_name");
  notifUpdateUI();
  notifShowStatus("🔕 Ringtone removed — using default tones", "info");
}

function notifPlayCustomSound() {
  if (NOTIF.customSound) {
    const audio = new Audio(NOTIF.customSound);
    audio.volume = 0.8;
    audio.play().catch(e => console.warn("Audio play failed:", e));
  } else {
    if (typeof ringBuySignal === "function") ringBuySignal();
  }
}

function notifPlaySound(direction) {
  if (NOTIF.customSound) {
    const audio = new Audio(NOTIF.customSound);
    audio.volume = 0.8;
    audio.play().catch(() => {});
  } else {
    if (typeof playSignalSound === "function")
      playSignalSound(direction, "MODERATE");
  }
}

// ── EMA CROSS DETECTION ───────────────────────

function detectEMACross(candles) {
  if (candles.length < 52) return null;
  const closes = candles.map(c => c.close);

  function ema(arr, p) {
    const k = 2/(p+1);
    let e = arr.slice(0,p).reduce((a,b)=>a+b,0)/p;
    for (let i=p; i<arr.length; i++) e = arr[i]*k+e*(1-k);
    return e;
  }

  // Current values
  const e20now = ema(closes, 20);
  const e50now = ema(closes, 50);

  // Previous candle values
  const prev    = closes.slice(0, -1);
  const e20prev = ema(prev, 20);
  const e50prev = ema(prev, 50);

  const last = candles[candles.length - 1];

  // Golden cross: EMA20 crosses ABOVE EMA50
  if (e20prev <= e50prev && e20now > e50now) {
    return {
      type:      "GOLDEN CROSS",
      signal:    "BUY",
      direction: "BUY",
      ema20:     e20now.toFixed(5),
      ema50:     e50now.toFixed(5),
      price:     last.close.toFixed(5),
      strength:  Math.abs(e20now - e50now) / e50now * 100,
    };
  }

  // Death cross: EMA20 crosses BELOW EMA50
  if (e20prev >= e50prev && e20now < e50now) {
    return {
      type:      "DEATH CROSS",
      signal:    "SELL",
      direction: "SELL",
      ema20:     e20now.toFixed(5),
      ema50:     e50now.toFixed(5),
      price:     last.close.toFixed(5),
      strength:  Math.abs(e20now - e50now) / e50now * 100,
    };
  }

  return null;
}

// ── MONITOR ALL PAIRS ─────────────────────────

async function notifFetchCandles(pair) {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(pair)}&interval=1min&outputsize=60&apikey=${CONFIG.TWELVE_DATA_KEY}`;
  const res  = await fetch(url);
  const data = await res.json();
  if (data.status === "error" || !data.values) return null;
  return data.values.reverse().slice(0, -1).map(c => ({
    open:  parseFloat(c.open),
    high:  parseFloat(c.high),
    low:   parseFloat(c.low),
    close: parseFloat(c.close),
  }));
}

async function notifScanPair(pair) {
  try {
    // Throttle — don't alert same pair too often
    const lastTime = NOTIF.lastCrossTime[pair] || 0;
    if (Date.now() - lastTime < NOTIF.THROTTLE_MS) return;

    const candles = await notifFetchCandles(pair);
    if (!candles || candles.length < 52) return;

    const cross = detectEMACross(candles);
    if (!cross) return;

    // Got a cross! Alert
    NOTIF.lastCrossTime[pair] = Date.now();
    const alert = {
      id:        Date.now(),
      pair,
      type:      cross.type,
      signal:    cross.signal,
      direction: cross.direction,
      price:     cross.price,
      ema20:     cross.ema20,
      ema50:     cross.ema50,
      time:      new Date().toLocaleTimeString(),
      timestamp: Date.now(),
    };

    NOTIF.crossAlerts.unshift(alert);
    if (NOTIF.crossAlerts.length > 50) NOTIF.crossAlerts.pop();

    // 1. Play sound
    notifPlaySound(cross.direction);

    // 2. Browser notification
    if (NOTIF.permission) {
      const icon  = cross.signal === "BUY" ? "🟢" : "🔴";
      const notif = new Notification(
        `${icon} ${cross.type} — ${pair}`,
        {
          body: `Signal: ${cross.signal} at ${cross.price}\nEMA20: ${cross.ema20} | EMA50: ${cross.ema50}\n${new Date().toLocaleTimeString()}`,
          icon: "/icon.svg",
          badge:"/icon.svg",
          tag:  pair + "_cross",
          requireInteraction: false,
        }
      );
      notif.onclick = () => {
        window.focus();
        notifShowAlertPage();
        notif.close();
      };
      setTimeout(() => notif.close(), 8000);
    }

    // 3. Add to signal page
    notifAddToSignalPage(alert);

    // 4. Update alerts list
    notifRenderAlerts();

    console.log("🔔 EMA CROSS:", cross.type, pair, cross.signal);
  } catch(e) {
    // Silent fail for individual pairs
  }
}

async function notifScanAllMarkets() {
  if (!NOTIF.monitoring) return;

  const pairs = typeof PAIRS !== "undefined" ? PAIRS : [
    "EUR/USD","GBP/USD","USD/JPY","AUD/USD","USD/CAD",
    "EUR/GBP","GBP/JPY","EUR/JPY","NZD/USD","USD/CHF",
    "GBP/AUD","EUR/AUD","AUD/JPY","CAD/JPY","XAU/USD"
  ];

  // Scan pairs with 500ms delay between each (rate limit)
  for (let i = 0; i < pairs.length; i++) {
    if (!NOTIF.monitoring) break;
    await notifScanPair(pairs[i]);
    await new Promise(r => setTimeout(r, 500));
  }
}

// ── START / STOP MONITORING ───────────────────

async function notifStartMonitoring() {
  await notifRequestPermission();
  NOTIF.monitoring = true;

  // Scan immediately then every 60 seconds
  notifScanAllMarkets();
  NOTIF.monitorTimer = setInterval(notifScanAllMarkets, 60000);

  notifUpdateUI();
  notifShowStatus("🔍 Monitoring ALL markets for EMA crosses...", "success");
}

function notifStopMonitoring() {
  NOTIF.monitoring = false;
  clearInterval(NOTIF.monitorTimer);
  notifUpdateUI();
  notifShowStatus("⏸ Monitoring stopped", "info");
}

// ── SIGNAL PAGE ───────────────────────────────

function notifAddToSignalPage(alert) {
  const list = document.getElementById("cross-signal-list");
  if (!list) return;

  const empty = list.querySelector(".notif-empty");
  if (empty) empty.remove();

  const item = document.createElement("div");
  item.className = "cross-signal-item " + (alert.signal === "BUY" ? "buy" : "sell");
  item.innerHTML = `
    <div class="cs-header">
      <span class="cs-pair">${alert.pair}</span>
      <span class="cs-type ${alert.signal === "BUY" ? "bull" : "bear"}">${alert.signal === "BUY" ? "⬆ BUY" : "⬇ SELL"}</span>
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
      <button class="cs-btn-trade" onclick="window.selectedPair='${alert.pair}';switchTab('forex')">
        📊 OPEN CHART
      </button>
    </div>
  `;
  list.prepend(item);

  // Badge update
  const badge = document.getElementById("notif-badge");
  if (badge) {
    const count = parseInt(badge.textContent || "0") + 1;
    badge.textContent = count;
    badge.style.display = "flex";
  }
}

function notifRenderAlerts() {
  const list = document.getElementById("cross-signal-list");
  if (!list || !NOTIF.crossAlerts.length) return;

  list.innerHTML = "";
  NOTIF.crossAlerts.forEach(alert => notifAddToSignalPage(alert));
}

function notifShowAlertPage() {
  switchTab("signals");
  const badge = document.getElementById("notif-badge");
  if (badge) badge.style.display = "none";
}

function notifClearAlerts() {
  NOTIF.crossAlerts = [];
  const list = document.getElementById("cross-signal-list");
  if (list) list.innerHTML = `<div class="notif-empty">No EMA cross signals yet. Start monitoring to detect crosses.</div>`;
  const badge = document.getElementById("notif-badge");
  if (badge) badge.style.display = "none";
}

// ── UI HELPERS ────────────────────────────────

function notifUpdateUI() {
  const btn = document.getElementById("notif-monitor-btn");
  if (btn) {
    btn.textContent = NOTIF.monitoring ? "⏹ STOP MONITORING" : "🔍 START MONITORING ALL MARKETS";
    btn.className   = NOTIF.monitoring ? "notif-btn-stop" : "notif-btn-start";
  }
  const dot = document.getElementById("notif-status-dot");
  if (dot) dot.className = "notif-dot " + (NOTIF.monitoring ? "active" : "");
  const status = document.getElementById("notif-sound-name");
  if (status) status.textContent = NOTIF.customSoundName || "Default tones";
}

function notifShowStatus(msg, type) {
  const el = document.getElementById("notif-status-msg");
  if (!el) return;
  el.textContent = msg;
  el.className   = "notif-status " + type;
  el.style.display = "block";
  setTimeout(() => el.style.display = "none", 4000);
}

// ── INIT ──────────────────────────────────────

function notifInit() {
  notifLoadSavedSound();
  notifRequestPermission();
  notifUpdateUI();
}

// ── SIGNALS TAB INIT ──────────────────────────

function notifInitSignalsTab() {
  notifInit();
  notifRenderPairChips();

  // Clear badge
  const badge = document.getElementById("notif-badge");
  if (badge) badge.style.display = "none";
}

function notifRenderPairChips() {
  const el = document.getElementById("notif-scan-pairs");
  if (!el) return;

  const pairs = typeof PAIRS !== "undefined" ? PAIRS : [
    "EUR/USD","GBP/USD","USD/JPY","AUD/USD","USD/CAD",
    "EUR/GBP","GBP/JPY","EUR/JPY","NZD/USD","USD/CHF",
    "GBP/AUD","EUR/AUD","AUD/JPY","CAD/JPY","XAU/USD",
    "BTC/USD","ETH/USD"
  ];

  el.innerHTML = pairs.map(p => {
    const hasCross = NOTIF.crossAlerts.find(a => a.pair === p);
    const cls = hasCross
      ? (hasCross.signal === "BUY" ? "crossed-buy" : "crossed-sell")
      : "";
    return `<span class="notif-pair-chip ${cls}">${p}</span>`;
  }).join("");
}

// Update pair chips during scan
const _origScanPair = notifScanPair;
notifScanPair = async function(pair) {
  // Highlight chip as scanning
  const chips = document.querySelectorAll(".notif-pair-chip");
  chips.forEach(c => { if (c.textContent === pair) c.classList.add("scanning"); });

  await _origScanPair(pair);

  // Remove scanning highlight
  chips.forEach(c => { if (c.textContent === pair) c.classList.remove("scanning"); });

  // Update status
  const monStatus = document.getElementById("notif-monitor-status");
  if (monStatus && NOTIF.monitoring) monStatus.textContent = "SCANNING";

  // Re-render chips with cross status
  notifRenderPairChips();
};

// ============================================
// RINGTONE MANAGER — Full Featured
// Choose from presets OR upload own file
// ============================================

const PRESETS = [
  { id:"default",   name:"Default Beep",    fn: () => { if(typeof ringBuySignal==="function") ringBuySignal(); } },
  { id:"chime",     name:"Chime",           fn: () => playPreset([523,659,784,1047],[0.15,0.15,0.15,0.4]) },
  { id:"alert",     name:"Alert Buzz",      fn: () => playPreset([880,880,880],[0.1,0.1,0.2]) },
  { id:"trumpet",   name:"Trumpet Fanfare", fn: () => playPreset([523,659,784,659,784,1047],[0.1,0.1,0.1,0.1,0.1,0.4]) },
  { id:"bell",      name:"Bell Ring",       fn: () => playPreset([1047,784,1047,784,1047],[0.1,0.05,0.1,0.05,0.3]) },
  { id:"ping",      name:"Soft Ping",       fn: () => playPreset([1319],[0.5]) },
  { id:"siren",     name:"Siren",           fn: () => playPreset([440,880,440,880],[0.2,0.2,0.2,0.2]) },
  { id:"casino",    name:"Casino Win",      fn: () => playPreset([523,659,784,1047,1319,1047,784,659,523],[0.08,0.08,0.08,0.08,0.08,0.08,0.08,0.08,0.3]) },
];

let selectedPreset = localStorage.getItem("princex_preset") || "default";

function playPreset(freqs, durs) {
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    let t = ctx.currentTime;
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain= ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = f;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + (durs[i]||0.2));
      osc.start(t); osc.stop(t + (durs[i]||0.2));
      t += (durs[i]||0.2) * 0.9;
    });
  } catch(e) { console.warn("Audio error:", e); }
}

function notifSelectPreset(id) {
  selectedPreset = id;
  localStorage.setItem("princex_preset", id);
  document.querySelectorAll(".preset-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.id === id);
  });
  // Play preview
  const preset = PRESETS.find(p => p.id === id);
  if (preset) preset.fn();
}

function notifPlayCurrentSound(direction) {
  // Custom uploaded file takes priority
  if (NOTIF.customSound) {
    const audio = new Audio(NOTIF.customSound);
    audio.volume = 0.85;
    audio.play().catch(()=>{});
    return;
  }
  // Use selected preset
  const preset = PRESETS.find(p => p.id === selectedPreset);
  if (preset) preset.fn();
}

function renderRingtoneManager(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  el.innerHTML = `
    <div class="rt-wrap">

      <!-- PRESET SOUNDS -->
      <div class="rt-section">
        <div class="rt-title">🎵 CHOOSE RINGTONE</div>
        <div class="rt-presets" id="rt-presets-grid">
          ${PRESETS.map(p => `
            <button class="preset-btn ${p.id===selectedPreset?"active":""}"
              data-id="${p.id}"
              onclick="notifSelectPreset('${p.id}')">
              ${p.name}
            </button>
          `).join("")}
        </div>
      </div>

      <!-- DIVIDER -->
      <div class="rt-or">
        <span>— OR UPLOAD YOUR OWN —</span>
      </div>

      <!-- UPLOAD -->
      <div class="rt-upload-zone" id="rt-drop-zone">
        <input type="file" id="rt-file-input" accept="audio/*"
          style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;cursor:pointer"
          onchange="rtHandleUpload(this)">
        <span class="rt-upload-icon">🎵</span>
        <span class="rt-upload-text">
          ${NOTIF.customSoundName
            ? `<b style="color:var(--green)">${NOTIF.customSoundName}</b>`
            : "Tap to upload MP3 / WAV / OGG"}
        </span>
        <span class="rt-upload-hint">Max 5MB · rings on every EMA cross</span>
      </div>

      <!-- CURRENT SOUND INFO -->
      <div class="rt-current">
        <div class="rt-current-label">NOW PLAYING ON CROSS:</div>
        <div class="rt-current-name" id="rt-current-name">
          ${NOTIF.customSoundName || PRESETS.find(p=>p.id===selectedPreset)?.name || "Default"}
        </div>
        <div class="rt-btns">
          <button class="rt-test-btn" onclick="notifPlayCurrentSound()">▶ TEST SOUND</button>
          ${NOTIF.customSoundName ? `<button class="rt-remove-btn" onclick="rtRemoveCustom()">✕ REMOVE FILE</button>` : ""}
        </div>
      </div>

    </div>
  `;
}

function rtHandleUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5*1024*1024) { alert("File too large — max 5MB"); return; }

  const reader = new FileReader();
  reader.onload = e => {
    NOTIF.customSound     = e.target.result;
    NOTIF.customSoundName = file.name;
    localStorage.setItem("princex_ringtone",      e.target.result);
    localStorage.setItem("princex_ringtone_name", file.name);

    // Auto-preview
    notifPlayCurrentSound();

    // Re-render all ringtone managers
    ["rt-manager","rt-manager-forex"].forEach(id => renderRingtoneManager(id));
    notifShowStatus("✅ Ringtone saved: " + file.name, "success");
  };
  reader.readAsDataURL(file);
}

function rtRemoveCustom() {
  NOTIF.customSound     = null;
  NOTIF.customSoundName = null;
  localStorage.removeItem("princex_ringtone");
  localStorage.removeItem("princex_ringtone_name");
  ["rt-manager","rt-manager-forex"].forEach(id => renderRingtoneManager(id));
  notifShowStatus("🔕 File removed — using preset", "info");
}

// Override notifPlaySound to use new system
notifPlaySound = function(direction) {
  notifPlayCurrentSound(direction);
};

// Also override playSignalSound for Forex tab
if (typeof playSignalSound !== "undefined") {
  const _origPlay = playSignalSound;
  playSignalSound = function(dir, tier) {
    notifPlayCurrentSound(dir);
  };
}

// Re-init to render ringtone manager
const _origNotifInitSignalsTab = notifInitSignalsTab;
notifInitSignalsTab = function() {
  _origNotifInitSignalsTab();
  notifLoadSavedSound();
  renderRingtoneManager("rt-manager");
};
