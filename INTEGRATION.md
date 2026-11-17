# One fishing world

The main fishing page now includes dock movement and the underwater scene.
The separate `/ocean/` page remains the folder viewer.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Walk / swim | WASD; Shift moves faster | Left thumbstick |
| Look | Click the scene, then move the mouse; Esc frees the cursor | Drag the scene with the other finger |
| Fish (from the dock) | F, a click while the cursor is held, or the Fish button | Fish |
| Dive | Space, or Dive | Dive |
| Return to dock | Q | — |
| First / third person | Automatic: first on the dock, third in the water | Automatic |
| Talk to Kelp, or a fish underwater | E, or click with them in the crosshair | Tap them |
| Swim up / down | Up / Down arrows | Up / Down buttons |
| Import a file | File, or drop files | File |

Walking cannot take the player off the dock. Only an explicit dive enters the water.
Every dive first asks which water: **my files** (pick a folder) or **demo world**.
Nothing is in the sea until one is chosen; Esc stays on the dock. `1` and `2` answer from the keyboard.
A folder already loaded is offered back by name, so diving again does not rescan it.
The dive selects third person. The view button works on the dock and underwater.
Camera changes preserve the player position and heading.
Underwater, forward movement follows the gaze. The camera does not roll.

The dock and Kelp stay at the surface. Return places the player safely on the dock.
The underwater view uses the ocean scene, not the above-water backdrop.

## Shared state and input

The fishing page owns music, weather, time, catches, and the Dex throughout the visit.
There is no navigation or second music player during a dive.
Movement stops for catches, dialogue, file selection, and open panels.
Cancelled touches, lost focus, and hidden tabs clear movement.
Finish a pending catch before importing another file or diving.

Scene gestures control looking or catch inspection. They no longer open the file picker.
The File button owns that action.

First-person dock fishing retains the existing cast presentation.
Underwater and third-person fishing use the specimen reveal without a surface-casting animation.
Keep, Release, Send, bulk imports, and shared fish links retain their existing collection rules.
Bulk imports also offer **back to the water**. This dismisses the already-recorded specimen without sharing it.

## Sound

Depth smoothly lowers the low-pass cutoff and increases reverb.
`src/underwater-audio.mjs` contains the tuning values, including the 80-meter effect ceiling.
Returning to the dock restores the original dry sound.
Music and effects share depth settings but retain separate output controls.
Mute, music volume, and ducking also control reverb tails.

## Rendering

`src/explore.js` embeds the existing ocean runtime in a ShadowRoot.
This isolates the folder viewer's DOM identifiers and styles from the fishing controls.
`src/ocean-entry.js` starts the standalone folder viewer.

The sea shader uses the player's camera above water.
Its screen-to-water conversion uses that same projection for cast ripples.
The underwater renderer takes over below the surface.
The existing water-light changes remain intact.

## Deliberate limits

- Underwater animals are the chosen folder's files, or the demo drive. They are not the player's saved collection.
- Catching a fish from a real folder reads that file like a dropped one, so it is the same fish. A demo fish stands in with its path and size.
- Fish creates a sample catch. It does not capture the animal under the cursor.
- The Dex still stores one best record per species, not every historical catch.
- The dive opens a folder read-only. Netting and permanent file deletion remain exclusive to `/ocean/`.
- The wave slider changes surface shading, not physical waves or dock motion.

These limits keep collectible actions separate from filesystem actions.
The only permission the dive ever asks for is read access to the folder the player picks. It cannot delete.

## Automated checks

`npm test` covers dock confinement, dive input, view changes, blocking panels, touch cancellation,
camera projection, and depth-audio routing without a browser.
`node build.mjs` builds the fishing page and the standalone tools.
Browser/GPU checks remain explicit opt-in checks.
