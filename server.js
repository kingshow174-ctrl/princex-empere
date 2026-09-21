const express = require("express");
const path    = require("path");
const app     = express();
app.use(express.json());

const SUPABASE_URL      = "https://hyqcinqbjyhwdbpgnejs.supabase.co";
const SUPABASE_ANON     = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cWNpbnFianlod2RicGduZWpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNjAxMjQsImV4cCI6MjA5NjkzNjEyNH0.CWcJ7GYKSAYi5zmD4QNatC6xZ85WTwoUw9OEHvbKbzs";
const SUPABASE_SERVICE  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cWNpbnFianlod2RicGduZWpzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTM2MDEyNCwiZXhwIjoyMDk2OTM2MTI0fQ.66z_RQ_lvg1ANsf3D67JaHtRJSWLyNb90_vZRnQ-eL0";
const TWELVE_KEY        = "f9fe5a3fdd2643348aed717f46360ba3";
const GEMINI_KEY        = process.env.GEMINI_KEY || "";

// Serve config to client — anon key only (safe for browser)
app.get("/config.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  const config = {
    TWELVE_DATA_KEY:   process.env.TWELVE_DATA_KEY  || TWELVE_KEY,
    SUPABASE_URL:      process.env.SUPABASE_URL      || SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || SUPABASE_ANON,
    INTERVAL: "1min", CANDLES_BACK: 50, EXPIRY_CANDLES: 3
  };
  const pairs = ["EUR/USD","CAD/JPY","GBP/AUD","EUR/GBP","EUR/CAD","GBP/CAD","GBP/JPY","AUD/USD","CHF/JPY","AUD/CHF","GBP/CHF","AUD/CAD","GBP/USD","USD/JPY","USD/CHF","USD/CAD","EUR/JPY","EUR/AUD","EUR/NZD","EUR/CHF","AUD/JPY","AUD/NZD","CAD/CHF","NZD/USD","NZD/JPY","NZD/CAD","NZD/CHF","XAU/USD","BTC/USD","ETH/USD"];
  res.send(`const CONFIG=${JSON.stringify(config)};const PAIRS=${JSON.stringify(pairs)};window.selectedPair="EUR/USD";function resolveSymbol(p){if(p==="XAU/USD")return"TVC:GOLD";if(p==="BTC/USD")return"BINANCE:BTCUSDT";if(p==="ETH/USD")return"BINANCE:ETHUSDT";return"FX:"+p.replace("/","");}document.addEventListener("DOMContentLoaded",()=>{const g=document.getElementById("pair-grid");if(!g)return;PAIRS.forEach(pair=>{const b=document.createElement("button");b.className="pair-btn"+(pair==="EUR/USD"?" active":"");b.textContent=pair;b.onclick=()=>{document.querySelectorAll(".pair-btn").forEach(x=>x.classList.remove("active"));b.classList.add("active");window.selectedPair=pair;if(window.loadTradingViewChart)loadTradingViewChart(resolveSymbol(pair));const el=document.getElementById("signal-pair-display");if(el)el.textContent=pair+" selected";};g.appendChild(b);});});`);
});

// Serve Gemini key
app.get("/gemini-config.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.send(`window.GEMINI_API_KEY="${process.env.GEMINI_KEY||GEMINI_KEY}";`);
});

// ── SERVER-SIDE AUTH PROXY ────────────────────
// All auth calls go through server using service_role
// This bypasses the "Invalid API key" error on client

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: { message: "Email and password required" } });

    const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "apikey":        SUPABASE_SERVICE,
        "Authorization": "Bearer " + SUPABASE_SERVICE,
      },
      body: JSON.stringify({
        email, password,
        data: { full_name: name || "" }
      })
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch(e) {
    res.status(500).json({ error: { message: e.message } });
  }
});

app.post("/api/auth/signin", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: { message: "Email and password required" } });

    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "apikey":        SUPABASE_SERVICE,
        "Authorization": "Bearer " + SUPABASE_SERVICE,
      },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch(e) {
    res.status(500).json({ error: { message: e.message } });
  }
});

app.post("/api/auth/forgot", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: { message: "Email required" } });

    const response = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "apikey":        SUPABASE_SERVICE,
        "Authorization": "Bearer " + SUPABASE_SERVICE,
      },
      body: JSON.stringify({
        email,
        gotrue_meta_security: {}
      })
    });
    res.status(200).json({ message: "Reset email sent if account exists" });
  } catch(e) {
    res.status(500).json({ error: { message: e.message } });
  }
});

app.post("/api/auth/signout", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (token) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "apikey":        SUPABASE_SERVICE,
          "Authorization": "Bearer " + token,
        }
      });
    }
    res.json({ message: "Signed out" });
  } catch(e) {
    res.status(500).json({ error: { message: e.message } });
  }
});

app.get("/api/auth/user", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: { message: "No token" } });

    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        "apikey":        SUPABASE_SERVICE,
        "Authorization": "Bearer " + token,
      }
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch(e) {
    res.status(500).json({ error: { message: e.message } });
  }
});

// Health
app.get("/health", (req, res) => res.send("OK"));

// Static files
app.use(express.static(path.join(__dirname)));

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Keep alive
setInterval(() => {
  const url = process.env.RENDER_EXTERNAL_URL || "https://princex-empere.onrender.com";
  fetch(url + "/health").catch(() => {});
}, 14 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("PRINCEX EMPERE on port " + PORT));
