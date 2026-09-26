import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../src/page.html", import.meta.url), "utf8");
const slice = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
let clear = 0, accepted = 0, resolveRead;
const ctx = vm.createContext({
  catchPending: () => true, readingFiles: false,
  exploration: { phase: "dock", clearInput: () => clear++ },
  say() {}, HAUL_CAP: 400,
  readMeta: () => new Promise(resolve => { resolveRead = resolve; }),
  accept: () => accepted++,
});
vm.runInContext(slice("async function haul(files)", "const unlock ="), ctx);
await ctx.haul([{}]);
assert.equal(clear, 0, "pending catch cannot be replaced by a drop");
ctx.catchPending = () => false;
ctx.exploration.phase = "jump";
await ctx.haul([{}]);
assert.equal(clear, 0, "drop cannot start a catch during the dive");
ctx.exploration.phase = "dock";
const first = ctx.haul([{}]);
assert.equal(ctx.readingFiles, true, "file reads lock movement synchronously");
await ctx.haul([{}]);
assert.equal(clear, 1, "a second import cannot overwrite the first");
resolveRead({});
await first;
assert.equal(accepted, 1);
assert.equal(ctx.readingFiles, false);

let dismiss, entered, removed;
Object.assign(ctx, {
  $: () => ({ addEventListener: (name, fn) => { dismiss = fn; } }),
  document: { body: { classList: { remove: (...classes) => { removed = classes; } } } },
  state: "caught", fish: { bulk: true }, goneWake: true, goneNote: "",
  performance: { now: () => 1000 }, enter: state => { entered = state; },
});
vm.runInContext(slice('$("#bulk-done").addEventListener', "/* ============================================================ dex"), ctx);
dismiss();
assert.equal(entered, "gone", "already-recorded bulk fish can be dismissed without sharing");
assert.equal(ctx.goneWake, false);
assert(removed.includes("has-catch"));
ctx.fish.bulk = false;
entered = null;
dismiss();
assert.equal(entered, null, "bulk dismissal cannot bypass a normal catch decision");
assert.match(html, /#plate \.acts \.act\[hidden\]\{display:none;\}/);
console.log("fishing input: pending catches, concurrent reads, dive ownership and non-sharing bulk dismissal");
