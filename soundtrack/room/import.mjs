/* Turn ROOM's transcribed stems into tracks the SoundFont engine can play.

   ROOM hands back one MIDI file per stem, transcribed from audio: real-time note
   positions at an arbitrary file tempo, a few ghost notes, no idea where bar 1
   is. This file puts the notes on the session's beat grid, finds the downbeat,
   splits them into the engine's three channels and writes src/room-tracks.json,
   which src/music.js prefers over its hand-written track for the same slug.

     node soundtrack/room/import.mjs                  # every slot with takes
     node soundtrack/room/import.mjs day              # one slot, best take
     node soundtrack/room/import.mjs --take day=take-2-seed123
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { midiToName } from "../../src/music-analysis.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(ROOT, "src/room-tracks.json");

const GRID = 0.25;                  // sixteenth notes, in beats
const MIX = { bass: 1.05, chords: 0.45, lead: 0.9 }; // the calibrated studio mix

/* ---- Standard MIDI File reader: notes in seconds, honouring the tempo map ---- */

export function parseMidi(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let p = 0;
  const u32 = () => ((data[p++] << 24) | (data[p++] << 16) | (data[p++] << 8) | data[p++]) >>> 0;
  const u16 = () => (data[p++] << 8) | data[p++];
  const vlq = () => { let v = 0, b; do { b = data[p++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
  const tag = () => String.fromCharCode(data[p++], data[p++], data[p++], data[p++]);

  if (tag() !== "MThd") throw new Error("not a MIDI file");
  const headerLen = u32();
  const headerEnd = p + headerLen;
  u16();
  const trackCount = u16();
  const division = u16();
  if (division & 0x8000) throw new Error("SMPTE time division is not supported");
  p = headerEnd;

  const tempos = [{ tick: 0, usPerBeat: 500000 }];
  const raw = [];
  for (let t = 0; t < trackCount && p < data.length; t++) {
    const kind = tag();
    const len = u32();
    const end = p + len;
    if (kind !== "MTrk") { p = end; continue; }
    let tick = 0, status = 0;
    const open = new Map();
    while (p < end) {
      tick += vlq();
      let byte = data[p];
      if (byte & 0x80) { status = byte; p++; } else byte = status;
      const type = status & 0xf0, channel = status & 0x0f;
      if (status === 0xff) {
        const meta = data[p++], metaLen = vlq();
        if (meta === 0x51) tempos.push({ tick, usPerBeat: (data[p] << 16) | (data[p + 1] << 8) | data[p + 2] });
        p += metaLen;
      } else if (status === 0xf0 || status === 0xf7) {
        p += vlq();
      } else if (type === 0x90 || type === 0x80) {
        const pitch = data[p++], vel = data[p++];
        const key = channel * 128 + pitch;
        if (type === 0x90 && vel > 0) {
          if (open.has(key)) raw.push({ ...open.get(key), end: tick });
          open.set(key, { pitch, vel, start: tick, channel, track: t });
        } else if (open.has(key)) {
          raw.push({ ...open.get(key), end: tick });
          open.delete(key);
        }
      } else {
        p += type === 0xc0 || type === 0xd0 ? 1 : 2;
      }
    }
    for (const note of open.values()) raw.push({ ...note, end: tick });
    p = end;
  }

  tempos.sort((a, b) => a.tick - b.tick);
  const seconds = tick => {
    let sec = 0;
    for (let i = 0; i < tempos.length; i++) {
      const from = tempos[i].tick;
      if (tick <= from) break;
      const to = i + 1 < tempos.length ? Math.min(tick, tempos[i + 1].tick) : tick;
      sec += (to - from) * tempos[i].usPerBeat / 1e6 / division;
    }
    return sec;
  };
  return raw.map(n => ({ pitch: n.pitch, vel: n.vel, start: seconds(n.start), end: seconds(n.end), channel: n.channel }))
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch);
}

/* Standard MIDI File writer, one track, notes in seconds. */
export function writeMidi(notes, fileBpm = 120, division = 220) {
  const vlq = n => { const out = [n & 0x7f]; while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80); return out; };
  const tick = sec => Math.round(sec * fileBpm / 60 * division);
  const events = notes.flatMap(n => [
    { tick: tick(n.start), bytes: [0x90, n.pitch, n.vel] },
    { tick: tick(n.end), bytes: [0x80, n.pitch, 0] },
  ]).sort((a, b) => a.tick - b.tick || a.bytes[0] - b.bytes[0]);
  const usPerBeat = Math.round(60e6 / fileBpm);
  const body = [0, 0xff, 0x51, 3, usPerBeat >> 16, (usPerBeat >> 8) & 0xff, usPerBeat & 0xff];
  let last = 0;
  for (const e of events) { body.push(...vlq(e.tick - last), ...e.bytes); last = e.tick; }
  body.push(0, 0xff, 0x2f, 0);
  const u32 = n => [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  const ascii = s => [...s].map(c => c.charCodeAt(0));
  return Uint8Array.from([
    ...ascii("MThd"), ...u32(6), 0, 0, 0, 1, division >> 8, division & 0xff,
    ...ascii("MTrk"), ...u32(body.length), ...body,
  ]);
}

/* ---- stems to channels ---- */

export function roleOf(name) {
  const n = name.toLowerCase();
  if (/drum|perc|kick|snare|hat/.test(n)) return null;
  if (/bass/.test(n)) return "bass";
  if (/vocal|voice|lead|melody/.test(n)) return "lead";
  if (/(^|[^a-z])(mix|full|master|combined|all|song)([^a-z]|$)/.test(n)) return "mix";
  return "other";
}

const distToGrid = (x, step) => Math.abs(x / step - Math.round(x / step)) * step;

/* The file tempo is whatever the transcriber used, so trust seconds and the
   session BPM. The phase is the offset that puts the most weight on eighths. */
function findPhase(notes) {
  let best = 0, bestCost = Infinity;
  for (let i = 0; i < 64; i++) {
    const phase = i / 64;
    let cost = 0;
    for (const n of notes) cost += n.vel * distToGrid(n.beat - phase, 0.5);
    if (cost < bestCost) { bestCost = cost; best = phase; }
  }
  return best;
}

/* Which beat is "one": bass roots and long chord tones sit on downbeats. */
function findDownbeat(notes, meter) {
  const weight = new Array(meter).fill(0);
  for (const n of notes) {
    const beat = Math.round(n.beat);
    if (Math.abs(n.beat - beat) > 0.1) continue;
    weight[((beat % meter) + meter) % meter] += n.vel * (n.role === "bass" ? 3 : 1) * Math.min(2, n.dur);
  }
  return weight.indexOf(Math.max(...weight));
}

const quant = x => Math.round(x / GRID) * GRID;

function keepLoudest(notes, max) {
  const byOnset = new Map();
  for (const n of notes) {
    if (!byOnset.has(n.beat)) byOnset.set(n.beat, new Map());
    const bucket = byOnset.get(n.beat);
    const prev = bucket.get(n.pitch);
    if (!prev || prev.vel < n.vel) bucket.set(n.pitch, n);
  }
  return [...byOnset.values()].flatMap(bucket =>
    [...bucket.values()].sort((a, b) => b.vel - a.vel).slice(0, max));
}

function monophonic(notes) {
  const sorted = [...notes].sort((a, b) => a.beat - b.beat || b.pitch - a.pitch);
  const out = [];
  for (const n of sorted) {
    const prev = out[out.length - 1];
    if (prev && prev.beat === n.beat) continue;          // highest at this onset wins
    if (prev && prev.beat + prev.dur > n.beat) prev.dur = Math.max(GRID, n.beat - prev.beat);
    out.push({ ...n });
  }
  return out;
}

/* files: [{ name, bytes }], session: an entry from sessions.json. An aligned
   take was written on the session grid with bar 1 at time zero (the Magenta
   composer), so there is no phase or downbeat to find. */
export function importTake(files, session, { aligned = false } = {}) {
  const { bpm, meter, bars } = session;
  const stems = files.map(f => ({ ...f, role: roleOf(f.name) })).filter(f => f.role);
  const hasStems = stems.some(f => f.role !== "mix");
  const notes = stems
    .filter(f => !hasStems || f.role !== "mix")
    .flatMap(f => parseMidi(f.bytes).map(n => ({
      ...n,
      role: f.role === "mix" ? "other" : f.role,
      beat: n.start * bpm / 60,
      dur: (n.end - n.start) * bpm / 60,
    })))
    // Transcription blips: too short or too quiet to be a played note.
    .filter(n => n.dur >= 0.12 && n.vel >= 25);
  if (!notes.length) throw new Error("no usable notes in take");

  const phase = aligned ? 0 : findPhase(notes);
  for (const n of notes) n.beat -= phase;
  const downbeat = aligned ? 0 : findDownbeat(notes, meter);
  const tune = notes.filter(n => n.role !== "other" || n.pitch >= 60);
  const fit = tune.length ? tune.filter(n => distToGrid(n.beat, GRID) < 0.06).length / tune.length : 0;
  for (const n of notes) {
    n.beat = quant(n.beat - downbeat);
    n.dur = Math.max(GRID, quant(n.dur));
  }

  // Start the loop on the first bar where the bass or harmony is playing.
  const anchor = notes.filter(n => n.role !== "lead");
  const firstBeat = Math.min(...(anchor.length ? anchor : notes).map(n => n.beat));
  const start = aligned ? 0 : Math.max(0, Math.floor(firstBeat / meter)) * meter;
  const lastBeat = Math.max(...notes.map(n => n.beat));
  const length = Math.min(bars, Math.floor((lastBeat - start) / meter) + 1) * meter;
  const inLoop = notes
    .map(n => ({ ...n, beat: n.beat - start }))
    .filter(n => n.beat >= 0 && n.beat < length)
    .map(n => ({ ...n, dur: Math.min(n.dur, length - n.beat) }));

  let bass = inLoop.filter(n => n.role === "bass");
  let lead = inLoop.filter(n => n.role === "lead");
  let other = inLoop.filter(n => n.role === "other");

  // No bass stem: the lowest note under C3 at each onset is the bass.
  if (bass.length < 8) {
    const low = monophonic(other.filter(n => n.pitch < 48).map(n => ({ ...n, pitch: -n.pitch })))
      .map(n => ({ ...n, pitch: -n.pitch }));
    const taken = new Set(low.map(n => `${n.beat}:${n.pitch}`));
    bass = bass.concat(low);
    other = other.filter(n => !taken.has(`${n.beat}:${n.pitch}`));
  }
  // No usable lead stem: the top line of the harmony stem is the tune, where it
  // stands clear of the voicing under it rather than topping a chord.
  if (lead.length < 8) {
    const onsets = new Map();
    for (const n of other) (onsets.get(n.beat) || onsets.set(n.beat, []).get(n.beat)).push(n);
    const top = monophonic([...onsets.values()].flatMap(group => {
      const [first, second] = [...group].sort((a, b) => b.pitch - a.pitch);
      const clear = group.length <= 2 || first.pitch - second.pitch >= 5;
      return first.pitch >= 60 && clear ? [first] : [];
    }));
    const taken = new Set(top.map(n => `${n.beat}:${n.pitch}`));
    lead = top;
    other = other.filter(n => !taken.has(`${n.beat}:${n.pitch}`));
  }
  bass = monophonic(bass.map(n => ({ ...n, pitch: -n.pitch }))).map(n => ({ ...n, pitch: -n.pitch }));
  for (const n of bass) while (n.pitch < 28) n.pitch += 12;
  lead = monophonic(lead).filter(n => n.pitch <= 96);
  const chords = keepLoudest(other.filter(n => n.pitch >= 48 && n.pitch <= 88), 4);

  const swung = meter === 4 && session.swing > 0.5;
  const events = [];
  for (const [channel, list] of [["bass", bass], ["chords", chords], ["lead", lead]]) {
    const loudest = Math.max(1, ...list.map(n => n.vel));
    for (const n of list) {
      const event = {
        channel,
        beat: n.beat,
        note: midiToName(n.pitch),
        durBeats: n.dur,
        gain: +(MIX[channel] * (0.6 + 0.4 * n.vel / loudest)).toFixed(3),
      };
      if (swung && n.beat % 1 === 0.5) event.isSwung = true;
      events.push(event);
    }
  }
  events.sort((a, b) => a.beat - b.beat || a.channel.localeCompare(b.channel));

  const barCount = length / meter;
  const layers = Array.from({ length: barCount }, (_, bar) => {
    const on = new Set(events.filter(e => Math.floor(e.beat / meter) === bar).map(e => e.channel));
    if (on.has("lead") && on.has("chords")) return "full";
    if (on.has("lead")) return "lead";
    if (on.has("chords")) return "chords";
    if (on.has("bass")) return "bass";
    return "rest";
  });

  // How well the take sits on the grid and fills all three parts.
  const counts = { bass: bass.length, chords: chords.length, lead: lead.length };
  const coverage = Math.min(1, Math.min(counts.bass, counts.chords, counts.lead) / barCount);
  const score = +(coverage * (barCount / bars) * fit).toFixed(3);

  return {
    score,
    counts,
    fit,
    track: {
      slug: session.slug,
      title: session.title,
      hours: session.hours,
      bpm,
      swing: session.swing,
      meter,
      defaults: session.defaults,
      chords: layers.map(layer => ({ layer })),
      events,
    },
  };
}

/* ---- CLI ---- */

function readTake(dir) {
  const files = fs.readdirSync(dir).filter(f => /\.midi?$/i.test(f))
    .map(name => ({ name, bytes: fs.readFileSync(path.join(dir, name)) }));
  const meta = fs.existsSync(path.join(dir, "take.json")) ? JSON.parse(fs.readFileSync(path.join(dir, "take.json"), "utf8")) : {};
  return { files, meta };
}

function main(argv) {
  const config = JSON.parse(fs.readFileSync(path.join(HERE, "sessions.json"), "utf8"));
  const pinned = new Map();
  const slugs = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--take") {
      const [slug, take] = argv[++i].split("=");
      pinned.set(slug, take);
      slugs.push(slug);
    } else slugs.push(argv[i]);
  }

  const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : [];
  const bySlug = new Map(existing.map(t => [t.slug, t]));
  let imported = 0;
  for (const session of config.sessions) {
    if (slugs.length && !slugs.includes(session.slug)) continue;
    const dir = path.join(HERE, "takes", session.slug);
    if (!fs.existsSync(dir)) { console.log(`${session.slug}: no takes yet`); continue; }
    const takes = fs.readdirSync(dir).filter(d => !pinned.has(session.slug) || d === pinned.get(session.slug));
    const results = [];
    for (const take of takes) {
      const { files, meta } = readTake(path.join(dir, take));
      if (!files.length) { console.log(`${session.slug}/${take}: no MIDI`); continue; }
      try {
        const result = importTake(files, session, { aligned: !!meta.aligned });
        result.track.source = { take, seed: meta.seed, prompt: meta.prompt || session.prompt };
        results.push(result);
        console.log(`${session.slug}/${take}: score ${result.score} fit ${result.fit.toFixed(2)} ` +
          `bass ${result.counts.bass} chords ${result.counts.chords} lead ${result.counts.lead} ` +
          `${result.track.chords.length} bars`);
      } catch (error) {
        console.log(`${session.slug}/${take}: ${error.message}`);
      }
    }
    const best = results.sort((a, b) => b.score - a.score || b.fit - a.fit)[0];
    if (!best || best.score === 0) { console.log(`${session.slug}: nothing usable, keeping the current track`); continue; }
    bySlug.set(session.slug, best.track);
    imported++;
    console.log(`${session.slug}: using ${best.track.source.take}`);
  }

  const order = config.sessions.map(s => s.slug);
  const tracks = [...bySlug.values()].sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug));
  fs.writeFileSync(OUT, JSON.stringify(tracks, null, 1) + "\n");
  console.log(`${imported} imported, ${tracks.length} ROOM tracks in ${path.relative(ROOT, OUT)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main(process.argv.slice(2));
