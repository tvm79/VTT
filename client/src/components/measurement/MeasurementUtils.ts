import type { GridCell, GridKind, MeasurementOutline, MeasurementPoint, MeasurementRequest } from './MeasurementTypes';

const SQRT3 = Math.sqrt(3);

export function generateMeasurementId(): string {
  return `measurement_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function gridCellToWorldCenter(
  cell: GridCell,
  gridSize: number,
  offsetX: number,
  offsetY: number,
  gridKind: GridKind,
): MeasurementPoint {
  if (gridKind === 'hex') {
    const x = 1.5 * cell.gx * gridSize;
    const y = (SQRT3 * (cell.gy + (cell.gx / 2))) * gridSize;
    return { x: x - offsetX, y: y - offsetY };
  }

  return {
    x: (cell.gx * gridSize) - offsetX + (gridSize / 2),
    y: (cell.gy * gridSize) - offsetY + (gridSize / 2),
  };
}

export function worldToGridCell(
  x: number,
  y: number,
  gridSize: number,
  offsetX: number,
  offsetY: number,
  gridKind: GridKind,
): GridCell {
  if (gridKind === 'hex') {
    return worldToHexCell(x, y, gridSize, offsetX, offsetY);
  }

  return {
    gx: Math.floor((x + offsetX) / gridSize),
    gy: Math.floor((y + offsetY) / gridSize),
  };
}

export function getCellPolygonPoints(
  cell: GridCell,
  gridSize: number,
  offsetX: number,
  offsetY: number,
  gridKind: GridKind,
): MeasurementPoint[] {
  if (gridKind === 'hex') {
    const center = gridCellToWorldCenter(cell, gridSize, offsetX, offsetY, gridKind);
    const radius = gridSize / 2;
    return [0, 1, 2, 3, 4, 5].map((index) => {
      const angle = (Math.PI / 3) * index;
      return {
        x: center.x + (Math.cos(angle) * radius),
        y: center.y + (Math.sin(angle) * radius),
      };
    });
  }

  const left = (cell.gx * gridSize) - offsetX;
  const top = (cell.gy * gridSize) - offsetY;
  return [
    { x: left, y: top },
    { x: left + gridSize, y: top },
    { x: left + gridSize, y: top + gridSize },
    { x: left, y: top + gridSize },
  ];
}

export function getMeasurementLabelPosition(
  origin: GridCell,
  target: GridCell | undefined,
  gridSize: number,
  offsetX: number,
  offsetY: number,
  gridKind: GridKind,
): MeasurementPoint {
  const start = gridCellToWorldCenter(origin, gridSize, offsetX, offsetY, gridKind);
  const end = target
    ? gridCellToWorldCenter(target, gridSize, offsetX, offsetY, gridKind)
    : start;

  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };
}

export function getMeasurementOutline(
  request: MeasurementRequest,
  gridSize: number,
  offsetX: number,
  offsetY: number,
): MeasurementOutline | null {
  const origin = gridCellToWorldCenter(request.origin, gridSize, offsetX, offsetY, request.gridKind);
  const target = request.outlineTarget ?? (request.target
    ? gridCellToWorldCenter(request.target, gridSize, offsetX, offsetY, request.gridKind)
    : origin);
  const rangePx = (request.rangeFt / 5) * gridSize;
  const sizePx = ((request.sizeFt ?? 0) / 5) * gridSize;

  switch (request.shape) {
    case 'line':
      return { kind: 'line', start: origin, end: target };
    case 'sphere':
    case 'cylinder':
      return { kind: 'circle', center: origin, radius: rangePx };
    case 'cube': {
      const minX = Math.min(origin.x, target.x);
      const minY = Math.min(origin.y, target.y);
      const maxX = Math.max(origin.x, target.x);
      const maxY = Math.max(origin.y, target.y);
      return {
        kind: 'polygon',
        points: [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
        ],
      };
    }
    case 'cone': {
      const dx = target.x - origin.x;
      const dy = target.y - origin.y;
      const angle = Math.atan2(dy, dx || 0.0001);
      const length = Math.max(1, Math.hypot(dx, dy));
      const spread = Math.atan((gridSize * 0.9) / length) + (request.gridKind === 'hex' ? 0.15 : 0.08);
      return {
        kind: 'polygon',
        points: [
          origin,
          { x: origin.x + Math.cos(angle - spread) * length, y: origin.y + Math.sin(angle - spread) * length },
          { x: origin.x + Math.cos(angle + spread) * length, y: origin.y + Math.sin(angle + spread) * length },
        ],
      };
    }
    default:
      return null;
  }
}

function worldToHexCell(
  x: number,
  y: number,
  gridSize: number,
  offsetX: number,
  offsetY: number,
): GridCell {
  const normalizedX = (x + offsetX) / gridSize;
  const normalizedY = (y + offsetY) / gridSize;

  const axialQ = (2 / 3) * normalizedX;
  const axialR = normalizedY / SQRT3 - (normalizedX / 3);
  const cube = cubeRound({ x: axialQ, y: -axialQ - axialR, z: axialR });

  return {
    gx: cube.x,
    gy: cube.z,
  };
}

function cubeRound(cube: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  let rx = Math.round(cube.x);
  let ry = Math.round(cube.y);
  let rz = Math.round(cube.z);

  const xDiff = Math.abs(rx - cube.x);
  const yDiff = Math.abs(ry - cube.y);
  const zDiff = Math.abs(rz - cube.z);

  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return { x: rx, y: ry, z: rz };
}
