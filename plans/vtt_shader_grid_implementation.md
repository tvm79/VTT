# PixiJS VTT Shader Grid Implementation Plan

## Objective

Replace the current line-based grid rendering system with a GPU
shader-based grid that remains stable during pan and zoom. The grid must
integrate with the existing VTT camera, token placement, lighting
system, and grid configuration tools.

Compatibility requirements: - PixiJS v8 - WebGL2 renderer - Existing
world container transform system - Token and lighting placement systems

The grid must remain the authoritative system for world alignment and
snapping.

------------------------------------------------------------------------

# High-Level Architecture

Stage ├─ WorldContainer │ ├─ Map │ ├─ Tokens │ ├─ Lights │ ├─ Effects │
└─ Measurements │ └─ GridOverlay (Shader based)

Key principle: The grid is rendered in screen space but calculated in
world space using camera uniforms.

------------------------------------------------------------------------

# Step 1 --- Remove Old Grid System

Remove any grid rendering based on: - PIXI.Graphics line rendering -
Static grid sprites - Grid drawing tied directly to world transforms

Ensure no subsystems rely on the old renderer.

------------------------------------------------------------------------

# Step 2 --- Create Grid Shader

Create a fragment shader that calculates grid lines mathematically.

Core concept: fract(worldPosition / gridSize)

Example fragment shader:

``` glsl
precision mediump float;

uniform vec2 uCamera;
uniform float uZoom;
uniform float uGridSize;
uniform vec2 uResolution;
uniform vec2 uGridOffset;

void main(){

    vec2 screen = gl_FragCoord.xy;
    vec2 world = (screen / uZoom) + uCamera + uGridOffset;

    vec2 grid = abs(fract(world / uGridSize - 0.5) - 0.5) / fwidth(world / uGridSize);

    float line = min(grid.x, grid.y);

    float alpha = 1.0 - min(line, 1.0);

    gl_FragColor = vec4(vec3(1.0), alpha * 0.35);
}
```

------------------------------------------------------------------------

# Step 3 --- Create Grid Overlay

Create a fullscreen quad sprite.

Example:

``` ts
const gridOverlay = new PIXI.Sprite(PIXI.Texture.WHITE)
gridOverlay.width = app.screen.width
gridOverlay.height = app.screen.height
gridOverlay.eventMode = "none"
```

Attach shader filter:

gridOverlay.filters = \[gridShaderFilter\]

Add to stage above the world container.

------------------------------------------------------------------------

# Step 4 --- Create Grid Filter

Create a reusable filter.

``` ts
new Filter(undefined, fragmentShader, {
  uCamera: [0,0],
  uZoom: 1,
  uGridSize: 64,
  uResolution: [1,1],
  uGridOffset: [0,0]
})
```

------------------------------------------------------------------------

# Step 5 --- Camera Synchronization

Whenever the camera changes (pan, zoom, resize), update shader uniforms.

Example:

``` ts
gridFilter.uniforms.uCamera = [cameraX, cameraY]
gridFilter.uniforms.uZoom = zoom
gridFilter.uniforms.uResolution = [app.screen.width, app.screen.height]
```

------------------------------------------------------------------------

# Step 6 --- Grid Configuration Integration

The VTT includes a Grid Config Tool.

Ensure the shader grid responds to: - grid size - grid offset - grid
enable/disable

Update uniforms: uGridSize uGridOffset

The grid configuration UI must update shader uniforms immediately.

------------------------------------------------------------------------

# Step 7 --- Update Grid-Dependent Subsystems

These systems must continue using the grid configuration state.

## Token Placement

Token snapping:

snapX = floor((worldX - gridOffsetX) / gridSize) \* gridSize +
gridOffsetX snapY = floor((worldY - gridOffsetY) / gridSize) \*
gridSize + gridOffsetY

Ensure drag previews use the same logic.

## Lighting Placement

Lights placed by the GM must respect: - grid size - grid offset

Lighting should never depend on grid rendering.

## Measurement Tools

Distance calculations:

distance / gridSize

Ensure measurement logic references grid configuration state.

## Area Templates

Spell templates aligned to the grid must continue snapping correctly.

------------------------------------------------------------------------

# Step 8 --- Resize Handling

Grid overlay must resize with renderer.

Example:

gridOverlay.width = app.screen.width gridOverlay.height =
app.screen.height

Also update resolution uniform.

------------------------------------------------------------------------

# Step 9 --- Performance Expectations

Expected GPU cost: - one fullscreen quad - one fragment shader

No dynamic geometry generation.

------------------------------------------------------------------------

# Step 10 --- Validation Checklist

Verify:

-   Grid stable while zooming
-   Grid stable while panning
-   Grid respects grid offset
-   Token snapping still works
-   Light placement still correct
-   Measurement tools still correct
-   Grid config tool updates grid instantly

------------------------------------------------------------------------

# Result

The VTT will use a GPU procedural grid that is:

-   stable
-   infinite
-   extremely performant
-   WebGL2 compatible
-   independent of camera jitter
