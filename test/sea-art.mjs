import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { seaSource as source } from "./helpers/sea-module.mjs";

/* Authored art from 2d06a9c, not a screenshot approximation. Only the capture
   branch and the new reflection-only solar-disc argument are stripped. */
const names = "hgt fineHgt surfaceH ripples celBand drops rainLayer invAces1 unmapc phaseR phaseM airmass inscat sunBody moonBody moonSurface cloudUV sunLit sunHue aerialGlow ftfTonemap finish starfield skyClassic skyScatter skyBase sky".split(" ");
const blocks = names.map(name => {
  const start = source.search(new RegExp(`(?:float|vec[234]) ${name}\\(`));
  assert(start >= 0, name);
  let end = source.indexOf("{", start) + 1, depth = 1;
  while (depth && end < source.length) {
    if (source[end] === "{") depth++;
    if (source[end] === "}") depth--;
    end++;
  }
  assert.equal(depth, 0, name);
  let visible = true;
  return source.slice(start, end).split("\n").filter(line => {
    if (line === "#ifdef SEA_CAPTURE") { visible = false; return false; }
    if (line === "#ifndef SEA_CAPTURE") { visible = true; return false; }
    if (line === "#else") { visible = !visible; return false; }
    if (line === "#endif") { visible = true; return false; }
    return visible;
  }).join("\n").replaceAll(", bool solarDisc", "").replaceAll("solarDisc && ", "")
    .replaceAll(", solarDisc)", ")").replaceAll("skyBase(rd, t, true)", "skyBase(rd, t)");
});
for (const name of ["SCENES", "SEA_FINISH_GLSL", "BRIGHT_FS", "DOWN_FS", "BLUR_FS", "COMPOSITE_FS"]) {
  const start = source.indexOf(`${name === "SEA_FINISH_GLSL" ? "export " : ""}const ${name} =`);
  const end = name === "SCENES" ? source.indexOf("\n};", start) + 3 : source.indexOf("`;", source.indexOf("`", start) + 1) + 2;
  assert(start >= 0 && end > start, name);
  blocks.push(source.slice(start, end));
}
assert.equal(createHash("sha256").update(blocks.join("\n")).digest("hex"),
  "beafb04c88d54ccf1dd78acb257c53f54b4323a0f3d83e19db99a50d6cb3ffa4",
  "preserve authored waves/rain/ripples, palette, onscreen sky/stars/celestials, finish and bloom shaders");
console.log("sea art: original authored functions, palette, finish and bloom preserved byte-for-byte");
