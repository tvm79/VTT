import type { MeasurementPoint, DistanceResult, RectangleBounds, ConeResult, MeasurementShape } from './MeasurementTypes';

/**
 * Calculate Euclidean distance between two points
 */
export function calculateDistance(start: MeasurementPoint, end: MeasurementPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate distance in grid units
 */
export function calculateGridDistance(
  start: MeasurementPoint,
  end: MeasurementPoint,
  gridSize: number,
  squareValue: number
): DistanceResult {
  const pixels = calculateDistance(start, end);
  const squares = pixels / gridSize;
  const value = Math.round(squares) * squareValue;
  
  return {
    pixels,
    squares,
    value,
    unit: '',
  };
}

/**
 * Calculate distance and format for display
 */
export function formatDistance(
  start: MeasurementPoint,
  end: MeasurementPoint,
  gridSize: number,
  squareValue: number,
  gridUnit: 'ft' | 'km' | 'miles'
): string {
  const result = calculateGridDistance(start, end, gridSize, squareValue);
  return `${result.value} ${gridUnit}`;
}

/**
 * Calculate rectangle bounds from start and end points
 */
export function calculateRectangleBounds(start: MeasurementPoint, end: MeasurementPoint): RectangleBounds {
  const minX = Math.min(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxX = Math.max(start.x, end.x);
  const maxY = Math.max(start.y, end.y);
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Calculate width and height for rectangle display
 */
export function formatRectangleDistance(
  start: MeasurementPoint,
  end: MeasurementPoint,
  gridSize: number,
  squareValue: number,
  gridUnit: 'ft' | 'km' | 'miles'
): { width: string; height: string } {
  const bounds = calculateRectangleBounds(start, end);
  const widthSquares = bounds.width / gridSize;
  const heightSquares = bounds.height / gridSize;
  const widthValue = Math.round(widthSquares) * squareValue;
  const heightValue = Math.round(heightSquares) * squareValue;
  
  return {
    width: `${widthValue} ${gridUnit}`,
    height: `${heightValue} ${gridUnit}`,
  };
}

/**
 * Calculate direction angle from start to end point (in radians)
 */
export function calculateDirection(start: MeasurementPoint, end: MeasurementPoint): number {
  return Math.atan2(end.y - start.y, end.x - start.x);
}

/**
 * Calculate cone vertices from origin, direction, length, and angle
 */
export function calculateConeVertices(
  origin: MeasurementPoint,
  direction: number,
  length: number,
  angle: number = Math.PI / 3 // 60 degrees default
): MeasurementPoint[] {
  const halfAngle = angle / 2;
  
  // Calculate the two edge directions
  const leftAngle = direction - halfAngle;
  const rightAngle = direction + halfAngle;
  
  // Calculate the edge points
  const leftPoint: MeasurementPoint = {
    x: origin.x + Math.cos(leftAngle) * length,
    y: origin.y + Math.sin(leftAngle) * length,
  };
  
  const rightPoint: MeasurementPoint = {
    x: origin.x + Math.cos(rightAngle) * length,
    y: origin.y + Math.sin(rightAngle) * length,
  };
  
  return [origin, leftPoint, rightPoint];
}

/**
 * Calculate cone measurement data
 */
export function calculateCone(
  start: MeasurementPoint,
  end: MeasurementPoint,
  coneAngle: number = Math.PI / 3
): ConeResult {
  const direction = calculateDirection(start, end);
  const length = calculateDistance(start, end);
  
  return {
    origin: start,
    direction,
    length,
    angle: coneAngle,
    vertices: calculateConeVertices(start, direction, length, coneAngle),
  };
}

/**
 * Format cone distance for display
 */
export function formatConeDistance(
  start: MeasurementPoint,
  end: MeasurementPoint,
  gridSize: number,
  squareValue: number,
  gridUnit: 'ft' | 'km' | 'miles'
): string {
  const distance = calculateDistance(start, end);
  const squares = distance / gridSize;
  const value = Math.round(squares) * squareValue;
  return `${value} ${gridUnit}`;
}

/**
 * Calculate circle radius
 */
export function calculateCircleRadius(start: MeasurementPoint, end: MeasurementPoint): number {
  return calculateDistance(start, end);
}

/**
 * Format circle distance for display (radius)
 */
export function formatCircleDistance(
  start: MeasurementPoint,
  end: MeasurementPoint,
  gridSize: number,
  squareValue: number,
  gridUnit: 'ft' | 'km' | 'miles'
): string {
  const radius = calculateCircleRadius(start, end);
  const squares = radius / gridSize;
  const value = Math.round(squares) * squareValue;
  return `${value} ${gridUnit} radius`;
}

/**
 * Get midpoint between two points
 */
export function getMidpoint(start: MeasurementPoint, end: MeasurementPoint): MeasurementPoint {
  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };
}

/**
 * Generate unique measurement ID
 */
export function generateMeasurementId(): string {
  return `measurement_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Format measurement label based on shape
 */
export function formatMeasurementLabel(
  shape: MeasurementShape,
  start: MeasurementPoint,
  end: MeasurementPoint,
  gridSize: number,
  squareValue: number,
  gridUnit: 'ft' | 'km' | 'miles'
): { text: string; position: MeasurementPoint } {
  switch (shape) {
    case 'ray':
      return {
        text: formatDistance(start, end, gridSize, squareValue, gridUnit),
        position: getMidpoint(start, end),
      };
    case 'circle':
      return {
        text: formatCircleDistance(start, end, gridSize, squareValue, gridUnit),
        position: start,
      };
    case 'rectangle':
      const rect = formatRectangleDistance(start, end, gridSize, squareValue, gridUnit);
      const mid = getMidpoint(start, end);
      return {
        text: `${rect.width} × ${rect.height}`,
        position: mid,
      };
    case 'cone':
      return {
        text: formatConeDistance(start, end, gridSize, squareValue, gridUnit),
        position: getMidpoint(start, end),
      };
    default:
      return {
        text: formatDistance(start, end, gridSize, squareValue, gridUnit),
        position: getMidpoint(start, end),
      };
  }
}

/**
 * Snap point to grid
 */
export function snapToGrid(point: MeasurementPoint, gridSize: number): MeasurementPoint {
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  };
}

/**
 * Normalize point relative to board origin
 */
export function normalizeToBoard(
  point: MeasurementPoint,
  stagePosition: { x: number; y: number },
  stageScale: number
): MeasurementPoint {
  return {
    x: (point.x - stagePosition.x) / stageScale,
    y: (point.y - stagePosition.y) / stageScale,
  };
}
