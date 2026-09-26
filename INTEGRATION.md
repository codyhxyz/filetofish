# One fishing world — proposal

Status: **awaiting approval**. The mode and camera merger is not implemented.

## Recommended experience

- Start on the dock in first person, with a fishing pole.
- Walk along the dock. Use **Dive** at its edge to enter the water.
- Diving switches to third person. **View** toggles first/third person in either environment.
- Keep the dock at the surface, visible from the water. Provide a clear return-to-dock action.
- Keep **Fish**, **Dex**, music selection, mute, and volume available in both environments.
- Keep the same music playing through each transition.
- Greet Kelp with **E**, a click, or a tap.

Treat location and camera as separate state:
`dock | diving | swimming` and `first | third`.
One player owns position. Changing the camera does not change that position.

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Walk / swim | WASD; Shift to move faster | Visible left thumbstick |
| Look | Drag the scene | Drag the right side |
| Dive / return | Q | Circular Dive / Return button |
| First / third person | V | View button showing the current perspective |
| Talk / interact | E or click Kelp | Tap Kelp or the contextual Hello button |
| Swim up / down | Up / Down arrows | Up / Down buttons |
| Fish, Dex, music | Shared toolbar | Same shared toolbar |

Underwater, forward movement follows the gaze. There is no camera roll.
The separate vertical controls let players change depth while looking at a fish.

Use [NippleJS](https://yoannmoi.net/nipplejs/options/) for the mobile thumbstick.
Its static mode keeps the movement control visible.
A separate right-side gesture zone handles looking while the left thumb moves.
Feed its normalized axes into the existing movement code, rather than generating keyboard events.
No joystick dependency is installed yet.

## Build order

1. **One page and shared controls.** Extract the existing music, catch, and Dex controls into one persistent shell.
   Diving must not navigate to another document or start another music player.
2. **One world and player.** Reuse the ocean controller's existing walking, jump, and swimming states.
   Separate the dock geometry from Kelp: currently their shared root moves underwater.
3. **Camera and fishing.** Add head-height and chase views around the same player.
   Hide the local body in first person and attach a rod to the third-person avatar.
   Adapt casting and water hit positions to the moving camera.
4. **Shared sky and water.** Reuse the official Three.js Water and Sky objects now used by fishing.
   Connect them to the ocean world camera. The SVG rod still needs a world-space replacement.
5. **Mobile input and transitions.** Add the thumbstick and action buttons.
   Clear movement on cancelled gestures, lost focus, and open panels.
   Pause movement during catches, dialogue, and Dex browsing. Never discard a pending catch when diving.

The Fish button can initially reuse the existing catch presentation underwater.
It must not silently become the filesystem viewer's net or delete control.
Keep folder navigation controls separate when that viewer is active.

Later, weather can drive the library's water settings.
The current `/render-world/` slider controls reflection distortion, not physical wave height or breaking waves.

## Important boundary

The fishing app creates collectible fish from file content.
The ocean viewer creates fish from file metadata and can permanently delete real files.
Their identities, ownership rules, and actions are not interchangeable.

**Decision needed:** should underwater be the collectible ocean, the folder viewer, or both?
Recommendation: make swimming a collectible experience and keep folder management explicitly opt-in.
Keep any permanent-delete flow separate from Fish, Keep, Release, and Dex.

## Checks before shipping the merger

- Dive selects third person; View works in both environments; return reaches a valid dock position.
- One music instance retains track, volume, mute state, and playback through transitions.
- Touch movement and look work together; cancelled touches never trigger catches or leave movement active.
- UI actions do not also advance Kelp dialogue, move the player, or trigger a file picker.
- Existing fish links, Keep/Release behavior, and Dex records retain their meaning.
- Collectible actions never delete files. Folder deletion still requires permission and confirmation.
- Automated checks remain lightweight by default. Browser/GPU checks require explicit approval.
