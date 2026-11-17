import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// Aiming at a fish has to say which file it is: the path, not the species.
const js = fs.readFileSync(new URL("../src/ocean.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../src/ocean.html", import.meta.url), "utf8");
const ctx = vm.createContext({ world: { prefix: "" } });
vm.runInContext(js.slice(js.indexOf("const fullPath = "), js.indexOf("function openHaul")) +
  ";globalThis.api = { shownPath, tailPath };", ctx);
const { shownPath, tailPath } = ctx.api;

assert.equal(shownPath({ path: "src/lib", name: "Ocean.js" }), "src/lib/Ocean.js");
assert.equal(shownPath({ path: "", name: "README.md" }), "README.md");
ctx.world.prefix = "filetofish/";       // a picked directory puts its own name back
assert.equal(shownPath({ path: "src", name: "ocean.js" }), "filetofish/src/ocean.js");
assert.equal(shownPath({ path: "", name: "README.md" }), "filetofish/README.md");

assert.equal(tailPath("src/ocean.js", 44), "src/ocean.js", "a short path is whole");
const deep = "app/node_modules/@scope/package/dist/esm/internal/helpers/index.js";
const cut = tailPath(deep, 44);
assert.equal(cut, "…/package/dist/esm/internal/helpers/index.js", "folders drop from the front, whole");
assert(cut.length <= 44);
const long = "a/" + "x".repeat(60) + ".bin";
assert.equal(tailPath(long, 44), "…/" + "x".repeat(60) + ".bin", "the file name is never cut");
assert.equal(tailPath("x".repeat(60), 44), "x".repeat(60));

// the button and the card are both fed the path, in the path's own case
const sync = js.slice(js.indexOf("function syncAction"), js.indexOf("function greetKelp"));
assert.match(sync, /what = tailPath\(shownPath\(aimed\), \d+\)/);
assert.match(sync, /querySelector\("i"\)\.textContent = what/);
assert(!/fishName/.test(sync), "the species is not what the button names");
assert.match(html, /<button id="action"[^>]*><kbd class="mouse" hidden>.*?<\/kbd><kbd>E<\/kbd><span><\/span><i><\/i><\/button>/);
assert.match(html, /#action i\{[^}]*text-transform:none/);
assert.match(html, /<div class="nm"><span id="c-dir"><\/span><b id="c-nm"><\/b><\/div>/);
const card = js.slice(js.indexOf("function updateCard"), js.indexOf("/* ============================================================ loop"));
assert.match(card, /elCardD\.textContent = dir/);
assert.match(card, /elCardN\.textContent = aimed\.name/);
