import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/sea.js", import.meta.url), "utf8");
const { timeBlendForDate } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const at = (h, m = 0, s = 0, ms = 0) => timeBlendForDate(new Date(2024, 0, 1, h, m, s, ms));

assert.deepEqual(at(12), ["day", "day", 0.375]);
assert.deepEqual(at(18), ["day", "dusk", 0.5]);
assert(at(18, 0, 0, 1)[2] > at(18)[2]);
assert.deepEqual(at(23), ["night", "night", 2 / 3]);
