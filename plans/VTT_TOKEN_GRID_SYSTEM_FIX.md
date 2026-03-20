# VTT Token Grid System Fix and Architecture Guide

This document explains how to correctly implement grid movement for
tokens larger than **1×1** in a Virtual Tabletop (VTT).\
It also includes **Codex instructions** to implement the fix safely.

The goal is to prevent issues where larger tokens (2×2, 3×3, etc.) use
the **top‑left tile as the movement anchor** instead of their **true
center**.

------------------------------------------------------------------------

# Problem

Current behavior:

Large Token (2x2)

\[ \]\[ \] \[ \]\[ \]

Movement snapping uses:

top-left tile

This causes:

-   offset movement
-   incorrect grid snapping
-   incorrect measurement
-   targeting errors

The correct anchor for movement must be the **token center**.

------------------------------------------------------------------------

# Correct VTT Model

Professional VTT engines treat tokens like this:

Token Position = Center Point\
Token Size = footprint \* gridSize\
Rendering Anchor = Center

Example:

gridSize = 100px\
footprint = 2

tokenSize = 200px

Token center is the true logical position.

------------------------------------------------------------------------

# Two Valid Architectures

## Architecture A (Minimal Change)

Keep rendering anchored to the **top-left**:

sprite.anchor.set(0,0)

Store token positions as:

token.x = top-left\
token.y = top-left

But perform snapping using the **center**.

### Snap Logic

footprint = token.size\
tokenSize = footprint \* gridSize

centerX = pointerX\
centerY = pointerY

snappedCenterX = floor((centerX - gridOffsetX) / gridSize) \* gridSize +
gridOffsetX + gridSize / 2

snappedCenterY = floor((centerY - gridOffsetY) / gridSize) \* gridSize +
gridOffsetY + gridSize / 2

ghostX = snappedCenterX - tokenSize / 2\
ghostY = snappedCenterY - tokenSize / 2

This keeps your current rendering system intact.

------------------------------------------------------------------------

## Architecture B (Recommended Long‑Term)

Switch token rendering to **center anchor**:

sprite.anchor.set(0.5)

Store token positions as the **center of the token**.

Then snapping becomes trivial:

token.x = round(pointerX / gridSize) \* gridSize\
token.y = round(pointerY / gridSize) \* gridSize

Advantages:

-   simpler math
-   easier measurement
-   better aura/radius handling
-   fewer bugs

Disadvantages:

-   requires updating shadow offsets
-   requires updating label offsets
-   requires updating status icon offsets

------------------------------------------------------------------------

# Measurement System

Measurement should **always use token centers**.

Example:

startCenterX = token.x + (footprint \* gridSize) / 2\
startCenterY = token.y + (footprint \* gridSize) / 2

endCenterX = ghostX + (footprint \* gridSize) / 2\
endCenterY = ghostY + (footprint \* gridSize) / 2

Distance calculation:

dx = endCenterX - startCenterX\
dy = endCenterY - startCenterY

distance = sqrt(dx\^2 + dy\^2)\
squares = distance / gridSize

Your measurement code already follows this pattern, which is correct.

------------------------------------------------------------------------

# Multi‑Token Dragging

Your current implementation:

ghostAnchors\[i\].x = origPos.x + dx\
ghostAnchors\[i\].y = origPos.y + dy

This is correct.

The **only requirement** is that the **primary ghost token uses correct
center snapping**.

Once that is fixed, multi-token dragging works automatically.

------------------------------------------------------------------------

# Additional Improvements Used by Modern VTTs

## Token Footprint Model

Tokens should explicitly store:

token.size = 1 \| 2 \| 3 \| 4

Mapping:

1 = Medium\
2 = Large\
3 = Huge\
4 = Gargantuan

------------------------------------------------------------------------

## Token Bounds

Compute bounds like:

tokenLeft = token.x\
tokenTop = token.y\
tokenRight = token.x + tokenSize\
tokenBottom = token.y + tokenSize

These bounds are used for:

-   collision
-   targeting
-   area effects

------------------------------------------------------------------------

## Grid Occupancy

For a 3×3 token:

\[x\]\[x\]\[x\]\
\[x\]\[x\]\[x\]\
\[x\]\[x\]\[x\]

The **logical origin remains the center**, not the corner.

------------------------------------------------------------------------

# Codex Implementation Task

Provide Codex with the following instructions.

------------------------------------------------------------------------

## Codex Prompt

Fix token grid snapping for tokens larger than 1×1.

Currently token snapping uses the top‑left tile as the anchor:

ghostX = floor((pos.x - gridOffsetX) / gridSize) \* gridSize +
gridOffsetX\
ghostY = floor((pos.y - gridOffsetY) / gridSize) \* gridSize +
gridOffsetY

This works for 1×1 tokens but fails for larger tokens.

Modify the snapping logic so that snapping uses the token center
instead.

Steps:

1.  Determine token footprint: footprint = token.size \|\| 1

2.  Calculate tokenSize: tokenSize = footprint \* gridSize

3.  Treat pointer position as the desired token center.

4.  Snap the center to the grid:

snappedCenterX = floor((pos.x - gridOffsetX) / gridSize) \* gridSize +
gridOffsetX + gridSize / 2

snappedCenterY = floor((pos.y - gridOffsetY) / gridSize) \* gridSize +
gridOffsetY + gridSize / 2

5.  Convert the snapped center back to a top‑left coordinate:

ghostX = snappedCenterX - tokenSize / 2\
ghostY = snappedCenterY - tokenSize / 2

Important constraints:

-   Do NOT change sprite.anchor (leave it at anchor.set(0,0))
-   Do NOT modify multi‑token delta movement logic
-   Only update snapping logic during dragging

------------------------------------------------------------------------

# Validation Tests

After implementing the fix, verify:

Test 1\
Move 1×1 token\
Result: behaves unchanged

Test 2\
Move 2×2 token\
Result: token footprint aligns with grid

Test 3\
Move 3×3 token\
Result: center snaps correctly

Test 4\
Multi-token drag\
Result: all tokens move together correctly

------------------------------------------------------------------------

# Expected Result

Tokens of any size now snap correctly to the grid:

1×1\
2×2\
3×3\
4×4

Movement anchor becomes the **token center**, eliminating offset issues.
