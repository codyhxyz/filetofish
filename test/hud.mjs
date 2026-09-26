import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../src/page.html", import.meta.url), "utf8");
assert(!/drop a file|one swipe = one day|cast a sample/i.test(html));
assert.match(html, /id="foot" role="status"><b id="status"><\/b>/);
assert.match(html, /id="cast" aria-label="Fish">\s*<span class="lb">Fish<\/span>/);
const depthRules = [...html.matchAll(/#explore-status\s*\{([^}]+)\}/g)];
assert.equal(depthRules.length, 1, "mobile must not override depth placement");
assert.match(depthRules[0][1], /left:clamp\(1rem,3vw,2rem\);top:50%;transform:translateY\(-50%\)/);
const music = html.slice(html.indexOf('<div class="music-control"'), html.indexOf('<button class="tool primary"'));
for (const id of ["radio", "snd", "musicvol", "musicvolout"]) assert(music.includes(`id="${id}"`));

// Exercise the actual bindings without booting the WebGL scene or audio engine.
const elements = new Map();
const $ = id => {
  if (!elements.has(id)) elements.set(id, {
    attrs: {}, listeners: {}, style: { setProperty() {} }, firstChild: {},
    classes: new Set(),
    get classList() { const c = this.classes; return { add: k => c.add(k), remove: k => c.delete(k) }; },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(k, fn) { this.listeners[k] = fn; },
  });
  return elements.get(id);
};
let enabled = true, musicEnabled, volume = .7, track = 0;
const tracks = [{ title: "Sunlit Bobber" }, { title: "Evening Tide" }];
const stored = new Map();
const context = vm.createContext({
  $, isOn: () => enabled, setOn: v => { enabled = v; }, audio: () => null, sfx() {},
  TRACKS: tracks, setTimeout: () => 0, clearTimeout() {},
  localStorage: { getItem: k => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, v) },
  getMusicVolume: () => volume, setMusicVolume: v => volume = v,
  getMusicTrack: () => tracks[track], nextMusicTrack: () => tracks[track = (track + 1) % tracks.length],
  setMusicSoundOn: v => { musicEnabled = v; },
});
vm.runInContext(app.slice(app.indexOf('const elRadio = $("#radio")'), app.indexOf('/* ============================================================ files */')), context);
const fire = (id, type) => $(id).listeners[type]({ stopPropagation() {} });
assert.equal($("#musicvol").value, "70");
assert.equal($("#radionm").textContent, tracks[0].title);
fire("#radio", "click");
assert.equal($("#radionm").textContent, tracks[1].title);
assert.match($("#radio").attrs["aria-label"], /Evening Tide/);
$("#musicvol").value = "25";
fire("#musicvol", "input");
assert.equal(volume, .25);
assert.equal($("#musicvolout").textContent, "25%");
fire("#snd", "click");
assert.equal(musicEnabled, false);
assert.equal($("#snd").attrs["aria-pressed"], "false");
assert.equal($("#snd").title, "Unmute sound");
fire("#snd", "click");
assert.equal(musicEnabled, true);
assert.equal($("#snd").attrs["aria-label"], "Mute sound");
assert.equal(volume, .25, "sound toggle must retain the music level");

// The phone's one music button: next song, and silence only after the last song.
track = 0;
fire("#music", "click");
assert.equal(tracks[track].title, "Evening Tide");
assert.equal($("#now-playing-t").textContent, "Evening Tide", "a track change names itself");
assert($("#now-playing").classes.has("on"));
assert.equal(musicEnabled, true);
fire("#music", "click");
assert.equal(musicEnabled, false, "after the last song comes silence");
assert.equal(track, 1, "muting does not skip a song");
assert.equal($("#music").attrs["aria-pressed"], "false");
assert.equal(stored.get("filetofish.musicMuted"), "1");
fire("#music", "click");
assert.equal(musicEnabled, true);
assert.equal(tracks[track].title, "Sunlit Bobber", "silence rolls over to the first song");
assert.equal($("#music").attrs["aria-pressed"], "true");

// Completion feedback stays until the existing gone -> idle transition clears it.
const idle = app.match(/if \(age > 3\.2\) \{ state = "idle";[^\n]+/)[0];
const status = { age: 2, state: "gone", now: 10, t0: 0, note: "kept", say(s) { status.note = s; } };
vm.runInNewContext(idle, status);
assert.equal(status.note, "kept");
status.age = 4;
vm.runInNewContext(idle, status);
assert.equal(status.state, "idle");
assert.equal(status.note, "");
console.log("HUD: grouped controls, music bindings, accessible labels and idle status passed");
