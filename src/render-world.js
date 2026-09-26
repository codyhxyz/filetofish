import { Sea } from "./sea.js";

const $ = s => document.querySelector(s);
const before = Sea($("#before"));
const after = Sea($("#after"));
if (!before || !after) {
  before?.dispose();
  after?.dispose();
  document.querySelectorAll("button,select,input").forEach(control => { control.disabled = true; });
  $("#status").innerHTML = 'Live water needs WebGL2. <a href="/render-world/reflections/">View the still comparison</a>.';
}
const keys = ["crisp", "detail", "foam", "shine"];
const inputs = keys.map(k => $("#" + k));
const values = keys.map(k => $("#" + k + "-v"));
const zoomInput = $("#zoom"), zoomValue = $("#zoom-v");
const waveInput = $("#waves"), waveValue = $("#waves-v");
const target = inputs.map(input => Number(input.value) / 100);
let animation = 0;

function paint(next, announce = true) {
  after.setTuning(next);
  next.forEach((n, i) => {
    inputs[i].value = Math.round(n * 100);
    values[i].textContent = `${Math.round(n * 100)}%`;
  });
  if (announce) $("#status").innerHTML = `candidate: <strong>${next.map(n => Math.round(n * 100)).join(" / ")}</strong> · zoom <strong>${zoomInput.value}%</strong>`;
}

inputs.forEach((input, i) => input.addEventListener("input", () => {
  if (animation) cancelAnimationFrame(animation), animation = 0;
  const next = inputs.map(item => Number(item.value) / 100);
  paint(next);
}));

waveInput.addEventListener("input", () => {
  after.setWaveIntensity(Number(waveInput.value) / 100);
  waveValue.textContent = `${waveInput.value}%`;
});

zoomInput.addEventListener("input", () => {
  if (animation) cancelAnimationFrame(animation), animation = 0;
  const value = Number(zoomInput.value);
  before.setZoom(value / 100);
  after.setZoom(value / 100);
  zoomValue.textContent = `${value}%`;
  $("#status").innerHTML = `candidate: <strong>${inputs.map(input => input.value).join(" / ")}</strong> · zoom <strong>${value}%</strong>`;
});

$("#reset").addEventListener("click", () => {
  if (animation) cancelAnimationFrame(animation), animation = 0;
  paint([0, 0, 0, 0]);
  zoomInput.value = 100;
  zoomValue.textContent = "100%";
  before.setZoom(1); after.setZoom(1);
  waveInput.value = 100;
  waveValue.textContent = "100%";
  after.setWaveIntensity(1);
  $("#status").innerHTML = `candidate: <strong>0 / 0 / 0 / 0</strong> · zoom <strong>100%</strong>`;
  $("#animate").textContent = "animate test";
});

$("#weather").addEventListener("change", e => {
  before.setWeather(e.target.value);
  after.setWeather(e.target.value);
});

$("#animate").addEventListener("click", () => {
  if (animation) {
    cancelAnimationFrame(animation); animation = 0;
    $("#animate").textContent = "animate test";
    return;
  }
  const start = performance.now();
  const run = now => {
    const loop = ((now - start) % 4200) / 4200;
    const amount = loop < 0.5 ? loop * 2 : 2 - loop * 2;
    const eased = amount * amount * (3 - 2 * amount);
    paint(target.map(n => n * eased), false);
    $("#status").innerHTML = `auto test: <strong>${Math.round(eased * 100)}% crispness</strong>`;
    animation = requestAnimationFrame(run);
  };
  $("#animate").textContent = "stop animation";
  animation = requestAnimationFrame(run);
});

function frame(now) {
  if (!before || !after) return;
  const t = now / 1000;
  before.render(t);
  after.render(t);
  requestAnimationFrame(frame);
}

if (before && after) {
  before.setZoom(1);
  after.setZoom(1);
  paint(target);
  requestAnimationFrame(frame);
}
