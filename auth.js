// ============================================
// PRINCEX EMPERE — Auth System
// Fixed: waits for CONFIG before Supabase init
// ============================================

let currentUser = null;
let db          = null;

function initAuth() {
  // Wait until CONFIG is available
  if (typeof CONFIG === "undefined" || !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
    console.warn("CONFIG not ready, retrying...");
    setTimeout(initAuth, 200);
    return;
  }

  // Validate keys look real
  if (!CONFIG.SUPABASE_ANON_KEY.startsWith("eyJ")) {
    console.warn("Invalid Supabase key, showing app anyway");
    showApp();
    return;
  }

  // Init Supabase
  try {
    db = window.supabase.createClient(
      CONFIG.SUPABASE_URL,
      CONFIG.SUPABASE_ANON_KEY
    );
  } catch(e) {
    console.warn("Supabase init failed:", e.message);
    showApp();
    return;
  }

  // Check existing session
  db.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) {
      currentUser = session.user;
      showApp();
    } else {
      showAuthScreen("signin");
    }
  }).catch(e => {
    console.warn("Session check failed:", e.message);
    showAuthScreen("signin");
  });

  // Listen for auth state changes
  db.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session?.user) {
      currentUser = session.user;
      showApp();
    } else if (event === "SIGNED_OUT") {
      currentUser = null;
      showAuthScreen("signin");
    }
  });
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

  if (!db) return showErr("Connection error. Please refresh and try again.");

  setLoading(true, "CREATING ACCOUNT...");

  try {
    const { data, error } = await db.auth.signUp({
      email,
      password: pass,
      options: { data: { full_name: name } }
    });

    if (error) {
      if (error.message.includes("already registered")) {
        return showErr("This email is already registered. Please sign in.");
      }
      console.error("Auth error:", error); return showErr(error.message + " (code: " + (error.status||"?") + ")");
    }

    if (data.user && !data.session) {
      showOk("✅ Account created! Check your email to confirm, then sign in.");
      setTimeout(() => renderAuthForm("signin"), 3000);
    } else if (data.user) {
      currentUser = data.user;
      showApp();
    }
  } catch(e) {
    showErr("Sign up failed: " + e.message);
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
  if (!db)    return showErr("Connection error. Please refresh.");

  setLoading(true, "SIGNING IN...");

  try {
    const { data, error } = await db.auth.signInWithPassword({
      email, password: pass
    });
    if (error) {
      if (error.message.includes("Invalid login")) {
        return showErr("Wrong email or password. Please try again.");
      }
      if (error.message.includes("Email not confirmed")) {
        return showErr("Please confirm your email first. Check your inbox.");
      }
      console.error("Auth error:", error); return showErr(error.message + " (code: " + (error.status||"?") + ")");
    }
    currentUser = data.user;
    showApp();
  } catch(e) {
    showErr("Sign in failed: " + e.message);
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
  if (!db)                          return showErr("Connection error. Please refresh.");

  setLoading(true, "SENDING RESET EMAIL...");

  try {
    const { error } = await db.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });
    if (error) console.error("Auth error:", error); return showErr(error.message + " (code: " + (error.status||"?") + ")");
    showOk("✅ Password reset email sent! Check your inbox.");
  } catch(e) {
    showErr("Failed: " + e.message);
  } finally {
    setLoading(false);
  }
}

// ── SIGN OUT ──────────────────────────────────

async function signOut() {
  const m = document.getElementById("signout-menu");
  if (m) m.style.display = "none";
  if (db) await db.auth.signOut();
  currentUser = null;
  showAuthScreen("signin");
}

// ── SHOW/HIDE PASSWORD ────────────────────────

function togglePassword(inputId, btnId) {
  const input = document.getElementById(inputId);
  const btn   = document.getElementById(btnId);
  if (!input) return;
  const isHidden  = input.type === "password";
  input.type      = isHidden ? "text" : "password";
  if (btn) btn.textContent = isHidden ? "🙈" : "👁";
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
          <input id="auth-name" type="text" class="auth-input"
            placeholder="Your full name"
            autocomplete="name"
            onkeydown="if(event.key==='Enter')document.getElementById('auth-email').focus()">
        </div>

        <div class="auth-field">
          <label class="auth-label">EMAIL ADDRESS</label>
          <input id="auth-email" type="email" class="auth-input"
            placeholder="you@email.com"
            autocomplete="email"
            onkeydown="if(event.key==='Enter')document.getElementById('auth-password').focus()">
        </div>

        <div class="auth-field">
          <label class="auth-label">PASSWORD</label>
          <div class="auth-input-wrap">
            <input id="auth-password" type="password" class="auth-input"
              placeholder="Min 6 characters"
              autocomplete="new-password"
              onkeydown="if(event.key==='Enter')document.getElementById('auth-confirm').focus()">
            <button class="auth-eye-btn" id="eye1" type="button"
              onclick="togglePassword('auth-password','eye1')">👁</button>
          </div>
        </div>

        <div class="auth-field">
          <label class="auth-label">CONFIRM PASSWORD</label>
          <div class="auth-input-wrap">
            <input id="auth-confirm" type="password" class="auth-input"
              placeholder="Repeat your password"
              autocomplete="new-password"
              onkeydown="if(event.key==='Enter')signUp()">
            <button class="auth-eye-btn" id="eye2" type="button"
              onclick="togglePassword('auth-confirm','eye2')">👁</button>
          </div>
        </div>

        <div id="auth-error"   class="auth-error"   style="display:none"></div>
        <div id="auth-success" class="auth-success" style="display:none"></div>

        <button class="auth-btn-primary" id="auth-btn" onclick="signUp()">
          SIGN UP
        </button>

        <div class="auth-divider">Already have an account?</div>
        <button class="auth-btn-secondary" onclick="renderAuthForm('signin')">
          SIGN IN
        </button>
      </div>`;

  } else if (mode === "forgot") {
    c.innerHTML = logo + `
      <div class="auth-card">
        <h2 class="auth-title">RESET PASSWORD</h2>
        <p class="auth-subtitle">Enter your email to receive a reset link</p>

        <div class="auth-field">
          <label class="auth-label">EMAIL ADDRESS</label>
          <input id="auth-email" type="email" class="auth-input"
            placeholder="you@email.com"
            autocomplete="email"
            onkeydown="if(event.key==='Enter')forgotPassword()">
        </div>

        <div id="auth-error"   class="auth-error"   style="display:none"></div>
        <div id="auth-success" class="auth-success" style="display:none"></div>

        <button class="auth-btn-primary" id="auth-btn" onclick="forgotPassword()">
          SEND RESET LINK
        </button>

        <div class="auth-divider"></div>
        <button class="auth-btn-secondary" onclick="renderAuthForm('signin')">
          ← BACK TO SIGN IN
        </button>
      </div>`;

  } else {
    c.innerHTML = logo + `
      <div class="auth-card">
        <h2 class="auth-title">WELCOME BACK</h2>
        <p class="auth-subtitle">Sign in to continue trading</p>

        <div class="auth-field">
          <label class="auth-label">EMAIL ADDRESS</label>
          <input id="auth-email" type="email" class="auth-input"
            placeholder="you@email.com"
            autocomplete="email"
            onkeydown="if(event.key==='Enter')document.getElementById('auth-password').focus()">
        </div>

        <div class="auth-field">
          <label class="auth-label">PASSWORD</label>
          <div class="auth-input-wrap">
            <input id="auth-password" type="password" class="auth-input"
              placeholder="Your password"
              autocomplete="current-password"
              onkeydown="if(event.key==='Enter')signIn()">
            <button class="auth-eye-btn" id="eye1" type="button"
              onclick="togglePassword('auth-password','eye1')">👁</button>
          </div>
        </div>

        <div id="auth-error"   class="auth-error"   style="display:none"></div>
        <div id="auth-success" class="auth-success" style="display:none"></div>

        <button class="auth-btn-primary" id="auth-btn" onclick="signIn()">
          SIGN IN
        </button>

        <button class="auth-btn-forgot" onclick="renderAuthForm('forgot')">
          Forgot password?
        </button>

        <div class="auth-divider">Don't have an account?</div>
        <button class="auth-btn-secondary" onclick="renderAuthForm('signup')">
          CREATE ACCOUNT
        </button>
      </div>`;
  }

  setTimeout(() => {
    const first = c.querySelector("input");
    if (first) first.focus();
  }, 100);
}

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
    if (bsg && !bsg._bound) { bsg.addEventListener("click", onGetSignal); bsg._bound=true; }
    if (bau && !bau._bound) { bau.addEventListener("click", onToggleAuto); bau._bound=true; }
  }, 400);
}

// ── HELPERS ───────────────────────────────────

function showErr(msg) {
  const e = document.getElementById("auth-error");
  const s = document.getElementById("auth-success");
  if (e) { e.textContent = msg; e.style.display = "block"; }
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
