/* ocean -- the file viewer mockup.

   Every file is a fish. Depth is age, lateral position is folder, colour is
   type, size is size. Four draw tiers hand off to each other inside the
   turbidity, so the fog is the render budget rather than an apology for it.

   Everything tunable lives in TUNE. See OCEAN.md for why each default is what
   it is. */

import {
  Scene, PerspectiveCamera, WebGLRenderer, BufferGeometry, BufferAttribute,
  InstancedMesh, InstancedBufferAttribute, Mesh, Points, ShaderMaterial, Color, Vector3, Matrix4, Quaternion,
  Object3D, PlaneGeometry, DoubleSide, AdditiveBlending, Raycaster, Vector2,
} from "three";

const TUNE = {
  /* --- the two axes that carry meaning --------------------------------- */
  years: 12,              // how far back the abyss reaches
  depth: 900,             // world units from surface to abyss
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
  fogNear: 0.0016,        // exponential fog density at the surface
  fogDeep: 0.0052,        // ...and in the abyss. murk increases with depth
  snow: 2600,             // marine snow motes

  /* --- feel -------------------------------------------------------------- */
  driftSpeed: 46,
  boost: 3.2,
  descendSpeed: 0.9,
  damp: 4.2,
};

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
   colour is the one channel you read from across the whole ocean, so it gets
   the strongest signal: file type. Muted, because a reef of pure #00FF00 is
   unreadable at density. */
const FAMILIES = [
  { key: "image", hue: 26, sat: 62, lig: 54, ext: ["heic", "jpg", "png", "raw", "webp", "gif"] },
  { key: "video", hue: 254, sat: 52, lig: 60, ext: ["mov", "mp4", "mkv", "prores"] },
  { key: "audio", hue: 326, sat: 52, lig: 60, ext: ["m4a", "wav", "flac", "mp3"] },
  { key: "code", hue: 136, sat: 46, lig: 52, ext: ["ts", "js", "rs", "py", "json", "css", "md", "map"] },
  { key: "doc", hue: 44, sat: 62, lig: 56, ext: ["pdf", "docx", "key", "pages", "xlsx", "txt"] },
  { key: "archive", hue: 194, sat: 52, lig: 54, ext: ["zip", "dmg", "tar", "gz", "iso"] },
];
const FAM_BY_KEY = Object.fromEntries(FAMILIES.map(f => [f.key, f]));

/* ============================================================ the corpus
   A synthetic drive, but shaped like a real one: a few enormous folders, a
   long tail of small ones, and -- the part that matters -- realistic arrival
   patterns. node_modules lands in one instant. A photo library arrives in
   hundreds of bursts. Source code trickles. Those three patterns are what
   make the vertical axis legible, so the fake data has to have them. */
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

const NAMEBITS = {
  image: ["IMG", "DSC", "PXL", "screenshot", "export", "scan"],
  video: ["MVI", "clip", "render", "timelapse", "take"],
  audio: ["track", "memo", "stem", "mix", "demo"],
  code: ["index", "main", "utils", "parser", "client", "server", "types", "helper", "config"],
  doc: ["invoice", "contract", "notes", "draft", "report", "receipt", "resume"],
  archive: ["backup", "snapshot", "archive", "bundle", "dump"],
};

function buildCorpus() {
  const files = [];
  const rnd = mulberry32(0x0cea9);
  const now = Date.now();
  for (const s of SPEC) {
    /* arrival pattern -> the vertical shape of the folder */
    const burstDays = [];
    if (s.mode === "burst") for (let i = 0; i < s.bursts; i++) burstDays.push(lerp(s.age[0], s.age[1], rnd()));
    const instantDay = s.mode === "instant" ? lerp(s.age[0], s.age[1], rnd()) : 0;

    for (let i = 0; i < s.n; i++) {
      const fam = s.mixed && rnd() < 0.55
        ? FAMILIES[(rnd() * FAMILIES.length) | 0].key : s.fam;
      const F = FAM_BY_KEY[fam];
      const ext = F.ext[(rnd() * F.ext.length) | 0];
      /* log-uniform sizes: real drives are a power law, not a bell curve */
      const lo = Math.log(s.size[0]), hi = Math.log(s.size[1]);
      const size = Math.exp(lerp(lo, hi, Math.pow(rnd(), 1.9)));
      let ageDays;
      if (s.mode === "instant") ageDays = instantDay + rnd() * 0.02;
      else if (s.mode === "burst") ageDays = burstDays[(rnd() * burstDays.length) | 0] + (rnd() - 0.5) * 1.5;
      else ageDays = lerp(s.age[0], s.age[1], Math.pow(rnd(), 1.35));

      const bits = NAMEBITS[fam];
      const stem = bits[(rnd() * bits.length) | 0];
      const name = /^[A-Z]{3}$/.test(stem)
        ? `${stem}_${(1000 + (rnd() * 8999) | 0)}.${ext}`
        : `${stem}-${(rnd() * 999) | 0}.${ext}`;
      files.push({
        name, path: s.path, size: Math.round(size), fam,
        mtime: now - ageDays * DAY, ageDays,
        hash: fnv1a(s.path + "/" + name + "|" + Math.round(size)),
      });
    }
  }
  return files;
}

/* ============================================================ places
   Two rules turn a filesystem tree into a set of locations you can navigate:

   1. PATH COMPRESSION. A folder with one child folder and no files of its own
      is a hallway, not a room. Collapse the chain. (radix tree)
   2. MASS THRESHOLD. A folder holding less than MIN_SHARE of its parent is
      furniture, not a place. Its files just live in the parent.

   Without these you get one node per directory and the ocean is confetti. */
const MIN_SHARE = 0.02;
const MIN_FILES = 24;

function buildTree(files) {
  const root = { name: "", seg: "", children: new Map(), files: [], count: 0 };
  for (const f of files) {
    let node = root;
    for (const seg of f.path.split("/")) {
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

/* returns a tree of places: {name, files[], kids[], count} */
function toPlaces(node, parentCount) {
  /* rule 1: swallow hallways */
  let cur = node, label = node.name;
  while (cur.files.length === 0 && cur.children.size === 1) {
    const only = cur.children.values().next().value;
    label = label ? label + "/" + only.seg : only.seg;
    cur = only;
  }
  const place = { name: label, files: cur.files.slice(), kids: [], count: cur.count };
  for (const c of cur.children.values()) {
    /* rule 2: absorb anything too small to be its own room */
    if (c.count < MIN_FILES || c.count / cur.count < MIN_SHARE) {
      const drain = n => { place.files.push(...n.files); for (const g of n.children.values()) drain(g); };
      drain(c);
    } else place.kids.push(toPlaces(c, cur.count));
  }
  return place;
}

/* ============================================================ packing
   Circle packing, not a treemap: nested circles read as reefs and lagoons,
   rectangles read as architecture. Greedy front-chain -- each new circle is
   dropped tangent to two placed ones, at whichever valid spot sits closest to
   the middle. Good enough at these counts, and it looks grown rather than
   laid out. */
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
  const hits = (x, z, r) => placed.some(p =>
    Math.hypot(p.x - x, p.z - z) < p.r + r - 0.001);

  for (const c of cs) {
    if (!placed.length) { c.x = 0; c.z = 0; placed.push(c); continue; }
    if (placed.length === 1) {
      c.x = placed[0].r + c.r; c.z = 0; placed.push(c); continue;
    }
    let best = null;
    /* candidate positions: tangent to every placed pair */
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
    if (!best) {                                  // fall back to a ring sweep
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

/* absolute XZ for every place, then scatter files into the gaps */
function placeWorld(place, cx, cz, out) {
  place.cx = cx; place.cz = cz;
  out.push(place);
  for (const k of place.kids) placeWorld(k, cx + (k.x || 0), cz + (k.z || 0), out);
}

/* ============================================================ layout */
const ageToY = d => -TUNE.depth * Math.pow(clamp(d / (TUNE.years * 365), 0, 1), TUNE.ageCurve);
const yToAge = y => Math.pow(clamp(-y / TUNE.depth, 0, 1), 1 / TUNE.ageCurve) * TUNE.years * 365;

function sizeToScale(bytes) {
  const t = clamp(Math.log2(bytes + 1) / 34, 0, 1);
  return lerp(TUNE.fishMin, TUNE.fishMax, Math.pow(t, 2.1));
}

function layout(places) {
  for (const p of places) {
    /* schools: same family, same order of magnitude, same folder.
       Each school gets a little home inside the folder's circle, and its
       members huddle around it -- schooling falls out of similarity, not
       out of the directory. */
    const schools = new Map();
    for (const f of p.files) {
      const key = f.fam + "|" + (Math.log2(f.size + 1) | 0);
      let s = schools.get(key);
      if (!s) {
        const r = mulberry32(fnv1a(p.name + key));
        const th = r() * TAU, rad = Math.sqrt(r()) * p.r * 0.78;
        s = { x: Math.cos(th) * rad, z: Math.sin(th) * rad, n: 0, phase: r() * TAU };
        schools.set(key, s);
      }
      f.school = s; s.n++;
    }
    for (const f of p.files) {
      const r = mulberry32(f.hash);
      const s = f.school;
      /* tight for big schools, loose for loners */
      const spread = lerp(p.r * 0.9, p.r * TUNE.schoolTight, clamp(s.n / 220, 0, 1));
      const th = r() * TAU, rad = Math.sqrt(r()) * spread;
      f.x = p.cx + s.x + Math.cos(th) * rad;
      f.z = p.cz + s.z + Math.sin(th) * rad;
      f.y = ageToY(f.ageDays) + (r() - 0.5) * 11;
      f.scale = sizeToScale(f.size);
      f.phase = s.phase + r() * 1.4;
      f.speed = 0.35 + r() * 0.5;
      f.arch = (f.hash >>> 9) % ARCH.length;
      f.place = p;
    }
  }
}

/* ============================================================ fish meshes
   One merged, non-indexed geometry per archetype, instanced. Building a
   BufferGeometry per file the way the main app does is fine for one fish and
   catastrophic for forty thousand -- all the individuality has to move into
   per-instance colour and scale. */
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
  /* caudal fin */
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
  /* dorsal */
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

/* one point per file. The mid tier: too far to be an animal, close enough to
   be an individual. */
const PT_VS = `
attribute vec3 tint; attribute float sz;
uniform float uH, uNear, uFar, uPx;
varying vec3 vC; varying float vA;
void main(){
  vC = tint;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = -mv.z;
  gl_Position = projectionMatrix * mv;
  float px = sz * uH / max(1.0, d);
  gl_PointSize = clamp(px, 1.0, 26.0) * uPx;
  /* fade out where the meshes take over, and where the water swallows it */
  vA = smoothstep(uNear * 0.55, uNear * 1.6, d) * (1.0 - smoothstep(uFar * 0.55, uFar, d));
}`;
const PT_FS = `
precision mediump float;
uniform vec3 uWater; uniform float uFog;
varying vec3 vC; varying float vA;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float m = 1.0 - smoothstep(0.30, 0.5, length(q));
  if (m * vA < 0.02) discard;
  gl_FragColor = vec4(vC, m * vA);
}`;

/* the far tier: not files at all, just where the biomass is */
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

/* seen from underneath: the only ceiling in the world */
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

/* ============================================================ build */
const files = buildCorpus();
const tree = buildTree(files);
const rootPlace = toPlaces(tree, tree.count);
packRadius(rootPlace);
const places = [];
placeWorld(rootPlace, 0, 0, places);
/* normalise the packed field to the configured radius */
const scaleK = TUNE.lateral / Math.max(1, rootPlace.r);
for (const p of places) { p.cx *= scaleK; p.cz *= scaleK; p.r *= scaleK; }
layout(places);

const totalBytes = files.reduce((a, f) => a + f.size, 0);
$("#s-files").textContent = fmtCount(files.length);
$("#s-size").textContent = fmtBytes(totalBytes);
$("#s-places").textContent = String(places.length);

/* ============================================================ scene */
const canvas = $("#gl");
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setClearColor(0x04121a, 1);
const scene = new Scene();
const camera = new PerspectiveCamera(58, 1, 0.5, 4200);

const WATER_TOP = new Color(0x2b7f9e), WATER_DEEP = new Color(0x02060c);
/* light falls off fast underwater; a linear ramp reads as a flat backdrop */
const waterAt = y => WATER_TOP.clone().lerp(WATER_DEEP,
  Math.pow(clamp(-y / (TUNE.depth * 1.05), 0, 1), 0.92));
const water = new Color();

const famColor = {}, hazeColor = {};
for (const F of FAMILIES) {
  famColor[F.key] = new Color().setHSL(F.hue / 360, F.sat / 100, F.lig / 100);
  /* additive blending eats saturation, so the haze gets a punchier copy */
  hazeColor[F.key] = new Color().setHSL(F.hue / 360, Math.min(1, F.sat / 100 * 1.5), F.lig / 100 * 0.86);
}

/* --- points: every file, always ---------------------------------------- */
{
  const n = files.length;
  const pos = new Float32Array(n * 3), tint = new Float32Array(n * 3), sz = new Float32Array(n);
  files.forEach((f, i) => {
    pos[i * 3] = f.x; pos[i * 3 + 1] = f.y; pos[i * 3 + 2] = f.z;
    const c = famColor[f.fam];
    tint[i * 3] = c.r; tint[i * 3 + 1] = c.g; tint[i * 3 + 2] = c.b;
    sz[i] = f.scale;
    f.index = i;
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("tint", new BufferAttribute(tint, 3));
  g.setAttribute("sz", new BufferAttribute(sz, 1));
  const m = new ShaderMaterial({
    vertexShader: PT_VS, fragmentShader: PT_FS, transparent: true, depthWrite: false,
    uniforms: {
      uH: { value: 800 }, uPx: { value: 1 },
      uNear: { value: TUNE.pointNear }, uFar: { value: TUNE.pointFar },
      uWater: { value: water }, uFog: { value: TUNE.fogNear },
    },
  });
  const pts = new Points(g, m);
  pts.frustumCulled = false;
  scene.add(pts);
  var pointMat = m;
}

/* --- haze: a few puffs per place, so distance reads as biomass ---------- */
{
  const puffs = [];
  for (const p of places) {
    if (!p.files.length) continue;
    /* bin the folder's files by depth: a folder that arrived in one instant
       becomes a single pancake, one that grew over years becomes a column */
    const bins = new Map();
    for (const f of p.files) {
      const b = Math.round(f.y / 24);              // bins near puff size, or they stack to white
      let e = bins.get(b);
      if (!e) bins.set(b, e = { y: 0, n: 0, r: 0, g: 0, bl: 0 });
      e.y += f.y; e.n++;
      const c = hazeColor[f.fam]; e.r += c.r; e.g += c.g; e.bl += c.b;
    }
    /* a puff is as wide as its folder -- the bin's population drives how
       bright it is, not how big. Several jittered puffs per bin, or a bin
       reads as a bead on a string instead of a cloud with something in it. */
    const jr = mulberry32(fnv1a(p.name + "haze"));
    for (const e of bins.values()) {
      if (e.n < 3) continue;
      const dens = clamp(Math.sqrt(e.n) / 15, 0.14, 1);
      const k = Math.min(4, 1 + ((e.n / 45) | 0));
      const y0 = e.y / e.n;
      for (let i = 0; i < k; i++) {
        const th = jr() * TAU, rad = Math.sqrt(jr()) * p.r * 0.5;
        puffs.push({
          x: p.cx + Math.cos(th) * rad, y: y0 + (jr() - 0.5) * 30, z: p.cz + Math.sin(th) * rad,
          r: e.r / e.n, g: e.g / e.n, b: e.bl / e.n,
          sz: Math.max(46, p.r * 1.5), a: dens / k,
        });
      }
    }
  }
  const n = puffs.length;
  const pos = new Float32Array(n * 3), tint = new Float32Array(n * 3);
  const sz = new Float32Array(n), amt = new Float32Array(n);
  puffs.forEach((q, i) => {
    pos[i * 3] = q.x; pos[i * 3 + 1] = q.y; pos[i * 3 + 2] = q.z;
    tint[i * 3] = q.r; tint[i * 3 + 1] = q.g; tint[i * 3 + 2] = q.b;
    sz[i] = q.sz; amt[i] = q.a;
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("tint", new BufferAttribute(tint, 3));
  g.setAttribute("sz", new BufferAttribute(sz, 1));
  g.setAttribute("amt", new BufferAttribute(amt, 1));
  const m = new ShaderMaterial({
    vertexShader: HAZE_VS, fragmentShader: HAZE_FS, transparent: true,
    depthWrite: false, blending: AdditiveBlending,
    uniforms: { uH: { value: 800 }, uPx: { value: 1 }, uFrom: { value: TUNE.hazeFrom } },
  });
  const h = new Points(g, m);
  h.frustumCulled = false;
  scene.add(h);
  var hazeMat = m;
}

/* --- instanced fish: the near tier -------------------------------------- */
const fishMat = new ShaderMaterial({
  vertexShader: FISH_VS, fragmentShader: FISH_FS,
  uniforms: { uWater: { value: water }, uFog: { value: TUNE.fogNear } },
  side: DoubleSide,
});
const CAP = Math.ceil(TUNE.meshBudget / ARCH.length) + 60;
const insts = ARCH.map(a => {
  const mesh = new InstancedMesh(archGeometry(a), fishMat, CAP);
  mesh.frustumCulled = false;
  mesh.count = 0;
  const tint = new Float32Array(CAP * 3);
  const attr = new InstancedBufferAttribute(tint, 3);
  attr.setUsage(35048);                            // DynamicDraw
  mesh.geometry.setAttribute("tint", attr);
  mesh.userData.tint = tint;
  mesh.userData.ids = new Int32Array(CAP);
  scene.add(mesh);
  return mesh;
});

/* --- marine snow: the cheapest possible sense of scale and motion -------- */
{
  const n = TUNE.snow, pos = new Float32Array(n * 3);
  const r = mulberry32(0x5e1f2a);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (r() - 0.5) * 90; pos[i * 3 + 1] = (r() - 0.5) * 90; pos[i * 3 + 2] = (r() - 0.5) * 90;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  const m = new ShaderMaterial({
    vertexShader: SNOW_VS, fragmentShader: SNOW_FS, transparent: true, depthWrite: false,
    uniforms: { uH: { value: 800 }, uPx: { value: 1 } },
  });
  const s = new Points(g, m);
  s.frustumCulled = false;
  scene.add(s);
  var snow = s, snowPos = pos, snowMat = m;
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

/* shafts of light: they exist to give the top of the water a direction, and
   to make descending feel like leaving something behind */
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

/* ============================================================ camera
   Two degrees of freedom, not six. Free horizontal drift at whatever depth
   you are at, plus a deliberate descend. You can never be lost, the horizon
   is always level, and nobody gets motion sick. */
/* you arrive outside the field looking in, high enough that the first thing
   you see is the whole shape of the drive rather than any one file */
const cam = {
  pos: new Vector3(0, -190, TUNE.lateral * 1.72),
  vel: new Vector3(),
  yaw: 0, pitch: -0.06,
  yawT: 0, pitchT: -0.06,
  depthT: -190,
};
const keys = new Set();
let dragging = false, lastX = 0, lastY = 0;

addEventListener("keydown", e => {
  keys.add(e.key.toLowerCase());
  if (e.key.toLowerCase() === "f") { cam.depthT = -18; }
  if (e.code === "Space") e.preventDefault();
});
addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
canvas.addEventListener("pointerdown", e => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointerup", e => { dragging = false; try { canvas.releasePointerCapture(e.pointerId); } catch (err) { } });
canvas.addEventListener("pointermove", e => {
  if (!dragging) return;
  cam.yawT -= (e.clientX - lastX) * 0.0042;
  cam.pitchT = clamp(cam.pitchT - (e.clientY - lastY) * 0.0035, -1.25, 1.25);
  lastX = e.clientX; lastY = e.clientY;
});
addEventListener("wheel", e => {
  e.preventDefault();
  cam.depthT = clamp(cam.depthT - e.deltaY * TUNE.descendSpeed, -TUNE.depth - 60, -2);
}, { passive: false });

/* ============================================================ near set
   Which files get to be real geometry. Rebuilt on a timer rather than every
   frame -- at 40k files a full distance sort is the most expensive thing in
   the app, and nothing about the result changes in 8 frames. */
let nearSet = [];
let nearAt = 0;
const GRID = 64;
const grid = new Map();
const cellKey = (x, y, z) =>
  (Math.floor(x / GRID) * 73856093 ^ Math.floor(y / GRID) * 19349663 ^ Math.floor(z / GRID) * 83492791);
for (const f of files) {
  const k = cellKey(f.x, f.y, f.z);
  let c = grid.get(k);
  if (!c) grid.set(k, c = []);
  c.push(f);
}

function rebuildNear() {
  const R = TUNE.meshFar;
  const cand = [];
  const cx = Math.floor(cam.pos.x / GRID), cy = Math.floor(cam.pos.y / GRID), cz = Math.floor(cam.pos.z / GRID);
  const span = Math.ceil(R / GRID);
  for (let i = -span; i <= span; i++)
    for (let j = -span; j <= span; j++)
      for (let k = -span; k <= span; k++) {
        const c = grid.get((cx + i) * 73856093 ^ (cy + j) * 19349663 ^ (cz + k) * 83492791);
        if (!c) continue;
        for (const f of c) {
          const d = Math.hypot(f.x - cam.pos.x, f.y - cam.pos.y, f.z - cam.pos.z);
          if (d < R) cand.push([d, f]);
        }
      }
  /* big fish earn their geometry from further away -- a whale at 140 units is
     more worth drawing than a 2 KB file at 12 */
  cand.sort((a, b) => (a[0] / (0.4 + a[1].scale)) - (b[0] / (0.4 + b[1].scale)));
  nearSet = cand.slice(0, TUNE.meshBudget).map(c => c[1]);
}

/* ============================================================ HUD */
const elYou = $("#you"), elYouT = elYou.querySelector("i"), elYouS = elYou.querySelector("s");
const elPlaceN = $("#place-n"), elPlaceS = $("#place-s");
const elLod = $("#lodline");
const elCardN = $("#c-nm"), elCardF = $("#c-fn"), elCardP = $("#c-pa");

{  /* the gauge is a calendar: one tick per year, spaced by the age curve */
  const g = $("#gauge");
  for (let y = 0; y <= TUNE.years; y += TUNE.years > 8 ? 2 : 1) {
    const t = Math.pow(clamp(y / TUNE.years, 0, 1), TUNE.ageCurve);
    const d = document.createElement("div");
    d.className = "tick";
    d.style.top = (t * 100).toFixed(2) + "%";
    const now = new Date().getFullYear();
    d.innerHTML = "<b>" + (y === 0 ? "now" : now - y) + "</b>";
    g.appendChild(d);
  }
}

const PRE = ["Brass", "Dappled", "Salt", "Moon", "Bramble", "Pocket", "Rusted", "Velvet", "Paper",
  "Hollow", "Lantern", "Speckled", "Drowsy", "Copper", "Cobble", "Midnight", "Sunday", "Wobbly"];
const NOUN = ["Perch", "Tuna", "Turbot", "Eel", "Puffer", "Hound", "Angler"];
const fishName = f => PRE[(f.hash >>> 13) % PRE.length] + " " + NOUN[f.arch];

function relAge(days) {
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  if (days < 30) return Math.round(days) + " days ago";
  if (days < 365) return Math.round(days / 30) + " months ago";
  const y = days / 365;
  return (y < 2 ? "a year ago" : Math.round(y) + " years ago");
}

/* ============================================================ picking */
const ray = new Raycaster();
ray.params.Points.threshold = 0.6;
const centre = new Vector2(0, 0);
let aimed = null, aimAt = 0;

function pick() {
  ray.setFromCamera(centre, camera);
  ray.far = TUNE.meshFar;
  const hits = ray.intersectObjects(insts, false);
  if (!hits.length) return null;
  for (const h of hits) {
    const id = h.object.userData.ids[h.instanceId];
    if (id >= 0) return files[id];
  }
  return null;
}

/* ============================================================ loop */
const dummy = new Object3D();
const tmpQ = new Quaternion(), tmpM = new Matrix4();
let W = 0, H = 0, last = performance.now(), t = 0;
let dpr = Math.min(devicePixelRatio || 1, 2);

function frame(nowMs) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (nowMs - last) / 1000); last = nowMs; t += dt;

  const w = innerWidth, h = innerHeight;
  if (w !== W || h !== H) {
    W = w; H = h;
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const px = dpr;
    pointMat.uniforms.uH.value = h * 0.5; pointMat.uniforms.uPx.value = px;
    hazeMat.uniforms.uH.value = h * 0.5; hazeMat.uniforms.uPx.value = px;
    snowMat.uniforms.uH.value = h * 0.5; snowMat.uniforms.uPx.value = px;
  }

  /* --- camera ---------------------------------------------------------- */
  const k = 1 - Math.exp(-dt * TUNE.damp);
  cam.yaw += (cam.yawT - cam.yaw) * k;
  cam.pitch += (cam.pitchT - cam.pitch) * k;

  const boost = keys.has("shift") ? TUNE.boost : 1;
  let fx = 0, fz = 0;
  if (keys.has("w") || keys.has("arrowup")) fz += 1;
  if (keys.has("s") || keys.has("arrowdown")) fz -= 1;
  if (keys.has("a") || keys.has("arrowleft")) fx -= 1;
  if (keys.has("d") || keys.has("arrowright")) fx += 1;
  if (keys.has("q")) cam.depthT = clamp(cam.depthT - 260 * dt, -TUNE.depth - 60, -2);
  if (keys.has("e")) cam.depthT = clamp(cam.depthT + 260 * dt, -TUNE.depth - 60, -2);

  const sinY = Math.sin(cam.yaw), cosY = Math.cos(cam.yaw);
  const want = new Vector3(
    (-sinY * fz + cosY * fx) * TUNE.driftSpeed * boost, 0,
    (-cosY * fz - sinY * fx) * TUNE.driftSpeed * boost);
  cam.vel.lerp(want, k);
  cam.pos.x += cam.vel.x * dt;
  cam.pos.z += cam.vel.z * dt;
  cam.pos.y += (cam.depthT - cam.pos.y) * (1 - Math.exp(-dt * 2.6));
  /* stay inside the field: past the rim there is nothing to look at */
  const rad = Math.hypot(cam.pos.x, cam.pos.z), lim = TUNE.lateral * 1.5;
  if (rad > lim) { cam.pos.x *= lim / rad; cam.pos.z *= lim / rad; }

  camera.position.copy(cam.pos);
  camera.rotation.set(0, 0, 0);
  camera.rotateY(cam.yaw);
  camera.rotateX(cam.pitch);

  /* --- water colour and murk ------------------------------------------- */
  water.copy(waterAt(cam.pos.y));
  renderer.setClearColor(water, 1);
  const fog = lerp(TUNE.fogNear, TUNE.fogDeep, clamp(-cam.pos.y / TUNE.depth, 0, 1));
  pointMat.uniforms.uFog.value = fog;
  fishMat.uniforms.uFog.value = fog;
  surfMat.uniforms.uTime.value = t;
  surfMat.uniforms.uWater.value.copy(water).lerp(new Color(0x2f89a8), 0.5);
  for (const m of rayMats) m.uniforms.uTime.value = t;

  /* --- marine snow follows the camera ---------------------------------- */
  {
    const a = snow.geometry.attributes.position;
    for (let i = 0; i < TUNE.snow; i++) {
      let y = snowPos[i * 3 + 1] - dt * 1.4;
      let x = snowPos[i * 3], z = snowPos[i * 3 + 2];
      /* wrap into a 90-unit box centred on the camera */
      const dx = x + cam.pos.x, dy = y + cam.pos.y, dz = z + cam.pos.z;
      void dx; void dy; void dz;
      if (y < -45) y += 90;
      snowPos[i * 3 + 1] = y;
      a.array[i * 3] = x + cam.pos.x;
      a.array[i * 3 + 1] = y + cam.pos.y;
      a.array[i * 3 + 2] = z + cam.pos.z;
    }
    a.needsUpdate = true;
  }

  /* --- near tier -------------------------------------------------------- */
  if (nowMs - nearAt > 130) { nearAt = nowMs; rebuildNear(); }
  const counts = new Array(ARCH.length).fill(0);
  for (const m of insts) m.userData.ids.fill(-1);
  for (const f of nearSet) {
    const mesh = insts[f.arch];
    const i = counts[f.arch];
    if (i >= CAP) continue;
    /* a lazy swim: a little sway, a little heading drift */
    const ph = t * f.speed + f.phase;
    const yaw = ph * 0.42;
    const bob = Math.sin(ph * 1.7) * f.scale * 0.10;
    dummy.position.set(
      f.x + Math.cos(yaw) * f.scale * 0.9,
      f.y + bob,
      f.z + Math.sin(yaw) * f.scale * 0.9);
    dummy.rotation.set(0, -yaw + Math.PI / 2, Math.sin(ph * 2.4) * 0.08);
    dummy.scale.setScalar(f.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    const c = famColor[f.fam];
    mesh.userData.tint[i * 3] = c.r;
    mesh.userData.tint[i * 3 + 1] = c.g;
    mesh.userData.tint[i * 3 + 2] = c.b;
    mesh.userData.ids[i] = f.index;
    counts[f.arch] = i + 1;
  }
  insts.forEach((m, i) => {
    m.count = counts[i];
    m.instanceMatrix.needsUpdate = true;
    m.geometry.attributes.tint.needsUpdate = true;
  });
  void tmpQ; void tmpM;

  /* --- HUD -------------------------------------------------------------- */
  const depthPct = clamp(-cam.pos.y / TUNE.depth, 0, 1);
  elYou.style.top = (depthPct * 100).toFixed(2) + "%";
  const ageDays = yToAge(cam.pos.y);
  elYouT.textContent = ageDays < 1 ? "today" : relAge(ageDays);
  elYouS.textContent = Math.round(-cam.pos.y) + " m";

  /* nearest place, by distance to its column */
  let bestP = null, bestD = 1e9;
  for (const p of places) {
    if (!p.files.length) continue;
    const d = Math.hypot(p.cx - cam.pos.x, p.cz - cam.pos.z) - p.r;
    if (d < bestD) { bestD = d; bestP = p; }
  }
  if (bestP) {
    elPlaceN.textContent = bestD < 0 ? (bestP.name || "the ocean") : "—";
    elPlaceS.textContent = bestD < 0
      ? fmtCount(bestP.files.length) + " files · " + fmtBytes(bestP.files.reduce((a, f) => a + f.size, 0))
      : "open water";
  }
  elLod.textContent = "tier · " +
    (depthPct >= 0 && nearSet.length > 40 ? "fish" : nearSet.length ? "specks" : "haze");

  /* --- pick ------------------------------------------------------------- */
  if (nowMs - aimAt > 90) {
    aimAt = nowMs;
    aimed = pick();
    document.body.classList.toggle("aimed", !!aimed);
    if (aimed) {
      elCardN.textContent = fishName(aimed);
      elCardF.textContent = aimed.name + "  ·  " + fmtBytes(aimed.size);
      elCardP.textContent = aimed.path + "  ·  " + relAge(aimed.ageDays);
    }
  }

  renderer.render(scene, camera);
}

/* live handle: tweak TUNE in the console, or fly the camera somewhere.
   Most of TUNE is read every frame, so changes show up immediately; the
   layout numbers (lateral, ageCurve, years) are baked at load. */
window.ocean = { TUNE, cam, files, places, ARCH };

$("#loading").hidden = true;
$("#intro").addEventListener("click", () => {
  $("#intro").classList.add("gone");
  setTimeout(() => $("#intro").remove(), 600);
});
requestAnimationFrame(frame);
