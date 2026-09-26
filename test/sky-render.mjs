/* Opt-in WebGL regression check: npm run test:sky (can use substantial CPU).
   CHROME may point to Chromium; SKY_ARTIFACTS optionally saves scene PNGs. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { build } from "esbuild";

if (process.env.RUN_WEBGL_TESTS !== "1") {
  console.log("Skipping browser/GPU checks. Explicit opt-in: npm run test:sky");
  process.exit(0);
}

async function checkSky() {
  const { Sea, WEATHERS, SEA_FS, SEA_VS, WebGLRenderer, ShaderMaterial, BufferGeometry, Float32BufferAttribute, Mesh, Camera } = await import("/sea.js");
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const errors = [];
  console.error = (...args) => errors.push(args.join(" "));
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  const context = HTMLCanvasElement.prototype.getContext;
  const fallback = new URLSearchParams(location.search).has("fallback");
  canvas.style.cssText = fallback ? "width:390px;height:640px" : "width:640px;height:400px";
  if (fallback) {
    HTMLCanvasElement.prototype.getContext = function(type, attrs) {
      if (type === "webgl2") return null;
      return context.call(this, type, attrs);
    };
  }
  const sea = Sea(canvas);
  if (fallback) {
    check(sea === null, "WebGL2 unavailable must return null without a WebGL1 fallback");
    return { fallback: true };
  }
  check(sea, "WebGL2 must be available");
  const gl = canvas.getContext("webgl2");
  const pixels = () => {
    const data = new Uint8Array(canvas.width*canvas.height*4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    check(gl.getError() === gl.NO_ERROR, "WebGL render/readback error");
    return data;
  };
  const energy = data => data.reduce((sum, x, i) => sum + (i%4 === 3 ? 0 : x), 0);
  check(sea.waveIntensity() === 1, "default waves must remain unchanged");
  for (const [value, expected] of [[-1, 0], [3, 2], [0.7, 0.7], [NaN, 0.7], [Infinity, 0.7], ["1", 0.7], [1, 1]]) {
    sea.setWaveIntensity(value);
    check(sea.waveIntensity() === expected, "bounded finite wave intensity: " + value);
  }
  const scenes = [];
  for (const weather of WEATHERS) {
    // New instances aren't needed: finish the existing two-second weather fade.
    sea.setWeather(weather);
    for (let i = 0; i < 10; i++) sea.render(scenes.length*3 + i*0.25);
    const data = pixels();
    check(energy(data) > canvas.width*canvas.height*15, "blank scene: " + weather);
    check(errors.length === 0, errors.join("\n"));
    scenes.push(weather);
    await fetch("/capture/" + weather + (fallback ? "-fallback" : ""), { method: "POST", body: canvas.toDataURL() });
  }
  // Single pass and every lighting switch combination compile/render too.
  for (const fx of [[0,0,0,0], [1,0,1,0], [0,1,0,1], [1,1,1,1]]) {
    sea.setFx(fx); sea.render(30); pixels();
  }
  sea.setFx([1,1,1,0]);
  sea.setTime(new Date(2024, 0, 1, 22));
  sea.render(30);
  const before = pixels();
  sea.setTime(new Date(2024, 0, 1, 22, 0, 0, 1)); sea.render(30);
  const after = pixels();
  const delta = before.reduce((sum, v, i) => sum + Math.abs(v - after[i]), 0)/before.length;
  check(delta < 0.1, "time must remain continuous: " + delta);
  sea.setWeather("day");
  for (let i = 0; i < 10; i++) sea.render(31 + i*0.25);
  sea.setWaveIntensity(0); sea.render(35); const calm = pixels();
  sea.setWaveIntensity(2); sea.render(35); const rough = pixels();
  check(calm.some((v, i) => v !== rough[i]), "wave control must reach the shader");
  sea.setWaveIntensity(0); sea.ripple(0, -8, 1, 34.5); sea.render(35);
  const pixelsWithRipple = pixels();
  check(calm.some((v, i) => v !== pixelsWithRipple[i]), "cast ripples must survive calm water");

  const reflectionStats = sea.reflectionStats();
  check(reflectionStats.captures > 0, "official PMREM must have captured the authored sky");
  sea.dispose();
  // Same authored functions through Three's GLSL3 path, isolated from clouds
  // and bloom. No raw WebGL shader programs or stale WebGL1 derivative paths.
  const renderer = new WebGLRenderer({ canvas, context: gl, antialias: false });
  renderer.setSize(canvas.width, canvas.height, false);
  const geometry = new BufferGeometry();
  geometry.setAttribute("a", new Float32BufferAttribute([-1, -1, 3, -1, -1, 3], 2));
  geometry.setDrawRange(0, 3);
  const mesh = new Mesh(geometry);
  mesh.frustumCulled = false;
  const camera = new Camera();
  const probes = [];
  function probe(body) {
    const material = new ShaderMaterial({
      vertexShader: SEA_VS,
      fragmentShader: SEA_FS.slice(0, SEA_FS.lastIndexOf("void main(){")) + `
void main(){
  vec2 sp = (gl_FragCoord.xy - 0.5*uRes)/uRes.y;
  ${body}
}`,
      depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: {
        uRes: { value: [canvas.width, canvas.height] }, uPx: { value: Math.min(devicePixelRatio, 1.5) },
        uZoom: { value: 1 }, uTime: { value: 0 }, uMoonDir: { value: [0, 0, -1] },
      },
    });
    probes.push(material);
    mesh.material = material;
    return material;
  }
  const program = probe("gl_FragColor = vec4(vec3(starfield(sp, uTime)/3.0), 1.0);");
  const frames = [];
  for (const time of [0, 2, 5, 9]) {
    program.uniforms.uTime.value = time;
    renderer.render(mesh, camera); frames.push(pixels());
  }
  let brightPixels = 0, changed = 0;
  for (let i = 0; i < frames[0].length; i += 4) {
    const values = frames.map(frame => frame[i]);
    if (Math.max(...values) < 40) continue;
    brightPixels++;
    check(Math.min(...values)/Math.max(...values) > 0.84, "twinkle must not blink out");
    if (Math.max(...values) - Math.min(...values) > 2) changed++;
  }
  check(brightPixels > 30 && brightPixels < canvas.width*canvas.height*0.01, "sparse, bright pinpoints");
  check(changed > 20, "stars need restrained brightness variation");
  // No star may become a horizontal diffuse blob (including DPR 1.5).
  let longest = 0, run = 0;
  for (let y = 0; y < canvas.height; y++) {
    run = 0;
    for (let x = 0; x < canvas.width; x++) {
      run = frames[0][(y*canvas.width + x)*4] > 8 ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
  }
  check(longest <= Math.ceil(3*Math.min(devicePixelRatio, 1.5)), "oversized stars: " + longest);
  const moonProbe = probe(`
    vec3 dv = vec3(sp, 0.0);
    float disc = moonBody(dv);
    float surface = disc > 0.0 ? moonSurface(dv).r : 0.0;
    gl_FragColor = vec4(disc, surface*disc/2.0, sunBody(dv), 1.0);
  `);
  renderer.render(mesh, camera);
  const bodies = pixels(), shades = [];
  let moonPixels = 0, sunPixels = 0;
  for (let i = 0; i < bodies.length; i += 4) {
    if (bodies[i] > 128) { moonPixels++; shades.push(bodies[i + 1]); }
    if (bodies[i + 2] > 128) sunPixels++;
  }
  const expectedMoonArea = Math.PI*(0.0105*canvas.height)**2;
  check(moonPixels > expectedMoonArea*0.8 && moonPixels < expectedMoonArea*1.2, "moon must stay small and circular");
  check(sunPixels > moonPixels*0.7 && sunPixels <= moonPixels, "sun must be a small disc, not spokes");
  check(Math.max(...shades) - Math.min(...shades) > 60, "moon needs a shaded terminator, not a flat dot");
  check(errors.length === 0, errors.join("\n"));
  for (const material of probes) material.dispose();
  geometry.dispose(); renderer.dispose();
  return { scenes, fallback, dpr: devicePixelRatio, brightPixels, longestStarRun: longest, moonPixels, timeDelta: delta, reflectionStats };
}

// Keep the browser fixture in this file, so the check is independently runnable.
const browserCheck = checkSky.toString();
const source = fs.readFileSync(new URL("../src/sea.js", import.meta.url), "utf8");
const bundle = await build({
  stdin: { contents: source + "\nexport { SEA_FS, SEA_VS, WebGLRenderer, ShaderMaterial, BufferGeometry, Float32BufferAttribute, Mesh, Camera };", resolveDir: process.cwd(), loader: "js" },
  bundle: true, write: false, format: "esm", platform: "browser",
});
let report;
const server = http.createServer((req, res) => {
  if (req.url === "/result") {
    let data = "";
    req.on("data", chunk => data += chunk);
    req.on("end", () => { res.end("ok"); report(data); });
  } else if (req.url === "/sea.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(bundle.outputFiles[0].text);
  } else if (req.url.startsWith("/capture/")) {
    let data = "";
    req.on("data", chunk => data += chunk);
    req.on("end", () => {
      if (process.env.SKY_ARTIFACTS) {
        fs.mkdirSync(process.env.SKY_ARTIFACTS, { recursive: true });
        const name = req.url.slice(9).replace(/[^a-z-]/g, "");
        fs.writeFileSync(path.join(process.env.SKY_ARTIFACTS, name + ".png"), Buffer.from(data.split(",")[1], "base64"));
      }
      res.end("ok");
    });
  } else {
    res.setHeader("Content-Type", "text/html");
    res.end(`<body><script type="module">(${browserCheck})().then(result => 'PASS:' + JSON.stringify(result)).catch(error => 'FAIL:' + error.stack).then(body => fetch('/result', { method: 'POST', body }));</script>`);
  }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const chrome = process.env.CHROME || (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "chromium");
try {
  for (const fallback of [false, true]) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sea-webgl-"));
    try {
      const output = await new Promise((resolve, reject) => {
        const child = spawn(chrome, ["--headless", "--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader",
          "--no-first-run", "--disable-background-networking", "--user-data-dir=" + profile,
          "--force-device-scale-factor=" + (fallback ? "1.5" : "1"), "--remote-debugging-port=0",
          `http://127.0.0.1:${server.address().port}/${fallback ? "?fallback" : ""}`]);
        let stderr = "", result;
        child.stderr.on("data", chunk => stderr += chunk);
        const timer = setTimeout(() => { child.kill(); reject(new Error("Chrome render timeout: " + stderr.slice(-1500))); }, 120000);
        report = data => { result = data; child.kill(); };
        child.on("error", error => { clearTimeout(timer); reject(error); });
        child.on("exit", () => { clearTimeout(timer); result ? resolve(result) : reject(new Error(stderr.slice(-2000))); });
      });
      assert.match(output, /^PASS:/, output);
      console.log(output);
    } finally { fs.rmSync(profile, { recursive: true, force: true }); }
  }
} finally { server.close(); }
