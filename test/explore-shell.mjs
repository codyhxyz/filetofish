import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

class Element {
  listeners = {};
  hidden = false;
  disabled = false;
  textContent = "";
  innerHTML = "";
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
  querySelector(selector) { return (this.children ||= new Map()).get(selector) ?? this.children.set(selector, new Element()).get(selector); }
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
let opts, blocked = false, dives = 0, returns = 0, views = 0, cleared = 0, now = 1000;
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
  performance: { now: () => now },
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
assert.match($("#move-help").textContent, /click to look/);
frame({ looking: true });
assert.match($("#move-help").textContent, /Esc frees the cursor/);
frame({ phase: "ocean", looking: true });
assert.match($("#move-help").textContent, /^WASD swim.*Esc frees the cursor$/);
frame();
assert.equal(opts.autoPerspective, false, "desktop keeps the manual view switch");
assert.equal($("#explore-status").hidden, true, "the dock needs no depth gauge");
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
frame({ phase: "ocean", underwater: true, depth: 45, floor: 960, perspective: "third" });
const gauge = $("#explore-status");
assert.equal(gauge.hidden, false);
assert.match(gauge.innerHTML, /class="lip">surface</);
assert.match(gauge.innerHTML, /trench floor<b>960 m</);
assert.equal((gauge.innerHTML.match(/class="major"/g) || []).length, 4, "majors every 200 m above a 960 m floor");
assert.equal((gauge.innerHTML.match(/<i[ >]/g) || []).length, 23 + 1, "minors every 40 m, plus the marker label");
assert.equal(gauge.querySelector(".you").style.top, "4.69%");
assert.equal(gauge.querySelector(".you").querySelector("i").textContent, "45 m");
assert.equal(gauge.attrs["aria-valuetext"], "45 m deep");
assert.equal(gauge.attrs["aria-valuemax"], "960");
assert.equal($("#dive").hidden, true, "no return button in the water");
assert.equal($("#swim-up").hidden, false);
assert.equal(depths.at(-1), 45);
assert.equal(mounted.getUnderwater(), true);
$("#swim-up").emit("pointerdown");
assert.equal(vertical.at(-1), 1);
$("#swim-up").emit("pointercancel");
assert.equal(vertical.at(-1), 0);
$("#swim-down").emit("keydown", { code: "Space" });
assert.equal(vertical.at(-1), -1);
$("#swim-down").emit("keyup");
assert.equal(vertical.at(-1), 0);

/* zones: notches at each boundary, one name, and a title card per crossing */
const zones = [
  { name: "Sunlight", range: "under 1 KB", top: 0 },
  { name: "Twilight", range: "1 KB – 32 KB", top: 20 },
  { name: "Midnight", range: "32 KB – 1 MB", top: 120 },
];
const card = $("#zone-card"), cardName = card.querySelector("b");
let shownCards = 0;
const realToggle = card.classList.toggle;
card.classList.toggle = (name, on) => { if (name === "on" && on) shownCards++; realToggle(name, on); };
frame({ phase: "jump", underwater: true, depth: 3, floor: 400, zones });
assert.equal(shownCards, 0, "mid-plunge is not a zone yet");
assert.equal((gauge.innerHTML.match(/<em /g) || []).length, 2, "a notch where each zone below the surface begins");
frame({ phase: "ocean", underwater: true, depth: 6.5, floor: 400, zones });
assert.equal(shownCards, 1, "landing in the water names the first zone");
assert.equal(cardName.textContent, "Sunlight");
assert.equal(card.attrs["data-zone"], "sunlight");
assert.equal(gauge.querySelector(".zone").textContent, "Sunlight");
assert.equal(gauge.querySelector(".zone").hidden, false);
assert.match(gauge.attrs["aria-valuetext"], /sunlight zone$/);
for (const depth of [19, 21, 19.5, 21.5, 18.5]) frame({ phase: "ocean", underwater: true, depth, floor: 400, zones });
assert.equal(shownCards, 1, "bobbing on a boundary is not a crossing");
assert.equal(gauge.querySelector(".zone").textContent, "Sunlight");
frame({ phase: "ocean", underwater: true, depth: 23, floor: 400, zones });
assert.equal(shownCards, 2);
assert.equal(cardName.textContent, "Twilight");
assert.equal(card.querySelector("span").textContent, "1 KB – 32 KB");
assert.equal(gauge.querySelector(".zone").textContent, "Twilight", "only the current zone is named");
frame({ phase: "ocean", underwater: true, depth: 15, floor: 400, zones });
assert.equal(gauge.querySelector(".zone").textContent, "Sunlight");
assert.equal(shownCards, 2, "a zone just announced waits before it is announced again");
now += 9000;
frame({ phase: "ocean", underwater: true, depth: 25, floor: 400, zones });
assert.equal(shownCards, 3, "after the cooldown a crossing is news again");
frame({ phase: "ocean", underwater: true, depth: 200, floor: 400, zones });
assert.equal(cardName.textContent, "Midnight");
assert.equal(shownCards, 4);
frame();
assert.equal(card.classes.has("on"), false, "leaving the water clears the card");
frame({ phase: "jump", underwater: true, depth: 3, floor: 400, zones });
frame({ phase: "ocean", underwater: true, depth: 6.5, floor: 400, zones });
assert.equal(shownCards, 5, "every dive names its first zone, cooldown or not");

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
