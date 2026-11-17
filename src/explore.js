import oceanTemplate from "./ocean.html";
import { initOcean } from "./ocean.js";

/* Reuse the actual ocean, with its file-viewer UI isolated from the catch UI.
   Embedded mode opens a folder read-only, and never nets or deletes files. */
export function mountExploration(host, { sea, isBlocked: shellBlocked, onDepth, onCatch, onCast }) {
  /* the which-water question holds everything the way any open panel does */
  let choosing = false;
  const isBlocked = () => shellBlocked() || choosing;
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = oceanTemplate
    .replace(/<title>[\s\S]*?<\/title>/, "")
    .replace("<!--APP_BUNDLE-->", "")
    .replace(/\bbody\b/g, ":host") + `<style>
      :host{background:transparent;cursor:crosshair;}
      #depth,#place,#legend,#stats,#keys,#card,#net,
      #talk-choice,#talk-mute{display:none!important;}
      :host(.carding) #action{visibility:hidden;}
      :host(:not(.looking)) #cross,:host(.jumping) #cross{display:none!important;}
      :host(.looking) #cross{opacity:.7;}
      #action{bottom:29%;font-size:.7rem;}
      #action kbd{border-radius:.25rem;border-bottom-width:2px;padding:.12rem .34rem .08rem;}
      #intro,:host.chatting #intro{bottom:32%;}
      #tint{pointer-events:none;}
      @media(pointer:coarse){#action kbd{display:none;}}
      @media(prefers-reduced-motion:reduce){
        *,*::before,*::after{animation:none!important;transition:none!important;}
      }
    </style>`;
  const $ = selector => document.querySelector(selector);
  const dive = $("#dive"), up = $("#swim-up"), down = $("#swim-down");
  const stick = $("#move-stick"), knob = $("#move-knob"), status = $("#explore-status");
  const fast = $("#swim-fast"), lookHelp = $("#look-help");
  const card = $("#zone-card"), note = $("#fish-note");
  /* On a touch screen the keyboard hints are noise. */
  const touch = !!globalThis.matchMedia?.("(pointer:coarse)").matches;
  const canvas = root.querySelector("#gl");
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "Fishing world. WASD to move, click to look around, then click or F to fish, E to talk, Space to dive.");
  if (touch) dive.textContent = "Dive";       // a thumb button, not a keycap
  canvas.addEventListener("pointerdown", () => canvas.focus({ preventScroll: true }));
  let underwater = false, phase = "dock", lastLabel = "";
  const talking = () => !root.querySelector("#intro").hidden;
  const api = initOcean(root, {
    embedded: true,
    isBlocked,
    onCatch,
    onCast,
    onDive: () => waters.ask(),
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
      for (const control of [dive, stick, up, down, fast]) control.disabled = blocked;
      up.hidden = down.hidden = fast.hidden = phase !== "ocean";
      if (phase !== "ocean" && fastLock) setFast(false);   // the dock is walked
      dive.hidden = phase === "ocean";
      const label = `${phase}/${frame.perspective}/${!!frame.looking}`;
      if (label !== lastLabel) {
        lastLabel = label;
        /* keycaps, not a sentence: the eye finds the keys and the verb sits
           beside them. Every entry in the strip is written the same way,
           the one that is a button included. Depth and mouse-look go unsaid
           -- it is a 3D swim and people know how those work. Q is the only
           way back up, so the water names it. Esc stays while the cursor is
           held, because a captured cursor with no way out is a trap. */
        const caps = (keys, verb) => keys.map(k => `<kbd>${k}</kbd>`).join("") + `<b>${verb}</b>`;
        const cmd = (keys, verb) => `<span class="cmd">${caps(keys, verb)}</span>`;
        const jumping = phase === "jump";
        if (touch) dive.textContent = jumping ? "Diving" : "Dive";
        else dive.innerHTML = jumping ? "<b>diving</b>" : caps(["Space"], "dive");
        $("#move-help").innerHTML = cmd(["W", "A", "S", "D"], phase === "ocean" ? "swim" : "walk") +
          cmd(["Shift"], "sprint") + (phase === "ocean" ? cmd(["Q"], "dock") : "");
        lookHelp.hidden = !frame.looking;
      }
      gauge(underwater && frame.depth, frame.floor, frame.zones, phase === "ocean", blocked);
      if (blocked) { movePad.reset(); hint.hide(); }
      else hint.maybeShow(phase);
    },
  });
  /* The depth reading is a graduated beaker: the surface at the lip, the
     trench floor at the rounded foot, and the water inside darkening the way
     the sea does on the way down. The scale is only redrawn when the sea's
     depth changes; a frame just moves the marker.

     The named zones ride on it as quietly as they can: a notch on the outer
     wall where each one begins, and only the zone you are in spelled out,
     hanging down from its notch. Crossing into one says so across the middle
     of the screen, once -- the zone only changes when you are HOLD metres
     clear of the line, so the bob of a swim along a boundary is not a crossing,
     and a zone that has just been announced waits AGAIN ms to be announced
     again, so dithering between two is not a fanfare every few seconds.

     The first time in, once that first zone's name has cleared, the water says
     what the fish are. The cards take turns: nothing new lands while one is
     up, a crossing made during the fish note waits for it, and the talk
     button keeps out of the way until the middle of the screen is free. */
  const gauge = (() => {
    const HOLD = 2, AGAIN = 8000;
    let scale = 0, zset = null, shown = -1, you = null, read = null, label = null;
    let zone = -1, said = new Map(), pending = false;
    const zoneAt = d => {
      let k = 0;
      for (let i = 1; i < zset.length; i++) if (d >= zset[i].top) k = i;
      return k;
    };
    const place = () => {
      const z = zset[zone];
      label.hidden = !z;
      if (!z) return;
      label.textContent = z.name;
      label.style.top = `min(${(z.top / scale * 100).toFixed(2)}%, calc(100% - 3.4rem))`;
    };
    return (depth, floor, zones = [], swimming = false, blocked = false) => {
      status.hidden = depth === false;
      if (depth === false) {
        zone = -1; said = new Map(); pending = false;
        cards.clear();
        return;
      }
      floor = Math.max(floor || 0, depth, 1);
      if (floor !== scale || zones !== zset) {
        scale = floor; zset = zones;
        const major = [50, 100, 200, 250, 500, 1000].find(s => floor / s <= 7) || 1000, minor = major / 5;
        let ticks = "";
        for (let i = 1; i * minor < floor - minor / 2; i++) {
          const m = i * minor, big = i % 5 === 0;
          ticks += `<i${big ? ' class="major"' : ""} style="top:${(m / floor * 100).toFixed(2)}%">`
            + (big && m < floor - major * 0.4 ? `<b>${m}</b>` : "") + "</i>";
        }
        for (const z of zones) {
          if (z.top > 0 && z.top < floor) ticks += `<em style="top:${(z.top / floor * 100).toFixed(2)}%"></em>`;
        }
        status.innerHTML = `<span class="lip">surface</span><div class="glass">${ticks}`
          + `<span class="zone" hidden></span><div class="you"><i></i></div></div>`
          + `<span class="foot">trench floor<b>${Math.round(floor).toLocaleString("en")} m</b></span>`;
        status.setAttribute("aria-valuemax", String(Math.round(floor)));
        you = status.querySelector(".you"); read = you.querySelector("i"); shown = -1;
        label = status.querySelector(".zone");
        if (zone >= zset.length) zone = -1;
        place();
      }
      you.style.top = `${(depth / scale * 100).toFixed(2)}%`;
      if (swimming && zset.length) {
        const above = zoneAt(Math.max(0, depth - HOLD)), below = zoneAt(depth + HOLD);
        const next = zone < 0 ? zoneAt(depth) : above === below ? above : zone;
        if (next !== zone) {
          zone = next; place(); shown = -1;
          const now = performance.now();
          pending = false;
          if (!blocked && !(now - said.get(next) < AGAIN)) {
            if (cards.noteOn) pending = true;
            else { said.set(next, now); cards.zone(zset[next]); }
          }
        }
        if (!blocked && cards.free()) {
          if (pending) { pending = false; said.set(zone, performance.now()); cards.zone(zset[zone]); }
          else cards.maybeNote();
        }
      }
      const m = Math.round(depth);
      if (m !== shown) {
        shown = m;
        read.textContent = `${m} m`;
        status.setAttribute("aria-valuenow", String(m));
        status.setAttribute("aria-valuetext", `${m} m deep` + (zset[zone] ? `, ${zset[zone].name.toLowerCase()} zone` : ""));
      }
    };
  })();
  /* the middle of the screen holds one card at a time. A title card restarts
     with a class off, a reflow, and the class back on, so a second crossing
     replays it from the top; after either card goes, a GAP of clear water
     before the next one may land. */
  const cards = (() => {
    const GAP = 700;
    let cardOn = false, noteOn = false, noteDue = true, freeAt = 0;
    const sync = () => {
      const on = cardOn || noteOn;
      document.body.classList.toggle("zone-on", on);
      host.classList.toggle("carding", on);
    };
    const end = (el, done) => e => {
      if (e.target !== el || e.pseudoElement) return;   // the rules finishing is not the card
      el.classList.toggle("on", false);
      done();
      freeAt = performance.now() + GAP;
      sync();
    };
    card.addEventListener("animationend", end(card, () => { cardOn = false; }));
    note.addEventListener("animationend", end(note, () => { noteOn = false; noteDue = false; }));
    return {
      get noteOn() { return noteOn; },
      free: () => !cardOn && !noteOn && performance.now() >= freeAt,
      zone(z) {
        card.setAttribute("data-zone", z.name.toLowerCase());
        card.querySelector("b").textContent = z.name;
        card.querySelector("span").textContent = z.range;
        card.classList.toggle("on", false);
        void card.offsetWidth;
        card.classList.toggle("on", true);
        cardOn = true; sync();
      },
      maybeNote() {
        if (!noteDue) return;
        note.classList.toggle("on", true);
        noteOn = true; sync();
      },
      /* surfacing mid-note means it was not read: it plays on the next dive */
      clear() {
        card.classList.toggle("on", false);
        note.classList.toggle("on", false);
        cardOn = noteOn = false; freeAt = 0; sync();
      },
    };
  })();
  const act = fn => () => { if (!isBlocked() && !talking()) fn(); };
  dive.addEventListener("click", act(() => api.beginJump()));

  /* Which water. The sea is empty until the player says what goes in it, so
     Space and Dive only ask; an answer is what jumps. It asks on every dive,
     and a folder that is already down there is offered back by name -- going
     in again is one press, not another scan.

     Focus goes to the panel, never a coin: the Space that opened this is still
     held, and its keyup on a focused button would press it. 1 and 2 answer
     from the keyboard instead, which is where the hands already are. */
  const waters = (() => {
    const el = $("#waters"), pick = $("#waters-pick"), scan = $("#waters-scan");
    const mine = $("#water-mine"), demo = $("#water-demo"), other = $("#water-other");
    const mineCost = $("#water-mine-cost"), note = $("#waters-note");
    const PICK = "pick a folder<br>nothing is uploaded";
    const count = n => n.toLocaleString("en");
    let busy = false;                    // the browser's picker, a scan, or a choice landing
    const show = pane => { pick.hidden = pane !== pick; scan.hidden = pane !== scan; };
    const setBusy = on => { busy = on; el.classList.toggle("busy", on); };
    const mark = (taken, left) => {
      mine.classList.toggle("chosen", taken === mine); demo.classList.toggle("chosen", taken === demo);
      mine.classList.toggle("spent", left === mine); demo.classList.toggle("spent", left === demo);
    };
    const kept = () => api.drive?.kind === "folder";
    function offer() {
      const d = api.drive;
      if (kept()) {
        mineCost.innerHTML = `<i></i>${count(d.count)} files`;
        mineCost.querySelector("i").textContent = d.label;
      } else mineCost.innerHTML = PICK;
      other.hidden = !kept();
      mark(null, null); show(pick);
    }
    function ask() {
      if (choosing) return;
      choosing = true;
      /* a scan still running keeps its own pane: asking again watches it finish */
      if (!busy) { note.textContent = ""; offer(); }
      el.hidden = false;
      document.exitPointerLock?.();
      el.focus({ preventScroll: true });
    }
    function close() {
      if (!choosing) return;
      choosing = false; el.hidden = true;
      canvas.focus({ preventScroll: true });
    }
    function go() { close(); api.dive(); }
    async function folder() {
      if (busy) return;
      setBusy(true); note.textContent = "";
      let d;
      try {
        d = await api.loadFolder((n, path) => {
          show(scan);
          $("#waters-n").textContent = count(n);
          $("#waters-now").textContent = path;
          $("#waters-fill").style.width = Math.min(100, n / 40000 * 100).toFixed(1) + "%";
        });
      } catch (e) {
        note.textContent = "that folder would not open";
        throw e;
      } finally { setBusy(false); offer(); }
      if (!d) return;                                   // the picker was cancelled
      if (!d.count) { note.textContent = "nothing in there but water · try another"; return; }
      if (choosing) go();           // closed mid-scan: it waits, and is offered by name
    }
    function chooseMine() {
      if (busy) return;
      if (kept()) go(); else folder();
    }
    function chooseDemo() {
      if (busy) return;
      /* building the drive holds the page for a moment: let the coin flare first */
      setBusy(true); mark(demo, mine);
      setTimeout(() => { api.loadDemo(); setBusy(false); go(); }, 60);
    }
    mine.addEventListener("click", chooseMine);
    demo.addEventListener("click", chooseDemo);
    other.addEventListener("click", folder);
    $("#water-stay").addEventListener("click", close);
    el.addEventListener("click", e => { if (e.target === el) close(); });
    addEventListener("keydown", e => {
      if (!choosing || e.repeat) return;
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "1") chooseMine();
      else if (e.key === "2") chooseDemo();
      else if (e.key === "ArrowLeft") mine.focus();
      else if (e.key === "ArrowRight") demo.focus();
    });
    return { ask };
  })();

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
  /* Fast is the rim push made into a switch: the right thumb flips it and goes
     back to looking, and the left one only has to steer */
  let fastLock = false, pad = [0, 0, false];
  const steer = () => api.setMove(pad[0], pad[1], pad[2] || fastLock);
  const movePad = thumbStick(stick, knob, (x, z, rim) => { pad = [x, z, rim]; steer(); });
  function setFast(on) {
    fastLock = on;
    fast.setAttribute("aria-pressed", String(on));
    stick.classList.toggle("locked", on);
    if (pad[0] || pad[1]) steer();
  }
  fast.addEventListener("click", act(() => setFast(!fastLock)));

  /* Looking around is the whole screen: drag anywhere, flick to spin. Nothing
     on screen says so, so a phone gets shown once -- a ghost finger sweeping
     the sea -- and never again after the first real drag. */
  const hint = (() => {
    const el = $("#look-hint"), KEY = "filetofish.lookTaught";
    let taught = !touch, shownAt = 0, dragFrom = null;
    try { taught ||= localStorage.getItem(KEY) === "1"; } catch (e) { }
    const learn = () => {
      if (taught) return;
      taught = true;
      try { localStorage.setItem(KEY, "1"); } catch (e) { }
      el.classList.toggle("done", true);
      el.classList.toggle("on", false);
    };
    canvas.addEventListener("pointerdown", e => { dragFrom = [e.clientX, e.clientY]; });
    canvas.addEventListener("pointermove", e => {
      if (dragFrom && Math.hypot(e.clientX - dragFrom[0], e.clientY - dragFrom[1]) > 40) learn();
    });
    for (const type of ["pointerup", "pointercancel"]) canvas.addEventListener(type, () => { dragFrom = null; });
    return {
      maybeShow(where) {
        if (taught || where === "jump") return;
        if (!shownAt) shownAt = performance.now() + 1800;       // let the scene land first
        if (performance.now() > shownAt) el.classList.toggle("on", true);
      },
      hide: () => el.classList.toggle("on", false),
    };
  })();
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
  /* Things a thumb rests on. iOS runs its own long-press and double-tap
     gestures beside pointer events -- select, loupe, callout, zoom -- and only
     a cancelled touchstart stops them; none of these needs the click it costs. */
  for (const el of [canvas, stick, up, down]) {
    el.addEventListener("touchstart", e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    el.addEventListener("contextmenu", e => e.preventDefault());
  }
  /* a pinch anywhere would scale the HUD out from under both thumbs */
  document.addEventListener("gesturestart", e => e.preventDefault());
  const clear = () => { movePad.reset(); api.clearInput(); };
  addEventListener("blur", clear);
  document.addEventListener("visibilitychange", () => { if (document.hidden) clear(); });
  return Object.assign(api, {
    getUnderwater: () => underwater,
    busy: () => isBlocked() || talking() || phase === "jump",
    choosing: () => choosing,
  });
}
