import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
  kinOf, classOf, stepOf, stepLabel, genusOf, cohortOf, ranksOf, CLASSES,
} from "../src/taxonomy.mjs";

// every rank is a fact about the file, broadest first
const png = kinOf("screenshot 2026-08-16.png");
assert.deepEqual([png.domain, png.kingdom, png.phylum, png.label], ["captured", "image", "raster", ".png"]);
assert.deepEqual(ranksOf(png, 884120, "flatfish", "Sole").map(r => r[0]),
  ["domain", "kingdom", "phylum", "class", "order", "family", "genus", "species"]);
assert.deepEqual(ranksOf(png, 884120, "flatfish", "Sole").map(r => r[1]),
  ["captured", "image", "raster", "middleweight", "flatfish", ".png", "512 KB", "Sole"]);
assert.deepEqual(ranksOf(kinOf(".gitkeep"), 0, "x", "Ghost Minnow"),
  [["domain", "empty"], ["species", "Ghost Minnow"]], "nothing in it, nothing to classify");

// one family, however it is spelled or cased
assert.equal(kinOf("a.JPEG").seed, kinOf("b.jpg").seed);
assert.equal(kinOf("a.PNG"), kinOf("b.png"));
assert.equal(kinOf("a.jpeg").label, ".jpeg");
assert.notEqual(kinOf("a.jpg").seed, kinOf("a.png").seed);
assert.equal(kinOf("x.tar.gz").label, ".gz");
// a dotfile is all extension; a bare name is a family only when it is a type
assert.deepEqual([kinOf(".gitignore").kingdom, kinOf(".gitignore").phylum], ["code", "config"]);
assert.deepEqual([kinOf("Makefile").kingdom, kinOf("Makefile").label], ["code", "makefile"]);
for (const bare of ["key", "go", "README", "c"])
  assert.deepEqual([kinOf(bare).kingdom, kinOf(bare).label], ["other", "no extension"], bare);
// an unlisted extension is still a family, and a media type can still place it
assert.deepEqual([kinOf("a.xyz").kingdom, kinOf("a.xyz").phylum, kinOf("a.xyz").label], ["other", "unsorted", ".xyz"]);
assert.equal(kinOf("a.xyz"), kinOf("b.XYZ"));
assert.equal(kinOf("a.jxl", "image/jxl").kingdom, "image");
assert.equal(kinOf("a.png", "application/octet-stream").kingdom, "image", "a listed extension outranks the media type");
assert.equal(kinOf("kerning.otf").kingdom, "font");

// weight: the class breaks at 32 KB, 32 MB and 2 GB; the genus is a doubling
assert.deepEqual([32766, 32767, 2 ** 25 - 2, 2 ** 25 - 1, 2 ** 31].map(b => CLASSES[classOf(stepOf(b))]),
  ["small fry", "middleweight", "middleweight", "heavyweight", "leviathan"]);
assert.deepEqual([2, 1022, 1024, 3281920, 2 ** 31].map(b => stepLabel(stepOf(b))),
  ["2 B", "512 B", "1 KB", "2 MB", "2 GB"]);

// same family, same weight: same species. Eight doublings reach all eight nouns
assert.equal(genusOf(png, stepOf(900000), 6), genusOf(png, stepOf(700000), 6));
assert.equal(new Set([10, 11, 12, 13, 14, 15, 16, 17].map(s => genusOf(png, s, 8))).size, 8);
assert.equal(cohortOf(png, 20), cohortOf(kinOf("other.PNG"), 20));
assert.notEqual(cohortOf(png, 20), cohortOf(png, 21));

/* ------------------------------------------------------------- the dock */
const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const ctx = vm.createContext({ kinOf, classOf, stepOf, genusOf, ranksOf });
vm.runInContext(
  app.slice(app.indexOf("const clamp ="), app.indexOf("const lerp =")) +
  app.slice(app.indexOf("function fnv1a"), app.indexOf("/* ============================================================ geometry")) +
  ";globalThis.api = { makeFish, SPECIES, ARCH, ORDER };", ctx);
const { makeFish, SPECIES, ARCH, ORDER } = ctx.api;
const fishOf = (name, size, bytes = [1, 2, 3]) => makeFish({ name, size, type: "", bytes });

// the body plan is the kingdom's, and the weight's where the weight matters
const plan = (name, size) => fishOf(name, size).arch;
assert.equal(plan("IMG_4417.HEIC", 3281920), "flat");
assert.equal(plan("clip.mp4", 4e6), "torpedo");
assert.equal(plan("dune-part-two-4k.mov", 2147483648), "shark");
assert.equal(plan("voice-memo-2.m4a", 11744512), "eel");
assert.equal(plan("index.tsx", 4182), "eel");
assert.equal(plan("bundle.min.js", 900000), "angler");
assert.equal(plan("resume-final-v3.pdf", 218114), "perch");
assert.equal(plan("backup-2019.zip", 518000000), "puffer");
assert.equal(plan("kerning-experiment.otf", 94720), "perch");
assert.equal(plan("mystery.dat", 5000), "angler");
assert.equal(fishOf("empty.txt", 0).speciesKey, "special/ghost");

// the contents no longer change the species, only the individual
const a = fishOf("a.png", 900000, [1, 2, 3]), b = fishOf("b.png", 700000, [9, 9, 9, 9]);
assert.equal(a.speciesKey, b.speciesKey);
assert.notEqual(a.hash, b.hash);
assert.deepEqual(a.ranks.map(r => r[1]),
  ["captured", "image", "raster", "middleweight", "flatfish", ".png", "512 KB", a.noun]);
assert.equal(fishOf("a.png", 900000, [1, 2, 3]).name, a.name, "the same file is still the same fish");

// every kingdom has a plan for every class, and every plan says which files reach it
const keys = new Set(ARCH.map(x => x.key));
for (const [kingdom, plans] of Object.entries(ORDER)) {
  assert.equal(plans.length, CLASSES.length, kingdom);
  for (const p of plans) assert(keys.has(p), `${kingdom} -> ${p}`);
}
for (const x of ARCH) assert(x.order && x.water, x.key);

// the whole dex is reachable from the six kinds of file the demo ocean carries
const seen = new Set(["special/ghost"]);
for (const ext of ["heic", "jpg", "png", "webp", "mov", "mp4", "mkv", "m4a", "wav", "flac",
  "ts", "js", "json", "map", "pdf", "docx", "txt", "zip", "dmg", "tar"])
  for (let step = 9; step <= 33; step++) seen.add(fishOf("f." + ext, 2 ** step).speciesKey);
assert.deepEqual([...SPECIES].map(s => s.key).filter(k => !seen.has(k)), []);

/* ------------------------------------------------------------ the ocean */
const ocean = fs.readFileSync(new URL("../src/ocean.js", import.meta.url), "utf8");
assert(!/f\.hash >>> (9|19)/.test(ocean), "the hash does not pick a body plan or a noun");
const octx = vm.createContext({ cohortOf, genusOf });
vm.runInContext(
  ocean.slice(ocean.indexOf("const CLASS_KEY ="), ocean.indexOf("function sizeToScale")) +
  ocean.slice(ocean.indexOf("const ARCH = ["), ocean.indexOf("function peakOf")) +
  ocean.slice(ocean.indexOf("const nounOf ="), ocean.indexOf("function fishName")) +
  ";globalThis.api = { archOf, nounOf, ARCH };", octx);
const sea = octx.api;
const rec = (name, size, hash) => {
  const lb = Math.log2(size + 1);
  return { name, size, hash, lb, cls: classOf(lb), kin: kinOf(name), fam: kinOf(name).kingdom };
};
const kind = (f, deep) => { f.arch = sea.archOf(f, deep); return sea.ARCH[f.arch].key + "/" + sea.nounOf(f); };
// two photos of one size are one species whatever their hashes, lit or deep
assert.equal(kind(rec("IMG_1.heic", 3.1e6, 1), false), kind(rec("IMG_2.heic", 3.3e6, 0xdeadbeef), false));
assert.equal(kind(rec("IMG_1.heic", 3.1e6, 1), true), kind(rec("IMG_2.heic", 3.3e6, 0xdeadbeef), true));
assert.equal(kind(rec(".gitkeep", 0, 5), false), "ghost/Ghost Minnow");
// the pools still decide the silhouette: fry stay small, leviathans stay leviathans
for (let i = 0; i < 40; i++) {
  const name = "f." + ["heic", "mov", "ts", "zip", "pdf", "wav"][i % 6];
  assert(sea.ARCH[sea.archOf(rec(name, 300 + i * 500, i), false)].pools.fry, "small files are fry-pool forms");
  assert(sea.ARCH[sea.archOf(rec(name, 3e9 * (i + 1), i), false)].pools.lev, "2 GB and up is a leviathan");
}
// and a kingdom still leans on its own form without collapsing onto it
const forms = new Map();
for (let s = 16; s < 25; s++) for (const e of ["heic", "jpg", "png", "webp", "gif", "tif", "avif", "bmp"]) {
  const k = sea.ARCH[sea.archOf(rec("f." + e, 2 ** s, 0), false)].key;
  forms.set(k, (forms.get(k) || 0) + 1);
}
assert(forms.get("flat") > 72 * 0.25, "images lean flat");
assert(forms.size > 2, "but a reef of photos is not one silhouette");
