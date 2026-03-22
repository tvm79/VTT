import { create } from 'zustand';
import type {
  User,
  Session,
  Board,
  Token,
  FogReveal,
  FogAdd,
  Light,
  AudioSource,
  ChatMessage,
  PlayerRole,
  ColorScheme,
  DiceRollResult,
} from '../../../shared/src/index';
import { DEFAULT_COLOR_SCHEMES } from '../../../shared/src/index';
import { TIME, DEFAULT_GAME_START_TIME, VISUAL_OPTIONS } from '../utils/gameTime';
import type { Combatant } from '../types/Combatant';
import { damage, heal, setHP } from '../utils/hpLogic';
import { TokenDisposition } from '../utils/colorUtils';
import {
  startCombat as startEncounterCombat,
  nextTurn as getNextTurn,
  previousTurn as getPreviousTurn,
} from '../utils/turnLogic';
import type { RollTable } from '../macros/types';

// LocalStorage key for saving color scheme
const COLOR_SCHEME_STORAGE_KEY = 'vtt-color-scheme';

// Helper to load color scheme from localStorage
const loadSavedColorScheme = (): ColorScheme | null => {
  try {
    const saved = localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved) as ColorScheme;
    }
  } catch (e) {
    console.warn('Failed to load saved color scheme:', e);
  }
  return null;
};

// Helper to save color scheme to localStorage
const saveColorSchemeToStorage = (scheme: ColorScheme): void => {
  try {
    localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, JSON.stringify(scheme));
  } catch (e) {
    console.warn('Failed to save color scheme:', e);
  }
};

// AudioPlaylist interface for custom playlists
export interface AudioPlaylist {
  id: string;
  name: string;
  icon: string;
  tracks: Array<{
    id: string;
    name: string;
    file: string;
    loop?: boolean;
  }>;
  isCustom?: boolean;
  loopPlaylist?: boolean;
  shufflePlaylist?: boolean;
  repeatTrack?: boolean;
  // Audio channel routing: 'music' or 'environmental'
  channel?: 'music' | 'environmental';
}

export interface ActiveSheet {
  type: 'character' | 'creature' | 'journal' | 'spell' | 'item';
  id?: string;
  searchName?: string;
  tokenId?: string | null;
}

// LocalStorage key for custom playlists
const CUSTOM_PLAYLISTS_STORAGE_KEY = 'vtt-custom-playlists';
const ROLL_TABLES_STORAGE_KEY = 'vtt-rolltables-v1';

// Helper to load custom playlists from localStorage
const loadSavedCustomPlaylists = (): AudioPlaylist[] => {
  try {
    const saved = localStorage.getItem(CUSTOM_PLAYLISTS_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved) as AudioPlaylist[];
    }
  } catch (e) {
    console.warn('Failed to load custom playlists:', e);
  }
  return [];
};

// Helper to save custom playlists to localStorage
const saveCustomPlaylistsToStorage = (playlists: AudioPlaylist[]): void => {
  try {
    localStorage.setItem(CUSTOM_PLAYLISTS_STORAGE_KEY, JSON.stringify(playlists));
  } catch (e) {
    console.warn('Failed to save custom playlists:', e);
  }
};

const loadSavedRollTables = (): RollTable[] => {
  try {
    const saved = localStorage.getItem(ROLL_TABLES_STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed as RollTable[] : [];
  } catch (e) {
    console.warn('Failed to load roll tables:', e);
    return [];
  }
};

const saveRollTablesToStorage = (tables: RollTable[]): void => {
  try {
    localStorage.setItem(ROLL_TABLES_STORAGE_KEY, JSON.stringify(tables));
  } catch (e) {
    console.warn('Failed to save roll tables:', e);
  }
};

// Helper to load saved fade duration from localStorage
const loadSavedFadeDuration = (key: string, defaultValue: number): number => {
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (typeof parsed === 'number' && parsed >= 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load fade duration:', e);
  }
  return defaultValue;
};

// Helper to load saved channel volume from localStorage
const loadSavedChannelVolume = (key: string, defaultValue: number): number => {
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (typeof parsed === 'number' && parsed >= 0 && parsed <= 1) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load channel volume:', e);
  }
  return defaultValue;
};

// Default fade durations
const DEFAULT_FADE_IN_DURATION = 2;
const DEFAULT_FADE_OUT_DURATION = 2;

// Tween Animation Settings type
export type TweenEasingType = 'easeOutQuad' | 'easeInOutQuad' | 'easeInOutCubic' | 'easeOutCubic' | 'easeOutBack';

export interface TweenAnimationSettings {
  // Duration settings (in milliseconds)
  moveMin: number;
  moveMax: number;
  attack: number;
  damage: number;
  heal: number;
  miss: number;
  downed: number;
  selectPulse: number;
  // Easing function for each animation type
  moveEasing: TweenEasingType;
  attackEasing: TweenEasingType;
  damageEasing: TweenEasingType;
  healEasing: TweenEasingType;
  missEasing: TweenEasingType;
  downedEasing: TweenEasingType;
  selectEasing: TweenEasingType;
}

export interface ScreenShakeEventSettings {
  enabled: boolean;
  intensity: number;
}

export interface ScreenShakeSettings {
  enabled: boolean;
  durationMs: number;
  damage: ScreenShakeEventSettings;
  heal: ScreenShakeEventSettings;
  downed: ScreenShakeEventSettings;
  attack: ScreenShakeEventSettings;
  miss: ScreenShakeEventSettings;
}

type Dice3DQuality = 'off' | 'low' | 'high';
type Dice3DMaterial = 'plastic' | 'metal' | 'glass' | 'stone';
type Dice3DTheme = 'default' | 'rock' | 'smooth' | 'wooden' | 'blueGreenMetal' | 'rust' | 'gemstone' | 'gemstoneMarble' | 'diceOfRolling';
type Dice3DRollDirectionMode = 'random' | 'fixed';

export interface Dice3DRollArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Dice3DSettingsPersisted {
  color: string;
  material: Dice3DMaterial;
  theme: Dice3DTheme;
  size: number;
  rollForce: number;
  torque: number;
  scaleMultiplier: number;
  worldSizeMultiplier: number;
  startingHeightMultiplier: number;
  restitutionMultiplier: number;
  frictionMultiplier: number;
  lightIntensityMultiplier: number;
  shadowTransparencyMultiplier: number;
  torqueThrowCoupling: number;
  rollDirectionMode: Dice3DRollDirectionMode;
  rollDirectionDegrees: number;
  showBoundariesOverlay: boolean;
}

const DICE3D_SETTINGS_STORAGE_KEY = 'vtt-dice3d-settings';
const DEFAULT_DICE3D_SETTINGS: Dice3DSettingsPersisted = {
  color: '#ffffff',
  material: 'plastic',
  theme: 'default',
  size: 1,
  rollForce: 1,
  torque: 1,
  scaleMultiplier: 1,
  worldSizeMultiplier: 1,
  startingHeightMultiplier: 1,
  restitutionMultiplier: 1,
  frictionMultiplier: 1,
  lightIntensityMultiplier: 1,
  shadowTransparencyMultiplier: 1,
  torqueThrowCoupling: 0.75,
  rollDirectionMode: 'random',
  rollDirectionDegrees: 0,
  showBoundariesOverlay: false,
};

const clampNumber = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const loadSavedDice3DSettings = (): Dice3DSettingsPersisted => {
  try {
    const saved = localStorage.getItem(DICE3D_SETTINGS_STORAGE_KEY);
    if (!saved) return DEFAULT_DICE3D_SETTINGS;

    const parsed = JSON.parse(saved) as Partial<Dice3DSettingsPersisted>;
    const material = parsed.material;
    const theme = parsed.theme;
    const rollDirectionMode = parsed.rollDirectionMode;

    // Valid themes from /client/public/assets/dice-box/themes/
    const validThemes = [
      'default', 'rock', 'smooth', 'wooden', 'blueGreenMetal', 'rust',
      'gemstone', 'gemstoneMarble', 'diceOfRolling'
    ];

    return {
      color: typeof parsed.color === 'string' ? parsed.color : DEFAULT_DICE3D_SETTINGS.color,
      material:
        material === 'plastic' || material === 'metal' || material === 'glass' || material === 'stone'
          ? material
          : DEFAULT_DICE3D_SETTINGS.material,
      theme: typeof theme === 'string' && validThemes.includes(theme) ? theme : DEFAULT_DICE3D_SETTINGS.theme,
      size:
        typeof parsed.size === 'number' && Number.isFinite(parsed.size)
          ? clampNumber(parsed.size, 0.6, 1.4)
          : DEFAULT_DICE3D_SETTINGS.size,
      rollForce:
        typeof parsed.rollForce === 'number' && Number.isFinite(parsed.rollForce)
          ? clampNumber(parsed.rollForce, 0.5, 1.8)
          : DEFAULT_DICE3D_SETTINGS.rollForce,
      torque:
        typeof parsed.torque === 'number' && Number.isFinite(parsed.torque)
          ? clampNumber(parsed.torque, 0.5, 2)
          : DEFAULT_DICE3D_SETTINGS.torque,
      scaleMultiplier:
        typeof parsed.scaleMultiplier === 'number' && Number.isFinite(parsed.scaleMultiplier)
          ? clampNumber(parsed.scaleMultiplier, 0.6, 1.6)
          : DEFAULT_DICE3D_SETTINGS.scaleMultiplier,
      worldSizeMultiplier:
        typeof parsed.worldSizeMultiplier === 'number' && Number.isFinite(parsed.worldSizeMultiplier)
          ? clampNumber(parsed.worldSizeMultiplier, 0.6, 1.6)
          : DEFAULT_DICE3D_SETTINGS.worldSizeMultiplier,
      startingHeightMultiplier:
        typeof parsed.startingHeightMultiplier === 'number' && Number.isFinite(parsed.startingHeightMultiplier)
          ? clampNumber(parsed.startingHeightMultiplier, 0.6, 1.8)
          : DEFAULT_DICE3D_SETTINGS.startingHeightMultiplier,
      restitutionMultiplier:
        typeof parsed.restitutionMultiplier === 'number' && Number.isFinite(parsed.restitutionMultiplier)
          ? clampNumber(parsed.restitutionMultiplier, 0.4, 1.8)
          : DEFAULT_DICE3D_SETTINGS.restitutionMultiplier,
      frictionMultiplier:
        typeof parsed.frictionMultiplier === 'number' && Number.isFinite(parsed.frictionMultiplier)
          ? clampNumber(parsed.frictionMultiplier, 0.6, 1.4)
          : DEFAULT_DICE3D_SETTINGS.frictionMultiplier,
      lightIntensityMultiplier:
        typeof parsed.lightIntensityMultiplier === 'number' && Number.isFinite(parsed.lightIntensityMultiplier)
          ? clampNumber(parsed.lightIntensityMultiplier, 0.5, 1.8)
          : DEFAULT_DICE3D_SETTINGS.lightIntensityMultiplier,
      shadowTransparencyMultiplier:
        typeof parsed.shadowTransparencyMultiplier === 'number' && Number.isFinite(parsed.shadowTransparencyMultiplier)
          ? clampNumber(parsed.shadowTransparencyMultiplier, 0.5, 1.6)
          : DEFAULT_DICE3D_SETTINGS.shadowTransparencyMultiplier,
      torqueThrowCoupling:
        typeof parsed.torqueThrowCoupling === 'number' && Number.isFinite(parsed.torqueThrowCoupling)
          ? clampNumber(parsed.torqueThrowCoupling, 0.4, 1.4)
          : DEFAULT_DICE3D_SETTINGS.torqueThrowCoupling,
      rollDirectionMode: rollDirectionMode === 'fixed' || rollDirectionMode === 'random'
        ? rollDirectionMode
        : DEFAULT_DICE3D_SETTINGS.rollDirectionMode,
      rollDirectionDegrees:
        typeof parsed.rollDirectionDegrees === 'number' && Number.isFinite(parsed.rollDirectionDegrees)
          ? clampNumber(parsed.rollDirectionDegrees, 0, 360)
          : DEFAULT_DICE3D_SETTINGS.rollDirectionDegrees,
      showBoundariesOverlay:
        typeof parsed.showBoundariesOverlay === 'boolean'
          ? parsed.showBoundariesOverlay
          : DEFAULT_DICE3D_SETTINGS.showBoundariesOverlay,
    };
  } catch (e) {
    console.warn('Failed to load 3D dice settings:', e);
    return DEFAULT_DICE3D_SETTINGS;
  }
};

const saveDice3DSettingsToStorage = (settings: Dice3DSettingsPersisted): void => {
  try {
    localStorage.setItem(DICE3D_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save 3D dice settings:', e);
  }
};

// LocalStorage key for tween settings
const TWEEN_SETTINGS_STORAGE_KEY = 'vtt-tween-settings';
const SCREEN_SHAKE_SETTINGS_STORAGE_KEY = 'vtt-screen-shake-settings';

// Default tween settings (matching TOKEN_ANIMATION_DEFAULTS in TokenAnimationManager)
const DEFAULT_TWEEN_SETTINGS: TweenAnimationSettings = {
  moveMin: 160,
  moveMax: 420,
  attack: 180,
  damage: 140,
  heal: 220,
  miss: 160,
  downed: 260,
  selectPulse: 900,
  moveEasing: 'easeInOutCubic',
  attackEasing: 'easeOutCubic',
  damageEasing: 'easeOutCubic',
  healEasing: 'easeOutQuad',
  missEasing: 'easeOutQuad',
  downedEasing: 'easeOutQuad',
  selectEasing: 'easeOutBack',
};

const DEFAULT_SCREEN_SHAKE_SETTINGS: ScreenShakeSettings = {
  enabled: false,
  durationMs: 260,
  damage: { enabled: false, intensity: 0.6 },
  heal: { enabled: false, intensity: 0.35 },
  downed: { enabled: false, intensity: 1.0 },
  attack: { enabled: false, intensity: 0.3 },
  miss: { enabled: false, intensity: 0.2 },
};

// Helper to load timeline settings from localStorage
const loadSavedTimelineHeight = (): number => {
  try {
    const saved = localStorage.getItem('vtt-timeline-height');
    return saved ? parseInt(saved, 10) : 120;
  } catch {
    return 120;
  }
};

const loadSavedTimelinePosition = (): { x: number; y: number } => {
  try {
    const saved = localStorage.getItem('vtt-timeline-position');
    return saved ? JSON.parse(saved) : { x: 5, y: 0 };
  } catch {
    return { x: 5, y: 10 };
  }
};

// Helper to load playerListPanel position from localStorage
const loadSavedPlayerListPanelPosition = (): { x: number; y: number } => {
  try {
    const saved = localStorage.getItem('vtt-playerListPanel-position');
    return saved ? JSON.parse(saved) : { x: 10, y: 70 };
  } catch {
    return { x: 10, y: 70 };
  }
};

// Helper to load playerListPanel size from localStorage
const loadSavedPlayerListPanelSize = (): { width: number; height: number } => {
  try {
    const saved = localStorage.getItem('vtt-playerListPanel-size');
    return saved ? JSON.parse(saved) : { width: 220, height: 300 };
  } catch {
    return { width: 220, height: 300 };
  }
};

// Helper to load timeBar position from localStorage
const loadSavedTimeBarPosition = (): { x: number; y: number } => {
  try {
    const saved = localStorage.getItem('vtt-timeBar-position');
    return saved ? JSON.parse(saved) : { x: 260, y: 70 };
  } catch {
    return { x: 260, y: 70 };
  }
};

// Helper to load timeBar size from localStorage
const loadSavedTimeBarSize = (): { width: number; height: number } => {
  try {
    const saved = localStorage.getItem('vtt-timeBar-size');
    return saved ? JSON.parse(saved) : { width: 200, height: 70 };
  } catch {
    return { width: 200, height: 70 };
  }
};

// Helper to load tween settings from localStorage
const loadSavedTweenSettings = (): TweenAnimationSettings => {
  try {
    const saved = localStorage.getItem(TWEEN_SETTINGS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Validate and merge with defaults to ensure all fields exist
      return { ...DEFAULT_TWEEN_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to load tween settings:', e);
  }
  return DEFAULT_TWEEN_SETTINGS;
};

// Helper to save tween settings to localStorage
const saveTweenSettingsToStorage = (settings: TweenAnimationSettings): void => {
  try {
    localStorage.setItem(TWEEN_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save tween settings:', e);
  }
};

const clampShakeIntensity = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(2, value));
};

const sanitizeScreenShakeEvent = (
  input: Partial<ScreenShakeEventSettings> | undefined,
  fallback: ScreenShakeEventSettings
): ScreenShakeEventSettings => ({
  enabled: typeof input?.enabled === 'boolean' ? input.enabled : fallback.enabled,
  intensity: clampShakeIntensity(typeof input?.intensity === 'number' ? input.intensity : fallback.intensity),
});

const loadSavedScreenShakeSettings = (): ScreenShakeSettings => {
  try {
    const saved = localStorage.getItem(SCREEN_SHAKE_SETTINGS_STORAGE_KEY);
    if (!saved) return DEFAULT_SCREEN_SHAKE_SETTINGS;
    const parsed = JSON.parse(saved) as Partial<ScreenShakeSettings>;
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_SCREEN_SHAKE_SETTINGS.enabled,
      durationMs:
        typeof parsed.durationMs === 'number' && Number.isFinite(parsed.durationMs)
          ? Math.max(80, Math.min(1200, Math.round(parsed.durationMs)))
          : DEFAULT_SCREEN_SHAKE_SETTINGS.durationMs,
      damage: sanitizeScreenShakeEvent(parsed.damage, DEFAULT_SCREEN_SHAKE_SETTINGS.damage),
      heal: sanitizeScreenShakeEvent(parsed.heal, DEFAULT_SCREEN_SHAKE_SETTINGS.heal),
      downed: sanitizeScreenShakeEvent(parsed.downed, DEFAULT_SCREEN_SHAKE_SETTINGS.downed),
      attack: sanitizeScreenShakeEvent(parsed.attack, DEFAULT_SCREEN_SHAKE_SETTINGS.attack),
      miss: sanitizeScreenShakeEvent(parsed.miss, DEFAULT_SCREEN_SHAKE_SETTINGS.miss),
    };
  } catch (e) {
    console.warn('Failed to load screen shake settings:', e);
    return DEFAULT_SCREEN_SHAKE_SETTINGS;
  }
};

const saveScreenShakeSettingsToStorage = (settings: ScreenShakeSettings): void => {
  try {
    localStorage.setItem(SCREEN_SHAKE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save screen shake settings:', e);
  }
};

// LocalStorage key for token display defaults
const TOKEN_DISPLAY_DEFAULTS_KEY = 'vtt-token-display-defaults';

interface TokenDisplayDefaults {
  defaultShowTokenName: boolean;
  defaultShowPlayerHp: boolean;
  defaultShowOtherHp: boolean;
  defaultTokenDisposition: TokenDisposition | null;
  tokenHpSource: 'average' | 'rolled';
}

// Default token display defaults
const DEFAULT_TOKEN_DISPLAY_DEFAULTS: TokenDisplayDefaults = {
  defaultShowTokenName: false,
  defaultShowPlayerHp: false,
  defaultShowOtherHp: false,
  defaultTokenDisposition: null,
  tokenHpSource: 'average',
};

// Helper to load token display defaults from localStorage
const loadSavedTokenDisplayDefaults = (): TokenDisplayDefaults => {
  try {
    const saved = localStorage.getItem(TOKEN_DISPLAY_DEFAULTS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_TOKEN_DISPLAY_DEFAULTS, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to load token display defaults:', e);
  }
  return DEFAULT_TOKEN_DISPLAY_DEFAULTS;
};

// Helper to save token display defaults to localStorage
const saveTokenDisplayDefaultsToStorage = (settings: TokenDisplayDefaults): void => {
  try {
    localStorage.setItem(TOKEN_DISPLAY_DEFAULTS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save token display defaults:', e);
  }
};

// LocalStorage key for chat card defaults
const CHAT_CARD_DEFAULTS_KEY = 'vtt-chat-card-defaults';

// LocalStorage key for battle settings
const BATTLE_SETTINGS_KEY = 'vtt-battle-settings';

interface BattleSettings {
  turnTokenImageUrl: string | null;
}

const DEFAULT_BATTLE_SETTINGS: BattleSettings = {
  turnTokenImageUrl: null,
};

const loadSavedBattleSettings = (): BattleSettings => {
  try {
    const saved = localStorage.getItem(BATTLE_SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<BattleSettings>;
      return {
        turnTokenImageUrl:
          typeof parsed.turnTokenImageUrl === 'string' && parsed.turnTokenImageUrl.trim().length > 0
            ? parsed.turnTokenImageUrl
            : null,
      };
    }
  } catch (e) {
    console.warn('Failed to load battle settings:', e);
  }
  return DEFAULT_BATTLE_SETTINGS;
};

const saveBattleSettingsToStorage = (settings: BattleSettings): void => {
  try {
    localStorage.setItem(BATTLE_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save battle settings:', e);
  }
};

interface ChatCardDefaults {
  chatCardsCollapsedByDefault: boolean;
}

// Default chat card defaults
const DEFAULT_CHAT_CARD_DEFAULTS: ChatCardDefaults = {
  chatCardsCollapsedByDefault: false,
};

// Helper to load chat card defaults from localStorage
const loadSavedChatCardDefaults = (): ChatCardDefaults => {
  try {
    const saved = localStorage.getItem(CHAT_CARD_DEFAULTS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_CHAT_CARD_DEFAULTS, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to load chat card defaults:', e);
  }
  return DEFAULT_CHAT_CARD_DEFAULTS;
};

// Helper to save chat card defaults to localStorage
const saveChatCardDefaultsToStorage = (settings: ChatCardDefaults): void => {
  try {
    localStorage.setItem(CHAT_CARD_DEFAULTS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save chat card defaults:', e);
  }
};

// LocalStorage key for fog tools settings
const FOG_TOOLS_SETTINGS_KEY = 'vtt-fog-tools-settings';

interface FogToolsSettings {
  fogDrawMode: 'box' | 'polygon' | 'free' | 'grid' | 'pencil';
  gmFogOpacity: number;
  pencilSize: number;
  fogSnapToGrid: boolean;
}

// Default fog tools settings
const DEFAULT_FOG_TOOLS_SETTINGS: FogToolsSettings = {
  fogDrawMode: 'polygon',
  gmFogOpacity: 0.45,
  pencilSize: 30,
  fogSnapToGrid: true,
};

// Helper to load fog tools settings from localStorage
const loadSavedFogToolsSettings = (): FogToolsSettings => {
  try {
    const saved = localStorage.getItem(FOG_TOOLS_SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_FOG_TOOLS_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to load fog tools settings:', e);
  }
  return DEFAULT_FOG_TOOLS_SETTINGS;
};

// Helper to save fog tools settings to localStorage
const saveFogToolsSettingsToStorage = (settings: FogToolsSettings): void => {
  try {
    localStorage.setItem(FOG_TOOLS_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save fog tools settings:', e);
  }
};

// LocalStorage key for pencil settings
const PENCIL_SETTINGS_KEY = 'vtt-pencil-settings';

interface PencilSettings {
  smoothness: number;
  drawRate: number;
  fogColor: string;
}

// Default pencil settings
const DEFAULT_PENCIL_SETTINGS: PencilSettings = {
  smoothness: 16,
  drawRate: 2,
  fogColor: '#000000',
};

// Helper to load pencil settings from localStorage
const loadSavedPencilSettings = (): PencilSettings => {
  try {
    const saved = localStorage.getItem(PENCIL_SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_PENCIL_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to load pencil settings:', e);
  }
  return DEFAULT_PENCIL_SETTINGS;
};

// Helper to save pencil settings to localStorage
const savePencilSettingsToStorage = (settings: PencilSettings): void => {
  try {
    localStorage.setItem(PENCIL_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save pencil settings:', e);
  }
};

// LocalStorage key for key binding settings
const KEY_BINDING_SETTINGS_KEY = 'vtt-key-binding-settings';

interface KeyBindingSettings {
  focusOnSelectedKey: string;
}

// Default key binding settings
const DEFAULT_KEY_BINDING_SETTINGS: KeyBindingSettings = {
  focusOnSelectedKey: 'z',
};

// Helper to load key binding settings from localStorage
const loadSavedKeyBindingSettings = (): KeyBindingSettings => {
  try {
    const saved = localStorage.getItem(KEY_BINDING_SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_KEY_BINDING_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to load key binding settings:', e);
  }
  return DEFAULT_KEY_BINDING_SETTINGS;
};

// Helper to save key binding settings to localStorage
const saveKeyBindingSettingsToStorage = (settings: KeyBindingSettings): void => {
  try {
    localStorage.setItem(KEY_BINDING_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save key binding settings:', e);
  }
};

// LocalStorage key for particle emitter settings
const PARTICLE_EMITTER_SETTINGS_KEY = 'vtt-particle-emitter-settings';

interface ParticleEmitterSettings {
  particlePreset: string;
  particleEmitterSize: number;
  particleInspectorWidth: number;
}

interface MapBleedSettings {
  enabled: boolean;
  feather: number;
  blur: number;
  vignette: number;
  scale: number;
}

const MAP_BLEED_SETTINGS_KEY = 'vtt-map-bleed-settings';

const DEFAULT_MAP_BLEED_SETTINGS: MapBleedSettings = {
  enabled: true,
  feather: 180,
  blur: 14,
  vignette: 0.45,
  scale: 1.08,
};

const loadSavedMapBleedSettings = (): MapBleedSettings => {
  try {
    const saved = localStorage.getItem(MAP_BLEED_SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<MapBleedSettings>;
      return {
        enabled: parsed.enabled ?? DEFAULT_MAP_BLEED_SETTINGS.enabled,
        feather: Math.max(20, Math.min(480, Number(parsed.feather ?? DEFAULT_MAP_BLEED_SETTINGS.feather))),
        blur: Math.max(0, Math.min(80, Number(parsed.blur ?? DEFAULT_MAP_BLEED_SETTINGS.blur))),
        vignette: Math.max(0, Math.min(1, Number(parsed.vignette ?? DEFAULT_MAP_BLEED_SETTINGS.vignette))),
        scale: Math.max(1, Math.min(1.35, Number(parsed.scale ?? DEFAULT_MAP_BLEED_SETTINGS.scale))),
      };
    }
  } catch (e) {
    console.warn('Failed to load map bleed settings:', e);
  }
  return DEFAULT_MAP_BLEED_SETTINGS;
};

const saveMapBleedSettingsToStorage = (settings: MapBleedSettings): void => {
  try {
    localStorage.setItem(MAP_BLEED_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save map bleed settings:', e);
  }
};

// Default particle emitter settings
const DEFAULT_PARTICLE_EMITTER_SETTINGS: ParticleEmitterSettings = {
  particlePreset: 'DustStep',
  particleEmitterSize: 150,
  particleInspectorWidth: 230,
};

// Helper to load particle emitter settings from localStorage
const loadSavedParticleEmitterSettings = (): ParticleEmitterSettings => {
  try {
    const saved = localStorage.getItem(PARTICLE_EMITTER_SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_PARTICLE_EMITTER_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to load particle emitter settings:', e);
  }
  return DEFAULT_PARTICLE_EMITTER_SETTINGS;
};

// Helper to save particle emitter settings to localStorage
const saveParticleEmitterSettingsToStorage = (settings: ParticleEmitterSettings): void => {
  try {
    localStorage.setItem(PARTICLE_EMITTER_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save particle emitter settings:', e);
  }
};

// Scene interface for saving/loading scenes
export interface WeatherEffectConfig {
  id: string;
  type: 'none' | 'rain' | 'snow' | 'fog' | 'clouds' | 'fireflies' | 'embers' | 'sparkles' | 'hearts' | 'blizzard';
  enabled: boolean;
  intensity: number;
  speed: number;
  size: number;
  color: string;
  direction: number;
  wobble: number;
  wobbleAmplitude: number;
  particleShape?: 'circle' | 'star' | 'heart' | 'snowflake' | 'drop' | 'spark' | 'flare';
  customTextureUrl?: string;
  belowTokens: boolean;
  lifetime: number;
  opacity: number;
}

export type WeatherFilterType =
  | 'adjustment'
  | 'advancedBloom'
  | 'bulgePinch'
  | 'crt'
  | 'godray'
  | 'glitch'
  | 'kawaseBlur'
  | 'oldFilm'
  | 'pixelate'
  | 'rgbSplit'
  | 'reflection'
  | 'shockwave'
  | 'zoomBlur';

export interface WeatherFilterConfig {
  id: string;
  type: WeatherFilterType;
  enabled: boolean;
  settings: Record<string, number | boolean>;
}

export interface SceneParticleEmitterConfig {
  key: string;
  x: number;
  y: number;
  presetId: string;
  overrides?: Record<string, unknown>;
}

export interface Scene {
  id: string;
  name: string;
  boardId: string;
  tokens: Token[];
  lights: Light[];
  audioSources: AudioSource[];
  fogReveals: FogReveal[];
  fogAdds: FogAdd[];
  backgroundUrl: string | null;

  // Optional map bleed override (scene-specific)
  mapBleedOverrideEnabled?: boolean;
  mapBleedEnabled?: boolean;
  mapBleedFeather?: number;
  mapBleedBlur?: number;
  mapBleedVignette?: number;
  mapBleedScale?: number;

  backgroundColor: number;
  gridColor: number;
  gridSize: number;
  gridOffsetX: number;
  gridOffsetY: number;
  gridUnit: 'ft' | 'km' | 'miles';
  gridStyle?: 'solid' | 'dashed' | 'dotted';
  gridOpacity?: number;
  
  // Atmospheric fog settings
  atmosphericFog?: boolean;
  fogEnabled?: boolean;
  fogIntensity?: number;
  fogSpeed?: number;
  fogShift?: number;
  fogDirection?: number;
  fogColor1?: string;
  fogColor2?: string;
  
  // God ray settings
  godRayEnabled?: boolean;
  godRayAngle?: number;
  godRayLacunarity?: number;
  godRayGain?: number;
  godRayIntensity?: number;
  
  // Panning settings
  panFriction: number;
  panEnabled: boolean;
  
  // Token AC display mode
  tokenDisplayMode: 'always' | 'selected' | 'hover';
  
  // Single weather effect (legacy - keeping for backward compatibility)
  weatherType: 'none' | 'rain' | 'snow' | 'fog' | 'clouds' | 'fireflies' | 'embers' | 'sparkles' | 'hearts' | 'blizzard';
  weatherIntensity: number;
  weatherSpeed: number;
  weatherSize: number;
  weatherColor: string;
  weatherDirection: number;
  weatherWobble: number;
  weatherWobbleAmplitude: number;
  weatherParticleShape?: 'circle' | 'star' | 'heart' | 'snowflake' | 'drop' | 'spark' | 'flare';
  
  // Multiple weather effects - each can be active independently
  activeWeatherEffects: WeatherEffectConfig[];
  weatherFilterEffects?: WeatherFilterConfig[];
  manualParticleEmitters?: SceneParticleEmitterConfig[];
  
  // Battle/Combat state
  isInCombat?: boolean;
  combatants?: Combatant[];
  combatRound?: number;
  currentTurnIndex?: number;
  
  createdAt: Date;
}

function persistSceneWeatherFilterEffects(
  activeSceneId: string | null,
  scenes: Scene[],
  effects: WeatherFilterConfig[]
): Scene[] {
  if (!activeSceneId) return scenes;

  let matched = false;
  const updatedScenes = scenes.map((scene) => {
    if (scene.id !== activeSceneId) return scene;
    matched = true;
    return { ...scene, weatherFilterEffects: effects };
  });

  if (!matched) return scenes;

  try {
    const key = 'vtt_scenes';
    const storedScenes = JSON.parse(localStorage.getItem(key) || '[]') as Scene[];
    const updatedStoredScenes = storedScenes.map((scene) =>
      scene.id === activeSceneId ? { ...scene, weatherFilterEffects: effects } : scene
    );
    localStorage.setItem(key, JSON.stringify(updatedStoredScenes));
  } catch (e) {
    console.warn('Failed to autosave scene weather filter effects:', e);
  }

  return updatedScenes;
}

// Dice roll history interface
export interface DiceRoll {
  id: string;
  formula: string;
  total: number;
  rolls: number[];
  username: string;
  timestamp: Date;
  isPrivate: boolean;
}

const parseTokenBars = (barsRaw: string): Array<{ name: string; current: number; max: number; color: string }> => {
  if (!barsRaw) return [];

  try {
    const parsed = JSON.parse(barsRaw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseConditions = (statusRaw: string): Combatant['conditions'] => {
  if (!statusRaw) return [];

  try {
    const parsed = JSON.parse(statusRaw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
      .map((entry) => ({ name: entry, duration: 0 }));
  } catch {
    return [];
  }
};

const normalizeCombatantType = (value: unknown): Combatant['type'] => {
  if (value === 'player' || value === 'enemy' || value === 'npc') {
    return value;
  }

  return 'enemy';
};

const buildCombatantFromToken = (token: Token, fallbackName: string): Combatant => {
  const tokenProps = (token.properties || {}) as Record<string, unknown>;
  const bars = parseTokenBars(token.bars);
  const hpBar = bars.find((bar) => bar.name.toLowerCase() === 'hp');
  const hpMax = hpBar?.max && hpBar.max > 0 ? hpBar.max : 10;
  const hpCurrent = hpBar?.current ?? hpMax;

  return {
    id: token.id,
    tokenId: token.id,
    name: token.label || token.name || fallbackName,
    portrait: token.imageUrl || null,
    type: normalizeCombatantType(tokenProps.combatType),
    level: typeof tokenProps.level === 'number' ? tokenProps.level : 1,
    initiative: typeof tokenProps.initiative === 'number' ? tokenProps.initiative : 10,
    hp_current: Math.max(0, Math.min(hpCurrent, hpMax)),
    hp_max: hpMax,
    ac: typeof tokenProps.ac === 'number' ? tokenProps.ac : 10,
    movement: typeof tokenProps.movement === 'number' ? tokenProps.movement : 30,
    spell_dc: typeof tokenProps.spell_dc === 'number' ? tokenProps.spell_dc : 10,
    conditions: parseConditions(token.status),
  };
};

interface GameState {
  // User state
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;
  userProfileImage: string | null;
  playerProfileImages: Record<string, string>;  // Map of userId -> profile picture URL
  playerColor: string;

  // Session state
  session: Session | null;
  players: Session['players'];
  currentBoard: Board | null;
  tokens: Token[];
  fogReveals: FogReveal[];
  fogAdds: FogAdd[];
  lights: Light[];
  audioSources: AudioSource[];
  chatMessages: ChatMessage[];
  chatVisible: boolean;

  // Combat state
  isInCombat: boolean;
  combatants: Combatant[];
  combatTrackerPosition: { x: number; y: number };
  combatTrackerSize: { width: number; height: number };
  combatTrackerVisible: boolean;
  combatRound: number;
  currentTurnIndex: number;
  selectedCombatantId: string | null;

  // D&D Data Manager state
  dndManagerPosition: { x: number; y: number };
  dndManagerSize: { width: number; height: number };
  dndManagerVisible: boolean;
  
  activeSheet: ActiveSheet | null;

  // Selected creature in DataManager (single-click on token)
  dataManagerSelectedCreatureId: string | null;
  dataManagerSelectedCreatureSearchName: string | null;

  // File Browser state
  fileBrowserVisible: boolean;
  fileBrowserPosition: { x: number; y: number };
  fileBrowserSize: { width: number; height: number };
  fileBrowserSelectCallback: ((fileUrl: string) => void) | null;
  setFileBrowserPosition: (position: { x: number; y: number }) => void;
  setFileBrowserSize: (size: { width: number; height: number }) => void;
  setFileBrowserSelectCallback: (callback: ((fileUrl: string) => void) | null) => void;

  // Profile Panel state
  profilePanelVisible: boolean;
  profilePanelPosition: { x: number; y: number };
  profilePanelSize: { width: number; height: number };

  // Scene Manager state
  sceneManagerVisible: boolean;
  activeSceneId: string | null;
  scenes: Scene[];
  sceneParticleEmitters: SceneParticleEmitterConfig[];
  sceneManagerPosition: { x: number; y: number };
  sceneManagerSize: { width: number; height: number };

  // Dice Roller state
  diceRollerVisible: boolean;
  diceRollHistory: DiceRoll[];
  diceRollerPosition: { x: number; y: number };
  diceRollerSize: { width: number; height: number };
  setDiceRollerPosition: (position: { x: number; y: number }) => void;
  setDiceRollerSize: (size: { width: number; height: number }) => void;

  // Macros state
  macrosVisible: boolean;
  macrosPanelPosition: { x: number; y: number };
  macrosPanelSize: { width: number; height: number };
  rollTables: RollTable[];
  rollTablePanelVisible: boolean;
  rollTablePanelPosition: { x: number; y: number };
  rollTablePanelSize: { width: number; height: number };
  setMacrosPanelPosition: (position: { x: number; y: number }) => void;
  setMacrosPanelSize: (size: { width: number; height: number }) => void;
  setRollTablePanelPosition: (position: { x: number; y: number }) => void;
  setRollTablePanelSize: (size: { width: number; height: number }) => void;
  setRollTables: (tables: RollTable[] | ((prev: RollTable[]) => RollTable[])) => void;
  addRollTable: (table: RollTable) => void;
  updateRollTable: (tableId: string, updates: Partial<RollTable>) => void;
  deleteRollTable: (tableId: string) => void;

  // Audio Panel state
  audioPanelVisible: boolean;
  audioPanelPosition: { x: number; y: number };
  audioPanelSize: { width: number; height: number };
  setAudioPanelPosition: (position: { x: number; y: number }) => void;
  setAudioPanelSize: (size: { width: number; height: number }) => void;

  // Player List Panel state
  playerListPanelPosition: { x: number; y: number };
  playerListPanelSize: { width: number; height: number };
  setPlayerListPanelPosition: (position: { x: number; y: number }) => void;
  setPlayerListPanelSize: (size: { width: number; height: number }) => void;

  // Global Audio state (persists when panel is closed)
  currentAudioTrack: string | null;
  currentAudioFile: string | null;
  isAudioPlaying: boolean;
  audioVolume: number;
  setCurrentAudioTrack: (trackId: string | null, fileName: string | null) => void;
  setIsAudioPlaying: (playing: boolean) => void;
  setAudioVolume: (volume: number) => void;

  // Audio channel volumes (persisted to localStorage)
  masterVolume: number;
  musicVolume: number;
  environmentVolume: number;
  uiVolume: number;
  setMasterVolume: (volume: number) => void;
  setMusicVolume: (volume: number) => void;
  setEnvironmentVolume: (volume: number) => void;
  setUiVolume: (volume: number) => void;
  
  // Custom Audio Playlists (persisted to localStorage)
  customPlaylists: AudioPlaylist[];
  setCustomPlaylists: (playlists: AudioPlaylist[] | ((prev: AudioPlaylist[]) => AudioPlaylist[])) => void;
  
  // Global default fade settings (persisted to localStorage)
  defaultFadeInDuration: number;
  defaultFadeOutDuration: number;
  setDefaultFadeInDuration: (duration: number) => void;
  setDefaultFadeOutDuration: (duration: number) => void;

  // Spatial audio fade duration (persisted to localStorage)
  audioFadeInDuration: number;
  audioFadeOutDuration: number;
  setAudioFadeInDuration: (duration: number) => void;
  setAudioFadeOutDuration: (duration: number) => void;

  // Tween Animation Settings (persisted to localStorage)
  tweenSettings: TweenAnimationSettings;
  setTweenSettings: (settings: Partial<TweenAnimationSettings>) => void;

  // Screen Shake Settings (persisted to localStorage)
  screenShakeSettings: ScreenShakeSettings;
  setScreenShakeSettings: (settings: Partial<ScreenShakeSettings>) => void;

  // GM and selection state
  isGM: boolean;
  selectedTokenId: string | null;
  selectedTokenIds: string[];
  isDragging: boolean;
  tool: 'select' | 'token' | 'fog' | 'measure' | 'light' | 'audio' | 'move' | 'particle';
  measurementShape: 'ray' | 'cone' | 'circle' | 'rectangle';
  measurements: Array<{
    id: string;
    shape: 'ray' | 'cone' | 'circle' | 'rectangle';
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    color: number;
  }>;
  selectableTypes: ('token' | 'light' | 'audio' | 'particle')[];
  showMoveMeasure: boolean;
  squareValue: number;

  // Grid settings
  gridEditMode: boolean;
  backgroundColor: number;
  gridColor: number;

  // Map bleed defaults (persisted to localStorage)
  mapBleedEnabled: boolean;
  mapBleedFeather: number;
  mapBleedBlur: number;
  mapBleedVignette: number;
  mapBleedScale: number;

  // Optional per-scene runtime override (saved in scenes)
  sceneMapBleedOverrideEnabled: boolean;
  sceneMapBleedEnabled: boolean;
  sceneMapBleedFeather: number;
  sceneMapBleedBlur: number;
  sceneMapBleedVignette: number;
  sceneMapBleedScale: number;
  gridSize: number;
  gridOffsetX: number;
  gridOffsetY: number;
  gridUnit: 'ft' | 'km' | 'miles';
  gridStyle: 'solid' | 'dashed' | 'dotted';
  gridOpacity: number;
  
  // Panning settings
  panFriction: number;
  panEnabled: boolean;

  // Token AC display mode
  tokenDisplayMode: 'always' | 'selected' | 'hover';

  // Key binding settings (persisted to localStorage)
  focusOnSelectedKey: string;

  // Token display defaults
  defaultShowTokenName: boolean;
  defaultShowPlayerHp: boolean;
  defaultShowOtherHp: boolean;
  defaultTokenDisposition: TokenDisposition | null;
  tokenHpSource: 'average' | 'rolled';

  // Chat card defaults
  chatCardsCollapsedByDefault: boolean;

  // Battle settings
  turnTokenImageUrl: string | null;

  // Feature flags
  dice3dEnabled: boolean;
  dice3dQuality: Dice3DQuality;
  dice3dRollArea: Dice3DRollArea;
  dice3dColor: string;
  dice3dMaterial: Dice3DMaterial;
  dice3dTheme: Dice3DTheme;
  dice3dSize: number;
  dice3dRollForce: number;
  dice3dTorque: number;
  dice3dScaleMultiplier: number;
  dice3dWorldSizeMultiplier: number;
  dice3dStartingHeightMultiplier: number;
  dice3dRestitutionMultiplier: number;
  dice3dFrictionMultiplier: number;
  dice3dLightIntensityMultiplier: number;
  dice3dShadowTransparencyMultiplier: number;
  dice3dTorqueThrowCoupling: number;
  dice3dRollDirectionMode: Dice3DRollDirectionMode;
  dice3dRollDirectionDegrees: number;
  dice3dShowBoundariesOverlay: boolean;

  // Latest authoritative dice result from socket pipeline
  lastAuthoritativeDiceRoll: DiceRollResult | null;

  // Fog tools settings (persisted to localStorage)
  fogDrawMode: 'box' | 'polygon' | 'free' | 'grid' | 'pencil';
  gmFogOpacity: number;
  pencilSize: number;
  fogSnapToGrid: boolean;

  // Pencil settings (persisted to localStorage)
  pencilSmoothness: number;
  pencilDrawRate: number;
  pencilFogColor: string;

  // Particle emitter settings (persisted to localStorage)
  particlePreset: string;
  particleEmitterSize: number;
  particleInspectorWidth: number;
  particleEmitterVisible: boolean;
  particleEmitterPosition: { x: number; y: number };
  particleEmitterSizeState: { width: number; height: number };

  // Setter functions for fog tools settings
  setFogDrawMode: (mode: 'box' | 'polygon' | 'free' | 'grid' | 'pencil') => void;
  setGmFogOpacity: (opacity: number) => void;
  setPencilSize: (size: number) => void;
  setFogSnapToGrid: (snapToGrid: boolean) => void;

  // Setter functions for pencil settings
  setPencilSmoothness: (smoothness: number) => void;
  setPencilDrawRate: (drawRate: number) => void;
  setPencilFogColor: (fogColor: string) => void;

  // Setter functions for particle emitter settings
  setParticlePreset: (preset: string) => void;
  setParticleEmitterSize: (size: number) => void;
  setParticleInspectorWidth: (width: number) => void;
  setParticleEmitterVisible: (visible: boolean) => void;
  toggleParticleEmitter: () => void;
  setParticleEmitterPosition: (position: { x: number; y: number }) => void;
  setParticleEmitterSizeState: (size: { width: number; height: number }) => void;

  // UI state
  toolbarWidth: number;
  toolbarHeight: number;
  headerHeight: number;
  chatPanelWidth: number;
  chatPanelHeight: number;
  dragMode: 'none' | 'token' | 'background' | 'tiles';
  tokenContextMenu: { x: number; y: number; tokenId: string } | null;
  pendingDropType: { x: number; y: number; imageUrl: string } | null;
  colorScheme: ColorScheme;
  statusIconColor: string;
  boxSelectionColor: string;
  boxSelectionBgColor: string;
  
  // Weather effects state
  weatherVisible: boolean;
  weatherType: 'none' | 'rain' | 'snow' | 'fog' | 'clouds' | 'fireflies' | 'embers' | 'sparkles' | 'hearts' | 'blizzard';
  weatherIntensity: number;
  weatherSpeed: number;
  weatherSize: number;
  weatherColor: string;
  weatherTextureUrl: string;
  weatherOpacity: number; // 0-1 for particle alpha
  weatherCustomTextures: Record<string, string>; // Custom texture URLs per weather type
  weatherDirection: number;
  weatherWobble: number;
  weatherWobbleAmplitude: number;
  weatherParticleShape?: 'circle' | 'star' | 'heart' | 'snowflake' | 'drop' | 'spark' | 'flare';
  activeWeatherEffects: WeatherEffectConfig[];
  weatherFilterEffects: WeatherFilterConfig[];
  setWeatherType: (type: 'none' | 'rain' | 'snow' | 'fog' | 'clouds' | 'fireflies' | 'embers' | 'sparkles' | 'hearts' | 'blizzard') => void;
  setWeatherIntensity: (intensity: number) => void;
  setWeatherSpeed: (speed: number) => void;
  setWeatherSize: (size: number) => void;
  setWeatherColor: (color: string) => void;
  setWeatherTextureUrl: (url: string) => void;
  setWeatherOpacity: (opacity: number) => void;
  setWeatherCustomTexture: (weatherType: string, url: string) => void;
  setWeatherDirection: (direction: number) => void;
  setWeatherWobble: (wobble: number) => void;
  setWeatherWobbleAmplitude: (amplitude: number) => void;
  setWeatherParticleShape: (shape?: 'circle' | 'star' | 'heart' | 'snowflake' | 'drop' | 'spark' | 'flare') => void;
  toggleWeather: () => void;
  setActiveWeatherEffects: (effects: WeatherEffectConfig[]) => void;
  setWeatherFilterEffects: (effects: WeatherFilterConfig[]) => void;
  updateWeatherFilterEffect: (id: string, updates: Partial<WeatherFilterConfig>) => void;
  updateWeatherEffect: (id: string, updates: Partial<WeatherEffectConfig>) => void;
  addWeatherEffect: (effect: WeatherEffectConfig) => void;
  removeWeatherEffect: (id: string) => void;
  
  // Game Time state
  gameTimeSeconds: number;
  gameTimeVisible: boolean;
  timeOverlayEnabled: boolean;
  timeOverlayOpacity: number;
  // Time bar position and size
  timeBarPosition: { x: number; y: number };
  timeBarSize: { width: number; height: number };
  // Timeline position and anchor
  timelinePosition: { x: number; y: number };
  timelineAnchor: 'top' | 'bottom';
  timelineBottomOffset: number;
  timelineStretched: boolean;
  timelineHeight: number;
  advanceTime: (delta: number) => void;
  setGameTime: (seconds: number) => void;
  toggleGameTime: () => void;
  setTimeOverlayEnabled: (enabled: boolean) => void;
  setTimeOverlayOpacity: (opacity: number) => void;
  setTimeBarPosition: (position: { x: number; y: number }) => void;
  setTimeBarSize: (size: { width: number; height: number }) => void;
  setTimelinePosition: (position: { x: number; y: number }) => void;
  setTimelineAnchor: (anchor: 'top' | 'bottom') => void;
  setTimelineBottomOffset: (offset: number) => void;
  setTimelineStretched: (stretched: boolean) => void;
  setTimelineHeight: (height: number) => void;
  
  // Floating item panels state (independent of Data Manager)
  floatingPanels: Array<{
    id: string;
    item: any;
    originalItem?: any;
    position: { x: number; y: number };
    size: { width: number; height: number };
    isEditing: boolean;
    isDirty?: boolean;
    isSaving?: boolean;
    saveError?: string | null;
    lastSavedAt?: number | null;
    collapsedSections?: Record<string, boolean>;
    activeTab?: string;
    actionSearch?: string;
    actionFilter?: string;
  }>;
  setFloatingPanels: (panels: Array<{id: string; item: any; originalItem?: any; position: { x: number; y: number }; size: { width: number; height: number }; isEditing: boolean; isDirty?: boolean; isSaving?: boolean; saveError?: string | null; lastSavedAt?: number | null; collapsedSections?: Record<string, boolean>; activeTab?: string; actionSearch?: string; actionFilter?: string}>) => void;
  addFloatingPanel: (panel: {id: string; item: any; originalItem?: any; position: { x: number; y: number }; size: { width: number; height: number }; isEditing: boolean; isDirty?: boolean; isSaving?: boolean; saveError?: string | null; lastSavedAt?: number | null; collapsedSections?: Record<string, boolean>; activeTab?: string; actionSearch?: string; actionFilter?: string}) => void;
  updateFloatingPanel: (id: string, updates: Partial<{id: string; item: any; originalItem?: any; position: { x: number; y: number }; size: { width: number; height: number }; isEditing: boolean; isDirty?: boolean; isSaving?: boolean; saveError?: string | null; lastSavedAt?: number | null; collapsedSections?: Record<string, boolean>; activeTab?: string; actionSearch?: string; actionFilter?: string}>) => void;
  removeFloatingPanel: (id: string) => void;

  // Actions
  setUser: (user: User | null, token?: string) => void;
  setUserProfileImage: (imageUrl: string | null) => void;
  setPlayerProfileImage: (userId: string, imageUrl: string) => void;
  setPlayerColor: (color: string) => void;
  logout: () => void;

  setSession: (session: Session | null) => void;
  setCurrentBoard: (board: Board | null) => void;
  updateCurrentBoard: (board: Board) => void;
  setPlayers: (players: Session['players']) => void;

  addToken: (token: Token) => void;
  updateToken: (tokenId: string, updates: Partial<Token>) => void;
  removeToken: (tokenId: string) => void;
  setTokens: (tokens: Token[]) => void;

  addFogReveal: (reveal: FogReveal) => void;
  removeFogReveal: (revealId: string) => void;
  clearFogReveals: () => void;
  setFogReveals: (reveals: FogReveal[]) => void;

  addFogAdd: (fogAdd: FogAdd) => void;
  removeFogAdd: (fogAddId: string) => void;
  clearFogAdds: () => void;
  setFogAdds: (fogAdds: FogAdd[]) => void;

  addChatMessage: (message: ChatMessage) => void;
  setChatMessages: (messages: ChatMessage[]) => void;
  setChatVisible: (visible: boolean) => void;
  toggleChat: () => void;

  setSelectedToken: (tokenId: string | null) => void;
  setSelectedTokenIds: (tokenIds: string[]) => void;
  setIsDragging: (isDragging: boolean) => void;
  setTool: (tool: GameState['tool']) => void;
  setSelectableTypes: (types: ('token' | 'light' | 'audio' | 'particle')[]) => void;
  toggleSelectableType: (type: 'token' | 'light' | 'audio' | 'particle') => void;
  setShowMoveMeasure: (show: boolean) => void;
  setSquareValue: (value: number) => void;
  setMeasurementShape: (shape: 'ray' | 'cone' | 'circle' | 'rectangle') => void;
  addMeasurement: (measurement: { id: string; shape: 'ray' | 'cone' | 'circle' | 'rectangle'; startX: number; startY: number; endX: number; endY: number; color: number }) => void;
  removeMeasurement: (id: string) => void;
  updateMeasurement: (id: string, updates: Partial<{ startX: number; startY: number; endX: number; endY: number }>) => void;
  clearMeasurements: () => void;
  setGridEditMode: (enabled: boolean) => void;
  setBackgroundColor: (color: number) => void;
  setGridColor: (color: number) => void;
  setGridSize: (size: number) => void;
  setGridOffsetX: (offset: number) => void;
  setGridOffsetY: (offset: number) => void;
  setGridUnit: (unit: 'ft' | 'km' | 'miles') => void;
  setGridStyle: (style: 'solid' | 'dashed' | 'dotted') => void;
  setGridOpacity: (opacity: number) => void;

  // Map bleed settings
  setMapBleedEnabled: (enabled: boolean) => void;
  setMapBleedFeather: (feather: number) => void;
  setMapBleedBlur: (blur: number) => void;
  setMapBleedVignette: (vignette: number) => void;
  setMapBleedScale: (scale: number) => void;
  setSceneMapBleedOverrideEnabled: (enabled: boolean) => void;
  setSceneMapBleedEnabled: (enabled: boolean) => void;
  setSceneMapBleedFeather: (feather: number) => void;
  setSceneMapBleedBlur: (blur: number) => void;
  setSceneMapBleedVignette: (vignette: number) => void;
  setSceneMapBleedScale: (scale: number) => void;

  setPanFriction: (friction: number) => void;
  setPanEnabled: (enabled: boolean) => void;
  setTokenDisplayMode: (mode: 'always' | 'selected' | 'hover') => void;
  setFocusOnSelectedKey: (key: string) => void;
  setDefaultShowTokenName: (show: boolean) => void;
  setDefaultShowPlayerHp: (show: boolean) => void;
  setDefaultShowOtherHp: (show: boolean) => void;
  setDefaultTokenDisposition: (disposition: TokenDisposition | null) => void;
  setTokenHpSource: (source: 'average' | 'rolled') => void;
  setChatCardsCollapsedByDefault: (collapsed: boolean) => void;
  setTurnTokenImageUrl: (url: string | null) => void;
  setToolbarWidth: (width: number) => void;
  setToolbarHeight: (height: number) => void;
  setHeaderHeight: (height: number) => void;
  setChatPanelWidth: (width: number) => void;
  setChatPanelHeight: (height: number) => void;
  setDragMode: (mode: GameState['dragMode']) => void;
  setTokenContextMenu: (menu: GameState['tokenContextMenu']) => void;
  setPendingDropType: (drop: GameState['pendingDropType']) => void;
  setColorScheme: (scheme: ColorScheme) => void;
  setStatusIconColor: (color: string) => void;
  setBoxSelectionColor: (color: string) => void;
  setBoxSelectionBgColor: (color: string) => void;

  // Combat actions
  setIsInCombat: (inCombat: boolean) => void;
  addCombatant: (tokenId: string, name: string) => void;
  removeCombatant: (tokenId: string) => void;
  setCombatantRoll: (tokenId: string, roll: number | null) => void;
  clearCombatants: () => void;
  isTokenInCombat: (tokenId: string) => boolean;
  setCombatTrackerPosition: (position: { x: number; y: number }) => void;
  setCombatTrackerSize: (size: { width: number; height: number }) => void;
  setCombatTrackerVisible: (visible: boolean) => void;
  toggleCombatTracker: () => void;
  setCombatantOrder: (tokenId: string, newIndex: number) => void;
  selectCombatant: (combatantId: string | null) => void;
  updateCombatantHp: (combatantId: string, amount: number, mode?: 'set' | 'damage' | 'heal') => void;
  nextTurn: () => void;
  previousTurn: () => void;
  setCurrentTurn: (index: number) => void;
  startCombat: () => void;
  endCombat: () => void;
  autoRollAllInitiative: () => void;

  // D&D Data Manager actions
  setDndManagerPosition: (position: { x: number; y: number }) => void;
  setDndManagerSize: (size: { width: number; height: number }) => void;
  setDndManagerVisible: (visible: boolean) => void;
  toggleDndManager: () => void;
  
  openSheet: (sheet: ActiveSheet) => void;
  closeSheet: () => void;

  // Select creature in DataManager (single-click on token)
  selectCreatureInDataManager: (creatureId: string) => void;
  selectCreatureInDataManagerByName: (name: string) => void;
  clearSelectedCreatureInDataManager: () => void;

  // File Browser actions
  setFileBrowserVisible: (visible: boolean) => void;
  toggleFileBrowser: () => void;

  // Profile Panel actions
  setProfilePanelVisible: (visible: boolean) => void;
  toggleProfilePanel: () => void;
  setProfilePanelPosition: (position: { x: number; y: number }) => void;
  setProfilePanelSize: (size: { width: number; height: number }) => void;
  centerProfilePanel: () => void;

  // Scene Manager actions
  setSceneManagerVisible: (visible: boolean) => void;
  toggleSceneManager: () => void;
  setSceneManagerPosition: (position: { x: number; y: number }) => void;
  setSceneManagerSize: (size: { width: number; height: number }) => void;
  saveScene: (name: string) => void;
  overwriteScene: (sceneId: string) => void;
  loadScene: (sceneId: string) => void;
  deleteScene: (sceneId: string) => void;
  setSceneParticleEmitters: (emitters: SceneParticleEmitterConfig[]) => void;
  setScenes: (scenes: Scene[]) => void;
  refreshScenes: () => void;
  loadLastSceneOnStartup: () => void;
  createNewScene: (name: string) => void;

  // Dice Roller actions
  setDiceRollerVisible: (visible: boolean) => void;
  toggleDiceRoller: () => void;
  addDiceRoll: (roll: DiceRoll) => void;
  clearDiceRollHistory: () => void;
  setDice3dEnabled: (enabled: boolean) => void;
  setDice3dQuality: (quality: Dice3DQuality) => void;
  setDice3dRollArea: (area: Dice3DRollArea) => void;
  setDice3dColor: (color: string) => void;
  setDice3dMaterial: (material: Dice3DMaterial) => void;
  setDice3dTheme: (theme: Dice3DTheme) => void;
  setDice3dSize: (size: number) => void;
  setDice3dRollForce: (force: number) => void;
  setDice3dTorque: (torque: number) => void;
  setDice3dScaleMultiplier: (value: number) => void;
  setDice3dWorldSizeMultiplier: (value: number) => void;
  setDice3dStartingHeightMultiplier: (value: number) => void;
  setDice3dRestitutionMultiplier: (value: number) => void;
  setDice3dFrictionMultiplier: (value: number) => void;
  setDice3dLightIntensityMultiplier: (value: number) => void;
  setDice3dShadowTransparencyMultiplier: (value: number) => void;
  setDice3dTorqueThrowCoupling: (value: number) => void;
  setDice3dRollDirectionMode: (mode: Dice3DRollDirectionMode) => void;
  setDice3dRollDirectionDegrees: (degrees: number) => void;
  setDice3dShowBoundariesOverlay: (show: boolean) => void;
  setLastAuthoritativeDiceRoll: (result: DiceRollResult | null) => void;

  // Macros actions
  setMacrosVisible: (visible: boolean) => void;
  toggleMacros: () => void;
  setRollTablePanelVisible: (visible: boolean) => void;
  toggleRollTablePanel: () => void;

  // Audio Panel actions
  setAudioPanelVisible: (visible: boolean) => void;
  toggleAudioPanel: () => void;

  // Panel focus - brings clicked panel to front
  panelFocus: string | null;
  setPanelFocus: (panel: string) => void;

  // Light actions
  addLight: (light: Light) => void;
  updateLight: (lightId: string, updates: Partial<Light>) => void;
  removeLight: (lightId: string) => void;
  setLights: (lights: Light[]) => void;

  // Audio source actions
  addAudioSource: (audioSource: AudioSource) => void;
  updateAudioSource: (audioSourceId: string, updates: Partial<AudioSource>) => void;
  removeAudioSource: (audioSourceId: string) => void;
  setAudioSources: (audioSources: AudioSource[]) => void;

  isUserGM: () => boolean;
}

export const useGameStore = create<GameState>((set, get) => ({
  ...(() => {
    const dice3d = loadSavedDice3DSettings();
    return {
      dice3dColor: dice3d.color,
      dice3dMaterial: dice3d.material,
      dice3dTheme: dice3d.theme,
      dice3dSize: dice3d.size,
      dice3dRollForce: dice3d.rollForce,
      dice3dTorque: dice3d.torque,
      dice3dScaleMultiplier: dice3d.scaleMultiplier,
      dice3dWorldSizeMultiplier: dice3d.worldSizeMultiplier,
      dice3dStartingHeightMultiplier: dice3d.startingHeightMultiplier,
      dice3dRestitutionMultiplier: dice3d.restitutionMultiplier,
      dice3dFrictionMultiplier: dice3d.frictionMultiplier,
      dice3dLightIntensityMultiplier: dice3d.lightIntensityMultiplier,
      dice3dShadowTransparencyMultiplier: dice3d.shadowTransparencyMultiplier,
      dice3dTorqueThrowCoupling: dice3d.torqueThrowCoupling,
      dice3dRollDirectionMode: dice3d.rollDirectionMode,
      dice3dRollDirectionDegrees: dice3d.rollDirectionDegrees,
      dice3dShowBoundariesOverlay: dice3d.showBoundariesOverlay,
    };
  })(),
  // Initial state
  user: null,
  isAuthenticated: false,
  token: null,
  userProfileImage: null,
  playerProfileImages: {},
  playerColor: '#ed8936',
  session: null,
  players: [],
  currentBoard: null,
  tokens: [],
  fogReveals: [],
  fogAdds: [],
  lights: [],
  audioSources: [],
  chatMessages: [],
  chatVisible: true,
  dice3dEnabled: true,
  dice3dQuality: 'low',
  dice3dRollArea: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
  lastAuthoritativeDiceRoll: null,
  isGM: false,
  selectedTokenId: null,
  selectedTokenIds: [],
  isDragging: false,
  tool: 'select',
  selectableTypes: ['token', 'light', 'audio', 'particle'],
  showMoveMeasure: false,
  measurementShape: 'ray',
  measurements: [],
  squareValue: 5,
  gridEditMode: false,
  backgroundColor: 0x1a1a2e,
  gridColor: 0x444444,
  mapBleedEnabled: loadSavedMapBleedSettings().enabled,
  mapBleedFeather: loadSavedMapBleedSettings().feather,
  mapBleedBlur: loadSavedMapBleedSettings().blur,
  mapBleedVignette: loadSavedMapBleedSettings().vignette,
  mapBleedScale: loadSavedMapBleedSettings().scale,
  sceneMapBleedOverrideEnabled: false,
  sceneMapBleedEnabled: loadSavedMapBleedSettings().enabled,
  sceneMapBleedFeather: loadSavedMapBleedSettings().feather,
  sceneMapBleedBlur: loadSavedMapBleedSettings().blur,
  sceneMapBleedVignette: loadSavedMapBleedSettings().vignette,
  sceneMapBleedScale: loadSavedMapBleedSettings().scale,
  gridSize: 50,
  gridOffsetX: 0,
  gridOffsetY: 0,
  gridUnit: 'ft',
  gridStyle: 'solid',
  gridOpacity: 0.55,
  panFriction: 0.92,
  panEnabled: true,
  tokenDisplayMode: 'hover',
  focusOnSelectedKey: loadSavedKeyBindingSettings().focusOnSelectedKey,
  defaultShowTokenName: loadSavedTokenDisplayDefaults().defaultShowTokenName,
  defaultShowPlayerHp: loadSavedTokenDisplayDefaults().defaultShowPlayerHp,
  defaultShowOtherHp: loadSavedTokenDisplayDefaults().defaultShowOtherHp,
  defaultTokenDisposition: loadSavedTokenDisplayDefaults().defaultTokenDisposition,
  tokenHpSource: loadSavedTokenDisplayDefaults().tokenHpSource,
  chatCardsCollapsedByDefault: loadSavedChatCardDefaults().chatCardsCollapsedByDefault,
  turnTokenImageUrl: loadSavedBattleSettings().turnTokenImageUrl,
  fogDrawMode: loadSavedFogToolsSettings().fogDrawMode,
  gmFogOpacity: loadSavedFogToolsSettings().gmFogOpacity,
  pencilSize: loadSavedFogToolsSettings().pencilSize,
  fogSnapToGrid: loadSavedFogToolsSettings().fogSnapToGrid,
  pencilSmoothness: loadSavedPencilSettings().smoothness,
  pencilDrawRate: loadSavedPencilSettings().drawRate,
  pencilFogColor: loadSavedPencilSettings().fogColor,
  particlePreset: loadSavedParticleEmitterSettings().particlePreset,
  particleEmitterSize: loadSavedParticleEmitterSettings().particleEmitterSize,
  particleInspectorWidth: loadSavedParticleEmitterSettings().particleInspectorWidth,
  particleEmitterVisible: false,
  particleEmitterPosition: { x: window.innerWidth / 2 - 400, y: 80 },
  particleEmitterSizeState: { width: 720, height: 520 },
  toolbarWidth: 60,
  toolbarHeight: 50,
  headerHeight: 70,
  chatPanelWidth: 300,
  chatPanelHeight: 0,
  dragMode: 'none' as const,
  tokenContextMenu: null,
  pendingDropType: null,
  colorScheme: loadSavedColorScheme() || DEFAULT_COLOR_SCHEMES[0],
  statusIconColor: '#ffffff',
  boxSelectionColor: '#ed8936',
  boxSelectionBgColor: 'rgba(237, 137, 54, 0.1)',
  weatherVisible: false,
  weatherType: 'none',
  weatherIntensity: 50,
  weatherSpeed: 50,
  weatherSize: 5,
  weatherColor: '#ffffff',
  weatherTextureUrl: '',
  weatherOpacity: 1,
  weatherCustomTextures: {},
  weatherDirection: 270,
  weatherWobble: 50,
  weatherWobbleAmplitude: 50,
  weatherParticleShape: undefined,
  activeWeatherEffects: [],
  weatherFilterEffects: [],
  floatingPanels: [],

  // Game Time state
  gameTimeSeconds: DEFAULT_GAME_START_TIME, // Start at 8:00 AM
  gameTimeVisible: false,
  timeOverlayEnabled: true,
  timeOverlayOpacity: 0.7,
  timeBarPosition: loadSavedTimeBarPosition(),
  timeBarSize: loadSavedTimeBarSize(),
  timelinePosition: loadSavedTimelinePosition(),
  timelineAnchor: 'top',
  timelineBottomOffset: 0,
  timelineStretched: true,
  timelineHeight: loadSavedTimelineHeight(),

  // Combat state
  isInCombat: false,
  combatants: [],
  combatTrackerPosition: { x: 250, y: 60 },
  combatTrackerSize: { width: 250, height: 400 },
  combatTrackerVisible: false,
  combatRound: 1,
  currentTurnIndex: 0,
  selectedCombatantId: null,

  // D&D Data Manager state
  dndManagerPosition: { x: window.innerWidth / 2 - 300, y: window.innerHeight / 2 - 350 },
  dndManagerSize: { width: 600, height: 700 },
  dndManagerVisible: false,
  
  activeSheet: null,

  // Selected creature in DataManager (single-click on token)
  dataManagerSelectedCreatureId: null,
  dataManagerSelectedCreatureSearchName: null,

  // File Browser
  fileBrowserVisible: false,
  fileBrowserPosition: { x: 100, y: 80 },
  fileBrowserSize: { width: 860, height: 620 },
  fileBrowserSelectCallback: null,

  // Profile Panel
  profilePanelVisible: false,
  profilePanelPosition: { x: window.innerWidth / 2 - 200, y: window.innerHeight / 2 - 425 },
  profilePanelSize: { width: 400, height: 850 },

  // Scene Manager
  sceneManagerVisible: false,
  activeSceneId: null,
  scenes: [],
  sceneParticleEmitters: [],
  sceneManagerPosition: { x: window.innerWidth / 2 - 300, y: window.innerHeight / 2 - 350 },
  sceneManagerSize: { width: 600, height: 700 },

  // Dice Roller
  diceRollerVisible: false,
  diceRollHistory: [],
  diceRollerPosition: { x: window.innerWidth / 2 - 250, y: 80 },
  diceRollerSize: { width: 500, height: 600 },

  // Macros
  macrosVisible: false,
  macrosPanelPosition: { x: window.innerWidth - 340, y: 70 },
  macrosPanelSize: { width: 320, height: 400 },
  rollTables: loadSavedRollTables(),
  rollTablePanelVisible: false,
  rollTablePanelPosition: { x: window.innerWidth - 700, y: 70 },
  rollTablePanelSize: { width: 340, height: 500 },

  // Audio Panel
  audioPanelVisible: false,
  audioPanelPosition: { x: window.innerWidth - 840, y: 70 },
  audioPanelSize: { width: 300, height: 400 },
  playerListPanelPosition: loadSavedPlayerListPanelPosition(),
  playerListPanelSize: loadSavedPlayerListPanelSize(),

  // Global Audio state
  currentAudioTrack: null,
  currentAudioFile: null,
  isAudioPlaying: false,
  audioVolume: 0.5,

  // Audio channel volumes (persisted to localStorage)
  masterVolume: loadSavedChannelVolume('vtt-master-volume', 1.0),
  musicVolume: loadSavedChannelVolume('vtt-music-volume', 1.0),
  environmentVolume: loadSavedChannelVolume('vtt-environment-volume', 1.0),
  uiVolume: loadSavedChannelVolume('vtt-ui-volume', 1.0),
  
  // Custom Audio Playlists (persisted to localStorage)
  customPlaylists: loadSavedCustomPlaylists(),
  
  // Global default fade settings (persisted to localStorage)
  defaultFadeInDuration: loadSavedFadeDuration('vtt-default-fade-in', DEFAULT_FADE_IN_DURATION),
  defaultFadeOutDuration: loadSavedFadeDuration('vtt-default-fade-out', DEFAULT_FADE_OUT_DURATION),
  setDefaultFadeInDuration: (duration: number) => {
    try {
      localStorage.setItem('vtt-default-fade-in', JSON.stringify(duration));
    } catch (e) {}
    set({ defaultFadeInDuration: duration });
  },
  setDefaultFadeOutDuration: (duration: number) => {
    try {
      localStorage.setItem('vtt-default-fade-out', JSON.stringify(duration));
    } catch (e) {}
    set({ defaultFadeOutDuration: duration });
  },

  // Spatial audio fade duration (persisted to localStorage)
  audioFadeInDuration: loadSavedFadeDuration('vtt-audio-fade-in', 1000),
  audioFadeOutDuration: loadSavedFadeDuration('vtt-audio-fade-out', 1000),
  setAudioFadeInDuration: (duration: number) => {
    try {
      localStorage.setItem('vtt-audio-fade-in', JSON.stringify(duration));
    } catch (e) {}
    set({ audioFadeInDuration: duration });
  },
  setAudioFadeOutDuration: (duration: number) => {
    try {
      localStorage.setItem('vtt-audio-fade-out', JSON.stringify(duration));
    } catch (e) {}
    set({ audioFadeOutDuration: duration });
  },

  // Tween Animation Settings (persisted to localStorage)
  tweenSettings: loadSavedTweenSettings(),
  setTweenSettings: (settings: Partial<TweenAnimationSettings>) => {
    const currentSettings = get().tweenSettings;
    const newSettings = { ...currentSettings, ...settings };
    saveTweenSettingsToStorage(newSettings);
    set({ tweenSettings: newSettings });
  },
  screenShakeSettings: loadSavedScreenShakeSettings(),
  setScreenShakeSettings: (settings: Partial<ScreenShakeSettings>) => {
    const current = get().screenShakeSettings;
    const next: ScreenShakeSettings = {
      enabled: typeof settings.enabled === 'boolean' ? settings.enabled : current.enabled,
      durationMs:
        typeof settings.durationMs === 'number' && Number.isFinite(settings.durationMs)
          ? Math.max(80, Math.min(1200, Math.round(settings.durationMs)))
          : current.durationMs,
      damage: sanitizeScreenShakeEvent(settings.damage, current.damage),
      heal: sanitizeScreenShakeEvent(settings.heal, current.heal),
      downed: sanitizeScreenShakeEvent(settings.downed, current.downed),
      attack: sanitizeScreenShakeEvent(settings.attack, current.attack),
      miss: sanitizeScreenShakeEvent(settings.miss, current.miss),
    };
    saveScreenShakeSettingsToStorage(next);
    set({ screenShakeSettings: next });
  },

  // Panel focus state - tracks which panel is at the front
  panelFocus: 'chat',

  // Actions
  setPanelFocus: (panel: string) => set({ panelFocus: panel }),
  setUser: (user, token) =>
    set({ user, isAuthenticated: !!user, token: token || null }),

  setUserProfileImage: (imageUrl: string | null) => set({ userProfileImage: imageUrl }),
  setPlayerProfileImage: (userId: string, imageUrl: string) =>
    set((state) => ({
      playerProfileImages: {
        ...state.playerProfileImages,
        [userId]: imageUrl,
      },
    })),
  setPlayerColor: (color: string) => set({ playerColor: color }),

  logout: () =>
    set({
      user: null,
      isAuthenticated: false,
      token: null,
      session: null,
      players: [],
      currentBoard: null,
      tokens: [],
      fogReveals: [],
      fogAdds: [],
      chatMessages: [],
      isGM: false,
      playerProfileImages: {},
    }),

  setSession: (session) => {
    const user = get().user;
    const isGM = session?.gmId === user?.id;
    set({ session, isGM });
  },

  setCurrentBoard: (board) => set((state) => ({
    currentBoard: board,
    tokens: [],
    fogReveals: [],
    fogAdds: [],
    sceneMapBleedOverrideEnabled: false,
    sceneMapBleedEnabled: state.mapBleedEnabled,
    sceneMapBleedFeather: state.mapBleedFeather,
    sceneMapBleedBlur: state.mapBleedBlur,
    sceneMapBleedVignette: state.mapBleedVignette,
    sceneMapBleedScale: state.mapBleedScale,
  })),
  updateCurrentBoard: (board) => set((state) => {
    if (!state.currentBoard) {
      return { currentBoard: board };
    }
    if (state.currentBoard.id !== board.id) {
      return {
        currentBoard: board,
        tokens: [],
        fogReveals: [],
        fogAdds: [],
        sceneMapBleedOverrideEnabled: false,
        sceneMapBleedEnabled: state.mapBleedEnabled,
        sceneMapBleedFeather: state.mapBleedFeather,
        sceneMapBleedBlur: state.mapBleedBlur,
        sceneMapBleedVignette: state.mapBleedVignette,
        sceneMapBleedScale: state.mapBleedScale,
      };
    }

    // Same board id: only refresh board metadata (e.g. background URL)
    // without wiping token/fog state.
    return { currentBoard: board };
  }),
  setPlayers: (players) => set({ players }),

  addToken: (token) => set((state) => ({ tokens: [...state.tokens, token] })),
  updateToken: (tokenId, updates) =>
    set((state) => ({
      tokens: state.tokens.map((t) => (t.id === tokenId ? { ...t, ...updates } : t)),
    })),
  removeToken: (tokenId) =>
    set((state) => ({
      tokens: state.tokens.filter((t) => t.id !== tokenId),
      selectedTokenId: state.selectedTokenId === tokenId ? null : state.selectedTokenId,
    })),
  setTokens: (tokens) => set({ tokens }),

  addFogReveal: (reveal) =>
    set((state) => ({ fogReveals: [...state.fogReveals, reveal] })),
  removeFogReveal: (revealId) =>
    set((state) => ({
      fogReveals: state.fogReveals.filter((f) => f.id !== revealId),
    })),
  clearFogReveals: () => set({ fogReveals: [] }),
  setFogReveals: (reveals) => set({ fogReveals: reveals }),

  addFogAdd: (fogAdd) =>
    set((state) => ({ fogAdds: [...state.fogAdds, fogAdd] })),
  removeFogAdd: (fogAddId) =>
    set((state) => ({
      fogAdds: state.fogAdds.filter((f) => f.id !== fogAddId),
    })),
  clearFogAdds: () => set({ fogAdds: [] }),
  setFogAdds: (fogAdds) => set({ fogAdds: fogAdds }),

  addChatMessage: (message) =>
    set((state) => ({ chatMessages: [...state.chatMessages, message] })),
  setChatMessages: (messages) => set({ chatMessages: messages }),
  setChatVisible: (visible) => set({ chatVisible: visible }),
  toggleChat: () => set((state) => ({ chatVisible: !state.chatVisible })),
  setDice3dEnabled: (enabled: boolean) => set({ dice3dEnabled: enabled }),
  setDice3dQuality: (quality: Dice3DQuality) => set({ dice3dQuality: quality }),
  setDice3dRollArea: (area: Dice3DRollArea) => set({ dice3dRollArea: area }),
  setDice3dColor: (color: string) =>
    set((state) => {
      saveDice3DSettingsToStorage({
        color,
        material: state.dice3dMaterial,
        theme: state.dice3dTheme,
        size: state.dice3dSize,
        rollForce: state.dice3dRollForce,
        torque: state.dice3dTorque,
        scaleMultiplier: state.dice3dScaleMultiplier,
        worldSizeMultiplier: state.dice3dWorldSizeMultiplier,
        startingHeightMultiplier: state.dice3dStartingHeightMultiplier,
        restitutionMultiplier: state.dice3dRestitutionMultiplier,
        frictionMultiplier: state.dice3dFrictionMultiplier,
        lightIntensityMultiplier: state.dice3dLightIntensityMultiplier,
        shadowTransparencyMultiplier: state.dice3dShadowTransparencyMultiplier,
        torqueThrowCoupling: state.dice3dTorqueThrowCoupling,
        rollDirectionMode: state.dice3dRollDirectionMode,
        rollDirectionDegrees: state.dice3dRollDirectionDegrees,
        showBoundariesOverlay: state.dice3dShowBoundariesOverlay,
      });
      return { dice3dColor: color };
    }),
  setDice3dMaterial: (material: Dice3DMaterial) =>
    set((state) => {
      saveDice3DSettingsToStorage({
        color: state.dice3dColor,
        material,
        theme: state.dice3dTheme,
        size: state.dice3dSize,
        rollForce: state.dice3dRollForce,
        torque: state.dice3dTorque,
        scaleMultiplier: state.dice3dScaleMultiplier,
        worldSizeMultiplier: state.dice3dWorldSizeMultiplier,
        startingHeightMultiplier: state.dice3dStartingHeightMultiplier,
        restitutionMultiplier: state.dice3dRestitutionMultiplier,
        frictionMultiplier: state.dice3dFrictionMultiplier,
        lightIntensityMultiplier: state.dice3dLightIntensityMultiplier,
        shadowTransparencyMultiplier: state.dice3dShadowTransparencyMultiplier,
        torqueThrowCoupling: state.dice3dTorqueThrowCoupling,
        rollDirectionMode: state.dice3dRollDirectionMode,
        rollDirectionDegrees: state.dice3dRollDirectionDegrees,
        showBoundariesOverlay: state.dice3dShowBoundariesOverlay,
      });
      return { dice3dMaterial: material };
    }),
  setDice3dTheme: (theme: Dice3DTheme) =>
    set((state) => {
      saveDice3DSettingsToStorage({
        color: state.dice3dColor,
        material: state.dice3dMaterial,
        theme,
        size: state.dice3dSize,
        rollForce: state.dice3dRollForce,
        torque: state.dice3dTorque,
        scaleMultiplier: state.dice3dScaleMultiplier,
        worldSizeMultiplier: state.dice3dWorldSizeMultiplier,
        startingHeightMultiplier: state.dice3dStartingHeightMultiplier,
        restitutionMultiplier: state.dice3dRestitutionMultiplier,
        frictionMultiplier: state.dice3dFrictionMultiplier,
        lightIntensityMultiplier: state.dice3dLightIntensityMultiplier,
        shadowTransparencyMultiplier: state.dice3dShadowTransparencyMultiplier,
        torqueThrowCoupling: state.dice3dTorqueThrowCoupling,
        rollDirectionMode: state.dice3dRollDirectionMode,
        rollDirectionDegrees: state.dice3dRollDirectionDegrees,
        showBoundariesOverlay: state.dice3dShowBoundariesOverlay,
      });
      return { dice3dTheme: theme };
    }),
  setDice3dSize: (size: number) =>
    set((state) => {
      const clamped = clampNumber(size, 0.6, 1.4);
      saveDice3DSettingsToStorage({
        color: state.dice3dColor,
        material: state.dice3dMaterial,
        theme: state.dice3dTheme,
        size: clamped,
        rollForce: state.dice3dRollForce,
        torque: state.dice3dTorque,
        scaleMultiplier: state.dice3dScaleMultiplier,
        worldSizeMultiplier: state.dice3dWorldSizeMultiplier,
        startingHeightMultiplier: state.dice3dStartingHeightMultiplier,
        restitutionMultiplier: state.dice3dRestitutionMultiplier,
        frictionMultiplier: state.dice3dFrictionMultiplier,
        lightIntensityMultiplier: state.dice3dLightIntensityMultiplier,
        shadowTransparencyMultiplier: state.dice3dShadowTransparencyMultiplier,
        torqueThrowCoupling: state.dice3dTorqueThrowCoupling,
        rollDirectionMode: state.dice3dRollDirectionMode,
        rollDirectionDegrees: state.dice3dRollDirectionDegrees,
        showBoundariesOverlay: state.dice3dShowBoundariesOverlay,
      });
      return { dice3dSize: clamped };
    }),
  setDice3dRollForce: (force: number) =>
    set((state) => {
      const clamped = clampNumber(force, 0.5, 1.8);
      saveDice3DSettingsToStorage({
        color: state.dice3dColor,
        material: state.dice3dMaterial,
        theme: state.dice3dTheme,
        size: state.dice3dSize,
        rollForce: clamped,
        torque: state.dice3dTorque,
        scaleMultiplier: state.dice3dScaleMultiplier,
        worldSizeMultiplier: state.dice3dWorldSizeMultiplier,
        startingHeightMultiplier: state.dice3dStartingHeightMultiplier,
        restitutionMultiplier: state.dice3dRestitutionMultiplier,
        frictionMultiplier: state.dice3dFrictionMultiplier,
        lightIntensityMultiplier: state.dice3dLightIntensityMultiplier,
        shadowTransparencyMultiplier: state.dice3dShadowTransparencyMultiplier,
        torqueThrowCoupling: state.dice3dTorqueThrowCoupling,
        rollDirectionMode: state.dice3dRollDirectionMode,
        rollDirectionDegrees: state.dice3dRollDirectionDegrees,
        showBoundariesOverlay: state.dice3dShowBoundariesOverlay,
      });
      return { dice3dRollForce: clamped };
    }),
  setDice3dTorque: (torque: number) =>
    set((state) => {
      const clamped = clampNumber(torque, 0.5, 2);
      saveDice3DSettingsToStorage({
        color: state.dice3dColor,
        material: state.dice3dMaterial,
        theme: state.dice3dTheme,
        size: state.dice3dSize,
        rollForce: state.dice3dRollForce,
        torque: clamped,
        scaleMultiplier: state.dice3dScaleMultiplier,
        worldSizeMultiplier: state.dice3dWorldSizeMultiplier,
        startingHeightMultiplier: state.dice3dStartingHeightMultiplier,
        restitutionMultiplier: state.dice3dRestitutionMultiplier,
        frictionMultiplier: state.dice3dFrictionMultiplier,
        lightIntensityMultiplier: state.dice3dLightIntensityMultiplier,
        shadowTransparencyMultiplier: state.dice3dShadowTransparencyMultiplier,
        torqueThrowCoupling: state.dice3dTorqueThrowCoupling,
        rollDirectionMode: state.dice3dRollDirectionMode,
        rollDirectionDegrees: state.dice3dRollDirectionDegrees,
        showBoundariesOverlay: state.dice3dShowBoundariesOverlay,
      });
      return { dice3dTorque: clamped };
    }),
  setDice3dScaleMultiplier: (value: number) =>
    set((state) => {
      const clamped = clampNumber(value, 0.6, 1.6);
      saveDice3DSettingsToStorage({
        color: state.dice3dColor, material: state.dice3dMaterial, theme: state.dice3dTheme, size: state.dice3dSize,
        rollForce: state.dice3dRollForce, torque: state.dice3dTorque,
        scaleMultiplier: clamped, worldSizeMultiplier: state.dice3dWorldSizeMultiplier,
        startingHeightMultiplier: state.dice3dStartingHeightMultiplier,
        restitutionMultiplier: state.dice3dRestitutionMultiplier, frictionMultiplier: state.dice3dFrictionMultiplier,
        lightIntensityMultiplier: state.dice3dLightIntensityMultiplier,
        shadowTransparencyMultiplier: state.dice3dShadowTransparencyMultiplier,
        torqueThrowCoupling: state.dice3dTorqueThrowCoupling,
        rollDirectionMode: state.dice3dRollDirectionMode, rollDirectionDegrees: state.dice3dRollDirectionDegrees,
        showBoundariesOverlay: state.dice3dShowBoundariesOverlay,
      });
      return { dice3dScaleMultiplier: clamped };
    }),
  setDice3dWorldSizeMultiplier: (value: number) =>
    set((state) => {
      const clamped = clampNumber(value, 0.6, 1.6);
      saveDice3DSettingsToStorage({
        color: state.dice3dColor, material: state.dice3dMaterial, theme: state.dice3dTheme, size: state.dice3dSize,
        rollForce: state.dice3dRollForce, torque: state.dice3dTorque,
        scaleMultiplier: state.dice3dScaleMultiplier, worldSizeMultiplier: clamped,
        startingHeightMultiplier: state.dice3dStartingHeightMultiplier,
        restitutionMultiplier: state.dice3dRestitutionMultiplier, frictionMultiplier: state.dice3dFrictionMultiplier,
        lightIntensityMultiplier: state.dice3dLightIntensityMultiplier,
        shadowTransparencyMultiplier: state.dice3dShadowTransparencyMultiplier,
        torqueThrowCoupling: state.dice3dTorqueThrowCoupling,
        rollDirectionMode: state.dice3dRollDirectionMode, rollDirectionDegrees: state.dice3dRollDirectionDegrees,
        showBoundariesOverlay: state.dice3dShowBoundariesOverlay,
      });
      return { dice3dWorldSizeMultiplier: clamped };
    }),
  setDice3dStartingHeightMultiplier: (value: number) =>
    set((state) => {
      const clamped = clampNumber(value, 0.6, 1.8);
      saveDice3DSettingsToStorage({
        color: state.dice3dColor, material: state.dice3dMaterial, theme: state.dice3dTheme, size: state.dice3dSize,
        rollForce: state.dice3dRollForce, torque: state.dice3dTorque,
        scaleMultiplier: state.dice3dScaleMultiplier, worldSizeMultiplier: state.dice3dWorldSizeMultiplier,
        startingHeightMultiplier: clamped,
        restitutionMultiplier: state.dice3dRestitutionMultiplier, frictionMultiplier: state.dice3dFrictionMultiplier,
        lightIntensityMultiplier: state.dice3dLightIntensityMultiplier,
        shadowTransparencyMultiplier: state.dice3dShadowTransparencyMultiplier,
        torqueThrowCoupling: state.dice3dTorqueThrowCoupling,
        rollDirectionMode: state.dice3dRollDirectionMode, rollDirectionDegrees: state.dice3dRollDirectionDegrees,
        showBoundariesOverlay: state.dice3dShowBoundariesOverlay,
      });
      return { dice3dStartingHeightMultiplier: clamped };
    }),
  setDice3dRestitutionMultiplier: (value: number) =>
    set((state) => {
      const clamped = clampNumber(value, 0.4, 1.8);
      saveDice3DSettingsToStorage({
        color: state.dice3dColor, material: state.dice3dMaterial, theme: state.dice3dTheme, size: state.dice3dSize,
        rollForce: state.dice3dRollForce, torque: state.dice3dTorque,
        scaleMultiplier: state.dice3dScaleMultiplier, worldSizeMultiplier: state.dice3dWorldSizeMultiplier,
        startingHeightMultiplier: state.dice3dStartingHeightMultiplier,
        restitutionMultiplier: clamped, frictionMultiplier: state.dice3dFrictionMultiplier,
        lightIntensityMultiplier: state.dice3dLightIntensityMultiplier,
        shadowTransparencyMultiplier: state.dice3dShadowTransparencyMultiplier,
        torqueThrowCoupling: state.dice3dTorqueThrowCoupling,
        rollDirectionMode: state.dice3dRollDirectionMode, rollDirectionDegrees: state.dice3dRollDirectionDegrees,
        showBoundariesOverlay: state.dice3dShowBoundariesOverlay,
      });
      return { dice3dRestitutionMultiplier: clamped };
    }),
  setDice3dFrictionMultiplier: (value: number) =>
    set((state) => {
      const clamped = clampNumber(value, 0.6, 1.4);
      saveDice3DSettingsToStorage({
        color: state.dice3dColor, material: state.dice3dMaterial, theme: state.dice3dTheme, size: state.dice3dSize,
        rollForce: state.dice3dRollForce, torque: state.dice3dTorque,
        scaleMultiplier: state.dice3dScaleMultiplier, worldSizeMultiplier: state.dice3dWorldSizeMultiplier,
        startingHeightMultiplier: state.dice3dStartingHeightMultiplier,
        restitutionMultiplier: state.dice3dRestitutionMultiplier, frictionMultiplier: clamped,
        lightIntensityMultiplier: state.dice3dLightIntensityMultiplier,
        shadowTransparencyMultiplier: state.dice3dShadowTransparencyMultiplier,
        torqueThrowCoupling: state.dice3dTorqueThrowCoupling,
        rollDirectionMode: state.dice3dRollDirectionMode, rollDirectionDegrees: state.dice3dRollDirectionDegrees,
        showBoundariesOverlay: state.dice3dShowBoundariesOverlay,
      });
      return { dice3dFrictionMultiplier: clamped };
    }),
  setDice3dLightIntensityMultiplier: (value: number) =>
    set((state) => {
      const clamped = clampNumber(value, 0.5, 1.8);
      saveDice3DSettingsToStorage({
        color: state.dice3dColor, material: state.dice3dMaterial, theme: state.dice3dTheme, size: state.dice3dSize,
        rollForce: state.dice3dRollForce, torque: state.dice3dTorque,
        scaleMultiplier: state.dice3dScaleMultiplier, worldSizeMultiplier: state.dice3dWorldSizeMultiplier,
        startingHeightMultiplier: state.dice3dStartingHeightMultiplier,
        restitutionMultiplier: state.dice3dRestitutionMultiplier, frictionMultiplier: state.dice3dFrictionMultiplier,
        lightIntensityMultiplier: clamped,
        shadowTransparencyMultiplier: state.dice3dShadowTransparencyMultiplier,
        torqueThrowCoupling: state.dice3dTorqueThrowCoupling,
        rollDirectionMode: state.dice3dRollDirectionMode, rollDirectionDegrees: state.dice3dRollDirectionDegrees,
        showBoundariesOverlay: state.dice3dShowBoundariesOverlay,
      });
      return { dice3dLightIntensityMultiplier: clamped };
    }),
  setDice3dShadowTransparencyMultiplier: (value: number) =>
    set((state) => {
      const clamped = clampNumber(value, 0.5, 1.6);
      saveDice3DSettingsToStorage({
        color: state.dice3dColor, material: state.dice3dMaterial, theme: state.dice3dTheme, size: state.dice3dSize,
        rollForce: state.dice3dRollForce, torque: state.dice3dTorque,
        scaleMultiplier: state.dice3dScaleMultiplier, worldSizeMultiplier: state.dice3dWorldSizeMultiplier,
        startingHeightMultiplier: state.dice3dStartingHeightMultiplier,
        restitutionMultiplier: state.dice3dRestitutionMultiplier, frictionMultiplier: state.dice3dFrictionMultiplier,
        lightIntensityMultiplier: state.dice3dLightIntensityMultiplier,
        shadowTransparencyMultiplier: clamped,
        torqueThrowCoupling: state.dice3dTorqueThrowCoupling,
        rollDirectionMode: state.dice3dRollDirectionMode, rollDirectionDegrees: state.dice3dRollDirectionDegrees,
        showBoundariesOverlay: state.dice3dShowBoundariesOverlay,
      });
      return { dice3dShadowTransparencyMultiplier: clamped };
    }),
  setDice3dTorqueThrowCoupling: (value: number) =>
    set((state) => {
      const clamped = clampNumber(value, 0.4, 1.4);
      saveDice3DSettingsToStorage({
        color: state.dice3dColor, material: state.dice3dMaterial, theme: state.dice3dTheme, size: state.dice3dSize,
        rollForce: state.dice3dRollForce, torque: state.dice3dTorque,
        scaleMultiplier: state.dice3dScaleMultiplier, worldSizeMultiplier: state.dice3dWorldSizeMultiplier,
        startingHeightMultiplier: state.dice3dStartingHeightMultiplier,
        restitutionMultiplier: state.dice3dRestitutionMultiplier, frictionMultiplier: state.dice3dFrictionMultiplier,
        lightIntensityMultiplier: state.dice3dLightIntensityMultiplier,
        shadowTransparencyMultiplier: state.dice3dShadowTransparencyMultiplier,
        torqueThrowCoupling: clamped,
        rollDirectionMode: state.dice3dRollDirectionMode, rollDirectionDegrees: state.dice3dRollDirectionDegrees,
        showBoundariesOverlay: state.dice3dShowBoundariesOverlay,
      });
      return { dice3dTorqueThrowCoupling: clamped };
    }),
  setDice3dRollDirectionMode: (mode: Dice3DRollDirectionMode) =>
    set((state) => {
      saveDice3DSettingsToStorage({
        color: state.dice3dColor,
        material: state.dice3dMaterial,
        theme: state.dice3dTheme,
        size: state.dice3dSize,
        rollForce: state.dice3dRollForce,
        torque: state.dice3dTorque,
        scaleMultiplier: state.dice3dScaleMultiplier,
        worldSizeMultiplier: state.dice3dWorldSizeMultiplier,
        startingHeightMultiplier: state.dice3dStartingHeightMultiplier,
        restitutionMultiplier: state.dice3dRestitutionMultiplier,
        frictionMultiplier: state.dice3dFrictionMultiplier,
        lightIntensityMultiplier: state.dice3dLightIntensityMultiplier,
        shadowTransparencyMultiplier: state.dice3dShadowTransparencyMultiplier,
        torqueThrowCoupling: state.dice3dTorqueThrowCoupling,
        rollDirectionMode: mode,
        rollDirectionDegrees: state.dice3dRollDirectionDegrees,
        showBoundariesOverlay: state.dice3dShowBoundariesOverlay,
      });
      return { dice3dRollDirectionMode: mode };
    }),
  setDice3dRollDirectionDegrees: (degrees: number) =>
    set((state) => {
      const clamped = clampNumber(degrees, 0, 360);
      saveDice3DSettingsToStorage({
        color: state.dice3dColor,
        material: state.dice3dMaterial,
        theme: state.dice3dTheme,
        size: state.dice3dSize,
        rollForce: state.dice3dRollForce,
        torque: state.dice3dTorque,
        scaleMultiplier: state.dice3dScaleMultiplier,
        worldSizeMultiplier: state.dice3dWorldSizeMultiplier,
        startingHeightMultiplier: state.dice3dStartingHeightMultiplier,
        restitutionMultiplier: state.dice3dRestitutionMultiplier,
        frictionMultiplier: state.dice3dFrictionMultiplier,
        lightIntensityMultiplier: state.dice3dLightIntensityMultiplier,
        shadowTransparencyMultiplier: state.dice3dShadowTransparencyMultiplier,
        torqueThrowCoupling: state.dice3dTorqueThrowCoupling,
        rollDirectionMode: state.dice3dRollDirectionMode,
        rollDirectionDegrees: clamped,
        showBoundariesOverlay: state.dice3dShowBoundariesOverlay,
      });
      return { dice3dRollDirectionDegrees: clamped };
    }),
  setDice3dShowBoundariesOverlay: (show: boolean) =>
    set((state) => {
      saveDice3DSettingsToStorage({
        color: state.dice3dColor,
        material: state.dice3dMaterial,
        theme: state.dice3dTheme,
        size: state.dice3dSize,
        rollForce: state.dice3dRollForce,
        torque: state.dice3dTorque,
        scaleMultiplier: state.dice3dScaleMultiplier,
        worldSizeMultiplier: state.dice3dWorldSizeMultiplier,
        startingHeightMultiplier: state.dice3dStartingHeightMultiplier,
        restitutionMultiplier: state.dice3dRestitutionMultiplier,
        frictionMultiplier: state.dice3dFrictionMultiplier,
        lightIntensityMultiplier: state.dice3dLightIntensityMultiplier,
        shadowTransparencyMultiplier: state.dice3dShadowTransparencyMultiplier,
        torqueThrowCoupling: state.dice3dTorqueThrowCoupling,
        rollDirectionMode: state.dice3dRollDirectionMode,
        rollDirectionDegrees: state.dice3dRollDirectionDegrees,
        showBoundariesOverlay: show,
      });
      return { dice3dShowBoundariesOverlay: show };
    }),
  setLastAuthoritativeDiceRoll: (result: DiceRollResult | null) => set({ lastAuthoritativeDiceRoll: result }),

  setSelectedToken: (tokenId) => set({ selectedTokenId: tokenId }),
  setSelectedTokenIds: (tokenIds) => set({ selectedTokenIds: tokenIds, selectedTokenId: tokenIds.length === 1 ? tokenIds[0] : null }),
  setIsDragging: (isDragging) => set({ isDragging }),
  setTool: (tool) => set({ tool }),
  setSelectableTypes: (types) => set({ selectableTypes: types }),
  toggleSelectableType: (type) => set((state) => {
    const current = state.selectableTypes;
    if (current.includes(type)) {
      // Don't allow deselecting all types - keep at least one
      if (current.length <= 1) return state;
      return { selectableTypes: current.filter(t => t !== type) };
    } else {
      return { selectableTypes: [...current, type] };
    }
  }),
  setShowMoveMeasure: (show) => set({ showMoveMeasure: show }),
  setSquareValue: (value) => set({ squareValue: value }),
  setMeasurementShape: (shape) => set({ measurementShape: shape }),
  addMeasurement: (measurement) => set((state) => ({ measurements: [...state.measurements, measurement] })),
  removeMeasurement: (id) => set((state) => ({ measurements: state.measurements.filter((m) => m.id !== id) })),
  updateMeasurement: (id, updates) => set((state) => ({
    measurements: state.measurements.map((m) => m.id === id ? { ...m, ...updates } : m),
  })),
  clearMeasurements: () => set({ measurements: [] }),
  setGridEditMode: (enabled) => set({ gridEditMode: enabled }),
  setBackgroundColor: (color) => set({ backgroundColor: color }),
  setGridColor: (color) => set({ gridColor: color }),
  setGridSize: (size) => set({ gridSize: size }),
  setGridOffsetX: (offset) => set({ gridOffsetX: offset }),
  setGridOffsetY: (offset) => set({ gridOffsetY: offset }),
  setGridUnit: (unit) => set({ gridUnit: unit }),
  setGridStyle: (style) => set({ gridStyle: style }),
  setGridOpacity: (opacity: number) => set({ gridOpacity: opacity }),
  setMapBleedEnabled: (enabled: boolean) => set((state) => {
    saveMapBleedSettingsToStorage({
      enabled,
      feather: state.mapBleedFeather,
      blur: state.mapBleedBlur,
      vignette: state.mapBleedVignette,
      scale: state.mapBleedScale,
    });
    return { mapBleedEnabled: enabled };
  }),
  setMapBleedFeather: (feather: number) => set((state) => {
    const clamped = Math.max(20, Math.min(480, Math.round(feather)));
    saveMapBleedSettingsToStorage({
      enabled: state.mapBleedEnabled,
      feather: clamped,
      blur: state.mapBleedBlur,
      vignette: state.mapBleedVignette,
      scale: state.mapBleedScale,
    });
    return { mapBleedFeather: clamped };
  }),
  setMapBleedBlur: (blur: number) => set((state) => {
    const clamped = Math.max(0, Math.min(80, Math.round(blur)));
    saveMapBleedSettingsToStorage({
      enabled: state.mapBleedEnabled,
      feather: state.mapBleedFeather,
      blur: clamped,
      vignette: state.mapBleedVignette,
      scale: state.mapBleedScale,
    });
    return { mapBleedBlur: clamped };
  }),
  setMapBleedVignette: (vignette: number) => set((state) => {
    const clamped = Math.max(0, Math.min(1, vignette));
    saveMapBleedSettingsToStorage({
      enabled: state.mapBleedEnabled,
      feather: state.mapBleedFeather,
      blur: state.mapBleedBlur,
      vignette: clamped,
      scale: state.mapBleedScale,
    });
    return { mapBleedVignette: clamped };
  }),
  setMapBleedScale: (scale: number) => set((state) => {
    const clamped = Math.max(1, Math.min(1.35, scale));
    saveMapBleedSettingsToStorage({
      enabled: state.mapBleedEnabled,
      feather: state.mapBleedFeather,
      blur: state.mapBleedBlur,
      vignette: state.mapBleedVignette,
      scale: clamped,
    });
    return { mapBleedScale: clamped };
  }),
  setSceneMapBleedOverrideEnabled: (enabled: boolean) => set({ sceneMapBleedOverrideEnabled: enabled }),
  setSceneMapBleedEnabled: (enabled: boolean) => set({ sceneMapBleedEnabled: enabled }),
  setSceneMapBleedFeather: (feather: number) => set({ sceneMapBleedFeather: Math.max(20, Math.min(480, Math.round(feather))) }),
  setSceneMapBleedBlur: (blur: number) => set({ sceneMapBleedBlur: Math.max(0, Math.min(80, Math.round(blur))) }),
  setSceneMapBleedVignette: (vignette: number) => set({ sceneMapBleedVignette: Math.max(0, Math.min(1, vignette)) }),
  setSceneMapBleedScale: (scale: number) => set({ sceneMapBleedScale: Math.max(1, Math.min(1.35, scale)) }),
  setPanFriction: (friction: number) => set({ panFriction: friction }),
  setPanEnabled: (enabled: boolean) => set({ panEnabled: enabled }),
  setTokenDisplayMode: (mode: 'always' | 'selected' | 'hover') => set({ tokenDisplayMode: mode }),
  setFocusOnSelectedKey: (key: string) => {
    saveKeyBindingSettingsToStorage({ focusOnSelectedKey: key });
    set({ focusOnSelectedKey: key });
  },
  setDefaultShowTokenName: (show: boolean) => {
    const current = useGameStore.getState();
    saveTokenDisplayDefaultsToStorage({
      defaultShowTokenName: show,
      defaultShowPlayerHp: current.defaultShowPlayerHp,
      defaultShowOtherHp: current.defaultShowOtherHp,
      defaultTokenDisposition: current.defaultTokenDisposition,
      tokenHpSource: current.tokenHpSource,
    });
    set({ defaultShowTokenName: show });
  },
  setDefaultShowPlayerHp: (show: boolean) => {
    const current = useGameStore.getState();
    saveTokenDisplayDefaultsToStorage({
      defaultShowTokenName: current.defaultShowTokenName,
      defaultShowPlayerHp: show,
      defaultShowOtherHp: current.defaultShowOtherHp,
      defaultTokenDisposition: current.defaultTokenDisposition,
      tokenHpSource: current.tokenHpSource,
    });
    set({ defaultShowPlayerHp: show });
  },
  setDefaultShowOtherHp: (show: boolean) => {
    const current = useGameStore.getState();
    saveTokenDisplayDefaultsToStorage({
      defaultShowTokenName: current.defaultShowTokenName,
      defaultShowPlayerHp: current.defaultShowPlayerHp,
      defaultShowOtherHp: show,
      defaultTokenDisposition: current.defaultTokenDisposition,
      tokenHpSource: current.tokenHpSource,
    });
    set({ defaultShowOtherHp: show });
  },
  setDefaultTokenDisposition: (disposition: TokenDisposition | null) => {
    const current = useGameStore.getState();
    saveTokenDisplayDefaultsToStorage({
      defaultShowTokenName: current.defaultShowTokenName,
      defaultShowPlayerHp: current.defaultShowPlayerHp,
      defaultShowOtherHp: current.defaultShowOtherHp,
      defaultTokenDisposition: disposition,
      tokenHpSource: current.tokenHpSource,
    });
    set({ defaultTokenDisposition: disposition });
  },
  setTokenHpSource: (source: 'average' | 'rolled') => {
    const current = useGameStore.getState();
    saveTokenDisplayDefaultsToStorage({
      defaultShowTokenName: current.defaultShowTokenName,
      defaultShowPlayerHp: current.defaultShowPlayerHp,
      defaultShowOtherHp: current.defaultShowOtherHp,
      defaultTokenDisposition: current.defaultTokenDisposition,
      tokenHpSource: source,
    });
    set({ tokenHpSource: source });
  },
  setChatCardsCollapsedByDefault: (collapsed: boolean) => {
    saveChatCardDefaultsToStorage({
      chatCardsCollapsedByDefault: collapsed,
    });
    set({ chatCardsCollapsedByDefault: collapsed });
  },
  setTurnTokenImageUrl: (url: string | null) => {
    const normalized = typeof url === 'string' && url.trim().length > 0 ? url : null;
    saveBattleSettingsToStorage({ turnTokenImageUrl: normalized });
    set({ turnTokenImageUrl: normalized });
  },
  setFogDrawMode: (mode: 'box' | 'polygon' | 'free' | 'grid' | 'pencil') => {
    const current = useGameStore.getState();
    saveFogToolsSettingsToStorage({
      fogDrawMode: mode,
      gmFogOpacity: current.gmFogOpacity,
      pencilSize: current.pencilSize,
      fogSnapToGrid: current.fogSnapToGrid,
    });
    set({ fogDrawMode: mode });
  },
  setGmFogOpacity: (opacity: number) => {
    const current = useGameStore.getState();
    saveFogToolsSettingsToStorage({
      fogDrawMode: current.fogDrawMode,
      gmFogOpacity: opacity,
      pencilSize: current.pencilSize,
      fogSnapToGrid: current.fogSnapToGrid,
    });
    set({ gmFogOpacity: opacity });
  },
  setPencilSize: (size: number) => {
    const current = useGameStore.getState();
    saveFogToolsSettingsToStorage({
      fogDrawMode: current.fogDrawMode,
      gmFogOpacity: current.gmFogOpacity,
      pencilSize: size,
      fogSnapToGrid: current.fogSnapToGrid,
    });
    set({ pencilSize: size });
  },
  setFogSnapToGrid: (snapToGrid: boolean) => {
    const current = useGameStore.getState();
    saveFogToolsSettingsToStorage({
      fogDrawMode: current.fogDrawMode,
      gmFogOpacity: current.gmFogOpacity,
      pencilSize: current.pencilSize,
      fogSnapToGrid: snapToGrid,
    });
    set({ fogSnapToGrid: snapToGrid });
  },
  setPencilSmoothness: (smoothness: number) => {
    const current = useGameStore.getState();
    savePencilSettingsToStorage({
      smoothness,
      drawRate: current.pencilDrawRate,
      fogColor: current.pencilFogColor,
    });
    set({ pencilSmoothness: smoothness });
  },
  setPencilDrawRate: (drawRate: number) => {
    const current = useGameStore.getState();
    savePencilSettingsToStorage({
      smoothness: current.pencilSmoothness,
      drawRate,
      fogColor: current.pencilFogColor,
    });
    set({ pencilDrawRate: drawRate });
  },
  setPencilFogColor: (fogColor: string) => {
    const current = useGameStore.getState();
    savePencilSettingsToStorage({
      smoothness: current.pencilSmoothness,
      drawRate: current.pencilDrawRate,
      fogColor,
    });
    set({ pencilFogColor: fogColor });
  },
  setParticlePreset: (preset: string) => {
    const current = useGameStore.getState();
    saveParticleEmitterSettingsToStorage({
      particlePreset: preset,
      particleEmitterSize: current.particleEmitterSize,
      particleInspectorWidth: current.particleInspectorWidth,
    });
    set({ particlePreset: preset });
  },
  setParticleEmitterSize: (size: number) => {
    const current = useGameStore.getState();
    saveParticleEmitterSettingsToStorage({
      particlePreset: current.particlePreset,
      particleEmitterSize: size,
      particleInspectorWidth: current.particleInspectorWidth,
    });
    set({ particleEmitterSize: size });
  },
  setParticleInspectorWidth: (width: number) => {
    const current = useGameStore.getState();
    const nextWidth = Math.max(180, Math.min(520, width));
    saveParticleEmitterSettingsToStorage({
      particlePreset: current.particlePreset,
      particleEmitterSize: current.particleEmitterSize,
      particleInspectorWidth: nextWidth,
    });
    set({ particleInspectorWidth: nextWidth });
  },
  setParticleEmitterVisible: (visible: boolean) => set({ particleEmitterVisible: visible, panelFocus: visible ? 'particleEmitter' : null }),
  toggleParticleEmitter: () => set((state) => ({ 
    particleEmitterVisible: !state.particleEmitterVisible,
    panelFocus: !state.particleEmitterVisible ? 'particleEmitter' : null
  })),
  setParticleEmitterPosition: (position: { x: number; y: number }) => set({ particleEmitterPosition: position }),
  setParticleEmitterSizeState: (size: { width: number; height: number }) => set({ particleEmitterSizeState: size }),
  setToolbarWidth: (width: number) => set({ toolbarWidth: width }),
  setToolbarHeight: (height: number) => set({ toolbarHeight: height }),
  setHeaderHeight: (height: number) => set({ headerHeight: height }),
  setChatPanelWidth: (width: number) => set({ chatPanelWidth: width }),
  setChatPanelHeight: (height: number) => set({ chatPanelHeight: height }),
  setDragMode: (mode) => set({ dragMode: mode }),
  setTokenContextMenu: (menu) => set({ tokenContextMenu: menu }),
  setPendingDropType: (drop) => set({ pendingDropType: drop }),
  setColorScheme: (scheme) => {
    saveColorSchemeToStorage(scheme);
    set({ colorScheme: scheme });
  },
  setStatusIconColor: (color) => set({ statusIconColor: color }),
  setBoxSelectionColor: (color) => set({ boxSelectionColor: color }),
  setBoxSelectionBgColor: (color) => set({ boxSelectionBgColor: color }),
  setWeatherType: (type) => set({ weatherType: type }),
  setWeatherIntensity: (intensity) => set({ weatherIntensity: intensity }),
  setWeatherSpeed: (speed) => set({ weatherSpeed: speed }),
  setWeatherSize: (size: number) => set({ weatherSize: size }),
  setWeatherColor: (color: string) => set({ weatherColor: color }),
  setWeatherTextureUrl: (url) => set({ weatherTextureUrl: url }),
  setWeatherOpacity: (opacity: number) => set({ weatherOpacity: opacity }),
  setWeatherCustomTexture: (weatherType, url) => set((state) => ({ 
    weatherCustomTextures: { ...state.weatherCustomTextures, [weatherType]: url },
    weatherTextureUrl: url // Also set current texture URL
  })),
  setWeatherDirection: (direction: number) => set({ weatherDirection: direction }),
  setWeatherWobble: (wobble: number) => set({ weatherWobble: wobble }),
  setWeatherWobbleAmplitude: (amplitude: number) => set({ weatherWobbleAmplitude: amplitude }),
  setWeatherParticleShape: (shape) => set({ weatherParticleShape: shape }),
  toggleWeather: () => set((state) => ({ weatherVisible: !state.weatherVisible })),
  setActiveWeatherEffects: (effects: WeatherEffectConfig[]) => set({ activeWeatherEffects: effects }),
  setWeatherFilterEffects: (effects: WeatherFilterConfig[]) => set((state) => ({
    weatherFilterEffects: effects,
    scenes: persistSceneWeatherFilterEffects(state.activeSceneId, state.scenes, effects),
  })),
  updateWeatherFilterEffect: (id: string, updates: Partial<WeatherFilterConfig>) => set((state) => {
    const nextEffects = state.weatherFilterEffects.map((e) => (e.id === id ? { ...e, ...updates } : e));
    return {
      weatherFilterEffects: nextEffects,
      scenes: persistSceneWeatherFilterEffects(state.activeSceneId, state.scenes, nextEffects),
    };
  }),
  updateWeatherEffect: (id: string, updates: Partial<WeatherEffectConfig>) => set((state) => ({
    activeWeatherEffects: state.activeWeatherEffects.map(e => e.id === id ? { ...e, ...updates } : e)
  })),
  addWeatherEffect: (effect: WeatherEffectConfig) => set((state) => ({
    activeWeatherEffects: [...state.activeWeatherEffects, effect]
  })),
  removeWeatherEffect: (id: string) => set((state) => ({
    activeWeatherEffects: state.activeWeatherEffects.filter(e => e.id !== id)
  })),

  // Game Time actions
  advanceTime: (delta: number) => set((state) => {
    const newTime = state.gameTimeSeconds + delta;
    // Handle day rollover
    if (newTime < 0) {
      return { gameTimeSeconds: TIME.DAY + (newTime % TIME.DAY) };
    }
    if (newTime >= TIME.DAY) {
      return { gameTimeSeconds: newTime % TIME.DAY };
    }
    return { gameTimeSeconds: newTime };
  }),
  setGameTime: (seconds: number) => set((state) => {
    // Normalize to 0-TIME.DAY range
    const normalizedTime = ((seconds % TIME.DAY) + TIME.DAY) % TIME.DAY;
    return { gameTimeSeconds: normalizedTime };
  }),
  toggleGameTime: () => set((state) => ({ gameTimeVisible: !state.gameTimeVisible })),
  setTimeOverlayEnabled: (enabled: boolean) => set({ timeOverlayEnabled: enabled }),
  setTimeOverlayOpacity: (opacity: number) => set({ timeOverlayOpacity: Math.max(0, Math.min(1, opacity)) }),
  setTimeBarPosition: (position: { x: number; y: number }) => {
    try {
      localStorage.setItem('vtt-timeBar-position', JSON.stringify(position));
    } catch (e) {}
    set({ timeBarPosition: position });
  },
  setTimeBarSize: (size: { width: number; height: number }) => {
    try {
      localStorage.setItem('vtt-timeBar-size', JSON.stringify(size));
    } catch (e) {}
    set({ timeBarSize: size });
  },
  setTimelinePosition: (position: { x: number; y: number }) => {
    localStorage.setItem('vtt-timeline-position', JSON.stringify(position));
    set({ timelinePosition: position });
  },
  setTimelineAnchor: (anchor: 'top' | 'bottom') => set({ timelineAnchor: anchor }),
  setTimelineBottomOffset: (offset: number) => set({ timelineBottomOffset: offset }),
  setTimelineStretched: (stretched: boolean) => set({ timelineStretched: stretched }),
  setTimelineHeight: (height: number) => {
    localStorage.setItem('vtt-timeline-height', String(height));
    set({ timelineHeight: height });
  },
  setFloatingPanels: (panels) => set({ floatingPanels: panels }),
  addFloatingPanel: (panel) => set(state => ({ floatingPanels: [...state.floatingPanels, panel] })),
  updateFloatingPanel: (id, updates) => set(state => ({
    floatingPanels: state.floatingPanels.map(p => p.id === id ? { ...p, ...updates } : p)
  })),
  removeFloatingPanel: (id) => set(state => ({
    floatingPanels: state.floatingPanels.filter(p => p.id !== id)
  })),

  // Combat actions
  setIsInCombat: (inCombat) => set({ isInCombat: inCombat }),

  addCombatant: (tokenId, name) =>
    set((state) => {
      if (state.combatants.some((combatant) => combatant.tokenId === tokenId)) {
        return state;
      }

      const token = state.tokens.find((entry) => entry.id === tokenId);
      if (!token) return state;

      const combatant = buildCombatantFromToken(token, name);

      return {
        combatants: [...state.combatants, combatant],
        selectedCombatantId: state.selectedCombatantId ?? combatant.id,
      };
    }),

  removeCombatant: (tokenId) =>
    set((state) => {
      const removedIndex = state.combatants.findIndex((combatant) => combatant.tokenId === tokenId);
      if (removedIndex === -1) return state;

      const combatants = state.combatants.filter((combatant) => combatant.tokenId !== tokenId);
      const clampedIndex = combatants.length === 0
        ? 0
        : Math.min(state.currentTurnIndex > removedIndex ? state.currentTurnIndex - 1 : state.currentTurnIndex, combatants.length - 1);

      const removedCombatant = state.combatants[removedIndex];

      return {
        combatants,
        currentTurnIndex: clampedIndex,
        selectedCombatantId: state.selectedCombatantId === removedCombatant.id ? (combatants[0]?.id ?? null) : state.selectedCombatantId,
      };
    }),

  setCombatantRoll: (tokenId, roll) =>
    set((state) => ({
      combatants: state.combatants.map((combatant) =>
        combatant.tokenId === tokenId
          ? { ...combatant, initiative: roll ?? combatant.initiative }
          : combatant
      ),
    })),

  clearCombatants: () =>
    set({
      combatants: [],
      isInCombat: false,
      combatRound: 1,
      currentTurnIndex: 0,
      selectedCombatantId: null,
    }),

  nextTurn: () =>
    set((state) => {
      const next = getNextTurn({
        combatants: state.combatants,
        currentTurnIndex: state.currentTurnIndex,
        round: state.combatRound,
        started: state.isInCombat,
      });

      return {
        currentTurnIndex: next.currentTurnIndex,
        combatRound: next.round,
      };
    }),

  previousTurn: () =>
    set((state) => {
      const previous = getPreviousTurn({
        combatants: state.combatants,
        currentTurnIndex: state.currentTurnIndex,
        round: state.combatRound,
        started: state.isInCombat,
      });

      return {
        currentTurnIndex: previous.currentTurnIndex,
        combatRound: previous.round,
      };
    }),

  setCurrentTurn: (index: number) =>
    set((state) => ({
      currentTurnIndex: Math.max(0, Math.min(index, Math.max(0, state.combatants.length - 1))),
    })),

  startCombat: () =>
    set((state) => {
      const sorted = [...state.combatants].sort((a, b) => b.initiative - a.initiative);
      const next = startEncounterCombat({
        combatants: sorted,
        currentTurnIndex: 0,
        round: 1,
        started: false,
      });

      return {
        combatants: next.combatants,
        isInCombat: next.started,
        combatRound: next.round,
        currentTurnIndex: next.currentTurnIndex,
      };
    }),

  endCombat: () => set({ isInCombat: false, combatRound: 1, currentTurnIndex: 0 }),

  autoRollAllInitiative: () =>
    set((state) => ({
      combatants: state.combatants.map((combatant) => ({
        ...combatant,
        initiative: Math.floor(Math.random() * 20) + 1,
      })),
    })),
  
  isTokenInCombat: (tokenId) => {
    const state = get();
    return state.combatants.some(c => c.tokenId === tokenId);
  },
  
  setCombatTrackerPosition: (position) => set({ combatTrackerPosition: position }),
  setCombatTrackerSize: (size) => set({ combatTrackerSize: size }),
  setCombatTrackerVisible: (visible: boolean) => set({ combatTrackerVisible: visible, panelFocus: visible ? 'combatTracker' : null }),
  toggleCombatTracker: () => set((state) => ({ 
    combatTrackerVisible: !state.combatTrackerVisible,
    panelFocus: !state.combatTrackerVisible ? 'combatTracker' : null
  })),
  selectCombatant: (combatantId) => set({ selectedCombatantId: combatantId }),
  updateCombatantHp: (combatantId, amount, mode = 'set') =>
    set((state) => ({
      combatants: state.combatants.map((combatant) => {
        if (combatant.id !== combatantId) return combatant;
        if (mode === 'damage') return damage(combatant, amount);
        if (mode === 'heal') return heal(combatant, amount);
        return setHP(combatant, amount);
      }),
    })),

  // D&D Data Manager
  setDndManagerPosition: (position: { x: number; y: number }) => set({ dndManagerPosition: position }),
  setDndManagerSize: (size: { width: number; height: number }) => set({ dndManagerSize: size }),
  setDndManagerVisible: (visible: boolean) => set({ dndManagerVisible: visible, panelFocus: visible ? 'dndManager' : null }),
  toggleDndManager: () => set((state) => ({ 
    dndManagerVisible: !state.dndManagerVisible,
    panelFocus: !state.dndManagerVisible ? 'dndManager' : null
  })),
  
  openSheet: (sheet) => set({ activeSheet: sheet }),
  closeSheet: () => set({ activeSheet: null }),

  // Select creature in DataManager (single-click on token)
  selectCreatureInDataManager: (creatureId: string) => set({
    dndManagerVisible: true,
    panelFocus: 'dndManager',
    dataManagerSelectedCreatureId: creatureId,
    dataManagerSelectedCreatureSearchName: null,
  }),
  selectCreatureInDataManagerByName: (name: string) => set({
    dndManagerVisible: true,
    panelFocus: 'dndManager',
    dataManagerSelectedCreatureId: null,
    dataManagerSelectedCreatureSearchName: name,
  }),
  clearSelectedCreatureInDataManager: () => set({
    dataManagerSelectedCreatureId: null,
    dataManagerSelectedCreatureSearchName: null,
  }),

  // File Browser
  setFileBrowserVisible: (visible: boolean) => set({ fileBrowserVisible: visible, panelFocus: visible ? 'fileBrowser' : null }),
  toggleFileBrowser: () => set((state) => ({ 
    fileBrowserVisible: !state.fileBrowserVisible,
    panelFocus: !state.fileBrowserVisible ? 'fileBrowser' : null
  })),
  setFileBrowserPosition: (position: { x: number; y: number }) => set({ fileBrowserPosition: position }),
  setFileBrowserSize: (size: { width: number; height: number }) => set({ fileBrowserSize: size }),
  setFileBrowserSelectCallback: (callback: ((fileUrl: string) => void) | null) => set({ fileBrowserSelectCallback: callback }),

  // Profile Panel
  setProfilePanelVisible: (visible: boolean) => set({ profilePanelVisible: visible, panelFocus: visible ? 'profilePanel' : null }),
  toggleProfilePanel: () => set((state) => ({ 
    profilePanelVisible: !state.profilePanelVisible,
    panelFocus: !state.profilePanelVisible ? 'profilePanel' : null
  })),
  setProfilePanelPosition: (position: { x: number; y: number }) => set({ profilePanelPosition: position }),
  setProfilePanelSize: (size: { width: number; height: number }) => set({ profilePanelSize: size }),
  centerProfilePanel: () => set({ 
    profilePanelPosition: { 
      x: window.innerWidth / 2 - 200, 
      y: window.innerHeight / 2 - 425 
    } 
  }),

  // Scene Manager
  setSceneManagerVisible: (visible: boolean) => set({ sceneManagerVisible: visible, panelFocus: visible ? 'sceneManager' : null }),
  toggleSceneManager: () => set((state) => ({ 
    sceneManagerVisible: !state.sceneManagerVisible,
    panelFocus: !state.sceneManagerVisible ? 'sceneManager' : null
  })),
  setSceneManagerPosition: (position: { x: number; y: number }) => set({ sceneManagerPosition: position }),
  setSceneManagerSize: (size: { width: number; height: number }) => set({ sceneManagerSize: size }),
  
  saveScene: (name: string) => {
    const state = get();
    if (!state.currentBoard) return;
    
    // Deduplicate lights and audio sources by ID to prevent double-counting bug
    const uniqueLights = state.lights.filter((light, index, self) => 
      index === self.findIndex((l) => l.id === light.id)
    );
    const uniqueAudioSources = state.audioSources.filter((audio, index, self) => 
      index === self.findIndex((a) => a.id === audio.id)
    );
    
    const newScene: Scene = {
      id: crypto.randomUUID(),
      name,
      boardId: state.currentBoard.id,
      tokens: state.tokens,
      lights: uniqueLights,
      audioSources: uniqueAudioSources,
      fogReveals: state.fogReveals,
      fogAdds: state.fogAdds,
      backgroundUrl: state.currentBoard.backgroundUrl,
      mapBleedEnabled: state.mapBleedEnabled,
      mapBleedFeather: state.mapBleedFeather,
      mapBleedBlur: state.mapBleedBlur,
      mapBleedVignette: state.mapBleedVignette,
      mapBleedScale: state.mapBleedScale,
      backgroundColor: state.backgroundColor,
      gridColor: state.gridColor,
      gridSize: state.gridSize,
      gridOffsetX: state.gridOffsetX,
      gridOffsetY: state.gridOffsetY,
      gridUnit: state.gridUnit,
      gridStyle: state.gridStyle,
      gridOpacity: state.gridOpacity,
      panFriction: state.panFriction,
      panEnabled: state.panEnabled,
      tokenDisplayMode: state.tokenDisplayMode,
      weatherType: state.weatherType,
      weatherIntensity: state.weatherIntensity,
      weatherSpeed: state.weatherSpeed,
      weatherSize: state.weatherSize,
      weatherColor: state.weatherColor,
      weatherDirection: state.weatherDirection,
      weatherWobble: state.weatherWobble,
      weatherWobbleAmplitude: state.weatherWobbleAmplitude,
      weatherParticleShape: state.weatherParticleShape,
      activeWeatherEffects: state.activeWeatherEffects,
      weatherFilterEffects: state.weatherFilterEffects,
      manualParticleEmitters: state.sceneParticleEmitters,
      // Atmospheric fog settings
      atmosphericFog: VISUAL_OPTIONS.atmosphericFog,
      fogEnabled: VISUAL_OPTIONS.fogEnabled,
      fogIntensity: VISUAL_OPTIONS.fogIntensity,
      fogSpeed: VISUAL_OPTIONS.fogSpeed,
      fogShift: VISUAL_OPTIONS.fogShift,
      fogDirection: VISUAL_OPTIONS.fogDirection,
      fogColor1: VISUAL_OPTIONS.fogColor1,
      fogColor2: VISUAL_OPTIONS.fogColor2,
      // God ray settings
      godRayEnabled: VISUAL_OPTIONS.godRayEnabled,
      godRayAngle: VISUAL_OPTIONS.godRayAngle,
      godRayLacunarity: VISUAL_OPTIONS.godRayLacunarity,
      godRayGain: VISUAL_OPTIONS.godRayGain,
      godRayIntensity: VISUAL_OPTIONS.godRayIntensity,
      // Battle/Combat state
      isInCombat: state.isInCombat,
      combatants: state.combatants,
      combatRound: state.combatRound,
      currentTurnIndex: state.currentTurnIndex,
      createdAt: new Date(),
    };
    
    // Save to localStorage with global key (persists across sessions)
    const key = 'vtt_scenes';
    const existingScenes = JSON.parse(localStorage.getItem(key) || '[]');
    const updatedScenes = [...existingScenes, newScene];
    localStorage.setItem(key, JSON.stringify(updatedScenes));
    
    set({ scenes: updatedScenes });
  },

  overwriteScene: (sceneId: string) => {
    const state = get();
    if (!state.currentBoard) return;
    
    const existingScene = state.scenes.find(s => s.id === sceneId);
    if (!existingScene) return;
    
    // Deduplicate lights and audio sources by ID to prevent double-counting bug
    const uniqueLights = state.lights.filter((light, index, self) => 
      index === self.findIndex((l) => l.id === light.id)
    );
    const uniqueAudioSources = state.audioSources.filter((audio, index, self) => 
      index === self.findIndex((a) => a.id === audio.id)
    );
    
    // Create updated scene with same ID and name, but new content
    const updatedScene: Scene = {
      ...existingScene,
      boardId: state.currentBoard.id,
      tokens: state.tokens,
      lights: uniqueLights,
      audioSources: uniqueAudioSources,
      fogReveals: state.fogReveals,
      fogAdds: state.fogAdds,
      backgroundUrl: state.currentBoard.backgroundUrl,
      mapBleedEnabled: state.mapBleedEnabled,
      mapBleedFeather: state.mapBleedFeather,
      mapBleedBlur: state.mapBleedBlur,
      mapBleedVignette: state.mapBleedVignette,
      mapBleedScale: state.mapBleedScale,
      backgroundColor: state.backgroundColor,
      gridColor: state.gridColor,
      gridSize: state.gridSize,
      gridOffsetX: state.gridOffsetX,
      gridOffsetY: state.gridOffsetY,
      gridUnit: state.gridUnit,
      gridStyle: state.gridStyle,
      gridOpacity: state.gridOpacity,
      panFriction: state.panFriction,
      panEnabled: state.panEnabled,
      weatherType: state.weatherType,
      weatherIntensity: state.weatherIntensity,
      weatherSpeed: state.weatherSpeed,
      weatherSize: state.weatherSize,
      weatherColor: state.weatherColor,
      weatherDirection: state.weatherDirection,
      weatherWobble: state.weatherWobble,
      weatherWobbleAmplitude: state.weatherWobbleAmplitude,
      weatherParticleShape: state.weatherParticleShape,
      activeWeatherEffects: state.activeWeatherEffects,
      weatherFilterEffects: state.weatherFilterEffects,
      manualParticleEmitters: state.sceneParticleEmitters,
      // Atmospheric fog settings
      atmosphericFog: VISUAL_OPTIONS.atmosphericFog,
      fogEnabled: VISUAL_OPTIONS.fogEnabled,
      fogIntensity: VISUAL_OPTIONS.fogIntensity,
      fogSpeed: VISUAL_OPTIONS.fogSpeed,
      fogShift: VISUAL_OPTIONS.fogShift,
      fogDirection: VISUAL_OPTIONS.fogDirection,
      fogColor1: VISUAL_OPTIONS.fogColor1,
      fogColor2: VISUAL_OPTIONS.fogColor2,
      // God ray settings
      godRayEnabled: VISUAL_OPTIONS.godRayEnabled,
      godRayAngle: VISUAL_OPTIONS.godRayAngle,
      godRayLacunarity: VISUAL_OPTIONS.godRayLacunarity,
      godRayGain: VISUAL_OPTIONS.godRayGain,
      godRayIntensity: VISUAL_OPTIONS.godRayIntensity,
      // Battle/Combat state
      isInCombat: state.isInCombat,
      combatants: state.combatants,
      combatRound: state.combatRound,
      currentTurnIndex: state.currentTurnIndex,
      createdAt: new Date(),
    };
    
    // Update in localStorage
    const key = 'vtt_scenes';
    const existingScenes = JSON.parse(localStorage.getItem(key) || '[]');
    const updatedScenes = existingScenes.map((s: Scene) => 
      s.id === sceneId ? updatedScene : s
    );
    localStorage.setItem(key, JSON.stringify(updatedScenes));
    
    set({ scenes: updatedScenes });
  },
  
  loadScene: (sceneId: string) => {
    const state = get();
    const scene = state.scenes.find(s => s.id === sceneId);
    if (!scene) return;
    
    // Auto-save current scene before loading new one (if there's an active scene and current board)
    if (state.activeSceneId && state.currentBoard && state.isGM) {
      const currentActiveScene = state.scenes.find(s => s.id === state.activeSceneId);
      if (currentActiveScene) {
        // Deduplicate lights and audio sources by ID to prevent double-counting bug
        const uniqueLights = state.lights.filter((light, index, self) => 
          index === self.findIndex((l) => l.id === light.id)
        );
        const uniqueAudioSources = state.audioSources.filter((audio, index, self) => 
          index === self.findIndex((a) => a.id === audio.id)
        );
        
        // Overwrite the current active scene with current state
        const updatedScene: Scene = {
          ...currentActiveScene,
          boardId: state.currentBoard.id,
          tokens: state.tokens,
          lights: uniqueLights,
          audioSources: uniqueAudioSources,
          fogReveals: state.fogReveals,
          fogAdds: state.fogAdds,
          backgroundUrl: state.currentBoard.backgroundUrl,
          mapBleedEnabled: state.mapBleedEnabled,
          mapBleedFeather: state.mapBleedFeather,
          mapBleedBlur: state.mapBleedBlur,
          mapBleedVignette: state.mapBleedVignette,
          mapBleedScale: state.mapBleedScale,
          backgroundColor: state.backgroundColor,
          gridColor: state.gridColor,
          gridSize: state.gridSize,
          gridOffsetX: state.gridOffsetX,
          gridOffsetY: state.gridOffsetY,
          gridUnit: state.gridUnit,
          gridStyle: state.gridStyle,
          gridOpacity: state.gridOpacity,
          panFriction: state.panFriction,
          panEnabled: state.panEnabled,
          weatherType: state.weatherType,
          weatherIntensity: state.weatherIntensity,
          weatherSpeed: state.weatherSpeed,
          weatherSize: state.weatherSize,
          weatherColor: state.weatherColor,
          weatherDirection: state.weatherDirection,
          weatherWobble: state.weatherWobble,
          weatherWobbleAmplitude: state.weatherWobbleAmplitude,
          weatherParticleShape: state.weatherParticleShape,
          activeWeatherEffects: state.activeWeatherEffects,
          weatherFilterEffects: state.weatherFilterEffects,
          manualParticleEmitters: state.sceneParticleEmitters,
          // Atmospheric fog settings
          atmosphericFog: VISUAL_OPTIONS.atmosphericFog,
          fogEnabled: VISUAL_OPTIONS.fogEnabled,
          fogIntensity: VISUAL_OPTIONS.fogIntensity,
          fogSpeed: VISUAL_OPTIONS.fogSpeed,
          fogShift: VISUAL_OPTIONS.fogShift,
          fogDirection: VISUAL_OPTIONS.fogDirection,
          fogColor1: VISUAL_OPTIONS.fogColor1,
          fogColor2: VISUAL_OPTIONS.fogColor2,
          // God ray settings
          godRayEnabled: VISUAL_OPTIONS.godRayEnabled,
          godRayAngle: VISUAL_OPTIONS.godRayAngle,
          godRayLacunarity: VISUAL_OPTIONS.godRayLacunarity,
          godRayGain: VISUAL_OPTIONS.godRayGain,
          godRayIntensity: VISUAL_OPTIONS.godRayIntensity,
          // Battle/Combat state
          isInCombat: state.isInCombat,
          combatants: state.combatants,
          combatRound: state.combatRound,
          currentTurnIndex: state.currentTurnIndex,
          createdAt: new Date(),
        };
        
        // Update in localStorage
        const key = 'vtt_scenes';
        const existingScenes = JSON.parse(localStorage.getItem(key) || '[]');
        const updatedScenes = existingScenes.map((s: Scene) => 
          s.id === state.activeSceneId ? updatedScene : s
        );
        localStorage.setItem(key, JSON.stringify(updatedScenes));
        
        // Update state
        set({ scenes: updatedScenes });
      }
    }
    
    // Save the last loaded scene ID to localStorage
    localStorage.setItem('vtt_lastSceneId', sceneId);
    
    // Restore atmospheric fog settings from scene to VISUAL_OPTIONS
    if (scene.atmosphericFog !== undefined) {
      VISUAL_OPTIONS.atmosphericFog = scene.atmosphericFog;
    }
    if (scene.fogEnabled !== undefined) {
      VISUAL_OPTIONS.fogEnabled = scene.fogEnabled;
    }
    if (scene.fogIntensity !== undefined) {
      VISUAL_OPTIONS.fogIntensity = scene.fogIntensity;
    }
    if (scene.fogSpeed !== undefined) {
      VISUAL_OPTIONS.fogSpeed = scene.fogSpeed;
    }
    if (scene.fogShift !== undefined) {
      VISUAL_OPTIONS.fogShift = scene.fogShift;
    }
    if (scene.fogDirection !== undefined) {
      VISUAL_OPTIONS.fogDirection = scene.fogDirection;
    }
    if (scene.fogColor1 !== undefined) {
      VISUAL_OPTIONS.fogColor1 = scene.fogColor1;
    }
    if (scene.fogColor2 !== undefined) {
      VISUAL_OPTIONS.fogColor2 = scene.fogColor2;
    }
    // Restore god ray settings
    if (scene.godRayEnabled !== undefined) {
      VISUAL_OPTIONS.godRayEnabled = scene.godRayEnabled;
    }
    if (scene.godRayAngle !== undefined) {
      VISUAL_OPTIONS.godRayAngle = scene.godRayAngle;
    }
    if (scene.godRayLacunarity !== undefined) {
      VISUAL_OPTIONS.godRayLacunarity = scene.godRayLacunarity;
    }
    if (scene.godRayGain !== undefined) {
      VISUAL_OPTIONS.godRayGain = scene.godRayGain;
    }
    if (scene.godRayIntensity !== undefined) {
      VISUAL_OPTIONS.godRayIntensity = scene.godRayIntensity;
    }
    
    // Update board if different background
    if (state.currentBoard) {
      const updatedBoard = { ...state.currentBoard, backgroundUrl: scene.backgroundUrl };
      set({ 
        activeSceneId: scene.id,
        sceneMapBleedOverrideEnabled: scene.mapBleedOverrideEnabled ?? false,
        sceneMapBleedEnabled: scene.mapBleedEnabled ?? state.mapBleedEnabled,
        sceneMapBleedFeather: scene.mapBleedFeather ?? state.mapBleedFeather,
        sceneMapBleedBlur: scene.mapBleedBlur ?? state.mapBleedBlur,
        sceneMapBleedVignette: scene.mapBleedVignette ?? state.mapBleedVignette,
        sceneMapBleedScale: scene.mapBleedScale ?? state.mapBleedScale,
        currentBoard: updatedBoard,
        tokens: scene.tokens,
        lights: scene.lights,
        audioSources: scene.audioSources,
        fogReveals: scene.fogReveals,
        fogAdds: [],
        backgroundColor: scene.backgroundColor,
        gridColor: scene.gridColor,
        gridSize: scene.gridSize,
        gridOffsetX: scene.gridOffsetX,
        gridOffsetY: scene.gridOffsetY,
        gridUnit: scene.gridUnit,
        gridStyle: scene.gridStyle ?? 'solid',
        gridOpacity: scene.gridOpacity ?? 0.55,
        panFriction: scene.panFriction ?? 0.92,
        panEnabled: scene.panEnabled ?? true,
        weatherType: scene.weatherType,
        weatherIntensity: scene.weatherIntensity,
        weatherSpeed: scene.weatherSpeed,
        weatherSize: scene.weatherSize,
        weatherColor: scene.weatherColor,
        weatherDirection: scene.weatherDirection,
        weatherWobble: scene.weatherWobble,
        weatherWobbleAmplitude: scene.weatherWobbleAmplitude,
        weatherParticleShape: scene.weatherParticleShape,
        activeWeatherEffects: scene.activeWeatherEffects || [],
        weatherFilterEffects: scene.weatherFilterEffects || [],
        sceneParticleEmitters: scene.manualParticleEmitters || [],
        // Restore battle/combat state
        isInCombat: scene.isInCombat ?? false,
        combatants: scene.combatants || [],
        combatRound: scene.combatRound ?? 1,
        currentTurnIndex: scene.currentTurnIndex ?? 0,
        sceneManagerVisible: false,
      });
    }
  },
  
  deleteScene: (sceneId: string) => {
    const state = get();
    const key = 'vtt_scenes';
    const updatedScenes = state.scenes.filter(s => s.id !== sceneId);
    localStorage.setItem(key, JSON.stringify(updatedScenes));
    set({
      scenes: updatedScenes,
      activeSceneId: state.activeSceneId === sceneId ? null : state.activeSceneId,
    });
  },

  setSceneParticleEmitters: (emitters: SceneParticleEmitterConfig[]) => set({ sceneParticleEmitters: emitters }),
  
  setScenes: (scenes: Scene[]) => set({ scenes }),
  
  // Refresh scenes from localStorage (useful after import)
  refreshScenes: () => {
    const key = 'vtt_scenes';
    const savedScenes = JSON.parse(localStorage.getItem(key) || '[]');
    const parsedScenes = savedScenes.map((s: any) => ({
      ...s,
      createdAt: new Date(s.createdAt),
      // Default panning settings for older scenes
      panFriction: s.panFriction ?? 0.92,
      panEnabled: s.panEnabled ?? true,
    }));
    set({ scenes: parsedScenes });
  },
  
  // Auto-load the last scene on startup (if scenes exist and a last scene was saved)
  loadLastSceneOnStartup: () => {
    const state = get();
    const lastSceneId = localStorage.getItem('vtt_lastSceneId');
    
    if (!lastSceneId || state.scenes.length === 0) return;
    
    const lastScene = state.scenes.find(s => s.id === lastSceneId);
    if (!lastScene) return;
    
    // Restore atmospheric fog settings from scene to VISUAL_OPTIONS
    if (lastScene.atmosphericFog !== undefined) {
      VISUAL_OPTIONS.atmosphericFog = lastScene.atmosphericFog;
    }
    if (lastScene.fogEnabled !== undefined) {
      VISUAL_OPTIONS.fogEnabled = lastScene.fogEnabled;
    }
    if (lastScene.fogIntensity !== undefined) {
      VISUAL_OPTIONS.fogIntensity = lastScene.fogIntensity;
    }
    if (lastScene.fogSpeed !== undefined) {
      VISUAL_OPTIONS.fogSpeed = lastScene.fogSpeed;
    }
    if (lastScene.fogShift !== undefined) {
      VISUAL_OPTIONS.fogShift = lastScene.fogShift;
    }
    if (lastScene.fogDirection !== undefined) {
      VISUAL_OPTIONS.fogDirection = lastScene.fogDirection;
    }
    if (lastScene.fogColor1 !== undefined) {
      VISUAL_OPTIONS.fogColor1 = lastScene.fogColor1;
    }
    if (lastScene.fogColor2 !== undefined) {
      VISUAL_OPTIONS.fogColor2 = lastScene.fogColor2;
    }
    // Restore god ray settings
    if (lastScene.godRayEnabled !== undefined) {
      VISUAL_OPTIONS.godRayEnabled = lastScene.godRayEnabled;
    }
    if (lastScene.godRayAngle !== undefined) {
      VISUAL_OPTIONS.godRayAngle = lastScene.godRayAngle;
    }
    if (lastScene.godRayLacunarity !== undefined) {
      VISUAL_OPTIONS.godRayLacunarity = lastScene.godRayLacunarity;
    }
    if (lastScene.godRayGain !== undefined) {
      VISUAL_OPTIONS.godRayGain = lastScene.godRayGain;
    }
    if (lastScene.godRayIntensity !== undefined) {
      VISUAL_OPTIONS.godRayIntensity = lastScene.godRayIntensity;
    }
    
    // Load the last scene (same logic as loadScene but without re-saving the ID)
    if (state.currentBoard) {
      const updatedBoard = { ...state.currentBoard, backgroundUrl: lastScene.backgroundUrl };
      set({
        activeSceneId: lastScene.id,
        sceneMapBleedOverrideEnabled: lastScene.mapBleedOverrideEnabled ?? false,
        sceneMapBleedEnabled: lastScene.mapBleedEnabled ?? state.mapBleedEnabled,
        sceneMapBleedFeather: lastScene.mapBleedFeather ?? state.mapBleedFeather,
        sceneMapBleedBlur: lastScene.mapBleedBlur ?? state.mapBleedBlur,
        sceneMapBleedVignette: lastScene.mapBleedVignette ?? state.mapBleedVignette,
        sceneMapBleedScale: lastScene.mapBleedScale ?? state.mapBleedScale,
        currentBoard: updatedBoard,
        tokens: lastScene.tokens,
        lights: lastScene.lights,
        audioSources: lastScene.audioSources,
        fogReveals: lastScene.fogReveals,
        fogAdds: [],
        backgroundColor: lastScene.backgroundColor,
        gridColor: lastScene.gridColor,
        gridSize: lastScene.gridSize,
        gridOffsetX: lastScene.gridOffsetX,
        gridOffsetY: lastScene.gridOffsetY,
        gridUnit: lastScene.gridUnit,
        gridStyle: lastScene.gridStyle ?? 'solid',
        gridOpacity: lastScene.gridOpacity ?? 0.55,
        panFriction: lastScene.panFriction ?? 0.92,
        panEnabled: lastScene.panEnabled ?? true,
        weatherType: lastScene.weatherType,
        weatherIntensity: lastScene.weatherIntensity,
        weatherSpeed: lastScene.weatherSpeed,
        weatherSize: lastScene.weatherSize,
        weatherColor: lastScene.weatherColor,
        weatherDirection: lastScene.weatherDirection,
        weatherWobble: lastScene.weatherWobble,
        weatherWobbleAmplitude: lastScene.weatherWobbleAmplitude,
        weatherParticleShape: lastScene.weatherParticleShape,
        activeWeatherEffects: lastScene.activeWeatherEffects || [],
        weatherFilterEffects: lastScene.weatherFilterEffects || [],
        sceneParticleEmitters: lastScene.manualParticleEmitters || [],
        // Restore battle/combat state
        isInCombat: lastScene.isInCombat ?? false,
        combatants: lastScene.combatants || [],
        combatRound: lastScene.combatRound ?? 1,
        currentTurnIndex: lastScene.currentTurnIndex ?? 0,
        sceneManagerVisible: false,
      });
    }
  },
  
  // Create a new empty scene (completely blank - no tokens, lights, or background)
  createNewScene: (name: string) => {
    const state = get();
    if (!state.currentBoard) return;
    
    const newScene: Scene = {
      id: crypto.randomUUID(),
      name,
      boardId: state.currentBoard.id,
      tokens: [],
      lights: [],
      audioSources: [],
      fogReveals: [],
      fogAdds: [],
      backgroundUrl: null, // Blank background
      mapBleedOverrideEnabled: state.sceneMapBleedOverrideEnabled,
      mapBleedEnabled: state.sceneMapBleedEnabled,
      mapBleedFeather: state.sceneMapBleedFeather,
      mapBleedBlur: state.sceneMapBleedBlur,
      mapBleedVignette: state.sceneMapBleedVignette,
      mapBleedScale: state.sceneMapBleedScale,
      backgroundColor: state.backgroundColor,
      gridColor: state.gridColor,
      gridSize: state.gridSize,
      gridOffsetX: state.gridOffsetX,
      gridOffsetY: state.gridOffsetY,
      gridUnit: state.gridUnit,
      gridStyle: state.gridStyle,
      gridOpacity: state.gridOpacity ?? 0.55,
      panFriction: state.panFriction,
      panEnabled: state.panEnabled,
      tokenDisplayMode: state.tokenDisplayMode,
      weatherType: 'none',
      weatherIntensity: 50,
      weatherSpeed: 50,
      weatherSize: 5,
      weatherColor: '#ffffff',
      weatherDirection: 270,
      weatherWobble: 50,
      weatherWobbleAmplitude: 50,
      weatherParticleShape: undefined,
      activeWeatherEffects: [],
      weatherFilterEffects: [],
      manualParticleEmitters: [],
      // Battle/Combat state - new scene starts fresh
      isInCombat: false,
      combatants: [],
      combatRound: 1,
      currentTurnIndex: 0,
      createdAt: new Date(),
    };
    
    const key = 'vtt_scenes';
    const existingScenes = JSON.parse(localStorage.getItem(key) || '[]');
    const updatedScenes = [...existingScenes, newScene];
    localStorage.setItem(key, JSON.stringify(updatedScenes));
    
    set({ scenes: updatedScenes });
  },

  // Dice Roller
  setDiceRollerVisible: (visible: boolean) => set({ diceRollerVisible: visible, panelFocus: visible ? 'diceRoller' : null }),
  toggleDiceRoller: () => set((state) => ({ 
    diceRollerVisible: !state.diceRollerVisible,
    panelFocus: !state.diceRollerVisible ? 'diceRoller' : null
  })),
  addDiceRoll: (roll: DiceRoll) => set((state) => {
    // Keep only last 50 rolls
    const newHistory = [...state.diceRollHistory, roll].slice(-50);
    return { diceRollHistory: newHistory };
  }),
  clearDiceRollHistory: () => set({ diceRollHistory: [] }),

  // Macros
  setMacrosVisible: (visible: boolean) => set({ macrosVisible: visible, panelFocus: visible ? 'macrosPanel' : null }),
  toggleMacros: () => set((state) => ({ 
    macrosVisible: !state.macrosVisible,
    panelFocus: !state.macrosVisible ? 'macrosPanel' : null
  })),
  setRollTablePanelVisible: (visible: boolean) => set({ rollTablePanelVisible: visible, panelFocus: visible ? 'rollTablePanel' : null }),
  toggleRollTablePanel: () => set((state) => ({
    rollTablePanelVisible: !state.rollTablePanelVisible,
    panelFocus: !state.rollTablePanelVisible ? 'rollTablePanel' : null,
  })),
  setMacrosPanelPosition: (position: { x: number; y: number }) => set({ macrosPanelPosition: position }),
  setMacrosPanelSize: (size: { width: number; height: number }) => set({ macrosPanelSize: size }),
  setRollTablePanelPosition: (position: { x: number; y: number }) => set({ rollTablePanelPosition: position }),
  setRollTablePanelSize: (size: { width: number; height: number }) => set({ rollTablePanelSize: size }),
  setRollTables: (tables: RollTable[] | ((prev: RollTable[]) => RollTable[])) => {
    set((state) => {
      const nextTables = typeof tables === 'function' ? tables(state.rollTables) : tables;
      saveRollTablesToStorage(nextTables);
      return { rollTables: nextTables };
    });
  },
  addRollTable: (table: RollTable) => {
    set((state) => {
      const nextTables = [...state.rollTables, table];
      saveRollTablesToStorage(nextTables);
      return { rollTables: nextTables };
    });
  },
  updateRollTable: (tableId: string, updates: Partial<RollTable>) => {
    set((state) => {
      const nextTables = state.rollTables.map((table) =>
        table.id === tableId ? { ...table, ...updates, id: table.id } : table,
      );
      saveRollTablesToStorage(nextTables);
      return { rollTables: nextTables };
    });
  },
  deleteRollTable: (tableId: string) => {
    set((state) => {
      const nextTables = state.rollTables.filter((table) => table.id !== tableId);
      saveRollTablesToStorage(nextTables);
      return { rollTables: nextTables };
    });
  },

  setAudioPanelVisible: (visible: boolean) => set({ audioPanelVisible: visible, panelFocus: visible ? 'audioPanel' : null }),
  toggleAudioPanel: () => set((state) => ({ 
    audioPanelVisible: !state.audioPanelVisible,
    panelFocus: !state.audioPanelVisible ? 'audioPanel' : null
  })),
  setAudioPanelPosition: (position: { x: number; y: number }) => set({ audioPanelPosition: position }),
  setAudioPanelSize: (size: { width: number; height: number }) => set({ audioPanelSize: size }),
  setPlayerListPanelPosition: (position: { x: number; y: number }) => {
    try {
      localStorage.setItem('vtt-playerListPanel-position', JSON.stringify(position));
    } catch (e) {}
    set({ playerListPanelPosition: position });
  },
  setPlayerListPanelSize: (size: { width: number; height: number }) => {
    try {
      localStorage.setItem('vtt-playerListPanel-size', JSON.stringify(size));
    } catch (e) {}
    set({ playerListPanelSize: size });
  },

  // Global Audio setters
  setCurrentAudioTrack: (trackId: string | null, fileName: string | null) => set({ currentAudioTrack: trackId, currentAudioFile: fileName }),
  setIsAudioPlaying: (playing: boolean) => set({ isAudioPlaying: playing }),
  setAudioVolume: (volume: number) => set({ audioVolume: volume }),

  // Audio channel volume setters - persisted to localStorage
  setMasterVolume: (volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    try {
      localStorage.setItem('vtt-master-volume', JSON.stringify(clampedVolume));
    } catch (e) {}
    set({ masterVolume: clampedVolume });
  },
  setMusicVolume: (volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    try {
      localStorage.setItem('vtt-music-volume', JSON.stringify(clampedVolume));
    } catch (e) {}
    set({ musicVolume: clampedVolume });
  },
  setEnvironmentVolume: (volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    try {
      localStorage.setItem('vtt-environment-volume', JSON.stringify(clampedVolume));
    } catch (e) {}
    set({ environmentVolume: clampedVolume });
  },
  setUiVolume: (volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    try {
      localStorage.setItem('vtt-ui-volume', JSON.stringify(clampedVolume));
    } catch (e) {}
    set({ uiVolume: clampedVolume });
  },
  
  // Custom Playlists - persisted to localStorage (supports both direct value and callback function)
  setCustomPlaylists: (playlists: AudioPlaylist[] | ((prev: AudioPlaylist[]) => AudioPlaylist[])) => {
    set((state) => {
      const newPlaylists = typeof playlists === 'function' 
        ? playlists(state.customPlaylists) 
        : playlists;
      saveCustomPlaylistsToStorage(newPlaylists);
      return { customPlaylists: newPlaylists };
    });
  },

  // Dice Roller
  setDiceRollerPosition: (position: { x: number; y: number }) => set({ diceRollerPosition: position }),
  setDiceRollerSize: (size: { width: number; height: number }) => set({ diceRollerSize: size }),

  setCombatantOrder: (tokenId, newIndex) =>
    set((state) => {
      const currentIndex = state.combatants.findIndex((combatant) => combatant.tokenId === tokenId);
      const clampedIndex = Math.max(0, Math.min(newIndex, Math.max(0, state.combatants.length - 1)));
      if (currentIndex === -1 || currentIndex === clampedIndex) return state;
      
      const newCombatants = [...state.combatants];
      const [removed] = newCombatants.splice(currentIndex, 1);
      newCombatants.splice(clampedIndex, 0, removed);
      
      return { combatants: newCombatants };
    }),

  // Light actions
  addLight: (light: Light) => set(state => ({
    lights: [...state.lights, light]
  })),

  updateLight: (lightId: string, updates: Partial<Light>) => set(state => ({
    lights: state.lights.map(light =>
      light.id === lightId ? { ...light, ...updates } : light
    )
  })),

  removeLight: (lightId: string) => set(state => ({
    lights: state.lights.filter(light => light.id !== lightId)
  })),

  setLights: (lights: Light[]) => set({ lights }),

  // Audio source actions
  addAudioSource: (audioSource: AudioSource) => set(state => ({
    audioSources: [...state.audioSources, audioSource]
  })),

  updateAudioSource: (audioSourceId: string, updates: Partial<AudioSource>) => set(state => ({
    audioSources: state.audioSources.map(audioSource =>
      audioSource.id === audioSourceId ? { ...audioSource, ...updates } : audioSource
    )
  })),

  removeAudioSource: (audioSourceId: string) => set(state => ({
    audioSources: state.audioSources.filter(audioSource => audioSource.id !== audioSourceId)
  })),

  setAudioSources: (audioSources: AudioSource[]) => set({ audioSources }),

  isUserGM: () => get().isGM,
}));
