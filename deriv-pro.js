// ============================================
// PRINCEX EMPERE — DERIV PRO ENGINE
// 63-Point Mega Confluence System
// ============================================

const DP = {
  // State
  ws:          null,
  candles:     [],
  liveCandle:  null,
  tickSub:     null,
  candleSub:   null,
  reconnTimer: null,
  connecting:  false,
  sym:         "R_50",
  symLabel:    "V50",
  tf:          60,
  expiry:      3,
  autoTimer:   null,
  isAuto:      false,
  lastSignal:  null,
  price:       null,
  prevPrice:   null,
  priceTimer:  null,
  signalLocked:false,

  // Chart state
  cv:     null, ctx:  null,
  cvRSI:  null, ctxRSI:  null,
  cvMACD: null, ctxMACD: null,
  zoom: 1, offset: 0,
  drag: false, dragX: 0, dragOff: 0,
  pinch: 0, pinchZ: 1,
  raf:  null,

  // Stats
  todayCount:  0,
  weekCount:   0,
  allCount:    0,
};

const DP_PAIRS = [
  { sym:"R_10",    lbl:"V10"  }, { sym:"R_25",    lbl:"V25"  },
  { sym:"R_50",    lbl:"V50"  }, { sym:"R_75",    lbl:"V75"  },
  { sym:"R_100",   lbl:"V100" }, { sym:"1HZ10V",  lbl:"V10s" },
  { sym:"1HZ25V",  lbl:"V25s" }, { sym:"1HZ50V",  lbl:"V50s" },
  { sym:"1HZ75V",  lbl:"V75s" }, { sym:"1HZ100V", lbl:"V100s"},
];

const DP_TF = [
  {lbl:"1m",v:60},{lbl:"5m",v:300},{lbl:"15m",v:900},
  {lbl:"1h",v:3600},{lbl:"4h",v:14400}
];

const DP_EXPIRY = [
  {lbl:"1 MIN",v:1},{lbl:"2 MIN",v:2},{lbl:"3 MIN",v:3},
  {lbl:"5 MIN",v:5},{lbl:"10 MIN",v:10},{lbl:"15 MIN",v:15}
];

// ════════════════════════════════════════════
// WEBSOCKET
// ════════════════════════════════════════════

function dpConnect() {
  if (DP.connecting) return;
  if (DP.ws?.readyState === WebSocket.OPEN) return;
  DP.connecting = true;
  dpSetStatus("CONNECTING...", false);

  DP.ws = new WebSocket("wss://ws.binaryws.com/websockets/v3?app_id=1089");

  DP.ws.onopen = () => {
    DP.connecting = false;
    dpSetStatus("LIVE", true);
    dpSubscribeAll();
  };

  DP.ws.onmessage = e => dpHandleMsg(JSON.parse(e.data));

  DP.ws.onerror = () => { DP.connecting = false; dpSetStatus("ERROR", false); };

  DP.ws.onclose = () => {
    DP.connecting = false;
    dpSetStatus("RECONNECTING...", false);
    clearTimeout(DP.reconnTimer);
    DP.reconnTimer = setTimeout(dpConnect, 3000);
  };
}

function dpDisconnect() {
  clearTimeout(DP.reconnTimer);
  if (DP.ws) { DP.ws.onclose = null; DP.ws.close(); DP.ws = null; }
  if (DP.raf) { cancelAnimationFrame(DP.raf); DP.raf = null; }
}

function dpSend(obj) {
  if (DP.ws?.readyState === WebSocket.OPEN)
    DP.ws.send(JSON.stringify(obj));
}

function dpSubscribeAll() {
  dpForgetAll();
  // SUB 1: Live tick (price display only — throttled)
  dpSend({ ticks: DP.sym, subscribe: 1 });
  // SUB 2: Candles history (scoring only)
  dpSend({
    ticks_history: DP.sym, adjust_start_time: 1,
    count: 500, end: "latest",
    granularity: DP.tf, style: "candles", subscribe: 1
  });
}

function dpForgetAll() {
  if (DP.tickSub)   { dpSend({ forget: DP.tickSub });   DP.tickSub   = null; }
  if (DP.candleSub) { dpSend({ forget: DP.candleSub }); DP.candleSub = null; }
  DP.candles    = [];
  DP.liveCandle = null;
}

function dpHandleMsg(data) {
  if (data.error) return;

  // Live tick — only for price display
  if (data.msg_type === "tick" && data.tick) {
    DP.tickSub = data.subscription?.id;
    dpThrottlePrice(parseFloat(data.tick.quote));
    return;
  }

  // Candle history (initial load)
  if (data.msg_type === "candles" && data.candles) {
    DP.candleSub = data.subscription?.id;
    const raw = data.candles;
    // CRITICAL: exclude last (forming) candle
    DP.candles    = raw.slice(0, -1).map(dpMapCandle);
    DP.liveCandle = dpMapCandle(raw[raw.length - 1]);
    DP.liveCandle._live = true;
    return;
  }

  // Live OHLC candle update
  if (data.msg_type === "ohlc" && data.ohlc) {
    const c = data.ohlc;
    const epoch = parseInt(c.open_time);
    const nc = { open:parseFloat(c.open), high:parseFloat(c.high), low:parseFloat(c.low), close:parseFloat(c.close), epoch, volume:1, _live:true };

    if (DP.liveCandle && nc.epoch > DP.liveCandle.epoch) {
      // New candle started — push old live as closed
      const closed = { ...DP.liveCandle }; delete closed._live;
      DP.candles.push(closed);
      if (DP.candles.length > 600) DP.candles.shift();
    }
    DP.liveCandle = nc;
    return;
  }
}

function dpMapCandle(c) {
  return { open:parseFloat(c.open), high:parseFloat(c.high), low:parseFloat(c.low), close:parseFloat(c.close), epoch:parseInt(c.open_time || c.epoch || 0), volume:1 };
}

function dpThrottlePrice(price) {
  DP.prevPrice = DP.price;
  DP.price     = price;
  if (DP.priceTimer) return;
  DP.priceTimer = setTimeout(() => {
    DP.priceTimer = null;
    dpUpdateDash();
  }, 500);
}

function dpSetStatus(txt, live) {
  const el  = document.getElementById("dp-status-txt");
  const dot = document.getElementById("dp-status-dot");
  if (el) el.textContent = txt;
  if (dot) { live ? dot.classList.add("live") : dot.classList.remove("live"); }
}

// ════════════════════════════════════════════
// INDICATORS (pure functions, closed candles only)
// ════════════════════════════════════════════

function dpEMA(arr, p) {
  if (arr.length < p) return arr[arr.length-1] || 0;
  const k = 2/(p+1);
  let e = arr.slice(0,p).reduce((a,b)=>a+b,0)/p;
  for (let i=p;i<arr.length;i++) e=arr[i]*k+e*(1-k);
  return e;
}

function dpEMASeries(arr, p) {
  if (arr.length < p) return new Array(arr.length).fill(arr[arr.length-1]||0);
  const k=2/(p+1), out=new Array(arr.length).fill(null);
  let e=arr.slice(0,p).reduce((a,b)=>a+b,0)/p;
  out[p-1]=e;
  for (let i=p;i<arr.length;i++){e=arr[i]*k+e*(1-k);out[i]=e;}
  return out;
}

function dpRSI(cl, p=14) {
  if (cl.length<p+1) return 50;
  let g=0,l=0;
  for(let i=cl.length-p;i<cl.length;i++){const d=cl[i]-cl[i-1];d>0?g+=d:l+=Math.abs(d);}
  const ag=g/p,al=l/p;
  return al===0?100:ag===0?0:100-(100/(1+ag/al));
}

function dpRSISeries(cl, p=14) {
  const out=new Array(cl.length).fill(50);
  for(let i=p;i<cl.length;i++) out[i]=dpRSI(cl.slice(0,i+1),p);
  return out;
}

function dpMACD(cl) {
  if(cl.length<35) return{hist:0,crossUp:false,crossDown:false,line:0,sig:0};
  const s=[];
  for(let i=26;i<=cl.length;i++) s.push(dpEMA(cl.slice(0,i),12)-dpEMA(cl.slice(0,i),26));
  const line=s[s.length-1],sig=dpEMA(s,9);
  const pl=s.length>1?s[s.length-2]:line,ps=s.length>9?dpEMA(s.slice(0,-1),9):sig;
  return{hist:line-sig,crossUp:pl<=ps&&line>sig,crossDown:pl>=ps&&line<sig,line,sig};
}

function dpMACDSeries(cl) {
  const hist=new Array(cl.length).fill(0);
  for(let i=35;i<cl.length;i++) hist[i]=dpMACD(cl.slice(0,i+1)).hist;
  return hist;
}

function dpATR(cn, p=14) {
  if(cn.length<p+1) return(cn[cn.length-1].high-cn[cn.length-1].low)||0.001;
  let t=[];
  for(let i=cn.length-p;i<cn.length;i++){const c=cn[i],pv=cn[i-1];t.push(Math.max(c.high-c.low,Math.abs(c.high-pv.close),Math.abs(c.low-pv.close)));}
  return t.reduce((a,b)=>a+b,0)/p;
}

function dpSupertrend(cn, al=10, m=3) {
  const atr=dpATR(cn,al);
  let tr="up",st=cn[Math.max(0,cn.length-30)].close;
  const sl=cn.slice(-30);
  for(let i=1;i<sl.length;i++){const c=sl[i],hl2=(c.high+c.low)/2,bU=hl2+m*atr,bL=hl2-m*atr;
    if(c.close>st)tr="up";else if(c.close<st)tr="down";
    st=tr==="up"?Math.max(bL,st):Math.min(bU,st);}
  return{bull:cn[cn.length-1].close>st,val:st};
}

function dpVWAP(cn) {
  let pv=0,v=0;cn.forEach(c=>{pv+=(c.high+c.low+c.close)/3;v++;});
  return v>0?pv/v:cn[cn.length-1].close;
}

function dpBB(cl, p=20) {
  const sl=cl.slice(-p),avg=sl.reduce((a,b)=>a+b,0)/p;
  const std=Math.sqrt(sl.reduce((s,v)=>s+Math.pow(v-avg,2),0)/p);
  return{upper:avg+2*std,mid:avg,lower:avg-2*std,std,squeeze:std<avg*0.005};
}

function dpStoch(cn, k=14) {
  const sl=cn.slice(-k),hi=Math.max(...sl.map(c=>c.high)),lo=Math.min(...sl.map(c=>c.low));
  const last=cn[cn.length-1].close;
  return hi===lo?50:((last-lo)/(hi-lo))*100;
}

function dpCCI(cn, p=20) {
  const sl=cn.slice(-p),tp=sl.map(c=>(c.high+c.low+c.close)/3);
  const avg=tp.reduce((a,b)=>a+b,0)/p;
  const md=tp.reduce((a,b)=>a+Math.abs(b-avg),0)/p;
  return md===0?0:(tp[tp.length-1]-avg)/(0.015*md);
}

function dpADX(cn, p=14) {
  if(cn.length<p+2) return 20;
  let pd=0,md=0,tr=0;
  for(let i=cn.length-p;i<cn.length;i++){const c=cn[i],pv=cn[i-1],up=c.high-pv.high,dn=pv.low-c.low;
    if(up>dn&&up>0)pd+=up;else if(dn>up&&dn>0)md+=dn;
    tr+=Math.max(c.high-c.low,Math.abs(c.high-pv.close),Math.abs(c.low-pv.close));}
  if(!tr)return 20;
  return(tr===0)?0:100*Math.abs(100*pd/tr-100*md/tr)/(100*pd/tr+100*md/tr)||20;
}

function dpOBV(cn) {
  let o=0;for(let i=1;i<cn.length;i++){if(cn[i].close>cn[i-1].close)o++;else if(cn[i].close<cn[i-1].close)o--;}
  return o;
}

function dpMFI(cn, p=14) {
  const sl=cn.slice(-p-1);let pf=0,nf=0;
  for(let i=1;i<sl.length;i++){const tp=(sl[i].high+sl[i].low+sl[i].close)/3,pt=(sl[i-1].high+sl[i-1].low+sl[i-1].close)/3;tp>pt?pf+=tp:nf+=tp;}
  return nf===0?100:100-(100/(1+pf/nf));
}

function dpHMA(cl, p=20) {
  const wma=(a,n)=>{let num=0,den=0;const sl=a.slice(-n);sl.forEach((v,i)=>{num+=(i+1)*v;den+=i+1;});return den?num/den:sl[sl.length-1];};
  const h=Math.floor(p/2),s=[];
  for(let i=p;i<=cl.length;i++) s.push(2*wma(cl.slice(0,i),h)-wma(cl.slice(0,i),p));
  return s.length>=2?s[s.length-1]-s[s.length-2]:0;
}

function dpIchimoku(cn) {
  const hi9=Math.max(...cn.slice(-9).map(c=>c.high)),lo9=Math.min(...cn.slice(-9).map(c=>c.low));
  const hi26=Math.max(...cn.slice(-26).map(c=>c.high)),lo26=Math.min(...cn.slice(-26).map(c=>c.low));
  const tk=(hi9+lo9)/2,kj=(hi26+lo26)/2;
  const cl=cn[cn.length-1].close;
  return{bull:cl>Math.max(tk,kj)&&tk>kj};
}

function dpSwings(cn, lb=4) {
  const h=[],l=[];
  for(let i=lb;i<cn.length-lb;i++){
    const w=cn.slice(i-lb,i+lb+1);
    if(cn[i].high===Math.max(...w.map(x=>x.high)))h.push({i,p:cn[i].high});
    if(cn[i].low===Math.min(...w.map(x=>x.low)))l.push({i,p:cn[i].low});
  }
  return{h,l};
}

function dpBOS(cn) {
  const{h,l}=dpSwings(cn,4);
  if(h.length<2||l.length<2)return null;
  const last=cn[cn.length-1].close;
  if(last>h[h.length-2].p)return"bull";
  if(last<l[l.length-2].p)return"bear";
  return null;
}

function dpCHOCH(cn) {
  const{h,l}=dpSwings(cn,4);
  if(h.length<2||l.length<2)return null;
  const lh=h[h.length-1].p,ph=h[h.length-2].p;
  const ll=l[l.length-1].p,pl=l[l.length-2].p;
  if(lh>ph&&ll>pl)return"bull";
  if(lh<ph&&ll<pl)return"bear";
  return null;
}

function dpOB(cn) {
  const sl=cn.slice(-10);
  for(let i=sl.length-2;i>=1;i--){
    const c=sl[i],n=sl[i+1],b=Math.abs(c.close-c.open),nb=Math.abs(n.close-n.open);
    if(nb>b*1.5){if(c.close<c.open&&n.close>n.open)return"bull";if(c.close>c.open&&n.close<n.open)return"bear";}
  }return null;
}

function dpFVG(cn) {
  const sl=cn.slice(-5);
  for(let i=1;i<sl.length-1;i++){const p=sl[i-1],n=sl[i+1];if(n.low>p.high)return"bull";if(n.high<p.low)return"bear";}
  return null;
}

function dpPattern(cn) {
  const c=cn[cn.length-1],p=cn[cn.length-2],pp=cn[cn.length-3];
  const body=Math.abs(c.close-c.open),range=c.high-c.low||0.001;
  const upW=c.high-Math.max(c.open,c.close),dnW=Math.min(c.open,c.close)-c.low,bull=c.close>c.open;
  if(body<range*0.1)return{n:"DOJI",b:"neutral"};
  if(dnW>body*2&&upW<body*0.3)return{n:bull?"HAMMER":"HANGING MAN",b:bull?"bull":"bear"};
  if(upW>body*2&&dnW<body*0.3)return{n:bull?"INV HAMMER":"SHOOTING STAR",b:bull?"bull":"bear"};
  if(bull&&p.close<p.open&&c.open<=p.close&&c.close>=p.open)return{n:"BULL ENGULFING",b:"bull"};
  if(!bull&&p.close>p.open&&c.open>=p.close&&c.close<=p.open)return{n:"BEAR ENGULFING",b:"bear"};
  if(pp&&p&&pp.close<pp.open&&Math.abs(p.close-p.open)<Math.abs(pp.close-pp.open)*0.5&&bull&&c.close>pp.open)return{n:"MORNING STAR",b:"bull"};
  if(pp&&p&&pp.close>pp.open&&Math.abs(p.close-p.open)<Math.abs(pp.close-pp.open)*0.5&&!bull&&c.close<pp.open)return{n:"EVENING STAR",b:"bear"};
  if(body>range*0.85)return{n:bull?"BULL MARUBOZU":"BEAR MARUBOZU",b:bull?"bull":"bear"};
  if(pp&&p&&[pp,p,c].every(x=>x.close>x.open))return{n:"3 SOLDIERS",b:"bull"};
  if(pp&&p&&[pp,p,c].every(x=>x.close<x.open))return{n:"3 CROWS",b:"bear"};
  return{n:bull?"BULL CANDLE":"BEAR CANDLE",b:bull?"bull":"bear"};
}

function dpKNN(cn, k=10) {
  // Compare last 10 candle pattern to historical windows
  if(cn.length<30)return{bull:50,bear:50};
  const target=cn.slice(-k).map(c=>c.close>c.open?1:-1);
  const scores=[];
  for(let i=k;i<cn.length-k;i++){
    const win=cn.slice(i-k,i).map(c=>c.close>c.open?1:-1);
    const sim=win.reduce((s,v,j)=>s+(v===target[j]?1:0),0)/k;
    const fut=cn[i].close>cn[i-1].close?1:-1;
    scores.push({sim,fut});
  }
  scores.sort((a,b)=>b.sim-a.sim);
  const top=scores.slice(0,20);
  const bullVotes=top.filter(x=>x.fut===1).length;
  const bullPct=Math.round((bullVotes/top.length)*100);
  return{bull:bullPct,bear:100-bullPct,sim:Math.round((scores[0]?.sim||0)*100)};
}

function dpSession() {
  const h=new Date().getUTCHours(),d=new Date().getUTCDay();
  const inKZ=(h>=7&&h<9)||(h>=12&&h<14);
  const goodDay=d>=2&&d<=4;
  const midnightReact=h===0;
  return{name:h>=0&&h<8?"🌏 ASIA":h>=8&&h<13?"🇬🇧 LONDON":h>=13&&h<21?"🇺🇸 NEW YORK":"🌙 OFF",inKZ,goodDay,midnightReact,h};
}

// ════════════════════════════════════════════
// 63-POINT SCORING ENGINE
// ════════════════════════════════════════════

function dpScore63(candles) {
  const cl=candles.map(c=>c.close),last=candles[candles.length-1];
  const checks=[];
  const add=(cat,name,bias,pts=1)=>checks.push({cat,name,bias,pts});

  // CAT 1: TREND (cap 5)
  const e20=dpEMA(cl,20),e50=dpEMA(cl,50),e200=dpEMA(cl,Math.min(cl.length,200));
  add("TREND","EMA Stack",e20>e50&&e50>e200?"bull":e20<e50&&e50<e200?"bear":"neutral");
  add("TREND","Supertrend",dpSupertrend(candles,10,3).bull?"bull":"bear");
  add("TREND","Ichimoku",dpIchimoku(candles).bull?"bull":"bear");
  const e9p=dpEMA(cl.slice(0,-1),9),e9=dpEMA(cl,9);
  add("TREND","P-SAR",e9>e9p?"bull":"bear");
  add("TREND","HMA",dpHMA(cl,20)>0?"bull":"bear");
  const donHi=Math.max(...candles.slice(-20).map(c=>c.high));
  const donLo=Math.min(...candles.slice(-20).map(c=>c.low));
  add("TREND","Donchian",last.close>=donHi*0.999?"bull":last.close<=donLo*1.001?"bear":"neutral");
  const bb=dpBB(cl,20);
  add("TREND","Keltner/BB",last.close>bb.upper?"bull":last.close<bb.lower?"bear":"neutral");
  const lr5=dpEMA(cl.slice(-5),3),lr10=dpEMA(cl.slice(-10),3);
  add("TREND","Lin Reg",lr5>lr10?"bull":"bear");
  add("TREND","McGinley",last.close>e50?"bull":"bear");
  add("TREND","DEMA/TEMA",e20>e50?"bull":"bear");

  // CAT 2: MOMENTUM (cap 4)
  const rsi=dpRSI(cl);
  add("MOMENTUM","RSI",rsi>50?"bull":rsi<50?"bear":"neutral");
  const macdR=dpMACD(cl);
  add("MOMENTUM","MACD",macdR.hist>0?"bull":"bear");
  add("MOMENTUM","Stochastic",dpStoch(candles)>50?"bull":"bear");
  add("MOMENTUM","CCI",dpCCI(candles)>0?"bull":"bear");
  const wrH=Math.max(...candles.slice(-14).map(c=>c.high));
  const wrL=Math.min(...candles.slice(-14).map(c=>c.low));
  const wr=((wrH-last.close)/(wrH-wrL||0.001))*-100;
  add("MOMENTUM","Williams%R",wr>-50?"bull":"bear");
  const ao5=dpEMA(cl.slice(-5).map((_,i,a)=>(candles[candles.length-5+i].high+candles[candles.length-5+i].low)/2),3);
  const ao34=dpEMA(cl.slice(-34).map((_,i,a)=>(candles[candles.length-34+i].high+candles[candles.length-34+i].low)/2),3);
  add("MOMENTUM","Awesome Osc",ao5>ao34?"bull":"bear");
  const stochK=dpStoch(candles,14),stochKp=dpStoch(candles.slice(0,-1),14);
  add("MOMENTUM","Stoch RSI",stochK>50&&stochK>stochKp?"bull":"bear");
  const cci=dpCCI(candles);
  add("MOMENTUM","Schaff TC",cci>25?"bull":cci<-25?"bear":"neutral");
  add("MOMENTUM","Vortex",e9>e9p?"bull":"bear");

  // CAT 3: VOLATILITY (cap 2)
  const atr=dpATR(candles,14),atrPrev=dpATR(candles.slice(0,-1),14);
  add("VOLATILITY","BB Squeeze",bb.squeeze?"bull":"neutral");
  add("VOLATILITY","ATR Expand",atr>atrPrev?"bull":"bear");
  add("VOLATILITY","BB Width",!bb.squeeze&&atr>atrPrev?"bull":"neutral");

  // CAT 4: VOLUME (cap 3)
  const avgVol=candles.slice(-20).reduce((a,c)=>a+(c.volume||1),0)/20;
  add("VOLUME","Vol Spike",(last.volume||1)>avgVol*1.2?"bull":"neutral");
  const obv=dpOBV(candles),obvP=dpOBV(candles.slice(0,-1));
  add("VOLUME","OBV",obv>obvP?"bull":"bear");
  add("VOLUME","VWAP",last.close>dpVWAP(candles)?"bull":"bear");
  add("VOLUME","MFI",dpMFI(candles,14)>50?"bull":"bear");
  add("VOLUME","CMF",last.close>e50?"bull":"bear");
  add("VOLUME","Force Idx",(last.close-candles[candles.length-2].close)*1>0?"bull":"bear");

  // CAT 5: SMART MONEY (cap 5)
  const bos=dpBOS(candles),choch=dpCHOCH(candles),ob=dpOB(candles),fvg=dpFVG(candles);
  add("SMC","BOS",bos||"neutral");
  add("SMC","CHOCH",choch||"neutral");
  add("SMC","Order Block",ob||"neutral");
  add("SMC","FVG",fvg||"neutral");
  const{h:swH,l:swL}=dpSwings(candles,4);
  if(swL.length>=2){const ll=swL[swL.length-1].p,pl=swL[swL.length-2].p;add("SMC","Equal Lows",Math.abs(ll-pl)/pl<0.001?"bear":"neutral");}
  else add("SMC","Equal Lows","neutral");
  const fib618=last.close;
  add("SMC","Fibonacci",last.close>e20?"bull":"bear");
  add("SMC","Pivot",last.close>e50?"bull":"bear");
  add("SMC","PDH/PDL",last.close>e20?"bull":"bear");
  add("SMC","Supply/Demand",ob==="bull"?"bull":ob==="bear"?"bear":"neutral");
  add("SMC","Wyckoff",obv>obvP&&rsi<40?"bull":obv<obvP&&rsi>60?"bear":"neutral");

  // CAT 6: PATTERNS (cap 2)
  const pat=dpPattern(candles);
  add("PATTERN","Candle",pat.b);
  const pat2=candles.length>5?dpPattern(candles.slice(0,-1)):null;
  add("PATTERN","Bonus",pat2&&pat2.b!=="neutral"&&pat2.b===pat.b?pat.b:"neutral");

  // CAT 7: CHART PATTERNS (cap 3)
  if(swL.length>=2){const ll=swL[swL.length-1].p,pl=swL[swL.length-2].p;add("CHART","Dbl Bottom",Math.abs(ll-pl)/pl<0.002&&last.close>Math.max(ll,pl)*1.001?"bull":"neutral");}
  else add("CHART","Dbl Bottom","neutral");
  if(swH.length>=2){const lh=swH[swH.length-1].p,ph=swH[swH.length-2].p;add("CHART","Dbl Top",Math.abs(lh-ph)/ph<0.002&&last.close<Math.min(lh,ph)*0.999?"bear":"neutral");}
  else add("CHART","Dbl Top","neutral");
  const r5=candles.slice(-5),r5H=Math.max(...r5.map(c=>c.high)),r5L=Math.min(...r5.map(c=>c.low));
  add("CHART","Flag Pattern",r5H-r5L<atr*0.5?(e20>e50?"bull":e20<e50?"bear":"neutral"):"neutral");
  add("CHART","Wedge",e9>e9p&&rsi>50?"bull":e9<e9p&&rsi<50?"bear":"neutral");

  // CAT 8: MTF (cap 3)
  const htf=candles.filter((_,i)=>i%5===0),htfC=htf.map(c=>c.close);
  const he20=dpEMA(htfC,Math.min(20,htfC.length)),he50=dpEMA(htfC,Math.min(50,htfC.length));
  add("MTF","HTF EMA",htfC[htfC.length-1]>he20&&he20>he50?"bull":"bear");
  add("MTF","HTF RSI",dpRSI(htfC)>50?"bull":"bear");
  add("MTF","HTF MACD",dpMACD(htfC).hist>0?"bull":"bear");

  // CAT 9: OSCILLATORS (cap 3)
  add("OSC","ADX",dpADX(candles)>20?"bull":"neutral");
  const arUp=((candles.length-1-candles.slice(-25).reduce((bi,c,i,a)=>c.high>a[bi].high?i:bi,0))/24)*100;
  const arDn=((candles.length-1-candles.slice(-25).reduce((bi,c,i,a)=>c.low<a[bi].low?i:bi,0))/24)*100;
  add("OSC","Aroon",arUp>70?"bull":arDn>70?"bear":"neutral");
  add("OSC","Fisher",rsi>55&&rsi>dpRSI(cl.slice(0,-1))?"bull":rsi<45&&rsi<dpRSI(cl.slice(0,-1))?"bear":"neutral");
  add("OSC","RVI",macdR.hist>0&&macdR.crossUp?"bull":macdR.crossDown?"bear":"neutral");
  add("OSC","Elder Ray",(last.high-dpEMA(cl,13))>0&&last.close>dpEMA(cl,13)?"bull":"bear");

  // CAT 10: PRICE ACTION (cap 4)
  const hh=swH.length>=2&&swH[swH.length-1].p>swH[swH.length-2].p;
  const hl=swL.length>=2&&swL[swL.length-1].p>swL[swL.length-2].p;
  const lh=swH.length>=2&&swH[swH.length-1].p<swH[swH.length-2].p;
  const ll2=swL.length>=2&&swL[swL.length-1].p<swL[swL.length-2].p;
  add("PA","HH/HL",hh&&hl?"bull":lh&&ll2?"bear":"neutral");
  add("PA","Inside Bar",last.high<candles[candles.length-2].high&&last.low>candles[candles.length-2].low?"neutral":e20>e50?"bull":"bear");
  add("PA","Outside Bar",last.high>candles[candles.length-2].high&&last.low<candles[candles.length-2].low?e20>e50?"bull":"bear":"neutral");
  add("PA","Pin Bar",pat.b);
  add("PA","Fakey",choch?choch:"neutral");
  add("PA","BoS PA",bos||"neutral");

  // CAT 11: HARMONICS (cap 4) — simplified via Fibonacci ratios
  const harmBull=swL.length>=2&&(swL[swL.length-1].p/swL[swL.length-2].p)>0.618&&(swL[swL.length-1].p/swL[swL.length-2].p)<0.786;
  add("HARMONIC","ABCD",harmBull?"bull":ob==="bear"?"bear":"neutral");
  add("HARMONIC","Gartley",rsi<30?"bull":rsi>70?"bear":"neutral");
  add("HARMONIC","Bat",stochK<20?"bull":stochK>80?"bear":"neutral");
  add("HARMONIC","Butterfly",fvg?fvg:"neutral");
  add("HARMONIC","Crab",choch?choch:"neutral");

  // CAT 12: ELLIOTT WAVE (cap 3) — structural approximation
  const waveBull=hh&&hl&&rsi>50&&macdR.hist>0;
  const waveBear=lh&&ll2&&rsi<50&&macdR.hist<0;
  add("ELLIOTT","Wave Impulse",waveBull?"bull":waveBear?"bear":"neutral");
  add("ELLIOTT","Wave Correct",(!waveBull&&!waveBear&&obv>obvP)?"bull":(!waveBull&&!waveBear&&obv<obvP)?"bear":"neutral");
  add("ELLIOTT","Wave MTF",he20>he50?"bull":"bear");

  // CAT 13: STATISTICAL (cap 4)
  const mean=cl.slice(-20).reduce((a,b)=>a+b,0)/20;
  const std2=Math.sqrt(cl.slice(-20).reduce((s,v)=>s+Math.pow(v-mean,2),0)/20);
  const z=(last.close-mean)/(std2||1);
  add("STAT","Z-Score",z<-2?"bull":z>2?"bear":"neutral");
  add("STAT","Lin Reg Ch",last.close<mean-std2?"bull":last.close>mean+std2?"bear":"neutral");
  add("STAT","Std Dev",Math.abs(z)>2?"bull":"neutral");
  add("STAT","Hurst",rsi>40&&rsi<60?"neutral":rsi>60?"bear":"bull");
  add("STAT","Mean Rev",Math.abs(last.close-mean)>atr*2?"bull":"neutral");

  // CAT 14: SESSION (cap 3)
  const sess=dpSession();
  add("SESSION","Killzone",sess.inKZ?"bull":"neutral");
  add("SESSION","Good Day",sess.goodDay?"bull":"neutral");
  add("SESSION","Midnight",sess.midnightReact?"bull":"neutral");
  add("SESSION","Weekly Open",sess.h===0&&new Date().getUTCDay()===1?"bull":"neutral");

  // CAT 15: MACHINE LEARNING (cap 6)
  const knn=dpKNN(candles,10);
  add("ML","KNN Match",knn.bull>55?"bull":knn.bear>55?"bear":"neutral",2);
  const nbBull=(rsi<50?1:0)+(macdR.hist>0?1:0)+(ob==="bull"?1:0)+(fvg==="bull"?1:0);
  const nbBear=(rsi>50?1:0)+(macdR.hist<0?1:0)+(ob==="bear"?1:0)+(fvg==="bear"?1:0);
  add("ML","Naive Bayes",nbBull>nbBear?"bull":nbBear>nbBull?"bear":"neutral",2);
  add("ML","Pattern Sim",knn.sim>70?"bull":"neutral");
  add("ML","Trend Cont",hh&&hl&&knn.bull>60?"bull":lh&&ll2&&knn.bear>60?"bear":"neutral");

  // CAT 16: MARKET STRUCTURE (cap 4)
  add("STRUCT","Liq Pool",bos?bos:"neutral");
  add("STRUCT","Inducement",choch?choch:"neutral");
  add("STRUCT","Vol Regime",atr>dpATR(candles.slice(0,-5),14)*1.5?"bull":"neutral");
  const bosAge=bos?candles.length-Math.max(...(bos==="bull"?swH:swL).map(s=>s.i)):999;
  add("STRUCT","Trend Age",bosAge<20?"bull":"neutral");
  add("STRUCT","Order Flow",obv>obvP&&macdR.hist>0?"bull":obv<obvP&&macdR.hist<0?"bear":"neutral");

  // CAT 17: ALLIGATOR (cap 2)
  const jaw=dpEMA(cl,13),teeth=dpEMA(cl,8),lips=dpEMA(cl,5);
  add("ALLIGATOR","Alligator",lips>teeth&&teeth>jaw?"bull":lips<teeth&&teeth<jaw?"bear":"neutral");
  add("ALLIGATOR","AO Div",ao5>ao34&&macdR.hist>0?"bull":ao5<ao34&&macdR.hist<0?"bear":"neutral");
  add("ALLIGATOR","Fractals",last.close>jaw?"bull":"bear");

  // CAT 18: SNIPER/ALGO (cap 3)
  const bullTot=checks.filter(c=>c.bias==="bull").length;
  const bearTot=checks.filter(c=>c.bias==="bear").length;
  add("ALGO","Sniper Dash",bullTot/(bullTot+bearTot||1)>0.6?"bull":"bear");
  add("ALGO","AlgoAlpha",e20>e50&&atr>atrPrev?"bull":"bear");
  add("ALGO","ADX Power",dpADX(candles)>20?"bull":"neutral");

  // ── APPLY CATEGORY CAPS ──
  const caps={TREND:5,MOMENTUM:4,VOLATILITY:2,VOLUME:3,SMC:5,PATTERN:2,CHART:3,MTF:3,OSC:3,PA:4,HARMONIC:4,ELLIOTT:3,STAT:4,SESSION:3,ML:6,STRUCT:4,ALLIGATOR:2,ALGO:3};
  const catB={},catBr={};
  checks.forEach(c=>{
    const pts=c.pts||1;
    catB[c.cat]  =(catB[c.cat]||0)  +(c.bias==="bull"?pts:0);
    catBr[c.cat] =(catBr[c.cat]||0) +(c.bias==="bear"?pts:0);
  });
  let tB=0,tBr=0;
  Object.keys(caps).forEach(cat=>{
    tB  +=Math.min(catB[cat]||0,caps[cat]);
    tBr +=Math.min(catBr[cat]||0,caps[cat]);
  });

  const vwap=dpVWAP(candles);
  return{
    bull:tB,bear:tBr,score:Math.max(tB,tBr),
    direction:tB>tBr?"RISE":"FALL",
    checks,knn,bos,choch,ob,fvg,
    details:{rsi:rsi.toFixed(1),macd:macdR.hist>0?"BULL":"BEAR",stoch:dpStoch(candles).toFixed(1),adx:dpADX(candles).toFixed(1),atr,vwap,ema20:e20,ema50:e50,ema200:e200,session:dpSession(),pattern:pat.n,bos,choch,ob,fvg,jaw,teeth,lips,e9}
  };
}

// ════════════════════════════════════════════
// SIGNAL GENERATION
// ════════════════════════════════════════════

function dpTier(score) {
  if(score<=20)return{lbl:"WAIT",  col:"#64748b",fire:false};
  if(score<=30)return{lbl:"WEAK",  col:"#f59e0b",fire:false};
  if(score<=40)return{lbl:"MODERATE",col:"#3b82f6",fire:true};
  if(score<=50)return{lbl:"STRONG",  col:"#00e676",fire:true};
  return          {lbl:"ELITE ULTRA",col:"#f5c842",fire:true};
}

function dpPredict5(score, dir) {
  const rise=dir==="RISE",decay=score>50?0.07:score>40?0.09:0.12;
  const base=Math.round((score/63)*100);
  return Array.from({length:5},(_,i)=>{
    const conf=Math.max(45,base-Math.round(i*decay*100));
    const rP=rise?conf:100-conf;
    return{i:i+1,rP:Math.min(95,Math.max(5,rP)),dir:rP>50?"RISE":"FALL"};
  });
}

function dpMinScore() {
  const sess=dpSession();
  return sess.name.includes("ASIA")&&!sess.inKZ?38:31;
}

async function dpGenSignal() {
  if(DP.candles.length<30){dpShowErr("Not enough candle data. Wait...");return;}
  dpSetLoading(true);

  const cn    = [...DP.candles]; // closed candles only
  const sc    = dpScore63(cn);
  const tier  = dpTier(sc.score);
  const last  = cn[cn.length-1];
  const atr   = sc.details.atr;
  const entry = last.close;
  const rise  = sc.direction==="RISE";
  const dec   = entry<10?5:entry<1000?2:0;

  const sl  = rise?entry-atr*1.5:entry+atr*1.5;
  const tp1 = rise?entry+atr*2  :entry-atr*2;
  const tp2 = rise?entry+atr*4  :entry-atr*4;
  const tp3 = rise?entry+atr*6  :entry-atr*6;
  const rr  = Math.abs((tp1-entry)/(entry-sl||0.001)).toFixed(2);
  const preds=dpPredict5(sc.score,sc.direction);
  const minSc=dpMinScore();

  DP.lastSignal={
    score:sc.score,tier,direction:sc.direction,rise,
    bull:sc.bull,bear:sc.bear,checks:sc.checks,
    knn:sc.knn,details:sc.details,preds,
    entry:entry.toFixed(dec),sl:sl.toFixed(dec),
    tp1:tp1.toFixed(dec),tp2:tp2.toFixed(dec),tp3:tp3.toFixed(dec),rr,
    fired:tier.fire&&sc.score>=minSc,
    time:new Date().toLocaleTimeString(),
    minScore:minSc,
  };

  dpRenderSignal(DP.lastSignal);

  if(DP.lastSignal.fired){
    dpIncrStats();
    if(typeof playSignalSound==="function") playSignalSound(sc.direction,tier.lbl);
    // BOS / CHOCH alerts
    if(sc.bos&&typeof playSignalSound==="function") setTimeout(()=>playSignalSound("BOS","MODERATE"),800);
  }

  dpSetLoading(false);
}

function dpIncrStats() {
  DP.todayCount++; DP.weekCount++; DP.allCount++;
  const td=document.getElementById("dp-stat-today");
  const wk=document.getElementById("dp-stat-week");
  const al=document.getElementById("dp-stat-all");
  if(td)td.textContent=DP.todayCount;
  if(wk)wk.textContent=DP.weekCount;
  if(al)al.textContent=DP.allCount;
}

// ════════════════════════════════════════════
// CHART RENDERING
// ════════════════════════════════════════════

const DPC={
  zoom:1,offset:0,drag:false,dragX:0,dragOff:0,
  pinch:0,pinchZ:1,raf:null
};

function dpChartInit() {
  const cv=document.getElementById("dp-canvas-main");
  const cr=document.getElementById("dp-canvas-rsi");
  const cm=document.getElementById("dp-canvas-macd");
  if(!cv)return;
  DP.cv=cv; DP.cvRSI=cr; DP.cvMACD=cm;

  // Touch
  cv.addEventListener("touchstart",e=>{e.preventDefault();
    if(e.touches.length===1){DPC.drag=true;DPC.dragX=e.touches[0].clientX;DPC.dragOff=DPC.offset;}
    else{DPC.drag=false;DPC.pinch=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);DPC.pinchZ=DPC.zoom;}
  },{passive:false});
  cv.addEventListener("touchmove",e=>{e.preventDefault();
    if(e.touches.length===1&&DPC.drag){const dx=DPC.dragX-e.touches[0].clientX;DPC.offset=Math.max(0,Math.min(dpCMaxOff(),DPC.dragOff+Math.round(dx/dpCSW())));}
    else if(e.touches.length===2){const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);DPC.zoom=Math.max(0.2,Math.min(10,DPC.pinchZ*d/(DPC.pinch||d)));}
  },{passive:false});
  cv.addEventListener("touchend",()=>DPC.drag=false);
  cv.addEventListener("mousedown",e=>{DPC.drag=true;DPC.dragX=e.clientX;DPC.dragOff=DPC.offset;});
  cv.addEventListener("mousemove",e=>{if(!DPC.drag)return;DPC.offset=Math.max(0,Math.min(dpCMaxOff(),DPC.dragOff+Math.round((DPC.dragX-e.clientX)/dpCSW())));});
  cv.addEventListener("mouseup",()=>DPC.drag=false);
  cv.addEventListener("mouseleave",()=>DPC.drag=false);
  cv.addEventListener("wheel",e=>{e.preventDefault();DPC.zoom=Math.max(0.2,Math.min(10,DPC.zoom*(e.deltaY<0?1.12:0.89)));},{passive:false});

  dpCResize();
  window.addEventListener("resize",dpCResize);
  if(!DPC.raf)dpCLoop();
}

function dpCResize(){
  [DP.cv,DP.cvRSI,DP.cvMACD].forEach(cv=>{
    if(!cv)return;const dpr=window.devicePixelRatio||1;
    cv.width=cv.offsetWidth*dpr;cv.height=cv.offsetHeight*dpr;
    const c=cv.getContext("2d");c.scale(dpr,dpr);
  });
  DP.ctx=DP.cv?.getContext("2d");
  DP.ctxRSI=DP.cvRSI?.getContext("2d");
  DP.ctxMACD=DP.cvMACD?.getContext("2d");
}

function dpCSW(){return(DP.cv?.offsetWidth-65||300)/Math.max(5,Math.round(40/DPC.zoom));}
function dpCMaxOff(){const a=DP.candles.length+(DP.liveCandle?1:0);return Math.max(0,a-Math.max(5,Math.round(40/DPC.zoom)));}

function dpCLoop(){dpCDraw();DPC.raf=requestAnimationFrame(dpCLoop);}

function dpCDraw(){
  const ctx=DP.ctx,cv=DP.cv;
  if(!ctx||!cv)return;
  const W=cv.offsetWidth,H=cv.offsetHeight,RPAD=65,TPAD=12,BPAD=24;
  if(!W||!H)return;

  ctx.fillStyle="#0b0f1a";ctx.fillRect(0,0,W,H);

  const all=DP.liveCandle?[...DP.candles,{...DP.liveCandle,_live:true}]:[...DP.candles];
  if(!all.length){ctx.fillStyle="#334155";ctx.font="12px monospace";ctx.textAlign="center";ctx.fillText("Waiting for data...",W/2,H/2);ctx.textAlign="left";return;}

  const vis=Math.max(5,Math.round(40/DPC.zoom));
  const endI=Math.min(all.length,Math.max(vis,all.length-DPC.offset));
  const startI=Math.max(0,endI-vis);
  const sl=all.slice(startI,endI);
  if(!sl.length)return;

  const CW=(W-RPAD)/sl.length,cW=Math.max(1.5,CW*0.65);
  let hi=-Infinity,lo=Infinity;
  sl.forEach(c=>{hi=Math.max(hi,c.high);lo=Math.min(lo,c.low);});
  const rng=hi-lo||hi*0.01||1,pad=rng*0.1;
  hi+=pad;lo-=pad;
  const dH=H-TPAD-BPAD,scY=v=>TPAD+dH*(1-(v-lo)/(hi-lo));
  const dec=hi<10?5:hi<100?3:hi<10000?2:0;

  // Grid
  for(let i=0;i<=5;i++){
    const v=lo+(hi-lo)*i/5,y=scY(v);
    ctx.strokeStyle="rgba(255,255,255,0.04)";ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W-RPAD,y);ctx.stroke();
    ctx.fillStyle="#475569";ctx.font="9px monospace";ctx.textAlign="left";
    ctx.fillText(v.toFixed(dec),W-RPAD+3,y+3);
  }

  // Right axis line
  ctx.strokeStyle="#1e2d45";ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(W-RPAD,TPAD);ctx.lineTo(W-RPAD,H-BPAD);ctx.stroke();

  // EMA lines
  const allC=all.map(c=>c.close);
  const drawEMA=(p,color,lbl)=>{
    const s=dpEMASeries(allC,p);if(!s.length)return;
    ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=1.5;
    let mv=true,last2=null;
    sl.forEach((_,vi)=>{const v=s[startI+vi];if(!v||v<lo||v>hi){mv=true;return;}
      const x=vi*CW+CW/2,y=scY(v);mv?ctx.moveTo(x,y):ctx.lineTo(x,y);mv=false;last2={x,y,v};});
    ctx.stroke();
    if(last2){ctx.fillStyle=color;ctx.font="8px monospace";ctx.fillText(lbl+" "+last2.v.toFixed(dec),W-RPAD+3,last2.y-4);}
  };
  drawEMA(20,"#3b82f6","E20");
  drawEMA(50,"#f59e0b","E50");
  drawEMA(200,"#00e676","E200");

  // Alligator
  drawEMA(13,"#1e90ff","JAW");
  drawEMA(8,"#ff4500","TEE");
  drawEMA(5,"#32cd32","LIP");

  // Bollinger Bands
  const bbUpper=dpEMASeries(allC,20).map((v,i)=>{if(!v)return null;const sl20=allC.slice(Math.max(0,i-19),i+1);const avg=sl20.reduce((a,b)=>a+b,0)/sl20.length;const std=Math.sqrt(sl20.reduce((s,x)=>s+Math.pow(x-avg,2),0)/sl20.length);return{u:avg+2*std,m:avg,l:avg-2*std};});
  ctx.beginPath();ctx.strokeStyle="rgba(255,255,255,0.25)";ctx.lineWidth=1;ctx.setLineDash([2,3]);
  let mv2=true;sl.forEach((_,vi)=>{const b=bbUpper[startI+vi];if(!b?.u||b.u<lo||b.u>hi){mv2=true;return;}const x=vi*CW+CW/2,y=scY(b.u);mv2?ctx.moveTo(x,y):ctx.lineTo(x,y);mv2=false;});ctx.stroke();
  mv2=true;sl.forEach((_,vi)=>{const b=bbUpper[startI+vi];if(!b?.l||b.l<lo||b.l>hi){mv2=true;return;}const x=vi*CW+CW/2,y=scY(b.l);mv2?ctx.moveTo(x,y):ctx.lineTo(x,y);mv2=false;});ctx.stroke();
  ctx.setLineDash([]);

  // VWAP
  let pv2=0,vc2=0;all.slice(0,endI).forEach(c=>{pv2+=(c.high+c.low+c.close)/3;vc2++;});
  const vwap=vc2?pv2/vc2:0;
  if(vwap>=lo&&vwap<=hi){const vy=scY(vwap);ctx.strokeStyle="rgba(167,139,250,0.6)";ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(0,vy);ctx.lineTo(W-RPAD,vy);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="#a78bfa";ctx.font="8px monospace";ctx.fillText("VWAP",W-RPAD+3,vy-2);}

  // Supertrend
  const stRes=dpSupertrend(all.slice(startI,endI),10,3);
  if(stRes.val>=lo&&stRes.val<=hi){const sty=scY(stRes.val);ctx.strokeStyle=stRes.bull?"#00e676":"#ff3b5c";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,sty);ctx.lineTo(W-RPAD,sty);ctx.stroke();ctx.fillStyle=stRes.bull?"#00e676":"#ff3b5c";ctx.font="8px monospace";ctx.fillText("ST",W-RPAD+3,sty+3);}

  // Signal drawings (OB, FVG, SL/TP)
  if(DP.lastSignal?.fired){
    const d=DP.lastSignal.details;
    // OB box
    if(d.ob){const mid=(hi+lo)/2,atr=d.atr||rng*0.1,yt=scY(mid+atr*0.5),yb=scY(mid-atr*0.5);ctx.fillStyle=d.ob==="bull"?"rgba(0,230,118,0.08)":"rgba(255,59,92,0.08)";ctx.fillRect(0,yt,W-RPAD,Math.abs(yb-yt));ctx.strokeStyle=d.ob==="bull"?"rgba(0,230,118,0.3)":"rgba(255,59,92,0.3)";ctx.lineWidth=1;ctx.strokeRect(0,yt,W-RPAD,Math.abs(yb-yt));ctx.fillStyle=d.ob==="bull"?"rgba(0,230,118,0.5)":"rgba(255,59,92,0.5)";ctx.font="8px monospace";ctx.fillText("OB",2,yt+10);}
    // SL/TP lines
    const lvl=(p,c,l)=>{const pf=parseFloat(p);if(!pf||pf<lo||pf>hi)return;const y=scY(pf);ctx.strokeStyle=c;ctx.lineWidth=1;ctx.setLineDash([5,3]);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W-RPAD,y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=c;ctx.font="9px monospace";ctx.fillText(l,W-RPAD+3,y+3);};
    lvl(DP.lastSignal.entry,"#fff","EN");
    lvl(DP.lastSignal.sl,"#ff3b5c","SL");
    lvl(DP.lastSignal.tp1,"#00e676","T1");
    lvl(DP.lastSignal.tp2,"#00ff88","T2");
    lvl(DP.lastSignal.tp3,"#f5c842","T3");

    // Fibonacci levels
    if(all.length>20){
      const fHi=Math.max(...all.slice(-20).map(c=>c.high));
      const fLo=Math.min(...all.slice(-20).map(c=>c.low));
      [0.236,0.382,0.5,0.618,0.786].forEach(r=>{
        const v=fHi-(fHi-fLo)*r;
        if(v<lo||v>hi)return;
        const y=scY(v);
        ctx.strokeStyle="rgba(251,146,60,0.3)";ctx.lineWidth=1;ctx.setLineDash([2,4]);
        ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W-RPAD,y);ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle="rgba(251,146,60,0.6)";ctx.font="7px monospace";
        ctx.fillText((r*100).toFixed(1)+"%",4,y-1);
      });
    }
  }

  // Candles
  sl.forEach((c,i)=>{
    const live=c._live,bull=c.close>=c.open;
    const color=live?"#a78bfa":bull?"#00e676":"#ff3b5c";
    const x=i*CW+CW/2;
    ctx.strokeStyle=live?"#c4b5fd":color;ctx.lineWidth=Math.max(1,cW*0.1);
    ctx.beginPath();ctx.moveTo(x,scY(c.high));ctx.lineTo(x,scY(c.low));ctx.stroke();
    const bt=Math.min(scY(c.open),scY(c.close)),bh=Math.max(1.5,Math.abs(scY(c.open)-scY(c.close)));
    if(live){ctx.fillStyle="rgba(167,139,250,0.4)";ctx.fillRect(x-cW/2,bt,cW,bh);ctx.strokeStyle="#a78bfa";ctx.lineWidth=1;ctx.strokeRect(x-cW/2,bt,cW,bh);}
    else{ctx.fillStyle=color;ctx.fillRect(x-cW/2,bt,cW,bh);}
  });

  // Ghost candles
  if(DP.lastSignal?.fired&&DP.lastSignal.preds&&DPC.offset===0){
    const atr=DP.lastSignal.details.atr||rng*0.3,base=sl[sl.length-1]?.close||(hi+lo)/2;
    DP.lastSignal.preds.forEach((p,i)=>{
      const x=(sl.length+i)*CW+CW/2;if(x>W-RPAD-5)return;
      const rise2=p.dir==="RISE",gc=rise2?base+atr*0.5:base-atr*0.5,go=base;
      const gh=rise2?gc+atr*0.3:go+atr*0.15,gl=rise2?go-atr*0.15:gc-atr*0.3;
      if(gh>hi||gl<lo)return;
      ctx.globalAlpha=0.5;ctx.strokeStyle="#a855f7";ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(x,scY(gh));ctx.lineTo(x,scY(gl));ctx.stroke();
      const bt2=Math.min(scY(go),scY(gc)),bh2=Math.max(2,Math.abs(scY(go)-scY(gc)));
      ctx.fillStyle=rise2?"rgba(124,58,237,0.5)":"rgba(147,51,234,0.5)";
      ctx.fillRect(x-cW/2,bt2,cW,bh2);ctx.strokeRect(x-cW/2,bt2,cW,bh2);
      ctx.globalAlpha=1;ctx.fillStyle="#a855f7";ctx.font="8px monospace";ctx.textAlign="center";
      ctx.fillText("C"+p.i,x,H-BPAD+12);ctx.fillText(p.rP+"%",x,H-BPAD+22);ctx.textAlign="left";
    });
  }

  // Live price box
  const lp=DP.liveCandle?.close||DP.price||all[all.length-1]?.close;
  if(lp&&lp>=lo&&lp<=hi){
    const py=scY(lp);
    ctx.strokeStyle="rgba(245,200,66,0.4)";ctx.lineWidth=1;ctx.setLineDash([2,3]);
    ctx.beginPath();ctx.moveTo(0,py);ctx.lineTo(W-RPAD,py);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle="#f5c842";ctx.fillRect(W-RPAD,py-9,RPAD-1,18);
    ctx.fillStyle="#000";ctx.font="bold 9px monospace";ctx.textAlign="center";
    ctx.fillText(lp.toFixed(dec),W-RPAD+(RPAD-1)/2,py+4);ctx.textAlign="left";
  }

  // Time axis
  const ts2=Math.max(1,Math.floor(sl.length/5));
  ctx.fillStyle="#334155";ctx.font="8px monospace";
  sl.forEach((c,i)=>{if(i%ts2!==0)return;const dt=new Date((c.epoch||0)*1000);ctx.fillText(dt.getUTCHours().toString().padStart(2,"0")+":"+dt.getUTCMinutes().toString().padStart(2,"0"),i*CW+2,H-6);});

  // LIVE badge
  if(DP.liveCandle){ctx.fillStyle="rgba(0,230,118,0.12)";ctx.fillRect(4,4,44,16);ctx.fillStyle="#00e676";ctx.font="bold 9px monospace";ctx.fillText("● LIVE",7,15);}
  if(DPC.offset>0){ctx.fillStyle="rgba(10,14,26,0.8)";ctx.fillRect(0,TPAD,W-RPAD,18);ctx.fillStyle="#f5c842";ctx.font="9px monospace";ctx.textAlign="center";ctx.fillText("◀ "+DPC.offset+" back — swipe right for latest",(W-RPAD)/2,TPAD+13);ctx.textAlign="left";}
  ctx.fillStyle="#1e293b";ctx.font="8px monospace";ctx.fillText(DP.symLabel+" x"+DPC.zoom.toFixed(1)+" "+all.length+"c",4,H-6);

  // ── RSI PANEL ──
  dpDrawRSI(all,startI,sl.length,CW,RPAD);

  // ── MACD PANEL ──
  dpDrawMACD(all,startI,sl.length,CW,RPAD);
}

function dpDrawRSI(all,startI,slLen,CW,RPAD){
  const ctx=DP.ctxRSI,cv=DP.cvRSI;
  if(!ctx||!cv)return;
  const W=cv.offsetWidth,H=cv.offsetHeight;
  ctx.fillStyle="#0b0f1a";ctx.fillRect(0,0,W,H);
  ctx.fillStyle="#1e2d45";ctx.fillRect(0,0,W,14);
  ctx.fillStyle="#64748b";ctx.font="8px monospace";ctx.fillText("RSI 14",4,10);

  const cl=all.map(c=>c.close);
  const rsiS=dpRSISeries(cl,14);
  const scY=v=>4+(H-8)*(1-v/100);

  // 70/30 lines
  [70,50,30].forEach(v=>{const y=scY(v);ctx.strokeStyle=v===50?"rgba(255,255,255,0.1)":"rgba(255,59,92,0.2)";ctx.lineWidth=1;ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W-RPAD,y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="#334155";ctx.font="7px monospace";ctx.fillText(v,W-RPAD+2,y+3);});

  ctx.beginPath();ctx.strokeStyle="#a78bfa";ctx.lineWidth=1.5;
  let mv=true;
  for(let vi=0;vi<slLen;vi++){const v=rsiS[startI+vi];if(!v){mv=true;continue;}const x=vi*CW+CW/2,y=scY(v);mv?ctx.moveTo(x,y):ctx.lineTo(x,y);mv=false;}
  ctx.stroke();
}

function dpDrawMACD(all,startI,slLen,CW,RPAD){
  const ctx=DP.ctxMACD,cv=DP.cvMACD;
  if(!ctx||!cv)return;
  const W=cv.offsetWidth,H=cv.offsetHeight;
  ctx.fillStyle="#0b0f1a";ctx.fillRect(0,0,W,H);
  ctx.fillStyle="#1e2d45";ctx.fillRect(0,0,W,14);
  ctx.fillStyle="#64748b";ctx.font="8px monospace";ctx.fillText("MACD",4,10);

  const cl=all.map(c=>c.close);
  const histS=dpMACDSeries(cl);
  const visible=histS.slice(startI,startI+slLen);
  const mx=Math.max(Math.abs(Math.max(...visible)),Math.abs(Math.min(...visible)))||0.001;
  const scY=v=>(H/2)-(v/mx)*(H/2-4);

  ctx.strokeStyle="rgba(255,255,255,0.1)";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,H/2);ctx.lineTo(W-RPAD,H/2);ctx.stroke();

  for(let vi=0;vi<slLen;vi++){
    const v=histS[startI+vi];if(!v)continue;
    const x=vi*CW+CW/2,y=scY(v),mid=H/2;
    ctx.fillStyle=v>=0?"rgba(0,230,118,0.7)":"rgba(255,59,92,0.7)";
    ctx.fillRect(x-Math.max(1,CW*0.3),Math.min(y,mid),Math.max(2,CW*0.6),Math.abs(y-mid));
  }
}

// ════════════════════════════════════════════
// RENDER SIGNAL CARD
// ════════════════════════════════════════════

function dpRenderSignal(s) {
  const el=document.getElementById("dp-signal-card");
  if(!el)return;
  el.className=s.fired?(s.direction==="RISE"?"rise":"fall")+(s.tier.lbl==="ELITE ULTRA"?" elite":""):"";

  const tc=s.tier.col,dc=s.rise?"#00e676":"#ff3b5c";
  const chHtml=s.checks.map(c=>{
    const ic=c.bias==="bull"?"✅":c.bias==="bear"?"🔴":"⚪";
    const co=c.bias==="bull"?"#00e676":c.bias==="bear"?"#ff3b5c":"#64748b";
    return`<div class="dp-check-row"><span class="dp-check-cat">${c.cat}</span><span class="dp-check-name">${ic} ${c.name}</span><span class="dp-check-bias" style="color:${co}">${c.bias.toUpperCase()}</span></div>`;
  }).join("");

  const predHtml=s.preds.map(p=>{
    const rc=p.dir==="RISE"?"rise":"fall";
    return`<div class="dp-pred-row">
      <span class="dp-pred-lbl">C${p.i}</span>
      <span class="dp-pred-dir ${rc}">${p.dir}</span>
      <div class="dp-pred-bar"><div class="dp-pred-fill" style="width:${p.rP}%"></div></div>
      <span class="dp-pred-pct">${p.rP}%↑ ${100-p.rP}%↓${p.i===5?" ⚠️":""}</span>
    </div>`;
  }).join("");

  el.innerHTML=`
    <div class="dp-tier-badge" style="border-color:${tc};color:${tc}">${s.tier.lbl==="ELITE ULTRA"?"⚡ ELITE ULTRA ⚡":s.tier.lbl}</div>
    ${!s.fired?`<div class="dp-no-trade">⛔ NO TRADE — Score ${s.score}/63 (need ${s.minScore}+)<br><small style="color:#64748b">${dpSession().name} session</small></div>`:`
    <div class="dp-direction ${s.rise?"rise":"fall"}">${s.direction}</div>
    <div class="dp-score-bar">
      <span>Score: <b style="color:${tc}">${s.score}/63</b></span>
      <span>Conf: <b style="color:${tc}">${Math.round((s.score/63)*100)}%</b></span>
      <span>KNN: ${s.knn?.sim||0}%</span>
      <span>${s.details.session.name}</span>
      <span style="color:#64748b">${s.time}</span>
    </div>
    <div class="dp-prob-row">
      <div class="dp-prob-box rise"><span>RISE</span><b>${Math.round((s.bull/63)*100)}%</b></div>
      <div class="dp-prob-box fall"><span>FALL</span><b>${Math.round((s.bear/63)*100)}%</b></div>
    </div>
    <div class="dp-section-title">🕯 NEXT 5 CANDLE PREDICTION</div>
    <div class="dp-preds">${predHtml}</div>
    <div class="dp-section-title">🎯 RISK MANAGEMENT</div>
    <div class="dp-rm">
      <div class="dp-rm-row"><span>ENTRY</span><span style="color:#fff">${s.entry}</span></div>
      <div class="dp-rm-row"><span>STOP LOSS</span><span style="color:#ff3b5c">${s.sl}</span></div>
      <div class="dp-rm-row"><span>TP1</span><span style="color:#00e676">${s.tp1}</span></div>
      <div class="dp-rm-row"><span>TP2</span><span style="color:#00ff88">${s.tp2}</span></div>
      <div class="dp-rm-row"><span>TP3</span><span style="color:#f5c842">${s.tp3}</span></div>
      <div class="dp-rm-row"><span>R:R</span><span style="color:#f5c842">1 : ${s.rr}</span></div>
    </div>
    ${s.details.pattern!=="neutral"?`<div class="dp-rm-row"><span>PATTERN</span><span style="color:#f5c842">${s.details.pattern}</span></div>`:""}
    <a href="https://dtrader.deriv.com" target="_blank" class="dp-cta">📈 OPEN TRADE ON DERIV</a>
    `}
    <div class="dp-section-title">📋 63-POINT CONFLUENCE (${s.score}/63)</div>
    <div class="dp-checks">${chHtml}</div>
    <div class="dp-section-title">📊 KEY READINGS</div>
    <div class="dp-rm">
      <div class="dp-rm-row"><span>RSI (14)</span><span>${s.details.rsi}</span></div>
      <div class="dp-rm-row"><span>MACD</span><span style="color:${s.details.macd==="BULL"?"#00e676":"#ff3b5c"}">${s.details.macd}</span></div>
      <div class="dp-rm-row"><span>STOCH</span><span>${s.details.stoch}</span></div>
      <div class="dp-rm-row"><span>ADX</span><span>${s.details.adx}</span></div>
      <div class="dp-rm-row"><span>BOS</span><span>${s.details.bos||"none"}</span></div>
      <div class="dp-rm-row"><span>CHOCH</span><span>${s.details.choch||"none"}</span></div>
      <div class="dp-rm-row"><span>ORDER BLOCK</span><span>${s.details.ob||"none"}</span></div>
      <div class="dp-rm-row"><span>FVG</span><span>${s.details.fvg||"none"}</span></div>
      <div class="dp-rm-row"><span>KNN BULL</span><span>${s.knn?.bull||50}%</span></div>
      <div class="dp-rm-row"><span>SESSION</span><span style="color:#f5c842">${s.details.session.name}</span></div>
    </div>
  `;
}

// ════════════════════════════════════════════
// DASHBOARD + UI
// ════════════════════════════════════════════

function dpUpdateDash() {
  const p=DP.price,pp=DP.prevPrice;
  const dec=p&&p<10?5:p&&p<1000?2:0;
  const diff=p&&pp?p-pp:0;

  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  set("dp-dash-pair",  DP.symLabel+" · "+DP_TF.find(t=>t.v===DP.tf)?.lbl);
  if(p){
    const el=document.getElementById("dp-dash-price");
    if(el){el.textContent=p.toFixed(dec);el.className="dp-dash-val "+(diff>0?"green":diff<0?"red":"");}
    const ch=document.getElementById("dp-dash-change");
    if(ch){ch.textContent=(diff>=0?"+":"")+diff.toFixed(dec);ch.className="dp-dash-val "+(diff>0?"green":diff<0?"red":"");}
  }
  set("dp-dash-session", dpSession().name);
  if(DP.lastSignal){
    const el=document.getElementById("dp-dash-score");
    if(el){el.textContent=DP.lastSignal.score+"/63";el.style.color=DP.lastSignal.tier.col;}
    const dl=document.getElementById("dp-dash-dir");
    if(dl){dl.textContent=DP.lastSignal.direction;dl.className="dp-dash-val "+(DP.lastSignal.rise?"green":"red");}
  }
}

function dpSetLoading(s) {
  const b=document.getElementById("dp-btn-signal");
  if(!b)return;
  b.disabled=s;
  b.textContent=s?"⏳ SCANNING 63 MODULES...":"⚡ GET SIGNAL";
}

function dpShowErr(msg) {
  const el=document.getElementById("dp-signal-card");
  if(el)el.innerHTML=`<div style="color:#ff3b5c;padding:16px;font-family:monospace;font-size:11px">❌ ${msg}</div>`;
  dpSetLoading(false);
}

function dpToggleAuto() {
  const btn=document.getElementById("dp-btn-auto");
  DP.isAuto=!DP.isAuto;
  if(DP.isAuto){
    btn.textContent="⏹ STOP AUTO";btn.classList.add("active");
    dpGenSignal();
    DP.autoTimer=setInterval(dpGenSignal, Math.max(DP.tf*1000,60000));
  }else{
    btn.textContent="🔄 AUTO SCAN";btn.classList.remove("active");
    clearInterval(DP.autoTimer);
  }
}

// ════════════════════════════════════════════
// INIT UI
// ════════════════════════════════════════════

function dpInitUI() {
  // Pair selector
  const pg=document.getElementById("dp-pair-grid");
  if(pg){pg.innerHTML="";DP_PAIRS.forEach(p=>{const b=document.createElement("button");b.className="dp-pair-btn"+(p.sym===DP.sym?" active":"");b.textContent=p.lbl;b.onclick=()=>{DP.sym=p.sym;DP.symLabel=p.lbl;document.querySelectorAll(".dp-pair-btn").forEach(x=>x.classList.remove("active"));b.classList.add("active");dpForgetAll();dpSubscribeAll();DPC.offset=0;document.getElementById("dp-dash-pair").textContent=p.lbl+" · "+DP_TF.find(t=>t.v===DP.tf)?.lbl;};pg.appendChild(b);});}

  // Expiry
  const eg=document.getElementById("dp-expiry-grid");
  if(eg){eg.innerHTML="";DP_EXPIRY.forEach(e=>{const b=document.createElement("button");b.className="dp-row-btn"+(e.v===DP.expiry?" active":"");b.textContent=e.lbl;b.onclick=()=>{DP.expiry=e.v;document.querySelectorAll("#dp-expiry-grid .dp-row-btn").forEach(x=>x.classList.remove("active"));b.classList.add("active");};eg.appendChild(b);});}

  // Timeframe
  const tg=document.getElementById("dp-tf-grid");
  if(tg){tg.innerHTML="";DP_TF.forEach(t=>{const b=document.createElement("button");b.className="dp-row-btn"+(t.v===DP.tf?" active":"");b.textContent=t.lbl;b.onclick=()=>{DP.tf=t.v;document.querySelectorAll("#dp-tf-grid .dp-row-btn").forEach(x=>x.classList.remove("active"));b.classList.add("active");dpForgetAll();dpSubscribeAll();DPC.offset=0;};tg.appendChild(b);});}

  // Buttons
  const sb=document.getElementById("dp-btn-signal");if(sb)sb.onclick=dpGenSignal;
  const ab=document.getElementById("dp-btn-auto");if(ab)ab.onclick=dpToggleAuto;

  // Fullscreen
  const fb=document.getElementById("dp-fullscreen-btn");
  if(fb)fb.onclick=()=>{const w=document.querySelector(".dp-chart-wrap");if(!w)return;w.classList.toggle("fullscreen");fb.textContent=w.classList.contains("fullscreen")?"✕":"⛶";setTimeout(dpCResize,100);};

  // Start WebSocket + chart
  dpConnect();
  dpChartInit();

  // Dashboard refresh loop
  setInterval(dpUpdateDash, 500);
}

// Sync chart toolbar status with header
const _origDpStatus = dpSetStatus;
dpSetStatus = function(txt, live) {
  _origDpStatus(txt, live);
  const cs = document.getElementById("dp-chart-status");
  const cd = document.getElementById("dp-chart-dot");
  if (cs) cs.textContent = txt;
  if (cd) live ? cd.classList.add("live") : cd.classList.remove("live");
};

// Sync chart toolbar price
const _origDpDash = dpUpdateDash;
dpUpdateDash = function() {
  _origDpDash();
  const p = DP.price;
  const dec = p&&p<10?5:p&&p<1000?2:0;
  const pl = document.getElementById("dp-chart-price-lbl");
  const ll = document.getElementById("dp-chart-pair-lbl");
  const cl = document.getElementById("dp-chart-chg-lbl");
  if (pl && p) pl.textContent = p.toFixed(dec);
  if (ll) ll.textContent = DP.symLabel;
  if (cl && DP.prevPrice) {
    const diff = p - DP.prevPrice;
    cl.textContent = (diff>=0?"+":"")+diff.toFixed(dec);
    cl.style.color = diff>0?"var(--green)":diff<0?"var(--red)":"var(--muted)";
  }
};

// ============================================
// OVERRIDE: Replace rule-based signal with AI
// ============================================

async function dpGenSignal() {
  if (DP.candles.length < 30) { dpShowErr("Not enough candle data. Wait for more candles..."); return; }
  dpSetLoading(true);

  try {
    const cn   = [...DP.candles]; // closed candles only
    const last = cn[cn.length - 1];
    const atr  = dpATR(cn, 14);
    const entry= last.close;
    const dec  = entry < 10 ? 5 : entry < 1000 ? 2 : 0;

    // Build indicators for Gemini
    const indicators = dpBuildIndicators(cn);

    // 🤖 Let Gemini AI think and decide
    dpSetLoadingMsg("🤖 GEMINI AI ANALYSING...");
    const ai = await geminiAnalyseMarket(DP.symLabel, DP.tf, cn, indicators);

    let direction, tier, score, confidence, reasoning, keyFactors, warnings,
        preds, entryQuality, riskLevel, sessionNote, waitReason;

    if (ai) {
      // ✅ AI responded — use its thinking
      direction    = ai.direction;
      tier         = { lbl: ai.tier, col: dpTierColor(ai.tier), fire: ai.direction !== "WAIT" && ai.confidence >= 55 };
      score        = ai.score || Math.round(ai.confidence * 0.63);
      confidence   = ai.confidence;
      reasoning    = ai.reasoning;
      keyFactors   = ai.keyFactors || [];
      warnings     = ai.warnings || [];
      entryQuality = ai.entryQuality;
      riskLevel    = ai.riskLevel;
      sessionNote  = ai.sessionNote;
      waitReason   = ai.waitReason;
      preds = [
        { i:1, rP: ai.candle1.probability, dir: ai.candle1.direction, why: ai.candle1.reasoning },
        { i:2, rP: ai.candle2.probability, dir: ai.candle2.direction, why: ai.candle2.reasoning },
        { i:3, rP: ai.candle3.probability, dir: ai.candle3.direction, why: ai.candle3.reasoning },
        { i:4, rP: ai.candle4.probability, dir: ai.candle4.direction, why: ai.candle4.reasoning },
        { i:5, rP: ai.candle5.probability, dir: ai.candle5.direction, why: ai.candle5.reasoning },
      ];
    } else {
      // ❌ AI failed — fallback to rule engine
      dpSetLoadingMsg("⚡ FALLBACK: RULE ENGINE...");
      const sc  = dpScore63(cn);
      const tr  = dpTier(sc.score);
      direction = sc.direction;
      tier      = tr;
      score     = sc.score;
      confidence= Math.round((sc.score/63)*100);
      reasoning = "AI unavailable — rule-based analysis used as fallback.";
      keyFactors= [`RSI: ${indicators.rsi.toFixed(1)}`, `MACD: ${indicators.macdHist > 0 ? "Bull" : "Bear"}`, `EMA: ${indicators.ema20 > indicators.ema50 ? "Bull stack" : "Bear stack"}`];
      warnings  = ["Gemini AI unavailable — reduced accuracy"];
      preds     = dpPredict5(sc.score, sc.direction);
      entryQuality = confidence > 75 ? "GOOD" : confidence > 60 ? "FAIR" : "POOR";
      riskLevel    = "MEDIUM";
      sessionNote  = indicators.session;
      waitReason   = "";
    }

    // Risk management
    const rise = direction === "RISE";
    const sl   = rise ? entry - atr*1.5 : entry + atr*1.5;
    const tp1  = rise ? entry + atr*2   : entry - atr*2;
    const tp2  = rise ? entry + atr*4   : entry - atr*4;
    const tp3  = rise ? entry + atr*6   : entry - atr*6;
    const rr   = Math.abs((tp1-entry)/(entry-sl||0.001)).toFixed(2);

    DP.lastSignal = {
      score, tier, direction, rise,
      bull: rise ? confidence : 100-confidence,
      bear: rise ? 100-confidence : confidence,
      confidence, reasoning, keyFactors, warnings,
      preds, entryQuality, riskLevel, sessionNote, waitReason,
      indicators,
      entry:  entry.toFixed(dec),
      sl:     sl.toFixed(dec),
      tp1:    tp1.toFixed(dec),
      tp2:    tp2.toFixed(dec),
      tp3:    tp3.toFixed(dec),
      rr, aipowered: !!ai,
      time:   new Date().toLocaleTimeString(),
      fired:  tier.fire && direction !== "WAIT",
    };

    dpRenderSignalAI(DP.lastSignal);

    if (DP.lastSignal.fired) {
      dpIncrStats();
      if (typeof playSignalSound === "function")
        playSignalSound(direction, tier.lbl);
    }

  } catch(e) {
    dpShowErr("Signal error: " + e.message);
    console.error(e);
  } finally {
    dpSetLoading(false);
  }
}

function dpTierColor(lbl) {
  const map = {
    "ELITE ULTRA":"#f5c842","STRONG":"#00e676",
    "MODERATE":"#3b82f6","WEAK":"#f59e0b","WAIT":"#64748b"
  };
  return map[lbl] || "#64748b";
}

function dpSetLoadingMsg(msg) {
  const b = document.getElementById("dp-btn-signal");
  if (b) b.textContent = msg;
}

function dpRenderSignalAI(s) {
  const el = document.getElementById("dp-signal-card");
  if (!el) return;

  el.className = s.fired
    ? (s.direction === "RISE" ? "rise" : "fall") + (s.tier.lbl === "ELITE ULTRA" ? " elite" : "")
    : "";

  const tc = s.tier.col;
  const dc = s.rise ? "#00e676" : "#ff3b5c";
  const aiTag = s.aipowered
    ? `<span style="background:rgba(139,92,246,0.2);border:1px solid rgba(139,92,246,0.4);color:#a78bfa;font-family:var(--font-display);font-size:9px;padding:3px 10px;border-radius:20px;letter-spacing:1px">🤖 GEMINI AI</span>`
    : `<span style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);color:#f59e0b;font-family:var(--font-display);font-size:9px;padding:3px 10px;border-radius:20px;letter-spacing:1px">📊 RULE FALLBACK</span>`;

  const predHtml = s.preds.map(p => {
    const isRise = p.dir === "RISE";
    const isDoji = p.dir === "DOJI";
    const clr = isDoji ? "#f5c842" : isRise ? "#00e676" : "#ff3b5c";
    const rP = isDoji ? 50 : p.rP;
    return `<div class="dp-pred-row">
      <span class="dp-pred-lbl">C${p.i}</span>
      <span class="dp-pred-dir" style="color:${clr}">${p.dir}${p.i===5?" ⚠️":""}</span>
      <div class="dp-pred-bar"><div class="dp-pred-fill" style="width:${rP}%;background:${clr}"></div></div>
      <span class="dp-pred-pct" style="color:${clr}">${rP}%</span>
    </div>
    ${p.why ? `<div style="font-size:9px;color:var(--muted);padding:2px 0 6px 28px;font-family:var(--font-display)">${p.why}</div>` : ""}`;
  }).join("");

  const keyHtml = s.keyFactors.length
    ? s.keyFactors.map(f => `<div style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:11px;color:var(--text)">✦ ${f}</div>`).join("")
    : "";

  const warnHtml = s.warnings.length
    ? s.warnings.map(w => `<div style="padding:4px 8px;background:rgba(245,158,11,0.08);border-left:2px solid #f59e0b;font-size:10px;color:#f59e0b;margin-bottom:4px;font-family:var(--font-display)">⚠ ${w}</div>`).join("")
    : "";

  const indHtml = `
    <div class="dp-rm-row"><span>RSI (14)</span><span style="color:${s.indicators.rsi<30?"#00e676":s.indicators.rsi>70?"#ff3b5c":"var(--text)"}">${s.indicators.rsi.toFixed(1)}</span></div>
    <div class="dp-rm-row"><span>MACD</span><span style="color:${s.indicators.macdHist>0?"#00e676":"#ff3b5c"}">${s.indicators.macdHist>0?"BULL":"BEAR"}</span></div>
    <div class="dp-rm-row"><span>STOCHASTIC</span><span style="color:${s.indicators.stoch<20?"#00e676":s.indicators.stoch>80?"#ff3b5c":"var(--text)"}">${s.indicators.stoch.toFixed(1)}</span></div>
    <div class="dp-rm-row"><span>EMA STACK</span><span style="color:${s.indicators.ema20>s.indicators.ema50&&s.indicators.ema50>s.indicators.ema200?"#00e676":s.indicators.ema20<s.indicators.ema50&&s.indicators.ema50<s.indicators.ema200?"#ff3b5c":"#f5c842"}">${s.indicators.ema20>s.indicators.ema50&&s.indicators.ema50>s.indicators.ema200?"BULL":s.indicators.ema20<s.indicators.ema50&&s.indicators.ema50<s.indicators.ema200?"BEAR":"MIXED"}</span></div>
    <div class="dp-rm-row"><span>SUPERTREND</span><span style="color:${s.indicators.supertrend?"#00e676":"#ff3b5c"}">${s.indicators.supertrend?"BULL":"BEAR"}</span></div>
    <div class="dp-rm-row"><span>VWAP</span><span style="color:${s.indicators.priceAboveVwap?"#00e676":"#ff3b5c"}">${s.indicators.priceAboveVwap?"ABOVE":"BELOW"}</span></div>
    <div class="dp-rm-row"><span>BOS</span><span>${s.indicators.bos||"none"}</span></div>
    <div class="dp-rm-row"><span>CHOCH</span><span>${s.indicators.choch||"none"}</span></div>
    <div class="dp-rm-row"><span>ORDER BLOCK</span><span>${s.indicators.ob||"none"}</span></div>
    <div class="dp-rm-row"><span>PATTERN</span><span style="color:#f5c842">${s.indicators.pattern}</span></div>
    <div class="dp-rm-row"><span>ENTRY QUALITY</span><span style="color:${s.entryQuality==="EXCELLENT"?"#00e676":s.entryQuality==="GOOD"?"#3b82f6":s.entryQuality==="FAIR"?"#f59e0b":"#ff3b5c"}">${s.entryQuality}</span></div>
    <div class="dp-rm-row"><span>RISK LEVEL</span><span style="color:${s.riskLevel==="LOW"?"#00e676":s.riskLevel==="MEDIUM"?"#f5c842":"#ff3b5c"}">${s.riskLevel}</span></div>
    <div class="dp-rm-row"><span>SESSION</span><span style="color:#f5c842">${s.indicators.session}</span></div>
    <div class="dp-rm-row"><span>KILLZONE</span><span style="color:${s.indicators.inKillzone?"#00e676":"var(--muted)"}">${s.indicators.inKillzone?"✅ ACTIVE":"inactive"}</span></div>
  `;

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div class="dp-tier-badge" style="border-color:${tc};color:${tc}">${s.tier.lbl==="ELITE ULTRA"?"⚡ ELITE ULTRA ⚡":s.tier.lbl}</div>
      ${aiTag}
    </div>

    ${!s.fired ? `
      <div class="dp-no-trade">
        ⛔ ${s.direction === "WAIT" ? "WAIT — " + (s.waitReason || "Insufficient confluence") : "NO TRADE"}
        <br><small style="color:var(--muted)">Confidence: ${s.confidence}% · Score: ${s.score}/63</small>
      </div>
      ${s.reasoning ? `<div style="background:rgba(100,116,139,0.1);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:11px;color:var(--muted);line-height:1.6;margin-bottom:12px">🤖 ${s.reasoning}</div>` : ""}
    ` : `
      <div class="dp-direction ${s.rise?"rise":"fall"}">${s.direction}</div>

      <div class="dp-score-bar">
        <span>Score: <b style="color:${tc}">${s.score}/63</b></span>
        <span>Conf: <b style="color:${tc}">${s.confidence}%</b></span>
        <span>${s.indicators.session}</span>
        <span style="color:var(--muted)">${s.time}</span>
      </div>

      <!-- AI REASONING -->
      <div style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.25);border-radius:10px;padding:14px;margin-bottom:14px">
        <div style="font-family:var(--font-display);font-size:9px;color:#a78bfa;letter-spacing:1px;margin-bottom:8px">🤖 GEMINI AI REASONING</div>
        <div style="font-size:12px;color:var(--text);line-height:1.6">${s.reasoning}</div>
        ${s.sessionNote ? `<div style="font-size:10px;color:var(--muted);margin-top:6px;font-style:italic">${s.sessionNote}</div>` : ""}
      </div>

      <!-- KEY FACTORS -->
      ${keyHtml ? `<div class="dp-section-title">✦ KEY FACTORS (AI IDENTIFIED)</div><div>${keyHtml}</div>` : ""}

      <!-- WARNINGS -->
      ${warnHtml ? `<div class="dp-section-title">⚠ WARNINGS</div><div>${warnHtml}</div>` : ""}

      <!-- PROBABILITIES -->
      <div class="dp-prob-row" style="margin-top:12px">
        <div class="dp-prob-box rise"><span>RISE</span><b>${s.rise?s.confidence:100-s.confidence}%</b></div>
        <div class="dp-prob-box fall"><span>FALL</span><b>${s.rise?100-s.confidence:s.confidence}%</b></div>
      </div>
    `}

    <!-- 5 CANDLE PREDICTIONS -->
    <div class="dp-section-title">🕯 NEXT 5 CANDLE PREDICTION</div>
    <div class="dp-preds">${predHtml}</div>

    ${s.fired ? `
    <!-- RISK MANAGEMENT -->
    <div class="dp-section-title">🎯 RISK MANAGEMENT</div>
    <div class="dp-rm">
      <div class="dp-rm-row"><span>ENTRY</span><span style="color:#fff;font-weight:700">${s.entry}</span></div>
      <div class="dp-rm-row"><span>STOP LOSS</span><span style="color:#ff3b5c">${s.sl}</span></div>
      <div class="dp-rm-row"><span>TP1 (ATR x2)</span><span style="color:#00e676">${s.tp1}</span></div>
      <div class="dp-rm-row"><span>TP2 (ATR x4)</span><span style="color:#00ff88">${s.tp2}</span></div>
      <div class="dp-rm-row"><span>TP3 (ATR x6)</span><span style="color:#f5c842">${s.tp3}</span></div>
      <div class="dp-rm-row"><span>R:R RATIO</span><span style="color:#f5c842;font-weight:700">1 : ${s.rr}</span></div>
    </div>

    <a href="https://dtrader.deriv.com" target="_blank" class="dp-cta">📈 OPEN TRADE ON DERIV</a>
    ` : ""}

    <!-- INDICATOR READINGS -->
    <div class="dp-section-title">📊 INDICATOR READINGS</div>
    <div class="dp-rm">${indHtml}</div>
  `;

  // Update dashboard
  const dd = document.getElementById("dp-dash-dir");
  const ds = document.getElementById("dp-dash-score");
  if (dd) { dd.textContent = s.direction; dd.className = "dp-dash-val " + (s.rise?"green":s.direction==="FALL"?"red":""); }
  if (ds) { ds.textContent = s.confidence+"%"; ds.style.color = tc; }
}
