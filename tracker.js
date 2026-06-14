// PRINCEX EMPERE — Tracker v6
// Countdown only — no WIN/LOSS tracking

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
  if (signal.direction !== "BUY" && signal.direction !== "SELL") return null;
  const signals = loadFromStorage();
  const entry = {
    id: Date.now(),
    pair: signal.pair,
    direction: signal.direction,
    timestamp: new Date().toISOString(),
    expiresAt: new Date(Date.now() + getExpiryMs()).toISOString(),
  };
  signals.unshift(entry);
  saveToStorage(signals.slice(0, 200));
  return entry;
}

function clearHistory() {
  if (confirm("Clear all signal history?")) {
    localStorage.removeItem(TRACKER_KEY);
    Object.values(historyIntervals).forEach(clearInterval);
    historyIntervals = {};
    renderTrackerHistory();
    const bar = document.getElementById("countdown-bar");
    if (bar) bar.style.display = "none";
    if (mainCountdownInterval) clearInterval(mainCountdownInterval);
  }
}

function getStats() {
  const all = loadFromStorage().filter(s => s.direction === "BUY" || s.direction === "SELL");
  const now = new Date();
  const startOfDay  = new Date(now); startOfDay.setHours(0,0,0,0);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0,0,0,0);

  return {
    daily:   all.filter(s => new Date(s.timestamp) >= startOfDay).length,
    weekly:  all.filter(s => new Date(s.timestamp) >= startOfWeek).length,
    alltime: all.length,
  };
}

// ── MAIN COUNTDOWN BAR ───────────────────────
let mainCountdownInterval = null;

function startCountdown(entry) {
  if (mainCountdownInterval) clearInterval(mainCountdownInterval);

  const bar      = document.getElementById("countdown-bar");
  const timerEl  = document.getElementById("countdown-timer");
  const statusEl = document.getElementById("countdown-status");
  const fill     = document.getElementById("countdown-fill");
  if (!bar) return;

  bar.style.display   = "block";
  bar.style.border    = "1px solid var(--border)";
  timerEl.style.color = "";

  const totalMs = 3 * 60 * 1000;
  const endTime = new Date(entry.expiresAt).getTime();

  mainCountdownInterval = setInterval(() => {
    const remaining = endTime - Date.now();

    if (remaining <= 0) {
      clearInterval(mainCountdownInterval);
      timerEl.textContent  = "EXPIRED ⏰";
      timerEl.style.color  = "#f5c842";
      statusEl.textContent = `${entry.direction} ${entry.pair} · DONE`;
      setTimeout(() => { bar.style.display = "none"; }, 3000);
      return;
    }

    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    const pct  = (remaining / totalMs) * 100;

    timerEl.textContent  = `${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;
    statusEl.textContent = `${entry.direction} ${entry.pair} · EXPIRING`;
    timerEl.style.color  = pct > 50 ? "#00e676" : pct > 25 ? "#f5c842" : "#ff3b5c";

    if (fill) {
      fill.style.width      = pct + "%";
      fill.style.background = pct > 50 ? "#00e676" : pct > 25 ? "#f5c842" : "#ff3b5c";
    }
  }, 500);
}

// ── PER-ROW COUNTDOWNS ───────────────────────
let historyIntervals = {};

function startHistoryCountdowns() {
  Object.values(historyIntervals).forEach(clearInterval);
  historyIntervals = {};

  loadFromStorage().forEach(entry => {
    const endTime = new Date(entry.expiresAt).getTime();
    if (Date.now() >= endTime) return; // already expired

    const tick = () => {
      const timerEl = document.getElementById(`timer-${entry.id}`);
      if (!timerEl) { clearInterval(historyIntervals[entry.id]); return; }

      const remaining = endTime - Date.now();
      if (remaining <= 0) {
        clearInterval(historyIntervals[entry.id]);
        timerEl.textContent = "⏰ DONE";
        timerEl.style.color = "#f5c842";
        return;
      }

      const mins  = Math.floor(remaining / 60000);
      const secs  = Math.floor((remaining % 60000) / 1000);
      const pct   = remaining / (3 * 60 * 1000);
      timerEl.style.color = pct > 0.5 ? "#00e676" : pct > 0.25 ? "#f5c842" : "#ff3b5c";
      timerEl.textContent = `⏱ ${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;
    };

    tick();
    historyIntervals[entry.id] = setInterval(tick, 1000);
  });
}

function renderStats() {
  const s  = getStats();
  const el = document.getElementById("stats-panel");
  if (!el) return;

  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-box">
        <p class="stat-label">TODAY</p>
        <p class="stat-rate" style="color:var(--gold)">${s.daily}</p>
        <p class="stat-total">signals</p>
      </div>
      <div class="stat-box">
        <p class="stat-label">THIS WEEK</p>
        <p class="stat-rate" style="color:var(--gold)">${s.weekly}</p>
        <p class="stat-total">signals</p>
      </div>
      <div class="stat-box">
        <p class="stat-label">ALL TIME</p>
        <p class="stat-rate" style="color:var(--gold)">${s.alltime}</p>
        <p class="stat-total">signals</p>
      </div>
    </div>
  `;
}

function renderTrackerHistory() {
  const signals = loadFromStorage().slice(0, 50);
  const el = document.getElementById("history-list");
  if (!el) return;
  el.innerHTML = "";

  if (signals.length === 0) {
    el.innerHTML = '<p class="empty-msg">No signals yet.</p>';
    return;
  }

  signals.forEach(s => {
    const item = document.createElement("div");
    item.className = "history-item";
    const time      = new Date(s.timestamp).toLocaleTimeString();
    const remaining = new Date(s.expiresAt).getTime() - Date.now();
    const expired   = remaining <= 0;

    item.innerHTML = `
      <span class="h-pair">${s.pair}</span>
      <span class="h-dir ${s.direction.toLowerCase()}">${s.direction}</span>
      <span id="timer-${s.id}" style="font-family:monospace;font-size:13px;font-weight:700;color:${expired?'#64748b':'#00e676'}">
        ${expired ? "⏰ DONE" : "⏱ --:--"}
      </span>
      <span class="h-time">${time}</span>
    `;
    el.appendChild(item);
  });

  setTimeout(startHistoryCountdowns, 50);
}
