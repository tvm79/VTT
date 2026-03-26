export type GridKind = 'square' | 'hex';

export type ShapeKind = 'line' | 'cone' | 'cube' | 'sphere' | 'cylinder';

export type MeasurementShape = ShapeKind;

export interface GridCell {
  gx: number;
  gy: number;
}

export interface MeasurementRequest {
  gridKind: GridKind;
  shape: ShapeKind;
  origin: GridCell;
  target?: GridCell;
  outlineTarget?: MeasurementPoint;
  rangeFt: number;
  widthFt?: number;
  sizeFt?: number;
  includeOrigin?: boolean;
}

export interface MeasurementResult {
  cells: GridCell[];
}

export interface StoredMeasurement {
  id: string;
  gridKind: GridKind;
  shape: ShapeKind;
  origin: GridCell;
  target?: GridCell;
  outlineTarget?: MeasurementPoint;
  rangeFt: number;
  widthFt?: number;
  sizeFt?: number;
  includeOrigin?: boolean;
  color: number;
}

export type PersistedMeasurement = StoredMeasurement;

export interface MeasurementPreview extends MeasurementRequest {
  color: number;
}

export interface MeasurementPoint {
  x: number;
  y: number;
}

export interface MeasurementLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  color: number;
}

export interface DistanceResult {
  pixels: number;
  squares: number;
  value: number;
  unit: string;
}

export interface MeasurementRenderCell {
  cell: GridCell;
  points: MeasurementPoint[];
}

export type MeasurementOutline =
  | { kind: 'line'; start: MeasurementPoint; end: MeasurementPoint }
  | { kind: 'polygon'; points: MeasurementPoint[] }
  | { kind: 'circle'; center: MeasurementPoint; radius: number };
