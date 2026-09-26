import { build } from "esbuild";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const seaSource = fs.readFileSync(new URL("../../src/sea.js", import.meta.url), "utf8");
export async function loadSea({ mock = false, shaders = false } = {}) {
  const three = fileURLToPath(new URL("./sea-three.mjs", import.meta.url));
  const contents = (mock ? seaSource.replace('from "three"', `from ${JSON.stringify(three)}`) : seaSource)
    + (shaders ? "\nexport { SEA_VS, SEA_FS, POST_VS, BRIGHT_FS, DOWN_FS, BLUR_FS, COMPOSITE_FS };" : "")
    + (mock ? `\nexport { renders, captures, resources } from ${JSON.stringify(three)};` : "");
  const result = await build({
    stdin: { contents, resolveDir: fileURLToPath(new URL("../../src", import.meta.url)), loader: "js" },
    bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent",
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}
