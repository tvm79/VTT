import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  ParticlePreset,
  ParticleBinding,
  ParticleEventType,
  ParticleCurve,
  ParticleCurvePoint,
  ParticleGradientStop,
} from './particleSchema';
import {
  getParticlePresets,
  updateParticlePreset,
  deleteParticlePreset,
  importParticlePresets,
  exportParticlePresets,
  resetParticlePresets,
  subscribeParticlePresets,
} from './particlePresetStore';
import { ParticlePreview } from './ParticlePreview';
import { Icon } from '../../components/Icon';
import { PARTICLE_ATLAS_TEXTURES } from '../runtime/particleTextures';
import { useGameStore } from '../../store/gameStore';

const EVENT_TYPES: ParticleEventType[] = [
  'token_move',
  'token_stop',
  'token_attack',
  'token_hit',
  'token_crit',
  'token_heal',
  'token_die',
  'spell_cast',
  'spell_impact',
  'buff_apply',
  'debuff_apply',
  'aura_tick',
  'manual',
];

const CURVE_PRESETS: Array<{ label: string; icon: string; points: ParticleCurvePoint[] }> = [
  { label: 'Linear', icon: 'minus', points: [{ t: 0, v: 0 }, { t: 1, v: 1 }] },
  { label: 'Ease In', icon: 'arrow-up', points: [{ t: 0, v: 0 }, { t: 0.4, v: 0.1 }, { t: 1, v: 1 }] },
  { label: 'Ease Out', icon: 'arrow-left', points: [{ t: 0, v: 0 }, { t: 0.6, v: 0.9 }, { t: 1, v: 1 }] },
  { label: 'Ease In/Out', icon: 'arrows-alt', points: [{ t: 0, v: 0 }, { t: 0.25, v: 0.1 }, { t: 0.75, v: 0.9 }, { t: 1, v: 1 }] },
  { label: 'Spike', icon: 'bolt', points: [{ t: 0, v: 0 }, { t: 0.45, v: 0.25 }, { t: 0.5, v: 1 }, { t: 0.55, v: 0.25 }, { t: 1, v: 0 }] },
  { label: 'Pulse', icon: 'repeat', points: [{ t: 0, v: 0 }, { t: 0.2, v: 1 }, { t: 0.4, v: 0 }, { t: 0.6, v: 1 }, { t: 0.8, v: 0.2 }, { t: 1, v: 0 }] },
];

const GRADIENT_DRAG_THRESHOLD_PX = 5;

interface ParticleEditorPanelProps {
  selectedPresetId?: string;
  onSelectPreset?: (presetId: string) => void;
  emitterEdit?: { key: string; presetId: string; overrides: Partial<ParticlePreset> };
  onEmitterOverrideChange?: (key: string, overrides: Partial<ParticlePreset>) => void;
  onClearEmitterEdit?: () => void;
}

const OVERRIDE_FIELDS: Array<keyof ParticlePreset> = [
  'texture',
  'blendMode',
  'emissionMode',
  'maxParticles',
  'emitRate',
  'burstCount',
  'durationMs',
  'cooldownMs',
  'lifetimeMinMs',
  'lifetimeMaxMs',
  'startSize',
  'endSize',
  'sizeUnit',
  'startAlpha',
  'endAlpha',
  'startColor',
  'endColor',
  'gradientStops',
  'sizeCurve',
  'alphaCurve',
  'rotationSpeedCurve',
  'velocityCurve',
  'colorIntensityCurve',
  'speedMin',
  'speedMax',
  'directionDeg',
  'spreadDeg',
  'startRotationMinDeg',
  'startRotationMaxDeg',
  'rotationSpeedMinDegPerSec',
  'rotationSpeedMaxDegPerSec',
  'gravityX',
  'gravityY',
  'drag',
  'spawnShape',
  'spawnRadius',
  'spawnWidth',
  'spawnHeight',
  'coneAngleDeg',
  'attachMode',
  'sortGroup',
  'zIndex',
];

export function ParticleEditorPanel({
  selectedPresetId,
  onSelectPreset,
  emitterEdit,
  onEmitterOverrideChange,
  onClearEmitterEdit,
}: ParticleEditorPanelProps) {
  const [presets, setPresets] = useState<ParticlePreset[]>(() => getParticlePresets());
  const [activePresetId, setActivePresetId] = useState<string>(
    selectedPresetId ?? presets[0]?.id ?? ''
  );
  const textureInputRef = useRef<HTMLInputElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const previewInstanceRef = useRef<ParticlePreview | null>(null);
  const [isUploadingTexture, setIsUploadingTexture] = useState(false);
  const [textureError, setTextureError] = useState<string | null>(null);
  const [previewHeight, setPreviewHeight] = useState(170);
  const [isInspectorResizing, setIsInspectorResizing] = useState(false);
  const resizeStartRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const inspectorResizeStartRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const {
    setFileBrowserVisible,
    setFileBrowserSelectCallback,
    particleInspectorWidth,
    setParticleInspectorWidth,
  } = useGameStore();

  useEffect(() => {
    const unsubscribe = subscribeParticlePresets(() => {
      setPresets(getParticlePresets());
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (selectedPresetId && selectedPresetId !== activePresetId) {
      setActivePresetId(selectedPresetId);
    }
  }, [selectedPresetId, activePresetId]);

  // Initialize preview on mount
  useEffect(() => {
    if (!previewRef.current) return;
    if (previewInstanceRef.current) return;
    
    const preview = new ParticlePreview();
    previewInstanceRef.current = preview;
    
    preview.mount(previewRef.current)
      .then(() => {
        preview.setPresets(presets);
        if (activePresetId) preview.playPreset(activePresetId);
      })
      .catch(err => console.warn('Failed to init preview:', err));
    
    return () => {
      // Don't destroy on cleanup - keep it alive for the lifetime of the panel
    };
  }, []);

  // Update presets when they change
  useEffect(() => {
    previewInstanceRef.current?.setPresets(presets);
  }, [presets]);

  const basePreset = useMemo(() => {
    if (emitterEdit) {
      return presets.find((preset) => preset.id === emitterEdit.presetId) ?? presets[0];
    }
    return presets.find((preset) => preset.id === activePresetId) ?? presets[0];
  }, [presets, activePresetId, emitterEdit]);

  const activePreset = useMemo(() => {
    if (!basePreset) return undefined;
    if (!emitterEdit) return basePreset;
    return { ...basePreset, ...emitterEdit.overrides };
  }, [basePreset, emitterEdit]);

  // Replay preset when it's edited (any change to activePreset)
  useEffect(() => {
    if (activePreset && previewInstanceRef.current) {
      previewInstanceRef.current.playPreset(activePreset.id);
    }
  }, [activePreset]);

  // Resize preview canvas when height changes
  useEffect(() => {
    // Delay to ensure DOM has updated
    const timeout = setTimeout(() => {
      previewInstanceRef.current?.resize();
    }, 50);
    return () => clearTimeout(timeout);
  }, [previewHeight]);

  const isCustomTexture =
    activePreset?.texture?.includes('/') ||
    activePreset?.texture?.includes('.') ||
    activePreset?.texture?.startsWith('http');
  const presetsByCategory = useMemo(() => {
    const grouped: Record<string, ParticlePreset[]> = {};
    presets.forEach((preset) => {
      const key = preset.category || 'uncategorized';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(preset);
    });
    return grouped;
  }, [presets]);

  const updatePreset = (next: ParticlePreset) => {
    if (emitterEdit && basePreset && onEmitterOverrideChange) {
      const overrides: Partial<ParticlePreset> = {};
      for (const field of OVERRIDE_FIELDS) {
        if (next[field] !== basePreset[field]) {
          overrides[field] = next[field] as never;
        }
      }
      onEmitterOverrideChange(emitterEdit.key, overrides);
      return;
    }
    updateParticlePreset(next);
    setActivePresetId(next.id);
    onSelectPreset?.(next.id);
  };

  const handleSelect = (presetId: string) => {
    setActivePresetId(presetId);
    onSelectPreset?.(presetId);
  };

  const createPreset = () => {
    const idBase = 'NewPreset';
    let id = idBase;
    let counter = 1;
    while (presets.some((preset) => preset.id === id)) {
      id = `${idBase}${counter++}`;
    }
    const newPreset: ParticlePreset = {
      ...(activePreset ?? presets[0]),
      id,
      name: 'New Preset',
      bindings: [],
    };
    updatePreset(newPreset);
  };

  const handleImport = () => {
    const raw = prompt('Paste particle preset JSON');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        importParticlePresets(parsed);
      }
    } catch (err) {
      console.warn('Invalid preset JSON', err);
    }
  };

  const handleExport = () => {
    const data = exportParticlePresets();
    navigator.clipboard.writeText(JSON.stringify(data, null, 2)).catch(() => {
      console.warn('Failed to copy presets to clipboard');
    });
  };

  // Preview resize handlers - using refs to avoid recreating on render
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeStartRef.current = { startY: e.clientY, startHeight: previewHeight };
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  }, [previewHeight]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizeStartRef.current) return;
    const delta = e.clientY - resizeStartRef.current.startY;
    const newHeight = Math.max(80, Math.min(400, resizeStartRef.current.startHeight + delta));
    setPreviewHeight(newHeight);
  }, []);

  const handleResizeEnd = useCallback(() => {
    resizeStartRef.current = null;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  }, [handleResizeMove]);

  const handleInspectorResizeMove = useCallback((e: MouseEvent) => {
    if (!inspectorResizeStartRef.current) return;
    const delta = inspectorResizeStartRef.current.startX - e.clientX;
    setParticleInspectorWidth(inspectorResizeStartRef.current.startWidth + delta);
  }, [setParticleInspectorWidth]);

  const handleInspectorResizeEnd = useCallback(() => {
    inspectorResizeStartRef.current = null;
    setIsInspectorResizing(false);
    document.removeEventListener('mousemove', handleInspectorResizeMove);
    document.removeEventListener('mouseup', handleInspectorResizeEnd);
  }, [handleInspectorResizeMove]);

  const handleInspectorResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    inspectorResizeStartRef.current = { startX: e.clientX, startWidth: particleInspectorWidth };
    setIsInspectorResizing(true);
    document.addEventListener('mousemove', handleInspectorResizeMove);
    document.addEventListener('mouseup', handleInspectorResizeEnd);
  }, [particleInspectorWidth, handleInspectorResizeMove, handleInspectorResizeEnd]);

  const handlePlayPreview = () => {
    previewInstanceRef.current?.playPreset(activePresetId);
  };

  const handleStopPreview = () => {
    previewInstanceRef.current?.stop();
  };

  const handleTextureUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploadingTexture(true);
    setTextureError(null);
    try {
      const file = files[0];
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/assets/upload?path=${encodeURIComponent('/particles')}`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !data?.file?.url) {
        throw new Error(data?.error || 'Upload failed');
      }
      if (activePreset?.id) {
        updatePreset({ ...activePreset, id: activePreset.id, texture: data.file.url });
      }
    } catch (err) {
      setTextureError(err instanceof Error ? err.message : 'Failed to upload texture');
    } finally {
      setIsUploadingTexture(false);
      if (textureInputRef.current) {
        textureInputRef.current.value = '';
      }
    }
  };

  if (!activePreset) {
    return <div style={{ color: '#fff', fontSize: '12px' }}>No presets available.</div>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `1fr ${particleInspectorWidth}px`, gridTemplateRows: '180px 1fr', gap: '10px', height: '100%', overflow: 'hidden' }}>
      {/* Left column: Preview + Presets */}
      <div style={{ background: '#1f1f1f', borderRadius: '6px', padding: '8px', display: 'flex', flexDirection: 'column', overflow: 'hidden', gridRow: '1 / 3' }}>
        {/* Preview Canvas */}
        <div
          ref={previewRef}
          style={{
            width: '100%',
            height: `${previewHeight}px`,
            background: '#0a0a0a',
            borderRadius: '4px',
            marginBottom: '4px',
            overflow: 'hidden',
          }}
        />
        {/* Resize Handle */}
        <div
          onMouseDown={handleResizeStart}
          style={{
            height: '10px',
            cursor: 'ns-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '8px',
            userSelect: 'none',
            background: 'linear-gradient(to bottom, transparent, #333 20%, #333 80%, transparent)',
            borderRadius: '2px',
          }}
        >
          <div style={{
            width: '32px',
            height: '4px',
            background: '#666',
            borderRadius: '2px',
          }} />
        </div>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <button
            className="tool-btn"
            onClick={createPreset}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            title="New Preset"
          >
            <Icon name="plus" />
          </button>
          <button
            className="tool-btn"
            onClick={handleImport}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Import Presets"
          >
            <Icon name="upload" />
          </button>
          <button
            className="tool-btn"
            onClick={handleExport}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Export Presets"
          >
            <Icon name="download" />
          </button>
          <button
            className="tool-btn"
            onClick={resetParticlePresets}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Reset Presets"
          >
            <Icon name="rotate" />
          </button>
          <div style={{ flex: 1 }} />
          <button
            className="tool-btn"
            onClick={handleStopPreview}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Stop Preview"
          >
            <Icon name="stop" />
          </button>
          <button
            className="tool-btn"
            onClick={handlePlayPreview}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Play Preview"
          >
            <Icon name="play" />
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {Object.entries(presetsByCategory).map(([category, items]) => (
            <div key={category} style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '10px', color: '#888', marginBottom: '6px', textTransform: 'uppercase' }}>
                {category}
              </div>
              <div style={styles.presetGrid}>
                {items.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handleSelect(preset.id)}
                    style={{
                      ...styles.presetButton,
                      ...(preset.id === activePreset.id ? styles.presetButtonActive : undefined),
                    }}
                    title={preset.name}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right column: Inspector */}
      <div style={{ position: 'relative', background: '#1f1f1f', borderRadius: '6px', padding: '8px', color: '#ddd', display: 'flex', flexDirection: 'column', overflow: 'hidden', gridRow: '1 / 3' }}>
        <div
          onMouseDown={handleInspectorResizeStart}
          title="Resize inspector"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '8px',
            cursor: 'ew-resize',
            background: isInspectorResizing ? 'rgba(120, 170, 255, 0.2)' : 'transparent',
          }}
        />
        <div style={{ fontSize: '12px', marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Inspector</span>
          {emitterEdit && (
            <button
              className="tool-btn"
              title="Exit Emitter Edit"
              onClick={() => onClearEmitterEdit?.()}
            >
              <Icon name="times" />
            </button>
          )}
        </div>
        {emitterEdit && (
          <div style={{ fontSize: '10px', color: '#9aa4b2', marginBottom: '6px' }}>
            Editing emitter overrides (this will not change the preset).
          </div>
        )}
        <div style={{ flex: 1, overflow: 'auto', paddingRight: '4px' }}>
          <Section title="Identity & Render" defaultOpen>
            <label style={styles.label}>Name</label>
            <input
              style={styles.input}
              value={activePreset.name}
              disabled={Boolean(emitterEdit)}
              onChange={(e) => updatePreset({ ...activePreset, name: e.target.value })}
            />
            <label style={styles.label}>Category</label>
            <input
              style={styles.input}
              value={activePreset.category}
              disabled={Boolean(emitterEdit)}
              onChange={(e) => updatePreset({ ...activePreset, category: e.target.value as ParticlePreset['category'] })}
            />
            <label style={styles.label}>Texture</label>
            <div style={styles.textureRow}>
              <select
                style={styles.input}
                value={isCustomTexture ? 'custom' : activePreset.texture}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === 'custom') return;
                  updatePreset({ ...activePreset, texture: value });
                }}
              >
                {PARTICLE_ATLAS_TEXTURES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                <option value="custom">custom texture</option>
              </select>
              <input
                style={styles.input}
                value={activePreset.texture}
                onChange={(e) => updatePreset({ ...activePreset, texture: e.target.value })}
                placeholder="/assets/particles/..."
              />
            </div>
            <div style={styles.textureActions}>
              <input
                ref={textureInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => handleTextureUpload(e.target.files)}
              />
              <button
                className="tool-btn"
                title="Browse Textures"
                onClick={() => {
                  setFileBrowserSelectCallback((url: string) => {
                    updatePreset({ ...activePreset, texture: url });
                    setFileBrowserVisible(false);
                    setFileBrowserSelectCallback(null);
                  });
                  setFileBrowserVisible(true);
                }}
              >
                <Icon name="folder" />
              </button>
              <button
                className="tool-btn"
                title="Upload Texture"
                onClick={() => textureInputRef.current?.click()}
                disabled={isUploadingTexture}
              >
                <Icon name="upload" />
              </button>
              {textureError && <span style={{ color: '#ff8a8a', fontSize: '10px' }}>{textureError}</span>}
            </div>
            <label style={styles.label}>Blend Mode</label>
            <select
              style={styles.input}
              value={activePreset.blendMode}
              onChange={(e) =>
                updatePreset({ ...activePreset, blendMode: e.target.value as ParticlePreset['blendMode'] })
              }
            >
              <option value="normal">normal</option>
              <option value="add">add</option>
              <option value="screen">screen</option>
            </select>
            <label style={styles.label}>Attach Mode</label>
            <select
              style={styles.input}
              value={activePreset.attachMode}
              onChange={(e) =>
                updatePreset({ ...activePreset, attachMode: e.target.value as ParticlePreset['attachMode'] })
              }
            >
              <option value="world">world</option>
              <option value="follow-token">follow-token</option>
            </select>
            <label style={styles.label}>Layer</label>
            <select
              style={styles.input}
              value={activePreset.sortGroup}
              onChange={(e) =>
                updatePreset({ ...activePreset, sortGroup: e.target.value as ParticlePreset['sortGroup'] })
              }
            >
              <option value="below-token">below-token</option>
              <option value="at-token">at-token</option>
              <option value="above-token">above-token</option>
              <option value="overlay">overlay</option>
            </select>
            <label style={styles.label}>Z Index</label>
            <RangeField
              value={activePreset.zIndex}
              min={-50}
              max={50}
              step={1}
              onChange={(value) => updatePreset({ ...activePreset, zIndex: value })}
            />
          </Section>

          <Section title="Emission">
            <label style={styles.label}>Emission Mode</label>
            <select
              style={styles.input}
              value={activePreset.emissionMode}
              onChange={(e) =>
                updatePreset({ ...activePreset, emissionMode: e.target.value as ParticlePreset['emissionMode'] })
              }
            >
              <option value="burst">burst</option>
              <option value="continuous">continuous</option>
            </select>
            <label style={styles.label}>Max Particles</label>
            <RangeField
              value={activePreset.maxParticles}
              min={1}
              max={200}
              step={1}
              onChange={(value) => updatePreset({ ...activePreset, maxParticles: value })}
            />
            <label style={styles.label}>Emit Rate</label>
            <RangeField
              value={activePreset.emitRate}
              min={0}
              max={200}
              step={1}
              onChange={(value) => updatePreset({ ...activePreset, emitRate: value })}
            />
            <label style={styles.label}>Burst Count</label>
            <RangeField
              value={activePreset.burstCount}
              min={0}
              max={200}
              step={1}
              onChange={(value) => updatePreset({ ...activePreset, burstCount: value })}
            />
            <label style={styles.label}>Duration (ms)</label>
            <RangeField
              value={activePreset.durationMs}
              min={0}
              max={10000}
              step={50}
              onChange={(value) => updatePreset({ ...activePreset, durationMs: value })}
            />
            <label style={styles.label}>Cooldown (ms)</label>
            <RangeField
              value={activePreset.cooldownMs}
              min={0}
              max={5000}
              step={50}
              onChange={(value) => updatePreset({ ...activePreset, cooldownMs: value })}
            />
          </Section>

          <Section title="Lifetime & Appearance">
            <label style={styles.label}>Lifetime (Min/Max) in seconds</label>
            <RangePair
              minValue={activePreset.lifetimeMinMs / 1000}
              maxValue={activePreset.lifetimeMaxMs / 1000}
              min={0.1}
              max={30}
              step={0.1}
              onChangeMin={(value) => updatePreset({ ...activePreset, lifetimeMinMs: value * 1000 })}
              onChangeMax={(value) => updatePreset({ ...activePreset, lifetimeMaxMs: value * 1000 })}
            />
            <GradientAlphaField
              startColor={activePreset.startColor}
              endColor={activePreset.endColor}
              startAlpha={activePreset.startAlpha}
              endAlpha={activePreset.endAlpha}
              gradientStops={activePreset.gradientStops}
              onChange={(next) => updatePreset({ ...activePreset, ...next })}
            />
            <label style={styles.label}>Size (Start/End)</label>
            <RangePair
              minValue={activePreset.startSize}
              maxValue={activePreset.endSize}
              min={0.1}
              max={50}
              step={0.1}
              onChangeMin={(value) => updatePreset({ ...activePreset, startSize: value })}
              onChangeMax={(value) => updatePreset({ ...activePreset, endSize: value })}
            />
            <label style={styles.label}>Size Unit</label>
            <select
              style={styles.input}
              value={activePreset.sizeUnit ?? 'px'}
              onChange={(e) => updatePreset({ ...activePreset, sizeUnit: e.target.value as ParticlePreset['sizeUnit'] })}
            >
              <option value="px">px</option>
              <option value="grid">grid units</option>
            </select>
            <CurveField
              label="Size Curve"
              curve={activePreset.sizeCurve}
              yMin={0}
              yMax={2}
              yStep={0.01}
              onChange={(curve) => updatePreset({ ...activePreset, sizeCurve: curve })}
            />
            <CurveField
              label="Alpha Curve"
              curve={activePreset.alphaCurve}
              yMin={0}
              yMax={2}
              yStep={0.01}
              onChange={(curve) => updatePreset({ ...activePreset, alphaCurve: curve })}
            />
            <CurveField
              label="Color Intensity Curve"
              curve={activePreset.colorIntensityCurve}
              yMin={0}
              yMax={2}
              yStep={0.01}
              onChange={(curve) => updatePreset({ ...activePreset, colorIntensityCurve: curve })}
            />
          </Section>

          <Section title="Motion">
            <label style={styles.label}>Speed (Min/Max)</label>
            <RangePair
              minValue={activePreset.speedMin}
              maxValue={activePreset.speedMax}
              min={0}
              max={600}
              step={1}
              onChangeMin={(value) => updatePreset({ ...activePreset, speedMin: value })}
              onChangeMax={(value) => updatePreset({ ...activePreset, speedMax: value })}
            />
            <label style={styles.label}>Direction / Spread</label>
            <RangePair
              minValue={activePreset.directionDeg}
              maxValue={activePreset.spreadDeg}
              min={-180}
              max={180}
              step={1}
              onChangeMin={(value) => updatePreset({ ...activePreset, directionDeg: value })}
              onChangeMax={(value) => updatePreset({ ...activePreset, spreadDeg: value })}
            />
            <label style={styles.label}>Start Rotation (Min/Max °)</label>
            <RangePair
              minValue={activePreset.startRotationMinDeg ?? 0}
              maxValue={activePreset.startRotationMaxDeg ?? 360}
              min={-360}
              max={360}
              step={1}
              onChangeMin={(value) => updatePreset({ ...activePreset, startRotationMinDeg: value })}
              onChangeMax={(value) => updatePreset({ ...activePreset, startRotationMaxDeg: value })}
            />
            <label style={styles.label}>Rotation Speed (Min/Max °/s)</label>
            <RangePair
              minValue={activePreset.rotationSpeedMinDegPerSec ?? -120}
              maxValue={activePreset.rotationSpeedMaxDegPerSec ?? 120}
              min={-1080}
              max={1080}
              step={1}
              onChangeMin={(value) => updatePreset({ ...activePreset, rotationSpeedMinDegPerSec: value })}
              onChangeMax={(value) => updatePreset({ ...activePreset, rotationSpeedMaxDegPerSec: value })}
            />
            <label style={styles.label}>Gravity (X/Y)</label>
            <RangePair
              minValue={activePreset.gravityX}
              maxValue={activePreset.gravityY}
              min={-500}
              max={500}
              step={1}
              onChangeMin={(value) => updatePreset({ ...activePreset, gravityX: value })}
              onChangeMax={(value) => updatePreset({ ...activePreset, gravityY: value })}
            />
            <label style={styles.label}>Drag</label>
            <RangeField
              value={activePreset.drag}
              min={0}
              max={5}
              step={0.01}
              onChange={(value) => updatePreset({ ...activePreset, drag: value })}
            />
            <CurveField
              label="Velocity Curve"
              curve={activePreset.velocityCurve}
              yMin={0}
              yMax={2}
              yStep={0.01}
              onChange={(curve) => updatePreset({ ...activePreset, velocityCurve: curve })}
            />
            <CurveField
              label="Rotation Speed Curve"
              curve={activePreset.rotationSpeedCurve}
              yMin={0}
              yMax={2}
              yStep={0.01}
              onChange={(curve) => updatePreset({ ...activePreset, rotationSpeedCurve: curve })}
            />
          </Section>

          <Section title="Spawn">
            <label style={styles.label}>Spawn Shape</label>
            <select
              style={styles.input}
              value={activePreset.spawnShape}
              onChange={(e) =>
                updatePreset({ ...activePreset, spawnShape: e.target.value as ParticlePreset['spawnShape'] })
              }
            >
              <option value="point">point</option>
              <option value="circle">circle</option>
              <option value="ring">ring</option>
              <option value="cone">cone</option>
              <option value="box">box</option>
              <option value="line">line</option>
            </select>
            <label style={styles.label}>Spawn Radius</label>
            <RangeField
              value={activePreset.spawnRadius}
              min={0}
              max={400}
              step={1}
              onChange={(value) => updatePreset({ ...activePreset, spawnRadius: value })}
            />
            <label style={styles.label}>Spawn Width / Height</label>
            <RangePair
              minValue={activePreset.spawnWidth}
              maxValue={activePreset.spawnHeight}
              min={0}
              max={2000}
              step={1}
              onChangeMin={(value) => updatePreset({ ...activePreset, spawnWidth: value })}
              onChangeMax={(value) => updatePreset({ ...activePreset, spawnHeight: value })}
            />
            <label style={styles.label}>Cone Angle</label>
            <RangeField
              value={activePreset.coneAngleDeg}
              min={0}
              max={180}
              step={1}
              onChange={(value) => updatePreset({ ...activePreset, coneAngleDeg: value })}
            />
          </Section>

          {!emitterEdit && (
            <Section title="Bindings" defaultOpen>
            {activePreset.bindings.map((binding, index) => (
              <div key={binding.id} style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                <select
                  style={styles.input}
                  value={binding.event}
                  onChange={(e) => {
                    const next = [...activePreset.bindings];
                    next[index] = { ...binding, event: e.target.value as ParticleEventType };
                    updatePreset({ ...activePreset, bindings: next });
                  }}
                >
                  {EVENT_TYPES.map((event) => (
                    <option key={event} value={event}>
                      {event}
                    </option>
                  ))}
                </select>
                <select
                  style={styles.input}
                  value={binding.anchor}
                  onChange={(e) => {
                    const next = [...activePreset.bindings];
                    next[index] = { ...binding, anchor: e.target.value as ParticleBinding['anchor'] };
                    updatePreset({ ...activePreset, bindings: next });
                  }}
                >
                  <option value="source">source</option>
                  <option value="target">target</option>
                  <option value="impact">impact</option>
                  <option value="path">path</option>
                </select>
                <button
                  className="tool-btn"
                  onClick={() => {
                    const next = activePreset.bindings.filter((_, i) => i !== index);
                    updatePreset({ ...activePreset, bindings: next });
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  title="Remove Binding"
                >
                  <Icon name="times" />
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
              <button
                className="tool-btn"
                onClick={() => {
                  const next: ParticleBinding = {
                    id: `binding_${Date.now()}`,
                    event: 'manual',
                    anchor: 'source',
                  };
                  updatePreset({ ...activePreset, bindings: [...activePreset.bindings, next] });
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                title="Add Binding"
              >
                <Icon name="plus" />
              </button>
              <button
                className="tool-btn"
                style={{ background: '#4b1a1a', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={() => deleteParticlePreset(activePreset.id)}
                title="Delete Preset"
              >
                <Icon name="trash" />
              </button>
            </div>
          </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} style={styles.section}>
      <summary style={styles.summary}>{title}</summary>
      <div style={styles.sectionBody}>{children}</div>
    </details>
  );
}

function RangeField({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div style={styles.rangeRow}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={styles.rangeInput}
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={styles.rangeNumber}
      />
    </div>
  );
}

function RangePair({
  minValue,
  maxValue,
  min,
  max,
  step,
  onChangeMin,
  onChangeMax,
}: {
  minValue: number;
  maxValue: number;
  min: number;
  max: number;
  step: number;
  onChangeMin: (value: number) => void;
  onChangeMax: (value: number) => void;
}) {
  return (
    <div style={styles.rangePair}>
      <RangeField value={minValue} min={min} max={max} step={step} onChange={onChangeMin} />
      <RangeField value={maxValue} min={min} max={max} step={step} onChange={onChangeMax} />
    </div>
  );
}

function GradientAlphaField({
  startColor,
  endColor,
  startAlpha,
  endAlpha,
  gradientStops,
  onChange,
}: {
  startColor: string;
  endColor: string;
  startAlpha: number;
  endAlpha: number;
  gradientStops?: ParticleGradientStop[];
  onChange: (next: Pick<ParticlePreset, 'startColor' | 'endColor' | 'startAlpha' | 'endAlpha' | 'gradientStops'>) => void;
}) {
  const fieldRootRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<{
    down: boolean;
    source: 'stop' | 'bar' | null;
    startX: number;
    startY: number;
    isDragging: boolean;
    activeStopIndex: number | null;
    wasSelectedOnPointerDown: boolean;
  }>({
    down: false,
    source: null,
    startX: 0,
    startY: 0,
    isDragging: false,
    activeStopIndex: null,
    wasSelectedOnPointerDown: false,
  });
  const stopsRef = useRef<ParticleGradientStop[]>([]);
  const [selectedStopIndex, setSelectedStopIndex] = useState<number | null>(null);
  const [popupStopIndex, setPopupStopIndex] = useState<number | null>(null);
  const stops = normalizeGradientStops(gradientStops, startColor, endColor, startAlpha, endAlpha);
  const gradient = `linear-gradient(90deg, ${stops
    .map((s) => {
      const rgb = hexToRgb(s.color);
      return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${s.alpha}) ${Math.round(s.t * 100)}%`;
    })
    .join(', ')})`;

  const commitStops = (nextStops: ParticleGradientStop[]) => {
    const normalized = normalizeGradientStops(nextStops, startColor, endColor, startAlpha, endAlpha);
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    onChange({
      gradientStops: normalized,
      startColor: first.color,
      endColor: last.color,
      startAlpha: first.alpha,
      endAlpha: last.alpha,
    });
  };

  stopsRef.current = stops;

  const selectedStop = selectedStopIndex !== null ? stops[selectedStopIndex] : null;
  const popupStop = popupStopIndex !== null ? stops[popupStopIndex] : null;

  const openStopPopup = useCallback((index: number) => {
    console.debug('[GradientAlphaField] openStopPopup', { index, stop: stopsRef.current[index] });
    setSelectedStopIndex(index);
    setPopupStopIndex(index);
  }, []);

  const findStopIndex = useCallback((list: ParticleGradientStop[], target: ParticleGradientStop) => {
    return list.findIndex(
      (s) => Math.abs(s.t - target.t) < 0.0001 && s.color === target.color && Math.abs(s.alpha - target.alpha) < 0.0001,
    );
  }, []);

  const moveStopAtPointerX = useCallback((clientX: number) => {
    if (!barRef.current) return;
    const activeIdx = interactionRef.current.activeStopIndex;
    if (activeIdx === null) return;
    const currentStops = stopsRef.current;
    if (!currentStops[activeIdx]) return;
    if (activeIdx === 0 || activeIdx === currentStops.length - 1) return;

    const rect = barRef.current.getBoundingClientRect();
    const t = clamp01((clientX - rect.left) / Math.max(1, rect.width));
    const movedStop = { ...currentStops[activeIdx], t };
    const next = currentStops.map((s, i) => (i === activeIdx ? movedStop : s));
    const normalized = normalizeGradientStops(next, startColor, endColor, startAlpha, endAlpha);
    stopsRef.current = normalized;
    const resolvedIndex = findStopIndex(normalized, movedStop);
    commitStops(normalized);
    if (resolvedIndex >= 0) {
      interactionRef.current.activeStopIndex = resolvedIndex;
      setSelectedStopIndex(resolvedIndex);
    }
  }, [endAlpha, endColor, findStopIndex, startAlpha, startColor]);

  const finalizeInteraction = useCallback(() => {
    const interaction = interactionRef.current;
    if (!interaction.down) return;

    if (!interaction.isDragging && interaction.activeStopIndex !== null) {
      if (interaction.source === 'stop' && interaction.wasSelectedOnPointerDown) {
        setSelectedStopIndex(null);
        setPopupStopIndex(null);
      } else {
        openStopPopup(interaction.activeStopIndex);
      }
    }

    interactionRef.current = {
      down: false,
      source: null,
      startX: 0,
      startY: 0,
      isDragging: false,
      activeStopIndex: null,
      wasSelectedOnPointerDown: false,
    };
  }, [openStopPopup]);


  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const interaction = interactionRef.current;
      if (!interaction.down) return;

      const dx = e.clientX - interaction.startX;
      const dy = e.clientY - interaction.startY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (!interaction.isDragging && distance > GRADIENT_DRAG_THRESHOLD_PX) {
        interaction.isDragging = true;
        setPopupStopIndex(null);
      }

      if (!interaction.isDragging) return;
      moveStopAtPointerX(e.clientX);
    };

    const handleMouseUp = () => finalizeInteraction();

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [finalizeInteraction, moveStopAtPointerX]);

  useEffect(() => {
    const handleDocumentMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (fieldRootRef.current?.contains(target)) return;
      setPopupStopIndex(null);
      setSelectedStopIndex(null);
    };

    window.addEventListener('mousedown', handleDocumentMouseDown);
    return () => {
      window.removeEventListener('mousedown', handleDocumentMouseDown);
    };
  }, []);

  return (
    <div ref={fieldRootRef}>
      <label style={styles.label}>Color + Alpha Gradient</label>
      <div style={styles.gradientPreviewWrap}>
        <div
          ref={barRef}
          style={{ ...styles.gradientPreviewBar, backgroundImage: gradient }}
          onContextMenu={(e) => e.preventDefault()}
          onMouseDown={(e) => {
            if (e.target !== e.currentTarget) {
              return;
            }
            if (!barRef.current) return;
            const rect = barRef.current.getBoundingClientRect();
            const t = clamp01((e.clientX - rect.left) / Math.max(1, rect.width));
            const sampled = sampleGradientStops(stopsRef.current, t);
            const createdStop: ParticleGradientStop = { t, color: sampled.color, alpha: sampled.alpha };
            const nextStops = normalizeGradientStops(
              [...stopsRef.current, createdStop],
              startColor,
              endColor,
              startAlpha,
              endAlpha,
            );
            stopsRef.current = nextStops;
            const idxByIdentity = findStopIndex(nextStops, createdStop);
            const idxByNearestT = nextStops.reduce(
              (best, s, i) => {
                const d = Math.abs(s.t - t);
                return d < best.distance ? { index: i, distance: d } : best;
              },
              { index: -1, distance: Number.POSITIVE_INFINITY },
            ).index;
            const idx = idxByIdentity >= 0 ? idxByIdentity : idxByNearestT;
            commitStops(nextStops);
            if (idx < 0) return;
            setSelectedStopIndex(idx);
            setPopupStopIndex(null);
            interactionRef.current = {
              down: true,
              source: 'bar',
              startX: e.clientX,
              startY: e.clientY,
              isDragging: false,
              activeStopIndex: idx,
              wasSelectedOnPointerDown: false,
            };
          }}
          onMouseUp={() => {
            finalizeInteraction();
          }}
          title="Click to add a gradient stop"
        >
          {stops.map((stop, idx) => (
            <button
              key={`${idx}-${stop.t}-${stop.color}-${stop.alpha}`}
              type="button"
              className="tool-btn"
              style={{
                ...styles.gradientStopDot,
                left: `${stop.t * 100}%`,
                borderColor: selectedStopIndex === idx ? '#fff' : '#111',
                background: stop.color,
                opacity: Math.max(0.2, stop.alpha),
                boxShadow: selectedStopIndex === idx ? '0 0 0 2px rgba(255,255,255,0.35)' : undefined,
              }}
              onClick={(ev) => {
                ev.stopPropagation();
              }}
              onMouseDown={(ev) => {
                ev.stopPropagation();
                if (ev.button !== 0) return;
                setSelectedStopIndex(idx);
                interactionRef.current = {
                  down: true,
                  source: 'stop',
                  startX: ev.clientX,
                  startY: ev.clientY,
                  isDragging: false,
                  activeStopIndex: idx,
                  wasSelectedOnPointerDown: selectedStopIndex === idx,
                };
              }}
              onContextMenu={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                if (stops.length <= 2) return;
                if (idx === 0 || idx === stops.length - 1) return;
                const next = stops.filter((_, i) => i !== idx);
                commitStops(next);
                setSelectedStopIndex(null);
                setPopupStopIndex(null);
              }}
              title={`Stop ${idx + 1}`}
            />
          ))}
        </div>
      </div>

      {popupStop && popupStopIndex !== null && (
        <>
          <div
            style={{
              ...styles.gradientEditorWindow,
            }}
          >
            <input
              type="color"
              value={popupStop.color}
              onChange={(e) => {
                const nextColor = e.target.value;
                const next = stops.map((s, i) => (i === popupStopIndex ? { ...s, color: nextColor } : s));
                commitStops(next);
              }}
              style={styles.gradientStopPopupColorButton}
              title="Stop color"
            />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={popupStop.alpha}
              onChange={(e) => {
                const alpha = clamp(Number(e.target.value), 0, 1);
                const next = stops.map((s, i) => (i === popupStopIndex ? { ...s, alpha } : s));
                commitStops(next);
              }}
              style={styles.gradientStopPopupAlpha}
              title="Stop alpha"
            />
            <button
              className="tool-btn"
              type="button"
              disabled={stops.length <= 2 || popupStopIndex === 0 || popupStopIndex === stops.length - 1}
              onClick={() => {
                if (popupStopIndex === null) return;
                if (popupStopIndex === 0 || popupStopIndex === stops.length - 1) return;
                const next = stops.filter((_, i) => i !== popupStopIndex);
                commitStops(next);
                setSelectedStopIndex(null);
                setPopupStopIndex(null);
              }}
              style={{ width: '100%', fontSize: '12px', lineHeight: 1.2, color: '#d7dce2' }}
              title="Remove selected stop"
            >
              Remove
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function CurveField({
  label,
  curve,
  yMin,
  yMax,
  yStep,
  onChange,
}: {
  label: string;
  curve: ParticleCurve | undefined;
  yMin: number;
  yMax: number;
  yStep: number;
  onChange: (curve: ParticleCurve) => void;
}) {
  const normalized = normalizeCurve(curve);
  const isEnabled = normalized.enabled;
  
  return (
    <div style={styles.curveWrap}>
      <div style={styles.curveHeader}>
        <span style={styles.label}>{label}</span>
        <label style={styles.curveToggleLabel}>
          <input
            type="checkbox"
            checked={normalized.enabled}
            onChange={(e) => onChange({ ...normalized, enabled: e.target.checked })}
          />
          enabled
        </label>
      </div>

      {isEnabled && (
        <>
          <div style={styles.curvePresetRow}>
            {CURVE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                className="tool-btn"
                type="button"
                style={styles.curvePresetBtn}
                onClick={() => onChange({ enabled: true, points: clonePoints(preset.points) })}
                title={`Apply ${preset.label}`}
              >
                <Icon name={preset.icon} />
              </button>
            ))}
            <button
              className="tool-btn"
              type="button"
              style={styles.curvePresetBtn}
              onClick={() => onChange(defaultCurve())}
              title="Reset curve"
            >
              Reset
            </button>
          </div>

          <div style={styles.curvePointsList}>
            {normalized.points.map((point, index) => (
              <div key={`${index}-${point.t}-${point.v}`} style={styles.curvePointRow}>
                <span style={styles.curvePointIndex}>{index + 1}</span>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={point.t}
                  style={styles.rangeNumber}
                  onChange={(e) => {
                    const points = normalized.points.map((p, i) => i === index ? { ...p, t: clamp01(Number(e.target.value)) } : p);
                    onChange({ ...normalized, points: sortAndFixEndpoints(points) });
                  }}
                />
                <input
                  type="number"
                  min={yMin}
                  max={yMax}
                  step={yStep}
                  value={point.v}
                  style={styles.rangeNumber}
                  onChange={(e) => {
                    const nextValue = clamp(Number(e.target.value), yMin, yMax);
                    const points = normalized.points.map((p, i) => i === index ? { ...p, v: nextValue } : p);
                    onChange({ ...normalized, points: sortAndFixEndpoints(points) });
                  }}
                />
                <button
                  className="tool-btn"
                  type="button"
                  disabled={normalized.points.length <= 2}
                  onClick={() => {
                    const points = normalized.points.filter((_, i) => i !== index);
                    onChange({ ...normalized, points: sortAndFixEndpoints(points) });
                  }}
                  title="Remove point"
                >
                  <Icon name="times" />
                </button>
              </div>
            ))}
          </div>
          <button
            className="tool-btn"
            type="button"
            style={styles.curveAddBtn}
            onClick={() => {
              const points = [...normalized.points, { t: 0.5, v: 1 }];
              onChange({ ...normalized, points: sortAndFixEndpoints(points) });
            }}
            title="Add curve point"
          >
            <Icon name="plus" />
          </button>
        </>
      )}
    </div>
  );
}

function defaultCurve(): ParticleCurve {
  return {
    enabled: false,
    points: [
      { t: 0, v: 1 },
      { t: 1, v: 1 },
    ],
  };
}

function normalizeCurve(curve?: ParticleCurve): ParticleCurve {
  if (!curve) return defaultCurve();
  return {
    enabled: Boolean(curve.enabled),
    points: sortAndFixEndpoints(clonePoints(curve.points ?? [])),
  };
}

function clonePoints(points: ParticleCurvePoint[]): ParticleCurvePoint[] {
  return points.map((point) => ({ ...point }));
}

function sortAndFixEndpoints(points: ParticleCurvePoint[]): ParticleCurvePoint[] {
  if (!points.length) return defaultCurve().points;
  const sorted = points
    .map((point) => ({ t: clamp01(point.t), v: Number.isFinite(point.v) ? point.v : 1 }))
    .sort((a, b) => a.t - b.t);
  if (sorted[0].t > 0) {
    sorted.unshift({ t: 0, v: sorted[0].v });
  }
  if (sorted[sorted.length - 1].t < 1) {
    sorted.push({ t: 1, v: sorted[sorted.length - 1].v });
  }
  return sorted;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function hexToRgb(color: string): { r: number; g: number; b: number } {
  const hex = (color || '#ffffff').replace('#', '').padStart(6, '0').slice(0, 6);
  const value = Number.parseInt(hex, 16);
  if (!Number.isFinite(value)) {
    return { r: 255, g: 255, b: 255 };
  }
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function normalizeGradientStops(
  stops: ParticleGradientStop[] | undefined,
  startColor: string,
  endColor: string,
  startAlpha: number,
  endAlpha: number,
): ParticleGradientStop[] {
  const base = Array.isArray(stops) && stops.length > 0
    ? stops
    : [
        { t: 0, color: startColor, alpha: clamp(startAlpha, 0, 1) },
        { t: 1, color: endColor, alpha: clamp(endAlpha, 0, 1) },
      ];
  const normalized = base
    .map((s) => ({
      t: clamp01(s.t),
      color: typeof s.color === 'string' && s.color.length > 0 ? s.color : '#ffffff',
      alpha: clamp(s.alpha, 0, 1),
    }))
    .sort((a, b) => a.t - b.t);
  if (normalized[0].t > 0) normalized.unshift({ t: 0, color: normalized[0].color, alpha: normalized[0].alpha });
  if (normalized[normalized.length - 1].t < 1) normalized.push({ t: 1, color: normalized[normalized.length - 1].color, alpha: normalized[normalized.length - 1].alpha });
  return normalized;
}

function sampleGradientStops(stops: ParticleGradientStop[], t: number): { color: string; alpha: number } {
  if (!stops.length) return { color: '#ffffff', alpha: 1 };
  const x = clamp01(t);
  if (x <= stops[0].t) return { color: stops[0].color, alpha: stops[0].alpha };
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1];
    const next = stops[i];
    if (x <= next.t) {
      const range = Math.max(0.000001, next.t - prev.t);
      const local = (x - prev.t) / range;
      const a = hexToRgb(prev.color);
      const b = hexToRgb(next.color);
      return {
        color: rgbToHex(lerp(a.r, b.r, local), lerp(a.g, b.g, local), lerp(a.b, b.b, local)),
        alpha: lerp(prev.alpha, next.alpha, local),
      };
    }
  }
  const last = stops[stops.length - 1];
  return { color: last.color, alpha: last.alpha };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const styles = {
  label: {
    display: 'block',
    fontSize: '11px',
    color: '#aaa',
    marginTop: '8px',
  },
  input: {
    width: '100%',
    padding: '4px',
    background: '#2a2a2a',
    color: '#fff',
    border: '1px solid #444',
    borderRadius: '4px',
    fontSize: '11px',
  },
  rangeRow: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    width: '100%',
  },
  rangeInput: {
    flex: 1,
  },
  rangeNumber: {
    width: '64px',
    padding: '4px',
    background: '#2a2a2a',
    color: '#fff',
    border: '1px solid #444',
    borderRadius: '4px',
    fontSize: '11px',
  },
  rangePair: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: '6px',
  },
  presetGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
    gap: '6px',
  },
  presetButton: {
    background: '#2a2a2a',
    color: '#eee',
    border: '1px solid #3a3a3a',
    borderRadius: '6px',
    padding: '6px',
    fontSize: '11px',
    textAlign: 'center' as const,
    cursor: 'pointer',
  },
  presetButtonActive: {
    border: '1px solid #6aa0ff',
    boxShadow: '0 0 0 1px rgba(106, 160, 255, 0.3)',
  },
  textureRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '6px',
    alignItems: 'center',
  },
  textureActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '6px',
  },
  colorRow: {
    display: 'grid',
    gridTemplateColumns: '28px 1fr 28px 1fr',
    gap: '6px',
    alignItems: 'center',
  },
  colorInput: {
    width: '28px',
    height: '28px',
    padding: 0,
    border: '1px solid #444',
    background: '#2a2a2a',
  },
  gradientPreviewWrap: {
    border: '1px solid #3a3a3a',
    borderRadius: '5px',
    padding: '4px',
    marginTop: '4px',
    position: 'relative' as const,
    background: 'repeating-conic-gradient(#2a2a2a 0% 25%, #202020 0% 50%) 50% / 12px 12px',
  },
  gradientPreviewBar: {
    height: '20px',
    borderRadius: '3px',
    border: '1px solid rgba(255,255,255,0.15)',
    position: 'relative' as const,
    cursor: 'crosshair',
  },
  gradientControlsRow: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    marginTop: '6px',
  },
  alphaSwatchWrap: {
    width: '22px',
    height: '22px',
    borderRadius: '4px',
    border: '1px solid #444',
    overflow: 'hidden',
    background: 'repeating-conic-gradient(#2a2a2a 0% 25%, #202020 0% 50%) 50% / 8px 8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alphaSwatch: {
    width: '100%',
    height: '100%',
  },
  gradientEditorWindow: {
    position: 'relative' as const,
    top: 0,
    transform: 'none',
    padding: '8px',
    border: '1px solid #3a3a3a',
    borderRadius: '6px',
    background: '#171717',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    width: '100%',
    boxSizing: 'border-box' as const,
    zIndex: 8,
    boxShadow: '0 8px 20px rgba(0,0,0,0.45)',
    marginTop: '6px',
  },
  gradientStopPopupTitle: {
    fontSize: '10px',
    color: '#9aa4b2',
  },
  gradientStopPopupColorButton: {
    width: '100%',
    height: '32px',
    padding: 0,
    border: '1px solid #444',
    background: '#2a2a2a',
    borderRadius: '4px',
  },
  gradientStopPopupAlpha: {
    width: '100%',
  },
  gradientStopDot: {
    position: 'absolute' as const,
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: '10px',
    height: '10px',
    borderRadius: '999px',
    border: '2px solid #111',
    padding: 0,
    minWidth: 0,
  },
  curveWrap: {
    border: '1px solid #333',
    borderRadius: '6px',
    padding: '6px',
    marginTop: '8px',
    background: '#141414',
  },
  curveHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
  },
  curveToggleLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '10px',
    color: '#9aa4b2',
  },
  curvePresetRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    marginTop: '6px',
    marginBottom: '6px',
  },
  curvePresetBtn: {
    fontSize: '10px',
    padding: '2px 6px',
  },
  curvePointsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  curvePointRow: {
    display: 'grid',
    gridTemplateColumns: '18px 64px 64px 28px',
    alignItems: 'center',
    gap: '6px',
  },
  curvePointIndex: {
    fontSize: '10px',
    color: '#999',
    textAlign: 'center' as const,
  },
  curveAddBtn: {
    marginTop: '6px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '30px',
  },
  section: {
    border: '1px solid #2c2c2c',
    borderRadius: '6px',
    marginBottom: '8px',
    background: '#181818',
  },
  summary: {
    cursor: 'pointer',
    padding: '6px 8px',
    fontSize: '11px',
    color: '#ddd',
    listStyle: 'none',
  },
  sectionBody: {
    padding: '6px 8px 10px',
  },
} as const;
