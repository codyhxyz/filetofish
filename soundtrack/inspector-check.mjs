import assert from "node:assert/strict";
import { groupPhrases, midiToName, noteToMidi } from "../src/music-analysis.mjs";
import { SOUNDFONT_BANK, clampMusicVolume, readMusicVolume, writeMusicVolume } from "../src/music-settings.mjs";

assert.equal(noteToMidi("C4"), 60);
assert.equal(noteToMidi("Db5"), 73);
assert.equal(noteToMidi("C#5"), 73);
assert.equal(midiToName(73), "C#5");
assert.throws(() => noteToMidi("nope"), /Invalid note/);

assert.equal(SOUNDFONT_BANK, "MusyngKite");
assert.equal(clampMusicVolume(-1), 0);
assert.equal(clampMusicVolume(2), 1);
assert.equal(clampMusicVolume("bad"), 1);
const values = new Map([["ftf.music.volume", "0.84"]]);
const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
assert.equal(readMusicVolume(storage), 0.84);
writeMusicVolume(0.42, storage);
assert.equal(values.get("ftf.music.volume"), "0.42");

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
