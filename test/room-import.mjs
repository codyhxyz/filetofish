import assert from "node:assert/strict";
import { importTake, parseMidi, roleOf, writeMidi } from "../soundtrack/room/import.mjs";
import { packEvents, unpackTrack } from "../src/music-analysis.mjs";

/* ROOM's transcriber writes notes in seconds, at a file tempo that has nothing
   to do with the song, starting at an arbitrary offset. writeMidi stands in. */
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
  const round = unpackTrack({ ...track, events: packEvents(track.events) }).events;
  assert.deepEqual(round, track.events.map(e => ({ ...e, gain: +e.gain.toFixed(2) })), `${label}: packed events round-trip`);
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

// A Magenta take is written on the grid with bar 1 at zero. Its groove can
// skip the downbeat and its intro has no tune, so nothing may be re-aligned.
{
  const onGrid = (b, dur, pitch, vel = 90) => ({ start: b * beat, end: (b + dur) * beat, pitch, vel });
  const groove = [], comp = [], line = [];
  for (let bar = 0; bar < 8; bar++) {
    const b = bar * 4;
    groove.push(onGrid(b + 1.5, 0.25, 41), onGrid(b + 2, 1.25, 41), onGrid(b + 3.5, 0.25, 41));
    for (const [x, pitch] of [[0.5, 62], [1, 58], [1.5, 65]]) comp.push(onGrid(b + x, 1, pitch, 70));
    if (bar >= 4) line.push(onGrid(b, 1, 82), onGrid(b + 1, 1, 81), onGrid(b + 2, 2, 79));
  }
  const files = [
    { name: "bass.mid", bytes: writeMidi(groove, session.bpm) },
    { name: "chords.mid", bytes: writeMidi(comp, session.bpm) },
    { name: "lead.mid", bytes: writeMidi(line, session.bpm) },
  ];
  const { track } = importTake(files, session, { aligned: true });
  assert.equal(track.chords.length, 8, "aligned: all eight bars kept");
  assert.deepEqual(track.chords.map(c => c.layer), [...Array(4).fill("chords"), ...Array(4).fill("full")], "aligned: intro has no tune");
  assert.equal(track.events.find(e => e.channel === "bass").beat, 1.5, "aligned: syncopated bass stays off the downbeat");
  assert.equal(track.events.find(e => e.channel === "lead").beat, 16, "aligned: tune enters on bar 5");
}

console.log("room import checks passed");
