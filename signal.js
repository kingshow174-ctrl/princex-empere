// ============================================
// PRINCEX EMPERE — Sniper Confluence Engine v8
// EMA Stack + Supertrend + VWAP + SMC + RSI + MACD
// + Volume + Candle Confirmation + Confluence Score
// + ATR Risk Management + Next 3 Candle Probability
// ============================================

async function fetchCandles(pair) {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(pair)}&interval=1min&outputsize=100&apikey=${CONFIG.TWELVE_DATA_KEY}`;
  const res  = await fetch(url);
  const data = await res.json();
  if (data.status === "error" || !data.values) throw new Error(data.message || "Fetch failed: " + pair);
  return data.values.reverse().map(c => ({
    open:   parseFloat(c.open),
    high:   parseFloat(c.high),
    low:    parseFloat(c.low),
    close:  parseFloat(c.close),
    volume: parseFloat(c.volume || 0),
  }));
}

// ── BASIC MATH HELPERS ───────────────────────

function calcEMA(arr, period) {
  if (arr.length < period) return arr[arr.length - 1];
  const k = 2 / (period + 1);
  let ema = arr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < arr.length; i++) ema = arr[i] * k + ema * (1 - k);
  return ema;
}

function calcEMASeries(arr, period) {
  // Returns EMA value at every index (seeded with SMA)
  if (arr.length < period) return arr.map(() => arr[arr.length - 1]);
  const k = 2 / (period + 1);
  const out = new Array(arr.length).fill(null);
  let ema = arr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = ema;
  for (let i = period; i < arr.length; i++) {
    ema = arr[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses += Math.abs(d);
  }
  const ag = gains / period, al = losses / period;
  if (al === 0) return 100;
  if (ag === 0) return 0;
  return 100 - (100 / (1 + ag / al));
}

function calcMACD(closes) {
  if (closes.length < 35) return { macd: 0, signal: 0, hist: 0, crossUp: false, crossDown: false };
  const series = [];
  for (let i = 26; i <= closes.length; i++) {
    const s = closes.slice(0, i);
    series.push(calcEMA(s, 12) - calcEMA(s, 26));
  }
  const line = series[series.length - 1];
  const sig  = calcEMA(series, 9);
  const prevLine = series.length > 1 ? series[series.length - 2] : line;
  const prevSig  = series.length > 9 ? calcEMA(series.slice(0, -1), 9) : sig;
  const crossUp   = prevLine <= prevSig && line > sig;
  const crossDown = prevLine >= prevSig && line < sig;
  return { macd: line, signal: sig, hist: line - sig, crossUp, crossDown };
}

function calcATR(candles, period = 14) {
  if (candles.length < period + 1) return (candles[candles.length-1].high - candles[candles.length-1].low) || 0.0001;
  let trs = [];
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  return trs.reduce((a, b) => a + b, 0) / period;
}

// ── SUPERTREND ───────────────────────────────

function calcSupertrend(candles, atrLen = 10, mult = 3) {
  const atr = calcATR(candles, atrLen);
  let trend = "up";
  let upperBand = null, lowerBand = null;

  // Simplified rolling Supertrend over last 30 candles for direction
  const slice = candles.slice(-30);
  let prevClose = slice[0].close;
  let st = prevClose;

  for (let i = 1; i < slice.length; i++) {
    const c = slice[i];
    const hl2 = (c.high + c.low) / 2;
    const basicUpper = hl2 + mult * atr;
    const basicLower = hl2 - mult * atr;

    if (c.close > st) trend = "up";
    else if (c.close < st) trend = "down";

    st = trend === "up" ? Math.max(basicLower, st) : Math.min(basicUpper, st);
  }

  const last = candles[candles.length - 1].close;
  return { trend, value: st, bullish: last > st };
}

// ── VWAP ──────────────────────────────────────

function calcVWAP(candles) {
  let cumPV = 0, cumVol = 0;
  candles.forEach(c => {
    const typical = (c.high + c.low + c.close) / 3;
    const vol = c.volume || 1;
    cumPV += typical * vol;
    cumVol += vol;
  });
  return cumVol > 0 ? cumPV / cumVol : candles[candles.length - 1].close;
}

// ── VOLUME ────────────────────────────────────

function calcVolumeSpike(candles, period = 20) {
  const recent = candles.slice(-period);
  const avgVol = recent.reduce((a, c) => a + (c.volume || 0), 0) / recent.length;
  const lastVol = candles[candles.length - 1].volume || 0;
  return { spike: avgVol > 0 && lastVol > avgVol * 1.5, ratio: avgVol > 0 ? lastVol / avgVol : 1 };
}

// ── SMART MONEY CONCEPTS (simplified) ────────

function detectSwings(candles, lookback = 5) {
  const highs = [], lows = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i];
    const windowSlice = candles.slice(i - lookback, i + lookback + 1);
    if (c.high === Math.max(...windowSlice.map(x => x.high))) highs.push({ i, price: c.high });
    if (c.low === Math.min(...windowSlice.map(x => x.low)))   lows.push({ i, price: c.low });
  }
  return { highs, lows };
}

function detectBOSCHOCH(candles) {
  const { highs, lows } = detectSwings(candles, 4);
  if (highs.length < 2 || lows.length < 2) return { bos: null, choch: null };

  const lastHigh  = highs[highs.length - 1];
  const prevHigh  = highs[highs.length - 2];
  const lastLow   = lows[lows.length - 1];
  const prevLow   = lows[lows.length - 2];
  const lastClose = candles[candles.length - 1].close;

  let bos = null, choch = null;

  // Bullish BOS: price breaks above previous swing high
  if (lastClose > prevHigh.price) bos = "bullish";
  // Bearish BOS: price breaks below previous swing low
  if (lastClose < prevLow.price) bos = bos === "bullish" ? bos : "bearish";

  // CHOCH: trend was making lower highs/lows, now breaks structure
  if (lastHigh.price > prevHigh.price && lastLow.price < prevLow.price) choch = "bullish";
  if (lastHigh.price < prevHigh.price && lastLow.price > prevLow.price) choch = "bearish";

  return { bos, choch };
}

function detectOrderBlock(candles) {
  // Simplified: find last strong opposite candle before a big move
  const last10 = candles.slice(-10);
  for (let i = last10.length - 2; i >= 1; i--) {
    const c = last10[i];
    const next = last10[i + 1];
    const body = Math.abs(c.close - c.open);
    const nextBody = Math.abs(next.close - next.open);
    if (nextBody > body * 1.5) {
      if (c.close < c.open && next.close > next.open) return { type: "bullish", price: c.low };
      if (c.close > c.open && next.close < next.open) return { type: "bearish", price: c.high };
    }
  }
  return null;
}

function detectFVG(candles) {
  const { highs, lows } = detectSwings(candles, 4);
  if (highs.length < 1 || lows.length < 1) return null;
  const last = candles[candles.length - 1];
  const lastHigh = highs[highs.length - 1];
  const lastLow  = lows[lows.length - 1];

  // Wick sweeps above high then closes back below = bearish sweep
  if (last.high > lastHigh.price && last.close < lastHigh.price) return "bearish";
  // Wick sweeps below low then closes back above = bullish sweep
  if (last.low < lastLow.price && last.close > lastLow.price) return "bullish";
  return null;
}

// ── CANDLE PATTERNS ───────────────────────────

function identifyPattern(candles) {
  const c  = candles[candles.length - 1];
  const p  = candles[candles.length - 2];
  const pp = candles[candles.length - 3];
  const body   = Math.abs(c.close - c.open);
  const range  = c.high - c.low || 0.0001;
  const upperW = c.high - Math.max(c.open, c.close);
  const lowerW = Math.min(c.open, c.close) - c.low;
  const isBull = c.close > c.open;

  if (body < range * 0.1) return { name: "DOJI", bias: "neutral", strength: 0 };

  // Pin bar
  if (lowerW > body * 2 && upperW < body * 0.3)
    return isBull
      ? { name: "BULLISH PIN BAR 🔨", bias: "bull", strength: 15 }
      : { name: "BEARISH PIN BAR", bias: "bear", strength: 10 };
  if (upperW > body * 2 && lowerW < body * 0.3)
    return isBull
      ? { name: "INV HAMMER", bias: "bull", strength: 8 }
      : { name: "BEARISH PIN BAR ⭐", bias: "bear", strength: 15 };

  // Engulfing
  if (isBull && p.close < p.open && c.open <= p.close && c.close >= p.open)
    return { name: "BULLISH ENGULFING 🟢", bias: "bull", strength: 20 };
  if (!isBull && p.close > p.open && c.open >= p.close && c.close <= p.open)
    return { name: "BEARISH ENGULFING 🔴", bias: "bear", strength: 20 };

  // Morning star / Evening star (3 candle pattern)
  if (pp && p && pp.close < pp.open) {
    const midBody = Math.abs(p.close - p.open);
    if (midBody < Math.abs(pp.close - pp.open) * 0.5 && isBull && c.close > pp.open)
      return { name: "MORNING STAR ⭐", bias: "bull", strength: 22 };
  }
  if (pp && p && pp.close > pp.open) {
    const midBody = Math.abs(p.close - p.open);
    if (midBody < Math.abs(pp.close - pp.open) * 0.5 && !isBull && c.close < pp.open)
      return { name: "EVENING STAR 🌙", bias: "bear", strength: 22 };
  }

  if (body > range * 0.85)
    return isBull ? { name: "BULL MARUBOZU", bias: "bull", strength: 18 } : { name: "BEAR MARUBOZU", bias: "bear", strength: 18 };

  if (pp && p && [pp, p, c].every(x => x.close > x.open)) return { name: "3 SOLDIERS 🟢🟢🟢", bias: "bull", strength: 16 };
  if (pp && p && [pp, p, c].every(x => x.close < x.open)) return { name: "3 CROWS 🔴🔴🔴", bias: "bear", strength: 16 };

  return { name: isBull ? "BULL CANDLE" : "BEAR CANDLE", bias: isBull ? "bull" : "bear", strength: 5 };
}

// ── MAIN CONFLUENCE ENGINE ───────────────────

async function generateSignal(pair) {
  const candles = await fetchCandles(pair);
  const closes  = candles.map(c => c.close);
  const last    = candles[candles.length - 1];

  // ── Trend Engine ──
  const ema20  = calcEMA(closes, 20);
  const ema50  = calcEMA(closes, 50);
  const ema200 = closes.length >= 200 ? calcEMA(closes, 200) : calcEMA(closes, Math.min(closes.length, 100));
  const trendBullish = ema20 > ema50 && ema50 > ema200;
  const trendBearish = ema20 < ema50 && ema50 < ema200;

  // ── Supertrend ──
  const st = calcSupertrend(candles, 10, 3);

  // ── VWAP ──
  const vwap = calcVWAP(candles);

  // ── SMC ──
  const { bos, choch } = detectBOSCHOCH(candles);
  const ob   = detectOrderBlock(candles);
  const fvg  = detectFVG(candles);
  const sweep = detectLiquiditySweep(candles);

  // ── Momentum ──
  const rsi   = calcRSI(closes);
  const macdR = calcMACD(closes);

  // ── Volume ──
  const vol = calcVolumeSpike(candles);

  // ── Candle Pattern ──
  const pat = identifyPattern(candles);

  // ── ATR for risk management ──
  const atr = calcATR(candles, 14);

  // ═══ CONFLUENCE SCORING (max 11) ═══
  let bullScore = 0, bearScore = 0;
  const checklist = [];

  // 1. EMA Alignment
  if (trendBullish) { bullScore++; checklist.push({ name: "EMA Stack", bias: "bull" }); }
  else if (trendBearish) { bearScore++; checklist.push({ name: "EMA Stack", bias: "bear" }); }
  else checklist.push({ name: "EMA Stack", bias: "neutral" });

  // 2. Supertrend
  if (st.bullish) { bullScore++; checklist.push({ name: "Supertrend", bias: "bull" }); }
  else { bearScore++; checklist.push({ name: "Supertrend", bias: "bear" }); }

  // 3. VWAP
  if (last.close > vwap) { bullScore++; checklist.push({ name: "VWAP", bias: "bull" }); }
  else { bearScore++; checklist.push({ name: "VWAP", bias: "bear" }); }

  // 4. BOS
  if (bos === "bullish") { bullScore++; checklist.push({ name: "BOS", bias: "bull" }); }
  else if (bos === "bearish") { bearScore++; checklist.push({ name: "BOS", bias: "bear" }); }
  else checklist.push({ name: "BOS", bias: "neutral" });

  // 5. CHOCH
  if (choch === "bullish") { bullScore++; checklist.push({ name: "CHOCH", bias: "bull" }); }
  else if (choch === "bearish") { bearScore++; checklist.push({ name: "CHOCH", bias: "bear" }); }
  else checklist.push({ name: "CHOCH", bias: "neutral" });

  // 6. Order Block
  if (ob?.type === "bullish") { bullScore++; checklist.push({ name: "Order Block", bias: "bull" }); }
  else if (ob?.type === "bearish") { bearScore++; checklist.push({ name: "Order Block", bias: "bear" }); }
  else checklist.push({ name: "Order Block", bias: "neutral" });

  // 7. FVG
  if (fvg?.type === "bullish") { bullScore++; checklist.push({ name: "FVG", bias: "bull" }); }
  else if (fvg?.type === "bearish") { bearScore++; checklist.push({ name: "FVG", bias: "bear" }); }
  else checklist.push({ name: "FVG", bias: "neutral" });

  // 8. RSI
  if (rsi > 50) { bullScore++; checklist.push({ name: "RSI > 50", bias: "bull" }); }
  else { bearScore++; checklist.push({ name: "RSI < 50", bias: "bear" }); }

  // 9. MACD
  if (macdR.hist > 0) { bullScore++; checklist.push({ name: "MACD", bias: "bull" }); }
  else { bearScore++; checklist.push({ name: "MACD", bias: "bear" }); }

  // 10. Volume spike (boosts whichever side candle pattern favors)
  if (vol.spike) {
    if (pat.bias === "bull") { bullScore++; checklist.push({ name: "Volume Spike", bias: "bull" }); }
    else if (pat.bias === "bear") { bearScore++; checklist.push({ name: "Volume Spike", bias: "bear" }); }
    else checklist.push({ name: "Volume Spike", bias: "neutral" });
  } else {
    checklist.push({ name: "Volume Spike", bias: "neutral" });
  }

  // 11. Candle confirmation
  if (pat.bias === "bull") { bullScore++; checklist.push({ name: "Candle Pattern", bias: "bull" }); }
  else if (pat.bias === "bear") { bearScore++; checklist.push({ name: "Candle Pattern", bias: "bear" }); }
  else checklist.push({ name: "Candle Pattern", bias: "neutral" });

  // Liquidity sweep as bonus context (not scored, shown in dashboard)
  const totalScore = Math.max(bullScore, bearScore);

  // ═══ SIGNAL DECISION ═══
  let direction = "WAIT", biasLabel = "NO TRADE — LOW CONFLUENCE", strength = "WEAK";

  if (totalScore >= 8) {
    direction = bullScore > bearScore ? "BUY" : "SELL";
    biasLabel = bullScore > bearScore ? "STRONG BULL" : "STRONG BEAR";
    strength = "STRONG";
  } else if (totalScore >= 6) {
    direction = bullScore > bearScore ? "BUY" : "SELL";
    biasLabel = bullScore > bearScore ? "MODERATE BULL" : "MODERATE BEAR";
    strength = "MODERATE";
  } else {
    direction = "WAIT";
    biasLabel = "NO TRADE — LOW CONFLUENCE";
    strength = "WEAK";
  }

  const confidence = Math.round((totalScore / 11) * 100);

  // ═══ NEXT 3 CANDLE PROBABILITY ═══
  const c1Conf = confidence;
  const c2Conf = Math.round(c1Conf * 0.86);
  const c3Conf = Math.round(c1Conf * 0.72);

  function cLabel(conf, dir) {
    if (dir === "WAIT") return { label: `DOJI ${conf}%`, type: "doji" };
    return dir === "BUY"
      ? { label: `BULL 🟢 ${conf}%`, type: "bull" }
      : { label: `BEAR 🔴 ${conf}%`, type: "bear" };
  }

  // ═══ RISK MANAGEMENT (ATR based) ═══
  const entry = last.close;
  let stopLoss, tp1, tp2, rr;

  if (direction === "BUY") {
    stopLoss = entry - atr * 1.5;
    tp1 = entry + atr * 1.5;
    tp2 = entry + atr * 3;
  } else if (direction === "SELL") {
    stopLoss = entry + atr * 1.5;
    tp1 = entry - atr * 1.5;
    tp2 = entry - atr * 3;
  } else {
    stopLoss = entry - atr;
    tp1 = entry + atr;
    tp2 = entry + atr * 2;
  }
  rr = stopLoss && entry ? Math.abs((tp1 - entry) / (entry - stopLoss)) : 1;

  const decimals = entry < 10 ? 5 : entry < 1000 ? 2 : 1;

  return {
    pair, direction, biasLabel, strength,
    confluenceScore: totalScore,
    maxScore: 11,
    bullScore, bearScore,
    confidence,
    checklist,
    bos, choch,
    orderBlock: ob ? ob.type : "none",
    fvg: fvg ? fvg.type : "none",
    liquiditySweep: sweep || "none",
    rsi: rsi.toFixed(1),
    macdHist: macdR.hist > 0 ? "BULL" : "BEAR",
    emaTrend: trendBullish ? "BULL" : trendBearish ? "BEAR" : "MIXED",
    supertrend: st.bullish ? "BULL" : "BEAR",
    priceVwap: last.close > vwap ? "ABOVE" : "BELOW",
    volumeSpike: vol.spike,
    volumeRatio: vol.ratio.toFixed(2),
    pattern: pat.name,
    buyers: Math.round((bullScore / 11) * 100),
    sellers: Math.round((bearScore / 11) * 100),
    entry: entry.toFixed(decimals),
    stopLoss: stopLoss.toFixed(decimals),
    tp1: tp1.toFixed(decimals),
    tp2: tp2.toFixed(decimals),
    riskReward: rr.toFixed(2),
    predictions: [cLabel(c1Conf, direction), cLabel(c2Conf, direction), cLabel(c3Conf, direction)],
    time: new Date().toLocaleTimeString()
  };
}
