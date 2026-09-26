import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as THREE from "three";
const { PerspectiveCamera, Raycaster, Vector2, Vector3 } = THREE;

// Execute the actual interaction code without needing a browser/WebGL renderer.
const source = fs.readFileSync(new URL("../src/ocean.js", import.meta.url), "utf8");
const slice = (from, to) => {
  const start = source.indexOf(from), end = source.indexOf(to, start);
  assert(start >= 0 && end > start, `missing source section: ${from}`);
  return source.slice(start, end);
};
const handlers = {}, windowHandlers = {}, actionHandlers = {};
const sheets = { "#haul": { hidden: true }, "#confirm": { hidden: true } };
const rect = { left: 80, top: 40, width: 800, height: 500 };
const captured = new Set();
const canvas = {
  addEventListener: (type, fn) => { handlers[type] = fn; },
  getBoundingClientRect: () => rect,
  setPointerCapture: id => captured.add(id),
  releasePointerCapture: id => captured.delete(id),
};
const model = vm.createContext({ ...THREE, TAU: Math.PI * 2,
  guideMat: new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), guideScene: new THREE.Scene() });
vm.runInContext(slice("const FUR =", "const guideMat =") +
  slice("function buildGuide()", "/* A small procedural diver"), model);
const { root, kelp } = vm.runInContext("guide", model);
root.position.set(2, 1, -4);
root.visible = true;
const camera = new PerspectiveCamera(55, rect.width / rect.height, 0.1, 100);
camera.position.set(2, 2, 4);
camera.lookAt(2, 2, -4);
camera.updateMatrixWorld();
const calls = { hello: 0, jump: 0, net: 0, advance: 0 };
const ctx = vm.createContext({
  Raycaster, Vector2, camera, canvas, guide: { root, kelp },
  phase: "dock", world: {}, talkMode: null, introSeen: false,
  cam: { pos: new Vector3(2, 1, -2), yawT: 0, pitchT: 0 },
  keys: new Set(), glide: {}, SWIM_KEYS: [],
  $: selector => sheets[selector],
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  held: () => ctx.talkMode === "intro",
  openIntro: first => { assert.equal(first, true); calls.hello++; ctx.talkMode = "intro"; },
  beginJump: () => calls.jump++, toggleNet: () => calls.net++, advance: () => calls.advance++,
  elAction: { addEventListener: (type, fn) => { actionHandlers[type] = fn; } },
  addEventListener: (type, fn) => { windowHandlers[type] = fn; },
});
vm.runInContext(
  slice("let dragPointer =", "/* where the wheel") +
  slice("const nearKelp =", "function beginJump()") +
  slice('elAction.addEventListener("click", dockAction);', "/* yaw accumulates") +
  slice('addEventListener("keydown",', 'addEventListener("wheel",'), ctx);

const screen = point => {
  const p = point.clone().project(camera);
  return { clientX: rect.left + (p.x + 1) * rect.width / 2,
    clientY: rect.top + (1 - p.y) * rect.height / 2 };
};
const target = screen(new Vector3(2.16, 2.3, -3.9));
const event = (overrides = {}) => ({ pointerId: 1, isPrimary: true, button: 0, ...target, ...overrides });
const send = (type, overrides) => handlers[type](event(overrides));
const tap = overrides => { send("pointerdown", overrides); send("pointerup", overrides); };
const reset = () => {
  send("pointercancel");
  Object.keys(calls).forEach(key => { calls[key] = 0; });
  ctx.phase = "dock"; ctx.talkMode = null; ctx.introSeen = false;
  ctx.cam.pos.set(2, 1, -2); ctx.cam.yawT = ctx.cam.pitchT = 0; ctx.glide = {};
  root.visible = true;
  Object.values(sheets).forEach(sheet => { sheet.hidden = true; });
};
const noAction = () => assert.deepEqual(calls, { hello: 0, jump: 0, net: 0, advance: 0 });

// Nested character mesh, non-origin transforms, and offset canvas coordinates.
assert.equal(ctx.hitKelp(event()), true);
assert.equal(ctx.hitKelp(event(screen(new Vector3(3, 1, -2.5)))), false, "deck is not Kelp");
tap();
assert.equal(calls.hello, 1);
assert.equal(ctx.introSeen, true);
assert.equal(captured.size, 0);
reset();
ctx.cam.pos.z = -4.5; // E means jump here; clicking the character must still greet.
tap({ pointerType: "touch" });
assert.equal(calls.hello, 1);
assert.equal(calls.jump, 0);
reset();
actionHandlers.click();
assert.equal(calls.hello, 1, "button shares greeting");
reset();
windowHandlers.keydown({ key: "e", code: "KeyE" });
assert.equal(calls.hello, 1, "E shares greeting");
reset();
ctx.cam.pos.z = -4.5;
actionHandlers.click();
assert.equal(calls.jump, 1, "button at edge still jumps");

for (const block of [
  () => { ctx.cam.pos.z = 0; },
  () => { ctx.phase = "jump"; },
  () => { ctx.talkMode = "intro"; },
  () => { ctx.talkMode = "chat"; },
  () => { sheets["#haul"].hidden = false; },
  () => { sheets["#confirm"].hidden = false; },
  () => { root.visible = false; },
]) {
  reset(); block(); tap(); noAction();
}
for (const overrides of [{ button: 2 }, { button: 1 }, { isPrimary: false }, screen(new Vector3(3, 1, -2.5))]) {
  reset(); tap(overrides); noAction();
}
reset();
send("pointerup"); noAction(); // no down means no click
send("pointerdown"); send("pointercancel"); send("pointerup"); noAction();
send("pointerdown"); send("lostpointercapture"); send("pointerup"); noAction();
send("pointerdown"); send("pointerup", { pointerId: 2 }); noAction();
send("pointerdown", { pointerId: 2, isPrimary: false });
send("pointermove", { pointerId: 2, clientX: target.clientX + 50 });
send("pointerup"); assert.equal(calls.hello, 1, "second pointer cannot steal the primary gesture");
reset();
send("pointerdown");
send("pointermove", { clientX: target.clientX + 20 });
send("pointermove"); send("pointerup"); noAction();
assert.equal(ctx.glide, null, "drag-look cancels glide");
reset();
send("pointerdown"); send("pointerup", { clientX: target.clientX + 20 }); noAction();
reset();
send("pointerdown"); sheets["#confirm"].hidden = false; send("pointerup"); noAction();
reset();
send("pointerdown"); ctx.talkMode = "chat"; send("pointerup"); noAction();
for (const selector of ["#haul", "#confirm"]) {
  reset(); sheets[selector].hidden = false; actionHandlers.click(); noAction();
}
reset(); ctx.talkMode = "intro"; actionHandlers.click(); noAction();

reset(); ctx.phase = "ocean";
tap(); assert.equal(calls.net, 1, "underwater click still nets");
send("pointerdown"); send("pointercancel"); send("pointerup");
assert.equal(calls.net, 1, "cancelled underwater tap does not net");
send("pointerdown"); send("pointermove", { clientX: target.clientX + 20 });
assert(ctx.cam.yawT < 0, "drag still turns the camera");
send("pointerup"); assert.equal(calls.net, 1, "underwater drag does not net");
console.log("ocean Kelp click: raycast, shared greeting, edge priority, input guards, cancel, drag and net passed");
