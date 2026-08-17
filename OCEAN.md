# ocean — the file viewer

**https://filetofish.codyh.xyz/ocean**

Point it at a folder and it reads it — in your browser, on your machine,
nothing uploaded. There's a synthetic 52,000-file drive to explore if you'd
rather not open anything. Everything below is a decision, not an accident, and
every one has a knob.

**Reading a folder.** Two ways in. Chromium's `showDirectoryPicker` hands back
live handles, which is the only way a browser can ever *delete* anything, so
that's the preferred path; `getFile()` is the expensive call and there's no
metadata-only API, so it goes out in batches of 64. Everywhere else falls back
to `<input webkitdirectory>`, which is much faster because the browser does the
walk natively, but is read-only. Either way only name, size and mtime are read
— never contents. Capped at 250,000 files, past which the layout stops being
comprehensible anyway.

**The net, and deleting.** Aim at a fish and click (or `E`) to net it. The net
bar totals what you've gathered and can copy the paths, let them go, or delete
them permanently. Deletion is gathered-then-confirmed rather than
one-click-per-file, because there is no undo and no trash — the gate has to be
before the act. The confirmation prints the exact count, the bytes, and the
full path list. Only files netted by hand are ever touched, via the exact
parent handle captured during the scan.

Knobs live in the `TUNE` block at the top of `src/ocean.js`. The page also
exposes `window.ocean = { TUNE, cam, files, places, ARCH }`, so most of it can
be pulled around live in the console. The per-frame values (fog, tier
distances, speeds) respond immediately; the layout values (`lateral`,
`ageCurve`, `years`) are baked at load and need a reload.

---

## The two axes that carry meaning

### Depth is age. Surface is today, the abyss is twelve years ago.

The single most important decision. Files sink as they age.

It pays for itself four times: you descend through your own archaeology in the
one direction that already felt like descending; it explains why the deep is
dark without inventing a reason; it gives a dive somewhere to go; and it
retires "rarity," which in the main app is pure hash noise and means nothing.

The mapping is `-depth * ((age - lo) / (hi - lo)) ^ ageCurve`, with
`ageCurve: 0.52`. Below 1.0 that curve gives recent files a lot of room and
compresses the past — which matches how you actually think about your files.
Last week is a place. 2014 is a smear. Set it to `1.0` for a linear calendar;
the gauge on the left re-spaces itself to match.

**How far back the abyss reaches is not a knob.** `lo` and `hi` are the folder's
own p01 and p99 ages, so the water column always fits the data: a repo cloned
this morning spans minutes, a photo library spans fifteen years, and both fill
the frame. Percentiles rather than min/max, or one stray file from 1998
flattens everything else into the surface. This is why the gauge is labelled in
relative dates ("6 hours ago", "3 years ago") rather than calendar years.

The whole ocean is also **scaled uniformly to the size of the drive** — a
thousand-file folder is a small sea rather than a few specks lost in a big one.
Physical size carries no meaning; only the ratios do. `lateral: 760` and
`depth: 900` are the dimensions at the reference size of ~52,000 files.

### Lateral position is folder. Folders are places, not schools.

A school is a behaviour — same species, same size, moving together. A folder is
heterogeneous by nature. Rendering a folder *as* a school produces a bag of
mismatched animals, so folders are **locations** instead, and schooling emerges
separately from *similarity* (see below).

Two rules turn a filesystem into a navigable set of locations:

1. **Path compression.** A folder with one child folder and no files of its own
   is a hallway, not a room. `src/main/java/com/company/app` collapses to one
   place. (This is radix-tree compression; the collapsed label keeps the whole
   chain so you still know where you are.)
2. **Mass threshold.** A folder holding less than `MIN_SHARE` (2%) of its
   parent, or fewer than `MIN_FILES` (24) files, is furniture, not a place. Its
   files just swim in the parent.

Together these turn a 40,000-node tree into ~22 places. Without them the ocean
is confetti.

Layout is **circle packing**, not a squarified treemap. Treemaps are optimal
for area but rectangles read as architecture; nested circles read as reefs and
lagoons. It's a greedy front-chain pack — each new circle drops tangent to two
already-placed ones, at whichever valid spot sits closest to the middle. The
circles are never drawn. Fish scatter inside them and the water hides the
boundary.

---

## The consequence nobody designed: a folder's shape is its history

Because a place is a fixed column in XZ and depth is age, **the vertical
profile of a folder tells you how it came to exist.** This fell out of the two
axes rather than being built, and it turned out to be the most legible thing in
the whole view:

- **A pancake** — everything at one depth — is a folder that arrived in a
  single instant. `node_modules` is a perfect disc of 11,800 files hanging in
  mid-water. So is a photo import, or a restored backup.
- **A column** is a folder that grew over years. Source trees, notes, invoices.
- **A string of beads** is periodic bursts. A camera roll: one clump per trip.
- **A tapering cone** is something you used to touch and don't anymore.

The synthetic corpus is deliberately built with all four arrival patterns
(`mode: "instant" | "burst" | "trickle"` in `SPEC`), because a fake drive
without them would have hidden the best property of the design.

---

## Colour is file type

The only channel you can read across the entire ocean at any distance, so it
gets the strongest signal. Six families, muted — a reef of pure `#00FF00` is
unreadable at density. The haze tier uses a punchier copy of each colour
(`hazeColor`) because additive blending eats saturation.

Note this is a *choice against* colour-by-rarity or colour-by-folder. Folder is
already encoded by position, and rarity is noise.

## Size is size

`log2(bytes)`, then a `^2.1` curve so the enormous files are genuinely
enormous. A 20 GB render is a whale you can see from far away; a 2 KB dotfile
is a mote. This is inherited from the main app, where `cm` is already
`log2(size)`, and it's the one channel that needed no new thinking.

---

## Four draw tiers, and the fog is the budget

Underwater is the only setting where level-of-detail isn't a lie. Every other
3D app hides its pop-in; here, turbidity is a *reason* things aren't drawn. The
tiers are designed to hand off inside the murk so you never catch one.

| tier | distance | what's drawn |
|---|---|---|
| **haze** | beyond ~240 | not files at all. Volumetric puffs per folder per depth-bin, coloured by mean file type, brightness by population. You read a nebula. |
| **specks** | ~26–900 | one `Points` sprite per file. Too far to be an animal, close enough to be an individual. |
| **fish** | within 150 | real instanced geometry, flat-shaded with the same hard 4-step lamp as the main app. |
| **named** | crosshair | one file, with its name, path, size and age. |

Fades overlap deliberately — points fade in as haze fades out, and out again as
meshes fade in. `hazeFrom`, `pointNear`, `pointFar`, `meshFar` are the knobs.

**Big fish earn their geometry from further away.** The near-set is sorted by
`distance / size`, not distance, so a whale at 140 units beats a 2 KB file at
12. Otherwise you stand in `node_modules` and the entire mesh budget goes to
dotfiles while a 20 GB video renders as a dot behind you.

`meshBudget: 1400` is the hard cap. The set rebuilds every 130 ms from a
uniform spatial hash grid, not every frame — at 52k files a full distance sort
is the most expensive thing in the app and nothing about the answer changes in
eight frames.

## Schooling comes from similarity, not from the folder

Within a place, files group by `(family, order-of-magnitude of size)`. Each
group gets a small home inside the folder's circle and its members huddle
around it, sharing a swim phase. Big groups clump hard, loners spread out
(`schoolTight`). That's why 4,100 Lightroom previews look like a shoal and
Downloads looks like scattered debris — which is exactly what they are.

## Two degrees of freedom, not six

**Not a submarine.** Free 6DOF flight is nauseating, easy to get lost in, and
puts a machine between you and the water — and this thing's charm is that
you're a person in it. So: free horizontal drift at whatever depth you're at,
plus a deliberate descend on the scroll wheel. Look is decoupled from movement
and the horizon never rolls. You cannot get lost and you cannot get sick.

Descent is damped and slightly slow on purpose. Sinking should feel like
sinking.

---

## The instrument on the left is a calendar

Not a depth meter that happens to show dates — a calendar drawn vertically,
with a tick per year, spaced by the same `ageCurve` the water uses. Your marker
reads "7 months ago," not "-190". Metres are the small grey text, because
metres are the fiction and the date is the truth.

---

## Fish identity at scale

The main app builds a `BufferGeometry` per fish. At 50,000 files that is not a
thing you can do, so the individuality moved off the vertices: 7 archetype
meshes are instanced, and each file's genome drives a **non-uniform scale**
(stretch, depth, girth from its hash) plus a per-instance **colour nudge**
around its family hue. A school of thumbnails shimmers with variation instead
of being a flat block of one green, at no cost.

## What it is still not doing

- **Reading contents.** Only name, size and mtime. The main app's real genome
  hashes the first 64 KB, so a fish here is a pure function of
  `path + name + size` instead — touching a file doesn't change its fish, but
  two identical files in different folders are different fish. Reading bytes
  lazily for the fish you actually swim up to, so it sharpens into its true
  form as you approach, is the better version and isn't built.
- **Remembering.** Every visit rescans. The scan result would fit in IndexedDB
  comfortably.
- **Occlusion / ordering.** Transparent points and additive haze don't sort.
  At these densities it reads as volume, which is a happy accident rather than
  a plan.
- **The dither and ink pass.** The fish here are flat-shaded with the same
  4-step lamp as the main app, but none of the post-processing that actually
  makes that look — the 8x8 Bayer dither and the silhouette ink pass — is
  wired up in the ocean yet.
