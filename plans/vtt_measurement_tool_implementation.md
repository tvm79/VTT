# VTT Measurement Tool -- Multi‑Shape Implementation Guide

## Objective

Extend the existing **Measurement Tool** so it supports the standard VTT
measurement shapes:

-   Ray (already implemented)
-   Cone
-   Rectangle
-   Circle

Users must be able to **switch between these shapes via a sub‑panel in
the Game Bar toolbar**, consistent with how other tools expose secondary
controls.

The system must remain performant and integrate cleanly with the
existing **PixiJS stage**, grid system, and measurement logic.

------------------------------------------------------------------------

# 1. Tool Architecture

Create a **measurement mode system** that supports multiple measurement
shapes.

### Measurement Types

    type MeasurementShape = "ray" | "cone" | "circle" | "rectangle";

### Measurement Object

Each measurement drawn on the canvas should use a normalized structure.

    interface Measurement {
      id: string
      shape: MeasurementShape
      start: { x: number; y: number }
      end: { x: number; y: number }
      color: number
      thickness: number
    }

For shapes like **circle or cone**, `end` represents the
radius/direction reference.

------------------------------------------------------------------------

# 2. Toolbar Integration

Add a **sub‑panel for the measurement tool** identical in behaviour to
other toolbar sub‑panels.

Example layout:

    [ Measure Tool ]
       ├ Ray
       ├ Cone
       ├ Circle
       └ Rectangle

### Requirements

When the measure tool is selected:

1.  The sub‑panel appears to the right of the tool button.
2.  Clicking an icon sets the active measurement shape.
3.  The selected icon should show a **visual active state**.

### State

Add to the global tool state:

    measurementShape: MeasurementShape

Default value:

    "ray"

------------------------------------------------------------------------

# 3. Interaction Model

Measurement drawing should follow this flow.

### Mouse Down

    startPosition = cursorPosition
    create measurement draft

### Mouse Move

    update endPosition
    re-render preview

### Mouse Up

    finalize measurement
    add to measurement layer

Measurements should **not block interactions** with other objects.

------------------------------------------------------------------------

# 4. Rendering Layer

Create a dedicated Pixi container.

    measurementLayer

Layer order recommendation:

    map
    grid
    tokens
    measurements
    fog
    UI overlays

Each measurement is rendered using **PIXI.Graphics**.

------------------------------------------------------------------------

# 5. Shape Rendering

## Ray

    graphics.lineStyle(thickness, color)
    graphics.moveTo(start.x, start.y)
    graphics.lineTo(end.x, end.y)

Distance label should appear near the midpoint.

------------------------------------------------------------------------

## Circle

    radius = distance(start, end)
    graphics.drawCircle(start.x, start.y, radius)

Distance label shows radius.

------------------------------------------------------------------------

## Rectangle

Calculate width and height from start/end.

    graphics.drawRect(
      start.x,
      start.y,
      end.x - start.x,
      end.y - start.y
    )

Distance labels:

-   width
-   height

------------------------------------------------------------------------

## Cone

Cone should be defined by:

-   origin (start)
-   direction (end)
-   angle (default: 60°)

Implementation concept:

    direction = normalize(end - start)
    rotate direction ± angle/2
    construct triangle sector
    draw using graphics.drawPolygon()

The cone length equals the distance between start and end.

------------------------------------------------------------------------

# 6. Distance Calculations

All measurements must respect the **grid system**.

Distance should use existing grid utilities.

Example:

    distance = gridDistance(start, end)

Support both:

-   grid snapping
-   free measurement

------------------------------------------------------------------------

# 7. Preview Rendering

During drag operations:

-   Use a **temporary PIXI.Graphics**
-   Clear and redraw on each frame
-   Do not commit to state until mouse release

Example:

    previewGraphics.clear()
    drawShape(previewGraphics)

------------------------------------------------------------------------

# 8. Performance Considerations

1.  Reuse graphics objects when possible.
2.  Avoid creating new PIXI objects every mouse move.
3.  Keep preview drawing lightweight.
4.  Batch redraws via requestAnimationFrame if needed.

Measurements are ephemeral UI elements and should **not trigger
expensive React updates**.

------------------------------------------------------------------------

# 9. Grid Snapping

When enabled:

    start = snapToGrid(start)
    end   = snapToGrid(end)

Grid snapping must match the behaviour used by:

-   token placement
-   light placement

------------------------------------------------------------------------

# 10. Measurement Labels

Each measurement should display a small label showing distance.

Example formats:

    Ray: 30 ft
    Circle: 20 ft radius
    Rectangle: 20 ft × 30 ft
    Cone: 30 ft

Implementation suggestion:

Use **HTML overlay labels** (similar to light icons overlay) so they
remain readable above fog.

------------------------------------------------------------------------

# 11. Clearing Measurements

Measurements should automatically clear when:

-   the tool changes
-   user presses ESC
-   user right-clicks

Optional improvement:

Add a **Clear All Measurements** command.

------------------------------------------------------------------------

# 12. Icon Requirements

Create icons for:

-   ray
-   cone
-   circle
-   rectangle

Icons should match the existing UI style used in the toolbar.

------------------------------------------------------------------------

# 13. File Structure Recommendation

    tools/
      measurement/
        MeasurementManager.ts
        MeasurementRenderer.ts
        MeasurementTypes.ts
        MeasurementUtils.ts

    ui/
      MeasurementPanel.tsx

------------------------------------------------------------------------

# 14. Implementation Order

1.  Add measurement shape state.
2.  Create toolbar sub-panel.
3.  Build measurement data structure.
4.  Implement rendering layer.
5.  Implement ray drawing.
6.  Add circle drawing.
7.  Add rectangle drawing.
8.  Add cone drawing.
9.  Add preview rendering.
10. Add measurement labels.
11. Add clearing logic.
12. Connect to grid system.

------------------------------------------------------------------------

# 15. Acceptance Criteria

The feature is complete when:

-   All four shapes can be selected from the toolbar.
-   Measurements render smoothly while dragging.
-   Distances respect grid scaling.
-   Labels display correct values.
-   Performance remains stable during continuous drawing.
