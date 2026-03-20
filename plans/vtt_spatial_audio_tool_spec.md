# VTT Spatial Audio Tool -- Implementation Spec

## Objective

Implement a **Spatial Audio Tool** for the VTT where the GM can **drag
and drop audio files onto the canvas** and configure a **distance-based
volume falloff**.\
The system must reuse the **existing light tool interaction model**
(dragging, handles, UI panels, selection, editing).

Primary goals: - Reuse existing **light placement and editing UX** -
Maintain **high performance** - Integrate with existing **audio playback
system** - Use **distance attenuation based on listener position**

------------------------------------------------------------------------

# 1. Core Concept

The system introduces **Audio Sources** on the canvas.

Each audio source: - Has a **world position** - Has a **falloff
radius** - Plays a **looping audio file** - Adjusts **volume based on
distance from listener tokens**

Audio behaves similar to **light radius**, but affects **sound volume**
instead of illumination.

------------------------------------------------------------------------

# 2. Data Model

Create a new type:

``` ts
interface AudioSource {
  id: string
  x: number
  y: number

  audioFile: string

  radius: number
  innerRadius?: number

  baseVolume: number
  loop: boolean
  playing: boolean
}
```

Notes:

-   `radius` = maximum audible distance
-   `innerRadius` = optional full-volume zone
-   `baseVolume` = max playback volume
-   `loop` = default true

Store in global state similar to **lights**.

Example store location:

    gameStore.audioSources

------------------------------------------------------------------------

# 3. Drag & Drop Behaviour

When a GM **drops an audio file onto the canvas**:

1.  Detect file drop
2.  Upload file to server if necessary
3.  Create an `AudioSource`
4.  Place source at **drop coordinates**
5.  Begin playback immediately

Pseudo:

``` ts
onCanvasDrop(file, position) {

  const source: AudioSource = {
    id: uuid(),
    x: position.x,
    y: position.y,
    audioFile: uploadedPath,
    radius: gridSize * 6,
    baseVolume: 1,
    loop: true,
    playing: true
  }

  addAudioSource(source)
}
```

------------------------------------------------------------------------

# 4. Reuse Light Tool Interaction System

The **Audio Tool must reuse the same interaction pattern as the Light
Tool**.

Specifically reuse:

-   Drag to reposition
-   Radius handles
-   Selection highlight
-   Property panel
-   Delete behavior

Implementation strategy:

Duplicate the **light editing controller** and replace:

    Light -> AudioSource
    radius -> audioRadius

This ensures consistent UX.

------------------------------------------------------------------------

# 5. Visual Representation

Each audio source renders:

### Center Icon

A speaker icon:

    🔊

Preferably an SVG icon sprite.

### Radius Visualization

Render a circle similar to light radius.

Example:

    PIXI.Graphics()
    .drawCircle(x, y, radius)

Style:

-   thin dashed line
-   subtle blue or purple color
-   low opacity fill

------------------------------------------------------------------------

# 6. Volume Falloff Model

Use **distance attenuation**.

Listener = **player tokens** or **camera center** (depending on mode).

Recommended model:

    distance = dist(listener, source)

    if distance > radius
      volume = 0
    else
      volume = baseVolume * (1 - distance / radius)

Optional improvement:

    innerRadius = full volume zone

    if distance < innerRadius
      volume = baseVolume

------------------------------------------------------------------------

# 7. Audio Engine

Use **Web Audio API** or **Howler.js**.

Each AudioSource owns:

    AudioBufferSourceNode
    GainNode

Volume updates every frame or when listener moves.

Pseudo:

    updateAudioVolumes(listenerPosition) {

     for each source:

       distance = dist(listener, source)

       volume = computeFalloff()

       source.gainNode.gain.value = volume
    }

Run update in render loop or movement events.

------------------------------------------------------------------------

# 8. Property Panel

Selecting an audio source opens configuration UI.

Properties:

    Audio File
    Play / Pause
    Base Volume
    Radius
    Inner Radius
    Loop
    Delete

Sliders recommended for:

-   Radius
-   Volume

------------------------------------------------------------------------

# 9. Performance Requirements

The system must scale to **20--50 active sources**.

Optimizations:

-   Only update audio volume when:

    -   listener moves
    -   source moves

-   Do not update every frame unnecessarily.

-   Use spatial partitioning if needed.

------------------------------------------------------------------------

# 10. Tool Integration

Add new toolbar tool:

    Audio Tool

Behavior:

    Click tool
    Drag audio file onto canvas
    Place audio source
    Adjust radius

Optional:

    Shift + Drag = adjust radius

------------------------------------------------------------------------

# 11. Server Integration

Uploaded audio files should be stored in:

    /assets/audio/spatial

Upload endpoint:

    POST /api/upload-audio

Return:

    {
     path: "/assets/audio/spatial/file.ogg"
    }

------------------------------------------------------------------------

# 12. Rendering Layer

Audio sources should render in the same **interaction layer as lights**.

Recommended layer order:

    Map
    Grid
    Tokens
    Lights
    AudioSources
    Fog
    UI overlays

------------------------------------------------------------------------

# 13. Serialization

Include audio sources in board state:

    board.audioSources

Save/load with map.

------------------------------------------------------------------------

# 14. Testing Checklist

Test cases:

-   Drop audio file on canvas
-   Radius editing works
-   Audio volume changes with distance
-   Multiple sources blend correctly
-   Moving token changes perceived volume
-   Removing source stops playback
-   Saving/loading board preserves audio

------------------------------------------------------------------------

# 15. Implementation Order

1.  Create `AudioSource` data model
2.  Implement store management
3.  Implement audio engine
4.  Implement drag‑drop placement
5.  Implement Pixi visualization
6.  Implement radius editing (reuse light system)
7.  Implement property panel
8.  Integrate with board save/load
9.  Optimize volume updates
10. QA testing

------------------------------------------------------------------------

# End Spec
