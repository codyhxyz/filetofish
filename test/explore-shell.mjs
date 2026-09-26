import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

class Element {
  listeners = {};
  hidden = false;
  disabled = false;
  style = {};
  attrs = {};
  captures = new Set();
  classes = new Set();
  classList = { toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name) };
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  emit(type, extra = {}) {
    const e = { pointerId: 1, button: 0, preventDefault() {}, ...extra };
    for (const fn of this.listeners[type] || []) fn(e);
  }
  setAttribute(key, value) { this.attrs[key] = value; }
  focus() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
  hasPointerCapture(id) { return this.captures.has(id); }
  setPointerCapture(id) { this.captures.add(id); }
  releasePointerCapture(id) { this.captures.delete(id); this.emit("lostpointercapture", { pointerId: id }); }
}
const elements = new Map();
const $ = key => {
  if (!elements.has(key)) elements.set(key, new Element());
  return elements.get(key);
};
const body = new Element(), win = new Element(), doc = new Element();
doc.querySelector = $;
doc.body = body;
const shadow = { querySelector: $ };
$("#intro").hidden = true;
const host = { attachShadow: () => shadow };
const sprints = [], moves = [], vertical = [], depths = [], cameras = [];
let opts, blocked = false, dives = 0, returns = 0, views = 0, cleared = 0;
const api = {
  beginJump: () => dives++, returnToDock: () => returns++, toggleView: () => views++,
  setMove: (x, z, fast) => { moves.push([x, z]); sprints.push(!!fast); },
  setVertical: y => vertical.push(y),
  clearInput: () => cleared++,
};
const source = fs.readFileSync(new URL("../src/explore.js", import.meta.url), "utf8")
  .replace(/^import .*;\n/gm, "").replace("export function", "function");
const ctx = vm.createContext({
  document: doc, addEventListener: win.addEventListener.bind(win),
  oceanTemplate: "<style>body{}</style>",
  performance: { now: () => 1000 },
  initOcean: (root, options) => { assert.equal(root, shadow); opts = options; return api; },
});
vm.runInContext(source, ctx);
const mounted = ctx.mountExploration(host, {
  sea: { setCamera: camera => cameras.push(camera), render: () => {} },
  isBlocked: () => blocked, onDepth: d => depths.push(d),
});
const frame = extra => opts.onFrame({ phase: "dock", perspective: "first", underwater: false, depth: 0, camera: {}, ...extra });
frame();
assert.equal(opts.embedded, true);
assert.equal(opts.autoPerspective, false, "desktop keeps the manual view switch");
assert.equal($("#explore-status").textContent, "", "the dock needs no label");
assert(!$("#look-hint").classes.has("on"), "a mouse never gets the drag lesson");
assert.equal($("#dive").textContent, "Dive · Space");
assert.equal($("#swim-up").hidden, true);
$("#dive").emit("click");
assert.equal(dives, 1);
$("#view").emit("click");
assert.equal(views, 1);
const stick = $("#move-stick");
stick.emit("pointerdown", { clientX: 82, clientY: 18 });
assert(Math.abs(Math.hypot(...moves.at(-1)) - 1) < 1e-10, "diagonal stick is normalized");
assert(moves.at(-1)[0] > 0 && moves.at(-1)[1] > 0, "right/up gesture means right/forward");
assert.equal(sprints.at(-1), false, "a normal tilt walks");
stick.emit("pointermove", { clientX: 50, clientY: -30 });
assert.equal(sprints.at(-1), true, "pushing past the rim sprints");
assert(stick.classes.has("fast"));
assert(Math.abs(Math.hypot(...moves.at(-1)) - 1) < 1e-10, "sprint keeps full tilt, not more");
const count = moves.length;
stick.emit("pointermove", { pointerId: 2, clientX: 0, clientY: 0 });
assert.equal(moves.length, count, "second finger cannot steal the stick");
stick.emit("pointercancel");
assert.deepEqual(moves.at(-1), [0, 0]);
assert.equal(sprints.at(-1), false, "letting go ends the sprint");
assert(!stick.classes.has("fast"));
assert.equal(stick.captures.size, 0, "cancellation releases capture without recursive reset");
stick.emit("pointerdown", { clientX: 50, clientY: 0 });
blocked = true;
frame();
assert.deepEqual(moves.at(-1), [0, 0]);
assert.equal(stick.disabled, true);
$("#dive").emit("click");
assert.equal(dives, 1, "pending catch or panel blocks dive");
blocked = false;
$("#intro").hidden = false;
frame();
$("#dive").emit("click");
assert.equal(dives, 1, "dialogue never dives");
$("#intro").hidden = true;
frame({ phase: "jump" });
assert.equal($("#dive").disabled, true);
frame({ phase: "ocean", underwater: true, depth: 45, perspective: "third" });
assert.equal($("#dive").textContent, "Return · Q");
assert.equal($("#swim-up").hidden, false);
assert.equal(depths.at(-1), 45);
assert.equal(mounted.getUnderwater(), true);
$("#dive").emit("click");
assert.equal(returns, 1);
$("#swim-up").emit("pointerdown");
assert.equal(vertical.at(-1), 1);
$("#swim-up").emit("pointercancel");
assert.equal(vertical.at(-1), 0);
$("#swim-down").emit("keydown", { code: "Space" });
assert.equal(vertical.at(-1), -1);
$("#swim-down").emit("keyup");
assert.equal(vertical.at(-1), 0);
win.emit("blur");
assert.equal(cleared, 1);
doc.hidden = true;
doc.emit("visibilitychange");
assert.equal(cleared, 2);
frame();
assert.equal(depths.at(-1), 0);
assert.equal(mounted.getUnderwater(), false);
assert(cameras.length > 0, "world camera drives sea projection");
console.log("exploration shell: dive/return, panel ownership, two-finger axes, cancellation, depth and view");
