/* ══════════════════════════════════════════════════════════════════════
   SOUND — tiny synth, no assets
   ══════════════════════════════════════════════════════════════════════ */
let AC = null, noiseBuf = null;
function audio() {
  if (!AC) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    AC = new C();
    const n = AC.sampleRate * 0.4;
    noiseBuf = AC.createBuffer(1, n, AC.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  if (AC.state === "suspended") AC.resume();
  return AC;
}
function sfxClack(mag) {
  if (!G.sound) return; const c = audio(); if (!c) return;
  const t = c.currentTime;
  const v = clamp(mag / 900, 0.05, 0.5);
  const src = c.createBufferSource(); src.buffer = noiseBuf;
  const bp = c.createBiquadFilter(); bp.type = "bandpass";
  bp.frequency.value = lerp(2600, 900, clamp(mag / 1400, 0, 1));
  bp.Q.value = 2.2;
  const g = c.createGain();
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 0.075);
  src.connect(bp).connect(g).connect(c.destination);
  src.start(t); src.stop(t + 0.09);
}
function sfxFlick(power) {
  if (!G.sound) return; const c = audio(); if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator(); o.type = "triangle";
  o.frequency.setValueAtTime(lerp(150, 460, power), t);
  o.frequency.exponentialRampToValueAtTime(lerp(70, 120, power), t + 0.1);
  const g = c.createGain();
  g.gain.setValueAtTime(0.16 * (0.4 + power * 0.6), t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 0.13);
  o.connect(g).connect(c.destination);
  o.start(t); o.stop(t + 0.14);
}
function sfxOut() {
  if (!G.sound) return; const c = audio(); if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator(); o.type = "sawtooth";
  o.frequency.setValueAtTime(420, t);
  o.frequency.exponentialRampToValueAtTime(58, t + 0.42);
  const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1400;
  const g = c.createGain();
  g.gain.setValueAtTime(0.14, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 0.46);
  o.connect(f).connect(g).connect(c.destination);
  o.start(t); o.stop(t + 0.48);
}
