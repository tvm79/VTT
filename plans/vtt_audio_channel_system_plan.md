
# VTT Audio Channel System – Implementation Plan

## Goal
Implement a structured audio routing system with multiple channels and a master bus.  
The system must support flexible routing for playlists and correct routing for positional audio sources and UI sounds.

---

# Audio Channel Architecture

Implement a hierarchical audio bus system.

Master
├── Music
├── Environmental
└── UI

All audio must ultimately route through the **Master channel**.

---

# Channel Definitions

## Master Channel
Root output bus.

Responsibilities:
- Global volume control
- Final routing to the audio output
- Parent of all other channels

All audio must pass through this channel.

---

## Music Channel
Used for playlist music tracks.

Examples:
- Background music
- Combat music
- Tavern music

Characteristics:
- Non-positional
- Usually looped
- Controlled by music volume slider

Routing:
Music → Master

---

## Environmental Channel
Used for ambient and positional sounds.

Examples:
- Audio sources placed on the map
- Wind
- Water
- Environmental ambience
- Proximity sounds

Characteristics:
- May be positional / distance attenuated
- May be looped
- Used by audio source emitters

Routing:
Environmental → Master

---

## UI Channel
Used for interface sounds.

Examples:
- Dice rolls
- Notifications
- Button clicks
- Turn indicators

Characteristics:
- Non-positional
- Short one-shot sounds

Routing:
UI → Master

---

# Audio Bus Objects

Create persistent audio buses:

masterBus  
musicBus  
environmentBus  
uiBus  

Connections:

musicBus → masterBus  
environmentBus → masterBus  
uiBus → masterBus  

Master bus connects to the final audio output.

---

# Routing Rules

| Audio Type | Channel |
|------------|--------|
Playlist music | Music |
Audio sources (map emitters / proximity audio) | Environmental |
UI sound effects | UI |

---

# Playlist Channel Routing

Playlists must NOT be hardwired to the Music channel.

Each playlist must support a selectable output channel.

Example property:

playlist.channel: "music" | "environmental"

Default:

playlist.channel = "music"

---

# Playlist Playback Routing

When a playlist track starts playing:

If playlist.channel == "music"
    route → musicBus

If playlist.channel == "environmental"
    route → environmentalBus

Both buses must route to:

channelBus → masterBus → output

---

# Playlist UI Changes

Add a channel selector in the Playlist Settings panel.

Options:

Music  
Environmental

Example UI:

Output Channel:
[ Music ▼ ]

or

Output Channel:
[ Environmental ▼ ]

Only the GM can change this setting.

---

# Volume Controls

Expose independent volume sliders for:

Master Volume  
Music Volume  
Environmental Volume  
UI Volume  

Each slider modifies the gain of its channel bus.

Example:

musicBus.gain = settings.musicVolume

---

# Persistence

Playlist channel selection must be:

- Stored in playlist data
- Loaded when the session loads
- Applied when tracks start playing

---

# Implementation Constraints

- Do not break existing playlist playback logic.
- Do not break positional audio source logic.
- Do not break UI sound playback.
- Only modify routing layer where audio nodes are connected.

---

# Expected Result

Benefits:

- Independent volume control
- Clean audio mixing
- Environmental ambience separated from music
- Flexible playlist usage
- Expandable architecture for future channels (voice chat, SFX, etc.)

Final routing always:

Music → Master → Output  
Environmental → Master → Output  
UI → Master → Output
