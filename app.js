const supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
let selectedPair = "EUR/USD";
let autoScanTimer = null;
let isAutoScan = false;

window.addEventListener("load", () => {
  setTimeout(() => loadTradingViewChart("FX:EURUSD"), 800);
  loadHistory();
  setStatus(false);
  document.getElementById("btn-get-signal").addEventListener("click", onGetSignal);
  document.getElementById("btn-auto").addEventListener("click", onToggleAuto);
});

async function onGetSignal() {
  const btn = document.getElementById("btn-get-signal");
  btn.disabled = true;
  btn.textContent = "⏳ ANALYSING...";
  setStatus(false);
  try {
    const signal = await generateSignal(selectedPair);
    renderSignal(signal);
    await saveSignal(signal);
    renderHistoryItem(signal, false);
    setStatus(true);
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "⚡ GET SIGNAL";
  }
}

function renderSignal(s) {
  const card = document.getElementById("signal-card");
  const cls = s.direction === "BUY" ? "buy" : s.direction === "SELL" ? "sell" : "idle";
  card.className = "signal-card " + cls;

  document.getElementById("signal-direction").textContent = s.direction;
  document.getElementById("signal-pair-display").textContent =
    `${s.pair} · ${s.biasLabel} · ${s.confidence}% · ${s.aiPowered ? "🤖 AI" : "📊 IND"}`;

  ["c1","c2","c3"].forEach((id, i) => {
    const box = document.getElementById(id);
    const type = s.predictions[i].type === "bull" ? "bull"
               : s.predictions[i].type === "bear" ? "bear" : "doji";
    box.className = "candle-box " + type;
    box.textContent = `C${i+1}: ${s.predictions[i].label}`;
  });

  let panel = document.getElementById("sniper-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "sniper-panel";
    panel.className = "sniper-panel";
    card.appendChild(panel);
  }

  panel.innerHTML = `
    ${s.reason ? `<div class="ai-reason">🤖 ${s.reason}</div>` : ""}
    <div class="sniper-row">
      <span class="s-label">ENTRY</span>
      <span class="s-val gold">${s.entry || "NOW"}</span>
    </div>
    <div class="sniper-row">
      <span class="s-label">RISK</span>
      <span class="s-val ${s.risk === 'LOW' ? 'bull' : s.risk === 'HIGH' ? 'bear' : 'neutral'}">${s.risk || "MEDIUM"}</span>
    </div>
    <div class="sniper-divider"></div>
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
      <span class="s-val ${s.direction === 'BUY' ? 'bull' : s.direction === 'SELL' ? 'bear' : 'neutral'}">${s.biasLabel}</span>
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
      <span class="s-label">PRICE/VWAP</span>
      <span class="s-val ${s.priceVwap === 'ABOVE' ? 'bull' : 'bear'}">${s.priceVwap}</span>
    </div>
    <div class="sniper-row">
      <span class="s-label">RSI (14)</span>
      <span class="s-val">${s.rsi}</span>
    </div>
    <div class="sniper-row">
      <span class="s-label">MACD TREND</span>
      <span class="s-val ${s.macdHist === 'BULL' ? 'bull' : 'bear'}">${s.macdHist}</span>
    </div>
    <div class="sniper-row">
      <span class="s-label">EMA CROSS</span>
      <span class="s-val ${s.emaCross === 'BULL' ? 'bull' : 'bear'}">${s.emaCross}</span>
    </div>
    <div class="sniper-row">
      <span class="s-label">STOCHASTIC</span>
      <span class="s-val">${s.stoch}</span>
    </div>
    <div class="sniper-row">
      <span class="s-label">ADX POWER</span>
      <span class="s-val">${s.adx}</span>
    </div>
    <div class="sniper-divider"></div>
    <div class="sniper-row">
      <span class="s-label">PATTERN</span>
      <span class="s-val gold">${s.pattern}</span>
    </div>
  `;
}

async function saveSignal(s) {
  try {
    await supabase.from("signals").insert([{
      pair: s.pair, direction: s.direction,
      confidence: String(s.confidence),
      rsi: s.rsi, macd: s.macd,
      candle1: s.predictions[0].label,
      candle2: s.predictions[1].label,
      candle3: s.predictions[2].label,
      created_at: new Date().toISOString()
    }]);
  } catch(e) { console.warn(e); }
}

async function loadHistory() {
  try {
    const { data } = await supabase.from("signals").select("*")
      .order("created_at", { ascending: false }).limit(20);
    const list = document.getElementById("history-list");
    list.innerHTML = "";
    if (!data || data.length === 0) {
      list.innerHTML = '<p class="empty-msg">No signals yet.</p>'; return;
    }
    data.forEach(s => renderHistoryItem(s, true));
  } catch(e) { console.warn(e); }
}

function renderHistoryItem(s, append = true) {
  const list = document.getElementById("history-list");
  list.querySelector(".empty-msg")?.remove();
  const item = document.createElement("div");
  item.className = "history-item";
  const time = s.time || new Date(s.created_at).toLocaleTimeString();
  item.innerHTML = `
    <span class="h-pair">${s.pair}</span>
    <span class="h-dir ${(s.direction||'').toLowerCase()}">${s.direction}</span>
    <span>${s.candle1||s.predictions?.[0]?.label} · ${s.candle2||s.predictions?.[1]?.label} · ${s.candle3||s.predictions?.[2]?.label}</span>
    <span class="h-time">${time}</span>
  `;
  if (append) list.appendChild(item); else list.prepend(item);
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
  document.querySelector(".live-dot").classList.toggle("live", live);
  document.getElementById("status-text").textContent = live ? "LIVE" : "OFFLINE";
}

function showError(msg) {
  document.getElementById("signal-card").className = "signal-card idle";
  document.getElementById("signal-direction").textContent = "ERR";
  document.getElementById("signal-pair-display").textContent = msg;
  setStatus(false);
}
