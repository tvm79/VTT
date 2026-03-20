# VTT Spatial Audio Tool – Code AI Implementation Brief

## Mission
Implement a **canvas-based spatial audio source tool** for the VTT.

The GM must be able to:
- drag and drop an audio file onto the canvas
- create an audio source at the drop position
- move that source using the same interaction pattern as the **light tool**
- edit the source radius like the **light tool**
- control how far the sound travels
- have volume decrease with distance from the source

This feature must follow the **existing light tool architecture and UX** as closely as possible.

---

## Non-Negotiable Rules

1. **Do not invent a new interaction model.**
   Reuse the existing **light tool** flow for:
   - placement
   - selection
   - dragging
   - radius editing
   - delete/remove
   - property editing UI

2. **Do not build a separate editor paradigm.**
   Audio sources should feel like “sound lights”.

3. **Do not bypass existing board/world coordinate logic.**
   Reuse the same stage/world conversion path used by lights and canvas drops.

4. **Do not hardcode screen-space positioning for the source.**
   Store and render in world coordinates.

5. **Do not update audio volume every frame unless necessary.**
   Prefer event-driven updates:
   - listener moved
   - source moved
   - source settings changed
   - playback started/stopped
   - board loaded

6. **Do not break current drag/drop systems.**
   Integrate with the current canvas drop flow.

---

## Primary Design Decision

Treat an audio source as a sibling system to lights.

Use the existing light tool as the implementation template:

- if lights use a store slice, create an equivalent slice for audio sources
- if lights use overlay icons, reuse that pattern
- if lights use radius handles, reuse that pattern
- if lights use a property/context panel, mirror it
- if lights use shared drag handlers, extend them instead of duplicating logic where practical

---

## Required Feature Set

### 1. Audio Source Entity
Create a persistent board entity for spatial audio.

```ts
export interface AudioSource {
  id: string;
  x: number;
  y: number;

  audioFile: string;

  radius: number;
  innerRadius?: number;

  baseVolume: number;
  loop: boolean;
  playing: boolean;

  name?: string;
}
```

### Field meaning
- `x`, `y`: world position
- `audioFile`: resolved server path or supported asset path
- `radius`: max audible range
- `innerRadius`: optional full-volume zone
- `baseVolume`: max gain from 0..1
- `loop`: loop playback
- `playing`: source active/inactive

---

## 2. Board Persistence
Audio sources must be saved with the current board.

Required:
- include `audioSources` in board state
- load them when board loads
- stop destroyed/removed sources cleanly
- restore playback state on load if `playing = true`

Example target:
```ts
board.audioSources
```

---

## 3. GM Drag-and-Drop Placement

### Trigger
When the GM drags an audio file onto the canvas:
- detect valid audio mime/file type
- upload or resolve the file using the existing audio asset workflow
- compute drop position in **world coordinates**
- create a new `AudioSource`
- add it to state
- start playback

### Default values
Use conservative defaults:
```ts
radius = gridSize * 6
innerRadius = gridSize * 1
baseVolume = 1
loop = true
playing = true
```

### Important
The drop path must match the current canvas drop architecture already used for board content/tools. Do not create a second isolated drop system.

---

## 4. Spatial Volume Falloff

Implement distance attenuation.

### Baseline model
```ts
if (distance >= radius) volume = 0
else if (distance <= innerRadius) volume = baseVolume
else {
  const t = (distance - innerRadius) / (radius - innerRadius)
  volume = baseVolume * (1 - t)
}
```

### Requirements
- clamp to 0..baseVolume
- avoid division issues if `innerRadius >= radius`
- if `innerRadius` is missing, treat it as 0
- if `radius <= 0`, source should be inaudible

### Goal
Simple, predictable, easy to tune.

Do **not** start with complicated 3D positional audio. Start with 2D attenuation only.

---

## 5. Listener Position
Use one listener model initially and keep it explicit.

Preferred order:
1. selected/owned player token center
2. controlled token center
3. fallback camera/stage center only if token listener does not exist

Pick the model that best matches the current app architecture, but keep the calculation isolated in a helper so it can be changed later.

Example:
```ts
getSpatialAudioListenerPosition(): { x: number; y: number } | null
```

---

## 6. Playback Engine
Use the current audio stack where possible.

Preferred implementation:
- integrate with existing audio manager if one exists
- otherwise use **Howler** or **Web Audio API**
- each source needs independent gain/volume control

Minimum capabilities:
- play
- pause
- stop
- loop
- set gain
- cleanup on removal/unmount

### Suggested runtime shape
```ts
type AudioSourceRuntime = {
  sourceId: string;
  howl?: Howl;
  // or audio nodes if using Web Audio API
}
```

Keep runtime playback objects out of serializable board state.

---

## 7. Visual and Interaction Layer

### Render requirements
Each audio source needs:
- a center icon
- a visible radius ring when selected, hovered, or when the audio tool is active
- selection affordance matching lights

### Visual behavior
Reuse the light tool styling language:
- same kind of draggable center marker
- same radius handle logic
- same selected state logic
- same hover/active interaction priority

### Important
Do not place audio source visuals in a random UI layer. They must live in the same canvas interaction ecosystem as lights so pan/zoom/selection works consistently.

---

## 8. Toolbar Tool
Add a dedicated tool, for example:

```ts
tool = "audio"
```

Tool expectations:
- source can be selected
- source can be moved
- radius can be edited
- property UI can be opened
- delete behavior matches other placeable tools

If the app already separates “place mode” vs “select mode”, follow the existing pattern rather than inventing new semantics.

---

## 9. Property Panel
Audio sources need an edit UI consistent with other placeables.

Required controls:
- audio file name / label
- play / pause
- base volume slider
- radius slider/input
- inner radius slider/input
- loop toggle
- delete button

Optional but useful:
- rename source
- mute toggle
- stop all local preview

The panel should reuse current placement/property panel conventions from lights if available.

---

## 10. Drop-Off / Radius Editing
This is the critical UX requirement.

The GM must be able to change the audible range using the same feel as the light radius editor.

That means:
- same drag handle concept
- same coordinate conversion logic
- same selection entry
- same snapping behavior if lights use snapping
- same update flow through store/state

Do not create a separate slider-only radius system. Radius handle editing on canvas is required.

---

## 11. Store/API Surface
Create a minimal and clean action set.

Example:
```ts
addAudioSource(source: AudioSource)
updateAudioSource(id: string, patch: Partial<AudioSource>)
removeAudioSource(id: string)
setAudioSourcePlaying(id: string, playing: boolean)
```

If the store already groups actions by board entity type, follow that pattern.

---

## 12. Runtime Update Strategy
Volume updates must be cheap and predictable.

### Update when:
- listener position changes
- source moved
- source radius/innerRadius/baseVolume changed
- playback toggled
- board changed / loaded
- token movement finishes or changes significantly

### Avoid:
- unnecessary per-frame recalculation for static scenes
- re-creating playback instances on every small setting change

Use dirty flags or targeted recomputation if needed.

---

## 13. Integration Points That Must Be Checked
The implementation must explicitly verify and update any subsystem that assumes only lights use radius-based placeables.

Check for:
- canvas drag handlers
- selection manager
- tool state machine
- property inspector / side panel
- board serialization
- undo/redo if present
- permissions / GM-only interactions
- hover overlays
- context menu actions
- delete hotkeys
- duplicated world/screen coordinate utilities

Do not stop after only rendering the icon. Ensure the full workflow is integrated.

---

## 14. File Handling
Use the existing server audio workflow where possible.

Target storage:
```text
/assets/audio/spatial
```

If the project already has a standard upload endpoint, extend it rather than creating a parallel one unless separation is required.

The created `audioFile` path must be stable and serializable.

---

## 15. Edge Cases
Handle these explicitly:

1. invalid/non-audio file dropped
2. audio file upload fails
3. source radius set below innerRadius
4. source deleted while playing
5. board changes while audio is playing
6. multiple sources using same file
7. source loaded but file missing
8. GM edits while players are connected
9. token/listener missing
10. source muted by distance and later becomes audible again

---

## 16. Acceptance Criteria

The feature is only complete if all of the following are true:

- GM can drag and drop an audio file onto the canvas
- source appears exactly at drop point in world space
- source can be selected and dragged like a light
- source radius can be edited on-canvas like a light
- sound gets quieter as listener moves away
- sound becomes inaudible outside radius
- property panel can edit radius, inner radius, volume, loop, play/pause
- source persists in board save/load
- deleting the source stops and cleans up playback
- implementation does not break existing light or drag/drop behavior

---

## 17. Recommended Implementation Order

1. define `AudioSource` type
2. add board/store support
3. add runtime audio manager support
4. implement source create/remove/update actions
5. wire canvas audio-file drop to source creation
6. render source icon and selection state
7. reuse light-style drag + radius editing
8. add property panel
9. implement listener distance -> gain update
10. test save/load and cleanup paths
11. verify subsystem integrations
12. harden edge cases

---

## 18. Direct Instruction for Code AI
Follow this order of operations:

1. inspect how the light tool stores, renders, selects, drags, and edits radius
2. mirror that structure for audio sources
3. hook audio source creation into the existing canvas drop flow
4. implement a simple 2D attenuation model
5. keep playback runtime objects separate from persisted board state
6. verify all shared subsystems that currently assume only light placeables exist

Do not over-engineer. Do not switch to full 3D audio. Do not redesign the UX.

Build the smallest correct version that is fully integrated with the current light-tool workflow.

---
## Paste-Ready Prompt For Code AI

```text
Implement the attached spec exactly.

Key constraints:
- Reuse the existing Light Tool interaction model for audio sources.
- GM must be able to drag and drop audio files onto the canvas.
- Audio source must be placed in world coordinates at the drop point.
- Audible range must be editable on-canvas with the same radius-handle behavior as lights.
- Volume must attenuate by distance from the listener.
- Persist audio sources in board state.
- Keep playback runtime objects separate from serializable state.
- Do not invent a new UX or separate editing model.
- Audit all subsystems touched by light-style placeables and update them where needed.
```
