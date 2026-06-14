// ============================================
// PRINCEX EMPERE — Signal Tracker
// Countdown + Win/Loss tracking
// ============================================

const TRACKER_KEY = "princex_signals";

function saveToStorage(signals) {
  localStorage.setItem(TRACKER_KEY, JSON.stringify(signals));
}

function loadFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(TRACKER_KEY) || "[]");
  } catch(e) { return []; }
}

function addTrackedSignal(signal) {
  const signals = loadFromStorage();
  const entry = {
    id: Date.now(),
    pair: signal.pair,
    direction: signal.direction,
    confidence: signal.confidence,
    pattern: signal.pattern,
    timestamp: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3 * 60 * 1000).toISOString(), // 3 min
    status: "PENDING", // PENDING → WIN or LOSS
    entryPrice: null,
    exitPrice: null,
  };
  signals.unshift(entry);
  saveToStorage(signals.slice(0, 200)); // keep last 200
  return entry;
}

function updateSignalResult(id, status, exitPrice) {
  const signals = loadFromStorage();
  const idx = signals.findIndex(s => s.id === id);
  if (idx !== -1) {
    signals[idx].status = status;
    signals[idx].exitPrice = exitPrice;
    saveToStorage(signals);
  }
}

function getStats() {
  const signals = loadFromStorage();
  const now = new Date();

  const startOfDay  = new Date(now); startOfDay.setHours(0,0,0,0);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0,0,0,0);

  function calcGroup(list) {
    const done = list.filter(s => s.status === "WIN" || s.status === "LOSS");
    const wins = done.filter(s => s.status === "WIN").length;
    const losses = done.filter(s => s.status === "LOSS").length;
    const total = done.length;
    const rate = total > 0 ? Math.round((wins / total) * 100) : 0;
    return { wins, losses, total, rate, pending: list.filter(s => s.status === "PENDING").length };
  }

  const daily  = signals.filter(s => new Date(s.timestamp) >= startOfDay);
  const weekly = signals.filter(s => new Date(s.timestamp) >= startOfWeek);

  return {
    daily:   calcGroup(daily),
    weekly:  calcGroup(weekly),
    alltime: calcGroup(signals),
  };
}

// ── COUNTDOWN TIMER ──────────────────────────

let activeCountdown = null;
let countdownInterval = null;

function startCountdown(signalEntry, onComplete) {
  // Clear any existing
  if (countdownInterval) clearInterval(countdownInterval);
  activeCountdown = signalEntry;

  const bar = document.getElementById("countdown-bar");
  const timerEl = document.getElementById("countdown-timer");
  const statusEl = document.getElementById("countdown-status");
  if (!bar) return;

  bar.style.display = "block";
  const totalMs = 3 * 60 * 1000;
  const endTime = new Date(signalEntry.expiresAt).getTime();

  countdownInterval = setInterval(async () => {
    const remaining = endTime - Date.now();

    if (remaining <= 0) {
      clearInterval(countdownInterval);
      timerEl.textContent = "00:00";
      statusEl.textContent = "⏳ CHECKING RESULT...";

      // Auto-determine result
      try {
        const result = await checkSignalResult(signalEntry);
        updateSignalResult(signalEntry.id, result.status, result.exitPrice);
        showResult(result.status, bar, timerEl, statusEl);
        renderStats();
        renderTrackerHistory();
        if (onComplete) onComplete(result.status);
      } catch(e) {
        statusEl.textContent = "TAP WIN ✅ or LOSS ❌";
        showManualButtons(signalEntry, bar, statusEl);
      }
      return;
    }

    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    const pct  = (remaining / totalMs) * 100;

    timerEl.textContent = `${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;
    statusEl.textContent = `⏱ SIGNAL ACTIVE — ${signalEntry.direction} ${signalEntry.pair}`;

    // Progress bar color
    const fill = document.getElementById("countdown-fill");
    if (fill) {
      fill.style.width = pct + "%";
      fill.style.background = pct > 50 ? "#00e676" : pct > 25 ? "#f5c842" : "#ff3b5c";
    }
  }, 500);
}

async function checkSignalResult(entry) {
  // Fetch current price from Twelve Data
  const symbol = entry.pair.replace("/", "");
  const url = `https://api.twelvedata.com/price?symbol=${symbol}&apikey=${CONFIG.TWELVE_DATA_KEY}`;
  const res  = await fetch(url);
  const data = await res.json();
  const exitPrice = parseFloat(data.price);

  // We need entry price — fetch from candles at signal time
  const candleUrl = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1min&outputsize=5&apikey=${CONFIG.TWELVE_DATA_KEY}`;
  const cr = await fetch(candleUrl);
  const cd = await cr.json();
  const entryPrice = parseFloat(cd.values?.[0]?.close || exitPrice);

  let status;
  if (entry.direction === "BUY") {
    status = exitPrice > entryPrice ? "WIN" : "LOSS";
  } else if (entry.direction === "SELL") {
    status = exitPrice < entryPrice ? "WIN" : "LOSS";
  } else {
    status = "LOSS";
  }

  return { status, exitPrice, entryPrice };
}

function showResult(status, bar, timerEl, statusEl) {
  const isWin = status === "WIN";
  bar.style.border = `2px solid ${isWin ? "#00e676" : "#ff3b5c"}`;
  timerEl.textContent = isWin ? "WIN ✅" : "LOSS ❌";
  timerEl.style.color = isWin ? "#00e676" : "#ff3b5c";
  statusEl.textContent = isWin ? "🎯 SIGNAL WON!" : "❌ SIGNAL LOST";

  setTimeout(() => {
    bar.style.display = "none";
    timerEl.style.color = "";
  }, 4000);
}

function showManualButtons(entry, bar, statusEl) {
  statusEl.innerHTML = `
    <button onclick="manualResult('WIN', ${entry.id})" style="background:#00e676;color:#000;border:none;padding:8px 20px;border-radius:8px;font-weight:700;margin-right:8px;cursor:pointer">✅ WIN</button>
    <button onclick="manualResult('LOSS', ${entry.id})" style="background:#ff3b5c;color:#fff;border:none;padding:8px 20px;border-radius:8px;font-weight:700;cursor:pointer">❌ LOSS</button>
  `;
}

function manualResult(status, id) {
  updateSignalResult(id, status, null);
  const bar = document.getElementById("countdown-bar");
  const timerEl = document.getElementById("countdown-timer");
  const statusEl = document.getElementById("countdown-status");
  showResult(status, bar, timerEl, statusEl);
  renderStats();
  renderTrackerHistory();
}

function renderStats() {
  const stats = getStats();
  const el = document.getElementById("stats-panel");
  if (!el) return;

  function bar(pct, wins, losses) {
    return `
      <div style="background:#1a2236;border-radius:6px;height:6px;margin:4px 0 8px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:#00e676;transition:width 0.5s"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:10px">
        <span style="color:#00e676">✅ ${wins} WIN</span>
        <span style="color:#ff3b5c">❌ ${losses} LOSS</span>
      </div>
    `;
  }

  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-box">
        <p class="stat-label">TODAY</p>
        <p class="stat-rate ${stats.daily.rate >= 50 ? 'win' : 'loss'}">${stats.daily.rate}%</p>
        <p class="stat-total">${stats.daily.total} signals</p>
        ${bar(stats.daily.rate, stats.daily.wins, stats.daily.losses)}
      </div>
      <div class="stat-box">
        <p class="stat-label">THIS WEEK</p>
        <p class="stat-rate ${stats.weekly.rate >= 50 ? 'win' : 'loss'}">${stats.weekly.rate}%</p>
        <p class="stat-total">${stats.weekly.total} signals</p>
        ${bar(stats.weekly.rate, stats.weekly.wins, stats.weekly.losses)}
      </div>
      <div class="stat-box">
        <p class="stat-label">ALL TIME</p>
        <p class="stat-rate ${stats.alltime.rate >= 50 ? 'win' : 'loss'}">${stats.alltime.rate}%</p>
        <p class="stat-total">${stats.alltime.total} signals</p>
        ${bar(stats.alltime.rate, stats.alltime.wins, stats.alltime.losses)}
      </div>
    </div>
  `;
}

function renderTrackerHistory() {
  const signals = loadFromStorage().slice(0, 30);
  const el = document.getElementById("history-list");
  if (!el) return;
  el.innerHTML = "";

  if (signals.length === 0) {
    el.innerHTML = '<p class="empty-msg">No signals yet. Hit GET SIGNAL to start.</p>';
    return;
  }

  signals.forEach(s => {
    const item = document.createElement("div");
    item.className = "history-item";
    const time = new Date(s.timestamp).toLocaleTimeString();
    const statusColor = s.status === "WIN" ? "#00e676" : s.status === "LOSS" ? "#ff3b5c" : "#f5c842";
    const statusIcon  = s.status === "WIN" ? "✅" : s.status === "LOSS" ? "❌" : "⏳";
    item.innerHTML = `
      <span class="h-pair">${s.pair}</span>
      <span class="h-dir ${s.direction.toLowerCase()}">${s.direction}</span>
      <span style="color:${statusColor};font-family:monospace;font-size:11px">${statusIcon} ${s.status}</span>
      <span class="h-time">${time}</span>
    `;
    el.appendChild(item);
  });
}
