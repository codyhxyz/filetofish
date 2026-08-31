# design — how filetofish is built

How the thing is built, and why each choice was made. The front page is
`README.md`; the file viewer prototype is `OCEAN.md`.

```
npm install
node build.mjs                 # -> dist/ (site) and mockups/ (artifact build)
cd dist && python3 -m http.server
```

## Layout

- `src/page.html` — markup + CSS, with an `<!--APP_BUNDLE-->` marker
- `src/app.js` — the site, imports `three`, `./sfx.js` and `./sea.js`
- `src/sea.js` — sky and water: the GLSL, the seven weathers, the cross-fade
- `src/sfx.js` — synthesised audio, shared with the audition page and the ocean
- `src/audition.{html,js}` — the /sfx tuning page
- `build.mjs` — esbuild bundles to an IIFE and inlines it, then emits two builds:
  - `dist/index.html` — standalone, its own `<head>` (title, **viewport**, OG, favicon)
  - `mockups/index.html` — body only, pure ASCII, for hosts that own `<head>`

The ASCII pass matters for the artifact build: no `<meta charset>` to rely on, so
every non-ASCII character becomes an entity or a `\u` escape or it mojibakes.

## The look

Two renderers, deliberately different:

- **The sea** is hand-written GLSL, no library, in seven weathers (see below).
  Cel-banded with foam from
  `abs(fract(fbm) - 0.5)` anti-aliased against `fwidth`, biased toward wave crests
  so it reads as water rather than a contour map. Ripples are pushed in as uniforms
  when the bobber lands.
- **The fish** is three.js: low-poly (11×7 body, ~200 tris), non-indexed so
  `computeVertexNormals` gives hard facets, a 4-step lamp, no specular, muted
  palette. Rendered to a low-res target and post-processed with an 8×8 Bayer dither
  at 5 levels per channel, plus a silhouette ink pass that finds transparent texels
  touching opaque ones. That combination is the OSRS item-sprite look.

The turntable eases: `spin - 0.45·sin(2·spin)`. A linear turntable parks flat fish
edge-on where they read as a sliver; this lingers in profile and hurries through
head-on.

## Weather

Seven skies — `dawn`, `sunrise`, `day`, `dusk`, `night`, `fog`, `rain` — live in
`src/sea.js`. Each is a flat 46-float scene (water, sky, haze, cloud, sun) and
`setWeather()` lerps the whole array over 2 s, so nothing ever snaps.

The load-bearing trick is that the **visible sun and the key light are separate
vectors**. The sun can sit on the horizon for the glitter path while the swell
still gets a high key, so the cel bands never flatten out at sunrise or dusk. The
glitter path itself comes off the half-vector slope rather than a `pow(dot)` hack,
which is why it narrows at the horizon and spreads toward the camera.

Which sky you get is your actual local time (`weatherForDate`), with a small chance
of fog or rain rolling in instead. The clock strip top-right ticks to the second and
cycling the weather by hand is one click; `?wx=night` pins one so a particular sky
can be shared or screenshotted.

The strip is also a dial. Take hold of it and turn and the hands follow your hand --
angle, not pixels, so a full circle is twelve hours and the further out you take the
pointer the finer the hour gets (inside 26 px the angle is all noise and is watched
but not spent). Whatever hour you let go on is the hour the sky believes: the clock
goes the colour of the weather, a **back to now** appears under it, and the offset
rides on top of the machine clock so the seconds keep running from wherever you left
them. The wheel is a crown (10 min a notch), the arrow keys step 15 min and an hour,
`Esc` gives it back, and `?t=19:30` boots straight into an hour -- which is the short
way to look at a dusk that is nine hours away. A press that never moves is still just
a click, so cycling the weather survives the dial. Turning the hands hands the sky
back to the hour it lands on; a click pins one on regardless.

Whatever the sea is doing, the catch is lit to match: `paletteNow()` hands back the
mid-cross-fade light, which grades the fish through a uniform in the post pass and
the rod through a CSS filter on the SVG. A fish landed at midnight is a fish at
midnight.

## Sound

Entirely synthesised in WebAudio -- no samples, no assets, no licensing, 0 bytes of
payload. Simple waveforms and short envelopes on purpose: realistic water foley
fights the dither, chiptune-adjacent blips sit with it. Two primitives do all of it:
`bleep()` (one oscillator, exponential pitch slide, percussive envelope) and
`hiss()` (filtered noise burst). Everything runs through one bus with a gentle
lowpass so nothing gets shrill.

| cue | build |
|---|---|
| cast | two bandpassed noise sweeps, up then down |
| plop | 700->105 Hz sine + a bandpassed droplet transient |
| bite | low sine thud + a rising triangle |
| splash | lowpassed noise fall + a pitch-swept sine |
| reel | ~20 highpassed noise clicks, spacing eased so the ratchet slows |
| catch | C-E-G-C square arpeggio doubled an octave down in sine |
| sparkle | three rising triangles, only on a never-seen species |
| voice | animalese: one formant blip per letter (see `OCEAN.md`) |

**Do not ship RuneScape or Nintendo assets** — audio or models. The visual homage
is fine; the assets are not, and it is exactly what gets a viral site pulled. This
is why the ocean's animalese is synthesised from a formant table rather than
sampled, and why its otter is modelled rather than downloaded.

Autoplay: the first cue fires from `requestAnimationFrame`, not from the gesture, so
`unlock()` creates and resumes the context inside the click/drop/change handlers
themselves. Verified with a trusted CDP input event -- a synthetic `dispatchEvent`
leaves the context suspended and will mislead you. Preference persists in
`ftf.sound`.

## Tuning the sound

Levels are measured, not guessed. Tap the graph with an `AnalyserNode` injected via
CDP `Page.addScriptToEvaluateOnNewDocument` (needs `Page.enable` first) and read the
peak per cue. The first pass measured 0.03-0.30 -- a 10x spread -- because `hiss()`
loses far more level through a bandpass than `bleep()` does from a raw oscillator,
and both had similar-looking gain numbers. Everything now sits 0.24-0.53 with a
`DynamicsCompressor` on the bus for headroom.



**https://filetofish.codyh.xyz/sfx** -- every cue with a Play button, a slider per
parameter, and "Play the whole cast" which fires them on the real timings so pacing
can be judged rather than guessed.

It imports `src/sfx.js`, the same module the site uses, so what you hear while tuning
is what ships. Two ways out:

- **Apply to the site** writes the tuning to `localStorage["ftf.sfx"]`; reload the
  main page and it uses your values. Good for A/B in context, local to your browser.
- **Copy params** gives the `export const P = {...}` block to paste over the one in
  `src/sfx.js` to make it permanent. **Reset** clears both.

The page carries a live output meter and a 440 Hz reference tone: if the bar moves
and you hear nothing, it is the output device or a muted tab, not the code.

Sliders are generated from `P`, with ranges guessed from the parameter name, so
adding a knob needs no UI work. The page is `noindex` and costs 12 KB; delete
`src/audition.*` and the third block in `build.mjs` to remove it.

## Inspecting the soundtrack

**`/score`** is the read-only production score. It imports `TRACKS` and
`compileTimeline()` from `src/music.js`, so the phrase map and piano roll show the
same expanded 32-bar events that the scheduler plays. `soundtrack/scores.json` is
an older sketch format and is deliberately not used by this tool.

Phrase boundaries follow changes in the arrangement's `layer`; a run longer than
eight bars splits into readable eight-bar phrases. Each channel lane reports its
actual scheduled-note count. Selecting a piano-roll note loads and plays that
track's production SoundFont, then exposes pitch/MIDI number, instrument, channel,
bar and beat, duration, gain, and swing. The page is `noindex` and built from
`src/score.{html,js}` by `build.mjs`.

## The rod

Modelled as a cubic blank from an off-screen butt to the tip, with control points
offset along the perpendicular by a signed `bend`. The bend is a damped spring
(`k=118, c=13`, so underdamped) chasing a per-state target, which means releasing a
load whips through and overshoots on its own rather than being keyframed.

Targets: rearing back at `-125`, resting near `+16`, a fish on at `+78` with jitter,
and `+185` easing to `+60` through the fight. The blank is ~740 px long, so anything
under ~60 px of tip offset simply does not read -- an earlier pass at `78` looked
rigid.

Drawn to match the fish rather than to look like vector art: eleven flat-sided quads
with whole-pixel widths, so the blank **steps down in facets** the way the low-poly
body does, under a hard ink silhouette and three flat shading bands. Faceted cork
grip, an octagonal reel that rides the curve, diamond guides with a short lash of
whipping thread. `shape-rendering:crispEdges` keeps the edges aliased, which is the
same chunky material as the pixel-diced fish. The tip is read back off the curve, so
the line and bobber follow the flex instead of hanging off a fixed point.

The hand holding it drifts after the cursor — a fraction of the way (46 px of travel
across the full width) and late, chasing on an exponential, so the rod feels carried
rather than pinned to the pointer. The butt follows at 30% of the tip, which is what
turns a translation into a pivot.

## Flourishes

Droplets and sparks are `Points` living **inside the three.js scene**, so they pass
through the same dither + silhouette-ink pass as the fish and come out looking
native -- white beads with a chunky black rim -- rather than pasted on. One draw
call, 110-particle pool, simulated on the CPU. `gl_PointSize` is scaled by the
render-target height, not the canvas, or droplets come out `PX` times too big.

- **splash** on the fish breaking the surface
- **drip** — a fish out of water sheets off fast and then only beads, so the gap
  between drops grows as `sqrt(1 + 5t)`: three drops every 55 ms at first, a lone
  bead a second by the half-minute mark, then dry
- **burst** in the rarity colour on Rare and above, plus a one-shot vignette flash
  driven by a `--rar` custom property. Rarity was a state; now it is a moment.
- **idle ripples** pushed into the sea shader every few seconds so the empty screen
  is a place rather than a still
- **screen shake** on the bite and the landing: a decaying random offset on `#world`,
  which wraps only the sea, rod and fish, so the UI never judders

All of it is skipped under `prefers-reduced-motion`, and particles are hidden during
icon capture so dex sprites show the fish alone.

## The dex

The hash makes infinite individuals, so the collectible unit is the **species**:
archetype x noun, 38 of them, plus the zero-byte Ghost Minnow. That is the finite
set you can actually finish.

Entries are pre-rendered icons, which is how OSRS does item sprites anyway: when a
catch is kept the fish is built off-screen, rendered at a canonical 3/4 angle through
the same dither + ink post-pass into an 88x66 target, read back with
`readRenderTargetPixels`, flipped (GL reads bottom-up) and stored as a PNG data URL
in `localStorage` under `ftf.dex.v1`. A full 39-species dex is ~120 KB, and the
save path drops icons rather than failing if quota is ever hit.

Dropping more than one file switches to **haul mode**: no cast animation, every
file is hashed straight into the dex, the rarest becomes the on-screen specimen,
and the dex opens on its own showing what is new. Drop a folder; a few hundred
files is roughly a full set (coupon-collector over unequal archetype weights).

Only a better rarity overwrites an existing entry, so the dex keeps your best of
each species.

## Sharing

A fish is a pure function of `(name, size, MIME, hash)`, so a link needs no server:
those four values are packed as base64url into `#f=...` and reconstructed exactly on
open. Opening someone's link puts their fish in your hands with the same three
choices you get for your own — collecting it is how it becomes yours.

The card is composed 1200x630 on a 2D canvas: the fish re-rendered through the same
dither + ink pass, the name, the file it came from, and the domain. Synchronous
`toDataURL` rather than `toBlob`, so there is no async path to fail. On a coarse
pointer the native share sheet is invoked straight out of the tap, before any
`await` can spend the gesture; everywhere else the clipboard is the handoff.

Known limit: OG previews of a `#f=` link show the generic `og.png`, not that fish.
Hash fragments are never sent to the server, so no static host can do per-fish
previews -- the printed card is the answer to that.

## Deploy

Cloudflare Pages, project `filetofish`, custom domain `filetofish.codyh.xyz`
(CNAME -> `filetofish.pages.dev`, proxied, in the `codyh.xyz` zone).

```
node build.mjs
wrangler pages deploy dist --project-name=filetofish --branch=main --commit-dirty=true
```

Creds come from `~/.claude/secrets/cloudflare.env` via `~/.zshrc`. See the
`cloudflare-ops` skill. Whole app is ~145 KB gzipped, static, $0 per catch.

## Gotchas hit along the way

- Cones point +Y; aim them along a surface normal with `rotation.x = π/2 − θ`.
- The peduncle must keep a floor radius or the tail fin reads as detached.
- Fit to a real `Box3`, not to length — deep-bodied archetypes overflow otherwise.
- An inverted-hull outline drew over the body and skipped the fins.
- A dither post-pass must preserve alpha or it paints the whole background black.
- SVG rasterised through a `data:` URI needs an explicit `xmlns` on the root.
- A flex child that scrolls needs `min-height:0` or it refuses to shrink.
- `max-height:100%` on a grid item is circular unless the row is definite
  (`grid-template-rows:minmax(0,1fr)`).
- `e.currentTarget` is null after any `await` -- capture the element first.
- A synthetic `DragEvent`/`MouseEvent` is not a trusted gesture: `AudioContext`
  stays suspended. Test audio unlock with real CDP `Input.dispatchMouseEvent`.
- `Runtime.evaluate` runs in global scope, so re-declaring `const x` across two
  calls throws SyntaxError and silently kills the step.
- `readMeta` slices the first 64 KB *before* sampling, so any offline model of the
  hash must cap at 65536 or it will not reproduce the app's fish.
- Rarity now drives the ink colour of the silhouette pass, so it reads in the dex
  grid at a glance; Legendary and Mythic also get a sweeping sheen.
