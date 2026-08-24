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
`sizeCurve`, `bleach`) are baked at load and need a reload.

---

## The two axes that carry meaning

### Depth is size. The surface is a byte, the abyss is where the big ones are.

The single most important decision, and it used to be the wrong one. Depth was
age for a long time, which was a lovely idea and a bad axis, for one reason
that only shows up once you try to *use* the thing: **every horizontal layer
was a jumble.** A 40 GB disc image and a 2 KB dotfile modified on the same
afternoon sat side by side, one filling the screen and one a pixel and a half
across, and there is no aiming heuristic that is fair to both. Nor was there
any reason to swim to a particular depth, because "files from March" is not
somewhere you want to go.

An ocean already sorts its animals by mass. Krill in the light, whales
sounding, and the genuinely enormous and strange down where the pressure is.
Putting bytes on the vertical makes the metaphor stop being a mapping and
start being the same fact said twice — the taxonomy here already grades fry to
leviathan, so form and depth finally agree instead of arguing. It pays for
itself five more times:

- **Every layer is size-homogeneous**, so every creature at a given depth is
  the same handful of pixels across and aiming at one is the same gesture
  everywhere in the ocean.
- **The dive has a destination.** "Where did my disk go" is the question people
  actually open a disk viewer to ask, and here you answer it by sinking until
  it gets dark.
- **The gauge becomes a real ruler.** Ages had to be labelled relatively ("3
  years ago") because the column was fitted to the data; sizes have canonical
  marks, so the water gets 1 KB, 1 MB, 1 GB printed down the side of it, and a
  gigabyte is at the same depth on every drive you will ever open.
- **A folder's vertical profile is now its size distribution**, which is at
  least as legible as its history was (see below).
- Nothing has to be special-cased to keep it from floating above the surface,
  because the things that need headroom are the deep ones.

The mapping is linear in `log2(bytes)` — one step down the water is one
doubling — because that is the only honest scale for a quantity running from a
0-byte `.gitkeep` to a 90 GB disc image. `sizeCurve: 1.0` bends it if you want.

**The fit is deliberately lopsided: p02 at the top, the largest file at the
bottom.** The old age axis was trimmed at both ends, and copying that was the
first thing that broke — the top 1% of a drive *by size* is the entire reason
to look at it, and clipping it stacked every video, backup and disc image into
one indistinguishable pancake on the floor. Ages need the trim, because one
file from 1998 stretches the axis by a decade. Sizes do not, because log2 has
already done the compressing: one stray 90 GB image costs a few doublings of
empty water, and empty water at the bottom of the column is itself the true
statement that nothing else on the drive comes close.

The whole ocean is also **scaled uniformly to the size of the drive** — a
thousand-file folder is a small sea rather than a few specks lost in a big one.
Physical size carries no meaning; only the ratios do. `lateral: 760` and
`depth: 900` are the dimensions at the reference size of ~52,000 files.

### Age did not stop mattering. It stopped being a place.

It became a condition instead, which is a better fit for a secondary variable
anyway: a file you touched this morning keeps its family colour and swims like
it means it, and one you have not opened in four years is bleached and slow.
No scale to consult, no axis spent, and a folder you have abandoned greys out
*as a whole* — which was the genuinely good part of the old vertical axis, and
it survives.

Hue is left alone, because family has to stay readable across the entire
ocean; what goes is a proportion of the chroma (`bleach`) and a little of the
light, plus some of the swim (`languor`). Proportional, not subtracted: taking
0.6 off a saturation of 0.62 does not wash a colour out, it deletes it, and a
reef of grey is a worse read than a reef of one green. The haze bleaches too,
so an abandoned folder is grey from four hundred metres away, which is where
you actually see it from. Fitted p01..p99 like the old axis was, so it means
the same thing on any drive.

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

## The consequence nobody designed: a folder's shape is what it is made of

Because a place is a fixed column in XZ and depth is size, **the vertical
profile of a folder tells you what kind of thing it holds.** This falls out of
the two axes rather than being built, and it is the most legible thing in the
whole view:

- **A raft near the surface** is thousands of small files of one kind.
  `node_modules` is a dense mat in the shallows, and it never appears anywhere
  near the video you are actually looking for.
- **A tall column** is a folder that holds everything from a config file to a
  master. Source trees, Downloads, a Desktop.
- **A band in mid-water** is a library of one thing at one resolution — a
  photo roll, a music library, a cache of thumbnails.
- **Three shapes in the dark under an empty column** is a folder whose whole
  weight is four files, which is the single most useful thing a disk viewer
  can tell you and the reason to swim down at all.

The old axis had its own version of this — a pancake meant a folder that
arrived in one instant, a string of beads meant periodic bursts — and losing
it is the real cost of the change. The synthetic corpus still builds all the
arrival patterns (`mode: "instant" | "burst" | "trickle"` in `SPEC`), because
they still drive the bleaching, which is now where arrival history shows up: a
2014 backup is a grey raft, and a photo import from last week is a bright one.

---

## Hue is file type, chroma is how recently you touched it

The only channel you can read across the entire ocean at any distance, so it
gets the strongest signal. Six families, muted — a reef of pure `#00FF00` is
unreadable at density. The haze tier uses a punchier copy of each colour
(`hazeColor`) because additive blending eats saturation.

Splitting hue from chroma is what lets one channel carry two things without
either one costing the other: the family is still readable from four hundred
metres, and how alive the colour is tells you whether anyone has been here
lately. Note this is a *choice against* colour-by-rarity or colour-by-folder.
Folder is already encoded by position, and rarity is noise.

## The creature is a reading of the file

Size class decides the silhouette. Under 32 KB is fry; up to 32 MB is a fish;
up to 2 GB is a big fish; past that it is a leviathan, and the ladder from a
mote to a 32 GB disc image is a hundred to one, not two to one. (`SIZE_LADDER`
is a piecewise log2-to-world-units table with the class breaks on ladder stops;
`sizeGain` scales the whole thing.)

Depth decides whether that silhouette is a lit-water form or a deep-sea one: a
file in the bottom third of the column comes back as an anglerfish, a gulper or
an oarfish, and the anglerfish's lure is the only thing in the ocean that emits
rather than reflects. The band is feathered by hash between `deepFrom` and
`deepTo` so it reads as a gradient rather than a line.

**This used to be two rules pulling against each other and is now one.** When
depth was age, "big" and "deep" were independent, which is how you got a 2 KB
dotfile rendered as an anglerfish because it happened to be old. Depth is size
now, so the deep-sea band *is* a size threshold, the same code says both
things, and the abyss is exactly as strange as it is heavy. The one thing this
did break: leviathans are now almost always below the light by definition, so
the rorqual had to be added to the deep pool as well as the lit one, or the
best model in the set retired to a single animal per drive.

Leviathans stay leviathans at any depth; they just change species, from rorqual
to cachalot. Family nudges the body plan inside whichever pool a file lands in
— video as long torpedoes and sharks, images as flat discs and rays, archives
as armoured blocks — while colour keeps carrying family as the channel you can
read across the whole reef. A zero-byte file is the Ghost Minnow, half-there.
The hash only breaks ties, so two photos of the same size in the same folder
are still two animals.

Because size finally means something, behaviour follows it: a whale beats
slowly, turns on an arc dozens of body-lengths wide, barely bobs, stays solid
through murk that swallows a minnow (`fogBig` divides the fog by apparent
size), earns real geometry out to `meshFar + (scale - 1.5) * meshFarBig`, and
holds a reserved slice of the mesh budget so it can never be crowded out by the
folder you happen to be standing in. Age multiplies into the same numbers:
whatever its size, a file you have not opened in years has less of a hurry
about it (`languor`).

One consequence worth knowing: **the ocean is scaled to the drive's visual mass,
not its file count**, so a folder of 4K masters is a bigger sea than a folder of
dotfiles with the same number of files. Without that, inflating one folder
shrank every other folder through the normalisation, and whales ended up longer
than the bay they lived in.

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

## A diver, not a submarine — and not a camera either

The old rule was two degrees of freedom: drift flat, sink on the wheel, look
wherever you like. It kept you from getting lost or seasick, and it was almost
unusable for the one thing you actually want to do, which is go and look at a
particular animal. **Looking and going were separate mechanisms.** Reaching a
fish above you meant aiming at it, then deliberately *not* moving toward it,
then finding its depth on a second control and its column on a third. Three
inputs to approach one object, with a quarter-second of damping on all of them.

The rule is now one sentence: **you swim where you look, and the water carries
you the rest of the way.** The camera is now a damped third-person chase camera
following a visible procedural diver; the diver's transform, not the camera, is
the controller authority used by movement, picking and glides. The body is built
from the same `box`, `ball` and `tube` kit as Kelp and shares his finer dither/ink
pass.

- **Forward is your real gaze, pitch included.** Look down at the deep and swim
  down into it. This is still not 6DOF: there is no roll ever, the horizon
  cannot tilt, and pitch is clamped well short of vertical — which is where the
  nausea actually lives. Every diving game does this and none of them make
  anyone ill.
- **The head is quick and the body is heavy.** `lookDamp: 26` against
  `damp: 5.0`. The old build damped both at 4.2, so the view lagged the mouse
  by about 240 ms, which is most of why aiming felt like steering a bus.
- **The wheel is a dial with detents, not a throttle.** Let go and it settles
  on the nearest doubling of file size, which is exactly one size band — so
  "the layer I'm in" is a place you can return to rather than a number you hold
  by hand. Descent is still damped and slightly slow on purpose. Sinking should
  feel like sinking.
- **The arrows keep the deliberate axis** — straight up and straight down,
  whatever your head is doing.
- **Space is the whole point.** Look at something, press it, and you are
  carried over and set down alongside it at a stand-off measured in its own
  body lengths, on the side you happened to be coming from. The target is
  recomputed every frame from where the animal *is*, so you chase it and pull
  alongside rather than arriving at a spot it has left. Any key or drag takes
  the controls straight back. With nothing in the crosshair it becomes a push
  off and a coast, so the key is never dead. `f` is the same carry, aimed at
  Kelp.

You should never have to fly accurately, because flying accurately is not what
this is about.

---

## The instrument on the left is a ruler

Not a depth meter that happens to show sizes — a byte scale drawn vertically,
ticked at the powers of 1024 that land inside this drive's range. Your marker
reads "43 GB," not "-1302". Metres are the small grey text, because metres are
the fiction and the byte is the truth.

This is the one thing the old axis could not do. Ages had to be labelled
relatively, because a fitted age column has no canonical marks anywhere on it.

---

## Identity at scale

The main app builds a `BufferGeometry` per fish. At 50,000 files that is not a
thing you can do, so the individuality moved off the vertices. **Fifteen**
archetype meshes are instanced — `fry, perch, torpedo, flat, eel, puffer,
shark, ray, grouper, whale, cachalot, angler, gulper, oarfish, ghost` — about
8,800 vertices for the entire table, and each file's genome drives a
**non-uniform scale** (stretch, depth, girth) plus a per-instance **colour
nudge** around its family hue and a **pattern** (bands / spots / stripe). A
school of thumbnails shimmers with variation instead of being a flat block of
one green, at no cost. The taxonomy is finite on purpose.

## Aiming

Picking is analytic, not a raycast: the crosshair is tested against each near
creature directly, scoring by how far off-centre it sits relative to *its own
size*. Two reasons. It is much cheaper — a few hundred dot products instead of
a quarter of a million ray-triangle tests — and it is far kinder to aim with,
since a 0.2-unit fry is a pixel and a half on screen.

It is also the only thing that works here. Raycasting the instanced meshes
silently never hits: three.js caches an `InstancedMesh` bounding sphere the
first time it is asked for one, and these are built empty and refilled every
frame, so the cached sphere stays the empty marker (radius -1) and every ray
early-outs forever. Worth knowing before anyone tries to put the raycast back.

Two details do most of the work of making it feel like aiming rather than
fishing for a tooltip. The cone carries a **fixed angular grace** (`AIM_GRACE`,
about a degree) on top of the animal's own silhouette, so a mote is still a
target you can hit; and whatever you are already on is scored at a **discount**
(`AIM_STICK`), so the label stops flickering between two fish in a shoal the
instant your hand moves a pixel. Hysteresis is most of what "responsive" means
for a picker.

## The net, and what's in it

Two sheets, deliberately opposite. **Delete** is a flat list of full paths and
the least playful thing on the page, because there is no undo. **"Let's see
what we got"** is the other half: the catch tipped out on the dock and counted
by species, biggest first, with the heaviest fish and the one that has been
down there longest called out by name. Fish names don't take a plural — three
cod, two perch — and "3 Frys" reads like a spreadsheet wrote it. The path list
still exists; it is a button inside the tally, which is where it belongs.

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
  a plan. Relatedly, the fish are composited as a layer, so a marine snow mote
  drifting in front of a fish is hidden by it — the same trade the main app
  already makes with its stacked canvases.
- **A clean edge where the budget runs out.** Stand inside a folder with more
  creatures than `meshBudget` and there is a visible line where geometry stops
  and specks take over.

## The look

The fish render to their own low-resolution target and come back through the
main app's post pass — 8x8 Bayer dither at 5 levels per channel, a silhouette
ink pass, nearest upscale — composited over water that is left completely
alone. Dithering the volumetric water would wreck the other half of the art
direction, so this mirrors the main app's stacked sea/fish canvases rather than
post-processing the whole frame.

Alpha in that target encodes **visibility, not coverage**: background 0, fish
`0.15 + 0.85 * vis`. That keeps the ink's "is this a fish texel" test binary
while letting a fogged fish, and its outline with it, dissolve into the murk
instead of hanging in the distance as an outlined blob. The ink colour is
graded off the current water colour every frame, because fixed black goes from
cartoon-hard at the surface to invisible in the abyss.

## The dock, the jump, and Kelp

You arrive as the protagonist on a dock above the surface. Walking is bounded
to its planks and uses the same third-person camera as swimming. Near Kelp,
`E` starts and advances his animalese conversation (`Space` and `Enter` remain
aliases). The folder picker and demo are still answers to his final question.
Scanning builds the ocean while it remains hidden; the dock, player and camera
are re-moored together above the eventual arrival point, so the completed scan
does not produce a visible camera cut.

When data is ready, walking to the open edge reveals `E · jump in`. The jump is
a fixed 1.25-second arc through the existing surface plane, with a synthesised
splash at the crossing. The chase camera follows the same body throughout. On
completion the generated ocean becomes visible, the dock re-moors thirteen
metres below the surface, and the existing swim controls take over. `?demo`
retains its direct-to-ocean shortcut.

Kelp is hand-modelled out of loose triangles by a small kit (`box`, `ball`,
`tube`) in the same currency as the fish: non-indexed, so `computeVertexNormals`
gives hard facets. Winding is deliberately not fussed over — the shader flips
a normal that faces away and the material is `DoubleSide` — which is what makes
mirroring one arm geometry onto both sides safe.

The pier stands on pilings that **do not end**: the shader dissolves anything
more than twelve metres below the deck into the water colour, so the platform
rises out of the dark rather than hanging from something above it. After the
jump Kelp is moored at a fixed 13 m and only changes x and z; `f` carries the
diver back to him, and coming within fifteen metres after a spell away prompts
another line.

He renders into **his own** low-res target and gets his own composite of the
same dither+ink pass, quantised to 9 levels at roughly half the pixel size the
fish get. He is a face a few metres from yours, not a school seen through forty
metres of water; wearing the school's dither reads as noise on his cheek.

## Animalese

He speaks, and none of it is a recording. The Animal Crossing trick is to play
a clip of a person *naming* each letter, sped up — which is why it reads as a
language rather than as beeping: the vowel you hear is the vowel in the
letter's **English name**. "b" is *bee*, "k" is *kay*, "r" is *ar*.

**The mouth never closes between letters.** That is the whole design, and the
first version got it exactly wrong: it built a fresh oscillator and a fresh
pair of filters *per letter*, which is a row of separate little instruments
rather than one throat. It landed squarely in the uncanny valley — recognisably
speech-shaped, and wrong in a way that was hard to name. Three things were
wrong, and all three came from the same mistake:

1. **The formants could not be resolved.** The fundamental was 430 Hz and the
   bandpasses had Q 5.5 — a 113 Hz window looking at harmonics spaced 430 Hz
   apart. F1 fell *between* two harmonics as often as on one, so its level
   lurched around as the pitch swept. That is an inharmonic warble, and the ear
   files it under "out of tune." A voice needs harmonics dense enough that a
   formant always catches two or three: hence **306 Hz and Q 2.6**.
2. **Overlapping syllables were randomly detuned.** Every letter got an
   independent ±6% pitch — a whole semitone — and syllables overlapped by
   ~34 ms. Two overlapping detuned tones is a beat frequency. That is not
   speech, that is a chorus pedal.
3. **Discrete letters cannot coarticulate.** Real vowels slide into each other;
   cut them apart and you have Morse with a filter on it.

So it is now **one oscillator and one formant bank for the whole line**,
running continuously from the first letter to the last. What makes a syllable
is the amplitude envelope dipping and rising; what makes a *consonant* is how
far it dips — a plosive shuts the throat almost completely and bursts, a
fricative half, a nasal barely — plus the noise transient on top (plosive
`b d g j k p q t w`, fricative `c f h s v x y z`, nasal/liquid `l m n r`, which
also passes through a murmur at F1 310 / F2 1180 on its way to the vowel).
Formant frequencies **glide** between vowels (`glide`, ~13 ms) instead of
jumping. That is coarticulation, and it is the single thing that stops a
formant synth sounding like a modem.

Three formants, not two. F1/F2 carry the vowel, but F3 is most of what makes a
buzz sound like it came out of a head. The parallel branches **alternate
polarity**, as in a Klatt synth, so they sum where they overlap instead of
notching each other, and a gentle lowpass (`tilt`, 3.4 kHz) takes the fizz off
the sawtooth — a raw saw is all buzz above the formants. The vowels are stored
as multiples of `P.voice.f1/f2/f3` so the sliders move the whole mouth without
collapsing them into each other; at the shipped 620/1750 they land on the
textbook values (a 806/1085, e 558/1837, i 298/2292, o 601/840, u 322/875).

Prosody is now **one contour over the whole line** rather than a value per
letter: it falls as the phrase runs (`fall`), each syllable lifts and settles
inside that (`rise`), and a question turns back up over its last third
(`ask`, about three semitones — the old one jumped a sixth on the final letter).
The only randomness left is a ±1.5% wobble derived from the letter's index, so
a line sounds alive but sounds the *same* every time you hear it.

Everything is scheduled up front onto one gain node, so cutting him off
mid-sentence is a single ramp rather than a pile of cancelled timers. And the
timing jitter is gone entirely — the schedule now advances by exactly
`beats()`, so the voice and the typewriter cannot drift apart over a long line
even in principle. His jaw runs off the same clock: `charge` is how far through
the current character both of them are, so the mouth opens once per letter and
shuts on a space.

The dialogue types a letter at a time off **the same clock**: `beats()` says
what one character costs — a full stop is worth 3.4 of them, a space 0.9 — and
both the typewriter and the scheduler charge in those units, so the text and
the voice cannot drift apart over a long line.

Autoplay is the usual trap with one extra tooth: a suspended `AudioContext`
does not drop what you schedule on it, it hoards it and fires the lot at once
on resume. So `speak()` returns silence unless the context is already
`running`, and the first click is spent catching his voice up to where the text
has got to rather than on skipping the line.

`/sfx` carries a `voice` cue with a slider per parameter, same as every other
cue, because it is the same module.
