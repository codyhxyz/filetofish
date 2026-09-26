/* Clock and fish/rod grades, independent of the renderer. */
export const WEATHERS = ["dawn", "sunrise", "day", "dusk", "night", "fog", "rain"];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const PALETTES = {
  dawn: { label: "dawn", css: "#9EB0E6", light: [0.76, 0.80, 1.00], ambient: 0.78 },
  sunrise: { label: "sunrise", css: "#FFB05C", light: [1.14, 0.92, 0.70], ambient: 1.00 },
  day: { label: "clear", css: "#7EC8E3", light: [1.00, 1.00, 1.00], ambient: 1.00 },
  dusk: { label: "dusk", css: "#FF7E6B", light: [1.06, 0.78, 0.74], ambient: 0.86 },
  night: { label: "night", css: "#8CA6F0", light: [0.52, 0.62, 0.96], ambient: 0.55 },
  fog: { label: "fog", css: "#B9C7CC", light: [0.90, 0.93, 0.95], ambient: 0.86 },
  rain: { label: "rain", css: "#86AFA8", light: [0.72, 0.80, 0.82], ambient: 0.72 },
};
export function paletteOf(name) { return PALETTES[name] || PALETTES.day; }

export function weatherForDate(d) {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 5.0) return "night";
  if (h < 6.5) return "dawn";
  if (h < 8.25) return "sunrise";
  if (h < 17.75) return "day";
  if (h < 20.5) return "dusk";
  return "night";
}

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
