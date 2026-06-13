// PRINCEX EMPERE — Signal Engine v4

async function fetchCandles(pair) {
  // Twelve Data format: EURUSD, XAUUSD, BTCUSD
  const symbol = pair.replace("/", "");
  
  // Twelve Data uses different symbols for crypto/gold
  let apiSymbol = symbol;
  if (pair === "XAU/USD") apiSymbol = "XAU/USD";
  if (pair === "BTC/USD") apiSymbol = "BTC/USD";
  if (pair === "ETH/USD") apiSymbol = "ETH/USD";

  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(apiSymbol)}&interval=1min&outputsize=50&apikey=${CONFIG.TWELVE_DATA_KEY}`;

  const res  = await fetch(url);
  const data = await res.json();

  if (data.status === "error" || !data.values) {
    throw new Error(data.message || "Fetch failed for " + pair);
  }

  return data.values.reverse().map(c => ({
    open:  parseFloat(c.open),
    high:  parseFloat(c.high),
    low:   parseFloat(c.low),
    close: parseFloat(c.close),
    datetime: c.datetime
  }));
}

// ── INDICATORS ──────────────────────────────

function calcEMA(arr, period) {
  const k = 2 / (period + 1);
  let ema = arr[0];
  for (let i = 1; i < arr.length; i++) ema = arr[i] * k + ema * (1 - k);
  return ema;
}

function calcSMA(arr, period) {
  const slice = arr.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  const rs = (gains / period) / ((losses / period) || 0.0001);
  return 100 - 100 / (1 + rs);
}

function calcMACD(closes) {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macd  = ema12 - ema26;
  const signal = calcEMA(closes.slice(-9), 9) * 0.1;
  return { macd, signal, hist: macd - signal };
}

function calcBollinger(closes, period = 20) {
  const sma = calcSMA(closes, period);
  const slice = closes.slice(-period);
  const std = Math.sqrt(slice.reduce((s, v) => s + Math.pow(v - sma, 2), 0) / period);
  return { upper: sma + 2 * std, middle: sma, lower: sma - 2 * std };
}

function calcStochastic(candles, k = 5) {
  const slice = candles.slice(-k);
  const highK = Math.max(...slice.map(c => c.high));
  const lowK  = Math.min(...slice.map(c => c.low));
  const last  = candles[candles.length - 1].close;
  return highK === lowK ? 50 : ((last - lowK) / (highK - lowK)) * 100;
}

function calcADX(candles, period = 14) {
  const trs = candles.slice(-period).map((c, i, arr) => {
    if (i === 0) return c.high - c.low;
    const prev = arr[i - 1];
    return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
  });
  return (trs.reduce((a, b) => a + b, 0) / period) * 10;
}

function calcATR(candles, period = 14) {
  const trs = candles.slice(-period).map((c, i, arr) => {
    if (i === 0) return c.high - c.low;
    const prev = arr[i - 1];
    return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
  });
  return trs.reduce((a, b) => a + b, 0) / period;
}

function calcVWAP(candles) {
  const tpv = candles.reduce((s, c) => s + (c.high + c.low + c.close) / 3, 0);
  return tpv / candles.length;
}

function identifyPattern(candles) {
  const c  = candles[candles.length - 1];
  const p  = candles[candles.length - 2];
  const pp = candles[candles.length - 3];
  const body   = Math.abs(c.close - c.open);
  const range  = c.high - c.low || 0.0001;
  const upperW = c.high - Math.max(c.open, c.close);
  const lowerW = Math.min(c.open, c.close) - c.low;
  const isBull = c.close > c.open;

  if (body < range * 0.1) return { name: "DOJI", bias: "neutral", strength: 40 };
  if (lowerW > body * 2 && upperW < body * 0.3)
    return isBull ? { name: "HAMMER 🔨", bias: "bull", strength: 72 } : { name: "HANGING MAN", bias: "bear", strength: 65 };
  if (upperW > body * 2 && lowerW < body * 0.3)
    return isBull ? { name: "INV HAMMER", bias: "bull", strength: 60 } : { name: "SHOOTING STAR ⭐", bias: "bear", strength: 74 };
  if (isBull && p.close < p.open && c.open < p.close && c.close > p.open)
    return { name: "BULL ENGULF 🟢", bias: "bull", strength: 80 };
  if (!isBull && p.close > p.open && c.open > p.close && c.close < p.open)
    return { name: "BEAR ENGULF 🔴", bias: "bear", strength: 80 };
  if (body > range * 0.9)
    return isBull ? { name: "BULL MARUBOZU", bias: "bull", strength: 85 } : { name: "BEAR MARUBOZU", bias: "bear", strength: 85 };
  const allBull3 = [pp, p, c].every(x => x.close > x.open);
  const allBear3 = [pp, p, c].every(x => x.close < x.open);
  if (allBull3) return { name: "3 SOLDIERS 🟢🟢🟢", bias: "bull", strength: 88 };
  if (allBear3) return { name: "3 CROWS 🔴🔴🔴", bias: "bear", strength: 88 };
  return { name: isBull ? "BULL CANDLE" : "BEAR CANDLE", bias: isBull ? "bull" : "bear", strength: 55 };
}

function buyerSellerPressure(candles) {
  const last10 = candles.slice(-10);
  let buyVol = 0, sellVol = 0;
  last10.forEach(c => {
    const range = c.high - c.low || 0.0001;
    buyVol  += (c.close - c.low) / range;
    sellVol += (c.high - c.close) / range;
  });
  const total  = buyVol + sellVol || 1;
  const buyers = Math.round((buyVol / total) * 100);
  return { buyers, sellers: 100 - buyers };
}

async function generateSignal(pair) {
  const candles = await fetchCandles(pair);
  const closes  = candles.map(c => c.close);
  const last    = candles[candles.length - 1];

  const rsi     = calcRSI(closes);
  const macdR   = calcMACD(closes);
  const ema9    = calcEMA(closes, 9);
  const ema21   = calcEMA(closes, 21);
  const bb      = calcBollinger(closes);
  const stoch   = calcStochastic(candles);
  const adx     = calcADX(candles);
  const atr     = calcATR(candles);
  const vwap    = calcVWAP(candles);
  const pattern = identifyPattern(candles);
  const press   = buyerSellerPressure(candles);

  let bullScore = 0, bearScore = 0;

  if (rsi < 30)       bullScore += 25;
  else if (rsi < 45)  bullScore += 12;
  else if (rsi > 70)  bearScore += 25;
  else if (rsi > 55)  bearScore += 12;

  if (ema9 > ema21)   bullScore += 20; else bearScore += 20;
  if (macdR.hist > 0) bullScore += 20; else bearScore += 20;

  if (last.close < bb.lower)  bullScore += 15;
  else if (last.close > bb.upper) bearScore += 15;

  if (stoch < 20)     bullScore += 10;
  else if (stoch > 80) bearScore += 10;

  if (last.close > vwap) bullScore += 10; else bearScore += 10;

  if (pattern.bias === "bull") bullScore += pattern.strength * 0.1;
  if (pattern.bias === "bear") bearScore += pattern.strength * 0.1;

  const total   = bullScore + bearScore || 1;
  const bullPct = Math.round((bullScore / total) * 100);
  const bearPct = 100 - bullPct;

  let direction = "WAIT", biasLabel = "NEUTRAL";
  if (bullPct >= 60)      { direction = "BUY";  biasLabel = bullPct >= 75 ? "STRONG BULL" : "BULL"; }
  else if (bearPct >= 60) { direction = "SELL"; biasLabel = bearPct >= 75 ? "STRONG BEAR" : "BEAR"; }

  const c1Conf = Math.max(bullPct, bearPct);
  const c2Conf = Math.round(c1Conf * 0.82);
  const c3Conf = Math.round(c1Conf * 0.67);

  function candleLabel(conf, dir) {
    if (conf < 55) return { label: `DOJI ${conf}%`, type: "doji" };
    return dir === "BUY"
      ? { label: `BULL 🟢 ${conf}%`, type: "bull" }
      : { label: `BEAR 🔴 ${conf}%`, type: "bear" };
  }

  return {
    pair, direction, biasLabel,
    bullScore: bullPct, bearScore: bearPct,
    buyers: press.buyers, sellers: press.sellers,
    rsi: rsi.toFixed(1),
    macd: macdR.macd.toFixed(5),
    macdHist: macdR.hist > 0 ? "BULL" : "BEAR",
    emaCross: ema9 > ema21 ? "BULL" : "BEAR",
    stoch: stoch.toFixed(1),
    adx: adx.toFixed(1),
    atr: atr.toFixed(5),
    priceVwap: last.close > vwap ? "ABOVE" : "BELOW",
    pattern: pattern.name,
    confidence: c1Conf,
    predictions: [
      candleLabel(c1Conf, direction),
      candleLabel(c2Conf, direction),
      candleLabel(c3Conf, direction),
    ],
    time: new Date().toLocaleTimeString()
  };
}
