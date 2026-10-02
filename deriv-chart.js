// ============================================
// PRINCEX EMPERE — Deriv Chart v8
// Built-in: Engulfing Arrows + Strategy Overlays
// All drawn in ONE pass — no re-draw conflicts
// ============================================

const DC = {
  candles: [], live: null, offset: 0, zoom: 1,
  drag: false, dragX: 0, dragOff: 0,
  pinch: 0, pinchZ: 1,
  raf: null, canvas: null, ctx: null,
  signal: null, price: null, sym: "V50",
};

function dcInit() {
  const cv = document.getElementById("dc-canvas");
  if (!cv) return;
  DC.canvas = cv;

  cv.addEventListener("touchstart", e => {
    e.preventDefault();
    if (e.touches.length === 1) {
      DC.drag = true;
      DC.dragX = e.touches[0].clientX;
      DC.dragOff = DC.offset;
    } else if (e.touches.length === 2) {
      DC.drag = false;
      DC.pinch = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
      DC.pinchZ = DC.zoom;
    }
  }, { passive: false });

  cv.addEventListener("touchmove", e => {
    e.preventDefault();
    if (e.touches.length === 1 && DC.drag) {
      const dx = DC.dragX - e.touches[0].clientX;
      DC.offset = Math.max(0, Math.min(dcMaxOff(), DC.dragOff + Math.round(dx / dcSW())));
    } else if (e.touches.length === 2) {
      const d = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
      DC.zoom = Math.max(0.2, Math.min(10, DC.pinchZ * d / (DC.pinch || d)));
    }
  }, { passive: false });

  cv.addEventListener("touchend",   () => DC.drag = false);
  cv.addEventListener("mousedown",  e  => { DC.drag=true; DC.dragX=e.clientX; DC.dragOff=DC.offset; });
  cv.addEventListener("mousemove",  e  => {
    if (!DC.drag) return;
    DC.offset = Math.max(0, Math.min(dcMaxOff(), DC.dragOff + Math.round((DC.dragX-e.clientX)/dcSW())));
  });
  cv.addEventListener("mouseup",    () => DC.drag = false);
  cv.addEventListener("mouseleave", () => DC.drag = false);
  cv.addEventListener("wheel", e => {
    e.preventDefault();
    DC.zoom = Math.max(0.2, Math.min(10, DC.zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
  }, { passive: false });

  dcResize();
  window.addEventListener("resize", dcResize);
  if (!DC.raf) dcLoop();
}

function dcResize() {
  const c = DC.canvas; if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  c.width = c.offsetWidth * dpr;
  c.height = c.offsetHeight * dpr;
  DC.ctx = c.getContext("2d");
  DC.ctx.scale(dpr, dpr);
}

function dcSW()     { return (DC.canvas?.offsetWidth - 65 || 300) / Math.max(5, Math.round(40/DC.zoom)); }
function dcMaxOff() { return Math.max(0, dcAll().length - Math.max(5, Math.round(40/DC.zoom))); }
function dcAll()    { return DC.live ? [...DC.candles, {...DC.live, _live:true}] : [...DC.candles]; }

function dcLoop() { dcDraw(); DC.raf = requestAnimationFrame(dcLoop); }

// ── INDICATOR HELPERS ─────────────────────────

function _buildEMA(closes, period) {
  if (closes.length < period) return new Array(closes.length).fill(null);
  const k = 2/(period+1), out = new Array(closes.length).fill(null);
  let e = closes.slice(0,period).reduce((a,b)=>a+b,0)/period;
  out[period-1] = e;
  for (let i=period; i<closes.length; i++) { e=closes[i]*k+e*(1-k); out[i]=e; }
  return out;
}

function _calcATR(candles, period, idx) {
  let sum=0, cnt=0;
  for (let i=Math.max(1,idx-period+1); i<=idx; i++) {
    const c=candles[i], p=candles[i-1];
    if (!c||!p) continue;
    sum += Math.max(c.high-c.low, Math.abs(c.high-p.close), Math.abs(c.low-p.close));
    cnt++;
  }
  return cnt>0 ? sum/cnt : 0.001;
}

function _getStrat(id, key) {
  if (typeof STRATEGIES === "undefined") return null;
  const def = (typeof STRATEGY_LIST !== "undefined")
    ? STRATEGY_LIST.find(s=>s.id===id)?.settings.find(s=>s.key===key)?.default
    : null;
  return STRATEGIES.settings?.[id]?.[key] ?? def;
}

function _stratActive(id) {
  if (typeof STRATEGIES === "undefined") return false;
  return STRATEGIES.active?.includes(id) || false;
}

// ── MAIN DRAW ─────────────────────────────────

function dcDraw() {
  const ctx = DC.ctx, canvas = DC.canvas;
  if (!ctx || !canvas) return;
  const W = canvas.offsetWidth, H = canvas.offsetHeight;
  if (!W || !H) return;

  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = "#0b0f1a";
  ctx.fillRect(0,0,W,H);

  const RPAD=65, TPAD=12, BPAD=26;
  const all  = dcAll();
  const vis  = Math.max(5, Math.round(40/DC.zoom));
  const endI = Math.min(all.length, Math.max(vis, all.length-DC.offset));
  const startI = Math.max(0, endI-vis);
  const sl   = all.slice(startI, endI);
  const CW   = (W-RPAD)/Math.max(sl.length,1);
  const cW   = Math.max(1.5, CW*0.65);

  if (!sl.length) {
    ctx.fillStyle="#475569"; ctx.font="12px monospace"; ctx.textAlign="center";
    ctx.fillText("Waiting for data...", (W-RPAD)/2, H/2);
    ctx.textAlign="left"; return;
  }

  // Price range from visible candles only
  let hi=-Infinity, lo=Infinity;
  sl.forEach(c => { hi=Math.max(hi,c.high); lo=Math.min(lo,c.low); });
  const rng = hi-lo || hi*0.01 || 1, pad = rng*0.15;
  hi+=pad; lo-=pad;
  const drawH = H-TPAD-BPAD;
  const scY   = v => TPAD + drawH*(1-(v-lo)/(hi-lo));
  const dec   = hi<10?5:hi<100?3:hi<10000?2:0;
  const closes = all.map(c=>c.close);

  // ── GRID ──
  for (let i=0; i<=5; i++) {
    const v=lo+(hi-lo)*i/5, y=scY(v);
    ctx.strokeStyle="rgba(255,255,255,0.04)"; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W-RPAD,y); ctx.stroke();
    ctx.fillStyle="#475569"; ctx.font="9px monospace"; ctx.textAlign="left";
    ctx.fillText(v.toFixed(dec), W-RPAD+3, y+3);
  }
  ctx.strokeStyle="#1e2d45"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(W-RPAD,TPAD); ctx.lineTo(W-RPAD,H-BPAD); ctx.stroke();

  // ── EMA LINES (always shown) ──
  const drawEMALine = (period, color, label) => {
    const s = _buildEMA(closes, period);
    ctx.beginPath(); ctx.strokeStyle=color; ctx.lineWidth=1.5;
    let mv=true, lv=null;
    sl.forEach((_,vi) => {
      const v=s[startI+vi]; if (!v||v<lo||v>hi){mv=true;return;}
      const x=vi*CW+CW/2, y=scY(v);
      mv?ctx.moveTo(x,y):ctx.lineTo(x,y); mv=false; lv={x,y,v};
    });
    ctx.stroke();
    if (lv) { ctx.fillStyle=color; ctx.font="8px monospace"; ctx.fillText(label+" "+lv.v.toFixed(dec),W-RPAD+3,lv.y-4); }
  };
  drawEMALine(20,"#3b82f6","E20");
  drawEMALine(50,"#f59e0b","E50");

  // ── VWAP (always shown) ──
  let pv=0, vc=0;
  ctx.beginPath(); ctx.strokeStyle="rgba(167,139,250,0.6)"; ctx.lineWidth=1; ctx.setLineDash([3,3]);
  let vmv=true;
  all.slice(0,endI).forEach((c,ai) => {
    pv+=(c.high+c.low+c.close)/3; vc++;
    if (ai<startI) return;
    const vi=ai-startI, v=pv/vc;
    if (v<lo||v>hi){vmv=true;return;}
    const x=vi*CW+CW/2, y=scY(v);
    vmv?ctx.moveTo(x,y):ctx.lineTo(x,y); vmv=false;
  });
  ctx.stroke(); ctx.setLineDash([]);

  // ── STRATEGY OVERLAYS (applied to full history) ──

  // BOLLINGER BANDS
  if (_stratActive("bollinger")) {
    const period=_getStrat("bollinger","period")||20;
    const std2=_getStrat("bollinger","std")||2;
    const col=_getStrat("bollinger","color")||"#3b82f6";
    ctx.strokeStyle=col+"90"; ctx.lineWidth=1; ctx.setLineDash([2,3]);
    ["u","m","l"].forEach(band => {
      ctx.beginPath(); let bmv=true;
      sl.forEach((_,vi) => {
        const ai=startI+vi;
        const sl2=closes.slice(Math.max(0,ai-period+1),ai+1);
        if (sl2.length<3){bmv=true;return;}
        const avg=sl2.reduce((a,b)=>a+b,0)/sl2.length;
        const s=Math.sqrt(sl2.reduce((s,v)=>s+Math.pow(v-avg,2),0)/sl2.length);
        const v=band==="u"?avg+std2*s:band==="l"?avg-std2*s:avg;
        if (v<lo||v>hi){bmv=true;return;}
        const x=vi*CW+CW/2, y=scY(v);
        bmv?ctx.moveTo(x,y):ctx.lineTo(x,y); bmv=false;
      });
      ctx.stroke();
    });
    ctx.setLineDash([]);
  }

  // SUPERTREND DOTS
  if (_stratActive("supertrend")) {
    const p=_getStrat("supertrend","period")||10;
    const m=_getStrat("supertrend","multiplier")||3;
    let tr="up", stV=sl[0]?.close||0;
    sl.forEach((c,vi) => {
      const ai=startI+vi;
      const atr=_calcATR(all,p,ai);
      const hl2=(c.high+c.low)/2;
      const bU=hl2+m*atr, bL=hl2-m*atr;
      if (c.close>stV) tr="up"; else if (c.close<stV) tr="down";
      stV=tr==="up"?Math.max(bL,stV):Math.min(bU,stV);
      const y=scY(stV);
      if (y<TPAD||y>H-BPAD) return;
      ctx.fillStyle=tr==="up"?"rgba(0,230,118,0.8)":"rgba(255,59,92,0.8)";
      ctx.beginPath(); ctx.arc(vi*CW+CW/2, y, 2.5, 0, Math.PI*2); ctx.fill();
    });
  }

  // FIBONACCI
  if (_stratActive("fibonacci")) {
    const lb=_getStrat("fibonacci","lookback")||30;
    const col=_getStrat("fibonacci","color")||"#fb923c";
    const fslc=all.slice(Math.max(0,startI+sl.length-lb), startI+sl.length);
    const fHi=Math.max(...fslc.map(c=>c.high));
    const fLo=Math.min(...fslc.map(c=>c.low));
    [0,0.236,0.382,0.5,0.618,0.786,1].forEach(r => {
      const v=fHi-(fHi-fLo)*r, y=scY(v);
      if (y<TPAD||y>H-BPAD) return;
      ctx.strokeStyle=col+"60"; ctx.lineWidth=1; ctx.setLineDash([2,4]);
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W-RPAD,y); ctx.stroke();
      ctx.fillStyle=col; ctx.font="8px monospace"; ctx.setLineDash([]);
      ctx.fillText("Fib "+(r*100).toFixed(1)+"%", 4, y-2);
    });
    ctx.setLineDash([]);
  }

  // SUPPORT & RESISTANCE
  if (_stratActive("support_resistance")) {
    const lb=_getStrat("support_resistance","lookback")||20;
    const sc=_getStrat("support_resistance","s_color")||"#00e676";
    const rc=_getStrat("support_resistance","r_color")||"#ff3b5c";
    const highs=[], lows=[];
    for (let i=2;i<sl.length-2;i++) {
      const w=sl.slice(i-2,i+3);
      if (sl[i].high===Math.max(...w.map(c=>c.high))) highs.push(sl[i].high);
      if (sl[i].low===Math.min(...w.map(c=>c.low)))   lows.push(sl[i].low);
    }
    [...new Set(highs)].slice(-3).forEach(v => {
      const y=scY(v); if (y<TPAD||y>H-BPAD) return;
      ctx.strokeStyle=rc; ctx.lineWidth=1; ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W-RPAD,y); ctx.stroke();
      ctx.fillStyle=rc; ctx.font="8px monospace"; ctx.setLineDash([]);
      ctx.fillText("R "+v.toFixed(dec), 4, y-2);
    });
    [...new Set(lows)].slice(-3).forEach(v => {
      const y=scY(v); if (y<TPAD||y>H-BPAD) return;
      ctx.strokeStyle=sc; ctx.lineWidth=1; ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W-RPAD,y); ctx.stroke();
      ctx.fillStyle=sc; ctx.font="8px monospace"; ctx.setLineDash([]);
      ctx.fillText("S "+v.toFixed(dec), 4, y-2);
    });
    ctx.setLineDash([]);
  }

  // PIVOT POINTS
  if (_stratActive("pivot_points") && all.length>1) {
    const prev=all[Math.max(0,startI-1)];
    const P=(prev.high+prev.low+prev.close)/3;
    const R1=2*P-prev.low, S1=2*P-prev.high;
    const R2=P+(prev.high-prev.low), S2=P-(prev.high-prev.low);
    [{v:P,c:"#fff",l:"P"},{v:R1,c:"#ff6b6b",l:"R1"},{v:S1,c:"#00e676",l:"S1"},
     {v:R2,c:"#ff3b5c",l:"R2"},{v:S2,c:"#00b388",l:"S2"}].forEach(({v,c,l}) => {
      const y=scY(v); if (y<TPAD||y>H-BPAD) return;
      ctx.strokeStyle=c; ctx.lineWidth=1; ctx.setLineDash([3,3]);
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W-RPAD,y); ctx.stroke();
      ctx.fillStyle=c; ctx.font="8px monospace"; ctx.setLineDash([]);
      ctx.fillText(l, W-RPAD+3, y-1);
    });
    ctx.setLineDash([]);
  }

  // SMC ZONES — Order Blocks + FVG
  if (_stratActive("smc_zones")) {
    const bCol=_getStrat("smc_zones","bull_col")||"#00e676";
    const rCol=_getStrat("smc_zones","bear_col")||"#ff3b5c";
    const showOB=_getStrat("smc_zones","show_ob")!==false;
    const showFVG=_getStrat("smc_zones","show_fvg")!==false;

    for (let i=1;i<sl.length-1;i++) {
      const c=sl[i], nx=sl[i+1], p=sl[i-1];
      if (!c||!nx||!p) continue;
      const x1=(i-0.5)*CW, x2=(i+1.5)*CW;

      if (showOB) {
        const body=Math.abs(c.close-c.open), nb=Math.abs(nx.close-nx.open);
        if (nb>body*1.5) {
          const bull=c.close<c.open&&nx.close>nx.open;
          const y1=scY(c.high), y2=scY(c.low);
          ctx.fillStyle=bull?bCol+"18":rCol+"18";
          ctx.strokeStyle=bull?bCol+"50":rCol+"50";
          ctx.lineWidth=1;
          ctx.fillRect(x1,y1,x2-x1,y2-y1);
          ctx.strokeRect(x1,y1,x2-x1,y2-y1);
          ctx.fillStyle=bull?bCol:rCol;
          ctx.font="7px monospace";
          ctx.fillText("OB", x1+2, y1+10);
        }
      }

      if (showFVG) {
        if (nx.low>p.high) {
          const y1=scY(p.high), y2=scY(nx.low);
          ctx.fillStyle=bCol+"15";
          ctx.fillRect(x1, y1, x2-x1, y2-y1);
          ctx.fillStyle=bCol+"80"; ctx.font="7px monospace";
          ctx.fillText("FVG", x1+2, y1+10);
        } else if (nx.high<p.low) {
          const y1=scY(nx.high), y2=scY(p.low);
          ctx.fillStyle=rCol+"15";
          ctx.fillRect(x1, y1, x2-x1, y2-y1);
          ctx.fillStyle=rCol+"80"; ctx.font="7px monospace";
          ctx.fillText("FVG", x1+2, y1+10);
        }
      }
    }
  }

  // EMA CROSS ARROWS
  if (_stratActive("ema_cross")) {
    const fast=_getStrat("ema_cross","fast")||20;
    const slow=_getStrat("ema_cross","slow")||50;
    const eFast=_buildEMA(closes,fast);
    const eSlow=_buildEMA(closes,slow);
    sl.forEach((_,vi) => {
      const ai=startI+vi;
      if (ai<1||!eFast[ai]||!eSlow[ai]||!eFast[ai-1]||!eSlow[ai-1]) return;
      const x=vi*CW+CW/2;
      if (eFast[ai-1]<=eSlow[ai-1]&&eFast[ai]>eSlow[ai]) {
        // Golden cross
        const y=scY(sl[vi].low)+12;
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x-8,y+16); ctx.lineTo(x+8,y+16);
        ctx.closePath(); ctx.fillStyle="#00e676";
        ctx.shadowColor="#00e676"; ctx.shadowBlur=10; ctx.fill(); ctx.shadowBlur=0;
        ctx.fillStyle="#00e676"; ctx.font="bold 8px monospace"; ctx.textAlign="center";
        ctx.fillText("CROSS▲", x, y+28); ctx.textAlign="left";
      } else if (eFast[ai-1]>=eSlow[ai-1]&&eFast[ai]<eSlow[ai]) {
        // Death cross
        const y=scY(sl[vi].high)-12;
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x-8,y-16); ctx.lineTo(x+8,y-16);
        ctx.closePath(); ctx.fillStyle="#ff3b5c";
        ctx.shadowColor="#ff3b5c"; ctx.shadowBlur=10; ctx.fill(); ctx.shadowBlur=0;
        ctx.fillStyle="#ff3b5c"; ctx.font="bold 8px monospace"; ctx.textAlign="center";
        ctx.fillText("CROSS▼", x, y-22); ctx.textAlign="left";
      }
    });
    ctx.shadowBlur=0;
  }

  // SL/TP LEVELS
  if (DC.signal?.fired) {
    const lvl=(price,color,lbl)=>{
      const pf=parseFloat(price); if (!pf||pf<lo||pf>hi) return;
      const y=scY(pf), bw=58;
      ctx.strokeStyle=color; ctx.lineWidth=1.5; ctx.setLineDash([5,3]);
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W-RPAD-bw-4,y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle=color;
      ctx.beginPath(); ctx.roundRect?ctx.roundRect(W-RPAD-bw-4,y-10,bw,20,4):ctx.rect(W-RPAD-bw-4,y-10,bw,20);
      ctx.fill();
      ctx.fillStyle="#000"; ctx.font="bold 9px monospace"; ctx.textAlign="center";
      ctx.fillText(lbl, W-RPAD-bw-4+bw/2, y+4); ctx.textAlign="left";
      ctx.fillStyle=color; ctx.fillRect(W-RPAD,y-9,RPAD-1,18);
      ctx.fillStyle="#000"; ctx.font="bold 9px monospace"; ctx.textAlign="center";
      ctx.fillText(pf.toFixed(dec), W-RPAD+(RPAD-1)/2, y+4); ctx.textAlign="left";
    };
    lvl(DC.signal.sl,    "#ff3b5c","🛡 SL");
    lvl(DC.signal.tp2,   "#00ff88","🎯 TP2");
    lvl(DC.signal.tp1,   "#00e676","✅ TP1");
    lvl(DC.signal.entry, "#ffffff","📍 ENTRY");
  }

  // ── CANDLES ──
  sl.forEach((c,i) => {
    const live=c._live, bull=c.close>=c.open;
    const color=live?"#a78bfa":(bull?"#00e676":"#ff3b5c");
    const x=i*CW+CW/2;
    const hY=scY(c.high), lY=scY(c.low);
    const oY=scY(c.open), clY=scY(c.close);
    const bTop=Math.min(oY,clY), bH=Math.max(1.5,Math.abs(oY-clY));

    ctx.strokeStyle=live?"#c4b5fd":color;
    ctx.lineWidth=Math.max(1,cW*0.1);
    ctx.beginPath(); ctx.moveTo(x,hY); ctx.lineTo(x,lY); ctx.stroke();

    if (live) {
      ctx.fillStyle="rgba(167,139,250,0.4)";
      ctx.fillRect(x-cW/2,bTop,cW,bH);
      ctx.strokeStyle="#a78bfa"; ctx.lineWidth=1;
      ctx.strokeRect(x-cW/2,bTop,cW,bH);
    } else {
      ctx.fillStyle=color;
      ctx.fillRect(x-cW/2,bTop,cW,bH);
    }
  });

  // ── ENGULFING ARROWS (drawn ON TOP of candles — full history) ──
  sl.forEach((c,i) => {
    if (i<1) return;
    const p=sl[i-1];
    const x=i*CW+CW/2;
    const bodyC=Math.abs(c.close-c.open);
    const bodyP=Math.abs(p.close-p.open);
    const bullC=c.close>c.open, bearC=c.close<c.open;
    const bullP=p.close>p.open, bearP=p.close<p.open;

    // BULLISH ENGULFING
    if (bullC&&bearP&&c.open<=p.close&&c.close>=p.open&&bodyC>bodyP) {
      const arrowY=scY(c.low)+10;
      ctx.beginPath();
      ctx.moveTo(x,      arrowY);
      ctx.lineTo(x-8,    arrowY+15);
      ctx.lineTo(x+8,    arrowY+15);
      ctx.closePath();
      ctx.fillStyle="#00e676";
      ctx.shadowColor="#00e676"; ctx.shadowBlur=12;
      ctx.fill(); ctx.shadowBlur=0;
      ctx.fillStyle="#00e676"; ctx.font="bold 8px monospace"; ctx.textAlign="center";
      ctx.fillText("BUY", x, arrowY+28); ctx.textAlign="left";
    }

    // BEARISH ENGULFING
    if (bearC&&bullP&&c.open>=p.close&&c.close<=p.open&&bodyC>bodyP) {
      const arrowY=scY(c.high)-10;
      ctx.beginPath();
      ctx.moveTo(x,      arrowY);
      ctx.lineTo(x-8,    arrowY-15);
      ctx.lineTo(x+8,    arrowY-15);
      ctx.closePath();
      ctx.fillStyle="#ff3b5c";
      ctx.shadowColor="#ff3b5c"; ctx.shadowBlur=12;
      ctx.fill(); ctx.shadowBlur=0;
      ctx.fillStyle="#ff3b5c"; ctx.font="bold 8px monospace"; ctx.textAlign="center";
      ctx.fillText("SELL", x, arrowY-22); ctx.textAlign="left";
    }
    ctx.shadowBlur=0;
  });

  // ── PINBAR markers ──
  if (_stratActive("pin_bar")) {
    const minR=_getStrat("pin_bar","min_ratio")||2;
    const col=_getStrat("pin_bar","color")||"#f5c842";
    sl.forEach((c,i) => {
      const body=Math.abs(c.close-c.open)||0.0001;
      const upper=c.high-Math.max(c.open,c.close);
      const lower=Math.min(c.open,c.close)-c.low;
      const x=i*CW+CW/2;
      ctx.fillStyle=col; ctx.textAlign="center";
      if (lower>body*minR) { ctx.font="14px monospace"; ctx.fillText("🔨",x,scY(c.low)+22); }
      else if (upper>body*minR) { ctx.font="14px monospace"; ctx.fillText("⭐",x,scY(c.high)-18); }
      ctx.textAlign="left";
    });
  }

  // ── GHOST CANDLES ──
  if (DC.signal?.fired&&DC.signal.predictions&&DC.offset===0) {
    const atr=parseFloat(DC.signal.details?.atr)||rng*0.3;
    const base=sl[sl.length-1]?.close||(hi+lo)/2;
    DC.signal.predictions.forEach((p,i)=>{
      const x=(sl.length+i)*CW+CW/2; if (x>W-RPAD-5) return;
      const rise=p.dir==="RISE";
      const gc=rise?base+atr*0.5:base-atr*0.5,go=base;
      const gh=rise?gc+atr*0.3:go+atr*0.15, gl=rise?go-atr*0.15:gc-atr*0.3;
      if (gh>hi||gl<lo) return;
      ctx.globalAlpha=0.5; ctx.strokeStyle="#a855f7"; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(x,scY(gh)); ctx.lineTo(x,scY(gl)); ctx.stroke();
      const bt=Math.min(scY(go),scY(gc)), bh2=Math.max(2,Math.abs(scY(go)-scY(gc)));
      ctx.fillStyle=rise?"rgba(124,58,237,0.5)":"rgba(147,51,234,0.5)";
      ctx.fillRect(x-cW/2,bt,cW,bh2); ctx.strokeRect(x-cW/2,bt,cW,bh2);
      ctx.globalAlpha=1; ctx.fillStyle="#a855f7"; ctx.font="8px monospace"; ctx.textAlign="center";
      ctx.fillText("C"+p.index,x,H-BPAD+12); ctx.fillText(p.riseP+"%",x,H-BPAD+22);
      ctx.textAlign="left";
    });
  }

  // ── LIVE PRICE BOX ──
  const lp=DC.live?.close||DC.price||all[all.length-1]?.close;
  if (lp&&lp>=lo&&lp<=hi) {
    const py=scY(lp);
    ctx.strokeStyle="rgba(245,200,66,0.4)"; ctx.lineWidth=1; ctx.setLineDash([2,3]);
    ctx.beginPath(); ctx.moveTo(0,py); ctx.lineTo(W-RPAD,py); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle="#f5c842"; ctx.fillRect(W-RPAD,py-9,RPAD-1,18);
    ctx.fillStyle="#000"; ctx.font="bold 9px monospace"; ctx.textAlign="center";
    ctx.fillText(lp.toFixed(dec), W-RPAD+(RPAD-1)/2, py+4); ctx.textAlign="left";
  }

  // ── TIME AXIS ──
  const ts=Math.max(1,Math.floor(sl.length/5));
  ctx.fillStyle="#334155"; ctx.font="8px monospace";
  sl.forEach((c,i)=>{
    if (i%ts!==0) return;
    const dt=new Date((c.epoch||0)*1000);
    ctx.fillText(dt.getUTCHours().toString().padStart(2,"0")+":"+dt.getUTCMinutes().toString().padStart(2,"0"),i*CW+2,H-6);
  });

  // ── OVERLAYS ──
  if (DC.live) {
    ctx.fillStyle="rgba(0,230,118,0.12)"; ctx.fillRect(4,4,44,16);
    ctx.fillStyle="#00e676"; ctx.font="bold 9px monospace"; ctx.fillText("● LIVE",7,15);
  }
  if (DC.offset>0) {
    ctx.fillStyle="rgba(10,14,26,0.8)"; ctx.fillRect(0,TPAD,W-RPAD,18);
    ctx.fillStyle="#f5c842"; ctx.font="9px monospace"; ctx.textAlign="center";
    ctx.fillText("◀ "+DC.offset+" back — swipe right for latest",(W-RPAD)/2,TPAD+13);
    ctx.textAlign="left";
  }
  ctx.fillStyle="#1e293b"; ctx.font="8px monospace";
  ctx.fillText(DC.sym+" x"+DC.zoom.toFixed(1)+" "+all.length+"c",4,H-6);
}

// ── PUBLIC API ────────────────────────────────

function loadDerivChart(sym, gran) {
  const c=document.getElementById("deriv-chart-container");
  if (!c) return;
  if (DC.raf){cancelAnimationFrame(DC.raf);DC.raf=null;}
  DC.sym=sym||"V50"; DC.offset=0; DC.zoom=1;
  c.innerHTML=`<canvas id="dc-canvas" style="width:100%;height:100%;display:block;touch-action:none;cursor:grab"></canvas>`;
  derivAddFullscreenBtn();
  dcInit();
}

function dcUpdateCandles(c){ DC.candles=c; DC.offset=0; }
function dcUpdateLiveCandle(c){ DC.live=c; }
function dcUpdateSignal(s){ DC.signal=s; }
function dcUpdatePrice(p){ DC.price=p; }

function derivAddFullscreenBtn(){
  const c=document.getElementById("deriv-chart-container");
  if (!c) return;
  c.querySelector(".deriv-chart-fullscreen")?.remove();
  const b=document.createElement("button");
  b.className="deriv-chart-fullscreen"; b.textContent="⛶";
  b.onclick=()=>{
    const o=document.querySelector(".deriv-chart-outer");
    if (!o) return;
    o.classList.toggle("fullscreen");
    b.textContent=o.classList.contains("fullscreen")?"✕":"⛶";
    setTimeout(dcResize,100);
  };
  c.appendChild(b);
}

function derivToggleFullscreen(){
  document.querySelector(".deriv-chart-fullscreen")?.click();
}
