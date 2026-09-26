import assert from "node:assert/strict";
import { loadSea, seaSource as source } from "./helpers/sea-module.mjs";

const water = source.slice(source.indexOf("vec3 shineDir ="), source.indexOf("/* ?fx= picks"));
assert.doesNotMatch(water, /\bwash\b/, "remove the broad quantized light fan, not the cartoon water");
assert.match(water, /vec3 shineDir = uSun;/, "water highlights must use the visible sun's exact direction");
assert.doesNotMatch(water, /mix\(uSun, uMoonDir/, "moonrise must not pull the highlight away from the sun");
assert.match(water, /float shineAmt = DISC\*smoothstep\(0\.0, 0\.12, uSun\.y\);/);
assert.match(water, /BRDF_GGX\(uSun, -rd, nr, waterLight\)/, "official GGX uses the live visible sun and authored normal");
assert.match(water, /SPEC_GAIN\*SPEC\*shineAmt/, "GGX fades below the horizon too");
assert.match(water, /sunSpecular\*fade\*\(1\.0 - FX_WATER\)/, "classic highlights use the same bounded daylight response");
assert.doesNotMatch(water, /float (spark|lobe|dnm|specPow)\b/, "do not stack old duplicate highlights over library GGX");
assert.match(source, /#include <lights_physical_pars_fragment>/, "use the installed physical lighting chunk, not copied math");
assert.match(source, /textureCubeUV\(uEnvironment, reflectionDir, rough\)/, "filtered reflection uses standard roughness lookup");
assert.match(source, /if \(solarDisc && DISC > 0\.001\)/, "sun disc can be excluded from reflection capture");
assert.match(source, /skyBase\(normalize\(vSkyDirection\), uTime, false\)/, "capture excludes direct solar disc but retains moon");
assert.match(source, /float q = floor\(clamp\(lit,0\.0,0\.999\)\*3\.0\)\/2\.0;/, "preserve cartoon shading");
assert.match(source, /float foam = 1\.0 - smoothstep\(thick - sw\*edge, thick \+ sw\*edge, d\);/, "preserve authored foam");

// Check the clock directions in both scrub directions, without a GPU. The
// source assertions above bind the highlight directly to the normalized sun.
const { celestialForDate } = await loadSea();
for (const hour of [6, 7, 12, 17, 18, 19, 23, 19, 18, 17, 12, 7, 6]) {
  const { sun } = celestialForDate(new Date(2024, 0, 1, hour));
  assert(sun.every(Number.isFinite));
  assert(Math.abs(Math.hypot(...sun) - 1) < 1e-12, "direct shader sun must already be normalized");
}
console.log("Water light: official sun-only GGX and filtered sky; cartoon bands and foam retained (CPU only)");
