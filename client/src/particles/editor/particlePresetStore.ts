import type { ParticleCurve, ParticleCurvePoint, ParticleGradientStop, ParticlePreset } from './particleSchema';

const STORAGE_KEY = 'vtt-particle-presets-v1';

const DEFAULT_PRESETS: ParticlePreset[] = [
  {
    id: 'BloodHit',
    name: 'Blood Hit',
    category: 'combat',
    texture: 'soft_circle',
    blendMode: 'normal',
    emissionMode: 'burst',
    maxParticles: 80,
    emitRate: 0,
    burstCount: 24,
    durationMs: 0,
    cooldownMs: 120,
    lifetimeMinMs: 380,
    lifetimeMaxMs: 760,
    startSize: 10,
    endSize: 26,
    startAlpha: 0.9,
    endAlpha: 0,
    startColor: '#a60000',
    endColor: '#2a0000',
    speedMin: 30,
    speedMax: 120,
    directionDeg: 0,
    spreadDeg: 360,
    gravityX: 0,
    gravityY: 30,
    drag: 0.15,
    spawnShape: 'circle',
    spawnRadius: 10,
    spawnWidth: 0,
    spawnHeight: 0,
    coneAngleDeg: 0,
    attachMode: 'world',
    sortGroup: 'at-token',
    zIndex: 0,
    bindings: [
      { id: 'blood-hit', event: 'token_hit', anchor: 'target', throttleMs: 80 },
    ],
  },
  {
    id: 'HolyHeal',
    name: 'Holy Heal',
    category: 'combat',
    texture: 'spark',
    blendMode: 'add',
    emissionMode: 'burst',
    maxParticles: 90,
    emitRate: 0,
    burstCount: 28,
    durationMs: 0,
    cooldownMs: 120,
    lifetimeMinMs: 420,
    lifetimeMaxMs: 900,
    startSize: 10,
    endSize: 22,
    startAlpha: 0.9,
    endAlpha: 0,
    startColor: '#7dff9d',
    endColor: '#1affc3',
    speedMin: 20,
    speedMax: 110,
    directionDeg: -90,
    spreadDeg: 140,
    gravityX: 0,
    gravityY: -15,
    drag: 0.08,
    spawnShape: 'circle',
    spawnRadius: 10,
    spawnWidth: 0,
    spawnHeight: 0,
    coneAngleDeg: 0,
    attachMode: 'world',
    sortGroup: 'at-token',
    zIndex: 1,
    bindings: [
      { id: 'holy-heal', event: 'token_heal', anchor: 'target', throttleMs: 100 },
    ],
  },
  {
    id: 'CritSpark',
    name: 'Crit Spark',
    category: 'combat',
    texture: 'spark',
    blendMode: 'add',
    emissionMode: 'burst',
    maxParticles: 120,
    emitRate: 0,
    burstCount: 40,
    durationMs: 0,
    cooldownMs: 160,
    lifetimeMinMs: 200,
    lifetimeMaxMs: 520,
    startSize: 8,
    endSize: 16,
    startAlpha: 1,
    endAlpha: 0,
    startColor: '#fff3b0',
    endColor: '#ff6a00',
    speedMin: 80,
    speedMax: 180,
    directionDeg: 0,
    spreadDeg: 360,
    gravityX: 0,
    gravityY: 40,
    drag: 0.12,
    spawnShape: 'circle',
    spawnRadius: 10,
    spawnWidth: 0,
    spawnHeight: 0,
    coneAngleDeg: 0,
    attachMode: 'world',
    sortGroup: 'above-token',
    zIndex: 2,
    bindings: [
      { id: 'crit-spark', event: 'token_crit', anchor: 'target', throttleMs: 120 },
    ],
  },
  {
    id: 'DeathSmoke',
    name: 'Death Smoke',
    category: 'combat',
    texture: 'smoke',
    blendMode: 'normal',
    emissionMode: 'burst',
    maxParticles: 140,
    emitRate: 0,
    burstCount: 36,
    durationMs: 0,
    cooldownMs: 400,
    lifetimeMinMs: 1200,
    lifetimeMaxMs: 2200,
    startSize: 20,
    endSize: 70,
    startAlpha: 0.7,
    endAlpha: 0,
    startColor: '#4c4c4c',
    endColor: '#111111',
    speedMin: 10,
    speedMax: 40,
    directionDeg: -90,
    spreadDeg: 180,
    gravityX: 0,
    gravityY: -10,
    drag: 0.2,
    spawnShape: 'circle',
    spawnRadius: 10,
    spawnWidth: 0,
    spawnHeight: 0,
    coneAngleDeg: 0,
    attachMode: 'world',
    sortGroup: 'above-token',
    zIndex: 0,
    bindings: [
      { id: 'death-smoke', event: 'token_die', anchor: 'target', throttleMs: 400 },
    ],
  },
  {
    id: 'DustStep',
    name: 'Dust Step',
    category: 'movement',
    texture: 'soft_circle',
    blendMode: 'normal',
    emissionMode: 'burst',
    maxParticles: 80,
    emitRate: 0,
    burstCount: 12,
    durationMs: 0,
    cooldownMs: 120,
    lifetimeMinMs: 320,
    lifetimeMaxMs: 680,
    startSize: 8,
    endSize: 22,
    startAlpha: 0.5,
    endAlpha: 0,
    startColor: '#c7b299',
    endColor: '#6b5a4a',
    speedMin: 10,
    speedMax: 50,
    directionDeg: 180,
    spreadDeg: 120,
    gravityX: 0,
    gravityY: 20,
    drag: 0.18,
    spawnShape: 'circle',
    spawnRadius: 10,
    spawnWidth: 0,
    spawnHeight: 0,
    coneAngleDeg: 0,
    attachMode: 'world',
    sortGroup: 'below-token',
    zIndex: 0,
    bindings: [
      { id: 'dust-step', event: 'token_move', anchor: 'path', throttleMs: 120 },
    ],
  },
  {
    id: 'GhostTrail',
    name: 'Ghost Trail',
    category: 'movement',
    texture: 'soft_circle',
    blendMode: 'screen',
    emissionMode: 'continuous',
    maxParticles: 120,
    emitRate: 22,
    burstCount: 0,
    durationMs: 900,
    cooldownMs: 180,
    lifetimeMinMs: 500,
    lifetimeMaxMs: 1100,
    startSize: 12,
    endSize: 36,
    startAlpha: 0.5,
    endAlpha: 0,
    startColor: '#88d7ff',
    endColor: '#1b3b5a',
    speedMin: 5,
    speedMax: 25,
    directionDeg: 0,
    spreadDeg: 180,
    gravityX: 0,
    gravityY: 0,
    drag: 0.12,
    spawnShape: 'point',
    spawnRadius: 0,
    spawnWidth: 0,
    spawnHeight: 0,
    coneAngleDeg: 0,
    attachMode: 'follow-token',
    sortGroup: 'below-token',
    zIndex: 0,
    bindings: [
      { id: 'ghost-trail', event: 'token_stop', anchor: 'source', throttleMs: 240 },
    ],
  },
  {
    id: 'FireCast',
    name: 'Fire Cast',
    category: 'magic',
    texture: 'ember',
    blendMode: 'add',
    emissionMode: 'burst',
    maxParticles: 110,
    emitRate: 0,
    burstCount: 32,
    durationMs: 0,
    cooldownMs: 180,
    lifetimeMinMs: 350,
    lifetimeMaxMs: 900,
    startSize: 10,
    endSize: 24,
    startAlpha: 0.9,
    endAlpha: 0,
    startColor: '#ff9d3c',
    endColor: '#ff2f00',
    speedMin: 30,
    speedMax: 140,
    directionDeg: -90,
    spreadDeg: 120,
    gravityX: 0,
    gravityY: -20,
    drag: 0.1,
    spawnShape: 'circle',
    spawnRadius: 10,
    spawnWidth: 0,
    spawnHeight: 0,
    coneAngleDeg: 0,
    attachMode: 'world',
    sortGroup: 'above-token',
    zIndex: 1,
    bindings: [
      { id: 'fire-cast', event: 'spell_cast', anchor: 'source', throttleMs: 160 },
    ],
  },
  {
    id: 'FrostImpact',
    name: 'Frost Impact',
    category: 'magic',
    texture: 'spark',
    blendMode: 'screen',
    emissionMode: 'burst',
    maxParticles: 100,
    emitRate: 0,
    burstCount: 26,
    durationMs: 0,
    cooldownMs: 200,
    lifetimeMinMs: 450,
    lifetimeMaxMs: 900,
    startSize: 10,
    endSize: 26,
    startAlpha: 0.8,
    endAlpha: 0,
    startColor: '#b6f2ff',
    endColor: '#3aa3ff',
    speedMin: 30,
    speedMax: 120,
    directionDeg: 0,
    spreadDeg: 360,
    gravityX: 0,
    gravityY: 20,
    drag: 0.12,
    spawnShape: 'circle',
    spawnRadius: 10,
    spawnWidth: 0,
    spawnHeight: 0,
    coneAngleDeg: 0,
    attachMode: 'world',
    sortGroup: 'above-token',
    zIndex: 1,
    bindings: [
      { id: 'frost-impact', event: 'spell_impact', anchor: 'impact', throttleMs: 200 },
    ],
  },
  {
    id: 'ArcaneBurst',
    name: 'Arcane Burst',
    category: 'magic',
    texture: 'ring',
    blendMode: 'add',
    emissionMode: 'burst',
    maxParticles: 90,
    emitRate: 0,
    burstCount: 14,
    durationMs: 0,
    cooldownMs: 220,
    lifetimeMinMs: 520,
    lifetimeMaxMs: 900,
    startSize: 14,
    endSize: 40,
    startAlpha: 0.7,
    endAlpha: 0,
    startColor: '#b08cff',
    endColor: '#4b1fff',
    speedMin: 10,
    speedMax: 40,
    directionDeg: 0,
    spreadDeg: 360,
    gravityX: 0,
    gravityY: 0,
    drag: 0.2,
    spawnShape: 'ring',
    spawnRadius: 16,
    spawnWidth: 0,
    spawnHeight: 0,
    coneAngleDeg: 0,
    attachMode: 'world',
    sortGroup: 'above-token',
    zIndex: 1,
    bindings: [
      { id: 'arcane-burst', event: 'spell_impact', anchor: 'impact', throttleMs: 220 },
    ],
  },
  {
    id: 'BlessAura',
    name: 'Bless Aura',
    category: 'status',
    texture: 'soft_circle',
    blendMode: 'screen',
    emissionMode: 'continuous',
    maxParticles: 140,
    emitRate: 18,
    burstCount: 0,
    durationMs: 0,
    cooldownMs: 0,
    lifetimeMinMs: 900,
    lifetimeMaxMs: 1600,
    startSize: 14,
    endSize: 34,
    startAlpha: 0.5,
    endAlpha: 0,
    startColor: '#fff3a1',
    endColor: '#ffd966',
    speedMin: 5,
    speedMax: 25,
    directionDeg: 0,
    spreadDeg: 360,
    gravityX: 0,
    gravityY: -10,
    drag: 0.12,
    spawnShape: 'circle',
    spawnRadius: 10,
    spawnWidth: 0,
    spawnHeight: 0,
    coneAngleDeg: 0,
    attachMode: 'follow-token',
    sortGroup: 'at-token',
    zIndex: 0,
    bindings: [
      { id: 'bless-aura', event: 'buff_apply', anchor: 'target', throttleMs: 400 },
      { id: 'bless-aura-tick', event: 'aura_tick', anchor: 'source', throttleMs: 800 },
    ],
  },
  {
    id: 'BurningEmber',
    name: 'Burning Ember',
    category: 'status',
    texture: 'ember',
    blendMode: 'add',
    emissionMode: 'continuous',
    maxParticles: 120,
    emitRate: 16,
    burstCount: 0,
    durationMs: 0,
    cooldownMs: 0,
    lifetimeMinMs: 800,
    lifetimeMaxMs: 1400,
    startSize: 8,
    endSize: 20,
    startAlpha: 0.7,
    endAlpha: 0,
    startColor: '#ff8c2a',
    endColor: '#c42100',
    speedMin: 5,
    speedMax: 40,
    directionDeg: -90,
    spreadDeg: 60,
    gravityX: 0,
    gravityY: -15,
    drag: 0.1,
    spawnShape: 'circle',
    spawnRadius: 10,
    spawnWidth: 0,
    spawnHeight: 0,
    coneAngleDeg: 0,
    attachMode: 'follow-token',
    sortGroup: 'above-token',
    zIndex: 0,
    bindings: [
      { id: 'burning-ember', event: 'debuff_apply', anchor: 'target', throttleMs: 400 },
    ],
  },
  {
    id: 'WeatherRain',
    name: 'Weather Rain',
    category: 'utility',
    texture: 'spark',
    blendMode: 'normal',
    emissionMode: 'continuous',
    maxParticles: 240,
    emitRate: 80,
    burstCount: 0,
    durationMs: 0,
    cooldownMs: 0,
    lifetimeMinMs: 800,
    lifetimeMaxMs: 1400,
    startSize: 6,
    endSize: 10,
    startAlpha: 0.5,
    endAlpha: 0,
    startColor: '#8cc9ff',
    endColor: '#4b83b8',
    speedMin: 120,
    speedMax: 220,
    directionDeg: 90,
    spreadDeg: 20,
    gravityX: 0,
    gravityY: 200,
    drag: 0.05,
    spawnShape: 'circle',
    spawnRadius: 10,
    spawnWidth: 0,
    spawnHeight: 0,
    coneAngleDeg: 0,
    attachMode: 'world',
    sortGroup: 'overlay',
    zIndex: 0,
    bindings: [],
  },
  {
    id: 'WeatherSnow',
    name: 'Weather Snow',
    category: 'utility',
    texture: 'soft_circle',
    blendMode: 'normal',
    emissionMode: 'continuous',
    maxParticles: 240,
    emitRate: 40,
    burstCount: 0,
    durationMs: 0,
    cooldownMs: 0,
    lifetimeMinMs: 1400,
    lifetimeMaxMs: 2400,
    startSize: 8,
    endSize: 14,
    startAlpha: 0.7,
    endAlpha: 0,
    startColor: '#ffffff',
    endColor: '#d9f1ff',
    speedMin: 20,
    speedMax: 60,
    directionDeg: 90,
    spreadDeg: 60,
    gravityX: 0,
    gravityY: 20,
    drag: 0.02,
    spawnShape: 'circle',
    spawnRadius: 10,
    spawnWidth: 0,
    spawnHeight: 0,
    coneAngleDeg: 0,
    attachMode: 'world',
    sortGroup: 'overlay',
    zIndex: 0,
    bindings: [],
  },
  {
    id: 'WeatherFog',
    name: 'Weather Fog',
    category: 'utility',
    texture: 'smoke',
    blendMode: 'screen',
    emissionMode: 'continuous',
    maxParticles: 12,
    emitRate: 3,
    burstCount: 0,
    durationMs: 0,
    cooldownMs: 0,
    lifetimeMinMs: 19,
    lifetimeMaxMs: 30,
    startSize: 19,
    endSize: 40,
    startAlpha: 0.0,
    endAlpha: 0,
    startColor: '#c8d5e0',
    endColor: '#405060',
    speedMin: 0,
    speedMax: 0,
    directionDeg: 0,
    spreadDeg: 360,
    gravityX: 0,
    gravityY: 0,
    drag: 0.04,
    spawnShape: 'circle',
    spawnRadius: 10,
    spawnWidth: 0,
    spawnHeight: 0,
    coneAngleDeg: 0,
    attachMode: 'world',
    sortGroup: 'overlay',
    zIndex: 0,
    bindings: [],
  },
  {
    id: 'WeatherClouds',
    name: 'Weather Clouds',
    category: 'utility',
    texture: 'smoke',
    blendMode: 'screen',
    emissionMode: 'continuous',
    maxParticles: 6,
    emitRate: 6,
    burstCount: 0,
    durationMs: 0,
    cooldownMs: 0,
    lifetimeMinMs: 16,
    lifetimeMaxMs: 25,
    startSize: 16,
    endSize: 35,
    startAlpha: 0.2,
    endAlpha: 0,
    startColor: '#ffffff',
    endColor: '#92a1ad',
    speedMin: 20,
    speedMax: 30,
    directionDeg: 360,
    spreadDeg: 360,
    gravityX: 0,
    gravityY: 0,
    drag: 0.03,
    spawnShape: 'circle',
    spawnRadius: 10,
    spawnWidth: 0,
    spawnHeight: 0,
    coneAngleDeg: 0,
    attachMode: 'world',
    sortGroup: 'overlay',
    zIndex: 0,
    bindings: [],
  },
  {
    id: 'WeatherFireflies',
    name: 'Weather Fireflies',
    category: 'utility',
    texture: 'spark',
    blendMode: 'add',
    emissionMode: 'continuous',
    maxParticles: 120,
    emitRate: 18,
    burstCount: 0,
    durationMs: 0,
    cooldownMs: 0,
    lifetimeMinMs: 1600,
    lifetimeMaxMs: 2600,
    startSize: 6,
    endSize: 10,
    startAlpha: 0.7,
    endAlpha: 0,
    startColor: '#fff7a1',
    endColor: '#88ff7a',
    speedMin: 6,
    speedMax: 24,
    directionDeg: 0,
    spreadDeg: 360,
    gravityX: 0,
    gravityY: 0,
    drag: 0.08,
    spawnShape: 'circle',
    spawnRadius: 10,
    spawnWidth: 0,
    spawnHeight: 0,
    coneAngleDeg: 0,
    attachMode: 'world',
    sortGroup: 'overlay',
    zIndex: 0,
    bindings: [],
  },
  {
    id: 'WeatherEmbers',
    name: 'Weather Embers',
    category: 'utility',
    texture: 'ember',
    blendMode: 'add',
    emissionMode: 'continuous',
    maxParticles: 160,
    emitRate: 24,
    burstCount: 0,
    durationMs: 0,
    cooldownMs: 0,
    lifetimeMinMs: 1400,
    lifetimeMaxMs: 2200,
    startSize: 8,
    endSize: 18,
    startAlpha: 0.8,
    endAlpha: 0,
    startColor: '#ffb066',
    endColor: '#ff4400',
    speedMin: 10,
    speedMax: 40,
    directionDeg: -90,
    spreadDeg: 40,
    gravityX: 0,
    gravityY: -20,
    drag: 0.06,
    spawnShape: 'circle',
    spawnRadius: 10,
    spawnWidth: 0,
    spawnHeight: 0,
    coneAngleDeg: 0,
    attachMode: 'world',
    sortGroup: 'overlay',
    zIndex: 0,
    bindings: [],
  },
  {
    id: 'WeatherSparkles',
    name: 'Weather Sparkles',
    category: 'utility',
    texture: 'spark',
    blendMode: 'add',
    emissionMode: 'continuous',
    maxParticles: 140,
    emitRate: 20,
    burstCount: 0,
    durationMs: 0,
    cooldownMs: 0,
    lifetimeMinMs: 900,
    lifetimeMaxMs: 1600,
    startSize: 8,
    endSize: 16,
    startAlpha: 0.8,
    endAlpha: 0,
    startColor: '#ffffff',
    endColor: '#ffd2ff',
    speedMin: 10,
    speedMax: 40,
    directionDeg: 0,
    spreadDeg: 360,
    gravityX: 0,
    gravityY: 0,
    drag: 0.08,
    spawnShape: 'circle',
    spawnRadius: 10,
    spawnWidth: 0,
    spawnHeight: 0,
    coneAngleDeg: 0,
    attachMode: 'world',
    sortGroup: 'overlay',
    zIndex: 0,
    bindings: [],
  },
  {
    id: 'WeatherBlizzard',
    name: 'Weather Blizzard',
    category: 'utility',
    texture: 'soft_circle',
    blendMode: 'screen',
    emissionMode: 'continuous',
    maxParticles: 260,
    emitRate: 70,
    burstCount: 0,
    durationMs: 0,
    cooldownMs: 0,
    lifetimeMinMs: 900,
    lifetimeMaxMs: 1600,
    startSize: 8,
    endSize: 14,
    startAlpha: 0.6,
    endAlpha: 0,
    startColor: '#ffffff',
    endColor: '#c9e7ff',
    speedMin: 80,
    speedMax: 160,
    directionDeg: 110,
    spreadDeg: 40,
    gravityX: 40,
    gravityY: 80,
    drag: 0.04,
    spawnShape: 'circle',
    spawnRadius: 10,
    spawnWidth: 0,
    spawnHeight: 0,
    coneAngleDeg: 0,
    attachMode: 'world',
    sortGroup: 'overlay',
    zIndex: 0,
    bindings: [],
  },
];

let presetsCache: ParticlePreset[] | null = null;
const listeners = new Set<() => void>();

function clonePresets(presets: ParticlePreset[]): ParticlePreset[] {
  return presets.map((preset) => ({
    ...preset,
    bindings: preset.bindings.map((binding) => ({ ...binding })),
    sizeCurve: cloneCurve(preset.sizeCurve),
    alphaCurve: cloneCurve(preset.alphaCurve),
    rotationSpeedCurve: cloneCurve(preset.rotationSpeedCurve),
    velocityCurve: cloneCurve(preset.velocityCurve),
    colorIntensityCurve: cloneCurve(preset.colorIntensityCurve),
    gradientStops: cloneGradientStops(preset.gradientStops),
  }));
}

const DEFAULT_LINEAR_CURVE: ParticleCurve = {
  enabled: false,
  points: [
    { t: 0, v: 1 },
    { t: 1, v: 1 },
  ],
};

function defaultLinearCurve(): ParticleCurve {
  return {
    enabled: DEFAULT_LINEAR_CURVE.enabled,
    points: DEFAULT_LINEAR_CURVE.points.map((point) => ({ ...point })),
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function sanitizeCurvePoints(points: ParticleCurvePoint[] | undefined): ParticleCurvePoint[] {
  if (!Array.isArray(points) || points.length === 0) {
    return defaultLinearCurve().points;
  }
  const normalized = points
    .map((point) => ({ t: clamp01(point?.t ?? 0), v: Number.isFinite(point?.v) ? point.v : 1 }))
    .sort((a, b) => a.t - b.t);
  if (normalized[0].t > 0) {
    normalized.unshift({ t: 0, v: normalized[0].v });
  }
  if (normalized[normalized.length - 1].t < 1) {
    normalized.push({ t: 1, v: normalized[normalized.length - 1].v });
  }
  return normalized;
}

function normalizeCurve(curve: ParticleCurve | undefined): ParticleCurve {
  if (!curve) return defaultLinearCurve();
  return {
    enabled: Boolean(curve.enabled),
    points: sanitizeCurvePoints(curve.points),
  };
}

function cloneCurve(curve: ParticleCurve | undefined): ParticleCurve | undefined {
  if (!curve) return undefined;
  return {
    enabled: curve.enabled,
    points: curve.points.map((point) => ({ ...point })),
  };
}

function sanitizeGradientStops(stops: ParticleGradientStop[] | undefined, fallbackStartColor: string, fallbackEndColor: string, fallbackStartAlpha: number, fallbackEndAlpha: number): ParticleGradientStop[] {
  if (!Array.isArray(stops) || stops.length === 0) {
    return [
      { t: 0, color: fallbackStartColor, alpha: Math.max(0, Math.min(1, fallbackStartAlpha)) },
      { t: 1, color: fallbackEndColor, alpha: Math.max(0, Math.min(1, fallbackEndAlpha)) },
    ];
  }
  const normalized = stops
    .map((stop) => ({
      t: clamp01(stop?.t ?? 0),
      color: typeof stop?.color === 'string' && stop.color.length > 0 ? stop.color : '#ffffff',
      alpha: Math.max(0, Math.min(1, Number.isFinite(stop?.alpha) ? stop.alpha : 1)),
    }))
    .sort((a, b) => a.t - b.t);
  if (normalized[0].t > 0) {
    normalized.unshift({ t: 0, color: normalized[0].color, alpha: normalized[0].alpha });
  }
  if (normalized[normalized.length - 1].t < 1) {
    normalized.push({ t: 1, color: normalized[normalized.length - 1].color, alpha: normalized[normalized.length - 1].alpha });
  }
  return normalized;
}

function cloneGradientStops(stops: ParticleGradientStop[] | undefined): ParticleGradientStop[] | undefined {
  if (!stops) return undefined;
  return stops.map((stop) => ({ ...stop }));
}

function normalizePreset(preset: ParticlePreset): ParticlePreset {
  const hasSizeUnit = preset.sizeUnit === 'px' || preset.sizeUnit === 'grid';
  const normalizedSizeUnit = hasSizeUnit ? preset.sizeUnit : 'grid';
  const sizeScale = hasSizeUnit ? 1 : 1 / 50;

  return {
    ...preset,
    startSize: preset.startSize * sizeScale,
    endSize: preset.endSize * sizeScale,
    sizeUnit: normalizedSizeUnit,
    startRotationMinDeg: preset.startRotationMinDeg ?? 0,
    startRotationMaxDeg: preset.startRotationMaxDeg ?? 360,
    rotationSpeedMinDegPerSec: preset.rotationSpeedMinDegPerSec ?? -120,
    rotationSpeedMaxDegPerSec: preset.rotationSpeedMaxDegPerSec ?? 120,
    spawnWidth: preset.spawnWidth ?? 0,
    spawnHeight: preset.spawnHeight ?? 0,
    sizeCurve: normalizeCurve(preset.sizeCurve),
    alphaCurve: normalizeCurve(preset.alphaCurve),
    rotationSpeedCurve: normalizeCurve(preset.rotationSpeedCurve),
    velocityCurve: normalizeCurve(preset.velocityCurve),
    colorIntensityCurve: normalizeCurve(preset.colorIntensityCurve),
    gradientStops: sanitizeGradientStops(
      preset.gradientStops,
      preset.startColor,
      preset.endColor,
      preset.startAlpha,
      preset.endAlpha,
    ),
  };
}

function loadPresets(): ParticlePreset[] {
  if (presetsCache) return presetsCache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ParticlePreset[];
      presetsCache = clonePresets(parsed.map(normalizePreset));
      return presetsCache;
    }
  } catch (err) {
    console.warn('Failed to load particle presets, using defaults.', err);
  }
  presetsCache = clonePresets(DEFAULT_PRESETS.map(normalizePreset));
  return presetsCache;
}

function savePresets(presets: ParticlePreset[]): void {
  presetsCache = clonePresets(presets);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presetsCache));
  } catch (err) {
    console.warn('Failed to save particle presets.', err);
  }
  listeners.forEach((listener) => listener());
}

export function getParticlePresets(): ParticlePreset[] {
  return clonePresets(loadPresets());
}

export function getParticlePresetById(id: string): ParticlePreset | undefined {
  return loadPresets().find((preset) => preset.id === id);
}

export function updateParticlePreset(updated: ParticlePreset): void {
  const presets = loadPresets();
  const normalizedUpdated = normalizePreset(updated);
  const index = presets.findIndex((preset) => preset.id === updated.id);
  if (index >= 0) {
    presets[index] = { ...normalizedUpdated, bindings: normalizedUpdated.bindings.map((b) => ({ ...b })) };
    savePresets(presets);
  } else {
    presets.push({ ...normalizedUpdated, bindings: normalizedUpdated.bindings.map((b) => ({ ...b })) });
    savePresets(presets);
  }
}

export function deleteParticlePreset(id: string): void {
  const presets = loadPresets().filter((preset) => preset.id !== id);
  savePresets(presets);
}

export function importParticlePresets(data: ParticlePreset[]): void {
  if (!Array.isArray(data) || data.length === 0) return;
  savePresets(data.map(normalizePreset));
}

export function exportParticlePresets(): ParticlePreset[] {
  return getParticlePresets();
}

export function resetParticlePresets(): void {
  savePresets(clonePresets(DEFAULT_PRESETS.map(normalizePreset)));
}

export function subscribeParticlePresets(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
