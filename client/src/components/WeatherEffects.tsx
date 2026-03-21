/**
 * Weather Effects - particle weather + PixiJS filter helpers.
 */

import { useEffect, useRef } from 'react';
import type { Application, Filter } from 'pixi.js';
import { Point } from 'pixi.js';
import {
  AdjustmentFilter,
  AdvancedBloomFilter,
  BulgePinchFilter,
  CRTFilter,
  GlitchFilter,
  GodrayFilter,
  KawaseBlurFilter,
  OldFilmFilter,
  PixelateFilter,
  RGBSplitFilter,
  ReflectionFilter,
  ShockwaveFilter,
  ZoomBlurFilter,
} from 'pixi-filters';
import { getParticleSystem, initParticleSystem } from '../particles/runtime/ParticleSystem';
import { getParticlePresetById } from '../particles/editor/particlePresetStore';
import type { ParticlePreset } from '../particles/editor/particleSchema';
import type { WeatherEffectConfig, WeatherFilterConfig, WeatherFilterType } from '../store/gameStore';
import { useGameStore } from '../store/gameStore';

export type WeatherType = 'none' | 'rain' | 'snow' | 'fog' | 'clouds' | 'fireflies' | 'embers' | 'sparkles' | 'hearts' | 'blizzard';

const WEATHER_TYPE_TO_PRESET: Record<WeatherType, string> = {
  none: '',
  rain: 'WeatherRain',
  snow: 'WeatherSnow',
  fog: 'WeatherFog',
  clouds: 'WeatherClouds',
  fireflies: 'WeatherFireflies',
  embers: 'WeatherEmbers',
  sparkles: 'WeatherSparkles',
  hearts: 'WeatherSparkles',
  blizzard: 'WeatherBlizzard',
};

export interface WeatherPreset {
  name: string;
  icon: string;
  config: Partial<WeatherConfig>;
}

export const weatherPresets: WeatherPreset[] = [
  { name: 'Light Rain', icon: '🌧️', config: { intensity: 40 } },
  { name: 'Heavy Rain', icon: '⛈️', config: { intensity: 90 } },
  { name: 'Gentle Snow', icon: '❄️', config: { intensity: 30 } },
  { name: 'Blizzard', icon: '🌨️', config: { intensity: 100 } },
  { name: 'Fireflies', icon: '✨', config: { intensity: 25 } },
  { name: 'Embers', icon: '🔥', config: { intensity: 40 } },
  { name: 'Fog', icon: '🌫️', config: { intensity: 50 } },
  { name: 'Clouds', icon: '☁️', config: { intensity: 40 } },
  { name: 'Magic Sparkles', icon: '⭐', config: { intensity: 35 } },
  { name: 'Hearts', icon: '❤️', config: { intensity: 30 } },
];

const typeToPresetIndex: Record<string, number> = {
  rain: 0,
  snow: 2,
  fog: 6,
  clouds: 7,
  fireflies: 4,
  embers: 5,
  sparkles: 8,
  hearts: 9,
  blizzard: 1,
};

export function getPresetForType(type: WeatherType): Partial<WeatherConfig> {
  const presetIndex = typeToPresetIndex[type];
  if (presetIndex !== undefined && weatherPresets[presetIndex]) {
    return weatherPresets[presetIndex].config;
  }
  return {};
}

interface WeatherConfig {
  intensity: number;
  speed?: number;
  size?: number;
  color?: string;
  textureUrl?: string;
  direction?: number;
  wobble?: number;
  wobbleAmplitude?: number;
  particleShape?: 'circle' | 'star' | 'heart' | 'snowflake' | 'drop' | 'spark' | 'flare';
}

interface MultiWeatherEffectsProps {
  app: Application;
  effects: WeatherEffectConfig[];
  boardWidth: number;
  boardHeight: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toShapeTexture(shape?: WeatherConfig['particleShape']): string | undefined {
  switch (shape) {
    case 'heart':
      return 'spark';
    case 'snowflake':
      return 'soft_circle';
    case 'drop':
      return 'spark';
    case 'spark':
      return 'spark';
    case 'flare':
      return 'ember';
    case 'star':
      return 'spark';
    case 'circle':
      return 'soft_circle';
    default:
      return undefined;
  }
}

// Build minimal overrides for weather effects - only spawn area and layer ordering
// All other settings (color, size, speed, direction, lifetime, opacity) come from the Particle Emitter preset
function buildWeatherOverrides(effect: WeatherEffectConfig, boardWidth: number, boardHeight: number): Partial<ParticlePreset> {
  // Only override spawn area - weather needs to cover the entire board
  // Layer ordering: belowTokens controls whether particles appear below or above tokens
  // ALL other settings come from the Particle Emitter preset - no overrides!
  const overrides: Partial<ParticlePreset> = {
    spawnShape: 'box',
    spawnWidth: boardWidth * 1.15,
    spawnHeight: boardHeight * 1.15,
    spawnRadius: Math.max(boardWidth, boardHeight) * 0.6,
    durationMs: 0, // Continuous emission for weather
    sortGroup: effect.belowTokens !== false ? 'below-token' : 'above-token',
  };

  // NO overrides for color, size, lifetime, amount, opacity, speed, direction, etc.
  // All these come directly from the Particle Emitter preset!

  return overrides;
}

function createEffectSignature(effect: WeatherEffectConfig, boardWidth: number, boardHeight: number): string {
  const presetId = WEATHER_TYPE_TO_PRESET[effect.type as WeatherType] || '';
  
  // Get the current preset data so changes in Particle Editor trigger updates
  const preset = presetId ? getParticlePresetById(presetId) : undefined;
  
  const overrides = buildWeatherOverrides(effect, boardWidth, boardHeight);
  return JSON.stringify({
    preset: presetId,
    // Include key preset properties to detect changes in Particle Editor
    presetSnapshot: preset ? {
      emitRate: preset.emitRate,
      maxParticles: preset.maxParticles,
      startColor: preset.startColor,
      endColor: preset.endColor,
      startSize: preset.startSize,
      endSize: preset.endSize,
      speedMin: preset.speedMin,
      speedMax: preset.speedMax,
      directionDeg: preset.directionDeg,
      spreadDeg: preset.spreadDeg,
      lifetimeMinMs: preset.lifetimeMinMs,
      lifetimeMaxMs: preset.lifetimeMaxMs,
      startAlpha: preset.startAlpha,
      endAlpha: preset.endAlpha,
      texture: preset.texture,
      sortGroup: preset.sortGroup,
    } : null,
    boardWidth,
    boardHeight,
    enabled: effect.enabled,
    overrides,
  });
}

export function MultiWeatherEffectRenderer({ app, effects, boardWidth, boardHeight }: MultiWeatherEffectsProps) {
  const trackedRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;

    const ensureSystem = async () => {
      const system = getParticleSystem() ?? (app ? await initParticleSystem({ app, boardWidth, boardHeight }) : null);
      if (!system || cancelled) return;
      system.setBounds(boardWidth, boardHeight);

      const active = effects.filter((effect) => effect.enabled && effect.type && effect.type !== 'none');
      const nextTokenKeys = new Set(active.map((effect) => `weather:${effect.id}`));

      for (const key of trackedRef.current.keys()) {
        if (nextTokenKeys.has(key)) continue;
        system.stopByToken(key);
        trackedRef.current.delete(key);
      }

      for (const effect of active) {
        const presetId = WEATHER_TYPE_TO_PRESET[effect.type as WeatherType];
        if (!presetId) continue;

        try {
          const tokenKey = `weather:${effect.id}`;
          const nextSignature = createEffectSignature(effect, boardWidth, boardHeight);
          const prevSignature = trackedRef.current.get(tokenKey);
          if (prevSignature === nextSignature) continue;

          system.stopByToken(tokenKey);

          system.playPreset(presetId, {
            x: boardWidth / 2,
            y: boardHeight / 2,
            sourceTokenId: tokenKey,
            overrides: buildWeatherOverrides(effect, boardWidth, boardHeight),
          });
          trackedRef.current.set(tokenKey, nextSignature);
        } catch (e) {
          console.warn('Failed to create weather emitter:', e);
        }
      }
    };

    void ensureSystem();

    return () => {
      cancelled = true;
    };
  }, [app, effects, boardWidth, boardHeight]);

  useEffect(
    () => () => {
      const system = getParticleSystem();
      if (!system) return;
      for (const tokenKey of trackedRef.current.keys()) {
        system.stopByToken(tokenKey);
      }
      trackedRef.current.clear();
    },
    []
  );

  return null;
}

type ControlType = 'range' | 'number' | 'boolean';

export interface WeatherFilterSettingDefinition {
  key: string;
  label: string;
  type: ControlType;
  min?: number;
  max?: number;
  step?: number;
}

export interface WeatherFilterDefinition {
  type: WeatherFilterType;
  label: string;
  settings: WeatherFilterSettingDefinition[];
  defaults: Record<string, number | boolean>;
}

export const PIXI_WEATHER_FILTER_DEFINITIONS: WeatherFilterDefinition[] = [
  {
    type: 'adjustment',
    label: 'Adjustment',
    defaults: { gamma: 1, saturation: 1, contrast: 1, brightness: 1, red: 1, green: 1, blue: 1, alpha: 1 },
    settings: [
      { key: 'gamma', label: 'Gamma', type: 'range', min: 0, max: 3, step: 0.01 },
      { key: 'saturation', label: 'Saturation', type: 'range', min: 0, max: 3, step: 0.01 },
      { key: 'contrast', label: 'Contrast', type: 'range', min: 0, max: 3, step: 0.01 },
      { key: 'brightness', label: 'Brightness', type: 'range', min: 0, max: 3, step: 0.01 },
      { key: 'red', label: 'Red', type: 'range', min: 0, max: 3, step: 0.01 },
      { key: 'green', label: 'Green', type: 'range', min: 0, max: 3, step: 0.01 },
      { key: 'blue', label: 'Blue', type: 'range', min: 0, max: 3, step: 0.01 },
      { key: 'alpha', label: 'Alpha', type: 'range', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    type: 'advancedBloom',
    label: 'Advanced Bloom',
    defaults: { threshold: 0.5, bloomScale: 1, brightness: 1, blur: 8, quality: 4, pixelSize: 1 },
    settings: [
      { key: 'threshold', label: 'Threshold', type: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'bloomScale', label: 'Bloom Scale', type: 'range', min: 0, max: 5, step: 0.01 },
      { key: 'brightness', label: 'Brightness', type: 'range', min: 0, max: 3, step: 0.01 },
      { key: 'blur', label: 'Blur', type: 'range', min: 0, max: 32, step: 0.1 },
      { key: 'quality', label: 'Quality', type: 'number', min: 1, max: 12, step: 1 },
      { key: 'pixelSize', label: 'Pixel Size', type: 'number', min: 1, max: 8, step: 1 },
    ],
  },
  {
    type: 'bulgePinch',
    label: 'Bulge/Pinch',
    defaults: { centerX: 0.5, centerY: 0.5, radius: 300, strength: 0.5 },
    settings: [
      { key: 'centerX', label: 'Center X', type: 'range', min: 0, max: 1, step: 0.001 },
      { key: 'centerY', label: 'Center Y', type: 'range', min: 0, max: 1, step: 0.001 },
      { key: 'radius', label: 'Radius', type: 'range', min: 1, max: 3000, step: 1 },
      { key: 'strength', label: 'Strength', type: 'range', min: -1, max: 1, step: 0.01 },
    ],
  },
  {
    type: 'crt',
    label: 'CRT',
    defaults: { curvature: 1, lineWidth: 1, lineContrast: 0.25, noise: 0.2, noiseSize: 1, vignetting: 0.3, vignettingAlpha: 1, vignettingBlur: 0.3, seed: 0, time: 0 },
    settings: [
      { key: 'curvature', label: 'Curvature', type: 'number', min: 0, max: 10, step: 0.01 },
      { key: 'lineWidth', label: 'Line Width', type: 'number', min: 0, max: 5, step: 0.01 },
      { key: 'lineContrast', label: 'Line Contrast', type: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'noise', label: 'Noise', type: 'range', min: 0, max: 2, step: 0.01 },
      { key: 'noiseSize', label: 'Noise Size', type: 'number', min: 1, max: 10, step: 1 },
      { key: 'vignetting', label: 'Vignetting', type: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'vignettingAlpha', label: 'Vignette Alpha', type: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'vignettingBlur', label: 'Vignette Blur', type: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'seed', label: 'Seed', type: 'number', min: 0, max: 9999, step: 1 },
      { key: 'time', label: 'Time', type: 'number', min: 0, max: 9999, step: 0.01 },
    ],
  },
  {
    type: 'godray',
    label: 'Godray',
    defaults: {
      angle: 30,
      parallel: true,
      centerX: 0,
      centerY: 0,
      gain: 0.5,
      lacunarity: 2.5,
      time: 0,
      alpha: 1,
    },
    settings: [
      { key: 'angle', label: 'Angle', type: 'range', min: -180, max: 180, step: 0.1 },
      { key: 'parallel', label: 'Parallel', type: 'boolean' },
      { key: 'centerX', label: 'Center X', type: 'number', min: -5000, max: 5000, step: 1 },
      { key: 'centerY', label: 'Center Y', type: 'number', min: -5000, max: 5000, step: 1 },
      { key: 'gain', label: 'Gain', type: 'range', min: 0, max: 1, step: 0.001 },
      { key: 'lacunarity', label: 'Lacunarity', type: 'range', min: 0, max: 10, step: 0.01 },
      { key: 'time', label: 'Time', type: 'number', min: 0, max: 9999, step: 0.01 },
      { key: 'alpha', label: 'Alpha', type: 'range', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    type: 'glitch',
    label: 'Glitch',
    defaults: { slices: 5, offset: 50, direction: 0, fillMode: 0, seed: 0, average: false, minSize: 8, sampleSize: 512 },
    settings: [
      { key: 'slices', label: 'Slices', type: 'number', min: 0, max: 50, step: 1 },
      { key: 'offset', label: 'Offset', type: 'range', min: 0, max: 500, step: 1 },
      { key: 'direction', label: 'Direction', type: 'range', min: -3.1416, max: 3.1416, step: 0.01 },
      { key: 'fillMode', label: 'Fill Mode', type: 'number', min: 0, max: 4, step: 1 },
      { key: 'seed', label: 'Seed', type: 'number', min: 0, max: 9999, step: 1 },
      { key: 'average', label: 'Average', type: 'boolean' },
      { key: 'minSize', label: 'Min Size', type: 'number', min: 1, max: 256, step: 1 },
      { key: 'sampleSize', label: 'Sample Size', type: 'number', min: 1, max: 2048, step: 1 },
    ],
  },
  {
    type: 'kawaseBlur',
    label: 'Kawase Blur',
    defaults: { blur: 4, quality: 3, pixelSizeX: 1, pixelSizeY: 1 },
    settings: [
      { key: 'blur', label: 'Blur', type: 'range', min: 0, max: 64, step: 0.1 },
      { key: 'quality', label: 'Quality', type: 'number', min: 1, max: 12, step: 1 },
      { key: 'pixelSizeX', label: 'Pixel Size X', type: 'number', min: 1, max: 16, step: 1 },
      { key: 'pixelSizeY', label: 'Pixel Size Y', type: 'number', min: 1, max: 16, step: 1 },
    ],
  },
  {
    type: 'oldFilm',
    label: 'Old Film',
    defaults: { sepia: 0.3, noise: 0.3, noiseSize: 1, scratch: 0.2, scratchDensity: 0.3, scratchWidth: 1, vignetting: 0.3, vignettingAlpha: 1, vignettingBlur: 0.3, seed: 0 },
    settings: [
      { key: 'sepia', label: 'Sepia', type: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'noise', label: 'Noise', type: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'noiseSize', label: 'Noise Size', type: 'number', min: 1, max: 10, step: 1 },
      { key: 'scratch', label: 'Scratch', type: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'scratchDensity', label: 'Scratch Density', type: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'scratchWidth', label: 'Scratch Width', type: 'number', min: 1, max: 10, step: 1 },
      { key: 'vignetting', label: 'Vignetting', type: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'vignettingAlpha', label: 'Vignette Alpha', type: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'vignettingBlur', label: 'Vignette Blur', type: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'seed', label: 'Seed', type: 'number', min: 0, max: 9999, step: 1 },
    ],
  },
  {
    type: 'pixelate',
    label: 'Pixelate',
    defaults: { sizeX: 8, sizeY: 8 },
    settings: [
      { key: 'sizeX', label: 'Size X', type: 'number', min: 1, max: 64, step: 1 },
      { key: 'sizeY', label: 'Size Y', type: 'number', min: 1, max: 64, step: 1 },
    ],
  },
  {
    type: 'rgbSplit',
    label: 'RGB Split',
    defaults: { redX: -10, redY: 0, greenX: 0, greenY: 10, blueX: 0, blueY: 0 },
    settings: [
      { key: 'redX', label: 'Red X', type: 'number', min: -100, max: 100, step: 1 },
      { key: 'redY', label: 'Red Y', type: 'number', min: -100, max: 100, step: 1 },
      { key: 'greenX', label: 'Green X', type: 'number', min: -100, max: 100, step: 1 },
      { key: 'greenY', label: 'Green Y', type: 'number', min: -100, max: 100, step: 1 },
      { key: 'blueX', label: 'Blue X', type: 'number', min: -100, max: 100, step: 1 },
      { key: 'blueY', label: 'Blue Y', type: 'number', min: -100, max: 100, step: 1 },
    ],
  },
  {
    type: 'reflection',
    label: 'Reflection',
    defaults: { mirror: true, boundary: 0.5, amplitude: 10, waveLength: 20, alpha: 1 },
    settings: [
      { key: 'mirror', label: 'Mirror', type: 'boolean' },
      { key: 'boundary', label: 'Boundary', type: 'range', min: 0, max: 1, step: 0.001 },
      { key: 'amplitude', label: 'Amplitude', type: 'range', min: 0, max: 100, step: 0.1 },
      { key: 'waveLength', label: 'Wave Length', type: 'range', min: 1, max: 200, step: 0.1 },
      { key: 'alpha', label: 'Alpha', type: 'range', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    type: 'shockwave',
    label: 'Shockwave',
    defaults: { centerX: 0.5, centerY: 0.5, speed: 300, amplitude: 30, wavelength: 160, brightness: 1, radius: -1, time: 0 },
    settings: [
      { key: 'centerX', label: 'Center X', type: 'range', min: 0, max: 1, step: 0.001 },
      { key: 'centerY', label: 'Center Y', type: 'range', min: 0, max: 1, step: 0.001 },
      { key: 'speed', label: 'Speed', type: 'number', min: 0, max: 2000, step: 1 },
      { key: 'amplitude', label: 'Amplitude', type: 'number', min: 0, max: 200, step: 1 },
      { key: 'wavelength', label: 'Wavelength', type: 'number', min: 1, max: 1000, step: 1 },
      { key: 'brightness', label: 'Brightness', type: 'range', min: 0, max: 5, step: 0.01 },
      { key: 'radius', label: 'Radius', type: 'number', min: -1, max: 10000, step: 1 },
      { key: 'time', label: 'Time', type: 'number', min: 0, max: 9999, step: 0.01 },
    ],
  },
  {
    type: 'zoomBlur',
    label: 'Zoom Blur',
    defaults: { centerX: 0.5, centerY: 0.5, strength: 0.1, innerRadius: 0, radius: -1 },
    settings: [
      { key: 'centerX', label: 'Center X', type: 'range', min: 0, max: 1, step: 0.001 },
      { key: 'centerY', label: 'Center Y', type: 'range', min: 0, max: 1, step: 0.001 },
      { key: 'strength', label: 'Strength', type: 'range', min: 0, max: 2, step: 0.001 },
      { key: 'innerRadius', label: 'Inner Radius', type: 'range', min: 0, max: 1000, step: 1 },
      { key: 'radius', label: 'Radius', type: 'number', min: -1, max: 5000, step: 1 },
    ],
  },
];

const FILTER_DEF_BY_TYPE = new Map(PIXI_WEATHER_FILTER_DEFINITIONS.map((entry) => [entry.type, entry]));

export function createDefaultWeatherFilterEffect(type: WeatherFilterType): WeatherFilterConfig {
  const def = FILTER_DEF_BY_TYPE.get(type)!;
  return {
    id: crypto.randomUUID(),
    type,
    enabled: false,
    settings: { ...def.defaults },
  };
}

export function getDefaultWeatherFilterEffects(): WeatherFilterConfig[] {
  return PIXI_WEATHER_FILTER_DEFINITIONS.map((entry) => createDefaultWeatherFilterEffect(entry.type));
}

function toNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function toBoolean(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

export function createPixiWeatherFilter(effect: WeatherFilterConfig, width: number, height: number): Filter | null {
  const s = effect.settings;
  try {
    switch (effect.type) {
      case 'adjustment':
        return new AdjustmentFilter();
      case 'advancedBloom':
        return new AdvancedBloomFilter();
      case 'bulgePinch':
        return new BulgePinchFilter();
      case 'crt':
        return new CRTFilter();
      case 'glitch':
        return new GlitchFilter();
      case 'godray':
        return new GodrayFilter();
      case 'kawaseBlur':
        return new KawaseBlurFilter();
      case 'oldFilm':
        return new OldFilmFilter();
      case 'pixelate':
        return new PixelateFilter(new Point(toNumber(s.sizeX, 8), toNumber(s.sizeY, 8)));
      case 'rgbSplit':
        return new RGBSplitFilter();
      case 'reflection':
        return new ReflectionFilter();
      case 'shockwave':
        // Use pixel coordinates for center
        return new ShockwaveFilter({ center: { x: toNumber(s.centerX, 0.5) * width, y: toNumber(s.centerY, 0.5) * height } });
      case 'zoomBlur':
        // Use pixel coordinates for center
        return new ZoomBlurFilter({ center: { x: toNumber(s.centerX, 0.5) * width, y: toNumber(s.centerY, 0.5) * height } });
      default:
        return null;
    }
  } catch (err) {
    console.warn(`Failed to create weather filter ${effect.type}`, err);
    return null;
  }
}

export function updatePixiWeatherFilter(filter: Filter, effect: WeatherFilterConfig, elapsedDelta: number, width: number, height: number): void {
  const f = filter as any;
  const s = effect.settings;
  const nextElapsed = (() => {
    const current = typeof f.__weatherElapsed === 'number' && Number.isFinite(f.__weatherElapsed) ? f.__weatherElapsed : 0;
    const next = current + Math.max(0, elapsedDelta);
    f.__weatherElapsed = next;
    return next;
  })();
  switch (effect.type) {
    case 'adjustment':
      f.gamma = toNumber(s.gamma, 1);
      f.saturation = toNumber(s.saturation, 1);
      f.contrast = toNumber(s.contrast, 1);
      f.brightness = toNumber(s.brightness, 1);
      f.red = toNumber(s.red, 1);
      f.green = toNumber(s.green, 1);
      f.blue = toNumber(s.blue, 1);
      f.alpha = toNumber(s.alpha, 1);
      break;
    case 'advancedBloom':
      f.threshold = toNumber(s.threshold, 0.5);
      f.bloomScale = toNumber(s.bloomScale, 1);
      f.brightness = toNumber(s.brightness, 1);
      f.blur = toNumber(s.blur, 8);
      f.quality = toNumber(s.quality, 4);
      f.pixelSize = toNumber(s.pixelSize, 1);
      break;
    case 'bulgePinch':
      // BulgePinch expects normalized coordinates (0..1)
      f.center = new Point(toNumber(s.centerX, 0.5), toNumber(s.centerY, 0.5));
      f.radius = toNumber(s.radius, 300);
      f.strength = toNumber(s.strength, 0.5);
      break;
    case 'crt':
      f.curvature = toNumber(s.curvature, 1);
      f.lineWidth = toNumber(s.lineWidth, 1);
      f.lineContrast = toNumber(s.lineContrast, 0.25);
      f.noise = toNumber(s.noise, 0.2);
      f.noiseSize = toNumber(s.noiseSize, 1);
      f.vignetting = toNumber(s.vignetting, 0.3);
      f.vignettingAlpha = toNumber(s.vignettingAlpha, 1);
      f.vignettingBlur = toNumber(s.vignettingBlur, 0.3);
      f.seed = toNumber(s.seed, 0);
      f.time = toNumber(s.time, 0) + nextElapsed;
      break;
    case 'glitch':
      f.slices = toNumber(s.slices, 5);
      f.offset = toNumber(s.offset, 50);
      f.direction = toNumber(s.direction, 0);
      f.fillMode = toNumber(s.fillMode, 0);
      f.seed = toNumber(s.seed, 0);
      f.average = toBoolean(s.average, false);
      f.minSize = toNumber(s.minSize, 8);
      f.sampleSize = toNumber(s.sampleSize, 512);
      break;
    case 'godray':
      f.angle = toNumber(s.angle, 30);
      f.parallel = toBoolean(s.parallel, true);
      f.center = new Point(toNumber(s.centerX, 0), toNumber(s.centerY, 0));
      f.gain = toNumber(s.gain, 0.5);
      f.lacunarity = toNumber(s.lacunarity, 2.5);
      f.alpha = toNumber(s.alpha, 1);
      f.time = toNumber(s.time, 0) + nextElapsed;
      break;
    case 'kawaseBlur':
      f.blur = toNumber(s.blur, 4);
      f.quality = toNumber(s.quality, 3);
      f.pixelSize = new Point(toNumber(s.pixelSizeX, 1), toNumber(s.pixelSizeY, 1));
      break;
    case 'oldFilm':
      f.sepia = toNumber(s.sepia, 0.3);
      f.noise = toNumber(s.noise, 0.3);
      f.noiseSize = toNumber(s.noiseSize, 1);
      f.scratch = toNumber(s.scratch, 0.2);
      f.scratchDensity = toNumber(s.scratchDensity, 0.3);
      f.scratchWidth = toNumber(s.scratchWidth, 1);
      f.vignetting = toNumber(s.vignetting, 0.3);
      f.vignettingAlpha = toNumber(s.vignettingAlpha, 1);
      f.vignettingBlur = toNumber(s.vignettingBlur, 0.3);
      f.seed = toNumber(s.seed, 0);
      break;
    case 'pixelate':
      f.size = new Point(toNumber(s.sizeX, 8), toNumber(s.sizeY, 8));
      break;
    case 'rgbSplit':
      f.red = [toNumber(s.redX, -10), toNumber(s.redY, 0)];
      f.green = [toNumber(s.greenX, 0), toNumber(s.greenY, 10)];
      f.blue = [toNumber(s.blueX, 0), toNumber(s.blueY, 0)];
      break;
    case 'reflection':
      f.mirror = toBoolean(s.mirror, true);
      f.boundary = toNumber(s.boundary, 0.5);
      // Reflection filter expects ranges for amplitude/wavelength/alpha
      f.amplitude = [0, toNumber(s.amplitude, 10)];
      f.waveLength = [Math.max(1, toNumber(s.waveLength, 20) * 0.5), Math.max(1, toNumber(s.waveLength, 20))];
      const a = toNumber(s.alpha, 1);
      f.alpha = [a, a];
      f.time = nextElapsed;
      break;
    case 'shockwave':
      // Use pixel coordinates for center
      f.centerX = toNumber(s.centerX, 0.5) * width;
      f.centerY = toNumber(s.centerY, 0.5) * height;
      f.speed = toNumber(s.speed, 300);
      f.amplitude = toNumber(s.amplitude, 30);
      f.wavelength = toNumber(s.wavelength, 160);
      f.brightness = toNumber(s.brightness, 1);
      f.radius = toNumber(s.radius, -1);
      {
        const speed = Math.max(1, toNumber(s.speed, 300));
        const configuredRadius = toNumber(s.radius, -1);
        const travelRadius = configuredRadius > 0 ? configuredRadius : Math.hypot(width, height);
        const period = Math.max(0.001, travelRadius / speed);
        f.time = (toNumber(s.time, 0) + nextElapsed) % period;
      }
      break;
    case 'zoomBlur':
      // Use pixel coordinates for center
      f.centerX = toNumber(s.centerX, 0.5) * width;
      f.centerY = toNumber(s.centerY, 0.5) * height;
      f.strength = toNumber(s.strength, 0.1);
      f.innerRadius = toNumber(s.innerRadius, 0);
      f.radius = toNumber(s.radius, -1);
      break;
  }
}

interface WeatherPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WeatherPanel({ isOpen, onClose }: WeatherPanelProps) {
  const { activeWeatherEffects, addWeatherEffect, removeWeatherEffect } = useGameStore();

  if (!isOpen) return null;

  return (
    <div className="weather-panel">
      <div className="weather-panel-header">
        <h3>Weather Effects</h3>
        <button onClick={onClose}>✕</button>
      </div>

      <div className="weather-presets">
        {(['rain', 'snow', 'fog', 'clouds', 'fireflies', 'embers', 'sparkles', 'hearts', 'blizzard'] as WeatherType[]).map((type) => {
          const isEnabled = activeWeatherEffects.some((e) => e.type === type);
          return (
            <button
              key={type}
              className={`weather-preset-btn ${isEnabled ? 'active' : ''}`}
              onClick={() => {
                if (isEnabled) {
                  const effect = activeWeatherEffects.find((e) => e.type === type);
                  if (effect) removeWeatherEffect(effect.id);
                } else {
                  addWeatherEffect({
                    id: `weather_${Date.now()}`,
                    type,
                    enabled: true,
                    intensity: 50,
                    speed: 50,
                    size: 50,
                    color: '#ffffff',
                    direction: 180,
                    wobble: 50,
                    wobbleAmplitude: 50,
                    belowTokens: true,
                    lifetime: 5000,
                    opacity: 100,
                  });
                }
              }}
            >
              {weatherPresets[typeToPresetIndex[type]]?.icon} {weatherPresets[typeToPresetIndex[type]]?.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default WeatherPanel;
