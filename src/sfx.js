/* Synthesised sound. Shared by the site and the /sfx audition page, so what you
   hear while tuning is exactly what ships. Every magic number lives in P. */

export const P = {
  master: 0.95,
  cast: { lo: 380, hi: 2400, dur: 0.42, gain: 0.75, tailGain: 0.38, tailDur: 0.26 },
  plop: { f0: 620, f1: 105, dur: 0.20, gain: 0.42, dropF: 1900, dropGain: 0.40, dropDur: 0.075 },
  bite: { thudF0: 190, thudF1: 82, thudGain: 0.36, blipF0: 300, blipF1: 660, blipGain: 0.20 },
  splash: { hi: 2600, lo: 420, dur: 0.34, gain: 0.52, toneF0: 420, toneF1: 140, toneGain: 0.24 },
  reel: { clicks: 20, dur: 1.0, gain: 0.30, hp: 2400, ease: 1.35, clickDur: 0.035 },
  land: { root: 523.25, step: 0.082, dur: 0.26, sqGain: 0.20, subGain: 0.24, rareGain: 0.18 },
  sparkle: { f0: 1046.5, step: 0.055, dur: 0.20, gain: 0.26, rise: 1.5 },
  tick: { hp: 3000, hissGain: 0.24, toneF0: 880, toneF1: 660, toneGain: 0.13 },
};
const BASE = JSON.parse(JSON.stringify(P));

/* the audition page can push a tuning here without a rebuild */
export function loadOverrides() {
  try {
    const raw = localStorage.getItem("ftf.sfx");
    if (!raw) return;
    const o = JSON.parse(raw);
    for (const k in o) {
      if (typeof o[k] === "object" && P[k]) Object.assign(P[k], o[k]);
      else if (k in P) P[k] = o[k];
    }
  } catch (e) { }
}
export const resetParams = () => { for (const k in BASE) P[k] = JSON.parse(JSON.stringify(BASE[k])); };
export const exportParams = () => JSON.stringify(P, null, 2);

let AC = null, BUS = null, NOISE = null, OUT = null, METER = null;
let ON = true;
try { ON = localStorage.getItem("ftf.sound") !== "0"; } catch (e) { }
export const isOn = () => ON;
export function setOn(v) {
  ON = !!v;
  try { localStorage.setItem("ftf.sound", ON ? "1" : "0"); } catch (e) { }
}

export function audio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!AC) {
    AC = new Ctx();
    BUS = AC.createGain();
    const comp = AC.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 14; comp.ratio.value = 6;
    comp.attack.value = 0.003; comp.release.value = 0.12;
    OUT = AC.createBiquadFilter();
    OUT.type = "lowpass"; OUT.frequency.value = 9500; OUT.Q.value = 0.4;
    BUS.connect(comp); comp.connect(OUT); OUT.connect(AC.destination);
  }
  BUS.gain.value = P.master;
  if (AC.state === "suspended") AC.resume();
  return AC;
}

/* one oscillator: exponential pitch slide, percussive envelope */
function bleep(c, t, type, f0, f1, dur, peak) {
  if (peak <= 0.0002 || dur <= 0.005) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(1, f0), t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur * 0.9);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.012, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(BUS);
  o.start(t); o.stop(t + dur + 0.02);
}
/* filtered noise: transients, whooshes, ratchet clicks */
function hiss(c, t, dur, peak, type, f0, f1, q) {
  if (peak <= 0.0002 || dur <= 0.003) return;
  if (!NOISE) {
    const n = Math.floor(c.sampleRate * 1.5);
    NOISE = c.createBuffer(1, n, c.sampleRate);
    const d = NOISE.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
  s.buffer = NOISE; s.loop = true;
  bp.type = type; bp.Q.value = q || 1;
  bp.frequency.setValueAtTime(Math.max(40, f0), t);
  if (f1 !== f0) bp.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + Math.min(0.03, dur * 0.25));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(bp); bp.connect(g); g.connect(BUS);
  s.start(t); s.stop(t + dur + 0.02);
}

export const SFX = {
  cast() {                                    // rod whipping through air
    const c = audio(); if (!c) return; const t = c.currentTime, p = P.cast;
    hiss(c, t, p.dur, p.gain, "bandpass", p.lo, p.hi, 0.8);
    hiss(c, t + p.dur * 0.28, p.tailDur, p.tailGain, "bandpass", p.hi * 0.9, p.lo * 1.6, 1.1);
  },
  plop() {                                    // bobber breaking the surface
    const c = audio(); if (!c) return; const t = c.currentTime, p = P.plop;
    bleep(c, t, "sine", p.f0, p.f1, p.dur, p.gain);
    hiss(c, t, p.dropDur, p.dropGain, "bandpass", p.dropF, p.dropF * 0.47, 1.4);
  },
  bite() {                                    // something down there
    const c = audio(); if (!c) return; const t = c.currentTime, p = P.bite;
    bleep(c, t, "sine", p.thudF0, p.thudF1, 0.13, p.thudGain);
    bleep(c, t + 0.05, "triangle", p.blipF0, p.blipF1, 0.14, p.blipGain);
  },
  splash() {                                  // fish leaves the water
    const c = audio(); if (!c) return; const t = c.currentTime, p = P.splash;
    hiss(c, t, p.dur, p.gain, "lowpass", p.hi, p.lo, 0.7);
    bleep(c, t, "sine", p.toneF0, p.toneF1, 0.16, p.toneGain);
  },
  reel(dur) {                                 // ratchet, slowing as it lands
    const c = audio(); if (!c) return; const t0 = c.currentTime, p = P.reel;
    const span = dur || p.dur, n = Math.max(3, Math.round(p.clicks));
    for (let i = 0; i < n; i++) {
      const k = i / n;
      hiss(c, t0 + Math.pow(k, p.ease) * span, p.clickDur, p.gain * (1 - k * 0.55), "highpass", p.hp, p.hp, 0.7);
    }
  },
  land(rare) {                                // the payoff
    const c = audio(); if (!c) return; const t = c.currentTime, p = P.land;
    const r = p.root;
    [r, r * 1.26, r * 1.5, r * 2].forEach((f, i) => {
      bleep(c, t + i * p.step, "square", f, f, p.dur, p.sqGain);
      bleep(c, t + i * p.step, "sine", f / 2, f / 2, p.dur * 1.25, p.subGain);
    });
    if (rare) [r * 2.52, r * 3].forEach((f, i) =>
      bleep(c, t + p.step * 4 + i * 0.075, "square", f, f, p.dur * 0.9, p.rareGain));
  },
  sparkle() {                                 // never-seen species
    const c = audio(); if (!c) return; const t = c.currentTime, p = P.sparkle;
    [p.f0, p.f0 * 1.335, p.f0 * 2].forEach((f, i) =>
      bleep(c, t + i * p.step, "triangle", f, f * p.rise, p.dur, p.gain));
  },
  tick() {
    const c = audio(); if (!c) return; const t = c.currentTime, p = P.tick;
    hiss(c, t, 0.028, p.hissGain, "highpass", p.hp, p.hp, 0.7);
    bleep(c, t, "sine", p.toneF0, p.toneF1, 0.05, p.toneGain);
  },
};

/* the audition page taps this so a silent output can be told apart from a broken one */
export function meter() {
  const c = audio(); if (!c) return null;
  if (!METER) { METER = c.createAnalyser(); METER.fftSize = 1024; OUT.connect(METER); }
  return METER;
}
export function testTone() {
  const c = audio(); if (!c) return;
  bleep(c, c.currentTime, "sine", 440, 440, 0.9, 0.45);
}

export const sfx = (name, arg) => { if (ON) { try { SFX[name](arg); } catch (e) { } } };

/* the real cast timings, so pacing can be judged rather than guessed */
export const SEQUENCE = [
  [0.00, "cast"], [0.88, "plop"], [1.88, "bite"],
  [2.68, "splash"], [2.68, "reel"], [3.73, "land"], [4.11, "sparkle"],
];
loadOverrides();
