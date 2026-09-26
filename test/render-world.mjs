import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../src/render-world.js", import.meta.url), "utf8")
  .replace(/^import .+;\n/gm, "");
for (const partial of [false, true]) {
  const elements = new Map(), controls = [{}, {}, {}];
  let calls = 0, frames = 0, disposed = 0;
  vm.runInNewContext(source, {
    Sea: () => partial && calls++ === 0 ? { dispose() { disposed++; } } : null,
    document: {
      querySelector(selector) {
        if (!elements.has(selector)) elements.set(selector, { value: "100", addEventListener() {} });
        return elements.get(selector);
      },
      querySelectorAll: () => controls,
    },
    requestAnimationFrame() { frames++; },
  });
  assert.equal(frames, 0, "unsupported devices never start the render loop");
  assert.equal(disposed, partial ? 1 : 0, "release a partially initialized comparison");
  assert(controls.every(control => control.disabled));
  assert.match(elements.get("#status").innerHTML, /WebGL2.*\/render-world\/reflections\//);
}
console.log("water lab: unsupported WebGL2 releases resources and offers the static comparison");
