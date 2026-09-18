// ============================================
// PRINCEX EMPERE — Auth System
// Email/Password + Name + Forgot Password
// Show/Hide Password
// ============================================

let currentUser = null;
let db = null;

function initAuth() {
  try {
    db = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
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
  }).catch(() => showAuthScreen("signin"));

  // Listen for auth changes
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

  clearAuthError();

  if (!name)             return showAuthError("Please enter your full name");
  if (!email)            return showAuthError("Please enter your email");
  if (!isValidEmail(email)) return showAuthError("Please enter a valid email");
  if (!pass)             return showAuthError("Please enter a password");
  if (pass.length < 6)   return showAuthError("Password must be at least 6 characters");
  if (pass !== conf)     return showAuthError("Passwords do not match");

  setAuthLoading(true, "CREATING ACCOUNT...");

  try {
    const { data, error } = await db.auth.signUp({
      email, password: pass,
      options: { data: { full_name: name } }
    });

    if (error) return showAuthError(error.message);

    if (data.user && !data.session) {
      showAuthSuccess("✅ Check your email to confirm your account, then sign in!");
      setTimeout(() => showAuthScreen("signin"), 3000);
    } else if (data.user) {
      currentUser = data.user;
      showApp();
    }
  } catch(e) {
    showAuthError("Sign up failed: " + e.message);
  } finally {
    setAuthLoading(false);
  }
}

// ── SIGN IN ───────────────────────────────────

async function signIn() {
  const email = document.getElementById("auth-email")?.value.trim();
  const pass  = document.getElementById("auth-password")?.value;

  clearAuthError();

  if (!email) return showAuthError("Please enter your email");
  if (!pass)  return showAuthError("Please enter your password");

  setAuthLoading(true, "SIGNING IN...");

  try {
    const { data, error } = await db.auth.signInWithPassword({ email, password: pass });
    if (error) return showAuthError(error.message);
    currentUser = data.user;
    showApp();
  } catch(e) {
    showAuthError("Sign in failed: " + e.message);
  } finally {
    setAuthLoading(false);
  }
}

// ── FORGOT PASSWORD ───────────────────────────

async function forgotPassword() {
  const email = document.getElementById("auth-email")?.value.trim();

  clearAuthError();

  if (!email)             return showAuthError("Enter your email address first");
  if (!isValidEmail(email)) return showAuthError("Enter a valid email address");

  setAuthLoading(true, "SENDING RESET EMAIL...");

  try {
    const { error } = await db.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/?reset=true"
    });
    if (error) return showAuthError(error.message);
    showAuthSuccess("✅ Password reset email sent! Check your inbox.");
  } catch(e) {
    showAuthError("Failed: " + e.message);
  } finally {
    setAuthLoading(false);
  }
}

// ── SIGN OUT ──────────────────────────────────

async function signOut() {
  const menu = document.getElementById("signout-menu");
  if (menu) menu.style.display = "none";
  await db.auth.signOut();
  currentUser = null;
  showAuthScreen("signin");
}

// ── SHOW/HIDE PASSWORD ────────────────────────

function togglePassword(inputId, btnId) {
  const input = document.getElementById(inputId);
  const btn   = document.getElementById(btnId);
  if (!input) return;
  if (input.type === "password") {
    input.type = "text";
    if (btn) btn.textContent = "🙈";
  } else {
    input.type = "password";
    if (btn) btn.textContent = "👁";
  }
}

// ── SWITCH SCREENS ────────────────────────────

function showAuthScreen(mode) {
  document.getElementById("auth-screen").style.display  = "flex";
  document.getElementById("main-app").style.display     = "none";
  clearAuthError();
  renderAuthForm(mode || "signin");
}

function renderAuthForm(mode) {
  const container = document.getElementById("auth-form-container");
  if (!container) return;

  if (mode === "signup") {
    container.innerHTML = `
      <div class="auth-logo">
        <span class="auth-logo-icon">👑</span>
        <div class="auth-logo-title">PRINCEX</div>
        <div class="auth-logo-sub">EMPERE · TRADING SIGNALS</div>
      </div>
      <div class="auth-card">
        <h2 class="auth-title">CREATE ACCOUNT</h2>
        <p class="auth-subtitle">Join Princex Empere today</p>

        <div class="auth-field">
          <label class="auth-label">FULL NAME</label>
          <input id="auth-name" type="text" class="auth-input"
            placeholder="Your full name"
            onkeydown="if(event.key==='Enter')signUp()">
        </div>

        <div class="auth-field">
          <label class="auth-label">EMAIL ADDRESS</label>
          <input id="auth-email" type="email" class="auth-input"
            placeholder="you@email.com"
            onkeydown="if(event.key==='Enter')signUp()">
        </div>

        <div class="auth-field">
          <label class="auth-label">PASSWORD</label>
          <div class="auth-input-wrap">
            <input id="auth-password" type="password" class="auth-input"
              placeholder="Min 6 characters"
              onkeydown="if(event.key==='Enter')signUp()">
            <button id="auth-pw-toggle" class="auth-eye-btn"
              onclick="togglePassword('auth-password','auth-pw-toggle')" type="button">👁</button>
          </div>
        </div>

        <div class="auth-field">
          <label class="auth-label">CONFIRM PASSWORD</label>
          <div class="auth-input-wrap">
            <input id="auth-confirm" type="password" class="auth-input"
              placeholder="Repeat password"
              onkeydown="if(event.key==='Enter')signUp()">
            <button id="auth-cf-toggle" class="auth-eye-btn"
              onclick="togglePassword('auth-confirm','auth-cf-toggle')" type="button">👁</button>
          </div>
        </div>

        <div id="auth-error" class="auth-error" style="display:none"></div>
        <div id="auth-success" class="auth-success" style="display:none"></div>

        <button class="auth-btn-primary" id="auth-submit-btn" onclick="signUp()">
          SIGN UP
        </button>

        <div class="auth-divider">Already have an account?</div>
        <button class="auth-btn-secondary" onclick="renderAuthForm('signin')">
          SIGN IN
        </button>
      </div>`;

  } else if (mode === "forgot") {
    container.innerHTML = `
      <div class="auth-logo">
        <span class="auth-logo-icon">👑</span>
        <div class="auth-logo-title">PRINCEX</div>
        <div class="auth-logo-sub">EMPERE · TRADING SIGNALS</div>
      </div>
      <div class="auth-card">
        <h2 class="auth-title">FORGOT PASSWORD</h2>
        <p class="auth-subtitle">Enter your email to reset your password</p>

        <div class="auth-field">
          <label class="auth-label">EMAIL ADDRESS</label>
          <input id="auth-email" type="email" class="auth-input"
            placeholder="you@email.com"
            onkeydown="if(event.key==='Enter')forgotPassword()">
        </div>

        <div id="auth-error" class="auth-error" style="display:none"></div>
        <div id="auth-success" class="auth-success" style="display:none"></div>

        <button class="auth-btn-primary" id="auth-submit-btn" onclick="forgotPassword()">
          SEND RESET LINK
        </button>

        <div class="auth-divider"></div>
        <button class="auth-btn-secondary" onclick="renderAuthForm('signin')">
          ← BACK TO SIGN IN
        </button>
      </div>`;

  } else {
    // SIGN IN (default)
    container.innerHTML = `
      <div class="auth-logo">
        <span class="auth-logo-icon">👑</span>
        <div class="auth-logo-title">PRINCEX</div>
        <div class="auth-logo-sub">EMPERE · TRADING SIGNALS</div>
      </div>
      <div class="auth-card">
        <h2 class="auth-title">WELCOME BACK</h2>
        <p class="auth-subtitle">Sign in to your account</p>

        <div class="auth-field">
          <label class="auth-label">EMAIL ADDRESS</label>
          <input id="auth-email" type="email" class="auth-input"
            placeholder="you@email.com"
            onkeydown="if(event.key==='Enter')signIn()">
        </div>

        <div class="auth-field">
          <label class="auth-label">PASSWORD</label>
          <div class="auth-input-wrap">
            <input id="auth-password" type="password" class="auth-input"
              placeholder="Your password"
              onkeydown="if(event.key==='Enter')signIn()">
            <button id="auth-pw-toggle" class="auth-eye-btn"
              onclick="togglePassword('auth-password','auth-pw-toggle')" type="button">👁</button>
          </div>
        </div>

        <div id="auth-error" class="auth-error" style="display:none"></div>
        <div id="auth-success" class="auth-success" style="display:none"></div>

        <button class="auth-btn-primary" id="auth-submit-btn" onclick="signIn()">
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
}

// ── SHOW APP ──────────────────────────────────

function showApp() {
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("main-app").style.display    = "block";

  // Set user name in header
  if (currentUser) {
    const name = currentUser.user_metadata?.full_name
              || currentUser.email?.split("@")[0]
              || "TRADER";
    const el = document.getElementById("user-name");
    if (el) el.textContent = name.split(" ")[0].toUpperCase();
  }

  // Init app
  setTimeout(() => {
    if (typeof loadTradingViewChart === "function") loadTradingViewChart("FX:EURUSD");
    if (typeof setStatus === "function") setStatus(true);
    if (typeof renderExpirySelector === "function") renderExpirySelector();
    if (typeof renderStats === "function") renderStats();
    if (typeof renderTrackerHistory === "function") renderTrackerHistory();
    if (typeof notifInit === "function") notifInit();
  }, 300);
}

// ── HELPERS ───────────────────────────────────

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showAuthError(msg) {
  const el = document.getElementById("auth-error");
  if (!el) return;
  el.textContent   = msg;
  el.style.display = "block";
  const success = document.getElementById("auth-success");
  if (success) success.style.display = "none";
}

function showAuthSuccess(msg) {
  const el = document.getElementById("auth-success");
  if (!el) return;
  el.textContent   = msg;
  el.style.display = "block";
  const error = document.getElementById("auth-error");
  if (error) error.style.display = "none";
}

function clearAuthError() {
  const e = document.getElementById("auth-error");
  const s = document.getElementById("auth-success");
  if (e) e.style.display = "none";
  if (s) s.style.display = "none";
}

function setAuthLoading(loading, msg) {
  const btn = document.getElementById("auth-submit-btn");
  if (!btn) return;
  btn.disabled    = loading;
  btn.textContent = loading ? (msg || "LOADING...") : btn.dataset.label || btn.textContent;
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
