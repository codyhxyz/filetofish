import assert from "node:assert/strict";
import { loadSea } from "./helpers/sea-module.mjs";

const { celestialForDate } = await loadSea();
const at = (h, m = 0, s = 0) => celestialForDate(new Date(2024, 0, 1, h, m, s));
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

assert(distance(at(22).moon, at(22, 0, 1).moon) > 0.00001, "moon must move continuously");
assert(distance(at(22).moon, at(23).moon) > 0.01, "moon must move during the night");
assert(distance(at(12).sun, at(12, 0, 1).sun) > 0.00001, "sun must move continuously");
assert(distance(at(12).sun, at(13).sun) > 0.01, "sun must move during the day");
assert(at(0).moonVisibility > at(12).moonVisibility, "moon must be brighter at night");
