/* The sky and the water. Owns time of day and weather; app.js only asks it
   what the light looks like so the fish can be graded to match. */

/* ---------------------------------------------------------------- weather */
/* label is what the clock strip prints; light/ambient grade the fish stage,
   css is an accent for UI text. Everything below `haze` is shader state and
   gets cross-faded, never read by app.js. */
export const WEATHERS = ["dawn", "sunrise", "day", "dusk", "night", "fog", "rain"];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* amt  = fog, rain, stars, glitter      (uAmt)
   amt2 = disc, glow, foam, spec          (uAmt2)
   moon = its own direction + visibility (uMoonDir/uMoon)
   cloudA = cloud light colour + coverage bias (uCloudA)
   sun  = the disc you can see; key = the direction that shades the swell.
   Keeping them apart is what lets the sun sit on the horizon without the
   whole sea going flat. */
const SCENES = {
  dawn: {
    label: "dawn", css: "#9EB0E6", light: [0.76, 0.80, 1.00], ambient: 0.78,
    deep: [0.040, 0.070, 0.180], shal: [0.220, 0.280, 0.470], foam: [0.70, 0.76, 0.93],
    sky: [0.420, 0.440, 0.630], sky2: [0.075, 0.105, 0.300],
    sun: [0.18, 0.030, -1.0], key: [0.24, 0.62, -0.74], sunCol: [0.62, 0.60, 0.90],
    haze: [0.520, 0.500, 0.670],
    cloudB: [0.270, 0.290, 0.500], cloudA: [0.560, 0.560, 0.780, 0.10],
    amt: [0.18, 0.0, 0.30, 0.20], amt2: [0.0, 0.55, 0.52, 0.25],
  },
  /* the water stays blue-teal -- warmed and desaturated, never hue-shifted
     into sand. All the orange arrives as light sitting on top of it: the
     glitter path, the foam tint, the horizon haze and the specular. */
  sunrise: {
    label: "sunrise", css: "#FFB05C", light: [1.14, 0.92, 0.70], ambient: 1.00,
    deep: [0.065, 0.130, 0.255], shal: [0.380, 0.520, 0.620], foam: [1.00, 0.87, 0.70],
    sky: [1.000, 0.740, 0.440], sky2: [0.260, 0.460, 0.800],
    sun: [0.22, 0.052, -1.0], key: [0.30, 0.60, -0.74], sunCol: [1.00, 0.72, 0.34],
    haze: [1.000, 0.790, 0.560],
    cloudB: [0.760, 0.460, 0.440], cloudA: [1.000, 0.840, 0.680, 0.24],
    amt: [0.10, 0.0, 0.0, 1.00], amt2: [1.0, 1.00, 0.85, 1.00],
  },
  day: {
    label: "clear", css: "#7EC8E3", light: [1.00, 1.00, 1.00], ambient: 1.00,
    deep: [0.070, 0.360, 0.620], shal: [0.420, 0.800, 0.900], foam: [1.00, 1.00, 1.00],
    sky: [0.830, 0.940, 0.970], sky2: [0.290, 0.630, 0.870],
    sun: [-0.34, 0.70, -0.62], key: [-0.34, 0.70, -0.62], sunCol: [1.00, 0.98, 0.90],
    haze: [0.658, 0.881, 0.941],
    cloudB: [0.860, 0.890, 0.940], cloudA: [0.990, 0.995, 1.000, 0.00],
    amt: [0.0, 0.0, 0.0, 0.50], amt2: [0.6, 0.50, 1.00, 1.00],
  },
  dusk: {
    label: "dusk", css: "#FF7E6B", light: [1.06, 0.78, 0.74], ambient: 0.86,
    deep: [0.035, 0.075, 0.200], shal: [0.620, 0.320, 0.420], foam: [1.00, 0.82, 0.76],
    sky: [1.000, 0.470, 0.330], sky2: [0.190, 0.095, 0.380],
    sun: [-0.28, 0.040, -1.0], key: [-0.30, 0.58, -0.76], sunCol: [1.00, 0.50, 0.26],
    haze: [0.940, 0.500, 0.400],
    cloudB: [0.460, 0.180, 0.400], cloudA: [1.000, 0.580, 0.520, 0.22],
    amt: [0.12, 0.0, 0.16, 0.85], amt2: [1.0, 0.95, 0.70, 0.65],
  },
  night: {
    label: "night", css: "#8CA6F0", light: [0.52, 0.62, 0.96], ambient: 0.55,
    deep: [0.012, 0.030, 0.095], shal: [0.100, 0.200, 0.400], foam: [0.60, 0.72, 0.94],
    sky: [0.055, 0.085, 0.220], sky2: [0.010, 0.020, 0.075],
    sun: [0.24, -0.08, -1.0], key: [-0.26, 0.66, -0.72], sunCol: [0.88, 0.92, 1.00],
    haze: [0.100, 0.140, 0.300],
    cloudB: [0.060, 0.080, 0.180], cloudA: [0.170, 0.200, 0.360, 0.00],
    amt: [0.06, 0.0, 1.00, 0.70], amt2: [0.0, 0.20, 0.28, 0.40], moon: [-0.24, 0.155, -1.0, 1.0],
  },
  fog: {
    label: "fog", css: "#B9C7CC", light: [0.90, 0.93, 0.95], ambient: 0.86,
    deep: [0.215, 0.315, 0.360], shal: [0.560, 0.655, 0.690], foam: [0.90, 0.93, 0.94],
    sky: [0.800, 0.830, 0.850], sky2: [0.680, 0.730, 0.770],
    sun: [0.08, 0.16, -1.0], key: [0.10, 0.72, -0.68], sunCol: [0.95, 0.96, 0.97],
    haze: [0.820, 0.850, 0.870],
    cloudB: [0.740, 0.780, 0.800], cloudA: [0.870, 0.890, 0.900, 0.32],
    amt: [1.00, 0.0, 0.0, 0.08], amt2: [0.0, 0.85, 0.45, 0.12],
  },
  rain: {
    label: "rain", css: "#86AFA8", light: [0.72, 0.80, 0.82], ambient: 0.72,
    deep: [0.045, 0.115, 0.115], shal: [0.240, 0.400, 0.380], foam: [0.84, 0.90, 0.88],
    sky: [0.505, 0.560, 0.550], sky2: [0.295, 0.360, 0.365],
    sun: [0.10, 0.34, -1.0], key: [0.12, 0.74, -0.66], sunCol: [0.70, 0.76, 0.74],
    haze: [0.470, 0.545, 0.545],
    cloudB: [0.265, 0.320, 0.315], cloudA: [0.560, 0.615, 0.605, 0.50],
    amt: [0.34, 1.0, 0.0, 0.06], amt2: [0.0, 0.25, 0.85, 0.22],
  },
};

/* Labels still use broad periods; the rendered sky never does. Visual
   keyframes hold through midday/deep night, then map every clock instant
   directly through sunrise and sunset instead of starting a timed cross-fade. */
export function weatherForDate(d) {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 5.0) return "night";     /* deep dark */
  if (h < 6.5) return "dawn";      /* sun still under the rim */
  if (h < 8.25) return "sunrise";  /* low warm sun */
  if (h < 17.75) return "day";
  if (h < 20.5) return "dusk";
  return "night";
}

/* Celestial positions are continuous, unlike weather keyframes. The horizon
   crossings are deliberately shared by the sun and moon, but their opposite
   phases keep both bodies moving while the weather scene stays unchanged. */
const TAU = Math.PI * 2;
const unit3 = (x, y, z) => {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};
const smoothstep = (x, a, b) => {
  const k = clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};
export function celestialForDate(d) {
  const h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600 + d.getMilliseconds() / 36e5;
  const sunPhase = (h - 6) * TAU / 24;
  const body = phase => {
    const s = Math.sin(phase);
    return unit3(0.28 * Math.cos(phase) - 0.34 * s, 0.78 * s - 0.08, -1 + 0.38 * Math.max(s, 0));
  };
  const moonY = 0.78 * Math.sin(sunPhase + Math.PI) - 0.08;
  return {
    sun: body(sunPhase),
    moon: body(sunPhase + Math.PI),
    moonVisibility: smoothstep(moonY, -0.18, 0.08),
  };
}
const TIME_STOPS = [
  [0, "night"], [4.5, "night"], [5.75, "dawn"], [7.375, "sunrise"],
  [9, "day"], [17, "day"], [19, "dusk"], [21, "night"], [24, "night"],
];
export function timeBlendForDate(d) {
  const h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600 + d.getMilliseconds() / 36e5;
  let i = 1;
  while (h > TIME_STOPS[i][0]) i++;
  const a = TIME_STOPS[i - 1], b = TIME_STOPS[i];
  return [a[1], b[1], (h - a[0]) / (b[0] - a[0])];
}

const PAL = {};
for (const k in SCENES) {
  const s = SCENES[k];
  PAL[k] = { label: s.label, light: s.light.slice(), ambient: s.ambient, css: s.css };
}
export function paletteOf(name) { return PAL[name] || PAL.day; }

/* ------------------------------------------------------- packed uniforms */
/* One flat float array per scene so clock interpolation and weather fades use
   the same small loop. Slots 42..45 are the fish grade; 46..49 are the moon's
   independent direction and visibility. */
const NF = 50;
const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const PACK = {};
const MOON_DOWN = [0.38, 0.02, -1.0, 0.0];
for (const k in SCENES) {
  const s = SCENES[k], a = new Float32Array(NF), moon = s.moon || MOON_DOWN;
  a.set(s.deep, 0); a.set(s.shal, 3); a.set(s.foam, 6); a.set(s.sky, 9); a.set(s.sky2, 12);
  a.set(nrm(s.sun), 15); a.set(nrm(s.key), 18); a.set(s.sunCol, 21); a.set(s.haze, 24);
  a.set(s.cloudB, 27); a.set(s.cloudA, 30); a.set(s.amt, 34); a.set(s.amt2, 38);
  a.set(s.light, 42); a[45] = s.ambient; a.set(nrm(moon), 46); a[49] = moon[3];
  PACK[k] = a;
}

/* ---------------------------------------------------------------- shader */
/* REGION CONTRACT (parallel work -- keep to your region, see the notes in each):
   - SKY:    sunBody/moonBody/clouds/sky() and SEA_FINISH_GLSL. Owns exposure and
             tonemap. sky() returns linear scene radiance: the classic values were
             ~0..1 with 1.0 = bright daytime sky; the sun disc may be >> 1.
             skyBase(rd,t) is the same sky without the crepuscular ray march --
             call that one for reflections. Under FX_SKY the whole frame is
             linear radiance by the time it reaches finish(), so a palette
             colour used as a final colour must be lifted with unmapc() first
             (unmapc is the exact inverse of finish()'s curve, so unmapc(x)
             through finish() is x again).
   - WATER:  the `else` (below-horizon) branch of main(). May call sky() or
             skyBase() for reflection and must tolerate HDR values coming back;
             under FX_SKY its own output has to be radiance too -- wrap cDeep,
             cShal, cFoam, uHaze and friends in unmapc().
   - POST:   the JS in Sea(): context, programs, render targets, render(). Uses
             uRaw=1 to receive HDR and applies finish() in its own composite.
   Every new term is gated on its FX_* switch so ?fx=none is the classic frame. */
export const SEA_FINISH_GLSL = `
/* Exposure, tonemap and output transform, in one place. Identity while
   FX_SKY == 0 so the classic frame is untouched; with the sky on, sky() and
   skyBase() hand back linear scene radiance (1.0 = a bright daytime sky, the
   sun disc ~27) and this is the only step that turns it into screen colour.
   The curve is Narkowicz's fit of the ACES RRT+ODT, which already carries the
   output transform, so nothing is applied after it -- and unmapc() in the sea
   shader is its exact algebraic inverse, which is how the scene palette
   survives the round trip. A one-LSB triangular dither keeps the long smooth
   gradients off the 8-bit banding.
   Needs FX_SKY defined (uFx.x); a post pass inlining this chunk must too. */
vec3 ftfTonemap(vec3 x){
  x = max(x, 0.0);
  return clamp((x*(2.51*x + 0.03))/(x*(2.43*x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 finish(vec3 c){
  if (FX_SKY < 0.5) return c;
  vec3 o = ftfTonemap(c*1.05);
  float d = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)))*43758.5453);
  return clamp(o + (d - 0.5)*(1.0/255.0), 0.0, 1.0);
}
`;
const SEA_VS = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
const SEA_FS = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform float uPx; uniform float uZoom; uniform vec4 uRip[6]; uniform vec4 uTune;
uniform vec3 cDeep, cShal, cFoam, cSky, cSky2;
uniform vec3 uSun, uKey, uSunCol, uHaze, uCloudB;
uniform vec4 uCloudA;
uniform vec4 uAmt;
uniform vec4 uAmt2;
uniform vec3 uMoonDir;
uniform float uMoon;
/* uFx: per-technique switches from ?fx= (see fxFromSearch). 1 = on, 0 = classic.
   uRaw: 1 = emit unfinished HDR radiance for a post pass, 0 = finish() here. */
uniform vec4 uFx; uniform float uRaw;
#define FX_SKY   uFx.x
#define FX_RAYS  uFx.y
#define FX_WATER uFx.z
#define FX_BLOOM uFx.w
#define FOG  uAmt.x
#define RAIN uAmt.y
#define STAR uAmt.z
#define GLIT uAmt.w
#define DISC uAmt2.x
#define GLOW uAmt2.y
#define FOAM uAmt2.z
#define SPEC uAmt2.w
/* WATER knobs. REFL_MAX caps how much of the sky the sea is allowed to become
   at grazing angles -- at 1.0 it is a mirror and stops being a sea. SPEC_GAIN
   is the HDR gain on the sun/moon lobe: it is meant to clip white under the
   identity finish() and to bloom once the post pass lands. SSS_GAIN is the
   backlit crest glow. */
#define REFL_MAX 0.80
#define SPEC_GAIN 1.70
#define SSS_GAIN 2.80
float hash21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash21(i),hash21(i+vec2(1.,0.)),u.x), mix(hash21(i+vec2(0.,1.)),hash21(i+vec2(1.,1.)),u.x), u.y);
}
float fbm(vec2 p){ float s=0.,a=.5; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=.5; } return s; }
float hgt(vec2 p, float t){
  float h = sin(p.x*0.62 + t*0.95)*0.30 + sin(p.y*0.49 - t*0.70)*0.26
          + sin((p.x*1.05 + p.y*0.82) + t*1.30)*0.17;
  return h + (fbm(p*0.80 + vec2(t*0.12,-t*0.08)) - 0.5)*0.80;
}
/* Optional above-water detail. At zero the production surface is unchanged;
   the lab can sharpen the normal and crest texture without another shader. */
float fineHgt(vec2 p, float t){
  vec2 q = p*2.8 + vec2(t*0.18, -t*0.15);
  return sin(q.x*2.1 + q.y*1.4 + t*1.8)*0.48
       + sin(q.y*3.3 - q.x*0.7 - t*1.3)*0.30
       + (vnoise(q*1.8) - 0.5)*0.35;
}
float surfaceH(vec2 p, float t){ return hgt(p,t) + uTune.y*0.06*fineHgt(p,t); }
vec2 ripples(vec2 p, float t){
  vec2 o = vec2(0.);
  for(int i=0;i<6;i++){
    vec4 r = uRip[i]; float age = t - r.z;
    if(r.w > 0.001 && age > 0.0 && age < 4.0){
      float d = length(p - r.xy), rad = age*5.2;
      float env = exp(-abs(d-rad)*0.85) * exp(-age*0.8) * r.w;
      o.x += sin((rad-d)*3.1)*env*1.15; o.y += env;
    }
  }
  return o;
}
/* WATER: an anti-aliased cel staircase -- n flat treads with a soft nose. It
   is what lets a continuous term (the Fresnel weight, here) keep the banded
   look of the body without the band edge crawling as the swell moves. */
float celBand(float x, float n){
  float s = clamp(x, 0.0, 1.0)*n;
  return (floor(s) + smoothstep(0.30, 0.70, fract(s)))/n;
}
/* one raindrop impact per grid cell, phase-offset so they fire at random
   times. The wave is domain-warped and noise-broken instead of a clean circle;
   rain should make messy little disturbances, not a field of portholes. Free
   of the uRip slots, which belong to the bobber. */
vec2 drops(vec2 p, float t, float sc, float sk, float rate){
  vec2 gp = p*sc + sk;
  vec2 ip = floor(gp), f = fract(gp);
  float h = hash21(ip + sk), h2 = hash21(ip + sk + 3.71);
  float ph = fract(t*rate + h*11.0);
  vec2 q = f - (vec2(0.24) + 0.52*vec2(h, h2));
  float seed = h*17.0 + h2*5.0;
  /* cheap value-noise warp: it gives each impact a different shoreline. */
  q += (vec2(vnoise(q*3.2 + vec2(seed, 2.4)),
             vnoise(q*3.2 + vec2(-seed, 7.1))) - 0.5) * (0.14 + ph*0.05);
  float d = length(q);
  float shape = vnoise(q*5.0 + vec2(seed, -seed*0.7));
  float breakup = vnoise(q*11.0 + vec2(-seed, seed*0.4));
  float r = ph*0.29*(0.82 + shape*0.34);
  float edge = exp(-abs(d - r)*(16.0 + breakup*15.0));
  float arcs = smoothstep(0.34, 0.60, breakup + shape*0.28);
  float dec = 1.0 - ph;
  float env = edge*arcs*dec*dec;
  return vec2(sin((r - d)*30.0)*env, env);
}
/* fixed stars: position depends on direction only, only the twinkle moves */
float starfield(vec2 sp, float t){
  vec2 gp = sp*15.0;
  vec2 ip = floor(gp), f = fract(gp);
  float h = hash21(ip + 0.5);
  vec2 c = vec2(hash21(ip + 2.31), hash21(ip + 9.17));
  float d = length(f - c);
  float s = (1.0 - smoothstep(0.0, 0.11, d))*step(0.76, h);
  return s*(0.35 + 0.65*h)*(0.58 + 0.42*sin(t*1.9 + h*47.0));
}
/* screen space rain: slanted columns of falling dashes. cw/ch are the cell
   size in CSS pixels, not in fractions of the frame -- so streak width, dash
   length, spacing and fall speed all stay put while a bigger viewport simply
   gets more rain in it. Sizing this in uv is what made the streaks widen into
   pale bars as the window grew. */
float rainLayer(vec2 q, float t, float cw, float ch, float spd, float slant){
  float px = uRes.y/max(uPx, 0.001);            /* frame height in CSS px */
  float cols = px/cw, rows = px/ch;
  /* uv.y counts UP the screen, and the time term below is added, so this must
     NOT be negated: hold a dash at fixed y and advance t and the streak moves
     to q.y - t*spd/rows. Negating here cancels that and it rains upwards. */
  vec2 rp = vec2((q.x + q.y*slant)*cols, q.y*rows);
  float cn = floor(rp.x);
  float sc = hash21(vec2(cn, 1.73));
  float y = rp.y + t*(spd + sc*spd*0.8) + sc*23.0;
  float cy = floor(y), fy = fract(y);
  float hh = hash21(vec2(cn, cy*0.61 + 4.2));
  float len = 0.10 + 0.24*hh;
  float s = (1.0 - smoothstep(0.0, len, fy))*step(0.38, hh);
  return s*(1.0 - smoothstep(0.055, 0.165, abs(fract(rp.x) - 0.5)));
}
/* ------------------------------------------------------------------- sky */
/* FX_SKY swaps the flat two-colour gradient for analytic single scattering:
   Rayleigh for the blue column, Mie for the forward lobe that turns the horizon
   around the sun orange at dawn and dusk. The scene palette is not thrown away
   -- it is run backwards through the tonemap (unmapc) and used as the
   multiple-scattering floor, so dawn, fog and rain still read as themselves,
   the 2 s cross-fade still interpolates something meaningful, and a sky built
   from the palette alone comes back out of finish() as the classic frame
   exactly. Everything from here down is linear radiance: 1.0 is a bright
   daytime sky and the sun disc is ~27, which is what gives bloom something to
   find. finish() is the only place it becomes screen colour. */
#define SKY_4PI 12.566371
const vec3 BETA_R   = vec3(0.0630, 0.1512, 0.3600);   /* Rayleigh, ~lambda^-4 */
const vec3 MOON_COL = vec3(0.70, 0.80, 1.00);
const float SUN_I   = 13.5;   /* key light radiance */
const float DISC_I  = 27.0;   /* the disc itself -- far over 1 so it blooms */
const float MOON_I  = 1.00;   /* the moon runs the same scattering, cooler */

/* exact inverse of the curve in finish(): finished palette colour -> radiance */
float invAces1(float y){
  float a = 2.43*y - 2.51, b = 0.59*y - 0.03, c = 0.14*y;
  return (-b - sqrt(max(b*b - 4.0*a*c, 0.0)))/(2.0*a);
}
vec3 unmapc(vec3 c){
  c = clamp(c, 0.0, 0.965);   /* the curve runs away at 1.0; 0.965 -> ~3.5 */
  return vec3(invAces1(c.r), invAces1(c.g), invAces1(c.b));
}
float phaseR(float c){ return 0.0596831*(1.0 + c*c); }
float phaseM(float c, float g){
  float g2 = g*g, d = max(1.0 + g2 - 2.0*g*c, 1e-4);
  return (1.0 - g2)/(SKY_4PI*d*sqrt(d));
}
/* rd.y only reaches ~0.36 inside this frame, so elevation is stretched before
   the airmass: the visible band has to carry the whole horizon-to-zenith run. */
float airmass(float y){ return 1.0/(clamp(y*2.75, 0.0, 1.0)*0.90 + 0.105); }
/* single scattering through a uniform slab. Splitting the light's own
   transmittance -- Rayleigh high in the column, Mie down in the haze where it
   reddens far harder -- is what keeps the anti-solar sky blue while the sun's
   own quarter of the horizon goes orange. */
vec3 inscat(vec3 rd, vec3 L, vec3 bM, vec3 bE, vec3 omT, float g){
  float c = dot(rd, L), sam = airmass(L.y);
  /* aerosol is a layer sitting on the sea, not a full column: looking up you
     see far less of it. Without this the Mie lobe whitens the whole frame at
     sunrise, because a 53 degree lens with the sun in it is all forward
     scatter -- with it, the fire stays down on the horizon where it belongs. */
  vec3 bMv = bM*(0.18 + 0.82*exp(-clamp(rd.y*2.75, 0.0, 1.0)*2.0));
  return (BETA_R*phaseR(c)*exp(-bE*sam*0.42) + bMv*phaseM(c, g)*exp(-bE*sam*1.30))/bE*omT;
}
vec2 cloudUV(vec3 rd, float t){ return rd.xz/max(rd.y, 0.030)*0.15 + vec2(t*0.010, 0.0); }
/* one octave, lifted by the mean of the three fbm() octaves it drops: close
   enough to the drawn cloud for the shafts to land in the gaps, a quarter of
   the cost, and the march can afford eighteen of them. */
float cloudLo(vec2 q){ return 0.5*vnoise(q) + 0.219; }
/* the march needs its own projection. cloudUV() divides by rd.y, so within a
   few degrees of the horizon the cloud field explodes into noise the samples
   cannot resolve and every shaft averages itself away; flooring the divisor
   flattens that band into the coherent layer the shafts need. */
vec2 cloudUVLo(vec3 rd, float t){ return rd.xz/max(rd.y, 0.105)*0.15 + vec2(t*0.010, 0.0); }
float sunLit(){ return smoothstep(-0.40, -0.01, uSun.y); }
vec3 sunHue(){ return uSunCol/max(max(uSunCol.r, uSunCol.g), max(uSunCol.b, 0.002)); }

float sunBody(vec3 dv){
  float r = length(dv);
  if (FX_SKY < 0.5) {
    float a = atan(dv.y, dv.x);
    float core = 1.0 - smoothstep(0.027, 0.034, r);
    float rays = (1.0 - smoothstep(0.030, 0.075, r))*pow(0.5 + 0.5*cos(a*12.0 + uTime*0.08), 10.0);
    return max(core, rays*0.72);
  }
  /* a disc with a soft, slightly darkened limb. The twelve spokes are gone --
     what surrounds the sun now is the Mie lobe, which is the real thing. */
  return (1.0 - smoothstep(0.0235, 0.0310, r))*(1.0 - 0.26*smoothstep(0.004, 0.028, r));
}
float moonBody(vec3 dv){
  float r = length(dv);
  if (FX_SKY < 0.5) {
    float outer = 1.0 - smoothstep(0.033, 0.039, r);
    float shadow = 1.0 - smoothstep(0.027, 0.034, length(dv.xy - vec2(0.017, 0.003)));
    return outer*(0.16 + 0.84*(1.0 - shadow));
  }
  float outer = 1.0 - smoothstep(0.0325, 0.0378, r);
  float shadow = 1.0 - smoothstep(0.026, 0.0335, length(dv.xy - vec2(0.017, 0.003)));
  return outer*(0.12 + 0.88*(1.0 - shadow));
}
/* the frame as it shipped: a two-colour ramp, thresholded clouds, a pow() glow */
vec3 skyClassic(vec3 rd, float t){
  vec3 s = mix(cSky, cSky2, pow(clamp(rd.y*3.0,0.0,1.0), 0.72));
  float c = fbm(rd.xz/max(rd.y,0.030)*0.15 + vec2(t*0.010, 0.0));
  float cv = uCloudA.w;
  float m1 = smoothstep(0.505 - cv*0.15, 0.545 - cv*0.15, c);
  float m2 = smoothstep(0.585 - cv*0.17, 0.615 - cv*0.17, c);
  if (STAR > 0.001) {
    float cm = clamp(m1*0.92 + m2*0.55, 0.0, 1.0);
    float st = starfield(rd.xy/max(-rd.z, 0.25), t);
    s += vec3(0.80,0.86,1.0)*st*STAR*smoothstep(0.0,0.12,rd.y)*(1.0 - cm*0.9);
  }
  s = mix(s, uCloudA.rgb, m1*0.92);
  s = mix(s, uCloudB, m2*0.55);
  float sn = max(dot(rd, uSun), 0.0), mn = max(dot(rd, uMoonDir), 0.0);
  s += uSunCol*(pow(sn,4.0)*0.28 + pow(sn,26.0)*0.55)*GLOW*smoothstep(0.0,0.1,DISC);
  s += vec3(0.42,0.52,0.82)*pow(mn,34.0)*GLOW*uMoon*0.18;
  if (DISC > 0.001) s = mix(s, min(uSunCol*1.42, vec3(1.0)), sunBody(rd - uSun)*DISC);
  if (uMoon > 0.001) {
    vec3 dv = rd - uMoonDir;
    float cr = (1.0 - smoothstep(0.005, 0.011, length(dv.xy - vec2(0.008, 0.005))))
             + (1.0 - smoothstep(0.004, 0.009, length(dv.xy + vec2(0.010,-0.006))));
    s = mix(s, vec3(0.72,0.80,1.0)*(1.0 - 0.18*clamp(cr,0.0,1.0)), moonBody(dv)*uMoon);
  }
  return mix(s, uHaze, 1.0 - smoothstep(0.0, mix(0.085, 0.50, FOG), rd.y));
}
vec3 skyScatter(vec3 rd, float t){
  vec3 sh = sunHue();
  float lit = sunLit();
  float lowSun = 1.0 - smoothstep(0.03, 0.42, uSun.y);

  /* -- palette floor. The warm band is pulled back toward the zenith colour
     away from the sun's quarter of the sky, which is the one thing a flat
     vertical ramp could never do; with the sun up it switches itself off. */
  float k = pow(clamp(rd.y*3.0, 0.0, 1.0), 0.72);
  float az = dot(normalize(vec3(rd.x, 0.0, rd.z)), normalize(vec3(uSun.x, 0.0, uSun.z)));
  k = clamp(k + lowSun*lit*(1.0 - smoothstep(0.30, 0.98, az))*0.50, 0.0, 1.0);
  /* an overcast sky has no direct beam left to scatter, so fog, rain and heavy
     coverage hand the frame back to the palette. Without this the Rayleigh
     column opens a blue hole in the middle of a rainstorm. */
  float clear = 1.0 - clamp(FOG*0.85 + RAIN*0.70 + uCloudA.w*0.45, 0.0, 0.90);
  vec3 s = unmapc(mix(cSky, cSky2, k))*(1.0 - 0.55*lit*clear);

  /* -- the scattering itself. Turbidity comes off the scene: fog and rain are
     thick with aerosol, and a cloudy scene hazes up with its own coverage. */
  float turb = 1.0 + FOG*2.6 + RAIN*1.7 + uCloudA.w;
  vec3 bM = vec3(0.019*turb), bE = BETA_R + bM*1.08;
  vec3 omT = 1.0 - exp(-bE*airmass(rd.y));
  s += inscat(rd, uSun, bM, bE, omT, 0.76)*sh*(SUN_I*lit*clear);
  float mLit = uMoon*smoothstep(-0.16, 0.06, uMoonDir.y);
  s += inscat(rd, uMoonDir, bM, bE, omT, 0.70)*MOON_COL*(MOON_I*mLit*clear);

  /* -- clouds */
  vec2 q = cloudUV(rd, t);
  float d = fbm(q);
  float cv = uCloudA.w;
  float m1 = smoothstep(0.505 - cv*0.15, 0.545 - cv*0.15, d);
  float m2 = smoothstep(0.585 - cv*0.17, 0.615 - cv*0.17, d);
  if (STAR > 0.001) {
    float cm = clamp(m1*0.92 + m2*0.55, 0.0, 1.0);
    float st = starfield(rd.xy/max(-rd.z, 0.25), t);
    s += vec3(0.80,0.86,1.0)*(st*STAR*0.70)*smoothstep(0.0,0.12,rd.y)*(1.0 - cm*0.9);
  }
  /* one step along the light ray inside the cloud plane. Thinner that way means
     this is the sun-facing slope, and that is where the silver lining lives;
     thicker means we are looking at the shaded back of the cloud. */
  vec2 sd = normalize(uSun.xz/max(uSun.y, 0.16) + vec2(1e-4, 1e-4));
  float rim = clamp((d - fbm(q + sd*0.20))*3.4, -1.0, 1.0);
  float sc = dot(rd, uSun);
  vec3 cA = unmapc(uCloudA.rgb), cB = unmapc(uCloudB);
  vec3 cc = mix(cB*0.72, cA, clamp(0.30 + 0.85*rim, 0.0, 1.0));
  cc += sh*(SUN_I*lit)*(0.050*max(rim, 0.0)*(0.30 + 0.70*pow(max(sc, 0.0), 4.0))
                      + 0.018*phaseM(sc, 0.80)*exp(-max(d - 0.44, 0.0)*8.0));
  s = mix(s, cc, m1*0.92);
  s = mix(s, mix(cB, cc, 0.30), m2*0.55);

  /* -- horizon haze eats the low sky, and in fog it eats all of it */
  s = mix(s, unmapc(uHaze), 1.0 - smoothstep(0.0, mix(0.085, 0.50, FOG), rd.y));

  /* -- disc and glare go on last. At sunrise the sun IS on the horizon, so it
     has to survive the haze mix or there is no sun in the one frame that wants
     one; the clouds still occlude it, which is what the shafts need. */
  float th = length(rd - uSun);
  vec3 glare = sh*(SUN_I*lit*GLOW)*(0.10*exp(-th*15.0) + 0.035*exp(-th*4.5));
  if (DISC > 0.001) glare += sh*(DISC_I*DISC*lit)*sunBody(rd - uSun);
  s += glare*(1.0 - m1*0.80)*(1.0 - FOG*0.55);

  if (uMoon > 0.001) {
    vec3 dv = rd - uMoonDir;
    float mr = length(dv);
    float cr = (1.0 - smoothstep(0.005, 0.011, length(dv.xy - vec2(0.008, 0.005))))
             + (1.0 - smoothstep(0.004, 0.009, length(dv.xy + vec2(0.010,-0.006))));
    vec3 mg = MOON_COL*(2.6*uMoon)*moonBody(dv)*(1.0 - 0.20*clamp(cr, 0.0, 1.0));
    mg += MOON_COL*(uMoon*0.55)*(0.30*exp(-mr*22.0) + 0.09*exp(-mr*6.0));
    s += mg*(1.0 - m1*0.75);
  }
  return s;
}
/* no ray march: the water calls this for reflections and should not pay for the
   shafts twice. Same units as sky(). */
vec3 skyBase(vec3 rd, float t){
  if (FX_SKY < 0.5) return skyClassic(rd, t);
  return skyScatter(rd, t);
}
/* Crepuscular rays. The clouds are a function of direction, so the shafts come
   from marching the line from this pixel toward the sun and accumulating how
   much of it is open sky. This is the only loop in the shader: it bails when
   the sun is under the horizon or the pixel is nowhere near it, the samples are
   one octave of noise, and the offset is hashed per pixel so the eighteen steps
   do not band. */
vec3 godrays(vec3 rd, float t){
  if (uSun.y < -0.30) return vec3(0.0);
  float sc = dot(rd, uSun);
  float reach = smoothstep(0.42, 0.86, sc);
  if (reach <= 0.0) return vec3(0.0);
  float thr = 0.500 - uCloudA.w*0.15;
  float jit = hash21(gl_FragCoord.xy + fract(t)*17.0);
  float acc = 0.0, wsum = 0.0;
  for (int i = 0; i < 18; i++) {
    float f = (float(i) + jit)*(1.0/18.0);
    vec3 p = normalize(mix(rd, uSun, f*0.88));
    float w = 1.0 - f*0.72;
    acc += (1.0 - smoothstep(thr - 0.045, thr + 0.045, cloudLo(cloudUVLo(p, t))))*w;
    wsum += w;
  }
  /* a low sun puts the shafts through more haze, which is what makes them show
     at sunrise and dusk even where the cloud is thin */
  float lowSun = 1.0 - smoothstep(0.03, 0.42, uSun.y);
  float amt = (acc/wsum)*reach*sunLit()*mix(0.42, 1.05, lowSun)*(0.40 + 0.60*GLOW);
  return sunHue()*(amt*0.38*mix(0.32, 1.0, FX_SKY)*(1.0 - FOG*0.60)*(1.0 - RAIN*0.55));
}
vec3 sky(vec3 rd, float t){
  vec3 c = skyBase(rd, t);
  if (FX_RAYS > 0.5) c += godrays(rd, t);
  return c;
}
${SEA_FINISH_GLSL}
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes)/uRes.y;
  vec2 rayUv = uv / max(uZoom, 0.5);
  vec3 ro = vec3(0.0, 2.5, 0.0);
  vec3 rd = normalize(vec3(rayUv.x, rayUv.y - 0.115, -1.0));
  float t = uTime; vec3 col;
  /* JOIN: with the sky on, the whole frame is linear radiance until finish(),
     so the authored screen colours the water uses are pulled back through the
     tonemap's inverse first. At FX_SKY == 0 they are the palette untouched. */
  vec3 cDeepR = mix(cDeep, unmapc(cDeep), FX_SKY), cShalR = mix(cShal, unmapc(cShal), FX_SKY);
  vec3 cFoamR = mix(cFoam, unmapc(min(cFoam, vec3(0.95))), FX_SKY), cSkyR = mix(cSky, unmapc(cSky), FX_SKY);
  vec3 uHazeR = mix(uHaze, unmapc(uHaze), FX_SKY), uSunColR = mix(uSunCol, unmapc(uSunCol), FX_SKY);
  if (rd.y > -0.0022) col = sky(rd, t);
  else {
    float dist = -ro.y/rd.y;
    vec2 p = (ro + rd*dist).xz;
    float fade = 1.0 - smoothstep(mix(14.0,6.0,FOG), mix(68.0,22.0,FOG), dist);
    float h = surfaceH(p,t);
    vec2 rp = ripples(p,t);
    float dz = 0.0;
    if (RAIN > 0.001) {
      float at = RAIN*(1.0 - smoothstep(6.0, 22.0, dist));
      vec2 da = drops(p, t, 1.30, 0.0, 1.25);
      vec2 db = drops(p, t, 2.10, 7.13, 1.45);
      rp.x += (da.x*0.070 + db.x*0.045)*at;
      dz = (da.y + db.y*0.70)*at;
    }
    h += rp.x;
    float e = mix(0.34, 0.12, uTune.x);
    float hx = surfaceH(p+vec2(e,0.0),t), hz = surfaceH(p+vec2(0.0,e),t);
    vec3 n = normalize(vec3(-(hx-h)/e, 1.0, -(hz-h)/e));
    float lit = clamp(dot(n,uKey),0.0,1.0)*0.72 + (h*0.5+0.5)*0.46;
    float g = fbm(p*0.42 + vec2(t*0.050, t*0.030))*2.6 + h*0.50
            + uTune.y*fineHgt(p*0.72,t)*0.34;
    float w = FW(g);
    float sw = w*(1.0 + FOG*2.2)*mix(1.0, 0.58, uTune.x);
    float d = abs(fract(g) - 0.5);
    float thick = clamp(max(0.042, w*1.15), 0.0, 0.20);
    float edge = mix(1.05, 0.48, uTune.z);
    float foam = 1.0 - smoothstep(thick - sw*edge, thick + sw*edge, d);
    foam *= fade * (1.0 - smoothstep(0.11, 0.28, w));
    foam *= 0.55 + 0.45*smoothstep(-0.65, 0.50, h);
    foam = max(foam, smoothstep(0.30, 0.95, rp.y)*fade*0.9);
    foam = max(foam, smoothstep(0.12, 0.45, dz)*0.95);
    foam *= FOAM;
    float q = floor(clamp(lit,0.0,0.999)*3.0)/2.0;
    col = mix(cDeepR, cShalR, 0.40 + q*0.60);
    /* distance washes the water out toward the horizon haze. Leaning on uHazeR
       rather than on a flat sky/water average keeps the far band the colour of
       the light instead of the muddy midpoint between a warm sky and cool sea.
       For day the two are the same value, so nothing moves there. */
    vec3 far = mix(mix(cSkyR,cShalR,0.42), uHazeR, clamp(0.34 + FOG*0.60, 0.0, 1.0));
    /* WATER: under FX_WATER the Fresnel reflection below is what carries the
       horizon, so this flat wash is pulled back to a hint. Fog keeps it at
       full strength -- there the wash *is* the weather. */
    col = mix(col, far, smoothstep(mix(18.0,5.0,FOG), mix(84.0,26.0,FOG), dist)
                        * mix(1.0, mix(0.40, 1.0, max(FOG, RAIN*0.60)), FX_WATER));
    float specPow = mix(46.0, 96.0, uTune.w);
    vec3 shineDir = normalize(mix(uSun, uMoonDir, clamp(uMoon,0.0,1.0)));
    /* half-vector slope: the facet tilt this pixel would need to mirror the
       sun. Small near the sun's azimuth, growing sideways -- that is the
       glitter path, narrow at the horizon and spreading toward the camera.
       Hoisted out of the glitter block so the microfacet lobe, the glitter and
       the foam tint all agree about where the path is. */
    vec3 hv = normalize(shineDir - rd);
    float sl = length(hv.xz)/max(hv.y, 0.05);
    float pathW = exp(-sl*sl*2.4);
    /* WATER: which body is doing the shining. The direction stays the existing
       sun/moon mix; the colour only goes cold once the sun disc has gone, so a
       dusk sea whose shine vector has already handed over to the risen moon
       still burns orange the way the sky above it does. */
    float moonW = clamp(uMoon,0.0,1.0)*(1.0 - DISC*0.85);
    vec3 shineCol = mix(uSunColR, vec3(0.62,0.74,1.00), moonW);
    float shineAmt = max(DISC, clamp(uMoon,0.0,1.0)*0.85)*smoothstep(-0.05, 0.12, shineDir.y);
    col = mix(col, mix(vec3(1.0), uSunColR, 0.5),
              step(0.34, pow(max(dot(reflect(rd,n),shineDir),0.0),specPow))
              *fade*0.85*SPEC*(1.0 - FX_WATER));
    if (FX_WATER > 0.5) {
      /* Sub-pixel chop is roughness, not geometry: flatten the normal with
         distance and hand the lost detail to the specular lobe's width. That
         is the whole trick that stops the far water from crawling. */
      float smear = smoothstep(6.0, 70.0, dist);
      vec3 nr = normalize(mix(n, vec3(0.0,1.0,0.0), smear*0.88));
      float wfade = 1.0 - smoothstep(mix(90.0,26.0,FOG), mix(380.0,96.0,FOG), dist);
      /* body colour is water you are looking *into*: deepen the troughs so the
         swell keeps its volume once a sky is laid on top of it. */
      col = mix(col, cDeepR, smoothstep(0.30, -0.95, h)*0.26*(1.0 - FOG));
      /* --- Fresnel sky reflection, quantised to three cel bands -------------
         Near water keeps its own banded body colour; far water mirrors the
         sky. That is what dissolves the hard horizon band -- sea and sky meet
         in the same radiance instead of two flat fills butted together. */
      float ct = clamp(dot(-rd, nr), 0.0, 1.0);
      float fres = 0.02 + 0.98*pow(1.0 - ct, 5.0);
      float fq = pow(celBand(fres, 3.0), 1.6)*REFL_MAX*mix(1.0, 0.62, FOG)*mix(1.0, 0.90, RAIN);
      vec3 rr = reflect(rd, nr);
      float ry = abs(rr.y);
      /* two things at once. The sky's cloud lookup divides by rd.y, so a
         grazing reflected ray samples it at a frequency no filter can save --
         hold the lookup at a sane elevation. What the grazing ray should have
         returned down there is the haze anyway, so fade to it by the true
         slope: that is the join that makes sea and sky one surface. */
      vec3 skyRefl = skyBase(normalize(vec3(rr.x, max(ry, 0.11), rr.z)), t);
      skyRefl = mix(skyRefl, uHazeR, 1.0 - smoothstep(0.0, mix(0.105, 0.40, FOG), ry));
      col = mix(col, skyRefl, fq);
      /* --- the sun's and the moon's own reflection --------------------------
         a normalised GGX lobe (peak 1 at any roughness) instead of a step:
         tight and sparkling underfoot, spread into a glare band at distance,
         which is what makes it read as a path rather than a highlight. The
         reflected sky already carries the disc, so this is deliberately the
         broad half of the pair and is added to it rather than layered over. */
      float rough = mix(mix(0.085, 0.050, uTune.w), 0.30, smear);
      float a2 = rough*rough; a2 *= a2;
      float nh = clamp(dot(nr, hv), 0.0, 1.0);
      float dnm = nh*nh*(a2 - 1.0) + 1.0;
      float lobe = a2/max(dnm, 1e-6); lobe *= lobe;
      col += shineCol*(lobe*SPEC_GAIN*SPEC*shineAmt*wfade*mix(0.35, 1.0, fres));
      /* --- backlit crests ---------------------------------------------------
         a wave face turned toward us has the sun behind it, so the thin water
         at the crest glows through. Warm turquoise pulled out of cShalR,
         strongest when the sun is on the rim. This is the green-blue rim that
         Wind Waker water lives on. */
      vec2 vd = normalize(rd.xz + vec2(1e-5, 0.0));
      float toward = clamp(-dot(n.xz, vd), 0.0, 1.0);
      float toSun = pow(clamp(dot(rd, shineDir), 0.0, 1.0), 6.0);
      float lowSun = 1.0 - smoothstep(0.06, 0.44, shineDir.y);
      float crest = smoothstep(0.10, 0.95, h);
      vec3 sssCol = mix(vec3(0.16,0.92,0.70), cShalR, 0.28)*mix(vec3(1.0), uSunColR, 0.45);
      /* pulled back where the sky reflection already owns the pixel, so the
         glow stays a rim on the near swell rather than a green cast. */
      col += sssCol*(crest*pow(toward, 1.4)*toSun*lowSun*shineAmt*wfade
                     *(1.0 - fq*0.70)*SSS_GAIN);
    }
    if (GLIT > 0.001) {
      float wash = exp(-sl*sl*4.6) + 0.32*exp(-sl*sl*0.85);
      wash = mix(wash, floor(wash*5.0 + 0.5)*0.2, 0.45);
      vec3 fn = normalize(n + vec3(sin(p.x*6.3 + t*2.1), 0.0, cos(p.y*5.9 - t*1.7))*0.22);
      float spark = smoothstep(mix(0.9925,0.9970,uTune.w), mix(0.9948,0.9990,uTune.w),
                               max(dot(reflect(rd,fn),shineDir),0.0))*fade;
      /* WATER: the broad wash is the GGX lobe's job now, so under FX_WATER the
         glitter keeps only its sparkle and sits inside the new path. */
      float gm = clamp((wash*mix(0.52, 0.18, FX_WATER) + spark*mix(0.85, 1.10, FX_WATER))
                       *(0.5 + 0.5*smoothstep(-0.40,0.50,h))*GLIT, 0.0, 1.0);
      col = mix(col, mix(min(uSunColR*1.30, vec3(1.0)), shineCol*1.35, FX_WATER), gm);
    }
    /* WATER: foam takes the light instead of being a flat fill -- hot and the
       colour of the sun inside the path, cool in the shadowed troughs. */
    /* JOIN: the sun colours the foam as a tint, not as radiance -- with the HDR
       sun colour the near foam went the colour of lava. Unit-peak tint. */
    vec3 shineTint = shineCol/max(max(shineCol.r, shineCol.g), max(shineCol.b, 1e-3));
    vec3 foamCol = cFoamR*mix(vec3(0.78,0.86,1.03), shineTint*1.42,
                             clamp(pathW*shineAmt*1.2, 0.0, 1.0));
    col = mix(col, mix(cFoamR, foamCol, FX_WATER), foam);
  }
  col = mix(col, uHazeR, FOG*0.11);
  if (RAIN > 0.001) {
    float r = rainLayer(uv, t, 14.76, 88.57, 2.6, 0.22)*0.62
            + rainLayer(uv + 3.7, t, 10.16, 62.00, 4.2, 0.17)*0.34;
    col = mix(col, min(uHazeR*1.45 + 0.10, vec3(mix(1.0, 4.0, FX_SKY))), clamp(r,0.0,1.0)*0.55*RAIN);
  }
  gl_FragColor = vec4(uRaw > 0.5 ? col : finish(col), 1.0);
}`;

/* ?fx= picks which lighting techniques render. Absent: everything on.
   ?fx=none          the classic frame, every switch off
   ?fx=sky,water     only the listed switches on
   ?fx=-bloom        everything on except the listed ones */
export const FX_NAMES = ["sky", "rays", "water", "bloom"];
export function fxFromSearch(search) {
  const raw = new URLSearchParams(search || "").get("fx");
  if (raw == null || raw === "") return [1, 1, 1, 1];
  const parts = raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  if (parts.includes("none") || parts.includes("classic")) return [0, 0, 0, 0];
  const negate = parts.every(s => s.startsWith("-"));
  return FX_NAMES.map(n => negate ? (parts.includes("-" + n) ? 0 : 1) : (parts.includes(n) ? 1 : 0));
}

/* ------------------------------------------------------------------ bloom */
/* POST region. The chain is: scene -> HDR target (uRaw = 1) -> soft-threshold
   bright pass at half res -> quarter -> eighth, each level separably blurred,
   then a weighted sum of the three added back and run through finish() in one
   composite to the canvas. Gated on FX_BLOOM, so ?fx=none and ?fx=-bloom draw
   the single pass straight to the canvas exactly as they always did.

   The shipping numbers assume the HDR the SKY and WATER regions are moving to
   and that they reach here through uRaw = 1: bright daytime sky about 1.0,
   water below 1.0, the sun disc somewhere in 10..40, with finish() applying
   exposure + tonemap afterwards. The threshold therefore sits just above sky
   white, so a clear day does not wash out and only the sun, the moon, the
   glitter path and the hottest foam crests carry a glow.

   BLOOM_*_LDR are the same numbers for an already tonemapped 0..1 scene: a
   machine with no float colour buffers, or the classic LDR sky and water
   (?fx=bloom, ?fx=-sky). Which pair is used is decided per frame in render(). */
const BLOOM_THRESHOLD = 2.6;       /* linear radiance where the glow starts: above the
                                      sky (~1..2.5) and lit foam, so only the disc, the
                                      moon, the sun path and the sparkle bloom */
const BLOOM_STRENGTH = 0.55;       /* fraction of the blurred energy added back */
const BLOOM_THRESHOLD_LDR = 0.86;
const BLOOM_STRENGTH_LDR = 0.45;
const BLOOM_KNEE = 0.30;           /* soft-knee width, as a fraction of threshold */
const BLOOM_SAT = 0.22;            /* saturation lift: warm sun, cold moon, never white */
const BLOOM_CLAMP = 64.0;          /* firefly guard, above the brightest sun disc */
/* one weight per mip -- half, quarter, eighth -- summing to 1, so the bloom is
   a sum of gaussians: tight around the source, still carrying at the edges.
   The list is the only place the level count is written down. */
const BLOOM_MIX = [0.42, 0.33, 0.25];
const BLOOM_LEVELS = BLOOM_MIX.length;

const POST_VS = "attribute vec2 a;varying vec2 vUv;void main(){vUv=a*0.5+0.5;gl_Position=vec4(a,0.,1.);}";
const POST_HEAD = "precision highp float;\nvarying vec2 vUv;\nuniform sampler2D uTex;\nuniform vec2 uStep;\n";
/* bright pass: halves the scene and keeps only what is above the knee. The
   saturation lift is what makes the sun's bloom read orange and the moon's read
   blue instead of both blooming to a white smear. */
const BRIGHT_FS = POST_HEAD + `
uniform vec3 uThresh;   /* threshold, knee, saturation */
void main(){
  vec3 c = texture2D(uTex, vUv + uStep*vec2(-1.0,-1.0)).rgb
         + texture2D(uTex, vUv + uStep*vec2( 1.0,-1.0)).rgb
         + texture2D(uTex, vUv + uStep*vec2(-1.0, 1.0)).rgb
         + texture2D(uTex, vUv + uStep*vec2( 1.0, 1.0)).rgb;
  c = min(c*0.25, vec3(${BLOOM_CLAMP.toFixed(1)}));
  float br = max(c.r, max(c.g, c.b));
  float knee = max(uThresh.y, 1e-4);
  float soft = clamp(br - uThresh.x + knee, 0.0, 2.0*knee);
  soft = soft*soft/(4.0*knee);
  c *= max(soft, br - uThresh.x)/max(br, 1e-4);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(max(mix(vec3(l), c, 1.0 + uThresh.z), vec3(0.0)), 1.0);
}`;
/* 4 bilinear taps on the corners of the destination texel: a clean 4x4 box */
const DOWN_FS = POST_HEAD + `
void main(){
  vec3 c = texture2D(uTex, vUv + uStep*vec2(-1.0,-1.0)).rgb
         + texture2D(uTex, vUv + uStep*vec2( 1.0,-1.0)).rgb
         + texture2D(uTex, vUv + uStep*vec2(-1.0, 1.0)).rgb
         + texture2D(uTex, vUv + uStep*vec2( 1.0, 1.0)).rgb;
  gl_FragColor = vec4(c*0.25, 1.0);
}`;
/* 9-tap gaussian folded onto 5 linear samples; uStep carries the axis */
const BLUR_FS = POST_HEAD + `
void main(){
  vec3 c = texture2D(uTex, vUv).rgb*0.2270270270;
  c += (texture2D(uTex, vUv + uStep*1.3846153846).rgb + texture2D(uTex, vUv - uStep*1.3846153846).rgb)*0.3162162162;
  c += (texture2D(uTex, vUv + uStep*3.2307692308).rgb + texture2D(uTex, vUv - uStep*3.2307692308).rgb)*0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;
/* the only pass that writes the canvas. finish() is interpolated from the SKY
   region's chunk so the two can never drift; uFx comes with it because finish()
   is required to stay identity while FX_SKY is off. uFinish is 0 only when the
   scene had to be rendered to an LDR target and already finished itself. */
const COMPOSITE_FS = `precision highp float;
varying vec2 vUv;
uniform sampler2D uScene${BLOOM_MIX.map((_, i) => ", uB" + i).join("")};
uniform float uStrength, uFinish, uTime;
uniform vec4 uFx;
#define FX_SKY   uFx.x
#define FX_RAYS  uFx.y
#define FX_WATER uFx.z
#define FX_BLOOM uFx.w
${SEA_FINISH_GLSL}
void main(){
  vec3 hdr = texture2D(uScene, vUv).rgb;
  vec3 b = ${BLOOM_MIX.map((wt, i) => `texture2D(uB${i}, vUv).rgb*${wt.toFixed(3)}`).join("\n         + ")};
  vec3 c = hdr + b*uStrength;
  gl_FragColor = vec4(uFinish > 0.5 ? finish(c) : c, 1.0);
}`;

export function Sea(canvas) {
  const attrs = { antialias: false, alpha: false, depth: false, stencil: false };
  /* The context has two jobs: compile fwidth in a GLSL ES 1.00 shader (the foam
     edge is anti-aliased against it) and give bloom a float colour buffer.
     webgl2 is the obvious home for the second, but it is not a superset for the
     first -- Chrome's SwiftShader backend, verified here, refuses fwidth in an
     ESSL1 shader under webgl2 no matter what #extension line it is handed, and
     the sea loses its foam. So both families are probed on a throwaway canvas
     and webgl2 is taken only when it wins outright: webgl1 with
     OES_texture_half_float already does both on every browser that matters. */
  const derivOk = g => {
    g.getExtension("OES_standard_derivatives");
    const s = g.createShader(g.FRAGMENT_SHADER);
    g.shaderSource(s, "#extension GL_OES_standard_derivatives : enable\nprecision mediump float;varying vec2 v;void main(){gl_FragColor=vec4(fwidth(v.x));}");
    g.compileShader(s);
    const ok = !!g.getShaderParameter(s, g.COMPILE_STATUS);
    g.deleteShader(s);
    return ok;
  };
  const probe = type => {
    let g = null;
    try { const c = document.createElement("canvas"); c.width = c.height = 2; g = c.getContext(type, attrs); } catch (e) { /* no such context */ }
    if (!g) return null;
    const r = {
      deriv: derivOk(g),
      float: type === "webgl2"
        ? !!(g.getExtension("EXT_color_buffer_float") || g.getExtension("EXT_color_buffer_half_float"))
        : !!(g.getExtension("OES_texture_half_float") && g.getExtension("EXT_color_buffer_half_float")),
    };
    const lose = g.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
    return r;
  };
  const p1 = probe("webgl");
  const p2 = p1 && p1.deriv && p1.float ? null : probe("webgl2");
  const gl2 = p2 && p2.deriv && p2.float ? canvas.getContext("webgl2", attrs) : null;
  const gl = gl2 || canvas.getContext("webgl", attrs);
  if (!gl) return null;
  const ext = gl.getExtension("OES_standard_derivatives") || (gl2 && p2.deriv);
  const src = (ext ? "#extension GL_OES_standard_derivatives : enable\n#define FW(x) fwidth(x)\n"
    : "#define FW(x) 0.018\n") + SEA_FS;
  const sh = (ty, s, label) => {
    const o = gl.createShader(ty); gl.shaderSource(o, s); gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error(label + " shader failed to compile:\n" + gl.getShaderInfoLog(o));
    return o;
  };
  let linkFailed = false;
  const build = (vs, fs, label) => {
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs, label));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs, label));
    gl.bindAttribLocation(p, 0, "a");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      linkFailed = true;
      console.error(label + " program failed to link:\n" + gl.getProgramInfoLog(p));
    }
    return p;
  };
  const prog = build(SEA_VS, src, "sea");
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const U = n => gl.getUniformLocation(prog, n);
  const u = {
    res: U("uRes"), time: U("uTime"), px: U("uPx"), rip: U("uRip[0]"),
    deep: U("cDeep"), shal: U("cShal"), foam: U("cFoam"), sky: U("cSky"), sky2: U("cSky2"),
    sun: U("uSun"), key: U("uKey"), sunCol: U("uSunCol"), haze: U("uHaze"), zoom: U("uZoom"), tune: U("uTune"),
    cloudB: U("uCloudB"), cloudA: U("uCloudA"), amt: U("uAmt"), amt2: U("uAmt2"),
    moonDir: U("uMoonDir"), moon: U("uMoon"),
    fx: U("uFx"), raw: U("uRaw"),
  };
  gl.uniform1f(u.raw, 0);

  /* ------------------------------------------------------------ post pass */
  /* Programs first, so a broken composite (most likely: finish() growing a
     dependency that lives outside SEA_FINISH_GLSL) just turns bloom off and
     leaves the single-pass frame intact instead of blanking the site. */
  linkFailed = false;
  const pBright = build(POST_VS, BRIGHT_FS, "bloom bright");
  const pDown = build(POST_VS, DOWN_FS, "bloom downsample");
  const pBlur = build(POST_VS, BLUR_FS, "bloom blur");
  const pComp = build(POST_VS, COMPOSITE_FS, "bloom composite");
  let bloomOk = !linkFailed;
  const pu = p => ({ tex: gl.getUniformLocation(p, "uTex"), step: gl.getUniformLocation(p, "uStep") });
  const uBright = { ...pu(pBright), thresh: gl.getUniformLocation(pBright, "uThresh") };
  const uDown = pu(pDown), uBlur = pu(pBlur);
  const uComp = {
    scene: gl.getUniformLocation(pComp, "uScene"), b: BLOOM_MIX.map((_, i) => gl.getUniformLocation(pComp, "uB" + i)),
    strength: gl.getUniformLocation(pComp, "uStrength"), finish: gl.getUniformLocation(pComp, "uFinish"),
    time: gl.getUniformLocation(pComp, "uTime"), fx: gl.getUniformLocation(pComp, "uFx"),
  };
  if (bloomOk) {
    gl.useProgram(pBright); gl.uniform1i(uBright.tex, 0);
    gl.useProgram(pDown); gl.uniform1i(uDown.tex, 0);
    gl.useProgram(pBlur); gl.uniform1i(uBlur.tex, 0);
    gl.useProgram(pComp);
    gl.uniform1i(uComp.scene, 0);
    uComp.b.forEach((loc, i) => gl.uniform1i(loc, i + 1));
    gl.useProgram(prog);
  }

  /* float colour buffer if we can get one; RGBA8 is a working fallback where
     the scene has to tonemap itself first (uRaw = 0) and bloom runs on 0..1. */
  const pickFormat = () => {
    if (gl2) {
      if (gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"))
        return { internal: gl.RGBA16F, type: gl.HALF_FLOAT, filter: gl.LINEAR, hdr: true, name: "webgl2 RGBA16F" };
    } else {
      const hf = gl.getExtension("OES_texture_half_float");
      if (hf && gl.getExtension("EXT_color_buffer_half_float"))
        return {
          internal: gl.RGBA, type: hf.HALF_FLOAT_OES, hdr: true, name: "webgl1 half float",
          filter: gl.getExtension("OES_texture_half_float_linear") ? gl.LINEAR : gl.NEAREST,
        };
    }
    return { internal: gl.RGBA, type: gl.UNSIGNED_BYTE, filter: gl.LINEAR, hdr: false, name: "RGBA8" };
  };
  let fmt = bloomOk ? pickFormat() : null;
  const targets = [];               /* [scene, l0a, l0b, l1a, l1b, ...] */
  const makeTarget = (w, h) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internal, w, h, 0, gl.RGBA, fmt.type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, fmt.filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, fmt.filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, w, h, ok };
  };
  const dropTargets = () => {
    for (const t of targets) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
    targets.length = 0;
  };
  const allocTargets = () => {
    dropTargets();
    if (!bloomOk) return;
    targets.push(makeTarget(W, H));
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      const w = Math.max(1, W >> (i + 1)), h = Math.max(1, H >> (i + 1));
      targets.push(makeTarget(w, h), makeTarget(w, h));
    }
    if (targets.every(t => t.ok)) return;
    /* a float attachment the driver would not render to: retry once at RGBA8 */
    if (fmt.hdr) {
      console.error("sea bloom: " + fmt.name + " target incomplete, falling back to RGBA8");
      fmt = { internal: gl.RGBA, type: gl.UNSIGNED_BYTE, filter: gl.LINEAR, hdr: false, name: "RGBA8" };
      allocTargets();
      return;
    }
    console.error("sea bloom: no renderable colour buffer, bloom disabled");
    dropTargets();
    bloomOk = false;
  };
  const level = i => targets[1 + i * 2];
  const scratch = i => targets[2 + i * 2];
  const pass = (target, program) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, target ? target.w : W, target ? target.h : H);
    gl.useProgram(program);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const bindTex = (unit, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t ? t.tex : null); };
  /* bright + downsample + separable blur, all at reduced resolution */
  const bloomChain = (threshold) => {
    gl.useProgram(pBright);
    gl.uniform3f(uBright.thresh, threshold, threshold * BLOOM_KNEE, BLOOM_SAT);
    gl.uniform2f(uBright.step, 1 / targets[0].w, 1 / targets[0].h);
    bindTex(0, targets[0]);
    pass(level(0), pBright);
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      if (i > 0) {
        const s = level(i - 1), d = level(i);
        gl.useProgram(pDown);
        gl.uniform2f(uDown.step, 1 / s.w, 1 / s.h);
        bindTex(0, s);
        pass(d, pDown);
      }
      const a = level(i), b = scratch(i);
      gl.useProgram(pBlur);
      gl.uniform2f(uBlur.step, 1 / a.w, 0);
      bindTex(0, a); pass(b, pBlur);
      gl.uniform2f(uBlur.step, 0, 1 / a.h);
      bindTex(0, b); pass(a, pBlur);
    }
  };

  /* live uniform block + the two ends of the cross-fade */
  const cur = new Float32Array(PACK.day), from = new Float32Array(NF), to = new Float32Array(PACK.day);
  const V = {
    deep: cur.subarray(0, 3), shal: cur.subarray(3, 6), foam: cur.subarray(6, 9),
    sky: cur.subarray(9, 12), sky2: cur.subarray(12, 15), sun: cur.subarray(15, 18),
    key: cur.subarray(18, 21), sunCol: cur.subarray(21, 24), haze: cur.subarray(24, 27),
    cloudB: cur.subarray(27, 30), cloudA: cur.subarray(30, 34),
    amt: cur.subarray(34, 38), amt2: cur.subarray(38, 42),
  };
  const celestial = new Float32Array(7);
  let hasCelestial = false;
  const updateCelestial = d => {
    const c = celestialForDate(d);
    celestial.set(c.sun, 0); celestial.set(c.moon, 3); celestial[6] = c.moonVisibility;
    hasCelestial = true; dirty = true;
  };
  const applyCelestial = () => {
    if (!hasCelestial) return;
    cur.set(celestial.subarray(0, 3), 15);
    cur.set(celestial.subarray(3, 6), 46);
    cur[49] = celestial[6];
  };
  const renorm = o => {
    const l = Math.hypot(cur[o], cur[o + 1], cur[o + 2]) || 1;
    cur[o] /= l; cur[o + 1] /= l; cur[o + 2] /= l;
  };
  const upload = () => {
    applyCelestial();
    renorm(15); renorm(18); renorm(46);
    gl.uniform3fv(u.deep, V.deep); gl.uniform3fv(u.shal, V.shal); gl.uniform3fv(u.foam, V.foam);
    gl.uniform3fv(u.sky, V.sky); gl.uniform3fv(u.sky2, V.sky2);
    gl.uniform3fv(u.sun, V.sun); gl.uniform3fv(u.key, V.key);
    gl.uniform3fv(u.sunCol, V.sunCol); gl.uniform3fv(u.haze, V.haze);
    gl.uniform1f(u.zoom, zoom);
    gl.uniform4fv(u.tune, tune);
    gl.uniform3fv(u.cloudB, V.cloudB);
    gl.uniform4fv(u.cloudA, V.cloudA); gl.uniform4fv(u.amt, V.amt); gl.uniform4fv(u.amt2, V.amt2);
    gl.uniform3fv(u.moonDir, cur.subarray(46, 49)); gl.uniform1f(u.moon, cur[49]);
    gl.uniform4fv(u.fx, fxv);
  };

  const DUR = 2.0;                 /* seconds for a full weather change */
  const rip = new Float32Array(24);
  let slot = 0, W = 0, H = 0, cw = "day";
  let mixT = 1, dirty = true, live = false, last = -1;
  let zoom = 1;
  const tune = new Float32Array(4);
  const fxv = new Float32Array([1, 1, 1, 1]);

  return {
    ripple(x, z, s, now) { rip.set([x, z, now, s], slot * 4); slot = (slot + 1) % 6; },
    screenToWorld(cx, cy) {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const ux = (cx - w / 2) / h, uy = (h / 2 - cy) / h;
      const dy = uy - 0.115, len = Math.hypot(ux, dy, 1), ry = dy / len;
      if (ry > -0.004) return null;
      const t = -2.5 / ry;
      return [ux / len * t, -t / len];
    },
    setWeather(name) {
      if (!PACK[name] || name === cw) return;
      cw = name; to.set(PACK[name]);
      if (live) { from.set(cur); mixT = 0; } else { cur.set(to); mixT = 1; }
      dirty = true;
    },
    setTime(d) {
      const [a, b, k] = timeBlendForDate(d), pa = PACK[a], pb = PACK[b];
      cw = weatherForDate(d);
      for (let i = 0; i < NF; i++) cur[i] = pa[i] + (pb[i] - pa[i]) * k;
      updateCelestial(d); applyCelestial();
      to.set(cur); mixT = 1; dirty = true;
    },
    setCelestialTime(d) { updateCelestial(d); },
    weather() { return cw; },
    setZoom(value) { zoom = clamp(Number(value) || 1, 0.5, 4); dirty = true; },
    setTuning(values) {
      if (Array.isArray(values)) tune.set(values.slice(0, 4));
      else for (const [i, key] of ["crisp", "detail", "foam", "shine"].entries()) tune[i] = clamp(Number(values?.[key]) || 0, 0, 1);
      dirty = true;
    },
    tuning() { return [...tune]; },
    setFx(values) { fxv.set(Array.from(values).slice(0, 4).map(v => (v ? 1 : 0))); dirty = true; },
    fx() { return [...fxv]; },
    palette() { return paletteOf(cw); },
    /* same shape as palette(), but light/ambient follow the cross-fade so a
       per-frame caller can grade the fish exactly to what the sea is doing.
       label/css snap to the target -- text should not blend. */
    paletteNow() {
      const p = paletteOf(cw);
      return { label: p.label, css: p.css, light: [cur[42], cur[43], cur[44]], ambient: cur[45] };
    },
    render(now) {
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      const w = Math.max(2, Math.round(canvas.clientWidth * dpr)), h = Math.max(2, Math.round(canvas.clientHeight * dpr));
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      if (w !== W || h !== H) {
        W = w; H = h; canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h);
        gl.uniform2f(u.res, w, h);
        gl.uniform1f(u.px, dpr);     /* lets the rain size itself in CSS px */
      }
      /* the offscreen chain follows the canvas, and costs nothing until the
         first frame that actually asks for bloom */
      if (bloomOk && fxv[3] > 0.5 && (!targets.length || targets[0].w !== W || targets[0].h !== H)) allocTargets();
      const dt = last < 0 ? 0 : Math.min(0.25, Math.max(0, now - last));
      last = now;
      if (mixT < 1) {
        mixT = Math.min(1, mixT + dt / DUR);
        const k = mixT * mixT * (3 - 2 * mixT);
        for (let i = 0; i < NF; i++) cur[i] = from[i] + (to[i] - from[i]) * k;
        dirty = true;
      }
      if (dirty) { upload(); dirty = false; }
      live = true;
      gl.uniform1f(u.time, now);
      gl.uniform4fv(u.rip, rip);
      const bloom = bloomOk && fxv[3] > 0.5 && targets.length > 0;
      /* raw HDR only makes it out of the scene pass if there is somewhere with
         the range to hold it; an RGBA8 target takes the finished frame instead */
      const raw = bloom && fmt.hdr;
      gl.uniform1f(u.raw, raw ? 1 : 0);
      if (!bloom) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, W, H);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        return;
      }
      pass(targets[0], prog);
      /* the HDR numbers only apply when something is actually emitting HDR:
         a tonemapped RGBA8 target, or the classic sky and water, stay in 0..1 */
      const wide = raw && (fxv[0] > 0.5 || fxv[2] > 0.5);
      bloomChain(wide ? BLOOM_THRESHOLD : BLOOM_THRESHOLD_LDR);
      gl.useProgram(pComp);
      gl.uniform1f(uComp.strength, wide ? BLOOM_STRENGTH : BLOOM_STRENGTH_LDR);
      gl.uniform1f(uComp.finish, raw ? 1 : 0);
      gl.uniform1f(uComp.time, now);
      gl.uniform4fv(uComp.fx, fxv);
      bindTex(0, targets[0]);
      for (let i = 0; i < BLOOM_LEVELS; i++) bindTex(i + 1, level(i));
      pass(null, pComp);
      /* leave no chain texture bound, or next frame's scene pass draws into a
         target that is still on a texture unit and drivers cry feedback loop */
      for (let i = BLOOM_LEVELS; i >= 0; i--) bindTex(i, null);
    },
  };
}
