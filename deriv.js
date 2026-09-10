// ============================================
// PRINCEX EMPERE — Deriv Tab v3
// New Deriv API: OTP WebSocket + Real Data
// Account: DOT90004580
// ============================================

const DERIV_API_BASE = "https://api.derivws.com";
const DERIV_ACCOUNT  = "DOT90004580";
const DERIV_PUBLIC_WS = "wss://api.derivws.com/trading/v1/options/ws/public";

const DERIV_PAIRS = [
  { symbol:"R_10",    label:"V10",   name:"Volatility 10 Index" },
  { symbol:"R_25",    label:"V25",   name:"Volatility 25 Index" },
  { symbol:"R_50",    label:"V50",   name:"Volatility 50 Index" },
  { symbol:"R_75",    label:"V75",   name:"Volatility 75 Index" },
  { symbol:"R_100",   label:"V100",  name:"Volatility 100 Index" },
  { symbol:"1HZ10V",  label:"V10s",  name:"Volatility 10 (1s) Index" },
  { symbol:"1HZ25V",  label:"V25s",  name:"Volatility 25 (1s) Index" },
  { symbol:"1HZ50V",  label:"V50s",  name:"Volatility 50 (1s) Index" },
  { symbol:"1HZ75V",  label:"V75s",  name:"Volatility 75 (1s) Index" },
  { symbol:"1HZ100V", label:"V100s", name:"Volatility 100 (1s) Index" },
];

const DERIV_TIMEFRAMES = [
  { label:"1M",  value:60    },
  { label:"5M",  value:300   },
  { label:"15M", value:900   },
  { label:"1H",  value:3600  },
  { label:"4H",  value:14400 },
];

// State
let derivWS          = null;
let derivCandles     = [];
let derivLiveCandle  = null;
let derivSymbol      = "1HZ50V";
let derivTF          = 60;
let derivLabel       = "V50s";
let derivLastSignal  = null;
let derivAutoTimer   = null;
let derivIsAuto      = false;
let derivTickId      = null;
let derivCandleId    = null;
let derivTickThrottle= null;
let derivChartTimer  = null;
let derivConnecting  = false;
let derivReconnTimer = null;
let derivAuthToken   = null; // set after OAuth login

// ── STATUS ────────────────────────────────────

function derivSetStatus(text, live = false) {
  const el  = document.getElementById("deriv-status");
  const dot = document.getElementById("deriv-dot");
  if (el)  el.textContent = text;
  if (dot) live ? dot.classList.add("live") : dot.classList.remove("live");
}

// ── WEBSOCKET CONNECTION ──────────────────────

async function derivConnect() {
  if (derivConnecting) return;
  if (derivWS?.readyState === WebSocket.OPEN) return;
  derivConnecting = true;
  derivSetStatus("CONNECTING...");

  try {
    let wsUrl = DERIV_PUBLIC_WS;

    // If user is logged in with Deriv OAuth, get authenticated WS
    if (derivAuthToken) {
      try {
        const otp = await derivGetOTP();
        if (otp) wsUrl = otp;
      } catch(e) {
        console.warn("OTP failed, using public WS:", e.message);
      }
    }

    derivWS = new WebSocket(wsUrl);

    derivWS.onopen = () => {
      derivConnecting = false;
      derivSetStatus("LIVE", true);
      derivSubscribeAll();
    };

    derivWS.onmessage = e => derivHandleMessage(JSON.parse(e.data));

    derivWS.onerror = () => {
      derivConnecting = false;
      derivSetStatus("ERROR");
    };

    derivWS.onclose = () => {
      derivConnecting = false;
      derivSetStatus("RECONNECTING...");
      clearTimeout(derivReconnTimer);
      derivReconnTimer = setTimeout(derivConnect, 3000);
    };

  } catch(e) {
    derivConnecting = false;
    derivSetStatus("ERROR: " + e.message);
    setTimeout(derivConnect, 5000);
  }
}

// ── GET OTP FOR AUTHENTICATED WS ─────────────

async function derivGetOTP() {
  if (!derivAuthToken) return null;
  const res = await fetch(`${DERIV_API_BASE}/trading/v1/options/accounts/${DERIV_ACCOUNT}/otp`, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + derivAuthToken,
      "Content-Type":  "application/json",
    }
  });
  if (!res.ok) throw new Error("OTP request failed: " + res.status);
  const data = await res.json();
  return data.data?.url || null;
}

// ── SEND TO WS ────────────────────────────────

function derivSend(payload) {
  if (derivWS?.readyState === WebSocket.OPEN) {
    derivWS.send(JSON.stringify(payload));
  }
}

// ── SUBSCRIBE ─────────────────────────────────

function derivSubscribeAll() {
  derivForgetAll();

  // Subscribe candle history (for indicators + chart)
  derivSend({
    ticks_history:    derivSymbol,
    adjust_start_time: 1,
    count:            500,
    end:              "latest",
    granularity:      derivTF,
    style:            "candles",
    subscribe:        1,
  });

  // Subscribe live ticks (for price display only)
  derivSend({ ticks: derivSymbol, subscribe: 1 });
}

function derivForgetAll() {
  if (derivTickId)   { derivSend({ forget: derivTickId });   derivTickId   = null; }
  if (derivCandleId) { derivSend({ forget: derivCandleId }); derivCandleId = null; }
  derivCandles    = [];
  derivLiveCandle = null;
}

// ── MESSAGE HANDLER ───────────────────────────

function derivHandleMessage(data) {
  if (data.error) {
    console.warn("Deriv WS error:", data.error.message);
    derivSetStatus("ERR: " + data.error.message);
    return;
  }

  // Live tick — price display only (throttled 500ms)
  if (data.msg_type === "tick" && data.tick) {
    derivTickId = data.subscription?.id;
    if (!derivTickThrottle) {
      derivTickThrottle = setTimeout(() => {
        derivTickThrottle = null;
        const price = parseFloat(data.tick.quote);
        const dec   = price < 10 ? 5 : price < 1000 ? 2 : 1;
        const h1    = document.getElementById("deriv-live-price-header");
        const h2    = document.getElementById("deriv-live-price");
        if (h1) h1.textContent = price.toFixed(dec);
        if (h2) h2.textContent = price.toFixed(dec);
        if (typeof dcUpdatePrice === "function") dcUpdatePrice(price);
      }, 500);
    }
    return;
  }

  // Candle history (initial load)
  if (data.msg_type === "candles" && data.candles) {
    derivCandleId = data.subscription?.id;
    const raw = data.candles;
    // Exclude last (currently forming)
    derivCandles    = raw.slice(0, -1).map(derivMapCandle);
    derivLiveCandle = { ...derivMapCandle(raw[raw.length - 1]), _live: true };
    if (typeof dcUpdateCandles === "function") dcUpdateCandles(derivCandles);
    if (typeof dcUpdateLiveCandle === "function") dcUpdateLiveCandle(derivLiveCandle);
    derivSetStatus("LIVE", true);
    return;
  }

  // Live OHLC candle update
  if (data.msg_type === "ohlc" && data.ohlc) {
    const c  = data.ohlc;
    const nc = {
      open:  parseFloat(c.open),
      high:  parseFloat(c.high),
      low:   parseFloat(c.low),
      close: parseFloat(c.close),
      epoch: parseInt(c.open_time),
      volume: 1,
      _live: true,
    };
    // New candle? Push old live as closed
    if (derivLiveCandle && nc.epoch > derivLiveCandle.epoch) {
      const closed = { ...derivLiveCandle }; delete closed._live;
      derivCandles.push(closed);
      if (derivCandles.length > 600) derivCandles.shift();
      if (typeof dcUpdateCandles === "function") dcUpdateCandles(derivCandles);
    }
    derivLiveCandle = nc;
    if (typeof dcUpdateLiveCandle === "function") dcUpdateLiveCandle(nc);
    return;
  }
}

function derivMapCandle(c) {
  return {
    open:   parseFloat(c.open),
    high:   parseFloat(c.high),
    low:    parseFloat(c.low),
    close:  parseFloat(c.close),
    epoch:  parseInt(c.open_time || c.epoch || 0),
    volume: 1,
  };
}

// ── FETCH CLOSED CANDLES FOR SIGNAL ──────────

async function derivFetchClosedCandles(symbol, granularity) {
  return new Promise((resolve, reject) => {
    if (!derivWS || derivWS.readyState !== WebSocket.OPEN) {
      reject(new Error("WebSocket not connected")); return;
    }
    const reqId = Math.floor(Math.random() * 99999);
    const handler = e => {
      const data = JSON.parse(e.data);
      if (data.req_id !== reqId) return;
      derivWS.removeEventListener("message", handler);
      if (data.error) { reject(new Error(data.error.message)); return; }
      if (data.candles) {
        // Exclude last (forming)
        resolve(data.candles.slice(0, -1).map(derivMapCandle));
      } else reject(new Error("No candle data"));
    };
    derivWS.addEventListener("message", handler);
    derivSend({
      ticks_history:    symbol,
      adjust_start_time: 1,
      count:            500,
      end:              "latest",
      granularity,
      style:            "candles",
      req_id:           reqId,
    });
    setTimeout(() => {
      derivWS.removeEventListener("message", handler);
      reject(new Error("Timeout fetching candles"));
    }, 15000);
  });
}

// ── SESSION ───────────────────────────────────

function getSession() {
  const h = new Date().getUTCHours();
  if (h >= 0  && h < 8)  return "🌏 ASIA";
  if (h >= 8  && h < 13) return "🇬🇧 LONDON";
  if (h >= 13 && h < 21) return "🇺🇸 NEW YORK";
  return "🌙 OFF HOURS";
}

// ── SCORING (30-point) ────────────────────────

function _ema(arr,p){if(arr.length<p)return arr[arr.length-1]||0;const k=2/(p+1);let e=arr.slice(0,p).reduce((a,b)=>a+b,0)/p;for(let i=p;i<arr.length;i++)e=arr[i]*k+e*(1-k);return e;}
function _rsi(cl,p=14){if(cl.length<p+1)return 50;let g=0,l=0;for(let i=cl.length-p;i<cl.length;i++){const d=cl[i]-cl[i-1];d>0?g+=d:l+=Math.abs(d);}const ag=g/p,al=l/p;return al===0?100:ag===0?0:100-(100/(1+ag/al));}
function _macd(cl){if(cl.length<35)return{hist:0,crossUp:false,crossDown:false};const s=[];for(let i=26;i<=cl.length;i++){const sl=cl.slice(0,i);s.push(_ema(sl,12)-_ema(sl,26));}const line=s[s.length-1],sig=_ema(s,9);const pl=s.length>1?s[s.length-2]:line,ps=s.length>9?_ema(s.slice(0,-1),9):sig;return{hist:line-sig,crossUp:pl<=ps&&line>sig,crossDown:pl>=ps&&line<sig};}
function _atr(cn,p=14){if(cn.length<p+1)return(cn[cn.length-1].high-cn[cn.length-1].low)||0.001;let t=[];for(let i=cn.length-p;i<cn.length;i++){const c=cn[i],pv=cn[i-1];t.push(Math.max(c.high-c.low,Math.abs(c.high-pv.close),Math.abs(c.low-pv.close)));}return t.reduce((a,b)=>a+b,0)/p;}
function _st(cn,al=10,m=3){const atr=_atr(cn,al);let tr="up",st=cn[Math.max(0,cn.length-30)].close;cn.slice(-30).forEach((c,i,a)=>{if(i===0)return;const hl2=(c.high+c.low)/2,bU=hl2+m*atr,bL=hl2-m*atr;if(c.close>st)tr="up";else if(c.close<st)tr="down";st=tr==="up"?Math.max(bL,st):Math.min(bU,st);});return{bullish:cn[cn.length-1].close>st,val:st};}
function _vwap(cn){let pv=0,v=0;cn.forEach(c=>{pv+=(c.high+c.low+c.close)/3;v++;});return v?pv/v:cn[cn.length-1].close;}
function _stoch(cn,k=14){const sl=cn.slice(-k),hi=Math.max(...sl.map(c=>c.high)),lo=Math.min(...sl.map(c=>c.low)),last=cn[cn.length-1].close;return hi===lo?50:((last-lo)/(hi-lo))*100;}
function _adx(cn,p=14){if(cn.length<p+2)return 20;let pd=0,md=0,tr=0;for(let i=cn.length-p;i<cn.length;i++){const c=cn[i],pv=cn[i-1],up=c.high-pv.high,dn=pv.low-c.low;if(up>dn&&up>0)pd+=up;else if(dn>up&&dn>0)md+=dn;tr+=Math.max(c.high-c.low,Math.abs(c.high-pv.close),Math.abs(c.low-pv.close));}if(!tr)return 20;const pDI=100*pd/tr,mDI=100*md/tr;return(pDI+mDI)===0?0:100*Math.abs(pDI-mDI)/(pDI+mDI);}
function _obv(cn){let o=0;for(let i=1;i<cn.length;i++){if(cn[i].close>cn[i-1].close)o++;else if(cn[i].close<cn[i-1].close)o--;}return o;}
function _bb(cl,p=20){const sl=cl.slice(-p),avg=sl.reduce((a,b)=>a+b,0)/p,std=Math.sqrt(sl.reduce((s,v)=>s+Math.pow(v-avg,2),0)/p);return{upper:avg+2*std,mid:avg,lower:avg-2*std};}
function _swings(cn,lb=4){const h=[],l=[];for(let i=lb;i<cn.length-lb;i++){const w=cn.slice(i-lb,i+lb+1);if(cn[i].high===Math.max(...w.map(x=>x.high)))h.push({i,p:cn[i].high});if(cn[i].low===Math.min(...w.map(x=>x.low)))l.push({i,p:cn[i].low});}return{h,l};}
function _bos(cn){const{h,l}=_swings(cn,4);if(h.length<2||l.length<2)return null;const last=cn[cn.length-1].close;if(last>h[h.length-2].p)return"bullish";if(last<l[l.length-2].p)return"bearish";return null;}
function _choch(cn){const{h,l}=_swings(cn,4);if(h.length<2||l.length<2)return null;const lh=h[h.length-1].p,ph=h[h.length-2].p,ll=l[l.length-1].p,pl=l[l.length-2].p;if(lh>ph&&ll>pl)return"bullish";if(lh<ph&&ll<pl)return"bearish";return null;}
function _ob(cn){const s=cn.slice(-10);for(let i=s.length-2;i>=1;i--){const c=s[i],n=s[i+1],b=Math.abs(c.close-c.open),nb=Math.abs(n.close-n.open);if(nb>b*1.5){if(c.close<c.open&&n.close>n.open)return"bullish";if(c.close>c.open&&n.close<n.open)return"bearish";}}return null;}
function _fvg(cn){const s=cn.slice(-5);for(let i=1;i<s.length-1;i++){const p=s[i-1],n=s[i+1];if(n.low>p.high)return"bullish";if(n.high<p.low)return"bearish";}return null;}
function _pat(cn){const c=cn[cn.length-1],p=cn[cn.length-2],pp=cn[cn.length-3],body=Math.abs(c.close-c.open),range=c.high-c.low||0.001,upW=c.high-Math.max(c.open,c.close),dnW=Math.min(c.open,c.close)-c.low,bull=c.close>c.open;if(body<range*0.1)return{n:"DOJI",b:"neutral"};if(dnW>body*2&&upW<body*0.3)return{n:bull?"HAMMER":"HANGING MAN",b:bull?"bull":"bear"};if(upW>body*2&&dnW<body*0.3)return{n:bull?"INV HAMMER":"SHOOTING STAR",b:bull?"bull":"bear"};if(bull&&p.close<p.open&&c.open<=p.close&&c.close>=p.open)return{n:"BULL ENGULFING",b:"bull"};if(!bull&&p.close>p.open&&c.open>=p.close&&c.close<=p.open)return{n:"BEAR ENGULFING",b:"bear"};if(pp&&p&&pp.close<pp.open&&Math.abs(p.close-p.open)<Math.abs(pp.close-pp.open)*0.5&&bull&&c.close>pp.open)return{n:"MORNING STAR",b:"bull"};if(pp&&p&&pp.close>pp.open&&Math.abs(p.close-p.open)<Math.abs(pp.close-pp.open)*0.5&&!bull&&c.close<pp.open)return{n:"EVENING STAR",b:"bear"};if(body>range*0.85)return{n:bull?"BULL MARUBOZU":"BEAR MARUBOZU",b:bull?"bull":"bear"};if(pp&&p&&[pp,p,c].every(x=>x.close>x.open))return{n:"3 SOLDIERS",b:"bull"};if(pp&&p&&[pp,p,c].every(x=>x.close<x.open))return{n:"3 CROWS",b:"bear"};return{n:bull?"BULL CANDLE":"BEAR CANDLE",b:bull?"bull":"bear"};}

function score30(candles) {
  const cl=candles.map(c=>c.close),last=candles[candles.length-1];
  let bullScore=0,bearScore=0;
  const checks=[];
  const add=(cat,name,bias)=>{if(bias==="bull")bullScore++;else if(bias==="bear")bearScore++;checks.push({cat,name,bias});};

  const e20=_ema(cl,20),e50=_ema(cl,50),e200=_ema(cl,Math.min(cl.length,100));
  add("TREND","EMA Stack",e20>e50&&e50>e200?"bull":e20<e50&&e50<e200?"bear":"neutral");
  add("TREND","Supertrend",_st(candles,10,3).bullish?"bull":"bear");
  const bb=_bb(cl,20);
  add("TREND","BB Position",last.close>bb.mid?"bull":"bear");
  const e9p=_ema(cl.slice(0,-1),9),e9=_ema(cl,9);
  add("TREND","EMA9 Slope",e9>e9p?"bull":"bear");
  add("TREND","HMA",e9>_ema(cl.slice(0,-3),9)?"bull":"bear");

  const rsi=_rsi(cl);
  add("MOMENTUM","RSI",rsi>50?"bull":rsi<50?"bear":"neutral");
  add("MOMENTUM","MACD",_macd(cl).hist>0?"bull":"bear");
  add("MOMENTUM","Stochastic",_stoch(candles)>50?"bull":"bear");
  const wr14H=Math.max(...candles.slice(-14).map(c=>c.high)),wr14L=Math.min(...candles.slice(-14).map(c=>c.low));
  add("MOMENTUM","Williams%R",((wr14H-last.close)/(wr14H-wr14L||0.001))*-100>-50?"bull":"bear");

  if(last.close<=bb.lower)add("VOLATILITY","BB Lower","bull");
  else if(last.close>=bb.upper)add("VOLATILITY","BB Upper","bear");
  else add("VOLATILITY","BB Mid",last.close>bb.mid?"bull":"bear");
  const atr=_atr(candles,14),atrP=_atr(candles.slice(0,-1),14);
  add("VOLATILITY","ATR",atr>atrP?"bull":"bear");

  const avgV=candles.slice(-20).reduce((a,c)=>a+(c.volume||1),0)/20;
  add("VOLUME","Vol Spike",(last.volume||1)>avgV*1.2?"bull":"neutral");
  const obv=_obv(candles),obvP=_obv(candles.slice(0,-1));
  add("VOLUME","OBV",obv>obvP?"bull":"bear");
  add("VOLUME","VWAP",last.close>_vwap(candles)?"bull":"bear");

  const bos=_bos(candles),choch=_choch(candles),ob=_ob(candles),fvg=_fvg(candles);
  add("SMC","BOS",bos||"neutral");
  add("SMC","CHOCH",choch||"neutral");
  add("SMC","OB",ob||"neutral");
  add("SMC","FVG",fvg||"neutral");
  const{h,l}=_swings(candles,4);
  if(h.length>=2){const d=Math.abs(h[h.length-1].p-h[h.length-2].p)/h[h.length-1].p;add("SMC","Eq Highs",d<0.001?"bear":"neutral");}
  else add("SMC","Eq Highs","neutral");

  const pat=_pat(candles);
  add("PATTERN","Candle",pat.b);
  const pat2=candles.length>=5?_pat(candles.slice(0,-1)):null;
  add("PATTERN","Bonus",pat2&&pat2.b!=="neutral"&&pat2.b===pat.b?pat.b:"neutral");

  if(l.length>=2){const ll=l[l.length-1].p,pl=l[l.length-2].p;add("CHART","Dbl Bottom",Math.abs(ll-pl)/pl<0.002&&last.close>Math.max(ll,pl)*1.001?"bull":"neutral");}
  else add("CHART","Dbl Bottom","neutral");
  if(h.length>=2){const lh=h[h.length-1].p,ph=h[h.length-2].p;add("CHART","Dbl Top",Math.abs(lh-ph)/ph<0.002&&last.close<Math.min(lh,ph)*0.999?"bear":"neutral");}
  else add("CHART","Dbl Top","neutral");
  add("CHART","Flag",e20>e50?"bull":e20<e50?"bear":"neutral");

  const htf=candles.filter((_,i)=>i%5===0),htfC=htf.map(c=>c.close);
  add("MTF","HTF EMA",htfC[htfC.length-1]>_ema(htfC,Math.min(20,htfC.length))?"bull":"bear");
  add("MTF","HTF RSI",_rsi(htfC)>50?"bull":"bear");
  add("MTF","HTF MACD",_macd(htfC).hist>0?"bull":"bear");

  add("OSC","ADX",_adx(candles,14)>20?"bull":"neutral");
  add("OSC","MFI",rsi>50?"bull":"bear");
  add("OSC","Williams",((wr14H-last.close)/(wr14H-wr14L||0.001))*-100>-50?"bull":"bear");

  const caps={TREND:5,MOMENTUM:4,VOLATILITY:2,VOLUME:3,SMC:5,PATTERN:2,CHART:3,MTF:3,OSC:3};
  const catB={},catBr={};
  checks.forEach(c=>{catB[c.cat]=(catB[c.cat]||0)+(c.bias==="bull"?1:0);catBr[c.cat]=(catBr[c.cat]||0)+(c.bias==="bear"?1:0);});
  let tB=0,tBr=0;
  Object.keys(caps).forEach(cat=>{tB+=Math.min(catB[cat]||0,caps[cat]);tBr+=Math.min(catBr[cat]||0,caps[cat]);});

  return{
    bull:tB,bear:tBr,score:Math.max(tB,tBr),
    direction:tB>tBr?"RISE":"FALL",
    checks,
    details:{
      rsi:rsi.toFixed(1),macd:_macd(cl).hist>0?"BULL":"BEAR",
      stoch:_stoch(candles).toFixed(1),adx:_adx(candles,14).toFixed(1),
      atr,ema20:e20,ema50:e50,ema200:e200,
      bos,choch,ob,fvg,pattern:pat.n,
      supertrend:_st(candles,10,3).bullish?"BULL":"BEAR",
      session:getSession(),vwap:_vwap(candles)
    }
  };
}

function predict5(score, direction) {
  const isRise=direction==="RISE",str=score/30,decay=score>=21?0.07:0.09;
  return Array.from({length:5},(_,i)=>{
    const conf=Math.max(48,Math.round(str*100)-(i*Math.round(decay*100)));
    const rP=isRise?conf:100-conf;
    return{index:i+1,riseP:Math.min(95,Math.max(5,rP)),fallP:100-Math.min(95,Math.max(5,rP)),dir:rP>50?"RISE":"FALL"};
  });
}

function getTier(score){
  if(score<=10)return{label:"WAIT",  color:"#64748b",fire:false};
  if(score<=15)return{label:"WEAK",  color:"#f59e0b",fire:false};
  if(score<=20)return{label:"MODERATE",color:"#3b82f6",fire:true};
  if(score<=25)return{label:"STRONG",  color:"#00e676",fire:true};
  return          {label:"ELITE ULTRA",color:"#f5c842",fire:true};
}

// ── SIGNAL GENERATION ─────────────────────────

async function generateDerivSignal(symbol, granularity, label) {
  derivShowLoading(true);
  try {
    const candles = await derivFetchClosedCandles(symbol, granularity);
    if (candles.length < 20) throw new Error("Not enough candle data");

    const sc   = score30(candles);
    const tier = getTier(sc.score);
    const last = candles[candles.length - 1];
    const atr  = sc.details.atr;
    const entry= last.close;
    const isRise = sc.direction === "RISE";
    const dec  = entry < 10 ? 5 : entry < 1000 ? 2 : 1;

    const sl  = isRise ? entry-atr*1.5 : entry+atr*1.5;
    const tp1 = isRise ? entry+atr*2   : entry-atr*2;
    const tp2 = isRise ? entry+atr*4   : entry-atr*4;
    const rr  = Math.abs((tp1-entry)/(entry-sl||0.001)).toFixed(2);
    const preds = predict5(sc.score, sc.direction);

    derivLastSignal = {
      symbol, label, granularity,
      score: sc.score, tier,
      direction: sc.direction,
      bullScore: sc.bull, bearScore: sc.bear,
      details: sc.details, checks: sc.checks,
      predictions: preds,
      entry: entry.toFixed(dec),
      sl: sl.toFixed(dec),
      tp1: tp1.toFixed(dec),
      tp2: tp2.toFixed(dec), rr,
      session: getSession(),
      time: new Date().toLocaleTimeString(),
      fired: tier.fire,
    };

    derivRenderSignal(derivLastSignal);
    if (typeof dcUpdateSignal === "function") dcUpdateSignal(derivLastSignal);
    if (typeof playSignalSound === "function" && tier.fire)
      playSignalSound(sc.direction, tier.label);

  } catch(e) { derivShowError(e.message); }
  finally    { derivShowLoading(false); }
}

// ── RENDER SIGNAL ─────────────────────────────

function derivRenderSignal(s) {
  const el = document.getElementById("deriv-signal-card");
  if (!el) return;
  const tc = s.tier.color;
  const dc = s.direction === "RISE" ? "#00e676" : "#ff3b5c";

  const predHtml = s.predictions.map(p => {
    const clr = p.dir==="RISE"?"#00e676":"#ff3b5c";
    return `<div class="d-pred-row">
      <span class="d-pred-label">C${p.index}</span>
      <span class="d-pred-dir" style="color:${clr}">${p.dir}${p.index===5?" ⚠️":""}</span>
      <div class="d-pred-bars"><div class="d-pred-bar-fill" style="width:${p.riseP}%;background:${clr}"></div></div>
      <span class="d-pred-pct" style="color:${clr}">${p.riseP}%↑ ${p.fallP}%↓</span>
    </div>`;
  }).join("");

  const chkHtml = s.checks.map(c => {
    const ic = c.bias==="bull"?"✅":c.bias==="bear"?"🔴":"⚪";
    const co = c.bias==="bull"?"#00e676":c.bias==="bear"?"#ff3b5c":"#64748b";
    return `<div class="d-check-row">
      <span class="d-cat">${c.cat}</span>
      <span class="d-cname">${ic} ${c.name}</span>
      <span style="color:${co};font-size:10px;text-align:right">${c.bias.toUpperCase()}</span>
    </div>`;
  }).join("");

  el.style.borderColor = s.tier.label==="ELITE ULTRA"?"#f5c842":s.tier.color;
  el.innerHTML = `
    <div class="d-tier-badge" style="border-color:${tc};color:${tc}">${s.tier.label==="ELITE ULTRA"?"⚡ ELITE ULTRA ⚡":s.tier.label}</div>

    ${!s.fired ? `<div class="d-no-trade">⛔ NO TRADE — Score ${s.score}/30 (need 16+)</div>` : `
    <div class="d-direction" style="color:${dc}">${s.direction}</div>
    <div class="d-score-row">
      <span>Score: <b style="color:${tc}">${s.score}/30</b></span>
      <span>Conf: <b style="color:${tc}">${Math.round((s.score/30)*100)}%</b></span>
      <span>${s.session}</span>
      <span style="color:#64748b">${s.time}</span>
    </div>
    <div class="d-prob-row">
      <div class="d-prob-box bull"><span>RISE</span><b>${Math.round((s.bullScore/30)*100)}%</b></div>
      <div class="d-prob-box bear"><span>FALL</span><b>${Math.round((s.bearScore/30)*100)}%</b></div>
    </div>
    `}

    <div class="d-section-title">🕯 NEXT 5 CANDLE PREDICTION</div>
    <div class="d-predictions">${predHtml}</div>

    ${s.fired ? `
    <div class="d-section-title">🎯 RISK MANAGEMENT</div>
    <div class="d-rm-grid">
      <div class="d-rm-row"><span class="s-label">ENTRY</span><span style="color:#fff">${s.entry}</span></div>
      <div class="d-rm-row"><span class="s-label">STOP LOSS</span><span style="color:#ff3b5c">${s.sl}</span></div>
      <div class="d-rm-row"><span class="s-label">TP1</span><span style="color:#00e676">${s.tp1}</span></div>
      <div class="d-rm-row"><span class="s-label">TP2</span><span style="color:#00ff88">${s.tp2}</span></div>
      <div class="d-rm-row"><span class="s-label">R:R</span><span style="color:#f5c842">1 : ${s.rr}</span></div>
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

function derivShowLoading(s) {
  const b = document.getElementById("deriv-btn-signal");
  if (!b) return;
  b.disabled = s;
  b.textContent = s ? "⏳ SCANNING..." : "⚡ GET SIGNAL";
}

function derivShowError(msg) {
  const el = document.getElementById("deriv-signal-card");
  if (el) el.innerHTML = `<div style="color:#ff3b5c;padding:16px;font-family:monospace;font-size:11px">❌ ${msg}</div>`;
  derivShowLoading(false);
}

function derivToggleAuto() {
  const btn = document.getElementById("deriv-btn-auto");
  derivIsAuto = !derivIsAuto;
  if (derivIsAuto) {
    btn.textContent = "⏹ STOP AUTO";
    btn.classList.add("active");
    generateDerivSignal(derivSymbol, derivTF, derivLabel);
    derivAutoTimer = setInterval(() => generateDerivSignal(derivSymbol, derivTF, derivLabel), derivTF * 1000);
  } else {
    btn.textContent = "🔄 AUTO SCAN";
    btn.classList.remove("active");
    clearInterval(derivAutoTimer);
  }
}

// ── INIT UI ───────────────────────────────────

function derivInitUI() {
  // Pair grid
  const pg = document.getElementById("deriv-pair-grid");
  if (pg) {
    pg.innerHTML = "";
    DERIV_PAIRS.forEach(p => {
      const b = document.createElement("button");
      b.className = "deriv-pair-btn" + (p.symbol === derivSymbol ? " active" : "");
      b.textContent = p.label;
      b.title = p.name;
      b.onclick = () => {
        derivSymbol = p.symbol;
        derivLabel  = p.label;
        document.querySelectorAll(".deriv-pair-btn").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        const lbl = document.getElementById("deriv-chart-pair");
        if (lbl) lbl.textContent = p.label;
        derivForgetAll();
        derivSubscribeAll();
      };
      pg.appendChild(b);
    });
  }

  // TF grid
  const tg = document.getElementById("deriv-tf-grid");
  if (tg) {
    tg.innerHTML = "";
    DERIV_TIMEFRAMES.forEach(t => {
      const b = document.createElement("button");
      b.className = "deriv-tf-btn" + (t.value === derivTF ? " active" : "");
      b.textContent = t.label;
      b.onclick = () => {
        derivTF = t.value;
        document.querySelectorAll(".deriv-tf-btn").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        derivForgetAll();
        derivSubscribeAll();
      };
      tg.appendChild(b);
    });
  }

  // Buttons
  const sb = document.getElementById("deriv-btn-signal");
  if (sb) sb.onclick = () => generateDerivSignal(derivSymbol, derivTF, derivLabel);
  const ab = document.getElementById("deriv-btn-auto");
  if (ab) ab.onclick = derivToggleAuto;

  // Connect WebSocket + start chart
  derivConnect();
  if (typeof loadDerivChart === "function") loadDerivChart(derivSymbol, derivTF);

  // Status ping
  setInterval(() => {
    if (!derivWS || derivWS.readyState !== WebSocket.OPEN) {
      derivConnect();
    }
  }, 30000);
}

// Init overlay panel on tab open
const _origDerivInitUI2 = derivInitUI;
derivInitUI = function() {
  _origDerivInitUI2();
  if (typeof dcRenderOverlayPanel === "function") dcRenderOverlayPanel();
};
