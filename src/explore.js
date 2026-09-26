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
      @media(pointer:coarse){#action kbd{display:none;}}
      @media(prefers-reduced-motion:reduce){
        *,*::before,*::after{animation:none!important;transition:none!important;}
      }
    </style>`;
  const $ = selector => document.querySelector(selector);
  const dive = $("#dive"), view = $("#view"), up = $("#swim-up"), down = $("#swim-down");
  const stick = $("#move-stick"), knob = $("#move-knob"), status = $("#explore-status");
  const lookStick = $("#look-stick"), lookKnob = $("#look-knob");
  /* On a touch screen the keyboard hints are noise and the view follows the
     water: first person on the dock, third person once you are in. */
  const touch = !!globalThis.matchMedia?.("(pointer:coarse)").matches;
  const canvas = root.querySelector("#gl");
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "Fishing world. WASD to move, drag to look, Space to dive, V to change view, Q to return.");
  canvas.addEventListener("pointerdown", () => canvas.focus({ preventScroll: true }));
  let underwater = false, phase = "dock", lastLabel = "";
  const talking = () => !root.querySelector("#intro").hidden;
  const api = initOcean(root, {
    embedded: true,
    autoPerspective: touch,
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
      for (const control of [dive, view, stick, lookStick, up, down]) control.disabled = blocked;
      up.hidden = down.hidden = phase !== "ocean";
      const label = `${phase}/${frame.perspective}`;
      if (label !== lastLabel) {
        lastLabel = label;
        dive.textContent = phase === "ocean" ? (touch ? "Return" : "Return · Q")
          : phase === "jump" ? "Diving" : touch ? "Dive" : "Dive · Space";
        dive.setAttribute("aria-label", phase === "ocean" ? "Return to the dock (Q)" : "Jump into the ocean (Space)");
        view.textContent = frame.perspective === "first" ? "1st person · V" : "3rd person · V";
        view.setAttribute("aria-label", `Switch to ${frame.perspective === "first" ? "third" : "first"} person (V)`);
        $("#move-help").textContent = phase === "ocean"
          ? "WASD swim · Shift sprint · drag to look · ↑ ↓ depth"
          : "WASD walk · Shift sprint · drag to look";
      }
      status.textContent = underwater ? `${Math.round(frame.depth)} m deep` : "";
      if (blocked) { movePad.reset(); lookPad.reset(); }
    },
  });
  const act = fn => () => { if (!isBlocked() && !talking()) fn(); };
  dive.addEventListener("click", act(() => phase === "ocean" ? api.returnToDock() : api.beginJump()));
  view.addEventListener("click", act(() => api.toggleView()));

  /* One thumb stick: drag inside it for a direction, let go to centre. Only the
     finger that started on it may steer it. */
  function thumbStick(el, knobEl, onMove) {
    let pointer = null;
    const reset = () => {
      const held = pointer;
      pointer = null;
      if (held !== null && el.hasPointerCapture(held)) el.releasePointerCapture(held);
      knobEl.style.transform = "";
      el.classList.toggle("fast", false);
      onMove(0, 0, false);
    };
    const move = e => {
      if (e.pointerId !== pointer) return;
      const r = el.getBoundingClientRect(), radius = r.width * 0.32;
      let x = (e.clientX - r.left - r.width / 2) / radius;
      let y = (e.clientY - r.top - r.height / 2) / radius;
      /* pushing past the rim is the sprint: the knob stops at the edge but the
         thumb keeps going, the way it does on every console stick */
      const length = Math.hypot(x, y), fast = length > SPRINT_REACH;
      if (length > 1) { x /= length; y /= length; }
      knobEl.style.transform = `translate(${x * radius}px,${y * radius}px)`;
      el.classList.toggle("fast", fast);
      onMove(x, -y, fast);
    };
    el.addEventListener("pointerdown", e => {
      if (el.disabled || pointer !== null || e.button !== 0) return;
      e.preventDefault();
      pointer = e.pointerId;
      el.setPointerCapture(pointer);
      move(e);
    });
    el.addEventListener("pointermove", move);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      el.addEventListener(type, e => { if (e.pointerId === pointer) reset(); });
    }
    return { reset: () => { if (pointer !== null) reset(); } };
  }
  const SPRINT_REACH = 1.45;
  const movePad = thumbStick(stick, knob, (x, z, fast) => api.setMove(x, z, fast));
  const lookPad = thumbStick(lookStick, lookKnob, (x, up) => api.setLook(x, up));
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
  const clear = () => { movePad.reset(); lookPad.reset(); api.clearInput(); };
  addEventListener("blur", clear);
  document.addEventListener("visibilitychange", () => { if (document.hidden) clear(); });
  return Object.assign(api, {
    getUnderwater: () => underwater,
    busy: () => isBlocked() || talking() || phase === "jump",
  });
}
