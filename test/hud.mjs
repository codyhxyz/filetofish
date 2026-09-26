import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../src/page.html", import.meta.url), "utf8");
assert(!/drop a file|one swipe = one day|cast a sample/i.test(html));
assert.match(html, /id="foot" role="status"><b id="status"><\/b>/);
assert.match(html, /id="cast" aria-label="Fish">\s*<span class="lb">Fish<\/span>/);
const music = html.slice(html.indexOf('<div class="music-control"'), html.indexOf('<button class="tool primary"'));
for (const id of ["radio", "snd", "musicvol", "musicvolout"]) assert(music.includes(`id="${id}"`));

// Exercise the actual bindings without booting the WebGL scene or audio engine.
const elements = new Map();
const $ = id => {
  if (!elements.has(id)) elements.set(id, {
    attrs: {}, listeners: {}, style: { setProperty() {} }, classList: { add() {}, remove() {} },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(k, fn) { this.listeners[k] = fn; },
  });
  return elements.get(id);
};
let enabled = true, musicEnabled, volume = .7, track = 0;
const tracks = [{ title: "Sunlit Bobber" }, { title: "Evening Tide" }];
const context = vm.createContext({
  $, isOn: () => enabled, setOn: v => { enabled = v; }, audio: () => null, sfx() {},
  getMusicVolume: () => volume, setMusicVolume: v => volume = v,
  getMusicTrack: () => tracks[track], nextMusicTrack: () => tracks[++track],
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
