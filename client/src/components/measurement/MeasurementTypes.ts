/**
 * Measurement shape types for the multi-shape measurement tool
 */
export type MeasurementShape = 'ray' | 'cone' | 'circle' | 'rectangle';

/**
 * Point coordinates
 */
export interface MeasurementPoint {
  x: number;
  y: number;
}

export type MeasurementAnchorKind = 'intersection' | 'cellCenter';

export interface MeasurementGridAnchor {
  gridX: number;
  gridY: number;
  kind: MeasurementAnchorKind;
}

/**
 * Measurement data structure
 */
export interface Measurement {
  id: string;
  shape: MeasurementShape;
  start: MeasurementPoint;
  end: MeasurementPoint;
  color: number;
  thickness: number;
  /** For cone shape, this stores the direction angle in radians */
  direction?: number;
  /** For cone shape, this stores the cone angle in radians (default: 60 degrees = Math.PI / 3) */
  coneAngle?: number;
}

export interface PersistedMeasurement {
  id: string;
  shape: MeasurementShape;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color: number;
  startAnchor?: MeasurementGridAnchor;
  endAnchor?: MeasurementGridAnchor;
}

/**
 * Measurement preview state
 */
export interface MeasurementPreview {
  shape: MeasurementShape;
  start: MeasurementPoint;
  end: MeasurementPoint;
  direction?: number;
  coneAngle?: number;
}

/**
 * Measurement label data for HTML overlay
 */
export interface MeasurementLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  color: number;
}

/**
 * Distance calculation result
 */
export interface DistanceResult {
  pixels: number;
  squares: number;
  value: number;
  unit: string;
}

/**
 * Rectangle bounds
 */
export interface RectangleBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Cone calculation result
 */
export interface ConeResult {
  origin: MeasurementPoint;
  direction: number;
  length: number;
  angle: number;
  vertices: MeasurementPoint[];
}
