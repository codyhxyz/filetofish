import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/sea.js", import.meta.url), "utf8");

assert.match(source, /uniform float uMoon;/, "day/night scenes need an explicit celestial identity");
assert.match(source, /uniform vec3 uMoonDir;/, "the moon needs a path separate from the sun");
assert.match(source, /float sunBody\(/, "the sun needs its own silhouette");
assert.match(source, /float moonBody\(/, "the moon needs its own silhouette");
assert.match(source, /vec3 moonSurface\(/, "the moon needs surface shading, not cutout crater dots");
assert.doesNotMatch(source, /vec3 godrays\(|float cloudLo\(|atan\(dv\.y/, "radial marches and angular sun spokes must not return");
assert.match(source, /float twinkle = 0\.94 \+ 0\.06\*sin/, "twinkle must keep an 88% brightness floor");
assert.match(source, /float radius = mix\(0\.55, 0\.85, bright\)\*uPx\*px;/, "stars must use tiny pixel-sized cores");
assert.match(source, /waveIntensity = clamp\(value, 0, 2\)/, "wave intensity must stay bounded");
assert.match(source, /a\.set\(nrm\(moon\), 46\); a\[49\] = moon\[3\];/, "moon direction and visibility must be packed");
assert.match(source, /uMoonDir: cur\.subarray\(46, 49\), uMoon: cur\[49\]/, "packed moon state must reach the shader");
assert.match(source, /uniforms\.uMoon\.value = cur\[49\]/, "moon visibility must update during fades and scrubs");

const night = /night:\s*\{([\s\S]*?)\n  \},/.exec(source)?.[1] || "";
const values = name => (new RegExp(`${name}: \\[([^\\]]+)\\]`).exec(night)?.[1] || "").split(",").map(Number);
const sun = values("sun"), moon = values("moon");
assert.equal(moon[3], 1, "night must show the moon");
assert.notDeepEqual(sun.slice(0, 3), moon.slice(0, 3), "sun and moon must follow different paths");
