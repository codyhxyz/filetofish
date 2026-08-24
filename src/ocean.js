/* ocean -- a file viewer.

   Every file is a fish. Depth is size, lateral position is folder, colour is
   type, and how faded it is is how long since you touched it. Four draw tiers
   hand off inside the turbidity, so the fog is the render budget rather than
   an apology for it.

   Reads a real folder off your disk, in your browser, and never sends a byte
   anywhere. See OCEAN.md for why each default is what it is. */

import {
  Scene, PerspectiveCamera, OrthographicCamera, WebGLRenderer, WebGLRenderTarget,
  BufferGeometry, BufferAttribute, InstancedMesh, InstancedBufferAttribute,
  Mesh, Points, ShaderMaterial, Color, NearestFilter,
  Vector3, Object3D, PlaneGeometry, DoubleSide, AdditiveBlending, Vector2,
} from "three";
import { P as SND, speak, beats, isOn, setOn, audio, sfx } from "./sfx.js";

const TUNE = {
  /* --- the two axes that carry meaning --------------------------------- */
  depth: 900,             // world units from surface to abyss
  /* what the top and bottom of the water weigh is not a knob: the column is
     fitted to the drive's own p01..p99 of log2(bytes), so any drive fills it */
  sizeCurve: 1.0,         // 1.0 is linear in log2 -- one doubling, one step down
  bandJitter: 6,          // world units of scatter, so a size band is a shoal
                          //    with thickness rather than a sheet of paper
  lateral: 760,           // radius of the whole packed field

  /* --- what a file looks like ------------------------------------------ */
  sizeGain: 1.0,          // scales the whole size ladder (SIZE_LADDER below)
  schoolTight: 0.34,      // how hard same-species-same-size files clump
  deepFrom: 0.62,         // fraction of the column below which deep-sea forms start
  deepTo: 0.86,           // ...and past which everything down there is one
  bleach: 0.62,           // how much colour a file at p99 age has lost
  languor: 0.52,          // ...and how much of its swim

  /* --- the four tiers -------------------------------------------------- */
  hazeFrom: 240,          // haze starts fading in beyond this
  pointFar: 900,          // points die past here
  pointNear: 26,          // ...and hand off to meshes inside here
  meshFar: 150,           // meshes only exist within this
  meshFarBig: 18,         // ...plus this much per world unit of size, so a
                          //    whale is geometry long before you reach it
  bigFrom: 3.0,           // world units: at this size a creature gets the long
                          //    draw distance and a reserved slice of the budget
  meshBudget: 1400,       // hard cap on instanced fish per frame

  /* --- water ------------------------------------------------------------ */
  fogNear: 0.0016,
  fogDeep: 0.0052,
  fogBig: 0.055,         // how much less murk a creature eats per unit of size
  snow: 2600,

  /* --- feel -------------------------------------------------------------- */
  swimSpeed: 52,
  boost: 3.4,
  wheelSpeed: 0.85,       // world units of dive per notch of wheel
  settle: 0.14,           // seconds of stillness after which the dial detents
  damp: 5.0,              // how fast the body catches up to the intent
  lookDamp: 26,           // ...and how fast the head does. Nearly instant.
  glideTime: 0.85,        // seconds to be carried to what you are looking at
  standoff: 3.4,          // ...and where it puts you down, in body lengths
  chaseBack: 8.0,         // third-person camera: distance behind the diver
  chaseRise: 2.1,         // ...height above the diver
  chaseSide: 1.35,        // ...shoulder offset, so the crosshair stays clear
  chaseDamp: 8.0,         // ...how quickly the camera catches the body
};

const MAX_FILES = 250000;      // past this the layout stops being comprehensible
const TAU = Math.PI * 2;
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const DAY = 86400000;

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function fnv1a(s, seed) {
  let h = (seed >>> 0) || 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i) & 255; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function fmtBytes(n) {
  if (n < 1024) return n + " B";
  const u = ["KB", "MB", "GB", "TB"]; let i = -1, v = n;
  while (v >= 1024 && i < 3) { v /= 1024; i++; }
  return (v < 10 ? v.toFixed(1) : Math.round(v)) + " " + u[i];
}
const fmtCount = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n);

/* ============================================================ families
   Colour is the one channel readable across the whole ocean at any distance,
   so it carries file type. Muted, because a reef of pure #00FF00 is unreadable
   at density. */
const FAMILIES = [
  { key: "image", label: "images", hue: 26, sat: 62, lig: 54 },
  { key: "video", label: "video", hue: 254, sat: 52, lig: 60 },
  { key: "audio", label: "audio", hue: 326, sat: 52, lig: 60 },
  { key: "code", label: "code", hue: 136, sat: 46, lig: 52 },
  { key: "doc", label: "documents", hue: 44, sat: 62, lig: 56 },
  { key: "archive", label: "archives", hue: 194, sat: 52, lig: 54 },
  { key: "other", label: "everything else", hue: 210, sat: 8, lig: 52 },
];
const EXT_FAM = {};
{
  const put = (fam, list) => list.split(" ").forEach(e => (EXT_FAM[e] = fam));
  put("image", "jpg jpeg png gif heic heif webp tif tiff bmp svg avif raw dng cr2 nef arw orf psd ai eps ico icns");
  put("video", "mov mp4 m4v mkv avi webm mpg mpeg wmv flv prores mts m2ts 3gp");
  put("audio", "mp3 wav m4a flac aac ogg opus aiff aif wma mid midi caf alac");
  put("code", "js mjs cjs ts tsx jsx json json5 py rb rs go c h cpp hpp cc cs java kt swift " +
    "php sh bash zsh fish pl lua r sql html htm css scss sass less vue svelte astro " +
    "md mdx yml yaml toml ini cfg conf lock map d.ts gradle make cmake dockerfile gitignore " +
    "xml plist env graphql proto tf hcl");
  put("doc", "pdf doc docx xls xlsx ppt pptx pages numbers key odt ods odp rtf txt epub mobi " +
    "csv tsv log tex bib djvu");
  put("archive", "zip tar gz bz2 xz 7z rar dmg iso pkg deb rpm jar war apk ipa cab sit sitx zst");
}
const familyOf = name => {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "other";
  return EXT_FAM[name.slice(dot + 1).toLowerCase()] || "other";
};

const famColor = {}, hazeColor = {};
for (const F of FAMILIES) {
  famColor[F.key] = new Color().setHSL(F.hue / 360, F.sat / 100, F.lig / 100);
  /* additive blending eats saturation, so the haze gets a punchier copy */
  hazeColor[F.key] = new Color().setHSL(F.hue / 360, Math.min(1, F.sat / 100 * 1.5), F.lig / 100 * 0.86);
}
$("#legend").innerHTML = FAMILIES.map(F =>
  `<div>${F.label} <i style="background:${famColor[F.key].getStyle()}"></i></div>`).join("");

/* ============================================================ records */
function makeRecord(name, path, size, mtime, dir) {
  return {
    name, path, size,
    ageDays: Math.max(0, (Date.now() - mtime) / DAY),
    fam: familyOf(name),
    /* the fish is a pure function of where the file is, what it is called and
       how big it is -- touching a file does not change its fish */
    hash: fnv1a(path + "/" + name + "|" + size),
    dir,                       // parent handle, or null when we cannot delete
    netted: false, dead: false,
  };
}

/* ============================================================ demo drive
   Shaped like a real one: a few enormous folders, a long tail of small ones,
   and realistic arrival patterns. node_modules lands in one instant, a photo
   library arrives in hundreds of bursts, source code trickles. Those patterns
   are what make the vertical axis legible. */
const SPEC = [
  { path: "Pictures/Photos Library/Masters", n: 13200, fam: "image", size: [900e3, 9e6], age: [2, 4300], mode: "burst", bursts: 210 },
  { path: "Pictures/Screenshots", n: 1900, fam: "image", size: [180e3, 2.4e6], age: [0, 1400], mode: "trickle" },
  { path: "Pictures/Lightroom/Previews", n: 4100, fam: "image", size: [40e3, 400e3], age: [400, 1500], mode: "burst", bursts: 24 },
  { path: "Movies/Camera", n: 260, fam: "video", size: [180e6, 8e9], age: [10, 3200], mode: "burst", bursts: 60 },
  { path: "Movies/Renders", n: 42, fam: "video", size: [900e6, 2.2e10], age: [5, 600], mode: "trickle" },
  /* the whales: a shoal of masters near the surface, and a pod of ancient disc
     images in the abyss, so both ends of the water column have leviathans */
  { path: "Movies/Masters", n: 34, fam: "video", size: [4e9, 6e10], age: [40, 900], mode: "trickle" },
  { path: "Music/Library", n: 3400, fam: "audio", size: [4e6, 42e6], age: [900, 4380], mode: "burst", bursts: 90 },
  { path: "Music/Voice Memos", n: 210, fam: "audio", size: [400e3, 9e6], age: [1, 2200], mode: "trickle" },
  { path: "Code/filetofish/src", n: 46, fam: "code", size: [900, 92e3], age: [0, 40], mode: "trickle" },
  { path: "Code/filetofish/node_modules", n: 9400, fam: "code", size: [300, 220e3], age: [12, 13], mode: "instant" },
  { path: "Code/atlas/src", n: 780, fam: "code", size: [500, 140e3], age: [30, 1100], mode: "trickle" },
  { path: "Code/atlas/node_modules", n: 11800, fam: "code", size: [300, 260e3], age: [96, 97], mode: "instant" },
  { path: "Code/atlas/dist", n: 320, fam: "code", size: [2e3, 4e6], age: [30, 900], mode: "burst", bursts: 40 },
  { path: "Code/old-blog", n: 410, fam: "code", size: [700, 180e3], age: [1900, 3600], mode: "trickle" },
  { path: "Documents/Invoices", n: 380, fam: "doc", size: [60e3, 900e3], age: [20, 3900], mode: "trickle" },
  { path: "Documents/Contracts", n: 88, fam: "doc", size: [120e3, 3e6], age: [40, 3400], mode: "trickle" },
  { path: "Documents/Notes", n: 1240, fam: "doc", size: [400, 90e3], age: [0, 2600], mode: "trickle" },
  { path: "Downloads", n: 1450, fam: "doc", size: [50e3, 1.4e9], age: [0, 1800], mode: "trickle", mixed: true },
  { path: "Desktop", n: 96, fam: "image", size: [90e3, 4e6], age: [0, 90], mode: "trickle", mixed: true },
  { path: "Archives/backups", n: 62, fam: "archive", size: [1e9, 4.2e10], age: [200, 4300], mode: "trickle" },
  { path: "Archives/2014-laptop", n: 3100, fam: "archive", size: [1e3, 40e6], age: [3900, 4380], mode: "instant" },
  { path: "Archives/2011-imac", n: 26, fam: "archive", size: [8e9, 9e10], age: [3700, 4380], mode: "burst", bursts: 9 },
  /* deep water needs a population, not just a few strays: these are the files
     that come back as anglerfish, gulpers and oarfish */
  { path: "Documents/Old Papers", n: 720, fam: "doc", size: [40e3, 6e6], age: [3000, 4380], mode: "trickle" },
  /* zero bytes: .gitkeep, touch, a failed download. Ghost Minnows. */
  { path: "Code/atlas/.cache", n: 240, fam: "code", size: [0, 0], age: [0, 900], mode: "trickle" },
];
const DEMO_EXT = {
  image: ["heic", "jpg", "png", "webp"], video: ["mov", "mp4", "mkv"],
  audio: ["m4a", "wav", "flac"], code: ["ts", "js", "json", "map"],
  doc: ["pdf", "docx", "txt"], archive: ["zip", "dmg", "tar"],
};
const NAMEBITS = {
  image: ["IMG", "DSC", "PXL", "screenshot", "export", "scan"],
  video: ["MVI", "clip", "render", "timelapse", "take"],
  audio: ["track", "memo", "stem", "mix", "demo"],
  code: ["index", "main", "utils", "parser", "client", "server", "types", "helper", "config"],
  doc: ["invoice", "contract", "notes", "draft", "report", "receipt", "resume"],
  archive: ["backup", "snapshot", "archive", "bundle", "dump"],
};

function buildDemo() {
  const files = [];
  const rnd = mulberry32(0x0cea9);
  const now = Date.now();
  for (const s of SPEC) {
    const burstDays = [];
    if (s.mode === "burst") for (let i = 0; i < s.bursts; i++) burstDays.push(lerp(s.age[0], s.age[1], rnd()));
    const instantDay = s.mode === "instant" ? lerp(s.age[0], s.age[1], rnd()) : 0;
    for (let i = 0; i < s.n; i++) {
      const fam = s.mixed && rnd() < 0.55 ? FAMILIES[(rnd() * 6) | 0].key : s.fam;
      const exts = DEMO_EXT[fam] || DEMO_EXT.doc;
      const ext = exts[(rnd() * exts.length) | 0];
      const lo = Math.log(Math.max(1, s.size[0])), hi = Math.log(Math.max(1, s.size[1]));
      const size = s.size[1] === 0 ? 0
        : Math.round(Math.exp(lerp(lo, hi, Math.pow(rnd(), 1.9))));
      let ageDays;
      if (s.mode === "instant") ageDays = instantDay + rnd() * 0.02;
      else if (s.mode === "burst") ageDays = burstDays[(rnd() * burstDays.length) | 0] + (rnd() - 0.5) * 1.5;
      else ageDays = lerp(s.age[0], s.age[1], Math.pow(rnd(), 1.35));
      const bits = NAMEBITS[fam];
      const stem = bits[(rnd() * bits.length) | 0];
      const name = /^[A-Z]{3}$/.test(stem)
        ? `${stem}_${(1000 + (rnd() * 8999) | 0)}.${ext}`
        : `${stem}-${(rnd() * 999) | 0}.${ext}`;
      files.push(makeRecord(name, s.path, size, now - ageDays * DAY, null));
    }
  }
  return files;
}

/* ============================================================ ingestion
   Two ways in. The directory picker is Chromium-only but hands back live
   handles, which is the only way the browser can ever delete anything. The
   <input webkitdirectory> fallback works everywhere and is much faster,
   because the browser does the walk natively -- but it is read-only. */
const canPick = typeof window.showDirectoryPicker === "function";

async function scanHandle(root, onProgress) {
  const files = [];
  const stack = [{ h: root, path: "" }];
  let dirs = 0;
  while (stack.length) {
    const { h, path } = stack.pop();
    dirs++;
    const kids = [];
    try {
      for await (const entry of h.values()) kids.push(entry);
    } catch (e) { continue; }                    // unreadable directory: skip it
    const fileHandles = [];
    for (const k of kids) {
      if (k.kind === "directory") stack.push({ h: k, path: path ? path + "/" + k.name : k.name });
      else fileHandles.push(k);
    }
    /* getFile() is the expensive call and there is no metadata-only API, so
       fire them in batches rather than one at a time */
    for (let i = 0; i < fileHandles.length; i += 64) {
      const chunk = fileHandles.slice(i, i + 64);
      const got = await Promise.all(chunk.map(fh => fh.getFile().catch(() => null)));
      for (let j = 0; j < got.length; j++) {
        const f = got[j];
        if (f) files.push(makeRecord(chunk[j].name, path, f.size, f.lastModified, h));
      }
      onProgress(files.length, path);
      if (files.length >= MAX_FILES) return files;
      await new Promise(r => setTimeout(r, 0));   // let the progress bar paint
    }
    if (!fileHandles.length && dirs % 40 === 0) {
      onProgress(files.length, path);
      await new Promise(r => setTimeout(r, 0));
    }
  }
  return files;
}

function scanFileList(list) {
  const files = [];
  for (const f of list) {
    const rel = f.webkitRelativePath || f.name;
    const parts = rel.split("/");
    const name = parts.pop();
    files.push(makeRecord(name, parts.join("/"), f.size, f.lastModified, null));
    if (files.length >= MAX_FILES) break;
  }
  return files;
}

/* ============================================================ places
   1. PATH COMPRESSION -- a folder with one child folder and no files of its
      own is a hallway, not a room. Collapse the chain.
   2. MASS THRESHOLD -- a folder under 2% of its parent is furniture, not a
      place. Its files just live in the parent.
   Without these you get one node per directory and the ocean is confetti. */
const MIN_SHARE = 0.02;
const MIN_FILES = 24;

function buildTree(files) {
  const root = { name: "", seg: "", children: new Map(), files: [], count: 0 };
  for (const f of files) {
    let node = root;
    if (f.path) for (const seg of f.path.split("/")) {
      if (!node.children.has(seg))
        node.children.set(seg, { name: seg, seg, children: new Map(), files: [], count: 0 });
      node = node.children.get(seg);
    }
    node.files.push(f);
  }
  const count = n => {
    n.count = n.files.length;
    for (const c of n.children.values()) n.count += count(c);
    return n.count;
  };
  count(root);
  return root;
}

function toPlaces(node) {
  let cur = node, label = node.name;
  while (cur.files.length === 0 && cur.children.size === 1) {
    const only = cur.children.values().next().value;
    label = label ? label + "/" + only.seg : only.seg;
    cur = only;
  }
  const place = { name: label, files: cur.files.slice(), kids: [], count: cur.count };
  for (const c of cur.children.values()) {
    if (c.count < MIN_FILES || c.count / cur.count < MIN_SHARE) {
      const drain = n => { place.files.push(...n.files); for (const g of n.children.values()) drain(g); };
      drain(c);
    } else place.kids.push(toPlaces(c));
  }
  return place;
}

/* Circle packing, not a treemap: nested circles read as reefs and lagoons,
   rectangles read as architecture. Greedy front-chain. */
function packRadius(place) {
  for (const k of place.kids) packRadius(k);
  /* area by visual mass rather than by headcount: sixty disc images are sixty
     leviathans and need a bay, not the puddle sixty dotfiles would get. A
     normal file counts as exactly one, so ordinary folders pack as before. */
  let mass = 0;
  for (const f of place.files) mass += footprint(f.size);
  const own = Math.sqrt(mass) * 1.9;
  if (!place.kids.length) { place.r = Math.max(6, own); return place.r; }
  const laid = layoutKids(place.kids);
  place.r = Math.max(laid + 4, own * 0.6 + laid * 0.35);
  return place.r;
}
function layoutKids(kids) {
  const cs = kids.slice().sort((a, b) => b.r - a.r);
  const placed = [];
  const hits = (x, z, r) => placed.some(p => Math.hypot(p.x - x, p.z - z) < p.r + r - 0.001);
  for (const c of cs) {
    if (!placed.length) { c.x = 0; c.z = 0; placed.push(c); continue; }
    if (placed.length === 1) { c.x = placed[0].r + c.r; c.z = 0; placed.push(c); continue; }
    let best = null;
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i], b = placed[j];
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      const r1 = a.r + c.r, r2 = b.r + c.r;
      if (d > r1 + r2 || d < Math.abs(r1 - r2) || d === 0) continue;
      const t = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
      const h2 = r1 * r1 - t * t; if (h2 < 0) continue;
      const h = Math.sqrt(h2);
      const mx = a.x + t * (b.x - a.x) / d, mz = a.z + t * (b.z - a.z) / d;
      const ox = h * (b.z - a.z) / d, oz = -h * (b.x - a.x) / d;
      for (const [x, z] of [[mx + ox, mz + oz], [mx - ox, mz - oz]]) {
        if (hits(x, z, c.r)) continue;
        const score = Math.hypot(x, z);
        if (!best || score < best.s) best = { x, z, s: score };
      }
    }
    if (!best) {
      let ring = placed[0].r + c.r;
      outer: for (let g = 0; g < 400; g++, ring *= 1.06) {
        for (let a = 0; a < 36; a++) {
          const th = a / 36 * TAU + g * 0.21;
          const x = Math.cos(th) * ring, z = Math.sin(th) * ring;
          if (!hits(x, z, c.r)) { best = { x, z, s: ring }; break outer; }
        }
      }
    }
    c.x = best ? best.x : 0; c.z = best ? best.z : 0;
    placed.push(c);
  }
  let far = 0;
  for (const c of placed) far = Math.max(far, Math.hypot(c.x, c.z) + c.r);
  return far;
}
function placeWorld(place, cx, cz, out) {
  place.cx = cx; place.cz = cz;
  out.push(place);
  for (const k of place.kids) placeWorld(k, cx + (k.x || 0), cz + (k.z || 0), out);
}

/* ============================================================ layout */
/* DEPTH IS SIZE. The one decision the whole view hangs off.

   An ocean already sorts its animals by mass: krill in the light, whales
   sounding, and the genuinely enormous and strange down where the pressure
   is. Putting bytes on the vertical makes the metaphor stop being a mapping
   and start being the same fact said twice -- the taxonomy already grades fry
   to leviathan, so form and depth finally agree instead of arguing.

   It pays for itself four more times. Every horizontal layer holds animals of
   one size, so they are all the same handful of pixels across and aiming at
   one of them is the same gesture everywhere; a whale can no longer be parked
   in a cloud of dotfiles. The dive gets the destination it never had -- "where
   did the disk go" is the question people actually open a disk viewer to ask,
   and here you answer it by sinking. Nothing has to float above the surface
   any more, because the things that need room are the deep ones. And the
   column is a ruler in real units, so 1 GB is at the same depth on every drive
   you ever open.

   In log2(bytes), because that is the only honest scale for a quantity that
   runs from a 0-byte .gitkeep to a 90 GB disc image: one step down the water
   is one doubling. Fitted to the drive's own p01..p99 so any folder fills the
   frame -- percentiles, or one stray archive flattens everything else into the
   surface. */
let LB_LO = 0, LB_HI = 38;
/* the ocean is scaled uniformly to the size of the drive, so a small folder is
   a small sea rather than a few specks lost in a big one. Physical size means
   nothing; only the ratios do. */
let DEPTH = TUNE.depth;
const sizeToY = lb =>
  -DEPTH * Math.pow(clamp((lb - LB_LO) / (LB_HI - LB_LO), 0, 1), TUNE.sizeCurve);
const yToSize = y =>
  LB_LO + (LB_HI - LB_LO) * Math.pow(clamp(-y / DEPTH, 0, 1), 1 / TUNE.sizeCurve);

/* AGE moved off the vertical, but it did not stop mattering -- it just stopped
   being a place and became a condition. A file you touched this morning keeps
   its family colour and swims like it means it; one you have not opened in
   four years is bleached and slow. That reads at a glance with no scale to
   consult, and a folder you have abandoned turns grey as a whole, which is the
   bit of the old age axis actually worth keeping. Fitted p01..p99, same as
   the water column, so it means the same thing on any drive. */
let AGE_LO = 0, AGE_HI = 3650;
const ageFade = d => clamp((d - AGE_LO) / (AGE_HI - AGE_LO), 0, 1);
/* SIZE IS SIZE, and at the top end that has to mean something. One smooth
   curve makes a 20 GB video a slightly bigger perch, so the ladder is
   piecewise instead: log2(bytes) -> world units, with the classes landing on
   the breaks. A mote is 0.20 across and a 32 GB disc image is 21 -- a hundred
   times the animal, not twice it. */
const SIZE_LADDER = [
  [0, 0.20],    // an empty file
  [10, 0.34],   // 1 KB
  [14, 0.55],   // 16 KB
  [17, 0.90],   // 128 KB
  [20, 1.45],   // 1 MB
  [23, 2.30],   // 8 MB
  [25, 3.20],   // 32 MB
  [28, 6.00],   // 256 MB
  [30, 9.00],   // 1 GB
  [31, 11.0],   // 2 GB
  [33, 16.0],   // 8 GB
  [35, 21.0],   // 32 GB
  [38, 30.0],   // 256 GB
];
/* the class breaks, in log2(bytes): fry | fish | big fish | leviathan */
const CLASS_BREAK = [15, 25, 31];              // 32 KB, 32 MB, 2 GB
const CLASS_KEY = ["fry", "mid", "big", "lev"];
const classOf = lb => lb < CLASS_BREAK[0] ? 0 : lb < CLASS_BREAK[1] ? 1
  : lb < CLASS_BREAK[2] ? 2 : 3;

function sizeToScale(b) {
  const lb = clamp(Math.log2(b + 1), 0, 38);
  let i = 0;
  while (i < SIZE_LADDER.length - 2 && lb >= SIZE_LADDER[i + 1][0]) i++;
  const a = SIZE_LADDER[i], c = SIZE_LADDER[i + 1];
  return lerp(a[1], c[1], (lb - a[0]) / (c[0] - a[0])) * TUNE.sizeGain;
}
/* how much water one file's animal needs, in units of "one ordinary fish".
   This is what both the folder circles and the whole ocean are sized by, so a
   drive of 4K masters is a bigger sea than a drive of dotfiles even at the
   same file count -- which is the honest reading of "the size of the drive". */
function footprint(b) {
  const s = sizeToScale(b) / 1.35;
  return Math.max(1, s * s);
}

const hsl = { h: 0, s: 0, l: 0 };
function layout(places) {
  for (const p of places) {
    /* schooling comes from similarity, not from the folder: same family, same
       order of magnitude. That is why thumbnail caches shoal and Downloads
       scatters -- which is what they actually are. */
    const schools = new Map();
    for (const f of p.files) {
      const key = f.fam + "|" + (Math.log2(f.size + 1) | 0);
      let s = schools.get(key);
      if (!s) {
        const r = mulberry32(fnv1a(p.name + key));
        const th = r() * TAU, rad = Math.sqrt(r()) * p.r * 0.60;
        s = { x: Math.cos(th) * rad, z: Math.sin(th) * rad, n: 0, phase: r() * TAU, big: 0 };
        schools.set(key, s);
      }
      f.school = s; s.n++;
      s.big = Math.max(s.big, sizeToScale(f.size));
    }
    for (const f of p.files) {
      const r = mulberry32(f.hash);
      const s = f.school;
      f.scale = sizeToScale(f.size);
      f.lb = clamp(Math.log2(f.size + 1), 0, 38);
      f.cls = classOf(f.lb);
      /* keep school + scatter inside the folder's circle, or places bleed into
         each other and the packing stops meaning anything -- but a pod of
         leviathans needs the room its bodies actually take up */
      const base = lerp(p.r * 0.38, p.r * TUNE.schoolTight * 0.4, clamp(s.n / 220, 0, 1));
      const spread = Math.min(p.r * 0.88, Math.max(base, Math.sqrt(s.n) * s.big * 1.5));
      const th = r() * TAU, rad = Math.sqrt(r()) * spread;
      f.x = p.cx + s.x + Math.cos(th) * rad;
      f.z = p.cz + s.z + Math.sin(th) * rad;
      /* the band gets thickness so a shoal is a shoal and not a sheet, but
         much less than one doubling of size, or the ordering stops reading.
         Nothing floats above the surface. */
      f.y = Math.min(-0.6 - f.scale * 0.75,
                     sizeToY(f.lb) + (r() - 0.5) * TUNE.bandJitter * 2);
      /* the creature is a reading of the file, and now that depth is size the
         two rules that used to fight each other are one rule: what lives down
         where the light stops is what is big enough to be down there. */
      const depthT = clamp(-f.y / DEPTH, 0, 1);
      const deep = depthT > lerp(TUNE.deepFrom, TUNE.deepTo, r());
      f.arch = archOf(f, deep);
      /* behaviour follows size: a whale that darts like a minnow is wrong. Big
         things beat slowly, turn on a much wider arc, and barely bob -- and an
         old file, whatever its size, has less of a hurry about it. */
      const sT = clamp((f.lb - 14) / 19, 0, 1);
      f.fade = ageFade(f.ageDays);
      const slow = 1 - TUNE.languor * f.fade;
      f.phase = s.phase + r() * 1.4;
      f.speed = (0.35 + r() * 0.5) * lerp(1.45, 0.16, sT) * slow;
      f.orbit = lerp(0.80, 2.10, sT);
      f.bob = lerp(0.16, 0.022, sT) * lerp(1, 0.62, f.fade);
      f.roll = lerp(0.11, 0.016, sT) * slow;
      /* the individuality that used to live in per-file geometry now lives in
         a non-uniform scale and a colour nudge -- 200 tris x 50,000 files is
         not a thing you can build */
      f.sx = 0.84 + r() * 0.42;
      f.sy = 0.78 + r() * 0.52;
      f.sz = 0.82 + r() * 0.40;
      const c = famColor[f.fam].clone();
      c.offsetHSL((r() - 0.5) * 0.055, (r() - 0.5) * 0.20, (r() - 0.5) * 0.16);
      /* age is bleach. Hue is left alone -- family has to stay readable across
         the whole ocean -- so what goes is a proportion of the chroma and a
         little of the light, and an untouched folder greys out as one thing.
         Proportional, not a flat subtraction: taking 0.6 off a saturation of
         0.62 does not wash a colour out, it deletes it, and a reef of grey is
         a worse read than a reef of one green. */
      c.getHSL(hsl);
      c.setHSL(hsl.h, hsl.s * (1 - TUNE.bleach * f.fade), hsl.l * (1 - 0.16 * f.fade));
      f.cr = c.r; f.cg = c.g; f.cb = c.b;
      /* plain / bands / spots / stripe, as a per-instance pair rather than a
         uniform -- one draw call covers a thousand fish. 4 is the ghost. */
      f.pat = (r() * 4) | 0;
      f.patF = 7 + r() * 11;
      if (f.size === 0) {
        /* a zero-byte file is the Ghost Minnow, as in the main app: nothing
           there, so barely anything to see */
        f.cr = 0.86; f.cg = 0.95; f.cb = 0.97;
        f.pat = 4;
      }
      f.place = p;
    }
  }
}

/* ============================================================ the taxonomy
   The creature is a reading of the file, not of its hash.

   SIZE CLASS decides the silhouette -- fry, fish, big fish, leviathan.
   DEPTH, which is also size, decides whether it is a lit-water form or a
   deep-sea one. Those two used to be different variables pulling in different
   directions, which is how you got a 2 KB dotfile as an anglerfish; now they
   are the same variable and the abyss is exactly as strange as it is heavy.
   FAMILY nudges the body plan inside whichever pool a file lands in (video as
   long torpedoes, images as flat discs and rays, archives as armoured blocks)
   while colour keeps carrying family as the primary channel.
   The HASH only breaks ties, so two files of a kind are still two animals.

   Every archetype is one geometry instanced up to meshBudget times, so the
   whole table costs fifteen draw calls -- per-file geometry is the one thing
   this view cannot afford. */
const ARCH = [
  { key: "fry", pools: { fry: 4 }, seg: 7, ring: 5,
    pF: .60, pB: .92, dep: .36, gir: .17, stretch: .92, tail: "fork", dor: .16,
    eyeK: 1.55, nouns: ["Fry", "Minnow", "Sprat", "Smelt"] },

  { key: "perch", pools: { mid: 3, fry: 1 }, fam: "doc",
    pF: .62, pB: .88, dep: .44, gir: .21, stretch: 1.04, tail: "fan", dor: .22,
    nouns: ["Perch", "Bream", "Roach", "Rudd"] },

  { key: "torpedo", pools: { mid: 2 }, fam: "video",
    pF: .66, pB: 1.15, dep: .29, gir: .19, stretch: 1.22, tail: "fork", dor: .13,
    bill: 1, nouns: ["Tuna", "Marlin", "Bonito", "Wahoo"] },

  { key: "flat", pools: { mid: 3, fry: 1 }, fam: "image",
    pF: .75, pB: .78, dep: .74, gir: .11, stretch: .88, tail: "fan", dor: .28,
    nouns: ["Turbot", "Discus", "Moonfish", "Pomfret"] },

  { key: "eel", pools: { mid: 2, deep: 1 }, fam: "code", seg: 12, ring: 5,
    pF: .42, pB: .46, dep: .15, gir: .12, stretch: 1.65, tail: "round", dor: .07,
    dorA: .18, dorB: .90, barbel: 1, nouns: ["Eel", "Conger", "Gunnel", "Lamprey"] },

  { key: "puffer", pools: { mid: 2 }, fam: "archive",
    pF: 1.0, pB: 1.0, dep: .62, gir: .50, stretch: .78, tail: "fan", dor: .09,
    spikes: 1, nouns: ["Puffer", "Blowfish", "Lumpsucker", "Boxfish"] },

  { key: "shark", pools: { big: 3 }, fam: "video",
    pF: .67, pB: 1.22, dep: .31, gir: .21, stretch: 1.30, tail: "fork", dor: .39,
    dor2: 1, nouns: ["Shark", "Tope", "Hound", "Thresher"] },

  { key: "ray", pools: { big: 2 }, fam: "image", seg: 8, ring: 6,
    pF: .80, pB: .80, dep: .11, gir: .58, stretch: .86, tail: "whip", dor: .03,
    pect: 3.0, pectLen: -1.7, pectRot: 1.42, pectT: .30, eyeY: .12, eyeK: .8,
    nouns: ["Ray", "Manta", "Skate", "Devilfish"] },

  { key: "grouper", pools: { big: 3 }, fam: "archive",
    pF: .52, pB: .86, dep: .54, gir: .36, stretch: .98, tail: "fan", dor: .26,
    nouns: ["Grouper", "Halibut", "Wrasse", "Cod"] },

  /* the leviathans. Horizontal flukes instead of a caudal fin is the one cue
     that says "not a fish" from half an ocean away, so both get them. */
  /* the rorqual has to be in the deep pool as well as the lit one. It was in
     `lev` alone, which was fine when depth meant age -- but depth means size
     now, so a leviathan is almost always below the light by definition, and
     leaving him out of `levdeep` retired the best model in the set to one
     animal on a fifty-thousand-file drive. */
  { key: "whale", pools: { lev: 3, levdeep: 2 }, seg: 12, ring: 8,
    pF: .34, pB: .76, dep: .30, gir: .27, stretch: 1.55, tail: "fluke",
    dor: .07, dorA: .58, dorB: .74, nose: .44, noseP: 1.7,
    eyeK: .40, eyeT: .12, eyeY: .05, pect: .55, pectLen: -2.0, pectRot: .85, pectT: .30,
    nouns: ["Whale", "Rorqual", "Finback", "Leviathan"] },

  { key: "cachalot", pools: { lev: 2, levdeep: 3 }, seg: 12, ring: 8,
    pF: .20, pB: .70, dep: .30, gir: .28, stretch: 1.50, tail: "fluke",
    dor: .05, dorA: .62, dorB: .80, nose: .58, noseP: 3.4,
    eyeK: .38, eyeT: .30, eyeY: -.10, pect: .5, pectLen: -1.4, pectRot: .80, pectT: .38,
    nouns: ["Cachalot", "Bowhead", "Behemoth", "Sea Bull"] },

  /* the deep. These only exist below the light, which -- now that depth is
     size -- is to say only for the heavy files on the drive. */
  { key: "angler", pools: { deep: 3 }, fam: "code",
    pF: .34, pB: 1.20, dep: .52, gir: .32, stretch: .92, tail: "round", dor: .12,
    lure: 1, eyeK: 1.25, nouns: ["Angler", "Monkfish", "Sea Devil", "Toadfish"] },

  { key: "gulper", pools: { deep: 2 }, fam: "archive", seg: 11, ring: 5,
    pF: .24, pB: 1.95, dep: .44, gir: .28, stretch: 1.70, tail: "whip",
    dor: .05, dorA: .20, dorB: .80, jaw: 1, eyeK: .85, eyeT: .10,
    nouns: ["Gulper", "Pelican Eel", "Swallower", "Blackmouth"] },

  { key: "oarfish", pools: { deep: 2, levdeep: 1 }, fam: "doc", seg: 14, ring: 5,
    pF: .50, pB: .55, dep: .34, gir: .055, stretch: 2.0, tail: "round",
    dor: .055, dorA: .05, dorB: .95, crest: 1, eyeK: 1.1,
    nouns: ["Oarfish", "Ribbonfish", "Regalec", "King of Herrings"] },

  /* zero bytes: nothing is there, so there is barely anything to see */
  { key: "ghost", pools: {}, seg: 7, ring: 5,
    pF: .58, pB: .95, dep: .34, gir: .16, stretch: .98, tail: "fan", dor: .14,
    eyeK: 1.30, nouns: ["Ghost Minnow"] },
];
const POOLS = {};
ARCH.forEach((a, i) => {
  for (const p in a.pools) (POOLS[p] || (POOLS[p] = [])).push(i);
});
const GHOST_I = ARCH.findIndex(a => a.key === "ghost");

/* the pool weight says how typical a form is of its class; a family match
   multiplies it by four, which biases the pick hard without ever collapsing a
   whole folder onto one animal */
const archW = (i, pool, fam) => ARCH[i].pools[pool] * (ARCH[i].fam === fam ? 4 : 1);
function pickArch(pool, fam, h) {
  const list = POOLS[pool];
  let tot = 0;
  for (const i of list) tot += archW(i, pool, fam);
  let x = h % tot;
  for (const i of list) {
    const w = archW(i, pool, fam);
    if (x < w) return i;
    x -= w;
  }
  return list[0];
}
function archOf(f, deep) {
  if (f.size === 0) return GHOST_I;
  const h = f.hash >>> 9;
  if (f.cls === 3) return pickArch(deep ? "levdeep" : "lev", f.fam, h);
  if (deep) return pickArch("deep", f.fam, h);
  return pickArch(CLASS_KEY[f.cls], f.fam, h);
}

function peakOf(a) {
  let m = 1e-6;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    m = Math.max(m, Math.pow(Math.pow(t, a.pF) * Math.pow(1 - t, a.pB), 0.85));
  }
  return m;
}
/* `nose` is how much bulk the head keeps that the body curve alone would taper
   away -- the difference between a rorqual and a sperm whale is one number */
const radiusAt = (t, a, peak) =>
  Math.max(Math.pow(Math.pow(clamp(t, 0, 1), a.pF) * Math.pow(clamp(1 - t, 0, 1), a.pB), 0.85) / peak * 0.9
    + (a.nose === undefined ? 0.145 : a.nose) * Math.pow(1 - t, a.noseP || 1.15), 0.075);
const spineX = (t, a) => (-1 + t * 2) * a.stretch;

/* One geometry per archetype, instanced up to meshBudget times, so every gram
   of detail here is paid for 1400x. What earns its place is what makes a blob
   read as an animal at arm's length: an eye and a pair of pectorals. Both are
   baked in -- per-fish meshes are exactly the thing this view cannot afford.
   PART tags a vertex as body (0), eye white (1), pupil (2) or lure (3); the
   eye is flat and unlit, the way the main app's flatMat eyes are, and the lure
   is the one thing in the ocean that emits instead of reflecting. */
function archGeometry(a) {
  const SEG = a.seg || 9, RING = a.ring || 6, peak = peakOf(a), v = [], part = [];
  const tri = (p, q, r, k) => {
    v.push(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2]);
    part.push(k, k, k);
  };
  /* eight triangles is a sphere at four pixels wide */
  const oct = (cx, cy, cz, R, k) => {
    const p = [[R, 0, 0], [-R, 0, 0], [0, R, 0], [0, -R, 0], [0, 0, R], [0, 0, -R]]
      .map(q => [cx + q[0], cy + q[1], cz + q[2]]);
    for (const [i, j, m] of [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4],
                             [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]])
      tri(p[i], p[j], p[m], k);
  };
  const P = (i, j) => {
    const t = i / SEG, th = (j % RING) / RING * TAU;
    const r = radiusAt(t, a, peak), s = Math.sin(th), c = Math.cos(th);
    return [spineX(t, a), r * a.dep * s * (s < 0 ? 1.2 : 1), r * a.gir * c];
  };
  for (let i = 0; i < SEG; i++) for (let j = 0; j < RING; j++) {
    const p = P(i, j), q = P(i, j + 1), r = P(i + 1, j), s = P(i + 1, j + 1);
    tri(p, r, q, 0); tri(q, r, s, 0);
  }
  const nose = [spineX(0, a) - 0.05 * a.stretch, 0, 0], tail = [spineX(1, a), 0, 0];
  for (let j = 0; j < RING; j++) {
    tri(nose, P(0, j), P(0, j + 1), 0);
    tri(tail, P(SEG, j + 1), P(SEG, j), 0);
  }
  const X = spineX(1, a);
  if (a.tail === "fluke") {
    /* horizontal flukes, notched at the centre. From any angle at all this is
       the cue that says "this is not a fish, it breathes air" -- so the tips
       drop a little, or side-on the whole tail goes edge-on and disappears. */
    const FL = 0.55 * a.stretch, FH = 0.82;
    const out = [];
    for (let i = 0; i <= 8; i++) {
      const u = -1 + (i / 8) * 2, au = Math.abs(u);
      out.push([X + FL * (1 - 0.58 * (1 - Math.pow(au, 2.4))), u * FH, -au * au * FH * 0.24]);
    }
    for (let i = 0; i < out.length - 1; i++)
      tri([X - 0.07, 0, 0], [out[i][0], out[i][2], out[i][1]],
          [out[i + 1][0], out[i + 1][2], out[i + 1][1]], 0);
  } else if (a.tail === "whip") {
    const WL = 1.15 * a.stretch, w = 0.032;
    tri([X, w, 0], [X, -w, 0], [X + WL, 0, 0], 0);
    tri([X, 0, w], [X, 0, -w], [X + WL, 0, 0], 0);
  } else {
    const L = 0.42, H = 0.36;
    const cfg = { fan: [0.30, 1.7], fork: [0.62, 2.3], round: [0.02, 1] }[a.tail];
    const out = [];
    for (let i = 0; i <= 7; i++) {
      const u = -1 + (i / 7) * 2, au = Math.abs(u);
      if (a.tail === "round") out.push([X + L * 0.18 + L * Math.sqrt(Math.max(0, 1 - u * u)), u * H * 0.92]);
      else out.push([X + L * (1 - cfg[0] * (1 - Math.pow(au, cfg[1]))), u * H]);
    }
    for (let i = 0; i < out.length - 1; i++)
      tri([X - 0.06, 0, 0], [out[i][0], out[i][1], 0], [out[i + 1][0], out[i + 1][1], 0], 0);
  }
  /* dorsal ridge, over a span the archetype chooses: a shark's is a triangle
     amidships, an oarfish's runs the whole animal */
  const ridge = (t0s, t1s, hgt) => {
    for (let i = 0; i < 5; i++) {
      const s0 = i / 5, s1 = (i + 1) / 5;
      const t0 = lerp(t0s, t1s, s0), t1 = lerp(t0s, t1s, s1);
      const e0 = radiusAt(t0, a, peak) * a.dep, e1 = radiusAt(t1, a, peak) * a.dep;
      const h0 = hgt * Math.pow(Math.sin(s0 * Math.PI), 0.62);
      const h1 = hgt * Math.pow(Math.sin(s1 * Math.PI), 0.62);
      tri([spineX(t0, a), e0, 0], [spineX(t0, a), e0 + h0, 0], [spineX(t1, a), e1, 0], 0);
      tri([spineX(t0, a), e0 + h0, 0], [spineX(t1, a), e1 + h1, 0], [spineX(t1, a), e1, 0], 0);
    }
  };
  const dA = a.dorA === undefined ? 0.30 : a.dorA;
  const dB = a.dorB === undefined ? 0.66 : a.dorB;
  ridge(dA, dB, a.dor);
  if (a.dor2) ridge(dB + 0.05, Math.min(0.94, dB + 0.24), a.dor * 0.42);

  /* pectorals: the main app's fan, folded out of the flank. Two per fish, and
     they are what stops a torpedo reading as a bullet. A manta's are the whole
     animal; a whale's are long narrow flippers. */
  {
    const N = 6, pt = a.pectT || 0.34, pr = radiusAt(pt, a, peak);
    const ph = (0.13 + a.dep * 0.26) * (a.pect || 1);
    /* pectLen is signed: a short fin leans forward off the shoulder, but
       anything long enough to matter -- a flipper, a manta's wing -- has to
       sweep back or it grows out through the animal's own face */
    const pl = 0.34 * a.stretch * (a.pectLen || 1);
    const cz = Math.cos(-0.18), sz = Math.sin(-0.18);
    const outline = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      outline.push([-u * pl, -Math.sin(u * Math.PI) * ph * 1.15 - u * 0.06]);
    }
    for (const s of [1, -1]) {
      const rot = s * (a.pectRot || 0.62);
      const cx = Math.cos(rot), sx = Math.sin(rot);
      const ox = spineX(pt, a), oy = -pr * a.dep * 0.10, oz = s * pr * a.gir * 0.92;
      const T = p => {
        const x = p[0] * cz - p[1] * sz, y = p[0] * sz + p[1] * cz;
        return [ox + x, oy + y * cx, oz + y * sx];
      };
      const root = T([0.02, 0.015]);
      for (let i = 0; i < N; i++) tri(root, T(outline[i]), T(outline[i + 1]), 0);
    }
  }

  /* --- the things that make a species a species -------------------------- */
  if (a.bill) {                                  // marlin: a spear on the nose
    const x0 = spineX(0, a) - 0.05 * a.stretch, tip = x0 - 0.40 * a.stretch, w = 0.030;
    tri([x0, w, 0], [x0, -w, 0], [tip, 0, 0], 0);
    tri([x0, 0, w], [x0, 0, -w], [tip, 0, 0], 0);
  }
  if (a.barbel) {                                // whiskers under the chin
    const x0 = spineX(0.07, a);
    for (const s of [1, -1])
      tri([x0, -a.dep * 0.30, s * 0.02], [x0 + 0.04, -a.dep * 0.30, s * 0.05],
          [x0 - 0.16, -a.dep * 0.30 - 0.22, s * 0.06], 0);
  }
  if (a.spikes) {                                // puffer
    const rr = mulberry32(0x5bf03635);
    for (let i = 0; i < 11; i++) {
      const t = 0.18 + rr() * 0.58, th = rr() * TAU;
      const r = radiusAt(t, a, peak), s = Math.sin(th), c = Math.cos(th);
      const b = [spineX(t, a), r * a.dep * s, r * a.gir * c];
      const o = [spineX(t, a) - 0.03, r * a.dep * s * 1.9, r * a.gir * c * 1.9];
      tri([b[0] - 0.05, b[1], b[2]], [b[0] + 0.05, b[1], b[2]], o, 0);
    }
  }
  if (a.jaw) {
    /* the gulper is a mouth that tows a body. A pouch hung off the nose does
       the whole job in twelve triangles. */
    const x0 = spineX(0, a) - 0.05 * a.stretch, x1 = spineX(0.34, a);
    const drop = a.dep * 2.6, wide = a.gir * 3.4;
    for (let i = 0; i < 6; i++) {
      const t0 = i / 6 * TAU, t1 = (i + 1) / 6 * TAU;
      const q = th => [x1, -drop * 0.55 + Math.sin(th) * drop * 0.55, Math.cos(th) * wide];
      tri([x0, 0, 0], q(t0), q(t1), 0);
    }
  }
  if (a.crest) {                                 // oarfish: the red plume
    for (let i = 0; i < 3; i++) {
      const t = 0.05 + i * 0.055, e = radiusAt(t, a, peak) * a.dep;
      const h = 0.62 - i * 0.13;
      tri([spineX(t, a), e, 0], [spineX(t, a) - 0.05, e + h, 0], [spineX(t, a) + 0.06, e, 0], 0);
    }
  }
  if (a.lure) {
    /* the anglerfish's lamp. It is the only light source down there, and it is
       what makes descending into the dark worth doing. */
    const bx = spineX(0.22, a), by = radiusAt(0.22, a, peak) * a.dep;
    const tx = bx - 0.40 * a.stretch, ty = by + 0.48, w = 0.022;
    tri([bx - w, by, 0], [bx + w, by, 0], [tx, ty, 0], 0);
    tri([bx, by, -w], [bx, by, w], [tx, ty, 0], 0);
    oct(tx, ty + 0.07, 0, 0.135, 3);
  }

  /* the eye. A coplanar ring plus a disc -- concentric so nothing z-fights,
     and flat-facing so it survives being four pixels wide. */
  {
    const K = 6, et = a.eyeT || 0.20, er = radiusAt(et, a, peak);
    const eR = clamp(Math.max(er * a.dep, er * a.gir) * 0.38 * (a.eyeK || 1), 0.014, 0.092);
    const ex = spineX(et, a), ey = er * a.dep * (a.eyeY === undefined ? 0.46 : a.eyeY);
    let ez = 0;                                  // clear the widest station the eye spans
    const dt = eR / (2 * a.stretch);
    for (let i = -2; i <= 2; i++) ez = Math.max(ez, radiusAt(et + dt * i * 0.5, a, peak) * a.gir);
    ez = ez * 1.03 + 0.004;
    const pR = eR * 0.52;
    for (const s of [1, -1]) {
      const z = s * ez;
      for (let i = 0; i < K; i++) {
        const t0 = i / K * TAU, t1 = (i + 1) / K * TAU;
        const c0 = Math.cos(t0), n0 = Math.sin(t0), c1 = Math.cos(t1), n1 = Math.sin(t1);
        tri([ex + c0 * pR, ey + n0 * pR, z], [ex + c0 * eR, ey + n0 * eR, z],
            [ex + c1 * eR, ey + n1 * eR, z], 1);
        tri([ex + c0 * pR, ey + n0 * pR, z], [ex + c1 * eR, ey + n1 * eR, z],
            [ex + c1 * pR, ey + n1 * pR, z], 1);
        tri([ex, ey, z], [ex + c0 * pR, ey + n0 * pR, z], [ex + c1 * pR, ey + n1 * pR, z], 2);
      }
    }
  }

  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(v), 3));
  g.computeVertexNormals();
  g.setAttribute("part", new BufferAttribute(new Float32Array(part), 1));
  return g;
}

/* ============================================================ shaders */
/* The fish render to their own low-res target with alpha, so the post pass can
   dither them and ink their silhouette without touching the water. Alpha is
   not coverage but VISIBILITY: background is 0, a fish fragment is
   0.15 + 0.85 * vis. That keeps the "is this a fish texel" test binary for the
   ink pass while still letting a fogged fish -- and its outline with it --
   dissolve into the murk instead of hanging there as an outlined blob. */
const A_FLOOR = 0.15;
const FISH_VS = `
attribute vec3 tint; attribute vec2 pat; attribute float part;
varying vec3 vN, vC, vO, vW; varying vec2 vPat; varying float vFog, vPart, vBig;
void main(){
  vC = tint; vPat = pat; vPart = part; vO = position;
  vN = normalize(mat3(instanceMatrix) * normal);
  vec4 wp = instanceMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vec4 mv = modelViewMatrix * wp;
  vFog = -mv.z;
  /* how big this instance is, straight off its own matrix -- a leviathan has
     to stay solid long after a minnow at the same distance has gone */
  vBig = max(0.0, length(instanceMatrix[0].xyz) - 1.5);
  gl_Position = projectionMatrix * mv;
}`;
const FISH_FS = `
precision highp float;
uniform vec3 uWater; uniform float uFog, uTime, uFar, uFarBig, uFogBig;
varying vec3 vN, vC, vO, vW; varying vec2 vPat; varying float vFog, vPart, vBig;
float h31(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
float n31(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x), mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x), f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x), mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x), f.y), f.z);
}
void main(){
  vec3 col;
  float lure = 0.0;
  if (vPart > 2.5) {
    /* the anglerfish lamp: it emits, so it neither takes the lamp nor most of
       the water. A light in the dark is the whole point of it. */
    lure = 1.0;
    col = vec3(1.00, 0.94, 0.70) * (1.00 + 0.28 * sin(uTime * 2.1 + vW.y * 0.6));
  }
  else if (vPart > 1.5) col = vec3(0.07, 0.055, 0.05);     // pupil, flat and unlit
  else if (vPart > 0.5) col = vec3(0.90, 0.88, 0.82);      // eye white, likewise
  else {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vW);
    if (dot(N, V) < 0.0) N = -N;                           // fins are sheets; light both faces
    /* pattern on a coarse object-space grid so it blocks up with the facets.
       Which pattern is per-instance -- one draw call is a thousand fish. */
    vec3 q = floor(vO * 13.0) / 13.0;
    /* the mark keeps the family hue and only darkens: colour is file type and
       it has to survive being read across a whole reef */
    vec3 mk = vC * vec3(0.58, 0.64, 0.70);
    vec3 alb = vC;
    if (vPat.x > 0.5 && vPat.x < 1.5)      alb = mix(alb, mk, step(0.62, sin(q.x * vPat.y) * 0.5 + 0.5) * 0.9);
    else if (vPat.x > 1.5 && vPat.x < 2.5) alb = mix(alb, mk, step(0.60, n31(q * vPat.y * 0.55)));
    else if (vPat.x > 2.5 && vPat.x < 3.5) alb = mix(alb, mk, 1.0 - step(0.055, abs(q.y + 0.015)));
    float k = dot(N, normalize(vec3(0.15, 0.95, 0.28))) * 0.5 + 0.5;
    float band = floor(clamp(k, 0.0, 0.999) * 4.0) / 3.0;  // the same hard lamp as the main app
    col = alb * (0.30 + 0.85 * band);
  }
  /* turbidity is the render budget, but it is also apparent size: a big
     silhouette survives scattering that swallows a minnow, which is what makes
     "you can see it from across the ocean" true rather than a claim */
  float far = uFar + vBig * uFarBig;
  float f = clamp(1.0 - exp(-vFog * uFog / (1.0 + vBig * uFogBig)), 0.0, 1.0);
  /* the water takes half of it in colour and the rest in alpha, so the ink
     fades with the fish and the far tier hands off instead of popping */
  col = mix(col, uWater, f * mix(0.5, 0.10, lure));
  float vis = (1.0 - f * (1.0 - lure * 0.65)) * (1.0 - smoothstep(far * 0.74, far, vFog));
  vis *= 1.0 - step(3.5, vPat.x) * 0.55;                   // pattern 4: the Ghost Minnow
  gl_FragColor = vec4(col, ${A_FLOOR.toFixed(2)} + ${(1 - A_FLOOR).toFixed(2)} * vis);
}`;

/* 8x8 Bayer at 5 levels per channel plus the silhouette ink -- a transparent
   texel touching an opaque one becomes ink. Straight off the main app; it is
   the half of the look that the ocean was missing. */
const POST_FRAG = `
precision highp float;
uniform sampler2D tMap; uniform vec2 uRT; uniform float uLevels; uniform vec3 uInk;
varying vec2 vUv;
float b2(vec2 a){ a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float b8(vec2 a){ return b2(0.25*a)*0.0625 + b2(0.5*a)*0.25 + b2(a); }
void main(){
  vec2 px = 1.0 / uRT;
  vec4 s = texture2D(tMap, vUv);
  if (s.a < ${(A_FLOOR * 0.5).toFixed(3)}){
    float n = max(max(texture2D(tMap, vUv + vec2(px.x, 0.0)).a, texture2D(tMap, vUv - vec2(px.x, 0.0)).a),
                  max(texture2D(tMap, vUv + vec2(0.0, px.y)).a, texture2D(tMap, vUv - vec2(0.0, px.y)).a));
    if (n < ${(A_FLOOR * 0.5).toFixed(3)}) discard;
    /* the ink dilates the silhouette by a texel, which welds a distant school
       into one crust. Falling off faster than the fill keeps the outline hard
       where you can see the animal and lets it go where you cannot. */
    float iv = clamp((n - ${A_FLOOR.toFixed(2)}) / ${(1 - A_FLOOR).toFixed(2)}, 0.0, 1.0);
    gl_FragColor = vec4(uInk, iv * iv * iv);
    return;
  }
  float L = uLevels - 1.0;
  vec3 c = floor(s.rgb * L + b8(floor(vUv * uRT))) / L;
  gl_FragColor = vec4(c, clamp((s.a - ${A_FLOOR.toFixed(2)}) / ${(1 - A_FLOOR).toFixed(2)}, 0.0, 1.0));
}`;

const PT_VS = `
attribute vec3 tint; attribute float sz; attribute float st;
uniform float uH, uNear, uFar, uPx;
varying vec3 vC; varying float vA;
void main(){
  if (st < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; vC = tint; return; }
  vC = st > 1.5 ? mix(tint, vec3(0.95, 1.0, 0.98), 0.75) : tint;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = -mv.z;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(sz * uH / max(1.0, d), 1.0, 26.0) * uPx;
  vA = smoothstep(uNear * 0.55, uNear * 1.6, d) * (1.0 - smoothstep(uFar * 0.55, uFar, d));
}`;
const PT_FS = `
precision mediump float;
varying vec3 vC; varying float vA;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float m = 1.0 - smoothstep(0.30, 0.5, length(q));
  if (m * vA < 0.02) discard;
  gl_FragColor = vec4(vC, m * vA);
}`;

const HAZE_VS = `
attribute vec3 tint; attribute float sz; attribute float amt;
uniform float uH, uFrom, uPx;
varying vec3 vC; varying float vA;
void main(){
  vC = tint;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = -mv.z;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(sz * uH / max(1.0, d), 2.0, 1400.0) * uPx;
  vA = amt * smoothstep(uFrom * 0.5, uFrom * 1.9, d) * (1.0 - smoothstep(2400.0, 3800.0, d));
}`;
const HAZE_FS = `
precision mediump float;
varying vec3 vC; varying float vA;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float m = 1.0 - smoothstep(0.0, 0.5, length(q));
  gl_FragColor = vec4(vC, m * m * vA * 0.46);
}`;

const SNOW_VS = `
uniform float uH, uPx;
varying float vA;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = -mv.z;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(0.10 * uH / max(0.5, d), 1.0, 5.0) * uPx;
  vA = (1.0 - smoothstep(4.0, 70.0, d)) * 0.5;
}`;
const SNOW_FS = `
precision mediump float; varying float vA;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  if (length(q) > 0.5) discard;
  gl_FragColor = vec4(0.86, 0.94, 0.97, vA);
}`;

const SURF_VS = `varying vec3 vW; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const SURF_FS = `
precision highp float;
uniform float uTime; uniform vec3 uWater; uniform vec3 uSun;
varying vec3 vW;
float h21(vec2 p){ p = fract(p*vec2(127.1,311.7)); p += dot(p,p+34.5); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
void main(){
  vec2 p = vW.xz * 0.014;
  float c = vn(p + vec2(uTime*0.05, uTime*0.03)) * 0.6 + vn(p*2.1 - vec2(uTime*0.04,0.0)) * 0.4;
  float caustic = smoothstep(0.52, 0.78, c);
  float sun = 1.0 - smoothstep(120.0, 900.0, length(vW.xz - uSun.xz));
  vec3 col = mix(uWater, vec3(0.72,0.90,0.96), caustic * 0.75 + sun * 0.35);
  float d = 1.0 - smoothstep(300.0, 1900.0, length(vW.xz - cameraPosition.xz));
  gl_FragColor = vec4(col, clamp(d, 0.0, 1.0) * 0.85);
}`;
const RAY_VS = `varying vec2 vUv; varying vec3 vW;
void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp; }`;
const RAY_FS = `
precision mediump float;
uniform float uTime, uSeed; varying vec2 vUv; varying vec3 vW;
void main(){
  float body = smoothstep(0.0, 0.35, vUv.x) * (1.0 - smoothstep(0.62, 1.0, vUv.x));
  float fall = 1.0 - smoothstep(0.0, 0.9, vUv.y);
  float flick = 0.72 + 0.28 * sin(uTime * 0.6 + uSeed + vUv.x * 7.0);
  float near = 1.0 - smoothstep(700.0, 2800.0, length(vW.xz - cameraPosition.xz));
  gl_FragColor = vec4(0.66, 0.88, 0.96, body * fall * flick * near * 0.13);
}`;

/* --- the one thing in the ocean that is not a file ----------------------
   Kelp and his raft are hand-modelled rather than instanced, so they get
   their own pair of shaders: a plain model matrix instead of the fish's
   instanceMatrix, and a palette indexed by the same `part` attribute the
   fish use for eyes and lures. They still render into the fish target, so
   the dither and the silhouette ink land on them exactly as they land on a
   herring -- which is the only reason he looks like he lives here. */
const GUIDE_VS = `
attribute float part;
varying vec3 vN, vW; varying float vPart;
void main(){
  vPart = part;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const GUIDE_FS = `
precision highp float;
uniform vec3 uWater; uniform float uFog, uTime, uFade, uDeck;
varying vec3 vN, vW; varying float vPart;
void main(){
  vec3 alb; float unlit = 0.0, glow = 0.0;
  if (vPart < 0.5)      alb = vec3(0.64, 0.45, 0.28);              // fur
  else if (vPart < 1.5) alb = vec3(0.96, 0.90, 0.76);              // muzzle, belly, ears
  else if (vPart < 2.5) { alb = vec3(0.99, 0.99, 0.97); unlit = 1.0; }  // eye white, glint
  else if (vPart < 3.5) { alb = vec3(0.10, 0.08, 0.09); unlit = 1.0; }  // pupil, nose, mouth
  else if (vPart < 4.5) { glow = 1.0;                              // the lantern
    alb = vec3(1.00, 0.86, 0.58) * (1.0 + 0.16 * sin(uTime * 2.4) + 0.07 * sin(uTime * 7.3)); }
  else if (vPart < 5.5) alb = vec3(0.55, 0.39, 0.24);              // deck plank
  else if (vPart < 6.5) alb = vec3(0.30, 0.21, 0.14);              // piling, batten, rail
  else if (vPart < 7.5) { alb = vec3(0.95, 0.58, 0.50); unlit = 1.0; }  // cheeks
  else if (vPart < 8.5) alb = vec3(0.12, 0.40, 0.44);              // diver suit
  else if (vPart < 9.5) alb = vec3(0.76, 0.48, 0.31);              // diver skin
  else if (vPart < 10.5) alb = vec3(0.10, 0.075, 0.08);            // diver hair
  else if (vPart < 11.5) { alb = vec3(0.48, 0.82, 0.88); unlit = 1.0; } // mask glass
  else                  alb = vec3(0.95, 0.48, 0.30);              // fins and trim
  vec3 col = alb;
  if (unlit + glow < 0.5) {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vW);
    if (dot(N, V) < 0.0) N = -N;                 // the mirrored arm, and flat boards
    float k = dot(N, normalize(vec3(0.18, 0.95, 0.32))) * 0.5 + 0.5;
    /* three shallow bands. A villager is a flat colour with one shadow on it;
       the fish next door get four hard ones over twice the range, and that
       difference is the whole reason he does not look like tackle */
    float band = floor(clamp(k, 0.0, 0.999) * 3.0) / 2.0;
    col = alb * (0.74 + 0.34 * band);
  }
  float f = clamp(1.0 - exp(-length(cameraPosition - vW) * uFog), 0.0, 1.0);
  col = mix(col, uWater, f * mix(0.5, 0.08, glow));
  float vis = (1.0 - f * (1.0 - glow * 0.7)) * uFade;
  /* the pilings do not end, they stop being visible: everything far enough
     below the deck dissolves, so the platform rises out of the dark instead
     of dangling from something */
  float deep = clamp((uDeck - vW.y) / 12.0, 0.0, 1.0);
  deep *= 1.0 - step(7.5, vPart);                 // the diver is not part of the pier
  col = mix(col, uWater, deep * 0.7);
  vis *= 1.0 - deep * deep;
  gl_FragColor = vec4(col, ${A_FLOOR.toFixed(2)} + ${(1 - A_FLOOR).toFixed(2)} * vis);
}`;

/* ============================================================ scene */
const canvas = $("#gl");
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setClearColor(0x04121a, 1);
renderer.autoClear = false;                  // the composite must not wipe the water
const scene = new Scene();                   // the water: surface, rays, haze, points, snow
const fishScene = new Scene();               // the animals, and only the animals
const camera = new PerspectiveCamera(58, 1, 0.5, 4200);

const WATER_TOP = new Color(0x2b7f9e), WATER_DEEP = new Color(0x02060c);
const waterAt = y => WATER_TOP.clone().lerp(WATER_DEEP,
  Math.pow(clamp(-y / (DEPTH * 1.05), 0, 1), 0.92));
const water = new Color();

const fishMat = new ShaderMaterial({
  vertexShader: FISH_VS, fragmentShader: FISH_FS,
  uniforms: {
    uWater: { value: water }, uFog: { value: TUNE.fogNear },
    uFar: { value: TUNE.meshFar }, uFarBig: { value: TUNE.meshFarBig },
    uFogBig: { value: TUNE.fogBig }, uTime: { value: 0 },
  },
  side: DoubleSide,
});

/* --- the dither + ink stage --------------------------------------------
   The main app stacks two canvases: raw GLSL sea under a three.js fish layer
   that gets the post pass. Same split here, one renderer: the water goes
   straight to the screen, the fish go to a low-res target and are composited
   back over it through POST_FRAG with nearest-neighbour upscaling. The soft
   volumetric water is the other half of the art direction and dithering it
   would wreck it. */
const fishRT = new WebGLRenderTarget(4, 4, { minFilter: NearestFilter, magFilter: NearestFilter });
const postScene = new Scene();
const postCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postMat = new ShaderMaterial({
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
  fragmentShader: POST_FRAG, transparent: true, depthTest: false, depthWrite: false,
  uniforms: {
    tMap: { value: fishRT.texture }, uRT: { value: new Vector2(1, 1) },
    uLevels: { value: 5 }, uInk: { value: new Color(0x0b1012) },
  },
});
const POST_VS = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
{
  const q = new Mesh(new PlaneGeometry(2, 2), postMat);
  q.frustumCulled = false;
  postScene.add(q);
}
/* Kelp gets his own target and his own composite of the very same pass, only
   turned down: he is a face a metre from yours, not a school seen through
   forty metres of water, so he is diced finer and quantised further. A
   character wearing the school's dither reads as noise on his cheek. */
const guideRT = new WebGLRenderTarget(4, 4, { minFilter: NearestFilter, magFilter: NearestFilter });
const guidePostMat = new ShaderMaterial({
  vertexShader: POST_VS, fragmentShader: POST_FRAG,
  transparent: true, depthTest: false, depthWrite: false,
  uniforms: {
    tMap: { value: guideRT.texture }, uRT: { value: new Vector2(1, 1) },
    uLevels: { value: 9 }, uInk: { value: new Color(0x0b1012) },
  },
});
const guideScene = new Scene(), guidePostScene = new Scene();
{
  const q = new Mesh(new PlaneGeometry(2, 2), guidePostMat);
  q.frustumCulled = false;
  guidePostScene.add(q);
}
const pointMat = new ShaderMaterial({
  vertexShader: PT_VS, fragmentShader: PT_FS, transparent: true, depthWrite: false,
  uniforms: {
    uH: { value: 800 }, uPx: { value: 1 },
    uNear: { value: TUNE.pointNear }, uFar: { value: TUNE.pointFar },
  },
});
const hazeMat = new ShaderMaterial({
  vertexShader: HAZE_VS, fragmentShader: HAZE_FS, transparent: true,
  depthWrite: false, blending: AdditiveBlending,
  uniforms: { uH: { value: 800 }, uPx: { value: 1 }, uFrom: { value: TUNE.hazeFrom } },
});
const snowMat = new ShaderMaterial({
  vertexShader: SNOW_VS, fragmentShader: SNOW_FS, transparent: true, depthWrite: false,
  uniforms: { uH: { value: 800 }, uPx: { value: 1 } },
});

/* --- marine snow: the cheapest possible sense of scale and motion -------- */
const snowPos = new Float32Array(TUNE.snow * 3);
{
  const r = mulberry32(0x5e1f2a);
  for (let i = 0; i < TUNE.snow; i++) {
    snowPos[i * 3] = (r() - 0.5) * 90;
    snowPos[i * 3 + 1] = (r() - 0.5) * 90;
    snowPos[i * 3 + 2] = (r() - 0.5) * 90;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(snowPos), 3));
  var snow = new Points(g, snowMat);
  snow.frustumCulled = false;
  scene.add(snow);
}

/* --- surface and light shafts ------------------------------------------- */
const SUN = new Vector3(-260, 0, -420);
const surfMat = new ShaderMaterial({
  vertexShader: SURF_VS, fragmentShader: SURF_FS, transparent: true, side: DoubleSide,
  depthWrite: false,
  uniforms: { uTime: { value: 0 }, uWater: { value: new Color(0x1d6f8c) }, uSun: { value: SUN } },
});
{
  const plane = new Mesh(new PlaneGeometry(5200, 5200, 1, 1), surfMat);
  plane.rotation.x = Math.PI / 2;
  plane.position.y = 0.5;
  plane.frustumCulled = false;
  scene.add(plane);
}
const rayMats = [];
{
  const r = mulberry32(0xd00d);
  for (let i = 0; i < 9; i++) {
    const w = 60 + r() * 150, h = 420 + r() * 340;
    const m = new ShaderMaterial({
      vertexShader: RAY_VS, fragmentShader: RAY_FS, transparent: true, depthWrite: false,
      blending: AdditiveBlending, side: DoubleSide,
      uniforms: { uTime: { value: 0 }, uSeed: { value: r() * 10 } },
    });
    const q = new Mesh(new PlaneGeometry(w, h, 1, 1), m);
    const th = r() * TAU, rad = r() * 700;
    q.position.set(SUN.x + Math.cos(th) * rad, -h / 2 + 10, SUN.z + Math.sin(th) * rad);
    q.rotation.y = r() * TAU;
    q.rotation.z = (r() - 0.5) * 0.24;
    q.frustumCulled = false;
    scene.add(q);
    rayMats.push(m);
  }
}

/* ============================================================ kelp
   An otter on a moored raft, thirteen metres down, who talks you in.

   He is hand-modelled out of loose triangles for the same reason the fish
   are: `computeVertexNormals` on a non-indexed mesh gives hard facets, and
   the ink pass wants a silhouette rather than a smooth shape. Winding is
   deliberately not fussed over -- the shader flips a normal that faces away
   and the material is DoubleSide, so a backwards quad shades correctly
   anyway. */
const FUR = 0, CREAM = 1, WHITE = 2, INK = 3, LAMP = 4, PLANK = 5, POST = 6, BLUSH = 7;
const SUIT = 8, SKIN = 9, HAIR = 10, GLASS = 11, CORAL = 12;

function kit() {
  const v = [], p = [];
  const tri = (a, b, c, k) => {
    v.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    p.push(k, k, k);
  };
  const quad = (a, b, c, d, k) => { tri(a, b, c, k); tri(a, c, d, k); };
  const K = {
    box(x, y, z, w, h, d, k) {
      const X = w / 2, Y = h / 2, Z = d / 2;
      const c = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
                 [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]
        .map(q => [x + q[0] * X, y + q[1] * Y, z + q[2] * Z]);
      for (const f of [[4, 5, 6, 7], [1, 0, 3, 2], [5, 1, 2, 6],
                       [0, 4, 7, 3], [3, 7, 6, 2], [4, 0, 1, 5]])
        quad(c[f[0]], c[f[1]], c[f[2]], c[f[3]], k);
      return K;
    },
    /* a coarse UV sphere -- everything soft on him is one of these squashed */
    ball(x, y, z, rx, ry, rz, k, seg, ring) {
      const S = seg || 8, R = ring || 5;
      const at = (i, j) => {
        const ph = (j / R) * Math.PI, th = (i / S) * TAU, s = Math.sin(ph);
        return [x + rx * s * Math.cos(th), y + ry * Math.cos(ph), z + rz * s * Math.sin(th)];
      };
      for (let j = 0; j < R; j++) for (let i = 0; i < S; i++) {
        const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
        if (j === 0) tri(a, c, d, k);                 // the poles are fans
        else if (j === R - 1) tri(a, b, c, k);
        else quad(a, b, c, d, k);
      }
      return K;
    },
    /* a tapered prism between two points: limbs, posts, rope, tail */
    tube(a, b, r0, r1, k, seg) {
      const S = seg || 6;
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const L = Math.hypot(d[0], d[1], d[2]) || 1;
      const n = [d[0] / L, d[1] / L, d[2] / L];
      const t = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      const u = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]];
      const ul = Math.hypot(u[0], u[1], u[2]) || 1;
      u[0] /= ul; u[1] /= ul; u[2] /= ul;
      const w = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
      const rim = (c, r, i) => {
        const th = (i / S) * TAU, cs = Math.cos(th), sn = Math.sin(th);
        return [c[0] + r * (u[0] * cs + w[0] * sn),
                c[1] + r * (u[1] * cs + w[1] * sn),
                c[2] + r * (u[2] * cs + w[2] * sn)];
      };
      for (let i = 0; i < S; i++) {
        const p0 = rim(a, r0, i), p1 = rim(a, r0, i + 1);
        const q0 = rim(b, r1, i), q1 = rim(b, r1, i + 1);
        quad(p0, p1, q1, q0, k);
        tri(a, p1, p0, k); tri(b, q0, q1, k);
      }
      return K;
    },
    geo() {
      const g = new BufferGeometry();
      g.setAttribute("position", new BufferAttribute(new Float32Array(v), 3));
      g.setAttribute("part", new BufferAttribute(new Float32Array(p), 1));
      g.computeVertexNormals();
      return g;
    },
  };
  return K;
}

const guideMat = new ShaderMaterial({
  vertexShader: GUIDE_VS, fragmentShader: GUIDE_FS,
  uniforms: {
    uWater: { value: water }, uFog: { value: TUNE.fogNear },
    uTime: { value: 0 }, uFade: { value: 1 }, uDeck: { value: 0 },
  },
  side: DoubleSide,
});

function buildGuide() {
  const M = g => new Mesh(g, guideMat);
  const root = new Object3D();

  /* --- the pier ----------------------------------------------------------
     Four pilings rising out of the dark, braced, with a deck on top. They do
     not end anywhere: the shader dissolves them twelve metres down, which is
     what makes the platform read as standing on the deep rather than hanging
     from something above it. */
  const r = kit();
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    r.tube([sx * 0.86, 0.02, sz * 0.68], [sx * 1.42, -24, sz * 1.12], 0.15, 0.30, POST, 7);
  for (const sz of [-1, 1]) {                            // cross braces
    r.tube([-0.94, -1.55, sz * 0.77], [0.94, -1.55, sz * 0.77], 0.065, 0.065, POST, 5);
    r.tube([-0.94, -2.35, sz * 0.83], [0.94, -0.95, sz * 0.72], 0.05, 0.05, POST, 4);
    r.tube([0.94, -2.35, sz * 0.83], [-0.94, -0.95, sz * 0.72], 0.05, 0.05, POST, 4);
  }
  /* the deck, with a short approach behind Kelp so the intro is a place the
     protagonist can actually walk through rather than a model-sized plinth */
  r.box(0, -0.09, 0, 2.34, 0.18, 1.94, PLANK);
  r.box(0, -0.09, 2.02, 2.34, 0.18, 2.18, PLANK);
  for (const x of [-0.88, -0.30, 0.30, 0.88]) {          // the plank lines
    r.box(x, 0.016, 0, 0.05, 0.05, 1.94, POST);
    r.box(x, 0.016, 2.02, 0.05, 0.05, 2.18, POST);
  }
  r.box(0, -0.25, -0.88, 2.34, 0.14, 0.18, POST);
  r.box(0, -0.25, 3.02, 2.34, 0.14, 0.18, POST);
  r.box(1.08, -0.25, 1.08, 0.18, 0.14, 4.08, POST);
  r.box(-1.08, -0.25, 1.08, 0.18, 0.14, 4.08, POST);
  for (const x of [-1.02, 1.02]) r.tube([x, 0, -0.84], [x, 0.74, -0.84], 0.075, 0.06, POST, 6);
  r.box(0, 0.68, -0.84, 2.14, 0.09, 0.09, POST);
  /* the lamp stands out on the near corner, well to his left: close enough to
     put a warm edge on the deck, far enough not to be in front of him */
  r.tube([-0.95, 0, 0.58], [-0.95, 1.42, 0.58], 0.058, 0.046, POST, 6);
  r.box(-0.95, 1.45, 0.58, 0.30, 0.07, 0.30, POST);
  r.box(-0.95, 1.03, 0.58, 0.24, 0.06, 0.24, POST);
  for (const s of [-1, 1])
    r.tube([-0.95 + s * 0.11, 1.05, 0.58], [-0.95 + s * 0.11, 1.43, 0.58], 0.018, 0.018, POST, 4);
  r.ball(-0.95, 1.23, 0.58, 0.10, 0.12, 0.10, LAMP, 7, 4);
  root.add(M(r.geo()));

  /* --- the otter ---------------------------------------------------------
     Villager proportions: the head is half of him, the body is an egg, and
     the limbs are stubs. */
  const b = kit();
  b.ball(0, 0.55, 0, 0.40, 0.38, 0.34, FUR, 13, 8);
  b.ball(0, 0.50, 0.19, 0.26, 0.28, 0.20, CREAM, 11, 7);
  for (const s of [-1, 1]) b.ball(s * 0.19, 0.07, 0.05, 0.145, 0.075, 0.20, FUR, 9, 5);
  /* the tail is the part that says otter rather than bear */
  b.tube([0, 0.44, -0.26], [0, 0.20, -0.70], 0.19, 0.12, FUR, 8);
  b.tube([0, 0.20, -0.70], [0, 0.09, -1.08], 0.12, 0.04, FUR, 8);

  const h = kit();                                    // local origin: the neck
  h.ball(0, 0.44, 0.02, 0.48, 0.45, 0.46, FUR, 15, 9);
  h.ball(0, 0.28, 0.38, 0.28, 0.20, 0.20, CREAM, 11, 7);
  h.ball(0, 0.335, 0.545, 0.075, 0.058, 0.055, INK, 8, 5);
  for (const s of [-1, 1]) {
    /* big eye, bigger pupil, one glint high on the outside -- the glint is
       most of what separates a villager's eye from a doll's */
    h.ball(s * 0.21, 0.46, 0.395, 0.115, 0.135, 0.075, WHITE, 11, 7);
    h.ball(s * 0.215, 0.455, 0.435, 0.078, 0.098, 0.052, INK, 9, 6);
    h.ball(s * 0.245, 0.505, 0.462, 0.032, 0.034, 0.026, WHITE, 7, 4);
    h.ball(s * 0.335, 0.315, 0.315, 0.098, 0.072, 0.05, BLUSH, 9, 5);
    h.ball(s * 0.375, 0.66, -0.02, 0.14, 0.125, 0.085, FUR, 9, 5);
    h.ball(s * 0.39, 0.66, 0.02, 0.08, 0.068, 0.055, CREAM, 7, 4);
  }
  const m = kit().ball(0, 0, 0, 0.062, 0.04, 0.05, INK, 8, 5);
  const a = kit();                                    // local origin: the shoulder
  a.tube([0, 0, 0], [0.09, -0.26, 0.05], 0.125, 0.112, FUR, 8);
  a.ball(0.10, -0.30, 0.06, 0.115, 0.11, 0.115, CREAM, 9, 6);

  const kelp = new Object3D();
  kelp.position.set(0.16, 0, 0.10);
  kelp.add(M(b.geo()));
  const head = new Object3D();
  head.position.set(0, 0.86, 0);
  head.add(M(h.geo()));
  const mouth = M(m.geo());
  mouth.position.set(0, 0.16, 0.555);
  head.add(mouth);
  kelp.add(head);
  /* one arm geometry, worn on both sides. scale.x = -1 sits inside the local
     matrix's S, so the node's own rotation still happens in mirror-world and
     a left arm is a right arm with the sign of its angle flipped. */
  const armGeo = a.geo();
  const armR = new Object3D(), armL = new Object3D();
  armR.position.set(0.40, 0.64, 0.03);
  armL.position.set(-0.40, 0.64, 0.03);
  armL.scale.x = -1;
  armR.add(M(armGeo)); armL.add(M(armGeo));
  kelp.add(armR); kelp.add(armL);
  root.add(kelp);

  root.visible = false;
  guideScene.add(root);
  return { root, kelp, head, mouth, armR, armL };
}
const guide = buildGuide();

/* A small procedural diver, built out of the same coarse kit as Kelp and sent
   through his finer dither/ink target. The transform is the player: the camera
   follows it rather than standing in for it. Dock/jump/ocean phase ownership is
   deliberately left to the flow layer. */
function buildPlayer() {
  const M = g => new Mesh(g, guideMat);
  const root = new Object3D();
  root.rotation.order = "YXZ";

  const body = kit();
  body.ball(0, 0.52, 0, 0.31, 0.47, 0.22, SUIT, 9, 6);
  body.box(0, 0.56, 0.25, 0.36, 0.48, 0.16, HAIR);       // air tank
  body.box(0, 0.44, 0.345, 0.13, 0.29, 0.07, CORAL);    // tank stripe
  root.add(M(body.geo()));

  const head = kit();
  head.ball(0, 1.10, 0, 0.27, 0.29, 0.25, SKIN, 10, 7);
  head.ball(0, 1.19, 0.04, 0.28, 0.22, 0.25, HAIR, 9, 5);
  head.box(0, 1.10, -0.235, 0.38, 0.14, 0.055, GLASS);
  head.box(0, 1.01, -0.26, 0.10, 0.09, 0.07, HAIR);
  root.add(M(head.geo()));

  const limb = kit();
  limb.tube([0, 0, 0], [0.10, -0.58, 0], 0.105, 0.075, SUIT, 6);
  limb.ball(0.11, -0.63, 0, 0.095, 0.105, 0.08, SKIN, 7, 5);
  const armGeo = limb.geo(), armR = new Object3D(), armL = new Object3D();
  armR.position.set(0.29, 0.80, 0); armL.position.set(-0.29, 0.80, 0);
  armL.scale.x = -1;
  armR.add(M(armGeo)); armL.add(M(armGeo));
  root.add(armR, armL);

  const kick = kit();
  kick.tube([0, 0, 0], [0, -0.62, 0], 0.13, 0.09, SUIT, 7);
  kick.box(0, -0.78, -0.05, 0.23, 0.42, 0.075, CORAL);
  const legGeo = kick.geo(), legR = new Object3D(), legL = new Object3D();
  legR.position.set(0.16, 0.16, 0); legL.position.set(-0.16, 0.16, 0);
  legL.scale.x = -1;
  legR.add(M(legGeo)); legL.add(M(legGeo));
  root.add(legR, legL);

  root.visible = false;
  guideScene.add(root);
  return { root, armR, armL, legR, legL, vel: new Vector3() };
}
const player = buildPlayer();

/* Three phases are enough: walk and talk on the dock, one deterministic water
   crossing, then the existing ocean controller. ?demo keeps its direct-ocean
   shortcut for tuning and screenshots. */
const AUTO_DEMO = /[?&]demo\b/.test(location.search);
const DOCK_Y = 1.0, GUIDE_Y = -13;
let phase = AUTO_DEMO ? "ocean" : "dock";
let jump = null;
guide.root.position.set(0, phase === "dock" ? DOCK_Y : GUIDE_Y, 0);

/* ============================================================ the world
   Everything that depends on the file set. Rebuilt wholesale when a new
   folder is opened, so opening a second drive is not a reload. */
const ARCH_GEO = ARCH.map(archGeometry);
/* Each archetype gets a buffer that could hold the entire budget, because a
   folder really can be one species -- ten thousand empty .gitkeep files are
   ten thousand Ghost Minnows. Fifteen archetypes x 1400 x (16+3+2) floats is
   about 1.8 MB of instance buffer, and only the used prefix is ever uploaded. */
const CAP = TUNE.meshBudget;
let world = null;

function setWorldVisible(visible) {
  if (!world) return;
  world.points.visible = visible;
  world.haze.visible = visible;
  for (const mesh of world.insts) mesh.visible = visible;
}

function disposeWorld() {
  if (!world) return;
  scene.remove(world.points, world.haze);
  fishScene.remove(...world.insts);
  world.points.geometry.dispose();
  world.haze.geometry.dispose();
  for (const m of world.insts) m.dispose();
  world = null;
}

function buildWorld(files, label) {
  disposeWorld();

  /* Fit the water column to the drive's own weight range, and the bleach to
     its own age range.

     The two fits are NOT the same shape, and getting that wrong is what a p99
     on both ends buys you: the top 1% of a drive by size is the entire reason
     to look at it, and clipping it stacks every video, disc image and backup
     into one indistinguishable pancake on the floor. Ages need the trim
     because one file from 1998 stretches the axis by a decade; sizes do not,
     because log2 has already done the compressing -- one stray 90 GB image
     only ever costs a few doublings of empty water, and empty water at the
     bottom is itself the true statement that nothing else comes close.
     So: trimmed at the shallow end, honest to the largest file at the deep. */
  const pct = (arr, q) => arr[clamp(Math.floor(arr.length * q), 0, arr.length - 1)];
  const lbs = files.map(f => clamp(Math.log2(f.size + 1), 0, 38)).sort((a, b) => a - b);
  LB_LO = lbs.length ? pct(lbs, 0.02) : 0;
  LB_HI = lbs.length ? lbs[lbs.length - 1] : 38;
  /* a folder of files that are all one size is still an ocean, not a plate:
     hold the column open to at least six doublings and centre it on the data */
  if (LB_HI - LB_LO < 6) {
    const mid = (LB_HI + LB_LO) / 2;
    LB_LO = Math.max(0, mid - 3); LB_HI = LB_LO + 6;
  }
  const ages = files.map(f => f.ageDays).sort((a, b) => a - b);
  AGE_LO = ages.length ? Math.max(0, pct(ages, 0.01)) : 0;
  AGE_HI = ages.length ? pct(ages, 0.99) : 3650;
  if (AGE_HI - AGE_LO < 0.02) AGE_HI = AGE_LO + 0.02;   // a folder written in one go

  const root = toPlaces(buildTree(files));
  packRadius(root);
  const places = [];
  placeWorld(root, 0, 0, places);
  /* scale for constant density rather than to a constant radius: a thousand
     files stretched across the same field as fifty thousand is just an empty
     sea. Density is measured in visual mass, the same currency the folder
     circles are packed in -- otherwise a drive full of leviathans would be
     normalised back down to a field its own animals do not fit in.
     TUNE.lateral is the radius at the reference size. */
  let totalMass = 0;
  for (const f of files) totalMass += footprint(f.size);
  const radius = clamp(TUNE.lateral * Math.sqrt(totalMass / 52000), 260, 1800);
  DEPTH = clamp(TUNE.depth * (radius / TUNE.lateral), 330, 1400);
  const k = radius / Math.max(1, root.r);
  for (const p of places) { p.cx *= k; p.cz *= k; p.r *= k; }
  layout(places);

  /* --- points: every file, always --------------------------------------- */
  const n = files.length;
  const pos = new Float32Array(n * 3), tint = new Float32Array(n * 3);
  const sz = new Float32Array(n), st = new Float32Array(n);
  files.forEach((f, i) => {
    f.index = i;
    pos[i * 3] = f.x; pos[i * 3 + 1] = f.y; pos[i * 3 + 2] = f.z;
    tint[i * 3] = f.cr; tint[i * 3 + 1] = f.cg; tint[i * 3 + 2] = f.cb;
    sz[i] = f.scale; st[i] = 1;
  });
  const pg = new BufferGeometry();
  pg.setAttribute("position", new BufferAttribute(pos, 3));
  pg.setAttribute("tint", new BufferAttribute(tint, 3));
  pg.setAttribute("sz", new BufferAttribute(sz, 1));
  pg.setAttribute("st", new BufferAttribute(st, 1));
  const points = new Points(pg, pointMat);
  points.frustumCulled = false;
  scene.add(points);

  /* --- haze: puffs per folder per depth bin ------------------------------ */
  const binH = DEPTH / 38;
  const allBins = [];
  for (const p of places) {
    if (!p.files.length) continue;
    const bins = new Map();
    for (const f of p.files) {
      const b = Math.round(f.y / binH);
      let e = bins.get(b);
      if (!e) bins.set(b, e = { p, y: 0, n: 0, r: 0, g: 0, bl: 0 });
      e.y += f.y; e.n++;
      /* the nebula bleaches too, so a folder you abandoned reads as grey from
         four hundred metres away -- which is where you actually see it from */
      const c = hazeColor[f.fam], w = 1 - TUNE.bleach * 0.62 * f.fade, m = 0.36 * f.fade;
      e.r += c.r * w + m; e.g += c.g * w + m; e.bl += c.b * w + m;
    }
    for (const e of bins.values()) if (e.n >= 3) allBins.push(e);
  }
  /* brightness is relative to how crowded this drive's bins actually are, so a
     thousand-file folder is as legible as a hundred-thousand-file one */
  const pops = allBins.map(e => e.n).sort((a, b) => a - b);
  const ref = Math.max(4, pops.length ? pops[Math.floor(pops.length * 0.80)] : 40);
  const puffs = [];
  for (const e of allBins) {
    const p = e.p;
    const jr = mulberry32(fnv1a(p.name + "haze" + Math.round(e.y)));
    const dens = clamp(Math.sqrt(e.n / ref), 0.20, 1.15);
    const kk = Math.min(4, 1 + ((e.n / (ref * 0.9)) | 0));
    const y0 = e.y / e.n;
    for (let i = 0; i < kk; i++) {
      const th = jr() * TAU, rad = Math.sqrt(jr()) * p.r * 0.5;
      puffs.push({
        x: p.cx + Math.cos(th) * rad, y: y0 + (jr() - 0.5) * binH * 1.25, z: p.cz + Math.sin(th) * rad,
        r: e.r / e.n, g: e.g / e.n, b: e.bl / e.n,
        sz: Math.max(radius * 0.06, p.r * 1.5), a: dens / kk,
      });
    }
  }
  const hn = puffs.length;
  const hpos = new Float32Array(hn * 3), htint = new Float32Array(hn * 3);
  const hsz = new Float32Array(hn), hamt = new Float32Array(hn);
  puffs.forEach((q, i) => {
    hpos[i * 3] = q.x; hpos[i * 3 + 1] = q.y; hpos[i * 3 + 2] = q.z;
    htint[i * 3] = q.r; htint[i * 3 + 1] = q.g; htint[i * 3 + 2] = q.b;
    hsz[i] = q.sz; hamt[i] = q.a;
  });
  const hg = new BufferGeometry();
  hg.setAttribute("position", new BufferAttribute(hpos, 3));
  hg.setAttribute("tint", new BufferAttribute(htint, 3));
  hg.setAttribute("sz", new BufferAttribute(hsz, 1));
  hg.setAttribute("amt", new BufferAttribute(hamt, 1));
  const haze = new Points(hg, hazeMat);
  haze.frustumCulled = false;
  scene.add(haze);

  /* --- instanced fish ---------------------------------------------------- */
  const insts = ARCH.map((a, i) => {
    const mesh = new InstancedMesh(ARCH_GEO[i], fishMat, CAP);
    mesh.frustumCulled = false;
    mesh.count = 0;
    const ti = new Float32Array(CAP * 3);
    const attr = new InstancedBufferAttribute(ti, 3);
    attr.setUsage(35048);
    const pi = new Float32Array(CAP * 2);
    const pattr = new InstancedBufferAttribute(pi, 2);
    pattr.setUsage(35048);
    mesh.geometry = ARCH_GEO[i].clone();
    mesh.geometry.setAttribute("tint", attr);
    mesh.geometry.setAttribute("pat", pattr);
    mesh.userData.tint = ti;
    mesh.userData.pat = pi;
    mesh.userData.ids = new Int32Array(CAP);
    fishScene.add(mesh);
    return mesh;
  });

  /* --- spatial hash for the near set ------------------------------------- */
  const GRID = 64;
  const grid = new Map();
  const key = (x, y, z) =>
    (Math.floor(x / GRID) * 73856093 ^ Math.floor(y / GRID) * 19349663 ^ Math.floor(z / GRID) * 83492791);
  for (const f of files) {
    const kk = key(f.x, f.y, f.z);
    let c = grid.get(kk);
    if (!c) grid.set(kk, c = []);
    c.push(f);
  }

  /* the big animals are few and they are visible from much further away, so
     they get their own flat list rather than a grid search wide enough to
     reach them -- which at a whale's draw distance would be most of the ocean */
  const bigs = files.filter(f => f.scale >= TUNE.bigFrom);
  let maxScale = 0;
  for (const f of files) maxScale = Math.max(maxScale, f.scale);
  const reach = TUNE.meshFar + Math.max(0, maxScale - 1.5) * TUNE.meshFarBig;

  world = { files, places, points, haze, insts, grid, GRID, radius, bigs, reach,
            bytes: files.reduce((a, f) => a + f.size, 0) };
  net.clear(); syncNet();
  buildGauge();
  $("#s-files").textContent = fmtCount(files.length);
  $("#s-size").textContent = fmtBytes(world.bytes);
  $("#s-places").textContent = String(places.length);
  $("#s-src").textContent = label;
  /* arrive outside the field looking in, far enough back to see the whole
     drive at once. A young folder is a narrow, tall column, so the framing has
     to be driven by the depth of the water, not the width of the field. */
  const back = Math.max(radius * 1.8, DEPTH * 0.80) + 100;
  const eye = -DEPTH * 0.40;
  world.entry = { back, eye };
  nearSet = []; nearAt = 0;
  /* A scan may finish while the player is still standing on the dock. Move
     the entire dock/camera tableau together to its berth so nothing appears
     to snap, and keep the generated ocean hidden until the jump crosses it. */
  if (phase === "dock") {
    moorDock(back - 34);
    setWorldVisible(false);
  } else enterOceanAt(back, eye);
  guide.root.visible = true;
  lastChat = performance.now() + 4000;
  return world;
}

/* ============================================================ camera
   A DIVER, NOT A SUBMARINE -- and not a camera either.

   The old rule was two degrees of freedom: drift flat, sink on the wheel, look
   wherever you like. It kept you from getting lost or seasick, and it was
   almost unusable for the thing you actually want to do, which is go and look
   at one particular animal. Looking and going were separate mechanisms, so
   reaching a fish above you meant aiming at it, then *not* moving toward it,
   then finding its depth on a second control, then finding its column on a
   third. Three inputs to approach one object.

   So the rule is now one sentence: YOU SWIM WHERE YOU LOOK, AND THE WATER
   CARRIES YOU THE REST OF THE WAY.

     - Forward is your real gaze, pitch included. Look down at the deep and
       swim down into it. This is still not six degrees of freedom -- there is
       no roll, ever, the horizon cannot tilt, and pitch is clamped well short
       of vertical -- which is where the nausea actually lives. Every diving
       game on earth does this and none of them make anyone ill.
     - The head is nearly instant (lookDamp) and the body is heavy (damp).
       The old build damped both at 4.2, so the view lagged a quarter-second
       behind the mouse, which is most of why aiming felt like steering a bus.
     - The wheel is a dial with detents, not a throttle: let go and it settles
       on the nearest doubling of file size, so "the layer I am in" is an
       actual place you can return to rather than a number you hold by hand.
     - And space is the whole point. Look at something, press it, and you are
       carried there and set down alongside it. You should never have to fly
       accurately, because flying accurately is not a thing this is about. */
player.root.position.set(0, -190, TUNE.lateral * 1.72);
const cam = {
  /* pos/vel are aliases to the protagonist's logical transform. Keeping the
     familiar controller name makes every existing picker, glide and depth
     rule continue to use one authority while the visible body owns the pose. */
  pos: player.root.position,
  vel: player.vel,
  eye: new Vector3(0, -188, TUNE.lateral * 1.72 + TUNE.chaseBack),
  yaw: 0, pitch: -0.06, yawT: 0, pitchT: -0.06, depthT: -190,
};
const keys = new Set();
let dragging = false, lastX = 0, lastY = 0, moved = 0;
/* where the wheel last moved, so the dial can find its notch once you let go */
let wheelAt = 0;

/* the water carrying you somewhere: a creature to come alongside, or a berth
   to arrive at. Null the instant you take the controls back. */
let glide = null;
const SWIM_KEYS = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"];
const letGo = () => { glide = null; };

/* one notch of the dial is one doubling of file size, which is exactly one
   size band -- so settling always leaves you level with a single shoal */
const detent = y => clamp(sizeToY(Math.round(yToSize(y))), -DEPTH - 60, -2);
const forwardOf = (yaw, pitch) => {
  const cp = Math.cos(pitch);
  return new Vector3(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
};
const chaseWant = new Vector3(), chaseForward = new Vector3(), chaseRight = new Vector3();
function updateChaseCamera(dt, snap) {
  const cp = Math.cos(cam.pitch);
  chaseForward.set(-Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), -Math.cos(cam.yaw) * cp);
  chaseRight.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
  chaseWant.copy(cam.pos)
    .addScaledVector(chaseForward, -TUNE.chaseBack)
    .addScaledVector(chaseRight, TUNE.chaseSide);
  chaseWant.y += TUNE.chaseRise;
  if (snap) cam.eye.copy(chaseWant);
  else cam.eye.lerp(chaseWant, 1 - Math.exp(-dt * TUNE.chaseDamp));
}

/* ============================================================ player flow */
const DOCK_X = 0.78, DOCK_NEAR = -0.58, DOCK_FAR = 2.84;
const elAction = $("#action");
let actionLabel = "", introSeen = false;

function moorDock(z) {
  const oldX = guide.root.position.x, oldZ = guide.root.position.z;
  guide.root.position.set(0, DOCK_Y, z);
  if (phase === "dock") {
    cam.pos.x += guide.root.position.x - oldX;
    cam.pos.z += guide.root.position.z - oldZ;
    cam.pos.y = cam.depthT = DOCK_Y;
    updateChaseCamera(0, true);
  }
}
function enterOceanAt(back, eye) {
  phase = "ocean";
  document.body.classList.remove("dock", "jumping", "splash");
  setWorldVisible(true);
  cam.pos.set(0, eye, back);
  cam.depthT = eye; cam.yaw = cam.yawT = 0; cam.pitch = cam.pitchT = -0.03;
  cam.vel.set(0, 0, 0);
  guide.root.position.set(0, GUIDE_Y, back - 34);
  updateChaseCamera(0, true);
}
function stageDock() {
  phase = "dock";
  document.body.classList.add("dock");
  document.body.classList.remove("jumping");
  guide.root.position.set(0, DOCK_Y, 0);
  guide.root.rotation.set(0, 0, 0);
  guide.root.visible = true;
  cam.pos.set(-0.45, DOCK_Y, 2.45);
  cam.depthT = DOCK_Y; cam.yaw = cam.yawT = 0; cam.pitch = cam.pitchT = -0.10;
  cam.vel.set(0, 0, 0);
  player.root.visible = true;
  setWorldVisible(false);
  updateChaseCamera(0, true);
  elPlaceN.textContent = "the dock";
  elPlaceS.textContent = "walk over to kelp";
}
const nearKelp = () => phase === "dock" &&
  Math.hypot(cam.pos.x - guide.root.position.x - 0.16,
             cam.pos.z - guide.root.position.z - 0.10) < 2.65;
const atDockEdge = () => phase === "dock" && world &&
  cam.pos.z - guide.root.position.z < -0.32;
function syncAction() {
  let label = "";
  if (phase === "dock" && !talkMode) {
    if (atDockEdge()) label = "jump in";
    else if (nearKelp()) label = introSeen ? "talk to kelp" : "say hello to kelp";
  }
  if (label === actionLabel) return;
  actionLabel = label;
  elAction.hidden = !label;
  elAction.setAttribute("aria-label", label ? "Press E to " + label : "");
  elAction.querySelector("span").textContent = label;
}
function dockAction() {
  if (atDockEdge()) { beginJump(); return; }
  if (nearKelp()) { introSeen = true; openIntro(true); }
}
function beginJump() {
  if (phase !== "dock" || !world) return;
  audio();
  closeTalk();
  keys.clear(); cam.vel.set(0, 0, 0); glide = null;
  phase = "jump";
  document.body.classList.remove("dock");
  document.body.classList.add("jumping");
  jump = {
    at: performance.now(), from: cam.pos.clone(),
    to: new Vector3(guide.root.position.x, -6.5, guide.root.position.z - 4.2),
    splashed: false,
  };
  actionLabel = ""; elAction.hidden = true;
}
function stepJump(nowMs) {
  if (!jump) return;
  const u = clamp((nowMs - jump.at) / 1250, 0, 1);
  const e = u * u * (3 - 2 * u);
  cam.pos.lerpVectors(jump.from, jump.to, e);
  cam.pos.y += Math.sin(u * Math.PI) * 2.8;
  cam.depthT = cam.pos.y;
  cam.yawT = nearestYaw(0, cam.yaw);
  cam.pitchT = lerp(-0.10, -0.42, e);
  if (!jump.splashed && cam.pos.y < 0.5) {
    jump.splashed = true;
    guide.root.position.y = GUIDE_Y;
    document.body.classList.add("splash");
    sfx("splash");
    setTimeout(() => document.body.classList.remove("splash"), 520);
  }
  if (u < 1) return;
  phase = "ocean";
  jump = null;
  document.body.classList.remove("jumping", "dock");
  setWorldVisible(true);
  guide.root.position.y = GUIDE_Y;
  cam.depthT = cam.pos.y;
  cam.pitch = cam.pitchT = -0.18;
  cam.vel.set(0, 0, 0);
  updateChaseCamera(0, false);
  lastChat = performance.now() + 4000;
  elPlaceN.textContent = "the ocean";
  say("swim where you look");
}
elAction.addEventListener("click", dockAction);

/* yaw accumulates without bound as you drag, so an absolute heading has to be
   expressed in the turn you are already in or the view spins the long way */
const nearestYaw = (want, cur) =>
  cur + Math.atan2(Math.sin(want - cur), Math.cos(want - cur));

/* Carry me to that animal. The target is recomputed every frame from where it
   actually is this instant, so you chase it and pull alongside rather than
   arriving at a spot it left. */
function glideTo(f) {
  glide = { f, until: performance.now() + 9000 };
}
function glideBerth(x, y, z, yaw, pitch) {
  glide = { p: new Vector3(x, y, z), yaw, pitch, until: performance.now() + 9000 };
}
/* nothing in the crosshair: push off and coast, so the key is never dead */
function kick() {
  const d = forwardOf(cam.yaw, cam.pitch).multiplyScalar(150);
  glideBerth(cam.pos.x + d.x, clamp(cam.pos.y + d.y, -DEPTH - 60, -2), cam.pos.z + d.z,
             cam.yawT, cam.pitchT);
}

addEventListener("keydown", e => {
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.key === "Escape") { closeHaul(); return; }
  /* a sheet is open: it owns the keyboard, and swimming behind it is nonsense */
  if (!$("#haul").hidden || !$("#confirm").hidden) return;
  if (e.code === "Space" || /^Arrow/.test(e.code)) e.preventDefault();
  const k = e.key.toLowerCase();
  if (talkMode && (e.code === "Space" || e.key === "Enter" || (phase === "dock" && k === "e"))) {
    advance(); return;
  }
  keys.add(k);
  if (held()) return;                         // he is talking; stay put and listen
  if (phase === "dock") { if (k === "e") dockAction(); return; }
  if (phase === "jump") return;
  if (SWIM_KEYS.includes(k)) letGo();         // your hands are on it again
  /* look at something and be taken to it; look at nothing and push off */
  if (e.code === "Space") {
    if (aimed && !aimed.dead) glideTo(aimed); else kick();
  }
  if (k === "f") toKelp();
  if (k === "e") toggleNet();
});
addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
canvas.addEventListener("pointerdown", e => {
  dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointerup", e => {
  dragging = false;
  try { canvas.releasePointerCapture(e.pointerId); } catch (err) { }
  if (phase === "ocean" && moved < 5) toggleNet(); // a click, not a drag
});
canvas.addEventListener("pointermove", e => {
  if (!dragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  moved += Math.abs(dx) + Math.abs(dy);
  if (moved > 5) glide = null;              // turning your head is taking over
  cam.yawT -= dx * 0.0042;
  cam.pitchT = clamp(cam.pitchT - dy * 0.0035, -1.22, 1.22);
  lastX = e.clientX; lastY = e.clientY;
});
addEventListener("wheel", e => {
  e.preventDefault();
  if (held() || phase !== "ocean") return;
  letGo();
  cam.depthT = clamp(cam.depthT - e.deltaY * TUNE.wheelSpeed, -DEPTH - 60, -2);
  wheelAt = performance.now();
}, { passive: false });

/* ============================================================ near set */
let nearSet = [], nearAt = 0;
/* big fish earn their geometry from further away, or you stand in node_modules
   and the whole budget goes to dotfiles while a 20 GB video is a dot behind you */
const nearScore = c => c[0] / (0.4 + c[1].scale);
function rebuildNear() {
  if (!world) return;
  const R = TUNE.meshFar, G = world.GRID, cand = [];
  const cx = Math.floor(cam.pos.x / G), cy = Math.floor(cam.pos.y / G), cz = Math.floor(cam.pos.z / G);
  const span = Math.ceil(R / G);
  for (let i = -span; i <= span; i++)
    for (let j = -span; j <= span; j++)
      for (let k = -span; k <= span; k++) {
        const c = world.grid.get((cx + i) * 73856093 ^ (cy + j) * 19349663 ^ (cz + k) * 83492791);
        if (!c) continue;
        for (const f of c) {
          if (f.dead || f.scale >= TUNE.bigFrom) continue;   // the big ones come from world.bigs
          const d = Math.hypot(f.x - cam.pos.x, f.y - cam.pos.y, f.z - cam.pos.z);
          if (d < R) cand.push([d, f]);
        }
      }
  /* leviathans get a reserved slice of the budget: a whale that vanishes
     because you swam into a crowd is worse than a missing dotfile */
  const big = [];
  for (const f of world.bigs) {
    if (f.dead) continue;
    const d = Math.hypot(f.x - cam.pos.x, f.y - cam.pos.y, f.z - cam.pos.z);
    if (d < TUNE.meshFar + (f.scale - 1.5) * TUNE.meshFarBig) big.push([d, f]);
  }
  big.sort((a, b) => nearScore(a) - nearScore(b));
  const keep = big.slice(0, Math.floor(TUNE.meshBudget * 0.45));
  cand.sort((a, b) => nearScore(a) - nearScore(b));
  nearSet = keep.concat(cand.slice(0, TUNE.meshBudget - keep.length)).map(c => c[1]);
}

/* ============================================================ the net */
const net = new Set();
let canDelete = false;

function syncNet() {
  let bytes = 0;
  for (const f of net) bytes += f.size;
  $("#net-n").textContent = String(net.size);
  $("#net-b").textContent = net.size ? fmtBytes(bytes) : "";
  document.body.classList.toggle("hasnet", net.size > 0);
  $("#net-del").hidden = !canDelete;
  if (!net.size) closeHaul();          // an empty net has nothing to show you
}
function setState(f, v) {
  if (!world) return;
  const a = world.points.geometry.attributes.st;
  a.array[f.index] = v;
  a.needsUpdate = true;
}
function toggleNet() {
  if (talkMode || !aimed || aimed.dead) return;
  if (net.has(aimed)) { net.delete(aimed); aimed.netted = false; setState(aimed, 1); }
  else { net.add(aimed); aimed.netted = true; setState(aimed, 2); }
  syncNet();
  updateCard();
}
$("#net-clear").addEventListener("click", () => {
  for (const f of net) { f.netted = false; setState(f, 1); }
  net.clear(); syncNet(); updateCard();
});
/* ------------------------------------------------------------- the haul
   The delete sheet is a flat path list on purpose -- it has to be the least
   playful thing on the page. This is the other half of that, and it should be
   the most: what you actually caught, counted by species, the way you would
   tip a net out on a dock and see what is in it. The path list is still here,
   demoted to where it belongs -- a button inside the tally. */
const esc = s => s.replace(/[<&]/g, c => (c === "<" ? "&lt;" : "&amp;"));
const fullPath = f => (f.path ? f.path + "/" : "") + f.name;

function openHaul() {
  if (!net.size) return;
  const list = [...net];
  let bytes = 0;
  for (const f of list) bytes += f.size;
  $("#haul-sum").textContent =
    `${fmtCount(list.length)} fish  ·  ${fmtBytes(bytes)}`;

  /* group by the species actually printed on the card, not by archetype --
     "two Bonito and a Marlin" is a haul; "three torpedoes" is a histogram */
  const sp = new Map();
  for (const f of list) {
    const a = ARCH[f.arch];
    const name = a.key === "ghost" ? "Ghost Minnow" : a.nouns[(f.hash >>> 19) % a.nouns.length];
    let e = sp.get(name);
    if (!e) sp.set(name, e = { n: 0, b: 0, fam: f.fam });
    e.n++; e.b += f.size;
  }
  const rows = [...sp.entries()].sort((a, b) => b[1].n - a[1].n || b[1].b - a[1].b);
  const shown = rows.slice(0, 18);
  $("#haul-species").innerHTML = shown.map(([name, e]) =>
    `<div><i style="background:${famColor[e.fam].getStyle()}"></i>` +
    /* no plural. Three cod, two perch, a dozen bream -- fish names do not take
       one, and "3 Frys" reads like a spreadsheet wrote it */
    `<b>${e.n}</b><u>${esc(name)}</u>` +
    `<s>${fmtBytes(e.b)}</s></div>`).join("") +
    (rows.length > shown.length
      ? `<div><i style="background:transparent"></i><b></b><u>&#8230; and ${rows.length - shown.length} more kinds</u></div>`
      : "");

  /* the two facts you actually want out of a catch */
  const big = list.reduce((a, f) => (f.size > a.size ? f : a), list[0]);
  const old = list.reduce((a, f) => (f.ageDays > a.ageDays ? f : a), list[0]);
  const note = [`biggest &#183; <em>${esc(fishName(big))}</em> &#183; ${esc(big.name)} &#183; ${fmtBytes(big.size)}`];
  if (old !== big) note.push(`longest down there &#183; <em>${esc(fishName(old))}</em> &#183; ${esc(old.name)} &#183; ${relAge(old.ageDays)}`);
  $("#haul-note").innerHTML = note.join("<br>");
  $("#haul").hidden = false;
}
const closeHaul = () => { $("#haul").hidden = true; };

$("#net-haul").addEventListener("click", openHaul);
$("#haul-close").addEventListener("click", closeHaul);
$("#haul-copy").addEventListener("click", e => {
  const txt = [...net].map(fullPath).join("\n");
  const t = document.createElement("textarea");
  t.value = txt;
  t.style.cssText = "position:fixed;top:0;left:0;opacity:0";
  document.body.appendChild(t); t.focus(); t.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (err) { }
  t.remove();
  if (!ok && navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => { });
  const b = e.currentTarget;
  b.textContent = "copied";
  setTimeout(() => { b.textContent = "copy paths"; }, 1400);
});

$("#net-del").addEventListener("click", () => {
  if (!net.size || !canDelete) return;
  const list = [...net];
  let bytes = 0;
  for (const f of list) bytes += f.size;
  $("#conf-sum").textContent = `${list.length} file${list.length === 1 ? "" : "s"} · ${fmtBytes(bytes)}`;
  $("#conf-list").innerHTML = list.slice(0, 400).map(f => `<div>${esc(fullPath(f))}</div>`)
    .join("") + (list.length > 400 ? `<div>&#8230; and ${list.length - 400} more</div>` : "");
  $("#conf-err").textContent = "";
  $("#confirm").hidden = false;
});
$("#conf-no").addEventListener("click", () => { $("#confirm").hidden = true; });
$("#conf-yes").addEventListener("click", async e => {
  const btn = e.currentTarget;
  btn.disabled = true; btn.textContent = "deleting";
  const list = [...net];
  let freed = 0, failed = 0;
  for (const f of list) {
    if (!f.dir) { failed++; continue; }
    try {
      await f.dir.removeEntry(f.name);
      f.dead = true; f.netted = false; freed += f.size;
      setState(f, 0);
      net.delete(f);
    } catch (err) { failed++; }
  }
  syncNet();
  btn.disabled = false; btn.textContent = "delete permanently";
  if (failed) {
    $("#conf-err").textContent = `${failed} could not be deleted · freed ${fmtBytes(freed)}`;
    setTimeout(() => { $("#confirm").hidden = true; }, 2200);
  } else {
    $("#confirm").hidden = true;
  }
  if (world) {
    world.bytes -= freed;
    const alive = world.files.filter(f => !f.dead).length;
    $("#s-files").textContent = fmtCount(alive);
    $("#s-size").textContent = fmtBytes(world.bytes);
  }
  say(`freed ${fmtBytes(freed)}`);
});

/* ============================================================ HUD */
const elYou = $("#you"), elYouT = elYou.querySelector("i"), elYouS = elYou.querySelector("s");
const elPlaceN = $("#place-n"), elPlaceS = $("#place-s");
const elCardN = $("#c-nm"), elCardF = $("#c-fn"), elCardP = $("#c-pa"), elCardA = $("#c-act");

/* The gauge is a ruler, drawn vertically, in bytes.

   This is the one place the new axis pays a dividend the old one could not:
   ages had to be labelled relatively ("3 years ago") because the column was
   fitted to the data and had no fixed marks. Sizes have canonical marks, so
   the water gets a real scale printed down the side of it -- and 1 GB is at
   the same place on every drive you will ever open. */
const MARKS = [0, 10, 13, 16, 18, 20, 23, 26, 28, 30, 33, 36, 38];
function fmtMark(lb) {
  const b = Math.pow(2, lb);
  if (b < 1024) return Math.round(b) + " B";
  const u = ["KB", "MB", "GB", "TB"]; let i = -1, v = b;
  while (v >= 1024 && i < 3) { v /= 1024; i++; }
  return (v < 10 ? +v.toFixed(1) : Math.round(v)) + " " + u[i];
}
function buildGauge() {
  const g = $("#gauge");
  [...g.querySelectorAll(".tick")].forEach(t => t.remove());
  let lastF = -1;
  for (const lb of MARKS) {
    if (lb < LB_LO - 0.4 || lb > LB_HI + 0.4) continue;
    const frac = clamp(-sizeToY(lb) / DEPTH, 0, 1);
    if (lastF >= 0 && frac - lastF < 0.085) continue;   // no stacked labels
    lastF = frac;
    const d = document.createElement("div");
    d.className = "tick";
    d.style.top = (frac * 100).toFixed(2) + "%";
    d.innerHTML = "<b>" + fmtMark(lb) + "</b>";
    g.appendChild(d);
  }
}

const PRE = ["Brass", "Dappled", "Salt", "Moon", "Bramble", "Pocket", "Rusted", "Velvet", "Paper",
  "Hollow", "Lantern", "Speckled", "Drowsy", "Copper", "Cobble", "Midnight", "Sunday", "Wobbly"];
/* the noun is the species, which the file chose; the adjective is the hash,
   which is the individual */
function fishName(f) {
  const a = ARCH[f.arch];
  if (a.key === "ghost") return "Ghost Minnow";
  return PRE[(f.hash >>> 13) % PRE.length] + " " + a.nouns[(f.hash >>> 19) % a.nouns.length];
}

const ago = (n, w) => n + " " + w + (n === 1 ? "" : "s") + " ago";
function relAge(days) {
  if (days < 0.0007) return "just now";
  if (days < 0.042) return ago(Math.max(1, Math.round(days * 1440)), "min");
  if (days < 1) return ago(Math.max(1, Math.round(days * 24)), "hour");
  if (days < 2) return "yesterday";
  if (days < 30) return ago(Math.round(days), "day");
  if (days < 365) return ago(Math.max(1, Math.round(days / 30)), "month");
  return ago(Math.max(1, Math.round(days / 365)), "year");
}
let sayUntil = 0;
function say(msg) { elPlaceS.textContent = msg; sayUntil = performance.now() + 2600; }

/* ============================================================ kelp talks
   A dialogue box, typed a letter at a time off the same clock the voice is
   scheduled on -- `beats()` says what one character costs in both places, so
   the text and the animalese cannot drift apart over a long line. */
const elIntro = $("#intro"), elTalkT = $("#talk-t"), elMore = $("#talk-more"),
  elChoice = $("#talk-choice"), elMute = $("#talk-mute");

const LINES = [
  "oh! hello. i didn't hear you come along the dock.",
  "below us, your drive becomes an ocean.",
  "every file down there is a fish, and how deep it swims is how much it weighs.",
  "folders are places in the water. the same file is always the same fish.",
  "nothing you open leaves this machine. i only read the water, i never carry it.",
  "so then. whose water are we swimming in today?",
];
const TIPS = [
  "still here. still wet.",
  "the deep ones are the heavy ones. mind the whale.",
  "net whatever you like. you can always let it all go again.",
  "a leviathan down there is only a very large file, you know.",
  "the colour is what a thing is. the depth is what it weighs.",
  "look at something and press space. i'll take you to it.",
  "the pale ones are the ones you haven't touched in years.",
  "if you want the big stuff, just keep going down.",
  "if you get lost, press f and come back up to me.",
];

let talkMode = null;                   // "intro" while he blocks, "chat" while he chats
let line = "", cursor = 0, shown = -1, lineDone = true, voice = null, charge = 0;
let lineIdx = 0, closeAt = 0, waveUntil = 0, lastChat = 0;

/* the intro holds the camera still: drifting away from someone mid-sentence
   is the one thing a conversation cannot survive */
function held() { return talkMode === "intro"; }

function renderLine() {
  const n = Math.min(line.length, Math.max(0, Math.floor(cursor)));
  if (n === shown) return;
  shown = n;
  elTalkT.textContent = line.slice(0, n);
}
function startLine(txt) {
  line = txt; cursor = 0; shown = -1; lineDone = false; closeAt = 0; charge = 0;
  if (voice) voice.stop();
  voice = speak(txt);
  elMore.hidden = true;
  elChoice.hidden = true;
  renderLine();
}
function endLine(cut) {
  cursor = line.length; lineDone = true; renderLine();
  if (cut && voice) { voice.stop(); voice = null; }
  if (talkMode === "chat") closeAt = performance.now() + 3200;
  else if (lineIdx >= LINES.length - 1) {
    elChoice.hidden = false;
    waveUntil = performance.now() + 1100;
  } else elMore.hidden = false;
}
function advance() {
  const c = audio();                   // we are inside a real gesture right here
  if (!lineDone) {
    /* the first click of the session is what unlocks the speakers. Spend it
       on catching his voice up rather than on skipping the line he is in the
       middle of -- otherwise the one thing it costs you is hearing him. */
    if (c && c.state === "running" && !(voice && voice.on)) {
      if (voice) voice.stop();
      voice = speak(line.slice(Math.floor(cursor)));
      if (voice.on) return;
    }
    endLine(true);
    return;
  }
  if (talkMode === "chat") { closeTalk(); return; }
  if (lineIdx < LINES.length - 1) { lineIdx++; startLine(LINES[lineIdx]); }
}
function closeTalk() {
  talkMode = null;
  elIntro.hidden = true;
  document.body.classList.remove("talking", "chatting");
  if (voice) { voice.stop(); voice = null; }
  lineDone = true; closeAt = 0;
  lastChat = performance.now();
}
/* the framing: he has to clear the dialogue box, so a narrow window is
   answered by standing further back rather than by cropping him */
const guideBack = () =>
  6.9 * clamp(1.55 / Math.max(0.45, innerWidth / Math.max(1, innerHeight)), 1, 2.1);
function frameGuide() {
  cam.vel.set(0, 0, 0); glide = null;
  if (phase === "dock") {
    cam.depthT = cam.pos.y = DOCK_Y;
    player.root.visible = true;
    updateChaseCamera(0, true);
    return;
  }
  cam.pos.set(guide.root.position.x, GUIDE_Y + 0.30, guide.root.position.z + guideBack());
  cam.depthT = cam.pos.y;
  cam.yaw = cam.yawT = 0;
  cam.pitch = cam.pitchT = 0.11;
  cam.eye.copy(cam.pos);                         // intro keeps its exact close framing
  player.root.visible = false;
}
/* `f` is the way home. It used to snap your depth to -18 and leave you
   wherever you were, which put you at the surface but rarely near him; now it
   is the same carry as everything else, and it ends looking him in the face. */
function toKelp() {
  if (!guide.root.visible) { cam.depthT = -18; return; }
  /* the berth belongs to the diver now; the chase camera supplies the old
     stand-back distance without putting the protagonist inside Kelp. */
  glideBerth(guide.root.position.x, GUIDE_Y + 0.30,
             guide.root.position.z + 3.2, 0, 0.11);
}
function openIntro(first) {
  talkMode = "intro";
  lineIdx = first ? 0 : LINES.length - 1;
  document.body.classList.add("talking");
  elIntro.hidden = false;
  guide.root.visible = true;
  guideMat.uniforms.uFade.value = 1;
  frameGuide();
  elPlaceN.textContent = "";
  elPlaceS.textContent = "";
  waveUntil = performance.now() + 2800;
  startLine(first ? LINES[0] : "hm. nothing in there but water. try another?");
}
function leaveIntro() {
  waveUntil = performance.now() + 1700;
  closeTalk();
  elPlaceN.textContent = phase === "dock" ? "the dock" : "the ocean";
}
/* swim back up to the raft and he says something, the way a villager does.
   Mid-dive the HUD stays put, so the box steps up out of the net bar's way
   rather than sitting on top of it. */
function chat(txt) {
  if (talkMode) return;
  talkMode = "chat";
  document.body.classList.add("chatting");
  elIntro.hidden = false;
  waveUntil = performance.now() + 1300;
  startLine(txt);
}

const syncMute = () => elMute.classList.toggle("off", !isOn());
elMute.addEventListener("click", e => {
  e.stopPropagation();
  setOn(!isOn());
  syncMute();
  if (!isOn()) { if (voice) { voice.stop(); voice = null; } return; }
  audio();
  if (!lineDone) { if (voice) voice.stop(); voice = speak(line.slice(Math.floor(cursor))); }
});
syncMute();

addEventListener("pointerdown", e => {
  if (!talkMode) return;
  if (e.target && e.target.closest && e.target.closest("#talk-choice, #talk-mute")) return;
  advance();
});

/* ============================================================ picking
   Analytic, not a raycast. Raycasting the instanced meshes does not work here:
   three caches an InstancedMesh bounding sphere the first time it is asked,
   and ours are built empty (count 0) and then refilled every frame, so the
   cached sphere stays the empty marker and every ray early-outs.

   Testing the crosshair against each near fish directly is also cheaper -- a
   few hundred dot products instead of a quarter of a million triangles -- and
   far kinder to aim with, since a 0.2 unit fry is a pixel and a half.

   Two things make it feel like aiming rather than like fishing for a tooltip.
   The cone has a fixed angular grace on top of the animal's own size, so a
   mote is still a target you can hit; and whatever you already have is scored
   at a discount, so the label stops flickering between two fish in a shoal the
   instant your hand moves a pixel. Hysteresis is most of what "responsive"
   means for a picker. */
let aimed = null, aimAt = 0;
const fwd = new Vector3();
const AIM_GRACE = 0.016;     // radians of slack past the silhouette, ~1 degree
const AIM_STICK = 0.70;      // what the fish you are already on is scored at

function pick() {
  if (!world) return null;
  fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const ox = camera.position.x, oy = camera.position.y, oz = camera.position.z;
  let best = null, bestScore = Infinity;
  for (const f of nearSet) {
    if (f.dead) continue;
    const dx = f.px - ox, dy = f.py - oy, dz = f.pz - oz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 1e-3 || dist > world.reach) continue;
    const along = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / dist;
    if (along < 0.55) continue;                        // behind, or far off axis
    /* how far the crosshair sits from the animal, in world units, against how
       big the animal is: aiming stays honest at every size class */
    const perp = dist * Math.sqrt(Math.max(0, 1 - along * along));
    const reach = f.scale * 1.30 + dist * AIM_GRACE;
    if (perp > reach) continue;
    let score = dist * (0.35 + perp / reach);          // nearest and most centred
    if (f === aimed) score *= AIM_STICK;
    if (score < bestScore) { bestScore = score; best = f; }
  }
  return best;
}
function updateCard() {
  document.body.classList.toggle("aimed", !!aimed);
  if (!aimed) return;
  elCardN.textContent = fishName(aimed);
  elCardF.textContent = aimed.name + "  ·  " + fmtBytes(aimed.size);
  elCardP.textContent = (aimed.path || "the root") + "  ·  " + relAge(aimed.ageDays);
  const inNet = net.has(aimed);
  elCardA.textContent = inNet ? "in the net · click to let it go" : "click to net it";
  $("#card").classList.toggle("netted", inNet);
}

/* ============================================================ loop */
const dummy = new Object3D();
const upload = (attr, n) => {
  if (attr.clearUpdateRanges) { attr.clearUpdateRanges(); attr.addUpdateRange(0, n); }
  attr.needsUpdate = true;
};
let W = 0, H = 0, last = performance.now(), t = 0;
const dpr = Math.min(devicePixelRatio || 1, 2);
const ink = new Color();

function frame(nowMs) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (nowMs - last) / 1000); last = nowMs; t += dt;

  const w = innerWidth, h = innerHeight;
  if (w !== W || h !== H) {
    W = w; H = h;
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    for (const m of [pointMat, hazeMat, snowMat]) {
      m.uniforms.uH.value = h * 0.5; m.uniforms.uPx.value = dpr;
    }
    /* the fish target's pixel scale. The main app uses /460 for one fish that
       fills the frame; this runs slightly finer because the ocean shows a whole
       school at once and the ink dilates every silhouette by a texel -- too
       coarse and a school thirty metres out welds into one crust. */
    const PX = Math.max(2, Math.ceil(W * dpr / 560));
    const RW = Math.max(2, Math.round(W * dpr / PX));
    const RH = Math.max(2, Math.round(H * dpr / PX));
    fishRT.setSize(RW, RH);
    postMat.uniforms.uRT.value.set(RW, RH);
    const GPX = Math.max(1, Math.ceil(W * dpr / 1100));
    const GW = Math.max(2, Math.round(W * dpr / GPX));
    const GH = Math.max(2, Math.round(H * dpr / GPX));
    guideRT.setSize(GW, GH);
    guidePostMat.uniforms.uRT.value.set(GW, GH);
    if (held()) frameGuide();                  // keep him framed as the window turns
  }

  const k = 1 - Math.exp(-dt * TUNE.damp);
  /* the head is quick and the body is heavy. Damping them together is what
     made aiming feel like steering something with a rudder. */
  const kl = 1 - Math.exp(-dt * TUNE.lookDamp);
  cam.yaw += (cam.yawT - cam.yaw) * kl;
  cam.pitch += (cam.pitchT - cam.pitch) * kl;

  const boost = keys.has("shift") ? TUNE.boost : 1;
  let fx = 0, fz = 0, fy = 0;
  if (!held() && phase !== "jump") {
    if (keys.has("w")) fz += 1;
    if (keys.has("s")) fz -= 1;
    if (keys.has("a") || keys.has("arrowleft")) fx -= 1;
    if (keys.has("d") || keys.has("arrowright")) fx += 1;
    /* the arrows keep the deliberate axis underwater; on the dock they are
       simply alternate walking keys and cannot lift the player off the deck */
    if (phase === "ocean" && keys.has("arrowup")) fy += 1;
    if (phase === "ocean" && keys.has("arrowdown")) fy -= 1;
  }

  const sinY = Math.sin(cam.yaw), cosY = Math.cos(cam.yaw);
  const cp = phase === "dock" ? 1 : Math.cos(cam.pitch);
  const want = new Vector3(
    -sinY * cp * fz + cosY * fx,
    phase === "dock" ? 0 : Math.sin(cam.pitch) * fz + fy * 0.8,
    -cosY * cp * fz - sinY * fx);
  if (want.lengthSq() > 1) want.normalize();          // diagonals are not faster
  want.multiplyScalar((phase === "dock" ? 2.8 : TUNE.swimSpeed) * boost);

  if (phase === "jump") {
    cam.vel.set(0, 0, 0);
    stepJump(nowMs);
  } else {
    cam.vel.lerp(want, k);
    if (phase === "dock") {
      cam.pos.x += cam.vel.x * dt;
      cam.pos.z += cam.vel.z * dt;
      cam.pos.x = clamp(cam.pos.x, guide.root.position.x - DOCK_X, guide.root.position.x + DOCK_X);
      cam.pos.z = clamp(cam.pos.z, guide.root.position.z + DOCK_NEAR, guide.root.position.z + DOCK_FAR);
      cam.pos.y = cam.depthT = DOCK_Y;
      glide = null; wheelAt = 0;
    } else {
      /* --- being carried ------------------------------------------------- */
      if (glide) {
        if (nowMs > glide.until || (glide.f && glide.f.dead)) glide = null;
        else {
          let tx, ty, tz, ax, ay, az;
          if (glide.f) {
            const f = glide.f;
            ax = f.px === undefined ? f.x : f.px;
            ay = f.py === undefined ? f.y : f.py;
            az = f.pz === undefined ? f.z : f.pz;
            let dx = cam.pos.x - ax, dy = cam.pos.y - ay, dz = cam.pos.z - az;
            const d = Math.hypot(dx, dy, dz) || 1;
            const stand = Math.max(2.4, f.scale * TUNE.standoff);
            tx = ax + dx / d * stand; ty = ay + dy / d * stand; tz = az + dz / d * stand;
            cam.yawT = nearestYaw(Math.atan2(-(ax - cam.pos.x), -(az - cam.pos.z)), cam.yaw);
            cam.pitchT = clamp(Math.atan2(ay - cam.pos.y,
              Math.hypot(ax - cam.pos.x, az - cam.pos.z)), -1.22, 1.22);
          } else {
            tx = glide.p.x; ty = glide.p.y; tz = glide.p.z;
            cam.yawT = nearestYaw(glide.yaw, cam.yaw); cam.pitchT = glide.pitch;
          }
          const g = 1 - Math.exp(-dt / Math.max(0.05, TUNE.glideTime) * 2.6);
          cam.pos.x += (tx - cam.pos.x) * g;
          cam.pos.z += (tz - cam.pos.z) * g;
          cam.depthT = clamp(cam.depthT + (ty - cam.depthT) * g, -DEPTH - 60, -2);
          cam.vel.multiplyScalar(1 - g);
          if (Math.hypot(tx - cam.pos.x, ty - cam.pos.y, tz - cam.pos.z) < 0.8) glide = null;
        }
      }
      cam.pos.x += cam.vel.x * dt;
      cam.pos.z += cam.vel.z * dt;
      if (Math.abs(cam.vel.y) > 0.01) {
        cam.depthT = clamp(cam.depthT + cam.vel.y * dt, -DEPTH - 60, -2);
        wheelAt = 0;
      }
      if (wheelAt && nowMs - wheelAt > TUNE.settle * 1000) {
        cam.depthT = detent(cam.depthT); wheelAt = 0;
      }
      cam.pos.y += (cam.depthT - cam.pos.y) * (1 - Math.exp(-dt * 5.0));
      const rad = Math.hypot(cam.pos.x, cam.pos.z);
      const lim = (world ? world.radius : TUNE.lateral) * 1.9 + 200;
      if (rad > lim) { cam.pos.x *= lim / rad; cam.pos.z *= lim / rad; }
    }
  }

  /* The same body walks upright, commits to the jump, then becomes the
     swimmer. Keeping one transform through all three phases is what prevents
     the transition from reading as a camera cut. */
  player.root.visible = phase !== "ocean" || (!!world && !held());
  if (player.root.visible) {
    if (phase === "dock") {
      const moving = clamp(cam.vel.length() / 2.8, 0, 1);
      const step = Math.sin(t * 8.0) * moving;
      player.root.rotation.set(0, cam.yaw, 0);
      player.armR.rotation.x = step * 0.45;
      player.armL.rotation.x = -step * 0.45;
      player.legR.rotation.x = -step * 0.38;
      player.legL.rotation.x = step * 0.38;
    } else if (phase === "jump") {
      const dive = clamp((DOCK_Y - cam.pos.y + 0.2) / 4.0, 0, 1);
      player.root.rotation.set(-Math.PI * 0.48 * dive, cam.yaw, 0);
      player.armR.rotation.x = player.armL.rotation.x = -1.0 * dive;
      player.legR.rotation.x = player.legL.rotation.x = 0.18;
    } else {
      const moving = Math.max(clamp(cam.vel.length() / TUNE.swimSpeed, 0, 1), glide ? 0.55 : 0.08);
      const stroke = Math.sin(t * (2.2 + moving * 4.8));
      player.root.rotation.set(-Math.PI / 2 + cam.pitch * 0.88, cam.yaw, stroke * 0.025 * moving);
      player.armR.rotation.x = 0.18 + stroke * 0.72 * moving;
      player.armL.rotation.x = 0.18 - stroke * 0.72 * moving;
      player.legR.rotation.x = stroke * 0.26 * moving;
      player.legL.rotation.x = -stroke * 0.26 * moving;
    }
  }

  syncAction();
  if (!held()) updateChaseCamera(dt, false);
  camera.position.copy(cam.eye);
  camera.rotation.set(0, 0, 0);
  camera.rotateY(cam.yaw);
  camera.rotateX(cam.pitch);

  water.copy(waterAt(cam.pos.y));
  const fog = lerp(TUNE.fogNear, TUNE.fogDeep, clamp(-cam.pos.y / DEPTH, 0, 1));
  fishMat.uniforms.uFog.value = fog;
  fishMat.uniforms.uFar.value = TUNE.meshFar;
  fishMat.uniforms.uFarBig.value = TUNE.meshFarBig;
  fishMat.uniforms.uFogBig.value = TUNE.fogBig;
  fishMat.uniforms.uTime.value = t;
  /* the ink is graded to the water rather than fixed black, or it goes from a
     hard cartoon line at the surface to invisible in the abyss */
  ink.setRGB(0.030 + water.r * 0.22, 0.048 + water.g * 0.22, 0.062 + water.b * 0.22);
  postMat.uniforms.uInk.value.copy(ink);
  guidePostMat.uniforms.uInk.value.copy(ink);
  surfMat.uniforms.uTime.value = t;
  surfMat.uniforms.uWater.value.copy(water).lerp(new Color(0x2f89a8), 0.5);
  for (const m of rayMats) m.uniforms.uTime.value = t;

  snow.visible = phase === "ocean";
  if (snow.visible) {
    const a = snow.geometry.attributes.position;
    for (let i = 0; i < TUNE.snow; i++) {
      let y = snowPos[i * 3 + 1] - dt * 1.4;
      if (y < -45) y += 90;
      snowPos[i * 3 + 1] = y;
      a.array[i * 3] = snowPos[i * 3] + cam.pos.x;
      a.array[i * 3 + 1] = y + cam.pos.y;
      a.array[i * 3 + 2] = snowPos[i * 3 + 2] + cam.pos.z;
    }
    a.needsUpdate = true;
  }

  /* --- the dithered actors ---------------------------------------------- */
  if (guide.root.visible || player.root.visible) {
    guideMat.uniforms.uTime.value = t;
    guideMat.uniforms.uFog.value = fog;
  }
  if (guide.root.visible) {
    const underwater = phase === "ocean" || (phase === "jump" && jump && jump.splashed);
    if (underwater) {
      /* two swells at unrelated periods, so the underwater berth never
         obviously loops; above water it is a fixed dock, not a raft. */
      guide.root.position.y = GUIDE_Y + Math.sin(t * 0.8) * 0.055 + Math.sin(t * 1.37) * 0.025;
      guide.root.rotation.z = Math.sin(t * 0.61) * 0.012;
      guide.root.rotation.x = Math.sin(t * 0.83 + 1.1) * 0.010;
    } else {
      guide.root.position.y = DOCK_Y;
      guide.root.rotation.x = guide.root.rotation.z = 0;
    }
    guideMat.uniforms.uDeck.value = guide.root.position.y;
    const saying = !!talkMode && !lineDone;
    guide.head.rotation.x = saying ? Math.sin(t * 9.5) * 0.05 : Math.sin(t * 0.9) * 0.02;
    guide.head.rotation.y = saying ? Math.sin(t * 3.1) * 0.07 : Math.sin(t * 0.55) * 0.11;
    /* the jaw runs off the same animalese cadence the voice does, which is
       what stops him looking dubbed -- literally the same clock: `charge` is
       how far through the current character both the typewriter and the
       scheduler are, so the mouth opens once per letter and shuts on a space */
    const ch = line[Math.min(line.length - 1, Math.floor(cursor))] || " ";
    const voiced = saying && /[a-z]/i.test(ch);
    const flap = saying
      ? (voiced ? 0.42 + Math.sin(clamp(charge, 0, 1) * Math.PI) * 1.85 : 0.30)
      : 0.4;
    guide.mouth.scale.set(1, flap, saying ? 1.3 : 1);
    const idle = 0.13 + Math.sin(t * 1.1) * 0.06;
    const want = nowMs < waveUntil ? 2.16 + Math.sin(t * 9) * 0.34 : idle;
    guide.armR.rotation.z += (want - guide.armR.rotation.z) * (1 - Math.exp(-dt * 9));
    guide.armL.rotation.z = -(0.13 + Math.sin(t * 1.1 + 2) * 0.06);
  }
  if (talkMode && !lineDone) {
    /* charge the typewriter in beats, not characters: a full stop is worth
       three and a half of them in the voice, so it has to be worth three and
       a half here too */
    charge += dt / Math.max(0.008, SND.voice.step);
    while (cursor < line.length) {
      const cost = beats(line[cursor]);
      if (charge < cost) break;
      charge -= cost; cursor++;
    }
    renderLine();
    if (cursor >= line.length) endLine(false);
  }
  if (talkMode === "chat" && lineDone && closeAt && nowMs > closeAt) closeTalk();
  /* come back up to the raft and he has something to say, the way a villager
     does when you stand next to one */
  if (phase === "ocean" && world && !talkMode && guide.root.visible && nowMs - lastChat > 20000 &&
      cam.pos.distanceTo(guide.root.position) < 15) {
    chat(TIPS[(Math.random() * TIPS.length) | 0]);
  }

  if (world && phase === "ocean") {
    if (nowMs - nearAt > 130) { nearAt = nowMs; rebuildNear(); }
    const counts = new Array(ARCH.length).fill(0);
    for (const m of world.insts) m.userData.ids.fill(-1);
    for (const f of nearSet) {
      const mesh = world.insts[f.arch];
      const i = counts[f.arch];
      if (i >= CAP) continue;
      /* behaviour follows size: the arc a creature turns on is its own body
         lengths across, and a leviathan's is very wide and very slow */
      const ph = t * f.speed + f.phase;
      const yaw = ph * 0.42;
      const orb = f.scale * f.orbit;
      dummy.position.set(
        f.x + Math.cos(yaw) * orb,
        f.y + Math.sin(ph * 1.7) * f.scale * f.bob,
        f.z + Math.sin(yaw) * orb);
      dummy.rotation.set(0, -yaw + Math.PI / 2, Math.sin(ph * 2.4) * f.roll);
      dummy.scale.set(f.scale * f.sx, f.scale * f.sy, f.scale * f.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      /* where it actually is this frame, so the crosshair aims at the animal
         rather than at where it would be if it never swam */
      f.px = dummy.position.x; f.py = dummy.position.y; f.pz = dummy.position.z;
      const T = mesh.userData.tint, Q = mesh.userData.pat;
      if (f.netted) { T[i * 3] = 0.92; T[i * 3 + 1] = 0.98; T[i * 3 + 2] = 0.95; }
      else { T[i * 3] = f.cr; T[i * 3 + 1] = f.cg; T[i * 3 + 2] = f.cb; }
      Q[i * 2] = f.netted ? 0 : f.pat; Q[i * 2 + 1] = f.patF;
      mesh.userData.ids[i] = f.index;
      counts[f.arch] = i + 1;
    }
    /* the buffers are budget-sized but usually mostly empty, so upload only the
       prefix actually written -- otherwise fifteen archetypes cost 1.8 MB a
       frame to say nothing */
    world.insts.forEach((m, i) => {
      const n = counts[i];
      m.count = n;
      if (!n) return;
      upload(m.instanceMatrix, n * 16);
      upload(m.geometry.attributes.tint, n * 3);
      upload(m.geometry.attributes.pat, n * 2);
    });
  }

  const depthPct = clamp(-cam.pos.y / DEPTH, 0, 1);
  elYou.style.top = (depthPct * 100).toFixed(2) + "%";
  /* what the water weighs at this depth. Metres stay the small grey line,
     because metres are the fiction and the byte is the truth. */
  elYouT.textContent = fmtMark(yToSize(cam.pos.y));
  elYouS.textContent = Math.round(-cam.pos.y) + " m";

  if (phase === "ocean" && world && nowMs > sayUntil) {
    /* "where am I" is the SMALLEST circle you are standing inside, not the
       nearest edge -- ranking by (distance - radius) hands it to whichever
       circle is biggest, which is always the root, which is why this used to
       say "the root" no matter where you swam. Outside everything, fall back
       to the nearest edge so it still points at something. */
    let bestP = null, bestR = Infinity, nearP = null, nearD = 1e9;
    for (const p of world.places) {
      if (!p.files.length) continue;
      const d = Math.hypot(p.cx - cam.pos.x, p.cz - cam.pos.z);
      if (d < p.r && p.r < bestR) { bestR = p.r; bestP = p; }
      if (d - p.r < nearD) { nearD = d - p.r; nearP = p; }
    }
    const inside = !!bestP;
    bestP = bestP || nearP;
    if (bestP) {
      elPlaceN.textContent = inside ? (bestP.name || "the root") : "—";
      elPlaceS.textContent = inside
        ? fmtCount(bestP.files.length) + " files · " +
          fmtBytes(bestP.files.reduce((a, f) => a + f.size, 0))
        : "open water";
    }
  }

  if (phase === "ocean" && nowMs - aimAt > 45) {
    aimAt = nowMs; aimed = pick(); updateCard();
  } else if (phase !== "ocean" && aimed) {
    aimed = null; updateCard();
  }

  /* 1. the animals, alone, at PX-to-one with their own depth buffer, so they
        still occlude each other */
  const anyFish = phase === "ocean" && !!world && nearSet.length > 0;
  const showGuide = guide.root.visible || player.root.visible;
  if (anyFish) {
    renderer.setRenderTarget(fishRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(fishScene, camera);
  }
  if (showGuide) {                             // Kelp and the diver, at a finer grain
    renderer.setRenderTarget(guideRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(guideScene, camera);
  }
  /* 2. the water, full res, untouched */
  renderer.setRenderTarget(null);
  renderer.setClearColor((phase === "dock" || (phase === "jump" && cam.pos.y > 0.5)) ? 0x72aebb : water, 1);
  renderer.clear();
  renderer.render(scene, camera);
  /* 3. dither + ink, upscaled nearest, over the top */
  if (anyFish) renderer.render(postScene, postCam);
  if (showGuide) renderer.render(guidePostScene, postCam);
}

/* ============================================================ entry */
const elScan = $("#scan");
function progress(n, path) {
  $("#scan-n").textContent = fmtCount(n);
  $("#scan-now").textContent = path;
  $("#scan-fill").style.width = Math.min(100, (n / 40000) * 100).toFixed(1) + "%";
}

async function openReal() {
  if (canPick) {
    let root;
    try {
      root = await showDirectoryPicker({ mode: "readwrite" });
    } catch (e) { return; }                       // user cancelled
    try {
      const perm = await root.queryPermission({ mode: "readwrite" });
      canDelete = perm === "granted" ||
        (await root.requestPermission({ mode: "readwrite" })) === "granted";
    } catch (e) { canDelete = false; }
    leaveIntro(); elScan.hidden = false;
    /* setTimeout, not rAF: rAF never fires in a background tab, so a scan
       started and then tabbed away from would hang forever */
    await new Promise(r => setTimeout(r, 30));
    const files = await scanHandle(root, progress);
    elScan.hidden = true;
    if (!files.length) { openIntro(false); return; }
    buildWorld(files, root.name);
    say(phase === "dock" ? "the water is ready · walk to the edge"
      : (canDelete ? "net a fish, then let it go for good" : "read only · nothing can be deleted"));
  } else {
    $("#dirinput").click();
  }
}

$("#open-real").addEventListener("click", openReal);
$("#open-demo").addEventListener("click", () => {
  leaveIntro();
  canDelete = false;
  buildWorld(buildDemo(), "demo drive");
  if (phase === "dock") say("the water is ready · walk to the edge");
});

/* the everywhere-else path: no handles, so no deleting, but it is fast */
{
  const inp = document.createElement("input");
  inp.type = "file"; inp.id = "dirinput"; inp.hidden = true;
  inp.webkitdirectory = true; inp.multiple = true;
  document.body.appendChild(inp);
  inp.addEventListener("change", async () => {
    if (!inp.files || !inp.files.length) return;
    leaveIntro(); elScan.hidden = false;
    /* setTimeout, not rAF: rAF never fires in a background tab, so a scan
       started and then tabbed away from would hang forever */
    await new Promise(r => setTimeout(r, 30));
    const files = scanFileList(inp.files);
    const label = (inp.files[0].webkitRelativePath || "").split("/")[0] || "folder";
    elScan.hidden = true;
    canDelete = false;
    inp.value = "";
    if (!files.length) { openIntro(false); return; }
    buildWorld(files, label);
    say(phase === "dock" ? "the water is ready · walk to the edge"
      : "read only · this browser cannot delete");
  });
}

/* live handle: tweak TUNE in the console, or fly the camera somewhere. */
/* pick and camera are exposed so aiming can be tested without depending on the
   rAF cadence -- headless browsers run a handful of frames, which is not
   enough for the picker's own timer to ever fire */
window.ocean = {
  TUNE, cam, camera, player, updateChaseCamera, get world() { return world; },
  get phase() { return phase; }, buildWorld, buildDemo, beginJump,
  ARCH, net, syncNet, pick, guide, openIntro, advance, get line() { return line; },
};

if (AUTO_DEMO) buildWorld(buildDemo(), "demo drive");
else stageDock();
requestAnimationFrame(frame);
