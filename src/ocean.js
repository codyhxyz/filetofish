/* ocean -- a file viewer.

   Every file is a fish. Depth is age, lateral position is folder, colour is
   type, size is size. Four draw tiers hand off inside the turbidity, so the
   fog is the render budget rather than an apology for it.

   Reads a real folder off your disk, in your browser, and never sends a byte
   anywhere. See OCEAN.md for why each default is what it is. */

import {
  Scene, PerspectiveCamera, WebGLRenderer, BufferGeometry, BufferAttribute,
  InstancedMesh, InstancedBufferAttribute, Mesh, Points, ShaderMaterial, Color,
  Vector3, Object3D, PlaneGeometry, DoubleSide, AdditiveBlending, Raycaster, Vector2,
} from "three";

const TUNE = {
  /* --- the two axes that carry meaning --------------------------------- */
  depth: 900,             // world units from surface to abyss
  /* how far back the abyss reaches is not a knob: the column is fitted to the
     folder's own p01..p99 age range, so any drive fills the water */
  ageCurve: 0.52,         // <1 gives recent files more room; the past compresses
  lateral: 760,           // radius of the whole packed field

  /* --- what a file looks like ------------------------------------------ */
  fishMin: 0.30,          // world units, a 1 KB file
  fishMax: 5.6,           // world units, a 20 GB file
  schoolTight: 0.34,      // how hard same-species-same-size files clump

  /* --- the four tiers -------------------------------------------------- */
  hazeFrom: 240,          // haze starts fading in beyond this
  pointFar: 900,          // points die past here
  pointNear: 26,          // ...and hand off to meshes inside here
  meshFar: 150,           // meshes only exist within this
  meshBudget: 1400,       // hard cap on instanced fish per frame

  /* --- water ------------------------------------------------------------ */
  fogNear: 0.0016,
  fogDeep: 0.0052,
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
      const lo = Math.log(s.size[0]), hi = Math.log(s.size[1]);
      const size = Math.round(Math.exp(lerp(lo, hi, Math.pow(rnd(), 1.9))));
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
  const own = Math.sqrt(place.files.length) * 1.9;
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
const sizeToScale = b => lerp(TUNE.fishMin, TUNE.fishMax,
  Math.pow(clamp(Math.log2(b + 1) / 34, 0, 1), 2.1));

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
        s = { x: Math.cos(th) * rad, z: Math.sin(th) * rad, n: 0, phase: r() * TAU };
        schools.set(key, s);
      }
      f.school = s; s.n++;
    }
    for (const f of p.files) {
      const r = mulberry32(f.hash);
      const s = f.school;
      /* keep school + scatter inside the folder's circle, or places bleed into
         each other and the packing stops meaning anything */
      const spread = lerp(p.r * 0.38, p.r * TUNE.schoolTight * 0.4, clamp(s.n / 220, 0, 1));
      const th = r() * TAU, rad = Math.sqrt(r()) * spread;
      f.x = p.cx + s.x + Math.cos(th) * rad;
      f.z = p.cz + s.z + Math.sin(th) * rad;
      /* nothing floats above the surface */
      f.y = Math.min(-0.6, ageToY(f.ageDays) + (r() - 0.5) * 11);
      f.scale = sizeToScale(f.size);
      f.phase = s.phase + r() * 1.4;
      f.speed = 0.35 + r() * 0.5;
      f.arch = (f.hash >>> 9) % ARCH.length;
      /* the individuality that used to live in per-file geometry now lives in
         a non-uniform scale and a colour nudge -- 200 tris x 50,000 files is
         not a thing you can build */
      f.sx = 0.84 + r() * 0.42;
      f.sy = 0.78 + r() * 0.52;
      f.sz = 0.82 + r() * 0.40;
      const c = famColor[f.fam].clone();
      c.offsetHSL((r() - 0.5) * 0.055, (r() - 0.5) * 0.20, (r() - 0.5) * 0.16);
      f.cr = c.r; f.cg = c.g; f.cb = c.b;
      f.place = p;
    }
  }
}

/* ============================================================ fish meshes */
const ARCH = [
  { key: "perch", pF: .62, pB: .88, dep: .44, gir: .21, stretch: 1.04, tail: "fan", dor: .22 },
  { key: "torpedo", pF: .66, pB: 1.15, dep: .29, gir: .19, stretch: 1.22, tail: "fork", dor: .13 },
  { key: "flat", pF: .75, pB: .78, dep: .74, gir: .11, stretch: .88, tail: "fan", dor: .28 },
  { key: "eel", pF: .42, pB: .46, dep: .15, gir: .12, stretch: 1.65, tail: "round", dor: .07 },
  { key: "puffer", pF: 1.0, pB: 1.0, dep: .62, gir: .50, stretch: .78, tail: "fan", dor: .09 },
  { key: "shark", pF: .67, pB: 1.22, dep: .31, gir: .21, stretch: 1.3, tail: "fork", dor: .39 },
  { key: "angler", pF: .36, pB: 1.2, dep: .52, gir: .30, stretch: .95, tail: "round", dor: .14 },
];
function peakOf(a) {
  let m = 1e-6;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    m = Math.max(m, Math.pow(Math.pow(t, a.pF) * Math.pow(1 - t, a.pB), 0.85));
  }
  return m;
}
const radiusAt = (t, a, peak) =>
  Math.max(Math.pow(Math.pow(clamp(t, 0, 1), a.pF) * Math.pow(clamp(1 - t, 0, 1), a.pB), 0.85) / peak * 0.9
    + 0.145 * Math.pow(1 - t, 1.15), 0.075);
const spineX = (t, a) => (-1 + t * 2) * a.stretch;

function archGeometry(a) {
  const SEG = 9, RING = 6, peak = peakOf(a), v = [];
  const P = (i, j) => {
    const t = i / SEG, th = (j % RING) / RING * TAU;
    const r = radiusAt(t, a, peak), s = Math.sin(th), c = Math.cos(th);
    return [spineX(t, a), r * a.dep * s * (s < 0 ? 1.2 : 1), r * a.gir * c];
  };
  for (let i = 0; i < SEG; i++) for (let j = 0; j < RING; j++) {
    const p = P(i, j), q = P(i, j + 1), r = P(i + 1, j), s = P(i + 1, j + 1);
    v.push(...p, ...r, ...q, ...q, ...r, ...s);
  }
  const nose = [spineX(0, a) - 0.05 * a.stretch, 0, 0], tail = [spineX(1, a), 0, 0];
  for (let j = 0; j < RING; j++) {
    v.push(...nose, ...P(0, j), ...P(0, j + 1));
    v.push(...tail, ...P(SEG, j + 1), ...P(SEG, j));
  }
  const L = 0.42, H = 0.36, X = spineX(1, a);
  const cfg = { fan: [0.30, 1.7], fork: [0.62, 2.3], round: [0.02, 1] }[a.tail];
  const out = [];
  for (let i = 0; i <= 7; i++) {
    const u = -1 + (i / 7) * 2, au = Math.abs(u);
    if (a.tail === "round") out.push([X + L * 0.18 + L * Math.sqrt(Math.max(0, 1 - u * u)), u * H * 0.92]);
    else out.push([X + L * (1 - cfg[0] * (1 - Math.pow(au, cfg[1]))), u * H]);
  }
  for (let i = 0; i < out.length - 1; i++)
    v.push(X - 0.06, 0, 0, out[i][0], out[i][1], 0, out[i + 1][0], out[i + 1][1], 0);
  for (let i = 0; i < 5; i++) {
    const s0 = i / 5, s1 = (i + 1) / 5;
    const t0 = lerp(0.3, 0.66, s0), t1 = lerp(0.3, 0.66, s1);
    const e0 = radiusAt(t0, a, peak) * a.dep, e1 = radiusAt(t1, a, peak) * a.dep;
    const h0 = a.dor * Math.pow(Math.sin(s0 * Math.PI), 0.62), h1 = a.dor * Math.pow(Math.sin(s1 * Math.PI), 0.62);
    v.push(spineX(t0, a), e0, 0, spineX(t0, a), e0 + h0, 0, spineX(t1, a), e1, 0);
    v.push(spineX(t0, a), e0 + h0, 0, spineX(t1, a), e1 + h1, 0, spineX(t1, a), e1, 0);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(v), 3));
  g.computeVertexNormals();
  return g;
}

/* ============================================================ shaders */
const FISH_VS = `
attribute vec3 tint;
varying vec3 vN, vC; varying float vFog;
void main(){
  vC = tint;
  vN = normalize(mat3(instanceMatrix) * normal);
  vec4 wp = instanceMatrix * vec4(position, 1.0);
  vec4 mv = modelViewMatrix * wp;
  vFog = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FISH_FS = `
precision highp float;
uniform vec3 uWater; uniform float uFog;
varying vec3 vN, vC; varying float vFog;
void main(){
  vec3 N = normalize(vN);
  float k = dot(N, normalize(vec3(0.15, 0.95, 0.28))) * 0.5 + 0.5;
  float band = floor(clamp(k, 0.0, 0.999) * 4.0) / 3.0;   // the same hard lamp as the main app
  vec3 col = vC * (0.30 + 0.85 * band);
  float f = 1.0 - exp(-vFog * uFog);
  gl_FragColor = vec4(mix(col, uWater, clamp(f, 0.0, 1.0)), 1.0);
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
const scene = new Scene();
const camera = new PerspectiveCamera(58, 1, 0.5, 4200);

const WATER_TOP = new Color(0x2b7f9e), WATER_DEEP = new Color(0x02060c);
const waterAt = y => WATER_TOP.clone().lerp(WATER_DEEP,
  Math.pow(clamp(-y / (DEPTH * 1.05), 0, 1), 0.92));
const water = new Color();

const fishMat = new ShaderMaterial({
  vertexShader: FISH_VS, fragmentShader: FISH_FS,
  uniforms: { uWater: { value: water }, uFog: { value: TUNE.fogNear } },
  side: DoubleSide,
});
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
const CAP = Math.ceil(TUNE.meshBudget / ARCH.length) + 60;
let world = null;

function disposeWorld() {
  if (!world) return;
  scene.remove(world.points, world.haze, ...world.insts);
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
     sea. TUNE.lateral is the radius at the reference size. */
  const radius = clamp(TUNE.lateral * Math.sqrt(files.length / 52000), 260, 1500);
  DEPTH = clamp(TUNE.depth * (radius / TUNE.lateral), 330, 1200);
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
    mesh.geometry = ARCH_GEO[i].clone();
    mesh.geometry.setAttribute("tint", attr);
    mesh.userData.tint = ti;
    mesh.userData.ids = new Int32Array(CAP);
    scene.add(mesh);
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

  world = { files, places, points, haze, insts, grid, GRID, radius,
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
          if (f.dead) continue;
          const d = Math.hypot(f.x - cam.pos.x, f.y - cam.pos.y, f.z - cam.pos.z);
          if (d < R) cand.push([d, f]);
        }
      }
  /* big fish earn their geometry from further away, or you stand in
     node_modules and the whole budget goes to dotfiles */
  cand.sort((a, b) => (a[0] / (0.4 + a[1].scale)) - (b[0] / (0.4 + b[1].scale)));
  nearSet = cand.slice(0, TUNE.meshBudget).map(c => c[1]);
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
const NOUN = ["Perch", "Tuna", "Turbot", "Eel", "Puffer", "Hound", "Angler"];
const fishName = f => PRE[(f.hash >>> 13) % PRE.length] + " " + NOUN[f.arch];

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

/* ============================================================ picking */
const ray = new Raycaster();
const centre = new Vector2(0, 0);
let aimed = null, aimAt = 0;

function pick() {
  if (!world) return null;
  ray.setFromCamera(centre, camera);
  ray.far = TUNE.meshFar;
  const hits = ray.intersectObjects(world.insts, false);
  for (const h of hits) {
    const id = h.object.userData.ids[h.instanceId];
    if (id >= 0) {
      const f = world.files[id];
      if (f && !f.dead) return f;
    }
  }
  return null;
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
let W = 0, H = 0, last = performance.now(), t = 0;
const dpr = Math.min(devicePixelRatio || 1, 2);

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
  renderer.setClearColor(water, 1);
  const fog = lerp(TUNE.fogNear, TUNE.fogDeep, clamp(-cam.pos.y / DEPTH, 0, 1));
  fishMat.uniforms.uFog.value = fog;
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
      const ph = t * f.speed + f.phase;
      const yaw = ph * 0.42;
      dummy.position.set(
        f.x + Math.cos(yaw) * f.scale * 0.9,
        f.y + Math.sin(ph * 1.7) * f.scale * 0.10,
        f.z + Math.sin(yaw) * f.scale * 0.9);
      dummy.rotation.set(0, -yaw + Math.PI / 2, Math.sin(ph * 2.4) * 0.08);
      dummy.scale.set(f.scale * f.sx, f.scale * f.sy, f.scale * f.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const T = mesh.userData.tint;
      if (f.netted) { T[i * 3] = 0.92; T[i * 3 + 1] = 0.98; T[i * 3 + 2] = 0.95; }
      else { T[i * 3] = f.cr; T[i * 3 + 1] = f.cg; T[i * 3 + 2] = f.cb; }
      mesh.userData.ids[i] = f.index;
      counts[f.arch] = i + 1;
    }
    world.insts.forEach((m, i) => {
      m.count = counts[i];
      m.instanceMatrix.needsUpdate = true;
      m.geometry.attributes.tint.needsUpdate = true;
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

  renderer.render(scene, camera);
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
window.ocean = { TUNE, cam, get world() { return world; }, buildWorld, buildDemo, ARCH, net, syncNet };

if (/[?&]demo\b/.test(location.search)) {
  elIntro.hidden = true;
  buildWorld(buildDemo(), "demo drive");
}
requestAnimationFrame(frame);
