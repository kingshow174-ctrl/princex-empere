// ============================================
// PRINCEX EMPERE — Deriv OAuth2 Login
// Full PKCE flow — users login with Deriv
// ============================================

const DERIV_CLIENT_ID  = "YOUR_DERIV_CLIENT_ID"; // Register at developers.deriv.com
const DERIV_REDIRECT   = window.location.origin + "/deriv-callback";
const DERIV_AUTH_URL   = "https://auth.deriv.com/oauth2/auth";
const DERIV_TOKEN_URL  = "/api/deriv-token"; // proxied through our server

let derivUser = null;
let derivToken= null;

// ── STEP 1: Start OAuth login ─────────────────

async function derivOAuthLogin(mode = "login") {
  // Generate PKCE
  const array = crypto.getRandomValues(new Uint8Array(64));
  const codeVerifier = Array.from(array)
    .map(v => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"[v % 66])
    .join("");

  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");

  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2,"0")).join("");

  // Store for after redirect
  sessionStorage.setItem("pkce_verifier", codeVerifier);
  sessionStorage.setItem("oauth_state",   state);

  const params = new URLSearchParams({
    response_type:          "code",
    client_id:              DERIV_CLIENT_ID,
    redirect_uri:           DERIV_REDIRECT,
    scope:                  "trade account_manage",
    state,
    code_challenge:         codeChallenge,
    code_challenge_method:  "S256",
    ...(mode === "signup" ? { prompt: "registration" } : {})
  });

  window.location.href = DERIV_AUTH_URL + "?" + params.toString();
}

// ── STEP 2: Handle callback ───────────────────

async function handleDerivCallback() {
  const params = new URLSearchParams(window.location.search);
  const code   = params.get("code");
  const state  = params.get("state");
  const error  = params.get("error");

  if (error) {
    showDerivAuthError("Deriv login failed: " + params.get("error_description"));
    return;
  }

  if (!code || !state) return;

  // Verify state
  const savedState = sessionStorage.getItem("oauth_state");
  if (state !== savedState) {
    showDerivAuthError("Security check failed. Please try again.");
    return;
  }

  const codeVerifier = sessionStorage.getItem("pkce_verifier");
  sessionStorage.removeItem("oauth_state");
  sessionStorage.removeItem("pkce_verifier");

  // Exchange code for token via server
  try {
    const res = await fetch("/api/deriv-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, codeVerifier, redirectUri: DERIV_REDIRECT })
    });
    const data = await res.json();
    if (data.access_token) {
      derivToken = data.access_token;
      localStorage.setItem("deriv_token", derivToken);
      await loadDerivUser();
      window.history.replaceState({}, "", "/");
      showDerivUserPanel();
    } else {
      showDerivAuthError("Token exchange failed: " + (data.error || "unknown"));
    }
  } catch(e) {
    showDerivAuthError("Connection error: " + e.message);
  }
}

// ── STEP 3: Load user account ─────────────────

async function loadDerivUser() {
  if (!derivToken) return;
  try {
    const res = await fetch("https://api.derivws.com/trading/v1/accounts", {
      headers: { "Authorization": "Bearer " + derivToken }
    });
    const data = await res.json();
    if (data.accounts) {
      derivUser = data.accounts[0];
      localStorage.setItem("deriv_user", JSON.stringify(derivUser));
    }
  } catch(e) {
    console.warn("Could not load Deriv user:", e.message);
  }
}

// ── SESSION RESTORE ───────────────────────────

function restoreDerivSession() {
  const saved = localStorage.getItem("deriv_token");
  const user  = localStorage.getItem("deriv_user");
  if (saved) {
    derivToken = saved;
    if (user) derivUser = JSON.parse(user);
    return true;
  }
  return false;
}

function derivLogout() {
  derivToken = null;
  derivUser  = null;
  localStorage.removeItem("deriv_token");
  localStorage.removeItem("deriv_user");
  hideDerivUserPanel();
}

// ── UI ────────────────────────────────────────

function showDerivUserPanel() {
  const panel = document.getElementById("deriv-user-panel");
  if (!panel) return;

  const balance = derivUser?.balance ? `${derivUser.balance} ${derivUser.currency}` : "--";
  const name    = derivUser?.loginid || "Deriv Account";

  panel.innerHTML = `
    <div class="du-panel">
      <div class="du-info">
        <span class="du-avatar">👤</span>
        <div>
          <div class="du-name">${name}</div>
          <div class="du-balance">${balance}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <a href="https://dtrader.deriv.com" target="_blank" class="du-trade-btn">📈 TRADE</a>
        <button class="du-logout-btn" onclick="derivLogout()">🚪</button>
      </div>
    </div>`;
  panel.style.display = "block";
}

function hideDerivUserPanel() {
  const panel = document.getElementById("deriv-user-panel");
  if (panel) panel.style.display = "none";
  const loginBtns = document.getElementById("deriv-login-btns");
  if (loginBtns) loginBtns.style.display = "flex";
}

function showDerivAuthError(msg) {
  const el = document.getElementById("deriv-auth-error");
  if (el) { el.textContent = msg; el.style.display = "block"; }
  console.error(msg);
}

// ── INIT ──────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  // Check if returning from OAuth callback
  if (window.location.search.includes("code=")) {
    handleDerivCallback();
    return;
  }

  // Restore session
  if (restoreDerivSession()) {
    showDerivUserPanel();
  }
});
