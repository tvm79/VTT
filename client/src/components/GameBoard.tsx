import { useEffect, useRef, useState, useCallback, useLayoutEffect, useMemo } from 'react';
import * as PIXI from 'pixi.js';
import { BlurFilter, ColorMatrixFilter, NoiseFilter, DisplacementFilter } from 'pixi.js';
import type { BLEND_MODES } from 'pixi.js';
import { useGameStore, type SceneParticleEmitterConfig, type WeatherFilterConfig } from '../store/gameStore';
import { shallow } from 'zustand/shallow';
import { socketService } from '../services/socket';
import { Icon } from './Icon';
import { TokenActionButtons } from './TokenActionButtons';
import { AuraSettingsModal } from './TokenPanel';
import {
  MultiWeatherEffectRenderer,
  createPixiWeatherFilter,
  updatePixiWeatherFilter,
} from './WeatherEffects';
import { ParticleAuraRenderer } from './ParticleAura';
import { ParticleEditorPanel } from '../particles/editor/ParticleEditorPanel';
import type { ParticlePreset } from '../particles/editor/particleSchema';
import { getParticlePresets, subscribeParticlePresets } from '../particles/editor/particlePresetStore';
import { initParticleSystem, destroyParticleSystem, getParticleSystem } from '../particles/runtime/ParticleSystem';
import { extractMonsterChallengeRating, getChallengeRatingColor } from '../utils/challengeRatingColors';
import { getActivatedTextColor, getTokenBorderColor, TOKEN_DISPOSITIONS } from '../utils/colorUtils';
import { TokenAnimationManager } from '../animation/TokenAnimationManager';
import { emitTokenAnimation, subscribeToTokenAnimations } from '../animation/tokenAnimationEvents';
import { easeOutBack } from '../animation/easing';
import { requestAuthoritativeRoll } from '../dice/rollOrchestrator';
import { library } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faBug, faVirus, faEyeSlash, faHeart, faGhost, faBolt, faBed, faTired, faLightbulb
} from '@fortawesome/free-solid-svg-icons';
import type { Light } from '../../../shared/src/index';
import { TimeOverlaySystem, getTimeOverlaySystem } from '../systems/timeOverlaySystem';
import { getAtmosphericFogSystem } from '../systems/AtmosphericFogSystem';
import { getLightTexture, getRadianceTexture } from './lighting/LightTextureGenerator';
import { useLightRenderer, LightIconsOverlay } from './lighting';
import { ParticleEmitterIconsOverlay } from './particles/ParticleEmitterIconsOverlay';
import { AudioSourceIconsOverlay } from './audio/AudioSourceIconsOverlay';
import { MeasurementPanel } from './MeasurementPanel';
import { 
  calculateDistance, 
  calculateRectangleBounds, 
  calculateConeVertices, 
  calculateDirection,
  formatRectangleDistance,
  formatCircleDistance,
  formatConeDistance,
  getMidpoint 
} from './measurement/MeasurementUtils';
import { useSpatialAudio } from './audio/useSpatialAudio';
import { VISUAL_OPTIONS, setFogEnabled, setFogIntensity, setFogSpeed, setFogShift, setFogDirection, setFogColor1, setFogColor2 } from '../utils/gameTime';
import { getPixiRendererKind, initPixiApplicationWebGL2First, isPixiWebGLRenderer } from '../utils/pixiRenderer';
import { GridOverlay } from '../utils/GridOverlay';
// Default turn token - now in public/assets/art for proper PixiJS loading
const DEFAULT_TURN_TOKEN_URL = '/assets/art/turn_token.webp';
import { colors } from '../ui/tokens';
import { 
  snapToGridIntersection as snapToGridIntersectionBase,
  snapToGridCellCenter as snapToGridCellCenterBase,
  snapTokenToGrid as snapTokenToGridBase,
  getTokenTopLeftFromCenter,
  getTokenCenterFromTopLeft
} from '../utils/gridUtils';

/**
 * Get the appropriate upload path for files dropped on the canvas
 * Default to /maps for images since most canvas drops are backgrounds/maps
 */
function getUploadPathForCanvasDrop(file: File): string {
  // Check for audio files first - route to /audio
  if (file.type.startsWith('audio/')) {
    return '/audio';
  }
  
  // Check for video files - route to /maps
  if (file.type.startsWith('video/')) {
    return '/maps';
  }
  
  // Check for image files
  if (file.type.startsWith('image/')) {
    // Check filename for hints
    const nameLower = file.name.toLowerCase();
    if (nameLower.includes('token')) {
      return '/tokens';
    }
    // Default to /maps for images (most canvas drops are backgrounds/maps)
    return '/maps';
  }
  
  // Default fallback
  return '/tokens';
}

const DEFAULT_HP_BAR_COLOR = colors.accent.danger;
const DEFAULT_MANA_BAR_COLOR = colors.accent.info;
const DEFAULT_CUSTOM_BAR_COLOR = colors.accent.success;
const DEFAULT_TOKEN_TEXT_COLOR = colors.text.primary;
const DEFAULT_TOKEN_STROKE_COLOR = colors.text.inverse;
const DEFAULT_MONSTER_ACCENT = colors.accent.warning;
const DEFAULT_SPELL_ACCENT = colors.accent.primary;
const DEFAULT_CHARACTER_ACCENT = colors.accent.success;
const DEFAULT_GENERIC_ACCENT = colors.text.muted;
const DEFAULT_AVATAR_GRADIENT_END = colors.background.canvas;
const DEFAULT_DANGER_TEXT_COLOR = colors.accent.danger;
const DEFAULT_NEUTRAL_ICON_COLOR = colors.text.muted;
const DEFAULT_ORBIT_TEXT_COLOR = colors.text.primary;
const DEFAULT_GM_ACTION_TEXT_COLOR = '#fef3c7';
const DEFAULT_PLAYER_ACTION_TEXT_COLOR = '#d1d5db';
const DEFAULT_GM_ACTION_BG = 0x1f2937;
const DEFAULT_PLAYER_ACTION_BG = 0x374151;
const DEFAULT_GM_ACTION_BORDER = 0xf59e0b;
const DEFAULT_PLAYER_ACTION_BORDER = 0x6b7280;
const DEFAULT_CANVAS_STROKE = 0x000000;
const DEFAULT_GM_PLAYER_COLOR = colors.accent.danger;
const DEFAULT_PLAYER_COLOR = colors.accent.primary;
const DEFAULT_SELECTION_BORDER_COLOR = colors.accent.warning;
const DEFAULT_TINT_COLOR = 0xffffff;
const DEFAULT_TURN_MARKER_FILL = 0xfbbf24;
const DEFAULT_TURN_MARKER_STROKE = 0xf59e0b;
const DEFAULT_AURA_COLOR = 0xffff99;
const DEFAULT_BAR_BACKGROUND = 0x333333;
const DEFAULT_BAR_TEXT_COLOR = 0xffffff;
const DEFAULT_LIGHT_COLOR = 0xffdd88;
const DEFAULT_LIGHT_EFFECT_COLOR = 0xffaa00;

const LIGHT_PRESET_VALUES = {
  torch: {
    color: hexColorToNumber(colors.lightingPreset.torchStart, DEFAULT_LIGHT_COLOR),
    effectColor: hexColorToNumber(colors.lightingPreset.torchEnd, DEFAULT_LIGHT_EFFECT_COLOR),
  },
  lantern: {
    color: hexColorToNumber(colors.lightingPreset.lanternStart, DEFAULT_LIGHT_COLOR),
  },
  candle: {
    color: hexColorToNumber(colors.lightingPreset.candleStart, DEFAULT_LIGHT_COLOR),
    effectColor: hexColorToNumber(colors.lightingPreset.candleEnd, DEFAULT_LIGHT_EFFECT_COLOR),
  },
  magic: {
    color: hexColorToNumber(colors.lightingPreset.magicStart, DEFAULT_LIGHT_COLOR),
    effectColor: hexColorToNumber(colors.lightingPreset.magicEnd, DEFAULT_LIGHT_EFFECT_COLOR),
  },
  shroud: {
    color: hexColorToNumber(colors.lightingPreset.shroudEnd, DEFAULT_LIGHT_COLOR),
  },
  sun: {
    color: hexColorToNumber(colors.lightingPreset.sunStart, DEFAULT_LIGHT_COLOR),
  },
} as const;

function hexColorToNumber(value: string, fallback: number): number {
  const normalized = String(value || '').trim();
  if (!normalized.startsWith('#')) return fallback;

  const parsed = Number.parseInt(normalized.slice(1), 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Module-level variable for tracking token double-clicks (persists across renders)
let lastTokenClickInfo = { tokenId: '', time: 0 };

const DOUBLE_CLICK_THRESHOLD = 300; // 300ms for proper double-click detection

type ScreenShakeEventType = 'damage' | 'heal' | 'downed' | 'attack' | 'miss';

type ScreenShakeRuntimeState = {
  active: boolean;
  startedAt: number;
  durationMs: number;
  amplitudePx: number;
  frequency: number;
  decay: number;
  offsetX: number;
  offsetY: number;
  baseX: number;
  baseY: number;
};

// Add icons to library to ensure they're loaded
library.add(faBug, faVirus, faEyeSlash, faHeart, faGhost, faBolt, faBed, faTired, faLightbulb);

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fallbackTokenDataUrl(name: string, type?: string, crValue?: unknown): string {
  const first = (name || 'T').trim().charAt(0).toUpperCase() || 'T';
  const t = (type || '').toLowerCase();
  const accent = t.includes('monster')
    ? getChallengeRatingColor(crValue, DEFAULT_MONSTER_ACCENT)
    : t.includes('spell')
      ? DEFAULT_SPELL_ACCENT
      : t.includes('npc') || t.includes('character')
        ? DEFAULT_CHARACTER_ACCENT
        : DEFAULT_GENERIC_ACCENT;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
<defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="${accent}"/><stop offset="100%" stop-color="${DEFAULT_AVATAR_GRADIENT_END}"/></linearGradient></defs>
<rect x="0" y="0" width="256" height="256" rx="32" fill="url(#g)"/>
<circle cx="128" cy="92" r="46" fill="rgba(255,255,255,0.22)"/>
<rect x="72" y="156" width="112" height="56" rx="22" fill="rgba(255,255,255,0.2)"/>
<text x="128" y="144" text-anchor="middle" fill="${DEFAULT_TOKEN_TEXT_COLOR}" font-family="Arial,sans-serif" font-size="84" font-weight="700">${escapeXml(first)}</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function extractDroppedItemImageUrl(item: any): string | null {
  if (!item || typeof item !== 'object') return null;

  const candidates = [
    item.imageUrl,
    item.image,
    item.img,
    item.tokenUrl,
    item.token,
    item.portrait,
    item.avatar,
    item.thumbnail,
    item.system?.imageUrl,
    item.system?.image,
    item.system?.img,
    item.system?.tokenUrl,
    item.system?.token,
    item.system?.portrait,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate;
    if (candidate && typeof candidate === 'object' && typeof candidate.url === 'string' && candidate.url.trim().length > 0) {
      return candidate.url;
    }
  }

  return null;
}

function isRemoteHttpImageUrl(url: string): boolean {
  const trimmed = String(url || '').trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return false;
  if (trimmed.startsWith('/')) return false;
  return /^https?:\/\//i.test(trimmed);
}

function inferImageExtensionFromUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    const pathname = String(parsed.pathname || '').toLowerCase();
    const match = pathname.match(/\.(webp|png|jpe?g|gif|avif|svg)$/i);
    if (match?.[1]) {
      const ext = match[1].toLowerCase();
      return ext === 'jpg' ? 'jpeg' : ext;
    }
  } catch {
    // ignore and fall back
  }
  return 'webp';
}

function toBoardSafeImageUrl(url: string | null | undefined): string {
  const raw = String(url || '').trim();
  if (!raw) return '';

  // Normalize already-proxied URLs to extension-aware route so PIXI can pick parser.
  if (raw.startsWith('/api/assets/proxy-image?')) {
    const ext = inferImageExtensionFromUrl(raw);
    return raw.replace('/api/assets/proxy-image?', `/api/assets/proxy-image.${ext}?`);
  }

  // Handle Vite asset imports - they come as URLs with hashes like /assets/turn_token.webp?hash
  // Convert to a clean path that PixiJS can load
  if (raw.includes('/assets/') && raw.includes('?')) {
    // Strip query params for cleaner loading
    const cleanPath = raw.split('?')[0];
    return cleanPath;
  }

  if (!isRemoteHttpImageUrl(raw)) return raw;
  const ext = inferImageExtensionFromUrl(raw);
  return `/api/assets/proxy-image.${ext}?url=${encodeURIComponent(raw)}`;
}

function normalizeTokenScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  const halfStep = Math.round(value * 2) / 2;
  return Math.max(0.5, Math.min(6, halfStep));
}

function applyCenteredAspectFitToTokenSprites(
  sprite: PIXI.Sprite,
  shadowSprite: PIXI.Sprite,
  tokenWidth: number,
  tokenHeight: number,
): void {
  const texW = Math.max(1, sprite.texture?.width || tokenWidth);
  const texH = Math.max(1, sprite.texture?.height || tokenHeight);
  const scale = Math.min(tokenWidth / texW, tokenHeight / texH);

  sprite.anchor.set(0.5, 0.5);
  shadowSprite.anchor.set(0.5, 0.5);

  sprite.scale.set(scale, scale);
  shadowSprite.scale.set(scale, scale);

  const centerX = tokenWidth / 2;
  const centerY = tokenHeight / 2;
  sprite.position.set(centerX, centerY);
  shadowSprite.position.set(centerX + 4, centerY + 4);
}

function applyCenteredAspectFitToTurnMarker(
  turnMarkerSprite: PIXI.Sprite,
  tokenSize: number,
): void {
  const texW = Math.max(1, turnMarkerSprite.texture?.width || 1);
  const texH = Math.max(1, turnMarkerSprite.texture?.height || 1);
  // Keep marker only slightly larger than token footprint (≈1.1-1.2x)
  const targetSize = Math.max(12, tokenSize * 1.15);
  const scale = targetSize / Math.max(texW, texH);

  turnMarkerSprite.anchor.set(0.5, 0.5);
  turnMarkerSprite.width = texW * scale;
  turnMarkerSprite.height = texH * scale;
  turnMarkerSprite.x = tokenSize / 2;
  turnMarkerSprite.y = tokenSize / 2;
}

const STAGE_LAYER_ZINDEX = {
  background: 0,
  grid: 2,
  token: 10,
  measurement: 12,
  overlay: 15,
  light: 20,
  ui: 500,
  icons: 1000,
} as const;

function enforceTokenAboveBackgroundLayerOrder(app: PIXI.Application): void {
  const stage = app.stage;
  const backgroundLayer = (app as any).backgroundLayer as PIXI.Container | undefined;
  const gridLayer = (app as any).gridLayer as PIXI.Container | undefined;
  const tokenLayer = (app as any).tokenLayer as PIXI.Container | undefined;
  const measurementLayer = (app as any).measurementLayer as PIXI.Container | undefined;
  const overlayLayer = (app as any).overlayLayer as PIXI.Container | undefined;
  const lightLayer = (app as any).lightLayer as PIXI.Container | undefined;
  const uiLayer = (app as any).uiLayer as PIXI.Container | undefined;
  const lightIconsLayer = (app as any).lightIconsLayer as PIXI.Container | undefined;
  const particleIconsLayer = (app as any).particleIconsLayer as PIXI.Container | undefined;
  const audioIconsLayer = (app as any).audioIconsLayer as PIXI.Container | undefined;

  if (!backgroundLayer || !tokenLayer) return;

  backgroundLayer.zIndex = STAGE_LAYER_ZINDEX.background;
  if (gridLayer) gridLayer.zIndex = STAGE_LAYER_ZINDEX.grid;
  tokenLayer.zIndex = STAGE_LAYER_ZINDEX.token;
  if (measurementLayer) measurementLayer.zIndex = STAGE_LAYER_ZINDEX.measurement;
  if (overlayLayer) overlayLayer.zIndex = STAGE_LAYER_ZINDEX.overlay;
  if (lightLayer) lightLayer.zIndex = STAGE_LAYER_ZINDEX.light;
  if (uiLayer) uiLayer.zIndex = STAGE_LAYER_ZINDEX.ui;
  if (lightIconsLayer) lightIconsLayer.zIndex = STAGE_LAYER_ZINDEX.icons;
  if (particleIconsLayer) particleIconsLayer.zIndex = STAGE_LAYER_ZINDEX.icons;
  if (audioIconsLayer) audioIconsLayer.zIndex = STAGE_LAYER_ZINDEX.icons;

  stage.sortChildren();

  // During init/teardown or React StrictMode remounts, layers can exist but not yet
  // be attached to this stage. Avoid querying child index in that transient state.
  if (backgroundLayer.parent !== stage || tokenLayer.parent !== stage) {
    return;
  }

  // Hard fallback: ensure background appears before token layer in child order.
  const backgroundIndex = stage.getChildIndex(backgroundLayer);
  const tokenIndex = stage.getChildIndex(tokenLayer);
  if (backgroundIndex > tokenIndex) {
    stage.setChildIndex(backgroundLayer, Math.max(0, tokenIndex - 1));
  }
}

function mapDisplaySizeLabelToTokenScale(value: string): number {
  const v = value.toLowerCase();
  if (v.includes('tiny')) return 0.5;
  if (v.includes('small')) return 1;
  if (v.includes('medium')) return 1;
  if (v.includes('large')) return 2;
  if (v.includes('huge')) return 3;
  if (v.includes('gargantuan')) return 4;
  if (v.includes('colossal')) return 5;
  return 1;
}

// Map 5eTools size codes to token scale
// M = Medium (1), L = Large (2), H = Huge (3), G = Gargantuan (4), C = Colossal (5), T = Tiny (0.5)
function mapSizeCodeToTokenScale(code: string): number {
  const c = code.toUpperCase().charAt(0);
  switch (c) {
    case 'T': return 0.5; // Tiny
    case 'S': return 1;   // Small
    case 'M': return 1;   // Medium
    case 'L': return 2;   // Large
    case 'H': return 3;   // Huge
    case 'G': return 4;   // Gargantuan
    case 'C': return 5;   // Colossal
    default: return 1;
  }
}

function getDroppedItemTokenSize(item: any, gridCellPx: number): number {
  if (!item || typeof item !== 'object') return 1;

  const sizeCandidates = [
    item.size,
    item.system?.size,
    item.properties?.size,
    item.properties?.Size,
    item.system?.properties?.size,
    item.system?.properties?.Size,
  ];

  for (const candidate of sizeCandidates) {
    // Handle array format from 5eTools API: ["M"], ["L"], ["H"], ["G"]
    if (Array.isArray(candidate) && candidate.length > 0) {
      const firstElement = candidate[0];
      if (typeof firstElement === 'string') {
        return mapSizeCodeToTokenScale(firstElement);
      }
    }
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      // Some datasets store pixel/token image size. Convert large values to grid units.
      const normalized = candidate > 12 ? candidate / Math.max(1, gridCellPx) : candidate;
      return normalizeTokenScale(normalized);
    }
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      const numericString = candidate.replace(/[^\d.-]/g, '');
      const maybeNumber = Number(numericString);
      if (!Number.isNaN(maybeNumber)) {
        const normalized = maybeNumber > 12 ? maybeNumber / Math.max(1, gridCellPx) : maybeNumber;
        return normalizeTokenScale(normalized);
      }
      return mapDisplaySizeLabelToTokenScale(candidate);
    }
  }

  // Fallback: infer from any explicit textual fields if present.
  const typeText = [item.type, item.system?.type, item.properties?.Type]
    .filter((v) => typeof v === 'string')
    .join(' ');
  if (typeText) return mapDisplaySizeLabelToTokenScale(typeText);

  return 1;
}

type TokenBarsData = Array<{ name: string; current: number; max: number; color: string }>;

interface TokenVisualRefs {
  root: PIXI.Container;
  effectContainer: PIXI.Container;
  sprite: PIXI.Sprite;
  shadowSprite: PIXI.Sprite;
  turnMarkerContainer: PIXI.Container;
  turnMarkerFallback: PIXI.Graphics;
  turnMarkerSprite: PIXI.Sprite;
  auraContainer: PIXI.Container;
  auraGlows?: PIXI.Graphics[];
  auraRing?: PIXI.Graphics;
  statusContainer: PIXI.Container;
  labelContainer: PIXI.Container;
  barsContainer: PIXI.Container;
  deadIconContainer: PIXI.Container;
  acContainer: PIXI.Container;
  statOrbitContainer: PIXI.Container;
  actionOrbitContainer: PIXI.Container;
  // Mesh effect properties
  tokenMeshEffect?: string;
  tokenMeshIntensity?: number;
  tokenMeshSpeed?: number;
  originalSprite?: PIXI.Sprite;
}

type MonsterActionEntry = {
  name: string;
  text: string;
};

type CreatureQuickStats = {
  passive: string | number | null;
  senses: string | null;
  darkvision: string | number | null;
  speed: unknown;
  movement: string | number | null;
};

const ATTACK_BONUS_PATTERN = /([+-]\d+)\s+to hit\b/i;
const DICE_FORMULA_PATTERN = /\b\d*d\d+(?:\s*[+\-]\s*\d+)?(?:\s*(?:kh\d+|kl\d+|r[<>]\d+|cs[<>]\d+|!|x))*\b/gi;

function toInlineText(value: any): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(toInlineText).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    if (typeof value.name === 'string' && Array.isArray(value.entries)) {
      return `${value.name}. ${toInlineText(value.entries)}`.trim();
    }
    if (Array.isArray(value.entries)) return toInlineText(value.entries);
    if (typeof value.entry === 'string') return value.entry;
  }
  return '';
}

function extractMonsterActionEntries(source: any): MonsterActionEntry[] {
  if (!source || typeof source !== 'object') return [];
  const system = source.system && typeof source.system === 'object' ? source.system : source;
  const raw = (system.action || system.actions || source.action || source.actions) as any;
  if (!raw) return [];
  const asArray = Array.isArray(raw) ? raw : [raw];
  return asArray
    .map((entry: any, index: number) => {
      if (typeof entry === 'string') return { name: `Action ${index + 1}`, text: entry };
      const name = typeof entry?.name === 'string' ? entry.name : `Action ${index + 1}`;
      const text = toInlineText(entry?.entries || entry?.entry || entry);
      return { name, text };
    })
    .filter((entry) => entry.text.trim().length > 0)
    .slice(0, 3);
}

function extractTokenFallbackActions(token: any): MonsterActionEntry[] {
  const props = (token?.properties || {}) as Record<string, unknown>;
  const raw = props.actions;
  if (!raw) return [];
  const asArray = Array.isArray(raw) ? raw : [raw];
  return asArray
    .map((entry: any, index: number) => {
      if (typeof entry === 'string') return { name: `Action ${index + 1}`, text: entry };
      const name = typeof entry?.name === 'string' ? entry.name : `Action ${index + 1}`;
      const text = toInlineText(entry?.entries || entry?.entry || entry?.text || entry);
      return { name, text };
    })
    .filter((entry) => entry.text.trim().length > 0)
    .slice(0, 3);
}

function extractPassivePerception(tokenData: Record<string, unknown>): string | null {
  const fromPassive = tokenData.passive;
  if (typeof fromPassive === 'number') return `PP ${fromPassive}`;
  if (typeof fromPassive === 'string' && fromPassive.trim()) return `PP ${fromPassive.trim()}`;
  return null;
}

function extractSensesText(tokenData: Record<string, unknown>): string | null {
  const parts: string[] = [];
  if (typeof tokenData.senses === 'string' && tokenData.senses.trim()) {
    parts.push(tokenData.senses.trim());
  } else if (Array.isArray(tokenData.senses)) {
    const joined = tokenData.senses.map((s) => String(s)).filter(Boolean).join(', ').trim();
    if (joined) parts.push(joined);
  } else if (tokenData.senses && typeof tokenData.senses === 'object') {
    const sensesObj = tokenData.senses as Record<string, unknown>;
    const joined = Object.entries(sensesObj)
      .filter(([_, v]) => typeof v === 'string' || typeof v === 'number')
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')
      .trim();
    if (joined) parts.push(joined);
  }
  if (typeof tokenData.darkvision === 'string' && tokenData.darkvision.trim()) parts.push(`Darkvision ${tokenData.darkvision.trim()}`);
  else if (typeof tokenData.darkvision === 'number') parts.push(`Darkvision ${tokenData.darkvision} ft`);
  const text = parts.join(', ').trim();
  return text.length > 0 ? text : null;
}

function extractMovementText(tokenData: Record<string, unknown>): string | null {
  const speed = tokenData.speed;
  const movement = tokenData.movement;
  if (typeof movement === 'number') return `MOV ${movement} ft`;
  if (typeof movement === 'string' && movement.trim()) return `MOV ${movement.trim()}`;
  if (typeof speed === 'number') return `MOV ${speed} ft`;
  if (typeof speed === 'string' && speed.trim()) return `MOV ${speed.trim()}`;
  if (speed && typeof speed === 'object') {
    const entries = Object.entries(speed as Record<string, unknown>)
      .filter(([k, v]) => k !== 'canHover' && (typeof v === 'number' || (typeof v === 'string' && v.trim().length > 0)))
      .map(([k, v]) => `${k} ${v}`);
    if (entries.length > 0) return `MOV ${entries[0]}`;
  }
  return null;
}

function extractFirstAttackFormula(text: string): string | null {
  const bonusMatch = text.match(ATTACK_BONUS_PATTERN);
  if (!bonusMatch) return null;
  const bonus = bonusMatch[1]?.replace(/\s+/g, '');
  if (!bonus) return null;
  return `1d20${bonus.startsWith('+') || bonus.startsWith('-') ? bonus : `+${bonus}`}`;
}

function extractDamageFormula(text: string): string | null {
  const formulas = Array.from(text.matchAll(DICE_FORMULA_PATTERN)).map((m) => String(m[0]).replace(/\s+/g, ''));
  if (formulas.length === 0) return null;
  return formulas[0];
}

function parseTokenBarsData(barsRaw: string): TokenBarsData {
  if (!barsRaw) return [];
  try {
    const parsed = JSON.parse(barsRaw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getTokenBaseAlpha(isSelected: boolean, isHidden: boolean): number {
  return isSelected ? 1 : (isHidden ? 0.2 : 0.9);
}

type MipmapDebugOptions = {
  mipmapEnabled: boolean;
  anisotropyLevel: number;
  scaleMode: 'linear' | 'nearest';
};

/**
 * Configure a texture for optimal mip map rendering when using WebGL.
 * Mip maps improve quality when zooming out by pre-computing smaller versions.
 */
function configureTextureMipmaps(
  texture: PIXI.Texture | null | undefined,
  app: PIXI.Application,
  options: MipmapDebugOptions
): void {
  if (!texture) {
    console.log('[Mipmap] Skipping - no texture provided');
    return;
  }

  const renderer = app.renderer;
  const source = texture.source;

  const isWebGL = isPixiWebGLRenderer(app);
  if (!isWebGL) {
    console.log('[Mipmap] Skipping - renderer is not WebGL:', renderer?.type);
    return;
  }

  if (!source) {
    console.log('[Mipmap] Skipping - texture has no source');
    return;
  }

  // Detect WebGL2 - it supports non-power-of-two textures with mipmaps
  const rendererKind = getPixiRendererKind(app);
  const isWebGL2 = rendererKind === 'webgl2';
 
  // WebGL2 removes the power-of-two restriction for mipmaps
  const supportsNPOTMipmaps = isWebGL2;
  const canUseMipmaps = options.mipmapEnabled && (supportsNPOTMipmaps || source.isPowerOfTwo);

  source.scaleMode = options.scaleMode;
  source.minFilter = options.scaleMode;
  source.magFilter = options.scaleMode;
  source.mipmapFilter = options.scaleMode === 'linear' ? 'linear' : 'nearest';
  source.maxAnisotropy = options.scaleMode === 'linear' ? Math.max(1, options.anisotropyLevel) : 1;

  source.autoGenerateMipmaps = canUseMipmaps;

  if (source.autoGenerateMipmaps) {
    source.update();
    source.updateMipmaps();
  } else if (!options.mipmapEnabled) {
    source.update();
  } else {
    source.update();
  }
}

type ResolvedMapBleedSettings = {
  enabled: boolean;
  feather: number;
  blur: number;
  vignette: number;
  scale: number;
};

function buildVignetteTexture(width: number, height: number, feather: number, strength: number): PIXI.Texture {
  const baseW = 512;
  const aspect = Math.max(0.2, Math.min(5, height / Math.max(1, width)));
  const baseH = Math.max(256, Math.min(2048, Math.round(baseW * aspect)));
  const canvas = document.createElement('canvas');
  canvas.width = baseW;
  canvas.height = baseH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return PIXI.Texture.EMPTY;
  }

  const cx = baseW / 2;
  const cy = baseH / 2;
  const maxR = Math.hypot(cx, cy);
  const featherNorm = Math.max(0.05, Math.min(0.45, feather / Math.max(width, height)));
  const innerStop = Math.max(0.35, 1 - featherNorm * 2.2);
  const gradient = ctx.createRadialGradient(cx, cy, maxR * innerStop, cx, cy, maxR);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, `rgba(0,0,0,${Math.max(0, Math.min(1, strength))})`);

  ctx.clearRect(0, 0, baseW, baseH);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, baseW, baseH);

  return PIXI.Texture.from(canvas);
}

export function GameBoard() {
  const containerRef = useRef<HTMLDivElement>(null);
  const fogCanvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const [appReady, setAppReady] = useState(false);
  const isInitializingRef = useRef(false);
  const tokensRef = useRef<Map<string, PIXI.Sprite>>(new Map());
  const tokenVisualsRef = useRef<Map<string, TokenVisualRefs>>(new Map());
  const tokenHoverRef = useRef<Map<string, boolean>>(new Map());
  const acAnimationState = useRef<Map<string, { animatingIn: boolean; progress: number }>>(new Map());
  const orbitAnimationState = useRef<Map<string, { progress: number }>>(new Map());
  const linkedCreatureActionsCacheRef = useRef<Map<string, MonsterActionEntry[]>>(new Map());
  const linkedCreatureStatsCacheRef = useRef<Map<string, CreatureQuickStats>>(new Map());
  const [linkedCreatureActionsVersion, setLinkedCreatureActionsVersion] = useState(0);
  const acTweenDebugEnabledRef = useRef<boolean>(typeof window !== 'undefined' && window.localStorage.getItem('debug-ac-tween-origin') === '1');
  const acTweenLastSnapshotRef = useRef<Map<string, string>>(new Map());
  const tokenAnimationManagerRef = useRef<TokenAnimationManager | null>(null);
  const gridOverlayRef = useRef<GridOverlay | null>(null);
  const atmosphericFogSystemRef = useRef<ReturnType<typeof getAtmosphericFogSystem> | null>(null);
  const fogAnimationTimeRef = useRef(0);
  const previousTokenStateRef = useRef<Map<string, {
    x: number;
    y: number;
    bars: string;
    size: number;
    hidden: boolean;
    selected: boolean;
  }>>(new Map());
  const lightsRef = useRef<Map<string, PIXI.Container>>(new Map());
  const lightIconsRef = useRef<Map<string, PIXI.Text>>(new Map());
  const lightSpritesRef = useRef<Map<string, PIXI.Sprite>>(new Map());
  const selectionRectRef = useRef<PIXI.Graphics | null>(null);
  const dragSelectStart = useRef<{ x: number; y: number } | null>(null);
  const dragSelectCurrent = useRef<{ x: number; y: number } | null>(null);
  const isDragSelecting = useRef(false);
  const pendingSingleTokenClickTimeoutRef = useRef<number | null>(null);
  const pendingTokenDragRef = useRef<{
    tokenId: string;
    selectedTokenIds: string[];
    startX: number;
    startY: number;
  } | null>(null);
  
  const backgroundRef = useRef<PIXI.Sprite | null>(null);
  const backgroundBleedRef = useRef<PIXI.Sprite | null>(null);
  const backgroundVignetteRef = useRef<PIXI.Sprite | null>(null);
  const backgroundVignetteTextureRef = useRef<PIXI.Texture | null>(null);
  
  // Modal states for token actions
  const [barEditorState, setBarEditorState] = useState<{
    tokenId: string;
    barName: string;
    current: number;
    max: number;
    color: string;
    position: { x: number; y: number };
  } | null>(null);
  
  const [statusEditorState, setStatusEditorState] = useState<{
    tokenId: string;
    position: { x: number; y: number };
  } | null>(null);
  
  const [displayEditorState, setDisplayEditorState] = useState<{
    tokenId: string;
    position: { x: number; y: number };
  } | null>(null);
  
  const [auraEditorState, setAuraEditorState] = useState<{
    tokenId: string;
    position: { x: number; y: number };
  } | null>(null);
  
  const [ownershipEditorState, setOwnershipEditorState] = useState<{
    tokenId: string;
    position: { x: number; y: number };
  } | null>(null);
  
  const [layerEditorState, setLayerEditorState] = useState<{
    tokenId: string;
    position: { x: number; y: number };
  } | null>(null);
  
  const [deleteEditorState, setDeleteEditorState] = useState<{
    tokenId: string;
    position: { x: number; y: number };
  } | null>(null);
  
  const [combatEditorState, setCombatEditorState] = useState<{
    tokenId: string;
    position: { x: number; y: number };
  } | null>(null);

  const [actionPopupState, setActionPopupState] = useState<{
    tokenId: string;
    action: MonsterActionEntry;
    attackFormula: string | null;
    damageFormula: string | null;
    position: { x: number; y: number };
  } | null>(null);

  const [orbitTooltipState, setOrbitTooltipState] = useState<{
    text: string;
    position: { x: number; y: number };
  } | null>(null);
  
  // Light editor state for double-click editing
  const [lightEditorState, setLightEditorState] = useState<{
    lightId: string;
    position: { x: number; y: number };
  } | null>(null);
  

  const lightDragRef = useRef<{
    isDragging: boolean;
    lightId: string | null;
    startX: number;
    startY: number;
    isNewLight: boolean;
    hasDragged: boolean; // Track if drag occurred for radius calculation
  }>({ isDragging: false, lightId: null, startX: 0, startY: 0, isNewLight: false, hasDragged: false });
  
  // Track audio source dragging for new audio sources (pull to size)
  const audioDragRef = useRef<{
    isDragging: boolean;
    audioSourceId: string | null;
    startX: number;
    startY: number;
    isNewAudioSource: boolean;
    hasDragged: boolean; // Track if drag occurred for radius calculation
  }>({ isDragging: false, audioSourceId: null, startX: 0, startY: 0, isNewAudioSource: false, hasDragged: false });
  
  // Selected light state for keyboard delete
  const [selectedLightIds, setSelectedLightIds] = useState<string[]>([]);
  // Selected audio source state
  const [selectedAudioSourceIds, setSelectedAudioSourceIds] = useState<string[]>([]);
  const [selectedParticleEmitterKeys, setSelectedParticleEmitterKeys] = useState<string[]>([]);
  
  // Audio source editor state for double-click editing
  const [audioSourceEditorState, setAudioSourceEditorState] = useState<{
    audioSourceId: string;
    position: { x: number; y: number };
  } | null>(null);
  
  // Track pending light creation (before actual drag threshold is met)
  const pendingLightRef = useRef<{
    pending: boolean;
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);

  // Track pending audio source creation (before actual drag threshold is met)
  const pendingAudioSourceRef = useRef<{
    pending: boolean;
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);
  
  // Track shift key state for free placement mode
  const shiftKeyRef = useRef(false);
  const ctrlKeyRef = useRef(false);
  
  const barEditorRef = useRef(false);
  
  const isMiddleMouseDownRef = useRef(false);
  const [toolbarIsResizing, setToolbarIsResizing] = useState(false);
  const [toolbarIsDragging, setToolbarIsDragging] = useState(false);
  const [toolbarDragOffset, setToolbarDragOffset] = useState({ x: 0, y: 0 });
  const [toolbarPosition, setToolbarPosition] = useState({ x: 10, y: 200 });

  // Center toolbar vertically when app is ready
  useEffect(() => {
    if (appReady && appRef.current) {
      const canvasHeight = appRef.current.screen.height;
      setToolbarPosition({ x: 10, y: Math.floor(canvasHeight / 2 - 200) });
    }
  }, [appReady]);
  
  // Refs for tool buttons to anchor panels
  const measureBtnRef = useRef<HTMLButtonElement>(null);
  const fogBtnRef = useRef<HTMLButtonElement>(null);
  const lightBtnRef = useRef<HTMLButtonElement>(null);
  const particleBtnRef = useRef<HTMLButtonElement>(null);
  const selectBtnRef = useRef<HTMLButtonElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const fogPanelRef = useRef<HTMLDivElement>(null);
  const gridUnitPanelRef = useRef<HTMLDivElement>(null);
  const particlePanelRef = useRef<HTMLDivElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  
  // Panel positions anchored to tool buttons
  const [gridUnitPanelPos, setGridUnitPanelPos] = useState({ top: 0, left: 0 });
  const [fogPanelPos, setFogPanelPos] = useState({ top: 0, left: 0 });
  const [particlePanelPos, setParticlePanelPos] = useState({ top: 0, left: 0 });
  const [particlePanelManualPos, setParticlePanelManualPos] = useState<{ top: number; left: number } | null>(null);
  const [particlePanelSize, setParticlePanelSize] = useState({ width: 720, height: 520 });
  const [particlePanelDismissed, setParticlePanelDismissed] = useState(false);
  const particlePanelDragRef = useRef<{
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    panelWidth: number;
    panelHeight: number;
    containerWidth: number;
    containerHeight: number;
  } | null>(null);
  const particlePanelResizeRef = useRef<{
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);
  const [filterPanelPos, setFilterPanelPos] = useState({ top: 0, left: 0 });
  

  const [smokeEnabled, setSmokeEnabled] = useState(VISUAL_OPTIONS.fogEnabled);
  const [fogShift, setFogShift] = useState(VISUAL_OPTIONS.fogShift);
  const [fogDirection, setFogDirection] = useState(VISUAL_OPTIONS.fogDirection);
  const [fogColor1, setFogColor1] = useState(VISUAL_OPTIONS.fogColor1);
  const [fogColor2, setFogColor2] = useState(VISUAL_OPTIONS.fogColor2);
  const [fogIntensity, setFogIntensity] = useState(VISUAL_OPTIONS.fogIntensity);
  const [fogSpeed, setFogSpeed] = useState(VISUAL_OPTIONS.fogSpeed);
  
  const [showPerformanceDebug, setShowPerformanceDebug] = useState(false);
  const [fps, setFps] = useState(0);
  const [rendererType, setRendererType] = useState<string>('unknown');
  

  useEffect(() => {
    const fogSystem = getAtmosphericFogSystem();
    atmosphericFogSystemRef.current = fogSystem;
    if (fogSystem.isInitialized) {
      // Apply initial smoke settings
      fogSystem.setUseSmokeShader(smokeEnabled);
      fogSystem.setShift(fogShift);
      fogSystem.setSmokeDirection(fogDirection);
      fogSystem.setSmokeColor1(fogColor1);
      fogSystem.setSmokeColor2(fogColor2);
    }
  }, []);

  // Apply smoke enabled setting when it changes
  useEffect(() => {
    if (atmosphericFogSystemRef.current) {
      atmosphericFogSystemRef.current.setEnabled(smokeEnabled);
    }
    // Update local state
    setFogEnabled(smokeEnabled);
    // Save to server (only GM can save)
    if (useGameStore.getState().isGM) {
      socketService.updateTimeSettings({ fogEnabled: smokeEnabled });
    }
  }, [smokeEnabled]);

  // Apply fog shift when it changes
  useEffect(() => {
    if (atmosphericFogSystemRef.current) {
      atmosphericFogSystemRef.current.setShift(fogShift);
    }
    // Update local state
    setFogShift(fogShift);
    // Save to server (only GM can save)
    if (useGameStore.getState().isGM) {
      socketService.updateTimeSettings({ fogShift });
    }
  }, [fogShift]);

  // Apply fog direction when it changes
  useEffect(() => {
    if (atmosphericFogSystemRef.current) {
      atmosphericFogSystemRef.current.setSmokeDirection(fogDirection);
    }
    // Update local state
    setFogDirection(fogDirection);
    // Save to server (only GM can save)
    if (useGameStore.getState().isGM) {
      socketService.updateTimeSettings({ fogDirection });
    }
  }, [fogDirection]);

  // Apply fog color 1 when it changes
  useEffect(() => {
    if (atmosphericFogSystemRef.current) {
      atmosphericFogSystemRef.current.setSmokeColor1(fogColor1);
    }
    // Update local state
    setFogColor1(fogColor1);
    // Save to server (only GM can save)
    if (useGameStore.getState().isGM) {
      socketService.updateTimeSettings({ fogColor1 });
    }
  }, [fogColor1]);

  // Apply fog color 2 when it changes
  useEffect(() => {
    if (atmosphericFogSystemRef.current) {
      atmosphericFogSystemRef.current.setSmokeColor2(fogColor2);
    }
    // Update local state
    setFogColor2(fogColor2);
    // Save to server (only GM can save)
    if (useGameStore.getState().isGM) {
      socketService.updateTimeSettings({ fogColor2 });
    }
  }, [fogColor2]);

  // Apply fog intensity when it changes
  useEffect(() => {
    if (atmosphericFogSystemRef.current) {
      atmosphericFogSystemRef.current.setIntensity(fogIntensity);
    }
    // Update local state
    setFogIntensity(fogIntensity);
    // Save to server (only GM can save)
    if (useGameStore.getState().isGM) {
      socketService.updateTimeSettings({ fogIntensity });
    }
  }, [fogIntensity]);

  // Apply fog speed when it changes
  useEffect(() => {
    if (atmosphericFogSystemRef.current) {
      atmosphericFogSystemRef.current.setSpeed(fogSpeed);
    }
    // Update local state
    setFogSpeed(fogSpeed);
    // Save to server (only GM can save)
    if (useGameStore.getState().isGM) {
      socketService.updateTimeSettings({ fogSpeed });
    }
  }, [fogSpeed]);

  // Track shift key for free placement mode (no grid snapping)
  // Track ctrl key for cell center snapping (instead of grid intersection)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        shiftKeyRef.current = true;
      }
      if (e.key === 'Control') {
        ctrlKeyRef.current = true;
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        shiftKeyRef.current = false;
      }
      if (e.key === 'Control') {
        ctrlKeyRef.current = false;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Particle Emitter Tool state - using gameStore with setters
  const particleSystemRef = useRef<ReturnType<typeof getParticleSystem> | null>(null);
  const particlePresetUnsubRef = useRef<(() => void) | null>(null);
  const manualEmitterRef = useRef<Array<{
    key: string;
    x: number;
    y: number;
    presetId: string;
    overrides?: Partial<ParticlePreset>;
  }>>([]);
  const [manualEmitters, setManualEmitters] = useState<Array<{
    key: string;
    x: number;
    y: number;
    presetId: string;
    overrides?: Partial<ParticlePreset>;
  }>>([]);
  const [activeEmitterEditKey, setActiveEmitterEditKey] = useState<string | null>(null);

  const serializeManualEmitters = useCallback(
    (
      emitters: Array<{
        key: string;
        x: number;
        y: number;
        presetId: string;
        overrides?: Partial<ParticlePreset>;
      }>
    ): SceneParticleEmitterConfig[] => (
      emitters.map((emitter) => ({
        key: emitter.key,
        x: emitter.x,
        y: emitter.y,
        presetId: emitter.presetId,
        overrides: emitter.overrides as Record<string, unknown> | undefined,
      }))
    ),
    []
  );
  
  // Time overlay system ref
  const timeOverlaySystemRef = useRef<TimeOverlaySystem | null>(null);

  const fogDragRef = useRef<{
    active: boolean;
    start: { x: number; y: number } | null;
    current: { x: number; y: number } | null;
    preview: PIXI.Graphics | null;
  }>({
    active: false,
    start: null,
    current: null,
    preview: null,
  });
  const fogPolygonRef = useRef<{
    active: boolean;
    points: Array<{ x: number; y: number }>;
    cursor: { x: number; y: number } | null;
    preview: PIXI.Graphics | null;
  }>({
    active: false,
    points: [],
    cursor: null,
    preview: null,
  });
  const fogFreeDrawRef = useRef<{
    active: boolean;
    points: Array<{ x: number; y: number }>;
  }>({
    active: false,
    points: [],
  });
  const fogGridRef = useRef<{
    active: boolean;
    cells: Map<string, { x: number; y: number; w: number; h: number }>;
    lastCellKey: string | null;
  }>({
    active: false,
    cells: new Map(),
    lastCellKey: null,
  });

  // DEBUG: Pencil circles ref - tracks circles drawn during pencil mode
  const fogPencilRef = useRef<{
    active: boolean;
    circles: Map<string, { x: number; y: number; radius: number }>;
    lastCircleKey: string | null;
  }>({
    active: false,
    circles: new Map(),
    lastCircleKey: null,
  });
  const fogActionRef = useRef<'reveal' | 'add' | null>(null);

  // Right-click fog drawing (add fog/erase) - continuous drag support
  const fogRightClickRef = useRef<{
    active: boolean;
    isDrawing: boolean; // true = drawing (revealing), false = adding fog
    circles: Map<string, { x: number; y: number; radius: number }>;
    lastCircleKey: string | null;
    preview: PIXI.Graphics | null;
  }>({
    active: false,
    isDrawing: false,
    circles: new Map(),
    lastCircleKey: null,
    preview: null,
  });

  // Cursor position for fog tool preview (shows brush even when not drawing)
  const fogCursorRef = useRef<{ x: number; y: number } | null>(null);

  // Stage transform state for light icons overlay
  const [stageTransform, setStageTransform] = useState({ x: 0, y: 0, scale: 1 });
  const stageTransformRef = useRef({ x: 0, y: 0, scale: 1 });
  const lastStageTransformSentRef = useRef({ x: 0, y: 0, scale: 1 });
  const prefersReducedMotionRef = useRef(false);
  const screenShakeRuntimeRef = useRef<ScreenShakeRuntimeState>({
    active: false,
    startedAt: 0,
    durationMs: 260,
    amplitudePx: 0,
    frequency: 26,
    decay: 4.2,
    offsetX: 0,
    offsetY: 0,
    baseX: 0,
    baseY: 0,
  });

  const applyStageTransformWithShake = useCallback(
    (app: PIXI.Application, x: number, y: number, nextScale?: number) => {
      const shake = screenShakeRuntimeRef.current;
      shake.baseX = x;
      shake.baseY = y;
      if (typeof nextScale === 'number') {
        app.stage.scale.set(nextScale);
      }
      app.stage.position.set(x + shake.offsetX, y + shake.offsetY);
    },
    []
  );

  // Fog redraw throttling to avoid continuous full-canvas redraws when idle.
  const fogRedrawPendingRef = useRef(true);
  const fogLastDrawTimeRef = useRef(0);
  const fogLastTransformRef = useRef({ x: 0, y: 0, scale: 1 });

  // Handle drag for toolbar using window events (like CombatTracker)
  useEffect(() => {
    if (!toolbarIsDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setToolbarPosition({
        x: e.clientX - toolbarDragOffset.x,
        y: e.clientY - toolbarDragOffset.y,
      });
    };

    const handleMouseUp = () => {
      setToolbarIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [toolbarIsDragging, toolbarDragOffset]);

  // Handle resize for toolbar using window events
  useEffect(() => {
    if (!toolbarIsResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(60, e.clientX - toolbarPosition.x);
      const newHeight = Math.max(50, e.clientY - toolbarPosition.y);
      setToolbarWidth(newWidth);
      setToolbarHeight(newHeight);
    };

    const handleMouseUp = () => {
      setToolbarIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [toolbarIsResizing, toolbarPosition]);

  const { 
    currentBoard, 
    tokens, 
    fogReveals,
    fogAdds,
    lights,
    audioSources,
    tool, 
    setTool, 
    selectableTypes,
    toggleSelectableType,
    addLight, 
    updateLight,
    removeLight,
    addAudioSource,
    updateAudioSource,
    removeAudioSource,
    selectedTokenId, 
    selectedTokenIds,
    isGM, 
    session,
    user,
    players,
    setSelectedToken,
    setSelectedTokenIds,
    showMoveMeasure,
    setShowMoveMeasure,
    backgroundColor,
    gridColor,
    setBackgroundColor,
    setGridColor,
    gridSize,
    mapBleedEnabled,
    mapBleedFeather,
    mapBleedBlur,
    mapBleedVignette,
    mapBleedScale,
    sceneMapBleedOverrideEnabled,
    sceneMapBleedEnabled,
    sceneMapBleedFeather,
    sceneMapBleedBlur,
    sceneMapBleedVignette,
    sceneMapBleedScale,
    setGridSize,
    gridOffsetX,
    gridOffsetY,
    setGridOffsetX,
    setGridOffsetY,
    gridUnit,
    gridType,
    gridStyle,
    gridStyleAmount,
    gridOpacity,
    setGridUnit,
    setGridType,
    setGridStyleAmount,
    gridEditMode,
    panFriction,
    setPanFriction,
    panEnabled,
    setPanEnabled,
    focusOnSelectedKey,
    squareValue,
    toolbarWidth,
    setToolbarWidth,
    panelFocus,
    setPanelFocus,
    toolbarHeight,
    setToolbarHeight,
    dragMode,
    tokenContextMenu,
    setTokenContextMenu,
    pendingDropType,
    setPendingDropType,
    colorScheme,
    statusIconColor,
    weatherType,
    weatherIntensity,
    weatherSpeed,
    weatherTextureUrl,
    weatherSize,
    weatherColor,
    weatherDirection,
    weatherWobble,
    weatherWobbleAmplitude,
    weatherParticleShape,
    weatherOpacity,
    setWeatherType,
    setWeatherIntensity,
    setWeatherSpeed,
    setWeatherTextureUrl,
    weatherVisible,
    toggleWeather,
    activeWeatherEffects,
    weatherFilterEffects,
    addCombatant,
    removeCombatant,
    isTokenInCombat,
    isInCombat,
    combatants,
    currentTurnIndex,
    defaultShowTokenName,
    defaultShowPlayerHp,
    defaultShowOtherHp,
    defaultTokenDisposition,
    tokenHpSource,
    tokenDisplayMode,
    tweenSettings,
    screenShakeSettings,
    fogDrawMode,
    setFogDrawMode,
    gmFogOpacity,
    setGmFogOpacity,
    pencilSize,
    setPencilSize,
    pencilSmoothness,
    pencilDrawRate,
    pencilFogColor,
    fogSnapToGrid,
    particlePreset,
    setParticlePreset,
    particleEmitterSize,
    setParticleEmitterSize,
    particleEmitterVisible,
    setParticleEmitterVisible,
    toggleParticleEmitter,
    particleEmitterPosition,
    setParticleEmitterPosition,
    particleEmitterSizeState,
    setParticleEmitterSizeState,
    sceneParticleEmitters,
    setSceneParticleEmitters,
    // Time overlay state
    gameTimeSeconds,
    timeOverlayEnabled,
    timeOverlayOpacity,
    setTimeOverlayEnabled,
    setTimeOverlayOpacity,
    turnTokenImageUrl,
  } = useGameStore();

  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => {
      prefersReducedMotionRef.current = media.matches;
    };
    updatePreference();
    media.addEventListener('change', updatePreference);
    return () => {
      media.removeEventListener('change', updatePreference);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadActions = async () => {
      const candidates = tokens.filter((token) => {
        const tokenData = (token.properties || {}) as Record<string, unknown>;
        const linkedCreatureId = typeof token.creatureId === 'string'
          ? token.creatureId
          : typeof tokenData.creatureId === 'string'
            ? tokenData.creatureId
            : null;
        return !!linkedCreatureId && !linkedCreatureActionsCacheRef.current.has(linkedCreatureId);
      });

      for (const token of candidates) {
        const tokenData = (token.properties || {}) as Record<string, unknown>;
        const linkedCreatureId = typeof token.creatureId === 'string'
          ? token.creatureId
          : typeof tokenData.creatureId === 'string'
            ? tokenData.creatureId
            : null;
        if (!linkedCreatureId) continue;

        try {
          const response = await fetch(`/api/data/compendium/entry/${encodeURIComponent(linkedCreatureId)}`);
          if (!response.ok) {
            linkedCreatureActionsCacheRef.current.set(linkedCreatureId, []);
            continue;
          }
          const payload = await response.json();
          const item = payload?.data ?? payload;
          linkedCreatureActionsCacheRef.current.set(linkedCreatureId, extractMonsterActionEntries(item));
          const system = item?.system && typeof item.system === 'object' ? item.system : item;
          linkedCreatureStatsCacheRef.current.set(linkedCreatureId, {
            passive: (system?.passive ?? null) as string | number | null,
            senses: typeof system?.senses === 'string' ? system.senses : null,
            darkvision: (system?.darkvision ?? null) as string | number | null,
            speed: system?.speed,
            movement: (system?.movement ?? null) as string | number | null,
          });
          if (!cancelled) setLinkedCreatureActionsVersion((v) => v + 1);
        } catch {
          linkedCreatureActionsCacheRef.current.set(linkedCreatureId, []);
        }
      }
    };

    loadActions();
    return () => {
      cancelled = true;
    };
  }, [tokens]);

  const rollFromTokenAction = useCallback(async (formula: string, tokenName: string, actionName: string) => {
    try {
      const result = await requestAuthoritativeRoll({ formula, source: 'chat', visibility: 'public' });
      socketService.sendChatMessage(`🎲 ${tokenName} • ${actionName} • ${formula} = ${result.total}`);
      socketService.sendChatMessage(`⚔️ ${tokenName} • ${actionName} • ${formula}`);
    } catch (error) {
      console.warn('[Token Action] authoritative roll failed:', error);
    }
  }, []);

  // Deselect lights when switching to audio tool, and vice versa
  useEffect(() => {
    if (tool === 'audio') {
      // When switching to audio tool, deselect all lights
      setSelectedLightIds([]);
    } else if (tool === 'light') {
      // When switching to light tool, deselect all audio sources
      setSelectedAudioSourceIds([]);
    } else if (tool === 'particle') {
      setSelectedLightIds([]);
      setSelectedAudioSourceIds([]);
    }
  }, [tool]);

  // Pencil/brush size for circle reveal mode - using gameStore
  // Use ref to avoid stale closure in event handlers
  const pencilSizeRef = useRef(pencilSize);
  pencilSizeRef.current = pencilSize;
  
  // Get pencil settings from gameStore
  const getPencilSettings = () => ({
    smoothness: pencilSmoothness,
    drawRate: pencilDrawRate,
    fogColor: pencilFogColor
  });

  // Get current user's player color from the store (profile panel) or fall back to session data
  const { playerColor: storePlayerColor } = useGameStore();
  const currentPlayer = players.find(p => p.userId === user?.id);
  const isCurrentUserGM = session?.gmId === user?.id;
  // Use store color as primary, then session player color, then fallbacks
  const playerColor = storePlayerColor || currentPlayer?.playerColor || (isCurrentUserGM ? DEFAULT_GM_PLAYER_COLOR : DEFAULT_PLAYER_COLOR);
  const dmPlayer = players.find(p => p.role === 'gm');
  const dmColor = dmPlayer?.playerColor || playerColor;
  const measureColor = isCurrentUserGM ? dmColor : playerColor;
  const measureColorNumber = parseInt(measureColor.replace('#', ''), 16);

  // Generate dynamic button styles based on background color
  const activatedToolBtnStyle = useMemo(() => {
    const bgHex = `#${backgroundColor.toString(16).padStart(6, '0')}`;
    return { color: getActivatedTextColor(bgHex) };
  }, [backgroundColor]);

  const effectiveMapBleed = useMemo<ResolvedMapBleedSettings>(() => {
    if (sceneMapBleedOverrideEnabled) {
      return {
        enabled: sceneMapBleedEnabled,
        feather: Math.max(20, Math.min(480, sceneMapBleedFeather)),
        blur: Math.max(0, Math.min(80, sceneMapBleedBlur)),
        vignette: Math.max(0, Math.min(1, sceneMapBleedVignette)),
        scale: Math.max(1, Math.min(1.35, sceneMapBleedScale)),
      };
    }
    return {
      enabled: mapBleedEnabled,
      feather: Math.max(20, Math.min(480, mapBleedFeather)),
      blur: Math.max(0, Math.min(80, mapBleedBlur)),
      vignette: Math.max(0, Math.min(1, mapBleedVignette)),
      scale: Math.max(1, Math.min(1.35, mapBleedScale)),
    };
  }, [
    mapBleedEnabled,
    mapBleedFeather,
    mapBleedBlur,
    mapBleedVignette,
    mapBleedScale,
    sceneMapBleedOverrideEnabled,
    sceneMapBleedEnabled,
    sceneMapBleedFeather,
    sceneMapBleedBlur,
    sceneMapBleedVignette,
    sceneMapBleedScale,
  ]);

  const particlePresetNameMap = useMemo(() => {
    const map = new Map<string, string>();
    getParticlePresets().forEach((preset) => {
      map.set(preset.id, preset.name);
    });
    return map;
  }, [particlePreset]);

  const activeEmitterEdit = useMemo(() => {
    if (!activeEmitterEditKey) return null;
    return manualEmitters.find((emitter) => emitter.key === activeEmitterEditKey) ?? null;
  }, [activeEmitterEditKey, manualEmitters]);

  const handleEmitterOverrideChange = useCallback(
    (key: string, overrides: Partial<ParticlePreset>) => {
      const system = particleSystemRef.current;
      if (system) {
        system.updateByToken(key, overrides);
      }
      for (let i = 0; i < manualEmitterRef.current.length; i++) {
        if (manualEmitterRef.current[i].key === key) {
          manualEmitterRef.current[i] = {
            ...manualEmitterRef.current[i],
            overrides,
          };
          break;
        }
      }
      const nextEmitters = [...manualEmitterRef.current];
      setManualEmitters(nextEmitters);
      setSceneParticleEmitters(serializeManualEmitters(nextEmitters));
    },
    [serializeManualEmitters, setSceneParticleEmitters]
  );

  // Update tool panel positions when toolbar resizes or tool changes
  useLayoutEffect(() => {
    const panelGap = 10;
    const viewportPadding = 8;
    const updateAnchoredPanelPosition = (
      btnRef: React.RefObject<HTMLButtonElement>,
      panelRef: React.RefObject<HTMLDivElement>,
      setPos: (pos: { top: number; left: number }) => void
    ) => {
      const btn = btnRef.current;
      const panel = panelRef.current;
      const toolbar = toolbarRef.current;
      const container = containerRef.current;
      if (!btn || !panel || !toolbar || !container) return;

      const panelRect = panel.getBoundingClientRect();
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      const toolbarRight = toolbar.offsetLeft + toolbar.offsetWidth;
      const buttonCenterY = toolbar.offsetTop + btn.offsetTop + (btn.offsetHeight / 2);

      let left = toolbarRight + panelGap;
      let top = buttonCenterY - (panelRect.height / 2);

      left = Math.max(
        viewportPadding,
        Math.min(left, containerWidth - panelRect.width - viewportPadding)
      );
      top = Math.max(
        viewportPadding,
        Math.min(top, containerHeight - panelRect.height - viewportPadding)
      );

      setPos({ top, left });
    };
    
    const updateAllPositions = () => {
      if (tool === 'measure' && measureBtnRef.current && currentBoard) {
        updateAnchoredPanelPosition(measureBtnRef, gridUnitPanelRef, setGridUnitPanelPos);
      }
      if (tool === 'fog' && fogBtnRef.current && currentBoard) {
        updateAnchoredPanelPosition(fogBtnRef, fogPanelRef, setFogPanelPos);
      }
      if (tool === 'particle' && particleBtnRef.current && currentBoard && !particlePanelManualPos) {
        updateAnchoredPanelPosition(particleBtnRef, particlePanelRef, setParticlePanelPos);
      }
      if (tool === 'select' && selectBtnRef.current) {
        updateAnchoredPanelPosition(selectBtnRef, filterPanelRef, setFilterPanelPos);
      }
    };
    
    updateAllPositions();
    
    // Add resize listener to update position when toolbar resizes
    window.addEventListener('resize', updateAllPositions);
    return () => window.removeEventListener('resize', updateAllPositions);
  }, [tool, toolbarWidth, toolbarHeight, toolbarPosition, currentBoard, particlePanelManualPos]);

  // Reset particle panel dismissed state when tool changes to 'particle'
  useEffect(() => {
    if (tool === 'particle') {
      setParticlePanelDismissed(false);
    }
  }, [tool]);

  const startParticlePanelDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const panel = particlePanelRef.current;
    const container = containerRef.current;
    if (!panel || !container) return;
    const panelRect = panel.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const startLeft = panelRect.left - containerRect.left;
    const startTop = panelRect.top - containerRect.top;
    particlePanelDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startLeft,
      startTop,
      panelWidth: panelRect.width,
      panelHeight: panelRect.height,
      containerWidth: containerRect.width,
      containerHeight: containerRect.height,
    };
    setParticlePanelManualPos({ top: startTop, left: startLeft });
    setParticleEmitterPosition({ x: startLeft, y: startTop });

    const handleMove = (moveEvent: PointerEvent) => {
      const drag = particlePanelDragRef.current;
      if (!drag) return;
      const deltaX = moveEvent.clientX - drag.startX;
      const deltaY = moveEvent.clientY - drag.startY;
      const padding = 8;
      const maxLeft = Math.max(padding, drag.containerWidth - drag.panelWidth - padding);
      const maxTop = Math.max(padding, drag.containerHeight - drag.panelHeight - padding);
      const nextLeft = Math.min(maxLeft, Math.max(padding, drag.startLeft + deltaX));
      const nextTop = Math.min(maxTop, Math.max(padding, drag.startTop + deltaY));
      setParticlePanelManualPos({ top: nextTop, left: nextLeft });
      setParticleEmitterPosition({ x: nextLeft, y: nextTop });
    };

    const handleUp = () => {
      particlePanelDragRef.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const startParticlePanelResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    particlePanelResizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: particleEmitterSizeState.width,
      startHeight: particleEmitterSizeState.height,
    };

    const handleMove = (moveEvent: PointerEvent) => {
      const resize = particlePanelResizeRef.current;
      if (!resize) return;
      const nextWidth = Math.max(560, resize.startWidth + (moveEvent.clientX - resize.startX));
      const nextHeight = Math.max(420, resize.startHeight + (moveEvent.clientY - resize.startY));
      setParticleEmitterSizeState({ width: nextWidth, height: nextHeight });
    };

    const handleUp = () => {
      particlePanelResizeRef.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  // Update animation manager when tween settings change
  useEffect(() => {
    if (tokenAnimationManagerRef.current) {
      tokenAnimationManagerRef.current.setSettings(tweenSettings);
    }
  }, [tweenSettings]);
  
  // Update time overlay when game time changes
  useEffect(() => {
    if (timeOverlaySystemRef.current && appReady) {
      timeOverlaySystemRef.current.update(gameTimeSeconds);
    }
  }, [gameTimeSeconds, appReady]);
  
  // Update time overlay enabled state
  useEffect(() => {
    if (timeOverlaySystemRef.current) {
      timeOverlaySystemRef.current.setEnabled(timeOverlayEnabled);
    }
  }, [timeOverlayEnabled]);
  
  // Update time overlay opacity
  useEffect(() => {
    if (timeOverlaySystemRef.current) {
      timeOverlaySystemRef.current.setOpacity(timeOverlayOpacity);
    }
  }, [timeOverlayOpacity]);
  
  // Update time overlay position to match board dimensions
  useEffect(() => {
    const app = appRef.current;
    if (!app || !appReady || !timeOverlaySystemRef.current) return;
    
    const width = currentBoard?.width ?? app.screen.width;
    const height = currentBoard?.height ?? app.screen.height;
    timeOverlaySystemRef.current.updatePosition(0, 0, width, height);
    
    // Also update atmospheric fog position
    if (atmosphericFogSystemRef.current) {
      atmosphericFogSystemRef.current.updatePosition(0, 0, width, height);
    }
  }, [currentBoard, appReady]);
  
  // Map icon names to Font Awesome Unicode for canvas rendering
  // Using Font Awesome 6 Free Solid icons
  const iconToFaUnicode: Record<string, string> = {
    // Status IDs used in the status editor
    'poisoned': '\uf0c3',     // Flask
    'diseased': '\uf7fa',    // virus
    'blinded': '\uF06E',     // eye
    'charmed': '\uf587',     // face-stars
    'frightened': '\uf5c2',  // face-suprised
    'paralyzed': '\uF0E7',   // bolt
    'unconscious': '\uf567',  // face-dizzy
    'exhaustion': '\uf5c8',   // tired
    // Icon names
    'heart': '\uF004',
    'heart-crack': '\uF7A2',
    'tint': '\uF043',
    'certificate': '\uF0A3',
    'skull': '\uF54C',
    'fire': '\uF06A',
    'shield': '\uF3ED',
    'hand-fist': '\uF6DE',
    'user-secret': '\uF21B',
    'moon': '\uF186',
    'bug': '\uF188',
    'face-dizzy': '\uF567',
    'eye': '\uF06E',      // eye (blinded)
    'bolt': '\uF0E7',     // bolt (paralyzed)
    'tired': '\uF634',    // tired (exhaustion)
    'virus': '\uF2DD',    // virus (diseased)
    // Light icon
    'lightbulb': '\uf0eb', // Font Awesome lightbulb (from npm package)
    // Magical Enchantment Status Icons
    'wand-magic-sparkles': '\uF8EA', // magic wand
    'skull-crossbones': '\uF714', // skull crossbones
    'brain': '\uF5DC', // brain
    'ghost': '\uF6F8', // ghost
    'droplet': '\uF543', // droplet
    'chains': '\uF255', // chains
    'feather': '\uF57B', // feather
    'flask': '\uF6E1', // flask
    'mountain': '\uF6FC', // mountain
    'wind': '\uF72E', // wind
    'ear-lobes': '\uF302', // ear
    'sick': '\uF7BA', // sick
    'circle-radiation': '\uF7D9', // radiation
    'spell': '\uF6E8', // spell
    'hat-wizard': '\uF6E8', // wizard hat
    'ring': '\uF2A5', // ring
    'anchor': '\uF13D', // anchor
    'temperature-high': '\uF769', // temperature high
    'temperature-low': '\uF76B', // temperature low
    'cloud-bolt': '\uF76C', // cloud bolt
    'hand-holding-droplet': '\uF7C3', // hand holding droplet
    'cloud-rain': '\uF73D', // cloud rain
    'cloud': '\uF68C', // cloud
    'vial': '\uF492', // vial
    'smog': '\uF75E', // smog
    'spider': '\uF717', // spider
    'paw': '\uF6B1', // paw
    'shoe-prints': '\uF6B1', // shoe prints
    'arrow-up': '\uF341', // arrow up
    'dragon': '\uF6D5', // dragon
    'mask': '\uF612', // mask
    'fingerprint': '\uF577', // fingerprint
    'key': '\uF084', // key
    'door-open': '\uF52B', // door open
    'gem': '\uF3A5', // gem
    'coins': '\uF51E', // coins
  };

  const lightBlendModeMap: Record<NonNullable<Light['blendMode']>, BLEND_MODES> = {
    normal: 'normal' as BLEND_MODES,
    add: 'add' as BLEND_MODES,
    multiply: 'multiply' as BLEND_MODES,
    screen: 'screen' as BLEND_MODES,
    overlay: 'overlay' as BLEND_MODES,
    darken: 'darken' as BLEND_MODES,
    lighten: 'lighten' as BLEND_MODES,
    'color-dodge': 'color-dodge' as BLEND_MODES,
    'color-burn': 'color-burn' as BLEND_MODES,
    'hard-light': 'hard-light' as BLEND_MODES,
    'soft-light': 'soft-light' as BLEND_MODES,
    difference: 'difference' as BLEND_MODES,
    exclusion: 'exclusion' as BLEND_MODES,
    hue: 'hue' as BLEND_MODES,
    saturation: 'saturation' as BLEND_MODES,
    color: 'color' as BLEND_MODES,
    luminosity: 'luminosity' as BLEND_MODES,
  };

  // Light renderer hook - manages light rendering with PIXI
  const { refs: lightRendererRefs, initLightLayer, renderLights: renderLightsFromHook } = useLightRenderer({
    app: appRef.current,
    lights,
    selectedLightIds,
    gridCellPx: gridSize,
    isGM,
    tool,
    enabled: true,
    showIcons: false, // Use HTML overlay for icons instead
    onLightDoubleClick: (light, screenPos) => {
      setLightEditorState({
        lightId: light.id,
        position: { x: screenPos.x, y: screenPos.y },
      });
    },
  });
  
  // Spatial audio hook - manages audio playback with distance attenuation
  const { getListenerPosition, getSourceVolume } = useSpatialAudio();

  // Initialize light layer and render lights when app is ready
  useEffect(() => {
    if (!appRef.current || !currentBoard) return;
    initLightLayer();
    renderLightsFromHook();
  }, [appReady, currentBoard, lights, selectedLightIds, isGM, tool]);

  // Sync stage transform for light icons overlay
  useEffect(() => {
    if (!appRef.current) return;
    
    let animationId: number;
    let lastSyncTime = 0;
    const syncStageTransform = (ts: number) => {
      if (appRef.current) {
        const stage = appRef.current.stage;
        const next = {
          x: stage.position.x,
          y: stage.position.y,
          scale: stage.scale.x,
        };
        stageTransformRef.current = next;

        const prevSent = lastStageTransformSentRef.current;
        const changed =
          Math.abs(next.x - prevSent.x) > 0.25 ||
          Math.abs(next.y - prevSent.y) > 0.25 ||
          Math.abs(next.scale - prevSent.scale) > 0.001;
        
        if (changed && ts - lastSyncTime > 33) {
          lastStageTransformSentRef.current = next;
          lastSyncTime = ts;
          setStageTransform(next);
        }
      }
      animationId = requestAnimationFrame(syncStageTransform);
    };
    
    animationId = requestAnimationFrame(syncStageTransform);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [appReady]);

  const handleTokenRightClick = (tokenId: string, clientX: number, clientY: number) => {
    if (!isGM) return;
    // Only open the menu if it's not already open for this token
    if (!tokenContextMenu || tokenContextMenu.tokenId !== tokenId) {
      setTokenContextMenu({ x: clientX, y: clientY, tokenId });
    }
  };
  

  // Helper to get effective grid size (store value overrides board value)
  const effectiveGridSize = gridSize || currentBoard?.gridSize || 50;
  const effectiveGridType = gridType || currentBoard?.gridType || 'square';

  const snapToGridIntersection = useCallback((
    x: number,
    y: number,
    size: number = effectiveGridSize,
    offsetX: number = gridOffsetX,
    offsetY: number = gridOffsetY,
  ) => snapToGridIntersectionBase(x, y, size, offsetX, offsetY, effectiveGridType), [
    effectiveGridSize,
    gridOffsetX,
    gridOffsetY,
    effectiveGridType,
  ]);

  const snapToGridCellCenter = useCallback((
    x: number,
    y: number,
    size: number = effectiveGridSize,
    offsetX: number = gridOffsetX,
    offsetY: number = gridOffsetY,
  ) => snapToGridCellCenterBase(x, y, size, offsetX, offsetY, effectiveGridType), [
    effectiveGridSize,
    gridOffsetX,
    gridOffsetY,
    effectiveGridType,
  ]);

  const snapTokenToGrid = useCallback((
    x: number,
    y: number,
    tokenFootprint: number,
    size: number = effectiveGridSize,
    offsetX: number = gridOffsetX,
    offsetY: number = gridOffsetY,
  ) => snapTokenToGridBase(x, y, tokenFootprint, size, offsetX, offsetY, effectiveGridType), [
    effectiveGridSize,
    gridOffsetX,
    gridOffsetY,
    effectiveGridType,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('vtt_gm_fog_opacity', String(gmFogOpacity));
  }, [gmFogOpacity]);

  // Handle keyboard delete for selected tokens and lights
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle Delete or Backspace key
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      
      // Don't delete if user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      
      // Get selected tokens
      const state = useGameStore.getState();
      const tokensToDelete = state.selectedTokenIds.length > 0 
        ? state.selectedTokenIds 
        : state.selectedTokenId ? [state.selectedTokenId] : [];
      
      // Delete selected tokens
      if (tokensToDelete.length > 0) {
        e.preventDefault();
        for (const tokenId of tokensToDelete) {
          socketService.deleteToken(tokenId);
        }
        state.setSelectedTokenIds([]);
        state.setSelectedToken(null);
      }
      
      // Delete selected lights
      if (selectedLightIds && selectedLightIds.length > 0) {
        e.preventDefault();
        for (const lightId of selectedLightIds) {
          socketService.deleteLight(lightId);
          removeLight(lightId);
        }
        setSelectedLightIds([]);
      }
      
      // Delete selected audio sources
      if (selectedAudioSourceIds && selectedAudioSourceIds.length > 0) {
        e.preventDefault();
        for (const audioSourceId of selectedAudioSourceIds) {
          socketService.deleteAudioSource(audioSourceId);
          removeAudioSource(audioSourceId);
        }
        setSelectedAudioSourceIds([]);
      }

      // Delete selected particle emitters
      if (selectedParticleEmitterKeys.length > 0) {
        e.preventDefault();
        const system = particleSystemRef.current;
        const selectedSet = new Set(selectedParticleEmitterKeys);
        if (system) {
          for (const key of selectedParticleEmitterKeys) {
            system.stopByToken(key);
          }
        }
        manualEmitterRef.current = manualEmitterRef.current.filter((emitter) => !selectedSet.has(emitter.key));
        const nextEmitters = [...manualEmitterRef.current];
        setManualEmitters(nextEmitters);
        setSceneParticleEmitters(serializeManualEmitters(nextEmitters));
        if (activeEmitterEditKey && selectedSet.has(activeEmitterEditKey)) {
          setActiveEmitterEditKey(null);
        }
        setSelectedParticleEmitterKeys([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLightIds, selectedAudioSourceIds, selectedParticleEmitterKeys, removeLight, removeAudioSource, activeEmitterEditKey, serializeManualEmitters, setSceneParticleEmitters]);

  // Handle keyboard focus on selected objects (pan and zoom with smooth animation)
  useEffect(() => {
    let animationFrameId: number | null = null;
    let isAnimating = false;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if the pressed key matches the focusOnSelectedKey setting
      const state = useGameStore.getState();
      const key = state.focusOnSelectedKey?.toLowerCase();
      if (!key || e.key.toLowerCase() !== key) return;
      
      // Don't trigger if user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      
      // Prevent default behavior
      e.preventDefault();
      
      // Get all selected objects
      const selectedTokens = state.selectedTokenIds.length > 0 
        ? state.selectedTokenIds 
        : state.selectedTokenId ? [state.selectedTokenId] : [];
      const selectedLights = selectedLightIds || [];
      const selectedAudios = selectedAudioSourceIds || [];
      
      // Get positions from selected tokens
      const positions: { x: number; y: number }[] = [];
      
      // Add token positions
      for (const tokenId of selectedTokens) {
        const token = tokens.find(t => t.id === tokenId);
        if (token) {
          positions.push({ x: token.x, y: token.y });
        }
      }
      
      // Add light positions
      for (const lightId of selectedLights) {
        const light = lights.find(l => l.id === lightId);
        if (light) {
          positions.push({ x: light.x, y: light.y });
        }
      }
      
      // Add audio source positions
      for (const audioId of selectedAudios) {
        const audio = audioSources.find(a => a.id === audioId);
        if (audio) {
          positions.push({ x: audio.x, y: audio.y });
        }
      }
      
      // Add selected manual emitter positions
      if (selectedParticleEmitterKeys.length > 0) {
        const selectedSet = new Set(selectedParticleEmitterKeys);
        for (const emitter of manualEmitters) {
          if (selectedSet.has(emitter.key)) {
            positions.push({ x: emitter.x, y: emitter.y });
          }
        }
      }
      
      // Need at least one selected object
      if (positions.length === 0) return;
      
      // Calculate center point of all selected objects
      const centerX = positions.reduce((sum, pos) => sum + pos.x, 0) / positions.length;
      const centerY = positions.reduce((sum, pos) => sum + pos.y, 0) / positions.length;
      
      // Calculate bounding box of all selected objects
      const minX = Math.min(...positions.map(p => p.x));
      const maxX = Math.max(...positions.map(p => p.x));
      const minY = Math.min(...positions.map(p => p.y));
      const maxY = Math.max(...positions.map(p => p.y));
      
      const width = maxX - minX;
      const height = maxY - minY;
      
      // Get the canvas dimensions
      const app = appRef.current;
      if (!app) return;
      
      const canvasWidth = app.screen.width;
      const canvasHeight = app.screen.height;
      
      // Calculate scale to fit all selected objects with padding
      const padding = Math.max(canvasWidth, canvasHeight) * 0.1; // 10% padding
      const scaleX = (canvasWidth - padding * 2) / Math.max(width, 1);
      const scaleY = (canvasHeight - padding * 2) / Math.max(height, 1);
      const targetScale = Math.min(scaleX, scaleY, 1); // Don't zoom in more than 1x
      
      // Calculate the target position to center the objects
      const targetX = canvasWidth / 2 - centerX * targetScale;
      const targetY = canvasHeight / 2 - centerY * targetScale;
      
      // Get current position and scale
      const startX = app.stage.position.x;
      const startY = app.stage.position.y;
      const startScale = app.stage.scale.x;
      
      // If already at target, don't animate
      if (Math.abs(startX - targetX) < 1 && Math.abs(startY - targetY) < 1 && Math.abs(startScale - targetScale) < 0.01) {
        return;
      }
      
      // Animation parameters
      const duration = 400; // ms
      const startTime = performance.now();
      const lerpFactor = 0.12; // Smoothness factor (lower = smoother but slower)
      
      // Cancel any existing animation
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      
      isAnimating = true;
      
      const animate = (currentTime: number) => {
        if (!isAnimating) return;
        
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease out cubic function for smooth deceleration
        const easeOut = 1 - Math.pow(1 - progress, 3);
        
        // Lerp towards target
        const currentPosX = app.stage.position.x;
        const currentPosY = app.stage.position.y;
        const currentScaleVal = app.stage.scale.x;
        
        // Calculate new position with easing
        const newX = startX + (targetX - startX) * easeOut;
        const newY = startY + (targetY - startY) * easeOut;
        const newScale = startScale + (targetScale - startScale) * easeOut;
        
        // Apply the new position and scale
        applyStageTransformWithShake(app, newX, newY, newScale);
        
        // Update the grid overlay camera
        if (gridOverlayRef.current) {
          gridOverlayRef.current.updateCamera(newX, newY, newScale);
        }
        
        if (progress < 1) {
          animationFrameId = requestAnimationFrame(animate);
        } else {
          isAnimating = false;
          animationFrameId = null;
        }
      };
      
      animationFrameId = requestAnimationFrame(animate);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [focusOnSelectedKey, selectedLightIds, selectedAudioSourceIds, selectedParticleEmitterKeys, tokens, lights, audioSources, manualEmitters, applyStageTransformWithShake]);

  // Handle keyboard arrow keys for moving selected token
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle arrow keys
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      
      // Don't move if user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      
      // Get selected token
      const state = useGameStore.getState();
      const selectedTokenId = state.selectedTokenId;
      
      // Need a selected token to move
      if (!selectedTokenId) return;
      
      // Find the token in the tokens array
      const token = tokens.find(t => t.id === selectedTokenId);
      if (!token) return;
      
      // Don't move locked tokens
      if (token.locked) return;
      
      // Get grid size for movement
      const gridSize = effectiveGridSize || 50;
      
      // Calculate new position based on arrow key direction
      let newX = token.x;
      let newY = token.y;
      
      switch (e.key) {
        case 'ArrowUp':
          newY = token.y - gridSize;
          break;
        case 'ArrowDown':
          newY = token.y + gridSize;
          break;
        case 'ArrowLeft':
          newX = token.x - gridSize;
          break;
        case 'ArrowRight':
          newX = token.x + gridSize;
          break;
      }
      
      // Clamp to board boundaries if board exists
      if (currentBoard) {
        newX = Math.max(0, Math.min(currentBoard.width - (token.size * gridSize), newX));
        newY = Math.max(0, Math.min(currentBoard.height - (token.size * gridSize), newY));
      }
      
      // Only update if position actually changed
      if (newX !== token.x || newY !== token.y) {
        e.preventDefault();
        socketService.updateToken(selectedTokenId, { x: newX, y: newY });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tokens, currentBoard, effectiveGridSize]);

  const clampToBoard = useCallback((value: number, max: number) => {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(max, value));
  }, []);

  useEffect(() => {
    if (!appReady) return;

    return subscribeToTokenAnimations((request) => {
      const manager = tokenAnimationManagerRef.current;
      if (!manager) return;
      if (request.interrupt) {
        void manager.playTokenAnimation(request);
        return;
      }
      void manager.queueTokenAnimation(request);
    });
  }, [appReady]);

  useEffect(() => {
    if (!appReady) return;
    return subscribeToTokenAnimations((request) => {
      const system = particleSystemRef.current;
      if (!system) return;
      const trigger = (() => {
        switch (request.type) {
          case 'move':
            return {
              event: 'token_move' as const,
              sourceTokenId: request.tokenId,
              path: request.from && request.to ? [request.from, request.to] : undefined,
            };
          case 'attack':
            return { event: 'token_attack' as const, sourceTokenId: request.tokenId };
          case 'damage':
            return { event: 'token_hit' as const, targetTokenId: request.tokenId };
          case 'heal':
            return { event: 'token_heal' as const, targetTokenId: request.tokenId };
          case 'downed':
            return { event: 'token_die' as const, targetTokenId: request.tokenId };
          default:
            return null;
        }
      })();
      if (trigger) {
        system.trigger(trigger);
      }
    });
  }, [appReady]);

  useEffect(() => {
    if (!appReady) return;

    return subscribeToTokenAnimations((request) => {
      const app = appRef.current;
      if (!app) return;
      if (!screenShakeSettings.enabled) return;
      if (prefersReducedMotionRef.current) return;

      const type = request.type;
      if (type !== 'damage' && type !== 'heal' && type !== 'downed' && type !== 'attack' && type !== 'miss') {
        return;
      }

      const eventSettings = screenShakeSettings[type as ScreenShakeEventType];
      if (!eventSettings?.enabled) return;

      const intensity = Math.max(0, Math.min(2, eventSettings.intensity));
      if (intensity <= 0) return;

      const shake = screenShakeRuntimeRef.current;
      const now = performance.now();
      const eventMultiplier: Record<ScreenShakeEventType, number> = {
        damage: 1,
        heal: 0.8,
        downed: 1.35,
        attack: 0.65,
        miss: 0.45,
      };

      const baseAmplitude = 8;
      const targetAmplitude = baseAmplitude * intensity * eventMultiplier[type as ScreenShakeEventType];
      const duration = Math.max(80, Math.min(1200, screenShakeSettings.durationMs));

      shake.durationMs = duration;
      shake.frequency = 22 + intensity * 6;
      shake.decay = 3.2 + intensity * 1.1;
      shake.amplitudePx = shake.active ? Math.min(24, Math.max(shake.amplitudePx, targetAmplitude)) : Math.min(24, targetAmplitude);
      shake.startedAt = now;
      shake.baseX = app.stage.position.x - shake.offsetX;
      shake.baseY = app.stage.position.y - shake.offsetY;
      shake.active = true;
    });
  }, [appReady, screenShakeSettings]);

  const buildRectPolygon = useCallback((
    start: { x: number; y: number },
    end: { x: number; y: number },
    boardWidth: number,
    boardHeight: number
  ): number[][] => {
    const x1 = clampToBoard(Math.min(start.x, end.x), boardWidth);
    const y1 = clampToBoard(Math.min(start.y, end.y), boardHeight);
    const x2 = clampToBoard(Math.max(start.x, end.x), boardWidth);
    const y2 = clampToBoard(Math.max(start.y, end.y), boardHeight);

    return [
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
    ];
  }, [clampToBoard]);

  const getTokenVisualPosition = useCallback((tokenId: string) => {
    const visuals = tokenVisualsRef.current.get(tokenId);
    if (!visuals) return null;
    return {
      x: visuals.root.x,
      y: visuals.root.y,
      width: visuals.sprite.width,
      height: visuals.sprite.height,
    };
  }, []);

  const setTokenDragGhostAlpha = useCallback((tokenId: string, alpha: number) => {
    const visuals = tokenVisualsRef.current.get(tokenId);
    if (visuals) {
      visuals.root.alpha = alpha;
    }
  }, []);

  const getMeasurementAnchor = useCallback((localX: number, localY: number) => {
    for (const [tokenId] of tokensRef.current) {
      const visualPos = getTokenVisualPosition(tokenId);
      if (!visualPos) continue;

      if (
        localX >= visualPos.x &&
        localX <= visualPos.x + visualPos.width &&
        localY >= visualPos.y &&
        localY <= visualPos.y + visualPos.height
      ) {
        return {
          x: visualPos.x + visualPos.width / 2,
          y: visualPos.y + visualPos.height / 2,
        };
      }
    }

    return snapToGridCellCenter(localX, localY, effectiveGridSize, gridOffsetX, gridOffsetY);
  }, [effectiveGridSize, getTokenVisualPosition, gridOffsetX, gridOffsetY]);

  // Initialize PixiJS
  useEffect(() => {
    if (!containerRef.current || appRef.current || isInitializingRef.current) {
      return;
    }
    
    // Set initializing ref immediately to prevent duplicate inits
    isInitializingRef.current = true;
    
    const initApp = async () => {
      try {
        const { app, rendererKind, webgl2Supported } = await initPixiApplicationWebGL2First({
          resizeTo: containerRef.current!,
          backgroundAlpha: 0,
          antialias: false,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        });

        const hasWebGL = isPixiWebGLRenderer(app);
        console.log('WebGL2 availability check:', webgl2Supported ? 'WebGL2 available' : 'WebGL2 not available');
        console.log('PIXI app init complete, renderer:', rendererKind, 'raw renderer type:', app.renderer.type, 'canvas:', app.canvas);
        
        // Log renderer info for debugging mip map support
        if (rendererKind === 'webgl2') {
          console.log('WebGL2 renderer initialized - mip maps will be available for textures');
        } else if (hasWebGL) {
          console.warn('Unexpected WebGL renderer initialized instead of WebGL2:', getPixiRendererKind(app));
        } else {
          console.log('Canvas renderer initialized - mip maps not available');
        }
        
        // Configure texture defaults for mip map support when using WebGL
        // This ensures textures are configured properly for zoom quality
        if (hasWebGL) {
          // Set default texture options for the asset loader
          // Mip maps will be generated automatically for power-of-two textures
          // Note: In PixiJS v8, we handle mip maps per-texture instead of globally
          console.log('WebGL mode - mip maps will be configured for textures');
        }
        containerRef.current!.appendChild(app.canvas);
        // Ensure PIXI canvas is below fog-of-war canvas (zIndex: 5)
        (app.canvas as HTMLElement).style.zIndex = '1';
        app.stage.sortableChildren = true;
        appRef.current = app;

        const backgroundLayer = new PIXI.Container();
        backgroundLayer.zIndex = STAGE_LAYER_ZINDEX.background;
        const gridLayer = new PIXI.Container();
        gridLayer.zIndex = STAGE_LAYER_ZINDEX.grid;
        gridLayer.sortableChildren = true; // Enable z-index sorting for grid
        const tokenLayer = new PIXI.Container();
        tokenLayer.zIndex = STAGE_LAYER_ZINDEX.token; // Above grid/background
        tokenLayer.sortableChildren = true; // Enable z-index sorting for tokens
        
        // Measurement layer - above tokens, below fog/overlay
        const measurementLayer = new PIXI.Container();
        measurementLayer.zIndex = STAGE_LAYER_ZINDEX.measurement; // Above tokenLayer, below overlayLayer
        measurementLayer.sortableChildren = true;
        
        const lightLayer = new PIXI.Container();
        lightLayer.zIndex = STAGE_LAYER_ZINDEX.light; // Above tokenLayer so lights can affect tokens via additive blending
        
        // Light icons layer - above everything including UI
        const lightIconsLayer = new PIXI.Container();
        lightIconsLayer.zIndex = STAGE_LAYER_ZINDEX.icons; // High z-index to ensure it's above all other layers
        lightIconsLayer.sortableChildren = true;
        
        const uiLayer = new PIXI.Container();
        uiLayer.zIndex = STAGE_LAYER_ZINDEX.ui; // Above lightLayer, below icon layers
        
        // Time/Weather overlay layer (between light and UI)
        const overlayLayer = new PIXI.Container();
        overlayLayer.zIndex = STAGE_LAYER_ZINDEX.overlay; // Above tokenLayer, below lightLayer
      
        const particleIconsLayer = new PIXI.Container();
        particleIconsLayer.zIndex = STAGE_LAYER_ZINDEX.icons;
        particleIconsLayer.sortableChildren = true;

    app.stage.addChild(backgroundLayer);
    app.stage.addChild(gridLayer);
    app.stage.addChild(tokenLayer); // Token layer - below overlay
    app.stage.addChild(measurementLayer); // Measurement layer - above tokens, below fog
    app.stage.addChild(overlayLayer); // Overlay layer - above tokens (includes atmospheric fog)
    app.stage.addChild(lightLayer);
    app.stage.addChild(lightIconsLayer); // Above everything
    app.stage.addChild(particleIconsLayer);
    
    // Audio icons layer - same level as light icons
    const audioIconsLayer = new PIXI.Container();
    audioIconsLayer.zIndex = STAGE_LAYER_ZINDEX.icons; // Same as light icons
    audioIconsLayer.sortableChildren = true;
    app.stage.addChild(audioIconsLayer);
    app.stage.addChild(uiLayer);
    
    // Initialize unified particle system
    try {
      const particleSystem = await initParticleSystem({
        app,
        boardWidth: currentBoard?.width ?? app.screen.width,
        boardHeight: currentBoard?.height ?? app.screen.height,
        gridSizePx: effectiveGridSize,
      });
      particleSystem.setPresets(getParticlePresets());
      particleSystem.attachTokenLayer(tokenLayer);
      particleSystemRef.current = particleSystem;
      particlePresetUnsubRef.current = subscribeParticlePresets(() => {
        particleSystem.setPresets(getParticlePresets());
      });
    } catch (err) {
      console.warn('Failed to initialize particle system:', err);
    }

    (app as any).backgroundLayer = backgroundLayer;
    (app as any).gridLayer = gridLayer;
    (app as any).tokenLayer = tokenLayer;
    (app as any).measurementLayer = measurementLayer;
    (app as any).lightLayer = lightLayer;
    (app as any).lightIconsLayer = lightIconsLayer;
    (app as any).audioIconsLayer = audioIconsLayer;
    (app as any).overlayLayer = overlayLayer;
    (app as any).uiLayer = uiLayer;
    (app as any).particleIconsLayer = particleIconsLayer;

    enforceTokenAboveBackgroundLayerOrder(app);
    setAppReady(true);
    setRendererType(rendererKind);
    isInitializingRef.current = false;
    
    // Initialize atmospheric fog system
    const fogSystem = getAtmosphericFogSystem();
    atmosphericFogSystemRef.current = fogSystem;
    fogSystem.initialize(overlayLayer, app.screen.width, app.screen.height);
    fogSystem.setUseSmokeShader(smokeEnabled);
    
    fogSystem.setShift(fogShift);
    fogSystem.setSmokeDirection(fogDirection);
    fogSystem.setSmokeColor1(fogColor1);
    fogSystem.setSmokeColor2(fogColor2);
    fogSystem.setIntensity(fogIntensity);
    fogSystem.setSpeed(fogSpeed);

    // Create centralized token selection Graphics on uiLayer
    const tokenSelectionLayer = new PIXI.Graphics();
    uiLayer.addChild(tokenSelectionLayer);
    (app as any).tokenSelectionLayer = tokenSelectionLayer;

    // Initialize layer visibility - all layers visible by default
    backgroundLayer.visible = true;
    gridLayer.visible = true;
    tokenLayer.visible = true;
    lightLayer.visible = true;
    lightIconsLayer.visible = true;
    overlayLayer.visible = true;
    uiLayer.visible = true;

    // Initialize Time Overlay System
    const timeOverlaySystem = getTimeOverlaySystem({ enabled: true, opacity: 0.7 });
    timeOverlaySystem.initialize(overlayLayer);
    timeOverlaySystemRef.current = timeOverlaySystem;
    timeOverlaySystem.updatePosition(
      0,
      0,
      currentBoard?.width ?? app.screen.width,
      currentBoard?.height ?? app.screen.height
    );

    tokenAnimationManagerRef.current = new TokenAnimationManager(app.ticker);
    // Initialize with settings from store
    tokenAnimationManagerRef.current.setSettings(useGameStore.getState().tweenSettings);

    app.stage.eventMode = 'static';
    app.stage.hitArea = new PIXI.Rectangle(-5000, -5000, 10000, 10000);
    applyStageTransformWithShake(app, 0, 0, 1);
    // DEBUG - Remove the debug handler that was here
    // app.stage.on('pointerdown', (e) => {
    //   console.log('[DEBUG] Stage clicked at:', e.global);
    // });

    // Pan/Zoom
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let isPanning = false;
    let isMiddleMouseDown = false;
    let startPan = { x: 0, y: 0 };
    
    // Panning momentum/smoothness - velocity tracking
    const velocityThreshold = 0.5;
    let velocityX = 0;
    let velocityY = 0;
    let isMomentum = false;
    let lastPanTime = performance.now();
    let lastPanPos = { x: 0, y: 0 };

    const canvas = app.canvas as HTMLCanvasElement;

    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      // Check if event is inside the context menu or audio panel (do not handle if true)
      let isContextMenu = false;
      let target: HTMLElement | null = e.target as HTMLElement;
      while (target) {
        if (target.classList && (target.classList.contains('audio-context-menu') || target.classList.contains('audio-panel'))) {
          isContextMenu = true;
          break;
        }
        target = target.parentElement;
      }
      
      if (isContextMenu) {
        return;
      }
      
      if (e.button === 1 || (e.altKey && e.button === 0)) {
        // Check if panning is enabled in store (allows dynamic updates)
        if (!useGameStore.getState().panEnabled) {
          return; // Panning is disabled
        }
        e.preventDefault();
        e.stopPropagation();
        isPanning = true;
        isMiddleMouseDown = true;
        // Cancel any ongoing momentum when starting a new pan
        isMomentum = false;
        velocityX = 0;
        velocityY = 0;
        startPan = { x: e.clientX, y: e.clientY };
        lastPanTime = performance.now();
        lastPanPos = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = 'grabbing';
      }
    });

    window.addEventListener('pointermove', (e: PointerEvent) => {
      if (isPanning) {
        const currentTime = performance.now();
        const deltaTime = Math.max(currentTime - lastPanTime, 1); // Avoid division by zero
        
        // Calculate velocity based on movement delta and time
        const deltaX = e.clientX - startPan.x;
        const deltaY = e.clientY - startPan.y;
        
        // Smooth velocity tracking with weighted average
        const newVelX = deltaX / deltaTime * 16; // Normalize to ~60fps
        const newVelY = deltaY / deltaTime * 16;
        
        velocityX = velocityX * 0.6 + newVelX * 0.4;
        velocityY = velocityY * 0.6 + newVelY * 0.4;
        
        offsetX += deltaX;
        offsetY += deltaY;
        startPan = { x: e.clientX, y: e.clientY };
        lastPanTime = currentTime;
        lastPanPos = { x: e.clientX, y: e.clientY };
        applyStageTransformWithShake(app, offsetX, offsetY);
      }
    });

    window.addEventListener('pointerup', (e: PointerEvent) => {
      if (isPanning) {
        // Start momentum if there's enough velocity
        const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);
        if (speed > velocityThreshold) {
          isMomentum = true;
        }
      }
      isPanning = false;
      if (e.button === 1) {
        isMiddleMouseDown = false;
      }
      canvas.style.cursor = 'default';
    });
    
    // Momentum animation ticker
    app.ticker.add(() => {
      if (isMomentum) {
        // Get current friction value from store (allows dynamic updates)
        const currentFriction = useGameStore.getState().panFriction ?? 0.92;
        
        // Apply velocity
        offsetX += velocityX;
        offsetY += velocityY;
        
        // Apply friction
        velocityX *= currentFriction;
        velocityY *= currentFriction;
        
        // Update stage position
        applyStageTransformWithShake(app, offsetX, offsetY);
        
        // Check if we should stop
        const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);
        if (speed < velocityThreshold) {
          isMomentum = false;
          velocityX = 0;
          velocityY = 0;
        }
      }
    });
    
    // AC container scale animation ticker - continuously animates AC display with easeOutBack
    app.ticker.add(() => {
      const currentTokenDisplayMode = useGameStore.getState().tokenDisplayMode;
      const currentSelectedTokenIds = useGameStore.getState().selectedTokenIds;
      const currentSelectedTokenId = useGameStore.getState().selectedTokenId;
      
      // Iterate through all token visuals and update AC scale
      tokenVisualsRef.current.forEach((visuals, tokenId) => {
        const { acContainer } = visuals;
        const statOrbitContainer = visuals.statOrbitContainer;
        const actionOrbitContainer = visuals.actionOrbitContainer;
        const isSelected = currentSelectedTokenIds.includes(tokenId) || tokenId === currentSelectedTokenId;
        const isHovered = tokenHoverRef.current.get(tokenId) || false;
        
        // Determine target scale based on display mode
        let shouldShow = false;
        if (currentTokenDisplayMode === 'always') {
          shouldShow = true;
        } else if (currentTokenDisplayMode === 'selected') {
          shouldShow = isSelected;
        } else if (currentTokenDisplayMode === 'hover') {
          shouldShow = isHovered;
        }
        
        // Get or create animation state
        let animState = acAnimationState.current.get(tokenId);
        if (!animState) {
          animState = { animatingIn: false, progress: 0 };
          acAnimationState.current.set(tokenId, animState);
        }
        
        // Animate with easeOutBack over ~300ms (assuming 60fps = ~18 frames)
        const duration = 18;
        const overshoot = 1.15;
        
        if (shouldShow && animState.progress < 1) {
          // Animating in
          animState.animatingIn = true;
          animState.progress = Math.min(1, animState.progress + 1 / duration);
          // easeOutBack: overshoot then settle to 1
          const easedProgress = easeOutBack(animState.progress);
          const scale = easedProgress < 1 ? easedProgress * overshoot : 1;
          acContainer.scale.set(scale);
        } else if (!shouldShow && animState.progress > 0) {
          // Animating out - just fade/shrink quickly
          animState.progress = Math.max(0, animState.progress - 0.15);
          acContainer.scale.set(animState.progress);
        } else {
          // Already at target
          acContainer.scale.set(shouldShow ? 1 : 0);
          animState.progress = shouldShow ? 1 : 0;
        }
        
        // Keep visible for hit testing when scale > 0
        acContainer.visible = acContainer.scale.x > 0.001;

        let orbitState = orbitAnimationState.current.get(tokenId);
        if (!orbitState) {
          orbitState = { progress: 0 };
          orbitAnimationState.current.set(tokenId, orbitState);
        }

        if (shouldShow && orbitState.progress < 1) {
          orbitState.progress = Math.min(1, orbitState.progress + 1 / duration);
        } else if (!shouldShow && orbitState.progress > 0) {
          orbitState.progress = Math.max(0, orbitState.progress - 0.15);
        }

        const orbitEase = easeOutBack(orbitState.progress);
        const applyOrbitTween = (container: PIXI.Container) => {
          container.visible = orbitState!.progress > 0.001;
          container.alpha = Math.max(0, Math.min(1, orbitState!.progress));
          for (const child of container.children) {
            const targetX = Number((child as any).__targetX || 0);
            const targetY = Number((child as any).__targetY || 0);
            child.position.set(targetX * orbitEase, targetY * orbitEase);
            child.scale.set(Math.max(0.01, orbitState!.progress));
          }
        };
        if (statOrbitContainer) applyOrbitTween(statOrbitContainer);
        if (actionOrbitContainer) applyOrbitTween(actionOrbitContainer);

        if (acTweenDebugEnabledRef.current) {
          const localBounds = acContainer.getLocalBounds();
          const snapshot = [
            `show:${shouldShow ? 1 : 0}`,
            `progress:${animState.progress.toFixed(2)}`,
            `scale:${acContainer.scale.x.toFixed(3)}`,
            `pos:${acContainer.position.x.toFixed(1)},${acContainer.position.y.toFixed(1)}`,
            `pivot:${acContainer.pivot.x.toFixed(1)},${acContainer.pivot.y.toFixed(1)}`,
            `bounds:${localBounds.x.toFixed(1)},${localBounds.y.toFixed(1)},${localBounds.width.toFixed(1)},${localBounds.height.toFixed(1)}`,
          ].join(' | ');
          const prev = acTweenLastSnapshotRef.current.get(tokenId);
          if (prev !== snapshot) {
            // Enable with: localStorage.setItem('debug-ac-tween-origin', '1')
            console.log(`[AC Tween Debug] token=${tokenId} | ${snapshot}`);
            acTweenLastSnapshotRef.current.set(tokenId, snapshot);
          }
        }
      });
    });

    canvas.addEventListener('wheel', (e: Event) => {
      const we = e as WheelEvent;
      
      // Grid adjustments only work when grid edit mode is ON
      const isGridEditMode = useGameStore.getState().gridEditMode;
      if (!isGridEditMode) {
        // Allow canvas zoom without any modifier
        we.preventDefault();
        
        // Get current stage position and scale directly
        const currentScale = app.stage.scale.x;
        const currentOffsetX = app.stage.position.x;
        const currentOffsetY = app.stage.position.y;
        
        const zoomFactor = we.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.25, Math.min(4, currentScale * zoomFactor));
        
        const rect = canvas.getBoundingClientRect();
        const mouseX = we.clientX - rect.left;
        const mouseY = we.clientY - rect.top;
        
        offsetX = mouseX - (mouseX - currentOffsetX) * (newScale / currentScale);
        offsetY = mouseY - (mouseY - currentOffsetY) * (newScale / currentScale);
        
        scale = newScale;
        applyStageTransformWithShake(app, offsetX, offsetY, scale);
        return;
      }
      
      // Grid size adjustment with Cmd + wheel
      if (we.metaKey) {
        we.preventDefault();
        const delta = we.deltaY > 0 ? 1 : -1;
        const currentGridSize = useGameStore.getState().gridSize;
        const newSize = Math.max(20, Math.min(200, currentGridSize + delta));
        setGridSize(newSize);
        return;
      }
      
      // Grid offset X adjustment with Ctrl + wheel
      if (we.ctrlKey) {
        we.preventDefault();
        const rawDelta = Math.abs(we.deltaY);
        const delta = rawDelta > 10 ? (we.deltaY > 0 ? 5 : -5) : (we.deltaY > 0 ? 1 : -1);
        const currentOffsetX = useGameStore.getState().gridOffsetX;
        setGridOffsetX(Math.max(-100, Math.min(100, currentOffsetX + delta)));
        return;
      }
      
      // Grid offset Y adjustment with Opt/Alt + wheel
      if (we.altKey) {
        we.preventDefault();
        const rawDelta = Math.abs(we.deltaY);
        const delta = rawDelta > 10 ? (we.deltaY > 0 ? 5 : -5) : (we.deltaY > 0 ? 1 : -1);
        const currentOffsetY = useGameStore.getState().gridOffsetY;
        setGridOffsetY(Math.max(-100, Math.min(100, currentOffsetY + delta)));
        return;
      }
      
      // Canvas zoom without any modifier when grid edit mode is ON
      we.preventDefault();
      const zoomFactor = we.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.25, Math.min(4, scale * zoomFactor));
      
      const rect = canvas.getBoundingClientRect();
      const mouseX = we.clientX - rect.left;
      const mouseY = we.clientY - rect.top;
      
      offsetX = mouseX - (mouseX - offsetX) * (newScale / scale);
      offsetY = mouseY - (mouseY - offsetY) * (newScale / scale);
      
      scale = newScale;
      applyStageTransformWithShake(app, offsetX, offsetY, scale);
    }, { passive: false });

    const updateScreenShake = () => {
      const shake = screenShakeRuntimeRef.current;
      if (!shake.active) {
        if (shake.offsetX !== 0 || shake.offsetY !== 0) {
          shake.offsetX = 0;
          shake.offsetY = 0;
          app.stage.position.set(shake.baseX, shake.baseY);
        }
        return;
      }

      const elapsed = performance.now() - shake.startedAt;
      const t = Math.min(1, elapsed / Math.max(1, shake.durationMs));
      const damp = Math.exp(-shake.decay * t);
      const envelope = (1 - t) * damp;

      if (t >= 1 || envelope <= 0.001) {
        shake.active = false;
        shake.offsetX = 0;
        shake.offsetY = 0;
        app.stage.position.set(shake.baseX, shake.baseY);
        return;
      }

      const phase = elapsed * 0.001 * Math.PI * 2 * shake.frequency;
      shake.offsetX = Math.sin(phase) * shake.amplitudePx * envelope;
      shake.offsetY = Math.cos(phase * 1.11) * shake.amplitudePx * 0.75 * envelope;
      app.stage.position.set(shake.baseX + shake.offsetX, shake.baseY + shake.offsetY);
    };

    const updateTurnMarkerSpin = (ticker: PIXI.Ticker) => {
      const spinSpeed = 0.02;
      tokenVisualsRef.current.forEach((visuals) => {
        if (visuals.turnMarkerContainer.visible) {
          visuals.turnMarkerSprite.rotation += spinSpeed * ticker.deltaTime;
        }
      });
    };

    // Aura animation ticker - continuously animates aura pulse effect
    const updateAuraPulse = (ticker: PIXI.Ticker) => {
      const time = Date.now();
      // Get tokens from the game store
      const allTokens = useGameStore.getState().tokens;
      const currentBoard = useGameStore.getState().currentBoard;
      const boardId = currentBoard?.id;
      const boardTokens = boardId ? allTokens.filter(t => t.boardId === boardId) : allTokens;
      
      tokenVisualsRef.current.forEach((visuals, tokenId) => {
        const { auraContainer, root } = visuals;
        if (!auraContainer || !auraContainer.visible) return;
        
        // Get token properties for aura settings
        const token = boardTokens.find(t => t.id === tokenId);
        if (!token) return;
        const auraProps = (token.properties || {}) as Record<string, unknown>;
        const auraEnabled = auraProps.auraEnabled === true;
        const auraPulse = auraProps.auraPulse !== false;
        const auraAlphaFade = auraProps.auraAlphaFade !== false;
        const auraRotation = auraProps.auraRotation === true;
        const auraRadius = typeof auraProps.auraRadius === 'number' ? auraProps.auraRadius : 60;
        const auraOpacity = typeof auraProps.auraOpacity === 'number' ? auraProps.auraOpacity : 0.5;
        const auraColor = auraProps.auraColor ? parseInt(String(auraProps.auraColor).replace('#', ''), 16) : DEFAULT_AURA_COLOR;
        
        if (!auraEnabled) return;
        
        // Get or create stored aura graphics references
        let auraGlows = visuals.auraGlows as PIXI.Graphics[] | undefined;
        let auraRing = visuals.auraRing as PIXI.Graphics | undefined;
        
        // Initialize glows if not present
        if (!auraGlows || auraGlows.length === 0) {
          auraGlows = [];
          const glowCount = 5;
          for (let g = glowCount; g >= 1; g--) {
            const glow = new PIXI.Graphics();
            auraContainer.addChild(glow);
            auraGlows.push(glow);
          }
          visuals.auraGlows = auraGlows;
        }
        
        // Initialize ring if not present
        if (!auraRing) {
          auraRing = new PIXI.Graphics();
          auraContainer.addChild(auraRing);
          visuals.auraRing = auraRing;
        }
        
        // Calculate animation factors
        const pulseFactor = auraPulse ? (Math.sin(time * 0.003) * 0.15 + 1) : 1;
        const alphaFadeFactor = auraAlphaFade ? (Math.sin(time * 0.002) * 0.3 + 0.7) : 1;
        const rotationAngle = auraRotation ? (time * 0.001) : 0;
        
        // Get token size from sprite - use the scaled dimensions
        const sprite = visuals.sprite;
        const tokenSize = sprite ? Math.max(sprite.width, sprite.height) : auraRadius * 2;
        const centerX = tokenSize / 2;
        const centerY = tokenSize / 2;
        
        // Update glow circles
        const glowCount = 5;
        for (let g = 0; g < glowCount; g++) {
          const t = (g + 1) / glowCount;
          const glowRadius = auraRadius * t * pulseFactor;
          const baseAlpha = auraOpacity * 0.25 * (1 - t * 0.7);
          const glowAlpha = Math.max(0.01, baseAlpha * alphaFadeFactor);
          
          const glow = auraGlows[g];
          if (glow) {
            glow.clear();
            glow.circle(centerX, centerY, glowRadius);
            glow.fill({ color: auraColor, alpha: glowAlpha });
          }
        }
        
        // Update ring with rotation
        if (auraRing) {
          auraRing.clear();
          // Draw ring at origin, then position container will handle the offset
          auraRing.circle(0, 0, auraRadius * pulseFactor);
          auraRing.stroke({ width: 2, color: auraColor, alpha: auraOpacity * 0.6 * alphaFadeFactor });
          // Apply rotation if enabled
          auraRing.rotation = rotationAngle;
          // Position the ring at center
          auraRing.position.set(centerX, centerY);
        }
      });
    };

    // Mesh effect animation ticker - animates wave, twist, bulge effects using vertex manipulation
    const updateMeshEffects = (ticker: PIXI.Ticker) => {
      const time = Date.now();
      tokenVisualsRef.current.forEach((visuals) => {
        const meshAny = (visuals as any).tokenMesh as any;
        const originalVertices = (visuals as any).originalVertices;
        const tokenMeshEffect = visuals.tokenMeshEffect;
        const tokenMeshIntensity = visuals.tokenMeshIntensity;
        const tokenMeshSpeed = visuals.tokenMeshSpeed;
        
        if (!meshAny || !originalVertices || tokenMeshEffect === 'none' || tokenMeshEffect === undefined) return;
        if (!meshAny.vertices) return;
        
        const speed = ((tokenMeshSpeed || 50) / 50) * 0.05;
        const intensity = ((tokenMeshIntensity || 50) / 50) * 15;
        const meshWidth = meshAny.width || 100;
        const meshHeight = meshAny.height || 100;
        
        // Copy original vertices back first
        for (let i = 0; i < meshAny.vertices.length; i++) {
          meshAny.vertices[i] = originalVertices[i];
        }
        
        switch (tokenMeshEffect) {
          case 'wave':
            // Wave effect - modify Y coordinates
            for (let i = 0; i < meshAny.vertices.length; i += 2) {
              const x = meshAny.vertices[i];
              const progress = x / meshWidth;
              meshAny.vertices[i + 1] += Math.sin((progress * Math.PI * 4) + (time * speed)) * intensity;
            }
            break;
          case 'twist':
            // Twist effect - rotate vertices around center
            for (let i = 0; i < meshAny.vertices.length; i += 2) {
              const x = meshAny.vertices[i];
              const y = meshAny.vertices[i + 1];
              const progress = x / meshWidth;
              const angle = Math.sin(time * speed) * intensity * 0.02 * (progress - 0.5);
              const newX = x * Math.cos(angle) - y * Math.sin(angle);
              const newY = x * Math.sin(angle) + y * Math.cos(angle);
              meshAny.vertices[i] = newX;
              meshAny.vertices[i + 1] = newY;
            }
            break;
          case 'bulge':
            // Bulge effect - push vertices outward from center
            for (let i = 0; i < meshAny.vertices.length; i += 2) {
              const x = meshAny.vertices[i];
              const y = meshAny.vertices[i + 1];
              const centerX = meshWidth / 2;
              const centerY = meshHeight / 2;
              const dx = x - centerX;
              const dy = y - centerY;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
              const bulgeFactor = Math.sin(time * speed * 2) * intensity * (1 - dist / maxDist);
              const scale = 1 + bulgeFactor * 0.1;
              meshAny.vertices[i] = centerX + dx * scale;
              meshAny.vertices[i + 1] = centerY + dy * scale;
            }
            break;
        }
      });
    };

    app.ticker.add(updateAuraPulse);
    app.ticker.add(updateMeshEffects);
    app.ticker.add(updateScreenShake);
    app.ticker.add(updateTurnMarkerSpin);

    return () => {
      tokenAnimationManagerRef.current?.destroy();
      tokenAnimationManagerRef.current = null;
      gridOverlayRef.current?.destroy();
      gridOverlayRef.current = null;
      particlePresetUnsubRef.current?.();
      particlePresetUnsubRef.current = null;
      destroyParticleSystem();
      particleSystemRef.current = null;
      app.ticker.remove(updateAuraPulse);
      app.ticker.remove(updateMeshEffects);
      app.ticker.remove(updateScreenShake);
      app.ticker.remove(updateTurnMarkerSpin);
      app.destroy(true, { children: true, texture: true });
      appRef.current = null;
    };
      } catch (error) {
        console.error('Failed to initialize PixiJS:', error);
      }
    };

    initApp();
  }, [applyStageTransformWithShake]);

  // Update background
  useEffect(() => {
    if (!appReady) return;
    const app = appRef.current;
    if (!app) return;

    enforceTokenAboveBackgroundLayerOrder(app);

    const backgroundLayer = (app as any).backgroundLayer as PIXI.Container;
    
    if (backgroundRef.current) {
      backgroundLayer.removeChild(backgroundRef.current);
      backgroundRef.current.destroy();
      backgroundRef.current = null;
    }
    if (backgroundBleedRef.current) {
      backgroundLayer.removeChild(backgroundBleedRef.current);
      backgroundBleedRef.current.destroy();
      backgroundBleedRef.current = null;
    }
    if (backgroundVignetteRef.current) {
      backgroundLayer.removeChild(backgroundVignetteRef.current);
      backgroundVignetteRef.current.destroy();
      backgroundVignetteRef.current = null;
    }
    if (backgroundVignetteTextureRef.current && backgroundVignetteTextureRef.current !== PIXI.Texture.EMPTY) {
      backgroundVignetteTextureRef.current.destroy(true);
      backgroundVignetteTextureRef.current = null;
    }

    if (currentBoard?.backgroundUrl) {
      PIXI.Assets.load<PIXI.Texture>(toBoardSafeImageUrl(currentBoard.backgroundUrl)).then((texture) => {
        if (!appRef.current || !currentBoard) return;
        
        // Configure mip maps for better zoom quality when using WebGL
        configureTextureMipmaps(texture, appRef.current, { 
          mipmapEnabled: true, 
          anisotropyLevel: 16, 
          scaleMode: 'linear'
        });
        
        const sprite = new PIXI.Sprite(texture);
        
        // Calculate aspect ratio corrected dimensions
        const boardAspect = currentBoard.width / currentBoard.height;
        const texAspect = texture.width / texture.height;
        
        let w = currentBoard.width;
        let h = currentBoard.height;
        
        if (texAspect > boardAspect) {
          // Image is wider than board - fit to width
          h = w / texAspect;
        } else {
          // Image is taller than board - fit to height
          w = h * texAspect;
        }

        const centeredX = (currentBoard.width - w) / 2;
        const centeredY = (currentBoard.height - h) / 2;

        if (effectiveMapBleed.enabled) {
          const bleedSprite = new PIXI.Sprite(texture);
          bleedSprite.width = w;
          bleedSprite.height = h;
          bleedSprite.x = centeredX;
          bleedSprite.y = centeredY;
          bleedSprite.alpha = 0.72;
          if (effectiveMapBleed.blur > 0) {
            const spreadBoost = 1 + (effectiveMapBleed.scale - 1) * 1.8;
            bleedSprite.filters = [
              new BlurFilter({
                strength: effectiveMapBleed.blur * spreadBoost,
                quality: 3,
              }),
            ];
          }
          backgroundLayer.addChild(bleedSprite);
          backgroundBleedRef.current = bleedSprite;
        }

        sprite.width = w;
        sprite.height = h;
        // Center the background
        sprite.x = centeredX;
        sprite.y = centeredY;
        
        backgroundLayer.addChild(sprite);
        backgroundRef.current = sprite;

        if (effectiveMapBleed.enabled && effectiveMapBleed.vignette > 0) {
          const vignetteTexture = buildVignetteTexture(
            w,
            h,
            effectiveMapBleed.feather,
            effectiveMapBleed.vignette
          );
          backgroundVignetteTextureRef.current = vignetteTexture;
          const vignetteSprite = new PIXI.Sprite(vignetteTexture);
          vignetteSprite.x = centeredX;
          vignetteSprite.y = centeredY;
          vignetteSprite.width = w;
          vignetteSprite.height = h;
          vignetteSprite.eventMode = 'none';
          backgroundLayer.addChild(vignetteSprite);
          backgroundVignetteRef.current = vignetteSprite;
        }

        enforceTokenAboveBackgroundLayerOrder(appRef.current);
      });
    } else {
      enforceTokenAboveBackgroundLayerOrder(app);
    }
  }, [
    appReady,
    currentBoard?.id,
    currentBoard?.backgroundUrl,
    currentBoard?.width,
    currentBoard?.height,
    effectiveMapBleed.enabled,
    effectiveMapBleed.feather,
    effectiveMapBleed.blur,
    effectiveMapBleed.vignette,
    effectiveMapBleed.scale,
  ]);

  // Draw grid - using shader-based infinite grid
  useEffect(() => {
    console.log('Grid effect check: appReady:', appReady, 'currentBoard:', !!currentBoard);
    if (!appReady || !currentBoard) {
      return;
    }
    const app = appRef.current;
    if (!app || !currentBoard) return;

    // Hide the old gridLayer to avoid conflicts
    const oldGridLayer = (app as any).gridLayer as PIXI.Container;
    if (oldGridLayer) {
      oldGridLayer.visible = false;
      oldGridLayer.removeChildren();
    }

    // Initialize GridOverlay if not already done
    if (!gridOverlayRef.current) {
      gridOverlayRef.current = new GridOverlay(app, {
        gridSize: effectiveGridSize,
        gridOffsetX: gridOffsetX,
        gridOffsetY: gridOffsetY,
        gridColor: gridColor,
        gridEnabled: true,
        gridType: effectiveGridType,
        gridStyle,
        gridStyleAmount,
        gridOpacity,
      });
      
      // Add the grid overlay sprite to the stage - above background but below tokens
      const gridSprite = gridOverlayRef.current.getContainer();
      gridSprite.zIndex = 2; // Above background but below tokens
      app.stage.addChild(gridSprite);
      
      console.log('[Grid] GridOverlay initialized');
    }
    
    // Update grid configuration
    gridOverlayRef.current.updateConfig({
      gridSize: effectiveGridSize,
      gridOffsetX: gridOffsetX,
      gridOffsetY: gridOffsetY,
      gridColor: gridColor,
      gridType: effectiveGridType,
      gridStyle,
      gridStyleAmount,
      gridOpacity,
    });
    
    // Update visibility - grid always visible
    gridOverlayRef.current.setEnabled(true);
    
    // Update camera position from stage transform
    const stage = app.stage;
    gridOverlayRef.current.updateCamera(
      stage.position.x,
      stage.position.y,
      stage.scale.x
    );
    
    console.log('[Grid] Config updated - gridSize:', effectiveGridSize, 'gridColor:', gridColor);
  }, [appReady, currentBoard?.width, currentBoard?.height, currentBoard?.gridType, gridType, gridColor, gridOpacity, effectiveGridSize, gridOffsetX, gridOffsetY, gridStyle, gridStyleAmount]);

  useEffect(() => {
    const system = particleSystemRef.current;
    if (!system) return;
    system.setTokenPositions(tokens, effectiveGridSize);
  }, [tokens, effectiveGridSize]);

  useEffect(() => {
    const system = particleSystemRef.current;
    if (!system || !currentBoard) return;
    system.setBounds(currentBoard.width, currentBoard.height);
  }, [currentBoard?.width, currentBoard?.height]);

  useEffect(() => {
    const system = particleSystemRef.current;
    if (!system) return;
    system.setGridSize(effectiveGridSize);
  }, [effectiveGridSize]);

  useEffect(() => {
    if (!currentBoard) return;
    const system = particleSystemRef.current;
    if (!system) return;
    for (let i = 0; i < manualEmitterRef.current.length; i++) {
      system.stopByToken(manualEmitterRef.current[i].key);
    }
    manualEmitterRef.current = [];
    setManualEmitters([]);
    setActiveEmitterEditKey(null);
    setSelectedParticleEmitterKeys([]);
    setSceneParticleEmitters([]);
  }, [currentBoard?.id]);

  useEffect(() => {
    const system = particleSystemRef.current;
    if (!system || !currentBoard) return;

    for (let i = 0; i < manualEmitterRef.current.length; i++) {
      system.stopByToken(manualEmitterRef.current[i].key);
    }

    const restored = (sceneParticleEmitters || []).filter(
      (emitter) =>
        typeof emitter.key === 'string' &&
        typeof emitter.presetId === 'string' &&
        Number.isFinite(emitter.x) &&
        Number.isFinite(emitter.y)
    );

    const nextEmitters: Array<{
      key: string;
      x: number;
      y: number;
      presetId: string;
      overrides?: Partial<ParticlePreset>;
    }> = [];

    for (const emitter of restored) {
      const overrides = (emitter.overrides ?? undefined) as Partial<ParticlePreset> | undefined;
      system.playPreset(emitter.presetId, {
        x: emitter.x,
        y: emitter.y,
        sourceTokenId: emitter.key,
        overrides,
      });
      nextEmitters.push({
        key: emitter.key,
        x: emitter.x,
        y: emitter.y,
        presetId: emitter.presetId,
        overrides,
      });
    }

    manualEmitterRef.current = nextEmitters;
    setManualEmitters(nextEmitters);
    setSelectedParticleEmitterKeys((prev) => prev.filter((key) => nextEmitters.some((entry) => entry.key === key)));
    setActiveEmitterEditKey((prev) => (prev && nextEmitters.some((entry) => entry.key === prev) ? prev : null));
  }, [sceneParticleEmitters, currentBoard?.id]);

  useEffect(() => {
    const presets = getParticlePresets();
    if (!presets.length) return;
    if (!presets.some((preset) => preset.id === particlePreset)) {
      setParticlePreset(presets[0].id);
    }
  }, [particlePreset]);

  // Sync grid camera on every frame during pan/zoom
  useEffect(() => {
    const app = appRef.current;
    if (!app || !gridOverlayRef.current) return;
    
    const updateGridCamera = () => {
      if (gridOverlayRef.current && app.stage) {
        gridOverlayRef.current.updateCamera(
          app.stage.position.x,
          app.stage.position.y,
          app.stage.scale.x
        );
      }
    };
    
    // Add ticker listener for continuous camera sync
    app.ticker.add(updateGridCamera);
    
    return () => {
      app.ticker.remove(updateGridCamera);
    };
  }, [appReady]);

  // Render tokens
  useEffect(() => {
    const app = appRef.current;
    const animationManager = tokenAnimationManagerRef.current;
    if (!app || !currentBoard || !animationManager) return;

    enforceTokenAboveBackgroundLayerOrder(app);

    const activeTurnTokenId =
      isInCombat && currentTurnIndex >= 0 && currentTurnIndex < combatants.length
        ? combatants[currentTurnIndex]?.tokenId ?? null
        : null;
    
    console.log('[TurnMarkerDebug] Token render effect - isInCombat:', isInCombat, 'currentTurnIndex:', currentTurnIndex, 'combatants.length:', combatants.length, 'activeTurnTokenId:', activeTurnTokenId);
    
    // Determine the turn marker URL - use custom URL if set, otherwise use default
    // The default is now in public/assets/art for proper PixiJS loading
    let turnMarkerUrl = turnTokenImageUrl;
    if (!turnMarkerUrl) {
      turnMarkerUrl = DEFAULT_TURN_TOKEN_URL;
    }
    
    // Normalize legacy/invalid paths
    if (turnMarkerUrl && typeof turnMarkerUrl === 'string') {
      // Fix common path issues - legacy paths and query params
      turnMarkerUrl = turnMarkerUrl
        .replace(/^\/assets\/icons\//, '/assets/art/') // Legacy path correction
        .replace(/^\/assets\/turn_token.webp$/, '/assets/art/turn_token.webp') // Old default path
        .replace(/\?.*$/, ''); // Remove query params for cleaner cache keys
    }
    
    const turnMarkerTextureUrl = toBoardSafeImageUrl(turnMarkerUrl);

    // Filter tokens based on visibility rules
    // - GM can always see all tokens
    // - Hidden tokens are only visible to their owner or players who control them
    const visibleTokens = tokens.filter(token => {
      const tokenData = (token.properties || {}) as Record<string, unknown>;
      const isHidden = tokenData.hiddenFromPlayers === true;
      
      // If not hidden, everyone can see it
      if (!isHidden) return true;
      
      // GM can always see hidden tokens
      if (isCurrentUserGM) return true;
      
      // Check if current player owns this token or controls it
      const isOwner = token.ownerId === user?.id;
      const controlsToken = currentPlayer?.controlledTokens?.includes(token.id);
      
      // Only owner or controlling player can see hidden tokens
      return isOwner || controlsToken;
    });

    console.debug('[TurnMarkerDebug] frame state', {
      isInCombat,
      currentTurnIndex,
      combatantCount: combatants.length,
      activeTurnTokenId,
      visibleTokenIds: visibleTokens.map((t) => t.id),
      turnMarkerTextureUrl,
    });

    const tokenLayer = (app as any).tokenLayer as PIXI.Container;
    const existingIds = new Set(visibleTokens.map(t => t.id));
    
    // Remove deleted tokens
    for (const [id] of tokensRef.current) {
      if (!existingIds.has(id)) {
        const visuals = tokenVisualsRef.current.get(id);
        if (visuals) {
          tokenLayer.removeChild(visuals.root);
          visuals.root.destroy({ children: true });
          tokenVisualsRef.current.delete(id);
        }
        tokensRef.current.delete(id);
        animationManager.unregisterTokenDisplay(id);
        previousTokenStateRef.current.delete(id);
      }
    }

    // Add/update tokens
    visibleTokens.forEach(token => {
      let visuals = tokenVisualsRef.current.get(token.id);
      
      if (!visuals && token.imageUrl) {
        const resolvedTokenImageUrl = toBoardSafeImageUrl(token.imageUrl);
        console.debug('[TokenLoad] loading token texture', {
          tokenId: token.id,
          tokenName: token.name,
          originalUrl: token.imageUrl,
          resolvedUrl: resolvedTokenImageUrl,
        });
        PIXI.Assets.load<PIXI.Texture>(resolvedTokenImageUrl).then((texture) => {
          console.debug('[TokenLoad] texture load resolved', {
            tokenId: token.id,
            hasTexture: Boolean(texture),
            textureDestroyed: Boolean((texture as any)?.destroyed),
            sourceExists: Boolean((texture as any)?.source),
            sourceResourceExists: Boolean((texture as any)?.source?.resource),
            sourceWidth: (texture as any)?.source?.pixelWidth,
            sourceHeight: (texture as any)?.source?.pixelHeight,
          });
          if (!appRef.current) return;
          if (tokenVisualsRef.current.has(token.id)) return;

          const resolvedTexture = (texture && (texture as any).source)
            ? texture
            : PIXI.Texture.from(
                fallbackTokenDataUrl(
                  token.name || 'Creature',
                  String(token.properties?.type || 'monster'),
                  token.properties?.cr,
                ),
              );

          if (!resolvedTexture || !(resolvedTexture as any).source) {
            console.error('[TokenLoad] no usable texture for token; skipping render', {
              tokenId: token.id,
              tokenName: token.name,
              originalUrl: token.imageUrl,
              resolvedUrl: resolvedTokenImageUrl,
            });
            return;
          }

          // Configure mip maps for better zoom quality when using WebGL
          configureTextureMipmaps(resolvedTexture, appRef.current, { 
            mipmapEnabled: true, 
            anisotropyLevel: 16, 
            scaleMode: 'linear'
          });
          
          const root = new PIXI.Container();
          const effectContainer = new PIXI.Container();
          const sprite = new PIXI.Sprite(resolvedTexture);
          const shadowSprite = new PIXI.Sprite(resolvedTexture);
          shadowSprite.alpha = 0.4;
          shadowSprite.tint = DEFAULT_CANVAS_STROKE;
          const turnMarkerContainer = new PIXI.Container();
          const turnMarkerFallback = new PIXI.Graphics();
          turnMarkerContainer.addChild(turnMarkerFallback);
          const turnMarkerSprite = new PIXI.Sprite(PIXI.Texture.from(turnMarkerTextureUrl));
          turnMarkerSprite.anchor.set(0.5, 0.5);
          turnMarkerContainer.addChild(turnMarkerSprite);
          const blurFilter = new BlurFilter();
          blurFilter.strength = 3;
          shadowSprite.filters = [blurFilter];

          const auraContainer = new PIXI.Container();
          const statusContainer = new PIXI.Container();
          const labelContainer = new PIXI.Container();
          const barsContainer = new PIXI.Container();
          const deadIconContainer = new PIXI.Container();
          const acContainer = new PIXI.Container();
          const statOrbitContainer = new PIXI.Container();
          const actionOrbitContainer = new PIXI.Container();
          // Make AC container non-interactive so it doesn't intercept clicks or drag
          acContainer.eventMode = 'none';
          statOrbitContainer.eventMode = 'none';

          root.sortableChildren = true;
          root.eventMode = 'static';
          root.cursor = 'pointer';
          
          // Initialize AC container scale to 0 (hidden by default)
          acContainer.scale.set(0);
          
          // Add hover event handlers for AC display
          root.on('pointerover', () => {
            if (tokenHoverRef.current) tokenHoverRef.current.set(token.id, true);
          });
          root.on('pointerout', () => {
            if (tokenHoverRef.current) tokenHoverRef.current.set(token.id, false);
          });
          
          // Debug: root click handler removed
          /*
          if (root.listenerCount('pointerdown') === 0) {
            root.on('pointerdown', (e) => {
              console.log('[DEBUG ROOT] Token click detected on:', token.name, 'target:', e.target);
            });
          }
          */
          effectContainer.sortableChildren = true;
          sprite.eventMode = 'static';
          sprite.cursor = 'pointer';
          const handleContextMenu = (event: any) => {
            event.stopPropagation();
            const globalPos = event.data.global;
            handleTokenRightClick(token.id, globalPos.x, globalPos.y);
          };
          root.on('rightdown', handleContextMenu);
          root.on('rightclick', handleContextMenu);
          sprite.on('rightdown', handleContextMenu);
          sprite.on('rightclick', handleContextMenu);

          auraContainer.eventMode = 'none';
          auraContainer.zIndex = 0;
          shadowSprite.zIndex = 0;
          turnMarkerContainer.zIndex = 1;
          effectContainer.zIndex = 2;
          statusContainer.zIndex = 4;
          labelContainer.zIndex = 5;
          barsContainer.zIndex = 6;
          deadIconContainer.zIndex = 1;
          acContainer.zIndex = 7;
          statOrbitContainer.zIndex = 8;
          actionOrbitContainer.zIndex = 9;

          effectContainer.addChild(sprite);
          effectContainer.addChild(deadIconContainer);
          root.addChild(auraContainer);
          root.addChild(shadowSprite);
          root.addChild(turnMarkerContainer);
          root.addChild(effectContainer);
          root.addChild(statusContainer);
          root.addChild(labelContainer);
          root.addChild(barsContainer);
          root.addChild(acContainer);
          root.addChild(statOrbitContainer);
          root.addChild(actionOrbitContainer);
          root.position.set(token.x, token.y);
          tokenLayer.addChild(root);

          const created: TokenVisualRefs = {
            root,
            effectContainer,
            sprite,
            shadowSprite,
            turnMarkerContainer,
            turnMarkerFallback,
            turnMarkerSprite,
            auraContainer,
            statusContainer,
            labelContainer,
            barsContainer,
            deadIconContainer,
            acContainer,
            statOrbitContainer,
            actionOrbitContainer,
          };
          tokenVisualsRef.current.set(token.id, created);
          tokensRef.current.set(token.id, sprite);
          animationManager.registerTokenDisplay(token.id, {
            root,
            effectContainer,
            sprite,
          });
          const footprint = token.size || 1;
          const width = effectiveGridSize * footprint;
          const height = effectiveGridSize * footprint;
          applyCenteredAspectFitToTokenSprites(sprite, shadowSprite, width, height);
          root.hitArea = new PIXI.Rectangle(0, 0, width, height + 50);
          animationManager.syncTokenBaseState(token.id, {
            x: token.x,
            y: token.y,
            width,
            height,
            scaleX: 1,
            scaleY: 1,
            alpha: 0.9,
            tint: DEFAULT_TINT_COLOR,
          });
        }).catch((error) => {
          console.error('[TokenLoad] texture load failed', {
            tokenId: token.id,
            tokenName: token.name,
            originalUrl: token.imageUrl,
            resolvedUrl: resolvedTokenImageUrl,
            error,
          });
        });
      }
      
      visuals = tokenVisualsRef.current.get(token.id);
      if (visuals) {
        const { root, effectContainer, sprite, shadowSprite, turnMarkerContainer, turnMarkerSprite, statusContainer, auraContainer, labelContainer, barsContainer, deadIconContainer, acContainer } = visuals;
        let turnMarkerFallback = visuals.turnMarkerFallback;
        let statOrbitContainer = visuals.statOrbitContainer;
        let actionOrbitContainer = visuals.actionOrbitContainer;
        // HMR-safe migration for visuals created before orbit containers were introduced.
        if (!turnMarkerFallback) {
          turnMarkerFallback = new PIXI.Graphics();
          turnMarkerContainer.addChildAt(turnMarkerFallback, 0);
          visuals.turnMarkerFallback = turnMarkerFallback;
        }
        if (!statOrbitContainer) {
          statOrbitContainer = new PIXI.Container();
          statOrbitContainer.eventMode = 'none';
          statOrbitContainer.zIndex = 8;
          root.addChild(statOrbitContainer);
          visuals.statOrbitContainer = statOrbitContainer;
        }
        if (!actionOrbitContainer) {
          actionOrbitContainer = new PIXI.Container();
          actionOrbitContainer.zIndex = 9;
          root.addChild(actionOrbitContainer);
          visuals.actionOrbitContainer = actionOrbitContainer;
        }
        const footprint = token.size || 1;
        const width = effectiveGridSize * footprint;
        const height = effectiveGridSize * footprint;
        const size = width;
        applyCenteredAspectFitToTokenSprites(sprite, shadowSprite, width, height);
        const markerSpriteMeta = turnMarkerSprite as any;
        let markerTextureReady = false;
        let shouldShowTurnMarker = false;
        if (isInCombat) {
          if (markerSpriteMeta.__sourceUrl !== turnMarkerTextureUrl) {
            markerSpriteMeta.__sourceUrl = turnMarkerTextureUrl;
            markerSpriteMeta.__textureReady = false;
            markerSpriteMeta.__textureLoading = true;
            turnMarkerSprite.visible = false;

            // Skip loading if URL is empty or invalid
            if (!turnMarkerTextureUrl || turnMarkerTextureUrl === '') {
              turnMarkerSprite.visible = false;
              markerSpriteMeta.__textureReady = false;
              markerSpriteMeta.__textureLoading = false;
              return;
            }

            // Use direct fetch approach for PixiJS v8 compatibility
            // This avoids the "Asset not found in cache" warning
            fetch(turnMarkerTextureUrl)
              .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.blob();
              })
              .then(blob => {
                return createImageBitmap(blob);
              })
              .then(imageBitmap => {
                if (markerSpriteMeta.__sourceUrl !== turnMarkerTextureUrl) return;
                const texture = PIXI.Texture.from(imageBitmap);
                turnMarkerSprite.texture = texture;
                turnMarkerSprite.visible = true;
                markerSpriteMeta.__textureReady = true;
                markerSpriteMeta.__textureLoading = false;
              })
              .catch((error) => {
                if (markerSpriteMeta.__sourceUrl !== turnMarkerTextureUrl) return;
                markerSpriteMeta.__textureReady = false;
                markerSpriteMeta.__textureLoading = false;
                turnMarkerSprite.visible = false;
                console.warn('[TurnMarkerDebug] marker texture load failed (using fallback)', {
                  turnMarkerTextureUrl,
                  error: error?.message || 'Unknown error',
                });
              });
          }
          applyCenteredAspectFitToTurnMarker(turnMarkerSprite, size);
          turnMarkerSprite.alpha = 1;

          const markerWidth = turnMarkerSprite.width;
          const markerHeight = turnMarkerSprite.height;
          const markerX = size / 2;
          const markerY = size / 2;

          turnMarkerFallback.clear();
          turnMarkerFallback.roundRect(
            markerX - markerWidth / 2,
            markerY - markerHeight / 2,
            markerWidth,
            markerHeight,
            Math.min(markerHeight / 2, 36),
          );
          turnMarkerFallback.fill({ color: DEFAULT_TURN_MARKER_FILL, alpha: 0.45 });
          turnMarkerFallback.stroke({ width: 4, color: DEFAULT_TURN_MARKER_STROKE, alpha: 0.98 });

          markerTextureReady = Boolean(markerSpriteMeta.__textureReady && (turnMarkerSprite.texture as any)?.source);
          turnMarkerSprite.visible = markerTextureReady;
          turnMarkerFallback.visible = !markerTextureReady;
          const isDraggingOrDropping = dragMode !== 'none' || Boolean(pendingDropType);
          shouldShowTurnMarker = token.id === activeTurnTokenId && !isDraggingOrDropping;
        } else {
          markerSpriteMeta.__textureReady = false;
          markerSpriteMeta.__textureLoading = false;
          turnMarkerSprite.visible = false;
          turnMarkerFallback.visible = false;
        }
        // FIX: Only show TurnMarker when actually in combat AND token is the active turn
        shouldShowTurnMarker = shouldShowTurnMarker && isInCombat;
        if (shouldShowTurnMarker) {
          console.log('[TurnMarkerDebug] Showing TurnMarker for token:', token.id, token.name, 'activeTurnTokenId:', activeTurnTokenId, 'isInCombat:', isInCombat, 'currentTurnIndex:', currentTurnIndex, 'combatants:', combatants.map(c => ({ tokenId: c.tokenId, name: c.name })));
        }
        console.info('[TurnMarkerDebug] Drag/marker visibility state', {
          tokenId: token.id,
          tokenName: token.name,
          isInCombat,
          currentTurnIndex,
          activeTurnTokenId,
          shouldShowTurnMarker,
          dragMode,
          pendingDropType,
        });
        turnMarkerContainer.visible = shouldShowTurnMarker;
        const markerTexture = turnMarkerSprite.texture as any;
        console.debug('[TurnMarkerDebug] token marker render state', {
          tokenId: token.id,
          tokenName: token.name,
          activeTurnTokenId,
          isActiveTurnToken: token.id === activeTurnTokenId,
          markerContainerVisible: turnMarkerContainer.visible,
          markerContainerWorldVisible: (turnMarkerContainer as any).worldVisible,
          markerContainerWorldAlpha: (turnMarkerContainer as any).worldAlpha,
          markerTextureUrl: (turnMarkerSprite as any).__sourceUrl,
          markerTextureValid: Boolean(markerTexture?.source),
          markerTextureWidth: markerTexture?.source?.pixelWidth,
          markerTextureHeight: markerTexture?.source?.pixelHeight,
          markerSprite: {
            x: turnMarkerSprite.x,
            y: turnMarkerSprite.y,
            width: turnMarkerSprite.width,
            height: turnMarkerSprite.height,
            alpha: turnMarkerSprite.alpha,
            worldAlpha: (turnMarkerSprite as any).worldAlpha,
            visible: turnMarkerSprite.visible,
            renderable: turnMarkerSprite.renderable,
          },
          tokenRoot: {
            x: root.x,
            y: root.y,
            visible: root.visible,
            worldVisible: (root as any).worldVisible,
            worldAlpha: (root as any).worldAlpha,
          },
        });
        // Center AC container so scale tween grows from token center (not top-left)
        acContainer.position.set(size / 2, size / 2);
        acContainer.pivot.set(0, 0);
        if (acTweenDebugEnabledRef.current) {
          console.log(`[AC Tween Debug] token=${token.id} reset container origin -> position(${(size / 2).toFixed(1)},${(size / 2).toFixed(1)}), pivot(0,0), tokenSize=${size}`);
        }
        // Keep hover/select trigger strictly on token footprint (+bars area only)
        root.hitArea = new PIXI.Rectangle(0, 0, width, height + 50);

        const isSelected = selectedTokenIds.includes(token.id) || token.id === selectedTokenId;
        const tokenData = (token.properties || {}) as Record<string, unknown> & { ac?: number | { ac: number; from?: string[] }; hp?: unknown };
        const isHidden = tokenData.hiddenFromPlayers === true;
        root.zIndex = isSelected ? 100 : 1;
        const currentVisualPos = getTokenVisualPosition(token.id) ?? { x: token.x, y: token.y };
        const previous = previousTokenStateRef.current.get(token.id);
        const shouldAnimateMove = !!previous && (previous.x !== token.x || previous.y !== token.y);
        // Gameplay state stays in the store/socket layer. The animation manager only
        // receives the current authoritative base transform and composes disposable FX on top.
        // Apply visual effects from token properties (filters, tint, mesh) - apply BEFORE sync
        const effectProps = (token.properties || {}) as Record<string, unknown>;
        
        // Apply tint & color effects
        const tokenTintEnabled = effectProps.tokenTintEnabled === true;
        const tokenTintColor = (effectProps.tokenTintColor as string) || '#ffffff';
        const tokenAlpha = typeof effectProps.tokenAlpha === 'number' ? effectProps.tokenAlpha : 100;
        const tokenBlendMode = (effectProps.tokenBlendMode as string) || 'normal';
        
        // Apply tint color if enabled
        if (tokenTintEnabled) {
          const tintNumber = parseInt(tokenTintColor.replace('#', ''), 16);
          sprite.tint = tintNumber;
        } else {
          sprite.tint = DEFAULT_TINT_COLOR;
        }
        
        // Apply alpha (combine with base alpha for selection/hidden states)
        const baseAlpha = getTokenBaseAlpha(isSelected, isHidden);
        sprite.alpha = (tokenAlpha / 100) * baseAlpha;
        
        // Apply blend mode
        sprite.blendMode = tokenBlendMode as BLEND_MODES;
        
        // Apply filter effects
        const tokenEffectFilter = (effectProps.tokenEffectFilter as string) || 'none';
        const tokenFilterIntensity = typeof effectProps.tokenFilterIntensity === 'number' ? effectProps.tokenFilterIntensity : 50;
        
        if (tokenEffectFilter !== 'none') {
          const filters: PIXI.Filter[] = [];
          
          switch (tokenEffectFilter) {
            case 'blur':
              filters.push(new BlurFilter({ strength: tokenFilterIntensity / 20 }));
              break;
            case 'glow':
              const glowMatrix = new ColorMatrixFilter();
              glowMatrix.brightness(1 + tokenFilterIntensity / 100, false);
              filters.push(glowMatrix);
              break;
            case 'colorMatrix':
              const colorMatrix = new ColorMatrixFilter();
              colorMatrix.contrast(1 + tokenFilterIntensity / 200, false);
              filters.push(colorMatrix);
              break;
            case 'noise':
              filters.push(new NoiseFilter({ noise: tokenFilterIntensity / 100 }));
              break;
            case 'displacement':
              const displacementFilter = new DisplacementFilter(new PIXI.Sprite(PIXI.Texture.WHITE));
              displacementFilter.scale.x = tokenFilterIntensity / 10;
              displacementFilter.scale.y = tokenFilterIntensity / 10;
              filters.push(displacementFilter);
              break;
          }
          
          sprite.filters = filters;
        } else {
          sprite.filters = [];
        }
        
        // Apply mesh effects
        const tokenMeshEffect = (effectProps.tokenMeshEffect as string) || 'none';
        const tokenMeshIntensity = typeof effectProps.tokenMeshIntensity === 'number' ? effectProps.tokenMeshIntensity : 50;
        const tokenMeshSpeed = typeof effectProps.tokenMeshSpeed === 'number' ? effectProps.tokenMeshSpeed : 50;
        
        // Store mesh settings in visuals for the ticker to use
        visuals.tokenMeshEffect = tokenMeshEffect;
        visuals.tokenMeshIntensity = tokenMeshIntensity;
        visuals.tokenMeshSpeed = tokenMeshSpeed;
        
        // Initialize or update mesh if needed
        // Check if we need to create a mesh (effect enabled and no existing mesh)
        const existingMesh = (visuals as any).tokenMesh;
        if (tokenMeshEffect !== 'none' && !existingMesh) {
          try {
            // Check if sprite is still a valid child of root
            if (!root || !sprite || !root.children.includes(sprite)) {
              return;
            }
            
            // Create a Plane mesh with the sprite texture
            // Using 20x20 segments for smooth animation
            // @ts-ignore - Plane may not be in TypeScript definitions
            const mesh: any = new PIXI.Mesh.Plane(sprite.texture, 20, 20);
            mesh.width = sprite.width;
            mesh.height = sprite.height;
            mesh.position.set(sprite.x, sprite.y);
            mesh.alpha = sprite.alpha;
            mesh.rotation = sprite.rotation;
            mesh.scale.set(sprite.scale.x, sprite.scale.y);
            mesh.tint = sprite.tint;
            mesh.blendMode = sprite.blendMode;
            mesh.visible = sprite.visible;
            
            // Store original vertices for animation
            (visuals as any).originalVertices = mesh.vertices.slice(0);
            (visuals as any).meshWidth = mesh.width;
            (visuals as any).meshHeight = mesh.height;
            
            // Replace sprite with mesh in the container
            const spriteIndex = root.getChildIndex(sprite);
            root.removeChild(sprite);
            root.addChildAt(mesh as PIXI.Container, spriteIndex);
            
            (visuals as any).tokenMesh = mesh;
            visuals.originalSprite = sprite;
          } catch (e) {
            console.warn('Failed to create mesh:', e);
          }
        } else if (tokenMeshEffect === 'none' && existingMesh) {
          // Remove mesh and restore original sprite
          try {
            const mesh = (visuals as any).tokenMesh;
            if (mesh) {
              const meshIndex = root.getChildIndex(mesh as PIXI.Container);
              root.removeChild(mesh as PIXI.Container);
              if (visuals.originalSprite) {
                root.addChildAt(visuals.originalSprite, meshIndex);
              }
              mesh.destroy();
            }
            (visuals as any).tokenMesh = undefined;
            (visuals as any).originalVertices = undefined;
            visuals.originalSprite = undefined;
          } catch (e) {
            console.warn('Failed to remove mesh:', e);
          }
        }
        
        // Now sync with animation manager - read tint from properties to preserve user-selected tint
        const syncTintEnabled = effectProps.tokenTintEnabled === true;
        const syncTintColor = (effectProps.tokenTintColor as string) || '#ffffff';
        const syncTintValue = syncTintEnabled 
          ? parseInt(syncTintColor.replace('#', ''), 16) 
          : DEFAULT_TINT_COLOR;
        
        animationManager.syncTokenBaseState(token.id, {
          x: token.x,
          y: token.y,
          width,
          height,
          scaleX: 1,
          scaleY: 1,
          alpha: getTokenBaseAlpha(isSelected, isHidden),
          tint: syncTintValue,
        });
        if (shouldAnimateMove) {
          void animationManager.playTokenAnimation({
            tokenId: token.id,
            type: 'move',
            from: { x: currentVisualPos.x, y: currentVisualPos.y },
            to: { x: token.x, y: token.y },
            interrupt: true,
          });
        }

        const tokenBarsData = parseTokenBarsData(token.bars);
        const hpBar = tokenBarsData.find(b => b.name === 'HP');
        const isDead = hpBar && hpBar.current <= 0;
        if (isDead) {
          deadIconContainer.removeChildren();
          const deadIcon = new PIXI.Text('\uf54c', {
            fontSize: size * 0.7,
              fill: DEFAULT_DANGER_TEXT_COLOR,
              fontFamily: '"Font Awesome 6 Free", Arial',
              fontWeight: '900',
              stroke: {
                color: DEFAULT_CANVAS_STROKE,
                width: 2,
              },
              dropShadow: {
                color: DEFAULT_CANVAS_STROKE,
                alpha: 0.8,
                blur: 2,
                distance: 1,
              angle: 45,
            },
          });
          const stageScale = app.stage.scale.x || 1;
          const resolution = Math.max(3, (window.devicePixelRatio || 1) * 3 / stageScale);
          deadIcon.resolution = resolution;
          deadIcon.anchor.set(0.5);
          deadIcon.alpha = 0.6;
          deadIcon.x = size / 2;
          deadIcon.y = size / 2;
          deadIconContainer.addChild(deadIcon as any);
          deadIconContainer.visible = true;
        } else {
          deadIconContainer.visible = false;
        }

        // Render AC (Armor Class) with shield icon in center of token
        const acValue = tokenData.ac;
        console.log('[DEBUG AC] Rendering AC for token:', token.name, 'acValue:', acValue, 'isDead:', isDead);
        if (acValue && !isDead) {
          // Parse AC value - can be number, array like [12], or object {ac: number, from: string[]}
          let acDisplay = '';
          if (typeof acValue === 'number') {
            acDisplay = String(acValue);
          } else if (Array.isArray(acValue) && acValue.length > 0) {
            // Array format like [12] or [{ac: 12, from: [...]}]
            const first = acValue[0];
            if (typeof first === 'number') {
              acDisplay = String(first);
            } else if (typeof first === 'object' && first.ac !== undefined) {
              acDisplay = String(first.ac);
            }
          } else if (typeof acValue === 'object' && acValue.ac !== undefined) {
            acDisplay = String(acValue.ac);
          }
          
          if (acDisplay) {
            acContainer.removeChildren();
            // Shield icon: \uF3ED is Font Awesome 6 Free shield
            const shieldIcon = new PIXI.Text('\uf132', {
              fontSize: size * 0.5,
              fill: DEFAULT_NEUTRAL_ICON_COLOR,
              fontFamily: '"Font Awesome 6 Free", Arial',
              fontWeight: '900',
              stroke: {
                color: DEFAULT_CANVAS_STROKE,
                width: 4,
              },
              dropShadow: {
                color: DEFAULT_CANVAS_STROKE,
                alpha: 0.8,
                blur: 4,
                distance: 1,
                angle: 45,
              },
            });
            const stageScale = app.stage.scale.x || 1;
            const resolution = Math.max(3, (window.devicePixelRatio || 1) * 3 / stageScale);
            shieldIcon.resolution = resolution;
            shieldIcon.anchor.set(0.5);
            shieldIcon.x = 0;
            shieldIcon.y = 0;
            shieldIcon.alpha = 1.0;
            acContainer.addChild(shieldIcon as any);
            
            // AC number text
            const acText = new PIXI.Text(acDisplay, {
              fontSize: size * 0.22,
              fill: DEFAULT_ORBIT_TEXT_COLOR,
              fontFamily: 'Arial',
              fontWeight: 'bold',
              stroke: {
                color: DEFAULT_CANVAS_STROKE,
                width: 3,
              },
            });
            acText.resolution = resolution;
            acText.anchor.set(0.5);
            acText.x = 0;
            acText.y = 0;
            acText.alpha = 0.95;
            acContainer.addChild(acText as any);

            if (acTweenDebugEnabledRef.current) {
              console.log(
                `[AC Tween Debug] token=${token.id} children centered at (${(size / 2).toFixed(1)}, ${(size / 2).toFixed(1)}) while container origin is position(${acContainer.position.x.toFixed(1)}, ${acContainer.position.y.toFixed(1)}) pivot(${acContainer.pivot.x.toFixed(1)}, ${acContainer.pivot.y.toFixed(1)})`
              );
            }
            
            // Scale is now handled by the continuous ticker animation
            acContainer.visible = true;
          }
        } else {
          // Scale is now handled by the continuous ticker animation
          acContainer.visible = acContainer.scale.x > 0.001;
        }

        // Radial stats and actions
        statOrbitContainer.position.set(size / 2, size / 2);
        statOrbitContainer.eventMode = 'none';
        statOrbitContainer.removeChildren();
        actionOrbitContainer.position.set(size / 2, size / 2);
        actionOrbitContainer.eventMode = 'passive';
        actionOrbitContainer.removeChildren();

        const linkedCreatureId = typeof token.creatureId === 'string'
          ? token.creatureId
          : typeof (tokenData as Record<string, unknown>).creatureId === 'string'
            ? String((tokenData as Record<string, unknown>).creatureId)
            : null;
        const linkedCreatureStats = linkedCreatureId ? linkedCreatureStatsCacheRef.current.get(linkedCreatureId) : null;
        const quickStatsSource: Record<string, unknown> = {
          ...(linkedCreatureStats
            ? {
                passive: linkedCreatureStats.passive,
                senses: linkedCreatureStats.senses,
                darkvision: linkedCreatureStats.darkvision,
                speed: linkedCreatureStats.speed,
                movement: linkedCreatureStats.movement,
              }
            : {}),
          ...(tokenData as Record<string, unknown>),
        };

        const passiveText = extractPassivePerception(quickStatsSource);
        const sensesText = extractSensesText(quickStatsSource);
        const movementText = extractMovementText(quickStatsSource);
        const statEntries = [
          passiveText ? { label: passiveText, tooltip: passiveText } : null,
          sensesText ? { label: sensesText, tooltip: sensesText } : null,
          movementText ? { label: movementText, tooltip: movementText } : null,
        ].filter((v): v is { label: string; tooltip: string } => !!v).slice(0, 3);
        const statAngles = [-145, -90, -35];
        const statRadius = size / 2 + 26;
        const orbitStageScale = app.stage.scale.x || 1;
        const orbitTextResolution = Math.max(4, (window.devicePixelRatio || 1) * 4 / orbitStageScale);

        statEntries.forEach((entry, index) => {
          const chip = new PIXI.Text(entry.label, {
            fontFamily: 'Arial',
            fontSize: Math.max(10, size * 0.12),
            fill: DEFAULT_ORBIT_TEXT_COLOR,
            stroke: { color: DEFAULT_CANVAS_STROKE, width: 3 },
          });
          chip.resolution = orbitTextResolution;
          chip.anchor.set(0.5);
          const angle = ((statAngles[index] ?? -90) * Math.PI) / 180;
          (chip as any).__targetX = Math.cos(angle) * statRadius;
          (chip as any).__targetY = Math.sin(angle) * statRadius;
          chip.eventMode = 'none';
          statOrbitContainer.addChild(chip);
        });

        const linkedActions = linkedCreatureId ? (linkedCreatureActionsCacheRef.current.get(linkedCreatureId) || []) : [];
        const fallbackActions = extractTokenFallbackActions(token);
        const actionEntries = (linkedActions.length > 0 ? linkedActions : fallbackActions).slice(0, 3);
        const actionAngles = [140, 90, 40];
        const actionRadius = size / 2 + 36;

        actionEntries.forEach((entry, index) => {
          const text = new PIXI.Text('⚔', {
            fontFamily: 'Arial, "Apple Color Emoji", "Segoe UI Emoji"',
            fontSize: Math.max(15, size * 0.22),
            fill: isCurrentUserGM ? DEFAULT_GM_ACTION_TEXT_COLOR : DEFAULT_PLAYER_ACTION_TEXT_COLOR,
            stroke: { color: DEFAULT_CANVAS_STROKE, width: 3 },
          });
          text.resolution = orbitTextResolution;
          text.anchor.set(0.5);

          const bg = new PIXI.Graphics();
          const chipWidth = Math.max(24, text.width + 12);
          const chipHeight = Math.max(24, text.height + 10);
          bg.roundRect(-chipWidth / 2, -chipHeight / 2, chipWidth, chipHeight, 7);
          bg.fill({ color: isCurrentUserGM ? DEFAULT_GM_ACTION_BG : DEFAULT_PLAYER_ACTION_BG, alpha: 0.92 });
          bg.stroke({ width: 1.5, color: isCurrentUserGM ? DEFAULT_GM_ACTION_BORDER : DEFAULT_PLAYER_ACTION_BORDER, alpha: 0.95 });

          const chip = new PIXI.Container();
          chip.addChild(bg);
          chip.addChild(text);

          const angle = ((actionAngles[index] ?? 90) * Math.PI) / 180;
          (chip as any).__targetX = Math.cos(angle) * actionRadius;
          (chip as any).__targetY = Math.sin(angle) * actionRadius;

          chip.eventMode = 'none';

          actionOrbitContainer.addChild(chip);
        });

        const statusesRaw: string[] = token.status ? JSON.parse(token.status) : [];
        const hpBarForStatus = tokenBarsData.find(b => b.name === 'HP');
        const isDeadForStatus = hpBarForStatus && hpBarForStatus.current <= 0;
        const statuses = isDeadForStatus ? statusesRaw.filter(s => s !== 'skull') : statusesRaw;
        
        if (statuses.length > 0) {
          statusContainer.removeChildren();
          const tokenProps = (token.properties || {}) as Record<string, unknown>;
          const statusRadiusCustom = typeof tokenProps.statusRadius === 'number' ? tokenProps.statusRadius : 25;
          const statusSpreadCustom = typeof tokenProps.statusSpread === 'number' ? tokenProps.statusSpread : 0.75;
          const statusIconSizeCustom = typeof tokenProps.statusIconSize === 'number' ? tokenProps.statusIconSize : 14;
          const statusIconColorCustom = typeof tokenProps.statusIconColor === 'string' ? tokenProps.statusIconColor : statusIconColor;
          
          const radius = size / 2 + statusRadiusCustom;
          const maxSpread = Math.PI * statusSpreadCustom; // Configurable spread
          
          statuses.forEach((iconName, index) => {
            const faUnicode = iconToFaUnicode[iconName] || iconName;
            const iconText = new PIXI.Text(faUnicode, {
              fontSize: statusIconSizeCustom,
              fill: statusIconColorCustom,
              fontFamily: '"Font Awesome 6 Free", Arial',
              fontWeight: '900',
              stroke: {
                color: DEFAULT_CANVAS_STROKE,
                width: 2,
              },
              dropShadow: {
                color: DEFAULT_CANVAS_STROKE,
                alpha: 0.8,
                blur: 2,
                distance: 1,
                angle: 45,
              },
            });
            // Get current stage scale for resolution calculation
            const stageScale = app.stage.scale.x || 1;
            const resolution = Math.max(3, (window.devicePixelRatio || 1) * 3 / stageScale);
            iconText.resolution = resolution;
            iconText.anchor.set(0.5);
            
            // Calculate angle: start from top (-PI/2) and spread symmetrically left and right
            const startAngle = -Math.PI / 2 - maxSpread;
            const angle = statuses.length === 1 
              ? -Math.PI / 2 // Single icon at top
              : startAngle + (maxSpread * 2 / (statuses.length - 1)) * index;
            iconText.x = size / 2 + radius * Math.cos(angle);
            iconText.y = size / 2 + radius * Math.sin(angle);
            statusContainer.addChild(iconText);
          });
          statusContainer.visible = true;
        } else {
          statusContainer.visible = false;
        }

        const auraProps = (token.properties || {}) as Record<string, unknown>;
        const auraEnabled = auraProps.auraEnabled === true;
        
        // Aura animation is now handled by the ticker (updateAuraPulse)
        // Just toggle visibility here - the ticker creates/animates the graphics
        if (auraEnabled) {
          auraContainer.visible = true;
        } else {
          // Clear the aura graphics when disabled
          if (visuals.auraGlows) {
            visuals.auraGlows.forEach(g => g.destroy());
            visuals.auraGlows = undefined;
          }
          if (visuals.auraRing) {
            visuals.auraRing.destroy();
            visuals.auraRing = undefined;
          }
          auraContainer.removeChildren();
          auraContainer.visible = false;
        }

        const showLabel = token.showLabel ?? false;
        const labelText = token.label || token.name || '';
        const labelOffset = 4; // Fixed offset below token
        const tokenProps = (token.properties || {}) as Record<string, unknown>;
        const customLabelFontSize = typeof tokenProps.labelFontSize === 'number' ? tokenProps.labelFontSize : null;
        const labelFontSize = customLabelFontSize || Math.max(10, size * 0.25);
        const labelFontFamily = typeof tokenProps.labelFontFamily === 'string' ? tokenProps.labelFontFamily : 'Arial';
        
        if (showLabel && labelText) {
          labelContainer.eventMode = 'static';
          labelContainer.cursor = 'pointer';
          if (labelContainer.listenerCount('pointerdown') === 0) {
            labelContainer.on('pointerdown', (event: PIXI.FederatedPointerEvent) => {
              if (event.detail === 2) {
                const globalPos = event.global;
                const input = document.createElement('input');
                input.type = 'text';
                input.value = labelText;
                input.style.position = 'absolute';
                input.style.left = `${globalPos.x}px`;
                input.style.top = `${globalPos.y}px`;
                input.style.fontSize = `${labelFontSize * app.stage.scale.x}px`;
                input.style.fontFamily = labelFontFamily;
                input.style.padding = '4px';
                input.style.border = `2px solid ${colors.accent.warning}`;
                input.style.borderRadius = '4px';
                input.style.background = colors.surface.overlay;
                input.style.color = colors.text.primary;
                input.style.outline = 'none';
                input.style.zIndex = '1000';
                input.style.transform = 'translate(-50%, -50%)';
                input.style.minWidth = '100px';
                
                document.body.appendChild(input);
                input.focus();
                input.select();
                
                const finishEditing = (save: boolean) => {
                  const newValue = input.value.trim();
                  if (save && newValue !== labelText) {
                    socketService.updateToken(token.id, { label: newValue, showLabel: true });
                  }
                  input.remove();
                };
                
                input.addEventListener('keydown', (e) => {
                  if (e.key === 'Enter') {
                    finishEditing(true);
                  } else if (e.key === 'Escape') {
                    finishEditing(false);
                  }
                });
                
                input.addEventListener('blur', () => {
                  finishEditing(true);
                });
              }
            });
          }
          labelContainer.x = size / 2;
          labelContainer.y = size / 2;
          labelContainer.removeChildren();

          const labelColor = typeof tokenProps.labelColor === 'string' ? tokenProps.labelColor : DEFAULT_TOKEN_TEXT_COLOR;
          const labelStrokeColor = typeof tokenProps.labelStrokeColor === 'string' ? tokenProps.labelStrokeColor : DEFAULT_TOKEN_STROKE_COLOR;
          const labelPosition = typeof tokenProps.labelPosition === 'string' ? tokenProps.labelPosition : 'below';
          let labelY: number;
          switch (labelPosition) {
            case 'top':
              labelY = -size / 2 - labelOffset;
              break;
            case 'inside-top':
              labelY = -size / 4;
              break;
            case 'inside-bottom':
              labelY = size / 4 + labelOffset + 3;
              break;
            case 'below':
            default:
              labelY = size / 2 + labelOffset;
              break;
          }

          const parseColor = (color: string | number): number => {
            if (typeof color === 'number') return color;
            if (color.startsWith('#')) return parseInt(color.slice(1), 16);
            return parseInt(color, 16);
          };
          
          const label = new PIXI.Text({
            text: String(labelText),
            style: {
              fontFamily: labelFontFamily,
              fontSize: labelFontSize,
              fill: parseColor(labelColor),
              stroke: {
                color: parseColor(labelStrokeColor),
                width: 2,
              },
              align: 'center' as const,
            },
          });
          const stageScale = app.stage.scale.x || 1;
          const resolution = Math.max(3, (window.devicePixelRatio || 1) * 2 / stageScale);
          
          label.resolution = resolution;
          label.anchor.set(0.5);
          label.x = 0;
          label.y = labelY;
          labelContainer.addChild(label);
          
          labelContainer.visible = true;
        } else {
          labelContainer.visible = false;
        }

        const bars = tokenBarsData;
        const hasBars = bars.length > 0 && bars.some(b => b.max > 0);
        
        // Calculate barsY position before setting up click handlers
        const labelPosition = typeof tokenProps.labelPosition === 'string' ? tokenProps.labelPosition : 'below';
        
        // Calculate label Y offset from token center
        let labelYOffset: number;
        switch (labelPosition) {
          case 'top':
            labelYOffset = -size / 2 - labelOffset;
            break;
          case 'inside-top':
            labelYOffset = -size / 4;
            break;
          case 'inside-bottom':
            labelYOffset = size / 4 - labelOffset;
            break;
          case 'below':
          default:
            labelYOffset = size / 2 - 4;
            break;
        }
        const barsY = showLabel && labelText && labelPosition === 'below'
          ? size / 2 + labelYOffset + labelFontSize + 2
          : size;
        
        if (hasBars) {
          barsContainer.eventMode = 'static';
          // Add click handler directly to barsContainer to handle bar clicks
          // This works because bars are rendered as children with their own hit areas
          barsContainer.on('pointerdown', (e) => {
            // Find which bar was clicked based on local Y position
            const localPos = e.getLocalPosition(barsContainer);
            const clickY = localPos ? localPos.y : 0;
            const barHeight = 6;
            const barSpacing = 2;
            const clickedBarIndex = Math.floor(clickY / (barHeight + barSpacing));
            const tokenBars = parseTokenBarsData(token.bars || '').filter(b => b.max > 0);
            const clickedBar = tokenBars[clickedBarIndex];
            
            if (clickedBar) {
              // Found a bar - show the editor for this specific bar
              barEditorRef.current = true;
              const popupWidth = 200;
              
              // Use the event's global position (already in screen coordinates)
              const globalPos = e.data.global;
              
              setBarEditorState({
                tokenId: token.id,
                barName: clickedBar.name,
                current: clickedBar.current,
                max: clickedBar.max,
                color: clickedBar.color,
                position: { x: globalPos.x - popupWidth / 2, y: globalPos.y },
              });
              e.stopPropagation();
            }
          });
          // Debug: remove logging
          // Remove the container-level click handler - we'll rely on individual bar handlers instead
          // This prevents re-render issues when clicking on bars
          // barsContainer.on('pointerdown', ...) is now removed

          barsContainer.x = size / 2;
          barsContainer.y = barsY;
          // Debug: removed logging
          // Ensure barsContainer has a proper hitArea that covers all bars
          const barsHeight = bars.filter(b => b.max > 0).length * (6 + 2);
          barsContainer.hitArea = new PIXI.Rectangle(-size / 2, 0, size, barsHeight);
          barsContainer.removeChildren();
          
          const barWidth = size;
          const barHeight = 6;
          const barSpacing = 2;
          
          bars.forEach((bar, index) => {
            if (bar.max <= 0) return;
            
            const percentage = Math.min(1, Math.max(0, bar.current / bar.max));
            const barY = index * (barHeight + barSpacing);
            
            // Parse color from hex string
            const barColor = parseInt(bar.color.replace('#', ''), 16) || hexColorToNumber(DEFAULT_HP_BAR_COLOR, 0);
            
            // Background bar (empty) - debug hitbox in black
            const barBg = new PIXI.Graphics();
            barBg.roundRect(-barWidth / 2, barY, barWidth, barHeight, 2);
            barBg.fill({ color: DEFAULT_BAR_BACKGROUND, alpha: 0.8 });
            barBg.stroke({ width: 2, color: DEFAULT_CANVAS_STROKE, alpha: 0.8 });
            barBg.hitArea = new PIXI.Rectangle(-barWidth / 2, barY, barWidth, barHeight);
            barBg.eventMode = 'static';
            barBg.cursor = 'pointer';
            barBg.on('pointerdown', (e) => {
              e.stopPropagation();
              barEditorRef.current = true;
              const popupWidth = 200;
              const popupHeight = 180;
              
              // Use the event's global position (already in screen coordinates)
              const globalPos = e.data.global;
              
              setBarEditorState({
                tokenId: token.id,
                barName: bar.name,
                current: bar.current,
                max: bar.max,
                color: bar.color,
                position: { x: globalPos.x - popupWidth / 2, y: globalPos.y },
              });
            });
            barsContainer.addChild(barBg);

            if (percentage > 0) {
              const barFg = new PIXI.Graphics();
              barFg.roundRect(-barWidth / 2, barY, barWidth * percentage, barHeight, 2);
              barFg.fill({ color: barColor, alpha: 0.9 });
              barsContainer.addChild(barFg);
            }

            if (bar.name) {
              const barLabel = new PIXI.Text(`${bar.current}/${bar.max}`, {
                fontFamily: 'Arial',
                fontSize: Math.max(8, barHeight - 1),
                fill: DEFAULT_BAR_TEXT_COLOR,
                align: 'center',
                stroke: {
                  color: DEFAULT_CANVAS_STROKE,
                  width: 2,
                },
                dropShadow: {
                  color: DEFAULT_CANVAS_STROKE,
                  alpha: 0.8,
                  blur: 2,
                  distance: 1,
                  angle: 45,
                },
              });
              barLabel.eventMode = 'none';
              const stageScale = app.stage.scale.x || 1;
              const resolution = Math.max(3, (window.devicePixelRatio || 1) * 3 / stageScale);
              
              barLabel.resolution = resolution;
              barLabel.anchor.set(0.5);
              barLabel.x = 0;
              barLabel.y = barY + barHeight / 2;
              barsContainer.addChild(barLabel);
            }
          });
          
          barsContainer.visible = true;
        } else {
          barsContainer.visible = false;
        }

        if (previous) {
          const previousHp = parseTokenBarsData(previous.bars).find((bar) => bar.name === 'HP')?.current;
          const currentHp = hpBar?.current;
          if (typeof previousHp === 'number' && typeof currentHp === 'number') {
            if (currentHp < previousHp) {
              emitTokenAnimation({ tokenId: token.id, type: 'damage' });
            } else if (currentHp > previousHp) {
              emitTokenAnimation({ tokenId: token.id, type: 'heal' });
            }
            if (previousHp > 0 && currentHp <= 0) {
              emitTokenAnimation({ tokenId: token.id, type: 'downed' });
            }
          }
          if (!previous.selected && isSelected) {
            emitTokenAnimation({ tokenId: token.id, type: 'select' });
          }
        }

        previousTokenStateRef.current.set(token.id, {
          x: token.x,
          y: token.y,
          bars: token.bars,
          size: token.size,
          hidden: isHidden,
          selected: isSelected,
        });
      }
    });

    // Draw token selections on uiLayer
    const tokenSelection = (appRef.current as any)?.tokenSelectionLayer as PIXI.Graphics | undefined;
    if (tokenSelection) {
      tokenSelection.clear();
      // Draw selection rectangles for all selected tokens
      const allSelectedIds = selectedTokenId ? [...selectedTokenIds, selectedTokenId] : selectedTokenIds;
      for (const tokenId of allSelectedIds) {
        const token = tokens.find(t => t.id === tokenId);
        const visuals = tokenVisualsRef.current.get(tokenId);
        if (token && visuals) {
          const footprint = token.size || 1;
          const width = effectiveGridSize * footprint;
          const height = effectiveGridSize * footprint;
          // Get border color based on token disposition
          const borderColor = getTokenBorderColor(token.properties);
          // Draw selection rectangle at token's world position (with rounded corners)
          const selectionRadius = 6;
          tokenSelection.roundRect(token.x - 2, token.y - 2, width + 4, height + 4, selectionRadius);
          tokenSelection.stroke({ width: 3, color: borderColor, alpha: 1 }); // Disposition-based color outline
        }
      }
    }
  }, [
    tokens,
    currentBoard,
    selectedTokenId,
    selectedTokenIds,
    effectiveGridSize,
    isCurrentUserGM,
    linkedCreatureActionsVersion,
    isInCombat,
    combatants,
    currentTurnIndex,
    turnTokenImageUrl,
  ]);

  // Light rendering is now handled by useLightRenderer hook (see above)
  // Original light rendering code removed - now using useLightRenderer hook

  // Light effect animation
  useEffect(() => {
    const app = appRef.current;
    if (!app || !appReady) return;

    const animateEffects = (delta: any) => {
      const time = performance.now();
      
      // Get current lights from store to check effect status
      const currentLights = useGameStore.getState().lights || [];
      
      // Use the light sprites ref from useLightRenderer
      const lightSprites = lightRendererRefs?.lightSpritesRef?.current || lightSpritesRef.current;
      
      lightSprites.forEach((sprite, lightId) => {
        const light = currentLights.find(l => l.id === lightId);
        const originalIntensity = (sprite as any).originalIntensity;
        
        if (!light || !light.effect || light.effect === 'none') {
          // Reset to original intensity and tint if no effect
          if (sprite.alpha !== originalIntensity) {
            sprite.alpha = originalIntensity;
          }
          // Reset tint to white (no tint)
          if (sprite.tint !== DEFAULT_TINT_COLOR) {
            sprite.tint = DEFAULT_TINT_COLOR;
          }
          return;
        }
        
        const speed = light.effectSpeed || 1;
        const intensity = light.effectIntensity ?? 0.5;
        let factor = 1;
        
        // Calculate animation offset based on light position (x + y) to desync animations
        // Use a pseudo-random but consistent offset derived from light position
        const positionOffset = (light.x || 0) + (light.y || 0);
        const phaseOffset = positionOffset * 0.01;
        const timeWithOffset = time + phaseOffset * 1000;
        
        switch (light.effect) {
          case 'flicker': {
            // Organic flickering using multiple sine waves
            const flickerBase = Math.sin(timeWithOffset * 0.01 * speed);
            const flickerNoise = Math.sin(timeWithOffset * 0.023 * speed * 1.7) * 0.3;
            const flickerNoise2 = Math.sin(timeWithOffset * 0.047 * speed * 2.3) * 0.2;
            // Apply intensity to modulate the effect strength
            const flickerStrength = 0.3 + intensity * 0.4;
            factor = 1 - flickerStrength + (flickerBase + flickerNoise + flickerNoise2 + 1) * flickerStrength * 0.5;
            break;
          }
          case 'pulse': {
            // Smooth pulsing effect
            const pulseWave = Math.sin(timeWithOffset * 0.005 * speed);
            // Apply intensity: higher intensity = more pronounced pulse
            factor = 1 - intensity * 0.5 + pulseWave * intensity * 0.5;
            break;
          }
          case 'colorShift': {
            // Color cycling - interpolate between primary and secondary color
            const colorWave = Math.sin(timeWithOffset * 0.003 * speed);
            const t = (colorWave + 1) / 2; // Normalize to 0-1
            
            // Get primary and secondary colors
            const primaryColor = light.color || DEFAULT_LIGHT_COLOR;
            const secondaryColor = light.effectColor || DEFAULT_LIGHT_EFFECT_COLOR;
            
            // Interpolate colors
            const r = Math.round(((primaryColor >> 16) & 0xff) * (1 - t) + ((secondaryColor >> 16) & 0xff) * t);
            const g = Math.round(((primaryColor >> 8) & 0xff) * (1 - t) + ((secondaryColor >> 8) & 0xff) * t);
            const b = Math.round((primaryColor & 0xff) * (1 - t) + (secondaryColor & 0xff) * t);
            
            sprite.tint = (r << 16) | (g << 8) | b;
            
            // Also modulate alpha slightly
            factor = 1 - intensity * 0.3 + colorWave * intensity * 0.3;
            break;
          }
          case 'swirl': {
            // Swirl effect - modulate alpha with complex pattern
            const swirl1 = Math.sin(timeWithOffset * 0.008 * speed);
            const swirl2 = Math.cos(timeWithOffset * 0.006 * speed * 1.3);
            const swirlPattern = (swirl1 + swirl2) / 2;
            // Apply intensity: higher intensity = more dramatic swirl
            factor = 1 - intensity * 0.4 + swirlPattern * intensity * 0.4;
            break;
          }
        }
        
        // Apply factor to alpha (keep within bounds)
        sprite.alpha = Math.max(0.1, Math.min(1.5, originalIntensity * factor));
      });
    };

    app.ticker.add(animateEffects);

    return () => {
      app.ticker.remove(animateEffects);
    };
  }, [appReady, lights]);

  // Animate atmospheric fog (smoke shader)
  useEffect(() => {
    const app = appRef.current;
    if (!app || !atmosphericFogSystemRef.current) return;
    
    const animateFog = () => {
      if (atmosphericFogSystemRef.current && atmosphericFogSystemRef.current.isInitialized) {
        fogAnimationTimeRef.current += 0.01 * fogSpeed;
        atmosphericFogSystemRef.current.update(gameTimeSeconds, fogAnimationTimeRef.current);
      }
    };
    
    app.ticker.add(animateFog);
    
    return () => {
      app.ticker.remove(animateFog);
    };
  }, [appReady, gameTimeSeconds, fogSpeed]);

  // Apply Pixi weather filters to map/background and token layer
  useEffect(() => {
    const app = appRef.current;
    if (!app) return;

    const enabledEffects = (weatherFilterEffects || []).filter((effect: WeatherFilterConfig) => effect.enabled);
    const tokenLayer = (app as any).tokenLayer as PIXI.Container | undefined;

    const layerTargets = [
      backgroundBleedRef.current,
      backgroundRef.current,
      backgroundVignetteRef.current,
      tokenLayer,
    ].filter(Boolean) as PIXI.Container[];

    if (layerTargets.length === 0) return;

    const getTargetFilterSize = (target: PIXI.Container): { width: number; height: number } => {
      const isMapTarget =
        target === backgroundRef.current ||
        target === backgroundBleedRef.current ||
        target === backgroundVignetteRef.current;

      if (isMapTarget) {
        return {
          width: Math.max(1, currentBoard?.width ?? (target as PIXI.Sprite).width ?? app.screen.width),
          height: Math.max(1, currentBoard?.height ?? (target as PIXI.Sprite).height ?? app.screen.height),
        };
      }

      if (target instanceof PIXI.Sprite) {
        return {
          width: Math.max(1, target.width),
          height: Math.max(1, target.height),
        };
      }
      return {
        width: Math.max(1, app.screen.width),
        height: Math.max(1, app.screen.height),
      };
    };

    const resolveEffectForTarget = (
      effect: WeatherFilterConfig,
      target: PIXI.Container,
      _width: number,
      _height: number,
    ): WeatherFilterConfig => {
      // Godray center defaults to 0,0 in the editor; when targeting map sprites,
      // auto-center it for the whole map target to avoid apparent offset.
      if (effect.type === 'godray' && target instanceof PIXI.Sprite) {
        const centerX = typeof effect.settings.centerX === 'number' ? effect.settings.centerX : 0;
        const centerY = typeof effect.settings.centerY === 'number' ? effect.settings.centerY : 0;
        if (centerX === 0 && centerY === 0) {
          return {
            ...effect,
            settings: {
              ...effect.settings,
              centerX: 0.5,
              centerY: 0.5,
            },
          };
        }
      }
      return effect;
    };

    const createFilterStack = (target: PIXI.Container) =>
      enabledEffects
        // Apply Godray only once on the main map sprite so it spans the map
        // without stacking/desaturating across multiple layers.
        .filter((effect) => effect.type !== 'godray' || target === backgroundRef.current)
        .map((effect) => {
          const { width, height } = getTargetFilterSize(target);
          const resolvedEffect = resolveEffectForTarget(effect, target, width, height);
          const filter = createPixiWeatherFilter(resolvedEffect, width, height);
          if (!filter) return null;
          updatePixiWeatherFilter(filter, resolvedEffect, 0, width, height);
          return { effect: resolvedEffect, filter };
        })
        .filter((entry): entry is { effect: WeatherFilterConfig; filter: PIXI.Filter } => !!entry);

    const targetsWithFilters = layerTargets.map((target) => ({ target, created: createFilterStack(target) }));

    const syncFilterArea = (target: PIXI.Container) => {
      // Let Pixi derive the filter region from target bounds.
      // This avoids manual region offsets/clipping artifacts.
      target.filterArea = undefined;
    };

    for (const { target, created } of targetsWithFilters) {
      syncFilterArea(target);
      target.filters = created.map((entry) => entry.filter);
    }

    const animate = () => {
      const deltaSeconds = app.ticker.deltaMS / 1000;
      for (const { target, created } of targetsWithFilters) {
        syncFilterArea(target);
        const { width, height } = getTargetFilterSize(target);
        for (const entry of created) {
          updatePixiWeatherFilter(entry.filter, entry.effect, deltaSeconds, width, height);
        }
      }
    };

    app.ticker.add(animate);
    return () => {
      app.ticker.remove(animate);
      for (const { target } of targetsWithFilters) {
        target.filters = null;
        target.filterArea = undefined;
      }
    };
  }, [
    appReady,
    weatherFilterEffects,
    currentBoard?.backgroundUrl,
    currentBoard?.width,
    currentBoard?.height,
    effectiveMapBleed.enabled,
    effectiveMapBleed.vignette,
  ]);

  // Update background color when it changes
  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    app.renderer.background.color = backgroundColor;
  }, [backgroundColor]);

  // Draw fog-of-war overlay on a dedicated canvas so reveal holes can be composited.
  useEffect(() => {
    const app = appRef.current;
    const canvas = fogCanvasRef.current;
    if (!app || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Mark redraw needed when dependencies change (e.g. fog data, tool state).
    fogRedrawPendingRef.current = true;

    const resizeFogCanvas = () => {
      const rect = app.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      fogRedrawPendingRef.current = true;
    };

    const drawFogOverlay = () => {
      const now = performance.now();
      const stage = app.stage;
      const lastTransform = fogLastTransformRef.current;
      const transformChanged =
        Math.abs(stage.position.x - lastTransform.x) > 0.25 ||
        Math.abs(stage.position.y - lastTransform.y) > 0.25 ||
        Math.abs(stage.scale.x - lastTransform.scale) > 0.001;
      const previewActive =
        isCurrentUserGM &&
        tool === 'fog' &&
        (fogDragRef.current.active ||
          fogPolygonRef.current.active ||
          fogFreeDrawRef.current.active ||
          fogGridRef.current.active ||
          fogPencilRef.current.active ||
          !!fogCursorRef.current);

      // Throttle full redraws when idle. Always draw if we know something changed or preview is active.
      const minIntervalMs = 80;
      if (!transformChanged && !previewActive && !fogRedrawPendingRef.current) {
        if (now - fogLastDrawTimeRef.current < minIntervalMs) {
          return;
        }
      }

      fogLastDrawTimeRef.current = now;
      fogRedrawPendingRef.current = false;
      fogLastTransformRef.current = {
        x: stage.position.x,
        y: stage.position.y,
        scale: stage.scale.x,
      };

      const rect = app.canvas.getBoundingClientRect();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!currentBoard || rect.width <= 0 || rect.height <= 0) return;

      const dpr = window.devicePixelRatio || 1;
      const fogAlpha = isCurrentUserGM ? gmFogOpacity : 1;

      ctx.setTransform(
        stage.scale.x * dpr,
        0,
        0,
        stage.scale.y * dpr,
        stage.position.x * dpr,
        stage.position.y * dpr
      );
      // Use fog color from localStorage (or default black)
      const fogSettings = getPencilSettings();
      const fogHex = fogSettings.fogColor;
      const fogR = parseInt(fogHex.slice(1, 3), 16);
      const fogG = parseInt(fogHex.slice(3, 5), 16);
      const fogB = parseInt(fogHex.slice(5, 7), 16);
      ctx.fillStyle = `rgba(${fogR}, ${fogG}, ${fogB}, ${fogAlpha})`;
      ctx.fillRect(0, 0, currentBoard.width, currentBoard.height);

      const fogOperations = [
        ...fogReveals.map((reveal) => ({
          type: 'reveal' as const,
          polygon: reveal.polygon,
          createdAt: new Date(reveal.createdAt).getTime(),
        })),
        ...fogAdds.map((fogAdd) => ({
          type: 'add' as const,
          polygon: fogAdd.polygon,
          createdAt: new Date(fogAdd.createdAt).getTime(),
        })),
      ].sort((a, b) => a.createdAt - b.createdAt);

      for (const operation of fogOperations) {
        if (!Array.isArray(operation.polygon) || operation.polygon.length < 3) continue;

        if (operation.type === 'reveal') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.beginPath();
          operation.polygon.forEach((point, index) => {
            const x = clampToBoard(point[0], currentBoard.width);
            const y = clampToBoard(point[1], currentBoard.height);
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.closePath();
          ctx.fill();
          continue;
        }

        ctx.globalCompositeOperation = 'source-over';
        // Reapply fog inside the added region without stacking opacity.
        ctx.save();
        ctx.beginPath();
        operation.polygon.forEach((point, index) => {
          const x = clampToBoard(point[0], currentBoard.width);
          const y = clampToBoard(point[1], currentBoard.height);
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.clip();
        ctx.clearRect(0, 0, currentBoard.width, currentBoard.height);
        ctx.fillRect(0, 0, currentBoard.width, currentBoard.height);
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';

      // Draw active fog drawing preview above fog so the GM can see the shape being revealed.
      if (isCurrentUserGM && tool === 'fog') {
        const isFogAddPreview = fogActionRef.current === 'add';
        ctx.strokeStyle = isFogAddPreview ? 'rgba(248, 113, 113, 1)' : 'rgba(147, 197, 253, 1)';
        ctx.fillStyle = isFogAddPreview ? 'rgba(239, 68, 68, 0.28)' : 'rgba(96, 165, 250, 0.28)';
        ctx.lineWidth = 2 / Math.max(0.25, app.stage.scale.x);

        if (fogDrawMode === 'box' && fogDragRef.current.active && fogDragRef.current.start && fogDragRef.current.current) {
          const start = fogDragRef.current.start;
          const current = fogDragRef.current.current;
          const x = Math.min(start.x, current.x);
          const y = Math.min(start.y, current.y);
          const w = Math.abs(current.x - start.x);
          const h = Math.abs(current.y - start.y);
          if (w > 0 && h > 0) {
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.fill();
            ctx.stroke();
          }
        }

        if (fogDrawMode === 'polygon' && fogPolygonRef.current.active && fogPolygonRef.current.points.length > 0) {
          const points = fogPolygonRef.current.points;
          const cursor = fogPolygonRef.current.cursor;
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i += 1) {
            ctx.lineTo(points[i].x, points[i].y);
          }
          if (cursor) {
            ctx.lineTo(cursor.x, cursor.y);
          }
          ctx.stroke();

          if (points.length >= 3) {
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i += 1) {
              ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
        }

        if (fogDrawMode === 'free' && fogFreeDrawRef.current.active && fogFreeDrawRef.current.points.length > 0) {
          const points = fogFreeDrawRef.current.points;
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i += 1) {
            ctx.lineTo(points[i].x, points[i].y);
          }
          ctx.stroke();
        }

        if (fogDrawMode === 'grid' && fogGridRef.current.active && fogGridRef.current.cells.size > 0) {
          for (const cell of fogGridRef.current.cells.values()) {
            ctx.beginPath();
            ctx.rect(cell.x, cell.y, cell.w, cell.h);
            ctx.fill();
            ctx.stroke();
          }
        }

        // Pencil mode preview - show brush when drawing OR when tool is selected
        const currentToolPreview = useGameStore.getState().tool;
        if (fogDrawMode === 'pencil' && currentToolPreview === 'fog') {
          // Show preview at cursor position when not actively drawing
          if (!fogPencilRef.current.active && fogCursorRef.current && currentBoard) {
            const cursorX = clampToBoard(fogCursorRef.current.x, currentBoard.width);
            const cursorY = clampToBoard(fogCursorRef.current.y, currentBoard.height);
            ctx.strokeStyle = 'rgba(147, 197, 253, 0.5)';
            ctx.lineWidth = 2 / Math.max(0.25, app.stage.scale.x);
            ctx.beginPath();
            ctx.arc(cursorX, cursorY, pencilSizeRef.current, 0, Math.PI * 2);
            ctx.stroke();
          }
          // Show preview when actively drawing
          if (fogPencilRef.current.active && fogPencilRef.current.lastCircleKey) {
            const lastCircle = fogPencilRef.current.circles.get(fogPencilRef.current.lastCircleKey);
            if (lastCircle) {
              ctx.strokeStyle = 'rgba(147, 197, 253, 1)';
              ctx.lineWidth = 2 / Math.max(0.25, app.stage.scale.x);
              ctx.beginPath();
              ctx.arc(lastCircle.x, lastCircle.y, pencilSizeRef.current, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        }

      }
    };

    resizeFogCanvas();
    drawFogOverlay();
    window.addEventListener('resize', resizeFogCanvas);
    app.ticker.add(drawFogOverlay);

    return () => {
      window.removeEventListener('resize', resizeFogCanvas);
      app.ticker.remove(drawFogOverlay);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [appReady, currentBoard, fogReveals, fogAdds, isCurrentUserGM, clampToBoard, gmFogOpacity, tool, fogDrawMode, effectiveGridSize, fogSnapToGrid, tokens]);

  // Token drag - with ghost preview
  useEffect(() => {
    const app = appRef.current;
    if (!app || !currentBoard || !appReady) return;

    const stage = app.stage;
    const currentBoardData = currentBoard;
    
    let draggingToken: PIXI.Sprite | null = null;
    let dragTokenId: string | null = null;
    let ghostAnchor: PIXI.Sprite | null = null;
    // Track multiple tokens for multi-select dragging
    let draggingTokenIds: string[] = [];
    let ghostAnchors: PIXI.Sprite[] = [];
    let originalPositions: Map<string, { x: number; y: number }> = new Map();
    let dragStartTokenId: string | null = null; // The token that was clicked to start the drag
    let moveMeasureLine: PIXI.Graphics | null = null;
    let moveMeasureText: PIXI.Text | null = null;
    let originalPos = { x: 0, y: 0 };

    const onPointerDown = (e: PIXI.FederatedPointerEvent) => {
      // Ignore if middle mouse button is pressed (used for panning)
      if (isMiddleMouseDownRef.current) {
        return;
      }
      
      const currentTool = useGameStore.getState().tool;
      const selectedTokenIds = useGameStore.getState().selectedTokenIds;
      
      // Ignore right-click - it should show context menu, not perform selection/drag
      if (e.button === 2) {
        return;
      }
      
      // Ignore middle mouse button - it's used for panning only
      if (e.button === 1) {
        return;
      }
      
      if (currentTool === 'select') {
        const target = e.target;
        
        // Check if clicking on empty space - deselect all
        let clickedOnEmptySpace = true;
        if (target instanceof PIXI.Sprite) {
          for (const [tokenId, sprite] of tokensRef.current) {
            if (sprite === target) {
              clickedOnEmptySpace = false;
              break;
            }
          }
        }
        
        if (clickedOnEmptySpace) {
          useGameStore.getState().setSelectedToken(null);
          useGameStore.getState().setSelectedTokenIds([]);
          setSelectedLightIds([]);
          setSelectedAudioSourceIds([]);
          // Don't return - continue to handle box selection in the second select block below
        }
        
        // Rest of the move tool logic... (only when clicking on a token)
        // Check if we should do multi-token dragging (more than 1 selected)
        if (!clickedOnEmptySpace && selectedTokenIds && selectedTokenIds.length > 1 && target instanceof PIXI.Sprite) {
          // Find which selected token was clicked
          let clickedTokenId: string | null = null;
          for (const [tokenId, sprite] of tokensRef.current) {
            if (sprite === target && selectedTokenIds.includes(tokenId)) {
              clickedTokenId = tokenId;
              break;
            }
          }
          
          if (clickedTokenId) {
            dragStartTokenId = clickedTokenId;
            draggingTokenIds = [...selectedTokenIds];
            originalPositions.clear();
            ghostAnchors = [];
            
            const tokenLayer = (app as any).tokenLayer as PIXI.Container;
            const gridSize = effectiveGridSize;
            const offsetX = gridOffsetX;
            const offsetY = gridOffsetY;
            
            // Create ghosts for all selected tokens
            for (const tokenId of selectedTokenIds) {
              const sprite = tokensRef.current.get(tokenId);
              const visualPos = getTokenVisualPosition(tokenId);
              if (sprite && visualPos) {
                // Store original position
                originalPositions.set(tokenId, {
                  x: visualPos.x,
                  y: visualPos.y,
                });
                
                // Create ghost
                const ghost = new PIXI.Sprite(sprite.texture);
                ghost.x = visualPos.x;
                ghost.y = visualPos.y;
                ghost.width = sprite.width;
                ghost.height = sprite.height;
                ghost.alpha = 0.4; // Ghost transparency when dragging
                ghost.anchor.set(0, 0); // Top-left anchor
                ghostAnchors.push(ghost);
                tokenLayer.addChild(ghost);
                
                // Reduce opacity of original token while dragging
                setTokenDragGhostAlpha(tokenId, 0.2);
              }
            }
            
            // Set reference position for measurement
            // Use center of the token (top-left + center offset)
            const clickedSprite = tokensRef.current.get(clickedTokenId);
            if (clickedSprite) {
              const tokenFootprint = tokens.find(t => t.id === clickedTokenId)?.size || 1;
              const tokenCenterOffsetX = (tokenFootprint * gridSize) / 2;
              const tokenCenterOffsetY = (tokenFootprint * gridSize) / 2;
              // Center = top-left position + offset
              originalPos = {
                x: clickedSprite.x + tokenCenterOffsetX,
                y: clickedSprite.y + tokenCenterOffsetY,
              };
            }
            return; // Exit early - don't do single token dragging
          }
        }
        
        // Single token dragging (only when not multi-selecting and not on empty space)
        if (!clickedOnEmptySpace && target instanceof PIXI.Sprite) {
          for (const [tokenId, sprite] of tokensRef.current) {
            if (sprite === target) {
              draggingToken = sprite;
              dragTokenId = tokenId;
              useGameStore.getState().setSelectedToken(tokenId);
              
              // Get global mouse position and convert to stage coordinates manually
              const pixiEvent = event as unknown as { data?: { global: PIXI.PointData } };
              const globalPos = pixiEvent.data?.global;
              if (globalPos) {
                const stagePos = stage.toLocal(globalPos);
              }
              
              // Store original position - use center of the token for measurement
              const gridSize = effectiveGridSize;
              const tokenFootprint = tokens.find(t => t.id === dragTokenId)?.size || 1;
              const tokenCenterOffsetX = (tokenFootprint * gridSize) / 2;
              const tokenCenterOffsetY = (tokenFootprint * gridSize) / 2;
              const visualPos = getTokenVisualPosition(tokenId);
              if (!visualPos) break;
              // Center = top-left position + offset
              originalPos = {
                x: visualPos.x + tokenCenterOffsetX,
                y: visualPos.y + tokenCenterOffsetY,
              };
              
              // Create ghost token (semi-transparent copy)
              const ghost = new PIXI.Sprite(sprite.texture);
              ghost.x = visualPos.x;
              ghost.y = visualPos.y;
              ghost.width = sprite.width;
              ghost.height = sprite.height;
              ghost.alpha = 0.4; // Ghost transparency when dragging
              ghost.anchor.set(0, 0); // Top-left anchor
              ghostAnchor = ghost;
              const tokenLayer = (app as any).tokenLayer as PIXI.Container;
              tokenLayer.addChild(ghost);
              
              // Reduce opacity of original token while dragging
              setTokenDragGhostAlpha(tokenId, 0.2);
              break;
            }
          }
        }
        
        // Check if we should drag multiple selected tokens (only when not on empty space)
        if (!clickedOnEmptySpace && selectedTokenIds && selectedTokenIds.length > 1) {
          // Find the token that was clicked (the one matching dragTokenId or first in list)
          const clickedTokenId = dragTokenId || selectedTokenIds[0];
          dragStartTokenId = clickedTokenId;
          
          // Find the first selected token to use as reference
          const firstTokenId = selectedTokenIds[0];
          const firstSprite = tokensRef.current.get(firstTokenId);
          
          if (firstSprite) {
            // Initialize arrays for multi-token dragging
            draggingTokenIds = [...selectedTokenIds];
            originalPositions.clear();
            ghostAnchors = [];
            
            const tokenLayer = (app as any).tokenLayer as PIXI.Container;
            const gridSize = effectiveGridSize;
            const offsetX = gridOffsetX;
            const offsetY = gridOffsetY;
            
            // Create ghosts for all selected tokens
            for (const tokenId of selectedTokenIds) {
              const sprite = tokensRef.current.get(tokenId);
              const visualPos = getTokenVisualPosition(tokenId);
              if (sprite && visualPos) {
                // Store original position
                originalPositions.set(tokenId, {
                  x: visualPos.x,
                  y: visualPos.y,
                });
                
                // Create ghost
                const ghost = new PIXI.Sprite(sprite.texture);
                ghost.x = visualPos.x;
                ghost.y = visualPos.y;
                ghost.width = sprite.width;
                ghost.height = sprite.height;
                ghost.alpha = 0.4; // Ghost transparency when dragging
                ghost.anchor.set(0, 0); // Top-left anchor
                ghostAnchors.push(ghost);
                tokenLayer.addChild(ghost);
                
                // Reduce opacity of original token while dragging
                setTokenDragGhostAlpha(tokenId, 0.2);
              }
            }
            
            // Set reference position
            // Use center of the token (top-left + center offset)
            const tokenFootprint = tokens.find(t => t.id === firstTokenId)?.size || 1;
            const tokenCenterOffsetX = (tokenFootprint * gridSize) / 2;
            const tokenCenterOffsetY = (tokenFootprint * gridSize) / 2;
            const firstVisualPos = getTokenVisualPosition(firstTokenId);
            if (!firstVisualPos) {
              return;
            }
            // Center = top-left position + offset
            originalPos = {
              x: firstVisualPos.x + tokenCenterOffsetX,
              y: firstVisualPos.y + tokenCenterOffsetY,
            };
          }
        }
      }
    };

    const onPointerMove = (e: PIXI.FederatedPointerEvent) => {
      // Ignore if middle mouse button is pressed (used for panning)
      if (isMiddleMouseDownRef.current) {
        return;
      }
      
      const gridSize = effectiveGridSize;
      
      // Handle multi-token dragging
      if (draggingTokenIds.length > 0 && ghostAnchors.length > 0) {
        // Use global position and convert to local stage coordinates
        // This correctly accounts for pan/zoom transformations
        const globalPos = e.global;
        const pos = stage.toLocal(globalPos);
        
        // Get primary token footprint for center-based snapping
        const primaryTokenFootprint = tokens.find(t => t.id === (dragStartTokenId || draggingTokenIds[0]))?.size || 1;
        const primaryTokenSize = primaryTokenFootprint * gridSize;
        
        // For ghost display and placement: snap token CENTER based on footprint
        // Even footprint (2x2, 4x4): center snaps to grid INTERSECTION
        // Odd footprint (1x1, 3x3): center snaps to CELL CENTER
        // Use unified utility that matches shader grid calculation
        const snapped = snapTokenToGrid(
          pos.x, 
          pos.y, 
          primaryTokenFootprint, 
          gridSize, 
          gridOffsetX || 0, 
          gridOffsetY || 0
        );
        const snappedCenterX = snapped.x;
        const snappedCenterY = snapped.y;
        const ghostTargetX = snappedCenterX - primaryTokenSize / 2;
        const ghostTargetY = snappedCenterY - primaryTokenSize / 2;
        const measureTargetX = snappedCenterX;
        const measureTargetY = snappedCenterY;
        
        // Get the token's original position that was clicked to start the drag
        const dragStartPos = originalPositions.get(dragStartTokenId || draggingTokenIds[0]);
        if (dragStartPos) {
          // Calculate delta from the clicked token's original position to target position
          const dx = ghostTargetX - dragStartPos.x;
          const dy = ghostTargetY - dragStartPos.y;
          
          // Move all ghosts - apply the same delta to each token
          for (let i = 0; i < draggingTokenIds.length; i++) {
            const origPos = originalPositions.get(draggingTokenIds[i]);
            if (origPos && ghostAnchors[i]) {
              // Simply add the delta to original position (no extra snap)
              ghostAnchors[i].x = origPos.x + dx;
              ghostAnchors[i].y = origPos.y + dy;
            }
          }
        }
        
        // Draw move measurement if enabled - from center to center
        if (showMoveMeasure) {
          const tokenLayer = (app as any).tokenLayer as PIXI.Container;
          
          // Clear previous measurement
          if (moveMeasureLine) {
            moveMeasureLine.destroy();
          }
          if (moveMeasureText) {
            moveMeasureText.destroy();
          }
          
          // Calculate distance from original to target (both using center positions)
          // Recalculate start position dynamically to account for current token size
          const dragStartPos = originalPositions.get(dragStartTokenId || draggingTokenIds[0]);
          let startX = measureTargetX;
          let startY = measureTargetY;
          if (dragStartPos) {
            const startToken = tokens.find(t => t.id === (dragStartTokenId || draggingTokenIds[0]));
            const startFootprint = startToken?.size || 1;
            const startCenterOffsetX = (startFootprint * gridSize) / 2;
            const startCenterOffsetY = (startFootprint * gridSize) / 2;
            startX = dragStartPos.x + startCenterOffsetX;
            startY = dragStartPos.y + startCenterOffsetY;
          }
          const dx = measureTargetX - startX;
          const dy = measureTargetY - startY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const squares = distance / gridSize;
          const ftDistance = Math.round(squares) * squareValue;
          
          // Draw line from center to center
          moveMeasureLine = new PIXI.Graphics();

          // Calculate end position using ghostTarget (actual token position) + center offset
          // ghostTargetX/Y is the top-left corner of where the token will be placed
          const targetToken = tokens.find(t => t.id === (dragStartTokenId || draggingTokenIds[0]));
          const targetFootprint = targetToken?.size || 1;
          const targetCenterOffsetX = (targetFootprint * gridSize) / 2;
          const targetCenterOffsetY = (targetFootprint * gridSize) / 2;
          const endX = ghostTargetX + targetCenterOffsetX;
          const endY = ghostTargetY + targetCenterOffsetY;

          moveMeasureLine.moveTo(startX, startY);
          moveMeasureLine.lineTo(endX, endY);
          moveMeasureLine.stroke({ width: 2, color: measureColorNumber, alpha: 0.8 });
          (app as any).uiLayer.addChild(moveMeasureLine);
          
          moveMeasureText = new PIXI.Text(`${ftDistance} ${gridUnit}`, {
            fontFamily: 'Arial',
            fontSize: 14,
            fill: measureColorNumber,
            stroke: { color: 0x000000, width: 2 },
          });
          moveMeasureText.x = endX + 5;
          moveMeasureText.y = endY + 5;
          (app as any).uiLayer.addChild(moveMeasureText);
        }
        return;
      }
      
      // Single token dragging (original logic)
      if (!draggingToken || !currentBoardData) return;
      
      // Use global position and convert to local stage coordinates
      const globalPos = e.global;
      const pos = stage.toLocal(globalPos);
      
      // Get token footprint for proper center-based snapping
      const tokenFootprint = tokens.find(t => t.id === dragTokenId)?.size || 1;
      const tokenSize = tokenFootprint * gridSize;
      
      // Even footprint (2x2, 4x4): center snaps to grid INTERSECTION
      // Odd footprint (1x1, 3x3): center snaps to CELL CENTER
      // Use unified utility that matches shader grid calculation
      const snapped = snapTokenToGrid(
        pos.x, 
        pos.y, 
        tokenFootprint, 
        gridSize, 
        gridOffsetX || 0, 
        gridOffsetY || 0
      );
      const snappedCenterX = snapped.x;
      const snappedCenterY = snapped.y;
      const ghostX = snappedCenterX - tokenSize / 2;
      const ghostY = snappedCenterY - tokenSize / 2;
      
      // For measurement: use the snapped center position
      const measureX = snappedCenterX;
      const measureY = snappedCenterY;
      
      // Move the ghost, keep original in place
      if (ghostAnchor) {
        ghostAnchor.x = ghostX;
        ghostAnchor.y = ghostY;
        
        // Draw move measurement if enabled - from center to center
        if (showMoveMeasure) {
          const tokenLayer = (app as any).tokenLayer as PIXI.Container;
          
          // Clear previous measurement
          if (moveMeasureLine) {
            moveMeasureLine.destroy();
          }
          if (moveMeasureText) {
            moveMeasureText.destroy();
          }
          
          // Calculate distance using same logic as measure tool
          // Recalculate start position dynamically to account for current token size
          const currentToken = tokens.find(t => t.id === dragTokenId);
          const currentFootprint = currentToken?.size || 1;
          const currentCenterOffsetX = (currentFootprint * gridSize) / 2;
          const currentCenterOffsetY = (currentFootprint * gridSize) / 2;
          const currentVisualPos = dragTokenId ? getTokenVisualPosition(dragTokenId) : null;
          const currentStartX = (currentVisualPos?.x ?? 0) + currentCenterOffsetX;
          const currentStartY = (currentVisualPos?.y ?? 0) + currentCenterOffsetY;
          const dx = measureX - currentStartX;
          const dy = measureY - currentStartY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const squares = distance / gridSize;
          const ftDistance = Math.round(squares) * squareValue;
          
          // Draw line from center to center
          moveMeasureLine = new PIXI.Graphics();

          // Calculate end position using ghost (actual token position) + center offset
          const endX = ghostX + currentCenterOffsetX;
          const endY = ghostY + currentCenterOffsetY;

          moveMeasureLine.moveTo(currentStartX, currentStartY);
          moveMeasureLine.lineTo(endX, endY);
          moveMeasureLine.stroke({ width: 2, color: measureColorNumber, alpha: 0.8 });
          (app as any).uiLayer.addChild(moveMeasureLine);
          
          // Draw text at end of line
          moveMeasureText = new PIXI.Text(`${ftDistance} ${gridUnit}`, {
            fontFamily: 'Arial',
            fontSize: 14,
            fill: measureColorNumber,
            stroke: { color: 0x000000, width: 2 },
          });
          moveMeasureText.x = endX + 5;
          moveMeasureText.y = endY + 5;
          (app as any).uiLayer.addChild(moveMeasureText);
        }
      }
    };

    const onPointerUp = () => {
      // Handle multi-token dragging
      if (draggingTokenIds.length > 0 && ghostAnchors.length > 0) {
        const tokenLayer = (app as any).tokenLayer as PIXI.Container;
        const gridSize = effectiveGridSize;
        const offsetX = gridOffsetX;
        const offsetY = gridOffsetY;
        
        // Get the token that was clicked to start the drag
        const dragStartPos = originalPositions.get(dragStartTokenId || draggingTokenIds[0]);
        
        if (dragStartPos && ghostAnchors[0]) {
          // Calculate delta from the clicked token's original position to its ghost position
          const dx = ghostAnchors[0].x - dragStartPos.x;
          const dy = ghostAnchors[0].y - dragStartPos.y;
          
          // Move all tokens - apply the same delta to each token
          for (let i = 0; i < draggingTokenIds.length; i++) {
            const tokenId = draggingTokenIds[i];
            const origPos = originalPositions.get(tokenId);
            const ghost = ghostAnchors[i];
            
            if (origPos && ghost) {
              // Use ghost position directly (already correct from onPointerMove)
              socketService.moveToken(tokenId, ghost.x, ghost.y);
            }
          }
        }
        
        // Clean up ghosts
        for (const ghost of ghostAnchors) {
          tokenLayer.removeChild(ghost);
          ghost.destroy();
        }
        
        // Restore original token opacity after drag
        for (const tokenId of draggingTokenIds) {
          setTokenDragGhostAlpha(tokenId, 1);
        }
        
        draggingTokenIds = [];
        ghostAnchors = [];
        originalPositions.clear();
        dragStartTokenId = null;
      }
      
      // Single token dragging (original logic)
      if (draggingToken && dragTokenId && currentBoardData && ghostAnchor) {
        // Move token to ghost position
        socketService.moveToken(dragTokenId, ghostAnchor.x, ghostAnchor.y);
        // Remove ghost
        const tokenLayer = (app as any).tokenLayer as PIXI.Container;
        tokenLayer.removeChild(ghostAnchor);
        ghostAnchor.destroy();
        // Restore original token opacity
        setTokenDragGhostAlpha(dragTokenId, 1);
      }
      // Clean up move measurement graphics
      if (moveMeasureLine) {
        moveMeasureLine.destroy();
        moveMeasureLine = null;
      }
      if (moveMeasureText) {
        moveMeasureText.destroy();
        moveMeasureText = null;
      }
      draggingToken = null;
      dragTokenId = null;
      ghostAnchor = null;
    };

    //console.log('[DEBUG] Registering token drag handlers for tool:', tool);
    stage.on('pointerdown', onPointerDown);
    stage.on('pointermove', onPointerMove);
    stage.on('pointerup', onPointerUp);

    return () => {
      stage.off('pointerdown', onPointerDown);
      stage.off('pointermove', onPointerMove);
      stage.off('pointerup', onPointerUp);
    };
  }, [appReady, currentBoard, tool, showMoveMeasure, squareValue, gridUnit, tokens, measureColorNumber, players]);

  // Render persisted measurements from store
  useEffect(() => {
    const app = appRef.current;
    if (!app || !currentBoard) return;
    
    const measurementLayer = (app as any).measurementLayer as PIXI.Container;
    if (!measurementLayer) return;
    
    const gridSize = effectiveGridSize;
    
    // Function to render measurements
    const renderMeasurements = () => {
      const measurements = useGameStore.getState().measurements;
      const removeMeasurement = useGameStore.getState().removeMeasurement;
      
      // Clear existing measurements
      measurementLayer.removeChildren();
      
      // Render each persisted measurement
      measurements.forEach((measurement) => {
        const graphics = new PIXI.Graphics();
        const color = measurement.color ?? measureColorNumber;
        
        // Icon position - always at the origin point where measurement was placed
        let iconX = measurement.startX;
        let iconY = measurement.startY;
        
        if (measurement.shape === 'ray') {
          graphics.moveTo(measurement.startX, measurement.startY);
          graphics.lineTo(measurement.endX, measurement.endY);
          graphics.stroke({ width: 3, color: color });
        } else if (measurement.shape === 'circle') {
          const radius = Math.sqrt(
            Math.pow(measurement.endX - measurement.startX, 2) + 
            Math.pow(measurement.endY - measurement.startY, 2)
          );
          graphics.circle(measurement.startX, measurement.startY, radius);
          graphics.fill({ color: color, alpha: 0.3 });
          graphics.stroke({ width: 3, color: color });
        } else if (measurement.shape === 'rectangle') {
          const snappedStartX = Math.floor(measurement.startX / gridSize) * gridSize;
          const snappedStartY = Math.floor(measurement.startY / gridSize) * gridSize;
          const snappedEndX = Math.floor(measurement.endX / gridSize) * gridSize;
          const snappedEndY = Math.floor(measurement.endY / gridSize) * gridSize;
          
          const x = Math.min(snappedStartX, snappedEndX);
          const y = Math.min(snappedStartY, snappedEndY);
          const width = Math.abs(snappedEndX - snappedStartX);
          const height = Math.abs(snappedEndY - snappedStartY);
          
          graphics.drawRect(x, y, width, height);
          graphics.fill({ color: color, alpha: 0.3 });
          graphics.stroke({ width: 3, color: color });
        } else if (measurement.shape === 'cone') {
          const dx = measurement.endX - measurement.startX;
          const dy = measurement.endY - measurement.startY;
          const angle = Math.atan2(dy, dx);
          const distance = Math.sqrt(dx * dx + dy * dy);
          const coneAngle = Math.PI / 4; // 45 degrees half-angle for D&D cone
          
          const vertices = [
            { x: measurement.startX, y: measurement.startY },
            {
              x: measurement.startX + distance * Math.cos(angle - coneAngle),
              y: measurement.startY + distance * Math.sin(angle - coneAngle)
            },
            {
              x: measurement.startX + distance * Math.cos(angle + coneAngle),
              y: measurement.startY + distance * Math.sin(angle + coneAngle)
            }
          ];
          
          graphics.moveTo(vertices[0].x, vertices[0].y);
          graphics.lineTo(vertices[1].x, vertices[1].y);
          graphics.lineTo(vertices[2].x, vertices[2].y);
          graphics.closePath();
          graphics.fill({ color: color, alpha: 0.3 });
          graphics.stroke({ width: 3, color: color });
        }
        
        measurementLayer.addChild(graphics);
        
        // Create delete button icon
        const iconSize = Math.max(16, gridSize * 0.4);
        const fontSize = Math.max(12, iconSize * 0.75);
        
        const deleteIcon = new PIXI.Text({
          text: '\u2715', // X mark character
          style: {
            fontFamily: 'Arial, sans-serif',
            fontSize: fontSize,
            fill: 0xff6b6b,
            fontWeight: 'bold' as const,
          },
        });
        deleteIcon.x = iconX;
        deleteIcon.y = iconY;
        deleteIcon.eventMode = 'static';
        deleteIcon.cursor = 'pointer';
        deleteIcon.zIndex = 100;
        
        // Add click handler to delete
        deleteIcon.on('pointerdown', (e) => {
          e.stopPropagation();
          removeMeasurement(measurement.id);
        });
        
        // Add hover effect
        deleteIcon.on('pointerover', () => {
          deleteIcon.style.fill = 0xff0000;
        });
        deleteIcon.on('pointerout', () => {
          deleteIcon.style.fill = 0xff6b6b;
        });
        
        measurementLayer.addChild(deleteIcon);
      });
    };
    
    // Initial render
    renderMeasurements();
    
    // Subscribe to store changes
    const unsubscribe = useGameStore.subscribe(() => {
      renderMeasurements();
    });
    
    return () => {
      unsubscribe();
    };
  }, [appReady, currentBoard, effectiveGridSize, measureColorNumber]);

  // Stage interactions - measure
  useEffect(() => {
    const app = appRef.current;
    if (!app || !currentBoard) return;

    const stage = app.stage;
    const uiLayer = (app as any).uiLayer as PIXI.Container;
    
    let measureStart: { x: number; y: number } | null = null;
    let measureLine: PIXI.Graphics | null = null;
    let measureText: PIXI.Text | null = null;
    // Store current measurement data for persistence
    let currentMeasurementData: { shape: string; startX: number; startY: number; endX: number; endY: number; color: number } | null = null;
    
    // Multi-token dragging variables for unified select/move tool
    let draggingTokenIds: string[] = [];
    let ghostAnchors: PIXI.Sprite[] = [];
    let originalPositions: Map<string, { x: number; y: number }> = new Map();
    let dragStartTokenId: string | null = null;
    let originalPos = { x: 0, y: 0 };

    const clearMeasure = () => {
      if (measureLine) { uiLayer.removeChild(measureLine); measureLine = null; }
      if (measureText) { uiLayer.removeChild(measureText); measureText = null; }
      measureStart = null;
    };

    const ensureFogPolygonPreview = () => {
      if (!fogPolygonRef.current.preview) {
        fogPolygonRef.current.preview = new PIXI.Graphics();
        uiLayer.addChild(fogPolygonRef.current.preview);
      }
      return fogPolygonRef.current.preview;
    };

    const drawFogPolygonPreview = () => {
      const preview = ensureFogPolygonPreview();
      preview.clear();
      const { points, cursor, active } = fogPolygonRef.current;
      if (!active || points.length === 0) return;

      preview.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) {
        preview.lineTo(points[i].x, points[i].y);
      }
      if (cursor) {
        preview.lineTo(cursor.x, cursor.y);
      }
      preview.stroke({ width: 2, color: 0x93c5fd, alpha: 1 });

      if (points.length >= 3) {
        preview.poly(points.map((p) => [p.x, p.y]).flat());
        preview.fill({ color: 0x60a5fa, alpha: 0.2 });
      }
    };

    const clearFogPolygon = () => {
      if (fogPolygonRef.current.preview) {
        fogPolygonRef.current.preview.clear();
      }
      fogPolygonRef.current.active = false;
      fogPolygonRef.current.points = [];
      fogPolygonRef.current.cursor = null;
    };

    const clearFogGrid = () => {
      fogGridRef.current.active = false;
      fogGridRef.current.cells.clear();
      fogGridRef.current.lastCellKey = null;
    };

    const addGridCellAtPosition = (x: number, y: number) => {
      if (!currentBoard) return;
      const cellSize = effectiveGridSize;
      // Use unified grid calculation to match shader
      const cellX = Math.floor((x + (gridOffsetX || 0)) / cellSize);
      const cellY = Math.floor((y + (gridOffsetY || 0)) / cellSize);
      const key = `${cellX},${cellY}`;
      if (fogGridRef.current.lastCellKey === key) return;
      fogGridRef.current.lastCellKey = key;
      if (fogGridRef.current.cells.has(key)) return;

      // Calculate cell position in world space matching shader
      const offsetX = gridOffsetX || 0;
      const offsetY = gridOffsetY || 0;
      const rx = cellX * cellSize - offsetX;
      const ry = cellY * cellSize - offsetY;
      const x1 = clampToBoard(rx, currentBoard.width);
      const y1 = clampToBoard(ry, currentBoard.height);
      const x2 = clampToBoard(rx + cellSize, currentBoard.width);
      const y2 = clampToBoard(ry + cellSize, currentBoard.height);
      const w = x2 - x1;
      const h = y2 - y1;
      if (w <= 0 || h <= 0) return;

      fogGridRef.current.cells.set(key, { x: x1, y: y1, w, h });
    };

    const buildCirclePolygon = (cx: number, cy: number, radius: number, segments: number): number[][] => {
      const polygon: number[][] = [];
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        polygon.push([
          cx + Math.cos(angle) * radius,
          cy + Math.sin(angle) * radius,
        ]);
      }
      return polygon;
    };

    const emitFogPolygon = (polygon: number[][], action: 'reveal' | 'add') => {
      if (!currentBoard || polygon.length < 3) return;
      if (action === 'add') {
        socketService.addFog(currentBoard.id, polygon);
        return;
      }
      socketService.revealFog(currentBoard.id, polygon);
    };

    const onPointerDown = (e: PIXI.FederatedPointerEvent) => {
      //console.log('[DEBUG] onPointerDown called!');
      // Ignore if middle mouse button is pressed (used for panning)
      if (isMiddleMouseDownRef.current) {
        return;
      }
      
      const currentTool = useGameStore.getState().tool;
      const currentIsGM = useGameStore.getState().isGM;
      const pos = { x: e.global.x, y: e.global.y };
      
      // Ignore right-click - it should show context menu, not perform selection/drag
      if (e.button === 2 && currentTool !== 'fog' && currentTool !== 'particle') {
        return;
      }
      
      // Ignore middle mouse button - it's used for panning only
      if (e.button === 1) {
        return;
      }
      
      // Particle tool handles manual placement
        if (currentTool === 'particle') {
          const system = particleSystemRef.current;
          if (!system || !currentBoard) return;
          const localPos = stage.toLocal(pos);
        if (
          localPos.x < 0 ||
          localPos.y < 0 ||
          localPos.x > currentBoard.width ||
          localPos.y > currentBoard.height
        ) {
          return;
        }

        if (e.button === 2) {
          let nearestIndex = -1;
          let nearestDist = Infinity;
          for (let i = 0; i < manualEmitterRef.current.length; i++) {
            const placed = manualEmitterRef.current[i];
            const dx = placed.x - localPos.x;
            const dy = placed.y - localPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < nearestDist && dist < particleEmitterSize) {
              nearestDist = dist;
              nearestIndex = i;
            }
          }
          if (nearestIndex >= 0) {
            const removed = manualEmitterRef.current.splice(nearestIndex, 1)[0];
            system.stopByToken(removed.key);
            if (activeEmitterEditKey === removed.key) {
              setActiveEmitterEditKey(null);
            }
            setSelectedParticleEmitterKeys((prev) => prev.filter((key) => key !== removed.key));
            const nextEmitters = [...manualEmitterRef.current];
            setManualEmitters(nextEmitters);
            setSceneParticleEmitters(serializeManualEmitters(nextEmitters));
          }
        } else {
          const offsetX = gridOffsetX || 0;
          const offsetY = gridOffsetY || 0;
          let spawnX: number;
          let spawnY: number;

          if (shiftKeyRef.current) {
            spawnX = localPos.x;
            spawnY = localPos.y;
          } else if (ctrlKeyRef.current) {
            const snapped = snapToGridCellCenter(localPos.x, localPos.y, effectiveGridSize, offsetX, offsetY);
            spawnX = snapped.x;
            spawnY = snapped.y;
          } else {
            const snapped = snapToGridIntersection(localPos.x, localPos.y, effectiveGridSize, offsetX, offsetY);
            spawnX = snapped.x;
            spawnY = snapped.y;
          }

          const key = `manual:${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const overrides: Partial<ParticlePreset> = {
            spawnRadius: particleEmitterSize / 2,
            durationMs: 0,
          };
          system.playPreset(particlePreset, {
            x: spawnX,
            y: spawnY,
            sourceTokenId: key,
            overrides,
          });
          manualEmitterRef.current.push({ key, x: spawnX, y: spawnY, presetId: particlePreset, overrides });
          const nextEmitters = [...manualEmitterRef.current];
          setManualEmitters(nextEmitters);
          setSceneParticleEmitters(serializeManualEmitters(nextEmitters));
          setSelectedParticleEmitterKeys([key]);
        }
        return;
      }

      // Move tool handles selection and movement
      if (currentTool === 'select') {
        //console.log('[DEBUG] Tool is select, processing click');
        const selectedTokenIds = useGameStore.getState().selectedTokenIds;
        
        // Check if clicking on empty space (not on a token) to start drag select
        let clickedOnToken = false;
        let clickedTokenId: string | null = null;
        let clickedTokenSprite: PIXI.Sprite | null = null;
        let clickedTokenCenter = null as { x: number; y: number } | null;
        
        // Check if we clicked on a token by iterating through tokens
        // Use toLocal to convert global coordinates to local stage coordinates
        // This is critical for correct hit testing when zoomed/panned
        const localPos = stage.toLocal(pos);
        for (const [id, sprite] of tokensRef.current) {
          const visualPos = getTokenVisualPosition(id);
          if (!visualPos) continue;
          if (localPos.x >= visualPos.x && localPos.x <= visualPos.x + sprite.width &&
              localPos.y >= visualPos.y && localPos.y <= visualPos.y + sprite.height) {
            clickedOnToken = true;
            clickedTokenId = id;
            clickedTokenSprite = sprite;
            // Store the token's center position for selection box
            clickedTokenCenter = { x: visualPos.x, y: visualPos.y };
            break;
          }
        }
        
        // Not clicking on a token - do selection logic (or box select)
        if (!clickedOnToken) {
          if (pendingSingleTokenClickTimeoutRef.current !== null) {
            window.clearTimeout(pendingSingleTokenClickTimeoutRef.current);
            pendingSingleTokenClickTimeoutRef.current = null;
          }
          pendingTokenDragRef.current = null;
          // Store potential drag selection start (will be activated if user actually drags)
          dragSelectStart.current = { x: pos.x, y: pos.y };
          dragSelectCurrent.current = { x: pos.x, y: pos.y };
          // Don't set isDragSelecting.current = true yet - wait for drag threshold
        } else if (clickedTokenCenter && clickedTokenId) {
          // DEBUG: Log when we hit this code path
          console.log('[DEBUG] Token click handler reached, tool:', currentTool, 'tokenId:', clickedTokenId, 'click detail:', e.detail);
          
          // Check for double-click on token using time-based detection
          const currentTime = Date.now();
          const lastClick = lastTokenClickInfo;
          const timeDiff = currentTime - lastClick.time;
          const isSameToken = lastClick.tokenId === clickedTokenId;
          const isDoubleClick = isSameToken && timeDiff < DOUBLE_CLICK_THRESHOLD;
          
          console.log('[DEBUG] Double-click check:', { 
            lastClickTokenId: lastClick.tokenId, 
            clickedTokenId, 
            isSameToken, 
            timeDiff, 
            threshold: DOUBLE_CLICK_THRESHOLD,
            isDoubleClick 
          });
          
          if (isDoubleClick) {
            if (pendingSingleTokenClickTimeoutRef.current !== null) {
              window.clearTimeout(pendingSingleTokenClickTimeoutRef.current);
              pendingSingleTokenClickTimeoutRef.current = null;
            }
            // Double-click detected - try to open creature sheet
            // Get FRESH tokens from store to avoid stale closure
            const freshTokens = useGameStore.getState().tokens;
            const token = freshTokens.find(t => t.id === clickedTokenId);
            const tokenProps = (token?.properties || {}) as Record<string, unknown>;
            const linkedCreatureId = typeof token?.creatureId === 'string'
              ? token.creatureId
              : typeof tokenProps.creatureId === 'string'
                ? tokenProps.creatureId
                : null;
            console.log('[DEBUG] Token double-clicked:', token?.name, 'creatureId:', linkedCreatureId);
            if (linkedCreatureId && token) {
              console.log('[DEBUG] Opening creature sheet for:', linkedCreatureId);
              useGameStore.getState().openSheet({ type: 'creature', id: linkedCreatureId, tokenId: token.id });
            } else {
              console.log('[DEBUG] Token has no creatureId, trying to match by name:', token?.name);
              // Fallback: try to find creature or character by name
              if (token?.name) {
                useGameStore.getState().openSheet({ type: 'creature', searchName: token.name });
              }
            }
            lastTokenClickInfo = { tokenId: '', time: 0 };
            pendingTokenDragRef.current = null;
            return;
          }

          if (clickedTokenSprite && selectedTokenIds && selectedTokenIds.includes(clickedTokenId)) {
            if (pendingSingleTokenClickTimeoutRef.current !== null) {
              window.clearTimeout(pendingSingleTokenClickTimeoutRef.current);
              pendingSingleTokenClickTimeoutRef.current = null;
            }
            pendingTokenDragRef.current = {
              tokenId: clickedTokenId,
              selectedTokenIds: [...selectedTokenIds],
              startX: pos.x,
              startY: pos.y,
            };
            lastTokenClickInfo = { tokenId: clickedTokenId, time: currentTime };
            return;
          } else {
            pendingTokenDragRef.current = null;
            if (pendingSingleTokenClickTimeoutRef.current !== null) {
              window.clearTimeout(pendingSingleTokenClickTimeoutRef.current);
            }

            pendingSingleTokenClickTimeoutRef.current = window.setTimeout(() => {
              console.log('[DEBUG] Single click on token, tokenId:', clickedTokenId);

              const freshTokens = useGameStore.getState().tokens;
              console.log('[DEBUG] Fresh tokens array length:', freshTokens.length);
              console.log('[DEBUG] Fresh token ids:', freshTokens.map(t => t.id));

              useGameStore.getState().setSelectedToken(clickedTokenId);
              useGameStore.getState().setSelectedTokenIds([clickedTokenId]);

              const token = freshTokens.find(t => t.id === clickedTokenId);
              console.log('[DEBUG] Token found:', token);
              pendingSingleTokenClickTimeoutRef.current = null;
            }, DOUBLE_CLICK_THRESHOLD);

            lastTokenClickInfo = { tokenId: clickedTokenId, time: currentTime };
          }
        }
      } else if (currentTool === 'measure') {
        // Check if click is on an existing measurement - if so, don't start a new one
        const existingMeasurements = useGameStore.getState().measurements;
        const clickX = pos.x;
        const clickY = pos.y;
        const clickThreshold = 20; // pixels tolerance
        
        const isOnExistingMeasurement = existingMeasurements.some((m) => {
          // Check if click is near the start point of any measurement
          const dist = Math.sqrt(
            Math.pow(clickX - m.startX, 2) + Math.pow(clickY - m.startY, 2)
          );
          return dist < clickThreshold;
        });
        
        if (!isOnExistingMeasurement) {
          measureStart = { x: pos.x, y: pos.y };
        }
      } else if (currentTool === 'fog' && currentIsGM && currentBoard) {
        const fogAction = e.button === 2 ? 'add' : e.button === 0 ? 'reveal' : null;
        if (!fogAction) return;

        const localPos = stage.toLocal(pos);
        let startX = clampToBoard(localPos.x, currentBoard.width);
        let startY = clampToBoard(localPos.y, currentBoard.height);
        
        // Apply grid snapping if enabled (not needed for 'grid' mode which already snaps)
        if (fogSnapToGrid && fogDrawMode !== 'grid') {
          const gridSize = effectiveGridSize || 50;
          const offsetX = gridOffsetX || 0;
          const offsetY = gridOffsetY || 0;
          const snapped = snapToGridIntersection(startX, startY, gridSize, offsetX, offsetY);
          startX = snapped.x;
          startY = snapped.y;
        }
        
        fogActionRef.current = fogAction;

        if (fogDrawMode === 'polygon') {
          const point = { x: startX, y: startY };
          const polygon = fogPolygonRef.current;

          if (polygon.active && fogActionRef.current !== fogAction) {
            clearFogPolygon();
          }

          if (!polygon.active) {
            polygon.active = true;
            polygon.points = [point];
            polygon.cursor = point;
            ensureFogPolygonPreview();
            drawFogPolygonPreview();
            return;
          }

          const first = polygon.points[0];
          const closeDistance = Math.hypot(point.x - first.x, point.y - first.y);
          if ((e.detail >= 2 || closeDistance < 12) && polygon.points.length >= 3) {
            const polygonPoints = polygon.points.map((p) => [p.x, p.y]);
            emitFogPolygon(polygonPoints, fogAction);
            clearFogPolygon();
            fogActionRef.current = null;
            return;
          }

          polygon.points = [...polygon.points, point];
          polygon.cursor = point;
          drawFogPolygonPreview();
        } else if (fogDrawMode === 'free') {
          clearFogPolygon();
          clearFogGrid();
          fogFreeDrawRef.current.active = true;
          fogFreeDrawRef.current.points = [{ x: startX, y: startY }];
        } else if (fogDrawMode === 'grid') {
          clearFogPolygon();
          fogFreeDrawRef.current.active = false;
          fogFreeDrawRef.current.points = [];
          fogGridRef.current.active = true;
          fogGridRef.current.cells.clear();
          fogGridRef.current.lastCellKey = null;
          addGridCellAtPosition(startX, startY);
        } else if (fogDrawMode === 'pencil') {
          // DEBUG: Pencil mode handler
          clearFogPolygon();
          clearFogGrid();
          fogFreeDrawRef.current.active = false;
          fogFreeDrawRef.current.points = [];
          fogPencilRef.current.active = true;
          fogPencilRef.current.circles.clear();
          fogPencilRef.current.lastCircleKey = null;
          // Add initial circle
          const key = `${Math.round(startX)},${Math.round(startY)}`;
          fogPencilRef.current.circles.set(key, { x: startX, y: startY, radius: pencilSizeRef.current });
          fogPencilRef.current.lastCircleKey = key;
          emitFogPolygon(buildCirclePolygon(startX, startY, pencilSizeRef.current, getPencilSettings().smoothness), fogAction);
        } else {
          clearFogPolygon();
          clearFogGrid();
          fogFreeDrawRef.current.active = false;
          fogFreeDrawRef.current.points = [];
          fogDragRef.current.active = true;
          fogDragRef.current.start = { x: startX, y: startY };
          fogDragRef.current.current = { x: startX, y: startY };

          if (!fogDragRef.current.preview) {
            fogDragRef.current.preview = new PIXI.Graphics();
            uiLayer.addChild(fogDragRef.current.preview);
          }
        }
      } else if (currentTool === 'light') {
        // Light tool is ONLY for creating new lights
        // Selection of lights should be done with the select tool
        
        // Also track for potential deselection on click (like select tool)
        dragSelectStart.current = { x: pos.x, y: pos.y };
        dragSelectCurrent.current = { x: pos.x, y: pos.y };
        
        // Clicked on empty space - set up for light creation
        const localPos = stage.toLocal(pos);
        // Check if shift key is held for free placement (no grid snapping)
        // Use ctrl key for cell center snapping (default is grid intersection)
        const offsetX = gridOffsetX || 0;
        const offsetY = gridOffsetY || 0;
        let snapX: number;
        let snapY: number;
        
        if (shiftKeyRef.current) {
          // Free placement
          snapX = localPos.x;
          snapY = localPos.y;
        } else if (ctrlKeyRef.current) {
          // Cell center snapping - use unified utility
          const cellCenter = snapToGridCellCenter(localPos.x, localPos.y, gridSize, offsetX, offsetY);
          snapX = cellCenter.x;
          snapY = cellCenter.y;
        } else {
          // Grid intersection snapping (default) - use unified utility
          const intersection = snapToGridIntersection(localPos.x, localPos.y, gridSize, offsetX, offsetY);
          snapX = intersection.x;
          snapY = intersection.y;
        }
        
        // Store pending light info - will be created on drag
        pendingLightRef.current = {
          pending: true,
          x: snapX,
          y: snapY,
          startX: localPos.x,
          startY: localPos.y,
        };
      } else if (currentTool === 'audio') {
        // Audio tool is ONLY for creating new audio sources
        // Selection of audio sources should be done with the select tool
        
        // Also track for potential deselection on click (like select tool)
        dragSelectStart.current = { x: pos.x, y: pos.y };
        dragSelectCurrent.current = { x: pos.x, y: pos.y };
        
        // Clicked on empty space - set up for audio source creation
        const localPos = stage.toLocal(pos);
        // Check if shift key is held for free placement (no grid snapping)
        // Use ctrl key for cell center snapping (default is grid intersection)
        const offsetX = gridOffsetX || 0;
        const offsetY = gridOffsetY || 0;
        let snapX: number;
        let snapY: number;
        
        if (shiftKeyRef.current) {
          // Free placement
          snapX = localPos.x;
          snapY = localPos.y;
        } else if (ctrlKeyRef.current) {
          // Cell center snapping - use unified utility
          const cellCenter = snapToGridCellCenter(localPos.x, localPos.y, gridSize, offsetX, offsetY);
          snapX = cellCenter.x;
          snapY = cellCenter.y;
        } else {
          // Grid intersection snapping (default) - use unified utility
          const intersection = snapToGridIntersection(localPos.x, localPos.y, gridSize, offsetX, offsetY);
          snapX = intersection.x;
          snapY = intersection.y;
        }
        
        // Store pending audio source info - will be created on drag
        pendingAudioSourceRef.current = {
          pending: true,
          x: snapX,
          y: snapY,
          startX: localPos.x,
          startY: localPos.y,
        };
      }
    };

    const onPointerMove = (e: PIXI.FederatedPointerEvent) => {
      // Ignore if middle mouse button is pressed (used for panning)
      if (isMiddleMouseDownRef.current) {
        return;
      }
      
      const currentTool = useGameStore.getState().tool;
      if (!currentTool) return;
      
      // Track cursor position for fog tool preview
      if (currentTool === 'fog') {
        const localPos = stage.toLocal(e.global);
        fogCursorRef.current = { x: localPos.x, y: localPos.y };
      }
      
      // Ignore middle mouse button - it's used for panning only
      if (e.button === 1) {
        return;
      }
      
      const pos = { x: e.global.x, y: e.global.y };
      const gridSize = effectiveGridSize;

      if (currentTool === 'select' && pendingTokenDragRef.current) {
        const pendingDrag = pendingTokenDragRef.current;
        const movedX = pos.x - pendingDrag.startX;
        const movedY = pos.y - pendingDrag.startY;

        if (Math.hypot(movedX, movedY) <= 5) {
          return;
        }

        // Check if ghosts already exist from the first useEffect handler
        // This prevents duplicate ghost tokens when dragging a selected token
        // as both handlers may try to create ghosts
        const tokenLayer = (app as any).tokenLayer as PIXI.Container;
        let hasExistingGhosts = false;
        for (const child of tokenLayer.children) {
          if (child instanceof PIXI.Sprite && child.alpha === 0.4) {
            hasExistingGhosts = true;
            break;
          }
        }
        
        if (hasExistingGhosts) {
          pendingTokenDragRef.current = null;
          return;
        }

        const clickedTokenSprite = tokensRef.current.get(pendingDrag.tokenId);
        if (clickedTokenSprite) {
          dragStartTokenId = pendingDrag.tokenId;
          draggingTokenIds = [...pendingDrag.selectedTokenIds];
          originalPositions.clear();
          ghostAnchors = [];

          const tokenLayer = (app as any).tokenLayer as PIXI.Container;

          for (const tokenId of pendingDrag.selectedTokenIds) {
            const sprite = tokensRef.current.get(tokenId);
            const visualPos = getTokenVisualPosition(tokenId);
            if (sprite && visualPos) {
              originalPositions.set(tokenId, {
                x: visualPos.x,
                y: visualPos.y,
              });

              const ghost = new PIXI.Sprite(sprite.texture);
              ghost.x = visualPos.x;
              ghost.y = visualPos.y;
              ghost.width = sprite.width;
              ghost.height = sprite.height;
              ghost.alpha = 0.4;
              ghost.anchor.set(0, 0);
              ghostAnchors.push(ghost);
              tokenLayer.addChild(ghost);
              setTokenDragGhostAlpha(tokenId, 0.8);
            }
          }

          const tokenFootprint = tokens.find(t => t.id === pendingDrag.tokenId)?.size || 1;
          const tokenCenterOffsetX = (tokenFootprint * gridSize) / 2;
          const tokenCenterOffsetY = (tokenFootprint * gridSize) / 2;
          const clickedVisualPos = getTokenVisualPosition(pendingDrag.tokenId);
          if (!clickedVisualPos) {
            pendingTokenDragRef.current = null;
            return;
          }
          originalPos = {
            x: clickedVisualPos.x + tokenCenterOffsetX,
            y: clickedVisualPos.y + tokenCenterOffsetY,
          };
        }

        pendingTokenDragRef.current = null;
      }
      
      // Handle multi-token dragging in select mode
      if (draggingTokenIds.length > 0 && ghostAnchors.length > 0) {
        // Convert global position to local stage coordinates
        // This correctly accounts for pan/zoom transformations
        const localPos = stage.toLocal(pos);
        
        // Get primary token footprint for center-based snapping
        const primaryTokenFootprint = tokens.find(t => t.id === (dragStartTokenId || draggingTokenIds[0]))?.size || 1;
        const primaryTokenSize = primaryTokenFootprint * gridSize;
        
        // For ghost display and placement: snap token CENTER based on footprint
        // Even footprint (2x2, 4x4): center snaps to grid INTERSECTION
        // Odd footprint (1x1, 3x3): center snaps to CELL CENTER
        // Use unified utility that matches shader grid calculation
        const snapped = snapTokenToGrid(
          localPos.x, 
          localPos.y, 
          primaryTokenFootprint, 
          gridSize, 
          gridOffsetX || 0, 
          gridOffsetY || 0
        );
        const snappedCenterX = snapped.x;
        const snappedCenterY = snapped.y;
        const ghostTargetX = snappedCenterX - primaryTokenSize / 2;
        const ghostTargetY = snappedCenterY - primaryTokenSize / 2;
        const measureTargetX = snappedCenterX;
        const measureTargetY = snappedCenterY;
        
        // Get the token's original position that was clicked to start the drag
        const dragStartPos = originalPositions.get(dragStartTokenId || draggingTokenIds[0]);
        if (dragStartPos) {
          // Calculate delta from the clicked token's original position to target position
          const dx = ghostTargetX - dragStartPos.x;
          const dy = ghostTargetY - dragStartPos.y;
          
          // Move all ghosts - apply the same delta to each token
          for (let i = 0; i < draggingTokenIds.length; i++) {
            const origPos = originalPositions.get(draggingTokenIds[i]);
            if (origPos && ghostAnchors[i]) {
              // Simply add the delta to original position (no extra snap)
              ghostAnchors[i].x = origPos.x + dx;
              ghostAnchors[i].y = origPos.y + dy;
            }
          }
        }
        return;
      }
      
      // Handle drag selection rectangle (only for select tool)
      if (currentTool === 'select' && dragSelectStart.current) {
        // Track current position
        dragSelectCurrent.current = { x: pos.x, y: pos.y };
        
        // Remove previous selection rectangle
        if (selectionRectRef.current) {
          uiLayer.removeChild(selectionRectRef.current);
        }
        
        // Calculate selection rectangle bounds
        const startX = dragSelectStart.current.x;
        const startY = dragSelectStart.current.y;
        const rectX = Math.min(startX, pos.x);
        const rectY = Math.min(startY, pos.y);
        const rectWidth = Math.abs(pos.x - startX);
        const rectHeight = Math.abs(pos.y - startY);
        
        // Only draw if we've moved enough (to distinguish from a click)
        if (rectWidth > 5 || rectHeight > 5) {
          // Activate drag selection now that we've exceeded the threshold
          if (!isDragSelecting.current) {
            isDragSelecting.current = true;
            // Clear selection when starting a new box selection
            useGameStore.getState().setSelectedToken(null);
            useGameStore.getState().setSelectedTokenIds([]);
            setSelectedLightIds([]);
            setSelectedAudioSourceIds([]);
          }
          
          // Convert global to local coordinates for drawing on stage
          const stagePos = app.stage.position;
          const stageScale = app.stage.scale;
          const drawX = (rectX - stagePos.x) / stageScale.x;
          const drawY = (rectY - stagePos.y) / stageScale.y;
          const drawWidth = rectWidth / stageScale.x;
          const drawHeight = rectHeight / stageScale.y;
          
          // Get box selection colors from theme or custom settings
          const themeColorScheme = useGameStore.getState().colorScheme;
          const boxSelectionColor = useGameStore.getState().boxSelectionColor;
          const boxSelectionBgColor = useGameStore.getState().boxSelectionBgColor;
          
          // Use custom box selection colors if set, otherwise fall back to theme accent
          const borderColor = boxSelectionColor || themeColorScheme.accent || DEFAULT_SELECTION_BORDER_COLOR;
          const borderColorNumber = hexColorToNumber(borderColor, hexColorToNumber(DEFAULT_SELECTION_BORDER_COLOR, 0));
          
          // Parse background color (supports hex or rgba)
          let bgColorNumber = borderColorNumber;
          let bgAlpha = 0.1;
          if (boxSelectionBgColor) {
            if (boxSelectionBgColor.startsWith('rgba')) {
              const rgbaMatch = boxSelectionBgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]+)?/);
              if (rgbaMatch) {
                bgColorNumber = (parseInt(rgbaMatch[1]) << 16) | (parseInt(rgbaMatch[2]) << 8) | parseInt(rgbaMatch[3]);
                bgAlpha = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 0.1;
              }
            } else if (boxSelectionBgColor.startsWith('#')) {
              bgColorNumber = parseInt(boxSelectionBgColor.replace('#', ''), 16);
            }
          }
          
          // Draw selection rectangle with customizable colors
          selectionRectRef.current = new PIXI.Graphics();
          selectionRectRef.current.rect(drawX, drawY, drawWidth, drawHeight);
          selectionRectRef.current.fill({ color: bgColorNumber, alpha: bgAlpha });
          selectionRectRef.current.stroke({ width: 2, color: borderColorNumber });
          uiLayer.addChild(selectionRectRef.current);
        }
      }

      if (currentTool === 'fog' && fogDrawMode === 'polygon' && fogPolygonRef.current.active && currentBoard) {
        const localPos = stage.toLocal(pos);
        let cursorX = clampToBoard(localPos.x, currentBoard.width);
        let cursorY = clampToBoard(localPos.y, currentBoard.height);
        // Apply grid snapping if enabled
        if (fogSnapToGrid) {
          const gridSize = effectiveGridSize || 50;
          const offsetX = gridOffsetX || 0;
          const offsetY = gridOffsetY || 0;
          const snapped = snapToGridIntersection(cursorX, cursorY, gridSize, offsetX, offsetY);
          cursorX = snapped.x;
          cursorY = snapped.y;
        }
        fogPolygonRef.current.cursor = {
          x: cursorX,
          y: cursorY,
        };
        drawFogPolygonPreview();
        return;
      }

      if (currentTool === 'fog' && fogDrawMode === 'free' && fogFreeDrawRef.current.active && currentBoard) {
        const localPos = stage.toLocal(pos);
        let pointX = clampToBoard(localPos.x, currentBoard.width);
        let pointY = clampToBoard(localPos.y, currentBoard.height);
        // Apply grid snapping if enabled
        if (fogSnapToGrid) {
          const gridSize = effectiveGridSize || 50;
          const offsetX = gridOffsetX || 0;
          const offsetY = gridOffsetY || 0;
          const snapped = snapToGridIntersection(pointX, pointY, gridSize, offsetX, offsetY);
          pointX = snapped.x;
          pointY = snapped.y;
        }
        const point = {
          x: pointX,
          y: pointY,
        };
        const points = fogFreeDrawRef.current.points;
        const lastPoint = points[points.length - 1];
        if (!lastPoint || Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) >= 2) {
          points.push(point);
        }
        return;
      }

      if (currentTool === 'fog' && fogDrawMode === 'grid' && fogGridRef.current.active && currentBoard) {
        const localPos = stage.toLocal(pos);
        addGridCellAtPosition(localPos.x, localPos.y);
        return;
      }

      // DEBUG: Pencil mode continuous drawing - send reveals INSTANTLY
      // Doubled draw rate - using finer position key (0.5px instead of 1px)
      // Only draw if the brush is on top of fog (not already revealed)
      if (currentTool === 'fog' && fogDrawMode === 'pencil' && fogPencilRef.current.active && currentBoard) {
        const localPos = stage.toLocal(pos);
        let x = clampToBoard(localPos.x, currentBoard.width);
        let y = clampToBoard(localPos.y, currentBoard.height);
        // Apply grid snapping if enabled
        if (fogSnapToGrid) {
          const gridSize = effectiveGridSize || 50;
          const offsetX = gridOffsetX || 0;
          const offsetY = gridOffsetY || 0;
          const snapped = snapToGridIntersection(x, y, gridSize, offsetX, offsetY);
          x = snapped.x;
          y = snapped.y;
        }
        const settings = getPencilSettings();
        const lastKey = fogPencilRef.current.lastCircleKey;
        const key = `${x.toFixed(1)},${y.toFixed(1)}`;
        
        // INTERPOLATION APPROACH: Always draw, but interpolate to fill gaps
        // Draw Rate slider now controls interpolation density (gap spacing)
        const radius = pencilSizeRef.current;
        const drawRateMultiplier = settings.drawRate; // 1-8
        // Higher rate = smaller spacing = more circles (denser line)
        // Rate 1: spacing = 80% of radius (gaps possible), Rate 8: spacing = 10% of radius (very dense)
        const minSpacing = radius * (0.8 - (drawRateMultiplier - 1) * 0.1);
        
        let debugInfo = '';
        if (lastKey) {
          const lastParts = lastKey.split(',');
          const lastX = parseFloat(lastParts[0]);
          const lastY = parseFloat(lastParts[1]);
          const distance = Math.sqrt(Math.pow(x - lastX, 2) + Math.pow(y - lastY, 2));
          
          // Interpolate if distance > minSpacing
          if (distance > minSpacing) {
            const steps = Math.floor(distance / minSpacing);
            const angle = Math.atan2(y - lastY, x - lastX);
            
            for (let i = 1; i <= steps; i++) {
              const interpX = lastX + Math.cos(angle) * (minSpacing * i);
              const interpY = lastY + Math.sin(angle) * (minSpacing * i);
              const interpKey = `${interpX.toFixed(1)},${interpY.toFixed(1)}`;
              
              if (!fogPencilRef.current.circles.has(interpKey)) {
                fogPencilRef.current.circles.set(interpKey, { x: interpX, y: interpY, radius });
                
                // Send interpolated circle to server
                const segments = settings.smoothness;
                const polygon: number[][] = [];
                for (let j = 0; j < segments; j++) {
                  const angleStep = (j / segments) * Math.PI * 2;
                  polygon.push([
                    interpX + Math.cos(angleStep) * radius,
                    interpY + Math.sin(angleStep) * radius,
                  ]);
                }
                emitFogPolygon(polygon, fogActionRef.current ?? 'reveal');
              }
            }
          }
        }
        if (fogPencilRef.current.lastCircleKey !== key) {
          fogPencilRef.current.lastCircleKey = key;
          if (!fogPencilRef.current.circles.has(key)) {
            fogPencilRef.current.circles.set(key, { x, y, radius: pencilSizeRef.current });
            
            // INSTANT: Send circle reveal to server immediately
            // Use localStorage value for smoothness (number of segments)
            const segments = settings.smoothness;
            const polygon: number[][] = [];
            for (let i = 0; i < segments; i++) {
              const angle = (i / segments) * Math.PI * 2;
              polygon.push([
                x + Math.cos(angle) * pencilSizeRef.current,
                y + Math.sin(angle) * pencilSizeRef.current,
              ]);
            }
            emitFogPolygon(polygon, fogActionRef.current ?? 'reveal');
          }
        }
        return;
      }

      if (currentTool === 'fog' && fogDrawMode === 'box' && fogDragRef.current.active && fogDragRef.current.start && currentBoard) {
        const localPos = stage.toLocal(pos);
        let endX = clampToBoard(localPos.x, currentBoard.width);
        let endY = clampToBoard(localPos.y, currentBoard.height);
        // Apply grid snapping to end position if enabled
        if (fogSnapToGrid) {
          const gridSize = effectiveGridSize || 50;
          const offsetX = gridOffsetX || 0;
          const offsetY = gridOffsetY || 0;
          const snapped = snapToGridIntersection(endX, endY, gridSize, offsetX, offsetY);
          endX = snapped.x;
          endY = snapped.y;
        }
        fogDragRef.current.current = { x: endX, y: endY };

        const preview = fogDragRef.current.preview;
        if (preview) {
          const start = fogDragRef.current.start;
          const x = Math.min(start.x, endX);
          const y = Math.min(start.y, endY);
          const width = Math.abs(endX - start.x);
          const height = Math.abs(endY - start.y);
          preview.clear();
          preview.rect(x, y, width, height);
          preview.fill({ color: 0x60a5fa, alpha: 0.25 });
          preview.stroke({ width: 2, color: 0x93c5fd, alpha: 0.9 });
        }
        return;
      }
      
      if (measureStart && currentTool === 'measure') {
        // Don't clear measureStart - just redraw the line
        // Clear previous line and text (but keep measureStart)
        if (measureLine) { uiLayer.removeChild(measureLine); measureLine = null; }
        if (measureText) { uiLayer.removeChild(measureText); measureText = null; }
        
        // Get measurement shape from store
        const currentMeasurementShape = useGameStore.getState().measurementShape || 'ray';
        
        // Resolve to token centers when hovering tokens, otherwise snap to grid centers.
        const localStart = stage.toLocal(measureStart);
        const localEnd = stage.toLocal(pos);
        const startAnchor = getMeasurementAnchor(localStart.x, localStart.y);
        const endAnchor = getMeasurementAnchor(localEnd.x, localEnd.y);
        const startX = startAnchor.x;
        const startY = startAnchor.y;
        const endX = endAnchor.x;
        const endY = endAnchor.y;
        
        const start = { x: startX, y: startY };
        const end = { x: endX, y: endY };
        
        // Store measurement data for persistence
        currentMeasurementData = {
          shape: currentMeasurementShape,
          startX: startX,
          startY: startY,
          endX: endX,
          endY: endY,
          color: measureColorNumber,
        };
        
        measureLine = new PIXI.Graphics();
        
        // Draw shape based on measurementShape
        if (currentMeasurementShape === 'ray') {
          // Ray (line) - existing behavior
          measureLine.moveTo(startX, startY);
          measureLine.lineTo(endX, endY);
          measureLine.stroke({ width: 3, color: measureColorNumber });
          
          const dx = endX - startX;
          const dy = endY - startY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const squares = distance / gridSize;
          const totalValue = Math.round(squares) * squareValue;
          
          measureText = new PIXI.Text(`${totalValue} ${gridUnit}`, {
            fontFamily: 'Arial', fontSize: 16, fill: 0xffffff, fontWeight: 'bold',
          });
          const midX = (startX + endX) / 2;
          const midY = (startY + endY) / 2;
          measureText.x = midX + 5;
          measureText.y = midY + 5;
        } else if (currentMeasurementShape === 'circle') {
          // Circle - draw from start to end as radius
          const radius = calculateDistance(start, end);
          measureLine.circle(startX, startY, radius);
          measureLine.fill({ color: measureColorNumber, alpha: 0.3 });
          measureLine.stroke({ width: 3, color: measureColorNumber });
          
          const labelText = formatCircleDistance(start, end, gridSize, squareValue, gridUnit);
          measureText = new PIXI.Text(labelText, {
            fontFamily: 'Arial', fontSize: 16, fill: 0xffffff, fontWeight: 'bold',
          });
          measureText.x = startX + 5;
          measureText.y = startY + 5;
        } else if (currentMeasurementShape === 'rectangle') {
          // Rectangle - draw from start to end, snapped to grid corners
          // Snap end point to grid corner (top-left of grid cell)
          const snappedEndX = Math.floor(endX / gridSize) * gridSize;
          const snappedEndY = Math.floor(endY / gridSize) * gridSize;
          const snappedStartX = Math.floor(startX / gridSize) * gridSize;
          const snappedStartY = Math.floor(startY / gridSize) * gridSize;
          
          const rectStart = { x: snappedStartX, y: snappedStartY };
          const rectEnd = { x: snappedEndX, y: snappedEndY };
          const bounds = calculateRectangleBounds(rectStart, rectEnd);
          
          measureLine.drawRect(bounds.x, bounds.y, bounds.width, bounds.height);
          measureLine.fill({ color: measureColorNumber, alpha: 0.3 });
          measureLine.stroke({ width: 3, color: measureColorNumber });
          
          const labelText = formatRectangleDistance(rectStart, rectEnd, gridSize, squareValue, gridUnit);
          measureText = new PIXI.Text(`${labelText.width} × ${labelText.height}`, {
            fontFamily: 'Arial', fontSize: 16, fill: 0xffffff, fontWeight: 'bold',
          });
          const midX = bounds.x + bounds.width / 2;
          const midY = bounds.y + bounds.height / 2;
          measureText.x = midX + 5;
          measureText.y = midY + 5;
        } else if (currentMeasurementShape === 'cone') {
          // Cone - draw triangle from start through end (D&D style - no angle snapping)
          const dx = endX - startX;
          const dy = endY - startY;
          const angle = Math.atan2(dy, dx);
          const length = Math.sqrt(dx * dx + dy * dy);
          const coneAngle = Math.PI / 4; // 45 degrees half-angle for D&D cone
          
          const vertices = [
            { x: startX, y: startY },
            {
              x: startX + length * Math.cos(angle - coneAngle),
              y: startY + length * Math.sin(angle - coneAngle)
            },
            {
              x: startX + length * Math.cos(angle + coneAngle),
              y: startY + length * Math.sin(angle + coneAngle)
            }
          ];
          
          if (vertices.length >= 3) {
            measureLine.moveTo(vertices[0].x, vertices[0].y);
            measureLine.lineTo(vertices[1].x, vertices[1].y);
            measureLine.lineTo(vertices[2].x, vertices[2].y);
            measureLine.closePath();
            measureLine.fill({ color: measureColorNumber, alpha: 0.3 });
            measureLine.stroke({ width: 3, color: measureColorNumber });
          }
          
          const labelText = formatConeDistance(start, end, gridSize, squareValue, gridUnit);
          measureText = new PIXI.Text(labelText, {
            fontFamily: 'Arial', fontSize: 16, fill: 0xffffff, fontWeight: 'bold',
          });
          const midX = (startX + endX) / 2;
          const midY = (startY + endY) / 2;
          measureText.x = midX + 5;
          measureText.y = midY + 5;
        }
        
        uiLayer.addChild(measureLine);
        if (measureText) {
          uiLayer.addChild(measureText);
        }
      }
      
      // Handle pending light creation (when user starts dragging)
      // This handles both light creation and drag selection for lights
      if (pendingLightRef.current && pendingLightRef.current.pending) {
        const localPos = stage.toLocal(pos);
        const dx = localPos.x - pendingLightRef.current.startX;
        const dy = localPos.y - pendingLightRef.current.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Check if user is holding Ctrl/Cmd/Shift for box selection
        const nativeEvent = e.data?.originalEvent as unknown as { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean };
        const isMultiSelectModifier = nativeEvent?.ctrlKey || nativeEvent?.metaKey || nativeEvent?.shiftKey;
        
        // If holding Ctrl/Cmd/Shift and moved more than 5 pixels, start box selection
        if (isMultiSelectModifier && distance > 5) {
          // Start drag selection instead of creating a light
          isDragSelecting.current = true;
          pendingLightRef.current = null;
          // Don't return - let the drag selection logic below handle it
        } else if (distance > 10) {
          // Not holding modifier - create the light
          const snapX = pendingLightRef.current.x;
          const snapY = pendingLightRef.current.y;
          
          const newLight: Light = {
            id: `light-${Date.now()}`,
            boardId: currentBoard.id,
            name: `Light ${(lights?.length || 0) + 1}`,
            x: snapX,
            y: snapY,
            radius: 50, // Start with minimum radius
            color: LIGHT_PRESET_VALUES.candle.color,
            intensity: 1,
            alpha: 1,
            effect: 'none',
            effectSpeed: 1,
            effectIntensity: 0.5,
            effectColor: LIGHT_PRESET_VALUES.candle.effectColor,
            type: 'point',
            direction: 0,
            angle: 60,
            dimRadius: 12,
            visible: true,
            blendMode: 'add',
          };
          
          addLight(newLight);
          
          // Start dragging to set radius
          lightDragRef.current = {
            isDragging: true,
            lightId: newLight.id,
            startX: snapX,
            startY: snapY,
            isNewLight: true,
            hasDragged: true, // Mark as dragged since we exceeded threshold
          };
          
          // Send to server
          if (currentBoard) {
            socketService.createLight(currentBoard.id, newLight as unknown as Record<string, unknown>);
          }
          
          // Clear pending state
          pendingLightRef.current = null;
          return;
        }
      }

      // Handle pending audio source creation (when user starts dragging)
      if (pendingAudioSourceRef.current && pendingAudioSourceRef.current.pending) {
        const localPos = stage.toLocal(pos);
        const dx = localPos.x - pendingAudioSourceRef.current.startX;
        const dy = localPos.y - pendingAudioSourceRef.current.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Check if user is holding Ctrl/Cmd/Shift for box selection
        const nativeEvent = e.data?.originalEvent as unknown as { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean };
        const isMultiSelectModifier = nativeEvent?.ctrlKey || nativeEvent?.metaKey || nativeEvent?.shiftKey;
        
        // If holding Ctrl/Cmd/Shift and moved more than 5 pixels, start box selection
        if (isMultiSelectModifier && distance > 5) {
          // Start drag selection instead of creating an audio source
          isDragSelecting.current = true;
          pendingAudioSourceRef.current = null;
        } else if (distance > 10) {
          // Not holding modifier - create the audio source
          const snapX = pendingAudioSourceRef.current.x;
          const snapY = pendingAudioSourceRef.current.y;
          const gridSize = effectiveGridSize;
          
          // Start with minimum radius for "pull to size" functionality
          const minRadius = gridSize * 1; // Minimum 1 grid cell
          
          const newAudioSource = {
            id: `audio-${Date.now()}`,
            boardId: currentBoard.id,
            name: `Audio Source ${(audioSources?.length || 0) + 1}`,
            x: snapX,
            y: snapY,
            audioFile: '', // Will need to be set - this is a placeholder
            radius: minRadius, // Start with minimum radius for pull-to-size
            innerRadius: gridSize * 0.5, // Default inner radius: 0.5 grid cell
            baseVolume: 1,
            loop: true,
            playing: false, // Start paused until an audio file is set
          };
          
          // Add to local state first for immediate feedback
          addAudioSource(newAudioSource);
          
          // Start dragging to set radius (pull to size)
          audioDragRef.current = {
            isDragging: true,
            audioSourceId: newAudioSource.id,
            startX: pendingAudioSourceRef.current.startX,
            startY: pendingAudioSourceRef.current.startY,
            isNewAudioSource: true,
            hasDragged: true, // Mark as dragged since we exceeded threshold
          };
          
          // Send to server
          if (currentBoard) {
            socketService.createAudioSource(currentBoard.id, newAudioSource as unknown as Record<string, unknown>);
          }
          
          // Clear pending state but DON'T return - let it continue to radius update handler
          pendingAudioSourceRef.current = null;
        }
      }
      
      // Handle light dragging (radius for new lights, position for existing lights)
      if (lightDragRef.current.isDragging && lightDragRef.current.lightId) {
        const localPos = stage.toLocal(pos);
        const lightId = lightDragRef.current.lightId;
        
        if (lightDragRef.current.isNewLight) {
          // New light - update radius based on distance from click position
          const startX = lightDragRef.current.startX;
          const startY = lightDragRef.current.startY;
          const dx = localPos.x - startX;
          const dy = localPos.y - startY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const radius = Math.max(0, distance);
          
          // Track if user has dragged (moved more than threshold)
          if (distance > 10) {
            lightDragRef.current.hasDragged = true;
          }
          
          updateLight(lightId, { radius, dimRadius: radius * 0.25 });
        } else {
          // Existing light - update position
          const snapX = e.shiftKey ? localPos.x : Math.floor(localPos.x / gridSize) * gridSize + gridSize / 2;
          const snapY = e.shiftKey ? localPos.y : Math.floor(localPos.y / gridSize) * gridSize + gridSize / 2;
          
          updateLight(lightId, { x: snapX, y: snapY });
        }
      }
      
      // Handle audio source dragging (radius for new audio sources, position for existing)
      if (audioDragRef.current.isDragging && audioDragRef.current.audioSourceId) {
        const localPos = stage.toLocal(pos);
        const audioSourceId = audioDragRef.current.audioSourceId;
        
        if (audioDragRef.current.isNewAudioSource) {
          // New audio source - update radius based on distance from click position
          const startX = audioDragRef.current.startX;
          const startY = audioDragRef.current.startY;
          const dx = localPos.x - startX;
          const dy = localPos.y - startY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // Track if user has dragged (moved more than threshold)
          if (distance > 10) {
            audioDragRef.current.hasDragged = true;
          }
          
          // Use minimum radius of 1 grid cell
          const newRadius = Math.max(gridSize, distance);
          updateAudioSource(audioSourceId, { radius: newRadius });
        } else {
          // Existing audio source - update position
          const snapX = e.shiftKey ? localPos.x : Math.floor(localPos.x / gridSize) * gridSize + gridSize / 2;
          const snapY = e.shiftKey ? localPos.y : Math.floor(localPos.y / gridSize) * gridSize + gridSize / 2;
          
          updateAudioSource(audioSourceId, { x: snapX, y: snapY });
        }
      }
    };

    const onPointerUp = (_e: PIXI.FederatedPointerEvent) => {
      const currentTool = useGameStore.getState().tool;
      const currentIsGM = useGameStore.getState().isGM;
      if (currentTool === 'select') {
        pendingTokenDragRef.current = null;
      }
      
      // Handle multi-token dragging completion (both select and move tools)
      if (draggingTokenIds.length > 0 && ghostAnchors.length > 0) {
        const tokenLayer = (app as any).tokenLayer as PIXI.Container;
        
        // Move all tokens - use ghost positions directly
        for (let i = 0; i < draggingTokenIds.length; i++) {
          const tokenId = draggingTokenIds[i];
          const ghost = ghostAnchors[i];
          
          if (ghost) {
            socketService.moveToken(tokenId, ghost.x, ghost.y);
          }
        }
        
        // Clean up ghosts
        for (const ghost of ghostAnchors) {
          tokenLayer.removeChild(ghost);
          ghost.destroy();
        }
        
        // Restore original token opacity after drag
        for (const tokenId of draggingTokenIds) {
          setTokenDragGhostAlpha(tokenId, 1);
        }
        
        draggingTokenIds = [];
        ghostAnchors = [];
        originalPositions.clear();
        dragStartTokenId = null;
      }
      
      // Handle drag selection completion (only for select tool)
      if (isDragSelecting.current && dragSelectStart.current && currentTool === 'select') {
        const currentPos = dragSelectCurrent.current || dragSelectStart.current;
        const startX = dragSelectStart.current.x;
        const startY = dragSelectStart.current.y;
        const endX = currentPos.x;
        const endY = currentPos.y;
        
        // Only select if we've dragged enough (to distinguish from a click)
        const rectWidth = Math.abs(endX - startX);
        const rectHeight = Math.abs(endY - startY);
        
        if (rectWidth > 5 || rectHeight > 5) {
          // Calculate selection rectangle bounds (already in global coordinates)
          const rectMinX = Math.min(startX, endX);
          const rectMaxX = Math.max(startX, endX);
          const rectMinY = Math.min(startY, endY);
          const rectMaxY = Math.max(startY, endY);
          
          // Use toLocal to convert global coordinates to local stage coordinates
          // This is critical for correct hit testing when zoomed/panned
          const localStart = stage.toLocal({ x: rectMinX, y: rectMinY });
          const localEnd = stage.toLocal({ x: rectMaxX, y: rectMaxY });
          
          if (currentTool === 'select') {
            // Get current selectable types filter
            const currentSelectableTypes = useGameStore.getState().selectableTypes;
            
            // Select tokens if enabled in filter
            if (currentSelectableTypes.includes('token')) {
              const selectedIds: string[] = [];
              for (const [id, sprite] of tokensRef.current) {
                const visualPos = getTokenVisualPosition(id);
                if (!visualPos) continue;
                const tokenCenterX = visualPos.x + sprite.width / 2;
                const tokenCenterY = visualPos.y + sprite.height / 2;
                
                if (tokenCenterX >= localStart.x && tokenCenterX <= localEnd.x &&
                    tokenCenterY >= localStart.y && tokenCenterY <= localEnd.y) {
                  selectedIds.push(id);
                }
              }
              
              if (selectedIds.length > 0) {
                setSelectedTokenIds(selectedIds);
              }
            }
            
            // Select lights if enabled in filter or if in light tool mode
            const toolForLightCheck = useGameStore.getState().tool;
            if (currentSelectableTypes.includes('light') || toolForLightCheck === 'light') {
              const selectedLightIdsFromBox: string[] = [];
              const currentLights = useGameStore.getState().lights || [];
              for (const light of currentLights) {
                // Check if light center is within the selection rectangle
                if (light.x >= localStart.x && light.x <= localEnd.x &&
                    light.y >= localStart.y && light.y <= localEnd.y) {
                  selectedLightIdsFromBox.push(light.id);
                }
              }
              
              if (selectedLightIdsFromBox.length > 0) {
                setSelectedLightIds([...selectedLightIds, ...selectedLightIdsFromBox]);
              }
            }
            
            // Select audio sources if enabled in filter or if in audio tool mode
            const toolForAudioCheck = useGameStore.getState().tool;
            if (currentSelectableTypes.includes('audio') || toolForAudioCheck === 'audio') {
              const selectedAudioSourceIdsFromBox: string[] = [];
              const currentAudioSources = useGameStore.getState().audioSources || [];
              for (const audioSource of currentAudioSources) {
                // Check if audio source center is within the selection rectangle
                if (audioSource.x >= localStart.x && audioSource.x <= localEnd.x &&
                    audioSource.y >= localStart.y && audioSource.y <= localEnd.y) {
                  selectedAudioSourceIdsFromBox.push(audioSource.id);
                }
              }
              
              if (selectedAudioSourceIdsFromBox.length > 0) {
                setSelectedAudioSourceIds([...selectedAudioSourceIds, ...selectedAudioSourceIdsFromBox]);
              }
            }

            // Select particle emitters if enabled in filter or if in particle tool mode
            const toolForParticleCheck = useGameStore.getState().tool;
            if (currentSelectableTypes.includes('particle') || toolForParticleCheck === 'particle') {
              const selectedEmitterKeysFromBox: string[] = [];
              for (const emitter of manualEmitterRef.current) {
                if (
                  emitter.x >= localStart.x && emitter.x <= localEnd.x &&
                  emitter.y >= localStart.y && emitter.y <= localEnd.y
                ) {
                  selectedEmitterKeysFromBox.push(emitter.key);
                }
              }
              if (selectedEmitterKeysFromBox.length > 0) {
                setSelectedParticleEmitterKeys((prev) => [...new Set([...prev, ...selectedEmitterKeysFromBox])]);
              }
            }
          }
        }
        
        // Clear selection rectangle
        isDragSelecting.current = false;
        dragSelectStart.current = null;
        dragSelectCurrent.current = null;
        // Clear pending light state if we were drag selecting
        pendingLightRef.current = null;
        if (selectionRectRef.current) {
          uiLayer.removeChild(selectionRectRef.current);
          selectionRectRef.current = null;
        }
      } else if (dragSelectStart.current && (currentTool === 'select' || currentTool === 'audio' || currentTool === 'light')) {
        // User clicked without dragging enough - clear selection (deselect)
        // This handles the case where the user just clicked on empty space
        dragSelectStart.current = null;
        dragSelectCurrent.current = null;
        useGameStore.getState().setSelectedToken(null);
        useGameStore.getState().setSelectedTokenIds([]);
        setSelectedLightIds([]);
        setSelectedAudioSourceIds([]);
        setSelectedParticleEmitterKeys([]);
      }
      
      if (measureStart && currentTool === 'measure') {
        // Save measurement to store before clearing
        if (currentMeasurementData) {
          useGameStore.getState().addMeasurement({
            id: `measurement-${Date.now()}`,
            shape: currentMeasurementData.shape as 'ray' | 'cone' | 'circle' | 'rectangle',
            startX: currentMeasurementData.startX,
            startY: currentMeasurementData.startY,
            endX: currentMeasurementData.endX,
            endY: currentMeasurementData.endY,
            color: currentMeasurementData.color,
          });
        }
        clearMeasure();
      }

      if (
        currentTool === 'fog' &&
        fogDrawMode === 'box' &&
        currentIsGM &&
        currentBoard &&
        fogDragRef.current.active &&
        fogDragRef.current.start &&
        fogDragRef.current.current
      ) {
        const start = fogDragRef.current.start;
        const end = fogDragRef.current.current;
        let polygon = buildRectPolygon(start, end, currentBoard.width, currentBoard.height);

        const width = Math.abs(end.x - start.x);
        const height = Math.abs(end.y - start.y);
        if (width < 5 || height < 5) {
          const gx = Math.floor(start.x / effectiveGridSize) * effectiveGridSize;
          const gy = Math.floor(start.y / effectiveGridSize) * effectiveGridSize;
          polygon = buildRectPolygon(
            { x: gx, y: gy },
            { x: gx + effectiveGridSize, y: gy + effectiveGridSize },
            currentBoard.width,
            currentBoard.height
          );
        }

        emitFogPolygon(polygon, fogActionRef.current ?? 'reveal');
      }

      if (currentTool === 'fog' && fogDrawMode === 'free' && currentIsGM && currentBoard && fogFreeDrawRef.current.active) {
        const points = fogFreeDrawRef.current.points;
        if (points.length >= 3) {
          emitFogPolygon(points.map((p) => [p.x, p.y]), fogActionRef.current ?? 'reveal');
        } else if (points.length > 0) {
          const p = points[0];
          const gx = Math.floor(p.x / effectiveGridSize) * effectiveGridSize;
          const gy = Math.floor(p.y / effectiveGridSize) * effectiveGridSize;
          const polygon = buildRectPolygon(
            { x: gx, y: gy },
            { x: gx + effectiveGridSize, y: gy + effectiveGridSize },
            currentBoard.width,
            currentBoard.height
          );
          emitFogPolygon(polygon, fogActionRef.current ?? 'reveal');
        }
      }

      if (currentTool === 'fog' && fogDrawMode === 'grid' && currentIsGM && currentBoard && fogGridRef.current.active) {
        for (const cell of fogGridRef.current.cells.values()) {
          emitFogPolygon([
            [cell.x, cell.y],
            [cell.x + cell.w, cell.y],
            [cell.x + cell.w, cell.y + cell.h],
            [cell.x, cell.y + cell.h],
          ], fogActionRef.current ?? 'reveal');
        }
      }

      // NOTE: Pencil mode reveals are sent INSTANTLY during drag, no need for second reveal phase on pointer up

      if (fogDrawMode === 'box') {
        if (fogDragRef.current.preview) {
          fogDragRef.current.preview.clear();
        }
        fogDragRef.current.active = false;
        fogDragRef.current.start = null;
        fogDragRef.current.current = null;
      }
      fogFreeDrawRef.current.active = false;
      fogFreeDrawRef.current.points = [];
      clearFogGrid();
      // DEBUG: Clear pencil ref
      fogPencilRef.current.active = false;
      fogPencilRef.current.circles.clear();
      fogPencilRef.current.lastCircleKey = null;
      fogActionRef.current = null;
      
      // Clear right-click fog drawing state
      if (fogRightClickRef.current.preview) {
        fogRightClickRef.current.preview.clear();
        uiLayer.removeChild(fogRightClickRef.current.preview);
        fogRightClickRef.current.preview = null;
      }
      fogRightClickRef.current.active = false;
      fogRightClickRef.current.isDrawing = false;
      fogRightClickRef.current.circles.clear();
      fogRightClickRef.current.lastCircleKey = null;
      
      // Handle light drag completion - sync with server
      if (lightDragRef.current.isDragging && lightDragRef.current.lightId) {
        const lightId = lightDragRef.current.lightId;
        const light = lights?.find(l => l.id === lightId);
        if (light && currentBoard) {
          socketService.updateLight(lightId, light as unknown as Record<string, unknown>);
        }
        
        // If new light wasn't dragged (just a click), set default radius
        // Otherwise keep the dragged radius (minimum 50 or whatever user set)
        if (lightDragRef.current.isNewLight && light && !lightDragRef.current.hasDragged) {
          updateLight(lightId, { radius: 200, dimRadius: 50 });
          socketService.updateLight(lightId, { ...light, radius: 200, dimRadius: 50 } as unknown as Record<string, unknown>);
        }
        
        lightDragRef.current = { isDragging: false, lightId: null, startX: 0, startY: 0, isNewLight: false, hasDragged: false };
      }
      
      // Handle audio source drag completion - sync with server
      if (audioDragRef.current.isDragging && audioDragRef.current.audioSourceId) {
        const audioSourceId = audioDragRef.current.audioSourceId;
        const audioSource = audioSources?.find(a => a.id === audioSourceId);
        
        // If new audio source wasn't dragged (just a click), set default radius
        // Otherwise keep the dragged radius
        if (audioDragRef.current.isNewAudioSource && audioSource && !audioDragRef.current.hasDragged) {
          const defaultRadius = gridSize * 6; // Default 6 grid cells
          updateAudioSource(audioSourceId, { radius: defaultRadius });
          socketService.updateAudioSource(audioSourceId, { radius: defaultRadius });
        } else if (audioSource && currentBoard) {
          // Sync final position/radius to server
          socketService.updateAudioSource(audioSourceId, { 
            x: audioSource.x, 
            y: audioSource.y, 
            radius: audioSource.radius 
          });
        }
        
        audioDragRef.current = { isDragging: false, audioSourceId: null, startX: 0, startY: 0, isNewAudioSource: false, hasDragged: false };
      }
      
      // Clear pending light if user clicked but didn't drag (light was never created)
      if (pendingLightRef.current && pendingLightRef.current.pending) {
        pendingLightRef.current = null;
      }
      
      // Clear pending audio source if user clicked but didn't drag (audio source was never created)
      if (pendingAudioSourceRef.current && pendingAudioSourceRef.current.pending) {
        pendingAudioSourceRef.current = null;
      }
    };

    console.log('[DEBUG] Registering move tool handlers for tool:', tool);
    stage.on('pointerdown', onPointerDown);
    stage.on('pointermove', onPointerMove);
    stage.on('pointerup', onPointerUp);

    return () => {
      stage.off('pointerdown', onPointerDown);
      stage.off('pointermove', onPointerMove);
      stage.off('pointerup', onPointerUp);
      if (fogDragRef.current.preview) {
        uiLayer.removeChild(fogDragRef.current.preview);
        fogDragRef.current.preview.destroy();
        fogDragRef.current.preview = null;
      }
      if (fogPolygonRef.current.preview) {
        uiLayer.removeChild(fogPolygonRef.current.preview);
        fogPolygonRef.current.preview.destroy();
        fogPolygonRef.current.preview = null;
      }
      fogDragRef.current.active = false;
      fogDragRef.current.start = null;
      fogDragRef.current.current = null;
      fogPolygonRef.current.active = false;
      fogPolygonRef.current.points = [];
      fogPolygonRef.current.cursor = null;
      fogFreeDrawRef.current.active = false;
      fogFreeDrawRef.current.points = [];
      fogGridRef.current.active = false;
      fogGridRef.current.cells.clear();
      fogGridRef.current.lastCellKey = null;
    };
  }, [currentBoard, tool, isGM, squareValue, gridUnit, measureColorNumber, players, lights, effectiveGridSize, gridOffsetX, gridOffsetY, buildRectPolygon, clampToBoard, fogDrawMode, fogSnapToGrid, getMeasurementAnchor, particlePreset, particleEmitterSize]);


  const tools: { id: 'select' | 'measure' | 'light' | 'audio' | 'fog' | 'particle'; icon: string; label: string }[] = [
    { id: 'select', icon: 'hand-pointer', label: 'Select' },
    { id: 'measure', icon: 'ruler', label: 'Measure' },
    { id: 'light', icon: 'lightbulb', label: 'Light' },
    { id: 'audio', icon: 'volume-up', label: 'Audio' },
    { id: 'fog', icon: 'cloud', label: 'Fog Reveal' },
    { id: 'particle', icon: 'wand-magic-sparkles', label: 'Particle Emitter' },
  ];

  return (
    <>
      {/* Weather Effects - Render particles */}
      {appReady && appRef.current && (
        <>
          <MultiWeatherEffectRenderer
            app={appRef.current}
            effects={activeWeatherEffects}
            boardWidth={currentBoard?.width || 1000}
            boardHeight={currentBoard?.height || 800}
          />
          <ParticleAuraRenderer
            app={appRef.current}
            tokens={tokens}
            gridSize={effectiveGridSize || 50}
          />
        </>
      )}
      
      {/* Weather Control Panel - removed, now in Toolbar */}
      
      <div 
      className="game-board-container" 
      ref={containerRef}
      onClick={(e) => {
        // Don't close panels if we're in light tool mode and interacting with lights
        if (lightEditorState) {
          // Check if click is inside the light editor panel
          const panel = document.querySelector('.light-editor-panel') as HTMLElement | null;
          if (panel) {
            const rect = panel.getBoundingClientRect();
            // Use a more lenient check - also check if event target is inside the panel
            const target = e.target as HTMLElement;
            if (target.closest('.light-editor-panel')) {
              return; // Click inside panel - don't close
            }
          }
          // Only close if NOT in light tool mode (user is done editing)
          const currentTool = useGameStore.getState().tool;
          if (currentTool === 'light') {
            return; // Don't close panel while in light tool mode
          }
        }
        
        if (barEditorRef.current) {
          barEditorRef.current = false;
          return;
        }
        // Don't close panels if we're in light tool mode
        if (lightEditorState) {
          const currentTool = useGameStore.getState().tool;
          if (currentTool === 'light') {
            return; // Don't close panel while in light tool mode
          }
        }
        // Don't close panels if we're in audio tool mode
        if (audioSourceEditorState) {
          const currentTool = useGameStore.getState().tool;
          if (currentTool === 'audio') {
            return; // Don't close panel while in audio tool mode
          }
        }
        if (tokenContextMenu) setTokenContextMenu(null);
        if (barEditorState) setBarEditorState(null);
        if (statusEditorState) setStatusEditorState(null);
        if (displayEditorState) setDisplayEditorState(null);
        if (ownershipEditorState) setOwnershipEditorState(null);
        if (layerEditorState) setLayerEditorState(null);
        if (deleteEditorState) setDeleteEditorState(null);
        if (auraEditorState) setAuraEditorState(null);
        if (combatEditorState) setCombatEditorState(null);
        if (lightEditorState) setLightEditorState(null);
        if (audioSourceEditorState) setAudioSourceEditorState(null);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        // Only close the menu - don't toggle it
        // Opening happens via sprite right-click
        // Don't close panels if we're in light tool mode
        if (lightEditorState) {
          const currentTool = useGameStore.getState().tool;
          if (currentTool === 'light') {
            return; // Don't close panel while in light tool mode
          }
        }
        // Don't close panels if we're in audio tool mode
        if (audioSourceEditorState) {
          const currentTool = useGameStore.getState().tool;
          if (currentTool === 'audio') {
            return; // Don't close panel while in audio tool mode
          }
        }
        if (tokenContextMenu) setTokenContextMenu(null);
        if (barEditorState) setBarEditorState(null);
        if (statusEditorState) setStatusEditorState(null);
        if (displayEditorState) setDisplayEditorState(null);
        if (ownershipEditorState) setOwnershipEditorState(null);
        if (layerEditorState) setLayerEditorState(null);
        if (deleteEditorState) setDeleteEditorState(null);
        if (auraEditorState) setAuraEditorState(null);
        if (combatEditorState) setCombatEditorState(null);
        if (lightEditorState) setLightEditorState(null);
        if (audioSourceEditorState) setAudioSourceEditorState(null);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={async (e) => {
        e.preventDefault();
        console.log('=== CANVAS DROP ===');
        console.log('isGM:', isGM, 'currentBoard:', !!currentBoard);
        if (!currentBoard || !isGM) return;

        // Calculate drop position relative to canvas
        // Account for pan/zoom by converting to stage local coordinates
        const app = appRef.current;
        const stage = app?.stage;
        const canvas = app?.canvas as HTMLCanvasElement;
        if (!stage || !canvas) return;
        
        // Get canvas bounding rect to convert viewport coords to canvas-relative coords
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        
        // Convert canvas-relative coordinates to stage local coordinates (accounts for pan/zoom)
        const globalPos = { x: canvasX, y: canvasY };
        const localPos = stage.toLocal(globalPos);
        const x = localPos.x;
        const y = localPos.y;
        const gridSize = effectiveGridSize;
        // Account for grid offset when snapping to grid
        const offsetX = gridOffsetX || 0;
        const offsetY = gridOffsetY || 0;

        // Handle drag-drop from DataManager item cards (JSON payload) or Asset Browser
        const jsonPayload = e.dataTransfer.getData('application/json');
        let dropTokenSize = 1;
        
        // Try to determine token size from dropped item early
        if (jsonPayload) {
          try {
            const droppedItem = JSON.parse(jsonPayload);
            
            // Get token size if available
            if (droppedItem.gridUnits?.w) {
              dropTokenSize = droppedItem.gridUnits.w;
            } else if (droppedItem.type === 'monster' || droppedItem.type === 'npc' || droppedItem.type === 'character') {
              const sizeMap: Record<string, number> = {
                't': 0.5, 'tiny': 0.5,
                's': 1, 'small': 1,
                'm': 1, 'medium': 1,
                'l': 2, 'large': 2,
                'h': 3, 'huge': 3,
                'g': 4, 'gargantuan': 4,
              };
              let monsterSizeRaw = droppedItem.system?.size;
              let monsterSize = 'm';
              if (monsterSizeRaw) {
                if (Array.isArray(monsterSizeRaw)) {
                  monsterSize = monsterSizeRaw[0]?.toString().toLowerCase() || 'm';
                } else {
                  monsterSize = monsterSizeRaw.toString().toLowerCase();
                }
              }
              dropTokenSize = sizeMap[monsterSize] || 1;
            }
          } catch (err) {
            // Ignore parse errors, use default size
          }
        }
        
        // Use unified utility that considers token footprint for proper snapping
        // Odd-sized tokens (1x1): center to cell center
        // Even-sized tokens (2x2): center to grid intersection
        const snapped = snapTokenToGrid(x, y, dropTokenSize, gridSize, offsetX, offsetY);
        const snapX = snapped.x;
        const snapY = snapped.y;

        if (jsonPayload) {
          try {
            const droppedItem = JSON.parse(jsonPayload);

              // TOKEN DROP
              if (droppedItem.sourceFolder === 'tokens') {

                const tokenSize = droppedItem.gridUnits?.w ?? 1;

                // Convert from center position (snapTokenToGrid returns center) to top-left position
                // Tokens are rendered with anchor at (0,0) - top-left corner
                const tokenTopLeft = getTokenTopLeftFromCenter(snapX, snapY, tokenSize, gridSize);

                const tokenData: Record<string, unknown> = {
                  name: droppedItem.name || 'Token',
                  imageUrl: droppedItem.url,
                  x: tokenTopLeft.x,
                  y: tokenTopLeft.y,
                  size: tokenSize,
                  layer: 'tokens',
                };

                if (defaultShowTokenName) {
                  tokenData.showLabel = true;
                }

                // Apply default token disposition if set
                if (defaultTokenDisposition) {
                  tokenData.properties = { ...(tokenData.properties as object || {}), disposition: defaultTokenDisposition };
                }

                socketService.createToken(currentBoard.id, tokenData as any);
                return;
              }

              // MAP DROP - directly set as background (skip modal for Asset Browser)
              if (droppedItem.sourceFolder === 'maps') {

                if (currentBoard) {
                  socketService.setBackground(currentBoard.id, droppedItem.url);
                }

                return;
              }

              // AUDIO DROP - Create spatial audio source
              if (droppedItem.sourceFolder === 'audio') {
                const gridSize = effectiveGridSize;
                
                // Create audio source at drop position
                const audioSourceData = {
                  name: droppedItem.name || 'Audio Source',
                  x: snapX,
                  y: snapY,
                  audioFile: droppedItem.url,
                  radius: gridSize * 6, // Default radius: 6 grid cells
                  innerRadius: gridSize * 1, // Default inner radius: 1 grid cell
                  baseVolume: 1,
                  loop: true,
                  playing: false, // Start paused - user can click play when ready
                };
                
                socketService.createAudioSource(currentBoard.id, audioSourceData);
                return;
              }

              // Handle monster/npc drops from DataManager
              if (droppedItem.type === 'monster' || droppedItem.type === 'npc' || droppedItem.type === 'character') {
                // Use token image if available, otherwise use a default placeholder
                const imageUrl = toBoardSafeImageUrl(droppedItem.imgToken || droppedItem.tokenUrl || droppedItem.img || '/icons/monster.svg');

                // Calculate token size based on monster size category from system data
                // Size can be like 'H' (Huge), 'L' (Large), 'M' (Medium), 'T' (Tiny), 'G' (Gargantuan), 'S' (Small)
                // or full words like 'huge', 'large', etc. It might also be an array like ['H']
                const sizeMap: Record<string, number> = {
                  't': 0.5, 'tiny': 0.5,
                  's': 1, 'small': 1,
                  'm': 1, 'medium': 1,
                  'l': 2, 'large': 2,
                  'h': 3, 'huge': 3,
                  'g': 4, 'gargantuan': 4,
                };
                // Get size from system - can be string or array like ['H']
                let monsterSizeRaw = droppedItem.system?.size;
                let monsterSize = 'medium';
                if (monsterSizeRaw) {
                  if (Array.isArray(monsterSizeRaw)) {
                    monsterSize = monsterSizeRaw[0]?.toString().toLowerCase() || 'm';
                  } else {
                    monsterSize = monsterSizeRaw.toString().toLowerCase();
                  }
                }
                const tokenSize = sizeMap[monsterSize] || 1;

                // Convert from center position (snapTokenToGrid returns center) to top-left position
                // Tokens are rendered with anchor at (0,0) - top-left corner
                const tokenTopLeft = getTokenTopLeftFromCenter(snapX, snapY, tokenSize, gridSize);

                const tokenData: Record<string, unknown> = {
                  name: droppedItem.name || 'Creature',
                  imageUrl: imageUrl,
                  x: tokenTopLeft.x,
                  y: tokenTopLeft.y,
                  size: tokenSize,
                  layer: 'tokens',
                  creatureId: droppedItem.id,
                  properties: {
                    type: droppedItem.type,
                    cr: droppedItem.cr,
                    hp: droppedItem.system?.hp,
                    ac: droppedItem.system?.ac,
                    size: monsterSize,
                    ...(defaultTokenDisposition ? { disposition: defaultTokenDisposition } : {}),
                  },
                };

                // Handle HP from system data - only if defaultShowOtherHp is enabled
                if (defaultShowOtherHp) {
                  const hpData = droppedItem.system?.hp;
                  if (hpData) {
                    let hpValue: number | null = null;
                    let hpMax: number | null = null;

                    // Parse HP data - can be object {average, formula} or number
                    if (typeof hpData === 'object') {
                      // Object format: { average: 10, formula: "1d10+3" }
                      if (tokenHpSource === 'average' && hpData.average !== undefined) {
                        hpMax = hpData.average;
                        hpValue = hpData.average;
                      } else if (tokenHpSource === 'rolled' && hpData.formula) {
                        // Parse and roll the formula
                        try {
                          // Simple formula parser for dice notation like "1d10+3"
                          const formula = hpData.formula;
                          const diceMatch = formula.match(/(\d+)d(\d+)/i);
                          const bonusMatch = formula.match(/([+-]?\s*\d+)(?!d)/g);
                          
                          let total = 0;
                          if (diceMatch) {
                            const numDice = parseInt(diceMatch[1]);
                            const dieSize = parseInt(diceMatch[2]);
                            for (let i = 0; i < numDice; i++) {
                              total += Math.floor(Math.random() * dieSize) + 1;
                            }
                          }
                          if (bonusMatch) {
                            for (const bonus of bonusMatch) {
                              const num = parseInt(bonus.replace(/\s/g, ''));
                              if (!isNaN(num)) total += num;
                            }
                          }
                          hpValue = total;
                          hpMax = total;
                        } catch (e) {
                          console.warn('[DEBUG TokenDrop] Failed to parse HP formula:', hpData.formula);
                          hpValue = hpData.average || null;
                          hpMax = hpData.average || null;
                        }
                      }
                    } else if (typeof hpData === 'number') {
                      // Plain number format
                      hpValue = hpData;
                      hpMax = hpData;
                    }

                    // Add HP bars if we have valid HP values
                    if (hpValue !== null && hpMax !== null && hpValue > 0) {
                      tokenData.bars = JSON.stringify([
                        { name: 'HP', current: hpValue, max: hpMax, color: DEFAULT_HP_BAR_COLOR }
                      ]);
                    }
                  }
                }

                if (defaultShowTokenName) {
                  tokenData.showLabel = true;
                }

                socketService.createToken(currentBoard.id, tokenData as any);
                return;
              }
            } catch (err) {
              console.warn('Dropped payload invalid:', err);
            }
          }

        const files = Array.from(e.dataTransfer.files);
        console.log('Dropped files:', files.map(f => ({ name: f.name, type: f.type })));
        
        // Check for audio files first - handle them separately
        const audioFile = files.find(f => f.type.startsWith('audio/'));
        if (audioFile) {
          const uploadPath = '/audio';
          console.log('Audio file detected, uploading to:', uploadPath);
          try {
            const formData = new FormData();
            formData.append('file', audioFile);
            formData.append('path', uploadPath);
            
            const res = await fetch('/api/assets/upload', {
              method: 'POST',
              body: formData,
            });
            
            const data = await res.json();
            if (data.url) {
              // Add to audio track
              window.dispatchEvent(
                new CustomEvent('vtt:add-audio-track', {
                  detail: { url: data.url }
                })
              );
            }
          } catch (error) {
            console.error('Audio drop upload failed:', error);
          }
          return;
        }
        
        // Handle image/video files for canvas
        const imageFile = files.find(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
        if (!imageFile) return;

        // Determine the appropriate upload path based on file type and filename
        const uploadPath = getUploadPathForCanvasDrop(imageFile);
        console.log('Image/Video file detected, uploading to:', uploadPath);

        // Upload the file first
        try {
          const formData = new FormData();
          formData.append('file', imageFile);
          
          // Use query param as backup since formData path might not work
          const res = await fetch(`/api/assets/upload?path=${encodeURIComponent(uploadPath)}`, {
            method: 'POST',
            body: formData,
          });
          
          const data = await res.json();
          console.log('Canvas upload response:', data);
          // Check both data.url and data.file.url
          const imageUrl = data.url || (data.file && data.file.url);
          console.log('imageUrl:', imageUrl);
          if (imageUrl) {
            console.log('Setting pending drop type for:', imageUrl);
            // Convert from center position (snapTokenToGrid returns center) to top-left position
            // Tokens are rendered with anchor at (0,0) - top-left corner
            const tokenTopLeft = getTokenTopLeftFromCenter(snapX, snapY, dropTokenSize, gridSize);
            // Store pending drop info for type selection
            setPendingDropType({
              x: tokenTopLeft.x,
              y: tokenTopLeft.y,
              imageUrl: imageUrl,
            });
          } else {
            console.log('No image URL in response');
          }
        } catch (error) {
          console.error('Drop upload failed:', error);
        }
      }}
    >
      <canvas
        ref={fogCanvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 5,
        }}
      />
      
      {/* Light icons overlay - PIXI based rendering */}
      <LightIconsOverlay
        lights={lights}
        selectedLightIds={selectedLightIds}
        isGM={isGM}
        tool={tool}
        isVisible={tool === 'light' || (tool !== 'audio' && selectableTypes.includes('light'))}
        gridCellPx={gridSize}
        stagePosition={{ x: stageTransform.x, y: stageTransform.y }}
        stageScale={stageTransform.scale}
        pixiApp={appRef.current ?? undefined}
        onLightClick={(light, screenPos) => {
          // Allow selection when in light tool mode, or when lights are enabled in selectableTypes filter
          const currentSelectableTypes = useGameStore.getState().selectableTypes;
          const currentTool = useGameStore.getState().tool;
          if (currentTool === 'light' || currentSelectableTypes.includes('light')) {
            setSelectedLightIds([light.id]);
          }
        }}
        onLightDoubleClick={(light, screenPos) => {
          setLightEditorState({
            lightId: light.id,
            position: { x: screenPos.x, y: screenPos.y },
          });
        }}
        onLightDrag={(light, screenPos) => {
          // Convert screen position to world coordinates
          const worldX = (screenPos.x - stageTransform.x) / stageTransform.scale;
          const worldY = (screenPos.y - stageTransform.y) / stageTransform.scale;
          
          // Apply grid snapping (unless shift is held for free placement)
          // Use ctrl key for cell center snapping (default is grid intersection)
          const offsetX = gridOffsetX || 0;
          const offsetY = gridOffsetY || 0;
          let snapX: number;
          let snapY: number;
          
          if (shiftKeyRef.current) {
            // Free placement
            snapX = worldX;
            snapY = worldY;
          } else if (ctrlKeyRef.current) {
            // Cell center snapping - use unified utility
            const cellCenter = snapToGridCellCenter(worldX, worldY, gridSize, offsetX, offsetY);
            snapX = cellCenter.x;
            snapY = cellCenter.y;
          } else {
            // Grid intersection snapping (default) - use unified utility
            const intersection = snapToGridIntersection(worldX, worldY, gridSize, offsetX, offsetY);
            snapX = intersection.x;
            snapY = intersection.y;
          }
          
          // Update light position
          updateLight(light.id, { x: snapX, y: snapY });
        }}
        onLightDragEnd={(light) => {
          // Sync the final position to server when drag ends
          if (currentBoard) {
            const currentLight = lights.find(l => l.id === light.id);
            if (currentLight) {
              socketService.updateLight(light.id, { x: currentLight.x, y: currentLight.y });
            }
          }
        }}
        onLightRadiusDrag={(light, newRadius) => {
          // Update light radius in real-time while dragging
          updateLight(light.id, { radius: newRadius, dimRadius: newRadius * 0.25 });
        }}
        onLightRadiusDragEnd={(light, newRadius) => {
          // Sync the final radius to server when drag ends
          socketService.updateLight(light.id, { radius: newRadius, dimRadius: newRadius * 0.25 });
        }}
        onLightInnerRadiusDrag={(light, newDimRadius) => {
          // Update light dimRadius in real-time while dragging
          updateLight(light.id, { dimRadius: newDimRadius });
        }}
        onLightInnerRadiusDragEnd={(light, newDimRadius) => {
          // Sync the final dimRadius to server when drag ends
          socketService.updateLight(light.id, { dimRadius: newDimRadius });
        }}
      />

      <ParticleEmitterIconsOverlay
        emitters={manualEmitters}
        presets={getParticlePresets()}
        selectedEmitterKeys={selectedParticleEmitterKeys}
        isVisible={tool !== 'select' ? true : selectableTypes.includes('particle')}
        gridCellPx={gridSize}
        stagePosition={{ x: stageTransform.x, y: stageTransform.y }}
        stageScale={stageTransform.scale}
        pixiApp={appRef.current ?? undefined}
        onEmitterClick={(emitter) => {
          const currentSelectableTypes = useGameStore.getState().selectableTypes;
          const currentTool = useGameStore.getState().tool;
          if (currentTool === 'particle' || currentSelectableTypes.includes('particle')) {
            setSelectedParticleEmitterKeys([emitter.key]);
          }
        }}
        onEmitterDoubleClick={(emitter) => {
          setParticlePreset(emitter.presetId);
          setActiveEmitterEditKey(emitter.key);
          setSelectedParticleEmitterKeys([emitter.key]);
        }}
        onEmitterDrag={(emitter, screenPos) => {
          const worldX = (screenPos.x - stageTransform.x) / stageTransform.scale;
          const worldY = (screenPos.y - stageTransform.y) / stageTransform.scale;
          const offsetX = gridOffsetX || 0;
          const offsetY = gridOffsetY || 0;
          let snapX: number;
          let snapY: number;

          if (shiftKeyRef.current) {
            snapX = worldX;
            snapY = worldY;
          } else if (ctrlKeyRef.current) {
            const cellCenter = snapToGridCellCenter(worldX, worldY, gridSize, offsetX, offsetY);
            snapX = cellCenter.x;
            snapY = cellCenter.y;
          } else {
            const intersection = snapToGridIntersection(worldX, worldY, gridSize, offsetX, offsetY);
            snapX = intersection.x;
            snapY = intersection.y;
          }

          for (let i = 0; i < manualEmitterRef.current.length; i++) {
            if (manualEmitterRef.current[i].key === emitter.key) {
              manualEmitterRef.current[i] = { ...manualEmitterRef.current[i], x: snapX, y: snapY };
              break;
            }
          }
          particleSystemRef.current?.moveByToken(emitter.key, snapX, snapY);
          const nextEmitters = [...manualEmitterRef.current];
          setManualEmitters(nextEmitters);
          setSceneParticleEmitters(serializeManualEmitters(nextEmitters));
        }}
        onEmitterDragEnd={(emitter) => {
          const moved = manualEmitterRef.current.find((entry) => entry.key === emitter.key);
          if (!moved) return;
          particleSystemRef.current?.moveByToken(emitter.key, moved.x, moved.y);
        }}
      />
      
      {/* Audio source icons overlay */}
      <AudioSourceIconsOverlay
        audioSources={audioSources}
        selectedAudioSourceIds={selectedAudioSourceIds}
        isGM={isGM}
        tool={tool}
        isVisible={tool === 'audio' || (tool !== 'light' && selectableTypes.includes('audio'))}
        gridCellPx={gridSize}
        stagePosition={{ x: stageTransform.x, y: stageTransform.y }}
        stageScale={stageTransform.scale}
        pixiApp={appRef.current ?? undefined}
        draggingAudioSourceId={audioDragRef.current.isDragging ? audioDragRef.current.audioSourceId ?? undefined : undefined}
        onAudioSourceClick={(audioSource, screenPos) => {
          // Allow selection when in audio tool mode, or when audio sources are enabled in selectableTypes filter
          const currentSelectableTypes = useGameStore.getState().selectableTypes;
          const currentTool = useGameStore.getState().tool;
          if (currentTool === 'audio' || currentSelectableTypes.includes('audio')) {
            setSelectedAudioSourceIds([audioSource.id]);
          }
        }}
        onAudioSourceDoubleClick={(audioSource, screenPos) => {
          // Open audio editor on double-click
          setAudioSourceEditorState({
            audioSourceId: audioSource.id,
            position: { x: screenPos.x, y: screenPos.y },
          });
        }}
        onAudioSourceDrag={(audioSource, screenPos) => {
          const worldX = (screenPos.x - stageTransform.x) / stageTransform.scale;
          const worldY = (screenPos.y - stageTransform.y) / stageTransform.scale;
          
          // Apply grid snapping (unless shift is held for free placement)
          // Use ctrl key for cell center snapping (default is grid intersection)
          const offsetX = gridOffsetX || 0;
          const offsetY = gridOffsetY || 0;
          let snapX: number;
          let snapY: number;
          
          if (shiftKeyRef.current) {
            // Free placement
            snapX = worldX;
            snapY = worldY;
          } else if (ctrlKeyRef.current) {
            // Cell center snapping - use unified utility
            const cellCenter = snapToGridCellCenter(worldX, worldY, gridSize, offsetX, offsetY);
            snapX = cellCenter.x;
            snapY = cellCenter.y;
          } else {
            // Grid intersection snapping (default) - use unified utility
            const intersection = snapToGridIntersection(worldX, worldY, gridSize, offsetX, offsetY);
            snapX = intersection.x;
            snapY = intersection.y;
          }
          
          updateAudioSource(audioSource.id, { x: snapX, y: snapY });
        }}
        onAudioSourceDragEnd={(audioSource) => {
          socketService.updateAudioSource(audioSource.id, { x: audioSource.x, y: audioSource.y });
        }}
        onAudioSourceRadiusDrag={(audioSource, newRadius) => {
          updateAudioSource(audioSource.id, { radius: newRadius });
        }}
        onAudioSourceRadiusDragEnd={(audioSource, newRadius) => {
          socketService.updateAudioSource(audioSource.id, { radius: newRadius });
        }}
        onAudioSourceInnerRadiusDrag={(audioSource, newInnerRadius) => {
          updateAudioSource(audioSource.id, { innerRadius: newInnerRadius });
        }}
        onAudioSourceInnerRadiusDragEnd={(audioSource, newInnerRadius) => {
          socketService.updateAudioSource(audioSource.id, { innerRadius: newInnerRadius });
        }}
      />
      
      <div 
      ref={toolbarRef}
      className={`game-toolbar ${toolbarIsResizing ? 'resizing' : ''}`}
      style={{
        position: 'absolute',
        top: `${toolbarPosition.y}px`,
        left: `${toolbarPosition.x}px`,
        width: toolbarWidth,
        minHeight: toolbarHeight,
      }}
      onMouseDown={(e) => {
        // Don't start dragging if clicking on buttons or interactive elements
        const target = e.target as HTMLElement;
        if (target.tagName === 'BUTTON' || target.closest('button')) return;
        if (target.classList.contains('game-toolbar-resize')) return;
        
        if (isGM) {
          e.preventDefault();
          setToolbarIsDragging(true);
          setToolbarDragOffset({ x: e.clientX - toolbarPosition.x, y: e.clientY - toolbarPosition.y });
        }
      }}
      >
        {/* Selection filter buttons are now in a separate panel */}
        <div className="game-toolbar-buttons">
          {tools.map((t) => (
            <button
              key={t.id}
              ref={
                t.id === 'measure' ? measureBtnRef :
                t.id === 'fog' ? fogBtnRef :
                t.id === 'particle' ? particleBtnRef :
                t.id === 'light' ? lightBtnRef :
                t.id === 'select' ? selectBtnRef :
                null
              }
              onClick={() => setTool(t.id)}
              title={t.label}
              className={`tool-btn ${tool === t.id ? 'active' : ''}`}
              style={tool === t.id ? activatedToolBtnStyle : undefined}
            >
              <Icon name={t.icon} />
            </button>
          ))}
        </div>
        {/* Resize handle */}
        <div
          className="game-toolbar-resize"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setToolbarIsResizing(true);
          }}
        >
        </div>
      </div>

      {/* Filter panel - shown when select tool is active */}
      {tool === 'select' && (
        <div
          ref={filterPanelRef}
          className="settings-panel filter-panel"
          style={{
            position: 'absolute',
            top: `${filterPanelPos.top}px`,
            left: `${filterPanelPos.left + 65}px`,
            zIndex: 110,
          }}
        >
          <div className="game-toolbar-filters">
            <button
              onClick={() => toggleSelectableType('token')}
              title="Select Tokens"
              className={`filter-btn ${selectableTypes.includes('token') ? 'active' : ''}`}
            >
              <Icon name="theater-masks" />
            </button>
            <button
              onClick={() => toggleSelectableType('light')}
              title="Select Lights"
              className={`filter-btn ${selectableTypes.includes('light') ? 'active' : ''}`}
            >
              <Icon name="lightbulb" />
            </button>
            <button
              onClick={() => toggleSelectableType('audio')}
              title="Select Audio Sources"
              className={`filter-btn ${selectableTypes.includes('audio') ? 'active' : ''}`}
            >
              <Icon name="volume-up" />
            </button>
            <button
              onClick={() => toggleSelectableType('particle')}
              title="Select Particle Emitters"
              className={`filter-btn ${selectableTypes.includes('particle') ? 'active' : ''}`}
            >
              <Icon name="wand-magic-sparkles" />
            </button>
          </div>
        </div>
      )}

      {isCurrentUserGM && tool === 'fog' && currentBoard && (
        <div
          ref={fogPanelRef}
          className="settings-panel"
          style={{
            position: 'absolute',
            top: `${fogPanelPos.top}px`,
            left: `${fogPanelPos.left + 135}px`,
            zIndex: 110,
            minWidth: '220px',
          }}
        >
          <div className="game-toolbar-buttons">
            <button
              onClick={() => setFogDrawMode('box')}
              title="Box reveal mode"
              className={`tool-btn ${fogDrawMode === 'box' ? 'active' : ''}`}
              style={fogDrawMode === 'box' ? activatedToolBtnStyle : undefined}
            >
              <Icon name="border-all" />
            </button>
            <button
              onClick={() => setFogDrawMode('polygon')}
              title="Polygon reveal mode"
              className={`tool-btn ${fogDrawMode === 'polygon' ? 'active' : ''}`}
              style={fogDrawMode === 'polygon' ? activatedToolBtnStyle : undefined}
            >
              <Icon name="draw-polygon" />
            </button>
            <button
              onClick={() => setFogDrawMode('free')}
              title="Free draw reveal mode"
              className={`tool-btn ${fogDrawMode === 'free' ? 'active' : ''}`}
              style={fogDrawMode === 'free' ? activatedToolBtnStyle : undefined}
            >
              <Icon name="edit" />
            </button>
            <button
              onClick={() => setFogDrawMode('grid')}
              title="Grid reveal mode"
              className={`tool-btn ${fogDrawMode === 'grid' ? 'active' : ''}`}
              style={fogDrawMode === 'grid' ? activatedToolBtnStyle : undefined}
            >
              <Icon name="layer-group" />
            </button>
            {/* DEBUG: Pencil mode button */}
            <button
              onClick={() => setFogDrawMode('pencil')}
              title="Pencil circle reveal mode"
              className={`tool-btn ${fogDrawMode === 'pencil' ? 'active' : ''}`}
              style={fogDrawMode === 'pencil' ? activatedToolBtnStyle : undefined}
            >
              <Icon name="pen" />
            </button>
            <button
              onClick={() => socketService.clearFog(currentBoard.id)}
              title="Clear all fog reveals"
              className="tool-btn gameboard-danger-tool-btn"
            >
              <Icon name="times-circle" />
            </button>
          </div>
          <div
            className="gameboard-inline-control-row"
            title="GM local fog opacity (players are unaffected)"
          >
            <span className="gameboard-inline-control-label gameboard-inline-control-label-sm">Fog</span>
            <input
              type="range"
              min="5"
              max="100"
              step="1"
              value={Math.round(gmFogOpacity * 100)}
              onChange={(e) => setGmFogOpacity(parseInt(e.target.value, 10) / 100)}
              className="gameboard-inline-slider"
            />
            <span className="gameboard-inline-control-value">
              {Math.round(gmFogOpacity * 100)}%
            </span>
          </div>
          {/* DEBUG: Pencil size slider */}
          {fogDrawMode === 'pencil' && (
            <div
              className="gameboard-inline-control-row gameboard-inline-control-row-spaced"
              title="Pencil brush size"
            >
              <span className="gameboard-inline-control-label">Size</span>
              <input
                type="range"
                min="5"
                max="100"
                step="1"
                value={pencilSize}
                onChange={(e) => {
                  const newSize = parseInt(e.target.value, 10);
                  setPencilSize(newSize);
                }}
                className="gameboard-inline-slider"
              />
              <span className="gameboard-inline-control-value">
                {pencilSize}px
              </span>
            </div>
          )}
        </div>
      )}

      {/* Grid Unit Panel - Shows when measure tool is active */}
      {isCurrentUserGM && tool === 'measure' && currentBoard && (
        <div
          ref={gridUnitPanelRef}
          className="settings-panel fog-tools-panel gameboard-grid-unit-panel"
          style={{
            position: 'absolute',
            top: `${gridUnitPanelPos.top}px`,
            left: `${gridUnitPanelPos.left + 73}px`,
            zIndex: 110,
            minWidth: '160px',
          }}
        >
          <div className="game-toolbar-buttons">
            <button
              onClick={() => setGridUnit('ft')}
              title="Feet"
              className={`tool-btn gameboard-unit-btn ${gridUnit === 'ft' ? 'active' : ''}`}
              style={gridUnit === 'ft' ? activatedToolBtnStyle : undefined}
            >
              ft
            </button>
            <button
              onClick={() => setGridUnit('km')}
              title="Kilometers"
              className={`tool-btn gameboard-unit-btn ${gridUnit === 'km' ? 'active' : ''}`}
              style={gridUnit === 'km' ? activatedToolBtnStyle : undefined}
            >
              km
            </button>
            <button
              onClick={() => setGridUnit('miles')}
              title="Miles"
              className={`tool-btn gameboard-unit-btn ${gridUnit === 'miles' ? 'active' : ''}`}
              style={gridUnit === 'miles' ? activatedToolBtnStyle : undefined}
            >
              miles
            </button>
          </div>
        </div>
      )}

      {/* Measurement Shape Panel - Shows when measure tool is active */}
      {tool === 'measure' && (
        <MeasurementPanel position={gridUnitPanelPos} isGM={isCurrentUserGM} />
      )}

      {/* Particle Emitter Tool Panel */}
      {isCurrentUserGM && tool === 'particle' && !particlePanelDismissed && currentBoard && (
        <div
          ref={particlePanelRef}
          className="particle-emitter"
          onClick={() => setPanelFocus('particleEmitter')}
          style={{
            left: particleEmitterPosition.x,
            top: particleEmitterPosition.y,
            width: particleEmitterSizeState.width,
            height: particleEmitterSizeState.height,
            zIndex: panelFocus === 'particleEmitter' ? 5000 : 110,
          }}
        >
          {/* Header - draggable */}
          <div
            className="particle-emitter-header"
            onPointerDown={startParticlePanelDrag}
          >
            <h2 className="particle-emitter-title">
              <Icon name="wand-magic-sparkles" /> Particle Emitter
            </h2>
            <button
              className="particle-emitter-close"
              onClick={(e) => {
                e.stopPropagation();
                setParticlePanelDismissed(true);
              }}
            >
              <Icon name="times" />
            </button>
          </div>
          <div className="gameboard-inline-control-row gameboard-inline-control-row-spaced gameboard-particle-toolbar-row">
            <span className="gameboard-inline-control-label gameboard-inline-control-label-wide">Emitter Size</span>
            <input
              type="range"
              min="40"
              max="400"
              step="10"
              value={particleEmitterSize}
              onChange={(e) => setParticleEmitterSize(parseInt(e.target.value, 10))}
              className="gameboard-inline-slider gameboard-inline-slider-wide"
            />
            <span className="gameboard-inline-control-value gameboard-inline-control-value-wide">
              {particleEmitterSize}px
            </span>
            <span className="gameboard-inline-helper-text">
              Click on the board to place emitters. Right-click to remove.
            </span>
          </div>         
          {manualEmitters.length > 0 && (
            <div className="gameboard-panel-section-spacing">
              <div className="gameboard-inline-helper-text gameboard-inline-helper-text-heading">Placed Emitters</div>
              <div className="gameboard-chip-grid">
                {manualEmitters.map((emitter, index) => (
                  <button
                    key={emitter.key}
                    onDoubleClick={() => {
                      setParticlePreset(emitter.presetId);
                      setActiveEmitterEditKey(emitter.key);
                    }}
               
                    title={`Emitter ${index + 1} • ${emitter.presetId} @ ${Math.round(emitter.x)}, ${Math.round(emitter.y)} (double click to edit)`}
                    className="gameboard-chip-button"
                  >
                    {particlePresetNameMap.get(emitter.presetId) ?? emitter.presetId}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="gameboard-particle-editor-shell">
            <ParticleEditorPanel
              selectedPresetId={particlePreset}
              onSelectPreset={(id) => setParticlePreset(id)}
              emitterEdit={
                activeEmitterEdit
                  ? { key: activeEmitterEdit.key, presetId: activeEmitterEdit.presetId, overrides: activeEmitterEdit.overrides ?? {} }
                  : undefined
              }
              onEmitterOverrideChange={handleEmitterOverrideChange}
              onClearEmitterEdit={() => setActiveEmitterEditKey(null)}
            />
          </div>
          <div
            onPointerDown={startParticlePanelResize}
            className="particle-emitter-resize"
            title="Resize"
          />
        </div>
      )}
      
      {/* Bar Editor Popup */}
      {barEditorState && (
        <div
          className="token-panel token-panel-bars"
          style={{
            left: barEditorState.position.x,
            top: barEditorState.position.y,
            zIndex: 1000,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="token-panel-title gameboard-token-panel-title-spaced">
            {barEditorState.barName ? `Edit ${barEditorState.barName}` : 'Add New Bar'}
          </div>
          {barEditorState.barName ? (
            <>
              <div className="token-panel-section">
                <div className="token-panel-label gameboard-token-panel-label-sm">
                  Current: {barEditorState.current} / {barEditorState.max}
                </div>
                <input
                  type="range"
                  min="0"
                  max={barEditorState.max}
                  value={barEditorState.current}
                  onChange={(e) => {
                    const newVal = parseInt(e.target.value);
                    const token = tokens.find(t => t.id === barEditorState!.tokenId);
                    if (!token) return;
                    const bars: Array<{ name: string; current: number; max: number; color: string }> = token.bars ? JSON.parse(token.bars) : [];
                    const newBars = bars.map(b => b.name === barEditorState!.barName ? { ...b, current: newVal } : b);
                    socketService.updateToken(token.id, { bars: JSON.stringify(newBars) });
                    setBarEditorState({ ...barEditorState, current: newVal });
                    // Auto-set dead status if HP <= 0
                    if (barEditorState!.barName === 'HP' && newVal <= 0) {
                      const currentStatus: string[] = token.status ? JSON.parse(token.status) : [];
                      if (!currentStatus.includes('face-dizzy')) {
                        socketService.updateToken(token.id, { status: JSON.stringify([...currentStatus, 'face-dizzy']) });
                      }
                    }
                    // Remove dead status if HP > 0
                    if (barEditorState!.barName === 'HP' && newVal > 0) {
                      const currentStatus: string[] = token.status ? JSON.parse(token.status) : [];
                      if (currentStatus.includes('face-dizzy')) {
                        socketService.updateToken(token.id, { status: JSON.stringify(currentStatus.filter((s: string) => s !== 'face-dizzy')) });
                      }
                    }
                  }}
                  className="token-panel-range"
                />
              </div>
              <div className="token-panel-flex-row gameboard-token-panel-actions gameboard-token-panel-action-row-spaced">
                <button
                  onClick={() => {
                    const newVal = Math.max(0, barEditorState.current - 1);
                    const token = tokens.find(t => t.id === barEditorState!.tokenId);
                    if (!token) return;
                    const bars: Array<{ name: string; current: number; max: number; color: string }> = token.bars ? JSON.parse(token.bars) : [];
                    const newBars = bars.map(b => b.name === barEditorState!.barName ? { ...b, current: newVal } : b);
                    socketService.updateToken(token.id, { bars: JSON.stringify(newBars) });
                    setBarEditorState({ ...barEditorState, current: newVal });
                    // Auto-set dead status if HP <= 0
                    if (barEditorState!.barName === 'HP' && newVal <= 0) {
                      const currentStatus: string[] = token.status ? JSON.parse(token.status) : [];
                      if (!currentStatus.includes('face-dizzy')) {
                        socketService.updateToken(token.id, { status: JSON.stringify([...currentStatus, 'face-dizzy']) });
                      }
                    }
                  }}
                  className="token-panel-button gameboard-token-panel-action-fill gameboard-token-panel-bar-action"
                  style={{ '--gameboard-bar-action-bg': barEditorState.color } as React.CSSProperties}
                >
                  -1
                </button>
                <button
                  onClick={() => {
                    const newVal = Math.min(barEditorState.max, barEditorState.current + 1);
                    const token = tokens.find(t => t.id === barEditorState!.tokenId);
                    if (!token) return;
                    const bars: Array<{ name: string; current: number; max: number; color: string }> = token.bars ? JSON.parse(token.bars) : [];
                    const newBars = bars.map(b => b.name === barEditorState!.barName ? { ...b, current: newVal } : b);
                    socketService.updateToken(token.id, { bars: JSON.stringify(newBars) });
                    setBarEditorState({ ...barEditorState, current: newVal });
                    // Remove dead status if HP > 0
                    if (barEditorState!.barName === 'HP' && newVal > 0) {
                      const currentStatus: string[] = token.status ? JSON.parse(token.status) : [];
                      if (currentStatus.includes('face-dizzy')) {
                        socketService.updateToken(token.id, { status: JSON.stringify(currentStatus.filter((s: string) => s !== 'face-dizzy')) });
                      }
                    }
                  }}
                  className="token-panel-button gameboard-token-panel-action-fill gameboard-token-panel-bar-action"
                  style={{ '--gameboard-bar-action-bg': barEditorState.color } as React.CSSProperties}
                >
                  +1
                </button>
                <button
                  onClick={() => setBarEditorState(null)}
                  className="token-panel-button gameboard-token-panel-action-fill"
                >
                  Close
                </button>
              </div>
            </>
          ) : (
            <div className="gameboard-panel-section-spacing">
              {/* Preset Buttons for HP and Mana */}
              <div className="gameboard-token-panel-button-row">
                <button
                  onClick={() => {
                    const token = tokens.find(t => t.id === barEditorState!.tokenId);
                    if (!token) return;
                    const bars: Array<{ name: string; current: number; max: number; color: string }> = token.bars ? JSON.parse(token.bars) : [];
                    const hpBar = bars.find(b => b.name === 'HP');
                    if (hpBar) {
                      // Edit existing HP bar
                      setBarEditorState({
                        ...barEditorState!,
                        barName: 'HP',
                        current: hpBar.current,
                        max: hpBar.max,
                        color: hpBar.color,
                      });
                    } else {
                      // Add new HP bar
                      const newBar = { name: 'HP', current: 10, max: 10, color: DEFAULT_HP_BAR_COLOR };
                      const newBars = [...bars, newBar];
                      socketService.updateToken(token.id, { bars: JSON.stringify(newBars) });
                    }
                  }}
                  className="gameboard-token-preset-button gameboard-token-preset-button-hp"
                  title="Add or edit HP bar"
                >
                  HP
                </button>
                <button
                  onClick={() => {
                    const token = tokens.find(t => t.id === barEditorState!.tokenId);
                    if (!token) return;
                    const bars: Array<{ name: string; current: number; max: number; color: string }> = token.bars ? JSON.parse(token.bars) : [];
                    const manaBar = bars.find(b => b.name === 'Mana');
                    if (manaBar) {
                      // Edit existing Mana bar
                      setBarEditorState({
                        ...barEditorState!,
                        barName: 'Mana',
                        current: manaBar.current,
                        max: manaBar.max,
                        color: manaBar.color,
                      });
                    } else {
                      // Add new Mana bar
                      const newBar = { name: 'Mana', current: 10, max: 10, color: DEFAULT_MANA_BAR_COLOR };
                      const newBars = [...bars, newBar];
                      socketService.updateToken(token.id, { bars: JSON.stringify(newBars) });
                    }
                  }}
                  className="gameboard-token-preset-button gameboard-token-preset-button-mana"
                  title="Add or edit Mana bar"
                >
                  Mana
                </button>
              </div>
              {/* List of all existing bars - click to edit */}
              {(() => {
                const token = tokens.find(t => t.id === barEditorState!.tokenId);
                if (!token) return null;
                const bars: Array<{ name: string; current: number; max: number; color: string }> = token.bars ? JSON.parse(token.bars) : [];
                if (bars.length === 0) return null;
                return (
                  <div className="gameboard-panel-section-spacing">
                    <div className="gameboard-inline-helper-text gameboard-inline-helper-text-heading">Existing Bars (click to edit):</div>
                    <div className="gameboard-chip-grid gameboard-chip-grid-tight">
                      {bars.map((bar, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setBarEditorState({
                              ...barEditorState!,
                              barName: bar.name,
                              current: bar.current,
                              max: bar.max,
                              color: bar.color,
                            });
                          }}
                          className="gameboard-chip-button"
                          style={{ '--gameboard-chip-bg': bar.color } as React.CSSProperties}
                        >
                          {bar.name}: {bar.current}/{bar.max}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div className="gameboard-inline-helper-text gameboard-inline-helper-text-heading">New Custom Bar:</div>
              <div className="gameboard-input-row-tight">
                <input
                  type="text"
                  id="newBarName"
                  placeholder="Name (e.g., Stamina)"
                  className="gameboard-token-input"
                />
              </div>
              <div className="gameboard-input-row-tight">
                <input
                  type="number"
                  id="newBarMax"
                  placeholder="Max"
                  defaultValue="10"
                  className="gameboard-token-input"
                />
                <input
                  type="color"
                  id="newBarColor"
                  defaultValue={DEFAULT_CUSTOM_BAR_COLOR}
                  className="gameboard-token-color-input"
                />
              </div>
              <div className="gameboard-token-panel-actions">
                <button
                  onClick={() => {
                    const nameInput = document.getElementById('newBarName') as HTMLInputElement;
                    const maxInput = document.getElementById('newBarMax') as HTMLInputElement;
                    const colorInput = document.getElementById('newBarColor') as HTMLInputElement;
                    const barName = nameInput?.value?.trim();
                    const barMax = parseInt(maxInput?.value || '10');
                    const barColor = colorInput?.value || DEFAULT_CUSTOM_BAR_COLOR;
                    if (!barName) return;
                    const token = tokens.find(t => t.id === barEditorState!.tokenId);
                    if (!token) return;
                    const bars: Array<{ name: string; current: number; max: number; color: string }> = token.bars ? JSON.parse(token.bars) : [];
                    const newBar = { name: barName, current: barMax, max: barMax, color: barColor };
                    const newBars = [...bars, newBar];
                    socketService.updateToken(token.id, { bars: JSON.stringify(newBars) });
                    // Keep editor open to add more bars
                    nameInput.value = '';
                    maxInput.value = '10';
                    colorInput.value = DEFAULT_CUSTOM_BAR_COLOR;
                  }}
                  className="gameboard-token-preset-button gameboard-token-preset-button-custom"
                >
                  Add Custom Bar
                </button>
                <button
                  onClick={() => setBarEditorState(null)}
                  className="gameboard-token-cancel-button"
                  style={{ '--gameboard-cancel-bg': colorScheme?.primary || 'var(--token-panel-button-bg)', '--gameboard-cancel-text': colorScheme?.text || 'var(--color-text-primary)' } as React.CSSProperties}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Token Action Buttons - Floating around token */}
      {/* Always render but control visibility - like bars and status icons */}
      {(() => {
        const token = tokenContextMenu ? tokens.find(t => t.id === tokenContextMenu.tokenId) : null;
        if (!token) return null;
        
        return (
          <TokenActionButtons
            key={`token-actions-${token.id}`}
            tokenId={token.id}
            appRef={appRef}
            effectiveGridSize={effectiveGridSize}
            isVisible={!!tokenContextMenu}
            onOpenModal={(modal, buttonPosition) => {
              // Close the token context menu
              setTokenContextMenu(null);
              
              const size = effectiveGridSize * token.size;
              const tokenCenterX = token.x + size / 2;
              const tokenCenterY = token.y + size / 2;
              
              // Calculate menu position offset from button position
              // Default to centering on token if no button position provided
              let menuX = tokenCenterX;
              let menuY = tokenCenterY;
              
              if (buttonPosition) {
                // Use button position but offset it away from token center
                const dx = buttonPosition.x - tokenCenterX;
                const dy = buttonPosition.y - tokenCenterY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance > 0) {
                  // Normalize direction and add offset
                  const offset = 60;
                  menuX = buttonPosition.x + (dx / distance) * offset;
                  menuY = buttonPosition.y + (dy / distance) * offset;
                } else {
                  menuX = buttonPosition.x + 60;
                  menuY = buttonPosition.y + 60;
                }
              }
              
              // Clamp menu position to stay within viewport bounds
              // Account for header (approximately 60px) and other UI elements
              const clampToBounds = (x: number, y: number, menuWidth: number, menuHeight: number) => {
                const headerOffset = 70; // Account for top header
                const sidebarWidth = 300; // Approximate sidebar width
                const minX = 10;
                const maxX = window.innerWidth - menuWidth - 10;
                const minY = headerOffset;
                const maxY = window.innerHeight - menuHeight - 10;
                
                return {
                  x: Math.max(minX, Math.min(x, maxX)),
                  y: Math.max(minY, Math.min(y, maxY))
                };
              };
              
              switch (modal) {
                case 'bars': {
                  // Get existing bars for this token
                  const existingBars: Array<{ name: string; current: number; max: number; color: string }> = token.bars ? JSON.parse(token.bars) : [];
                  
                  // Always show the "Add New Bar" panel when clicking the Bars icon
                  // (regardless of whether bars already exist)
                  const pos = clampToBounds(menuX - 100, menuY - 90, 200, 350);
                  setBarEditorState({
                    tokenId: token.id,
                    barName: '',  // Empty barName shows "Add New Bar" panel
                    current: 10,
                    max: 10,
                    color: DEFAULT_CUSTOM_BAR_COLOR,
                    position: pos,
                  });
                  break;
                }
                case 'status':
                  // Open status editor
                  {
                    const pos = clampToBounds(menuX - 125, menuY - 150, 250, 350);
                    setStatusEditorState({
                      tokenId: token.id,
                      position: pos,
                    });
                  }
                  break;
                case 'display':
                  // Open display editor
                  {
                    const pos = clampToBounds(menuX - 125, menuY - 100, 250, 300);
                    setDisplayEditorState({
                      tokenId: token.id,
                      position: pos,
                    });
                  }
                  break;
                case 'aura':
                  // Open aura/enchantment editor
                  {
                    // Place the panel to the right of the token (beside it)
                    const pos = clampToBounds(menuX + 20, menuY - 50, 320, 500);
                    setAuraEditorState({
                      tokenId: token.id,
                      position: pos,
                    });
                  }
                  break;
                case 'ownership':
                  // Open ownership editor
                  {
                    const pos = clampToBounds(menuX - 125, menuY - 100, 250, 200);
                    setOwnershipEditorState({
                      tokenId: token.id,
                      position: pos,
                    });
                  }
                  break;
                case 'layer':
                  // Open layer editor
                  {
                    const pos = clampToBounds(menuX - 100, menuY - 60, 200, 200);
                    setLayerEditorState({
                      tokenId: token.id,
                      position: pos,
                    });
                  }
                  break;
                case 'delete':
                  // Open delete confirmation
                  {
                    const pos = clampToBounds(menuX - 100, menuY - 60, 200, 150);
                    setDeleteEditorState({
                      tokenId: token.id,
                      position: pos,
                    });
                  }
                  break;
                case 'combat':
                  // Toggle combatant
                  {
                    const pos = clampToBounds(menuX - 100, menuY - 60, 200, 150);
                    setCombatEditorState({
                      tokenId: token.id,
                      position: pos,
                    });
                  }
                  break;
              }
            }}
          />
        );
      })()}

      {/* Status Editor Popup */}
      {statusEditorState && (() => {
        const token = tokens.find(t => t.id === statusEditorState.tokenId);
        if (!token) return null;
        
        // Safely parse status - handle both string and array formats
        let statuses: string[] = [];
        try {
          if (token.status) {
            const parsed = JSON.parse(token.status);
            statuses = Array.isArray(parsed) ? parsed : [];
          }
        } catch (e) {
          console.warn('Failed to parse token status:', e);
          statuses = [];
        }
        
        const tokenData = (token.properties || {}) as Record<string, unknown>;
        
        const availableStatuses = [
          { id: 'poisoned', name: 'Poisoned', iconName: 'flask' },
          { id: 'diseased', name: 'Diseased', iconName: 'diseased' },
          { id: 'blinded', name: 'Blinded', iconName: 'eye' },
          { id: 'charmed', name: 'Charmed', iconName: 'face-stars' },
          { id: 'frightened', name: 'Frightened', iconName: 'face-suprised' },
          { id: 'paralyzed', name: 'Paralyzed', iconName: 'bolt' },
          { id: 'unconscious', name: 'Unconscious', iconName: 'face-dizzy' },
          { id: 'exhaustion', name: 'Exhaustion', iconName: 'tired' },
        ];
        
        return (
          <div
            className="token-panel token-panel-status"
            style={{
              left: statusEditorState.position.x,
              top: statusEditorState.position.y + 20,
              zIndex: 99999,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="token-panel-title">
              Status Effects
            </div>
            <div className="token-panel-status-grid">
              {availableStatuses.map(s => (
                <button
                  key={s.id}
                  onClick={() => {
                    const newStatuses = statuses.includes(s.id)
                      ? statuses.filter(st => st !== s.id)
                      : [...statuses, s.id];
                    socketService.updateToken(token.id, { status: JSON.stringify(newStatuses) });
                  }}
                  className={`token-panel-status-button ${statuses.includes(s.id) ? 'active' : ''}`}
                  title={s.name}
                >
                  <Icon name={s.iconName} />
                </button>
              ))}
            </div>
            {/* Status Icon Settings */}
            {statuses.length > 0 && (
              <div className="token-panel-section gameboard-token-panel-section-divider">
                <div className="token-panel-label gameboard-token-panel-label-strong">Icon Settings</div>
                
                <div className="token-panel-section">
                  <label className="token-panel-label gameboard-token-panel-label-sm">Radius</label>
                  <input
                    type="range"
                    min="5"
                    max="50"
                    value={(tokenData.statusRadius as number) || 25}
                    onChange={(e) => {
                      const newProps = { ...tokenData, statusRadius: parseInt(e.target.value) };
                      socketService.updateToken(token.id, { properties: newProps });
                    }}
                    className="token-panel-range"
                  />
                </div>
                
                <div className="token-panel-section">
                  <label className="token-panel-label gameboard-token-panel-label-sm">Spread</label>
                  <input
                    type="range"
                    min="25"
                    max="100"
                    value={((tokenData.statusSpread as number) || 0.75) * 100}
                    onChange={(e) => {
                      const newProps = { ...tokenData, statusSpread: parseInt(e.target.value) / 100 };
                      socketService.updateToken(token.id, { properties: newProps });
                    }}
                    className="token-panel-range"
                  />
                </div>
                
                <div className="token-panel-section">
                  <label className="token-panel-label gameboard-token-panel-label-sm">Size</label>
                  <input
                    type="range"
                    min="8"
                    max="32"
                    value={(tokenData.statusIconSize as number) || 14}
                    onChange={(e) => {
                      const newProps = { ...tokenData, statusIconSize: parseInt(e.target.value) };
                      socketService.updateToken(token.id, { properties: newProps });
                    }}
                    className="token-panel-range"
                  />
                </div>
                
                <div className="token-panel-flex-row">
                  <label className="token-panel-label gameboard-token-panel-label-sm">Color:</label>
                  <input
                    type="color"
                    value={(tokenData.statusIconColor as string) || DEFAULT_TOKEN_TEXT_COLOR}
                    onChange={(e) => {
                      const newProps = { ...tokenData, statusIconColor: e.target.value };
                      socketService.updateToken(token.id, { properties: newProps });
                    }}
                    className="gameboard-token-inline-color"
                  />
                </div>
              </div>
            )}
            <button
              onClick={() => setStatusEditorState(null)}
              className="token-panel-button gameboard-token-panel-close-spaced"
            >
              Close
            </button>
          </div>
        );
      })()}

      {/* Display Editor Popup */}
      {displayEditorState && (() => {
        const token = tokens.find(t => t.id === displayEditorState!.tokenId);
        if (!token) return null;
        const tokenData = (token.properties || {}) as Record<string, unknown>;
        const currentDisposition = (tokenData.disposition as string) || null;
        
        return (
          <div
            className="token-panel token-panel-display"
            style={{
              left: displayEditorState.position.x,
              top: displayEditorState.position.y + 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="token-panel-title">
              Display Settings
            </div>

            {/* Disposition */}
            <div className="token-panel-section">
              <label className="token-panel-label">
                Disposition
              </label>
              <div className="token-panel-flex-row gameboard-token-panel-chip-row">
                {(['neutral', 'friendly', 'secret', 'hostile'] as const).map((disp) => {
                  const dispInfo = TOKEN_DISPOSITIONS[disp];
                  const isActive = currentDisposition === disp;
                  return (
                    <button
                      key={disp}
                      onClick={() => {
                        const newProps = { ...tokenData, disposition: isActive ? null : disp };
                        socketService.updateToken(token.id, { properties: newProps });
                      }}
                      className={`gameboard-disposition-chip ${isActive ? 'is-active' : ''}`}
                      style={{ '--gameboard-disposition-color': dispInfo.color } as React.CSSProperties}
                    >
                      <span className="gameboard-disposition-chip-dot" />
                      {dispInfo.label}
                    </button>
                  );
                })}
              </div>
            </div>
            
            <div className="token-panel-section">
              <label className="token-panel-label">
                Display Name
              </label>
              <div className="token-panel-input-row">
                <input
                  type="text"
                  value={token.name || ''}
                  onChange={(e) => {
                    socketService.updateToken(token.id, { name: e.target.value, label: e.target.value });
                  }}
                  className="token-panel-input gameboard-token-name-input"
                />
                <button
                  onClick={() => {
                    socketService.updateToken(token.id, { showLabel: !token.showLabel });
                  }}
                  className={`token-panel-button gameboard-display-toggle-button ${token.showLabel ? 'is-active' : ''}`}
                  title={token.showLabel ? 'Hide Label' : 'Show Label'}
                >
                  <Icon name="eye" />
                </button>
              </div>
            </div>

            {/* Font Settings for Display Name */}
            <div className="token-panel-section">
              <label className="token-panel-label">
                Font Size
              </label>
              <div className="token-panel-flex-row">
                <input
                  type="range"
                  min="8"
                  max="48"
                  value={(tokenData.labelFontSize as number) || 14}
                  onChange={(e) => {
                    const newProps = { ...tokenData, labelFontSize: parseInt(e.target.value) };
                    socketService.updateToken(token.id, { properties: newProps });
                  }}
                  className="token-panel-range"
                />
                <span className="token-panel-range-value">
                  {(tokenData.labelFontSize as number) || 14}px
                </span>
              </div>
            </div>

            <div className="token-panel-section">
              <label className="token-panel-label">
                Font Family
              </label>
              <select
                value={(tokenData.labelFontFamily as string) || 'Arial'}
                onChange={(e) => {
                  const newProps = { ...tokenData, labelFontFamily: e.target.value };
                  socketService.updateToken(token.id, { properties: newProps });
                }}
                className="token-panel-select"
              >
                <option value="Arial">Arial</option>
                <option value="Helvetica">Helvetica</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Georgia">Georgia</option>
                <option value="Verdana">Verdana</option>
                <option value="Courier New">Courier New</option>
                <option value="Comic Sans MS">Comic Sans MS</option>
                <option value="Impact">Impact</option>
              </select>
            </div>
            
            <div className="token-panel-section">
              <label className="token-panel-label">
                Token Size
              </label>
              <select
                value={token.size || 1}
                onChange={(e) => {
                  socketService.updateToken(token.id, { size: normalizeTokenScale(parseFloat(e.target.value)) });
                }}
                className="token-panel-select"
              >
                <option value={0.5}>Tiny (0.5x)</option>
                <option value={1}>Small (1x)</option>
                <option value={1}>Medium (1x)</option>
                <option value={2}>Large (2x)</option>
                <option value={3}>Huge (3x)</option>
                <option value={4}>Gargantuan (4x)</option>
              </select>
            </div>
            
            <div className="token-panel-section">
              <label className="token-panel-label">
                Visibility
              </label>
              <select
                value={(tokenData.hiddenFromPlayers as boolean) ? 'hidden' : 'visible'}
                onChange={(e) => {
                  const newProps = { ...tokenData, hiddenFromPlayers: e.target.value === 'hidden' };
                  socketService.updateToken(token.id, { properties: newProps });
                }}
                className="token-panel-select"
              >
                <option value="visible">Visible to Players</option>
                <option value="hidden">Hidden from Players</option>
              </select>
            </div>
            
            <div className="token-panel-section">
                  <label className="token-panel-label gameboard-token-panel-label-block">
                    Layer
                  </label>
              <div className="token-panel-button-group">
                {[
                  { id: 'tokens', label: 'Tokens' },
                  { id: 'gm', label: 'GM' },
                  { id: 'objects', label: 'Objects' },
                  { id: 'background', label: 'Background' },
                ].map(layer => (
                  <button
                    key={layer.id}
                    onClick={() => socketService.updateToken(token.id, { layer: layer.id })}
                    className={`token-panel-segment ${(String(token.layer) === layer.id || (layer.id === 'tokens' && String(token.layer) === 'token')) ? 'active' : ''}`}
                  >
                    {layer.label}
                  </button>
                ))}
              </div>
            </div>
            
            <button
              onClick={() => setDisplayEditorState(null)}
              className="token-panel-button gameboard-token-panel-close-spaced"
            >
              Close
            </button>
          </div>
        );
      })()}

      {/* Token Action Quick Popup */}
      {actionPopupState && (() => {
        const token = tokens.find(t => t.id === actionPopupState.tokenId);
        const tokenName = token?.name || 'Token';
        const attackFormula = actionPopupState.attackFormula;
        const damageFormula = actionPopupState.damageFormula;
        return (
          <div
            className="token-panel token-panel-action"
            style={{
              left: actionPopupState.position.x,
              top: actionPopupState.position.y,
              zIndex: 100000,
              maxWidth: 360,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="token-panel-title gameboard-token-panel-title-spaced">
              {actionPopupState.action.name}
            </div>
            <div
              className="gameboard-action-popup-copy"
            >
              {actionPopupState.action.text}
            </div>

            <div className="gameboard-action-popup-actions">
              <button
                disabled={!attackFormula}
                onClick={() => {
                  if (!attackFormula) return;
                  void rollFromTokenAction(attackFormula, tokenName, actionPopupState.action.name);
                }}
                className={`token-panel-button gameboard-action-popup-button ${attackFormula ? '' : 'is-disabled'}`}
              >
                Roll Attack
              </button>
              <button
                disabled={!damageFormula}
                onClick={() => {
                  if (!damageFormula) return;
                  void rollFromTokenAction(damageFormula, tokenName, actionPopupState.action.name);
                }}
                className={`token-panel-button gameboard-action-popup-button ${damageFormula ? '' : 'is-disabled'}`}
              >
                Roll Damage
              </button>
              <button
                onClick={() => {
                  socketService.sendChatMessage(`🗡️ ${tokenName} • ${actionPopupState.action.name}\n${actionPopupState.action.text}`);
                }}
                className="token-panel-button gameboard-action-popup-button"
              >
                Send To Chat
              </button>
              <button
                onClick={() => setActionPopupState(null)}
                className="token-panel-button gameboard-action-popup-button"
              >
                Close
              </button>
            </div>
          </div>
        );
      })()}

      {orbitTooltipState && (
        <div
          className="gameboard-orbit-tooltip"
          style={{
            left: orbitTooltipState.position.x,
            top: orbitTooltipState.position.y,
          }}
        >
          {orbitTooltipState.text}
        </div>
      )}

      {/* Ownership Editor Popup */}
      {ownershipEditorState && (() => {
        const token = tokens.find(t => t.id === ownershipEditorState!.tokenId);
        if (!token) return null;
        const tokenData = (token.properties || {}) as Record<string, unknown>;
        
        return (
          <div
            className="token-panel token-panel-ownership"
            style={{
              left: ownershipEditorState.position.x,
              top: ownershipEditorState.position.y + 20,
              zIndex: 1000,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="token-panel-title">
              Ownership
            </div>
            
            <div className="token-panel-section">
              <label className="token-panel-label">
                Assigned Player
              </label>
              <select
                value={token.ownerId || ''}
                onChange={(e) => {
                  const newProps = { ...tokenData, ownerId: e.target.value };
                  socketService.updateToken(token.id, { ownerId: e.target.value || null, properties: JSON.stringify(newProps) });
                }}
                className="token-panel-select"
              >
                <option value="">No Owner</option>
                {players.map(player => (
                  <option key={player.userId} value={player.userId}>{player.username || player.userId}</option>
                ))}
              </select>
            </div>
            
            <button
              onClick={() => setOwnershipEditorState(null)}
              className="token-panel-button gameboard-token-panel-close-spaced"
            >
              Close
            </button>
          </div>
        );
      })()}

      {/* Layer Editor Popup */}
      {layerEditorState && (() => {
        const token = tokens.find(t => t.id === layerEditorState!.tokenId);
        if (!token) return null;
        
        const layers = [
          { id: 'tokens', name: 'Tokens', description: 'Default token layer' },
          { id: 'gm', name: 'GM Only', description: 'Only visible to GM' },
          { id: 'objects', name: 'Objects', description: 'Moveable objects' },
          { id: 'background', name: 'Background', description: 'Static background layer' },
        ];
        
        return (
          <div
            className="token-panel token-panel-layer"
            style={{
              left: layerEditorState.position.x,
              top: layerEditorState.position.y + 20,
              zIndex: 1000,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="token-panel-title">
              Layer
            </div>
            
            <div className="gameboard-layer-list">
              {layers.map(layer => (
                <button
                  key={layer.id}
                  onClick={() => {
                    socketService.updateToken(token.id, { layer: layer.id });
                    setLayerEditorState(null);
                  }}
                  className={`token-panel-segment gameboard-layer-segment ${(String(token.layer) === layer.id || (layer.id === 'tokens' && String(token.layer) === 'token')) ? 'active' : ''}`}
                >
                  <div className="gameboard-layer-name">{layer.name}</div>
                  <div className="gameboard-layer-description">{layer.description}</div>
                </button>
              ))}
            </div>
            
            <button
              onClick={() => setLayerEditorState(null)}
              className="token-panel-button gameboard-token-panel-close-spaced"
            >
              Cancel
            </button>
          </div>
        );
      })()}

      {/* Delete Confirmation Popup */}
      {deleteEditorState && (() => {
        const token = tokens.find(t => t.id === deleteEditorState!.tokenId);
        if (!token) return null;
        
        return (
          <div
            className="token-panel token-panel-delete gameboard-token-panel-danger-shell"
            style={{
              left: deleteEditorState.position.x,
              top: deleteEditorState.position.y + 20,
              zIndex: 1000,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="token-panel-title gameboard-token-panel-title-centered">
              Delete Token?
            </div>
            <div className="token-panel-label gameboard-token-panel-message">
              Are you sure you want to delete "{token.name || 'Unnamed'}"?
            </div>
            <div className="token-panel-flex-row gameboard-token-panel-actions">
              <button
                onClick={() => {
                  socketService.deleteToken(token.id);
                  setDeleteEditorState(null);
                }}
                className="token-panel-button token-panel-button-danger gameboard-token-panel-action-fill"
              >
                Delete
              </button>
              <button
                onClick={() => setDeleteEditorState(null)}
                className="token-panel-button gameboard-token-panel-action-fill"
              >
                Cancel
              </button>
            </div>
          </div>
        );
      })()}

      {/* Light Editor Popup */}
      {lightEditorState && (() => {
        const light = lights?.find(l => l.id === lightEditorState!.lightId);
        if (!light) return null;
        
        return (
          <div
            className="light-editor-panel"
            style={{
              left: lightEditorState.position.x,
              top: lightEditorState.position.y + 20,
              '--light-editor-surface': colorScheme?.secondary || colorScheme?.surface || 'var(--surface, var(--bg-secondary))',
              '--light-editor-accent': colorScheme?.accent || 'var(--accent)',
            } as React.CSSProperties}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="gameboard-editor-heading">
              <Icon name="lightbulb" />
              Edit Light
            </div>
            
            {/* Light Name */}
            <div className="gameboard-editor-field">
              <div className="gameboard-editor-label">Name</div>
              <input
                type="text"
                value={light.name}
                onChange={(e) => {
                  updateLight(light.id, { name: e.target.value });
                }}
                onBlur={(e) => {
                  if (currentBoard) {
                    socketService.updateLight(light.id, { name: e.currentTarget.value });
                  }
                }}
                className="gameboard-editor-input"
              />
            </div>
            
            {/* Radius */}
            <div className="gameboard-editor-field">
              <div className="gameboard-editor-label">Radius: {light.radius}px</div>
              <input
                type="range"
                min="0"
                max="2000"
                value={light.radius}
                onChange={(e) => {
                  const newRadius = parseInt(e.target.value);
                  updateLight(light.id, { radius: newRadius, dimRadius: newRadius * 0.25 });
                }}
                onPointerUp={(e) => {
                  if (currentBoard) {
                    const value = parseInt(e.currentTarget.value, 10);
                    socketService.updateLight(light.id, { radius: value, dimRadius: value * 0.25 });
                  }
                }}
                className="gameboard-editor-range"
              />
            </div>
            
            {/* Intensity */}
            <div className="gameboard-editor-field">
              <div className="gameboard-editor-label">Intensity: {light.intensity.toFixed(2)}</div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={light.intensity}
                onChange={(e) => {
                  updateLight(light.id, { intensity: parseFloat(e.target.value) });
                }}
                onPointerUp={(e) => {
                  if (currentBoard) {
                    socketService.updateLight(light.id, { intensity: parseFloat(e.currentTarget.value) });
                  }
                }}
                className="gameboard-editor-range"
              />
            </div>
            
            {/* Alpha */}
            <div className="gameboard-editor-field">
              <div className="gameboard-editor-label">Alpha: {(light.alpha ?? 1).toFixed(2)}</div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={light.alpha ?? 1}
                onChange={(e) => {
                  updateLight(light.id, { alpha: parseFloat(e.target.value) });
                }}
                onPointerUp={(e) => {
                  if (currentBoard) {
                    socketService.updateLight(light.id, { alpha: parseFloat(e.currentTarget.value) });
                  }
                }}
                className="gameboard-editor-range"
              />
            </div>
            
            {/* Color */}
            <div className="gameboard-editor-field">
              <div className="gameboard-editor-label">Color</div>
              <input
                type="color"
                value={`#${light.color.toString(16).padStart(6, '0')}`}
                onChange={(e) => {
                  const colorHex = e.target.value.replace('#', '');
                  updateLight(light.id, { color: parseInt(colorHex, 16) });
                }}
                onBlur={(e) => {
                  if (currentBoard) {
                    const colorHex = e.currentTarget.value.replace('#', '');
                    socketService.updateLight(light.id, { color: parseInt(colorHex, 16) });
                  }
                }}
                className="light-editor-panel-color"
              />
            </div>
            
            {/* Type */}
            <div className="gameboard-editor-field">
              <div className="gameboard-editor-label">Type</div>
              <select
                value={light.type}
                onChange={(e) => {
                  const newType = e.target.value as 'point' | 'cone' | 'radiance';
                  updateLight(light.id, { type: newType });
                  if (currentBoard) {
                    socketService.updateLight(light.id, { type: newType });
                  }
                }}
                className="light-editor-panel-select"
              >
                <option value="point">Point Light</option>
                <option value="cone">Cone Light</option>
                <option value="radiance">Radiance (Ambient)</option>
              </select>
            </div>

            {/* Blend Mode */}
            <div className="light-editor-panel-field">
              <div className="light-editor-panel-label">Blend Mode</div>
              <select
                value={light.blendMode || 'add'}
                onChange={(e) => {
                  const blendMode = e.target.value as NonNullable<Light['blendMode']>;
                  updateLight(light.id, { blendMode });
                  if (currentBoard) {
                    socketService.updateLight(light.id, { blendMode });
                  }
                }}
                className="light-editor-panel-select"
              >
                <option value="normal">Normal</option>
                <option value="add">Add (Glow)</option>
                <option value="screen">Screen (Soft)</option>
                <option value="multiply">Multiply (Darken)</option>
                <option value="overlay">Overlay</option>
                <option value="darken">Darken</option>
                <option value="lighten">Lighten</option>
                <option value="color-dodge">Color Dodge</option>
                <option value="color-burn">Color Burn</option>
                <option value="hard-light">Hard Light</option>
                <option value="soft-light">Soft Light</option>
                <option value="difference">Difference</option>
                <option value="exclusion">Exclusion</option>
                <option value="hue">Hue</option>
                <option value="saturation">Saturation</option>
                <option value="color">Color</option>
                <option value="luminosity">Luminosity</option>
              </select>
            </div>

            {/* Light Presets */}
            <div className="light-editor-panel-field gameboard-light-presets-section">
              <div className="gameboard-editor-label gameboard-editor-label-spaced">Quick Presets</div>
              <div className="light-editor-panel-presets">
                {/* Torch */}
                <button
                  onClick={() => {
                    updateLight(light.id, { 
                      name: 'Torch',
                      radius: 150,
                      color: LIGHT_PRESET_VALUES.torch.color,
                      intensity: 1.0,
                      dimRadius: 37,
                      effect: 'flicker',
                      effectSpeed: 1,
                      effectIntensity: 0.5,
                      effectColor: LIGHT_PRESET_VALUES.torch.effectColor,
                      blendMode: 'add'
                    });
                    if (currentBoard) {
                      socketService.updateLight(light.id, { 
                        name: 'Torch',
                        radius: 150,
                        color: LIGHT_PRESET_VALUES.torch.color,
                        intensity: 1.0,
                        dimRadius: 37,
                        effect: 'flicker',
                        effectSpeed: 1,
                        effectIntensity: 0.5,
                        effectColor: LIGHT_PRESET_VALUES.torch.effectColor,
                        blendMode: 'add'
                      });
                    }
                  }}
                  className="gameboard-light-preset-button gameboard-light-preset-button-torch"
                  title="Torch - Warm orange, flickering"
                >
                  🔥 Torch
                </button>
                {/* Lantern */}
                <button
                  onClick={() => {
                    updateLight(light.id, { 
                      name: 'Lantern',
                      radius: 300,
                      color: LIGHT_PRESET_VALUES.lantern.color,
                      intensity: 1.2,
                      dimRadius: 75,
                      effect: 'none',
                      blendMode: 'add'
                    });
                    if (currentBoard) {
                      socketService.updateLight(light.id, { 
                        name: 'Lantern',
                        radius: 300,
                        color: LIGHT_PRESET_VALUES.lantern.color,
                        intensity: 1.2,
                        dimRadius: 75,
                        flicker: false,
                        blendMode: 'add'
                      });
                    }
                  }}
                  className="gameboard-light-preset-button gameboard-light-preset-button-lantern"
                  title="Lantern - Bright warm white, steady"
                >
                  🏮 Lantern
                </button>
                {/* Candle */}
                <button
                  onClick={() => {
                    updateLight(light.id, { 
                      name: 'Candle',
                      radius: 40,
                      color: LIGHT_PRESET_VALUES.candle.color,
                      intensity: 0.6,
                      dimRadius: 10,
                      effect: 'flicker',
                      effectSpeed: 0.5,
                      effectIntensity: 0.5,
                      effectColor: LIGHT_PRESET_VALUES.candle.effectColor,
                      blendMode: 'add'
                    });
                    if (currentBoard) {
                      socketService.updateLight(light.id, { 
                        name: 'Candle',
                        radius: 40,
                        color: LIGHT_PRESET_VALUES.candle.color,
                        intensity: 0.6,
                        dimRadius: 10,
                        effect: 'flicker',
                        effectSpeed: 0.5,
                        effectIntensity: 0.5,
                        effectColor: LIGHT_PRESET_VALUES.candle.effectColor,
                        blendMode: 'add'
                      });
                    }
                  }}
                  className="gameboard-light-preset-button gameboard-light-preset-button-candle"
                  title="Candle - Small warm light, subtle flicker"
                >
                  🕯️ Candle
                </button>
                {/* Magic */}
                <button
                  onClick={() => {
                    updateLight(light.id, { 
                      name: 'Magic Light',
                      radius: 100,
                      color: LIGHT_PRESET_VALUES.magic.color,
                      intensity: 0.8,
                      dimRadius: 25,
                      effect: 'flicker',
                      effectSpeed: 2,
                      effectIntensity: 0.5,
                      effectColor: LIGHT_PRESET_VALUES.magic.effectColor,
                      blendMode: 'add'
                    });
                    if (currentBoard) {
                      socketService.updateLight(light.id, { 
                        name: 'Magic Light',
                        radius: 100,
                        color: LIGHT_PRESET_VALUES.magic.color,
                        intensity: 0.8,
                        dimRadius: 25,
                        flicker: true,
                        flickerSpeed: 2,
                        blendMode: 'add'
                      });
                    }
                  }}
                  className="gameboard-light-preset-button gameboard-light-preset-button-magic"
                  title="Magic Light - Cool blue, mystical flicker"
                >
                  ✨ Magic
                </button>
                {/* Darkness */}
                <button
                  onClick={() => {
                    updateLight(light.id, { 
                      name: 'Shroud',
                      radius: 200,
                      color: LIGHT_PRESET_VALUES.shroud.color,
                      intensity: 0.3,
                      dimRadius: 50,
                      effect: 'none',
                      blendMode: 'multiply'
                    });
                    if (currentBoard) {
                      socketService.updateLight(light.id, { 
                        name: 'Shroud',
                        radius: 200,
                        color: LIGHT_PRESET_VALUES.shroud.color,
                        intensity: 0.3,
                        dimRadius: 50,
                        effect: 'none',
                        blendMode: 'multiply'
                      });
                    }
                  }}
                  className="gameboard-light-preset-button gameboard-light-preset-button-shroud"
                  title="Shroud - Dark shadow effect"
                >
                  🌑 Shroud
                </button>
                {/* Sunlight */}
                <button
                  onClick={() => {
                    updateLight(light.id, { 
                      name: 'Sunlight',
                      radius: 500,
                      color: LIGHT_PRESET_VALUES.sun.color,
                      intensity: 1.5,
                      dimRadius: 125,
                      effect: 'none',
                      blendMode: 'add'
                    });
                    if (currentBoard) {
                      socketService.updateLight(light.id, { 
                        name: 'Sunlight',
                        radius: 500,
                        color: LIGHT_PRESET_VALUES.sun.color,
                        intensity: 1.5,
                        dimRadius: 125,
                        effect: 'none',
                        blendMode: 'add'
                      });
                    }
                  }}
                  className="gameboard-light-preset-button gameboard-light-preset-button-sun"
                  title="Sunlight - Bright white, large radius"
                >
                  ☀️ Sun
                </button>
              </div>
            </div>
            
            {/* Effect Type */}
            <div className="gameboard-editor-field">
              <div className="gameboard-editor-label">Effect Type</div>
              <select
                value={light.effect || 'none'}
                onChange={(e) => {
                  const effect = e.target.value as 'none' | 'flicker' | 'pulse' | 'colorShift' | 'swirl';
                  updateLight(light.id, { effect });
                  if (currentBoard) {
                    socketService.updateLight(light.id, { effect });
                  }
                }}
                className="light-editor-panel-select"
              >
                <option value="none">None (Static)</option>
                <option value="flicker">Flicker</option>
                <option value="pulse">Pulse</option>
                <option value="colorShift">Color Shift</option>
                <option value="swirl">Swirl</option>
              </select>
            </div>
            
            {/* Effect Speed */}
            {(light.effect && light.effect !== 'none') && (
              <div className="gameboard-editor-field">
                <div className="gameboard-editor-label">Effect Speed: {(light.effectSpeed || 1).toFixed(1)}</div>
                <input
                  type="range"
                  min="0.1"
                  max="5"
                  step="0.1"
                  value={light.effectSpeed || 1}
                  onChange={(e) => {
                    updateLight(light.id, { effectSpeed: parseFloat(e.target.value) });
                    if (currentBoard) {
                      socketService.updateLight(light.id, { effectSpeed: parseFloat(e.target.value) });
                    }
                  }}
                  className="gameboard-editor-range"
                />
              </div>
            )}
            
            {/* Effect Intensity */}
            {(light.effect && light.effect !== 'none') && (
              <div className="gameboard-editor-field">
                <div className="gameboard-editor-label">Effect Intensity: {((light.effectIntensity ?? 0.5) * 100).toFixed(0)}%</div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={light.effectIntensity ?? 0.5}
                  onChange={(e) => {
                    updateLight(light.id, { effectIntensity: parseFloat(e.target.value) });
                    if (currentBoard) {
                      socketService.updateLight(light.id, { effectIntensity: parseFloat(e.target.value) });
                    }
                  }}
                  className="gameboard-editor-range"
                />
              </div>
            )}
            
            {/* Effect Color (for color shift) */}
            {light.effect === 'colorShift' && (
              <div className="gameboard-editor-field">
                <div className="gameboard-editor-label">Secondary Color</div>
                <input
                  type="color"
                  value={`#${(light.effectColor ?? 0xffaa00).toString(16).padStart(6, '0')}`}
                  onChange={(e) => {
                    const colorHex = e.target.value.replace('#', '');
                    updateLight(light.id, { effectColor: parseInt(colorHex, 16) });
                    if (currentBoard) {
                      socketService.updateLight(light.id, { effectColor: parseInt(colorHex, 16) });
                    }
                  }}
                  className="light-editor-panel-color gameboard-light-secondary-color-input"
                />
              </div>
            )}
            
            {/* Delete Button */}
            <div className="gameboard-token-panel-actions gameboard-token-panel-action-row-spaced">
              <button
                onClick={() => {
                  socketService.deleteLight(light.id);
                  removeLight(light.id);
                  setLightEditorState(null);
                }}
                className="token-panel-button token-panel-button-danger gameboard-token-panel-action-fill"
              >
                Delete Light
              </button>
              <button
                onClick={() => setLightEditorState(null)}
                className="token-panel-button gameboard-token-panel-action-fill"
              >
                Close
              </button>
            </div>
          </div>
        );
      })()}
      
      {/* Audio Source Editor Popup */}
      {audioSourceEditorState && (() => {
        const audioSource = audioSources?.find(a => a.id === audioSourceEditorState!.audioSourceId);
        if (!audioSource) return null;
        
        return (
          <div
            className="audio-source-editor-panel gameboard-audio-editor-panel"
            style={{
              left: audioSourceEditorState.position.x,
              top: audioSourceEditorState.position.y + 20,
              '--gameboard-audio-editor-surface': colorScheme?.secondary || colorScheme?.surface || 'var(--surface, var(--bg-secondary))',
              '--gameboard-audio-editor-accent': colorScheme?.accent || 'var(--accent)',
            } as React.CSSProperties}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="gameboard-editor-heading">
              <Icon name="volume-up" />
              Edit Audio Source
            </div>
            
            {/* Audio Source Name */}
            <div className="gameboard-editor-field">
              <div className="gameboard-editor-label">Name</div>
              <input
                type="text"
                value={audioSource.name}
                onChange={(e) => {
                  updateAudioSource(audioSource.id, { name: e.target.value });
                }}
                onBlur={(e) => {
                  socketService.updateAudioSource(audioSource.id, { name: e.currentTarget.value });
                }}
                className="gameboard-editor-input"
              />
            </div>
            
            {/* Audio File Selector */}
            <div className="gameboard-editor-field">
              <div className="gameboard-editor-label">Audio File</div>
              <input
                type="file"
                accept="audio/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  
                  // Create FormData and upload
                  const formData = new FormData();
                  formData.append('files', file);
                  formData.append('category', 'ambience');
                  
                  try {
                    const response = await fetch('/api/upload-audio', {
                      method: 'POST',
                      body: formData,
                      credentials: 'include',
                    });
                    
                    if (response.ok) {
                      const data = await response.json();
                      // Handle the response format: { success: true, files: [{ path, filename, originalName }] }
                      const uploadedFile = data.files?.[0];
                      const audioUrl = uploadedFile?.path || data.url || data.path;
                      
                      if (audioUrl) {
                        // Update the audio source with the new file - start paused for user to manually play
                        updateAudioSource(audioSource.id, { audioFile: audioUrl, playing: false });
                        socketService.updateAudioSource(audioSource.id, { audioFile: audioUrl, playing: false });
                      } else {
                        console.error('No audio URL in response:', data);
                      }
                    } else {
                      console.error('Failed to upload audio file');
                    }
                  } catch (error) {
                    console.error('Error uploading audio file:', error);
                  }
                  
                  // Clear the input
                  e.target.value = '';
                }}
                className="gameboard-editor-input"
              />
              {audioSource.audioFile && (
                <div className="gameboard-editor-helper gameboard-editor-helper-break">
                  Current: {audioSource.audioFile.split('/').pop()}
                </div>
              )}
            </div>
            
            {/* Play/Pause */}
            <div className="gameboard-editor-field">
              <button
                onClick={() => {
                  const newPlaying = !audioSource.playing;
                  updateAudioSource(audioSource.id, { playing: newPlaying });
                  socketService.updateAudioSource(audioSource.id, { playing: newPlaying });
                }}
                className={`gameboard-audio-toggle-button ${audioSource.playing ? 'is-playing' : 'is-stopped'}`}
              >
                {audioSource.playing ? '⏸ Pause' : '▶ Play'}
              </button>
            </div>
            
            {/* Volume */}
            <div className="gameboard-editor-field">
              <div className="gameboard-editor-label">Volume: {Math.round(audioSource.baseVolume * 100)}%</div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={audioSource.baseVolume}
                onChange={(e) => {
                  const newVolume = parseFloat(e.target.value);
                  updateAudioSource(audioSource.id, { baseVolume: newVolume });
                }}
                onPointerUp={(e) => {
                  const value = parseFloat(e.currentTarget.value);
                  socketService.updateAudioSource(audioSource.id, { baseVolume: value });
                }}
                className="gameboard-editor-range"
              />
            </div>
            
            {/* Radius */}
            <div className="gameboard-editor-field">
              <div className="gameboard-editor-label">Radius: {audioSource.radius}px</div>
              <input
                type="range"
                min="0"
                max="2000"
                value={audioSource.radius}
                onChange={(e) => {
                  const newRadius = parseInt(e.target.value);
                  updateAudioSource(audioSource.id, { radius: newRadius });
                }}
                onPointerUp={(e) => {
                  const value = parseInt(e.currentTarget.value, 10);
                  socketService.updateAudioSource(audioSource.id, { radius: value });
                }}
                className="gameboard-editor-range"
              />
            </div>
            
            {/* Inner Radius */}
            <div className="gameboard-editor-field">
              <div className="gameboard-editor-label">Inner Radius: {audioSource.innerRadius}px</div>
              <input
                type="range"
                min="0"
                max="1000"
                value={audioSource.innerRadius}
                onChange={(e) => {
                  const newInnerRadius = parseInt(e.target.value);
                  updateAudioSource(audioSource.id, { innerRadius: newInnerRadius });
                }}
                onPointerUp={(e) => {
                  const value = parseInt(e.currentTarget.value, 10);
                  socketService.updateAudioSource(audioSource.id, { innerRadius: value });
                }}
                className="gameboard-editor-range"
              />
            </div>
            
            {/* Loop */}
            <div className="gameboard-editor-field">
              <label className="gameboard-editor-checkbox-row">
                <input
                  type="checkbox"
                  checked={audioSource.loop}
                  onChange={(e) => {
                    const newLoop = e.target.checked;
                    updateAudioSource(audioSource.id, { loop: newLoop });
                    socketService.updateAudioSource(audioSource.id, { loop: newLoop });
                  }}
                  className="gameboard-editor-checkbox"
                />
                Loop
              </label>
            </div>
            
            {/* Audio file info - shown if file is already set */}
            {audioSource.audioFile && (
              <div className="gameboard-editor-field gameboard-editor-file-info">
                <div className="gameboard-editor-label">Audio File:</div>
                <div className="gameboard-editor-helper gameboard-editor-helper-break">
                  {audioSource.audioFile.split('/').pop()}
                </div>
              </div>
            )}
            
            {/* Buttons */}
            <div className="gameboard-editor-action-row">
              <button
                onClick={() => {
                  socketService.deleteAudioSource(audioSource.id);
                  removeAudioSource(audioSource.id);
                  setAudioSourceEditorState(null);
                  setSelectedAudioSourceIds([]);
                }}
                className="gameboard-editor-action-button gameboard-editor-action-button-danger"
              >
                Delete
              </button>
              <button
                onClick={() => setAudioSourceEditorState(null)}
                className="gameboard-editor-action-button gameboard-editor-action-button-secondary"
              >
                Close
              </button>
            </div>
          </div>
        );
      })()}

      {/* Combat Toggle Popup */}
      {combatEditorState && (() => {
        const token = tokens.find(t => t.id === combatEditorState!.tokenId);
        if (!token) return null;
        
        // Use already destructured values from useGameStore at top of component
        const inCombat = isTokenInCombat(token.id);
        
        return (
          <div
            className="token-panel token-panel-combat gameboard-token-panel-padded"
            style={{
              left: combatEditorState.position.x,
              top: combatEditorState.position.y + 20,
              zIndex: 1000,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="token-panel-title gameboard-token-panel-title-centered">
              Combat Tracker
            </div>
            <div className="token-panel-label gameboard-token-panel-message">
              {inCombat ? 'Remove from combat?' : 'Add to combat?'}
            </div>
            <div className="token-panel-flex-row gameboard-token-panel-actions">
              <button
                onClick={() => {
                  const tokenName = token.label || token.name || 'Unknown';
                  if (inCombat) {
                    removeCombatant(token.id);
                  } else {
                    addCombatant(token.id, tokenName);
                  }
                  setCombatEditorState(null);
                }}
                className={`token-panel-button gameboard-token-panel-action-fill ${inCombat ? 'token-panel-button-danger' : ''}`}
              >
                {inCombat ? 'Remove' : 'Add'}
              </button>
              <button
                onClick={() => setCombatEditorState(null)}
                className="token-panel-button gameboard-token-panel-action-fill"
              >
                Cancel
              </button>
            </div>
          </div>
        );
      })()}

      {/* Aura Editor Modal */}
      {auraEditorState && (() => {
        const token = tokens.find(t => t.id === auraEditorState.tokenId);
        if (!token) return null;
        
        return (
          <AuraSettingsModal 
            token={token} 
            position={auraEditorState.position}
            onClose={() => setAuraEditorState(null)} 
          />
        );
      })()}

      {/* Pending Drop Type Selection Modal */}
      {pendingDropType && (
        <div
          className="drop-type-modal"
          style={{
            left: appRef.current?.stage ? appRef.current.stage.toGlobal({ x: pendingDropType.x, y: 0 }).x : '50%',
            top: appRef.current?.stage ? appRef.current.stage.toGlobal({ x: 0, y: pendingDropType.y }).y : '50%',
          }}
        >
          <div className="drop-type-modal-title">
            What would you like to add?
          </div>
          <div className="drop-type-modal-buttons">
            <button
              className="drop-type-modal-btn"
              onClick={() => {
                if (currentBoard)
                  socketService.createToken(currentBoard.id, {
                    name: 'Token',
                    imageUrl: pendingDropType.imageUrl,
                    x: pendingDropType.x,
                    y: pendingDropType.y,
                    size: 1,
                    showLabel: defaultShowTokenName || undefined,
                    bars: defaultShowPlayerHp ? JSON.stringify([{ name: 'HP', current: 10, max: 10, color: DEFAULT_HP_BAR_COLOR }]) : undefined,
                  });
                setPendingDropType(null);
              }}
            >
              <Icon name="theater-masks" /> Token
            </button>
            <button
              className="drop-type-modal-btn"
              onClick={() => {
                if (currentBoard)
                  socketService.setBackground(currentBoard.id, pendingDropType.imageUrl);
                setPendingDropType(null);
              }}
            >
              <Icon name="image" /> Background
            </button>
            <button
              className="drop-type-modal-btn"
              onClick={() => {
                if (currentBoard)
                  socketService.createToken(currentBoard.id, {
                    name: 'Tile',
                    imageUrl: pendingDropType.imageUrl,
                    x: pendingDropType.x,
                    y: pendingDropType.y,
                    size: 1,
                    showLabel: defaultShowTokenName || undefined,
                    bars: defaultShowPlayerHp ? JSON.stringify([{ name: 'HP', current: 10, max: 10, color: DEFAULT_HP_BAR_COLOR }]) : undefined,
                  });
                setPendingDropType(null);
              }}
            >
              <Icon name="border-all" /> Tile
            </button>
          </div>
          <button
            className="drop-type-modal-cancel"
            onClick={() => setPendingDropType(null)}
          >
            Cancel
          </button>
        </div>
      )}
      
      {/* 3D Dice Roller Overlay - moved to ChatPanel */}
    </div>
    </>
  );
}
