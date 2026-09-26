# One fishing world

The main fishing page now includes dock movement and the underwater scene.
The separate `/ocean/` page remains the folder viewer.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Walk / swim | WASD; Shift moves faster | Left thumbstick |
| Look | Drag the scene | Drag the scene with the other finger |
| Dive | Space, or Dive | Dive |
| Return to dock | Q, or Return | Return |
| First / third person | V, or the view button | View button |
| Talk to Kelp | E, or click Kelp | Tap Kelp |
| Swim up / down | Up / Down arrows | Up / Down buttons |
| Create a sample catch | Fish | Fish |
| Import a file | File, or drop files | File |

Walking cannot take the player off the dock. Only an explicit dive enters the water.
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

- Underwater animals are synthetic scenery from the ocean demo, not the player's saved collection.
- Fish creates a sample catch. It does not capture the animal under the cursor.
- The Dex still stores one best record per species, not every historical catch.
- Folder selection, netting, and permanent file deletion remain exclusive to `/ocean/`.
- The wave slider changes surface shading, not physical waves or dock motion.

These limits keep collectible actions separate from filesystem actions.
No permission prompt or file deletion occurs when the player dives.

## Automated checks

`npm test` covers dock confinement, dive input, view changes, blocking panels, touch cancellation,
camera projection, and depth-audio routing without a browser.
`node build.mjs` builds the fishing page and the standalone tools.
Browser/GPU checks remain explicit opt-in checks.
