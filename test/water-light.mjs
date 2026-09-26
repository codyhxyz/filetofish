import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/sea.js", import.meta.url), "utf8");
const water = source.slice(source.indexOf("float specPow ="), source.indexOf("/* ?fx= picks"));
assert.doesNotMatch(water, /\bwash\b/, "remove the broad quantized light fan, not the cartoon water");
assert.match(water, /vec3 shineDir = uSun;/, "water highlights must use the visible sun's exact direction");
assert.doesNotMatch(water, /mix\(uSun, uMoonDir/, "moonrise must not pull the highlight away from the sun");
assert.match(water, /float shineAmt = DISC\*smoothstep\(0\.0, 0\.12, uSun\.y\);/);
assert.match(water, /SPEC\*shineAmt\*\(1\.0 - FX_WATER\)/, "classic highlights fade below the horizon too");
assert.match(water, /dot\(reflect\(rd,fn\),shineDir\),0\.0\)\)\*fade\*shineAmt/, "sparkles use reflection and daylight, not a painted band");
assert.match(source, /float q = floor\(clamp\(lit,0\.0,0\.999\)\*3\.0\)\/2\.0;/, "preserve cartoon shading");
assert.match(source, /float foam = 1\.0 - smoothstep\(thick - sw\*edge, thick \+ sw\*edge, d\);/, "preserve authored foam");

// Check the clock directions in both scrub directions, without a GPU. The
// source assertions above bind the highlight directly to the normalized sun.
const { celestialForDate } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
for (const hour of [6, 7, 12, 17, 18, 19, 23, 19, 18, 17, 12, 7, 6]) {
  const { sun } = celestialForDate(new Date(2024, 0, 1, hour));
  assert(sun.every(Number.isFinite));
  assert(Math.abs(Math.hypot(...sun) - 1) < 1e-12, "direct shader sun must already be normalized");
}
console.log("Water light: painted fan removed; sun-only highlights; cartoon bands and foam retained (CPU only)");
