const express = require("express");
const path    = require("path");
const app     = express();

app.get("/config.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.send(`
const CONFIG = {
  TWELVE_DATA_KEY: "${process.env.TWELVE_DATA_KEY || 'f9fe5a3fdd2643348aed717f46360ba3'}",
  SUPABASE_URL: "${process.env.SUPABASE_URL || 'https://hyqcinqbjyhwdbpgnejs.supabase.co'}",
  SUPABASE_ANON_KEY: "${process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cWNpbnFianlod2JwZ25lanMiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTczMzA2NTYyNCwiZXhwIjoyMDQ4NjQxNjI0fQ.CWcJ7GYKSAYi5zmD4QNatC6xZ85WTwoUw90EHvbKbzs'}",
  INTERVAL: "1min",
  CANDLES_BACK: 50,
  EXPIRY_CANDLES: 3,
};

const PAIRS = [
  "EUR/USD","CAD/JPY","GBP/AUD","EUR/GBP",
  "EUR/CAD","GBP/CAD","GBP/JPY","AUD/USD",
  "CHF/JPY","AUD/CHF","GBP/CHF","AUD/CAD",
  "GBP/USD","USD/JPY","USD/CHF","USD/CAD",
  "EUR/JPY","EUR/AUD","EUR/NZD","EUR/CHF",
  "AUD/JPY","AUD/NZD","CAD/CHF","NZD/USD",
  "NZD/JPY","NZD/CAD","NZD/CHF","XAU/USD",
  "BTC/USD","ETH/USD"
];

window.selectedPair = "EUR/USD";

function resolveSymbol(pair) {
  if (pair === "XAU/USD") return "TVC:GOLD";
  if (pair === "BTC/USD") return "BINANCE:BTCUSDT";
  if (pair === "ETH/USD") return "BINANCE:ETHUSDT";
  return "FX:" + pair.replace("/", "");
}

document.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("pair-grid");
  if (!grid) return;
  PAIRS.forEach(pair => {
    const btn = document.createElement("button");
    btn.className = "pair-btn" + (pair === "EUR/USD" ? " active" : "");
    btn.textContent = pair;
    btn.onclick = () => {
      document.querySelectorAll(".pair-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      window.selectedPair = pair;
      if (window.loadTradingViewChart) loadTradingViewChart(resolveSymbol(pair));
      const el = document.getElementById("signal-pair-display");
      if (el) el.textContent = pair + " selected";
    };
    grid.appendChild(btn);
  });
});
  `);
});

app.use(express.static(path.join(__dirname)));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Keep alive ping
setInterval(() => {
  fetch("https://princex-empere.onrender.com/health").catch(() => {});
}, 14 * 60 * 1000);

app.get("/health", (req, res) => res.send("OK"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("PRINCEX EMPERE live on port " + PORT));
