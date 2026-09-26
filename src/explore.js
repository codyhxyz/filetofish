import oceanTemplate from "./ocean.html";
import { initOcean } from "./ocean.js";

/* Reuse the actual ocean, with its file-viewer UI isolated from the catch UI.
   Embedded mode never opens folders or nets/deletes files. */
export function mountExploration(host, { sea, isBlocked, onDepth }) {
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = oceanTemplate
    .replace(/<title>[\s\S]*?<\/title>/, "")
    .replace("<!--APP_BUNDLE-->", "")
    .replace(/\bbody\b/g, ":host") + `<style>
      :host{background:transparent;cursor:grab;}
      #gl{touch-action:none;}
      #depth,#place,#legend,#stats,#keys,#cross,#card,#net,
      #talk-choice,#talk-mute{display:none!important;}
      #action{bottom:29%;font-size:.7rem;}
      #intro,:host.chatting #intro{bottom:32%;}
      #tint{pointer-events:none;}
      @media(prefers-reduced-motion:reduce){
        *,*::before,*::after{animation:none!important;transition:none!important;}
      }
    </style>`;
  const $ = selector => document.querySelector(selector);
  const dive = $("#dive"), view = $("#view"), up = $("#swim-up"), down = $("#swim-down");
  const stick = $("#move-stick"), knob = $("#move-knob"), status = $("#explore-status");
  const canvas = root.querySelector("#gl");
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "Fishing world. WASD to move, drag to look, Space to dive, V to change view, Q to return.");
  canvas.addEventListener("pointerdown", () => canvas.focus({ preventScroll: true }));
  let underwater = false, phase = "dock", lastLabel = "", padPointer = null;
  const talking = () => !root.querySelector("#intro").hidden;
  const api = initOcean(root, {
    embedded: true,
    isBlocked,
    onFrame(frame) {
      phase = frame.phase;
      underwater = frame.underwater;
      sea?.setCamera(frame.camera);
      // Paint both renderers with this frame's camera, not last frame's pose.
      if (!underwater) sea?.render(performance.now() / 1000);
      onDepth(underwater ? frame.depth : 0);
      document.body.classList.toggle("underwater", underwater);
      document.body.classList.toggle("third-person", frame.perspective === "third");
      document.body.classList.toggle("diving", phase === "jump");
      const blocked = isBlocked() || talking() || phase === "jump";
      document.body.classList.toggle("exploration-blocked", blocked);
      for (const control of [dive, view, stick, up, down]) control.disabled = blocked;
      up.hidden = down.hidden = phase !== "ocean";
      const label = `${phase}/${frame.perspective}`;
      if (label !== lastLabel) {
        lastLabel = label;
        dive.textContent = phase === "ocean" ? "Return · Q" : phase === "jump" ? "Diving" : "Dive · Space";
        dive.setAttribute("aria-label", phase === "ocean" ? "Return to the dock (Q)" : "Jump into the ocean (Space)");
        view.textContent = frame.perspective === "first" ? "1st person · V" : "3rd person · V";
        view.setAttribute("aria-label", `Switch to ${frame.perspective === "first" ? "third" : "first"} person (V)`);
        $("#move-help").textContent = phase === "ocean"
          ? "WASD swim · drag to look · ↑ ↓ depth"
          : "WASD walk · drag to look";
      }
      status.textContent = underwater ? `${Math.round(frame.depth)} m deep` : phase === "jump" ? "into the blue" : "on the dock";
      if (blocked && padPointer !== null) resetPad();
    },
  });
  const act = fn => () => { if (!isBlocked() && !talking()) fn(); };
  dive.addEventListener("click", act(() => phase === "ocean" ? api.returnToDock() : api.beginJump()));
  view.addEventListener("click", act(() => api.toggleView()));

  function resetPad() {
    const pointer = padPointer;
    padPointer = null;
    if (pointer !== null && stick.hasPointerCapture(pointer)) stick.releasePointerCapture(pointer);
    knob.style.transform = "";
    api.setMove(0, 0);
  }
  function movePad(e) {
    if (e.pointerId !== padPointer) return;
    const r = stick.getBoundingClientRect(), radius = r.width * 0.32;
    let x = (e.clientX - r.left - r.width / 2) / radius;
    let y = (e.clientY - r.top - r.height / 2) / radius;
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    knob.style.transform = `translate(${x * radius}px,${y * radius}px)`;
    api.setMove(x, -y);
  }
  stick.addEventListener("pointerdown", e => {
    if (stick.disabled || padPointer !== null || e.button !== 0) return;
    e.preventDefault();
    padPointer = e.pointerId;
    stick.setPointerCapture(padPointer);
    movePad(e);
  });
  stick.addEventListener("pointermove", movePad);
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    stick.addEventListener(type, e => { if (e.pointerId === padPointer) resetPad(); });
  }
  for (const [button, direction] of [[up, 1], [down, -1]]) {
    let pointer = null;
    const release = () => { pointer = null; api.setVertical(0); };
    button.addEventListener("pointerdown", e => {
      if (button.disabled || pointer !== null || e.button !== 0) return;
      e.preventDefault(); pointer = e.pointerId;
      button.setPointerCapture(pointer); api.setVertical(direction);
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) button.addEventListener(type, release);
    button.addEventListener("keydown", e => {
      if (e.code === "Space" || e.key === "Enter") { e.preventDefault(); api.setVertical(direction); }
    });
    button.addEventListener("keyup", release);
    button.addEventListener("blur", release);
  }
  const clear = () => { resetPad(); api.clearInput(); };
  addEventListener("blur", clear);
  document.addEventListener("visibilitychange", () => { if (document.hidden) clear(); });
  return Object.assign(api, {
    getUnderwater: () => underwater,
    busy: () => isBlocked() || talking() || phase === "jump",
  });
}
