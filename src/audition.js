import { P, SFX, SEQUENCE, audio, setOn, resetParams, exportParams, loadOverrides, meter, testTone } from "./sfx.js";

setOn(true);
loadOverrides();

const $ = s => document.querySelector(s);
const CUES = [
  ["cast", "Rod whipping through air. Two bandpassed noise sweeps, up then down."],
  ["plop", "Bobber breaking the surface. Falling sine plus a bandpassed droplet transient."],
  ["bite", "Something down there. Low sine thud, then a rising triangle."],
  ["splash", "Fish leaves the water. Lowpassed noise fall plus a pitch-swept sine."],
  ["reel", "Ratchet. Highpassed clicks whose spacing eases so it slows as the fish lands."],
  ["land", "The payoff. Square arpeggio doubled an octave down in sine; extra notes when rare."],
  ["sparkle", "Only on a species you have never seen. Three rising triangles."],
  ["tick", "UI. Opening the dex, toggling sound."],
];

/* slider range guessed from the name, so adding a param needs no UI work */
function range(key, v) {
  if (key === "clicks") return [3, 48, 1];
  if (/gain|master/i.test(key)) return [0, Math.max(0.6, v * 2), 0.005];
  if (/dur|step/i.test(key)) return [0.01, Math.max(0.4, v * 2.5), 0.005];
  if (/ease|rise|q$/i.test(key)) return [0.2, Math.max(3, v * 2.5), 0.01];
  return [Math.max(20, v * 0.25), v * 2.6, 1];          // frequencies
}
const fmt = v => (Math.abs(v) >= 100 ? Math.round(v) : +v.toFixed(3));

const host = $("#cues");
host.innerHTML = CUES.map(([k, what]) => {
  const p = P[k] || {};
  const rows = Object.keys(p).map(pk => {
    const [lo, hi, st] = range(pk, p[pk]);
    return `<div class="p">
      <label for="${k}.${pk}">${pk}</label>
      <output id="o-${k}-${pk}">${fmt(p[pk])}</output>
      <input type="range" id="${k}.${pk}" data-c="${k}" data-p="${pk}"
             min="${lo}" max="${hi}" step="${st}" value="${p[pk]}">
    </div>`;
  }).join("");
  return `<section class="cue">
    <div class="cue-top">
      <h2>${k}</h2>
      <span class="what">${what}</span>
      <button class="btn" data-play="${k}">Play</button>
    </div>
    <div class="params">${rows}</div>
  </section>`;
}).join("");

host.addEventListener("input", e => {
  const el = e.target;
  if (!el.dataset.c) return;
  P[el.dataset.c][el.dataset.p] = +el.value;
  $(`#o-${el.dataset.c}-${el.dataset.p}`).textContent = fmt(+el.value);
});
host.addEventListener("click", e => {
  const b = e.target.closest("[data-play]");
  if (!b) return;
  audio();
  const k = b.dataset.play;
  SFX[k](k === "land" ? true : undefined);
});

const mv = $("#master"), mo = $("#master-v");
mv.value = P.master; mo.textContent = fmt(P.master);
mv.addEventListener("input", () => { P.master = +mv.value; mo.textContent = fmt(P.master); audio(); });

let timers = [];
$("#play-all").addEventListener("click", () => {
  audio();
  timers.forEach(clearTimeout); timers = [];
  SEQUENCE.forEach(([t, name]) => {
    timers.push(setTimeout(() => SFX[name](name === "land" ? true : undefined), t * 1000));
  });
});

/* live output meter: separates "the page is silent" from "your speakers are" */
const fill = $("#meter-fill");
let an = null, buf = null, hold = 0;
function pump() {
  requestAnimationFrame(pump);
  if (!an) { an = meter(); if (an) buf = new Float32Array(an.fftSize); else return; }
  an.getFloatTimeDomainData(buf);
  let m = 0;
  for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > m) m = v; }
  hold = Math.max(m, hold * 0.90);
  fill.style.width = Math.min(100, hold * 130).toFixed(1) + "%";
}
requestAnimationFrame(pump);
$("#tone").addEventListener("click", () => { audio(); testTone(); });

const msg = (s) => { $("#msg").textContent = s; setTimeout(() => { $("#msg").textContent = ""; }, 2200); };
const block = () => "export const P = " + exportParams() + ";";

$("#apply").addEventListener("click", () => {
  localStorage.setItem("ftf.sfx", exportParams());
  msg("applied — reload filetofish.codyh.xyz");
});
$("#copy").addEventListener("click", () => {
  const t = document.createElement("textarea");
  t.value = block();
  t.style.cssText = "position:fixed;top:0;left:0;opacity:0";
  document.body.appendChild(t); t.focus(); t.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (e) { }
  t.remove();
  if (!ok && navigator.clipboard) navigator.clipboard.writeText(block()).catch(() => { });
  msg("copied");
});
$("#show").addEventListener("click", () => {
  const o = $("#out");
  o.textContent = block();
  o.classList.toggle("on");
});
$("#reset").addEventListener("click", () => {
  resetParams();
  localStorage.removeItem("ftf.sfx");
  msg("reset");
  location.reload();
});
