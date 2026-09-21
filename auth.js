// ============================================
// PRINCEX EMPERE — Auth via Server Proxy
// Bypasses Supabase direct API key issues
// ============================================

let currentUser = null;
let authToken   = null;

function initAuth() {
  // Restore session from localStorage
  const saved = localStorage.getItem("px_session");
  if (saved) {
    try {
      const session = JSON.parse(saved);
      if (session.token && session.user) {
        authToken   = session.token;
        currentUser = session.user;
        // Verify token still valid
        verifySession().then(valid => {
          if (valid) showApp();
          else { clearSession(); showAuthScreen("signin"); }
        });
        return;
      }
    } catch(e) {}
  }
  showAuthScreen("signin");
}

async function verifySession() {
  if (!authToken) return false;
  try {
    const res = await fetch("/api/auth/user", {
      headers: { "Authorization": "Bearer " + authToken }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.id) { currentUser = data; return true; }
    }
    return false;
  } catch(e) { return false; }
}

function saveSession(token, user) {
  authToken   = token;
  currentUser = user;
  localStorage.setItem("px_session", JSON.stringify({ token, user }));
}

function clearSession() {
  authToken   = null;
  currentUser = null;
  localStorage.removeItem("px_session");
}

// ── SIGN UP ───────────────────────────────────

async function signUp() {
  const name  = document.getElementById("auth-name")?.value.trim();
  const email = document.getElementById("auth-email")?.value.trim();
  const pass  = document.getElementById("auth-password")?.value;
  const conf  = document.getElementById("auth-confirm")?.value;

  clearMsg();

  if (!name)                        return showErr("Please enter your full name");
  if (!email)                       return showErr("Please enter your email");
  if (!/\S+@\S+\.\S+/.test(email)) return showErr("Enter a valid email address");
  if (!pass)                        return showErr("Please enter a password");
  if (pass.length < 6)              return showErr("Password must be at least 6 characters");
  if (pass !== conf)                return showErr("Passwords do not match");

  setLoading(true, "CREATING ACCOUNT...");

  try {
    const res  = await fetch("/api/auth/signup", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password: pass, name })
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      const msg = data.error?.message || data.msg || "Sign up failed";
      if (msg.includes("already registered") || msg.includes("already exists")) {
        return showErr("This email is already registered. Please sign in.");
      }
      return showErr(msg);
    }

    // Auto sign in if session returned
    if (data.access_token) {
      saveSession(data.access_token, data.user);
      showApp();
    } else {
      showOk("✅ Account created! You can now sign in.");
      setTimeout(() => renderAuthForm("signin"), 2000);
    }
  } catch(e) {
    showErr("Network error: " + e.message);
  } finally {
    setLoading(false);
  }
}

// ── SIGN IN ───────────────────────────────────

async function signIn() {
  const email = document.getElementById("auth-email")?.value.trim();
  const pass  = document.getElementById("auth-password")?.value;

  clearMsg();

  if (!email) return showErr("Please enter your email");
  if (!pass)  return showErr("Please enter your password");

  setLoading(true, "SIGNING IN...");

  try {
    const res  = await fetch("/api/auth/signin", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password: pass })
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      const msg = data.error?.message || data.error_description || "Sign in failed";
      if (msg.includes("Invalid login") || msg.includes("invalid_grant")) {
        return showErr("Wrong email or password. Please try again.");
      }
      if (msg.includes("Email not confirmed")) {
        return showErr("Please confirm your email first. Check your inbox.");
      }
      return showErr(msg);
    }

    if (data.access_token && data.user) {
      saveSession(data.access_token, data.user);
      showApp();
    } else {
      showErr("Sign in failed. Please try again.");
    }
  } catch(e) {
    showErr("Network error: " + e.message);
  } finally {
    setLoading(false);
  }
}

// ── FORGOT PASSWORD ───────────────────────────

async function forgotPassword() {
  const email = document.getElementById("auth-email")?.value.trim();
  clearMsg();

  if (!email)                       return showErr("Enter your email address first");
  if (!/\S+@\S+\.\S+/.test(email)) return showErr("Enter a valid email address");

  setLoading(true, "SENDING RESET EMAIL...");

  try {
    const res = await fetch("/api/auth/forgot", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email })
    });

    showOk("✅ If this email exists, a reset link has been sent. Check your inbox.");
  } catch(e) {
    showErr("Network error: " + e.message);
  } finally {
    setLoading(false);
  }
}

// ── SIGN OUT ──────────────────────────────────

async function signOut() {
  const m = document.getElementById("signout-menu");
  if (m) m.style.display = "none";

  try {
    if (authToken) {
      await fetch("/api/auth/signout", {
        method:  "POST",
        headers: { "Authorization": "Bearer " + authToken }
      });
    }
  } catch(e) {}

  clearSession();
  showAuthScreen("signin");
}

// ── SHOW / HIDE PASSWORD ──────────────────────

function togglePassword(inputId, btnId) {
  const input = document.getElementById(inputId);
  const btn   = document.getElementById(btnId);
  if (!input) return;
  const hide  = input.type === "password";
  input.type  = hide ? "text" : "password";
  if (btn) btn.textContent = hide ? "🙈" : "👁";
}

// ── SCREENS ───────────────────────────────────

function showAuthScreen(mode) {
  const as = document.getElementById("auth-screen");
  const ma = document.getElementById("main-app");
  if (as) as.style.display = "flex";
  if (ma) ma.style.display = "none";
  renderAuthForm(mode || "signin");
}

function renderAuthForm(mode) {
  const c = document.getElementById("auth-form-container");
  if (!c) return;

  const logo = `
    <div class="auth-logo">
      <span class="auth-logo-icon">👑</span>
      <div class="auth-logo-title">PRINCEX</div>
      <div class="auth-logo-sub">EMPERE · TRADING SIGNALS</div>
    </div>`;

  if (mode === "signup") {
    c.innerHTML = logo + `
      <div class="auth-card">
        <h2 class="auth-title">CREATE ACCOUNT</h2>
        <p class="auth-subtitle">Join Princex Empere today</p>
        <div class="auth-field">
          <label class="auth-label">FULL NAME</label>
          <input id="auth-name" type="text" class="auth-input" placeholder="Your full name"
            onkeydown="if(event.key==='Enter')document.getElementById('auth-email').focus()">
        </div>
        <div class="auth-field">
          <label class="auth-label">EMAIL ADDRESS</label>
          <input id="auth-email" type="email" class="auth-input" placeholder="you@email.com"
            onkeydown="if(event.key==='Enter')document.getElementById('auth-password').focus()">
        </div>
        <div class="auth-field">
          <label class="auth-label">PASSWORD</label>
          <div class="auth-input-wrap">
            <input id="auth-password" type="password" class="auth-input" placeholder="Min 6 characters"
              onkeydown="if(event.key==='Enter')document.getElementById('auth-confirm').focus()">
            <button class="auth-eye-btn" id="eye1" type="button" onclick="togglePassword('auth-password','eye1')">👁</button>
          </div>
        </div>
        <div class="auth-field">
          <label class="auth-label">CONFIRM PASSWORD</label>
          <div class="auth-input-wrap">
            <input id="auth-confirm" type="password" class="auth-input" placeholder="Repeat your password"
              onkeydown="if(event.key==='Enter')signUp()">
            <button class="auth-eye-btn" id="eye2" type="button" onclick="togglePassword('auth-confirm','eye2')">👁</button>
          </div>
        </div>
        <div id="auth-error" class="auth-error" style="display:none"></div>
        <div id="auth-success" class="auth-success" style="display:none"></div>
        <button class="auth-btn-primary" id="auth-btn" onclick="signUp()">SIGN UP</button>
        <div class="auth-divider">Already have an account?</div>
        <button class="auth-btn-secondary" onclick="renderAuthForm('signin')">SIGN IN</button>
      </div>`;

  } else if (mode === "forgot") {
    c.innerHTML = logo + `
      <div class="auth-card">
        <h2 class="auth-title">RESET PASSWORD</h2>
        <p class="auth-subtitle">Enter your email to receive a reset link</p>
        <div class="auth-field">
          <label class="auth-label">EMAIL ADDRESS</label>
          <input id="auth-email" type="email" class="auth-input" placeholder="you@email.com"
            onkeydown="if(event.key==='Enter')forgotPassword()">
        </div>
        <div id="auth-error" class="auth-error" style="display:none"></div>
        <div id="auth-success" class="auth-success" style="display:none"></div>
        <button class="auth-btn-primary" id="auth-btn" onclick="forgotPassword()">SEND RESET LINK</button>
        <div class="auth-divider"></div>
        <button class="auth-btn-secondary" onclick="renderAuthForm('signin')">← BACK TO SIGN IN</button>
      </div>`;

  } else {
    c.innerHTML = logo + `
      <div class="auth-card">
        <h2 class="auth-title">WELCOME BACK</h2>
        <p class="auth-subtitle">Sign in to continue trading</p>
        <div class="auth-field">
          <label class="auth-label">EMAIL ADDRESS</label>
          <input id="auth-email" type="email" class="auth-input" placeholder="you@email.com"
            onkeydown="if(event.key==='Enter')document.getElementById('auth-password').focus()">
        </div>
        <div class="auth-field">
          <label class="auth-label">PASSWORD</label>
          <div class="auth-input-wrap">
            <input id="auth-password" type="password" class="auth-input" placeholder="Your password"
              onkeydown="if(event.key==='Enter')signIn()">
            <button class="auth-eye-btn" id="eye1" type="button" onclick="togglePassword('auth-password','eye1')">👁</button>
          </div>
        </div>
        <div id="auth-error" class="auth-error" style="display:none"></div>
        <div id="auth-success" class="auth-success" style="display:none"></div>
        <button class="auth-btn-primary" id="auth-btn" onclick="signIn()">SIGN IN</button>
        <button class="auth-btn-forgot" onclick="renderAuthForm('forgot')">Forgot password?</button>
        <div class="auth-divider">Don't have an account?</div>
        <button class="auth-btn-secondary" onclick="renderAuthForm('signup')">CREATE ACCOUNT</button>
      </div>`;
  }

  setTimeout(() => { const f = c.querySelector("input"); if (f) f.focus(); }, 100);
}

// ── SHOW APP ──────────────────────────────────

function showApp() {
  const as = document.getElementById("auth-screen");
  const ma = document.getElementById("main-app");
  if (as) as.style.display = "none";
  if (ma) ma.style.display = "block";

  if (currentUser) {
    const name = currentUser.user_metadata?.full_name
              || currentUser.email?.split("@")[0]
              || "TRADER";
    const el = document.getElementById("user-name");
    if (el) el.textContent = name.split(" ")[0].toUpperCase().slice(0,8);
  }

  setTimeout(() => {
    if (typeof loadTradingViewChart === "function") loadTradingViewChart("FX:EURUSD");
    if (typeof setStatus            === "function") setStatus(true);
    if (typeof renderExpirySelector === "function") renderExpirySelector();
    if (typeof renderStats          === "function") renderStats();
    if (typeof renderTrackerHistory === "function") renderTrackerHistory();
    if (typeof notifInit            === "function") notifInit();
    const bsg = document.getElementById("btn-get-signal");
    const bau = document.getElementById("btn-auto");
    if (bsg && !bsg._b) { bsg.addEventListener("click", onGetSignal);  bsg._b=true; }
    if (bau && !bau._b) { bau.addEventListener("click", onToggleAuto); bau._b=true; }
  }, 400);
}

// ── HELPERS ───────────────────────────────────

function showErr(msg) {
  const e = document.getElementById("auth-error");
  const s = document.getElementById("auth-success");
  if (e) { e.textContent = "❌ " + msg; e.style.display = "block"; }
  if (s) s.style.display = "none";
}

function showOk(msg) {
  const s = document.getElementById("auth-success");
  const e = document.getElementById("auth-error");
  if (s) { s.textContent = msg; s.style.display = "block"; }
  if (e) e.style.display = "none";
}

function clearMsg() {
  ["auth-error","auth-success"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
}

function setLoading(on, msg) {
  const btn = document.getElementById("auth-btn");
  if (!btn) return;
  btn.disabled = on;
  if (on) btn.dataset.orig = btn.textContent;
  btn.textContent = on ? (msg || "LOADING...") : (btn.dataset.orig || "SUBMIT");
}

function toggleSignoutMenu() {
  const m = document.getElementById("signout-menu");
  if (m) m.style.display = m.style.display === "block" ? "none" : "block";
}

document.addEventListener("click", e => {
  if (!e.target.closest(".user-badge") && !e.target.closest(".signout-menu")) {
    const m = document.getElementById("signout-menu");
    if (m) m.style.display = "none";
  }
});
