// PRINCEX EMPERE — Signal Engine v7
// Price action based — unbiased

async function fetchCandles(pair) {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(pair)}&interval=1min&outputsize=50&apikey=${CONFIG.TWELVE_DATA_KEY}`;
  const res  = await fetch(url);
  const data = await res.json();
  if (data.status === "error" || !data.values) throw new Error(data.message || "Fetch failed: " + pair);
  return data.values.reverse().map(c => ({
    open:  parseFloat(c.open),
    high:  parseFloat(c.high),
    low:   parseFloat(c.low),
    close: parseFloat(c.close),
  }));
}

function calcEMA(arr, period) {
  if (arr.length < period) return arr[arr.length - 1];
  const k = 2 / (period + 1);
  let ema = arr.slice(0, period).reduce((a,b) => a+b, 0) / period;
  for (let i = period; i < arr.length; i++) ema = arr[i] * k + ema * (1-k);
  return ema;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i-1];
    if (d > 0) gains += d; else losses += Math.abs(d);
  }
  const ag = gains / period;
  const al = losses / period;
  if (al === 0) return 100;
  if (ag === 0) return 0;
  return 100 - (100 / (1 + ag/al));
}

function calcMACD(closes) {
  if (closes.length < 35) return { hist: 0 };
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const line  = ema12 - ema26;
  // build macd series for signal
  const series = [];
  for (let i = 26; i <= closes.length; i++) {
    series.push(calcEMA(closes.slice(0,i), 12) - calcEMA(closes.slice(0,i), 26));
  }
  const sig = calcEMA(series, 9);
  return { macd: line, hist: line - sig };
}

function calcStoch(candles, k = 14) {
  const sl   = candles.slice(-k);
  const hi   = Math.max(...sl.map(c => c.high));
  const lo   = Math.min(...sl.map(c => c.low));
  const last = candles[candles.length-1].close;
  return hi === lo ? 50 : ((last - lo)/(hi - lo)) * 100;
}

function calcBB(closes, period = 20) {
  const sl  = closes.slice(-period);
  const avg = sl.reduce((a,b)=>a+b,0)/sl.length;
  const std = Math.sqrt(sl.reduce((s,v)=>s+Math.pow(v-avg,2),0)/sl.length);
  return { upper: avg+2*std, lower: avg-2*std, mid: avg };
}

function priceAction(candles) {
  // Last 5 candles direction
  const last5 = candles.slice(-5);
  let bull = 0, bear = 0;
  last5.forEach(c => {
    if (c.close > c.open) bull++;
    else if (c.close < c.open) bear++;
  });
  return { bull, bear };
}

function momentum(closes) {
  // Price change over last 5 candles
  const now  = closes[closes.length-1];
  const prev = closes[closes.length-6] || closes[0];
  return ((now - prev) / prev) * 100;
}

function buyerPressure(candles) {
  const last = candles.slice(-10);
  let buy = 0, sell = 0;
  last.forEach(c => {
    const r = c.high - c.low || 0.0001;
    buy  += (c.close - c.low) / r;
    sell += (c.high - c.close) / r;
  });
  const t = buy + sell || 1;
  return { buyers: Math.round((buy/t)*100), sellers: Math.round((sell/t)*100) };
}

function pattern(candles) {
  const c  = candles[candles.length-1];
  const p  = candles[candles.length-2];
  const pp = candles[candles.length-3];
  const body  = Math.abs(c.close - c.open);
  const range = c.high - c.low || 0.0001;
  const bull  = c.close > c.open;
  const upW   = c.high - Math.max(c.open, c.close);
  const dnW   = Math.min(c.open, c.close) - c.low;

  if (body < range*0.1)              return { n:"DOJI",             b:"neutral", s:0  };
  if (dnW>body*2 && upW<body*0.3)    return { n:bull?"HAMMER 🔨":"HANGING MAN", b:bull?"bull":"bear", s:bull?15:10 };
  if (upW>body*2 && dnW<body*0.3)    return { n:bull?"INV HAMMER":"SHOOTING STAR ⭐", b:bull?"bull":"bear", s:bull?8:15 };
  if (bull && p.close<p.open && c.open<=p.close && c.close>=p.open)
    return { n:"BULL ENGULF 🟢", b:"bull", s:20 };
  if (!bull && p.close>p.open && c.open>=p.close && c.close<=p.open)
    return { n:"BEAR ENGULF 🔴", b:"bear", s:20 };
  if (body>range*0.85)               return { n:bull?"BULL MARUBOZU":"BEAR MARUBOZU", b:bull?"bull":"bear", s:18 };
  if (pp&&p&&[pp,p,c].every(x=>x.close>x.open)) return { n:"3 SOLDIERS 🟢🟢🟢", b:"bull", s:22 };
  if (pp&&p&&[pp,p,c].every(x=>x.close<x.open)) return { n:"3 CROWS 🔴🔴🔴",    b:"bear", s:22 };
  return { n:bull?"BULL CANDLE":"BEAR CANDLE", b:bull?"bull":"bear", s:5 };
}

async function generateSignal(pair) {
  const candles = await fetchCandles(pair);
  const closes  = candles.map(c => c.close);
  const last    = candles[candles.length-1];

  // All indicators
  const rsi   = calcRSI(closes);
  const macdR = calcMACD(closes);
  const ema9  = calcEMA(closes, 9);
  const ema21 = calcEMA(closes, 21);
  const ema50 = calcEMA(closes, 50);
  const bb    = calcBB(closes);
  const stoch = calcStoch(candles);
  const pa    = priceAction(candles);
  const mom   = momentum(closes);
  const press = buyerPressure(candles);
  const pat   = pattern(candles);

  // ── VOTE SYSTEM ──────────────────────────
  // Each indicator gives a vote: +1 bull, -1 bear, 0 neutral
  // Final score determines direction

  const votes = [];

  // 1. RSI
  if      (rsi < 30) votes.push(+2);  // strong oversold = bull
  else if (rsi < 40) votes.push(+1);
  else if (rsi > 70) votes.push(-2);  // strong overbought = bear
  else if (rsi > 60) votes.push(-1);
  else               votes.push(0);   // neutral zone

  // 2. MACD histogram direction
  votes.push(macdR.hist > 0 ? +1 : -1);

  // 3. EMA 9 vs 21
  votes.push(ema9 > ema21 ? +1 : -1);

  // 4. EMA 21 vs 50 (trend)
  votes.push(ema21 > ema50 ? +1 : -1);

  // 5. Price vs EMA21
  votes.push(last.close > ema21 ? +1 : -1);

  // 6. Bollinger
  if      (last.close < bb.lower) votes.push(+2);
  else if (last.close > bb.upper) votes.push(-2);
  else if (last.close < bb.mid)   votes.push(+1);
  else                            votes.push(-1);

  // 7. Stochastic
  if      (stoch < 20) votes.push(+2);
  else if (stoch < 35) votes.push(+1);
  else if (stoch > 80) votes.push(-2);
  else if (stoch > 65) votes.push(-1);
  else                 votes.push(0);

  // 8. Price action (last 5 candles)
  if      (pa.bull >= 4) votes.push(+2);
  else if (pa.bull >= 3) votes.push(+1);
  else if (pa.bear >= 4) votes.push(-2);
  else if (pa.bear >= 3) votes.push(-1);
  else                   votes.push(0);

  // 9. Momentum
  if      (mom > 0.05)  votes.push(+1);
  else if (mom < -0.05) votes.push(-1);
  else                  votes.push(0);

  // 10. Buyer pressure
  if      (press.buyers > 60) votes.push(+1);
  else if (press.buyers < 40) votes.push(-1);
  else                        votes.push(0);

  // 11. Candle pattern
  if      (pat.b === "bull") votes.push(+1);
  else if (pat.b === "bear") votes.push(-1);
  else                       votes.push(0);

  // ── TOTAL SCORE ──
  const score    = votes.reduce((a,b) => a+b, 0);
  const maxScore = votes.reduce((a,b) => a + Math.abs(b), 0);
  const bullPct  = Math.round(((score + maxScore) / (2 * maxScore)) * 100);
  const bearPct  = 100 - bullPct;

  // ── DIRECTION — needs score of +3 or -3 minimum ──
  let direction = "WAIT", biasLabel = "NEUTRAL";
  if      (score >= 5)  { direction = "BUY";  biasLabel = score >= 8 ? "STRONG BULL" : "BULL"; }
  else if (score <= -5) { direction = "SELL"; biasLabel = score <= -8 ? "STRONG BEAR" : "BEAR"; }
  else if (score >= 3)  { direction = "BUY";  biasLabel = "WEAK BULL"; }
  else if (score <= -3) { direction = "SELL"; biasLabel = "WEAK BEAR"; }

  const c1Conf = Math.max(bullPct, bearPct);
  const c2Conf = Math.round(c1Conf * 0.82);
  const c3Conf = Math.round(c1Conf * 0.67);

  function cLabel(conf, dir) {
    if (dir === "WAIT") return { label: `DOJI ${conf}%`, type: "doji" };
    return dir === "BUY"
      ? { label: `BULL 🟢 ${conf}%`, type: "bull" }
      : { label: `BEAR 🔴 ${conf}%`, type: "bear" };
  }

  return {
    pair, direction, biasLabel,
    bullScore: bullPct,
    bearScore: bearPct,
    score,
    buyers:  press.buyers,
    sellers: press.sellers,
    rsi:     rsi.toFixed(1),
    macd:    macdR.macd ? macdR.macd.toFixed(5) : "0",
    macdHist: macdR.hist > 0 ? "BULL" : "BEAR",
    emaCross: ema9 > ema21 ? "BULL" : "BEAR",
    stoch:   stoch.toFixed(1),
    adx:     "N/A",
    priceVwap: last.close > ema21 ? "ABOVE" : "BELOW",
    pattern: pat.n,
    confidence: c1Conf,
    predictions: [cLabel(c1Conf, direction), cLabel(c2Conf, direction), cLabel(c3Conf, direction)],
    time: new Date().toLocaleTimeString()
  };
}
