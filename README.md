
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

