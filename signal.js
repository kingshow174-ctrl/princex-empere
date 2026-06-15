// PRINCEX EMPERE — Signal Engine v6

async function fetchCandles(pair) {
  // Twelve Data forex format: EUR/USD stays as EUR/USD
  // Crypto: BTC/USD, ETH/USD also fine
  // Gold: XAU/USD fine
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(pair)}&interval=1min&outputsize=50&apikey=${CONFIG.TWELVE_DATA_KEY}`;

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
  if (arr.length < period) return arr[arr.length - 1];
  const k = 2 / (period + 1);
  let ema = arr.slice(0, period).reduce((a,b) => a+b, 0) / period;
  for (let i = period; i < arr.length; i++) ema = arr[i] * k + ema * (1 - k);
  return ema;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses += Math.abs(d);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

function calcMACD(closes) {
  if (closes.length < 26) return { macd: 0, signal: 0, hist: 0 };
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine = ema12 - ema26;
  const macdValues = [];
  for (let i = 26; i <= closes.length; i++) {
    const s = closes.slice(0, i);
    macdValues.push(calcEMA(s, 12) - calcEMA(s, 26));
  }
  const signalLine = calcEMA(macdValues, 9);
  return { macd: macdLine, signal: signalLine, hist: macdLine - signalLine };
}

function calcBollinger(closes, period = 20) {
  if (closes.length < period) period = closes.length;
  const slice = closes.slice(-period);
  const sma   = slice.reduce((a,b) => a+b, 0) / period;
  const std   = Math.sqrt(slice.reduce((s,v) => s + Math.pow(v-sma,2), 0) / period);
  return { upper: sma + 2*std, middle: sma, lower: sma - 2*std };
}

function calcStochastic(candles, k = 14) {
  const slice = candles.slice(-k);
  const highK = Math.max(...slice.map(c => c.high));
  const lowK  = Math.min(...slice.map(c => c.low));
  const last  = candles[candles.length - 1].close;
  if (highK === lowK) return 50;
  return ((last - lowK) / (highK - lowK)) * 100;
}

function calcADX(candles, period = 14) {
  if (candles.length < period + 1) return 25;
  let trSum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i], prev = candles[i-1];
    trSum += Math.max(c.high-c.low, Math.abs(c.high-prev.close), Math.abs(c.low-prev.close));
  }
  return (trSum / period) * 1000;
}

function calcVWAP(candles) {
  const tp = candles.map(c => (c.high + c.low + c.close) / 3);
  return tp.reduce((a,b) => a+b, 0) / tp.length;
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

  if (body < range * 0.1) return { name: "DOJI", bias: "neutral", strength: 0 };
  if (lowerW > body * 2 && upperW < body * 0.3)
    return isBull ? { name: "HAMMER 🔨", bias: "bull", strength: 15 } : { name: "HANGING MAN", bias: "bear", strength: 10 };
  if (upperW > body * 2 && lowerW < body * 0.3)
    return isBull ? { name: "INV HAMMER", bias: "bull", strength: 8 } : { name: "SHOOTING STAR ⭐", bias: "bear", strength: 15 };
  if (isBull && p.close < p.open && c.open <= p.close && c.close >= p.open)
    return { name: "BULL ENGULF 🟢", bias: "bull", strength: 20 };
  if (!isBull && p.close > p.open && c.open >= p.close && c.close <= p.open)
    return { name: "BEAR ENGULF 🔴", bias: "bear", strength: 20 };
  if (body > range * 0.85)
    return isBull ? { name: "BULL MARUBOZU", bias: "bull", strength: 18 } : { name: "BEAR MARUBOZU", bias: "bear", strength: 18 };
  if (pp && p && [pp,p,c].every(x => x.close > x.open))
    return { name: "3 SOLDIERS 🟢🟢🟢", bias: "bull", strength: 22 };
  if (pp && p && [pp,p,c].every(x => x.close < x.open))
    return { name: "3 CROWS 🔴🔴🔴", bias: "bear", strength: 22 };
  return { name: isBull ? "BULL CANDLE" : "BEAR CANDLE", bias: isBull ? "bull" : "bear", strength: 5 };
}

function buyerSellerPressure(candles) {
  const last = candles.slice(-10);
  let buy = 0, sell = 0;
  last.forEach(c => {
    const range = c.high - c.low || 0.0001;
    buy  += (c.close - c.low) / range;
    sell += (c.high - c.close) / range;
  });
  const total  = buy + sell || 1;
  const buyers = Math.round((buy / total) * 100);
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
  const ema50   = calcEMA(closes, 50);
  const bb      = calcBollinger(closes);
  const stoch   = calcStochastic(candles);
  const adx     = calcADX(candles);
  const vwap    = calcVWAP(candles);
  const pattern = identifyPattern(candles);
  const press   = buyerSellerPressure(candles);

  let bullPts = 0, bearPts = 0;

  if      (rsi <= 20) bullPts += 20;
  else if (rsi <= 35) bullPts += 14;
  else if (rsi <= 45) bullPts += 7;
  else if (rsi >= 80) bearPts += 20;
  else if (rsi >= 65) bearPts += 14;
  else if (rsi >= 55) bearPts += 7;

  if (macdR.hist > 0)  bullPts += 20; else bearPts += 20;
  if (ema9 > ema21)    bullPts += 15; else bearPts += 15;
  if (ema21 > ema50)   bullPts += 10; else bearPts += 10;

  if (last.close <= bb.lower)       bullPts += 15;
  else if (last.close >= bb.upper)  bearPts += 15;

  if      (stoch <= 20) bullPts += 10;
  else if (stoch <= 35) bullPts += 5;
  else if (stoch >= 80) bearPts += 10;
  else if (stoch >= 65) bearPts += 5;

  if (last.close > vwap) bullPts += 10; else bearPts += 10;

  if (pattern.bias === "bull") bullPts += pattern.strength;
  else if (pattern.bias === "bear") bearPts += pattern.strength;

  if (press.buyers > 60)       bullPts += 10;
  else if (press.buyers < 40)  bearPts += 10;

  const total   = bullPts + bearPts || 1;
  const bullPct = Math.round((bullPts / total) * 100);
  const bearPct = 100 - bullPct;

  let direction = "WAIT", biasLabel = "NEUTRAL";
  if (bullPct >= 62)      { direction = "BUY";  biasLabel = bullPct >= 78 ? "STRONG BULL" : "BULL"; }
  else if (bearPct >= 62) { direction = "SELL"; biasLabel = bearPct >= 78 ? "STRONG BEAR" : "BEAR"; }

  const c1Conf = Math.max(bullPct, bearPct);
  const c2Conf = Math.round(c1Conf * 0.82);
  const c3Conf = Math.round(c1Conf * 0.67);

  function candleLabel(conf, dir) {
    if (conf < 56 || dir === "WAIT") return { label: `DOJI ${conf}%`, type: "doji" };
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
