import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const elements = new Map();
const $ = id => {
  if (!elements.has(id)) elements.set(id, {
    value: id === "#time" ? "450" : "100", listeners: {}, attrs: {},
    addEventListener(event, fn) { this.listeners[event] = fn; },
    setAttribute(key, value) { this.attrs[key] = value; },
  });
  return elements.get(id);
};
const calls = [];
let frame;
vm.runInNewContext(fs.readFileSync(new URL("../src/render-world.js", import.meta.url), "utf8")
  .replace(/^import .*;\n/, ""), {
  document: { querySelector: $, hidden: false },
  Sea: () => ({
    setTime: date => calls.push(["time", date.getHours() * 60 + date.getMinutes()]),
    setWeather: weather => calls.push(["weather", weather]),
    setWaveIntensity: value => calls.push(["waves", value]),
    setZoom: value => calls.push(["zoom", value]),
    render: time => calls.push(["render", time]),
  }),
  requestAnimationFrame: callback => { frame = callback; },
  Date, String, Number, Math,
});
const fire = (id, event = "input") => $(id).listeners[event]({ currentTarget: $(id) });
assert.deepEqual(calls.slice(0, 3), [["time", 450], ["waves", 1], ["zoom", 1]]);
for (const minutes of ["1200", "420", "1439", "0"]) {
  $("#time").value = minutes; fire("#time");
  assert.deepEqual(calls.at(-1), ["time", +minutes], "time scrubs in both directions");
  assert.equal($("#weather").value, "auto");
}
$("#weather").value = "rain"; fire("#weather", "change");
assert.deepEqual(calls.at(-1), ["weather", "rain"]);
$("#waves").value = "200"; fire("#waves");
assert.deepEqual(calls.at(-1), ["waves", 2]);
$("#zoom").value = "250"; fire("#zoom");
assert.deepEqual(calls.at(-1), ["zoom", 2.5]);
frame(1000); frame(1100);
const beforePause = calls.at(-1)[1];
fire("#pause", "click"); frame(1200);
assert.deepEqual(calls.at(-1), ["render", beforePause], "pause freezes water motion");
assert.equal($("#pause").attrs["aria-pressed"], "true");
fire("#reset", "click");
assert.deepEqual(calls.slice(-3), [["time", 450], ["waves", 1], ["zoom", 1]]);
console.log("Water lab: clock, weather, native controls, pause and reset pass without a browser");
