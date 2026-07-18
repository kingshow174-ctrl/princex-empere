// ============================================
// PRINCEX EMPERE — Gemini AI for DERIV Tab
// Reads all indicators and thinks like a trader
// ============================================

const GEMINI_KEY_DERIV = window.GEMINI_API_KEY;
const GEMINI_DERIV_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY_DERIV}`;

async function geminiDerivAnalyse(pair, candles, scoreResult) {
  if (!candles || candles.length < 20) return null;

  const cl = candles.map(c => c.close);
  const last = candles[candles.length - 1];

  // Last 10 candle directions as pattern
  const pattern10 = candles.slice(-10)
    .map(c => c.close > c.open ? "▲" : "▼").join("");

  // Last 5 candles detail
  const last5 = candles.slice(-5).map((c, i) => {
    const bull = c.close > c.open;
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low || 0.001;
    const pct = (body / range * 100).toFixed(0);
    return `C${i+1}: ${bull?"BULL":"BEAR"} body=${pct}% O=${c.open.toFixed(4)} H=${c.high.toFixed(4)} L=${c.low.toFixed(4)} C=${c.close.toFixed(4)}`;
  }).join("\n");

  const d = scoreResult.details;
  const sess = scoreResult.details.session;

  const prompt = `You are a professional Deriv synthetic indices trader with 10 years experience. Analyse this market NOW and decide.

PAIR: ${pair} (Deriv Synthetic Volatility - trades 24/7)
TIME: ${new Date().toUTCString()}
SESSION: ${sess.name} ${sess.inKZ ? "— KILLZONE ACTIVE" : ""}

LAST 10 CANDLES DIRECTION: ${pattern10}

LAST 5 CLOSED CANDLES:
${last5}

INDICATOR READINGS (calculated on closed candles):
RSI(14): ${parseFloat(d.rsi).toFixed(1)} ${parseFloat(d.rsi) < 30 ? "→ OVERSOLD" : parseFloat(d.rsi) > 70 ? "→ OVERBOUGHT" : "→ neutral zone"}
MACD: ${d.macd} histogram ${scoreResult.details.macd === "BULL" ? "positive (bullish)" : "negative (bearish)"}
EMA20: ${d.ema20.toFixed(4)} | EMA50: ${d.ema50.toFixed(4)} | EMA200: ${d.ema200.toFixed(4)}
EMA ALIGNMENT: ${d.ema20 > d.ema50 && d.ema50 > d.ema200 ? "20>50>200 BULLISH STACK" : d.ema20 < d.ema50 && d.ema50 < d.ema200 ? "20<50<200 BEARISH STACK" : "MIXED - no clear trend"}
SUPERTREND: ${d.supertrend}
PRICE vs VWAP: ${d.vwap ? (last.close > d.vwap ? "ABOVE VWAP (bull bias)" : "BELOW VWAP (bear bias)") : "N/A"}

SMART MONEY:
BOS (Break of Structure): ${d.bos || "not detected"}
CHOCH (Change of Character): ${d.choch || "not detected"}
Order Block: ${d.ob || "not detected"}
Fair Value Gap: ${d.fvg || "not detected"}

PATTERN: ${d.pattern}

YOUR JOB:
1. Read ALL indicators together - do they agree or conflict?
2. What is the SMART MONEY doing?
3. Is this a real setup or just noise?
4. Give RISE or FALL or WAIT decision
5. Predict next 5 candles with probability

Respond ONLY with this exact JSON (no markdown, no extra text):
{
  "direction": "RISE",
  "confidence": 78,
  "tier": "STRONG",
  "reasoning": "2-3 sentence explanation of WHY in plain English",
  "keyFactors": ["most important factor", "second factor", "third factor"],
  "warning": "any concern or empty string",
  "c1": {"dir": "RISE", "prob": 78},
  "c2": {"dir": "RISE", "prob": 69},
  "c3": {"dir": "RISE", "prob": 61},
  "c4": {"dir": "DOJI", "prob": 52},
  "c5": {"dir": "FALL", "prob": 48},
  "entryQuality": "GOOD",
  "risk": "MEDIUM",
  "waitFor": ""
}`;

  try {
    const res = await fetch(GEMINI_DERIV_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 800 }
      })
    });

    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const match = text.replace(/```json|```/g, "").trim().match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON found");
    return JSON.parse(match[0]);
  } catch(e) {
    console.warn("Gemini failed:", e.message);
    return null;
  }
}
