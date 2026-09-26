/* CPU-only wiring regression. Only the renderer and image I/O are doubles;
   cameras, geometry, materials, Water and Sky are the installed Three objects. */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Vector3, RepeatWrapping, MeshBasicMaterial, PointsMaterial, FogExp2 } from "three";
import { Water } from "three/addons/objects/Water.js";
import { Sky } from "three/addons/objects/Sky.js";
import { celestialForDate, paletteOf, WEATHERS } from "../src/sea-weather.mjs";
import { fileURLToPath } from "node:url";

const threeURL = import.meta.resolve("three");
const result = await build({
  stdin: {
    contents: 'export { Sea } from "./src/sea.js"; export { renderers, loads } from "three";',
    resolveDir: fileURLToPath(new URL("..", import.meta.url)),
  },
  bundle: true, write: false, format: "esm", platform: "node", loader: { ".jpg": "dataurl" },
  plugins: [{ name: "cpu-only", setup(build) {
    build.onResolve({ filter: /^three$/ }, () => ({ path: "three-cpu", namespace: "cpu" }));
    build.onResolve({ filter: /^three\/addons\// }, args => ({ path: import.meta.resolve(args.path), external: true }));
    build.onResolve({ filter: /^file:/ }, args => ({ path: args.path, external: true }));
    build.onLoad({ filter: /.*/, namespace: "cpu" }, () => ({ contents: `
      export * from ${JSON.stringify(threeURL)};
      import { Texture } from ${JSON.stringify(threeURL)};
      export const renderers = [], loads = [];
      export class WebGLRenderer {
        constructor(options) { this.options = options; renderers.push(this); }
        setPixelRatio(value) { this.pixelRatio = value; }
        setSize(width, height) { this.size = [width, height]; }
        render(scene, camera) { scene.updateMatrixWorld(true); this.scene = scene; this.camera = camera; }
      }
      export class TextureLoader {
        load(url, success, progress, error) {
          const texture = new Texture(); loads.push({ url, success, error, texture }); return texture;
        }
      }
    ` }));
  } }],
});
const { Sea, renderers, loads } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
const canvas = { clientWidth: 960, clientHeight: 600 };
globalThis.devicePixelRatio = 3;
const sea = Sea(canvas);
sea.render(0);
const renderer = renderers[0], { scene, camera } = renderer;
const water = scene.children.find(item => item instanceof Water);
const sky = scene.children.find(item => item instanceof Sky);
const moon = scene.getObjectByName("moon"), stars = scene.getObjectByName("stars"), rain = scene.getObjectByName("rain");
assert(water && sky, "use installed official add-ons");
assert.equal(renderer.pixelRatio, 1.5);
assert.deepEqual(renderer.size, [960, 600]);
assert(scene.fog instanceof FogExp2);
assert(moon.material instanceof MeshBasicMaterial);
assert.equal(moon.geometry.type, "SphereGeometry");
assert(stars.material instanceof PointsMaterial);
assert(rain.material instanceof PointsMaterial);
assert.equal(water.material.uniforms.mirrorSampler.value.image.width, 256);
assert.equal(water.material.uniforms.mirrorSampler.value.image.height, 256);
assert.equal(water.material.uniforms.sunDirection.value, sky.material.uniforms.sunPosition.value, "share one vector, not copied directions");
assert.match(loads[0].url, /^data:image\/jpeg;base64,/);
const fallback = water.material.uniforms.normalSampler.value;
assert(fallback.isDataTexture);
assert.deepEqual([...fallback.image.data], [128, 128, 255, 255]);
let warned = false;
const warn = console.warn;
try { console.warn = () => { warned = true; }; loads[0].error(); } finally { console.warn = warn; }
assert(warned);
assert.equal(water.material.uniforms.normalSampler.value, fallback, "failed normal loading retains a usable texture");

const at = minutes => new Date(2024, 0, 1, 0, minutes);
const sharedSun = sky.material.uniforms.sunPosition.value;
for (const minutes of [0, 360, 390, 420, 720, 1050, 1080, 1140, 1320, 1439, 1320, 1140, 1080, 1050, 720, 420, 390, 360, 0]) {
  sea.setTime(at(minutes));
  const celestial = celestialForDate(at(minutes));
  assert.equal(water.material.uniforms.sunDirection.value, sharedSun);
  assert.equal(sky.material.uniforms.sunPosition.value, sharedSun);
  assert.deepEqual(sharedSun.toArray(), celestial.sun, `exact sun direction at minute ${minutes}, without render lag`);
  assert(moon.position.clone().normalize().distanceTo(new Vector3(...celestial.moon)) < 1e-12);
  if (sharedSun.y <= 0) {
    assert.equal(water.material.uniforms.sunColor.value.getHex(), 0, "no below-horizon sun highlight or redirected moon light");
    assert.equal(sky.material.uniforms.showSunDisc.value, 0);
  }
}
sea.setTime(at(0));
assert(moon.visible && stars.visible);
sea.setTime(at(720));
assert(!moon.visible && !stars.visible);
const daylightSun = sharedSun.clone();
let now = 0;
for (const weather of WEATHERS) {
  sea.setWeather(weather);
  for (let i = 0; i < 9; i++) sea.render(now += 0.25);
  assert.equal(sea.weather(), weather);
  const p = sea.paletteNow(), expected = paletteOf(weather);
  p.light.forEach((n, i) => assert(Math.abs(n - expected.light[i]) < 1e-12));
  assert(Math.abs(p.ambient - expected.ambient) < 1e-12);
  assert(sharedSun.equals(daylightSun), "weather never replaces the clock direction");
  assert.equal(rain.visible, weather === "rain");
  if (weather === "fog") assert.equal(scene.fog.density, 0.025);
  if (weather === "rain") assert.equal(sky.material.uniforms.cloudCoverage.value, 0.9);
}
for (const minute of [0, 420, 720, 1140, 720, 420, 0]) {
  sea.setCelestialTime(at(minute));
  assert.equal(sea.weather(), "rain", "manual weather survives clock updates");
  assert.deepEqual(sharedSun.toArray(), celestialForDate(at(minute)).sun);
  assert.equal(water.material.uniforms.sunDirection.value, sky.material.uniforms.sunPosition.value);
}
const rainY = rain.geometry.attributes.position.array[1];
sea.render(now += 0.1);
assert.notEqual(rain.geometry.attributes.position.array[1], rainY, "native rain particles fall");
sea.setWeather("invalid");
assert.equal(sea.weather(), "rain");

assert.equal(sea.waveIntensity(), 1);
for (const [value, expected] of [[-1, 0], [3, 2], [0.7, 0.7], [NaN, 0.7], [Infinity, 0.7], ["1", 0.7], [1, 1]]) {
  sea.setWaveIntensity(value);
  assert.equal(sea.waveIntensity(), expected);
  assert.equal(water.material.uniforms.distortionScale.value, expected * 0.5);
}
for (const zoom of [0.5, 1, 2, 4]) {
  sea.setZoom(zoom);
  for (const [w, h] of [[960, 600], [390, 844]]) {
    canvas.clientWidth = w; canvas.clientHeight = h;
    const x = w * 0.6, y = h * 0.7;
    const point = sea.screenToWorld(x, y);
    assert(point);
    const projected = new Vector3(point[0], 0, point[1]).project(camera);
    assert(Math.abs((projected.x + 1) * w / 2 - x) < 1e-8, "picking shares rendering projection");
    assert(Math.abs((1 - projected.y) * h / 2 - y) < 1e-8);
    assert.equal(sea.screenToWorld(w / 2, 0), null, "sky is not pickable");
  }
}
sea.setZoom(1);
canvas.clientWidth = 960; canvas.clientHeight = 600;
assert.equal(sea.screenToWorld(480, 600 * 0.38), null);
const [x, z] = sea.screenToWorld(480, 600 * 0.7);
assert(Math.abs(z - 2.5 / (-0.2 - 0.115)) < 1e-12, "default projection matches old backdrop");
const rings = scene.children.filter(item => item.name === "splash");
assert.equal(rings.length, 6);
for (let i = 0; i < 20; i++) sea.ripple(x, z, 1, now);
sea.render(now + 0.5);
assert.equal(scene.children.filter(item => item.name === "splash").length, 6);
assert(rings.every(r => r.visible && r.material instanceof MeshBasicMaterial && r.geometry.type === "RingGeometry"));
sea.render(now + 3);
assert(rings.every(r => !r.visible));
assert.equal(water.material.uniforms.time.value, now + 3);
assert.equal(sky.material.uniforms.time.value, now + 3);
assert.equal(typeof sea.setFx, "undefined");
assert.equal(typeof sea.setTuning, "undefined");

// Successful loading swaps in the native normal map, including repeat wrapping.
const loadedSea = Sea(canvas);
loadedSea.render(0);
const loadedWater = renderers[1].scene.children.find(item => item instanceof Water);
let disposed = false;
loadedWater.material.uniforms.normalSampler.value.addEventListener("dispose", () => { disposed = true; });
loads[1].success(loads[1].texture);
assert.equal(loadedWater.material.uniforms.normalSampler.value, loads[1].texture);
assert(disposed, "release the fallback after successful loading");
// No renderer/GPU launch occurred: every render call above used this CPU double.
assert.equal(renderers[1].options.canvas, canvas);
assert.equal(loads[1].texture.wrapS, RepeatWrapping);
assert.equal(loads[1].texture.wrapT, RepeatWrapping);
console.log("native Sea: shared sun scrubs, weather, projection, splash pool and texture fallback passed (CPU only)");
