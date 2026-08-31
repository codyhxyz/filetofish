/* The sky and the water. Owns time of day and weather; app.js only asks it
   what the light looks like so the fish can be graded to match. */

/* ---------------------------------------------------------------- weather */
/* label is what the clock strip prints; light/ambient grade the fish stage,
   css is an accent for UI text. Everything below `haze` is shader state and
   gets cross-faded, never read by app.js. */
export const WEATHERS = ["dawn", "sunrise", "day", "dusk", "night", "fog", "rain"];

/* amt  = fog, rain, stars, glitter      (uAmt)
   amt2 = sun disc, sun glow, foam, spec (uAmt2)
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
    sun: [-0.24, 0.155, -1.0], key: [-0.26, 0.66, -0.72], sunCol: [0.88, 0.92, 1.00],
    haze: [0.100, 0.140, 0.300],
    cloudB: [0.060, 0.080, 0.180], cloudA: [0.170, 0.200, 0.360, 0.00],
    amt: [0.06, 0.0, 1.00, 0.70], amt2: [1.0, 0.20, 0.28, 0.40],
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

/* time of day picks the base sky; fog/rain are chosen by the caller */
export function weatherForDate(d) {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 5.0) return "night";     /* deep dark */
  if (h < 6.5) return "dawn";      /* sun still under the rim */
  if (h < 8.25) return "sunrise";  /* low warm sun */
  if (h < 17.75) return "day";
  if (h < 20.5) return "dusk";
  return "night";
}

const PAL = {};
for (const k in SCENES) {
  const s = SCENES[k];
  PAL[k] = { label: s.label, light: s.light.slice(), ambient: s.ambient, css: s.css };
}
export function paletteOf(name) { return PAL[name] || PAL.day; }

/* ------------------------------------------------------- packed uniforms */
/* One flat float array per scene so the cross-fade is a single lerp loop.
   Slots 42..45 are the fish grade -- not uploaded, but they ride along so
   paletteNow() can hand app.js light that matches what is on screen. */
const NF = 46;
const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const PACK = {};
for (const k in SCENES) {
  const s = SCENES[k], a = new Float32Array(NF);
  a.set(s.deep, 0); a.set(s.shal, 3); a.set(s.foam, 6); a.set(s.sky, 9); a.set(s.sky2, 12);
  a.set(nrm(s.sun), 15); a.set(nrm(s.key), 18); a.set(s.sunCol, 21); a.set(s.haze, 24);
  a.set(s.cloudB, 27); a.set(s.cloudA, 30); a.set(s.amt, 34); a.set(s.amt2, 38);
  a.set(s.light, 42); a[45] = s.ambient;
  PACK[k] = a;
}

/* ---------------------------------------------------------------- shader */
const SEA_VS = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
const SEA_FS = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform float uPx; uniform vec4 uRip[6];
uniform vec3 cDeep, cShal, cFoam, cSky, cSky2;
uniform vec3 uSun, uKey, uSunCol, uHaze, uCloudB;
uniform vec4 uCloudA;
uniform vec4 uAmt;
uniform vec4 uAmt2;
#define FOG  uAmt.x
#define RAIN uAmt.y
#define STAR uAmt.z
#define GLIT uAmt.w
#define DISC uAmt2.x
#define GLOW uAmt2.y
#define FOAM uAmt2.z
#define SPEC uAmt2.w
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
vec3 sky(vec3 rd, float t){
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
  float sn = max(dot(rd, uSun), 0.0);
  s += uSunCol*((pow(sn,4.0)*0.28 + pow(sn,26.0)*0.55)*GLOW + pow(sn,220.0)*0.80*DISC);
  if (DISC > 0.001) {
    vec3 dv = rd - uSun;
    float cr = (1.0 - smoothstep(0.005, 0.011, length(dv.xy - vec2(0.008, 0.005))))
             + (1.0 - smoothstep(0.004, 0.009, length(dv.xy + vec2(0.010,-0.006))));
    float disc = (1.0 - smoothstep(0.025, 0.031, length(dv)))*DISC;
    s = mix(s, uSunCol*(1.30 - 0.22*clamp(cr*STAR,0.0,1.0)), disc);
  }
  return mix(s, uHaze, 1.0 - smoothstep(0.0, mix(0.085, 0.50, FOG), rd.y));
}
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes)/uRes.y;
  vec3 ro = vec3(0.0, 2.5, 0.0);
  vec3 rd = normalize(vec3(uv.x, uv.y - 0.115, -1.0));
  float t = uTime; vec3 col;
  if (rd.y > -0.0022) col = sky(rd, t);
  else {
    float dist = -ro.y/rd.y;
    vec2 p = (ro + rd*dist).xz;
    float fade = 1.0 - smoothstep(mix(14.0,6.0,FOG), mix(68.0,22.0,FOG), dist);
    float h = hgt(p,t);
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
    float e = 0.34;
    float hx = hgt(p+vec2(e,0.0),t), hz = hgt(p+vec2(0.0,e),t);
    vec3 n = normalize(vec3(-(hx-h)/e, 1.0, -(hz-h)/e));
    float lit = clamp(dot(n,uKey),0.0,1.0)*0.72 + (h*0.5+0.5)*0.46;
    float g = fbm(p*0.42 + vec2(t*0.050, t*0.030))*2.6 + h*0.50;
    float w = FW(g);
    float sw = w*(1.0 + FOG*2.2);
    float d = abs(fract(g) - 0.5);
    float thick = clamp(max(0.042, w*1.15), 0.0, 0.20);
    float foam = 1.0 - smoothstep(thick - sw*1.05, thick + sw*1.05, d);
    foam *= fade * (1.0 - smoothstep(0.11, 0.28, w));
    foam *= 0.55 + 0.45*smoothstep(-0.65, 0.50, h);
    foam = max(foam, smoothstep(0.30, 0.95, rp.y)*fade*0.9);
    foam = max(foam, smoothstep(0.12, 0.45, dz)*0.95);
    foam *= FOAM;
    float q = floor(clamp(lit,0.0,0.999)*3.0)/2.0;
    col = mix(cDeep, cShal, 0.40 + q*0.60);
    /* distance washes the water out toward the horizon haze. Leaning on uHaze
       rather than on a flat sky/water average keeps the far band the colour of
       the light instead of the muddy midpoint between a warm sky and cool sea.
       For day the two are the same value, so nothing moves there. */
    vec3 far = mix(mix(cSky,cShal,0.42), uHaze, clamp(0.34 + FOG*0.60, 0.0, 1.0));
    col = mix(col, far, smoothstep(mix(18.0,5.0,FOG), mix(84.0,26.0,FOG), dist));
    col = mix(col, mix(vec3(1.0), uSunCol, 0.5),
              step(0.34, pow(max(dot(reflect(rd,n),uSun),0.0),46.0))*fade*0.85*SPEC);
    if (GLIT > 0.001) {
      /* half-vector slope: the facet tilt this pixel would need to mirror the
         sun. Small near the sun's azimuth, growing sideways -- that is the
         glitter path, narrow at the horizon and spreading toward the camera. */
      vec3 hv = normalize(uSun - rd);
      float sl = length(hv.xz)/max(hv.y, 0.05);
      float wash = exp(-sl*sl*4.6) + 0.32*exp(-sl*sl*0.85);
      wash = mix(wash, floor(wash*5.0 + 0.5)*0.2, 0.45);
      vec3 fn = normalize(n + vec3(sin(p.x*6.3 + t*2.1), 0.0, cos(p.y*5.9 - t*1.7))*0.22);
      float spark = smoothstep(0.9925, 0.9948, max(dot(reflect(rd,fn),uSun),0.0))*fade;
      float gm = clamp((wash*0.52 + spark*0.85)*(0.5 + 0.5*smoothstep(-0.40,0.50,h))*GLIT, 0.0, 1.0);
      col = mix(col, min(uSunCol*1.30, vec3(1.0)), gm);
    }
    col = mix(col, cFoam, foam);
  }
  col = mix(col, uHaze, FOG*0.11);
  if (RAIN > 0.001) {
    float r = rainLayer(uv, t, 14.76, 88.57, 2.6, 0.22)*0.62
            + rainLayer(uv + 3.7, t, 10.16, 62.00, 4.2, 0.17)*0.34;
    col = mix(col, min(uHaze*1.45 + 0.10, vec3(1.0)), clamp(r,0.0,1.0)*0.55*RAIN);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export function Sea(canvas) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
  if (!gl) return null;
  const ext = gl.getExtension("OES_standard_derivatives");
  const src = (ext ? "#extension GL_OES_standard_derivatives : enable\n#define FW(x) fwidth(x)\n"
    : "#define FW(x) 0.018\n") + SEA_FS;
  const sh = (ty, s) => { const o = gl.createShader(ty); gl.shaderSource(o, s); gl.compileShader(o); return o; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, SEA_VS));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, src));
  gl.bindAttribLocation(prog, 0, "a");
  gl.linkProgram(prog); gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const U = n => gl.getUniformLocation(prog, n);
  const u = {
    res: U("uRes"), time: U("uTime"), px: U("uPx"), rip: U("uRip[0]"),
    deep: U("cDeep"), shal: U("cShal"), foam: U("cFoam"), sky: U("cSky"), sky2: U("cSky2"),
    sun: U("uSun"), key: U("uKey"), sunCol: U("uSunCol"), haze: U("uHaze"),
    cloudB: U("uCloudB"), cloudA: U("uCloudA"), amt: U("uAmt"), amt2: U("uAmt2"),
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
  const renorm = o => {
    const l = Math.hypot(cur[o], cur[o + 1], cur[o + 2]) || 1;
    cur[o] /= l; cur[o + 1] /= l; cur[o + 2] /= l;
  };
  const upload = () => {
    renorm(15); renorm(18);
    gl.uniform3fv(u.deep, V.deep); gl.uniform3fv(u.shal, V.shal); gl.uniform3fv(u.foam, V.foam);
    gl.uniform3fv(u.sky, V.sky); gl.uniform3fv(u.sky2, V.sky2);
    gl.uniform3fv(u.sun, V.sun); gl.uniform3fv(u.key, V.key);
    gl.uniform3fv(u.sunCol, V.sunCol); gl.uniform3fv(u.haze, V.haze);
    gl.uniform3fv(u.cloudB, V.cloudB);
    gl.uniform4fv(u.cloudA, V.cloudA); gl.uniform4fv(u.amt, V.amt); gl.uniform4fv(u.amt2, V.amt2);
  };

  const DUR = 2.0;                 /* seconds for a full weather change */
  const rip = new Float32Array(24);
  let slot = 0, W = 0, H = 0, cw = "day";
  let mixT = 1, dirty = true, live = false, last = -1;

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
    weather() { return cw; },
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
      if (w !== W || h !== H) {
        W = w; H = h; canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h);
        gl.uniform2f(u.res, w, h);
        gl.uniform1f(u.px, dpr);     /* lets the rain size itself in CSS px */
      }
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
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
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
