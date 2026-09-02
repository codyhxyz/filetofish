import { sfx, isOn, setOn, audio } from "./sfx.js";
import {
  initMusic, setMusicTrack, nextMusicTrack, getMusicTrack,
  syncMusicToTime, setMusicSoundOn, getMusicVolume, setMusicVolume, duckMusic
} from "./music.js";
import { Sea, WEATHERS, weatherForDate } from "./sea.js";
import {
  Scene, PerspectiveCamera, OrthographicCamera, WebGLRenderer, Mesh, Group,
  BufferGeometry, BufferAttribute, ShaderMaterial, SphereGeometry, ConeGeometry, PlaneGeometry,
  WebGLRenderTarget, NearestFilter, Color, Vector2, Vector3, Box3, DoubleSide, Points,
} from "three";

const TAU = Math.PI * 2;
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function fnv1a(bytes, seed) {
  let h = (seed >>> 0) || 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
const strBytes = s => { const a = []; for (let i = 0; i < s.length; i++) a.push(s.charCodeAt(i) & 255); return a; };
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function fmtBytes(n) {
  if (n < 1024) return n + " B";
  const u = ["KB", "MB", "GB", "TB"]; let i = -1, v = n;
  while (v >= 1024 && i < 3) { v /= 1024; i++; }
  return (v < 10 ? v.toFixed(1) : Math.round(v)) + " " + u[i];
}
const hex32 = n => "0x" + n.toString(16).toUpperCase().padStart(8, "0");

/* ============================================================ genome */
const FAMILIES = [
  { mime: /^image\//, ext: /^(heic|heif|jpe?g|png|gif|webp|svg|tiff?|avif|bmp|dng)$/i, hue: 18 },
  { mime: /^video\//, ext: /^(mov|mp4|m4v|mkv|avi|webm|prores|mpe?g)$/i, hue: 254 },
  { mime: /^audio\//, ext: /^(mp3|wav|m4a|flac|aiff?|ogg|opus|aac)$/i, hue: 312 },
  { mime: /^text\/|json|javascript|typescript|\+xml/, ext: /^(tsx?|jsx?|py|rs|go|c|h|cpp|css|html?|md|txt|json|xml|ya?ml|sh)$/i, hue: 132 },
  { mime: /pdf|msword|wordprocessing|presentation|spreadsheet|opendocument/, ext: /^(pdf|docx?|xlsx?|pptx?|pages|key|numbers|epub|rtf)$/i, hue: 40 },
  { mime: /zip|compress|x-tar|gzip|rar|7z|diskimage/, ext: /^(zip|tar|gz|bz2|rar|7z|dmg|iso|pkg)$/i, hue: 202 },
  { mime: /^font\//, ext: /^(woff2?|ttf|otf|eot)$/i, hue: 336 },
];
const PRE = ["Brass", "Dappled", "Salt", "Moon", "Bramble", "Pocket", "Rusted", "Velvet", "Paper", "Hollow",
  "Lantern", "Speckled", "Drowsy", "Copper", "Cobble", "Midnight", "Sunday", "Wobbly", "Glass", "Thimble",
  "Marbled", "Quiet", "Tin", "Wandering", "Bitter", "Harbour", "Fenwick", "Ashen", "Gilded", "Sallow"];
const NOUN = {
  perch: ["Perch", "Bream", "Roach", "Rudd", "Dace", "Chub", "Tench", "Ruffe"],
  torpedo: ["Tuna", "Mackerel", "Bonito", "Swordfish", "Marlin", "Scad"],
  flat: ["Turbot", "Sole", "Flounder", "Dory", "Pomfret", "Moonfish"],
  eel: ["Eel", "Lamprey", "Conger", "Gunnel", "Snakefish"],
  puffer: ["Puffer", "Blowfish", "Lumpsucker", "Globefish"],
  shark: ["Shark", "Dogfish", "Hound", "Tope"],
  angler: ["Angler", "Monkfish", "Toadfish", "Sculpin", "Grouper"],
};

/* archetypes give categorical variety -- jittering one shape only ever reads as one fish */
const ARCH = [
  { key: "perch", w: 20, pF: [.50, .74], pB: [.74, 1.02], dep: [.36, .52], gir: [.17, .26], tails: ["fan", "spade", "round"], dor: [.16, .28], stretch: [1, 1.08] },
  { key: "torpedo", w: 15, pF: [.55, .78], pB: [.95, 1.35], dep: [.24, .34], gir: [.16, .23], tails: ["fork"], dor: [.10, .17], stretch: [1.14, 1.3], bill: .6, dor2: 1 },
  { key: "flat", w: 14, pF: [.62, .88], pB: [.66, .90], dep: [.62, .86], gir: [.09, .14], tails: ["fan", "round"], dor: [.22, .34], stretch: [.82, .94] },
  { key: "eel", w: 11, pF: [.34, .50], pB: [.36, .56], dep: [.12, .18], gir: [.10, .15], tails: ["round"], dor: [.05, .09], stretch: [1.5, 1.8], barbel: .7 },
  { key: "puffer", w: 11, pF: [.88, 1.15], pB: [.88, 1.15], dep: [.54, .70], gir: [.42, .58], tails: ["fan"], dor: [.07, .12], stretch: [.72, .84], spikes: 1 },
  { key: "shark", w: 12, pF: [.56, .78], pB: [1.02, 1.42], dep: [.26, .37], gir: [.17, .25], tails: ["fork"], dor: [.32, .46], stretch: [1.2, 1.4], dor2: 1 },
  { key: "angler", w: 12, pF: [.28, .44], pB: [.98, 1.42], dep: [.44, .60], gir: [.25, .36], tails: ["round", "spade"], dor: [.10, .18], stretch: [.90, 1.0], lure: .8, barbel: .35 },
];
const ARCH_TOTAL = ARCH.reduce((a, b) => a + b.w, 0);
const PATTERNS = ["plain", "bands", "spots", "stripe"];

/* the hash makes infinite individuals, so the finite thing to complete is the
   species table: archetype x noun, plus the zero-byte ghost. */
const SPECIES = [];
for (const a of ARCH)
  NOUN[a.key].forEach((noun, i) => SPECIES.push({ key: a.key + "/" + i, arch: a.key, noun }));
SPECIES.push({ key: "special/ghost", arch: "special", noun: "Ghost Minnow" });
const SPECIES_INDEX = new Map(SPECIES.map((s, i) => [s.key, i]));
const RANK = { Common: 1, Uncommon: 2, Rare: 3, Legendary: 4, Mythic: 5 };
/* ink colour of the silhouette pass + how hard the sheen sweeps */
const RARE_LOOK = {
  Common:    { ink: [0.043, 0.062, 0.070], sheen: 0.0,  css: "#DCE7E9" },
  Uncommon:  { ink: [0.035, 0.105, 0.098], sheen: 0.0,  css: "#7FD6C4" },
  Rare:      { ink: [0.075, 0.180, 0.520], sheen: 0.22, css: "#8AB6FF" },
  Legendary: { ink: [0.330, 0.130, 0.560], sheen: 0.42, css: "#C79BFF" },
  Mythic:    { ink: [0.820, 0.560, 0.130], sheen: 0.70, css: "#FFC24A" },
};

function makeFish(meta, forcedHash) {
  const ext = (meta.name.split(".").pop() || "").toLowerCase();
  const mime = meta.type || "";
  const fam = (mime && FAMILIES.find(f => f.mime.test(mime))) || FAMILIES.find(f => f.ext.test(ext)) || { hue: 196 };
  const h1 = fnv1a(strBytes(meta.name + "|" + meta.size + "|" + mime));
  const h2 = forcedHash != null ? (forcedHash >>> 0) : fnv1a(meta.bytes || [], h1);
  const r = mulberry32(h2 ^ 0x9E3779B9);
  const R = ([a, b]) => a + r() * (b - a);

  let pick = (h2 >>> 9) % ARCH_TOTAL, A = ARCH[0];
  for (const a of ARCH) { if (pick < a.w) { A = a; break; } pick -= a.w; }

  const lz = Math.clz32(h2);
  const f = {
    file: meta, hash: h2, arch: A.key,
    rarity: lz >= 8 ? "Mythic" : lz >= 5 ? "Legendary" : lz >= 3 ? "Rare" : lz >= 1 ? "Uncommon" : "Common",
    ghost: meta.size === 0,
    pFront: R(A.pF), pBack: R(A.pB), depth: R(A.dep), girth: R(A.gir), stretch: R(A.stretch),
    belly: 1.02 + r() * 0.44, arch2: 0.02 + r() * 0.07, headRound: 0.20 + r() * 0.34,
    tail: A.tails[(h2 >>> 3) % A.tails.length],
    tailLen: 0.26 + r() * 0.26, tailH: 0.28 + r() * 0.30,
    dorsalH: R(A.dor), dorsalA: 0.26 + r() * 0.10, dorsalB: 0.58 + r() * 0.16,
    analH: 0.08 + r() * 0.11, pectH: 0.12 + r() * 0.11,
    eyeR: 0.052 + r() * 0.034,
    bill: A.bill && r() < A.bill, spikes: !!A.spikes,
    lure: A.lure && r() < A.lure, barbel: A.barbel && r() < A.barbel, dor2: !!A.dor2,
    pattern: PATTERNS[(h2 >>> 6) % 4], patFreq: 6 + r() * 12,
    hue: (fam.hue + (r() * 44 - 22) + 360) % 360,
    sat: 16 + r() * 22,          // muted: OSRS never goes saturated
    lig: 34 + r() * 20,
    wobble: r(),
  };
  f.cm = clamp(3 + Math.log2(meta.size + 1) * 2.7, 2, 170) * (meta.size > 5e8 ? 1.45 : 1);
  /* the promise of the whole thing: bigger file, bigger animal */
  const st = clamp(Math.log2(meta.size + 1) / 31, 0, 1);
  f.scale01 = 0.50 + 0.50 * st;
  f.icon01 = 0.72 + 0.28 * st;
  const nouns = NOUN[A.key];
  const ni = (h2 >>> 19) % nouns.length;
  f.noun = nouns[ni];
  f.speciesKey = f.ghost ? "special/ghost" : A.key + "/" + ni;
  f.name = f.ghost ? "Ghost Minnow" : PRE[(h2 >>> 13) % PRE.length] + " " + f.noun;
  if (f.ghost) { f.rarity = "Mythic"; f.sat = 6; f.lig = 68; f.noun = "Ghost Minnow"; }
  return f;
}

/* ============================================================ geometry */
function peakOf(f) {
  let m = 1e-6;
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    m = Math.max(m, Math.pow(Math.pow(t, f.pFront) * Math.pow(1 - t, f.pBack), 0.85));
  }
  return m;
}
function radiusAt(t, f, peak) {
  const a = Math.pow(clamp(t, 0, 1), f.pFront), b = Math.pow(clamp(1 - t, 0, 1), f.pBack);
  return Math.max(Math.pow(a * b, 0.85) / peak * 0.90 + 0.145 * Math.pow(1 - t, 1.15), 0.075);
}
const spineY = (t, f) => f.arch2 * Math.sin(t * Math.PI) - f.arch2 * 0.35;
const spineX = (t, f) => (-1 + t * 2) * f.stretch;

function bodyPoint(t, th, f, peak) {
  const r = radiusAt(t, f, peak), s = Math.sin(th), c = Math.cos(th);
  const wM = 1 + f.headRound * Math.pow(1 - t, 2.2);
  return [spineX(t, f), r * f.depth * s * (s < 0 ? f.belly : 1) + spineY(t, f), r * f.girth * wM * c];
}

/* non-indexed triangles -> computeVertexNormals gives hard per-face normals */
function triGeom(v) {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(v), 3));
  g.computeVertexNormals();
  return g;
}
/* normals point away from the spine regardless of winding; body renders DoubleSide */
function orientOutward(g) {
  const p = g.attributes.position.array, n = g.attributes.normal.array;
  for (let i = 0; i < p.length; i += 9) {
    const cy = (p[i + 1] + p[i + 4] + p[i + 7]) / 3, cz = (p[i + 2] + p[i + 5] + p[i + 8]) / 3;
    if (n[i + 1] * cy + n[i + 2] * cz < 0)
      for (let k = 0; k < 9; k++) n[i + k] *= -1;
  }
  g.attributes.normal.needsUpdate = true;
  return g;
}

function bodyGeometry(f) {
  const SEG = 11, RING = 7, peak = peakOf(f), v = [];
  const P = (i, j) => bodyPoint(i / SEG, (j % RING) / RING * TAU, f, peak);
  for (let i = 0; i < SEG; i++) for (let j = 0; j < RING; j++) {
    const a = P(i, j), b = P(i, j + 1), c = P(i + 1, j), d = P(i + 1, j + 1);
    v.push(...a, ...c, ...b, ...b, ...c, ...d);
  }
  const nose = [spineX(0, f) - 0.03 * f.stretch, spineY(0, f), 0];
  const tail = [spineX(1, f), spineY(1, f), 0];
  for (let j = 0; j < RING; j++) {
    v.push(...nose, ...P(0, j), ...P(0, j + 1));
    v.push(...tail, ...P(SEG, j + 1), ...P(SEG, j));
  }
  return orientOutward(triGeom(v));
}

function fanGeom(root, outline) {
  const v = [];
  for (let i = 0; i < outline.length - 1; i++)
    v.push(root[0], root[1], 0, outline[i][0], outline[i][1], 0, outline[i + 1][0], outline[i + 1][1], 0);
  return triGeom(v);
}

function tailGeometry(f) {
  const N = 9, out = [], L = f.tailLen, H = f.tailH, X = spineX(1, f);
  const cfg = { fan: [0.30, 1.7], fork: [0.62, 2.3], round: [0.02, 1], spade: [0.10, 5.0] }[f.tail];
  for (let i = 0; i <= N; i++) {
    const u = -1 + (i / N) * 2, au = Math.abs(u);
    let x, y = u * H;
    if (f.tail === "round") { x = X + L * 0.18 + L * Math.sqrt(Math.max(0, 1 - u * u)); y = u * H * 0.92; }
    else x = X + L * (1 - cfg[0] * (1 - Math.pow(au, cfg[1])));
    out.push([x, y + spineY(1, f)]);
  }
  return fanGeom([X - 0.06, spineY(1, f)], out);
}

function ridgeGeometry(f, t0, t1, height, up) {
  const N = 7, peak = peakOf(f), v = [];
  const pt = s => {
    const t = lerp(t0, t1, s), r = radiusAt(t, f, peak);
    const edge = up ? r * f.depth + spineY(t, f) : -r * f.depth * f.belly + spineY(t, f);
    const h = height * Math.pow(Math.sin(s * Math.PI), 0.62);
    return [[spineX(t, f), edge], [spineX(t, f) + (up ? -0.03 : 0.02), edge + (up ? h : -h)]];
  };
  for (let i = 0; i < N; i++) {
    const [a0, a1] = pt(i / N), [b0, b1] = pt((i + 1) / N);
    v.push(a0[0], a0[1], 0, a1[0], a1[1], 0, b0[0], b0[1], 0);
    v.push(a1[0], a1[1], 0, b1[0], b1[1], 0, b0[0], b0[1], 0);
  }
  return triGeom(v);
}

function pectoralGeometry(f) {
  const N = 7, out = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    out.push([-u * 0.36, -Math.sin(u * Math.PI) * f.pectH * 1.15 - u * 0.06]);
  }
  return fanGeom([0.02, 0.015], out);
}

/* ============================================================ materials */
const FISH_VERT = `
varying vec3 vN, vW, vO;
void main(){
  vO = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

/* hard 4-step lamp, no specular, muted -- reads like a 2007 low-poly item model */
const FISH_FRAG = `
precision highp float;
uniform vec3 uBase, uBelly, uBack, uMark;
uniform float uPattern, uPatFreq, uGhost;
varying vec3 vN, vW, vO;

float h31(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
float n31(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x), mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x), f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x), mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x), f.y), f.z);
}
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  if (dot(N, V) < 0.0) N = -N;

  /* pattern is sampled on a coarse grid so it blocks up with the facets */
  vec3 q = floor(vO * 13.0) / 13.0;
  vec3 alb = uBase;
  alb = mix(alb, uBack,  smoothstep(0.05, 0.30, q.y));
  alb = mix(alb, uBelly, smoothstep(-0.11, -0.30, q.y));
  if (uPattern > 0.5 && uPattern < 1.5)      alb = mix(alb, uMark, step(0.62, sin(q.x * uPatFreq) * 0.5 + 0.5) * 0.9);
  else if (uPattern > 1.5 && uPattern < 2.5) alb = mix(alb, uMark, step(0.60, n31(q * uPatFreq * 0.55)));
  else if (uPattern > 2.5)                   alb = mix(alb, uMark, 1.0 - step(0.055, abs(q.y + 0.015)));

  float k = dot(N, normalize(vec3(0.42, 0.80, 0.46))) * 0.5 + 0.5;
  float band = floor(clamp(k, 0.0, 0.999) * 4.0) / 3.0;
  vec3 col = alb * (0.34 + 0.88 * band);
  gl_FragColor = vec4(mix(col, vec3(0.78, 0.86, 0.88), uGhost * 0.6), 1.0);
}`;

const FLAT_VERT = `void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FLAT_FRAG = `precision mediump float; uniform vec3 uC; void main(){ gl_FragColor = vec4(uC, 1.0); }`;
const flatMat = hex => new ShaderMaterial({
  vertexShader: FLAT_VERT, fragmentShader: FLAT_FRAG, uniforms: { uC: { value: new Color(hex) } },
});

function buildFish(f) {
  const C = (h, s, l) => new Color().setHSL((((h % 360) + 360) % 360) / 360, clamp(s, 0, 100) / 100, clamp(l, 0, 100) / 100);
  const uniforms = {
    uBase: { value: C(f.hue, f.sat, f.lig) },
    uBelly: { value: C(f.hue - 8, f.sat * 0.45, f.lig + 20) },
    uBack: { value: C(f.hue + 3, f.sat + 8, f.lig - 13) },
    uMark: { value: C(f.hue + ((f.hash >>> 21) % 44) - 22, f.sat + 16, f.lig - 22) },
    uPattern: { value: PATTERNS.indexOf(f.pattern) },
    uPatFreq: { value: f.patFreq },
    uGhost: { value: f.ghost ? 1 : 0 },
  };
  const mat = new ShaderMaterial({ vertexShader: FISH_VERT, fragmentShader: FISH_FRAG, uniforms, side: DoubleSide });
  const inner = new Group(), geos = [];
  const add = (geo, m) => { geos.push(geo); const mesh = new Mesh(geo, m || mat); inner.add(mesh); return mesh; };
  const peak = peakOf(f);

  add(bodyGeometry(f));
  add(tailGeometry(f));
  add(ridgeGeometry(f, f.dorsalA, f.dorsalB, f.dorsalH, true));
  if (f.dor2) add(ridgeGeometry(f, f.dorsalB + 0.06, Math.min(0.94, f.dorsalB + 0.24), f.dorsalH * 0.42, true));
  add(ridgeGeometry(f, 0.60, 0.80, f.analH, false));

  for (const s of [1, -1]) {
    const p = add(pectoralGeometry(f));
    const t = 0.34, rp = radiusAt(t, f, peak), wm = 1 + f.headRound * Math.pow(1 - t, 2.2);
    p.position.set(spineX(t, f), spineY(t, f) - rp * f.depth * 0.10, s * rp * f.girth * wm * 0.86);
    p.rotation.set(s * 0.62, 0, -0.18);
  }

  // eyes
  const et = 0.215, rr = radiusAt(et, f, peak), wM = 1 + f.headRound * Math.pow(1 - et, 2.2);
  const eR = clamp(f.eyeR * (0.5 + rr * 0.9), 0.028, 0.072);
  const ex = spineX(et, f), ey = rr * f.depth * 0.52 + spineY(et, f), ez = rr * f.girth * wM * 0.80;
  const eyeGeo = new SphereGeometry(eR, 7, 5), pupGeo = new SphereGeometry(eR * 0.60, 6, 4);
  geos.push(eyeGeo, pupGeo);
  for (const s of [1, -1]) {
    const w = new Mesh(eyeGeo, flatMat(0xE8E4D6)); w.position.set(ex, ey, s * ez); inner.add(w);
    const p = new Mesh(pupGeo, flatMat(0x14100E));
    p.position.set(ex - eR * 0.12, ey, s * (ez + eR * 0.46)); inner.add(p);
  }

  // swordfish bill
  if (f.bill) {
    const g = new ConeGeometry(0.035, 0.52, 5); geos.push(g);
    const m = new Mesh(g, mat);
    m.position.set(spineX(0, f) - 0.24, spineY(0, f), 0);
    m.rotation.z = Math.PI / 2; inner.add(m);
  }
  // puffer spikes
  if (f.spikes) {
    const g = new ConeGeometry(0.052, 0.24, 4); geos.push(g);
    const rr2 = mulberry32(f.hash ^ 0x5bf03635);
    for (let i = 0; i < 13; i++) {
      const t = 0.18 + rr2() * 0.6, th = rr2() * TAU;
      const p = bodyPoint(t, th, f, peak);
      const m = new Mesh(g, mat);
      m.position.set(p[0], p[1] * 1.02, p[2] * 1.02);
      m.rotation.set(Math.PI / 2 - th, 0, 0);
      inner.add(m);
    }
  }
  // anglerfish lure
  if (f.lure) {
    const stalk = new ConeGeometry(0.016, 0.44, 4), bulb = new SphereGeometry(0.055, 6, 4);
    geos.push(stalk, bulb);
    const s = new Mesh(stalk, mat);
    s.position.set(spineX(0.24, f), radiusAt(0.24, f, peak) * f.depth + 0.20, 0);
    s.rotation.z = 0.42; inner.add(s);
    const b = new Mesh(bulb, flatMat(0xD9CE9A));
    b.position.set(s.position.x - 0.18, s.position.y + 0.19, 0); inner.add(b);
  }
  // barbels
  if (f.barbel) {
    const g = new ConeGeometry(0.014, 0.26, 4); geos.push(g);
    for (const s of [1, -1]) {
      const m = new Mesh(g, mat);
      m.position.set(spineX(0.06, f) + 0.04, spineY(0.06, f) - 0.07, s * 0.045);
      m.rotation.set(s * 0.5, 0, 2.5); inner.add(m);
    }
  }

  /* centre on the real bounding box; the caller fits it to the viewport */
  const box = new Box3().setFromObject(inner);
  const c = box.getCenter(new Vector3()), size = box.getSize(new Vector3());
  inner.position.sub(c);
  const outer = new Group();
  outer.add(inner);
  return { group: outer, size, dispose() { geos.forEach(g => g.dispose()); mat.dispose(); } };
}

/* ============================================================ fish renderer + GameCube post */
const POST_FRAG = `
precision highp float;
uniform sampler2D tMap; uniform vec2 uRT; uniform float uLevels;
uniform vec3 uInk; uniform float uSheen, uTime;
uniform vec3 uLight; uniform float uAmb;      /* the sky's light, so the catch sits in it */
varying vec2 vUv;
float b2(vec2 a){ a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float b8(vec2 a){ return b2(0.25*a)*0.0625 + b2(0.5*a)*0.25 + b2(a); }
void main(){
  vec2 px = 1.0 / uRT;
  vec4 s = texture2D(tMap, vUv);
  if (s.a < 0.5){
    /* silhouette ink, item-icon style: transparent texel touching an opaque one */
    float n = max(max(texture2D(tMap, vUv + vec2(px.x, 0.0)).a, texture2D(tMap, vUv - vec2(px.x, 0.0)).a),
                  max(texture2D(tMap, vUv + vec2(0.0, px.y)).a, texture2D(tMap, vUv - vec2(0.0, px.y)).a));
    if (n < 0.5) discard;
    gl_FragColor = vec4(uInk * mix(vec3(1.0), uLight * uAmb, 0.5), 1.0);
    return;
  }
  vec3 c = s.rgb * uLight * uAmb;
  if (uSheen > 0.001){
    float band = sin((vUv.x * 1.4 + vUv.y) * 7.0 - uTime * 1.8);
    c += uSheen * pow(max(band, 0.0), 7.0) * 0.85;
  }
  float L = uLevels - 1.0;
  gl_FragColor = vec4(floor(c * L + b8(floor(vUv * uRT))) / L, 1.0);
}`;

function FishStage(canvas) {
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 1.05, 3.35);
  camera.lookAt(0, 0, 0);

  const post = new Scene();
  const postCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const postMat = new ShaderMaterial({
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: POST_FRAG, transparent: true,
    uniforms: {
      tMap: { value: null }, uRT: { value: new Vector2(1, 1) }, uLevels: { value: 5 },
      uInk: { value: new Color(0x0B1012) }, uSheen: { value: 0 }, uTime: { value: 0 },
      uLight: { value: new Vector3(1, 1, 1) }, uAmb: { value: 1 },
    },
  });
  post.add(new Mesh(new PlaneGeometry(2, 2), postMat));
  const rt = new WebGLRenderTarget(4, 4, { minFilter: NearestFilter, magFilter: NearestFilter });

  /* offscreen pair for icon capture: scene -> dither/ink -> readback */
  const SW = 88, SH = 66;
  const nearest = { minFilter: NearestFilter, magFilter: NearestFilter };
  const sprA = new WebGLRenderTarget(SW, SH, nearest), sprB = new WebGLRenderTarget(SW, SH, nearest);
  const sprCam = new PerspectiveCamera(34, SW / SH, 0.1, 100);
  sprCam.position.set(0, 1.05, 3.35); sprCam.lookAt(0, 0, 0);
  const sprBuf = new Uint8Array(SW * SH * 4);
  const sprCv = document.createElement("canvas"); sprCv.width = SW; sprCv.height = SH;
  const sprCtx = sprCv.getContext("2d");

  let fish = null, W = 0, H = 0, spin = 0, dragV = 0, drag = null;
  let look = RARE_LOOK.Common, sizeK = 1;
  const lightRGB = [1, 1, 1]; let lightAmb = 1;

  /* droplets and sparks live in the same scene, so they ride the same dither +
     silhouette-ink pass and look native rather than pasted on */
  const MAXP = 110, parts = [];
  const pPos = new Float32Array(MAXP * 3), pCol = new Float32Array(MAXP * 3), pOn = new Float32Array(MAXP);
  const pGeo = new BufferGeometry();
  pGeo.setAttribute("position", new BufferAttribute(pPos, 3));
  pGeo.setAttribute("c", new BufferAttribute(pCol, 3));
  pGeo.setAttribute("on", new BufferAttribute(pOn, 1));
  const pMat = new ShaderMaterial({
    vertexShader: `
      attribute vec3 c; attribute float on;
      varying vec3 vC; varying float vOn;
      uniform float uSize, uH;
      void main(){
        vC = c; vOn = on;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.0, uSize * uH / max(0.25, -mv.z));
      }`,
    fragmentShader: `
      precision mediump float;
      varying vec3 vC; varying float vOn;
      void main(){ if (vOn < 0.5) discard; gl_FragColor = vec4(vC, 1.0); }`,
    uniforms: { uSize: { value: 0.055 }, uH: { value: 300 } },
  });
  const pts = new Points(pGeo, pMat);
  pts.frustumCulled = false;
  scene.add(pts);

  const toWorld = (nx, ny) => {
    const hh = Math.tan(34 * Math.PI / 360) * 3.35, ww = hh * (W / Math.max(H, 1));
    return [(nx * 2 - 1) * ww, (1 - ny * 2) * hh];
  };
  function emit(x, y, n, o) {
    for (let i = 0; i < n && parts.length < MAXP; i++) {
      const a = o.dir == null ? Math.random() * TAU : o.dir + (Math.random() - 0.5) * o.spread;
      const sp = o.speed * (0.45 + Math.random() * 0.9);
      parts.push({
        x: x + (Math.random() - 0.5) * o.jitter, y: y + (Math.random() - 0.5) * o.jitter,
        z: (Math.random() - 0.5) * 0.4,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + (o.lift || 0),
        t: 0, life: o.life * (0.6 + Math.random() * 0.7), g: o.grav, col: o.col,
      });
    }
  }
  function stepParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      if (p.t >= p.life) { parts.splice(i, 1); continue; }
      p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (let i = 0; i < MAXP; i++) {
      const p = parts[i];
      if (p) {
        pPos[i * 3] = p.x; pPos[i * 3 + 1] = p.y; pPos[i * 3 + 2] = p.z;
        pCol[i * 3] = p.col[0]; pCol[i * 3 + 1] = p.col[1]; pCol[i * 3 + 2] = p.col[2];
        pOn[i] = 1;
      } else pOn[i] = 0;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.c.needsUpdate = true;
    pGeo.attributes.on.needsUpdate = true;
  }
  const DROP = [0.88, 0.96, 1.0];

  addEventListener("pointerdown", e => { if (fish) drag = e.clientX; });
  addEventListener("pointermove", e => {
    if (drag === null) return;
    dragV += (e.clientX - drag) * 0.010; drag = e.clientX;
  });
  addEventListener("pointerup", () => { drag = null; });

  return {
    /* the sea tells us what the light is doing; the catch is graded to match */
    setLight(rgb, amb) { lightRGB[0] = rgb[0]; lightRGB[1] = rgb[1]; lightRGB[2] = rgb[2]; lightAmb = amb; },
    set(f) {
      if (fish) { scene.remove(fish.group); fish.dispose(); }
      fish = buildFish(f); scene.add(fish.group); fish.group.visible = false;
      look = RARE_LOOK[f.rarity] || RARE_LOOK.Common;
      sizeK = f.scale01;
    },
    /* render one fish at the canonical item angle into an offscreen canvas */
    snapshotCanvas(f, w, h, sizeFactor) {
      w = w || SW; h = h || SH;
      const buf = (w === SW && h === SH) ? sprBuf : new Uint8Array(w * h * 4);
      sprA.setSize(w, h); sprB.setSize(w, h);
      sprCam.aspect = w / h; sprCam.updateProjectionMatrix();
      const tmp = buildFish(f);
      const wasVisible = fish ? fish.group.visible : false;
      if (fish) fish.group.visible = false;
      pts.visible = false;                       // icons show the fish alone
      scene.add(tmp.group);
      const hh = Math.tan(34 * Math.PI / 360) * 3.35, ww = hh * (w / h);
      const reach = Math.max(tmp.size.x, tmp.size.z);
      const fit = Math.min(ww * 2 * 0.88 / reach, hh * 2 * 0.82 / tmp.size.y);
      tmp.group.scale.setScalar(fit * (sizeFactor == null ? f.icon01 : sizeFactor));
      tmp.group.position.set(0, 0, 0);
      tmp.group.rotation.set(0.10, -0.40, 0);
      const lk = RARE_LOOK[f.rarity] || RARE_LOOK.Common;
      renderer.setRenderTarget(sprA); renderer.clear(); renderer.render(scene, sprCam);
      postMat.uniforms.tMap.value = sprA.texture;
      postMat.uniforms.uRT.value.set(w, h);
      postMat.uniforms.uInk.value.setRGB(lk.ink[0], lk.ink[1], lk.ink[2]);
      postMat.uniforms.uSheen.value = 0;                   // a still icon should not strobe
      postMat.uniforms.uLight.value.set(1, 1, 1);          // dex icons are lit by daylight, not tonight
      postMat.uniforms.uAmb.value = 1;
      renderer.setRenderTarget(sprB); renderer.clear(); renderer.render(post, postCam);
      renderer.readRenderTargetPixels(sprB, 0, 0, w, h, buf);
      renderer.setRenderTarget(null);
      scene.remove(tmp.group); tmp.dispose();
      pts.visible = true;
      if (fish) fish.group.visible = wasVisible;
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const cx = cv.getContext("2d");
      const img = cx.createImageData(w, h);                // GL reads bottom-up
      for (let y = 0; y < h; y++)
        img.data.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
      cx.putImageData(img, 0, 0);
      return cv;
    },
    snapshot(f) {
      try { return this.snapshotCanvas(f).toDataURL("image/png"); } catch (e) { return null; }
    },
    /* fish breaking the surface */
    splash(nx, ny) {
      const [x, y] = toWorld(nx, ny);
      emit(x, y, 22, { speed: 1.5, lift: 1.0, jitter: 0.18, life: 0.70, grav: 7.2, col: DROP });
    },
    /* it is still wet while you hold it up */
    drip(nx, ny, n) {
      const [x, y] = toWorld(nx, ny);
      emit(x, y, n || 1, { dir: -Math.PI / 2, spread: 0.6, speed: 0.25, jitter: 0.6, life: 1.1, grav: 3.2, col: DROP });
    },
    burst(nx, ny, css) {
      const c = new Color(css), [x, y] = toWorld(nx, ny);
      emit(x, y, 28, { speed: 2.2, lift: 0.3, jitter: 0.08, life: 0.70, grav: 1.4, col: [c.r, c.g, c.b] });
    },
    clearParts() { parts.length = 0; },
    /* nx/ny in viewport fractions; s is 0..1 of the fitted size */
    place(nx, ny, s, tilt, visible) {
      if (!fish) return;
      fish.group.visible = visible;
      const hh = Math.tan(34 * Math.PI / 360) * 3.35, ww = hh * (W / Math.max(H, 1));
      /* the model turns, so fit its longest axis into the shorter viewport span */
      const reach = Math.max(fish.size.x, fish.size.z);
      const fit = Math.min(ww * 2 * 0.72 / reach, hh * 2 * 0.58 / fish.size.y);
      fish.group.position.set((nx * 2 - 1) * ww, (1 - ny * 2) * hh, 0);
      fish.group.scale.setScalar(fit * s * sizeK);
      fish.group.rotation.set(0.06, spin - 0.45 * Math.sin(2 * spin), tilt);
    },
    render(dt) {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      if (w !== W || h !== H) {
        W = w; H = h;
        renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
        camera.aspect = w / h; camera.updateProjectionMatrix();
      }
      stepParts(dt);
      if ((!fish || !fish.group.visible) && !parts.length) { renderer.setRenderTarget(null); renderer.clear(); return; }
      if (!REDUCED) spin += dt * 0.42 + dragV;
      dragV *= 0.86;
      const PX = Math.max(3, Math.ceil(W * dpr / 460));   // chunky at any screen size
      const rw = Math.max(2, Math.round(W * dpr / PX)), rh = Math.max(2, Math.round(H * dpr / PX));
      pMat.uniforms.uH.value = rh;
      rt.setSize(rw, rh);
      postMat.uniforms.tMap.value = rt.texture;
      postMat.uniforms.uRT.value.set(rw, rh);
      postMat.uniforms.uInk.value.setRGB(look.ink[0], look.ink[1], look.ink[2]);
      postMat.uniforms.uSheen.value = look.sheen;
      postMat.uniforms.uLight.value.set(lightRGB[0], lightRGB[1], lightRGB[2]);
      postMat.uniforms.uAmb.value = lightAmb;
      postMat.uniforms.uTime.value += dt;
      renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, camera);
      renderer.setRenderTarget(null); renderer.clear(); renderer.render(post, postCam);
    },
  };
}


/* ============================================================ sound & music */
const elRadio = $("#radio"), elRadioNm = $("#radionm");
const elMusicVol = $("#musicvol"), elMusicVolOut = $("#musicvolout");
function syncMusicVolume(volume = getMusicVolume()) {
  const percent = Math.round(volume * 100);
  elMusicVol.value = String(percent);
  elMusicVol.style.setProperty("--volume", `${percent}%`);
  elMusicVolOut.textContent = `${percent}%`;
}
async function startMusic() {
  if (!isOn()) return;
  const c = audio();
  if (!c) return;
  initMusic(c, null, true, worldNow());
  try { await c.resume(); } catch (e) { }
  if (c.state === "running") setMusicSoundOn(true);
}
function updateRadioUI(track = getMusicTrack()) {
  if (elRadioNm && track) {
    elRadioNm.textContent = track.title;
    elRadio.title = `now playing: ${track.title} · click to change the song`;
    elRadio.setAttribute("aria-label", `Now playing ${track.title}; click to change the song`);
  }
}

function syncSound() {
  $("#snd").setAttribute("aria-pressed", String(isOn()));
  $("#sndlb").textContent = isOn() ? "sound" : "muted";
  setMusicSoundOn(isOn());
}
$("#snd").addEventListener("click", e => {
  e.stopPropagation();
  setOn(!isOn());
  syncSound();
  if (isOn()) { startMusic(); sfx("tick"); }
});
if (elRadio) {
  elRadio.addEventListener("click", e => {
    e.stopPropagation();
    startMusic();
    updateRadioUI(nextMusicTrack());
    elRadio.classList.remove("pop");
    void elRadio.offsetWidth;
    elRadio.classList.add("pop");
  });
}
elMusicVol.addEventListener("input", e => {
  e.stopPropagation();
  syncMusicVolume(setMusicVolume(+elMusicVol.value / 100));
  if (isOn()) startMusic();
});
elMusicVol.addEventListener("click", e => e.stopPropagation());
elMusicVol.addEventListener("pointerdown", e => e.stopPropagation());
syncSound();
syncMusicVolume();
updateRadioUI();


/* ============================================================ files */
async function readMeta(file) {
  let bytes = [];
  try {
    const v = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
    const step = Math.max(1, Math.floor(v.length / 4096));
    for (let i = 0; i < v.length; i += step) bytes.push(v[i]);
  } catch (e) { }
  return { name: file.name, size: file.size, type: file.type, bytes };
}
const SAMPLES = [
  { name: "IMG_4417.HEIC", size: 3281920, type: "image/heic" },
  { name: "voice-memo-2.m4a", size: 11744512, type: "audio/mp4" },
  { name: "index.tsx", size: 4182, type: "text/typescript" },
  { name: "dune-part-two-4k.mov", size: 2147483648, type: "video/quicktime" },
  { name: "resume-final-v3.pdf", size: 218114, type: "application/pdf" },
  { name: "backup-2019.zip", size: 518000000, type: "application/zip" },
  { name: "kerning-experiment.otf", size: 94720, type: "font/otf" },
  { name: "screenshot 2026-08-16.png", size: 884120, type: "image/png" },
  { name: "main.rs", size: 21044, type: "text/rust" },
  { name: "empty.txt", size: 0, type: "text/plain" },
];
let sampleIdx = (Math.random() * SAMPLES.length) | 0;

/* ============================================================ app */
const seaCv = $("#sea"), fishCv = $("#fish"), rig = $("#rig");
const sea = Sea(seaCv);
const stage = FishStage(fishCv);
/* the rod is drawn the way the fish is rendered: flat facets, a hard ink
   silhouette and three shading steps -- never a smooth vector taper. */
const ROD = {
  ink: "#0B1012", dark: "#4A3320", mid: "#7B5936", lit: "#B98B57",
  whip: "#1C3A3E", corkDark: "#8A6739", corkLit: "#CDA467", guide: "#DCE7E9",
};
/* a regular polygon, vertex-aligned so halves cut cleanly on the horizon */
const poly = (r, n, rot) => {
  const p = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (rot || 0);
    p.push((Math.cos(a) * r).toFixed(1) + " " + (Math.sin(a) * r).toFixed(1));
  }
  return "M " + p.join(" L ") + " Z";
};
const halfPoly = (r, n, up) => {
  const p = [];
  for (let i = 0; i <= n / 2; i++) {
    const a = (i / n) * TAU * (up ? -1 : 1);
    p.push((Math.cos(a) * r).toFixed(1) + " " + (Math.sin(a) * r).toFixed(1));
  }
  return "M " + p.join(" L ") + " Z";
};
rig.innerHTML =
  `<path id="rodInk" fill="${ROD.ink}"/>
   <path id="rodDark" fill="${ROD.dark}"/>
   <path id="rodMid" fill="${ROD.mid}"/>
   <path id="rodLit" fill="${ROD.lit}"/>
   <path id="rodWhip" fill="${ROD.whip}"/>
   <path id="gripInk" fill="${ROD.ink}"/>
   <path id="gripDark" fill="${ROD.corkDark}"/>
   <path id="gripLit" fill="${ROD.corkLit}"/>
   <g id="rodReel">
     <path d="${poly(12.4, 8, 0.3927)}" fill="${ROD.ink}"/>
     <path d="${poly(10.2, 8, 0.3927)}" fill="#3A4E55"/>
     <path d="${poly(9.4, 8, 0.3927)}" fill="#4E666E" transform="translate(-0.9 -0.9)"/>
     <path d="${poly(4.6, 6, 0)}" fill="#93A9B0"/>
     <path d="M -2.2 -10 L 2.2 -10 L 1.6 -18 L -1.6 -18 Z" fill="${ROD.ink}"/>
     <path d="M -1.1 -10.6 L 1.1 -10.6 L 0.8 -17.2 L -0.8 -17.2 Z" fill="#93A9B0"/>
   </g>
   <g id="rodGuides">
     <g><path d="${poly(5.4, 4, 0)}" fill="${ROD.ink}"/><path d="${poly(2.8, 4, 0)}" fill="${ROD.guide}"/></g>
     <g><path d="${poly(4.7, 4, 0)}" fill="${ROD.ink}"/><path d="${poly(2.4, 4, 0)}" fill="${ROD.guide}"/></g>
     <g><path d="${poly(4.0, 4, 0)}" fill="${ROD.ink}"/><path d="${poly(2.0, 4, 0)}" fill="${ROD.guide}"/></g>
   </g>
   <path id="cline" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="1.7"/>
   <g id="cbob">
     <path d="${poly(10.6, 8, 0)}" fill="${ROD.ink}"/>
     <path d="${halfPoly(8.8, 8, false)}" fill="#E8E4D6"/>
     <path d="${halfPoly(8.8, 8, true)}" fill="#D8552F"/>
     <path d="M -4.6 -6.2 L -1.4 -7.6 L -0.6 -5.6 L -3.8 -4.2 Z" fill="#F0A184"/>
   </g>
   <g id="cbang" opacity="0">
     <path d="${poly(16.4, 8, 0.3927)}" fill="${ROD.ink}"/>
     <path d="${poly(14.2, 8, 0.3927)}" fill="#E8E4D6"/>
     <path d="M -2.4 -8 L 2.4 -8 L 1.5 2.2 L -1.5 2.2 Z" fill="#D8552F"/>
     <path d="M -2.1 4.6 L 2.1 4.6 L 2.1 8.4 L -2.1 8.4 Z" fill="#D8552F"/>
   </g>`;
const world = $("#world");
const nInk = $("#rodInk"), nDark = $("#rodDark"), nMid = $("#rodMid"), nLit = $("#rodLit"),
  nWhip = $("#rodWhip"), nGripInk = $("#gripInk"), nGripDark = $("#gripDark"), nGripLit = $("#gripLit"),
  nReel = $("#rodReel"), nGuides = [...$("#rodGuides").children],
  nLine = $("#cline"), nBob = $("#cbob"), nBang = $("#cbang");
const elStatus = $("#status");

let W = 0, H = 0, state = "idle", t0 = 0, fish = null;
let bob = { x: 0, y: 0 }, target = { x: 0, y: 0 }, from = { x: 0, y: 0 };
/* where a fish leaving re-enters the water, and the trail it leaves heading out */
let sendTo = { x: 0, y: 0 }, goneNote = "sent", goneWake = false, sentSplash = false, wake = null;
let stowTo = { x: 0, y: 0 };
let said = "drop a file";
const say = s => { said = s; elStatus.textContent = s; };
/* the blank flexes as a damped spring, so releasing a load whips through on its own */
let bend = 0, bendV = 0;
let rodTip = { x: 0, y: 0 };
const tip = () => rodTip;

/* the hand holding the rod drifts after the cursor -- a fraction of the way,
   and late, so the rod feels carried rather than pinned to the pointer */
const sway = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener("pointermove", e => {
  if (!W || !H) return;
  sway.tx = clamp((e.clientX - W * 0.5) / W, -1, 1) * 46;
  sway.ty = clamp((e.clientY - H * 0.5) / H, -1, 1) * 30;
}, { passive: true });

const GUIDE_T = [0.44, 0.68, 0.90];

function rodFrame(dt, bendTarget) {
  const k = 1 - Math.exp(-dt * 5.2);
  sway.x += (sway.tx - sway.x) * k;
  sway.y += (sway.ty - sway.y) * k;

  /* held off to the right, but clear of the controls stacked in that corner */
  const butt = { x: W * 0.88 + sway.x * 0.30, y: H * 1.08 + sway.y * 0.30 };
  const rest = { x: W * 0.66 + sway.x, y: H * 0.20 + sway.y };
  let dx = rest.x - butt.x, dy = rest.y - butt.y;
  const L = Math.hypot(dx, dy) || 1;
  dx /= L; dy /= L;
  const px = dy, py = -dx;                       // +bend pulls the tip toward the water

  bendV += (bendTarget - bend) * 118 * dt - bendV * 13 * dt;
  bend += bendV * dt;
  const b = clamp(bend, -190, 250);

  const c1 = { x: butt.x + dx * L * .34 + px * b * .18, y: butt.y + dy * L * .34 + py * b * .18 };
  const c2 = { x: butt.x + dx * L * .70 + px * b * .68, y: butt.y + dy * L * .70 + py * b * .68 };
  const c3 = { x: butt.x + dx * L + px * b * 1.30, y: butt.y + dy * L + py * b * 1.30 };
  const at = t => {
    const u = 1 - t, a = u * u * u, bb = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return { x: a * butt.x + bb * c1.x + c * c2.x + d * c3.x, y: a * butt.y + bb * c1.y + c * c2.y + d * c3.y };
  };

  /* one flat-sided quad per segment: the blank steps down in facets the way the
     fish's body does, instead of tapering smoothly like clip art */
  const N = 11, segs = [];
  for (let i = 0; i < N; i++) {
    const t0s = i / N, t1s = (i + 1) / N, tm = (t0s + t1s) * 0.5;
    const p0 = at(t0s), p1 = at(t1s), pm = at(tm), q = at(Math.min(1, tm + 0.004));
    let tx = q.x - pm.x, ty = q.y - pm.y;
    const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
    /* whole-pixel widths, so the blank steps down instead of tapering */
    segs.push({ p0, p1, nx: -ty, ny: tx, w: Math.max(1, Math.round(lerp(9, 1.6, Math.pow(tm, 0.66)))) });
  }
  /* a ribbon between two offsets from the centreline, in absolute pixels */
  const band = (from, to, i0, i1) => {
    let d = "";
    for (let i = i0 == null ? 0 : i0; i < (i1 == null ? N : i1); i++) {
      const s = segs[i], a = from(s), c = to(s);
      d += `M ${(s.p0.x + s.nx * a).toFixed(1)} ${(s.p0.y + s.ny * a).toFixed(1)}` +
        ` L ${(s.p1.x + s.nx * a).toFixed(1)} ${(s.p1.y + s.ny * a).toFixed(1)}` +
        ` L ${(s.p1.x + s.nx * c).toFixed(1)} ${(s.p1.y + s.ny * c).toFixed(1)}` +
        ` L ${(s.p0.x + s.nx * c).toFixed(1)} ${(s.p0.y + s.ny * c).toFixed(1)} Z`;
    }
    return d;
  };
  nInk.setAttribute("d", band(s => -s.w - 2.4, s => s.w + 2.4));
  nDark.setAttribute("d", band(s => -s.w, s => s.w));
  nMid.setAttribute("d", band(s => -s.w * 0.20, s => s.w));
  nLit.setAttribute("d", band(s => s.w * 0.50, s => s.w));

  /* a short lash of whipping thread where each guide is bound on */
  let whip = "";
  for (const t of GUIDE_T) {
    const a = at(t - 0.009), c = at(t + 0.009);
    let tx = c.x - a.x, ty = c.y - a.y;
    const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
    const nx = -ty, ny = tx, w = lerp(9, 1.6, Math.pow(t, 0.66)) + 1.6;
    whip += `M ${(a.x + nx * -w).toFixed(1)} ${(a.y + ny * -w).toFixed(1)}` +
      ` L ${(c.x + nx * -w).toFixed(1)} ${(c.y + ny * -w).toFixed(1)}` +
      ` L ${(c.x + nx * w).toFixed(1)} ${(c.y + ny * w).toFixed(1)}` +
      ` L ${(a.x + nx * w).toFixed(1)} ${(a.y + ny * w).toFixed(1)} Z`;
  }
  nWhip.setAttribute("d", whip);

  /* cork grip: same facet language, just fatter */
  const gs = [];
  for (let i = 0; i < 4; i++) {
    const a = 0.02 + i * 0.026, c = 0.02 + (i + 1) * 0.026;
    const p0 = at(a), p1 = at(c), pm = at((a + c) / 2), q = at(Math.min(1, (a + c) / 2 + 0.004));
    let tx = q.x - pm.x, ty = q.y - pm.y;
    const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
    gs.push({ p0, p1, nx: -ty, ny: tx, w: [8.6, 10.4, 10.0, 8.2][i] });
  }
  const gband = (from, to) => gs.map(s =>
    `M ${(s.p0.x + s.nx * from(s)).toFixed(1)} ${(s.p0.y + s.ny * from(s)).toFixed(1)}` +
    ` L ${(s.p1.x + s.nx * from(s)).toFixed(1)} ${(s.p1.y + s.ny * from(s)).toFixed(1)}` +
    ` L ${(s.p1.x + s.nx * to(s)).toFixed(1)} ${(s.p1.y + s.ny * to(s)).toFixed(1)}` +
    ` L ${(s.p0.x + s.nx * to(s)).toFixed(1)} ${(s.p0.y + s.ny * to(s)).toFixed(1)} Z`).join("");
  nGripInk.setAttribute("d", gband(s => -s.w - 2.4, s => s.w + 2.4));
  nGripDark.setAttribute("d", gband(s => -s.w, s => s.w));
  nGripLit.setAttribute("d", gband(s => s.w * 0.30, s => s.w));

  const rp = at(0.165), rq = at(0.185);
  const ang = Math.atan2(rq.y - rp.y, rq.x - rp.x) * 180 / Math.PI;
  nReel.setAttribute("transform",
    `translate(${(rp.x + px * 12).toFixed(1)} ${(rp.y + py * 12).toFixed(1)}) rotate(${(ang + 90).toFixed(1)})`);

  GUIDE_T.forEach((t, i) => {
    const p = at(t);
    nGuides[i].setAttribute("transform",
      `translate(${(p.x + px * (9 - i * 1.6)).toFixed(1)} ${(p.y + py * (9 - i * 1.6)).toFixed(1)}) rotate(${ang.toFixed(1)})`);
  });

  rodTip = at(1);
}

function layout() {
  const w = innerWidth, h = innerHeight;
  if (w === W && h === H) return;
  W = w; H = h; rig.setAttribute("viewBox", `0 0 ${W} ${H}`);
}

function splash(str, now) {
  const p = sea && sea.screenToWorld(target.x, target.y);
  if (p) sea.ripple(p[0], p[1], str, now);
}

/* a chain of ripples marching out toward the horizon: something under the
   surface, still swimming, already someone else's */
function startWake(x, y) {
  wake = { t: 0, dur: 2.6, next: 0, x0: x, y0: y, x1: W * 0.90, y1: H * 0.415 };
}
function stepWake(dt, now) {
  if (!wake) return;
  wake.t += dt;
  if (wake.t >= wake.dur) { wake = null; return; }
  if (wake.t < wake.next) return;
  const k = wake.t / wake.dur;
  const p = sea && sea.screenToWorld(lerp(wake.x0, wake.x1, k), lerp(wake.y0, wake.y1, k));
  if (p) sea.ripple(p[0], p[1], 0.9 * (1 - k * 0.75), now);
  wake.next = wake.t + 0.15;
}

function enter(s, now) {
  state = s; t0 = now;
  if (s === "cast") {
    startMusic();
    from = { x: tip().x - 26, y: tip().y + 20 }; say("casting"); sfx("cast");
  }
  if (s === "wait") { say(hex32(fish.hash)); splash(1.35, now); sfx("plop"); }
  if (s === "bite") { say("something's biting"); splash(0.9, now); sfx("bite"); shake = 3.5; duckMusic(0.25, 1.2); }
  if (s === "reel") {
    splash(1.6, now); say("reeling in"); sfx("splash"); sfx("reel", 1.0);
    stage.splash(bob.x / Math.max(W, 1), bob.y / Math.max(H, 1));
    shake = 5;
    duckMusic(0.2, 1.8);
  }
  if (s === "caught") {
    document.body.classList.add("has-catch");
    duckMusic(0.15, 2.2);
    const seen = !!DEX[fish.speciesKey];
    $("#p-rar").textContent = fish.rarity + (seen ? "" : " · new species");
    $("#p-rar").style.color = (RARE_LOOK[fish.rarity] || RARE_LOOK.Common).css;
    $("#p-nm").textContent = fish.name;
    $("#p-sub").textContent = `${fish.cm.toFixed(0)} cm · ${fish.file.name} · ${fmtBytes(fish.file.size)}`;
    for (const id of ["#release", "#keep", "#send"]) $(id).disabled = false;
    /* a whole folder is already logged by the time it lands, so there is
       nothing left to decide about it except who else gets to see it */
    $("#release").hidden = $("#keep").hidden = !!fish.bulk;
    history.replaceState(null, "", "#f=" + packFish(fish));
    const look = RARE_LOOK[fish.rarity] || RARE_LOOK.Common;
    if (RANK[fish.rarity] >= 3) {                 // rarity should be a moment, not just a colour
      stage.burst(0.5, 0.40, look.css);
      document.body.style.setProperty("--rar", look.css);
      document.body.classList.remove("rar-flash");
      void document.body.offsetWidth;             // restart the animation
      document.body.classList.add("rar-flash");
    }
    shake = 6;
    sfx("land", RANK[fish.rarity] >= 3);
    /* nothing is logged yet -- what happens to it is the player's call */
    say(fish.shared ? "someone else's catch · it's yours if you keep it" : "on the line");
  }
  /* the fish is on its way to someone else: it goes back over the side */
  if (s === "send") {
    document.body.classList.remove("has-catch", "rar-flash");
    say("away it goes");
  }
  if (s === "release") {
    document.body.classList.remove("has-catch", "rar-flash");
    say("back it goes");
  }
  if (s === "stow") {
    document.body.classList.remove("has-catch", "rar-flash");
    say("into the book");
  }
  if (s === "gone") {
    if (goneWake) startWake(sendTo.x, sendTo.y);
    stage.place(0, 0, 0, 0, false);
    say(goneNote);
  }
}

/* ============================================================ dex */
const DEX_KEY = "ftf.dex.v1";
let DEX = {};
try { DEX = JSON.parse(localStorage.getItem(DEX_KEY) || "{}") || {}; } catch (e) { DEX = {}; }

function saveDex() {
  try { localStorage.setItem(DEX_KEY, JSON.stringify(DEX)); }
  catch (e) {                       // out of quota: keep the records, drop the icons
    for (const k in DEX) delete DEX[k].img;
    try { localStorage.setItem(DEX_KEY, JSON.stringify(DEX)); } catch (e2) { }
  }
}
const dexCount = () => Object.keys(DEX).length;

/* returns true when this is a species we have never seen */
function record(f) {
  const k = f.speciesKey, prev = DEX[k];
  const better = !prev || (RANK[f.rarity] || 0) > (RANK[prev.r] || 0);
  if (better) {
    const img = stage.snapshot(f) || (prev && prev.img) || null;
    DEX[k] = { n: f.name, fn: f.file.name, sz: f.file.size, cm: f.cm, r: f.rarity, t: Date.now(), img };
  }
  saveDex();
  syncDexButton();
  return !prev;
}
/* ---------------------------------------------------------------- share */
const b64u = {
  enc(str) {
    const b = new TextEncoder().encode(str);
    let bin = ""; b.forEach(c => bin += String.fromCharCode(c));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  dec(str) {
    const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
    const b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(b);
  },
};
/* a fish is a pure function of these four values, so the link needs no server */
const packFish = f => b64u.enc(JSON.stringify([f.file.name, f.file.size, f.file.type || "", f.hash]));
function unpackFish(code) {
  try {
    const [name, size, type, hash] = JSON.parse(b64u.dec(code));
    if (typeof name !== "string" || typeof size !== "number") return null;
    const f = makeFish({ name, size, type: type || "", bytes: [] }, hash);
    f.shared = true;
    return f;
  } catch (e) { return null; }
}
const shareURL = f => location.origin + location.pathname + "#f=" + packFish(f);

/* 1200x630 card: the thing people actually post */
function makeCard(f) {
  const W = 1200, H = 630, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(W / 2, H * 0.40, 40, W / 2, H * 0.40, W * 0.72);
  grd.addColorStop(0, "#1D3E46"); grd.addColorStop(0.62, "#0C2026"); grd.addColorStop(1, "#071316");
  g.fillStyle = grd; g.fillRect(0, 0, W, H);

  const spr = stage.snapshotCanvas(f, 320, 240, f.scale01);
  const bw = 900, bh = 560;
  const k = Math.min(bw / spr.width, bh / spr.height);
  const dw = Math.round(spr.width * k), dh = Math.round(spr.height * k);
  g.imageSmoothingEnabled = false;
  g.drawImage(spr, Math.round((W - dw) / 2), Math.round(H * 0.36 - dh / 2), dw, dh);

  const look = RARE_LOOK[f.rarity] || RARE_LOOK.Common;
  g.textAlign = "center";
  g.fillStyle = look.css;
  g.font = "500 19px ui-monospace, SFMono-Regular, Menlo, monospace";
  g.fillText(f.rarity.toUpperCase().split("").join(" "), W / 2, H - 168);
  g.fillStyle = "#FFFFFF";
  g.font = '500 68px Futura, "Avenir Next", "Century Gothic", system-ui, sans-serif';
  g.fillText(f.name, W / 2, H - 104);
  g.fillStyle = "rgba(226,242,244,.72)";
  g.font = "400 21px ui-monospace, SFMono-Regular, Menlo, monospace";
  g.fillText(`${f.cm.toFixed(0)} cm  \u00B7  ${f.file.name}  \u00B7  ${fmtBytes(f.file.size)}`, W / 2, H - 64);
  g.fillStyle = "rgba(226,242,244,.34)";
  g.font = "400 17px ui-monospace, SFMono-Regular, Menlo, monospace";
  g.fillText("filetofish.codyh.xyz", W / 2, H - 28);
  return c;
}

function syncDexButton() {
  $("#dexn").textContent = `${dexCount()}/${SPECIES.length}`;
}

const dexEl = $("#dex"), groupsEl = $("#dex-groups"), detailEl = $("#dex-detail");
let freshKeys = new Set();

function renderDex() {
  const n = dexCount();
  $("#dex-count").textContent = n;
  $("#dex-fill").style.width = (n / SPECIES.length * 100).toFixed(1) + "%";
  const order = [...ARCH.map(a => a.key), "special"];
  groupsEl.innerHTML = order.map(g => {
    const rows = SPECIES.filter(s => s.arch === g);
    if (!rows.length) return "";
    const got = rows.filter(s => DEX[s.key]).length;
    return `<div class="grp"><h3>${g} &#183; ${got}/${rows.length}</h3><div class="slots">` +
      rows.map(s => {
        const e = DEX[s.key];
        if (!e) return `<div class="slot locked" title="not yet caught"></div>`;
        const cls = "slot got" + (freshKeys.has(s.key) ? " fresh" : "");
        const art = e.img ? `<img src="${e.img}" alt="${e.n}">`
                          : `<span style="font-size:.6rem;opacity:.6">${s.noun}</span>`;
        return `<button class="${cls}" data-k="${s.key}" title="${e.n}">${art}` +
          `<i class="dot r${RANK[e.r] || 1}"></i></button>`;
      }).join("") + `</div></div>`;
  }).join("");
  detailEl.innerHTML = n === SPECIES.length
    ? `<span class="done">every species logged. that is the whole sea.</span>`
    : `<span class="empty">pick a slot</span>`;
}

groupsEl.addEventListener("click", e => {
  const b = e.target.closest(".slot.got"); if (!b) return;
  groupsEl.querySelectorAll(".slot.sel").forEach(x => x.classList.remove("sel"));
  b.classList.add("sel");
  const en = DEX[b.dataset.k];
  const d = new Date(en.t);
  detailEl.innerHTML =
    `<div class="nm">${en.n}<em>${en.r}</em></div>` +
    `${en.cm.toFixed(0)} cm &#183; ${en.fn} &#183; ${fmtBytes(en.sz)} &#183; ` +
    `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
});

function openDex() { sfx("tick"); renderDex(); dexEl.hidden = false; $("#dex-close").focus(); }
function closeDex() { dexEl.hidden = true; freshKeys.clear(); }
$("#dexbtn").addEventListener("click", e => { e.stopPropagation(); openDex(); });
$("#dex-close").addEventListener("click", closeDex);
dexEl.addEventListener("click", e => { if (e.target === dexEl) closeDex(); });
addEventListener("keydown", e => { if (e.key === "Escape" && !dexEl.hidden) closeDex(); });
syncDexButton();

let shake = 0, nextIdle = 3, nextDrip = 0;
const DRY_AT = 26;                              // seconds of held fish before it stops dripping
const lit = [1, 1, 1]; let litAmb = 1, lastFx = "";
let last = performance.now();
function frame(nowMs) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (nowMs - last) / 1000); last = nowMs;
  const now = nowMs / 1000;
  layout();
  const age = now - t0;
  let vis = false, sc = 0.5, tilt = 0, bt = 0;

  /* how hard the fish (or the angler) is loading the blank */
  if (state === "idle") bt = 14 + Math.sin(now * 1.1) * 4;
  else if (state === "load") bt = -125;
  else if (state === "cast") bt = 16;
  else if (state === "wait") bt = 20 + Math.sin(now * 2.1) * 4;
  else if (state === "bite") bt = 78 + Math.sin(now * 26) * 26;
  else if (state === "reel") bt = lerp(185, 60, ease(clamp(age / 1.05, 0, 1))) + Math.sin(now * 17) * 9;
  else if (state === "send") bt = lerp(-80, 24, ease(clamp(age / 0.9, 0, 1)));
  else if (state === "release") bt = lerp(46, 18, ease(clamp(age / 0.9, 0, 1)));
  else bt = 18 + Math.sin(now * 0.9) * 4;
  rodFrame(dt, bt);
  stepWake(dt, now);

  /* something jumps out of frame now and then, so the empty screen is a place */
  if (!REDUCED && (state === "idle" || state === "caught") && now > nextIdle && sea) {
    const p = sea.screenToWorld(W * (0.08 + Math.random() * 0.84), H * (0.56 + Math.random() * 0.30));
    if (p) sea.ripple(p[0], p[1], 0.42 + Math.random() * 0.3, now);
    nextIdle = now + 3.5 + Math.random() * 5.5;
  }
  /* a fish out of water sheets off fast and then just beads: the gap between
     drops grows as sqrt(time), and it is dry inside half a minute */
  if (state === "caught" && !REDUCED && now > nextDrip && age < DRY_AT) {
    const wet = Math.sqrt(1 + age * 5);
    stage.drip(0.5 + (Math.random() - 0.5) * 0.14, 0.44, age < 0.5 ? 3 : age < 1.6 ? 2 : 1);
    nextDrip = now + (0.055 + Math.random() * 0.045) * wet;
  }

  const T = tip();
  if (state === "idle") { bob.x = T.x - 22; bob.y = T.y + 44 + Math.sin(now * 1.6) * 3; }
  else if (state === "load") { const q = Math.min(1, age / 0.26); bob.x = T.x - 22 + q * 30; bob.y = T.y + 44 - q * 22; if (age > 0.26) enter("cast", now); }
  else if (state === "cast") {
    const k = clamp(age / 0.62, 0, 1), e = ease(k);
    bob.x = lerp(from.x, target.x, e);
    bob.y = lerp(from.y, target.y, e) - Math.sin(k * Math.PI) * H * 0.20;
    if (k >= 1) enter("wait", now);
  }
  else if (state === "wait") { bob.x = target.x; bob.y = target.y + Math.sin(now * 4.2) * 3; if (age > 1.0) enter("bite", now); }
  else if (state === "bite") { bob.x = target.x + Math.sin(now * 26) * 2; bob.y = target.y + 6 + Math.sin(now * 20) * 4; if (age > 0.8) enter("reel", now); }
  else if (state === "reel") {
    const k = clamp(age / 1.05, 0, 1), e = ease(k);
    bob.x = lerp(target.x, W * 0.5, e);
    bob.y = lerp(target.y, H * 0.40, e) - Math.sin(k * Math.PI) * H * 0.26;
    vis = true; sc = lerp(0.34, 1, e); tilt = (1 - k) * -0.8;
    if (k >= 1) enter("caught", now);
  }
  else if (state === "caught") {
    bob.x = W * 0.5; bob.y = H * 0.40 + Math.sin(now * 1.05) * H * 0.012;
    vis = true; sc = 1; tilt = Math.sin(now * 0.8) * 0.05;
  }
  else if (state === "send") {
    const k = clamp(age / 1.20, 0, 1), e = ease(k);
    bob.x = lerp(W * 0.5, sendTo.x, e);
    bob.y = lerp(H * 0.40, sendTo.y, e) - Math.sin(k * Math.PI) * H * 0.20;
    vis = k < 0.66; sc = lerp(1, 0.26, e); tilt = e * 0.95;
    if (!sentSplash && k >= 0.62) {
      sentSplash = true;
      stage.splash(bob.x / Math.max(W, 1), bob.y / Math.max(H, 1));
      const p = sea && sea.screenToWorld(bob.x, bob.y);
      if (p) sea.ripple(p[0], p[1], 1.5, now);
      shake = 4.5;
    }
    if (k >= 1) enter("gone", now);
  }
  /* let go: it noses over and slides back under, close in */
  else if (state === "release") {
    const k = clamp(age / 0.85, 0, 1), e = ease(k);
    bob.x = lerp(W * 0.5, W * 0.5 - W * 0.04, e);
    bob.y = lerp(H * 0.40, H * 0.60, e);
    vis = k < 0.72; sc = lerp(1, 0.52, e); tilt = -e * 1.15;
    if (!sentSplash && k >= 0.66) {
      sentSplash = true;
      stage.splash(bob.x / Math.max(W, 1), bob.y / Math.max(H, 1));
      const p = sea && sea.screenToWorld(bob.x, bob.y);
      if (p) sea.ripple(p[0], p[1], 1.7, now);
      shake = 3;
    }
    if (k >= 1) enter("gone", now);
  }
  /* kept: it goes into the book in the corner */
  else if (state === "stow") {
    const k = clamp(age / 0.72, 0, 1), e = ease(k);
    bob.x = lerp(W * 0.5, stowTo.x, e);
    bob.y = lerp(H * 0.40, stowTo.y, e) - Math.sin(k * Math.PI) * H * 0.06;
    vis = true; sc = lerp(1, 0.04, e * e); tilt = e * 0.7;
    if (k >= 1) enter("gone", now);
  }
  else if (state === "gone") {
    vis = false;
    bob.x = T.x - 22; bob.y = T.y + 44 + Math.sin(now * 1.6) * 3;
    if (age > 3.2) { state = "idle"; t0 = now; say("drop a file"); }
  }

  const holding = state === "caught" || state === "send" || state === "release" || state === "stow";
  const onWater = !holding && state !== "reel";
  nLine.setAttribute("opacity", holding ? "0" : "1");
  nBob.setAttribute("opacity", onWater ? "1" : "0");
  if (!holding) {
    const sag = state === "cast" ? 6 : state === "bite" ? 8 : state === "reel" ? 2 : 24;
    nLine.setAttribute("d", `M ${T.x.toFixed(1)} ${T.y.toFixed(1)} Q ${((T.x + bob.x) / 2).toFixed(1)} ${((T.y + bob.y) / 2 + sag).toFixed(1)} ${bob.x.toFixed(1)} ${bob.y.toFixed(1)}`);
    if (onWater) nBob.setAttribute("transform", `translate(${bob.x.toFixed(1)} ${bob.y.toFixed(1)})`);
  }
  nBang.setAttribute("opacity", state === "bite" ? "1" : "0");
  if (state === "bite") nBang.setAttribute("transform", `translate(${bob.x.toFixed(1)} ${(bob.y - 42).toFixed(1)})`);

  stage.place(bob.x / Math.max(W, 1), bob.y / Math.max(H, 1), sc, tilt, vis);

  if (shake > 0.04 && !REDUCED) {                 // short impact judder, UI stays put
    shake = Math.max(0, shake - dt * 26);
    world.style.transform =
      `translate(${((Math.random() * 2 - 1) * shake).toFixed(2)}px,${((Math.random() * 2 - 1) * shake).toFixed(2)}px)`;
  } else if (world.style.transform) { shake = 0; world.style.transform = ""; }

  tickClock(now);
  if (sea) {
    /* the catch is lit by whatever sky it was pulled out of, riding the sea's
       own cross-fade so the fish never pops a frame ahead of the water */
    const p = sea.paletteNow ? sea.paletteNow() : sea.palette();
    lit[0] = p.light[0]; lit[1] = p.light[1]; lit[2] = p.light[2];
    litAmb = p.ambient;
    stage.setLight(lit, litAmb);
    /* the rod is out in that same weather, so grade it with the same light.
       clear daylight is the identity grade, so it pays nothing for the layer */
    const lum = clamp((lit[0] * 0.3 + lit[1] * 0.5 + lit[2] * 0.2) * litAmb, 0.30, 1.15);
    const warm = lit[0] - lit[2];
    const fx = (Math.abs(lum - 1) < 0.02 && Math.abs(warm) < 0.02) ? ""
      : `brightness(${lum.toFixed(2)}) saturate(${clamp(1 + warm * 0.9, 0.5, 1.35).toFixed(2)})` +
        ` hue-rotate(${clamp(-warm * 26, -14, 24).toFixed(0)}deg)`;
    if (fx !== lastFx) { lastFx = fx; rig.style.filter = fx; }
    sea.render(now);
  }
  stage.render(dt);
}
requestAnimationFrame(frame);

function accept(meta) {
  const now = performance.now() / 1000;
  fish = makeFish(meta);
  document.body.classList.remove("has-catch", "rar-flash");
  stage.clearParts();
  layout();
  stage.set(fish);
  target = { x: W * (0.26 + fish.wobble * 0.26), y: H * (0.62 + fish.wobble * 0.13) };
  say("reading 64 KB");
  if (REDUCED) { enter("caught", now); return; }
  enter("load", now);
}

/* a folder-sized drop should fill the dex, not queue forty cast animations */
const HAUL_CAP = 400;
async function haul(files) {
  const list = [...files].slice(0, HAUL_CAP);
  if (list.length === 1) { accept(await readMeta(list[0])); return; }
  say(`reading ${list.length} files`);
  freshKeys.clear();
  let added = 0, best = null;
  for (const file of list) {
    const f = makeFish(await readMeta(file));
    if (!DEX[f.speciesKey]) freshKeys.add(f.speciesKey);
    if (record(f)) added++;
    if (!best || (RANK[f.rarity] || 0) > (RANK[best.rarity] || 0)) best = f;
  }
  fish = best;
  fish.bulk = true;
  document.body.classList.remove("has-catch");
  layout();
  stage.set(fish);
  enter("caught", performance.now() / 1000);
  if (added) setTimeout(() => sfx("sparkle"), 420);
  say(`${list.length} files · ${added} new`);
  openDex();
}

const unlock = () => { if (isOn()) startMusic(); };
/* A suspended context gets another resume attempt on each real interaction. */
addEventListener("pointerdown", unlock, { capture: true });
addEventListener("keydown", unlock, { capture: true });
$("#cast").addEventListener("click", e => {
  e.stopPropagation(); unlock();
  const btn = e.currentTarget;
  btn.classList.remove("casting"); void btn.offsetWidth; btn.classList.add("casting");
  const s = SAMPLES[sampleIdx++ % SAMPLES.length];
  accept({ ...s, bytes: strBytes(s.name + s.size) });
});
const hit = $("#hit");
let pickAt = null;
hit.addEventListener("pointerdown", e => { pickAt = [e.clientX, e.clientY]; });
hit.addEventListener("click", e => {
  const moved = !pickAt || Math.hypot(e.clientX - pickAt[0], e.clientY - pickAt[1]) > 6;
  pickAt = null;
  if (!moved) { unlock(); $("#file").click(); }
});
$("#file").addEventListener("change", async e => {
  unlock();
  if (e.target.files.length) await haul(e.target.files);
  e.target.value = "";
});

/* copy the textarea way first: it is synchronous and works without focus,
   and clipboard.writeText can hang forever in a background tab */
function copyText(str) {
  const t = document.createElement("textarea");
  t.value = str;
  t.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
  document.body.appendChild(t);
  t.focus(); t.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (e) { }
  t.remove();
  if (!ok && navigator.clipboard) navigator.clipboard.writeText(str).catch(() => { });
  return ok || !!navigator.clipboard;
}
/* ---------------------------------------------------------------- sending
   one button, and the catch actually leaves: a card of it prints out of thin
   air and sails off, then the fish goes over the side and swims for the
   horizon. the link is on the clipboard by the time the splash lands. */
function printCard(f, cx, cy) {
  const cv = makeCard(f);
  const w = Math.min(innerWidth * 0.68, 440), h = w * 630 / 1200;
  cv.id = "card";
  cv.style.width = w + "px"; cv.style.height = h + "px";
  cv.style.left = (cx - w / 2) + "px"; cv.style.top = (cy - h / 2) + "px";
  document.body.appendChild(cv);
  const fly = `translate(${(innerWidth * 0.62).toFixed(0)}px,${(-innerHeight * 0.92).toFixed(0)}px) rotate(34deg) scale(.22)`;
  const anim = cv.animate([
    { transform: "scale(.14) rotate(-14deg)", opacity: 0, offset: 0 },
    { transform: "scale(1.05) rotate(-3deg)", opacity: 1, offset: 0.20 },
    { transform: "scale(1) rotate(-3deg)", opacity: 1, offset: 0.46 },
    { transform: "scale(1.02) rotate(2deg)", opacity: 1, offset: 0.56 },
    { transform: fly, opacity: 0, offset: 1 },
  ], { duration: REDUCED ? 900 : 1750, easing: "cubic-bezier(.32,.06,.3,1)" });
  anim.onfinish = () => cv.remove();
}

/* the three things you can do with a fish in your hands. exactly one of them,
   which is what makes any of them mean anything. */
const decided = () => { for (const id of ["#release", "#keep", "#send"]) $(id).disabled = true; };
const clearHash = () => history.replaceState(null, "", location.pathname + location.search);

$("#release").addEventListener("click", e => {
  e.stopPropagation();
  if (!fish || state !== "caught") return;
  decided();
  sentSplash = false; goneWake = false;
  goneNote = "put back · nothing logged";
  clearHash();
  enter("release", performance.now() / 1000);
});

$("#keep").addEventListener("click", e => {
  e.stopPropagation();
  if (!fish || state !== "caught") return;
  decided();
  const r = $("#dexbtn").getBoundingClientRect();
  stowTo = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  const fresh = record(fish);                    // only now does it go in the book
  if (fresh) freshKeys.add(fish.speciesKey);
  goneWake = false;
  goneNote = fresh ? `new species · ${dexCount()}/${SPECIES.length} logged` : `kept · ${dexCount()}/${SPECIES.length} logged`;
  const btn = $("#dexbtn");
  btn.classList.remove("pop"); void btn.offsetWidth; btn.classList.add("pop");
  setTimeout(() => btn.classList.remove("pop"), 700);
  if (fresh) setTimeout(() => sfx("sparkle"), 320);
  enter("stow", performance.now() / 1000);
});

$("#send").addEventListener("click", e => {
  e.stopPropagation();
  if (!fish || state !== "caught") return;
  decided();
  const url = shareURL(fish);
  const copied = copyText(url);
  goneWake = true;
  goneNote = copied ? "link copied · it's theirs now" : "link in the address bar · it's theirs now";
  /* on a phone the share sheet is the honest way to hand it over, and it has
     to be called straight out of the tap or the gesture is spent */
  if (navigator.share && matchMedia("(pointer:coarse)").matches) {
    try {
      navigator.share({ title: "filetofish", text: `I caught a ${fish.rarity} ${fish.name}.`, url })
        .catch(() => { });
    } catch (err) { }
  }
  printCard(fish, innerWidth / 2, innerHeight * 0.40);
  /* the address bar stops showing a fish you no longer have -- unless the
     clipboard failed, in which case the address bar IS the link */
  if (copied) setTimeout(clearHash, 1400);
  sentSplash = false;
  sendTo = { x: W * (0.66 + Math.random() * 0.14), y: H * 0.56 };
  setTimeout(() => { if (state === "caught") enter("send", performance.now() / 1000); },
    REDUCED ? 200 : 640);
});

/* what each choice costs, said out loud on hover -- a trade you cannot see is
   not a trade */
for (const [id, hint] of [["#release", "nothing kept, no link"],
                          ["#keep", "logged in the dex, yours to look at"],
                          ["#send", "they collect it · you give it up"]]) {
  const b = $(id);
  b.addEventListener("pointerenter", () => { if (state === "caught") elStatus.textContent = hint; });
  b.addEventListener("pointerleave", () => { elStatus.textContent = said; });
}

/* ---------------------------------------------------------------- clock */
/* The strip in the corner is the world's clock, not the machine's. Click it and
   the weather steps on; take hold of it and turn, and the hands come with your
   hand -- a full circle is twelve hours, same as the real thing. Whatever hour
   you let go on is the hour the sky believes, until you hand it back. */
const elClock = $("#clock"), elClockT = $("#clock-t"), elClockW = $("#clock-w");
const elClockNow = $("#clock-now");
let wxManual = false, wxNext = 0, shown = "";
let tOff = 0;                                     /* ms laid over the machine clock */
const pad2 = n => (n < 10 ? "0" : "") + n;
const DAY = 864e5;
/* only the hour of the day is ever read, so keep the offset inside one turn of
   the earth however long someone keeps spinning */
const wrapOff = ms => ms - Math.round(ms / DAY) * DAY;
const worldNow = () => new Date(Date.now() + tOff);

function applyWeather(name) {
  if (!sea) return;
  sea.setWeather(name);
  const p = sea.palette();
  elClockW.textContent = p.label;
  document.body.style.setProperty("--wx", p.css || "#FFC49A");
}
/* the sky answers to the hands, unless a click has pinned one on. `forced` is a
   hand on the clock, which is allowed to blow the fog off; the every-30s poll is
   not -- weather that rolled in gets to sit. */
function syncWeather(forced) {
  if (!sea || wxManual) return;
  const base = weatherForDate(worldNow()), cur = sea.weather();
  if (cur === base) return;
  if (!forced && (cur === "fog" || cur === "rain")) return;
  applyWeather(base);
}
/* held time is a separate thing from a pinned sky: turning the hands hands the
   weather back to the hour it lands on */
function setOffset(ms) {
  tOff = wrapOff(ms);
  const held = Math.abs(tOff) > 500;
  wxManual = wxManual && !held;
  elClock.classList.toggle("held", held);
  elClockNow.hidden = !held;
  syncWeather(true);
}
const nudge = ms => setOffset(tOff + ms);

if (sea) {
  /* it is whatever it is outside, except when the weather rolls in -- or when
     a link pins it, so a particular sky can be shared. `?t=19:30` pins the hour
     the same way, which is also how you look at a sky that is nine hours off. */
  const tp = /[?&]t=(\d{1,2})(?::(\d{2}))?/.exec(location.search);
  if (tp) {
    const d = new Date();
    d.setHours(+tp[1] % 24, +(tp[2] || 0), 0, 0);
    setOffset(d - Date.now());
  }
  const pin = /[?&]wx=([a-z]+)/.exec(location.search);
  if (pin && WEATHERS.indexOf(pin[1]) >= 0) { wxManual = true; applyWeather(pin[1]); }
  else if (!tp) {                                 /* a pinned hour has already dressed the sky */
    const roll = Math.random();
    applyWeather(roll < 0.10 ? "rain" : roll < 0.18 ? "fog" : weatherForDate(new Date()));
  }
}
/* Try now. If the browser suspends the context, the gesture listeners retry. */
startMusic();
function tickClock(now) {
  const d = worldNow();
  const s = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  if (s !== shown) {
    shown = s;
    elClockT.textContent = s;
    syncMusicToTime(d);
    updateRadioUI();
  }
  if (now > wxNext) { wxNext = now + 30; syncWeather(false); }  // the sky keeps its own time
}
function cycleWeather() {
  if (!sea) return;
  wxManual = true;
  applyWeather(WEATHERS[(WEATHERS.indexOf(sea.weather()) + 1) % WEATHERS.length]);
  sfx("tick");
}

/* ---- turning the hands ---- */
/* Angle, not pixels: the further out you take the pointer the finer the hour
   gets, which is how a real dial behaves. Inside MIN_R the angle is all noise,
   so it is watched but not spent. */
const MIN_R = 26, MS_PER_RAD = 12 * 3600e3 / TAU;
let spin = null;

elClock.addEventListener("pointerdown", e => {
  if (e.button > 0) return;
  e.stopPropagation();                            // the caught fish is not being spun
  e.preventDefault();
  const r = elClock.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  spin = {
    id: e.pointerId, cx, cy, a: Math.atan2(e.clientY - cy, e.clientX - cx),
    base: tOff, turn: 0, far: 0, x: e.clientX, y: e.clientY, h: worldNow().getHours(),
  };
  try { elClock.setPointerCapture(e.pointerId); } catch (err) { }
  elClock.focus({ preventScroll: true });         // preventDefault ate the focus; arrows still work
  elClock.classList.add("turning");
});
/* the turn is followed on the window, not the strip: the hand leaves the strip
   almost immediately, and a capture that does not take must not strand it */
addEventListener("pointermove", e => {
  if (!spin || e.pointerId !== spin.id) return;
  const dx = e.clientX - spin.cx, dy = e.clientY - spin.cy;
  const a = Math.atan2(dy, dx);
  let da = a - spin.a;
  if (da > Math.PI) da -= TAU; else if (da < -Math.PI) da += TAU;
  spin.a = a;                                     // tracked even in the dead middle,
  spin.far = Math.max(spin.far, Math.hypot(e.clientX - spin.x, e.clientY - spin.y));
  if (Math.hypot(dx, dy) < MIN_R) return;         // so leaving it never jumps
  spin.turn += da;
  setOffset(spin.base + spin.turn * MS_PER_RAD);
  const h = worldNow().getHours();
  if (h !== spin.h) { spin.h = h; sfx("tick"); }  // one tick an hour, under the thumb
});
function endSpin(e) {
  if (!spin || e.pointerId !== spin.id) return;
  const tap = spin.far < 4;                       // never moved: it was a click on the weather
  spin = null;
  elClock.classList.remove("turning");
  if (tap) cycleWeather();
}
addEventListener("pointerup", endSpin);
addEventListener("pointercancel", endSpin);
/* the crown, for anyone who would rather not draw circles */
elClock.addEventListener("wheel", e => {
  e.preventDefault();
  nudge(-Math.sign(e.deltaY) * 6e5);
}, { passive: false });
elClock.addEventListener("keydown", e => {
  const k = e.key;
  if (k === "Enter" || k === " ") { e.preventDefault(); cycleWeather(); }
  else if (k === "ArrowRight" || k === "ArrowUp") { e.preventDefault(); nudge(k === "ArrowUp" ? 36e5 : 9e5); }
  else if (k === "ArrowLeft" || k === "ArrowDown") { e.preventDefault(); nudge(k === "ArrowDown" ? -36e5 : -9e5); }
  else if (k === "Escape" && tOff) { e.preventDefault(); setOffset(0); sfx("tick"); }
});
elClockNow.addEventListener("click", e => {
  e.stopPropagation();
  setOffset(0);
  sfx("tick");
  elClock.focus();
});

/* someone opened a shared link: show their fish straight away */
(function fromLink() {
  const m = /[#&]f=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (!m) return;
  const f = unpackFish(m[1]);
  if (!f) return;
  fish = f;
  layout();
  stage.set(fish);
  enter("caught", performance.now() / 1000);
})();

const dz = $("#drop");
let depth = 0;
["dragenter", "dragover"].forEach(ev => addEventListener(ev, e => { e.preventDefault(); depth = 1; dz.classList.add("on"); }));
addEventListener("dragleave", () => { if (--depth <= 0) dz.classList.remove("on"); });
addEventListener("drop", async e => {
  e.preventDefault(); depth = 0; dz.classList.remove("on"); unlock();
  const files = e.dataTransfer && e.dataTransfer.files;
  if (files && files.length) await haul(files);
});
