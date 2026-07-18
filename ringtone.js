// ============================================
// PRINCEX EMPERE — Signal Ringtone Engine
// Web Audio API — no external files needed
// ============================================

const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new AudioCtx();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playTone(freq, duration, type = "sine", gain = 0.3) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const vol = ctx.createGain();
  osc.connect(vol);
  vol.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  vol.gain.setValueAtTime(gain, ctx.currentTime);
  vol.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

function playSequence(notes, gap = 0.15) {
  const ctx = getAudioCtx();
  notes.forEach(([freq, dur, type, gain], i) => {
    setTimeout(() => playTone(freq, dur, type || "sine", gain || 0.3), i * gap * 1000);
  });
}

// ── SIGNAL RINGTONES ─────────────────────────

function ringBuySignal() {
  // Ascending cheerful — BUY
  playSequence([
    [440, 0.15, "sine", 0.3],
    [550, 0.15, "sine", 0.3],
    [660, 0.15, "sine", 0.3],
    [880, 0.3,  "sine", 0.4],
    [880, 0.15, "triangle", 0.2],
    [1100,0.4,  "sine", 0.3],
  ], 0.12);
}

function ringSellSignal() {
  // Descending alert — SELL
  playSequence([
    [880, 0.15, "sawtooth", 0.2],
    [660, 0.15, "sawtooth", 0.2],
    [550, 0.15, "sawtooth", 0.2],
    [440, 0.3,  "sawtooth", 0.3],
    [330, 0.4,  "sine",     0.3],
  ], 0.12);
}

function ringEliteSignal() {
  // Elite Ultra — dramatic fanfare
  playSequence([
    [523, 0.1, "square",   0.15],
    [659, 0.1, "square",   0.15],
    [784, 0.1, "square",   0.15],
    [1047,0.2, "sine",     0.3],
    [880, 0.1, "sine",     0.25],
    [1047,0.1, "sine",     0.25],
    [1319,0.5, "sine",     0.35],
    [1047,0.1, "triangle", 0.2],
    [1319,0.4, "sine",     0.3],
  ], 0.1);
}

function ringNoTrade() {
  // Short low buzz — no trade
  playSequence([
    [200, 0.2, "sawtooth", 0.15],
    [180, 0.3, "sawtooth", 0.1],
  ], 0.25);
}

function ringCountdownEnd() {
  // 3 beeps — signal expired
  playSequence([
    [880, 0.08, "square", 0.2],
    [880, 0.08, "square", 0.2],
    [880, 0.15, "square", 0.25],
  ], 0.18);
}

function playSignalSound(direction, tier) {
  if (typeof soundEnabled !== "undefined" && !soundEnabled) return;
  if (tier === "ELITE ULTRA") { ringEliteSignal(); return; }
  if (direction === "BUY"  || direction === "RISE") { ringBuySignal();  return; }
  if (direction === "SELL" || direction === "FALL") { ringSellSignal(); return; }
  ringNoTrade();
}

// ── SOUND SETTINGS ───────────────────────────

let soundEnabled = true;

function toggleSound() {
  soundEnabled = !soundEnabled;
  const btn = document.getElementById("btn-sound");
  if (btn) {
    btn.textContent = soundEnabled ? "🔔 SOUND ON" : "🔕 SOUND OFF";
    btn.style.color = soundEnabled ? "var(--green)" : "var(--muted)";
  }
  localStorage.setItem("princex_sound", soundEnabled ? "1" : "0");
}

function initSound() {
  const saved = localStorage.getItem("princex_sound");
  soundEnabled = saved !== "0"; // default ON
  const btn = document.getElementById("btn-sound");
  if (btn) {
    btn.textContent = soundEnabled ? "🔔 SOUND ON" : "🔕 SOUND OFF";
    btn.style.color = soundEnabled ? "var(--green)" : "var(--muted)";
    btn.addEventListener("click", () => {
      // Unlock audio context on first user interaction
      toggleSound();
      getAudioCtx(); // initialize
    });
  }
}
