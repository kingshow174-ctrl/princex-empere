// ============================================
// PRINCEX EMPERE — Candle Pattern Scanner
// Reads live candles + recommends expiry
// ============================================

// ── PATTERN DETECTION ────────────────────────

function scanPatterns(candles) {
  if (candles.length < 3) return [];
  const results = [];

  const c  = candles[candles.length - 1]; // last closed
  const p  = candles[candles.length - 2]; // prev
  const pp = candles[candles.length - 3]; // 2 back

  const body   = c => Math.abs(c.close - c.open);
  const range  = c => c.high - c.low || 0.0001;
  const upper  = c => c.high - Math.max(c.open, c.close);
  const lower  = c => Math.min(c.open, c.close) - c.low;
  const isBull = c => c.close > c.open;
  const isBear = c => c.close < c.open;

  // ── SINGLE CANDLE PATTERNS ──────────────────

  // HAMMER — small body top, long lower wick (bullish reversal)
  if (lower(c) > body(c) * 2 && upper(c) < body(c) * 0.5 && body(c) < range(c) * 0.4) {
    results.push({
      name: "HAMMER 🔨",
      signal: "BUY",
      strength: 75,
      type: "REVERSAL",
      description: "Small body at top, long lower wick — bullish reversal after downtrend",
      expiry: "3-5 MIN",
      candles: 3,
      confidence: 75,
    });
  }

  // SHOOTING STAR — small body bottom, long upper wick (bearish reversal)
  if (upper(c) > body(c) * 2 && lower(c) < body(c) * 0.5 && body(c) < range(c) * 0.4) {
    results.push({
      name: "SHOOTING STAR ⭐",
      signal: "SELL",
      strength: 75,
      type: "REVERSAL",
      description: "Small body at bottom, long upper wick — bearish reversal after uptrend",
      expiry: "3-5 MIN",
      candles: 3,
      confidence: 75,
    });
  }

  // DOJI — open ≈ close, equal wicks
  if (body(c) < range(c) * 0.1) {
    const isUpper = upper(c) > lower(c) * 1.5;
    const isLower = lower(c) > upper(c) * 1.5;
    if (isLower) {
      results.push({
        name: "DRAGONFLY DOJI 🐉",
        signal: "BUY",
        strength: 80,
        type: "REVERSAL",
        description: "Open=Close at top, long lower wick — strong bullish reversal",
        expiry: "3 MIN",
        candles: 3,
        confidence: 80,
      });
    } else if (isUpper) {
      results.push({
        name: "GRAVESTONE DOJI 🪦",
        signal: "SELL",
        strength: 80,
        type: "REVERSAL",
        description: "Open=Close at bottom, long upper wick — strong bearish reversal",
        expiry: "3 MIN",
        candles: 3,
        confidence: 80,
      });
    } else {
      results.push({
        name: "DOJI ⚖️",
        signal: "WAIT",
        strength: 50,
        type: "INDECISION",
        description: "Open equals close — market indecision, reversal possible",
        expiry: "WAIT",
        candles: 0,
        confidence: 50,
      });
    }
  }

  // SPINNING TOP — small body, equal wicks both sides
  if (body(c) < range(c) * 0.3 && upper(c) > body(c) && lower(c) > body(c) &&
      Math.abs(upper(c) - lower(c)) < range(c) * 0.2) {
    results.push({
      name: "SPINNING TOP 🌀",
      signal: "WAIT",
      strength: 45,
      type: "INDECISION",
      description: "Small body with equal wicks — indecision, wait for next candle",
      expiry: "WAIT",
      candles: 0,
      confidence: 45,
    });
  }

  // ── TWO CANDLE PATTERNS ─────────────────────

  // BULLISH ENGULFING — green fully covers previous red
  if (isBull(c) && isBear(p) &&
      c.open <= p.close && c.close >= p.open &&
      body(c) > body(p)) {
    results.push({
      name: "BULLISH ENGULFING 🟢",
      signal: "BUY",
      strength: 85,
      type: "CONTINUATION",
      description: "Green candle fully covers previous red — strong RISE signal",
      expiry: "3-5 MIN",
      candles: 3,
      confidence: 85,
    });
  }

  // BEARISH ENGULFING — red fully covers previous green
  if (isBear(c) && isBull(p) &&
      c.open >= p.close && c.close <= p.open &&
      body(c) > body(p)) {
    results.push({
      name: "BEARISH ENGULFING 🔴",
      signal: "SELL",
      strength: 85,
      type: "CONTINUATION",
      description: "Red candle fully covers previous green — strong FALL signal",
      expiry: "3-5 MIN",
      candles: 3,
      confidence: 85,
    });
  }

  // TWEEZER TOP — two candles with same high
  if (Math.abs(c.high - p.high) / (p.high || 1) < 0.0005 && isBear(c) && isBull(p)) {
    results.push({
      name: "TWEEZER TOP 📌",
      signal: "SELL",
      strength: 70,
      type: "REVERSAL",
      description: "Two candles with same high — FALL signal, rejection at resistance",
      expiry: "3 MIN",
      candles: 3,
      confidence: 70,
    });
  }

  // TWEEZER BOTTOM — two candles with same low
  if (Math.abs(c.low - p.low) / (p.low || 1) < 0.0005 && isBull(c) && isBear(p)) {
    results.push({
      name: "TWEEZER BOTTOM 📌",
      signal: "BUY",
      strength: 70,
      type: "REVERSAL",
      description: "Two candles with same low — RISE signal, rejection at support",
      expiry: "3 MIN",
      candles: 3,
      confidence: 70,
    });
  }

  // PIERCING LINE — red then green closes above 50% of red
  if (isBull(c) && isBear(p) &&
      c.open < p.close &&
      c.close > p.open + body(p) * 0.5 &&
      c.close < p.open) {
    results.push({
      name: "PIERCING LINE 💉",
      signal: "BUY",
      strength: 72,
      type: "REVERSAL",
      description: "Red then green that closes above 50% of red body — bullish reversal",
      expiry: "3-5 MIN",
      candles: 3,
      confidence: 72,
    });
  }

  // DARK CLOUD COVER — green then red closes below 50% of green
  if (isBear(c) && isBull(p) &&
      c.open > p.close &&
      c.close < p.open + body(p) * 0.5 &&
      c.close > p.open) {
    results.push({
      name: "DARK CLOUD COVER ☁️",
      signal: "SELL",
      strength: 72,
      type: "REVERSAL",
      description: "Green then red that closes below 50% of green body — bearish reversal",
      expiry: "3-5 MIN",
      candles: 3,
      confidence: 72,
    });
  }

  // INSIDE BAR — candle completely inside previous candle
  if (c.high < p.high && c.low > p.low) {
    results.push({
      name: "INSIDE BAR 📦",
      signal: "WATCH",
      strength: 60,
      type: "BREAKOUT",
      description: "Candle inside previous — breakout coming, wait for direction",
      expiry: "WAIT FOR BREAK",
      candles: 1,
      confidence: 60,
    });
  }

  // ── THREE CANDLE PATTERNS ───────────────────

  // MORNING STAR — red, small doji/small body, green
  if (pp && isBear(pp) && body(p) < body(pp) * 0.5 && isBull(c) &&
      c.close > pp.open + body(pp) * 0.3) {
    results.push({
      name: "MORNING STAR 🌅",
      signal: "BUY",
      strength: 88,
      type: "REVERSAL",
      description: "Red, small doji, green — strong RISE reversal signal",
      expiry: "5 MIN",
      candles: 5,
      confidence: 88,
    });
  }

  // EVENING STAR — green, small doji/small body, red
  if (pp && isBull(pp) && body(p) < body(pp) * 0.5 && isBear(c) &&
      c.close < pp.open - body(pp) * 0.3) {
    results.push({
      name: "EVENING STAR 🌆",
      signal: "SELL",
      strength: 88,
      type: "REVERSAL",
      description: "Green, small doji, red — strong FALL reversal signal",
      expiry: "5 MIN",
      candles: 5,
      confidence: 88,
    });
  }

  // THREE WHITE SOLDIERS — 3 consecutive strong green candles
  if (pp && isBull(c) && isBull(p) && isBull(pp) &&
      body(c) > range(c) * 0.5 &&
      body(p) > range(p) * 0.5 &&
      body(pp) > range(pp) * 0.5 &&
      c.close > p.close && p.close > pp.close) {
    results.push({
      name: "THREE WHITE SOLDIERS 🪖🪖🪖",
      signal: "BUY",
      strength: 90,
      type: "CONTINUATION",
      description: "3 strong green candles — strong uptrend continuation",
      expiry: "5-10 MIN",
      candles: 5,
      confidence: 90,
    });
  }

  // THREE BLACK CROWS — 3 consecutive strong red candles
  if (pp && isBear(c) && isBear(p) && isBear(pp) &&
      body(c) > range(c) * 0.5 &&
      body(p) > range(p) * 0.5 &&
      body(pp) > range(pp) * 0.5 &&
      c.close < p.close && p.close < pp.close) {
    results.push({
      name: "THREE BLACK CROWS 🦅🦅🦅",
      signal: "SELL",
      strength: 90,
      type: "CONTINUATION",
      description: "3 strong red candles — strong downtrend continuation",
      expiry: "5-10 MIN",
      candles: 5,
      confidence: 90,
    });
  }

  // Sort by confidence — strongest first
  return results.sort((a, b) => b.confidence - a.confidence);
}

// ── RECOMMEND EXPIRY FROM PATTERNS ───────────

function recommendExpiry(patterns) {
  if (!patterns.length) return null;
  const top = patterns[0];

  // Combine all signals
  const buys  = patterns.filter(p => p.signal === "BUY").length;
  const sells = patterns.filter(p => p.signal === "SELL").length;
  const waits = patterns.filter(p => p.signal === "WAIT" || p.signal === "WATCH").length;

  const dominant = buys > sells ? "BUY" : sells > buys ? "SELL" : "WAIT";
  const maxConf  = Math.max(...patterns.map(p => p.confidence));
  const maxCandles = Math.max(...patterns.filter(p => p.candles > 0).map(p => p.candles));

  // Expiry recommendation
  let expiry, expiryMin;
  if (dominant === "WAIT") {
    expiry = "WAIT — No clear direction";
    expiryMin = 0;
  } else if (maxConf >= 85) {
    expiry    = maxCandles >= 5 ? "5 MIN" : "3 MIN";
    expiryMin = maxCandles >= 5 ? 5 : 3;
  } else if (maxConf >= 70) {
    expiry    = "3 MIN";
    expiryMin = 3;
  } else {
    expiry    = "2 MIN";
    expiryMin = 2;
  }

  return { dominant, confidence: maxConf, expiry, expiryMin, patternCount: patterns.length };
}

// ── RENDER PATTERN SCANNER ───────────────────

function renderPatternScanner(patterns, pair, currentPrice) {
  const el = document.getElementById("pattern-scanner");
  if (!el) return;

  if (!patterns.length) {
    el.innerHTML = `
      <div style="text-align:center;padding:16px;color:var(--muted);font-family:var(--font-display);font-size:11px;letter-spacing:1px">
        NO PATTERNS DETECTED<br>
        <small style="font-size:9px">Waiting for strong candle formation...</small>
      </div>`;
    return;
  }

  const rec = recommendExpiry(patterns);
  const recColor = rec.dominant === "BUY" ? "#00e676" : rec.dominant === "SELL" ? "#ff3b5c" : "#f5c842";

  // Recommendation box
  let html = `
    <div class="ps-recommendation" style="border-color:${recColor}">
      <div class="ps-rec-label">🧠 PATTERN RECOMMENDATION</div>
      <div class="ps-rec-direction" style="color:${recColor}">${rec.dominant === "BUY" ? "⬆ BUY" : rec.dominant === "SELL" ? "⬇ SELL" : "⏸ WAIT"}</div>
      <div class="ps-rec-row">
        <div class="ps-rec-box">
          <span>CONFIDENCE</span>
          <b style="color:${recColor}">${rec.confidence}%</b>
        </div>
        <div class="ps-rec-box">
          <span>EXPIRY</span>
          <b style="color:var(--gold)">${rec.expiry}</b>
        </div>
        <div class="ps-rec-box">
          <span>PATTERNS</span>
          <b style="color:var(--text)">${rec.patternCount} found</b>
        </div>
      </div>
      ${rec.dominant !== "WAIT" ? `
      <div class="ps-expiry-bar">
        <div class="ps-expiry-fill" style="width:${rec.confidence}%;background:${recColor}"></div>
      </div>` : ""}
    </div>`;

  // Individual patterns
  html += `<div class="ps-patterns-label">📋 DETECTED PATTERNS</div>`;

  patterns.forEach(pat => {
    const sc = pat.signal === "BUY" ? "#00e676" : pat.signal === "SELL" ? "#ff3b5c" : "#f5c842";
    const bg = pat.signal === "BUY" ? "rgba(0,230,118,0.06)" : pat.signal === "SELL" ? "rgba(255,59,92,0.06)" : "rgba(245,200,66,0.06)";
    const icon = pat.signal === "BUY" ? "⬆" : pat.signal === "SELL" ? "⬇" : "⏸";
    html += `
      <div class="ps-pattern-card" style="border-color:${sc};background:${bg}">
        <div class="ps-pat-header">
          <span class="ps-pat-name">${pat.name}</span>
          <span class="ps-pat-signal" style="color:${sc}">${icon} ${pat.signal}</span>
        </div>
        <div class="ps-pat-desc">${pat.description}</div>
        <div class="ps-pat-footer">
          <span class="ps-pat-type">${pat.type}</span>
          <span class="ps-pat-expiry" style="color:var(--gold)">⏱ ${pat.expiry}</span>
          <span class="ps-pat-conf" style="color:${sc}">${pat.confidence}%</span>
        </div>
        <div class="ps-conf-bar">
          <div style="width:${pat.confidence}%;height:3px;background:${sc};border-radius:2px;transition:width 0.5s"></div>
        </div>
      </div>`;
  });

  el.innerHTML = html;
}

// ── AUTO SCAN LOOP ───────────────────────────

let patternScanInterval = null;

async function startPatternScanner(pair) {
  if (patternScanInterval) clearInterval(patternScanInterval);

  await runPatternScan(pair);
  patternScanInterval = setInterval(() => runPatternScan(pair), 60000); // every 1 min
}

async function runPatternScan(pair) {
  try {
    const el = document.getElementById("pattern-scanner");
    if (el) {
      el.innerHTML = `<div style="text-align:center;padding:12px;color:var(--muted);font-family:var(--font-display);font-size:10px;letter-spacing:1px">🔍 SCANNING CANDLES...</div>`;
    }

    // Fetch last 10 closed candles from Twelve Data
    const symbol = encodeURIComponent(pair);
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1min&outputsize=10&apikey=${CONFIG.TWELVE_DATA_KEY}`;
    const res  = await fetch(url);
    const data = await res.json();

    if (data.status === "error" || !data.values) throw new Error(data.message || "Fetch failed");

    // Reverse to oldest first, exclude last (forming)
    const candles = data.values.reverse().slice(0, -1).map(c => ({
      open:  parseFloat(c.open),
      high:  parseFloat(c.high),
      low:   parseFloat(c.low),
      close: parseFloat(c.close),
    }));

    const currentPrice = parseFloat(data.values[data.values.length - 1]?.close || 0);
    const patterns = scanPatterns(candles);
    renderPatternScanner(patterns, pair, currentPrice);

    // Update scan time
    const timeEl = document.getElementById("scanner-time");
    if (timeEl) timeEl.textContent = "Last scan: " + new Date().toLocaleTimeString();

    // Sound alert for strong patterns
    if (patterns.length > 0 && patterns[0].confidence >= 85) {
      if (typeof playSignalSound === "function") {
        playSignalSound(patterns[0].signal === "BUY" ? "BUY" : "SELL", "MODERATE");
      }
    }
  } catch(e) {
    const el = document.getElementById("pattern-scanner");
    if (el) el.innerHTML = `<div style="color:var(--muted);padding:12px;font-size:11px;text-align:center">⚠ ${e.message}</div>`;
  }
}

function stopPatternScanner() {
  if (patternScanInterval) { clearInterval(patternScanInterval); patternScanInterval = null; }
}
