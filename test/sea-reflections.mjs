import assert from "node:assert/strict";
import { PerspectiveCamera, ShaderChunk } from "three";
import { loadSea, seaSource } from "./helpers/sea-module.mjs";

const { Sea, reflectionCache, celestialForDate, renders, captures, resources, SEA_FS } = await loadSea({ mock: true, shaders: true });
assert.equal(Sea(null), null);
const requests = [];
assert.equal(Sea({ getContext(type) { requests.push(type); return null; } }), null);
assert.deepEqual(requests, ["webgl2"], "unsupported contexts return null without WebGL1 probes");
assert.equal(Sea({ getContext() { throw Error("unavailable"); } }), null);

const cache = reflectionCache();
const epoch = new Date(2024, 0, 1, 22).getTime();
for (let i = 0; i < 120; i++) {
  const t = i / 60;
  if (cache.due(t, epoch + t * 1000)) cache.captured(t);
}
assert.equal(cache.stats().captures, 4, "per-frame natural clock updates capture at 2Hz, not 60Hz");
const beforeDrag = cache.stats().captures;
for (let i = 120; i < 180; i++) {
  const t = i / 60;
  if (cache.due(t, epoch + i * 60000)) cache.captured(t);
}
assert.equal(cache.stats().captures - beforeDrag, 10, "continuous scrubs cannot exceed 10Hz");
assert.equal(cache.due(3, epoch - 60000), true, "reverse time scrubs invalidate too");
cache.captured(3);
assert.equal(cache.due(3.02, epoch - 120000), false, "coalesce rapid edits");
assert.equal(cache.stats().pending, true);
assert.equal(cache.due(3.1, epoch - 120000), true, "flush last scrub without another setter call");
cache.captured(3.1);
cache.invalidate();
assert.equal(cache.due(3.15, null), false);
assert.equal(cache.due(3.2, null), true, "weather/fx invalidation respects budget");

const canvas = { clientWidth: 800, clientHeight: 500, getContext: () => ({ getExtension: () => ({}) }) };
const sea = Sea(canvas);
for (const name of ["ripple", "screenToWorld", "setCamera", "setWeather", "setTime", "setCelestialTime", "weather", "setZoom", "setWaveIntensity", "waveIntensity", "setTuning", "tuning", "setFx", "fx", "palette", "paletteNow", "render", "dispose", "reflectionStats"])
  assert.equal(typeof sea[name], "function", name);
assert.equal(sea.waveIntensity(), 1);
for (const [value, expected] of [[-1, 0], [3, 2], [.7, .7], [NaN, .7], [Infinity, .7], ["1", .7]]) {
  sea.setWaveIntensity(value); assert.equal(sea.waveIntensity(), expected);
}
sea.setTuning({ crisp: .4, detail: .5, foam: .6, shine: .7 });
assert(Math.abs(sea.tuning()[3] - .7) < 1e-6);
sea.setFx([1, 1, 1, 0]);
sea.setTime(new Date(epoch));
sea.ripple(2, -8, 1, -.5);
sea.render(0);
const frame = () => renders.at(-1).uniforms;
const equalVec = (a, b) => a.forEach((v, i) => assert(Math.abs(v - b[i]) < 1e-6));
equalVec(frame().uSun, celestialForDate(new Date(epoch)).sun);
equalVec(frame().uMoonDir, captures[0].uniforms.uMoonDir);
assert.deepEqual(frame().uRip.slice(0, 4), [2, -8, -.5, 1]);
assert.equal(captures.length, 1);
assert.equal(captures[0].size, 128);
assert.deepEqual(captures[0].uniforms.uRes, [800, 800]);
assert.equal(captures[0].uniforms.uZoom, 1);
assert.equal(frame().uHasEnvironment, true);
assert.match(captures[0].material.vertexShader, /vSkyDirection = position/);
assert.equal(captures[0].material.defines.SEA_CAPTURE, 1);
assert.equal(renders.at(-1).material.toneMapped, false);
assert.equal(resources[0].toneMapping, 0);
assert.equal(resources[0].outputColorSpace, "srgb-linear");

// Camera/resizing/waves/tuning never invalidate the world-space sky cache.
const camera = new PerspectiveCamera(55, 2, .1, 1000);
camera.position.set(9, 3, 4);
sea.setCamera(camera); sea.setZoom(2); sea.setTuning([1, 1, 1, 1]); sea.setWaveIntensity(0);
canvas.clientWidth = 1000;
globalThis.devicePixelRatio = 3;
sea.render(.05);
assert.equal(canvas.width, 1500, "DPR capped at 1.5");
assert.equal(captures.length, 1);
assert.equal(frame().uWaveIntensity, 0);
assert.deepEqual(frame().uEye, [9, 3, 4]);
const targetTime = new Date(2024, 0, 1, 23);
sea.setCelestialTime(targetTime); sea.render(.06);
equalVec(frame().uSun, celestialForDate(targetTime).sun);
assert.equal(captures.length, 1, "direct light changes immediately; filtered map waits only for rate cap");
sea.render(.1);
assert.equal(captures.length, 2);
equalVec(captures.at(-1).uniforms.uMoonDir, celestialForDate(targetTime).moon);
assert.equal(captures.at(-1).uniforms.uZoom, 1);
assert.deepEqual(captures.at(-1).uniforms.uRes, [800, 800]);
assert.equal(resources.filter(r => r.isWebGLRenderTarget && !r.disposed).length, 1, "only one cached PMREM retained");
assert(sea.reflectionStats().captureMs >= 0);

sea.setWeather("rain");
for (let i = 1; i <= 10; i++) sea.render(.1 + i * .25);
assert.equal(sea.weather(), "rain");
equalVec(frame().uMoonDir, celestialForDate(targetTime).moon);
assert.equal(frame().uAmt[1], 1);
assert.deepEqual(sea.paletteNow().light.map(x => Math.round(x * 100)), [72, 80, 82]);
sea.setFx([1, 1, 1, 1]); sea.render(3);
assert.equal(renders.at(-1).target, null, "composite writes canvas");
assert.equal(frame().uStrength, .55);
assert.equal(frame().uFinish, 1);
assert.equal(resources.filter(r => r.isWebGLRenderTarget && !r.disposed).length, 8, "one PMREM plus original seven bloom targets");
const oldTargets = resources.filter(r => r.isWebGLRenderTarget && !r.disposed && r.width === canvas.width);
canvas.clientWidth = 600; sea.render(3.05);
assert(oldTargets.every(r => r.disposed), "resize releases bloom targets");
sea.dispose(); sea.dispose();
assert(resources.every(r => r.disposed), "all renderer, PMREM and target resources released");
const count = renders.length; sea.render(4); assert.equal(renders.length, count);
delete globalThis.devicePixelRatio;

// Devices without half-float attachments retain the scene and original LDR
// bloom, with disc-free analytic reflections rather than invalid PMREM targets.
const fallback = Sea({ clientWidth: 400, clientHeight: 300, getContext: () => ({ getExtension: () => null }) });
fallback.render(0);
assert.equal(fallback.reflectionStats().filtered, false);
assert.equal(frame().uFinish, 0);
fallback.dispose();

assert.match(SEA_FS, /#include <common>/);
assert.match(SEA_FS, /#include <lights_physical_pars_fragment>/);
assert.match(ShaderChunk.lights_physical_pars_fragment, /vec3 BRDF_GGX\([^]*PhysicalMaterial material/);
assert.match(SEA_FS, /#include <cube_uv_reflection_fragment>/);
assert.match(SEA_FS, /max\(fwidth\(gp\), vec2\(0\.5\)\)/, "capture integrates tiny stars over pixel footprints");
assert.match(SEA_FS, /floor\(gp - footprint\)/, "include neighbouring stars crossing capture texels");
assert.match(SEA_FS, /weight\.x\*weight\.y\*3\.14159265\*radius\*radius/, "AA conserves star flux");
assert.doesNotMatch(seaSource, /(?:from|import) [^\n]*(?:Water\.js|Sky\.js)/);
assert.doesNotMatch(seaSource, /gl\.(?:createShader|drawArrays|bindFramebuffer|uniform)/, "Three owns rendering plumbing");
console.log("sea reflections: bounded cache, immediate direct sun, latest moon flush, API, bloom and resource lifetime (CPU only)");
