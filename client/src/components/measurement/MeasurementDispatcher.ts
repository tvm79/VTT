import type { GridCell, MeasurementRequest, MeasurementResult, ShapeKind } from './MeasurementTypes';

type CubeCoord = {
  x: number;
  y: number;
  z: number;
};

const HEX_DIRECTIONS: CubeCoord[] = [
  { x: 1, y: -1, z: 0 },
  { x: 1, y: 0, z: -1 },
  { x: 0, y: 1, z: -1 },
  { x: -1, y: 1, z: 0 },
  { x: -1, y: 0, z: 1 },
  { x: 0, y: -1, z: 1 },
];

type NormalizedMeasurementInput = {
  request: MeasurementRequest;
  rangeCells: number;
  widthCells?: number;
  sizeCells?: number;
};

export function getMeasurementCells(request: MeasurementRequest): MeasurementResult {
  const rangeCells = feetToCells(request.rangeFt);
  const widthCells = request.widthFt === undefined ? undefined : feetToCells(request.widthFt);
  const sizeCells = request.sizeFt === undefined ? undefined : feetToCells(request.sizeFt);

  if (!isValidMeasurementRequest(request, rangeCells, sizeCells)) {
    return { cells: [] };
  }

  const normalized: NormalizedMeasurementInput = {
    request,
    rangeCells,
    widthCells,
    sizeCells,
  };

  const generated = request.gridKind === 'square'
    ? getSquareMeasurementCells(normalized)
    : getHexMeasurementCells(normalized);

  const includeOrigin = shouldIncludeOrigin(request.shape, request.includeOrigin);
  const withOriginRule = includeOrigin
    ? includeOriginIfNeeded(generated, request.origin, true)
    : excludeOrigin(generated, request.origin);

  return {
    cells: dedupeCells(withOriginRule),
  };
}

export function feetToCells(ft: number): number {
  if (!Number.isFinite(ft)) return 0;
  return Math.max(0, Math.floor(ft / 5));
}

export function dedupeCells(cells: GridCell[]): GridCell[] {
  const map = new Map<string, GridCell>();
  for (const cell of cells) {
    map.set(`${cell.gx},${cell.gy}`, cell);
  }
  return Array.from(map.values()).sort((a, b) => (a.gy - b.gy) || (a.gx - b.gx));
}

export function excludeOrigin(cells: GridCell[], origin: GridCell): GridCell[] {
  return cells.filter((cell) => cell.gx !== origin.gx || cell.gy !== origin.gy);
}

export function includeOriginIfNeeded(cells: GridCell[], origin: GridCell, includeOrigin: boolean): GridCell[] {
  if (!includeOrigin) return cells;
  return dedupeCells([origin, ...cells]);
}

export function shouldIncludeOrigin(shape: ShapeKind, override?: boolean): boolean {
  if (override !== undefined) {
    return override;
  }

  return shape === 'sphere' || shape === 'cylinder';
}

export function getDirectionSquare(origin: GridCell, target: GridCell): GridCell {
  return {
    gx: Math.sign(target.gx - origin.gx),
    gy: Math.sign(target.gy - origin.gy),
  };
}

export function getDirectionHex(origin: GridCell, target: GridCell): number {
  const originCube = offsetToCube(origin);
  const targetCube = offsetToCube(target);
  const delta = {
    x: targetCube.x - originCube.x,
    y: targetCube.y - originCube.y,
    z: targetCube.z - originCube.z,
  };

  let bestIndex = 0;
  let bestDot = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < HEX_DIRECTIONS.length; index += 1) {
    const direction = HEX_DIRECTIONS[index];
    const dot = (direction.x * delta.x) + (direction.y * delta.y) + (direction.z * delta.z);
    if (dot > bestDot) {
      bestDot = dot;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function isValidMeasurementRequest(request: MeasurementRequest, rangeCells: number, sizeCells?: number): boolean {
  if (!request.origin) return false;

  if ((request.shape === 'line' || request.shape === 'cone') && !request.target) {
    return false;
  }

  if (request.shape === 'cube') {
    return (sizeCells ?? 0) > 0;
  }

  return rangeCells > 0;
}

function getSquareMeasurementCells(input: NormalizedMeasurementInput): GridCell[] {
  const { request, rangeCells, widthCells, sizeCells } = input;

  switch (request.shape) {
    case 'sphere':
      return genSquareCircle(request.origin, rangeCells);
    case 'cylinder':
      return genSquareCircle(request.origin, rangeCells);
    case 'cube':
      return genSquareCube(request.origin, request.target ?? request.origin, sizeCells ?? 0);
    case 'line':
      return genSquareLine(request.origin, request.target!, rangeCells, Math.max(1, widthCells ?? 1));
    case 'cone':
      return genSquareCone(request.origin, request.target!, rangeCells);
  }
}

function getHexMeasurementCells(input: NormalizedMeasurementInput): GridCell[] {
  const { request, rangeCells, sizeCells } = input;

  switch (request.shape) {
    case 'sphere':
      return genHexArea(request.origin, rangeCells);
    case 'cylinder':
      return genHexArea(request.origin, rangeCells);
    case 'cube':
      return genHexArea(request.origin, Math.max(0, sizeCells ?? rangeCells));
    case 'line':
      return genHexLine(request.origin, request.target!, rangeCells);
    case 'cone':
      return genHexCone(request.origin, request.target!, rangeCells);
  }
}

function genSquareCircle(origin: GridCell, radius: number): GridCell[] {
  const cells: GridCell[] = [];

  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (isPointInCircle(dx, dy, radius)) {
        cells.push({ gx: origin.gx + dx, gy: origin.gy + dy });
      }
    }
  }

  return cells;
}

function genSquareCube(origin: GridCell, target: GridCell, sizeCells: number): GridCell[] {
  if (sizeCells <= 0) return [];

  const minX = Math.min(origin.gx, target.gx);
  const minY = Math.min(origin.gy, target.gy);
  const widthCells = Math.max(1, Math.abs(target.gx - origin.gx) + 1);
  const heightCells = Math.max(1, Math.abs(target.gy - origin.gy) + 1);
  const cells: GridCell[] = [];

  for (let y = 0; y < heightCells; y += 1) {
    for (let x = 0; x < widthCells; x += 1) {
      cells.push({ gx: minX + x, gy: minY + y });
    }
  }

  return cells;
}

function genSquareLine(origin: GridCell, target: GridCell, rangeCells: number, widthCells: number): GridCell[] {
  const baseLine = bresenhamLine(origin, target).slice(0, rangeCells + 1);
  if (baseLine.length === 0) return [];

  const perpendicular = getSquarePerpendicular(origin, target);
  const half = Math.floor((widthCells - 1) / 2);
  const extra = widthCells % 2 === 0 ? half + 1 : half;
  const cells: GridCell[] = [];

  for (const cell of baseLine) {
    for (let offset = -half; offset <= extra; offset += 1) {
      cells.push({
        gx: cell.gx + (perpendicular.gx * offset),
        gy: cell.gy + (perpendicular.gy * offset),
      });
    }
  }

  return cells;
}

function genSquareCone(origin: GridCell, target: GridCell, rangeCells: number): GridCell[] {
  const directionVector = getNormalizedDirection(origin, target);
  if (!directionVector) return [];

  const cells: GridCell[] = [];
  const coneSlope = 0.5;

  for (let dy = -rangeCells; dy <= rangeCells; dy += 1) {
    for (let dx = -rangeCells; dx <= rangeCells; dx += 1) {
      const forward = (dx * directionVector.x) + (dy * directionVector.y);
      if (forward <= 0 || forward > rangeCells) {
        continue;
      }

      const lateral = Math.abs((dx * directionVector.y) - (dy * directionVector.x));
      if (lateral <= forward * coneSlope) {
        cells.push({ gx: origin.gx + dx, gy: origin.gy + dy });
      }
    }
  }

  return cells;
}

function isPointInCircle(dx: number, dy: number, radius: number): boolean {
  return Math.hypot(dx, dy) <= radius;
}

function getNormalizedDirection(origin: GridCell, target: GridCell): { x: number; y: number } | null {
  const dx = target.gx - origin.gx;
  const dy = target.gy - origin.gy;
  const magnitude = Math.hypot(dx, dy);

  if (magnitude === 0) {
    return null;
  }

  return {
    x: dx / magnitude,
    y: dy / magnitude,
  };
}

function bresenhamLine(origin: GridCell, target: GridCell): GridCell[] {
  const cells: GridCell[] = [];
  let x0 = origin.gx;
  let y0 = origin.gy;
  const x1 = target.gx;
  const y1 = target.gy;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    cells.push({ gx: x0, gy: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }

  return cells;
}

function getSquarePerpendicular(origin: GridCell, target: GridCell): GridCell {
  const direction = getDirectionSquare(origin, target);
  if (direction.gx === 0) return { gx: 1, gy: 0 };
  if (direction.gy === 0) return { gx: 0, gy: 1 };
  return { gx: -direction.gy, gy: direction.gx };
}

function genHexArea(origin: GridCell, radius: number): GridCell[] {
  const originCube = offsetToCube(origin);
  const cells: GridCell[] = [];

  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dy = Math.max(-radius, -dx - radius); dy <= Math.min(radius, -dx + radius); dy += 1) {
      const dz = -dx - dy;
      cells.push(cubeToOffset({
        x: originCube.x + dx,
        y: originCube.y + dy,
        z: originCube.z + dz,
      }));
    }
  }

  return cells;
}

function genHexLine(origin: GridCell, target: GridCell, rangeCells: number): GridCell[] {
  const directionIndex = getDirectionHex(origin, target);
  const originCube = offsetToCube(origin);
  const step = HEX_DIRECTIONS[directionIndex];
  const cells: GridCell[] = [];

  for (let distance = 0; distance <= rangeCells; distance += 1) {
    cells.push(cubeToOffset({
      x: originCube.x + (step.x * distance),
      y: originCube.y + (step.y * distance),
      z: originCube.z + (step.z * distance),
    }));
  }

  return cells;
}

function genHexCone(origin: GridCell, target: GridCell, rangeCells: number): GridCell[] {
  const directionIndex = getDirectionHex(origin, target);
  const originCube = offsetToCube(origin);
  const forward = HEX_DIRECTIONS[directionIndex];
  const left = HEX_DIRECTIONS[(directionIndex + 5) % HEX_DIRECTIONS.length];
  const cells: GridCell[] = [];

  for (let ring = 1; ring <= rangeCells; ring += 1) {
    for (let offset = 0; offset <= ring; offset += 1) {
      const cube = {
        x: originCube.x + (forward.x * ring) + (left.x * offset),
        y: originCube.y + (forward.y * ring) + (left.y * offset),
        z: originCube.z + (forward.z * ring) + (left.z * offset),
      };
      cells.push(cubeToOffset(cube));
    }
  }

  return cells;
}

function offsetToCube(cell: GridCell): CubeCoord {
  const x = cell.gx - ((cell.gy - (cell.gy & 1)) / 2);
  const z = cell.gy;
  const y = -x - z;
  return { x, y, z };
}

function cubeToOffset(cube: CubeCoord): GridCell {
  return {
    gx: cube.x + ((cube.z - (cube.z & 1)) / 2),
    gy: cube.z,
  };
}
