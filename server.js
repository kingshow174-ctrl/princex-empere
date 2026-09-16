const express = require("express");
const path    = require("path");
const app     = express();
app.use(express.json());

// Config endpoint
app.get("/config.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  const config = {
    TWELVE_DATA_KEY:   process.env.TWELVE_DATA_KEY   || "f9fe5a3fdd2643348aed717f46360ba3",
    SUPABASE_URL:      process.env.SUPABASE_URL       || "https://hyqcinqbjyhwdbpgnejs.supabase.co",
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cWNpbnFianlod2RicGduZWpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNjAxMjQsImV4cCI6MjA5NjkzNjEyNH0.CWcJ7GYKSAYi5zmD4QNatC6xZ85WTwoUw9OEHvbKbzs",
    INTERVAL:          "1min",
    CANDLES_BACK:      50,
    EXPIRY_CANDLES:    3
  };
  const pairs = ["EUR/USD","CAD/JPY","GBP/AUD","EUR/GBP","EUR/CAD","GBP/CAD","GBP/JPY","AUD/USD","CHF/JPY","AUD/CHF","GBP/CHF","AUD/CAD","GBP/USD","USD/JPY","USD/CHF","USD/CAD","EUR/JPY","EUR/AUD","EUR/NZD","EUR/CHF","AUD/JPY","AUD/NZD","CAD/CHF","NZD/USD","NZD/JPY","NZD/CAD","NZD/CHF","XAU/USD","BTC/USD","ETH/USD"];
  res.send(`const CONFIG=${JSON.stringify(config)};const PAIRS=${JSON.stringify(pairs)};window.selectedPair="EUR/USD";function resolveSymbol(p){if(p==="XAU/USD")return"TVC:GOLD";if(p==="BTC/USD")return"BINANCE:BTCUSDT";if(p==="ETH/USD")return"BINANCE:ETHUSDT";return"FX:"+p.replace("/","");}document.addEventListener("DOMContentLoaded",()=>{const g=document.getElementById("pair-grid");if(!g)return;PAIRS.forEach(pair=>{const b=document.createElement("button");b.className="pair-btn"+(pair==="EUR/USD"?" active":"");b.textContent=pair;b.onclick=()=>{document.querySelectorAll(".pair-btn").forEach(x=>x.classList.remove("active"));b.classList.add("active");window.selectedPair=pair;if(window.loadTradingViewChart)loadTradingViewChart(resolveSymbol(pair));const el=document.getElementById("signal-pair-display");if(el)el.textContent=pair+" selected";};g.appendChild(b);});});`);
});

// Gemini key
app.get("/gemini-config.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.send(`window.GEMINI_API_KEY="${process.env.GEMINI_KEY||""}";`);
});

// Health check
app.get("/health", (req, res) => res.send("OK"));

// Static files
app.use(express.static(path.join(__dirname)));

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Keep alive ping to Render
setInterval(() => {
  const url = process.env.RENDER_EXTERNAL_URL || "https://princex-empere.onrender.com";
  fetch(url + "/health").catch(() => {});
}, 14 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("PRINCEX EMPERE running on port " + PORT));
