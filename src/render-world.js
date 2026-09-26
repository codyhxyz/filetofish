import { Sea } from "./sea.js";

const $ = s => document.querySelector(s);
const sea = Sea($("#preview"));
const time = $("#time"), weather = $("#weather");
const waves = $("#waves"), zoom = $("#zoom");
let paused = false;

function updateTime() {
  const minutes = Number(time.value);
  const date = new Date();
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  sea.setTime(date);
  weather.value = "auto";
  $("#time-v").textContent = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function updateWaves() {
  sea.setWaveIntensity(Number(waves.value) / 100);
  $("#waves-v").textContent = `${waves.value}%`;
}
function updateZoom() {
  sea.setZoom(Number(zoom.value) / 100);
  $("#zoom-v").textContent = `${zoom.value}%`;
}

time.addEventListener("input", updateTime);
waves.addEventListener("input", updateWaves);
zoom.addEventListener("input", updateZoom);
weather.addEventListener("change", () => {
  if (weather.value === "auto") updateTime();
  else sea.setWeather(weather.value);
});
$("#reset").addEventListener("click", () => {
  time.value = 450;
  waves.value = zoom.value = 100;
  updateTime(); updateWaves(); updateZoom();
});
$("#pause").addEventListener("click", e => {
  paused = !paused;
  e.currentTarget.textContent = paused ? "Resume" : "Pause";
  e.currentTarget.setAttribute("aria-pressed", String(paused));
});

// One scene, no comparison renderer or background animation while hidden.
let sceneTime = 0, last = null;
function frame(now) {
  if (last !== null && !paused && !document.hidden) sceneTime += Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!document.hidden) sea.render(sceneTime);
  requestAnimationFrame(frame);
}
updateTime();
updateWaves();
updateZoom();
requestAnimationFrame(frame);
