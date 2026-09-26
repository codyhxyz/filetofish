import {
  ACESFilmicToneMapping, BufferGeometry, Color, DataTexture, Float32BufferAttribute,
  FogExp2, Mesh, MeshBasicMaterial, PerspectiveCamera, Plane, PlaneGeometry,
  Points, PointsMaterial, Raycaster, RepeatWrapping, RingGeometry, Scene,
  SphereGeometry, SRGBColorSpace, TextureLoader, Vector2, Vector3, WebGLRenderer,
} from "three";
import { Water } from "three/addons/objects/Water.js";
import { Sky } from "three/addons/objects/Sky.js";
import waterNormalsURL from "./assets/waternormals.jpg";
import { WEATHERS, celestialForDate, paletteOf, timeBlendForDate, weatherForDate } from "./sea-weather.mjs";
export { WEATHERS, celestialForDate, paletteOf, timeBlendForDate, weatherForDate } from "./sea-weather.mjs";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/* Only native add-on/material inputs; the clock owns celestial directions. */
const WEATHER = {
  dawn:    { water: [0.040, 0.070, 0.180], haze: [0.520, 0.500, 0.670], turbidity: 6, clouds: 0.25, density: 0.35, fog: 0.002, rain: 0, sunlight: 0.7 },
  sunrise: { water: [0.065, 0.130, 0.255], haze: [1.000, 0.790, 0.560], turbidity: 8, clouds: 0.30, density: 0.35, fog: 0.001, rain: 0, sunlight: 1 },
  day:     { water: [0.070, 0.360, 0.620], haze: [0.658, 0.881, 0.941], turbidity: 2, clouds: 0.15, density: 0.25, fog: 0.0003, rain: 0, sunlight: 1 },
  dusk:    { water: [0.035, 0.075, 0.200], haze: [0.940, 0.500, 0.400], turbidity: 8, clouds: 0.30, density: 0.40, fog: 0.002, rain: 0, sunlight: 0.8 },
  night:   { water: [0.012, 0.030, 0.095], haze: [0.100, 0.140, 0.300], turbidity: 2, clouds: 0.12, density: 0.25, fog: 0.001, rain: 0, sunlight: 0.7 },
  fog:     { water: [0.215, 0.315, 0.360], haze: [0.820, 0.850, 0.870], turbidity: 20, clouds: 0.85, density: 0.90, fog: 0.025, rain: 0, sunlight: 0.08 },
  rain:    { water: [0.045, 0.115, 0.115], haze: [0.470, 0.545, 0.545], turbidity: 15, clouds: 0.90, density: 1.00, fog: 0.008, rain: 1, sunlight: 0.15 },
};
for (const name of WEATHERS) {
  const { light, ambient } = paletteOf(name);
  Object.assign(WEATHER[name], { light, ambient });
}
const blend = (a, b, k) => Object.fromEntries(Object.entries(a).map(([key, v]) => [key,
  Array.isArray(v) ? v.map((n, i) => n + (b[key][i] - n) * k) : v + (b[key] - v) * k,
]));

export function Sea(canvas) {
  const renderer = new WebGLRenderer({ canvas, antialias: false });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5;
  const scene = new Scene();
  scene.background = new Color(0x102039);
  scene.fog = new FogExp2(0xabcde0, 0.0003);
  // Off-axis projection preserves the old 38.5%-height horizon and 2.5m eye.
  const camera = new PerspectiveCamera(2 * Math.atan(0.5) * 180 / Math.PI, 1, 0.1, 30000);
  camera.position.set(0, 2.5, 0);
  camera.updateMatrixWorld();
  const sky = new Sky();
  sky.scale.setScalar(10000);
  sky.renderOrder = -2;
  scene.add(sky);
  const sun = new Vector3();
  sky.material.uniforms.sunPosition.value = sun;
  sky.material.uniforms.rayleigh.value = 2;
  sky.material.uniforms.mieCoefficient.value = 0.005;

  // A constant neutral normal keeps the official Water usable while loading/on error.
  const fallback = new DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  fallback.wrapS = fallback.wrapT = RepeatWrapping;
  fallback.needsUpdate = true;
  const water = new Water(new PlaneGeometry(20000, 20000), {
    textureWidth: 256, textureHeight: 256, waterNormals: fallback,
    sunDirection: sun, sunColor: 0xffffff, waterColor: 0x125c9e,
    distortionScale: 0.5, fog: true,
  });
  water.rotation.x = -Math.PI / 2;
  water.material.uniforms.size.value = 10;
  scene.add(water);
  const pendingNormals = new TextureLoader().load(waterNormalsURL, texture => {
    texture.wrapS = texture.wrapT = RepeatWrapping;
    water.material.uniforms.normalSampler.value = texture;
    fallback.dispose();
  }, undefined, () => {
    pendingNormals.dispose();
    console.warn("Water normals unavailable; using a flat reflective surface.");
  });

  const moon = new Mesh(new SphereGeometry(45, 24, 16), new MeshBasicMaterial({
    color: 0xe5ecff, transparent: true, fog: false, toneMapped: false,
  }));
  moon.name = "moon";
  scene.add(moon); // Water's native reflection pass sees this same geometric moon.
  const starPositions = [];
  for (let i = 0; i < 180; i++) {
    const azimuth = i * 2.399963229728653;
    const y = (i + 0.5) / 180, r = Math.sqrt(1 - y * y);
    starPositions.push(Math.cos(azimuth) * r * 8000, y * 8000, Math.sin(azimuth) * r * 8000);
  }
  const stars = new Points(new BufferGeometry().setAttribute("position", new Float32BufferAttribute(starPositions, 3)),
    new PointsMaterial({ color: 0xdce6ff, size: 1, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  stars.name = "stars";
  scene.add(stars);
  const rainPositions = new Float32Array(256 * 3);
  for (let i = 0; i < rainPositions.length; i += 3) {
    rainPositions[i] = (Math.random() - 0.5) * 24;
    rainPositions[i + 1] = Math.random() * 16;
    rainPositions[i + 2] = -2 - Math.random() * 30;
  }
  const rain = new Points(new BufferGeometry().setAttribute("position", new Float32BufferAttribute(rainPositions, 3)),
    new PointsMaterial({ color: 0xc3d9e2, size: 0.035, transparent: true, opacity: 0, depthWrite: false }));
  rain.name = "rain";
  rain.frustumCulled = false;
  scene.add(rain);

  const ringGeometry = new RingGeometry(0.94, 1, 48);
  const ripples = Array.from({ length: 6 }, () => {
    const mesh = new Mesh(ringGeometry, new MeshBasicMaterial({ color: 0xc7e4eb, transparent: true, depthWrite: false }));
    mesh.name = "splash";
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, start: 0, strength: 0 };
  });
  const raycaster = new Raycaster(), pointer = new Vector2(), hit = new Vector3();
  const surface = new Plane(new Vector3(0, 1, 0), 0);
  let width = 0, height = 0, pixelRatio = 0, zoom = 1, waveIntensity = 1, slot = 0;
  let weather = "day", current = WEATHER.day, transition = null, last = null;
  let celestial = celestialForDate(new Date());

  function resize() {
    const w = Math.max(2, canvas.clientWidth), h = Math.max(2, canvas.clientHeight);
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 1.5);
    if (w === width && h === height && dpr === pixelRatio) return;
    width = w; height = h; pixelRatio = dpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    updateProjection();
  }
  function updateProjection() {
    camera.zoom = zoom;
    camera.setViewOffset(width || 2, height || 2, 0, 0.115 * (height || 2) * zoom, width || 2, height || 2);
    camera.updateProjectionMatrix();
  }
  function applyState() {
    sun.fromArray(celestial.sun);
    const daylight = clamp(sun.y / 0.08, 0, 1) * current.sunlight;
    const su = sky.material.uniforms, wu = water.material.uniforms;
    su.showSunDisc.value = daylight;
    su.turbidity.value = current.turbidity;
    su.cloudCoverage.value = current.clouds;
    su.cloudDensity.value = current.density;
    wu.sunColor.value.setRGB(1, 0.97, 0.9).multiplyScalar(daylight);
    wu.waterColor.value.fromArray(current.water);
    scene.fog.color.fromArray(current.haze);
    scene.fog.density = current.fog;
    moon.position.fromArray(celestial.moon).multiplyScalar(9000);
    moon.material.opacity = celestial.moonVisibility * (0.25 + 0.75 * current.sunlight);
    moon.visible = moon.position.y > 0 && moon.material.opacity > 0;
    stars.material.opacity = clamp(-sun.y * 3, 0, 1) * (1 - current.clouds);
    stars.visible = stars.material.opacity > 0;
    rain.material.opacity = current.rain * 0.5;
    rain.visible = current.rain > 0;
  }
  applyState();

  return {
    ripple(x, z, strength, now) {
      if (![x, z, strength, now].every(Number.isFinite)) return;
      const r = ripples[slot];
      slot = (slot + 1) % ripples.length;
      r.start = now; r.strength = clamp(strength, 0, 2);
      r.mesh.position.set(x, 0.015, z);
      r.mesh.scale.setScalar(0.1);
      r.mesh.material.opacity = r.strength * 0.5;
      r.mesh.visible = true;
    },
    screenToWorld(cx, cy) {
      if (![cx, cy].every(Number.isFinite)) return null;
      resize();
      pointer.set(cx / width * 2 - 1, 1 - cy / height * 2);
      raycaster.setFromCamera(pointer, camera);
      if (!raycaster.ray.intersectPlane(surface, hit) || Math.abs(hit.x) > 10000 || Math.abs(hit.z) > 10000) return null;
      return [hit.x, hit.z];
    },
    setWeather(name) {
      if (!WEATHERS.includes(name) || name === weather) return;
      weather = name;
      if (last === null) current = WEATHER[name];
      else transition = { from: current, to: WEATHER[name], age: 0 };
      applyState();
    },
    setTime(d) {
      const [a, b, k] = timeBlendForDate(d);
      weather = weatherForDate(d);
      current = blend(WEATHER[a], WEATHER[b], k);
      transition = null;
      celestial = celestialForDate(d);
      applyState();
    },
    setCelestialTime(d) { celestial = celestialForDate(d); applyState(); },
    weather() { return weather; },
    palette() { return paletteOf(weather); },
    paletteNow() { return { ...paletteOf(weather), light: current.light.slice(), ambient: current.ambient }; },
    setZoom(value) { zoom = clamp(Number(value) || 1, 0.5, 4); updateProjection(); },
    setWaveIntensity(value) {
      if (!Number.isFinite(value)) return;
      waveIntensity = clamp(value, 0, 2);
      water.material.uniforms.distortionScale.value = waveIntensity * 0.5;
    },
    waveIntensity() { return waveIntensity; },
    render(now) {
      resize();
      const dt = last === null ? 0 : clamp(now - last, 0, 0.25);
      last = now;
      if (transition) {
        transition.age = Math.min(2, transition.age + dt);
        const k = transition.age / 2;
        current = blend(transition.from, transition.to, k * k * (3 - 2 * k));
        if (k === 1) transition = null;
        applyState();
      }
      water.material.uniforms.time.value = now;
      sky.material.uniforms.time.value = now;
      if (rain.visible) {
        const positions = rain.geometry.attributes.position;
        for (let i = 1; i < positions.array.length; i += 3) positions.array[i] = (positions.array[i] - dt * 12 + 16) % 16;
        positions.needsUpdate = true;
      }
      for (const r of ripples) {
        if (!r.mesh.visible) continue;
        const age = now - r.start;
        r.mesh.visible = age >= 0 && age < 2;
        r.mesh.scale.setScalar(0.1 + Math.max(0, age) * (0.6 + r.strength * 0.4));
        r.mesh.material.opacity = Math.max(0, 1 - age / 2) * r.strength * 0.5;
      }
      renderer.render(scene, camera);
    },
  };
}
