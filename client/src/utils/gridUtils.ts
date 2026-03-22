/**
 * Grid Utilities - Unified grid snapping that matches the shader grid
 * 
 * The shader (GridOverlay) calculates grid coordinates as:
 *   world = (screen / uZoom) + uCamera + uGridOffset
 *   gridCoord = world / uGridSize
 *   Grid lines are at integer gridCoord values (world = n * gridSize)
 * 
 * This utility provides functions to snap positions to the same grid
 * used by the visual shader.
 */

export type GridType = 'square' | 'hex';

export interface GridConfig {
  gridSize: number;
  gridOffsetX: number;
  gridOffsetY: number;
}

const SQRT3 = Math.sqrt(3);

function pixelToAxial(point: { x: number; y: number }): { q: number; r: number } {
  return {
    q: (point.x * SQRT3) / 3 - point.y / 3,
    r: (point.y * 2) / 3,
  };
}

function axialToCube(axial: { q: number; r: number }): { x: number; y: number; z: number } {
  return {
    x: axial.q,
    y: -axial.q - axial.r,
    z: axial.r,
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

function cubeToAxial(cube: { x: number; y: number; z: number }): { q: number; r: number } {
  return {
    q: cube.x,
    r: cube.z,
  };
}

function axialToPixel(axial: { q: number; r: number }): { x: number; y: number } {
  return {
    x: SQRT3 * (axial.q + axial.r / 2),
    y: 1.5 * axial.r,
  };
}

function snapToHexCellCenter(
  x: number,
  y: number,
  gridSize: number,
  offsetX: number = 0,
  offsetY: number = 0
): { x: number; y: number } {
  if (gridSize <= 0) return { x, y };

  const normalized = {
    x: (x + offsetX) / gridSize,
    y: (y + offsetY) / gridSize,
  };
  const axial = pixelToAxial(normalized);
  const rounded = cubeRound(axialToCube(axial));
  const center = axialToPixel(cubeToAxial(rounded));

  return {
    x: center.x * gridSize - offsetX,
    y: center.y * gridSize - offsetY,
  };
}

/**
 * Get the effective grid config - combines store values with board defaults
 */
export function getEffectiveGridConfig(
  gridSize: number | undefined,
  boardGridSize: number | undefined,
  gridOffsetX: number | undefined,
  gridOffsetY: number | undefined
): GridConfig {
  return {
    gridSize: gridSize ?? boardGridSize ?? 50,
    gridOffsetX: gridOffsetX ?? 0,
    gridOffsetY: gridOffsetY ?? 0,
  };
}

/**
 * Snap a position to the nearest grid INTERSECTION (grid lines)
 * 
 * This matches the shader's grid line calculation:
 * Grid lines are at: world = n * gridSize (for any integer n)
 * 
 * @param x - The x coordinate in local/stage space
 * @param y - The y coordinate in local/stage space
 * @param gridSize - The grid cell size in pixels
 * @param offsetX - The grid offset in X direction
 * @param offsetY - The grid offset in Y direction
 * @returns Snapped position at grid intersection
 */
export function snapToGridIntersection(
  x: number,
  y: number,
  gridSize: number,
  offsetX: number = 0,
  offsetY: number = 0,
  gridType: GridType = 'square'
): { x: number; y: number } {
  if (gridSize <= 0) return { x, y };

  if (gridType === 'hex') {
    return snapToHexCellCenter(x, y, gridSize, offsetX, offsetY);
  }
  
  // The shader adds offset: world = local + offset
  // Grid lines at: world = n * gridSize
  // So: local + offset = n * gridSize
  // local = n * gridSize - offset
  const snappedX = Math.round((x + offsetX) / gridSize) * gridSize - offsetX;
  const snappedY = Math.round((y + offsetY) / gridSize) * gridSize - offsetY;
  
  return { x: snappedX, y: snappedY };
}

/**
 * Snap a position to the CENTER of a grid cell
 * 
 * Cell centers are at: world = (n + 0.5) * gridSize
 * 
 * @param x - The x coordinate in local/stage space
 * @param y - The y coordinate in local/stage space
 * @param gridSize - The grid cell size in pixels
 * @param offsetX - The grid offset in X direction
 * @param offsetY - The grid offset in Y direction
 * @returns Snapped position at cell center
 */
export function snapToGridCellCenter(
  x: number,
  y: number,
  gridSize: number,
  offsetX: number = 0,
  offsetY: number = 0,
  gridType: GridType = 'square'
): { x: number; y: number } {
  if (gridSize <= 0) return { x, y };

  if (gridType === 'hex') {
    return snapToHexCellCenter(x, y, gridSize, offsetX, offsetY);
  }
  
  // Cell center: world = (n + 0.5) * gridSize
  // local + offset = (n + 0.5) * gridSize
  // local = (n + 0.5) * gridSize - offset
  const snappedX = Math.floor((x + offsetX) / gridSize) * gridSize - offsetX + gridSize / 2;
  const snappedY = Math.floor((y + offsetY) / gridSize) * gridSize - offsetY + gridSize / 2;
  
  return { x: snappedX, y: snappedY };
}

/**
 * Snap a position to the grid based on token footprint
 * 
 * Odd-sized tokens (1x1, 3x3, etc.): center snaps to CELL CENTER
 * Even-sized tokens (2x2, 4x4, etc.): center snaps to GRID INTERSECTION
 * 
 * This ensures tokens always occupy exactly their designated grid cells:
 * - 1x1 token: occupies the single cell centered on the cell center
 * - 2x2 token: occupies 4 cells with corners at grid intersections
 * 
 * @param x - The center x coordinate in local/stage space
 * @param y - The center y coordinate in local/stage space
 * @param tokenFootprint - The token size (1 for 1x1, 2 for 2x2, etc.)
 * @param gridSize - The grid cell size in pixels
 * @param offsetX - The grid offset in X direction
 * @param offsetY - The grid offset in Y direction
 * @returns Snapped center position
 */
export function snapTokenToGrid(
  x: number,
  y: number,
  tokenFootprint: number,
  gridSize: number,
  offsetX: number = 0,
  offsetY: number = 0,
  gridType: GridType = 'square'
): { x: number; y: number } {
  if (gridSize <= 0) return { x, y };

  if (gridType === 'hex') {
    return snapToHexCellCenter(x, y, gridSize, offsetX, offsetY);
  }
  
  // Even footprint: snap to grid intersection
  // Odd footprint: snap to cell center
  const isEvenFootprint = tokenFootprint % 2 === 0;
  
  if (isEvenFootprint) {
    return snapToGridIntersection(x, y, gridSize, offsetX, offsetY);
  } else {
    return snapToGridCellCenter(x, y, gridSize, offsetX, offsetY);
  }
}

/**
 * Calculate the top-left position for a token given its center snapped position
 * 
 * @param centerX - The snapped center x coordinate
 * @param centerY - The snapped center y coordinate  
 * @param tokenFootprint - The token size (1 for 1x1, 2 for 2x2, etc.)
 * @param gridSize - The grid cell size in pixels
 * @returns Top-left position for the token sprite
 */
export function getTokenTopLeftFromCenter(
  centerX: number,
  centerY: number,
  tokenFootprint: number,
  gridSize: number
): { x: number; y: number } {
  const tokenSize = tokenFootprint * gridSize;
  return {
    x: centerX - tokenSize / 2,
    y: centerY - tokenSize / 2,
  };
}

/**
 * Convert a top-left token position to its center position
 * 
 * @param topLeftX - The top-left x coordinate
 * @param topLeftY - The top-left y coordinate
 * @param tokenFootprint - The token size (1 for 1x1, 2 for 2x2, etc.)
 * @param gridSize - The grid cell size in pixels
 * @returns Center position of the token
 */
export function getTokenCenterFromTopLeft(
  topLeftX: number,
  topLeftY: number,
  tokenFootprint: number,
  gridSize: number
): { x: number; y: number } {
  const tokenSize = tokenFootprint * gridSize;
  return {
    x: topLeftX + tokenSize / 2,
    y: topLeftY + tokenSize / 2,
  };
}
