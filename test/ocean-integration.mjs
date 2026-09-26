import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as THREE from "three";

// Run the real runtime, geometry and controller in Node; only DOM, audio and
// GPU calls are stubbed. No browser, WebGL context or folder permission needed.
const source = fs.readFileSync(new URL("../src/ocean.js", import.meta.url), "utf8")
  .replace(/^import [\s\S]*? from "[^"]+";\n/gm, "")
  .replace("export function initOcean", "function initOcean");
class Element {
  hidden = true;
  style = {};
  listeners = {};
  children = new Map();
  classList = { add() {}, remove() {}, toggle() {} };
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  querySelector(key) {
    if (!this.children.has(key)) this.children.set(key, new Element());
    return this.children.get(key);
  }
  querySelectorAll() { return []; }
  appendChild() {}
  setAttribute() {}
  setPointerCapture() {}
  releasePointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; }
}
const root = new Element(), host = new Element(), doc = new Element(), win = new Element();
root.host = host;
doc.hidden = false;
doc.body = new Element();
doc.createElement = () => new Element();
let renderers = 0, renderer, clock = 0, nextFrame, frameData, blocked = false;
class Renderer {
  constructor(options) { this.options = options; renderer = this; renderers++; }
  setClearColor(color, alpha) { this.alpha = alpha; }
  setPixelRatio() {}
  setSize() {}
  setRenderTarget(target) { this.target = target; }
  clear() { if (!this.target) this.screenAlpha = this.alpha; }
  render(scene) { this.scenes.push(scene); }
  scenes = [];
}
const context = vm.createContext({ ...THREE, WebGLRenderer: Renderer,
  document: doc, window: win, location: { search: "?demo" },
  innerWidth: 800, innerHeight: 600, devicePixelRatio: 1,
  performance: { now: () => clock },
  requestAnimationFrame: fn => { nextFrame = fn; }, setTimeout() {},
  addEventListener: win.addEventListener.bind(win),
  SND: { voice: { step: 0.01 } }, speak: () => ({ stop() {} }), beats: () => 1,
  isOn: () => false, setOn() {}, audio: () => null, sfx() {},
});
vm.runInContext(source, context);
const ocean = context.initOcean(root, {
  embedded: true, isBlocked: () => blocked, onFrame: data => { frameData = data; },
});
const tick = (count = 1) => {
  for (let i = 0; i < count; i++) { clock += 50; renderer.scenes = []; nextFrame(clock); }
};
const fire = (target, type, event = {}) => {
  for (const fn of target.listeners[type] || []) fn(event);
};
const key = (name, extra = {}, type = "keydown") => fire(win, type, {
  key: name, code: name === " " ? "Space" : `Key${name.toUpperCase()}`,
  preventDefault() {}, composedPath: () => [root.querySelector("#gl"), root, host], ...extra,
});
const release = name => key(name, {}, "keyup");
const snapshot = () => [...ocean.cam.pos.toArray(), ocean.cam.yaw, ocean.cam.pitch];

tick();
assert.equal(ocean.phase, "dock", "embedded demo loads without auto-diving even with ?demo");
assert.equal(ocean.perspective, "first");
assert.equal(ocean.player.root.visible, false);
assert.equal(ocean.camera.position.y, ocean.cam.pos.y + 1.1);
assert.equal(renderer.options.alpha, true);
assert.equal(renderer.screenAlpha, 0, "surface canvas reveals shell Sea");
assert.equal(renderer.scenes.length, 2, "only dock render target and composite above water");
assert.equal(win.ocean, undefined, "no folder/debug API in embedded mode");
for (const id of ["open-real", "open-demo", "net-del", "conf-yes", "net-haul"])
  assert.equal(root.querySelector(`#${id}`).listeners.click, undefined, `${id} is inactive`);
assert(!host.children.has("#dirinput"));

key("w"); tick(60); release("w"); tick(20);
assert(ocean.cam.pos.z >= -0.58 && ocean.cam.pos.z < 0, "W walks to front, not through edge");
assert.equal(ocean.phase, "dock");
key("a"); tick(40); release("a"); tick(10);
assert(ocean.cam.pos.x >= -0.78);
ocean.setMove(1, -1); tick(80); ocean.clearInput();
assert(ocean.cam.pos.x <= 0.78 && ocean.cam.pos.z <= 2.84);
assert.equal(ocean.cam.pos.y, 1);

ocean.cam.yaw = ocean.cam.yawT = 0.7;
ocean.cam.pitch = ocean.cam.pitchT = 0.2;
let before = snapshot();
assert.equal(ocean.toggleView(), true);
assert.equal(ocean.perspective, "third");
assert.deepEqual(snapshot(), before, "view preserves position and heading");
tick();
assert.equal(ocean.player.rod.visible, true);
ocean.cam.pitch = ocean.cam.pitchT = 1.22;
tick(20);
assert.equal(frameData.underwater, false, "looking up in third person cannot submerge the camera from the dock");
ocean.cam.pitch = ocean.cam.pitchT = before.at(-1);
ocean.toggleView();
assert.deepEqual(snapshot(), before);

key("w"); tick(2); blocked = true; tick();
assert.equal(ocean.cam.vel.length(), 0);
before = snapshot(); tick(10);
assert.deepEqual(snapshot(), before, "blocked state has no residual drift");
assert.equal(ocean.beginJump(), false);
assert.equal(ocean.toggleView(), false);
assert.equal(ocean.returnToDock(), false);
ocean.setMove(1, 1); ocean.setVertical(1);
blocked = false; key("w", { repeat: true }); tick(5);
assert.deepEqual(snapshot(), before, "blocking clears intent until a fresh key press");
release("w");
key("v", { composedPath: () => [{ tagName: "BUTTON" }, root, host] }); release("v");
assert.equal(ocean.perspective, "first", "composed UI path owns keys");
key(" ", { composedPath: () => [{ isContentEditable: true }, root] }); release(" ");
assert.equal(ocean.phase, "dock");
let summaryPrevented = false;
key(" ", { composedPath: () => [{ tagName: "SUMMARY" }, root],
  preventDefault: () => { summaryPrevented = true; } }); release(" ");
assert.equal(ocean.phase, "dock", "Space on version history does not dive");
assert.equal(summaryPrevented, false, "summary retains native keyboard activation");

ocean.returnToDock();
ocean.greetKelp();
assert.equal(ocean.beginJump(), false, "dialogue refuses dive");
assert.equal(ocean.toggleView(), false);
assert.equal(ocean.returnToDock(), false);
// One press finishes the greeting, the next closes it; neither also dives.
key(" "); release(" "); key(" ");
assert.equal(ocean.phase, "dock");
key(" ", { repeat: true });
assert.equal(ocean.phase, "dock", "held dialogue Space cannot dive");
release(" ");
key(" ");
assert.equal(ocean.phase, "jump", "Space dives from the back of the dock");
assert.equal(ocean.perspective, "third");
assert.equal(ocean.toggleView(), false, "view cannot interrupt dive");
assert.equal(ocean.returnToDock(), false, "return cannot interrupt dive");
tick(4);
assert.equal(ocean.cam.pos.y, 1, "jump approaches edge on the deck before crossing");
tick(35);
assert.equal(ocean.phase, "ocean");
assert.equal(frameData.underwater, true);
assert.equal(renderer.screenAlpha, 1);
const jellyScene = renderer.scenes.find(scene => scene.getObjectByName("moon-jellies"));
const jellies = jellyScene.getObjectByName("moon-jellies");
assert.equal(jellies.count, 24, "ambient life has a fixed instancing budget");
assert.equal(jellies.visible, true);
assert([...jellies.geometry.attributes.position.array].every(Number.isFinite));
assert([...jellies.instanceMatrix.array].every(Number.isFinite));
const jellyClock = jellies.material.uniforms.uTime.value;
tick(3);
assert(jellies.material.uniforms.uTime.value > jellyClock, "jelly bells and tentacles animate");
doc.hidden = true;
const hiddenClock = jellies.material.uniforms.uTime.value;
tick(3);
assert.equal(jellies.material.uniforms.uTime.value, hiddenClock, "ambient animation pauses in hidden tabs");
doc.hidden = false;
assert.equal(ocean.guide.root.position.y, 1, "dock and Kelp stay on surface");
assert.equal(ocean.guide.root.visible, true);
assert.equal(ocean.guide.root.rotation.z, 0);
before = snapshot(); ocean.toggleView();
assert.deepEqual(snapshot(), before);
tick();
assert.equal(ocean.player.root.visible, false);
assert.equal(ocean.camera.rotation.z, 0);
assert.equal(ocean.camera.position.y, ocean.cam.pos.y + 1.1);
key("w"); ocean.setVertical(-1); tick(5);
assert(ocean.cam.pos.distanceTo(new THREE.Vector3(...before.slice(0, 3))) > 0.1);
blocked = true; tick(); before = snapshot(); context.innerWidth = 900; tick(10);
assert.deepEqual(snapshot(), before, "underwater blocking and resize cannot move player");
assert.equal(ocean.returnToDock(), false);
blocked = false; release("w");
ocean.returnToDock();
tick();
assert.equal(jellies.visible, false, "jellies never float above the dock");
key(" ", { repeat: true });
assert.equal(ocean.phase, "dock", "held jump key does not re-dive after return");
release(" ");
key("d"); tick(2); fire(win, "blur"); before = snapshot(); tick(5);
assert.deepEqual(snapshot(), before);
ocean.setMove(-1, 1); tick(2); doc.hidden = true;
fire(doc, "visibilitychange"); before = snapshot(); tick(5);
assert.deepEqual(snapshot(), before);
assert.equal(renderers, 1, "all transitions reuse renderer");
assert.equal(frameData.phase, "dock");
assert.equal(ocean.camera.matrixWorld.elements[13], ocean.camera.position.y, "onFrame camera matrix is current");
const canvas = root.querySelector("#gl");
const touch = { pointerId: 2, isPrimary: false, pointerType: "touch", button: 0, clientX: 20, clientY: 20 };
fire(canvas, "pointerdown", touch);
fire(canvas, "pointermove", { ...touch, clientX: 40 });
assert(ocean.cam.yawT < ocean.cam.yaw, "second touch can look while first operates shell stick");
fire(canvas, "pointercancel", touch);
ocean.clearInput();

doc.hidden = false;
win.matchMedia = () => ({ matches: true });
const reducedRoot = new Element(); reducedRoot.host = new Element();
const quick = context.initOcean(reducedRoot, { embedded: true });
quick.beginJump(); tick();
assert.equal(quick.phase, "ocean", "reduced motion skips long jump animation");
assert.equal(quick.guide.root.position.y, 1);
const quietScene = renderer.scenes.find(scene => scene.getObjectByName("moon-jellies"));
const quietJellies = quietScene.getObjectByName("moon-jellies");
tick(5);
assert.equal(quietJellies.material.uniforms.uTime.value, 0, "reduced motion retains still jellyfish");
assert.equal(quietScene.children.find(mesh => mesh.geometry.attributes.pat).material.uniforms.uTime.value, 0,
  "reduced motion stops ambient fish movement too");

// Standalone still starts on its dock and explicitly loads/dives into a demo.
context.location.search = "";
win.matchMedia = () => ({ matches: false });
const standalone = context.initOcean(doc);
assert.equal(standalone.phase, "dock");
assert.equal(standalone.perspective, "third");
assert(win.ocean && win.ocean.buildWorld && win.ocean.net);
assert.equal(doc.querySelector("#open-real").listeners.click.length, 1);
fire(doc.querySelector("#open-demo"), "click");
assert.equal(standalone.phase, "jump");
assert(win.ocean.world.files.length > 0);
tick(30);
assert.equal(standalone.phase, "ocean");
assert(!renderer.scenes.some(scene => scene.getObjectByName("moon-jellies")),
  "the file viewer never adds animals without files");
const world = win.ocean.world;
const school = world.files.find(f => f.school.n > 5).school;
const members = world.files.filter(f => f.school === school);
assert(Math.abs(school.speed - members.reduce((n, f) => n + f.speed, 0) / members.length) < 1e-12,
  "shoals share a size- and age-appropriate pace");
const fish = world.files.find(f => f.scale < win.ocean.TUNE.bigFrom && f.y < -10);
standalone.cam.pos.set(fish.x, fish.y, fish.z);
standalone.cam.depthT = fish.y;
tick(4);
const mesh = world.insts[fish.arch];
assert([...mesh.userData.ids].includes(fish.index), "test fish is in the nearby mesh tier");
const restPosition = () => {
  const ph = mesh.material.uniforms.uTime.value * fish.school.speed +
    fish.school.phase + (fish.phase - fish.school.phase) * 0.15;
  return new THREE.Vector3(fish.x + Math.cos(ph * 0.42) * fish.scale * fish.orbit,
    fish.y + Math.sin(ph * 1.7) * fish.scale * fish.bob,
    fish.z + Math.sin(ph * 0.42) * fish.scale * fish.orbit);
};
doc.hidden = true; // Freeze the school clock so only the diver's effect changes.
const rest = restPosition();
standalone.cam.pos.copy(rest).add(new THREE.Vector3(-1, 0, 0));
standalone.cam.depthT = standalone.cam.pos.y;
tick();
assert(fish.px > rest.x + 0.5, "small fish part away from a nearby diver");
assert(Math.hypot(fish.px - rest.x, fish.py - rest.y, fish.pz - rest.z) <= 3.001,
  "avoidance stays inside the spatial hash's existing margin");
standalone.cam.pos.x -= 15;
tick();
assert(Math.abs(fish.px - rest.x) < 1e-6, "fish resume their shoal when the diver leaves");
fish.netted = true;
standalone.cam.pos.copy(rest); standalone.cam.depthT = rest.y;
tick();
assert(Math.abs(fish.px - rest.x) < 1e-6, "netted files do not flee");
fish.netted = false;
doc.hidden = false;
assert(standalone.guide.root.position.y < 0, "standalone retains its underwater guide berth");
doc.querySelector("#haul").hidden = false;
key("Escape", { composedPath: () => [{ tagName: "BUTTON" }, doc] });
assert.equal(doc.querySelector("#haul").hidden, true, "Escape closes standalone haul from focused controls");
console.log("ocean integration: dock bounds, input ownership, blocking, Space edges, view, surface and renderer invariants passed");
