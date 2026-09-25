import assert from "node:assert/strict";
import { importTake, parseMidi, roleOf } from "../soundtrack/room/import.mjs";

/* A stand-in for ROOM's transcriber: notes in seconds, written at a file tempo
   that has nothing to do with the song, starting at an arbitrary offset. */
function writeMidi(notes, fileBpm = 120, division = 220) {
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
  return Uint8Array.from([
    ..."MThd".split("").map(c => c.charCodeAt(0)), ...u32(6), 0, 0, 0, 1, division >> 8, division & 0xff,
    ..."MTrk".split("").map(c => c.charCodeAt(0)), ...u32(body.length), ...body,
  ]);
}

const session = { slug: "day", title: "Day", hours: "11:00-17:00", bpm: 96, meter: 4, swing: 0.62, bars: 8,
  defaults: { bass: "acoustic_bass", chords: "electric_guitar_jazz", lead: "steel_drums" } };
const beat = 60 / session.bpm;
const offset = 0.9 + 3 * beat;  // silence, then a bar that starts on the file's fourth beat
const at = (b, dur, pitch, vel = 90) => ({ start: offset + b * beat, end: offset + (b + dur) * beat, pitch, vel });

const bass = [], harmony = [], tune = [];
const melody = [[0, 76, 1], [1.5, 79, 0.5], [2, 74, 2]];  // a swung pickup into beat three
for (let bar = 0; bar < 8; bar++) {
  const b = bar * 4;
  bass.push(at(b, 1.8, 36, 100), at(b + 2, 1.5, 43, 80));
  for (const pitch of [52, 55, 59]) harmony.push(at(b + 1, 0.8, pitch, 60), at(b + 3, 0.8, pitch, 55));
  for (const [x, pitch, dur] of melody) tune.push(at(b + x, dur, pitch, 95));
}
const ghost = { start: offset + 5.1 * beat, end: offset + 5.13 * beat, pitch: 88, vel: 90 };

assert.equal(roleOf("bass.mid"), "bass");
assert.equal(roleOf("drums.mid"), null);
assert.equal(roleOf("vocals_basic_pitch.mid"), "lead");
assert.equal(roleOf("other.mid"), "other");
assert.equal(roleOf("full_mix.mid"), "mix");

const parsed = parseMidi(writeMidi(bass));
assert.equal(parsed.length, bass.length);
assert.ok(Math.abs(parsed[0].start - bass[0].start) < 0.01, "tempo map converts ticks back to seconds");

function check(files, label) {
  const { track, counts, score, fit } = importTake(files, session);
  assert.equal(track.chords.length, 8, `${label}: loop is the session's eight bars`);
  assert.ok(fit > 0.95 && score > 0.9, `${label}: take scores as usable (${score}, fit ${fit})`);
  const on = channel => track.events.filter(e => e.channel === channel);
  assert.equal(counts.bass, 16, `${label}: two bass notes a bar`);
  assert.deepEqual(on("bass").slice(0, 2).map(e => [e.beat, e.note]), [[0, "C2"], [2, "G2"]], `${label}: downbeat found`);
  assert.deepEqual(on("lead").slice(0, 3).map(e => [e.beat, e.note, e.durBeats]),
    [[0, "E5", 1], [1.5, "G5", 0.5], [2, "D5", 2]], `${label}: melody on the grid`);
  assert.equal(on("lead").find(e => e.beat === 1.5).isSwung, true, `${label}: off-beat eighths swing`);
  assert.deepEqual(on("chords").filter(e => e.beat === 1).map(e => e.note).sort(), ["B3", "E3", "G3"], `${label}: voicing kept`);
  assert.ok(!track.events.some(e => e.note === "E6"), `${label}: transcription blips dropped`);
  assert.ok(track.chords.every(c => c.layer === "full"), `${label}: bar layers derived from what plays`);
  assert.ok(track.events.every((e, i, all) => i === 0 || all[i - 1].beat <= e.beat), `${label}: events sorted`);
}

check([
  { name: "bass.mid", bytes: writeMidi(bass) },
  { name: "other.mid", bytes: writeMidi([...harmony, ...tune, ghost]) },
  { name: "drums.mid", bytes: writeMidi([at(0, 0.1, 36)]) },
], "melody inside the harmony stem");

check([
  { name: "bass.mid", bytes: writeMidi(bass, 87) },
  { name: "vocals.mid", bytes: writeMidi([...tune, ghost], 140) },
  { name: "other.mid", bytes: writeMidi(harmony, 60) },
  { name: "mix.mid", bytes: writeMidi([...bass, ...harmony, ...tune]) },
], "separate lead stem, mixed file tempos");

console.log("room import checks passed");
