import { useState, useRef, useMemo, memo, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import type { WeatherEffectConfig, WeatherFilterConfig, WeatherFilterType } from '../store/gameStore';
import { socketService } from '../services/socket';
import { DEFAULT_COLOR_SCHEMES } from '../../../shared/src/index';
import type { ColorScheme } from '../../../shared/src/index';
import { Icon } from './Icon';
import { Button, Dropdown, Slider } from './ui/primitives';
import { colors, radius, shadows, spacing } from '../ui/tokens';
import {
  createDefaultWeatherFilterEffect,
  getDefaultWeatherFilterEffects,
  getPresetForType,
  PIXI_WEATHER_FILTER_DEFINITIONS,
  type WeatherFilterDefinition,
  type WeatherFilterSettingDefinition,
  type WeatherType,
} from './WeatherEffects';
import type { ParticlePreset } from '../particles/editor/particleSchema';
import {
  getParticlePresetById,
  subscribeParticlePresets,
  updateParticlePreset,
} from '../particles/editor/particlePresetStore';
import { getActivatedTextColor, TOKEN_DISPOSITIONS, type TokenDisposition } from '../utils/colorUtils';
import { VISUAL_OPTIONS, setAtmosphericFog, setFogEnabled, setFogIntensity, setFogSpeed, setFogShift, setFogDirection, setFogColor1, setFogColor2 } from '../utils/gameTime';

// Helper function to calculate if text should be light or dark based on background brightness
// Uses the formula: (R * 299 + G * 587 + B * 114) / 1000
// If result > 128, background is light, so use dark text; otherwise use light text
const getContrastTextColor = (hexColor: string): string => {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? '#000000' : '#ffffff';
};

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

const FREE_TEXTURE_PRESETS = [
  { label: 'Smoke A', url: 'https://opengameart.org/sites/default/files/smoke1.png' },
  { label: 'Smoke B', url: 'https://opengameart.org/sites/default/files/smoke3.png' },
  { label: 'Sparkle 1', url: 'https://opengameart.org/sites/default/files/bishie_sparkle_1.png' },
  { label: 'Sparkle 2', url: 'https://opengameart.org/sites/default/files/bishie_sparkle_2.png' },
  { label: 'Star', url: 'https://opengameart.org/sites/default/files/9_pointed_star.png' },
  { label: 'Dust', url: 'https://opengameart.org/sites/default/files/mudpaint_0.png' },
];

const WEATHER_LABELS: Record<string, string> = {
  rain: 'Rain',
  snow: 'Snow',
  fog: 'Fog',
  clouds: 'Clouds',
  fireflies: 'Fireflies',
  embers: 'Embers',
  sparkles: 'Sparkles',
  hearts: 'Hearts',
};

const WEATHER_SECTION_STYLE = {
  marginTop: 'var(--space-3)',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-3)',
  background: 'var(--color-state-hover)',
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function weatherEffectFromPreset(preset: ParticlePreset | undefined, fallback: WeatherEffectConfig): WeatherEffectConfig {
  if (!preset) return fallback;

  const avgSize = ((preset.startSize ?? fallback.size) + (preset.endSize ?? fallback.size)) / 2;
  const size = clamp(Math.round((((avgSize / 6.5) - 0.25) / 2.25) * 100), 1, 200);
  const lifetime = clamp(Math.round(((preset.lifetimeMinMs ?? fallback.lifetime) + (preset.lifetimeMaxMs ?? fallback.lifetime)) / 2), 1000, 30000);
  const intensity = clamp(Math.round((preset.emitRate - 8) / 2.4), 0, 100);
  const opacity = clamp(Math.round((preset.startAlpha ?? 1) * 100), 0, 100);
  const direction = typeof preset.directionDeg === 'number' ? ((preset.directionDeg % 360) + 360) % 360 : fallback.direction;

  return {
    ...fallback,
    color: preset.startColor ?? fallback.color,
    size,
    lifetime,
    intensity,
    opacity,
    direction,
  };
}

function applyWeatherSettingsToPreset(basePreset: ParticlePreset, weather: WeatherEffectConfig): ParticlePreset {
  const next = { ...basePreset };

  next.startColor = weather.color;
  next.endColor = weather.color;

  const particleScale = 0.25 + (weather.size / 100) * 2.25;
  next.startSize = Math.round(4 * particleScale);
  next.endSize = Math.round(9 * particleScale);

  next.lifetimeMinMs = weather.lifetime;
  next.lifetimeMaxMs = weather.lifetime;

  next.emitRate = Math.round(8 + weather.intensity * 2.4);
  next.maxParticles = Math.round(30 + weather.intensity * 3.8);

  next.startAlpha = weather.opacity / 100;
  next.endAlpha = weather.opacity / 100;

  next.directionDeg = weather.direction;

  return next;
}

export const Toolbar = memo(function Toolbar() {
  const { 
    isGM, 
    currentBoard, 
    session,
    backgroundColor, 
    gridColor, 
    setBackgroundColor, 
    setGridColor, 
    gridSize, 
    setGridSize, 
    gridOffsetX, 
    gridOffsetY, 
    setGridOffsetX, 
    setGridOffsetY,
    gridType,
    setGridType,
    gridStyle,
    setGridStyle,
    gridStyleAmount,
    setGridStyleAmount,
    gridOpacity,
    setGridOpacity,
    mapBleedEnabled,
    mapBleedFeather,
    mapBleedBlur,
    mapBleedVignette,
    mapBleedScale,
    setMapBleedEnabled,
    setMapBleedFeather,
    setMapBleedBlur,
    setMapBleedVignette,
    setMapBleedScale,
    gridEditMode,
    setGridEditMode,
    squareValue,
    setSquareValue,
    showMoveMeasure,
    setShowMoveMeasure,
    dragMode,
    setDragMode,
    colorScheme,
    setColorScheme,
    statusIconColor,
    setStatusIconColor,
    boxSelectionColor,
    setBoxSelectionColor,
    boxSelectionBgColor,
    setBoxSelectionBgColor,
    weatherType,
    weatherIntensity,
    weatherSpeed,
    weatherSize,
    weatherColor,
    weatherTextureUrl,
    weatherOpacity,
    weatherDirection,
    weatherWobble,
    weatherWobbleAmplitude,
    weatherParticleShape,
    weatherCustomTextures,
    weatherVisible,
    toggleWeather,
    setWeatherType,
    setWeatherIntensity,
    setWeatherSpeed,
    setWeatherSize,
    setWeatherColor,
    setWeatherTextureUrl,
    setWeatherOpacity,
    setWeatherDirection,
    setWeatherWobble,
    setWeatherWobbleAmplitude,
    setWeatherParticleShape,
    setWeatherCustomTexture,
    activeWeatherEffects,
    weatherFilterEffects,
    setActiveWeatherEffects,
    setWeatherFilterEffects,
    addWeatherEffect,
    updateWeatherFilterEffect,
    updateWeatherEffect,
    removeWeatherEffect,
    dndManagerVisible,
    toggleDndManager,
    sceneManagerVisible,
    toggleSceneManager,
    combatTrackerVisible,
    toggleCombatTracker,
    defaultShowTokenName,
    setDefaultShowTokenName,
    defaultShowPlayerHp,
    setDefaultShowPlayerHp,
    defaultShowOtherHp,
    setDefaultShowOtherHp,
    defaultTokenDisposition,
    setDefaultTokenDisposition,
    tokenHpSource,
    setTokenHpSource,
    chatCardsCollapsedByDefault,
    setChatCardsCollapsedByDefault,
    turnTokenImageUrl,
    setTurnTokenImageUrl,
    battleStinger,
    setBattleStinger,
    battleStingerCustomUrl,
    setBattleStingerCustomUrl,
    combatPlaylist,
    setCombatPlaylist,
    customPlaylists,
    panFriction,
    setPanFriction,
    panEnabled,
    setPanEnabled,
    tokenDisplayMode,
    setTokenDisplayMode,
    focusOnSelectedKey,
    setFocusOnSelectedKey,
    tweenSettings,
    setTweenSettings,
    screenShakeSettings,
    setScreenShakeSettings,
    pencilSmoothness,
    setPencilSmoothness,
    pencilDrawRate,
    setPencilDrawRate,
    pencilFogColor,
    setPencilFogColor,
    fogSnapToGrid,
    setFogSnapToGrid,
    dice3dEnabled,
    setDice3dEnabled,
    dice3dColor,
    setDice3dColor,
    dice3dMaterial,
    setDice3dMaterial,
    dice3dTheme,
    setDice3dTheme,
    dice3dSize,
    setDice3dSize,
    dice3dRollForce,
    setDice3dRollForce,
    dice3dTorque,
    setDice3dTorque,
    dice3dScaleMultiplier,
    setDice3dScaleMultiplier,
    dice3dWorldSizeMultiplier,
    setDice3dWorldSizeMultiplier,
    dice3dStartingHeightMultiplier,
    setDice3dStartingHeightMultiplier,
    dice3dRestitutionMultiplier,
    setDice3dRestitutionMultiplier,
    dice3dFrictionMultiplier,
    setDice3dFrictionMultiplier,
    dice3dLightIntensityMultiplier,
    setDice3dLightIntensityMultiplier,
    dice3dShadowTransparencyMultiplier,
    setDice3dShadowTransparencyMultiplier,
    dice3dTorqueThrowCoupling,
    setDice3dTorqueThrowCoupling,
    dice3dRollDirectionMode,
    setDice3dRollDirectionMode,
    dice3dRollDirectionDegrees,
    setDice3dRollDirectionDegrees,
    dice3dShowBoundariesOverlay,
    setDice3dShowBoundariesOverlay,
    diceRollerVisible,
    toggleDiceRoller,
    macrosVisible,
    toggleMacros,
    rollTablePanelVisible,
    toggleRollTablePanel,
    audioPanelVisible,
    toggleAudioPanel,
    fileBrowserVisible,
    toggleFileBrowser,
    particleEmitterVisible,
    toggleParticleEmitter,
    setTool,
    setParticlePreset,
    // Game time controls
    gameTimeVisible,
    toggleGameTime,
    lights,
    removeLight,
  } = useGameStore();
  
  const [showUpload, setShowUpload] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Close all toolbar panels when toolbar hides
  useEffect(() => {
    const handleCloseToolbarPanels = () => {
      setShowSettings(false);
      setShowUpload(false);
      setMapGridExpanded(false);
      setMapBleedExpanded(false);
      setMapFogExpanded(false);
      setSettingsPanningExpanded(false);
      setSettingsAudioFadeExpanded(false);
      setSettingsKeyBindingsExpanded(false);
      setSettingsTokenDefaultsExpanded(false);
      setSettingsDice3dExpanded(false);
      setSettingsBattleExpanded(false);
      setSettingsChatExpanded(false);
      setThemeExpanded(false);
      setTweenExpanded(false);
      setScreenShakeExpanded(false);
      setWeatherFilterExpanded({});
      setFullScreenEffectsExpanded(true);
      setWeatherParticlesExpanded(true);
      setFogShaderExpanded(false);
      setExpandedWeatherEffectId(null);
      setShowDice3dAdvancedModal(false);
      setShowTokenDefaultsAdvancedModal(false);
      if (weatherVisible) {
        toggleWeather();
      }
    };
    
    window.addEventListener('closeToolbarPanels', handleCloseToolbarPanels);
    return () => window.removeEventListener('closeToolbarPanels', handleCloseToolbarPanels);
  }, [weatherVisible, toggleWeather]);
  
  const [mapGridExpanded, setMapGridExpanded] = useState(false);
  const [mapBleedExpanded, setMapBleedExpanded] = useState(false);
  const [mapFogExpanded, setMapFogExpanded] = useState(false);
  const [settingsPanningExpanded, setSettingsPanningExpanded] = useState(false);
  const [settingsAudioFadeExpanded, setSettingsAudioFadeExpanded] = useState(false);
  const [settingsKeyBindingsExpanded, setSettingsKeyBindingsExpanded] = useState(false);
  const [settingsTokenDefaultsExpanded, setSettingsTokenDefaultsExpanded] = useState(false);
  const [settingsDice3dExpanded, setSettingsDice3dExpanded] = useState(false);
  const [settingsBattleExpanded, setSettingsBattleExpanded] = useState(false);
  const [settingsChatExpanded, setSettingsChatExpanded] = useState(false);
  const [themeExpanded, setThemeExpanded] = useState(false);
  const [tweenExpanded, setTweenExpanded] = useState(false);
  const [screenShakeExpanded, setScreenShakeExpanded] = useState(false);
  const [showDice3dAdvancedModal, setShowDice3dAdvancedModal] = useState(false);
  const [showTokenDefaultsAdvancedModal, setShowTokenDefaultsAdvancedModal] = useState(false);
  const [selectedWeatherEffectId, setSelectedWeatherEffectId] = useState<string | null>(null);
  const [expandedWeatherEffectId, setExpandedWeatherEffectId] = useState<string | null>(null);
  const [weatherFilterExpanded, setWeatherFilterExpanded] = useState<Partial<Record<WeatherFilterType, boolean>>>({});
  const [fullScreenEffectsExpanded, setFullScreenEffectsExpanded] = useState(true);
  const [weatherParticlesExpanded, setWeatherParticlesExpanded] = useState(true);
  const [fogShaderExpanded, setFogShaderExpanded] = useState(false);
  const [, setParticlePresetRevision] = useState(0);
  
  // Fog shader settings - initialized from VISUAL_OPTIONS
  const [fogEnabled, setFogEnabledState] = useState(VISUAL_OPTIONS.fogEnabled);
  const [fogShift, setFogShiftState] = useState(VISUAL_OPTIONS.fogShift);
  const [fogIntensity, setFogIntensityState] = useState(VISUAL_OPTIONS.fogIntensity);
  const [fogSpeed, setFogSpeedState] = useState(VISUAL_OPTIONS.fogSpeed);
  const [fogDirection, setFogDirectionState] = useState(VISUAL_OPTIONS.fogDirection);
  const [fogColor1, setFogColor1State] = useState(VISUAL_OPTIONS.fogColor1);
  const [fogColor2, setFogColor2State] = useState(VISUAL_OPTIONS.fogColor2);
  
  // Ensure atmosphericFog is enabled on mount
  useEffect(() => {
    if (!VISUAL_OPTIONS.atmosphericFog) {
      console.log('Enabling atmosphericFog on mount');
      setAtmosphericFog(true);
    }
  }, []);

  useEffect(() => {
    if (weatherFilterEffects.length === 0) {
      setWeatherFilterEffects(getDefaultWeatherFilterEffects());
    }
  }, [weatherFilterEffects.length, setWeatherFilterEffects]);

  useEffect(() => {
    const unsubscribe = subscribeParticlePresets(() => {
      setParticlePresetRevision((value) => value + 1);
    });
    return () => unsubscribe();
  }, []);

  const syncWeatherEffectToPreset = (effect: WeatherEffectConfig, updates: Partial<WeatherEffectConfig>) => {
    const weatherPresetId = WEATHER_TYPE_TO_PRESET[effect.type] || '';
    if (!weatherPresetId) return;
    const preset = getParticlePresetById(weatherPresetId);
    if (!preset) return;

    const mergedEffect = { ...effect, ...updates };
    updateParticlePreset(applyWeatherSettingsToPreset(preset, mergedEffect));
  };

  const updateWeatherEffectWithPresetSync = (effect: WeatherEffectConfig, updates: Partial<WeatherEffectConfig>) => {
    updateWeatherEffect(effect.id, updates);
    syncWeatherEffectToPreset(effect, updates);
  };

  const upsertWeatherFilter = (type: WeatherFilterType, updater: (effect: WeatherFilterConfig) => WeatherFilterConfig) => {
    const existing = weatherFilterEffects.find((effect) => effect.type === type);
    if (existing) {
      const updated = updater(existing);
      updateWeatherFilterEffect(existing.id, updated);
      return;
    }

    const created = updater(createDefaultWeatherFilterEffect(type));
    setWeatherFilterEffects([...weatherFilterEffects, created]);
  };
  
  const tokenInputRef = useRef<HTMLInputElement>(null);
  const turnTokenInputRef = useRef<HTMLInputElement>(null);
  const battleStingerInputRef = useRef<HTMLInputElement>(null);

  // Generate icon color for activated buttons based on background
  const activatedToolBtnStyle = useMemo(() => {
    const bgHex = `#${backgroundColor.toString(16).padStart(6, '0')}`;
    return { color: getActivatedTextColor(bgHex) };
  }, [backgroundColor]);

  const emitGridSettingsUpdate = (overrides: {
    gridType?: 'square' | 'hex';
    gridSize?: number;
    gridColor?: number;
    gridOffsetX?: number;
    gridOffsetY?: number;
    gridStyle?: 'solid' | 'dashed' | 'dotted';
    gridStyleAmount?: number;
    gridOpacity?: number;
  }) => {
    if (!currentBoard) return;
    socketService.updateBoard(currentBoard.id, {
      gridType: overrides.gridType ?? gridType,
      gridSize: overrides.gridSize ?? gridSize,
      gridColor: overrides.gridColor ?? gridColor,
      gridOffsetX: overrides.gridOffsetX ?? gridOffsetX,
      gridOffsetY: overrides.gridOffsetY ?? gridOffsetY,
      gridStyle: overrides.gridStyle ?? gridStyle,
      gridStyleAmount: overrides.gridStyleAmount ?? gridStyleAmount,
      gridOpacity: overrides.gridOpacity ?? (gridOpacity ?? 0.55),
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'token') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // If no board, create one first
    if (!currentBoard && session) {
      socketService.createBoard('Main Board');
      setTimeout(() => {
        handleFileUpload(e, type);
      }, 500);
      return;
    }

    if (!currentBoard) return;

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.url) {
        // Snap to grid center
        const gridSize = currentBoard.gridSize || 50;
        const x = Math.floor((currentBoard.width / 2) / gridSize) * gridSize + gridSize / 2;
        const y = Math.floor((currentBoard.height / 2) / gridSize) * gridSize + gridSize / 2;

        // Apply default settings for new tokens
        const tokenData: {
          name: string;
          imageUrl: string;
          x: number;
          y: number;
          size: number;
          showLabel?: boolean;
          bars?: string;
          properties?: Record<string, unknown>;
        } = {
          name: file.name.replace(/\.[^/.]+$/, ''),
          imageUrl: data.url,
          x,
          y,
          size: 1,
        };

        // Apply default showLabel setting
        if (defaultShowTokenName) {
          tokenData.showLabel = true;
        }

        // Apply default HP bar setting for player's own tokens (owner is current user)
        if (defaultShowPlayerHp) {
          tokenData.bars = JSON.stringify([{ name: 'HP', current: 10, max: 10, color: '#e94560' }]);
        }

        // Apply default token disposition if set
        if (defaultTokenDisposition) {
          tokenData.properties = { disposition: defaultTokenDisposition };
        }

        socketService.createToken(currentBoard.id, tokenData);
      }
    } catch (error) {
      console.error('Upload failed:', error);
    }

    // Reset inputs
    if (tokenInputRef.current) tokenInputRef.current.value = '';
    setShowUpload(false);
  };

  const handleTurnTokenUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.url) {
        setTurnTokenImageUrl(data.url);
      }
    } catch (error) {
      console.error('Turn token upload failed:', error);
    }

    if (turnTokenInputRef.current) turnTokenInputRef.current.value = '';
  };

  const handleBattleStingerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append('files', file);

      const res = await fetch('/api/upload-audio', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      
      if (data.success && data.files && data.files.length > 0) {
        const uploadedPath = data.files[0].path;
        setBattleStingerCustomUrl(uploadedPath);
        setBattleStinger('custom');
      }
    } catch (error) {
      console.error('Battle stinger upload failed:', error);
    }

    if (battleStingerInputRef.current) battleStingerInputRef.current.value = '';
  };

  // Advanced Settings Modal Component
  function AdvancedModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    const modalRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ x: 360, y: 80 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    const isCustomTheme = colorScheme && (colorScheme.id.includes('-custom-') || colorScheme.id === 'custom');
    const modalBackground = isCustomTheme ? colorScheme.surface : '#1a1a2e';
    const modalText = isCustomTheme ? colorScheme.text : '#e0e0e0';
    const modalBorder = isCustomTheme ? `1px solid ${colorScheme.accent}` : '1px solid #444';

    const handleMouseDown = (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input') || (e.target as HTMLElement).closest('.slider') || (e.target as HTMLElement).closest('select')) return;
      setIsDragging(true);
      setDragOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    useEffect(() => {
      if (!isDragging) return;
      const handleMouseMove = (e: MouseEvent) => {
        setPosition({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
      };
      const handleMouseUp = () => setIsDragging(false);
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }, [isDragging, dragOffset]);

    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2147483647 }} onClick={onClose}>
        <div
          ref={modalRef}
          style={{
            position: 'absolute',
            left: position.x,
            top: position.y,
            background: modalBackground,
            padding: spacing[5],
            borderRadius: radius.lg,
            border: modalBorder,
            width: '380px',
            maxHeight: 'calc(100vh - 100px)',
            overflowY: 'auto',
            boxShadow: shadows.md,
            cursor: isDragging ? 'grabbing' : 'default',
            userSelect: 'none',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', cursor: 'grab' }}
            onMouseDown={handleMouseDown}
          >
            <h3 style={{ color: modalText, margin: 0, fontSize: '16px' }}>{title}</h3>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: modalText, opacity: 0.6, cursor: 'pointer', padding: '4px', fontSize: '18px' }}>
              <Icon name="times" />
            </button>
          </div>
          {children}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* 3D Dice Advanced Modal */}
      {showDice3dAdvancedModal && (
        <AdvancedModal title="3D Dice Advanced Settings" onClose={() => setShowDice3dAdvancedModal(false)}>
          <div className="toolbar-settings-stack">
            <div className="toolbar-settings-card toolbar-settings-card-stack">
              <Slider label={`Size: ${dice3dSize.toFixed(2)}x`} min="0.6" max="1.4" step="0.01" value={dice3dSize} onChange={(e) => setDice3dSize(parseFloat(e.target.value))} />
            </div>
            <div className="toolbar-settings-card toolbar-settings-card-stack">
              <Slider label={`Roll Force: ${dice3dRollForce.toFixed(2)}x`} min="0.5" max="1.8" step="0.01" value={dice3dRollForce} onChange={(e) => setDice3dRollForce(parseFloat(e.target.value))} />
            </div>
            <div className="toolbar-settings-card toolbar-settings-card-stack">
              <Slider label={`Torque: ${dice3dTorque.toFixed(2)}x`} min="0.5" max="2.0" step="0.01" value={dice3dTorque} onChange={(e) => setDice3dTorque(parseFloat(e.target.value))} />
            </div>
            <div className="toolbar-settings-card toolbar-settings-card-stack">
              <Slider label={`Scale Multiplier: ${dice3dScaleMultiplier.toFixed(2)}x`} min="0.6" max="1.6" step="0.01" value={dice3dScaleMultiplier} onChange={(e) => setDice3dScaleMultiplier(parseFloat(e.target.value))} />
            </div>
            <div className="toolbar-settings-card toolbar-settings-card-stack">
              <Slider label={`World Size Multiplier: ${dice3dWorldSizeMultiplier.toFixed(2)}x`} min="0.6" max="1.6" step="0.01" value={dice3dWorldSizeMultiplier} onChange={(e) => setDice3dWorldSizeMultiplier(parseFloat(e.target.value))} />
            </div>
            <div className="toolbar-settings-card toolbar-settings-card-stack">
              <Slider label={`Spawn Height: ${dice3dStartingHeightMultiplier.toFixed(2)}x`} min="0.6" max="1.8" step="0.01" value={dice3dStartingHeightMultiplier} onChange={(e) => setDice3dStartingHeightMultiplier(parseFloat(e.target.value))} />
            </div>
            <div className="toolbar-settings-card toolbar-settings-card-stack">
              <Slider label={`Restitution: ${dice3dRestitutionMultiplier.toFixed(2)}x`} min="0.4" max="1.8" step="0.01" value={dice3dRestitutionMultiplier} onChange={(e) => setDice3dRestitutionMultiplier(parseFloat(e.target.value))} />
            </div>
            <div className="toolbar-settings-card toolbar-settings-card-stack">
              <Slider label={`Friction: ${dice3dFrictionMultiplier.toFixed(2)}x`} min="0.6" max="1.4" step="0.01" value={dice3dFrictionMultiplier} onChange={(e) => setDice3dFrictionMultiplier(parseFloat(e.target.value))} />
            </div>
            <div className="toolbar-settings-card toolbar-settings-card-stack">
              <Slider label={`Light Intensity: ${dice3dLightIntensityMultiplier.toFixed(2)}x`} min="0.5" max="1.8" step="0.01" value={dice3dLightIntensityMultiplier} onChange={(e) => setDice3dLightIntensityMultiplier(parseFloat(e.target.value))} />
            </div>
            <div className="toolbar-settings-card toolbar-settings-card-stack">
              <Slider label={`Shadow Transparency: ${dice3dShadowTransparencyMultiplier.toFixed(2)}x`} min="0.5" max="1.6" step="0.01" value={dice3dShadowTransparencyMultiplier} onChange={(e) => setDice3dShadowTransparencyMultiplier(parseFloat(e.target.value))} />
            </div>
            <div className="toolbar-settings-card toolbar-settings-card-stack">
              <Slider label={`Torque→Force: ${dice3dTorqueThrowCoupling.toFixed(2)}x`} min="0.4" max="1.4" step="0.01" value={dice3dTorqueThrowCoupling} onChange={(e) => setDice3dTorqueThrowCoupling(parseFloat(e.target.value))} />
            </div>
            <div className="toolbar-settings-card toolbar-settings-card-stack">
              <div className="toolbar-settings-inline toolbar-settings-spread">
                <span className="toolbar-settings-caption">Roll Direction</span>
                <Button onClick={() => setDice3dRollDirectionMode(dice3dRollDirectionMode === 'random' ? 'fixed' : 'random')} variant={dice3dRollDirectionMode === 'random' ? 'ghost' : 'primary'} size="sm">{dice3dRollDirectionMode === 'random' ? 'Random' : 'Fixed'}</Button>
              </div>
              <Slider label={`Direction: ${Math.round(dice3dRollDirectionDegrees)}°`} min="0" max="360" step="1" value={dice3dRollDirectionDegrees} onChange={(e) => setDice3dRollDirectionDegrees(parseFloat(e.target.value))} disabled={dice3dRollDirectionMode === 'random'} />
            </div>
            <div className="toolbar-settings-card">
              <span className="toolbar-settings-caption">Show Boundaries Overlay</span>
              <Button onClick={() => setDice3dShowBoundariesOverlay(!dice3dShowBoundariesOverlay)} variant={dice3dShowBoundariesOverlay ? 'primary' : 'ghost'} size="sm">{dice3dShowBoundariesOverlay ? 'ON' : 'OFF'}</Button>
            </div>
          </div>
        </AdvancedModal>
      )}

      {/* Token Display Defaults Advanced Modal */}
      {showTokenDefaultsAdvancedModal && (
        <AdvancedModal title="Token Display Advanced Settings" onClose={() => setShowTokenDefaultsAdvancedModal(false)}>
          <button onClick={() => setTweenExpanded(!tweenExpanded)} className="toolbar-settings-section-toggle" style={{ marginTop: '16px' }}>
            <span className="toolbar-settings-title">Tween Settings</span>
            <span className="toolbar-settings-title">{tweenExpanded ? '▾' : '▸'}</span>
          </button>
          {tweenExpanded && (
            <div className="toolbar-settings-block">
              <div className="toolbar-settings-card toolbar-settings-card-stack">
                <div className="toolbar-settings-group-title">Duration (ms)</div>
                <div className="toolbar-settings-card toolbar-settings-card-stack">
                  <Slider label={`Move Min: ${tweenSettings.moveMin}`} min="50" max="500" step="10" value={tweenSettings.moveMin} onChange={(e) => setTweenSettings({ moveMin: parseInt(e.target.value) })} />
                </div>
                <div className="toolbar-settings-card toolbar-settings-card-stack">
                  <Slider label={`Move Max: ${tweenSettings.moveMax}`} min="100" max="1000" step="10" value={tweenSettings.moveMax} onChange={(e) => setTweenSettings({ moveMax: parseInt(e.target.value) })} />
                </div>
                <div className="toolbar-settings-card toolbar-settings-card-stack">
                  <Slider label={`Attack: ${tweenSettings.attack}`} min="50" max="500" step="10" value={tweenSettings.attack} onChange={(e) => setTweenSettings({ attack: parseInt(e.target.value) })} />
                </div>
                <div className="toolbar-settings-card toolbar-settings-card-stack">
                  <Slider label={`Damage: ${tweenSettings.damage}`} min="50" max="500" step="10" value={tweenSettings.damage} onChange={(e) => setTweenSettings({ damage: parseInt(e.target.value) })} />
                </div>
                <div className="toolbar-settings-card toolbar-settings-card-stack">
                  <Slider label={`Heal: ${tweenSettings.heal}`} min="50" max="500" step="10" value={tweenSettings.heal} onChange={(e) => setTweenSettings({ heal: parseInt(e.target.value) })} />
                </div>
                <div className="toolbar-settings-card toolbar-settings-card-stack">
                  <Slider label={`Miss: ${tweenSettings.miss}`} min="50" max="500" step="10" value={tweenSettings.miss} onChange={(e) => setTweenSettings({ miss: parseInt(e.target.value) })} />
                </div>
                <div className="toolbar-settings-card toolbar-settings-card-stack">
                  <Slider label={`Downed: ${tweenSettings.downed}`} min="50" max="500" step="10" value={tweenSettings.downed} onChange={(e) => setTweenSettings({ downed: parseInt(e.target.value) })} />
                </div>
                <div className="toolbar-settings-card toolbar-settings-card-stack">
                  <Slider label={`Select: ${tweenSettings.selectPulse}`} min="100" max="2000" step="50" value={tweenSettings.selectPulse} onChange={(e) => setTweenSettings({ selectPulse: parseInt(e.target.value) })} />
                </div>
              </div>
              <div className="toolbar-settings-card toolbar-settings-card-stack">
                <div className="toolbar-settings-group-title">Easing Functions</div>
                <div className="toolbar-settings-card">
                  <span className="toolbar-settings-caption">Move</span>
                  <Dropdown value={tweenSettings.moveEasing} onChange={(e) => setTweenSettings({ moveEasing: e.target.value as any })} className="toolbar-compact-select">
                    <option value="easeOutQuad">easeOutQuad</option>
                    <option value="easeInOutQuad">easeInOutQuad</option>
                    <option value="easeInOutCubic">easeInOutCubic</option>
                    <option value="easeOutCubic">easeOutCubic</option>
                    <option value="easeOutBack">easeOutBack</option>
                  </Dropdown>
                </div>
                <div className="toolbar-settings-card">
                  <span className="toolbar-settings-caption">Attack</span>
                  <Dropdown value={tweenSettings.attackEasing} onChange={(e) => setTweenSettings({ attackEasing: e.target.value as any })} className="toolbar-compact-select">
                    <option value="easeOutQuad">easeOutQuad</option>
                    <option value="easeInOutQuad">easeInOutQuad</option>
                    <option value="easeInOutCubic">easeInOutCubic</option>
                    <option value="easeOutCubic">easeOutCubic</option>
                    <option value="easeOutBack">easeOutBack</option>
                  </Dropdown>
                </div>
                <div className="toolbar-settings-card">
                  <span className="toolbar-settings-caption">Damage</span>
                  <Dropdown value={tweenSettings.damageEasing} onChange={(e) => setTweenSettings({ damageEasing: e.target.value as any })} className="toolbar-compact-select">
                    <option value="easeOutQuad">easeOutQuad</option>
                    <option value="easeInOutQuad">easeInOutQuad</option>
                    <option value="easeInOutCubic">easeInOutCubic</option>
                    <option value="easeOutCubic">easeOutCubic</option>
                    <option value="easeOutBack">easeOutBack</option>
                  </Dropdown>
                </div>
                <div className="toolbar-settings-card">
                  <span className="toolbar-settings-caption">Heal</span>
                  <Dropdown value={tweenSettings.healEasing} onChange={(e) => setTweenSettings({ healEasing: e.target.value as any })} className="toolbar-compact-select">
                    <option value="easeOutQuad">easeOutQuad</option>
                    <option value="easeInOutQuad">easeInOutQuad</option>
                    <option value="easeInOutCubic">easeInOutCubic</option>
                    <option value="easeOutCubic">easeOutCubic</option>
                    <option value="easeOutBack">easeOutBack</option>
                  </Dropdown>
                </div>
                <div className="toolbar-settings-card">
                  <span className="toolbar-settings-caption">Miss</span>
                  <Dropdown value={tweenSettings.missEasing} onChange={(e) => setTweenSettings({ missEasing: e.target.value as any })} className="toolbar-compact-select">
                    <option value="easeOutQuad">easeOutQuad</option>
                    <option value="easeInOutQuad">easeInOutQuad</option>
                    <option value="easeInOutCubic">easeInOutCubic</option>
                    <option value="easeOutCubic">easeOutCubic</option>
                    <option value="easeOutBack">easeOutBack</option>
                  </Dropdown>
                </div>
                <div className="toolbar-settings-card">
                  <span className="toolbar-settings-caption">Downed</span>
                  <Dropdown value={tweenSettings.downedEasing} onChange={(e) => setTweenSettings({ downedEasing: e.target.value as any })} className="toolbar-compact-select">
                    <option value="easeOutQuad">easeOutQuad</option>
                    <option value="easeInOutQuad">easeInOutQuad</option>
                    <option value="easeInOutCubic">easeInOutCubic</option>
                    <option value="easeOutCubic">easeOutCubic</option>
                    <option value="easeOutBack">easeOutBack</option>
                  </Dropdown>
                </div>
                <div className="toolbar-settings-card">
                  <span className="toolbar-settings-caption">Select</span>
                  <Dropdown value={tweenSettings.selectEasing} onChange={(e) => setTweenSettings({ selectEasing: e.target.value as any })} className="toolbar-compact-select">
                    <option value="easeOutQuad">easeOutQuad</option>
                    <option value="easeInOutQuad">easeInOutQuad</option>
                    <option value="easeInOutCubic">easeInOutCubic</option>
                    <option value="easeOutCubic">easeOutCubic</option>
                    <option value="easeOutBack">easeOutBack</option>
                  </Dropdown>
                </div>
              </div>
              <Button onClick={() => setTweenSettings({ moveMin: 160, moveMax: 420, attack: 180, damage: 140, heal: 220, miss: 160, downed: 260, selectPulse: 900, moveEasing: 'easeInOutCubic', attackEasing: 'easeOutCubic', damageEasing: 'easeOutCubic', healEasing: 'easeOutQuad', missEasing: 'easeOutQuad', downedEasing: 'easeOutQuad', selectEasing: 'easeOutBack' })} variant="secondary" className="toolbar-full-width-button">Reset to Defaults</Button>
            </div>
          )}
          <button onClick={() => setScreenShakeExpanded(!screenShakeExpanded)} className="toolbar-settings-section-toggle" style={{ marginTop: '16px' }}>
            <span className="toolbar-settings-title">Screen Shake</span>
            <span className="toolbar-settings-title">{screenShakeExpanded ? '▾' : '▸'}</span>
          </button>
          {screenShakeExpanded && (
            <div className="toolbar-settings-block">
              <div className="toolbar-settings-card toolbar-settings-card-stack">
                <div className="toolbar-settings-inline toolbar-settings-spread">
                  <span className="toolbar-settings-caption">Global Enable</span>
                  <Button onClick={() => setScreenShakeSettings({ enabled: !screenShakeSettings.enabled })} variant={screenShakeSettings.enabled ? 'primary' : 'ghost'} size="sm">{screenShakeSettings.enabled ? 'ON' : 'OFF'}</Button>
                </div>
                <div className="toolbar-settings-card toolbar-settings-card-stack">
                  <Slider label={`Duration: ${screenShakeSettings.durationMs}ms`} min="80" max="1200" step="20" value={screenShakeSettings.durationMs} onChange={(e) => setScreenShakeSettings({ durationMs: parseInt(e.target.value, 10) })} />
                </div>
                {([{ key: 'damage', label: 'Damage', value: screenShakeSettings.damage }, { key: 'heal', label: 'Heal', value: screenShakeSettings.heal }, { key: 'downed', label: 'Downed', value: screenShakeSettings.downed }, { key: 'attack', label: 'Attack', value: screenShakeSettings.attack }, { key: 'miss', label: 'Miss', value: screenShakeSettings.miss }] as const).map(({ key, label, value }) => (
                  <div key={key} className="toolbar-settings-card toolbar-settings-card-stack">
                    <div className="toolbar-settings-inline toolbar-settings-spread">
                      <span className="toolbar-settings-caption">{label}</span>
                      <Button onClick={() => setScreenShakeSettings({ [key]: { ...value, enabled: !value.enabled } } as any)} variant={value.enabled ? 'primary' : 'ghost'} size="sm">{value.enabled ? 'ON' : 'OFF'}</Button>
                    </div>
                    <Slider label={`Intensity: ${value.intensity.toFixed(2)}`} min="0" max="2" step="0.05" value={value.intensity} onChange={(e) => setScreenShakeSettings({ [key]: { ...value, intensity: parseFloat(e.target.value) } } as any)} />
                  </div>
                ))}
                <Button onClick={() => setScreenShakeSettings({ enabled: false, durationMs: 260, damage: { enabled: false, intensity: 0.6 }, heal: { enabled: false, intensity: 0.35 }, downed: { enabled: false, intensity: 1 }, attack: { enabled: false, intensity: 0.3 }, miss: { enabled: false, intensity: 0.2 } })} variant="secondary" className="toolbar-full-width-button">Reset Shake Defaults</Button>
              </div>
            </div>
          )}
        </AdvancedModal>
      )}

      <div className="toolbar-anchor">
      {isGM && (
        <div className="toolbar">
          {/* Time Controls Toggle */}
          <button
            className={`tool-btn ${gameTimeVisible ? 'active' : ''}`}
            onClick={() => toggleGameTime()}
            title="Toggle Time Controls"
            style={gameTimeVisible ? activatedToolBtnStyle : undefined}
          >
            <Icon name="sun" />
          </button>

          <button
            className="tool-btn"
            onClick={() => tokenInputRef.current?.click()}
            title="Add Token"
          >
            <Icon name="theater-masks" />
          </button>
          <input
            ref={tokenInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleFileUpload(e, 'token')}
            className="toolbar-hidden-input"
          />

          <button
            className={`tool-btn ${showUpload ? 'active' : ''}`}
            onClick={() => setShowUpload(!showUpload)}
            title="Set Background"
            style={showUpload ? activatedToolBtnStyle : undefined}
          >
            <Icon name="image" />
          </button>
          {showUpload && (
            <div 
              className="background-panel"
            >
              <div className="background-panel-divider background-panel-header-block">
                <span className="background-panel-title">Map Settings</span>
              </div>
              
              {/* Clear Background Button */}
              <button
                onClick={() => {
                  if (currentBoard) {
                    socketService.clearBackground(currentBoard.id);
                    // Delete all lights in the scene (regardless of board association)
                    for (const light of lights) {
                      socketService.deleteLight(light.id);
                      removeLight(light.id);
                    }
                  }
                }}
                className="background-panel-btn"
              >
                <Icon name="trash" /> Clear Background
              </button>
              
              {/* Divider */}
              <div className="background-panel-divider"></div>
              
              {/* Grid Settings */}
              <button
                onClick={() => setMapGridExpanded(!mapGridExpanded)}
                className="background-panel-section-toggle background-panel-divider"
              >
                <span className="background-panel-section-title">Grid Settings</span>
                <span className="background-panel-section-title">{mapGridExpanded ? '▾' : '▸'}</span>
              </button>

              {mapGridExpanded && (
                <>
              {/* Colors Row */}
              <div className="background-panel-row">
                {/* Background Color */}
                <div className="background-panel-item">
                  <Icon name="palette" title="Background Color" />
                  <span className="background-panel-item-label">Bg</span>
                  <input
                    type="color"
                    value={`#${backgroundColor.toString(16).padStart(6, '0')}`}
                    onChange={(e) => setBackgroundColor(parseInt(e.target.value.slice(1), 16))}
                    className="background-panel-color-input"
                    title="Background Color"
                  />
                </div>

                {/* Grid Color */}
                <div className="background-panel-item">
                  <Icon name="border-none" title="Grid Color" />
                  <span className="background-panel-item-label">Grid</span>
                  <input
                    type="color"
                    value={`#${gridColor.toString(16).padStart(6, '0')}`}
                    onChange={(e) => {
                      const nextColor = parseInt(e.target.value.slice(1), 16);
                      setGridColor(nextColor);
                      emitGridSettingsUpdate({ gridColor: nextColor });
                    }}
                    className="background-panel-color-input"
                    title="Grid Color"
                  />
                </div>

                {/* Grid Opacity */}
                <div className="background-panel-item">
                  <Icon name="tint" title="Grid Opacity" />
                  <span className="background-panel-item-label">Alpha</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round((gridOpacity ?? 0.55) * 100)}
                    onChange={(e) => {
                      const nextOpacity = Number(e.target.value) / 100;
                      setGridOpacity(nextOpacity);
                      emitGridSettingsUpdate({ gridOpacity: nextOpacity });
                    }}
                    className="background-panel-slider"
                    title={`Grid Opacity: ${Math.round((gridOpacity ?? 0.55) * 100)}%`}
                  />
                  <span className="background-panel-value-label">{Math.round((gridOpacity ?? 0.55) * 100)}%</span>
                </div>
              </div>

              {/* Grid Size & Offset Row */}
              <div className="background-panel-row">
                {/* Grid Size */}
                <div className="background-panel-item">
                  <Icon name="ruler" title="Grid Size (px)" />
                  <span className="background-panel-item-label">Size</span>
                  <input
                    type="number"
                    value={gridSize}
                    onChange={(e) => {
                      const nextSize = Number(e.target.value);
                      setGridSize(nextSize);
                      emitGridSettingsUpdate({ gridSize: nextSize });
                    }}
                    min={20}
                    max={200}
                    className="background-panel-input background-panel-input-compact"
                    title="Grid Size (pixels)"
                  />
                </div>

                <div className="background-panel-item">
                  <span className="background-panel-item-label">Type</span>
                  <select
                    value={gridType || 'square'}
                    onChange={(e) => {
                      const nextType = e.target.value as 'square' | 'hex';
                      setGridType(nextType);
                      emitGridSettingsUpdate({ gridType: nextType });
                    }}
                    className="background-panel-input background-panel-input-compact"
                    title="Grid type"
                  >
                    <option value="square">Square</option>
                    <option value="hex">Hex</option>
                  </select>
                </div>

                {/* Grid Offset */}
                <div className="background-panel-item">
                  <span className="background-panel-item-label">Offset</span>
                  <label className="background-panel-item-label">X:</label>
                  <input
                    type="number"
                    value={gridOffsetX}
                    onChange={(e) => {
                      const nextOffsetX = Number(e.target.value);
                      setGridOffsetX(nextOffsetX);
                      emitGridSettingsUpdate({ gridOffsetX: nextOffsetX });
                    }}
                    className="background-panel-input background-panel-input-compact"
                    title="Grid Offset X"
                  />
                  <label className="background-panel-item-label">Y:</label>
                  <input
                    type="number"
                    value={gridOffsetY}
                    onChange={(e) => {
                      const nextOffsetY = Number(e.target.value);
                      setGridOffsetY(nextOffsetY);
                      emitGridSettingsUpdate({ gridOffsetY: nextOffsetY });
                    }}
                    className="background-panel-input background-panel-input-compact"
                    title="Grid Offset Y"
                  />
                </div>

                <div className="background-panel-item">
                  <span className="background-panel-item-label">Style</span>
                  <select
                    value={gridStyle}
                    onChange={(e) => {
                      const nextStyle = e.target.value as 'solid' | 'dashed' | 'dotted';
                      setGridStyle(nextStyle);
                      emitGridSettingsUpdate({ gridStyle: nextStyle });
                    }}
                    className="background-panel-input background-panel-input-compact"
                    title="Grid line style"
                  >
                    <option value="solid">Solid</option>
                    <option value="dashed">Dashed</option>
                    <option value="dotted">Dotted</option>
                  </select>
                  <label className="background-panel-item-label" style={{ marginTop: 8 }}>Amount</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(gridStyleAmount * 100)}
                    onChange={(e) => {
                      const nextAmount = Number(e.target.value) / 100;
                      setGridStyleAmount(nextAmount);
                      emitGridSettingsUpdate({ gridStyleAmount: nextAmount });
                    }}
                    className="background-panel-slider"
                    title={`Grid style amount: ${Math.round(gridStyleAmount * 100)}%`}
                    disabled={gridStyle === 'solid'}
                  />
                  <span className="background-panel-value-label">
                    {gridStyle === 'solid' ? 'N/A' : `${Math.round(gridStyleAmount * 100)}%`}
                  </span>
                </div>
              </div>

              {/* Measure & Edit Toggles Row */}
              <div className="background-panel-row">
                {/* Measure - Square Value */}
                <div className="background-panel-item">
                  <Icon name="ruler" />
                  <span className="background-panel-item-label">ft</span>
                  <input
                    type="number"
                    value={squareValue}
                    onChange={(e) => setSquareValue(Number(e.target.value))}
                    min={1}
                    className="background-panel-input background-panel-input-compact"
                    title="Square feet value"
                  />
                </div>

                {/* Grid Edit Mode Toggle */}
                <div className="background-panel-toggle">
                  <div className="background-panel-toggle-content">
                    <Icon name="cog" />
                    <span className="background-panel-item-label">Edit</span>
                  </div>
                  <button
                    onClick={() => setGridEditMode(!gridEditMode)}
                    className={`background-panel-toggle-btn ${!gridEditMode ? 'inactive' : ''}`}
                    style={{ background: gridEditMode ? 'var(--color-accent-success)' : undefined }}
                  >
                    {gridEditMode ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              {gridEditMode && (
                <div className="background-panel-grid-edit-hint">
                  ⌘ wheel: size ±5<br/>
                  ⌃ wheel: offset X ±1<br/>
                  ⌥ wheel: offset Y ±1
                </div>
              )}
                </>
              )}

              {/* Map Bleed Settings */}
              <button
                onClick={() => setMapBleedExpanded(!mapBleedExpanded)}
                className="background-panel-section-toggle background-panel-divider"
              >
                <span className="background-panel-section-title">Map Bleed</span>
                <span className="background-panel-section-title">{mapBleedExpanded ? '▾' : '▸'}</span>
              </button>

              {mapBleedExpanded && (
                <>
              <div className="toolbar-control-stack-sm">
                <label className="toolbar-inline-label">
                  <input
                    type="checkbox"
                    checked={mapBleedEnabled}
                    onChange={(e) => setMapBleedEnabled(e.target.checked)}
                  />
                  Enable cinematic bleed edges
                </label>
              </div>

              <div className="toolbar-control-stack-sm">
                <div className="toolbar-space-between-row toolbar-metric-row">
                  <span className="background-panel-item-label">Feather</span>
                  <span className="background-panel-item-label">{mapBleedFeather}px</span>
                </div>
                <Slider
                  min="20"
                  max="480"
                  step="1"
                  value={mapBleedFeather}
                  onChange={(e) => setMapBleedFeather(parseInt(e.target.value, 10))}
                  disabled={!mapBleedEnabled}
                />
              </div>

              <div className="toolbar-control-stack-sm">
                <div className="toolbar-space-between-row toolbar-metric-row">
                  <span className="background-panel-item-label">Edge Blur</span>
                  <span className="background-panel-item-label">{mapBleedBlur}px</span>
                </div>
                <Slider
                  min="0"
                  max="80"
                  step="1"
                  value={mapBleedBlur}
                  onChange={(e) => setMapBleedBlur(parseInt(e.target.value, 10))}
                  disabled={!mapBleedEnabled}
                />
              </div>

              <div className="toolbar-control-stack-sm">
                <div className="toolbar-space-between-row toolbar-metric-row">
                  <span className="background-panel-item-label">Vignette</span>
                  <span className="background-panel-item-label">{Math.round(mapBleedVignette * 100)}%</span>
                </div>
                <Slider
                  min="0"
                  max="100"
                  step="1"
                  value={Math.round(mapBleedVignette * 100)}
                  onChange={(e) => setMapBleedVignette(parseInt(e.target.value, 10) / 100)}
                  disabled={!mapBleedEnabled}
                />
              </div>

              <div className="toolbar-control-stack-md">
                <div className="toolbar-space-between-row toolbar-metric-row">
                  <span className="background-panel-item-label">Bleed Scale</span>
                  <span className="background-panel-item-label">{mapBleedScale.toFixed(2)}x</span>
                </div>
                <Slider
                  min="1"
                  max="1.35"
                  step="0.01"
                  value={mapBleedScale}
                  onChange={(e) => setMapBleedScale(parseFloat(e.target.value))}
                  disabled={!mapBleedEnabled}
                />
              </div>
                </>
              )}

              {/* Fog of War Settings */}
              <button
                onClick={() => setMapFogExpanded(!mapFogExpanded)}
                className="background-panel-section-toggle background-panel-divider"
              >
                <span className="background-panel-section-title">Fog of War Settings</span>
                <span className="background-panel-section-title">{mapFogExpanded ? '▾' : '▸'}</span>
              </button>

              {mapFogExpanded && (
                <>
              {/* Fog Color */}
              <div className="background-panel-row">
                <div className="background-panel-item">
                  <Icon name="palette" title="Fog Color" />
                  <span className="background-panel-item-label">Fog</span>
                  <input
                    type="color"
                    defaultValue={pencilFogColor}
                    onChange={(e) => {
                      setPencilFogColor(e.target.value);
                    }}
                    className="background-panel-color-input"
                    title="Fog Color"
                  />
                </div>
              </div>

              {/* Pencil Brush Smoothness */}
              <div className="toolbar-control-stack-sm">
                <div className="toolbar-space-between-row toolbar-metric-row">
                  <span className="background-panel-item-label">Brush Smoothness</span>
                  <span className="background-panel-item-label">{pencilSmoothness}</span>
                </div>
                <Slider
                  min="4"
                  max="32"
                  step="4"
                  value={pencilSmoothness}
                  onChange={(e) => {
                    setPencilSmoothness(parseInt(e.target.value, 10));
                  }}
                />
              </div>

              {/* Pencil Density */}
              <div className="toolbar-control-stack-sm">
                <div className="toolbar-space-between-row toolbar-metric-row">
                  <span className="background-panel-item-label">Density</span>
                  <span className="background-panel-item-label">{pencilDrawRate}x</span>
                </div>
                <Slider
                  min="1"
                  max="8"
                  step="1"
                  value={pencilDrawRate}
                  onChange={(e) => {
                    setPencilDrawRate(parseInt(e.target.value, 10));
                  }}
                />
              </div>

              {/* Snap to Grid Toggle */}
              <div className="background-panel-row">
                <label className="toolbar-fog-checkbox-row">
                  <input
                    type="checkbox"
                    checked={fogSnapToGrid}
                    onChange={(e) => {
                      setFogSnapToGrid(e.target.checked);
                    }}
                  />
                  Snap to Grid
                </label>
              </div>
                </>
              )}
            </div>
          )}

          {/* Settings button (Cog) */}
          <button
            className={`tool-btn ${showSettings ? 'active' : ''}`}
            onClick={() => {
              const newShowSettings = !showSettings;
              setShowSettings(newShowSettings);
              // Turn off grid edit mode when closing settings
              if (newShowSettings === false && gridEditMode) {
                setGridEditMode(false);
              }
            }}
            title="Settings"
            style={showSettings ? activatedToolBtnStyle : undefined}
          >
            <Icon name="cog" />
          </button>

          {/* Data Manager button */}
          {isGM && (
            <button
              className={`tool-btn ${dndManagerVisible ? 'active' : ''}`}
              onClick={() => toggleDndManager()}
              title="D&D Data Manager"
              style={dndManagerVisible ? activatedToolBtnStyle : undefined}
            >
              <Icon name="book" />
            </button>
          )}

          {/* Scene Manager button */}
          {isGM && (
            <button
              className={`tool-btn ${sceneManagerVisible ? 'active' : ''}`}
              onClick={() => toggleSceneManager()}
              title="Scene Manager"
              style={sceneManagerVisible ? activatedToolBtnStyle : undefined}
            >
              <Icon name="map" />
            </button>
          )}

          {/* Asset Browser button */}
          <button
            className={`tool-btn ${fileBrowserVisible ? 'active' : ''}`}
            onClick={() => toggleFileBrowser()}
            title="Asset Browser"
            style={fileBrowserVisible ? activatedToolBtnStyle : undefined}
          >
            <Icon name="folder" />
          </button>

          {/* Weather button */}
          <button
            className={`tool-btn ${weatherVisible ? 'active' : ''}`}
            onClick={() => toggleWeather()}
            title={weatherVisible ? 'Hide Weather' : 'Show Weather'}
            style={weatherVisible ? activatedToolBtnStyle : undefined}
          >
            <Icon name="cloud" />
          </button>

          {/* Combat Tracker button */}
          <button
            className={`tool-btn ${combatTrackerVisible ? 'active' : ''}`}
            onClick={() => toggleCombatTracker()}
            title={combatTrackerVisible ? 'Hide Combat Tracker' : 'Show Combat Tracker'}
            style={combatTrackerVisible ? activatedToolBtnStyle : undefined}
          >
            <Icon name="skull-crossbones" />
          </button>

          {/* Dice Roller button */}
          <button
            className={`tool-btn ${diceRollerVisible ? 'active' : ''}`}
            onClick={() => toggleDiceRoller()}
            title={diceRollerVisible ? 'Hide Dice Roller' : 'Show Dice Roller'}
            style={diceRollerVisible ? activatedToolBtnStyle : undefined}
          >
            <Icon name="dice-d20" />
          </button>

          {/* Macros button */}
          <button
            className={`tool-btn ${macrosVisible ? 'active' : ''}`}
            onClick={() => toggleMacros()}
            title={macrosVisible ? 'Hide Macros' : 'Show Macros'}
            style={macrosVisible ? activatedToolBtnStyle : undefined}
          >
            <Icon name="bolt" />
          </button>

          {/* Rolltable button */}
          <button
            className={`tool-btn ${rollTablePanelVisible ? 'active' : ''}`}
            onClick={() => toggleRollTablePanel()}
            title={rollTablePanelVisible ? 'Hide Rolltables' : 'Show Rolltables'}
            style={rollTablePanelVisible ? activatedToolBtnStyle : undefined}
          >
            <Icon name="list" />
          </button>

          {/* Audio button */}
          {isGM && (
            <button
              className={`tool-btn ${audioPanelVisible ? 'active' : ''}`}
              onClick={() => toggleAudioPanel()}
              title={audioPanelVisible ? 'Hide Audio' : 'Show Audio'}
              style={audioPanelVisible ? activatedToolBtnStyle : undefined}
            >
              <Icon name="music" />
            </button>
          )}
        </div>
      )}

      {/* Settings Popup - separate floating panel */}
      {showSettings && (
        <div 
          className="settings-panel"
          style={{
            width: 'var(--toolbar-settings-width, 320px)',
            background: colorScheme && (colorScheme.id.includes('-custom-') || colorScheme.id === 'custom') ? colorScheme.surface : undefined,
          }}
        >
          <div className="toolbar-settings-header">
            <span className="toolbar-settings-title">Board Settings</span>
          </div>
          
          {/* Panning Settings - Section Header */}
          <button
            onClick={() => setSettingsPanningExpanded(!settingsPanningExpanded)}
            className="toolbar-settings-section-toggle"
          >
            <span className="toolbar-settings-title">Panning</span>
            <span className="toolbar-settings-title">{settingsPanningExpanded ? '▾' : '▸'}</span>
          </button>

          {settingsPanningExpanded && (
            <>
          {/* Panning Settings - Horizontal Layout */}
          <div className="toolbar-settings-grid">
            {/* Enable Pan Toggle */}
            <div className="toolbar-settings-card">
              <div className="toolbar-settings-inline">
                <Icon name="arrows-alt" />
                <span className="toolbar-settings-caption">Enable</span>
              </div>
              <Button
                onClick={() => setPanEnabled(!panEnabled)}
                variant={panEnabled ? 'primary' : 'ghost'}
                size="sm"
              >
                {panEnabled ? 'ON' : 'OFF'}
              </Button>
            </div>

            {/* Friction Slider */}
            <div className="toolbar-settings-card toolbar-settings-card-wide">
              <div className="toolbar-settings-inline">
                <Icon name="gauge" />
                <span className="toolbar-settings-caption">Friction</span>
              </div>
              <div className="toolbar-settings-inline toolbar-settings-slider-row">
                <Slider
                  min="0.5"
                  max="0.99"
                  step="0.01"
                  value={panFriction}
                  onChange={(e) => setPanFriction(parseFloat(e.target.value))}
                  disabled={!panEnabled}
                  className="toolbar-compact-slider"
                />
                <span className="toolbar-settings-value">
                  {Math.round(panFriction * 100)}%
                </span>
              </div>
            </div>
          </div>

          <div className="toolbar-settings-helper">
            Higher friction = more slide, Lower = faster stop
          </div>
            </>
          )}
           
          {/* Chat Settings - Section Header */}
          <button
            onClick={() => setSettingsChatExpanded(!settingsChatExpanded)}
            className="toolbar-settings-section-toggle"
          >
            <span className="toolbar-settings-title">Chat</span>
            <span className="toolbar-settings-title">{settingsChatExpanded ? '▾' : '▸'}</span>
          </button>

          {settingsChatExpanded && (
          <div className="toolbar-settings-block">
            <div className="toolbar-settings-card">
              <div className="toolbar-settings-inline">
                <Icon name="comments" />
                <span className="toolbar-settings-caption">Collapse chat cards by default</span>
              </div>
              <Button
                onClick={() => setChatCardsCollapsedByDefault(!chatCardsCollapsedByDefault)}
                variant={chatCardsCollapsedByDefault ? 'primary' : 'ghost'}
                size="sm"
              >
                {chatCardsCollapsedByDefault ? 'ON' : 'OFF'}
              </Button>
            </div>
          </div>
          )}

          {/* Battle Settings - Section Header */}
          <button
            onClick={() => setSettingsBattleExpanded(!settingsBattleExpanded)}
            className="toolbar-settings-section-toggle"
          >
            <span className="toolbar-settings-title">Battle</span>
            <span className="toolbar-settings-title">{settingsBattleExpanded ? '▾' : '▸'}</span>
          </button>

          {settingsBattleExpanded && (
            <div className="toolbar-settings-stack">
              <div className="toolbar-settings-card">
                <span className="toolbar-settings-caption">Battle Stinger</span>
                <Dropdown
                  value={battleStinger}
                  onChange={(e) => setBattleStinger(e.target.value as 'drums' | 'none' | 'custom')}
                  className="toolbar-compact-select"
                >
                  <option value="drums">Drums</option>
                  <option value="custom">Custom</option>
                  <option value="none">None</option>
                </Dropdown>
              </div>
              <div className="toolbar-settings-card">
                <span className="toolbar-settings-caption">Upload Audio</span>
                <div className="toolbar-settings-inline toolbar-settings-actions">
                  <button
                    type="button"
                    className="ui-button ui-button--secondary ui-button--sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      battleStingerInputRef.current?.click();
                    }}
                  >
                    Upload
                  </button>
                  <Button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setBattleStingerCustomUrl(null);
                      setBattleStinger('none');
                    }}
                    variant="ghost"
                    size="sm"
                  >
                    Clear
                  </Button>
                </div>
              </div>
              <input
                ref={battleStingerInputRef}
                type="file"
                accept="audio/*"
                id="battle-stinger-upload"
                onChange={handleBattleStingerUpload}
                style={{ display: 'none' }}
              />
              <div className="toolbar-settings-helper">
                {battleStingerCustomUrl ? `Custom: ${battleStingerCustomUrl.split('/').pop()}` : 'No custom audio uploaded - select Custom above to use uploaded file'}
              </div>
              <div className="toolbar-settings-card">
                <span className="toolbar-settings-caption">Turn Token Marker</span>
                <div className="toolbar-settings-inline toolbar-settings-actions">
                  <Button
                    onClick={() => turnTokenInputRef.current?.click()}
                    variant="secondary"
                    size="sm"
                  >
                    Upload
                  </Button>
                  <Button
                    onClick={() => setTurnTokenImageUrl(null)}
                    variant="ghost"
                    size="sm"
                  >
                    Default
                  </Button>
                </div>
              </div>
              <input
                ref={turnTokenInputRef}
                type="file"
                accept="image/*"
                onChange={handleTurnTokenUpload}
                className="toolbar-hidden-input"
              />
              <div className="toolbar-settings-helper">
                Current: {turnTokenImageUrl ? 'Custom marker active' : 'Default turn_token.webp'}
              </div>
              <div className="toolbar-settings-card">
                <span className="toolbar-settings-caption">Combat Playlist</span>
                <Dropdown
                  value={combatPlaylist || ''}
                  onChange={(e) => setCombatPlaylist(e.target.value || null)}
                  className="toolbar-compact-select"
                >
                  <option value="">None</option>
                  {customPlaylists.map((playlist) => (
                    <option key={playlist.id} value={playlist.id}>
                      {playlist.name}
                    </option>
                  ))}
                </Dropdown>
              </div>
              {combatPlaylist && (
                <div className="toolbar-settings-helper">
                  Will play when combat starts
                </div>
              )}
            </div>
          )}

          {/* 3D Dice Settings - Section Header */}
          <button
            onClick={() => setSettingsDice3dExpanded(!settingsDice3dExpanded)}
            className="toolbar-settings-section-toggle"
          >
            <span className="toolbar-settings-title">3D Dice</span>
            <span className="toolbar-settings-title">{settingsDice3dExpanded ? '▾' : '▸'}</span>
          </button>

          {settingsDice3dExpanded && (
            <div className="toolbar-settings-stack">
              <div className="toolbar-settings-card">
                <span className="toolbar-settings-caption">Enabled</span>
                <Button
                  onClick={() => setDice3dEnabled(!dice3dEnabled)}
                  variant={dice3dEnabled ? 'primary' : 'ghost'}
                  size="sm"
                >
                  {dice3dEnabled ? 'ON' : 'OFF'}
                </Button>
              </div>

              <div className="toolbar-settings-card">
                <span className="toolbar-settings-caption">Colour</span>
                <input
                  type="color"
                  value={dice3dColor}
                  onChange={(e) => setDice3dColor(e.target.value)}
                  className="toolbar-color-swatch"
                  title="3D Dice Colour"
                />
              </div>

              <div className="toolbar-settings-card">
                <span className="toolbar-settings-caption">Material</span>
                <Dropdown
                  value={dice3dMaterial}
                  onChange={(e) => setDice3dMaterial(e.target.value as 'plastic' | 'metal' | 'glass' | 'stone')}
                  className="toolbar-compact-select"
                >
                  <option value="plastic">Plastic</option>
                  <option value="metal">Metal</option>
                  <option value="glass">Glass</option>
                  <option value="stone">Stone</option>
                </Dropdown>
              </div>

              <div className="toolbar-settings-card">
                <span className="toolbar-settings-caption">Theme</span>
                <Dropdown
                  value={dice3dTheme}
                  onChange={(e) => {
                    const newTheme = e.target.value as 'default' | 'rock' | 'smooth' | 'wooden' | 'blueGreenMetal' | 'rust' | 'gemstone' | 'gemstoneMarble' | 'diceOfRolling';
                    // Add small delay to ensure state propagates to Dice3DOverlay
                    setTimeout(() => setDice3dTheme(newTheme), 50);
                  }}
                  className="toolbar-compact-select"
                >
                  <option value="default">Default</option>
                  <option value="rock">Rock</option>
                  <option value="smooth">Smooth</option>
                  <option value="wooden">Wooden</option>
                  <option value="blueGreenMetal">Blue Green Metal</option>
                  <option value="rust">Rust</option>
                  <option value="gemstone">Gemstone</option>
                  <option value="gemstoneMarble">Gemstone Marble</option>
                  <option value="diceOfRolling">Dice of Rolling</option>
                </Dropdown>
              </div>

              <div className="toolbar-settings-card">
                <Button
                  onClick={() => setShowDice3dAdvancedModal(true)}
                  variant="secondary"
                  size="sm"
                  className="toolbar-full-width-button"
                >
                  Advanced
                </Button>
              </div>
            </div>
          )}
          
          {/* Audio Fade Settings - Section Header */}
          <button
            onClick={() => setSettingsAudioFadeExpanded(!settingsAudioFadeExpanded)}
            className="toolbar-settings-section-toggle"
          >
            <span className="toolbar-settings-title">Audio Fade</span>
            <span className="toolbar-settings-title">{settingsAudioFadeExpanded ? '▾' : '▸'}</span>
          </button>

          {settingsAudioFadeExpanded && isGM && (
            <div className="toolbar-settings-stack">
              <div className="toolbar-settings-card toolbar-settings-card-stack">
                <Slider
                  label={`Fade In: ${Math.round(useGameStore.getState().audioFadeInDuration || 1000)}ms`}
                  min="100"
                  max="5000"
                  step="100"
                  value={useGameStore.getState().audioFadeInDuration || 1000}
                  onChange={(e) => useGameStore.getState().setAudioFadeInDuration(parseInt(e.target.value))}
                />
              </div>

              <div className="toolbar-settings-card toolbar-settings-card-stack">
                <Slider
                  label={`Fade Out: ${Math.round(useGameStore.getState().audioFadeOutDuration || 1000)}ms`}
                  min="100"
                  max="5000"
                  step="100"
                  value={useGameStore.getState().audioFadeOutDuration || 1000}
                  onChange={(e) => useGameStore.getState().setAudioFadeOutDuration(parseInt(e.target.value))}
                />
              </div>
            </div>
          )}

          {/* Key Bindings - Section Header */}
          <button
            onClick={() => setSettingsKeyBindingsExpanded(!settingsKeyBindingsExpanded)}
            className="toolbar-settings-section-toggle"
          >
            <span className="toolbar-settings-title">Key Bindings</span>
            <span className="toolbar-settings-title">{settingsKeyBindingsExpanded ? '▾' : '▸'}</span>
          </button>

          {settingsKeyBindingsExpanded && (
          <div className="toolbar-settings-block">
            <div className="toolbar-settings-card toolbar-settings-card-stack">
              <div className="toolbar-settings-inline toolbar-settings-spread">
                <div className="toolbar-settings-inline">
                <Icon name="search" />
                <span className="toolbar-settings-caption">Focus on Selected</span>
                </div>
              
              </div>
              <input
                type="text"
                value={focusOnSelectedKey}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  // Allow typing any single character
                  if (e.key.length === 1) {
                    setFocusOnSelectedKey(e.key.toLowerCase());
                  } else if (e.key === 'Backspace' || e.key === 'Delete') {
                    setFocusOnSelectedKey('z'); // Reset to default
                  }
                }}
                onClick={(e) => {
                  // Stop propagation to prevent toolbar interactions
                  e.stopPropagation();
                }}
                readOnly
                className="toolbar-keybinding-input"
                title="Click and press any key to set the binding"
              />
            </div>
            <div className="toolbar-settings-helper">
              Click & press any key to change
            </div>
          </div>
          )}

          {/* Token Display Defaults - Section Header */}
          <button
            onClick={() => setSettingsTokenDefaultsExpanded(!settingsTokenDefaultsExpanded)}
            className="toolbar-settings-section-toggle"
          >
            <span className="toolbar-settings-title">Token Settings</span>
            <span className="toolbar-settings-title">{settingsTokenDefaultsExpanded ? '▾' : '▸'}</span>
          </button>

          {settingsTokenDefaultsExpanded && (
          <div className="toolbar-settings-grid">
            {/* Show Measure Toggle */}
            <div className="toolbar-settings-card">
              <div className="toolbar-settings-inline">
                <Icon name="ruler" />
                <span className="toolbar-settings-caption">Measure</span>
              </div>
              <Button
                onClick={() => setShowMoveMeasure(!showMoveMeasure)}
                variant={showMoveMeasure ? 'primary' : 'ghost'}
                size="sm"
              >
                {showMoveMeasure ? 'ON' : 'OFF'}
              </Button>
            </div>

            {/* Default Show Token Name Toggle */}
            <div className="toolbar-settings-card">
              <div className="toolbar-settings-inline">
                <Icon name="tag" />
                <span className="toolbar-settings-caption">Name</span>
              </div>
              <Button
                onClick={() => setDefaultShowTokenName(!defaultShowTokenName)}
                variant={defaultShowTokenName ? 'primary' : 'ghost'}
                size="sm"
              >
                {defaultShowTokenName ? 'ON' : 'OFF'}
              </Button>
            </div>

            {/* Default Show Player HP Toggle */}
            <div className="toolbar-settings-card">
              <div className="toolbar-settings-inline">
                <Icon name="heart" />
                <span className="toolbar-settings-caption">Your HP</span>
              </div>
              <Button
                onClick={() => setDefaultShowPlayerHp(!defaultShowPlayerHp)}
                variant={defaultShowPlayerHp ? 'primary' : 'ghost'}
                size="sm"
              >
                {defaultShowPlayerHp ? 'ON' : 'OFF'}
              </Button>
            </div>

            {/* Default Show Other HP Toggle */}
            <div className="toolbar-settings-card">
              <div className="toolbar-settings-inline">
                <Icon name="heart" />
                <span className="toolbar-settings-caption">Other HP</span>
              </div>
              <Button
                onClick={() => setDefaultShowOtherHp(!defaultShowOtherHp)}
                variant={defaultShowOtherHp ? 'primary' : 'ghost'}
                size="sm"
              >
                {defaultShowOtherHp ? 'ON' : 'OFF'}
              </Button>
            </div>

            {/* Status Icon Color */}
            <div className="toolbar-settings-card">
              <div className="toolbar-settings-inline">
                <Icon name="smile" />
                <span className="toolbar-settings-caption">Status</span>
              </div>
              <input
                type="color"
                value={statusIconColor}
                onChange={(e) => setStatusIconColor(e.target.value)}
                className="toolbar-color-swatch"
                title="Status Icon Color"
              />
            </div>

            {/* Default Token Disposition */}
            <div className="toolbar-settings-card">
              <div className="toolbar-settings-inline">
                <Icon name="users" />
                <span className="toolbar-settings-caption">Disposition</span>
              </div>
              <Dropdown
                value={defaultTokenDisposition || ''}
                onChange={(e) => setDefaultTokenDisposition(e.target.value as TokenDisposition || null)}
                className="toolbar-compact-select"
              >
                <option value="">None</option>
                <option value="neutral">Neutral</option>
                <option value="friendly">Friendly</option>
                <option value="hostile">Hostile</option>
                <option value="secret">Secret</option>
              </Dropdown>
            </div>

            {/* Token HP Source - Average vs Rolled */}
            <div className="toolbar-settings-card">
              <div className="toolbar-settings-inline">
                <span className="toolbar-settings-caption">HP Source</span>
              </div>
              <Dropdown
                value={tokenHpSource}
                onChange={(e) => setTokenHpSource(e.target.value as 'average' | 'rolled')}
                className="toolbar-compact-select"
              >
                <option value="average">Average</option>
                <option value="rolled">Rolled</option>
              </Dropdown>
            </div>

            {/* AC Display */}
            <div className="toolbar-settings-card">
              <div className="toolbar-settings-inline">
                <Icon name="shield" />
                <span className="toolbar-settings-caption">AC Display</span>
              </div>
              <Dropdown
                value={tokenDisplayMode}
                onChange={(e) => setTokenDisplayMode(e.target.value as 'always' | 'selected' | 'hover')}
                className="toolbar-compact-select"
              >
                <option value="always">Always</option>
                <option value="selected">When Selected</option>
                <option value="hover">On Hover</option>
              </Dropdown>
            </div>

            {/* Box Selection Border Color */}
            <div className="toolbar-settings-card">
              <div className="toolbar-settings-inline">
                <Icon name="border-all" />
                <span className="toolbar-settings-caption">Box Select</span>
              </div>
              <input
                type="color"
                value={boxSelectionColor}
                onChange={(e) => setBoxSelectionColor(e.target.value)}
                className="toolbar-color-swatch"
                title="Box Selection Border Color"
              />
            </div>

            {/* Box Selection Background Color */}
            <div className="toolbar-settings-card">
              <div className="toolbar-settings-inline">
                <Icon name="layer-group" />
                <span className="toolbar-settings-caption">Box Select BG</span>
              </div>
              <input
                type="color"
                value={boxSelectionBgColor.startsWith('rgba') ? '#ed8936' : boxSelectionBgColor.slice(0, 7)}
                onChange={(e) => setBoxSelectionBgColor(`rgba(${parseInt(e.target.value.slice(1, 3), 16)}, ${parseInt(e.target.value.slice(3, 5), 16)}, ${parseInt(e.target.value.slice(5, 7), 16)}, 0.2)`)}
                className="toolbar-color-swatch"
                title="Box Selection Background Color"
              />
            </div>

            {/* Advanced Settings */}
            <div className="toolbar-settings-card">
              <Button
                onClick={() => setShowTokenDefaultsAdvancedModal(true)}
                variant="secondary"
                size="sm"
                className="toolbar-full-width-button"
              >
                Advanced
              </Button>
            </div>
          </div>
          )}
          
          {/* Themes - Section Header */}
          <button
            onClick={() => setThemeExpanded(!themeExpanded)}
            className="toolbar-settings-section-toggle"
          >
            <span className="toolbar-settings-title">Themes ({DEFAULT_COLOR_SCHEMES.length})</span>
            <span className="toolbar-settings-title">{themeExpanded ? '▾' : '▸'}</span>
          </button>
            
          {themeExpanded && (
              <div className="toolbar-settings-block">
                <div className="toolbar-settings-chip-grid toolbar-theme-swatch-grid">
                  {DEFAULT_COLOR_SCHEMES.map((scheme) => (
                    <button
                      key={scheme.id}
                      onClick={() => {
                        // Create a new customized scheme based on the selected one
                        const customizedScheme: ColorScheme = {
                          ...scheme,
                          id: `${scheme.id}-custom-${Date.now()}`,
                          name: `${scheme.name} Custom`,
                        };
                        setColorScheme(customizedScheme);
                        // Apply color scheme to background and grid
                        const bgColor = parseInt(scheme.background.replace('#', ''), 16);
                        const gridCol = parseInt(scheme.gridColor.replace('rgba(', '').split(',')[0] || '255', 10);
                        setBackgroundColor(bgColor);
                        // Parse grid color from rgba
                        const gridColorMatch = scheme.gridColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                        if (gridColorMatch) {
                          const r = parseInt(gridColorMatch[1]);
                          const g = parseInt(gridColorMatch[2]);
                          const b = parseInt(gridColorMatch[3]);
                          setGridColor((r << 16) | (g << 8) | b);
                        }
                      }}
                      className="toolbar-theme-swatch"
                      style={{
                        border: colorScheme?.id === scheme.id ? '2px solid #ed8936' : '1px solid #555',
                        background: scheme.primary,
                      }}
                      title={scheme.name}
                    >
                      {scheme.name.charAt(0)}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      // Create custom color scheme
                      const customScheme: ColorScheme = {
                        id: 'custom',
                        name: 'Custom',
                        primary: '#888888',
                        secondary: '#666666',
                        accent: '#ff9900',
                        background: '#1a1a1a',
                        surface: '#2a2a2a',
                        text: '#ffffff',
                        textSecondary: '#aaaaaa',
                        gridColor: 'rgba(255, 255, 255, 0.1)',
                        gridBackground: 'transparent',
                        panelBlur: 0,
                        surfaceAlpha: 0.9
                      };
                      setColorScheme(customScheme);
                    }}
                    className="toolbar-theme-swatch"
                    style={{
                      border: colorScheme && (colorScheme.id.includes('-custom-') || colorScheme.id === 'custom') ? '2px solid #ed8936' : '1px dashed #555',
                      background: 'linear-gradient(135deg, #ff9900 25%, #ff0000 25%, #ff0000 50%, #00ff00 50%, #00ff00 75%, #0000ff 75%)',
                    }}
                    title="Custom"
                  >
                    +
                  </button>
                </div>
                
                {/* Custom Color Pickers - show for all schemes */}
                {colorScheme && (
                  <div className="toolbar-theme-panel">
                    <div className="toolbar-theme-field">
                      <label className="toolbar-settings-caption toolbar-settings-block-label">Background</label>
                      <input
                        type="color"
                        value={colorScheme.background}
                        onChange={(e) => {
                          const newColor = e.target.value;
                          const contrastTextColor = getContrastTextColor(newColor);
                          setColorScheme({ ...colorScheme, background: newColor, text: contrastTextColor });
                          setBackgroundColor(parseInt(newColor.replace('#', ''), 16));
                        }}
                        className="toolbar-theme-color-input"
                      />
                    </div>
                    <div className="toolbar-theme-field">
                      <label className="toolbar-settings-caption toolbar-settings-block-label">Surface</label>
                      <input
                        type="color"
                        value={colorScheme.surface}
                        onChange={(e) => setColorScheme({ ...colorScheme, surface: e.target.value })}
                        className="toolbar-theme-color-input"
                      />
                      <div className="toolbar-settings-inline toolbar-settings-slider-row">
                        <span className="toolbar-settings-caption">Alpha:</span>
                        <Slider
                          min="0"
                          max="1"
                          step="0.05"
                          value={colorScheme.surfaceAlpha ?? 1}
                          onChange={(e) => setColorScheme({ ...colorScheme, surfaceAlpha: parseFloat(e.target.value) })}
                          className="toolbar-theme-alpha-slider"
                        />
                        <span className="toolbar-theme-alpha-value">{Math.round((colorScheme.surfaceAlpha ?? 1) * 100)}%</span>
                      </div>
                    </div>
                    <div className="toolbar-theme-field">
                      <label className="toolbar-settings-caption toolbar-settings-block-label">Accent</label>
                      <input
                        type="color"
                        value={colorScheme.accent}
                        onChange={(e) => setColorScheme({ ...colorScheme, accent: e.target.value })}
                        className="toolbar-theme-color-input"
                      />
                    </div>
                    <div className="toolbar-theme-field">
                      <label className="toolbar-settings-caption toolbar-settings-block-label">Text</label>
                      <input
                        type="color"
                        value={colorScheme.text}
                        onChange={(e) => setColorScheme({ ...colorScheme, text: e.target.value })}
                        className="toolbar-theme-color-input"
                      />
                    </div>
                    <div>
                      <label className="toolbar-settings-caption toolbar-settings-block-label">Font</label>
                      <Dropdown
                        value={colorScheme.fontFamily || ''}
                        onChange={(e) => setColorScheme({ ...colorScheme, fontFamily: e.target.value })}
                        className="toolbar-full-width-select toolbar-theme-select"
                      >
                        <option value="">Default</option>
                        <option value="Arial, sans-serif">Arial</option>
                        <option value="Courier, monospace">Courier</option>
                        <option value="Courier New, monospace">Courier New</option>
                        <option value="Times, serif">Times</option>
                        <option value="Times New Roman, serif">Times New Roman</option>
                        <option value="JetBrains Mono, monospace">JetBrains Mono</option>
                        <option value="Fira Code, monospace">Fira Code</option>
                        <option value="Space Mono, monospace">Space Mono</option>
                        <option value="Menlo, monospace">Menlo</option>
                        <option value="SF Mono, Monaco, monospace">SF Mono</option>
                        <option value="Roboto, sans-serif">Roboto</option>
                        <option value="Roboto Condensed, sans-serif">Roboto Condensed</option>
                        <option value="Roboto Slab, serif">Roboto Slab</option>
                        <option value="Amiri, serif">Amiri</option>
                        <option value="Signika, sans-serif">Signika</option>
                        <option value="Open Sans, sans-serif">Open Sans</option>
                        <option value="Lato, sans-serif">Lato</option>
                        <option value="Montserrat, sans-serif">Montserrat</option>
                      </Dropdown>
                    </div>
                    <div>
                      <label className="toolbar-settings-caption toolbar-settings-block-label">Panel Blur</label>
                      <div className="toolbar-settings-inline toolbar-settings-slider-row">
                        <Slider
                          min="0"
                          max="20"
                          value={colorScheme?.panelBlur || 0}
                          onChange={(e) => setColorScheme({ ...colorScheme, panelBlur: Number(e.target.value) })}
                          className="toolbar-theme-alpha-slider"
                        />
                        <span className="toolbar-theme-alpha-value">{colorScheme?.panelBlur || 0}px</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          
        </div>
      )}

      {/* Weather Panel */}
      {weatherVisible && isGM && (
        <div 
          className="settings-panel"
          style={{
            width: 'var(--toolbar-settings-width, 320px)',
            background: colorScheme && (colorScheme.id.includes('-custom-') || colorScheme.id === 'custom') ? colorScheme.surface : undefined,
          }}
        >
          <div className="toolbar-settings-header">
            <span className="toolbar-settings-title">Weather Effects</span>
          </div>

          <div className="toolbar-fullscreen-panel">
            <button
              onClick={() => setWeatherParticlesExpanded((prev) => !prev)}
              className="toolbar-fullscreen-toggle"
            >
              <span>Particle effects</span>
              <span>{weatherParticlesExpanded ? '▾' : '▸'}</span>
            </button>

            {weatherParticlesExpanded && (
              <div style={WEATHER_SECTION_STYLE}>

              {/* Vertical list of weather effects */}
              <div className="weather-effects-list">
                {(['rain', 'snow', 'fog', 'clouds', 'fireflies', 'embers', 'sparkles', 'hearts'] as WeatherType[]).map((type) => {
                  const existing = activeWeatherEffects.find(e => e.type === type);
                  const isExpanded = expandedWeatherEffectId === existing?.id;
                  const weatherPresetId = existing ? (WEATHER_TYPE_TO_PRESET[existing.type] || '') : '';
                  const weatherPreset = weatherPresetId ? getParticlePresetById(weatherPresetId) : undefined;
                  const effectiveSettings = existing
                    ? weatherEffectFromPreset(weatherPreset, existing)
                    : null;
                  
                  return (
                    <div key={type} className="weather-effect-item">
                      <div 
                        className="weather-effect-header"
                        onClick={() => {
                          if (existing) {
                            setExpandedWeatherEffectId(isExpanded ? null : existing.id);
                          } else {
                            const newId = crypto.randomUUID();
                            const preset = getPresetForType(type);
                            addWeatherEffect({
                              id: newId,
                              type,
                              enabled: true,
                              intensity: preset?.intensity ?? 50,
                              speed: preset?.speed ?? 50,
                              size: preset?.size ?? 5,
                              color: preset?.color ?? '#ffffff',
                              direction: preset?.direction ?? 270,
                              wobble: preset?.wobble ?? 50,
                              wobbleAmplitude: preset?.wobbleAmplitude ?? 50,
                              particleShape: preset?.particleShape,
                              belowTokens: true,
                              lifetime: 5000,
                              opacity: 100,
                            });
                            setExpandedWeatherEffectId(newId);
                          }
                        }}
                      >
                        <span className="weather-effect-name">{WEATHER_LABELS[type] ?? type}</span>
                        <div className="weather-effect-toggle">
                          {existing ? (
                            <>
                              <label className="toggle-switch">
                                <input
                                  type="checkbox"
                                  checked={existing.enabled}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    updateWeatherEffectWithPresetSync(existing, { enabled: e.target.checked });
                                  }}
                                />
                                <span className="toggle-slider"></span>
                              </label>
                              <button 
                                className="weather-effect-remove"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeWeatherEffect(existing.id);
                                  setExpandedWeatherEffectId(null);
                                }}
                                title="Remove effect"
                              >
                                ✕
                              </button>
                            </>
                          ) : (
                            <span className="weather-effect-add">+</span>
                          )}
                        </div>
                      </div>
                      
                      {existing && isExpanded && (
                        <div className="weather-effect-settings">
                          <div className="weather-effect-settings-grid">
                            <div className="weather-setting-row">
                              <label>Below Tokens</label>
                              <label className="toggle-switch small">
                                <input
                                  type="checkbox"
                                  checked={effectiveSettings?.belowTokens ?? true}
                                  onChange={(e) => updateWeatherEffectWithPresetSync(existing, { belowTokens: e.target.checked })}
                                />
                                <span className="toggle-slider"></span>
                              </label>
                            </div>
                            
                            <div className="weather-setting-row">
                              <label>Color</label>
                              <input
                                type="color"
                                value={effectiveSettings?.color || '#ffffff'}
                                onChange={(e) => updateWeatherEffectWithPresetSync(existing, { color: e.target.value })}
                                className="weather-color-input"
                              />
                            </div>
                            <div className="weather-setting-row">
                              <label>Direction: {effectiveSettings?.direction ?? existing.direction}°</label>
                              <input
                                type="range"
                                min="0"
                                max="360"
                                step="1"
                                value={effectiveSettings?.direction ?? existing.direction ?? 270}
                                onChange={(e) => updateWeatherEffectWithPresetSync(existing, { direction: parseInt(e.target.value, 10) })}
                                className="weather-slider"
                              />
                            </div>
                            
                            <div className="weather-setting-row">
                              <label>Scale: {effectiveSettings?.size ?? existing.size}%</label>
                              <input
                                type="range"
                                min="1"
                                max="200"
                                value={effectiveSettings?.size ?? existing.size ?? 50}
                                onChange={(e) => updateWeatherEffectWithPresetSync(existing, { size: parseInt(e.target.value, 10) })}
                                className="weather-slider"
                              />
                            </div>
                            
                            <div className="weather-setting-row">
                              <label>Lifetime: {((effectiveSettings?.lifetime ?? existing.lifetime ?? 5000) / 1000).toFixed(1)}s</label>
                              <input
                                type="range"
                                min="1000"
                                max="30000"
                                step="500"
                                value={effectiveSettings?.lifetime ?? existing.lifetime ?? 5000}
                                onChange={(e) => updateWeatherEffectWithPresetSync(existing, { lifetime: parseInt(e.target.value, 10) })}
                                className="weather-slider"
                              />
                            </div>
                            
                            <div className="weather-setting-row">
                              <label>Amount: {effectiveSettings?.intensity ?? existing.intensity}%</label>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={effectiveSettings?.intensity ?? existing.intensity ?? 50}
                                onChange={(e) => updateWeatherEffectWithPresetSync(existing, { intensity: parseInt(e.target.value, 10) })}
                                className="weather-slider"
                              />
                            </div>
                            
                            <div className="weather-setting-row">
                              <label>Opacity: {effectiveSettings?.opacity ?? existing.opacity ?? 100}%</label>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={effectiveSettings?.opacity ?? existing.opacity ?? 100}
                                onChange={(e) => updateWeatherEffectWithPresetSync(existing, { opacity: parseInt(e.target.value, 10) })}
                                className="weather-slider"
                              />
                            </div>
                          </div>
                          
                          <Button
                            onClick={async () => {
                              if (weatherPresetId) {
                                const preset = getParticlePresetById(weatherPresetId);
                                if (preset && effectiveSettings) {
                                  updateParticlePreset(applyWeatherSettingsToPreset(preset, effectiveSettings));
                                }
                                setParticlePreset(weatherPresetId);
                              }
                              setTool('particle');
                            }}
                            variant="secondary"
                            size="sm"
                            className="toolbar-full-width-button"
                          >
                            Edit in Particle Editor
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              </div>
            )}
          </div>

          <div className="toolbar-fullscreen-panel">
            <button
              onClick={() => setFullScreenEffectsExpanded((prev) => !prev)}
              className="toolbar-fullscreen-toggle"
            >
              <span>Full screen effects</span>
              <span>{fullScreenEffectsExpanded ? '▾' : '▸'}</span>
            </button>

            {fullScreenEffectsExpanded && (
              <div style={{ ...WEATHER_SECTION_STYLE, marginTop: 0, border: 'none', borderRadius: 0 }}>
                <div className="toolbar-fullscreen-subtitle">
                  Pixi filters
                </div>
                <div className="toolbar-fullscreen-stack">
                  {PIXI_WEATHER_FILTER_DEFINITIONS.map((definition: WeatherFilterDefinition) => {
                    const filterEffect = weatherFilterEffects.find((entry) => entry.type === definition.type)
                      ?? createDefaultWeatherFilterEffect(definition.type);
                    const expanded = !!weatherFilterExpanded[definition.type];

                    return (
                      <div key={definition.type} className="toolbar-fullscreen-filter-card">
                        <button
                          onClick={() => setWeatherFilterExpanded((prev) => ({ ...prev, [definition.type]: !expanded }))}
                          className="toolbar-fullscreen-filter-toggle"
                        >
                          <span>{definition.label}</span>
                          <span>{expanded ? '▾' : '▸'}</span>
                        </button>

                        {expanded && (
                          <div className="toolbar-fog-panel">
                            <div className="toolbar-settings-inline toolbar-settings-spread toolbar-settings-toggle-row">
                              <label className="toolbar-settings-caption">Enabled</label>
                              <input
                                type="checkbox"
                                checked={!!filterEffect.enabled}
                                onChange={(e) => {
                                  upsertWeatherFilter(definition.type, (effect) => ({
                                    ...effect,
                                    enabled: e.target.checked,
                                  }));
                                }}
                              />
                            </div>

                            {definition.settings.map((setting: WeatherFilterSettingDefinition) => {
                              const rawValue = filterEffect.settings[setting.key] ?? definition.defaults[setting.key];
                              const value = setting.type === 'boolean' ? Boolean(rawValue) : Number(rawValue);

                              return (
                                <div key={setting.key} className="toolbar-settings-card toolbar-settings-card-stack">
                                  <label className="toolbar-settings-caption toolbar-settings-block-label">
                                    {setting.label}: {setting.type === 'boolean' ? String(value) : Number(value).toFixed(3).replace(/\.000$/, '')}
                                  </label>

                                  {setting.type === 'boolean' ? (
                                    <input
                                      type="checkbox"
                                      checked={Boolean(value)}
                                      onChange={(e) => {
                                        upsertWeatherFilter(definition.type, (effect) => ({
                                          ...effect,
                                          settings: {
                                            ...effect.settings,
                                            [setting.key]: e.target.checked,
                                          },
                                        }));
                                      }}
                                    />
                                  ) : setting.type === 'range' ? (
                                    <Slider
                                      min={setting.min}
                                      max={setting.max}
                                      step={setting.step}
                                      value={Number(value)}
                                      onChange={(e) => {
                                        const next = parseFloat(e.target.value);
                                        upsertWeatherFilter(definition.type, (effect) => ({
                                          ...effect,
                                          settings: {
                                            ...effect.settings,
                                            [setting.key]: next,
                                          },
                                        }));
                                      }}
                                    />
                                  ) : (
                                    <input
                                      type="number"
                                      min={setting.min}
                                      max={setting.max}
                                      step={setting.step}
                                      value={Number(value)}
                                      onChange={(e) => {
                                        const next = parseFloat(e.target.value);
                                        upsertWeatherFilter(definition.type, (effect) => ({
                                          ...effect,
                                          settings: {
                                            ...effect.settings,
                                            [setting.key]: Number.isNaN(next) ? 0 : next,
                                          },
                                        }));
                                      }}
                                      className="toolbar-text-input-compact toolbar-full-width-select"
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Fog Shader Settings */}
                <div className="toolbar-fog-section">
                  <div className="toolbar-fullscreen-filter-card">
                    <button
                      onClick={() => setFogShaderExpanded((prev) => !prev)}
                      className="toolbar-fullscreen-filter-toggle"
                    >
                      <span>Fog shader</span>
                      <span>{fogShaderExpanded ? '▾' : '▸'}</span>
                    </button>

                    {fogShaderExpanded && (
                      <div className="toolbar-fog-panel">
            
                        {/* Enable Fog */}
                        <div className="toolbar-settings-block">
              <label className="toolbar-fog-checkbox-row">
                <input
                  type="checkbox"
                  checked={fogEnabled}
                  onChange={(e) => {
                    // Enable atmospheric fog if not already enabled
                    if (!VISUAL_OPTIONS.atmosphericFog) {
                      setAtmosphericFog(true);
                    }
                    setFogEnabledState(e.target.checked);
                    setFogEnabled(e.target.checked);
                    if (useGameStore.getState().isGM) {
                      socketService.updateTimeSettings({ fogEnabled: e.target.checked });
                    }
                  }}
                />
                Enable Fog
              </label>
                        </div>
            
                        {/* Gradient Shift slider */}
                        <div className="toolbar-settings-card toolbar-settings-card-stack">
              <Slider
                label={`Gradient Shift: ${fogShift.toFixed(1)}`}
                min="0"
                max="5"
                step="0.1"
                value={fogShift}
                onChange={(e) => {
                  // Ensure atmosphericFog is enabled
                  if (!VISUAL_OPTIONS.atmosphericFog) {
                    setAtmosphericFog(true);
                  }
                  const value = parseFloat(e.target.value);
                  setFogShiftState(value);
                  setFogShift(value);
                  if (useGameStore.getState().isGM) {
                    socketService.updateTimeSettings({ fogShift: value });
                  }
                }}
                disabled={!fogEnabled}
              />
                        </div>
            
                        {/* Intensity slider */}
                        <div className="toolbar-settings-card toolbar-settings-card-stack">
              <Slider
                label={`Intensity: ${Math.round(fogIntensity * 100)}%`}
                min="0"
                max="2"
                step="0.05"
                value={fogIntensity}
                onChange={(e) => {
                  // Ensure atmosphericFog is enabled
                  if (!VISUAL_OPTIONS.atmosphericFog) {
                    setAtmosphericFog(true);
                  }
                  const value = parseFloat(e.target.value);
                  console.log('Intensity slider changed:', value);
                  setFogIntensityState(value);
                  setFogIntensity(value);
                  if (useGameStore.getState().isGM) {
                    socketService.updateTimeSettings({ fogIntensity: value });
                  }
                }}
                disabled={!fogEnabled}
              />
                        </div>
            
                        {/* Speed slider */}
                        <div className="toolbar-settings-card toolbar-settings-card-stack">
              <Slider
                label={`Speed: ${fogSpeed.toFixed(1)}x`}
                min="0"
                max="3"
                step="0.1"
                value={fogSpeed}
                onChange={(e) => {
                  // Ensure atmosphericFog is enabled
                  if (!VISUAL_OPTIONS.atmosphericFog) {
                    setAtmosphericFog(true);
                  }
                  const value = parseFloat(e.target.value);
                  setFogSpeedState(value);
                  setFogSpeed(value);
                  if (useGameStore.getState().isGM) {
                    socketService.updateTimeSettings({ fogSpeed: value });
                  }
                }}
                disabled={!fogEnabled}
              />
                        </div>
            
                        {/* Direction slider */}
                        <div className="toolbar-settings-card toolbar-settings-card-stack">
              <Slider
                label={`Direction: ${fogDirection}°`}
                min="0"
                max="360"
                step="15"
                value={fogDirection}
                onChange={(e) => {
                  // Ensure atmosphericFog is enabled
                  if (!VISUAL_OPTIONS.atmosphericFog) {
                    setAtmosphericFog(true);
                  }
                  const value = parseInt(e.target.value);
                  setFogDirectionState(value);
                  setFogDirection(value);
                  if (useGameStore.getState().isGM) {
                    socketService.updateTimeSettings({ fogDirection: value });
                  }
                }}
                disabled={!fogEnabled}
              />
                        </div>
            
                        {/* Color 1 */}
                        <div className="toolbar-settings-card toolbar-settings-card-stack">
              <label className="toolbar-settings-caption">Primary Color</label>
              <input
                type="color"
                value={fogColor1}
                onChange={(e) => {
                  // Ensure atmosphericFog is enabled
                  if (!VISUAL_OPTIONS.atmosphericFog) {
                    setAtmosphericFog(true);
                  }
                  setFogColor1State(e.target.value);
                  setFogColor1(e.target.value);
                  if (useGameStore.getState().isGM) {
                    socketService.updateTimeSettings({ fogColor1: e.target.value });
                  }
                }}
                disabled={!fogEnabled}
                className="toolbar-color-input-full"
              />
                        </div>
            
                        {/* Color 2 */}
                        <div className="toolbar-settings-card toolbar-settings-card-stack">
              <label className="toolbar-settings-caption">Secondary Color</label>
              <input
                type="color"
                value={fogColor2}
                onChange={(e) => {
                  // Ensure atmosphericFog is enabled
                  if (!VISUAL_OPTIONS.atmosphericFog) {
                    setAtmosphericFog(true);
                  }
                  setFogColor2State(e.target.value);
                  setFogColor2(e.target.value);
                  if (useGameStore.getState().isGM) {
                    socketService.updateTimeSettings({ fogColor2: e.target.value });
                  }
                }}
                disabled={!fogEnabled}
                className="toolbar-color-input-full"
              />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </>
  );
});
