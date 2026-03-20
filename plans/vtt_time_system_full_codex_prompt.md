# VTT Game Time System + Day/Night + Advanced UI (Codex Implementation Prompt)

Goal: Implement a complete **Game Time System** for a **React + PixiJS
v8 VTT**.

Features: - Centralized game clock - UI time bar with controls -
Day/Night lighting overlay - Smooth 24‑hour lighting gradient - Sun/Moon
indicator - Timeline scrubber - Weather overlay system - Multiplayer
synchronized time - Extensible system for spells, rests, and travel

------------------------------------------------------------------------

# 1. Core Time Model

All time stored in **seconds**.

``` ts
export const TIME = {
 ROUND: 6,
 MINUTE: 60,
 HOUR: 3600,
 DAY: 86400
}
```

Store in `gameStore.ts`

``` ts
gameTimeSeconds:number
```

Default start:

``` ts
gameTimeSeconds = 8 * TIME.HOUR
```

------------------------------------------------------------------------

# 2. Time Utility Functions

`/src/utils/gameTime.ts`

``` ts
export function secondsToTime(seconds:number){

 const daySeconds = seconds % 86400

 const hours = Math.floor(daySeconds / 3600)
 const minutes = Math.floor((daySeconds % 3600) / 60)

 return {hours,minutes}
}
```

``` ts
export function formatTime(hours:number,minutes:number){

 const period = hours >= 12 ? "PM" : "AM"
 const h = hours % 12 || 12
 const m = minutes.toString().padStart(2,"0")

 return `${h}:${m} ${period}`
}
```

------------------------------------------------------------------------

# 3. Store Actions

``` ts
advanceTime(seconds:number)
setTime(seconds:number)
```

Example

``` ts
advanceTime:(delta)=>{
 set(state=>({
  gameTimeSeconds: state.gameTimeSeconds + delta
 }))
}
```

------------------------------------------------------------------------

# 4. Game Time Bar UI

Component:

    /src/components/GameTimeBar.tsx

Layout

    [ << ] [ < ]  11:30 AM  [ > ] [ >> ]
            ☀

Buttons:

  Button   Action
  -------- -------------
  \<\<     -1 hour
  \<       -10 minutes
  \>       +10 minutes
  \>\>     +1 hour

Example

``` tsx
<div className="time-bar">

<button onClick={()=>advanceTime(-TIME.HOUR)}>«</button>
<button onClick={()=>advanceTime(-600)}>‹</button>

<div className="time-display">{formattedTime}</div>

<button onClick={()=>advanceTime(600)}>›</button>
<button onClick={()=>advanceTime(TIME.HOUR)}>»</button>

</div>
```

------------------------------------------------------------------------

# 5. Advanced UI (Professional VTT Style)

Add a **timeline bar** showing day progression.

Example:

    [ sunrise gradient bar ]
        ☀ slider

Component:

    GameTimeline.tsx

Slider value:

``` ts
const progress = (gameTimeSeconds % TIME.DAY) / TIME.DAY
```

Dragging the slider sets time:

``` ts
setTime(progress * TIME.DAY)
```

------------------------------------------------------------------------

# 6. Sun / Moon Indicator

``` ts
function getSunState(progress:number){

 if(progress > 0.25 && progress < 0.75)
  return "sun"
 else
  return "moon"

}
```

Display icons accordingly.

------------------------------------------------------------------------

# 7. Pixi Day/Night Overlay

Create overlay above map layer.

``` ts
const timeOverlay = new PIXI.Graphics()

timeOverlay.rect(0,0,10000,10000)
timeOverlay.fill(0x000000)

timeOverlay.alpha = 0

stage.addChild(timeOverlay)
```

------------------------------------------------------------------------

# 8. Day Progress

``` ts
export function getDayProgress(seconds:number){
 return (seconds % TIME.DAY) / TIME.DAY
}
```

Values

    0 = midnight
    0.25 = sunrise
    0.5 = noon
    0.75 = sunset

------------------------------------------------------------------------

# 9. Smooth Lighting Curve

Instead of steps use gradient.

Example brightness curve

``` ts
function getLightLevel(progress:number){

 return Math.cos((progress-0.5)*Math.PI*2)*0.5+0.5
}
```

Overlay alpha:

``` ts
timeOverlay.alpha = 1 - getLightLevel(progress)
```

------------------------------------------------------------------------

# 10. Color Temperature

``` ts
if(progress < 0.25) tint=0x001133
else if(progress < 0.35) tint=0xffa64d
else if(progress < 0.7) tint=0xffffff
else if(progress < 0.8) tint=0xaa66ff
else tint=0x001133
```

Apply

``` ts
timeOverlay.tint = tint
```

------------------------------------------------------------------------

# 11. Sun Position Simulation

Sun angle:

``` ts
const angle = progress * Math.PI * 2
```

Used later for:

-   shadow direction
-   sky gradients

------------------------------------------------------------------------

# 12. Weather Overlay System

Create additional Pixi layer.

    weatherLayer

Supported:

-   rain
-   fog
-   snow

Example

``` ts
weatherLayer.alpha=0.3
```

------------------------------------------------------------------------

# 13. Torch / Darkvision Interaction

Night overlay multiplies with light sources.

Dynamic lights should reduce overlay darkness locally.

Implementation:

    finalLighting =
     globalNightOverlay
     minus
     dynamicLights

------------------------------------------------------------------------

# 14. Multiplayer Time Sync

Server authoritative time.

Server sends

    gameTimeSeconds

Clients update store.

Use websocket.

    socket.on("timeUpdate")

------------------------------------------------------------------------

# 15. Data Flow

    UI Control
       ↓
    advanceTime()
       ↓
    store updates
       ↓
    React UI updates
       ↓
    Pixi overlay updates
       ↓
    lighting + weather applied

------------------------------------------------------------------------

# 16. File Structure

    src
     ├ components
     │   GameTimeBar.tsx
     │   GameTimeline.tsx
     │
     ├ systems
     │   timeOverlaySystem.ts
     │   weatherSystem.ts
     │
     ├ utils
     │   gameTime.ts
     │
     └ store
         gameStore.ts

------------------------------------------------------------------------

# 17. Future Extensions

The system must support:

-   spell duration tracking
-   travel time simulation
-   calendar system
-   seasonal lighting
-   dynamic weather
-   AI-driven NPC schedules

------------------------------------------------------------------------

END
