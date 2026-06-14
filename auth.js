// ============================================
// PRINCEX EMPERE — Auth (Sign Up / Sign In)
// Supabase Email Auth
// ============================================

let currentUser = null;

async function initAuth() {
  // Check if already logged in
  const { data: { session } } = await db.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    showApp();
  } else {
    showAuthScreen();
  }

  // Listen for auth changes
  db.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session?.user) {
      currentUser = session.user;
      showApp();
    } else if (event === "SIGNED_OUT") {
      currentUser = null;
      showAuthScreen();
    }
  });
}

async function signUp() {
  const email    = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  const name     = document.getElementById("auth-name").value.trim();

  if (!email || !password || !name) {
    showAuthError("Please fill in all fields");
    return;
  }
  if (password.length < 6) {
    showAuthError("Password must be at least 6 characters");
    return;
  }

  setAuthLoading(true);

  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } }
  });

  setAuthLoading(false);

  if (error) {
    showAuthError(error.message);
  } else if (data.user && !data.session) {
    showAuthError("✅ Check your email to confirm your account!", "success");
  } else {
    currentUser = data.user;
    showApp();
  }
}

async function signIn() {
  const email    = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;

  if (!email || !password) {
    showAuthError("Please enter email and password");
    return;
  }

  setAuthLoading(true);

  const { data, error } = await db.auth.signInWithPassword({ email, password });

  setAuthLoading(false);

  if (error) {
    showAuthError(error.message);
  } else {
    currentUser = data.user;
    showApp();
  }
}

async function signOut() {
  await db.auth.signOut();
  currentUser = null;
  showAuthScreen();
}

async function resetPassword() {
  const email = document.getElementById("auth-email").value.trim();
  if (!email) { showAuthError("Enter your email first"); return; }

  const { error } = await db.auth.resetPasswordForEmail(email);
  if (error) showAuthError(error.message);
  else showAuthError("✅ Password reset email sent!", "success");
}

function showApp() {
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("main-app").style.display    = "block";

  // Show user info in header
  if (currentUser) {
    const name  = currentUser.user_metadata?.full_name || currentUser.email;
    const el    = document.getElementById("user-name");
    if (el) el.textContent = name.split(" ")[0].toUpperCase();
  }

  // Init app
  setTimeout(() => loadTradingViewChart("FX:EURUSD"), 800);
  setStatus(true);
  renderExpirySelector();
  renderStats();
  renderTrackerHistory();
}

function showAuthScreen() {
  document.getElementById("auth-screen").style.display = "flex";
  document.getElementById("main-app").style.display    = "none";
}

function showAuthError(msg, type = "error") {
  const el = document.getElementById("auth-error");
  if (!el) return;
  el.textContent   = msg;
  el.style.color   = type === "success" ? "#00e676" : "#ff3b5c";
  el.style.display = "block";
  if (type !== "success") setTimeout(() => { el.style.display = "none"; }, 4000);
}

function setAuthLoading(loading) {
  const btnIn  = document.getElementById("btn-signin");
  const btnUp  = document.getElementById("btn-signup");
  if (btnIn) btnIn.disabled = loading;
  if (btnUp) btnUp.disabled = loading;
  if (btnIn) btnIn.textContent = loading ? "..." : "SIGN IN";
  if (btnUp) btnUp.textContent = loading ? "..." : "SIGN UP";
}

function toggleAuthMode() {
  const nameField = document.getElementById("name-field");
  const title     = document.getElementById("auth-title");
  const subtitle  = document.getElementById("auth-subtitle");
  const isSignUp  = nameField.style.display === "none";

  nameField.style.display = isSignUp ? "block" : "none";
  title.textContent       = isSignUp ? "CREATE ACCOUNT" : "WELCOME BACK";
  subtitle.textContent    = isSignUp ? "Join Princex Empere" : "Sign in to continue";

  document.getElementById("auth-error").style.display = "none";
}
