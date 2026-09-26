import assert from "node:assert/strict";
import { timeBlendForDate, weatherForDate, paletteOf, WEATHERS } from "../src/sea-weather.mjs";
const at = (h, m = 0, s = 0, ms = 0) => timeBlendForDate(new Date(2024, 0, 1, h, m, s, ms));

assert.deepEqual(at(12), ["day", "day", 0.375]);
assert.deepEqual(at(18), ["day", "dusk", 0.5]);
assert(at(18, 0, 0, 1)[2] > at(18)[2]);
assert.deepEqual(at(23), ["night", "night", 2 / 3]);
assert.deepEqual([0, 5, 7, 12, 19, 22].map(h => weatherForDate(new Date(2024, 0, 1, h))),
  ["night", "dawn", "sunrise", "day", "dusk", "night"]);
assert.equal(WEATHERS.length, 7);
for (const name of WEATHERS) {
  const p = paletteOf(name);
  assert.equal(p.light.length, 3);
  assert(p.light.every(Number.isFinite) && Number.isFinite(p.ambient));
}
assert.equal(paletteOf("invalid"), paletteOf("day"));
