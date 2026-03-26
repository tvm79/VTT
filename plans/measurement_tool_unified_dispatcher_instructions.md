# Measurement Tool Implementation Brief

## Goal

Implement grid-based measurement preview and highlighting for both square and hex grids, using a unified shape dispatcher so tool code does not branch per shape/grid everywhere.

---

## High-Level Rules

- 1 cell = 5 ft
- Convert all ranges:
  - `rangeCells = rangeFt / 5`
- All shape generation must happen in grid space
- Renderer only consumes:
  - grid origin
  - grid target / direction
  - grid type
  - shape type
  - list of affected cells

Do not generate or persist world-space shape geometry.

---

## Required System Structure

Build the system in this order:

1. Define normalized measurement input types
2. Define normalized cell output type
3. Add a unified shape dispatcher
4. Add square-grid shape generators
5. Add hex-grid shape generators
6. Add tool preview pipeline
7. Add board highlight renderer
8. Add origin inclusion rules
9. Add validation / cleanup rules

---

## Step 1: Define Normalized Types

Create explicit shared types for measurement generation.

Use one normalized request object for all tools:

```ts
type GridKind = 'square' | 'hex';

type ShapeKind = 'line' | 'cone' | 'cube' | 'sphere' | 'cylinder';

type GridCell = {
  gx: number;
  gy: number;
};

type MeasurementRequest = {
  gridKind: GridKind;
  shape: ShapeKind;
  origin: GridCell;
  target?: GridCell;
  rangeFt: number;
  widthFt?: number;
  sizeFt?: number;
  includeOrigin?: boolean;
};
```

Rules:
- `origin` is always required
- `target` is used for direction-bearing shapes
- `rangeFt` is used for line / cone / sphere / cylinder
- `sizeFt` is used for cube side length
- `widthFt` is optional for line width
- `includeOrigin` overrides default origin inclusion rules

---

## Step 2: Define Shared Output Type

All generators must return the same output shape:

```ts
type MeasurementResult = {
  cells: GridCell[];
};
```

Requirements:
- No duplicates
- Deterministic order if possible
- Output only highlighted cells

---

## Step 3: Add the Unified Shape Dispatcher

Create one single entrypoint used by all measurement tools.

```ts
function getMeasurementCells(request: MeasurementRequest): MeasurementResult
```

Dispatcher responsibilities:
- Convert feet to cells
- Validate required fields
- Route to correct grid-specific generator
- Apply origin inclusion / exclusion rule
- Deduplicate cells
- Return normalized result

Recommended structure:

```ts
function getMeasurementCells(request: MeasurementRequest): MeasurementResult {
  const rangeCells = Math.floor(request.rangeFt / 5);
  const widthCells = request.widthFt ? Math.floor(request.widthFt / 5) : undefined;
  const sizeCells = request.sizeFt ? Math.floor(request.sizeFt / 5) : undefined;

  if (request.gridKind === 'square') {
    return getSquareMeasurementCells(request, rangeCells, widthCells, sizeCells);
  }

  return getHexMeasurementCells(request, rangeCells, widthCells, sizeCells);
}
```

Do not branch by shape in board rendering code. All tools must call this dispatcher only.

---

## Step 4: Add Grid-Specific Dispatchers

Add one dispatcher per grid kind.

```ts
function getSquareMeasurementCells(...)
function getHexMeasurementCells(...)
```

Each dispatcher switches by `shape` and calls the shape generator.

Example structure:

```ts
switch (request.shape) {
  case 'sphere':
    return genSquareSphere(...);
  case 'cylinder':
    return genSquareCylinder(...);
  case 'cube':
    return genSquareCube(...);
  case 'line':
    return genSquareLine(...);
  case 'cone':
    return genSquareCone(...);
}
```

Do the same for hex.

---

## Step 5: Implement Square Grid Rules

Distance rule:
- Use Chebyshev distance
- `dist = max(abs(dx), abs(dy))`

### Square Sphere
Rule:
- Include cells where `max(abs(dx), abs(dy)) <= radiusCells`
- Origin included by default

### Square Cylinder
Rule:
- Same footprint as sphere
- Origin included by default

### Square Cube
Rule:
- Axis-aligned square
- Side length = `sizeCells`
- Point of origin lies on a face
- Start with origin-anchored placement matching your current tool direction model
- Origin excluded by default unless overridden

### Square Line
Rule:
- Use Bresenham traversal from origin toward target
- Stop at `rangeCells`
- Width default = 1 cell
- If wider than 1, expand perpendicular to line direction
- Origin excluded by default

### Square Cone
Rule:
- Support 8 directions
- Length = `rangeCells`
- Origin excluded by default

Orthogonal cone logic:
- For step `i` from 1 to `rangeCells`
- Row width = `2 * i - 1`
- Place row perpendicular to main direction

Diagonal cone logic:
- March diagonally
- Expand row width each step
- Match the reference template behavior from the square-grid image, not geometric Euclidean fill

Important:
- Do not use free-angle cone fill on square grid
- Use template-style discrete cell expansion

---

## Step 6: Implement Hex Grid Rules

Use hex distance, not square distance.

Preferred approach:
- Convert offset coords to cube coords internally
- Use cube distance:
  - `dist = (abs(dx) + abs(dy) + abs(dz)) / 2`

### Hex Sphere / Burst
Rule:
- Include cell if hex distance from origin <= radiusCells
- Origin included

### Hex Cylinder
Rule:
- Same footprint as burst
- Origin included

### Hex Cube Equivalent
Rule:
- Treat as hex-radius footprint unless you have a separate game-specific cube template
- If tool exposes cube on hex, use burst-style area

### Hex Line
Rule:
- Step through neighbors in one chosen hex direction
- Length = `rangeCells`
- Origin excluded

Implementation options:
- Use cube lerp + cube round
- Or repeated neighbor stepping if direction is constrained to hex facings

### Hex Cone
Rule:
- Use directional wedge
- Origin excluded
- Length = `rangeCells`

Recommended implementation:
- Choose one of 6 facing directions from origin → target
- Build the cone ring by ring
- At ring `r`, include the forward arc cells for that facing
- Match the reference template behavior from the hex image

Do not use continuous angle math unless necessary.
Prefer discrete directional templates / ring expansion.

---

## Step 7: Add Shape Utility Functions

Create reusable helpers.

Required helpers:

```ts
feetToCells(ft)
dedupeCells(cells)
excludeOrigin(cells, origin)
includeOriginIfNeeded(cells, origin, includeOrigin)
getDirectionSquare(origin, target)
getDirectionHex(origin, target)
```

Square helpers:
- Bresenham line
- perpendicular spread
- Chebyshev distance

Hex helpers:
- offset <-> cube conversion
- cube distance
- cube neighbor step
- cube lerp / round if used for lines

---

## Step 8: Add Origin Inclusion Rules

Default origin behavior:

- sphere: include
- cylinder: include
- cube: exclude
- line: exclude
- cone: exclude

Add one helper:

```ts
function shouldIncludeOrigin(shape: ShapeKind, override?: boolean): boolean
```

Logic:
- If override is defined, use it
- Otherwise use defaults above

Apply this after shape generation so the rule is centralized.

---

## Step 9: Add Preview Flow for Tools

Measurement tool flow must be:

1. User selects tool shape
2. User chooses origin cell
3. User moves pointer over board
4. Board converts pointer -> snapped grid cell
5. Tool builds `MeasurementRequest`
6. Tool calls `getMeasurementCells(request)`
7. Renderer highlights returned cells
8. On confirm, persist grid-anchored measurement data only

Do not let tools call shape-specific functions directly.

All preview and placed measurements must use the same dispatcher.

---

## Step 10: Add Renderer Contract

Renderer input:
- array of `{gx, gy}`

Renderer responsibilities only:
- convert grid cell -> world rect / polygon
- draw highlight fill
- draw outline if desired
- optionally draw labels

Renderer must not:
- calculate measurement area
- infer shape logic
- infer distance rules

This keeps all rules in one system.

---

## Step 11: Add Persistence Rules

Persist only grid-anchored measurement state.

Recommended persisted model:

```ts
type StoredMeasurement = {
  id: string;
  gridKind: 'square' | 'hex';
  shape: 'line' | 'cone' | 'cube' | 'sphere' | 'cylinder';
  origin: { gx: number; gy: number };
  target?: { gx: number; gy: number };
  rangeFt: number;
  widthFt?: number;
  sizeFt?: number;
  includeOrigin?: boolean;
};
```

Do not persist:
- world-space cell polygons
- rendered vertices
- pixel bounds

Recompute highlighted cells from stored data whenever needed.

---

## Step 12: Add Validation Rules

Before generation:
- Reject missing target for line / cone
- Reject missing size for cube
- Reject non-positive range / size
- Clamp impossible values
- Return empty result on invalid request

After generation:
- Deduplicate cells
- Apply origin include / exclude
- Remove out-of-bounds cells if board limits exist

---

## Step 13: Suggested File Split

Recommended files:

- `measurement/MeasurementTypes.ts`
- `measurement/MeasurementDispatcher.ts`
- `measurement/square/SquareMeasurement.ts`
- `measurement/square/SquareCone.ts`
- `measurement/square/SquareLine.ts`
- `measurement/square/SquareArea.ts`
- `measurement/hex/HexMeasurement.ts`
- `measurement/hex/HexCone.ts`
- `measurement/hex/HexLine.ts`
- `measurement/hex/HexArea.ts`
- `measurement/utils/MeasurementUtils.ts`

Keep dispatcher thin.
Keep shape logic isolated.

---

## Step 14: Minimum Acceptance Criteria

Implementation is correct when:

- Same request always returns same cells
- Preview and placed measurements match exactly
- Square cone matches template behavior in the reference image
- Hex cone matches template behavior in the reference image
- Line lengths stop correctly at range
- Sphere / burst include origin
- Cone / line exclude origin by default
- Renderer has no shape-specific logic
- Stored measurements remain stable across pan / zoom / rerender

---

## Step 15: Coding Constraints

- Work entirely in grid coordinates
- Do not mix world and grid logic
- Centralize all generation in dispatcher + shape generators
- Keep board rendering dumb
- Match discrete D&D template behavior, not continuous geometry
- Prefer deterministic template logic over visually “accurate” freeform fill


## Step 16: HIGHLIGHT RULE (MANDATORY):

For any measurement shape:
- Return ONLY grid cells that are inside or enveloped by the shape
- A cell is considered inside if:
  - its center lies within the shape (default), OR
  - it overlaps the shape (if overlap mode enabled)

Do NOT:
- Approximate visually in renderer
- Skip partial cells inconsistently
- Mix inclusion rules per shape

All inclusion logic MUST happen inside shape generators.

Renderer MUST:
- Highlight exactly the returned cells
- Not infer or modify coverage

Use CENTER-POINT inclusion globally for consistency
---

## Final Instruction to Execute

Implement the unified measurement system with:
- one normalized request type
- one unified dispatcher
- one dispatcher per grid kind
- isolated square/hex shape generators
- centralized origin inclusion rules
- preview and persisted rendering both routed through the same dispatcher

Do not refactor unrelated board systems.
Do not change existing grid math outside measurement generation and rendering integration.
