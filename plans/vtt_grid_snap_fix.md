
# VTT Grid Snap vs Shader Grid – Fix Specification

## Problem Summary

Tokens do not snap to the same grid that is visually rendered.

Observed behavior:

- Changing **grid size** updates the visual grid correctly.
- Changing **grid offset** updates the visual grid correctly.
- Tokens still snap based on an **old or different grid**.
- It appears tokens follow an internal grid that is not the same as the rendered grid.

The visual grid is rendered by **GridOverlay (shader)** while token snapping happens in **GameBoard.tsx**.

Because the shader and CPU logic compute grid coordinates separately, they must use **identical world-space math**. Currently they do not.

---

# How the Shader Defines the Grid

Inside `GridOverlay` the fragment shader calculates world coordinates as:

```
world = (screen / uZoom) + uCamera + uGridOffset
```

Grid coordinates are derived from:

```
gridCoord = world / uGridSize
```

Therefore the shader grid exists in **world space** and is controlled by:

- `uGridSize`
- `uGridOffset`
- `uCamera`
- `uZoom`

If CPU snapping does not use the same model, tokens will snap to a different grid.

---

# Root Cause Hypothesis

There are likely **multiple grid size variables** in the system.

Examples that may exist:

- `gridSize`
- `gridCellPx`
- `effectiveGridSize`
- cached grid values
- local grid calculations in drag handlers

Token snap logic is probably using a **different variable or cached value** than the grid shader.

---

# Required Fix

There must be **ONE authoritative grid configuration** used everywhere.

Example:

```
interface GridConfig {
  gridSize: number
  gridOffsetX: number
  gridOffsetY: number
}
```

All systems must read from the same configuration.

---

# Correct Snap Algorithm

Token snapping must replicate the shader grid math.

Use this formula:

```
function snapToGrid(x, y, gridSize, offsetX, offsetY) {
  const worldX = x + offsetX
  const worldY = y + offsetY

  const snappedX =
    Math.floor(worldX / gridSize) * gridSize - offsetX + gridSize / 2

  const snappedY =
    Math.floor(worldY / gridSize) * gridSize - offsetY + gridSize / 2

  return { x: snappedX, y: snappedY }
}
```

This mirrors the shader logic:

```
gridCoord = world / gridSize
```

---

# Required Code Investigation

Focus primarily on:

```
GameBoard.tsx
```

Search for token snap logic such as:

```
Math.floor(pos.x / gridSize)
Math.floor((pos.x - gridOffsetX) / gridSize)
/ gridCellPx
```

Replace all variations with a **single shared snap function**.

---

# Systems That Must Use the Same Grid

The following systems must all use the same grid config:

- token dragging
- token placement
- measurement tool
- light placement
- aura placement
- audio placement (future tool)
- path preview while dragging

All must derive from:

```
gridConfig.gridSize
gridConfig.gridOffsetX
gridConfig.gridOffsetY
```

---

# Important Rule

Do **NOT cache grid values**.

Bad example:

```
const gridSize = useRef(gridConfig.gridSize)
```

Correct approach:

Always read the current values from the grid configuration.

---

# Verification Steps

After the fix:

1. Change grid size (example: 50 → 120)
2. Change grid offset
3. Drag tokens across the board

Tokens must **snap exactly to the visible shader grid lines**.

No independent token grid should exist.

---

# Goal

Ensure the VTT has:

- one grid configuration
- one snap algorithm
- shader grid and CPU grid perfectly aligned

The visible grid must always match token placement.
