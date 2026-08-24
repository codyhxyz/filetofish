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
  voice: { step: 0.056, gain: 0.40, pitch: 306, rise: 1.055,
           f1: 620, f2: 1750, f3: 2740, q: 2.6, tilt: 3400,
           glide: 0.013, fall: 0.13, ask: 0.20, hissGain: 0.17 },
};
const BASE = JSON.parse(JSON.stringify(P));
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

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
function bleep(c, t, type, f0, f1, dur, peak, dest) {
  if (peak <= 0.0002 || dur <= 0.005) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(1, f0), t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur * 0.9);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.012, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest || BUS);
  o.start(t); o.stop(t + dur + 0.02);
}
/* filtered noise: transients, whooshes, ratchet clicks */
function hiss(c, t, dur, peak, type, f0, f1, q, dest) {
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
  s.connect(bp); bp.connect(g); g.connect(dest || BUS);
  s.start(t); s.stop(t + dur + 0.02);
}

/* ---------------------------------------------------------------- animalese
   Speech with no recording anywhere in it. The Animal Crossing trick is to
   play a clip of a person *naming* each letter, sped up; the reason it reads
   as a language rather than as beeping is that the vowel you hear is the
   vowel in the letter's English NAME -- "b" is "bee", "k" is "kay", "r" is
   "ar" -- and the consonant those names start with survives as a transient.

   THE MOUTH NEVER CLOSES BETWEEN LETTERS. That is the whole design, and the
   first version got it wrong: it built a fresh oscillator and a fresh pair of
   filters per letter, which is a row of separate little instruments rather
   than one throat. Three things went audibly wrong with that, and all three
   are why it sat in the uncanny valley.

     1. The fundamental was 430 Hz and the formant filters had Q 5.5, which is
        a 113 Hz-wide window looking at harmonics spaced 430 Hz apart. F1 fell
        *between* two harmonics as often as on one, so its level lurched
        around as the pitch swept -- an inharmonic warble the ear reads as
        out-of-tune. A voice needs harmonics dense enough for a formant to
        always catch two or three: hence 306 Hz and Q 2.6.
     2. Every letter got an independent random pitch (+/-6%, a whole semitone)
        and letters overlapped. Two overlapping detuned tones is a beat
        frequency. That is not speech, that is a chorus pedal.
     3. Discrete letters cannot coarticulate. Real vowels slide into each
        other; cut them apart and you get Morse with a filter on it.

   So this is one oscillator and one formant bank for the whole line, running
   continuously from the first letter to the last. What makes a syllable is
   the amplitude envelope dipping and rising; what makes a consonant is *how
   far* it dips (a plosive shuts the throat almost completely, a fricative
   half, a nasal barely) plus a noise transient on top. Formant frequencies
   glide between vowels instead of jumping, which is coarticulation, and it is
   the single thing that stops a formant synth sounding like a modem.

   Three formants, not two. F1/F2 carry the vowel, but F3 is most of what
   makes a buzz sound like it came out of a head. The parallel branches
   alternate polarity, as in a Klatt synth, so they sum instead of notching
   each other where they overlap.

   VOW holds each vowel as a multiple of P.voice.f1/f2/f3, so the sliders move
   the whole mouth without flattening the vowels into each other. At the
   shipped 620/1750 they land on the textbook formants:
   a 806/1085, e 558/1837, i 298/2292, o 601/840, u 322/875. */
const VOW = {
  a: [1.30, 0.62, 0.96], e: [0.90, 1.05, 1.02], i: [0.48, 1.31, 1.06],
  o: [0.97, 0.48, 0.94], u: [0.52, 0.50, 0.93],
};
/* letter -> [vowel of its name, how that name starts: p plosive, f fricative,
   n nasal or liquid, "" straight in on the vowel] */
const LETTER = {
  a: ["e", ""], b: ["i", "p"], c: ["i", "f"], d: ["i", "p"], e: ["i", ""],
  f: ["e", "f"], g: ["i", "p"], h: ["a", "f"], i: ["a", ""], j: ["e", "p"],
  k: ["e", "p"], l: ["e", "n"], m: ["e", "n"], n: ["e", "n"], o: ["o", ""],
  p: ["i", "p"], q: ["u", "p"], r: ["a", "n"], s: ["e", "f"], t: ["i", "p"],
  u: ["u", ""], v: ["i", "f"], w: ["u", "p"], x: ["e", "f"], y: ["a", "f"],
  z: ["i", "f"],
};

/* how many `step`s a character is worth. Exported so a typewriter can be run
   off the same clock the voice is and the two can never drift apart. */
export function beats(ch) {
  if (ch === " ") return 0.9;
  if (/[.!?]/.test(ch)) return 3.4;
  if (/[,;:]/.test(ch)) return 2.0;
  return LETTER[ch.toLowerCase()] ? 1 : 0.35;
}

/* how far the throat shuts on the way into a letter. This is the consonant:
   a plosive is a stop, so it goes almost silent and then bursts; a fricative
   is half-open behind a wash of air; a nasal barely dips at all. */
const DIP = { p: 0.05, f: 0.17, n: 0.52, "": 0.58 };
/* a deterministic wobble per letter -- life, but the same life every time, so
   a line does not shimmer differently on each reading */
const wob = i => {
  const x = Math.sin(i * 12.9898 + 1.3) * 43758.5453;
  return x - Math.floor(x);
};

const SILENT = { on: false, dur: 0, stop() { } };

/* Say a line. One oscillator, one formant bank, everything scheduled up front,
   so stopping mid-sentence is a single ramp rather than a pile of cancelled
   timers. Returns { on, dur, stop() }. */
export function speak(text, opt) {
  if (!ON) return SILENT;
  const c = audio();
  /* a suspended context does not drop what you schedule on it, it hoards it
     and fires the lot at once on resume -- so before the first gesture the
     only safe thing to say is nothing */
  if (!c || c.state !== "running") return SILENT;
  const p = P.voice, o = opt || {};
  const out = c.createGain();
  out.gain.value = o.gain === undefined ? 1 : o.gain;
  out.connect(BUS);

  const s = String(text).toLowerCase();
  const base = Math.max(40, p.pitch * (o.pitch || 1));
  const ask = /\?\s*$/.test(s);
  const t0 = c.currentTime + 0.05, pre = t0 - 0.02;

  /* --- the throat: saw -> envelope -> spectral tilt -> three formants ----- */
  const osc = c.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(base, pre);
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, pre);
  /* a raw sawtooth is all fizz above the formants; rolling the top off is what
     the difference between a buzzer and a mouth mostly is */
  const tilt = c.createBiquadFilter();
  tilt.type = "lowpass"; tilt.frequency.value = Math.max(700, p.tilt); tilt.Q.value = 0.5;
  osc.connect(env); env.connect(tilt);

  const first = VOW[(LETTER[[...s].find(ch => LETTER[ch])] || ["e"])[0]] || VOW.e;
  const CF = [p.f1, p.f2, p.f3 || 2740];
  /* alternating polarity so the branches sum where they overlap instead of
     notching each other -- the parallel-branch trick out of Klatt */
  const AMP = [1, -0.55, 0.24];
  const bands = CF.map((cf, i) => {
    const bp = c.createBiquadFilter(), g = c.createGain();
    bp.type = "bandpass";
    bp.Q.setValueAtTime(Math.max(0.4, p.q * (i ? 1.2 : 1)), pre);
    bp.frequency.setValueAtTime(Math.max(80, cf * first[i]), pre);
    g.gain.value = AMP[i] * p.gain;
    tilt.connect(bp); bp.connect(g); g.connect(out);
    return bp;
  });

  let t = t0, said = 0, word = true;
  const n = Math.max(1, s.length);
  for (let i = 0; i < s.length && said < 140; i++) {
    const ch = s[i], L = LETTER[ch], cost = p.step * beats(ch);
    if (!L) {
      /* a space or a full stop is the one place the mouth actually shuts */
      if (said) env.gain.linearRampToValueAtTime(0.0001, t + Math.min(0.05, cost * 0.5));
      t += cost; word = true;
      continue;
    }
    const next = t + cost, span = next - t;
    const V = VOW[L[0]] || VOW.e;

    /* --- pitch. One contour over the whole line, not a value per letter.
       It falls as the phrase runs, each syllable lifts and settles inside
       that, and a question turns back up over its last third. */
    const k = i / n;
    let bend = 1 + p.fall * 0.35 - p.fall * k;
    if (ask) bend += p.ask * Math.pow(clamp01((k - 0.62) / 0.38), 2);
    const f = base * bend * (0.985 + wob(i) * 0.03);
    osc.frequency.setTargetAtTime(f * p.rise, t, 0.012);
    osc.frequency.setTargetAtTime(f * 0.975, t + span * 0.45, 0.030);

    /* --- the mouth moves to the next vowel instead of arriving at it. A nasal
       or a liquid passes through a murmur on the way, which is what tells l m
       n r apart from a bare vowel. */
    if (L[1] === "n") {
      bands[0].frequency.setTargetAtTime(310, t, 0.008);
      bands[1].frequency.setTargetAtTime(1180, t, 0.008);
      bands.forEach((bp, j) =>
        bp.frequency.setTargetAtTime(Math.max(80, CF[j] * V[j]), t + span * 0.38, p.glide));
    } else {
      bands.forEach((bp, j) =>
        bp.frequency.setTargetAtTime(Math.max(80, CF[j] * V[j]), t, p.glide));
    }

    /* --- the transient. A plosive is a click released into the voice; a
       fricative is a longer wash of air across the front of it. */
    const hg = p.gain * p.hissGain;
    if (L[1] === "p") hiss(c, t - 0.004, 0.018, hg * 1.8, "highpass", 2200, 2200, 0.7, out);
    else if (L[1] === "f") hiss(c, t - 0.006, span * 0.72, hg, "bandpass", 4200, 3000, 0.9, out);

    /* --- the syllable itself is a dip and a rise in one continuous gain */
    const dip = DIP[L[1]] * (word ? 0.45 : 1);
    const atk = Math.min(0.016, span * 0.3);
    env.gain.linearRampToValueAtTime(dip, t);
    env.gain.linearRampToValueAtTime(1, t + atk);
    env.gain.linearRampToValueAtTime(0.80, next - Math.min(0.014, span * 0.25));
    t = next; said++; word = false;
  }
  env.gain.linearRampToValueAtTime(0.0001, t + 0.06);
  osc.start(pre); osc.stop(t + 0.14);

  let stopped = false;
  return {
    on: said > 0,
    dur: t - t0,
    stop() {
      if (stopped) return;
      stopped = true;
      const now = c.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(out.gain.value, now);
      out.gain.linearRampToValueAtTime(0.0001, now + 0.05);
      try { osc.stop(now + 0.09); } catch (e) { }
      setTimeout(() => { try { out.disconnect(); } catch (e) { } }, 250);
    },
  };
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
  voice() {                                   // a line of animalese to tune against
    speak("oh! hello there. welcome to the water, friend.");
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
