# VTT Game Time + Day/Night System (Codex Implementation Prompt)

## Goal

Implement a **Game Time System** for a PixiJS v8 + React VTT.

Features: 1. Central game clock stored in seconds. 2. UI time bar with
controls to move time forward/backward. 3. Time formatted as
`HH:MM AM/PM`. 4. Day/Night overlay on the canvas that darkens or
lightens based on time.

------------------------------------------------------------------------

# 1. Core Time Constants

``` ts
export const TIME = {
  ROUND: 6,
  MINUTE: 60,
  HOUR: 3600,
  DAY: 86400
}
```

------------------------------------------------------------------------

# 2. Game Store State

Add to `gameStore.ts`

``` ts
gameTimeSeconds: number
```

Initial value:

``` ts
gameTimeSeconds = 8 * TIME.HOUR
```

------------------------------------------------------------------------

# 3. Time Functions

Create `/src/utils/gameTime.ts`

``` ts
export function secondsToTime(seconds:number){

  const daySeconds = seconds % 86400

  const hours = Math.floor(daySeconds / 3600)
  const minutes = Math.floor((daySeconds % 3600) / 60)

  return {hours, minutes}
}
```

``` ts
export function formatTime(hours:number, minutes:number){

  const period = hours >= 12 ? "PM" : "AM"
  const h = hours % 12 || 12
  const m = minutes.toString().padStart(2,"0")

  return `${h}:${m} ${period}`
}
```

------------------------------------------------------------------------

# 4. Time Manipulation

Add to store:

``` ts
advanceTime(seconds:number)

setTime(seconds:number)
```

Example:

``` ts
advanceTime:(delta)=>{
 set(state=>({
  gameTimeSeconds: state.gameTimeSeconds + delta
 }))
}
```

------------------------------------------------------------------------

# 5. Time Bar UI

Create component:

    /src/components/GameTimeBar.tsx

Layout:

    [ << ] [ < ]   11:30 AM   [ > ] [ >> ]

Button behavior:

  Button   Action
  -------- -------------
  \<\<     -1 hour
  \<       -10 minutes
  \>       +10 minutes
  \>\>     +1 hour

Example:

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

# 6. CSS

``` css
.time-bar{
 display:flex;
 align-items:center;
 gap:6px;
 padding:4px 10px;
 border-radius:6px;
}

.time-display{
 font-weight:bold;
 min-width:90px;
 text-align:center;
}
```

------------------------------------------------------------------------

# 7. Pixi Day/Night Overlay

Create fullscreen overlay above map.

``` ts
const timeOverlay = new PIXI.Graphics()

timeOverlay.rect(0,0,10000,10000)
timeOverlay.fill(0x000000)

timeOverlay.alpha = 0

stage.addChild(timeOverlay)
```

Store reference:

    renderer.timeOverlay

------------------------------------------------------------------------

# 8. Day Progress

``` ts
export function getDayProgress(seconds:number){
 return (seconds % TIME.DAY) / TIME.DAY
}
```

Value range:

    0 = midnight
    0.5 = noon
    1 = midnight

------------------------------------------------------------------------

# 9. Lighting Curve

``` ts
function calculateNightAlpha(progress:number){

 if(progress < 0.25) return 0.6
 if(progress < 0.30) return 0.4
 if(progress < 0.70) return 0.0
 if(progress < 0.75) return 0.3

 return 0.6
}
```

------------------------------------------------------------------------

# 10. Update Overlay

Whenever time changes:

``` ts
const progress = getDayProgress(gameTimeSeconds)

const alpha = calculateNightAlpha(progress)

timeOverlay.alpha = alpha
```

------------------------------------------------------------------------

# 11. Optional Color Tint

``` ts
timeOverlay.tint = 0x001133
```

Recommended tints:

  Time    Tint
  ------- -----------
  Night   dark blue
  Dawn    orange
  Day     none
  Dusk    purple

------------------------------------------------------------------------

# 12. Data Flow

    Time Bar Button
         ↓
    advanceTime()
         ↓
    gameTimeSeconds updated
         ↓
    React updates UI
         ↓
    Pixi overlay updates lighting

------------------------------------------------------------------------

# 13. File Structure

    src
     ├ components
     │   GameTimeBar.tsx
     │
     ├ utils
     │   gameTime.ts
     │
     ├ systems
     │   timeOverlaySystem.ts
     │
     └ store
         gameStore.ts

------------------------------------------------------------------------

# End
