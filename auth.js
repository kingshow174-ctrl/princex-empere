// AUTH BYPASSED — app works without login
let currentUser = { id: "local", email: "user@princex.app", user_metadata: { full_name: "Trader" } };

async function initAuth() {
  showApp();
}

function showApp() {
  const authScreen = document.getElementById("auth-screen");
  const mainApp    = document.getElementById("main-app");
  if (authScreen) authScreen.style.display = "none";
  if (mainApp)    mainApp.style.display    = "block";

  const el = document.getElementById("user-name");
  if (el) el.textContent = "TRADER";

  setTimeout(() => loadTradingViewChart("FX:EURUSD"), 800);
  setStatus(true);
  renderExpirySelector();
  renderStats();
  renderTrackerHistory();
}

function showAuthScreen() { showApp(); }
async function signOut()   { showApp(); }
function signIn()          { showApp(); }
function signUp()          { showApp(); }
function toggleAuthMode()  {}
function resetPassword()   {}

// Init sound after app loads
const _origShowApp = showApp;
showApp = function() {
  _origShowApp();
  if (typeof initSound === "function") initSound();
};
