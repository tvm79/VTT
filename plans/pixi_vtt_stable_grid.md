
# Stable WebGL Grid System for PixiJS VTT

## Goal
Implement a **stable, jitter-free grid** for the VTT that works correctly when **zooming and panning in WebGL**.

Traditional approaches draw thousands of grid lines using `PIXI.Graphics`. This causes instability because lines are rendered on **sub‑pixel coordinates during camera transforms**.

Instead, modern VTT engines render the grid as a **tiled texture in screen space** using `PIXI.TilingSprite`.

Benefits:

- No subpixel jitter
- Only **1 draw call**
- Stable at all zoom levels
- Efficient for large maps
- Used in modern VTT and map editors


---

# Architecture

```
Stage
 ├─ WorldContainer
 │   ├─ Map
 │   ├─ Tokens
 │   ├─ Lights
 │   └─ Effects
 │
 └─ GridOverlay   (screen space)
```

Important:

- `WorldContainer` handles camera pan + zoom.
- `GridOverlay` **does NOT move with the world**.
- Grid is synced via `tilePosition` and `tileScale`.


---

# Implementation

## 1. Create Grid Texture

Create a **single grid cell texture**.

```ts
import { Graphics, Rectangle } from "pixi.js";

export function createGridTexture(app: PIXI.Application, gridSize: number) {
  const g = new PIXI.Graphics();

  g.lineStyle({
    width: 1,
    color: 0xffffff,
    alpha: 0.25
  });

  g.moveTo(0, 0);
  g.lineTo(gridSize, 0);

  g.moveTo(0, 0);
  g.lineTo(0, gridSize);

  const texture = app.renderer.generateTexture(g, {
    region: new Rectangle(0, 0, gridSize, gridSize),
    resolution: 1
  });

  g.destroy();

  return texture;
}
```


---

## 2. Create Grid Overlay

Use `PIXI.TilingSprite` so the texture repeats infinitely.

```ts
import { TilingSprite } from "pixi.js";

export function createGridOverlay(app: PIXI.Application, gridSize: number) {
  const texture = createGridTexture(app, gridSize);

  const grid = new TilingSprite({
    texture,
    width: app.screen.width,
    height: app.screen.height
  });

  grid.eventMode = "none";

  return grid;
}
```

Add to stage:

```
app.stage.addChild(worldContainer);
app.stage.addChild(gridOverlay);
```


---

## 3. Sync Grid With Camera

Whenever camera pan or zoom changes:

```ts
function updateGrid(grid, cameraX, cameraY, zoom) {

  grid.tileScale.set(zoom);

  grid.tilePosition.set(
    -cameraX * zoom,
    -cameraY * zoom
  );
}
```

World transform:

```
worldContainer.position.set(cameraX, cameraY)
worldContainer.scale.set(zoom)
```

Grid receives the **inverse transform**.


---

## 4. Resize Handling

Grid must match viewport size.

```ts
app.renderer.on("resize", () => {
  grid.width = app.screen.width
  grid.height = app.screen.height
})
```


---

# Performance

Old method:

```
Graphics grid lines: 2000‑10000 draw calls
```

New method:

```
1 draw call (tiled texture)
```


---

# Optional Improvements

## Dual Grid Layers

```
GridOverlay
 ├─ MinorGrid (5 ft)
 └─ MajorGrid (10 ft / 20 ft)
```

Major grid uses thicker lines.


## Pixel Snapping

Recommended:

```
PIXI.settings.ROUND_PIXELS = true
```


## Fade Grid When Zoomed Out

Example:

```
grid.alpha = clamp(zoom * 1.2, 0.2, 1)
```


---

# Expected Result

Grid:

- perfectly stable while zooming
- perfectly stable while panning
- extremely cheap to render
- scalable to very large maps
- compatible with WebGL2 and PixiJS v8

