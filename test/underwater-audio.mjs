import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { getUnderwaterInput, setUnderwaterDepth, setUnderwaterSoundOn, UNDERWATER_AUDIO } from "../src/underwater-audio.mjs";
import * as settings from "../src/music-settings.mjs";
import { unpackTrack } from "../src/music-analysis.mjs";

class Param {
  value = 1;
  events = [];
  calls = 0;
  cancelAndHoldAtTime() { this.events = []; }
  cancelScheduledValues() { this.events = []; }
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value, time) { this.value = value; this.events.push({ value, time }); this.calls++; }
  exponentialRampToValueAtTime(value, time) { this.linearRampToValueAtTime(value, time); }
  setTargetAtTime(value, time) { this.linearRampToValueAtTime(value, time); }
}
class Node {
  edges = [];
  constructor(type) {
    this.kind = type;
    for (const key of ["gain", "frequency", "Q", "threshold", "knee", "ratio", "attack", "release"]) this[key] = new Param();
  }
  connect(node) { this.edges.push(node); return node; }
}
class Context {
  currentTime = 0;
  sampleRate = 24000;
  state = "running";
  nodes = [];
  buffers = [];
  resumes = 0;
  destination = new Node("destination");
  create(type) { const node = new Node(type); this.nodes.push(node); return node; }
  createGain() { return this.create("gain"); }
  createBiquadFilter() { return this.create("filter"); }
  createConvolver() { return this.create("convolver"); }
  createDynamicsCompressor() { return this.create("compressor"); }
  createBuffer(channels, length) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    const buffer = { getChannelData: index => data[index] };
    this.buffers.push(buffer);
    return buffer;
  }
  resume() { this.resumes++; this.state = "running"; }
}
const paths = (node, end) => node === end ? [[node]] : node.edges.flatMap(next => paths(next, end).map(path => [node, ...path]));
const read = name => fs.readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");
// Execute actual music/SFX code with only imports and browser/audio dependencies replaced.
const load = (file, globals, exports) => vm.runInNewContext(
  read(file).replace(/^import .*;\n/gm, "").replace(/\bexport /g, "") + `\n;({${exports}})`, globals);

// Calling before user activation has no context/window to create or resume.
setUnderwaterDepth(40);
const c = new Context();
c.state = "suspended";
const volume = c.createGain();
volume.connect(c.destination);
const input = getUnderwaterInput(c, volume);
const filter = input.edges.find(node => node.kind === "filter");
const bypass = input.edges.find(node => node.kind === "gain");
const reverb = filter.edges.find(node => node.kind === "convolver");
const dry = filter.edges.find(node => node.kind === "gain");
const wet = reverb.edges[0];
assert(wet.gain.value > 0, "depth set before initialization applies immediately");
assert.equal(getUnderwaterInput(c, volume), input);
const count = c.nodes.length;
let previousCutoff = Infinity, previousWet = -1;
for (let depth = 0; depth <= 100; depth++) {
  c.currentTime += 1 / 60;
  setUnderwaterDepth(depth);
  assert(filter.frequency.value <= previousCutoff);
  assert(wet.gain.value >= previousWet);
  previousCutoff = filter.frequency.value;
  previousWet = wet.gain.value;
  for (const param of [filter.frequency, wet.gain, dry.gain, bypass.gain]) {
    assert(param.events.length <= 1, "frame updates replace pending automation");
  }
}
assert.equal(filter.frequency.value, UNDERWATER_AUDIO.deepCutoff);
assert.equal(wet.gain.value, UNDERWATER_AUDIO.maxWet);
assert.equal(c.nodes.length, count);
assert.equal(c.buffers.length, 1);
assert.equal(c.resumes, 0);
const calls = wet.gain.calls;
for (let i = 0; i < 100; i++) setUnderwaterDepth(1000);
assert.equal(wet.gain.calls, calls, "unchanged bounded depths do not schedule automation");
for (const invalid of [0, -10, NaN, Infinity, -Infinity, "20", undefined]) {
  setUnderwaterDepth(25);
  setUnderwaterDepth(invalid);
  assert.equal(wet.gain.value, 0);
  assert.equal(dry.gain.value, 0);
  assert.equal(bypass.gain.value, 1);
  assert.equal(filter.frequency.value, c.sampleRate / 2);
}
assert(paths(input, c.destination).every(path => path.includes(volume)));
assert(paths(reverb, c.destination).every(path => path.includes(volume)));
setUnderwaterSoundOn(c, false);
assert(paths(input, c.destination).every(path => path.some(node => node.kind === "gain" && node.gain.value === 0)));
setUnderwaterSoundOn(c, true);
// Older Web Audio implementations use the cancel/value fallback.
filter.frequency.cancelAndHoldAtTime = undefined;
setUnderwaterDepth(30);
setUnderwaterDepth(40);
assert.equal(filter.frequency.events.length, 1);
assert.equal(c.state, "suspended");
setUnderwaterSoundOn(c, false);
const secondVolume = c.createGain();
secondVolume.connect(c.destination);
const laterInput = getUnderwaterInput(c, secondVolume);
assert(paths(laterInput, c.destination).every(path => path.some(node => node.kind === "gain" && node.gain.value === 0)), "new lanes retain existing context mute");
assert.equal(c.buffers.length, 1);

// Integration: one context, two persistent lanes, shared impulse; controls follow tails.
const storage = new Map();
const globals = {
  getUnderwaterInput, setUnderwaterSoundOn, ...settings,
  localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  window: { AudioContext: Context }, setInterval: () => 1, clearInterval() {},
};
const sfx = load("sfx.js", globals, "audio, setOn, P");
const ac = sfx.audio();
const instruments = [];
const music = load("music.js", {
  ...globals,
  unpackTrack,
  ROOM_TRACKS: JSON.parse(read("room-tracks.json")),
  Soundfont: { instrument: async (context, name, options) => {
    assert.equal(context, ac);
    instruments.push(options.destination);
    return { play: () => ({ stop() {} }) };
  } },
}, "initMusic, setMusicSoundOn, setMusicVolume, auditionMusicNote, duckMusic");
music.initMusic(ac, null, true);
await new Promise(resolve => setImmediate(resolve));
assert.equal(instruments.length, 3);
assert(instruments.every(node => node === instruments[0]));
const convolvers = ac.nodes.filter(node => node.kind === "convolver");
assert.equal(convolvers.length, 2);
assert.equal(convolvers[0].buffer, convolvers[1].buffer);
assert.equal(ac.buffers.length, 1);
const initialNodes = ac.nodes.length;
for (let i = 0; i < 100; i++) {
  setUnderwaterDepth(i);
  music.initMusic(ac, null, true);
  sfx.audio();
}
assert.equal(ac.nodes.length, initialNodes);
assert.equal(instruments.length, 3, "no extra music instance/instruments");
const musicPaths = paths(convolvers[1], ac.destination);
const sfxPaths = paths(convolvers[0], ac.destination);
music.auditionMusicNote("lead", "C4");
music.setMusicVolume(0);
assert(musicPaths.every(path => path.some(node => node.kind === "gain" && node.gain.value === 0)), "music volume silences tails");
music.setMusicVolume(0.25);
assert(musicPaths.every(path => path.some(node => node.kind === "gain" && node.gain.value === 0.25)));
music.setMusicSoundOn(false);
assert(musicPaths.every(path => path.some(node => node.kind === "gain" && node.gain.value === 0)), "music stop mutes tails");
music.setMusicSoundOn(true);
music.duckMusic(0.3, 1.5);
assert(musicPaths.every(path => path.some(node => node.gain.events.some(event => event.value === 0.3))), "duck includes tails");
sfx.P.master = 0;
sfx.audio();
assert(sfxPaths.every(path => path.some(node => node.kind === "gain" && node.gain.value === 0)), "SFX master silences tails");
sfx.P.master = 0.6;
sfx.audio();
assert(sfxPaths.every(path => path.some(node => node.kind === "gain" && node.gain.value === 0.6)));
sfx.setOn(false);
assert([...musicPaths, ...sfxPaths].every(path => path.some(node => node.kind === "gain" && node.gain.value === 0)), "shared mute silences all tails");
sfx.setOn(true);
assert([...musicPaths, ...sfxPaths].every(path => !path.some(node => node.kind === "gain" && node.gain.value === 0)));
setUnderwaterDepth(0);
console.log("Underwater audio: depth bounds/monotonicity, exact surface bypass, bounded automation, persistent lanes/shared impulse, volume/duck/mute tail routing passed");
