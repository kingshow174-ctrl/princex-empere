// ============================================
// PRINCEX EMPERE — Deriv Live Engine v2
// 24/7 Live Chart + WebSocket + Ringtones
// ============================================

const DERIV_WS_URL = "wss://ws.binaryws.com/websockets/v3?app_id=1089";
const DERIV_PAIRS  = [
  { symbol:"R_10",    label:"V10",   name:"Volatility 10" },
  { symbol:"R_25",    label:"V25",   name:"Volatility 25" },
  { symbol:"R_50",    label:"V50",   name:"Volatility 50" },
  { symbol:"R_75",    label:"V75",   name:"Volatility 75" },
  { symbol:"R_100",   label:"V100",  name:"Volatility 100" },
  { symbol:"1HZ10V",  label:"V10s",  name:"Volatility 10 (1s)" },
  { symbol:"1HZ25V",  label:"V25s",  name:"Volatility 25 (1s)" },
  { symbol:"1HZ50V",  label:"V50s",  name:"Volatility 50 (1s)" },
  { symbol:"1HZ75V",  label:"V75s",  name:"Volatility 75 (1s)" },
  { symbol:"1HZ100V", label:"V100s", name:"Volatility 100 (1s)" },
];

const DERIV_TIMEFRAMES = [
  { label:"1M",  value:60    },
  { label:"5M",  value:300   },
  { label:"15M", value:900   },
  { label:"1H",  value:3600  },
  { label:"4H",  value:14400 },
];

let derivWS          = null;
let derivCandles     = [];
let derivLiveCandle  = null; // currently forming candle
let derivSymbol      = "R_50";
let derivTF          = 60;
let derivLabel       = "V50";
let derivLastSignal  = null;
let derivAutoTimer   = null;
let derivIsAuto      = false;
let derivTickId      = null;
let derivTickThrottle= null;
let derivChartTimer  = null;
let derivConnecting  = false;
let derivReconnTimer = null;

// ── WEBSOCKET ────────────────────────────────

function derivSetStatus(text, live=false) {
  const el = document.getElementById("deriv-status");
  if (!el) return;
  el.textContent = text;
  live ? el.classList.add("live") : el.classList.remove("live");
}

async function derivConnect() {
  if (derivConnecting) return;
  if (derivWS && derivWS.readyState === WebSocket.OPEN) return;
  derivConnecting = true;
  derivSetStatus("CONNECTING...");

  return new Promise((resolve) => {
    derivWS = new WebSocket(DERIV_WS_URL);

    derivWS.onopen = () => {
      derivConnecting = false;
      derivSetStatus("CONNECTED", true);
      resolve();
      // Re-subscribe to ticks if we were subscribed before
      if (derivSymbol) derivStartLiveChart();
    };

    derivWS.onerror = () => {
      derivConnecting = false;
      derivSetStatus("ERROR");
    };

    derivWS.onclose = () => {
      derivConnecting = false;
      derivSetStatus("RECONNECTING...");
      clearTimeout(derivReconnTimer);
      derivReconnTimer = setTimeout(() => derivConnect(), 3000);
    };

    derivWS.onmessage = (evt) => derivHandleMessage(JSON.parse(evt.data));
  });
}

function derivSend(payload) {
  return new Promise((resolve, reject) => {
    if (!derivWS || derivWS.readyState !== WebSocket.OPEN) {
      reject(new Error("WS not connected")); return;
    }
    const id = Math.floor(Math.random() * 99999);
    payload.req_id = id;
    const handler = (evt) => {
      const data = JSON.parse(evt.data);
      if (data.req_id === id) {
        derivWS.removeEventListener("message", handler);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data);
      }
    };
    derivWS.addEventListener("message", handler);
    derivWS.send(JSON.stringify(payload));
  });
}

// ── MESSAGE HANDLER ──────────────────────────

function derivHandleMessage(data) {
  // Live tick for chart
  if (data.tick) {
    const price = parseFloat(data.tick.quote);
    const epoch = data.tick.epoch;
    derivTickId = data.tick.id;
    derivUpdateLiveCandle(price, epoch);
    derivUpdatePriceDisplay(price);
  }

  // Candle history subscription
  if (data.candles && data.ohlc === undefined) {
    // history response — handled in fetchCandles
  }

  // Live OHLC candle update
  if (data.ohlc) {
    const c = data.ohlc;
    derivLiveCandle = {
      open:  parseFloat(c.open),
      high:  parseFloat(c.high),
      low:   parseFloat(c.low),
      close: parseFloat(c.close),
      epoch: c.open_time,
      volume: 1,
    };
    derivRedrawChart();
  }
}

function derivUpdatePriceDisplay(price) {
  if (derivTickThrottle) return;
  derivTickThrottle = setTimeout(() => {
    derivTickThrottle = null;
    const el = document.getElementById("deriv-live-price");
    const dec = price < 10 ? 5 : price < 1000 ? 2 : 1;
    if (el) el.textContent = price.toFixed(dec);
  }, 500);
}

function derivUpdateLiveCandle(price, epoch) {
  if (derivCandles.length === 0) return;
  const last = derivCandles[derivCandles.length - 1];
  const candleStart = last.epoch;
  const candleEnd   = candleStart + derivTF;

  if (epoch >= candleEnd) {
    // New candle started — push last live candle as closed
    if (derivLiveCandle) {
      derivCandles.push({ ...derivLiveCandle });
      if (derivCandles.length > 150) derivCandles.shift();
    }
    // Start fresh live candle
    derivLiveCandle = {
      open: price, high: price, low: price, close: price,
      epoch: epoch, volume: 1,
    };
  } else {
    // Update live candle
    if (derivLiveCandle) {
      derivLiveCandle.close = price;
      derivLiveCandle.high  = Math.max(derivLiveCandle.high, price);
      derivLiveCandle.low   = Math.min(derivLiveCandle.low, price);
    } else {
      derivLiveCandle = {
        open: price, high: price, low: price, close: price,
        epoch: epoch, volume: 1,
      };
    }
  }

  derivRedrawChart();
}

// ── START LIVE CHART ─────────────────────────

async function derivStartLiveChart() {
  if (!derivWS || derivWS.readyState !== WebSocket.OPEN) {
    await derivConnect();
  }

  // Unsubscribe previous tick
  if (derivTickId) {
    derivWS.send(JSON.stringify({ forget: derivTickId }));
    derivTickId = null;
  }

  try {
    // Fetch candle history
    const data = await derivSend({
      ticks_history: derivSymbol,
      granularity:   derivTF,
      count:         500,
      end:           "latest",
      style:         "candles",
      subscribe:     1, // subscribe to live OHLC updates
    });

    if (data.candles && data.candles.length > 1) {
      // All but last (forming) = closed candles
      derivCandles = data.candles.slice(0, -1).map(c => ({
        open:   parseFloat(c.open),
        high:   parseFloat(c.high),
        low:    parseFloat(c.low),
        close:  parseFloat(c.close),
        epoch:  c.epoch,
        volume: 1,
      }));

      // Last = live forming candle
      const lc = data.candles[data.candles.length - 1];
      derivLiveCandle = {
        open:   parseFloat(lc.open),
        high:   parseFloat(lc.high),
        low:    parseFloat(lc.low),
        close:  parseFloat(lc.close),
        epoch:  lc.epoch,
        volume: 1,
      };
    }

    // Also subscribe to ticks for real-time price
    derivWS.send(JSON.stringify({
      ticks: derivSymbol,
      subscribe: 1,
    }));

    derivSetStatus("LIVE", true);
    derivRedrawChart();

    // Redraw chart every second for smooth animation
    if (derivChartTimer) clearInterval(derivChartTimer);
    derivChartTimer = setInterval(derivRedrawChart, 1000);

  } catch(e) {
    derivSetStatus("ERROR: " + e.message);
  }
}

// ── CHART RENDERER (24/7 live) ───────────────

function derivRedrawChart() {
  const canvas = document.getElementById("deriv-canvas");
  if (!canvas || !document.getElementById("tab-deriv")?.classList.contains("active")) return;

  const ctx = canvas.getContext("2d");
  const W   = canvas.offsetWidth;
  const H   = 280;
  canvas.width  = W;
  canvas.height = H;

  if (!W || !H) return;

  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, W, H);

  // Show closed candles + live forming candle
  const allCandles = derivLiveCandle
    ? [...derivCandles.slice(-59), derivLiveCandle]
    : derivCandles.slice(-60);

  if (allCandles.length === 0) {
    ctx.fillStyle = "#64748b";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.fillText("Loading chart...", W/2, H/2);
    return;
  }

  const allH = Math.max(...allCandles.map(c=>c.high));
  const allL = Math.min(...allCandles.map(c=>c.low));
  const pad  = (allH-allL)*0.12 || 0.001;
  const hi   = allH + pad, lo = allL - pad;
  const scY  = (v) => H - ((v - lo)/(hi - lo)) * (H - 20) - 10;

  const gap  = W / allCandles.length;
  const cW   = Math.max(2, gap * 0.6);

  // Grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth   = 1;
  for (let i = 0; i <= 4; i++) {
    const y = H * i / 4;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    const val = hi - (hi-lo) * i/4;
    ctx.fillStyle = "#334155";
    ctx.font = "9px monospace";
    ctx.textAlign = "right";
    ctx.fillText(val.toFixed(val<10?5:2), W-2, y+9);
  }
  ctx.textAlign = "left";

  // Draw closed candles
  allCandles.forEach((c, i) => {
    const x    = i * gap + gap/2;
    const isLive = i === allCandles.length - 1 && derivLiveCandle;
    const bull = c.close >= c.open;
    const color= isLive ? "#a78bfa" : bull ? "#00e676" : "#ff3b5c"; // live = purple

    const oY = scY(c.open), cY = scY(c.close);
    const hY = scY(c.high), lY = scY(c.low);

    // Wick
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(x, hY); ctx.lineTo(x, lY);
    ctx.stroke();

    // Body
    const bodyTop = Math.min(oY, cY);
    const bodyH   = Math.max(1, Math.abs(oY - cY));
    ctx.fillStyle = isLive ? "rgba(167,139,250,0.6)" : color;
    ctx.fillRect(x - cW/2, bodyTop, cW, bodyH);
  });

  // EMA lines
  const closes = allCandles.map(c=>c.close);
  const drawEMA = (period, color, label) => {
    if (closes.length < period) return;
    const k = 2/(period+1);
    let e = closes.slice(0,period).reduce((a,b)=>a+b,0)/period;
    ctx.beginPath(); ctx.strokeStyle=color; ctx.lineWidth=1;
    for (let i=period; i<closes.length; i++) {
      e = closes[i]*k+e*(1-k);
      const x=i*gap+gap/2, y=scY(e);
      i===period ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
    }
    ctx.stroke();
    // Label at end
    const lastE = closes.slice(-period).reduce((a,b,i,arr)=>{
      if (i===0) return b;
      return b*(2/(period+1)) + a*(1-(2/(period+1)));
    });
    ctx.fillStyle=color; ctx.font="8px monospace";
    ctx.fillText("EMA"+period, W*0.02, scY(e)+12);
  };
  drawEMA(20,"#3b82f6","EMA20");
  drawEMA(50,"#f59e0b","EMA50");

  // VWAP
  let cumPV=0, cumV=0;
  allCandles.forEach(c=>{ cumPV+=(c.high+c.low+c.close)/3; cumV++; });
  const vwap = cumPV/cumV;
  const vwapY = scY(vwap);
  if (vwapY > 10 && vwapY < H-10) {
    ctx.strokeStyle="#f5c842"; ctx.lineWidth=1; ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(0,vwapY); ctx.lineTo(W*0.9,vwapY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle="#f5c842"; ctx.font="8px monospace";
    ctx.fillText("VWAP",W*0.91,vwapY+3);
  }

  // SL/TP lines if signal active
  if (derivLastSignal?.fired) {
    const drawLine=(price,color,lbl)=>{
      if (!price) return;
      const pFloat=parseFloat(price);
      if (pFloat<lo||pFloat>hi) return;
      const y=scY(pFloat);
      ctx.strokeStyle=color; ctx.lineWidth=1; ctx.setLineDash([4,3]);
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle=color; ctx.font="9px monospace";
      ctx.fillText(lbl,4,y-2);
    };
    drawLine(derivLastSignal.entry,"#ffffff","ENTRY "+derivLastSignal.entry);
    drawLine(derivLastSignal.sl,   "#ff3b5c","SL "+derivLastSignal.sl);
    drawLine(derivLastSignal.tp1,  "#00e676","TP1 "+derivLastSignal.tp1);
    drawLine(derivLastSignal.tp2,  "#00ff88","TP2 "+derivLastSignal.tp2);
  }

  // Ghost candles (predictions)
  if (derivLastSignal?.fired && derivLastSignal.predictions) {
    const atr = derivLastSignal.details?.atr || (allH-allL)*0.2;
    const ghostStartX = allCandles.length * gap + gap/2;
    derivLastSignal.predictions.forEach((p, i) => {
      const x = ghostStartX + i * gap;
      if (x > W) return;
      const isRise = p.dir === "RISE";
      const midPrice= (allH+allL)/2;
      const top  = scY(midPrice + atr*0.5);
      const bot  = scY(midPrice - atr*0.5);
      const bodyH= Math.abs(top-bot);

      ctx.globalAlpha = 0.45;
      ctx.fillStyle   = isRise ? "#7c3aed" : "#9333ea";
      const bTop = isRise ? top : bot - bodyH;
      ctx.fillRect(x-cW/2, bTop, cW, bodyH);

      ctx.strokeStyle="#a855f7"; ctx.lineWidth=1;
      ctx.beginPath();
      ctx.moveTo(x, bTop-bodyH*0.5);
      ctx.lineTo(x, bTop+bodyH*1.5);
      ctx.stroke();

      ctx.globalAlpha=1;
      ctx.fillStyle="#a855f7"; ctx.font="9px monospace"; ctx.textAlign="center";
      ctx.fillText("C"+(i+1), x, H-4);
      ctx.textAlign="left";
    });
  }

  // Live price label (right edge)
  if (derivLiveCandle) {
    const lastPrice = derivLiveCandle.close;
    const lY = scY(lastPrice);
    const dec = lastPrice<10?5:lastPrice<1000?2:1;
    ctx.fillStyle="#1e2d45";
    ctx.fillRect(W-70, lY-9, 68, 16);
    ctx.fillStyle="#f5c842";
    ctx.font="bold 10px monospace";
    ctx.textAlign="right";
    ctx.fillText(lastPrice.toFixed(dec), W-2, lY+4);
    ctx.textAlign="left";
  }

  // Time label
  const now = new Date();
  ctx.fillStyle="#334155"; ctx.font="9px monospace";
  ctx.fillText(now.toUTCString().slice(17,22)+" UTC", 4, H-4);
}

// ── FETCH CLOSED CANDLES FOR SIGNAL ──────────

async function derivFetchClosedCandles(symbol, granularity) {
  await derivConnect();
  const data = await derivSend({
    ticks_history: symbol,
    granularity:   granularity,
    count:         500,
    end:           "latest",
    style:         "candles",
  });
  if (!data.candles || data.candles.length < 10) throw new Error("Not enough candle data");
  // Exclude last candle (currently forming)
  return data.candles.slice(0, -1).map(c => ({
    open:   parseFloat(c.open),
    high:   parseFloat(c.high),
    low:    parseFloat(c.low),
    close:  parseFloat(c.close),
    epoch:  c.epoch,
    volume: 1,
  }));
}

// ── SESSION ───────────────────────────────────

function getSession() {
  const h = new Date().getUTCHours();
  if (h>=0&&h<8)  return "🌏 ASIA";
  if (h>=8&&h<13) return "🇬🇧 LONDON";
  if (h>=13&&h<21)return "🇺🇸 NEW YORK";
  return "🌙 OFF HOURS";
}

// ══════════════════════════════════════════════
// 30-POINT SCORING (same as before — all helpers inline)
// ══════════════════════════════════════════════

function _ema(arr,p){if(arr.length<p)return arr[arr.length-1];const k=2/(p+1);let e=arr.slice(0,p).reduce((a,b)=>a+b,0)/p;for(let i=p;i<arr.length;i++)e=arr[i]*k+e*(1-k);return e;}
function _rsi(cl,p=14){if(cl.length<p+1)return 50;let g=0,l=0;for(let i=cl.length-p;i<cl.length;i++){const d=cl[i]-cl[i-1];if(d>0)g+=d;else l+=Math.abs(d);}const ag=g/p,al=l/p;if(al===0)return 100;if(ag===0)return 0;return 100-(100/(1+ag/al));}
function _stoch(cn,k=14){const sl=cn.slice(-k);const hi=Math.max(...sl.map(c=>c.high)),lo=Math.min(...sl.map(c=>c.low)),last=cn[cn.length-1].close;return hi===lo?50:((last-lo)/(hi-lo))*100;}
function _cci(cn,p=20){const sl=cn.slice(-p);const tp=sl.map(c=>(c.high+c.low+c.close)/3);const avg=tp.reduce((a,b)=>a+b,0)/p;const md=tp.reduce((a,b)=>a+Math.abs(b-avg),0)/p;return md===0?0:(tp[tp.length-1]-avg)/(0.015*md);}
function _atr(cn,p=14){if(cn.length<p+1)return(cn[cn.length-1].high-cn[cn.length-1].low)||0.001;let t=[];for(let i=cn.length-p;i<cn.length;i++){const c=cn[i],pv=cn[i-1];t.push(Math.max(c.high-c.low,Math.abs(c.high-pv.close),Math.abs(c.low-pv.close)));}return t.reduce((a,b)=>a+b,0)/p;}
function _macd(cl){if(cl.length<35)return{hist:0};const s=[];for(let i=26;i<=cl.length;i++){const sl=cl.slice(0,i);s.push(_ema(sl,12)-_ema(sl,26));}const line=s[s.length-1],sig=_ema(s,9);return{macd:line,signal:sig,hist:line-sig};}
function _st(cn,al=10,m=3){const atr=_atr(cn,al);let tr="up",st=cn.slice(-30)[0].close;const sl=cn.slice(-30);for(let i=1;i<sl.length;i++){const c=sl[i],hl2=(c.high+c.low)/2;const bU=hl2+m*atr,bL=hl2-m*atr;if(c.close>st)tr="up";else if(c.close<st)tr="down";st=tr==="up"?Math.max(bL,st):Math.min(bU,st);}return{bullish:cn[cn.length-1].close>st};}
function _vwap(cn){let pv=0,v=0;cn.forEach(c=>{pv+=(c.high+c.low+c.close)/3;v++;});return v>0?pv/v:cn[cn.length-1].close;}
function _obv(cn){let o=0;for(let i=1;i<cn.length;i++){if(cn[i].close>cn[i-1].close)o++;else if(cn[i].close<cn[i-1].close)o--;}return o;}
function _mfi(cn,p=14){const sl=cn.slice(-p-1);let pf=0,nf=0;for(let i=1;i<sl.length;i++){const tp=(sl[i].high+sl[i].low+sl[i].close)/3,pt=(sl[i-1].high+sl[i-1].low+sl[i-1].close)/3;if(tp>pt)pf+=tp;else nf+=tp;}return nf===0?100:100-(100/(1+pf/nf));}
function _adx(cn,p=14){if(cn.length<p+2)return 20;let pd=0,md=0,tr=0;for(let i=cn.length-p;i<cn.length;i++){const c=cn[i],pv=cn[i-1],up=c.high-pv.high,dn=pv.low-c.low;if(up>dn&&up>0)pd+=up;else if(dn>up&&dn>0)md+=dn;tr+=Math.max(c.high-c.low,Math.abs(c.high-pv.close),Math.abs(c.low-pv.close));}if(tr===0)return 20;const pDI=100*pd/tr,mDI=100*md/tr;return(pDI+mDI)===0?0:100*Math.abs(pDI-mDI)/(pDI+mDI);}
function _hma(arr,p=20){const wma=(a,n)=>{let num=0,den=0;const sl=a.slice(-n);sl.forEach((v,i)=>{num+=(i+1)*v;den+=(i+1);});return den===0?sl[sl.length-1]:num/den;};const h=Math.floor(p/2),hs=[];for(let i=p;i<=arr.length;i++)hs.push(2*wma(arr.slice(0,i),h)-wma(arr.slice(0,i),p));return hs.length<2?0:hs[hs.length-1]-hs[hs.length-2];}
function _bb(cl,p=20){const sl=cl.slice(-p);const avg=sl.reduce((a,b)=>a+b,0)/p;const std=Math.sqrt(sl.reduce((s,v)=>s+Math.pow(v-avg,2),0)/p);return{above:cl[cl.length-1]>avg,mid:avg,upper:avg+2*std,lower:avg-2*std};}
function _swings(cn,lb=4){const h=[],l=[];for(let i=lb;i<cn.length-lb;i++){const w=cn.slice(i-lb,i+lb+1);if(cn[i].high===Math.max(...w.map(x=>x.high)))h.push({i,price:cn[i].high});if(cn[i].low===Math.min(...w.map(x=>x.low)))l.push({i,price:cn[i].low});}return{highs:h,lows:l};}
function _bos(cn){const{highs:h,lows:l}=_swings(cn,4);if(h.length<2||l.length<2)return null;const ph=h[h.length-2].price,pl=l[l.length-2].price,last=cn[cn.length-1].close;if(last>ph)return"bullish";if(last<pl)return"bearish";return null;}
function _choch(cn){const{highs:h,lows:l}=_swings(cn,4);if(h.length<2||l.length<2)return null;const lh=h[h.length-1].price,ph=h[h.length-2].price,ll=l[l.length-1].price,pl=l[l.length-2].price;if(lh>ph&&ll>pl)return"bullish";if(lh<ph&&ll<pl)return"bearish";return null;}
function _ob(cn){const l=cn.slice(-10);for(let i=l.length-2;i>=1;i--){const c=l[i],n=l[i+1],b=Math.abs(c.close-c.open),nb=Math.abs(n.close-n.open);if(nb>b*1.5){if(c.close<c.open&&n.close>n.open)return"bullish";if(c.close>c.open&&n.close<n.open)return"bearish";}}return null;}
function _fvg(cn){const sl=cn.slice(-5);for(let i=1;i<sl.length-1;i++){const p=sl[i-1],n=sl[i+1];if(n.low>p.high)return"bullish";if(n.high<p.low)return"bearish";}return null;}
function _pat(cn){const c=cn[cn.length-1],p=cn[cn.length-2],pp=cn[cn.length-3];const body=Math.abs(c.close-c.open),range=c.high-c.low||0.001;const upW=c.high-Math.max(c.open,c.close),dnW=Math.min(c.open,c.close)-c.low,bull=c.close>c.open;if(body<range*0.1)return{name:"DOJI",bias:"neutral"};if(dnW>body*2&&upW<body*0.3)return{name:bull?"HAMMER":"HANGING MAN",bias:bull?"bull":"bear"};if(upW>body*2&&dnW<body*0.3)return{name:bull?"INV HAMMER":"SHOOTING STAR",bias:bull?"bull":"bear"};if(bull&&p.close<p.open&&c.open<=p.close&&c.close>=p.open)return{name:"BULL ENGULFING",bias:"bull"};if(!bull&&p.close>p.open&&c.open>=p.close&&c.close<=p.open)return{name:"BEAR ENGULFING",bias:"bear"};if(pp&&p&&pp.close<pp.open&&Math.abs(p.close-p.open)<Math.abs(pp.close-pp.open)*0.5&&bull&&c.close>pp.open)return{name:"MORNING STAR",bias:"bull"};if(pp&&p&&pp.close>pp.open&&Math.abs(p.close-p.open)<Math.abs(pp.close-pp.open)*0.5&&!bull&&c.close<pp.open)return{name:"EVENING STAR",bias:"bear"};if(body>range*0.85)return{name:bull?"MARUBOZU BULL":"MARUBOZU BEAR",bias:bull?"bull":"bear"};if(pp&&p&&[pp,p,c].every(x=>x.close>x.open))return{name:"3 SOLDIERS",bias:"bull"};if(pp&&p&&[pp,p,c].every(x=>x.close<x.open))return{name:"3 CROWS",bias:"bear"};return{name:bull?"BULL CANDLE":"BEAR CANDLE",bias:bull?"bull":"bear"};}

function score30(candles) {
  const closes=candles.map(c=>c.close),last=candles[candles.length-1];
  let bullPts=0,bearPts=0;
  const checks=[];
  const add=(cat,name,bias)=>{if(bias==="bull")bullPts++;else if(bias==="bear")bearPts++;checks.push({cat,name,bias});};

  // TREND (cap 5)
  const e20=_ema(closes,20),e50=_ema(closes,50),e200=_ema(closes,Math.min(closes.length,100));
  add("TREND","EMA Stack",e20>e50&&e50>e200?"bull":e20<e50&&e50<e200?"bear":"neutral");
  add("TREND","Supertrend",_st(candles,10,3).bullish?"bull":"bear");
  add("TREND","HMA Slope",_hma(closes,20)>0?"bull":"bear");
  add("TREND","BB Position",_bb(closes,20).above?"bull":"bear");
  const e9p=_ema(closes.slice(0,-1),9),e9c=_ema(closes,9);
  add("TREND","EMA9 Slope",e9c>e9p?"bull":"bear");

  // MOMENTUM (cap 4)
  const rsi=_rsi(closes);
  add("MOMENTUM","RSI",rsi>50?"bull":"bear");
  add("MOMENTUM","MACD",_macd(closes).hist>0?"bull":"bear");
  add("MOMENTUM","Stochastic",_stoch(candles)>50?"bull":"bear");
  add("MOMENTUM","CCI",_cci(candles)>0?"bull":"bear");

  // VOLATILITY (cap 2)
  const bb=_bb(closes,20);
  add("VOLATILITY","BB Band",bb.above?"bull":"bear");
  const atr=_atr(candles,14),atrP=_atr(candles.slice(0,-1),14);
  add("VOLATILITY","ATR Exp",atr>atrP?"bull":"bear");

  // VOLUME (cap 3)
  const avgV=candles.slice(-20).reduce((a,c)=>a+(c.volume||1),0)/20;
  add("VOLUME","Vol Spike",(last.volume||1)>avgV*1.2?"bull":"neutral");
  const obv=_obv(candles),obvP=_obv(candles.slice(0,-1));
  add("VOLUME","OBV",obv>obvP?"bull":"bear");
  add("VOLUME","VWAP",last.close>_vwap(candles)?"bull":"bear");

  // SMC (cap 5)
  const bos=_bos(candles),choch=_choch(candles),ob=_ob(candles),fvg=_fvg(candles);
  add("SMC","BOS",bos||"neutral");
  add("SMC","CHOCH",choch||"neutral");
  add("SMC","OB",ob||"neutral");
  add("SMC","FVG",fvg||"neutral");
  const{highs,lows}=_swings(candles,4);
  if(highs.length>=2){const d=Math.abs(highs[highs.length-1].price-highs[highs.length-2].price)/highs[highs.length-1].price;add("SMC","Eq Highs",d<0.001?"bear":"neutral");}else add("SMC","Eq Highs","neutral");

  // PATTERNS (cap 2)
  const pat=_pat(candles);
  add("PATTERN","Candle",pat.bias);
  const pat2=candles.length>=5?_pat(candles.slice(0,-1)):null;
  add("PATTERN","Bonus",pat2&&pat2.bias!=="neutral"&&pat2.bias===pat.bias?pat.bias:"neutral");

  // CHART (cap 3)
  if(lows.length>=2){const ll=lows[lows.length-1].price,pl=lows[lows.length-2].price;add("CHART","Dbl Bottom",Math.abs(ll-pl)/pl<0.002&&last.close>Math.max(ll,pl)?"bull":"neutral");}else add("CHART","Dbl Bottom","neutral");
  if(highs.length>=2){const lh=highs[highs.length-1].price,ph=highs[highs.length-2].price;add("CHART","Dbl Top",Math.abs(lh-ph)/ph<0.002&&last.close<Math.min(lh,ph)?"bear":"neutral");}else add("CHART","Dbl Top","neutral");
  const r5=candles.slice(-5),r5H=Math.max(...r5.map(c=>c.high)),r5L=Math.min(...r5.map(c=>c.low));
  add("CHART","Flag",r5H-r5L<_atr(candles.slice(0,-5),14)*0.5?(e20>e50?"bull":e20<e50?"bear":"neutral"):"neutral");

  // MTF (cap 3)
  const htf=candles.filter((_,i)=>i%5===0),htfC=htf.map(c=>c.close);
  const he20=_ema(htfC,Math.min(20,htfC.length)),he50=_ema(htfC,Math.min(50,htfC.length));
  add("MTF","HTF EMA",htfC[htfC.length-1]>he20&&he20>he50?"bull":"bear");
  add("MTF","HTF RSI",_rsi(htfC)>50?"bull":"bear");
  add("MTF","HTF MACD",_macd(htfC).hist>0?"bull":"bear");

  // OSCILLATORS (cap 3)
  add("OSC","ADX",_adx(candles,14)>20?"bull":"neutral");
  add("OSC","MFI",_mfi(candles,14)>50?"bull":"bear");
  const wr14=candles.slice(-14);
  const wrH=Math.max(...wr14.map(c=>c.high)),wrL=Math.min(...wr14.map(c=>c.low));
  add("OSC","Williams%R",(wrH-last.close)/(wrH-wrL||0.001)*-100>-50?"bull":"bear");

  // Apply category caps
  const caps={TREND:5,MOMENTUM:4,VOLATILITY:2,VOLUME:3,SMC:5,PATTERN:2,CHART:3,MTF:3,OSC:3};
  const catB={},catBr={};
  checks.forEach(c=>{catB[c.cat]=(catB[c.cat]||0)+(c.bias==="bull"?1:0);catBr[c.cat]=(catBr[c.cat]||0)+(c.bias==="bear"?1:0);});
  let tB=0,tBr=0;
  Object.keys(caps).forEach(cat=>{tB+=Math.min(catB[cat]||0,caps[cat]);tBr+=Math.min(catBr[cat]||0,caps[cat]);});

  const vwap=_vwap(candles);
  return{
    bull:tB,bear:tBr,score:Math.max(tB,tBr),
    direction:tB>tBr?"RISE":"FALL",
    checks,
    details:{rsi:rsi.toFixed(1),macd:_macd(closes).hist>0?"BULL":"BEAR",stoch:_stoch(candles).toFixed(1),adx:_adx(candles,14).toFixed(1),vwap:vwap.toFixed(5),atr,ema20:e20,ema50:e50,ema200:e200,bos,choch,ob,fvg,pattern:pat.name,supertrend:_st(candles,10,3).bullish?"BULL":"BEAR",session:getSession()}
  };
}

function predict5(score,direction) {
  const isRise=direction==="RISE",str=score/30,decay=score>=21?0.07:0.09;
  return Array.from({length:5},(_,i)=>{
    const conf=Math.max(48,Math.round(str*100)-(i*decay*100));
    const rP=isRise?Math.round(conf):Math.round(100-conf);
    return{index:i+1,riseP:rP,fallP:100-rP,dir:rP>50?"RISE":"FALL"};
  });
}

function getTier(score){
  if(score<=10)return{label:"WAIT",color:"#64748b",fire:false};
  if(score<=15)return{label:"WEAK",color:"#f59e0b",fire:false};
  if(score<=20)return{label:"MODERATE",color:"#3b82f6",fire:true};
  if(score<=25)return{label:"STRONG",color:"#00e676",fire:true};
  return{label:"ELITE ULTRA",color:"#f5c842",fire:true};
}

async function generateDerivSignal(symbol,granularity,label) {
  derivShowLoading(true);
  try {
    const candles=await derivFetchClosedCandles(symbol,granularity);
    const sc=score30(candles);
    const tier=getTier(sc.score);
    const last=candles[candles.length-1];
    const atr=sc.details.atr,entry=last.close;
    const isRise=sc.direction==="RISE";
    const sl=isRise?entry-atr*1.5:entry+atr*1.5;
    const tp1=isRise?entry+atr*2:entry-atr*2;
    const tp2=isRise?entry+atr*4:entry-atr*4;
    const rr=Math.abs((tp1-entry)/(entry-sl||0.001)).toFixed(2);
    const dec=entry<10?5:entry<1000?2:1;
    const preds=predict5(sc.score,sc.direction);

    derivLastSignal={
      symbol,label,granularity,score:sc.score,tier,
      direction:sc.direction,bullScore:sc.bull,bearScore:sc.bear,
      details:sc.details,checks:sc.checks,predictions:preds,
      entry:entry.toFixed(dec),sl:sl.toFixed(dec),
      tp1:tp1.toFixed(dec),tp2:tp2.toFixed(dec),rr,
      session:getSession(),time:new Date().toLocaleTimeString(),
      fired:tier.fire,
    };

    derivRenderSignal(derivLastSignal);

    // 🔔 PLAY SOUND
    if (typeof playSignalSound === "function") {
      playSignalSound(sc.direction, tier.label);
    }

  } catch(e) { derivShowError(e.message); }
  finally { derivShowLoading(false); }
}

function derivRenderSignal(s) {
  const el=document.getElementById("deriv-signal-card");
  if(!el)return;
  const tc=s.tier.color,isRise=s.direction==="RISE",dc=isRise?"#00e676":"#ff3b5c";

  const clHtml=s.checks.map(c=>{
    const ic=c.bias==="bull"?"✅":c.bias==="bear"?"🔴":"⚪";
    const co=c.bias==="bull"?"#00e676":c.bias==="bear"?"#ff3b5c":"#64748b";
    return`<div class="d-check-row"><span class="d-cat">${c.cat}</span><span class="d-cname">${ic} ${c.name}</span><span style="color:${co};font-size:10px">${c.bias.toUpperCase()}</span></div>`;
  }).join("");

  const prHtml=s.predictions.map(p=>{
    const pc=p.dir==="RISE"?"#00e676":"#ff3b5c";
    return`<div class="d-pred-row"><span class="d-pred-label">C${p.index}</span><span class="d-pred-dir" style="color:${pc}">${p.dir}</span><div class="d-pred-bars"><div class="d-pred-bar-fill" style="width:${p.riseP}%;background:#00e676"></div></div><span class="d-pred-pct">${p.riseP}%↑ ${p.fallP}%↓</span></div>`;
  }).join("");

  el.style.borderColor=s.tier.label==="ELITE ULTRA"?"#f5c842":s.tier.color;
  el.innerHTML=`
    <div class="d-tier-badge" style="border-color:${tc};color:${tc}">${s.tier.label==="ELITE ULTRA"?"⚡ ELITE ULTRA ⚡":s.tier.label}</div>
    ${!s.fired?`<div class="d-no-trade">⛔ NO TRADE — Score ${s.score}/30 (need 16+)</div>`:`
    <div class="d-direction" style="color:${dc}">${s.direction}</div>
    <div class="d-score-row">
      <span>Score: <b style="color:${tc}">${s.score}/30</b></span>
      <span>Conf: <b style="color:${tc}">${Math.round((s.score/30)*100)}%</b></span>
      <span>${s.session}</span>
    </div>
    <div class="d-pair-row">
      <span style="font-family:var(--font-display);font-size:12px">${s.label}</span>
      <span id="deriv-live-price" style="color:var(--gold);font-weight:700;font-family:var(--font-display)">${s.entry}</span>
      <span style="font-size:10px;color:var(--muted)">${s.time}</span>
    </div>
    <div class="d-prob-row">
      <div class="d-prob-box bull"><span>RISE</span><b>${Math.round((s.bullScore/30)*100)}%</b></div>
      <div class="d-prob-box bear"><span>FALL</span><b>${Math.round((s.bearScore/30)*100)}%</b></div>
    </div>
    <div class="d-section-title">🕯 NEXT 5 CANDLE PREDICTION</div>
    <div class="d-predictions">${prHtml}</div>
    <div class="d-section-title">🎯 RISK MANAGEMENT</div>
    <div class="d-rm-grid">
      <div class="d-rm-row"><span>ENTRY</span><span style="color:#fff">${s.entry}</span></div>
      <div class="d-rm-row"><span>STOP LOSS</span><span style="color:#ff3b5c">${s.sl}</span></div>
      <div class="d-rm-row"><span>TP1</span><span style="color:#00e676">${s.tp1}</span></div>
      <div class="d-rm-row"><span>TP2</span><span style="color:#00ff88">${s.tp2}</span></div>
      <div class="d-rm-row"><span>R:R</span><span style="color:#f5c842">1 : ${s.rr}</span></div>
    </div>
    <a href="https://dtrader.deriv.com" target="_blank" class="d-cta-btn">📈 OPEN TRADE ON DERIV</a>
    `}
    <div class="d-section-title">📋 30-POINT CONFLUENCE (${s.score}/30)</div>
    <div class="d-checklist">${clHtml}</div>
    <div class="d-section-title">📊 READINGS</div>
    <div class="d-rm-grid">
      <div class="d-rm-row"><span>RSI</span><span>${s.details.rsi}</span></div>
      <div class="d-rm-row"><span>MACD</span><span style="color:${s.details.macd==="BULL"?"#00e676":"#ff3b5c"}">${s.details.macd}</span></div>
      <div class="d-rm-row"><span>STOCH</span><span>${s.details.stoch}</span></div>
      <div class="d-rm-row"><span>ADX</span><span>${s.details.adx}</span></div>
      <div class="d-rm-row"><span>SUPERTREND</span><span style="color:${s.details.supertrend==="BULL"?"#00e676":"#ff3b5c"}">${s.details.supertrend}</span></div>
      <div class="d-rm-row"><span>BOS</span><span>${s.details.bos||"none"}</span></div>
      <div class="d-rm-row"><span>CHOCH</span><span>${s.details.choch||"none"}</span></div>
      <div class="d-rm-row"><span>ORDER BLOCK</span><span>${s.details.ob||"none"}</span></div>
      <div class="d-rm-row"><span>FVG</span><span>${s.details.fvg||"none"}</span></div>
      <div class="d-rm-row"><span>PATTERN</span><span style="color:#f5c842">${s.details.pattern}</span></div>
      <div class="d-rm-row"><span>SESSION</span><span style="color:#f5c842">${s.details.session}</span></div>
    </div>
  `;
}

function derivShowLoading(s){const b=document.getElementById("deriv-btn-signal");if(!b)return;b.disabled=s;b.textContent=s?"⏳ SCANNING 30 MODULES...":"⚡ GET SIGNAL";}
function derivShowError(msg){const e=document.getElementById("deriv-signal-card");if(e)e.innerHTML=`<div style="color:#ff3b5c;padding:20px;font-family:monospace;font-size:12px">❌ ${msg}</div>`;derivShowLoading(false);}

function derivToggleAuto(){
  const btn=document.getElementById("deriv-btn-auto");
  derivIsAuto=!derivIsAuto;
  if(derivIsAuto){
    btn.textContent="⏹ STOP AUTO";btn.classList.add("active");
    generateDerivSignal(derivSymbol,derivTF,derivLabel);
    derivAutoTimer=setInterval(()=>generateDerivSignal(derivSymbol,derivTF,derivLabel),derivTF*1000);
  }else{
    btn.textContent="🔄 AUTO SCAN";btn.classList.remove("active");
    clearInterval(derivAutoTimer);
  }
}

function derivInitUI(){
  const pg=document.getElementById("deriv-pair-grid");
  if(pg){pg.innerHTML="";DERIV_PAIRS.forEach(p=>{const b=document.createElement("button");b.className="deriv-pair-btn"+(p.symbol===derivSymbol?" active":"");b.textContent=p.label;b.title=p.name;b.onclick=()=>{derivSymbol=p.symbol;derivLabel=p.label;document.querySelectorAll(".deriv-pair-btn").forEach(x=>x.classList.remove("active"));b.classList.add("active");derivStartLiveChart();};pg.appendChild(b);});}

  const tg=document.getElementById("deriv-tf-grid");
  if(tg){tg.innerHTML="";DERIV_TIMEFRAMES.forEach(t=>{const b=document.createElement("button");b.className="deriv-tf-btn"+(t.value===derivTF?" active":"");b.textContent=t.label;b.onclick=()=>{derivTF=t.value;document.querySelectorAll(".deriv-tf-btn").forEach(x=>x.classList.remove("active"));b.classList.add("active");derivStartLiveChart();};tg.appendChild(b);});}

  const sb=document.getElementById("deriv-btn-signal");
  if(sb){sb.onclick=()=>generateDerivSignal(derivSymbol,derivTF,derivLabel);}

  const ab=document.getElementById("deriv-btn-auto");
  if(ab){ab.onclick=derivToggleAuto;}

  // Start live chart immediately
  derivConnect().then(()=>derivStartLiveChart());

  window.addEventListener("resize",()=>{if(derivCandles.length)derivRedrawChart();});
}

// ── OVERRIDE: update new toolbar price display ──
const _origUpdatePrice = derivUpdatePriceDisplay;
derivUpdatePriceDisplay = function(price) {
  // Throttle
  if (derivTickThrottle) return;
  derivTickThrottle = setTimeout(() => {
    derivTickThrottle = null;
    const dec = price < 10 ? 5 : price < 1000 ? 2 : 1;
    const priceStr = price.toFixed(dec);

    // Update both header price and signal card price
    const h1 = document.getElementById("deriv-live-price-header");
    const h2 = document.getElementById("deriv-live-price");
    if (h1) h1.textContent = priceStr;
    if (h2) h2.textContent = priceStr;

    // Track price change
    if (derivLastSignal) {
      const entry = parseFloat(derivLastSignal.entry);
      const diff  = price - entry;
      const pct   = ((diff / entry) * 100).toFixed(3);
      const el    = document.getElementById("deriv-price-change");
      if (el) {
        el.textContent = (diff >= 0 ? "+" : "") + diff.toFixed(dec) + " (" + pct + "%)";
        el.style.color = diff >= 0 ? "#00e676" : "#ff3b5c";
      }
    }
  }, 500);
};

// ── OVERRIDE: update status dot ──
const _origSetStatus2 = derivSetStatus;
derivSetStatus = function(text, live = false) {
  const el  = document.getElementById("deriv-status");
  const dot = document.getElementById("deriv-dot");
  if (el) {
    el.textContent = text;
    live ? el.classList.add("live") : el.classList.remove("live");
  }
  if (dot) {
    live ? dot.classList.add("live") : dot.classList.remove("live");
  }
};

// ── FULLSCREEN TOGGLE ──
function derivToggleFullscreen() {
  const outer = document.querySelector(".deriv-chart-outer");
  if (!outer) return;
  outer.classList.toggle("fullscreen");
  const btn = document.querySelector(".deriv-chart-fullscreen");
  if (btn) btn.textContent = outer.classList.contains("fullscreen") ? "✕ EXIT" : "⛶ FULL";
}

// ── INJECT FULLSCREEN BUTTON ──
function derivAddFullscreenBtn() {
  const container = document.getElementById("deriv-chart-container");
  if (!container || container.querySelector(".deriv-chart-fullscreen")) return;
  const btn = document.createElement("button");
  btn.className   = "deriv-chart-fullscreen";
  btn.textContent = "⛶ FULL";
  btn.onclick     = derivToggleFullscreen;
  container.style.position = "relative";
  container.appendChild(btn);
}

// ── OVERRIDE derivInitUI to use new chart loader ──
const _origDerivInitUI = derivInitUI;
derivInitUI = function() {
  _origDerivInitUI();

  // Update pair label in toolbar
  const pairLabel = document.getElementById("deriv-chart-pair");
  if (pairLabel) pairLabel.textContent = derivLabel;

  // Add fullscreen button
  derivAddFullscreenBtn();

  // Load TradingView chart for default pair
  if (typeof loadDerivChart === "function") {
    loadDerivChart(derivSymbol, derivTF);
  }
};

// ── PATCH: reload chart when pair or TF changes ──
const _origPairButtons = document.querySelectorAll;
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("deriv-pair-btn")) {
    const label = document.getElementById("deriv-chart-pair");
    if (label) label.textContent = e.target.textContent;
    setTimeout(() => {
      if (typeof loadDerivChart === "function") {
        loadDerivChart(derivSymbol, derivTF);
      }
    }, 100);
  }
  if (e.target.classList.contains("deriv-tf-btn")) {
    setTimeout(() => {
      if (typeof loadDerivChart === "function") {
        loadDerivChart(derivSymbol, derivTF);
      }
    }, 100);
  }
});

// ── PATCH: feed canvas chart with live data ──

const _origHandleMsg = derivHandleMessage;
derivHandleMessage = function(data) {
  _origHandleMsg(data);

  // Feed live candle to canvas chart
  if (data.ohlc) {
    const c = data.ohlc;
    const lc = {
      open:   parseFloat(c.open),
      high:   parseFloat(c.high),
      low:    parseFloat(c.low),
      close:  parseFloat(c.close),
      epoch:  c.open_time,
      volume: 1,
    };
    if (typeof dcUpdateLiveCandle === "function") dcUpdateLiveCandle(lc);
  }

  // Feed tick price
  if (data.tick) {
    if (typeof dcUpdatePrice === "function") dcUpdatePrice(parseFloat(data.tick.quote));
  }
};

// Feed closed candles when history loads
const _origStartLive = derivStartLiveChart;
derivStartLiveChart = async function() {
  await _origStartLive();
  // After candles loaded, feed to canvas
  if (typeof dcUpdateCandles === "function" && derivCandles.length) {
    dcUpdateCandles(derivCandles);
  }
};

// Feed signal to chart for SL/TP lines
const _origGenSignal = generateDerivSignal;
generateDerivSignal = async function(symbol, granularity, label) {
  await _origGenSignal(symbol, granularity, label);
  if (typeof dcUpdateSignal === "function" && derivLastSignal) {
    dcUpdateSignal(derivLastSignal);
    // Also refresh candles
    if (typeof dcUpdateCandles === "function" && derivCandles.length) {
      dcUpdateCandles(derivCandles);
    }
  }
};

// Init chart when tab opens
const _origDerivInitUI2 = derivInitUI;
derivInitUI = function() {
  _origDerivInitUI2();
  if (typeof loadDerivChart === "function") {
    loadDerivChart(derivSymbol, derivTF);
  }
};

// ============================================
// GEMINI AI INTEGRATION FOR DERIV TAB
// ============================================

async function generateDerivSignalWithAI(symbol, granularity, label) {
  derivShowLoading(true);
  const btn = document.getElementById("deriv-btn-signal");
  if (btn) btn.textContent = "🤖 AI ANALYSING...";

  try {
    // Step 1: Fetch closed candles
    const candles = await derivFetchClosedCandles(symbol, granularity);
    const sc = score30(candles);
    const tier = getTier(sc.score);
    const last = candles[candles.length - 1];
    const atr  = sc.details.atr;
    const entry= last.close;
    const dec  = entry < 10 ? 5 : entry < 1000 ? 2 : 0;

    // Step 2: Send to Gemini AI
    if (btn) btn.textContent = "🤖 GEMINI THINKING...";
    const ai = await geminiDerivAnalyse(label, candles, sc);

    let direction, confidence, reasoning, keyFactors, warning,
        preds, entryQuality, risk, aiPowered;

    if (ai) {
      // ✅ Use Gemini AI decision
      direction    = ai.direction;
      confidence   = ai.confidence;
      reasoning    = ai.reasoning;
      keyFactors   = ai.keyFactors || [];
      warning      = ai.warning || "";
      entryQuality = ai.entryQuality;
      risk         = ai.risk;
      aiPowered    = true;
      preds = [
        { index:1, riseP: ai.c1.prob, fallP: 100-ai.c1.prob, dir: ai.c1.dir },
        { index:2, riseP: ai.c2.prob, fallP: 100-ai.c2.prob, dir: ai.c2.dir },
        { index:3, riseP: ai.c3.prob, fallP: 100-ai.c3.prob, dir: ai.c3.dir },
        { index:4, riseP: ai.c4.prob, fallP: 100-ai.c4.prob, dir: ai.c4.dir },
        { index:5, riseP: ai.c5.prob, fallP: 100-ai.c5.prob, dir: ai.c5.dir },
      ];
      tier.fire = direction !== "WAIT" && confidence >= 55;
    } else {
      // ❌ Fallback to rules
      direction    = sc.direction;
      confidence   = Math.round((sc.score/30)*100);
      reasoning    = "AI unavailable — indicator rule analysis used.";
      keyFactors   = [`RSI: ${sc.details.rsi}`, `MACD: ${sc.details.macd}`, `EMA: ${sc.details.supertrend}`];
      warning      = "⚠ Gemini AI unavailable — lower accuracy";
      entryQuality = "FAIR";
      risk         = "MEDIUM";
      aiPowered    = false;
      preds        = predict5(sc.score, sc.direction);
    }

    const isRise = direction === "RISE";
    const sl  = isRise ? entry - atr*1.5 : entry + atr*1.5;
    const tp1 = isRise ? entry + atr*2   : entry - atr*2;
    const tp2 = isRise ? entry + atr*4   : entry - atr*4;
    const rr  = Math.abs((tp1-entry)/(entry-sl||0.001)).toFixed(2);

    derivLastSignal = {
      symbol, label, granularity,
      score: sc.score, tier,
      direction, confidence,
      bullScore: sc.bull, bearScore: sc.bear,
      details: sc.details, checks: sc.checks,
      predictions: preds,
      reasoning, keyFactors, warning,
      entryQuality, risk, aiPowered,
      entry: entry.toFixed(dec),
      sl: sl.toFixed(dec),
      tp1: tp1.toFixed(dec),
      tp2: tp2.toFixed(dec), rr,
      session: getSession(),
      time: new Date().toLocaleTimeString(),
      fired: tier.fire && direction !== "WAIT",
    };

    derivRenderSignalAI(derivLastSignal);

    if (typeof playSignalSound === "function" && derivLastSignal.fired)
      playSignalSound(direction, tier.label);

  } catch(e) { derivShowError(e.message); }
  finally { derivShowLoading(false); }
}

// ── RENDER WITH AI RESULT ────────────────────

function derivRenderSignalAI(s) {
  const el = document.getElementById("deriv-signal-card");
  if (!el) return;
  const tc = s.tier.color;
  const dc = s.direction === "RISE" ? "#00e676" : "#ff3b5c";

  const aiTag = s.aiPowered
    ? `<span style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.4);color:#a78bfa;font-family:var(--font-display);font-size:9px;padding:3px 10px;border-radius:20px;letter-spacing:1px;margin-left:8px">🤖 GEMINI AI</span>`
    : `<span style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);color:#f59e0b;font-family:var(--font-display);font-size:9px;padding:3px 10px;border-radius:20px;letter-spacing:1px;margin-left:8px">📊 RULES</span>`;

  const predHtml = s.predictions.map(p => {
    const clr = p.dir === "RISE" ? "#00e676" : p.dir === "DOJI" ? "#f5c842" : "#ff3b5c";
    const rP  = p.dir === "DOJI" ? 50 : p.riseP;
    return `<div class="d-pred-row">
      <span class="d-pred-label">C${p.index}</span>
      <span class="d-pred-dir" style="color:${clr}">${p.dir}${p.index===5?" ⚠️":""}</span>
      <div class="d-pred-bars"><div class="d-pred-bar-fill" style="width:${rP}%;background:${clr}"></div></div>
      <span class="d-pred-pct" style="color:${clr}">${rP}% ${p.dir==="RISE"?"↑":"↓"}</span>
    </div>`;
  }).join("");

  const keyHtml = (s.keyFactors||[]).map(f =>
    `<div style="padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:11px;color:var(--text)">✦ ${f}</div>`
  ).join("");

  const chkHtml = (s.checks||[]).map(c => {
    const ic  = c.bias==="bull"?"✅":c.bias==="bear"?"🔴":"⚪";
    const col = c.bias==="bull"?"#00e676":c.bias==="bear"?"#ff3b5c":"#64748b";
    return `<div class="d-check-row">
      <span class="d-cat">${c.cat}</span>
      <span class="d-cname">${ic} ${c.name}</span>
      <span style="color:${col};font-size:10px;text-align:right">${c.bias.toUpperCase()}</span>
    </div>`;
  }).join("");

  el.style.borderColor = s.tier.label === "ELITE ULTRA" ? "#f5c842" : s.tier.color;
  el.innerHTML = `
    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:12px">
      <div class="d-tier-badge" style="border-color:${tc};color:${tc}">${s.tier.label==="ELITE ULTRA"?"⚡ ELITE ULTRA ⚡":s.tier.label}</div>
      ${aiTag}
    </div>

    ${!s.fired ? `
      <div class="d-no-trade">⛔ ${s.direction==="WAIT"?"WAIT — Gemini says insufficient setup":"NO TRADE"}<br>
      <small style="color:#64748b">Confidence: ${s.confidence}% · Score: ${s.score}/30</small></div>
      ${s.reasoning?`<div style="background:rgba(100,116,139,0.1);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:11px;color:#94a3b8;line-height:1.6;margin-top:8px">🤖 ${s.reasoning}</div>`:""}
    ` : `
      <div class="d-direction" style="color:${dc}">${s.direction}</div>
      <div class="d-score-row">
        <span>Score: <b style="color:${tc}">${s.score}/30</b></span>
        <span>AI Conf: <b style="color:${tc}">${s.confidence}%</b></span>
        <span>${s.session}</span>
      </div>

      <div style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.25);border-radius:10px;padding:14px;margin-bottom:14px">
        <div style="font-family:var(--font-display);font-size:9px;color:#a78bfa;letter-spacing:1px;margin-bottom:8px">🤖 GEMINI AI REASONING</div>
        <div style="font-size:12px;color:#e2e8f0;line-height:1.6">${s.reasoning}</div>
      </div>

      ${keyHtml ? `<div style="margin-bottom:12px"><div style="font-family:var(--font-display);font-size:9px;color:#f5c842;letter-spacing:1px;margin-bottom:6px">✦ KEY FACTORS</div>${keyHtml}</div>` : ""}

      ${s.warning ? `<div style="padding:10px 12px;background:rgba(245,158,11,0.08);border-left:2px solid #f59e0b;font-size:10px;color:#f59e0b;margin-bottom:12px;font-family:var(--font-display);border-radius:4px">${s.warning}</div>` : ""}

      <div class="d-prob-row">
        <div class="d-prob-box bull"><span>RISE</span><b style="color:#00e676">${s.direction==="RISE"?s.confidence:100-s.confidence}%</b></div>
        <div class="d-prob-box bear"><span>FALL</span><b style="color:#ff3b5c">${s.direction==="FALL"?s.confidence:100-s.confidence}%</b></div>
      </div>
    `}

    <div class="d-section-title">🕯 NEXT 5 CANDLE PREDICTION</div>
    <div class="d-predictions">${predHtml}</div>

    ${s.fired ? `
    <div class="d-section-title">🎯 RISK MANAGEMENT</div>
    <div class="d-rm-grid">
      <div class="d-rm-row"><span class="s-label">ENTRY</span><span style="color:#fff;font-weight:700">${s.entry}</span></div>
      <div class="d-rm-row"><span class="s-label">STOP LOSS</span><span style="color:#ff3b5c">${s.sl}</span></div>
      <div class="d-rm-row"><span class="s-label">TP1</span><span style="color:#00e676">${s.tp1}</span></div>
      <div class="d-rm-row"><span class="s-label">TP2</span><span style="color:#00ff88">${s.tp2}</span></div>
      <div class="d-rm-row"><span class="s-label">R:R</span><span style="color:#f5c842">1 : ${s.rr}</span></div>
      <div class="d-rm-row"><span class="s-label">ENTRY QUALITY</span><span style="color:${s.entryQuality==="EXCELLENT"||s.entryQuality==="GOOD"?"#00e676":"#f59e0b"}">${s.entryQuality}</span></div>
      <div class="d-rm-row"><span class="s-label">RISK</span><span style="color:${s.risk==="LOW"?"#00e676":s.risk==="HIGH"?"#ff3b5c":"#f5c842"}">${s.risk}</span></div>
    </div>
    <a href="https://dtrader.deriv.com" target="_blank" class="d-cta-btn">📈 OPEN TRADE ON DERIV</a>
    ` : ""}

    <div class="d-section-title">📋 30-POINT CONFLUENCE (${s.score}/30)</div>
    <div class="d-checklist">${chkHtml}</div>
    <div class="d-section-title">📊 READINGS</div>
    <div class="d-rm-grid">
      <div class="d-rm-row"><span class="s-label">RSI</span><span>${s.details.rsi}</span></div>
      <div class="d-rm-row"><span class="s-label">MACD</span><span style="color:${s.details.macd==="BULL"?"#00e676":"#ff3b5c"}">${s.details.macd}</span></div>
      <div class="d-rm-row"><span class="s-label">SUPERTREND</span><span style="color:${s.details.supertrend==="BULL"?"#00e676":"#ff3b5c"}">${s.details.supertrend}</span></div>
      <div class="d-rm-row"><span class="s-label">BOS</span><span>${s.details.bos||"none"}</span></div>
      <div class="d-rm-row"><span class="s-label">CHOCH</span><span>${s.details.choch||"none"}</span></div>
      <div class="d-rm-row"><span class="s-label">PATTERN</span><span style="color:#f5c842">${s.details.pattern}</span></div>
      <div class="d-rm-row"><span class="s-label">SESSION</span><span style="color:#f5c842">${s.session}</span></div>
    </div>
  `;
}

// Hook into existing button — replace old signal with AI version
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("deriv-btn-signal");
  if (btn) {
    btn.onclick = () => generateDerivSignalWithAI(derivSymbol, derivTF, derivLabel);
  }
  const auto = document.getElementById("deriv-btn-auto");
  if (auto) {
    const _orig = auto.onclick;
    auto.onclick = () => {
      const btn2 = document.getElementById("deriv-btn-auto");
      derivIsAuto = !derivIsAuto;
      if (derivIsAuto) {
        btn2.textContent = "⏹ STOP AUTO SCAN";
        btn2.classList.add("active");
        generateDerivSignalWithAI(derivSymbol, derivTF, derivLabel);
        derivAutoTimer = setInterval(
          () => generateDerivSignalWithAI(derivSymbol, derivTF, derivLabel),
          derivTF * 1000
        );
      } else {
        btn2.textContent = "🔄 AUTO SCAN";
        btn2.classList.remove("active");
        clearInterval(derivAutoTimer);
      }
    };
  }
});
