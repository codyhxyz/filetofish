/* ocean -- a file viewer.

   Every file is a fish. Depth is age, lateral position is folder, colour is
   type, size is size. Four draw tiers hand off inside the turbidity, so the
   fog is the render budget rather than an apology for it.

   Reads a real folder off your disk, in your browser, and never sends a byte
   anywhere. See OCEAN.md for why each default is what it is. */

import {
  Scene, PerspectiveCamera, OrthographicCamera, WebGLRenderer, WebGLRenderTarget,
  BufferGeometry, BufferAttribute, InstancedMesh, InstancedBufferAttribute,
  Mesh, Points, ShaderMaterial, Color, NearestFilter,
  Vector3, Object3D, PlaneGeometry, DoubleSide, AdditiveBlending, Vector2,
} from "three";

const TUNE = {
  /* --- the two axes that carry meaning --------------------------------- */
  depth: 900,             // world units from surface to abyss
  /* how far back the abyss reaches is not a knob: the column is fitted to the
     folder's own p01..p99 age range, so any drive fills the water */
  ageCurve: 0.52,         // <1 gives recent files more room; the past compresses
  lateral: 760,           // radius of the whole packed field

  /* --- what a file looks like ------------------------------------------ */
  sizeGain: 1.0,          // scales the whole size ladder (SIZE_LADDER below)
  schoolTight: 0.34,      // how hard same-species-same-size files clump
  deepFrom: 0.62,         // fraction of the column below which deep-sea forms start
  deepTo: 0.86,           // ...and past which everything down there is one

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
  driftSpeed: 46,
  boost: 3.2,
  descendSpeed: 0.9,
  damp: 4.2,
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
/* Depth is age, but the column is fitted to the data rather than to a fixed
   number of years. A folder made this morning and a drive going back to 2009
   both fill the water; otherwise a young folder is a flat sheet at the surface
   and an old one piles up against the floor. p01..p99, so one ancient stray
   cannot flatten everything else. */
let AGE_LO = 0, AGE_HI = 3650;
/* the ocean is scaled uniformly to the size of the drive, so a small folder is
   a small sea rather than a few specks lost in a big one. Physical size means
   nothing; only the ratios do. */
let DEPTH = TUNE.depth;
const ageToY = d =>
  -DEPTH * Math.pow(clamp((d - AGE_LO) / (AGE_HI - AGE_LO), 0, 1), TUNE.ageCurve);
const yToAge = y =>
  AGE_LO + (AGE_HI - AGE_LO) * Math.pow(clamp(-y / DEPTH, 0, 1), 1 / TUNE.ageCurve);
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
      /* nothing floats above the surface, and a whale needs its whole back
         under it */
      f.y = Math.min(-0.6 - f.scale * 0.75, ageToY(f.ageDays) + (r() - 0.5) * 11);
      /* the creature is a reading of the file. Depth is age, so where a file
         sits in the column is exactly the light it lives in -- and that is
         what decides whether it is a surface animal or a deep-sea one. */
      const depthT = clamp(-f.y / DEPTH, 0, 1);
      const deep = depthT > lerp(TUNE.deepFrom, TUNE.deepTo, r());
      f.arch = archOf(f, deep);
      /* behaviour follows size: a whale that darts like a minnow is wrong. Big
         things beat slowly, turn on a much wider arc, and barely bob. */
      const sT = clamp((f.lb - 14) / 19, 0, 1);
      f.phase = s.phase + r() * 1.4;
      f.speed = (0.35 + r() * 0.5) * lerp(1.45, 0.16, sT);
      f.orbit = lerp(0.80, 2.10, sT);
      f.bob = lerp(0.16, 0.022, sT);
      f.roll = lerp(0.11, 0.016, sT);
      /* the individuality that used to live in per-file geometry now lives in
         a non-uniform scale and a colour nudge -- 200 tris x 50,000 files is
         not a thing you can build */
      f.sx = 0.84 + r() * 0.42;
      f.sy = 0.78 + r() * 0.52;
      f.sz = 0.82 + r() * 0.40;
      const c = famColor[f.fam].clone();
      c.offsetHSL((r() - 0.5) * 0.055, (r() - 0.5) * 0.20, (r() - 0.5) * 0.16);
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
   DEPTH, which is age, overrides it below the light: an ancient file is a
   deep-sea animal, because that is where it lives. Leviathans stay leviathans
   at any depth, they just change species.
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
  { key: "whale", pools: { lev: 3 }, seg: 12, ring: 8,
    pF: .34, pB: .76, dep: .30, gir: .27, stretch: 1.55, tail: "fluke",
    dor: .07, dorA: .58, dorB: .74, nose: .44, noseP: 1.7,
    eyeK: .40, eyeT: .12, eyeY: .05, pect: .55, pectLen: -2.0, pectRot: .85, pectT: .30,
    nouns: ["Whale", "Rorqual", "Finback", "Leviathan"] },

  { key: "cachalot", pools: { lev: 2, levdeep: 3 }, seg: 12, ring: 8,
    pF: .20, pB: .70, dep: .30, gir: .28, stretch: 1.50, tail: "fluke",
    dor: .05, dorA: .62, dorB: .80, nose: .58, noseP: 3.4,
    eyeK: .38, eyeT: .30, eyeY: -.10, pect: .5, pectLen: -1.4, pectRot: .80, pectT: .38,
    nouns: ["Cachalot", "Bowhead", "Behemoth", "Sea Bull"] },

  /* the deep. These only exist below the light, which is to say only for the
     oldest files on the drive. */
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
{
  const q = new Mesh(new PlaneGeometry(2, 2), postMat);
  q.frustumCulled = false;
  postScene.add(q);
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

  /* fit the water column to the data's own age range */
  const ages = files.map(f => f.ageDays).sort((a, b) => a - b);
  const at = q => ages[clamp(Math.floor(ages.length * q), 0, ages.length - 1)];
  AGE_LO = ages.length ? Math.max(0, at(0.01)) : 0;
  AGE_HI = ages.length ? at(0.99) : 3650;
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
      const c = hazeColor[f.fam]; e.r += c.r; e.g += c.g; e.bl += c.b;
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
  cam.pos.set(0, eye, back);
  cam.depthT = eye; cam.yaw = cam.yawT = 0; cam.pitch = cam.pitchT = -0.03;
  nearSet = []; nearAt = 0;
  return world;
}

/* ============================================================ camera
   Two degrees of freedom, not six. Free horizontal drift at whatever depth
   you are at, plus a deliberate descend. You can never be lost or seasick. */
const cam = {
  pos: new Vector3(0, -190, TUNE.lateral * 1.72),
  vel: new Vector3(),
  yaw: 0, pitch: -0.06, yawT: 0, pitchT: -0.06, depthT: -190,
};
const keys = new Set();
let dragging = false, lastX = 0, lastY = 0, moved = 0;

addEventListener("keydown", e => {
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === "f") cam.depthT = -18;
  if (k === "e") toggleNet();
  if (e.code === "Space") e.preventDefault();
});
addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
canvas.addEventListener("pointerdown", e => {
  dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointerup", e => {
  dragging = false;
  try { canvas.releasePointerCapture(e.pointerId); } catch (err) { }
  if (moved < 5) toggleNet();               // a click, not a drag
});
canvas.addEventListener("pointermove", e => {
  if (!dragging) return;
  moved += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);
  cam.yawT -= (e.clientX - lastX) * 0.0042;
  cam.pitchT = clamp(cam.pitchT - (e.clientY - lastY) * 0.0035, -1.25, 1.25);
  lastX = e.clientX; lastY = e.clientY;
});
addEventListener("wheel", e => {
  e.preventDefault();
  cam.depthT = clamp(cam.depthT - e.deltaY * TUNE.descendSpeed, -DEPTH - 60, -2);
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
}
function setState(f, v) {
  if (!world) return;
  const a = world.points.geometry.attributes.st;
  a.array[f.index] = v;
  a.needsUpdate = true;
}
function toggleNet() {
  if (!aimed || aimed.dead) return;
  if (net.has(aimed)) { net.delete(aimed); aimed.netted = false; setState(aimed, 1); }
  else { net.add(aimed); aimed.netted = true; setState(aimed, 2); }
  syncNet();
  updateCard();
}
$("#net-clear").addEventListener("click", () => {
  for (const f of net) { f.netted = false; setState(f, 1); }
  net.clear(); syncNet(); updateCard();
});
$("#net-copy").addEventListener("click", e => {
  const txt = [...net].map(f => (f.path ? f.path + "/" : "") + f.name).join("\n");
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
  $("#conf-list").innerHTML = list.slice(0, 400)
    .map(f => `<div>${((f.path ? f.path + "/" : "") + f.name).replace(/[<&]/g, c => c === "<" ? "&lt;" : "&amp;")}</div>`)
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

/* the gauge is a calendar drawn vertically, and since the column is fitted to
   the data its labels are relative dates rather than fixed years */
function buildGauge() {
  const g = $("#gauge");
  [...g.querySelectorAll(".tick")].forEach(t => t.remove());
  let prev = "";
  for (const frac of [0, 0.12, 0.28, 0.46, 0.66, 0.85, 1]) {
    const label = frac === 0 ? "now" : relAge(yToAge(-frac * DEPTH));
    if (label === prev) continue;                 // a narrow range repeats itself
    prev = label;
    const d = document.createElement("div");
    d.className = "tick";
    d.style.top = (frac * 100).toFixed(2) + "%";
    d.innerHTML = "<b>" + label + "</b>";
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

/* ============================================================ picking
   Analytic, not a raycast. Raycasting the instanced meshes does not work here:
   three caches an InstancedMesh bounding sphere the first time it is asked,
   and ours are built empty (count 0) and then refilled every frame, so the
   cached sphere stays the empty marker and every ray early-outs.

   Testing the crosshair against each near fish directly is also cheaper -- a
   few hundred dot products instead of a quarter of a million triangles -- and
   far kinder to aim with, since a 0.2 unit fry is a pixel and a half. */
let aimed = null, aimAt = 0;
const fwd = new Vector3();

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
    const reach = f.scale * 1.15 + dist * 0.006;       // a small angular grace
    if (perp > reach) continue;
    const score = dist * (0.35 + perp / reach);        // nearest and most centred
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
  }

  const k = 1 - Math.exp(-dt * TUNE.damp);
  cam.yaw += (cam.yawT - cam.yaw) * k;
  cam.pitch += (cam.pitchT - cam.pitch) * k;

  const boost = keys.has("shift") ? TUNE.boost : 1;
  let fx = 0, fz = 0;
  if (keys.has("w") || keys.has("arrowup")) fz += 1;
  if (keys.has("s") || keys.has("arrowdown")) fz -= 1;
  if (keys.has("a") || keys.has("arrowleft")) fx -= 1;
  if (keys.has("d") || keys.has("arrowright")) fx += 1;
  if (keys.has("q")) cam.depthT = clamp(cam.depthT - 260 * dt, -DEPTH - 60, -2);
  if (keys.has("r")) cam.depthT = clamp(cam.depthT + 260 * dt, -DEPTH - 60, -2);

  const sinY = Math.sin(cam.yaw), cosY = Math.cos(cam.yaw);
  const want = new Vector3(
    (-sinY * fz + cosY * fx) * TUNE.driftSpeed * boost, 0,
    (-cosY * fz - sinY * fx) * TUNE.driftSpeed * boost);
  cam.vel.lerp(want, k);
  cam.pos.x += cam.vel.x * dt;
  cam.pos.z += cam.vel.z * dt;
  cam.pos.y += (cam.depthT - cam.pos.y) * (1 - Math.exp(-dt * 2.6));
  const rad = Math.hypot(cam.pos.x, cam.pos.z);
  const lim = (world ? world.radius : TUNE.lateral) * 1.9 + 200;
  if (rad > lim) { cam.pos.x *= lim / rad; cam.pos.z *= lim / rad; }

  camera.position.copy(cam.pos);
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
  surfMat.uniforms.uTime.value = t;
  surfMat.uniforms.uWater.value.copy(water).lerp(new Color(0x2f89a8), 0.5);
  for (const m of rayMats) m.uniforms.uTime.value = t;

  {
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

  if (world) {
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
  const ageDays = yToAge(cam.pos.y);
  elYouT.textContent = ageDays < 1 ? "today" : relAge(ageDays);
  elYouS.textContent = Math.round(-cam.pos.y) + " m";

  if (world && nowMs > sayUntil) {
    let bestP = null, bestD = 1e9;
    for (const p of world.places) {
      if (!p.files.length) continue;
      const d = Math.hypot(p.cx - cam.pos.x, p.cz - cam.pos.z) - p.r;
      if (d < bestD) { bestD = d; bestP = p; }
    }
    if (bestP) {
      elPlaceN.textContent = bestD < 0 ? (bestP.name || "the root") : "—";
      elPlaceS.textContent = bestD < 0
        ? fmtCount(bestP.files.length) + " files · " +
          fmtBytes(bestP.files.reduce((a, f) => a + f.size, 0))
        : "open water";
    }
  }

  if (nowMs - aimAt > 90) { aimAt = nowMs; aimed = pick(); updateCard(); }

  /* 1. the animals, alone, at PX-to-one with their own depth buffer, so they
        still occlude each other */
  const anyFish = !!world && nearSet.length > 0;
  if (anyFish) {
    renderer.setRenderTarget(fishRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(fishScene, camera);
  }
  /* 2. the water, full res, untouched */
  renderer.setRenderTarget(null);
  renderer.setClearColor(water, 1);
  renderer.clear();
  renderer.render(scene, camera);
  /* 3. dither + ink, upscaled nearest, over the top */
  if (anyFish) renderer.render(postScene, postCam);
}

/* ============================================================ entry */
const elScan = $("#scan"), elIntro = $("#intro");
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
    elIntro.hidden = true; elScan.hidden = false;
    /* setTimeout, not rAF: rAF never fires in a background tab, so a scan
       started and then tabbed away from would hang forever */
    await new Promise(r => setTimeout(r, 30));
    const files = await scanHandle(root, progress);
    elScan.hidden = true;
    if (!files.length) { elIntro.hidden = false; return; }
    buildWorld(files, root.name);
    say(canDelete ? "net a fish, then let it go for good" : "read only · nothing can be deleted");
  } else {
    $("#dirinput").click();
  }
}

$("#open-real").addEventListener("click", openReal);
$("#open-demo").addEventListener("click", () => {
  elIntro.hidden = true;
  canDelete = false;
  buildWorld(buildDemo(), "demo drive");
});

/* the everywhere-else path: no handles, so no deleting, but it is fast */
{
  const inp = document.createElement("input");
  inp.type = "file"; inp.id = "dirinput"; inp.hidden = true;
  inp.webkitdirectory = true; inp.multiple = true;
  document.body.appendChild(inp);
  inp.addEventListener("change", async () => {
    if (!inp.files || !inp.files.length) return;
    elIntro.hidden = true; elScan.hidden = false;
    /* setTimeout, not rAF: rAF never fires in a background tab, so a scan
       started and then tabbed away from would hang forever */
    await new Promise(r => setTimeout(r, 30));
    const files = scanFileList(inp.files);
    const label = (inp.files[0].webkitRelativePath || "").split("/")[0] || "folder";
    elScan.hidden = true;
    canDelete = false;
    inp.value = "";
    if (!files.length) { elIntro.hidden = false; return; }
    buildWorld(files, label);
    say("read only · this browser cannot delete");
  });
}

$("#cap-note").textContent = canPick
  ? "chromium can also delete what you net · up to " + fmtCount(MAX_FILES) + " files"
  : "this browser is read only · chrome or edge can also delete what you net";

/* live handle: tweak TUNE in the console, or fly the camera somewhere. */
/* pick and camera are exposed so aiming can be tested without depending on the
   rAF cadence -- headless browsers run a handful of frames, which is not
   enough for the picker's own timer to ever fire */
window.ocean = {
  TUNE, cam, camera, get world() { return world; },
  buildWorld, buildDemo, ARCH, net, syncNet, pick,
};

if (/[?&]demo\b/.test(location.search)) {
  elIntro.hidden = true;
  buildWorld(buildDemo(), "demo drive");
}
requestAnimationFrame(frame);
