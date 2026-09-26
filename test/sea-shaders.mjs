/* Optional native GLSL compiler, CPU-only: no browser, context or GPU process. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ShaderChunk } from "three";
import { loadSea } from "./helpers/sea-module.mjs";

const compiler = process.env.GLSLANG_VALIDATOR || "glslangValidator";
const available = spawnSync(compiler, ["--version"], { encoding: "utf8" });
if (available.error?.code === "ENOENT") {
  console.log("sea shader CPU compilation skipped: glslangValidator not installed");
} else {
  assert.equal(available.status, 0, available.stderr);
  const { Sea, renders, captures } = await loadSea({ mock: true });
  const sea = Sea({ clientWidth: 800, clientHeight: 500, getContext: () => ({ getExtension: () => ({}) }) });
  sea.render(0);
  const materials = [...new Set([...renders, ...captures].map(r => r.material))];
  const resolve = source => source.replace(/#include <(\w+)>/g, (_, name) => {
    assert(ShaderChunk[name], name);
    return resolve(ShaderChunk[name]);
  }).replace(/NUM_RECT_AREA_LIGHTS/g, "0");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sea-glsl-"));
  try {
    for (const [i, material] of materials.entries()) {
      const definitions = Object.entries(material.defines).map(([k, v]) => `#define ${k} ${v}`).join("\n");
      // glslang 16 reserves "average" although Three's browser chunk uses it.
      // Rename only that library symbol in this offline validation harness.
      const prefix = `#version 300 es\nprecision highp float;\nprecision highp int;\n#define average three_average\n${definitions}\n#define texture2D texture\n#define texture2DLodEXT textureLod\n#define texture2DGradEXT textureGrad\n`;
      fs.writeFileSync(path.join(dir, "sea.vert"), prefix + `
#define attribute in
#define varying out
uniform mat4 modelViewMatrix, projectionMatrix;
in vec3 position;
` + resolve(material.vertexShader));
      fs.writeFileSync(path.join(dir, "sea.frag"), prefix + `
#define varying in
out vec4 pc_fragColor;
#define gl_FragColor pc_fragColor
` + resolve(material.fragmentShader));
      const compiled = spawnSync(compiler, ["-l", path.join(dir, "sea.vert"), path.join(dir, "sea.frag")], { encoding: "utf8" });
      assert.equal(compiled.status, 0, `material ${i}: ${compiled.stdout}\n${compiled.stderr}`);
    }
  } finally { sea.dispose(); fs.rmSync(dir, { recursive: true, force: true }); }
  assert.equal(materials.length, 6, "sea, capture and all four authored post shaders");
  console.log("sea shaders: six GLSL3 programs linked with installed Three chunks (CPU only)");
}
