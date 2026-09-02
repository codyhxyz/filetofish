import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/sea.js", import.meta.url), "utf8");

assert.match(source, /uniform float uMoon;/, "day/night scenes need an explicit celestial identity");
assert.match(source, /uniform vec3 uMoonDir;/, "the moon needs a path separate from the sun");
assert.match(source, /float sunBody\(/, "the sun needs its own silhouette");
assert.match(source, /float moonBody\(/, "the moon needs its own silhouette");
assert.match(source, /a\.set\(nrm\(moon\), 46\); a\[49\] = moon\[3\];/, "moon direction and visibility must be packed");
assert.match(source, /gl\.uniform3fv\(u\.moonDir, cur\.subarray\(46, 49\)\); gl\.uniform1f\(u\.moon, cur\[49\]\);/, "packed moon state must reach the shader");

const night = /night:\s*\{([\s\S]*?)\n  \},/.exec(source)?.[1] || "";
const values = name => (new RegExp(`${name}: \\[([^\\]]+)\\]`).exec(night)?.[1] || "").split(",").map(Number);
const sun = values("sun"), moon = values("moon");
assert.equal(moon[3], 1, "night must show the moon");
assert.notDeepEqual(sun.slice(0, 3), moon.slice(0, 3), "sun and moon must follow different paths");
