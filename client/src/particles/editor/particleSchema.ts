export type ParticleEventType =
  | 'token_move'
  | 'token_stop'
  | 'token_attack'
  | 'token_hit'
  | 'token_crit'
  | 'token_heal'
  | 'token_die'
  | 'spell_cast'
  | 'spell_impact'
  | 'buff_apply'
  | 'debuff_apply'
  | 'aura_tick'
  | 'manual';

export type SpawnShape = 'point' | 'circle' | 'cone' | 'ring' | 'box' | 'line';
export type EmissionMode = 'burst' | 'continuous';
export type BlendModeSimple = 'normal' | 'add' | 'screen';
export type AttachMode = 'world' | 'follow-token';
export type PresetCategory = 'combat' | 'movement' | 'magic' | 'status' | 'utility';
export type SortGroup = 'below-token' | 'at-token' | 'above-token' | 'overlay';
export type ParticleSizeUnit = 'px' | 'grid';

export interface ParticleCurvePoint {
  t: number;
  v: number;
}

export interface ParticleCurve {
  enabled: boolean;
  points: ParticleCurvePoint[];
}

export interface ParticleGradientStop {
  t: number;
  color: string;
  alpha: number;
}

export interface ParticleBinding {
  id: string;
  event: ParticleEventType;
  anchor: 'source' | 'target' | 'path' | 'impact';
  throttleMs?: number;
}

export interface ParticlePreset {
  id: string;
  name: string;
  category: PresetCategory;
  texture: string;
  blendMode: BlendModeSimple;
  emissionMode: EmissionMode;
  maxParticles: number;
  emitRate: number;
  burstCount: number;
  durationMs: number;
  cooldownMs: number;
  lifetimeMinMs: number;
  lifetimeMaxMs: number;
  startSize: number;
  endSize: number;
  sizeUnit?: ParticleSizeUnit;
  startAlpha: number;
  endAlpha: number;
  startColor: string;
  endColor: string;
  gradientStops?: ParticleGradientStop[];
  sizeCurve?: ParticleCurve;
  alphaCurve?: ParticleCurve;
  rotationSpeedCurve?: ParticleCurve;
  velocityCurve?: ParticleCurve;
  colorIntensityCurve?: ParticleCurve;
  speedMin: number;
  speedMax: number;
  directionDeg: number;
  spreadDeg: number;
  startRotationMinDeg?: number;
  startRotationMaxDeg?: number;
  rotationSpeedMinDegPerSec?: number;
  rotationSpeedMaxDegPerSec?: number;
  gravityX: number;
  gravityY: number;
  drag: number;
  spawnShape: SpawnShape;
  spawnRadius: number;
  spawnWidth: number;
  spawnHeight: number;
  coneAngleDeg: number;
  attachMode: AttachMode;
  sortGroup: SortGroup;
  zIndex: number;
  bindings: ParticleBinding[];
}

export interface ParticleTrigger {
  event: ParticleEventType;
  sourceTokenId?: string;
  targetTokenId?: string;
  x?: number;
  y?: number;
  path?: { x: number; y: number }[];
}

export interface ParticlePlayPayload {
  sourceTokenId?: string;
  targetTokenId?: string;
  x?: number;
  y?: number;
  path?: { x: number; y: number }[];
  overrides?: Partial<ParticlePreset>;
}
