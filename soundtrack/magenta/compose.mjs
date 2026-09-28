/* Compose the soundtrack with Magenta's pretrained music models.

   The harmony is authored: each slot in ../room/sessions.json carries an A and
   a B progression and a form. Two models write the notes over it:

   - ImprovRNN (music_rnn/chord_pitches_improv), an LSTM trained on lead sheets,
     writes the tune one sixteenth at a time, conditioned on the chord under it.
     Each phrase is drawn many times and the most singable draw is kept.
   - MusicVAE (music_vae/multitrack_med_chords), trained on Lakh MIDI, decodes a
     one-bar band arrangement for a chord from a latent "groove". One groove is
     held per section and decoded against each chord, so the bass and comping
     keep a consistent feel while following the changes.

   Output is one take per run, as bass/chords/lead MIDI in
   ../room/takes/<slug>/magenta-<n>/, already on the session grid, for
   ../room/import.mjs to turn into src/room-tracks.json.

     cd soundtrack/magenta && npm install
     NODE_USE_ENV_PROXY=1 node compose.mjs                # every slot, in parallel
     NODE_USE_ENV_PROXY=1 node compose.mjs day night      # just these
*/

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { writeMidi } from "../room/import.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOM = path.resolve(HERE, "../room");
const config = JSON.parse(fs.readFileSync(path.join(ROOM, "sessions.json"), "utf8"));

const STEPS_PER_BAR = 16;           // ImprovRNN works in sixteenths
const VAE_STEPS_PER_BEAT = 24;      // MusicVAE multitrack works in 24ths of a beat

/* ---------------- melody ---------------- */

function chordTones(symbol, ChordSymbols) {
  return new Set(ChordSymbols.pitches(symbol));
}

/* How singable a phrase is, over its chords. Higher is better. */
export function scoreMelody(notes, chords, range, ChordSymbols) {
  if (notes.length < 6) return -Infinity;
  const bars = chords.length;
  let score = 0;

  const perBar = Array(bars).fill(0);
  for (const n of notes) perBar[Math.min(bars - 1, Math.floor(n.start / STEPS_PER_BAR))]++;
  const density = notes.length / bars;
  if (density < 2) score -= (2 - density) * 2;
  if (density > 6) score -= (density - 6) * 1.5;
  for (let i = 1; i < bars; i++) if (!perBar[i] && !perBar[i - 1]) score -= 1.5;   // two empty bars
  if (perBar[0] === 0) score -= 1;

  // Strong beats and long notes should sit on chord tones.
  let strong = 0, fit = 0;
  for (const n of notes) {
    if (n.start % 8 !== 0 && n.end - n.start < 4) continue;
    strong++;
    const chord = chords[Math.min(bars - 1, Math.floor(n.start / STEPS_PER_BAR))];
    if (chordTones(chord, ChordSymbols).has(n.pitch % 12)) fit++;
  }
  score += strong ? 4 * fit / strong : 0;

  // Stepwise with the odd leap; no pinballing.
  let leaps = 0, run = 1;
  for (let i = 1; i < notes.length; i++) {
    const interval = Math.abs(notes[i].pitch - notes[i - 1].pitch);
    if (interval > 9) leaps++;
    run = interval === 0 ? run + 1 : 1;
    if (run > 4) score -= 0.5;
  }
  score -= leaps * 0.6;

  const pitches = notes.map(n => n.pitch);
  const span = Math.max(...pitches) - Math.min(...pitches);
  if (span > range[1] - range[0]) score -= (span - (range[1] - range[0])) * 0.3;
  if (span < 5) score -= 1;

  // A motif that comes back: bars 1-2 and 5-6 sharing a rhythm reads as a tune.
  const rhythm = bar => new Set(notes.filter(n => Math.floor(n.start / STEPS_PER_BAR) === bar).map(n => n.start % STEPS_PER_BAR));
  if (bars >= 6) {
    for (const [a, b] of [[0, 4], [1, 5]]) {
      const x = rhythm(a), y = rhythm(b);
      const union = new Set([...x, ...y]).size;
      if (union) score += [...x].filter(s => y.has(s)).length / union;
    }
  }

  // Land on a chord tone and hold it.
  const last = notes[notes.length - 1];
  if (chordTones(chords[bars - 1], ChordSymbols).has(last.pitch % 12)) score += 0.5;
  if (last.end - last.start >= 4) score += 0.5;
  return score;
}

/* Octave that keeps the most notes inside the instrument's sweet spot. */
function octaveFor(notes, range) {
  let best = 0, bestOut = Infinity;
  for (const shift of [-24, -12, 0, 12, 24]) {
    const out = notes.filter(n => n.pitch + shift < range[0] || n.pitch + shift > range[1]).length;
    if (out < bestOut) { bestOut = out; best = shift; }
  }
  return best;
}

/* seedNotes are in the model's own register (48-83), primerSteps long. */
async function drawPhrase({ rnn, mm, chords, range, seedNotes = null, primerSteps = 4, fixedShift = 0, bars = chords.length, candidates, log }) {
  const { sequences, chords: { ChordSymbols } } = mm;
  const total = bars * STEPS_PER_BAR;
  // Per-step chord list, so the model hears exactly the chord under each sixteenth.
  const perStep = Array.from({ length: total }, (_, s) => chords[Math.floor(s / STEPS_PER_BAR)]);
  const primer = seedNotes || [{ pitch: 60 + [...chordTones(chords[0], ChordSymbols)][0], start: 0, end: 4 }];
  const primerSeq = sequences.quantizeNoteSequence({
    notes: primer.map(n => ({ pitch: Math.max(48, Math.min(83, n.pitch)), startTime: n.start / 4, endTime: n.end / 4 })),
    totalTime: primerSteps / 4,
  }, 4);
  primerSeq.totalQuantizedSteps = primerSteps;

  let best = null;
  for (let i = 0; i < candidates; i++) {
    const temperature = 0.85 + 0.35 * (i / Math.max(1, candidates - 1));
    const out = await rnn.continueSequence(primerSeq, total - primerSteps, temperature, perStep);
    const drawn = out.notes.map(n => ({ pitch: n.pitch, start: n.quantizedStartStep + primerSteps, end: n.quantizedEndStep + primerSteps }));
    const raw = [...primer, ...drawn].sort((a, b) => a.start - b.start);
    const shift = seedNotes ? fixedShift : octaveFor(raw, range);
    const notes = raw.map(n => ({ ...n, pitch: n.pitch + shift }));
    const score = scoreMelody(notes, chords, range, ChordSymbols);
    if (!best || score > best.score) best = { notes, raw, shift, score, temperature };
  }
  log(`  phrase over ${chords.join(" ")}: best ${best.score.toFixed(2)} at t=${best.temperature.toFixed(2)}`);
  return best;
}

/* ---------------- accompaniment ---------------- */

const isBass = n => !n.isDrum && n.program >= 32 && n.program <= 39;
const COMP_FAMILIES = [[0, 7], [24, 31], [8, 15], [16, 23], [40, 55], [88, 95]];

function splitBand(seq) {
  const tracks = new Map();
  for (const n of seq.notes) {
    if (n.isDrum) continue;
    const key = n.instrument;
    if (!tracks.has(key)) tracks.set(key, []);
    tracks.get(key).push(n);
  }
  let bass = [...tracks.values()].find(t => isBass(t[0]));
  if (!bass) bass = [...tracks.values()].find(t => t.reduce((s, n) => s + n.pitch, 0) / t.length < 50);
  let comp = null;
  for (const [lo, hi] of COMP_FAMILIES) {
    comp = [...tracks.values()].find(t => t !== bass && t.length >= 2 && t[0].program >= lo && t[0].program <= hi);
    if (comp) break;
  }
  const toBeats = n => ({ pitch: n.pitch, start: n.quantizedStartStep / VAE_STEPS_PER_BEAT, end: n.quantizedEndStep / VAE_STEPS_PER_BEAT, vel: n.velocity || 80 });
  return { bass: (bass || []).map(toBeats), comp: (comp || []).map(toBeats) };
}

function scoreBand(band, root) {
  let score = 0;
  if (band.bass.length) score += 2; else score -= 2;
  // The bass owns the downbeat, and on the first chord of a section it plays the root.
  const one = band.bass.find(n => n.start < 0.1);
  if (one) score += 2 + (one.pitch % 12 === root ? 1.5 : 0);
  if (band.bass.length > 8) score -= 1;
  if (band.comp.length >= 2) score += 2; else score -= 2;
  if (band.comp.length > 28) score -= 1;
  // Some motion in the comping, not a single held pad.
  score += Math.min(1, new Set(band.comp.map(n => n.start)).size / 4);
  return score;
}

async function chooseGroove({ vae, tf, mm, chord, candidates }) {
  const z = tf.randomNormal([candidates, vae.decoder.zDims]);
  const bands = await vae.decode(z, 0.4, { chordProgression: [chord] });
  const root = mm.chords.ChordSymbols.root(chord);
  const scored = bands.map((seq, i) => ({ i, score: scoreBand(splitBand(seq), root) }));
  const best = scored.sort((a, b) => b.score - a.score)[0];
  const chosen = tf.tidy(() => z.slice([best.i, 0], [1, -1]));
  z.dispose();
  return chosen;
}

/* ---------------- one slot ---------------- */

async function composeSlot(session) {
  const require = createRequire(import.meta.url);
  globalThis.performance ??= (await import("node:perf_hooks")).performance;
  const tf = require("@tensorflow/tfjs");
  const core = require("@magenta/music/node/core");
  const { MusicRNN } = require("@magenta/music/node/music_rnn");
  const { MusicVAE } = require("@magenta/music/node/music_vae");
  const log = msg => console.log(`[${session.slug}] ${msg}`);
  const mm = core;
  const cfg = config.magenta;

  const rnn = new MusicRNN(cfg.melody);
  const vae = new MusicVAE(cfg.accompaniment);
  await rnn.initialize();
  await vae.initialize();

  const { A, B } = session.sections;
  const range = session.leadRange;
  const candidates = cfg.melodyCandidates;

  log("melody");
  const phraseA = await drawPhrase({ rnn, mm, chords: A, range, candidates, log });
  const phraseB = await drawPhrase({ rnn, mm, chords: B, range, candidates, log });
  // A2 keeps the first six bars of A and answers with a new cadence.
  const six = 6 * STEPS_PER_BAR;
  const keep = phraseA.raw.filter(n => n.start < six).map(n => ({ ...n, end: Math.min(n.end, six) }));
  const cadence = await drawPhrase({ rnn, mm, chords: A, range, candidates, log, seedNotes: keep, primerSteps: six, fixedShift: phraseA.shift });
  const phraseA2 = { notes: cadence.notes };

  log("accompaniment");
  const grooves = {
    A: await chooseGroove({ vae, tf, mm, chord: A[0], candidates: cfg.grooveCandidates }),
    B: await chooseGroove({ vae, tf, mm, chord: B[0], candidates: cfg.grooveCandidates }),
  };
  const bandCache = new Map();
  async function band(section, chord) {
    const key = `${section}:${chord}`;
    if (!bandCache.has(key)) {
      const [seq] = await vae.decode(grooves[section], 0.4, { chordProgression: [chord] });
      bandCache.set(key, splitBand(seq));
    }
    return bandCache.get(key);
  }

  // Lay the form out bar by bar.
  const plan = [];
  for (const part of session.form) {
    if (part === "intro") A.slice(0, 4).forEach(chord => plan.push({ section: "A", chord, lead: null }));
    if (part === "A") A.forEach((chord, i) => plan.push({ section: "A", chord, lead: [phraseA, i] }));
    if (part === "A2") A.forEach((chord, i) => plan.push({ section: "A", chord, lead: [phraseA2, i] }));
    if (part === "B") B.forEach((chord, i) => plan.push({ section: "B", chord, lead: [phraseB, i] }));
    if (part === "tag") A.slice(0, 4).forEach((chord, i) => plan.push({ section: "A", chord, lead: [phraseA, i], soft: true }));
  }
  if (plan.length !== session.bars) throw new Error(`form is ${plan.length} bars, session says ${session.bars}`);

  const out = { bass: [], chords: [], lead: [] };
  const beatSec = 60 / session.bpm;
  for (let bar = 0; bar < plan.length; bar++) {
    const { section, chord, lead, soft } = plan[bar];
    const at = beat => (bar * 4 + beat) * beatSec;
    const parts = await band(section, chord);
    const bassNotes = parts.bass.length ? parts.bass
      : [{ pitch: 36 + mm.chords.ChordSymbols.root(chord) - (mm.chords.ChordSymbols.root(chord) > 7 ? 12 : 0), start: 0, end: 2, vel: 90 }];
    for (const n of bassNotes) out.bass.push({ pitch: n.pitch, start: at(n.start), end: at(Math.min(4, n.end)), vel: n.vel });
    for (const n of parts.comp) out.chords.push({ pitch: n.pitch, start: at(n.start), end: at(Math.min(4, n.end)), vel: Math.round(n.vel * (soft ? 0.8 : 1)) });
    if (lead) {
      const [phrase, i] = lead;
      for (const n of phrase.notes) {
        if (Math.floor(n.start / STEPS_PER_BAR) !== i) continue;
        const start = (n.start % STEPS_PER_BAR) / 4;
        const end = Math.min(start + (n.end - n.start) / 4, soft && i === 3 ? 4 : 8);
        const accent = n.start % STEPS_PER_BAR === 0 ? 12 : n.start % 4 === 0 ? 4 : 0;
        out.lead.push({ pitch: n.pitch, start: at(start), end: at(end), vel: (soft ? 70 : 84) + accent });
      }
    }
  }

  const dir = path.join(ROOM, "takes", session.slug);
  fs.mkdirSync(dir, { recursive: true });
  const n = fs.readdirSync(dir).filter(d => d.startsWith("magenta-")).length + 1;
  const take = path.join(dir, `magenta-${n}`);
  fs.mkdirSync(take);
  for (const [name, notes] of Object.entries(out)) fs.writeFileSync(path.join(take, `${name}.mid`), writeMidi(notes, session.bpm));
  fs.writeFileSync(path.join(take, "take.json"), JSON.stringify({
    slug: session.slug,
    aligned: true,
    bpm: session.bpm,
    meter: session.meter,
    models: { melody: cfg.melody, accompaniment: cfg.accompaniment },
    chords: plan.map(p => p.chord),
    form: session.form,
    melodyScores: { A: +phraseA.score.toFixed(2), B: +phraseB.score.toFixed(2), cadence: +cadence.score.toFixed(2) },
    notes: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])),
  }, null, 2) + "\n");
  log(`-> ${path.relative(ROOM, take)} (${out.bass.length} bass, ${out.chords.length} chords, ${out.lead.length} lead)`);
}

/* ---------------- CLI: one process per slot, as many as there are cores ---------------- */

const slugs = process.argv.slice(2);
const sessions = config.sessions.filter(s => !slugs.length || slugs.includes(s.slug));
if (!sessions.length) { console.error(`no session matches ${slugs.join(" ")}`); process.exit(1); }

if (sessions.length === 1) {
  await composeSlot(sessions[0]);
} else {
  const queue = [...sessions];
  let failed = 0;
  const worker = async () => {
    while (queue.length) {
      const session = queue.shift();
      const code = await new Promise(resolve => {
        const child = spawn(process.execPath, [fileURLToPath(import.meta.url), session.slug], { stdio: ["ignore", "inherit", "inherit"] });
        child.on("exit", resolve);
      });
      if (code) { failed++; console.error(`[${session.slug}] failed (${code})`); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(os.cpus().length, sessions.length) }, worker));
  process.exit(failed ? 1 : 0);
}
