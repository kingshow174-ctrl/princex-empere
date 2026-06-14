// ============================================
// PRINCEX EMPERE — Signal Tracker v2
// Only tracks BUY/SELL signals
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
  // Only track BUY or SELL
  if (signal.direction !== "BUY" && signal.direction !== "SELL") return null;

  const signals = loadFromStorage();
  const entry = {
    id: Date.now(),
    pair: signal.pair,
    direction: signal.direction,
    confidence: signal.confidence,
    pattern: signal.pattern,
    timestamp: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
    status: "PENDING",
    exitPrice: null,
  };
  signals.unshift(entry);
  saveToStorage(signals.slice(0, 200));
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

function clearHistory() {
  if (confirm("Clear all signal history? This cannot be undone.")) {
    localStorage.removeItem(TRACKER_KEY);
    renderStats();
    renderTrackerHistory();
    const bar = document.getElementById("countdown-bar");
    if (bar) bar.style.display = "none";
    if (countdownInterval) clearInterval(countdownInterval);
  }
}

function getStats() {
  // Only count BUY/SELL signals
  const all = loadFromStorage().filter(s => s.direction === "BUY" || s.direction === "SELL");
  const now = new Date();

  const startOfDay = new Date(now); startOfDay.setHours(0,0,0,0);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0,0,0,0);

  function calcGroup(list) {
    const done   = list.filter(s => s.status === "WIN" || s.status === "LOSS");
    const wins   = done.filter(s => s.status === "WIN").length;
    const losses = done.filter(s => s.status === "LOSS").length;
    const total  = done.length;
    const rate   = total > 0 ? Math.round((wins / total) * 100) : 0;
    const pending = list.filter(s => s.status === "PENDING").length;
    return { wins, losses, total, rate, pending };
  }

  return {
    daily:   calcGroup(all.filter(s => new Date(s.timestamp) >= startOfDay)),
    weekly:  calcGroup(all.filter(s => new Date(s.timestamp) >= startOfWeek)),
    alltime: calcGroup(all),
  };
}

// ── COUNTDOWN ────────────────────────────────

let countdownInterval = null;

function startCountdown(entry, onComplete) {
  if (countdownInterval) clearInterval(countdownInterval);

  const bar      = document.getElementById("countdown-bar");
  const timerEl  = document.getElementById("countdown-timer");
  const statusEl = document.getElementById("countdown-status");
  const fill     = document.getElementById("countdown-fill");
  if (!bar) return;

  bar.style.display = "block";
  bar.style.border  = "1px solid var(--border)";
  timerEl.style.color = "";

  const totalMs = 3 * 60 * 1000;
  const endTime = new Date(entry.expiresAt).getTime();

  countdownInterval = setInterval(async () => {
    const remaining = endTime - Date.now();

    if (remaining <= 0) {
      clearInterval(countdownInterval);
      timerEl.textContent = "00:00";
      statusEl.textContent = "⏳ CHECKING...";

      try {
        const result = await checkSignalResult(entry);
        updateSignalResult(entry.id, result.status, result.exitPrice);
        showResult(result.status, bar, timerEl, statusEl);
        renderStats();
        renderTrackerHistory();
        if (onComplete) onComplete(result.status);
      } catch(e) {
        statusEl.innerHTML = `
          <button onclick="manualResult('WIN',${entry.id})" style="background:#00e676;color:#000;border:none;padding:6px 16px;border-radius:6px;font-weight:700;margin-right:6px;cursor:pointer;font-family:monospace">✅ WIN</button>
          <button onclick="manualResult('LOSS',${entry.id})" style="background:#ff3b5c;color:#fff;border:none;padding:6px 16px;border-radius:6px;font-weight:700;cursor:pointer;font-family:monospace">❌ LOSS</button>
        `;
      }
      return;
    }

    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    const pct  = (remaining / totalMs) * 100;

    timerEl.textContent = `${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;
    statusEl.textContent = `${entry.direction} ${entry.pair} · EXPIRING`;

    if (fill) {
      fill.style.width = pct + "%";
      fill.style.background = pct > 50 ? "#00e676" : pct > 25 ? "#f5c842" : "#ff3b5c";
    }
  }, 500);
}

async function checkSignalResult(entry) {
  const symbol = entry.pair.replace("/", "");
  const res  = await fetch(`https://api.twelvedata.com/price?symbol=${symbol}&apikey=${CONFIG.TWELVE_DATA_KEY}`);
  const data = await res.json();
  const exitPrice = parseFloat(data.price);

  const res2 = await fetch(`https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1min&outputsize=4&apikey=${CONFIG.TWELVE_DATA_KEY}`);
  const data2 = await res2.json();
  const entryPrice = parseFloat(data2.values?.[data2.values.length - 1]?.close || exitPrice);

  let status;
  if (entry.direction === "BUY")  status = exitPrice >= entryPrice ? "WIN" : "LOSS";
  else                            status = exitPrice <= entryPrice ? "WIN" : "LOSS";

  return { status, exitPrice, entryPrice };
}

function showResult(status, bar, timerEl, statusEl) {
  const win = status === "WIN";
  bar.style.border     = `2px solid ${win ? "#00e676" : "#ff3b5c"}`;
  timerEl.textContent  = win ? "WIN ✅" : "LOSS ❌";
  timerEl.style.color  = win ? "#00e676" : "#ff3b5c";
  statusEl.textContent = win ? "🎯 SIGNAL WON!" : "❌ SIGNAL LOST";
  setTimeout(() => { bar.style.display = "none"; timerEl.style.color = ""; }, 5000);
}

function manualResult(status, id) {
  updateSignalResult(id, status, null);
  const bar      = document.getElementById("countdown-bar");
  const timerEl  = document.getElementById("countdown-timer");
  const statusEl = document.getElementById("countdown-status");
  showResult(status, bar, timerEl, statusEl);
  renderStats();
  renderTrackerHistory();
}

function renderStats() {
  const s  = getStats();
  const el = document.getElementById("stats-panel");
  if (!el) return;

  function winBar(rate, wins, losses) {
    return `
      <div style="background:#0a0e1a;border-radius:4px;height:5px;margin:5px 0 6px;overflow:hidden">
        <div style="width:${rate}%;height:100%;background:${rate>=50?'#00e676':'#ff3b5c'};transition:width 0.5s"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:9px">
        <span style="color:#00e676">✅ ${wins}W</span>
        <span style="color:#ff3b5c">❌ ${losses}L</span>
      </div>`;
  }

  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-box">
        <p class="stat-label">TODAY</p>
        <p class="stat-rate ${s.daily.rate>=50?'win':'loss'}">${s.daily.total>0?s.daily.rate+'%':'--'}</p>
        <p class="stat-total">${s.daily.total} traded</p>
        ${winBar(s.daily.rate, s.daily.wins, s.daily.losses)}
      </div>
      <div class="stat-box">
        <p class="stat-label">THIS WEEK</p>
        <p class="stat-rate ${s.weekly.rate>=50?'win':'loss'}">${s.weekly.total>0?s.weekly.rate+'%':'--'}</p>
        <p class="stat-total">${s.weekly.total} traded</p>
        ${winBar(s.weekly.rate, s.weekly.wins, s.weekly.losses)}
      </div>
      <div class="stat-box">
        <p class="stat-label">ALL TIME</p>
        <p class="stat-rate ${s.alltime.rate>=50?'win':'loss'}">${s.alltime.total>0?s.alltime.rate+'%':'--'}</p>
        <p class="stat-total">${s.alltime.total} traded</p>
        ${winBar(s.alltime.rate, s.alltime.wins, s.alltime.losses)}
      </div>
    </div>
  `;
}

function renderTrackerHistory() {
  const signals = loadFromStorage()
    .filter(s => s.direction === "BUY" || s.direction === "SELL")
    .slice(0, 50);

  const el = document.getElementById("history-list");
  if (!el) return;
  el.innerHTML = "";

  if (signals.length === 0) {
    el.innerHTML = '<p class="empty-msg">No BUY/SELL signals yet.</p>';
    return;
  }

  signals.forEach(s => {
    const item = document.createElement("div");
    item.className = "history-item";
    const time       = new Date(s.timestamp).toLocaleTimeString();
    const statusColor= s.status==="WIN"?"#00e676":s.status==="LOSS"?"#ff3b5c":"#f5c842";
    const statusIcon = s.status==="WIN"?"✅":s.status==="LOSS"?"❌":"⏳";
    item.innerHTML = `
      <span class="h-pair">${s.pair}</span>
      <span class="h-dir ${s.direction.toLowerCase()}">${s.direction}</span>
      <span style="color:${statusColor};font-family:monospace;font-size:12px;font-weight:700">${statusIcon} ${s.status}</span>
      <span class="h-time">${time}</span>
    `;
    el.appendChild(item);
  });
}
