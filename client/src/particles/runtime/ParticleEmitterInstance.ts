import type { Container, Texture } from 'pixi.js';
import type { ParticleCurve, ParticleGradientStop, ParticlePreset, ParticlePlayPayload } from '../editor/particleSchema';
import type { LiveParticle } from './ParticlePool';
import { ParticlePool } from './ParticlePool';

const warnedInvalidColors = new Set<string>();

export interface ParticleEmitterConfig {
  id: string;
  preset: ParticlePreset;
  texture: Texture;
  pool: ParticlePool;
  container: Container;
  x: number;
  y: number;
  sourceTokenId?: string;
  targetTokenId?: string;
  overrides?: Partial<ParticlePreset>;
  gridSizePx?: number;
}

export class ParticleEmitterInstance {
  readonly id: string;
  readonly presetId: string;
  readonly container: Container;
  readonly attachMode: ParticlePreset['attachMode'];
  readonly sortGroup: ParticlePreset['sortGroup'];
  readonly blendMode: ParticlePreset['blendMode'];
  readonly sourceTokenId?: string;
  readonly targetTokenId?: string;
  readonly zIndex: number;

  private readonly pool: ParticlePool;
  private texture: Texture;
  private textureWidth: number;
  private textureHeight: number;
  private readonly particles: LiveParticle[];
  private particleCount: number;
  private spawnAccumulator: number;
  private elapsedMs: number;
  private burstDone: boolean;
  private stopRequested: boolean;
  private maxParticles: number;
  private gridSizePx: number;

  x: number;
  y: number;
  durationMs: number;
  emitRate: number;
  burstCount: number;
  emissionMode: ParticlePreset['emissionMode'];
  lifetimeMinMs: number;
  lifetimeMaxMs: number;
  startSize: number;
  endSize: number;
  sizeUnit: ParticlePreset['sizeUnit'];
  startAlpha: number;
  endAlpha: number;
  startR: number;
  startG: number;
  startB: number;
  endR: number;
  endG: number;
  endB: number;
  speedMin: number;
  speedMax: number;
  directionRad: number;
  spreadRad: number;
  startRotationMinRad: number;
  startRotationMaxRad: number;
  rotationSpeedMinRadPerSec: number;
  rotationSpeedMaxRadPerSec: number;
  gravityX: number;
  gravityY: number;
  drag: number;
  spawnShape: ParticlePreset['spawnShape'];
  spawnRadius: number;
  spawnWidth: number;
  spawnHeight: number;
  coneAngleRad: number;
  sizeCurve: ParticleCurve;
  alphaCurve: ParticleCurve;
  rotationSpeedCurve: ParticleCurve;
  velocityCurve: ParticleCurve;
  colorIntensityCurve: ParticleCurve;
  gradientStops: ParticleGradientStop[];

  constructor(config: ParticleEmitterConfig) {
    const preset = { ...config.preset, ...config.overrides };
    this.id = config.id;
    this.presetId = preset.id;
    this.container = config.container;
    this.container.sortableChildren = true;
    this.container.hitArea = null;
    this.container.zIndex = preset.zIndex;
    this.container.blendMode = preset.blendMode === 'add'
      ? 'add'
      : preset.blendMode === 'screen'
        ? 'screen'
        : 'normal';
    this.attachMode = preset.attachMode;
    this.sortGroup = preset.sortGroup;
    this.blendMode = preset.blendMode;
    this.zIndex = preset.zIndex;
    this.sourceTokenId = config.sourceTokenId;
    this.targetTokenId = config.targetTokenId;
    this.pool = config.pool;
    this.texture = config.texture;
    this.textureWidth = config.texture.width || 1;
    this.textureHeight = config.texture.height || 1;
    this.gridSizePx = config.gridSizePx ?? 50;
    this.x = config.x;
    this.y = config.y;
    this.durationMs = preset.durationMs;
    this.emitRate = preset.emitRate;
    this.burstCount = preset.burstCount;
    this.emissionMode = preset.emissionMode;
    this.lifetimeMinMs = preset.lifetimeMinMs;
    this.lifetimeMaxMs = preset.lifetimeMaxMs;
    this.startSize = preset.startSize;
    this.endSize = preset.endSize;
    this.sizeUnit = preset.sizeUnit ?? 'px';
    this.startAlpha = preset.startAlpha;
    this.endAlpha = preset.endAlpha;
    const startColor = parseColor(preset.startColor);
    const endColor = parseColor(preset.endColor);
    this.startR = startColor.r;
    this.startG = startColor.g;
    this.startB = startColor.b;
    this.endR = endColor.r;
    this.endG = endColor.g;
    this.endB = endColor.b;
    this.speedMin = preset.speedMin;
    this.speedMax = preset.speedMax;
    this.directionRad = degToRad(preset.directionDeg);
    this.spreadRad = degToRad(preset.spreadDeg);
    this.startRotationMinRad = degToRad(preset.startRotationMinDeg ?? 0);
    this.startRotationMaxRad = degToRad(preset.startRotationMaxDeg ?? 0);
    this.rotationSpeedMinRadPerSec = degToRad(preset.rotationSpeedMinDegPerSec ?? -120);
    this.rotationSpeedMaxRadPerSec = degToRad(preset.rotationSpeedMaxDegPerSec ?? 120);
    this.gravityX = preset.gravityX;
    this.gravityY = preset.gravityY;
    this.drag = preset.drag;
    this.spawnShape = preset.spawnShape;
    this.spawnRadius = preset.spawnRadius;
    this.spawnWidth = preset.spawnWidth;
    this.spawnHeight = preset.spawnHeight;
    this.coneAngleRad = degToRad(preset.coneAngleDeg);
    this.maxParticles = preset.maxParticles;
    this.sizeCurve = sanitizeCurve(preset.sizeCurve);
    this.alphaCurve = sanitizeCurve(preset.alphaCurve);
    this.rotationSpeedCurve = sanitizeCurve(preset.rotationSpeedCurve);
    this.velocityCurve = sanitizeCurve(preset.velocityCurve);
    this.colorIntensityCurve = sanitizeCurve(preset.colorIntensityCurve);
    this.gradientStops = sanitizeGradientStops(preset.gradientStops, preset.startColor, preset.endColor, preset.startAlpha, preset.endAlpha);
    this.particles = new Array(this.maxParticles);
    this.particleCount = 0;
    this.spawnAccumulator = 0;
    this.elapsedMs = 0;
    this.burstDone = false;
    this.stopRequested = false;

  }

  update(dtMs: number, canSpawn: boolean): void {
    this.elapsedMs += dtMs;
    if (this.stopRequested) {
      this.emitRate = 0;
      this.burstCount = 0;
    }

    if (this.emissionMode === 'continuous') {
      if (this.durationMs <= 0 || this.elapsedMs <= this.durationMs) {
        if (canSpawn && this.emitRate > 0) {
          this.spawnAccumulator += (dtMs / 1000) * this.emitRate;
          while (this.spawnAccumulator >= 1) {
            if (!this.spawnParticle()) {
              this.spawnAccumulator = 0;
              break;
            }
            this.spawnAccumulator -= 1;
          }
        }
      }
    } else if (this.emissionMode === 'burst' && !this.burstDone) {
      if (canSpawn) {
        let count = this.burstCount;
        while (count > 0) {
          if (!this.spawnParticle()) break;
          count -= 1;
        }
      }
      this.burstDone = true;
    }

    const dragFactor = this.drag > 0 ? Math.max(0, 1 - this.drag * (dtMs / 1000)) : 1;
    for (let i = this.particleCount - 1; i >= 0; i--) {
      const particle = this.particles[i];
      if (!particle) continue;
      particle.ageMs += dtMs;
      if (particle.ageMs >= particle.lifeMs) {
        this.releaseParticle(i);
        continue;
      }
      const t = clamp01(particle.ageMs / particle.lifeMs);
      const velocityCurveValue = this.velocityCurve.enabled
        ? sampleCurve(this.velocityCurve, t)
        : 1;
      const velocityFactor = particle.velocityCurveLast > 0
        ? Math.max(0, velocityCurveValue) / particle.velocityCurveLast
        : 1;
      particle.velocityCurveLast = Math.max(0.0001, Math.max(0, velocityCurveValue));

      particle.vx *= velocityFactor;
      particle.vy *= velocityFactor;
      particle.vx += this.gravityX * (dtMs / 1000);
      particle.vy += this.gravityY * (dtMs / 1000);
      particle.vx *= dragFactor;
      particle.vy *= dragFactor;
      particle.x += particle.vx * (dtMs / 1000);
      particle.y += particle.vy * (dtMs / 1000);
      const rotationSpeedMultiplier = this.rotationSpeedCurve.enabled
        ? Math.max(0, sampleCurve(this.rotationSpeedCurve, t))
        : 1;
      particle.rotation += particle.rotationSpeed * rotationSpeedMultiplier * (dtMs / 1000);

      const size = lerp(particle.startSize, particle.endSize, sampleCurve(this.sizeCurve, t));
      const gradient = sampleGradient(this.gradientStops, t);
      const alpha = gradient
        ? gradient.alpha
        : lerp(particle.startAlpha, particle.endAlpha, sampleCurve(this.alphaCurve, t));
      const colorT = this.colorIntensityCurve.enabled
        ? sampleCurve(this.colorIntensityCurve, t)
        : 1;
      const intensity = Math.max(0, colorT);
      const baseR = gradient ? gradient.r : (particle.startR + (particle.endR - particle.startR) * t);
      const baseG = gradient ? gradient.g : (particle.startG + (particle.endG - particle.startG) * t);
      const baseB = gradient ? gradient.b : (particle.startB + (particle.endB - particle.startB) * t);
      const r = clampColor(baseR * intensity);
      const g = clampColor(baseG * intensity);
      const b = clampColor(baseB * intensity);

      const sprite = particle.sprite;
      sprite.x = particle.x;
      sprite.y = particle.y;
      sprite.alpha = alpha;
      sprite.rotation = particle.rotation;
      sprite.scale.set(size / this.textureWidth, size / this.textureHeight);
      sprite.tint = (r << 16) | (g << 8) | b;
    }
  }

  stop(clear: boolean): void {
    this.stopRequested = true;
    if (clear) {
      while (this.particleCount > 0) {
        this.releaseParticle(this.particleCount - 1);
      }
    }
  }

  isComplete(): boolean {
    if (this.emissionMode === 'continuous') {
      if (this.stopRequested) return this.particleCount === 0;
      if (this.durationMs > 0 && this.elapsedMs > this.durationMs) {
        return this.particleCount === 0;
      }
      return false;
    }
    return this.burstDone && this.particleCount === 0;
  }

  applyPayload(payload: ParticlePlayPayload | undefined): void {
    if (!payload) return;
    if (payload.x !== undefined) this.x = payload.x;
    if (payload.y !== undefined) this.y = payload.y;
  }

  applyOverrides(overrides?: Partial<ParticlePreset>, texture?: Texture): void {
    if (!overrides) return;
    if (texture) {
      this.texture = texture;
      this.textureWidth = texture.width || 1;
      this.textureHeight = texture.height || 1;
    }
    if (overrides.zIndex !== undefined) {
      this.container.zIndex = overrides.zIndex;
    }
    if (overrides.blendMode) {
      this.container.blendMode = overrides.blendMode === 'add'
        ? 'add'
        : overrides.blendMode === 'screen'
          ? 'screen'
          : 'normal';
    }
    if (overrides.durationMs !== undefined) this.durationMs = overrides.durationMs;
    if (overrides.emitRate !== undefined) this.emitRate = overrides.emitRate;
    if (overrides.burstCount !== undefined) this.burstCount = overrides.burstCount;
    if (overrides.emissionMode) this.emissionMode = overrides.emissionMode;
    if (overrides.lifetimeMinMs !== undefined) this.lifetimeMinMs = overrides.lifetimeMinMs;
    if (overrides.lifetimeMaxMs !== undefined) this.lifetimeMaxMs = overrides.lifetimeMaxMs;
    if (overrides.startSize !== undefined) this.startSize = overrides.startSize;
    if (overrides.endSize !== undefined) this.endSize = overrides.endSize;
    if (overrides.sizeUnit !== undefined) this.sizeUnit = overrides.sizeUnit;
    if (overrides.startAlpha !== undefined) this.startAlpha = overrides.startAlpha;
    if (overrides.endAlpha !== undefined) this.endAlpha = overrides.endAlpha;
    if (overrides.startColor !== undefined) {
      const startColor = parseColor(overrides.startColor);
      this.startR = startColor.r;
      this.startG = startColor.g;
      this.startB = startColor.b;
    }
    if (overrides.endColor !== undefined) {
      const endColor = parseColor(overrides.endColor);
      this.endR = endColor.r;
      this.endG = endColor.g;
      this.endB = endColor.b;
    }
    if (overrides.speedMin !== undefined) this.speedMin = overrides.speedMin;
    if (overrides.speedMax !== undefined) this.speedMax = overrides.speedMax;
    if (overrides.directionDeg !== undefined) this.directionRad = degToRad(overrides.directionDeg);
    if (overrides.spreadDeg !== undefined) this.spreadRad = degToRad(overrides.spreadDeg);
    if (overrides.startRotationMinDeg !== undefined) this.startRotationMinRad = degToRad(overrides.startRotationMinDeg);
    if (overrides.startRotationMaxDeg !== undefined) this.startRotationMaxRad = degToRad(overrides.startRotationMaxDeg);
    if (overrides.rotationSpeedMinDegPerSec !== undefined) this.rotationSpeedMinRadPerSec = degToRad(overrides.rotationSpeedMinDegPerSec);
    if (overrides.rotationSpeedMaxDegPerSec !== undefined) this.rotationSpeedMaxRadPerSec = degToRad(overrides.rotationSpeedMaxDegPerSec);
    if (overrides.gravityX !== undefined) this.gravityX = overrides.gravityX;
    if (overrides.gravityY !== undefined) this.gravityY = overrides.gravityY;
    if (overrides.drag !== undefined) this.drag = overrides.drag;
    if (overrides.spawnShape) this.spawnShape = overrides.spawnShape;
    if (overrides.spawnRadius !== undefined) this.spawnRadius = overrides.spawnRadius;
    if (overrides.spawnWidth !== undefined) this.spawnWidth = overrides.spawnWidth;
    if (overrides.spawnHeight !== undefined) this.spawnHeight = overrides.spawnHeight;
    if (overrides.coneAngleDeg !== undefined) this.coneAngleRad = degToRad(overrides.coneAngleDeg);
    if (overrides.sizeCurve !== undefined) this.sizeCurve = sanitizeCurve(overrides.sizeCurve);
    if (overrides.alphaCurve !== undefined) this.alphaCurve = sanitizeCurve(overrides.alphaCurve);
    if (overrides.rotationSpeedCurve !== undefined) this.rotationSpeedCurve = sanitizeCurve(overrides.rotationSpeedCurve);
    if (overrides.velocityCurve !== undefined) this.velocityCurve = sanitizeCurve(overrides.velocityCurve);
    if (overrides.colorIntensityCurve !== undefined) this.colorIntensityCurve = sanitizeCurve(overrides.colorIntensityCurve);
    if (overrides.gradientStops !== undefined) {
      this.gradientStops = sanitizeGradientStops(overrides.gradientStops, '#ffffff', '#ffffff', this.startAlpha, this.endAlpha);
    }
    if (overrides.maxParticles !== undefined) {
      this.maxParticles = Math.min(overrides.maxParticles, this.particles.length);
    }
  }

  private spawnParticle(): boolean {
    if (this.particleCount >= this.maxParticles) return false;
    const particle = this.pool.acquireParticle();
    if (!particle) return false;
    const sprite = particle.sprite;
    sprite.texture = this.texture;
    sprite.visible = true;
    if (!sprite.parent) {
      this.container.addChild(sprite);
    }

    const pos = this.computeSpawnPosition();
    const velocity = this.computeVelocity();
    particle.x = pos.x;
    particle.y = pos.y;
    particle.vx = velocity.vx;
    particle.vy = velocity.vy;
    particle.ageMs = 0;
    particle.lifeMs = randomRange(this.lifetimeMinMs, this.lifetimeMaxMs);
    const sizeScale = this.sizeUnit === 'grid' ? this.gridSizePx : 1;
    particle.startSize = this.startSize * sizeScale;
    particle.endSize = this.endSize * sizeScale;
    particle.startAlpha = this.startAlpha;
    particle.endAlpha = this.endAlpha;
    particle.rotation = randomRange(this.startRotationMinRad, this.startRotationMaxRad);
    particle.rotationSpeed = randomRange(this.rotationSpeedMinRadPerSec, this.rotationSpeedMaxRadPerSec);
    particle.startR = this.startR;
    particle.startG = this.startG;
    particle.startB = this.startB;
    particle.endR = this.endR;
    particle.endG = this.endG;
    particle.endB = this.endB;
    particle.motionStretch = false;
    particle.motionStretchFactor = 1;
    particle.velocityCurveLast = this.velocityCurve.enabled
      ? Math.max(0.0001, Math.max(0, sampleCurve(this.velocityCurve, 0)))
      : 1;

    this.particles[this.particleCount] = particle;
    this.particleCount += 1;
    return true;
  }

  private releaseParticle(index: number): void {
    const particle = this.particles[index];
    if (particle) {
      this.pool.releaseParticle(particle);
    }
    const lastIndex = this.particleCount - 1;
    if (index !== lastIndex) {
      this.particles[index] = this.particles[lastIndex];
    }
    this.particles[lastIndex] = undefined as unknown as LiveParticle;
    this.particleCount -= 1;
  }

  private computeSpawnPosition(): { x: number; y: number } {
    if (this.spawnShape === 'point') {
      return { x: this.x, y: this.y };
    }
    if (this.spawnShape === 'box') {
      return {
        x: this.x + (Math.random() - 0.5) * this.spawnWidth,
        y: this.y + (Math.random() - 0.5) * this.spawnHeight,
      };
    }
    if (this.spawnShape === 'line') {
      const along = (Math.random() - 0.5) * this.spawnWidth;
      const across = (Math.random() - 0.5) * this.spawnHeight;
      const dirX = Math.cos(this.directionRad);
      const dirY = Math.sin(this.directionRad);
      const perpX = -dirY;
      const perpY = dirX;
      return {
        x: this.x + dirX * along + perpX * across,
        y: this.y + dirY * along + perpY * across,
      };
    }
    const angle =
      this.spawnShape === 'cone'
        ? this.directionRad + (Math.random() - 0.5) * this.coneAngleRad
        : Math.random() * Math.PI * 2;
    const radius =
      this.spawnShape === 'ring'
        ? this.spawnRadius
        : Math.sqrt(Math.random()) * this.spawnRadius;
    return {
      x: this.x + Math.cos(angle) * radius,
      y: this.y + Math.sin(angle) * radius,
    };
  }

  private computeVelocity(): { vx: number; vy: number } {
    const angle = this.directionRad + (Math.random() - 0.5) * this.spreadRad;
    const speed = randomRange(this.speedMin, this.speedMax);
    return {
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    };
  }
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function parseColor(color?: string): { r: number; g: number; b: number } {
  if (!color) {
    return { r: 255, g: 255, b: 255 };
  }
  const hex = color.startsWith('#') ? color.slice(1) : color;
  const isHexLike = /^[0-9a-fA-F]{3,8}$/.test(hex);
  if (!isHexLike) {
    if (!warnedInvalidColors.has(color)) {
      warnedInvalidColors.add(color);
      console.warn('[particles] parseColor received non-hex color; this resolves to black with current parser', {
        input: color,
      });
    }
  }
  const value = parseInt(hex.padStart(6, '0'), 16);
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampColor(value: number): number {
  return Math.max(0, Math.min(255, value | 0));
}

function sanitizeCurve(curve?: ParticleCurve): ParticleCurve {
  const defaultCurve: ParticleCurve = {
    enabled: false,
    points: [
      { t: 0, v: 1 },
      { t: 1, v: 1 },
    ],
  };
  if (!curve || !Array.isArray(curve.points) || curve.points.length === 0) {
    return defaultCurve;
  }
  const points = curve.points
    .map((point) => ({
      t: clamp01(point?.t ?? 0),
      v: Number.isFinite(point?.v) ? point.v : 1,
    }))
    .sort((a, b) => a.t - b.t);
  if (points[0].t > 0) {
    points.unshift({ t: 0, v: points[0].v });
  }
  if (points[points.length - 1].t < 1) {
    points.push({ t: 1, v: points[points.length - 1].v });
  }
  return {
    enabled: Boolean(curve.enabled),
    points,
  };
}

function sampleCurve(curve: ParticleCurve, t: number): number {
  if (!curve.enabled) return clamp01(t);
  const points = curve.points;
  if (!points.length) return clamp01(t);
  const x = clamp01(t);
  if (x <= points[0].t) return points[0].v;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const next = points[i];
    if (x <= next.t) {
      const range = next.t - prev.t;
      if (range <= 0.000001) return next.v;
      const localT = (x - prev.t) / range;
      return lerp(prev.v, next.v, localT);
    }
  }
  return points[points.length - 1].v;
}

function sanitizeGradientStops(
  stops: ParticleGradientStop[] | undefined,
  startColor: string,
  endColor: string,
  startAlpha: number,
  endAlpha: number,
): ParticleGradientStop[] {
  if (!Array.isArray(stops) || stops.length === 0) {
    return [
      { t: 0, color: startColor, alpha: clamp01(startAlpha) },
      { t: 1, color: endColor, alpha: clamp01(endAlpha) },
    ];
  }
  const normalized = stops
    .map((stop) => ({
      t: clamp01(stop?.t ?? 0),
      color: typeof stop?.color === 'string' && stop.color.length > 0 ? stop.color : '#ffffff',
      alpha: clamp01(Number.isFinite(stop?.alpha) ? stop.alpha : 1),
    }))
    .sort((a, b) => a.t - b.t);
  if (normalized[0].t > 0) normalized.unshift({ t: 0, color: normalized[0].color, alpha: normalized[0].alpha });
  if (normalized[normalized.length - 1].t < 1) normalized.push({ t: 1, color: normalized[normalized.length - 1].color, alpha: normalized[normalized.length - 1].alpha });
  return normalized;
}

function sampleGradient(stops: ParticleGradientStop[] | undefined, t: number): { r: number; g: number; b: number; alpha: number } | null {
  if (!stops || stops.length === 0) return null;
  const x = clamp01(t);
  if (x <= stops[0].t) {
    const c = parseColor(stops[0].color);
    return { ...c, alpha: clamp01(stops[0].alpha) };
  }
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1];
    const next = stops[i];
    if (x <= next.t) {
      const range = Math.max(0.000001, next.t - prev.t);
      const localT = (x - prev.t) / range;
      const a = parseColor(prev.color);
      const b = parseColor(next.color);
      return {
        r: lerp(a.r, b.r, localT),
        g: lerp(a.g, b.g, localT),
        b: lerp(a.b, b.b, localT),
        alpha: lerp(clamp01(prev.alpha), clamp01(next.alpha), localT),
      };
    }
  }
  const c = parseColor(stops[stops.length - 1].color);
  return { ...c, alpha: clamp01(stops[stops.length - 1].alpha) };
}
