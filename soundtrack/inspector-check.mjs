import assert from "node:assert/strict";
import { groupPhrases, midiToName, noteToMidi } from "../src/music-analysis.mjs";

assert.equal(noteToMidi("C4"), 60);
assert.equal(noteToMidi("Db5"), 73);
assert.equal(noteToMidi("C#5"), 73);
assert.equal(midiToName(73), "C#5");
assert.throws(() => noteToMidi("nope"), /Invalid note/);

const layers = [
  ...Array(8).fill("chords"),
  ...Array(16).fill("full"),
  ...Array(8).fill("solo"),
];
const track = { meter: 4, chords: layers.map(layer => ({ layer })) };
const events = [
  { channel: "bass", beat: 0 },
  { channel: "chords", beat: 2 },
  { channel: "lead", beat: 8 * 4 },
  { channel: "bass", beat: 24 * 4 },
];
const phrases = groupPhrases(track, events);
assert.deepEqual(phrases.map(phrase => phrase.bars), [8, 8, 8, 8]);
assert.deepEqual(phrases.map(phrase => phrase.label), ["A", "B", "C", "D"]);
assert.deepEqual(phrases[0].channels, ["bass", "chords"]);
assert.deepEqual(phrases[1].channels, ["lead"]);

console.log("soundtrack inspector checks passed");
