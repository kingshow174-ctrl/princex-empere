// ============================================
// PRINCEX EMPERE — TradingView Chart v2
// ============================================

function loadTradingViewChart(symbol) {
  const container = document.getElementById("tradingview-widget");
  container.innerHTML = "";

  // Load TV script if not loaded yet
  if (!window.TradingView) {
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => renderWidget(symbol);
    script.onerror = () => {
      container.innerHTML = '<p style="color:#64748b;text-align:center;padding:20px;font-family:monospace">Chart unavailable — open in desktop browser</p>';
    };
    document.head.appendChild(script);
  } else {
    renderWidget(symbol);
  }
}

function renderWidget(symbol) {
  const container = document.getElementById("tradingview-widget");
  container.innerHTML = "";

  // TradingView needs a div with an ID
  const div = document.createElement("div");
  div.id = "tv_chart_container";
  div.style.height = "300px";
  div.style.width = "100%";
  container.appendChild(div);

  try {
    new TradingView.widget({
      container_id: "tv_chart_container",
      autosize: true,
      symbol: symbol,
      interval: "1",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      toolbar_bg: "#111827",
      enable_publishing: false,
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      height: 300,
      width: "100%",
      allow_symbol_change: false,
      studies: ["RSI@tv-basicstudies"],
      overrides: {
        "paneProperties.background": "#0a0e1a",
        "paneProperties.backgroundType": "solid",
        "scalesProperties.textColor": "#64748b",
        "candleStyle.upColor": "#00e676",
        "candleStyle.downColor": "#ff3b5c",
        "candleStyle.wickUpColor": "#00e676",
        "candleStyle.wickDownColor": "#ff3b5c",
        "candleStyle.borderUpColor": "#00e676",
        "candleStyle.borderDownColor": "#ff3b5c",
      }
    });
  } catch(e) {
    console.error("TradingView error:", e);
  }
}

// Auto-load EUR/USD chart on page ready
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    loadTradingViewChart("FX:EURUSD");
  }, 800);
});
