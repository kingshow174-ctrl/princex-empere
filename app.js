// PRINCEX EMPERE — App v4 (no Supabase dependency for signals)

let autoScanTimer = null;
let isAutoScan = false;

// Init Supabase safely
let db = null;
try {
  db = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  setStatus(true);
} catch(e) {
  console.warn("Supabase init failed:", e.message);
}

window.addEventListener("load", () => {
  setTimeout(() => loadTradingViewChart("FX:EURUSD"), 1000);
  loadHistory();

  document.getElementById("btn-get-signal").addEventListener("click", onGetSignal);
  document.getElementById("btn-auto").addEventListener("click", onToggleAuto);

  // Show LIVE immediately — don't wait for Supabase
  setStatus(true);
});

async function onGetSignal() {
  const btn = document.getElementById("btn-get-signal");
  btn.disabled = true;
  btn.textContent = "⏳ ANALYSING...";

  try {
    const signal = await generateSignal(window.selectedPair || "EUR/USD");
    renderSignal(signal);
    renderHistoryItem(signal, false);
    saveSignal(signal); // save async, don't await
    setStatus(true);
  } catch (err) {
    showError("Error: " + err.message);
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = "⚡ GET SIGNAL";
  }
}

function renderSignal(s) {
  const card = document.getElementById("signal-card");
  const cls = s.direction === "BUY" ? "buy"
            : s.direction === "SELL" ? "sell" : "idle";
  card.className = "signal-card " + cls;

  document.getElementById("signal-direction").textContent = s.direction;
  document.getElementById("signal-pair-display").textContent =
    `${s.pair} · ${s.biasLabel} · ${s.confidence}%`;

  ["c1","c2","c3"].forEach((id, i) => {
    const box = document.getElementById(id);
    const p = s.predictions[i];
    const type = p.type === "bull" ? "bull" : p.type === "bear" ? "bear" : "doji";
    box.className = "candle-box " + type;
    box.textContent = `C${i+1}: ${p.label}`;
  });

  // Sniper panel
  let panel = document.getElementById("sniper-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "sniper-panel";
    panel.className = "sniper-panel";
    card.appendChild(panel);
  }

  panel.innerHTML = `
    <div class="sniper-row">
      <span class="s-label">BULL SCORE</span>
      <span class="s-val bull">${s.bullScore}%</span>
    </div>
    <div class="sniper-row">
      <span class="s-label">BEAR SCORE</span>
      <span class="s-val bear">${s.bearScore}%</span>
    </div>
    <div class="sniper-row">
      <span class="s-label">MARKET BIAS</span>
      <span class="s-val ${s.direction==='BUY'?'bull':s.direction==='SELL'?'bear':'neutral'}">${s.biasLabel}</span>
    </div>
    <div class="sniper-divider"></div>
    <div class="sniper-row">
      <span class="s-label">BUYERS 🟢</span>
      <span class="s-val bull">${s.buyers}%</span>
    </div>
    <div class="sniper-row">
      <span class="s-label">SELLERS 🔴</span>
      <span class="s-val bear">${s.sellers}%</span>
    </div>
    <div class="sniper-divider"></div>
    <div class="sniper-row">
      <span class="s-label">RSI (14)</span>
      <span class="s-val">${s.rsi}</span>
    </div>
    <div class="sniper-row">
      <span class="s-label">MACD</span>
      <span class="s-val ${s.macdHist==='BULL'?'bull':'bear'}">${s.macdHist}</span>
    </div>
    <div class="sniper-row">
      <span class="s-label">EMA CROSS</span>
      <span class="s-val ${s.emaCross==='BULL'?'bull':'bear'}">${s.emaCross}</span>
    </div>
    <div class="sniper-row">
      <span class="s-label">STOCHASTIC</span>
      <span class="s-val">${s.stoch}</span>
    </div>
    <div class="sniper-row">
      <span class="s-label">ADX</span>
      <span class="s-val">${s.adx}</span>
    </div>
    <div class="sniper-row">
      <span class="s-label">PRICE/VWAP</span>
      <span class="s-val ${s.priceVwap==='ABOVE'?'bull':'bear'}">${s.priceVwap}</span>
    </div>
    <div class="sniper-divider"></div>
    <div class="sniper-row">
      <span class="s-label">PATTERN</span>
      <span class="s-val gold">${s.pattern}</span>
    </div>
  `;
}

async function saveSignal(s) {
  if (!db) return;
  try {
    await db.from("signals").insert([{
      pair: s.pair, direction: s.direction,
      confidence: String(s.confidence),
      rsi: s.rsi, macd: s.macd,
      candle1: s.predictions[0].label,
      candle2: s.predictions[1].label,
      candle3: s.predictions[2].label,
      created_at: new Date().toISOString()
    }]);
  } catch(e) { console.warn("Save failed:", e.message); }
}

async function loadHistory() {
  if (!db) return;
  try {
    const { data } = await db.from("signals").select("*")
      .order("created_at", { ascending: false }).limit(20);
    if (!data || data.length === 0) return;
    const list = document.getElementById("history-list");
    list.innerHTML = "";
    data.forEach(s => renderHistoryItem(s, true));
  } catch(e) { console.warn("History failed:", e.message); }
}

function renderHistoryItem(s, append = true) {
  const list = document.getElementById("history-list");
  list.querySelector(".empty-msg")?.remove();
  const item = document.createElement("div");
  item.className = "history-item";
  const time = s.time || (s.created_at ? new Date(s.created_at).toLocaleTimeString() : "");
  const c1 = s.candle1 || s.predictions?.[0]?.label || "--";
  const c2 = s.candle2 || s.predictions?.[1]?.label || "--";
  const c3 = s.candle3 || s.predictions?.[2]?.label || "--";
  item.innerHTML = `
    <span class="h-pair">${s.pair}</span>
    <span class="h-dir ${(s.direction||'').toLowerCase()}">${s.direction}</span>
    <span style="font-size:10px">${c1} · ${c2} · ${c3}</span>
    <span class="h-time">${time}</span>
  `;
  if (append) list.appendChild(item);
  else list.prepend(item);
}

function onToggleAuto() {
  const btn = document.getElementById("btn-auto");
  isAutoScan = !isAutoScan;
  if (isAutoScan) {
    btn.textContent = "⏹ STOP AUTO SCAN";
    btn.classList.add("active");
    onGetSignal();
    autoScanTimer = setInterval(onGetSignal, 60000);
  } else {
    btn.textContent = "🔄 AUTO SCAN";
    btn.classList.remove("active");
    clearInterval(autoScanTimer);
  }
}

function setStatus(live) {
  const dot  = document.querySelector(".live-dot");
  const text = document.getElementById("status-text");
  if (!dot || !text) return;
  dot.classList.toggle("live", live);
  text.textContent = live ? "LIVE" : "OFFLINE";
}

function showError(msg) {
  document.getElementById("signal-card").className = "signal-card idle";
  document.getElementById("signal-direction").textContent = "ERR";
  document.getElementById("signal-pair-display").textContent = msg;
}
