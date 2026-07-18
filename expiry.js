// ============================================
// PRINCEX EMPERE — Expiry Options
// 1min, 2min, 3min, 5min expiry selector
// ============================================

const EXPIRY_OPTIONS = [
  { label: "1 MIN",  value: 1,  candles: 1 },
  { label: "2 MIN",  value: 2,  candles: 2 },
  { label: "3 MIN",  value: 3,  candles: 3 },
  { label: "5 MIN",  value: 5,  candles: 5 },
  { label: "10 MIN", value: 10, candles: 10 },
];

let selectedExpiry = 3; // default 3 min

function renderExpirySelector() {
  const section = document.getElementById("expiry-selector");
  if (!section) return;

  section.innerHTML = "";
  EXPIRY_OPTIONS.forEach(opt => {
    const btn = document.createElement("button");
    btn.className = "expiry-btn" + (opt.value === selectedExpiry ? " active" : "");
    btn.textContent = opt.label;
    btn.onclick = () => {
      selectedExpiry = opt.value;
      document.querySelectorAll(".expiry-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      updateExpiryNote();
    };
    section.appendChild(btn);
  });
  updateExpiryNote();
}

function updateExpiryNote() {
  const note = document.getElementById("expiry-note");
  const opt  = EXPIRY_OPTIONS.find(o => o.value === selectedExpiry);
  if (note && opt) {
    note.textContent = `1 MIN · ${opt.candles} CANDLES · ${opt.label} EXPIRY`;
  }
}

function getExpiryMs() {
  return selectedExpiry * 60 * 1000;
}
