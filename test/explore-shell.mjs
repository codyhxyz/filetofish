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
const host = new Element();
host.attachShadow = () => shadow;
const sprints = [], moves = [], vertical = [], depths = [], cameras = [];
let opts, blocked = false, dives = 0, returns = 0, cleared = 0, now = 1000;
const api = {
  beginJump: () => dives++, returnToDock: () => returns++,
  setMove: (x, z, fast) => { moves.push([x, z]); sprints.push(!!fast); },
  setVertical: y => vertical.push(y),
  clearInput: () => cleared++,
};
const source = fs.readFileSync(new URL("../src/explore.js", import.meta.url), "utf8")
  .replace(/^import .*;\n/gm, "").replace("export function", "function");
const ctx = vm.createContext({
  document: doc, addEventListener: win.addEventListener.bind(win),
  oceanTemplate: "<style>body{}</style>",
  performance: { now: () => now }, setTimeout: fn => fn(),
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
const words = el => el.innerHTML.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const help = () => words($("#move-help"));
assert.equal(help(), "W A S D walk Shift sprint", "no mouse-look lesson on the dock");
assert.equal($("#look-help").hidden, true, "a free cursor needs no way out");
frame({ looking: true });
assert.equal(help(), "W A S D walk Shift sprint");
assert.equal($("#look-help").hidden, false, "a held cursor says how to let go");
frame({ phase: "ocean", looking: true });
assert.equal(help(), "W A S D swim Shift sprint Q dock", "no depth keys: it is a 3D swim, and Q is the way back");
frame({ phase: "jump" });
assert.equal(words($("#dive")), "diving");
frame();
assert.equal($("#look-help").hidden, true);
assert.equal($("#explore-status").hidden, true, "the dock needs no depth gauge");
assert(!$("#look-hint").classes.has("on"), "a mouse never gets the drag lesson");
assert.equal(words($("#dive")), "Space dive", "dive is a legend entry like the rest");
assert.equal($("#swim-up").hidden, true);
$("#dive").emit("click");
assert.equal(dives, 1);
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

/* the fish note: after the first zone card clears, never on top of it, once */
const note = $("#fish-note");
assert(!note.classes.has("on"), "the note waits while the zone card is up");
assert(host.classes.has("carding"), "the talk button keeps clear of a card");
card.emit("animationend", { target: card });
frame({ phase: "ocean", underwater: true, depth: 6.5, floor: 400, zones });
assert(!note.classes.has("on"), "a beat of clear water between cards");
now += 1000;
frame({ phase: "ocean", underwater: true, depth: 6.5, floor: 400, zones });
assert(note.classes.has("on"), "then the water says what the fish are");
assert(body.classes.has("zone-on") && host.classes.has("carding"));
now += 9000;
frame({ phase: "ocean", underwater: true, depth: 23, floor: 400, zones });
assert.equal(shownCards, 5, "a crossing during the note waits for it");
assert.equal(gauge.querySelector(".zone").textContent, "Twilight", "the gauge does not wait");
note.emit("animationend", { target: note });
assert(!note.classes.has("on"));
now += 1000;
frame({ phase: "ocean", underwater: true, depth: 23, floor: 400, zones });
assert.equal(shownCards, 6, "then the held zone is named");
assert.equal(cardName.textContent, "Twilight");
card.emit("animationend", { target: card });
assert(!host.classes.has("carding"), "the middle of the screen is free again");
frame();
frame({ phase: "jump", underwater: true, depth: 3, floor: 400, zones });
frame({ phase: "ocean", underwater: true, depth: 6.5, floor: 400, zones });
card.emit("animationend", { target: card });
now += 1000;
frame({ phase: "ocean", underwater: true, depth: 6.5, floor: 400, zones });
assert(!note.classes.has("on"), "the note is said once");

win.emit("blur");
assert.equal(cleared, 1);
doc.hidden = true;
doc.emit("visibilitychange");
assert.equal(cleared, 2);
frame();
assert.equal(depths.at(-1), 0);
assert.equal(mounted.getUnderwater(), false);
assert(cameras.length > 0, "world camera drives sea projection");

/* which water: Dive and Space only ask. An answer is what loads and jumps,
   and a folder already down there is offered back without a second scan. */
{
  const el = $("#waters"), mine = $("#water-mine"), demo = $("#water-demo");
  const cost = $("#water-mine-cost"), wnote = $("#waters-note");
  const settle = () => new Promise(resolve => setImmediate(resolve));
  let jumps = 0, demos = 0, scans = 0, folder;
  Object.assign(api, {
    drive: null,
    loadDemo: () => { demos++; api.drive = { kind: "demo", label: "demo drive", count: 53304 }; },
    loadFolder: async onScan => {
      scans++;
      if (!folder) return null;
      onScan(12, "proj/src");
      if (folder.count) api.drive = folder;
      return folder;
    },
    dive: () => jumps++,
  });
  doc.hidden = false;
  opts.onDive();
  assert.equal(el.hidden, false, "diving asks which water");
  assert.equal(mounted.choosing(), true);
  assert.equal(opts.isBlocked(), true, "the question holds movement like any panel");
  assert.equal(mounted.busy(), true);
  assert.equal(cost.innerHTML, "pick a folder<br>nothing is uploaded");
  assert.equal($("#water-other").hidden, true);
  win.emit("keydown", { key: "Escape" });
  assert.equal(el.hidden, true, "Esc stays on the dock");
  assert.equal(opts.isBlocked(), false);
  assert.equal(jumps + demos + scans, 0, "and nothing was loaded");

  opts.onDive();
  win.emit("keydown", { key: "2", repeat: true });
  assert.equal(demos, 0, "a held key is not an answer");
  win.emit("keydown", { key: "2" });
  assert.deepEqual([demos, jumps, el.hidden], [1, 1, true], "2 loads the demo and jumps");
  assert(demo.classes.has("chosen") && mine.classes.has("spent"), "the choice lands like a catch's");
  win.emit("keydown", { key: "1" });
  assert.equal(scans, 0, "the keys are dead once the question is answered");

  opts.onDive();
  assert(!demo.classes.has("chosen") && !mine.classes.has("spent"), "asking again starts clean");
  mine.emit("click"); await settle();
  assert.deepEqual([scans, jumps, el.hidden], [1, 1, false], "a cancelled picker is not an answer");
  folder = { kind: "folder", label: "empty", count: 0 };
  win.emit("keydown", { key: "1" }); await settle();
  assert.deepEqual([scans, jumps, el.hidden], [2, 1, false]);
  assert.match(wnote.textContent, /nothing in there but water/);
  assert.equal($("#waters-n").textContent, "12", "the scan pane counts files");
  assert.equal($("#waters-pick").hidden, false, "and hands back to the choice");
  folder = { kind: "folder", label: "proj", count: 1234 };
  mine.emit("click"); await settle();
  assert.deepEqual([scans, jumps, el.hidden], [3, 2, true], "a real folder loads and jumps");

  opts.onDive();
  assert.equal(cost.querySelector("i").textContent, "proj", "the folder is offered back by name");
  assert.match(cost.innerHTML, /1,234 files/);
  assert.equal($("#water-other").hidden, false);
  mine.emit("click");
  assert.deepEqual([scans, jumps, el.hidden], [3, 3, true], "going back in does not rescan");
  opts.onDive();
  folder = { kind: "folder", label: "other", count: 7 };
  $("#water-other").emit("click"); await settle();
  assert.deepEqual([scans, jumps], [4, 4], "a different folder is one press away");
  opts.onDive();
  $("#water-stay").emit("click");
  assert.deepEqual([jumps, el.hidden, mounted.choosing()], [4, true, false]);
}
console.log("exploration shell: dive/return, which water, panel ownership, two-finger axes, cancellation, depth and view");
