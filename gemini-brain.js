// ============================================
// PRINCEX EMPERE — Gemini AI Brain
// Replaces rule-based scoring with real AI
// ============================================

const GEMINI_API_KEY = window.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

async function geminiAnalyseMarket(pair, tf, candles, indicators) {
  const last5 = candles.slice(-5).map((c, i) => {
    const bull = c.close > c.open;
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low || 0.001;
    return `C${i+1}: O=${c.open.toFixed(4)} H=${c.high.toFixed(4)} L=${c.low.toFixed(4)} C=${c.close.toFixed(4)} ${bull?"BULL":"BEAR"} body=${(body/range*100).toFixed(0)}%`;
  }).join("\n");

  const last20direction = candles.slice(-20).map(c => c.close > c.open ? "▲" : "▼").join("");

  const prompt = `You are an expert professional trader specialising in Deriv synthetic volatility indices. Analyse this market and give a trading signal.

PAIR: ${pair} (Deriv Synthetic Volatility Index)
TIMEFRAME: ${tf === 60 ? "1 minute" : tf === 300 ? "5 minutes" : tf === 900 ? "15 minutes" : tf === 3600 ? "1 hour" : "4 hours"}
TIME: ${new Date().toUTCString()}

LAST 20 CANDLES DIRECTION: ${last20direction}

LAST 5 CLOSED CANDLES:
${last5}

INDICATOR READINGS (all calculated on closed candles only):
- RSI(14): ${indicators.rsi} ${indicators.rsi < 30 ? "(OVERSOLD)" : indicators.rsi > 70 ? "(OVERBOUGHT)" : "(NEUTRAL)"}
- MACD Histogram: ${indicators.macdHist > 0 ? "POSITIVE (bullish momentum)" : "NEGATIVE (bearish momentum)"}
- MACD Cross: ${indicators.macdCrossUp ? "BULLISH CROSSOVER just occurred" : indicators.macdCrossDown ? "BEARISH CROSSOVER just occurred" : "no recent crossover"}
- Stochastic(14): ${indicators.stoch.toFixed(1)} ${indicators.stoch < 20 ? "(oversold)" : indicators.stoch > 80 ? "(overbought)" : ""}
- EMA20: ${indicators.ema20.toFixed(4)} | EMA50: ${indicators.ema50.toFixed(4)} | EMA200: ${indicators.ema200.toFixed(4)}
- EMA Alignment: ${indicators.ema20 > indicators.ema50 && indicators.ema50 > indicators.ema200 ? "BULLISH STACK (20>50>200)" : indicators.ema20 < indicators.ema50 && indicators.ema50 < indicators.ema200 ? "BEARISH STACK (20<50<200)" : "MIXED/CHOPPY"}
- Supertrend: ${indicators.supertrend ? "BULLISH (price above)" : "BEARISH (price below)"}
- Bollinger Bands: Price is ${indicators.bbPosition}
- VWAP: Price is ${indicators.priceAboveVwap ? "ABOVE (bullish bias)" : "BELOW (bearish bias)"}
- ATR(14): ${indicators.atr.toFixed(4)} (volatility measure)
- ADX: ${indicators.adx.toFixed(1)} ${indicators.adx > 40 ? "(STRONG TREND)" : indicators.adx > 20 ? "(TREND PRESENT)" : "(WEAK/NO TREND)"}
- CCI: ${indicators.cci.toFixed(1)}
- Williams %R: ${indicators.wr.toFixed(1)}
- OBV Direction: ${indicators.obvRising ? "RISING (buying pressure)" : "FALLING (selling pressure)"}
- VWAP Position: ${indicators.priceAboveVwap ? "ABOVE" : "BELOW"}

SMART MONEY CONCEPTS:
- Break of Structure (BOS): ${indicators.bos || "not detected"}
- Change of Character (CHOCH): ${indicators.choch || "not detected"}
- Order Block: ${indicators.ob || "not detected"}
- Fair Value Gap: ${indicators.fvg || "not detected"}
- Liquidity Sweep: ${indicators.sweep || "not detected"}

CANDLE PATTERNS (last closed candle):
- Pattern: ${indicators.pattern}
- Higher Highs/Higher Lows: ${indicators.hhhl || "not confirmed"}
- Price Structure: ${indicators.priceStructure}

SESSION: ${indicators.session}
KILLZONE ACTIVE: ${indicators.inKillzone ? "YES - higher confidence window" : "NO"}

As a professional trader, analyse ALL of this information together. Consider:
1. Do the indicators AGREE or CONFLICT with each other?
2. Is there real CONFLUENCE or just noise?
3. What is the SMART MONEY likely doing?
4. Is this a HIGH PROBABILITY setup or should we WAIT?
5. What are the NEXT 5 candles most likely to do?

Respond ONLY with this exact JSON (no markdown, no explanation outside JSON):
{
  "direction": "RISE or FALL or WAIT",
  "confidence": 85,
  "tier": "ELITE ULTRA or STRONG or MODERATE or WEAK or WAIT",
  "score": 54,
  "reasoning": "2-3 sentence professional analysis explaining WHY",
  "keyFactors": ["factor1", "factor2", "factor3"],
  "warnings": ["warning if any, or empty array"],
  "candle1": {"direction": "RISE or FALL or DOJI", "probability": 79, "reasoning": "brief"},
  "candle2": {"direction": "RISE or FALL or DOJI", "probability": 71, "reasoning": "brief"},
  "candle3": {"direction": "RISE or FALL or DOJI", "probability": 63, "reasoning": "brief"},
  "candle4": {"direction": "RISE or FALL or DOJI", "probability": 55, "reasoning": "brief"},
  "candle5": {"direction": "RISE or FALL or DOJI", "probability": 48, "reasoning": "brief"},
  "entryQuality": "EXCELLENT or GOOD or FAIR or POOR",
  "riskLevel": "LOW or MEDIUM or HIGH",
  "sessionNote": "brief note about current session",
  "waitReason": "if WAIT, explain what to wait for"
}`;

  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1000,
          topP: 0.8,
        }
      })
    });

    if (!res.ok) throw new Error("Gemini API error: " + res.status);

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();

    // Find JSON in response
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in Gemini response");

    return JSON.parse(jsonMatch[0]);
  } catch(e) {
    console.warn("Gemini AI failed:", e.message);
    return null;
  }
}

// Build indicators object from candles
function dpBuildIndicators(candles) {
  const cl = candles.map(c => c.close);
  const last = candles[candles.length - 1];
  const macdR = dpMACD(cl);
  const bb = dpBB(cl, 20);
  const stR = dpSupertrend(candles, 10, 3);
  const sess = dpSession();
  const {h: swH, l: swL} = dpSwings(candles, 4);
  const hhhl = swH.length >= 2 && swL.length >= 2 &&
    swH[swH.length-1].p > swH[swH.length-2].p &&
    swL[swL.length-1].p > swL[swL.length-2].p ? "Higher Highs + Higher Lows (uptrend)" :
    swH.length >= 2 && swL.length >= 2 &&
    swH[swH.length-1].p < swH[swH.length-2].p &&
    swL[swL.length-1].p < swL[swL.length-2].p ? "Lower Highs + Lower Lows (downtrend)" : null;

  const wr14H = Math.max(...candles.slice(-14).map(c => c.high));
  const wr14L = Math.min(...candles.slice(-14).map(c => c.low));
  const wr = ((wr14H - last.close) / (wr14H - wr14L || 0.001)) * -100;

  // Liquidity sweep
  let sweep = null;
  if (swH.length >= 1 && swL.length >= 1) {
    if (last.high > swH[swH.length-1].p && last.close < swH[swH.length-1].p) sweep = "bearish (swept highs)";
    if (last.low < swL[swL.length-1].p && last.close > swL[swL.length-1].p) sweep = "bullish (swept lows)";
  }

  const bbPos = last.close > bb.upper ? "ABOVE upper band (overbought zone)" :
                last.close < bb.lower ? "BELOW lower band (oversold zone)" :
                last.close > bb.mid   ? "above middle band (mild bull)" :
                "below middle band (mild bear)";

  const priceStruct = candles.slice(-10).filter(c => c.close > c.open).length > 6
    ? "mostly bullish last 10 candles"
    : candles.slice(-10).filter(c => c.close < c.open).length > 6
    ? "mostly bearish last 10 candles"
    : "mixed/choppy price action";

  return {
    rsi:          dpRSI(cl),
    macdHist:     macdR.hist,
    macdCrossUp:  macdR.crossUp,
    macdCrossDown:macdR.crossDown,
    stoch:        dpStoch(candles),
    ema20:        dpEMA(cl, 20),
    ema50:        dpEMA(cl, 50),
    ema200:       dpEMA(cl, Math.min(cl.length, 200)),
    supertrend:   stR.bull,
    bbPosition:   bbPos,
    priceAboveVwap: last.close > dpVWAP(candles),
    atr:          dpATR(candles, 14),
    adx:          dpADX(candles),
    cci:          dpCCI(candles),
    wr,
    obvRising:    dpOBV(candles) > dpOBV(candles.slice(0,-1)),
    bos:          dpBOS(candles),
    choch:        dpCHOCH(candles),
    ob:           dpOB(candles),
    fvg:          dpFVG(candles),
    sweep,
    pattern:      dpPattern(candles).n,
    hhhl,
    priceStructure: priceStruct,
    session:      sess.name,
    inKillzone:   sess.inKZ,
  };
}
