let autoScanTimer = null;
let isAutoScan    = false;
let db            = null;

document.addEventListener("DOMContentLoaded", () => {
  const btnSignal = document.getElementById("btn-get-signal");
  const btnAuto   = document.getElementById("btn-auto");
  if (btnSignal) btnSignal.addEventListener("click", onGetSignal);
  if (btnAuto)   btnAuto.addEventListener("click", onToggleAuto);
});

async function onGetSignal() {
  const btn = document.getElementById("btn-get-signal");
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  btn.textContent = "⏳ SCANNING 11 MODULES...";

  try {
    const signal = await generateSignal(window.selectedPair || "EUR/USD");
    renderSignal(signal);
    if (signal.direction === "BUY" || signal.direction === "SELL") {
      const entry = addTrackedSignal(signal);
      if (entry) { startCountdown(entry); renderStats(); renderTrackerHistory(); }
    }
    setStatus(true);
    saveSignal(signal);
  } catch(err) {
    showError("Error: " + err.message);
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = "⚡ GET SIGNAL";
  }
}

function renderSignal(s) {
  const card = document.getElementById("signal-card");
  card.className = "signal-card " + (s.direction==="BUY"?"buy":s.direction==="SELL"?"sell":"idle");
  document.getElementById("signal-direction").textContent = s.direction;
  document.getElementById("signal-pair-display").textContent =
    s.direction === "WAIT"
      ? `${s.pair} · ${s.biasLabel}`
      : `${s.pair} · ${s.biasLabel} · ${s.confidence}% · ${s.strength}`;

  ["c1","c2","c3"].forEach((id,i) => {
    const box = document.getElementById(id);
    const p   = s.predictions[i];
    box.className   = "candle-box " + (p.type==="bull"?"bull":p.type==="bear"?"bear":"doji");
    box.textContent = `C${i+1}: ${p.label}`;
  });

  const opt  = typeof EXPIRY_OPTIONS !== "undefined" ? EXPIRY_OPTIONS.find(o => o.value === selectedExpiry) : null;
  const note = document.getElementById("expiry-note");
  if (note && opt) note.textContent = `1 MIN · ${opt.candles} CANDLES · ${opt.label} EXPIRY`;

  let panel = document.getElementById("sniper-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "sniper-panel";
    panel.className = "sniper-panel";
    card.appendChild(panel);
  }

  const checklistHtml = s.checklist.map(c => {
    const color = c.bias === "bull" ? "bull" : c.bias === "bear" ? "bear" : "neutral";
    const icon  = c.bias === "bull" ? "✅" : c.bias === "bear" ? "🔴" : "⚪";
    return `<div class="sniper-row"><span class="s-label">${icon} ${c.name}</span><span class="s-val ${color}">${c.bias.toUpperCase()}</span></div>`;
  }).join("");

  panel.innerHTML = `
    <div class="confluence-badge ${s.strength==='STRONG'?'strong':s.strength==='MODERATE'?'moderate':'weak'}">
      CONFLUENCE: ${s.confluenceScore}/${s.maxScore} · ${s.strength}
    </div>

    <div class="sniper-divider"></div>
    <p class="sniper-section-title">📈 TREND ENGINE</p>
    <div class="sniper-row"><span class="s-label">EMA 20/50/200</span><span class="s-val ${s.emaTrend==='BULL'?'bull':s.emaTrend==='BEAR'?'bear':'neutral'}">${s.emaTrend}</span></div>
    <div class="sniper-row"><span class="s-label">SUPERTREND</span><span class="s-val ${s.supertrend==='BULL'?'bull':'bear'}">${s.supertrend}</span></div>
    <div class="sniper-row"><span class="s-label">PRICE/VWAP</span><span class="s-val ${s.priceVwap==='ABOVE'?'bull':'bear'}">${s.priceVwap}</span></div>

    <div class="sniper-divider"></div>
    <p class="sniper-section-title">🧠 SMART MONEY</p>
    <div class="sniper-row"><span class="s-label">BOS</span><span class="s-val ${s.bos==='bullish'?'bull':s.bos==='bearish'?'bear':'neutral'}">${s.bos||'none'}</span></div>
    <div class="sniper-row"><span class="s-label">CHOCH</span><span class="s-val ${s.choch==='bullish'?'bull':s.choch==='bearish'?'bear':'neutral'}">${s.choch||'none'}</span></div>
    <div class="sniper-row"><span class="s-label">ORDER BLOCK</span><span class="s-val ${s.orderBlock==='bullish'?'bull':s.orderBlock==='bearish'?'bear':'neutral'}">${s.orderBlock}</span></div>
    <div class="sniper-row"><span class="s-label">FVG</span><span class="s-val ${s.fvg==='bullish'?'bull':s.fvg==='bearish'?'bear':'neutral'}">${s.fvg}</span></div>
    <div class="sniper-row"><span class="s-label">LIQUIDITY SWEEP</span><span class="s-val gold">${s.liquiditySweep}</span></div>

    <div class="sniper-divider"></div>
    <p class="sniper-section-title">⚡ MOMENTUM & VOLUME</p>
    <div class="sniper-row"><span class="s-label">RSI (14)</span><span class="s-val">${s.rsi}</span></div>
    <div class="sniper-row"><span class="s-label">MACD</span><span class="s-val ${s.macdHist==='BULL'?'bull':'bear'}">${s.macdHist}</span></div>
    <div class="sniper-row"><span class="s-label">VOLUME SPIKE</span><span class="s-val ${s.volumeSpike?'gold':'neutral'}">${s.volumeSpike ? 'YES x'+s.volumeRatio : 'NO'}</span></div>

    <div class="sniper-divider"></div>
    <p class="sniper-section-title">🕯 CANDLE PATTERN</p>
    <div class="sniper-row"><span class="s-label">PATTERN</span><span class="s-val gold">${s.pattern}</span></div>

    <div class="sniper-divider"></div>
    <p class="sniper-section-title">📋 CONFLUENCE CHECKLIST (${s.confluenceScore}/11)</p>
    ${checklistHtml}

    <div class="sniper-divider"></div>
    <p class="sniper-section-title">🎯 RISK MANAGEMENT</p>
    <div class="sniper-row"><span class="s-label">ENTRY</span><span class="s-val gold">${s.entry}</span></div>
    <div class="sniper-row"><span class="s-label">STOP LOSS</span><span class="s-val bear">${s.stopLoss}</span></div>
    <div class="sniper-row"><span class="s-label">TP1</span><span class="s-val bull">${s.tp1}</span></div>
    <div class="sniper-row"><span class="s-label">TP2</span><span class="s-val bull">${s.tp2}</span></div>
    <div class="sniper-row"><span class="s-label">RISK:REWARD</span><span class="s-val gold">1 : ${s.riskReward}</span></div>

    <div class="sniper-divider"></div>
    <div class="sniper-row"><span class="s-label">BUY PROBABILITY</span><span class="s-val bull">${s.buyers}%</span></div>
    <div class="sniper-row"><span class="s-label">SELL PROBABILITY</span><span class="s-val bear">${s.sellers}%</span></div>
  `;
}

async function saveSignal(s) {
  if (!db) return;
  try {
    await db.from("signals").insert([{
      pair: s.pair, direction: s.direction,
      confidence: String(s.confidence), rsi: s.rsi, macd: s.macdHist,
      candle1: s.predictions[0].label,
      candle2: s.predictions[1].label,
      candle3: s.predictions[2].label,
      created_at: new Date().toISOString()
    }]);
  } catch(e) { console.warn(e); }
}

function onToggleAuto() {
  const btn = document.getElementById("btn-auto");
  isAutoScan = !isAutoScan;
  if (isAutoScan) {
    btn.textContent = "⏹ STOP AUTO SCAN";
    btn.classList.add("active");
    onGetSignal();
    const expiry = typeof selectedExpiry !== "undefined" ? selectedExpiry : 3;
    autoScanTimer = setInterval(onGetSignal, expiry * 60 * 1000);
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
  const card = document.getElementById("signal-card");
  if (card) card.className = "signal-card idle";
  const dir = document.getElementById("signal-direction");
  const dis = document.getElementById("signal-pair-display");
  if (dir) dir.textContent = "ERR";
  if (dis) dis.textContent = msg;
}

// Auto-run pattern scanner when pair selected or signal generated
document.addEventListener("DOMContentLoaded", () => {
  // Patch pair buttons to also trigger scanner
  document.addEventListener("click", e => {
    if (e.target.classList.contains("pair-btn")) {
      setTimeout(() => {
        const pair = window.selectedPair || "EUR/USD";
        if (typeof startPatternScanner === "function") startPatternScanner(pair);
      }, 300);
    }
  });
});

// Also run scanner after GET SIGNAL
const _origOnGetSignal = onGetSignal;
onGetSignal = async function() {
  await _origOnGetSignal();
  const pair = window.selectedPair || "EUR/USD";
  if (typeof runPatternScan === "function") runPatternScan(pair);
};
