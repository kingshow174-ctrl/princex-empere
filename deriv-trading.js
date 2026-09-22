// ============================================
// PRINCEX EMPERE — Deriv Trading Engine
// App ID: 34tv9rqq3scT5pPK0yLcu
// OAuth Login + Real Balance + Rise/Fall Trading
// ============================================

const DERIV_APP_ID    = "34tv9rqq3scT5pPK0yLcu";
const DERIV_WS_URL    = `wss://ws.binaryws.com/websockets/v3?app_id=${DERIV_APP_ID}`;
const DERIV_OAUTH_URL = `https://oauth.deriv.com/oauth2/authorize?app_id=${DERIV_APP_ID}&l=en&brand=deriv`;

let tradingWS       = null;
let tradingToken    = null;
let tradingAccount  = null;
let tradingBalance  = null;
let tradingCurrency = "USD";
let tradingConnecting = false;
let tradingReconn   = null;
let pendingContracts= {};
let stakeAmount     = 10;
let tradingDuration = 3; // minutes
let activeSymbol    = "1HZ50V";

// ── OAUTH LOGIN ───────────────────────────────

function derivTradingLogin() {
  // Save current page to return after OAuth
  localStorage.setItem("deriv_oauth_return", window.location.href);
  window.location.href = DERIV_OAUTH_URL;
}

function derivTradingLogout() {
  tradingToken    = null;
  tradingAccount  = null;
  tradingBalance  = null;
  localStorage.removeItem("deriv_token");
  localStorage.removeItem("deriv_account");
  if (tradingWS) { tradingWS.close(); tradingWS = null; }
  renderTradingPanel();
}

// Handle OAuth callback — token comes in URL
function derivHandleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const token1 = params.get("token1");
  const acct1  = params.get("acct1");
  const cur1   = params.get("cur1");

  if (token1) {
    tradingToken    = token1;
    tradingAccount  = acct1;
    tradingCurrency = cur1 || "USD";
    localStorage.setItem("deriv_token",    token1);
    localStorage.setItem("deriv_account",  acct1 || "");
    localStorage.setItem("deriv_currency", cur1  || "USD");
    // Clean URL
    window.history.replaceState({}, "", window.location.pathname);
    derivTradingConnect();
  }
}

function derivRestoreSession() {
  const token = localStorage.getItem("deriv_token");
  if (token) {
    tradingToken    = token;
    tradingAccount  = localStorage.getItem("deriv_account") || "";
    tradingCurrency = localStorage.getItem("deriv_currency") || "USD";
    derivTradingConnect();
  }
}

// ── WEBSOCKET ─────────────────────────────────

function derivTradingConnect() {
  if (tradingConnecting) return;
  if (tradingWS?.readyState === WebSocket.OPEN) return;
  tradingConnecting = true;

  updateTradingStatus("CONNECTING...", false);
  tradingWS = new WebSocket(DERIV_WS_URL);

  tradingWS.onopen = () => {
    tradingConnecting = false;
    // Authorize with token
    if (tradingToken) {
      tradingWS.send(JSON.stringify({ authorize: tradingToken }));
    }
  };

  tradingWS.onmessage = e => tradingHandleMsg(JSON.parse(e.data));

  tradingWS.onerror = () => {
    tradingConnecting = false;
    updateTradingStatus("ERROR", false);
  };

  tradingWS.onclose = () => {
    tradingConnecting = false;
    updateTradingStatus("RECONNECTING...", false);
    clearTimeout(tradingReconn);
    tradingReconn = setTimeout(derivTradingConnect, 3000);
  };
}

function tradingSend(obj) {
  if (tradingWS?.readyState === WebSocket.OPEN) {
    tradingWS.send(JSON.stringify(obj));
  }
}

function tradingHandleMsg(data) {
  if (data.error) {
    console.warn("Deriv trading error:", data.error.message);
    if (data.error.code === "InvalidToken") {
      derivTradingLogout();
    }
    showTradingError(data.error.message);
    return;
  }

  // Authorization success
  if (data.msg_type === "authorize" && data.authorize) {
    tradingAccount  = data.authorize.loginid;
    tradingCurrency = data.authorize.currency;
    tradingBalance  = data.authorize.balance;
    updateTradingStatus("CONNECTED", true);
    // Subscribe to balance updates
    tradingSend({ balance: 1, subscribe: 1 });
    renderTradingPanel();
    return;
  }

  // Balance update
  if (data.msg_type === "balance" && data.balance) {
    tradingBalance = data.balance.balance;
    const el = document.getElementById("trading-balance");
    if (el) el.textContent = parseFloat(tradingBalance).toFixed(2) + " " + tradingCurrency;
    return;
  }

  // Contract purchase success
  if (data.msg_type === "buy" && data.buy) {
    const b = data.buy;
    pendingContracts[b.contract_id] = {
      id:         b.contract_id,
      type:       b.shortcode?.includes("CALL") ? "RISE" : "FALL",
      stake:      stakeAmount,
      entry:      b.buy_price,
      payout:     b.payout,
      symbol:     activeSymbol,
      time:       new Date().toLocaleTimeString(),
    };
    showTradingSuccess(`✅ Trade opened! Contract: ${b.contract_id}`);
    subscribeToPOC(b.contract_id);
    renderOpenContracts();
    return;
  }

  // Contract proposal
  if (data.msg_type === "proposal" && data.proposal) {
    const p = data.proposal;
    const type = p.contract_type;
    const elId = type === "CALL" ? "rise-payout" : "fall-payout";
    const el   = document.getElementById(elId);
    if (el) el.textContent = "Payout: " + parseFloat(p.payout || 0).toFixed(2) + " " + tradingCurrency;
    return;
  }

  // Contract update (POC)
  if (data.msg_type === "proposal_open_contract" && data.proposal_open_contract) {
    const poc = data.proposal_open_contract;
    const contract = pendingContracts[poc.contract_id];
    if (contract) {
      contract.status      = poc.status;
      contract.currentProfit = poc.profit;
      contract.currentSpot = poc.current_spot;
      if (poc.status === "sold" || poc.is_expired) {
        contract.result = poc.profit >= 0 ? "WIN" : "LOSS";
        contract.profit = poc.profit;
        delete pendingContracts[poc.contract_id];
        showContractResult(contract);
        // Update balance
        tradingSend({ balance: 1 });
      }
      renderOpenContracts();
    }
    return;
  }
}

function subscribeToPOC(contractId) {
  tradingSend({
    proposal_open_contract: 1,
    contract_id: contractId,
    subscribe: 1,
  });
}

// ── GET PROPOSAL (payout preview) ────────────

function getProposal(contractType) {
  if (!tradingToken || !tradingWS) return;
  tradingSend({
    proposal: 1,
    amount:   stakeAmount,
    basis:    "stake",
    contract_type: contractType,
    currency: tradingCurrency,
    duration: tradingDuration,
    duration_unit: "m",
    symbol: activeSymbol,
  });
}

function refreshProposals() {
  getProposal("CALL");
  setTimeout(() => getProposal("PUT"), 300);
}

// ── BUY CONTRACT ──────────────────────────────

async function buyContract(direction) {
  if (!tradingToken) {
    showTradingError("Please login with Deriv first");
    return;
  }
  if (!tradingWS || tradingWS.readyState !== WebSocket.OPEN) {
    showTradingError("Not connected to Deriv");
    return;
  }

  const contractType = direction === "RISE" ? "CALL" : "PUT";
  const btn = document.getElementById(direction === "RISE" ? "btn-buy-rise" : "btn-buy-fall");

  if (btn) {
    btn.disabled    = true;
    btn.textContent = "⏳ PLACING...";
  }

  try {
    // First get proposal
    const proposal = await getTradingProposal(contractType);
    if (!proposal) throw new Error("Could not get price. Try again.");

    // Buy using proposal ID
    tradingSend({
      buy:   proposal.id,
      price: stakeAmount,
    });

    // Sound
    if (typeof playSignalSound === "function") playSignalSound(direction, "MODERATE");

  } catch(e) {
    showTradingError(e.message);
  } finally {
    if (btn) {
      setTimeout(() => {
        btn.disabled    = false;
        btn.textContent = direction === "RISE" ? "⬆ RISE" : "⬇ FALL";
      }, 2000);
    }
  }
}

function getTradingProposal(contractType) {
  return new Promise((resolve, reject) => {
    if (!tradingWS || tradingWS.readyState !== WebSocket.OPEN) {
      reject(new Error("Not connected")); return;
    }
    const reqId = Math.floor(Math.random() * 99999);
    const timeout = setTimeout(() => {
      tradingWS.removeEventListener("message", handler);
      reject(new Error("Proposal timeout"));
    }, 8000);

    const handler = e => {
      const data = JSON.parse(e.data);
      if (data.req_id !== reqId) return;
      tradingWS.removeEventListener("message", handler);
      clearTimeout(timeout);
      if (data.error) { reject(new Error(data.error.message)); return; }
      if (data.proposal) resolve(data.proposal);
      else reject(new Error("No proposal received"));
    };

    tradingWS.addEventListener("message", handler);
    tradingSend({
      proposal: 1,
      req_id:   reqId,
      amount:   stakeAmount,
      basis:    "stake",
      contract_type: contractType,
      currency: tradingCurrency,
      duration: tradingDuration,
      duration_unit: "m",
      symbol: activeSymbol,
    });
  });
}

// ── RENDER TRADING PANEL ──────────────────────

function renderTradingPanel() {
  const el = document.getElementById("deriv-trading-panel");
  if (!el) return;

  if (!tradingToken) {
    el.innerHTML = `
      <div class="tp-login-wrap">
        <div class="tp-login-title">👑 TRADE ON DERIV</div>
        <div class="tp-login-sub">Login with your Deriv account to place Rise/Fall trades directly from the app</div>
        <button class="tp-login-btn" onclick="derivTradingLogin()">
          🔑 LOGIN WITH DERIV
        </button>
        <div class="tp-login-note">Powered by Deriv App ID: ${DERIV_APP_ID}</div>
      </div>`;
    return;
  }

  el.innerHTML = `
    <!-- ACCOUNT INFO -->
    <div class="tp-account">
      <div class="tp-account-left">
        <div class="tp-account-id">${tradingAccount || "Loading..."}</div>
        <div class="tp-balance" id="trading-balance">
          ${tradingBalance !== null ? parseFloat(tradingBalance).toFixed(2) + " " + tradingCurrency : "Loading..."}
        </div>
      </div>
      <div class="tp-account-right">
        <div class="tp-status-dot ${tradingWS?.readyState===1?"active":""}" id="tp-dot"></div>
        <span id="tp-status-txt" class="tp-status-txt">CONNECTED</span>
        <button class="tp-logout-btn" onclick="derivTradingLogout()">🚪</button>
      </div>
    </div>

    <!-- TRADING SETTINGS -->
    <div class="tp-settings">
      <div class="tp-setting-row">
        <span class="tp-setting-label">STAKE</span>
        <div class="tp-stake-control">
          <button class="tp-stake-btn" onclick="changeStake(-1)">−</button>
          <span id="tp-stake-display">${stakeAmount} ${tradingCurrency}</span>
          <button class="tp-stake-btn" onclick="changeStake(1)">+</button>
        </div>
      </div>
      <div class="tp-setting-row">
        <span class="tp-setting-label">DURATION</span>
        <div class="tp-duration-btns" id="tp-dur-btns">
          ${[1,2,3,5,10,15].map(d => `
            <button class="tp-dur-btn ${d===tradingDuration?"active":""}"
              onclick="setDuration(${d})">${d}m</button>
          `).join("")}
        </div>
      </div>
    </div>

    <!-- RISE / FALL BUTTONS -->
    <div class="tp-trade-btns">
      <button class="tp-rise-btn" id="btn-buy-rise" onclick="buyContract('RISE')">
        <span class="tp-btn-arrow">⬆</span>
        <span class="tp-btn-label">RISE</span>
        <span class="tp-btn-payout" id="rise-payout">Payout: --</span>
      </button>
      <button class="tp-fall-btn" id="btn-buy-fall" onclick="buyContract('FALL')">
        <span class="tp-btn-arrow">⬇</span>
        <span class="tp-btn-label">FALL</span>
        <span class="tp-btn-payout" id="fall-payout">Payout: --</span>
      </button>
    </div>

    <!-- TRADE MESSAGES -->
    <div id="tp-error"   class="tp-error"   style="display:none"></div>
    <div id="tp-success" class="tp-success" style="display:none"></div>

    <!-- OPEN CONTRACTS -->
    <div class="tp-contracts-title">📋 OPEN CONTRACTS</div>
    <div id="tp-contracts">
      <div class="tp-empty">No open contracts</div>
    </div>

    <!-- REFRESH PAYOUT -->
    <button class="tp-refresh-btn" onclick="refreshProposals()">🔄 REFRESH PAYOUT</button>
  `;

  // Load payouts
  setTimeout(refreshProposals, 500);
}

function renderOpenContracts() {
  const el = document.getElementById("tp-contracts");
  if (!el) return;
  const contracts = Object.values(pendingContracts);
  if (!contracts.length) {
    el.innerHTML = '<div class="tp-empty">No open contracts</div>';
    return;
  }
  el.innerHTML = contracts.map(c => `
    <div class="tp-contract-card ${c.type==="RISE"?"rise":"fall"}">
      <div class="tp-contract-header">
        <span class="tp-contract-type">${c.type==="RISE"?"⬆":"⬇"} ${c.type}</span>
        <span class="tp-contract-symbol">${c.symbol}</span>
        <span class="tp-contract-time">${c.time}</span>
      </div>
      <div class="tp-contract-row">
        <span>Stake: <b>${c.stake} ${tradingCurrency}</b></span>
        <span>Payout: <b>${c.payout || "--"}</b></span>
      </div>
      ${c.currentProfit !== undefined ? `
      <div class="tp-contract-profit ${c.currentProfit>=0?"pos":"neg"}">
        P/L: ${c.currentProfit>=0?"+":""}${parseFloat(c.currentProfit||0).toFixed(2)} ${tradingCurrency}
      </div>` : ""}
    </div>
  `).join("");
}

function showContractResult(contract) {
  const isWin = contract.result === "WIN";
  const msg   = `${isWin?"🎉 WIN":"💔 LOSS"} — ${contract.type} ${contract.symbol} | P/L: ${contract.profit>=0?"+":""}${parseFloat(contract.profit).toFixed(2)} ${tradingCurrency}`;

  // Show in panel
  const el = document.getElementById("tp-success");
  const er = document.getElementById("tp-error");
  if (isWin && el) {
    el.textContent   = msg;
    el.style.display = "block";
    setTimeout(() => el.style.display = "none", 6000);
    if (er) er.style.display = "none";
  } else if (!isWin && er) {
    er.textContent   = msg;
    er.style.display = "block";
    setTimeout(() => er.style.display = "none", 6000);
    if (el) el.style.display = "none";
  }

  // Sound
  if (typeof playSignalSound === "function")
    playSignalSound(isWin ? "BUY" : "SELL", isWin ? "STRONG" : "WEAK");
}

// ── CONTROLS ──────────────────────────────────

function changeStake(delta) {
  const steps = [1,2,5,10,20,50,100,200,500];
  const idx   = steps.findIndex(s => s >= stakeAmount);
  const newIdx= Math.max(0, Math.min(steps.length-1, (idx === -1 ? steps.length-1 : idx) + delta));
  stakeAmount = steps[newIdx];
  const el    = document.getElementById("tp-stake-display");
  if (el) el.textContent = stakeAmount + " " + tradingCurrency;
  refreshProposals();
}

function setDuration(d) {
  tradingDuration = d;
  document.querySelectorAll(".tp-dur-btn").forEach(b => {
    b.classList.toggle("active", parseInt(b.textContent) === d);
  });
  refreshProposals();
}

function updateTradingStatus(text, live) {
  const dot = document.getElementById("tp-dot");
  const txt = document.getElementById("tp-status-txt");
  if (dot) dot.className = "tp-status-dot" + (live ? " active" : "");
  if (txt) txt.textContent = text;
}

function showTradingError(msg) {
  const el = document.getElementById("tp-error");
  const ok = document.getElementById("tp-success");
  if (el) { el.textContent = "❌ " + msg; el.style.display = "block"; }
  if (ok) ok.style.display = "none";
  setTimeout(() => { if (el) el.style.display = "none"; }, 5000);
}

function showTradingSuccess(msg) {
  const el = document.getElementById("tp-success");
  const er = document.getElementById("tp-error");
  if (el) { el.textContent = msg; el.style.display = "block"; }
  if (er) er.style.display = "none";
  setTimeout(() => { if (el) el.style.display = "none"; }, 5000);
}

// ── UPDATE ACTIVE SYMBOL ──────────────────────
// Called when user changes pair in DERIV PRO tab

function tradingSetSymbol(symbol) {
  activeSymbol = symbol;
  refreshProposals();
}

// ── INIT ──────────────────────────────────────

function derivTradingInit() {
  derivHandleOAuthCallback();
  derivRestoreSession();
  renderTradingPanel();
}

document.addEventListener("DOMContentLoaded", derivTradingInit);
