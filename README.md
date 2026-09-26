
# filetofish

**https://filetofish.codyh.xyz**
<img width="1442" height="886" alt="Screenshot 2026-08-17 at 3 31 46 AM" src="https://github.com/user-attachments/assets/bfe38a05-3b40-4211-b341-6ff51a679df0" /><img width="660" height="1434" alt="IMG_6229" src="https://github.com/user-attachments/assets/9e58f9db-64c5-4eea-9d23-50649a75bebb" />

My friend misspelled "Filet O' Fish". Now we have file-to-fish: Drop in any file, it comes back as a fish. 

Same file, same fish, every time.

Nothing is uploaded — the first 64 KB is read in the browser, hashed, and thrown away. Back to the ocean. Like a fish.

The `source` link in the bottom-left corner of the site points here. The whole thing
is one self-contained HTML file, so view-source on the deployed page is also the
whole program.

How it's built is in [DESIGN.md](DESIGN.md); the file viewer prototype is in [OCEAN.md](OCEAN.md).

## Dial in a sky

The sea reads your actual clock, which is fine until you want to show someone a
particular sky. Three query parameters override it. They combine with `&`, and
none of them touch the fish.

| Knob | What it does |
| --- | --- |
| `?t=HH:MM` | Pins the hour. Minutes are optional — `?t=7` is 07:00 — and the hour wraps at 24. |
| `?wx=<sky>` | Pins a sky: `dawn`, `sunrise`, `day`, `dusk`, `night`, `fog`, `rain`. Anything else is ignored. |
| `?fx=<list>` | Picks which lighting passes render. Absent means all of them. |
| `#f=...` | Not a knob — a whole fish, packed by the send button. [DESIGN.md](DESIGN.md) has the format. |

`fx` has four switches: `sky` (scattering sky and tonemap), `rays` (soft atmospheric
light), `water` (Fresnel reflection and the sun path), `bloom` (glow). `?fx=none`,
or `classic`, uses the classic palette with the refined stars, sun, and moon. A plain list turns on only what it
names — `?fx=sky,water`. A list where *every* entry is negated turns everything
on except those — `?fx=-bloom`. Mixing the two forms drops the negated half
without saying so.

Five to start from:

- [`?t=07:30`](https://filetofish.codyh.xyz/?t=07:30) — sunrise.
- [`?wx=dusk&t=17:30`](https://filetofish.codyh.xyz/?wx=dusk&t=17:30) — low sun, warm atmospheric light.
- [`?t=19:00`](https://filetofish.codyh.xyz/?t=19:00) — dusk, rising moon.
- [`?t=23:00`](https://filetofish.codyh.xyz/?t=23:00) — moonlit night.
- [`?fx=none`](https://filetofish.codyh.xyz/?fx=none) — classic lighting, for comparison.

Why the light does what it does is in [DESIGN.md](DESIGN.md).

The [water lab](https://filetofish.codyh.xyz/render-world/) has a wave-intensity slider and all seven weather choices.
The dock/swimming merger is still a proposal: [INTEGRATION.md](INTEGRATION.md).

`npm test` runs lightweight checks without a browser.
`npm run test:sky` opts into browser/GPU checks, which can consume substantial CPU.


## The fish are generated, not modelled

`radiusAt()` is a beta-ish profile curve swept around a spine. Seven **archetypes**
carry the variety — perch, torpedo, flat, eel, puffer, shark, angler — each setting
ranges for the profile exponents, depth, girth, stretch and tail type, plus optional
features: swordfish bill, puffer spikes, angler lure, barbels, second dorsal.
Continuous jitter alone only ever reads as one fish.

Patterns live in the fragment shader, keyed off object-space position quantised to a
coarse grid so they block up with the facets. No textures.

Traits are pure functions of (name, size, MIME, hash), so a shared fish could be a
URL rather than a database row.

## Soundtrack

The shipped six-song soundtrack lives in `src/music.js`: track data, arrangement
expansion, note compilation, SoundFont playback, and clock-based song selection.
`/score` is a noindex developer tool that imports that same source to show phrase-level
instrument activity and every compiled note in a piano roll.

```sh
npm run soundtrack:inspect        # build and open the score inspector
npm run soundtrack:inspect:check  # check phrase grouping and pitch conversion
```

`soundtrack/scores.json` and `soundtrack/render.py` are older renderer-neutral
listening sketches. Their WAV files are local build artifacts, not site assets.

## What happens to a catch

A landed fish is **not** logged. Three buttons decide, and you get exactly one:

- **put it back** — it noses over, slides under, and nothing is recorded.
- **keep it** — it flies into the book in the corner and enters the dex.
- **send this fish to a friend** — a 1200x630 card of it prints out of thin air,
  sails off the top of the screen, and the fish goes over the side and swims for
  the horizon leaving a wake. The link is on your clipboard before the splash
  lands. You do not get to keep it. That is the trade.

Making the dex a decision rather than a side effect is the whole point: giving a
fish away has to cost something or sharing is just a copy button.

Dropping a folder skips all of this — a haul is logged wholesale, so those two
buttons hide and only sending is left.
