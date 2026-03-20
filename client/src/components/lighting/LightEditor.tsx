import React from 'react';
import type { Light } from '../../../../shared/src/index';
import { Icon } from '../Icon';
import { Button, Dropdown, Input, Panel, Slider } from '../ui/primitives';

export interface LightEditorState {
  lightId: string;
  position: { x: number; y: number };
}

export interface LightEditorProps {
  light: Light;
  position: { x: number; y: number };
  colorScheme?: {
    secondary?: string;
    surface?: string;
    accent?: string;
  };
  onUpdateLight: (lightId: string, updates: Partial<Light>) => void;
  onSyncUpdateLight?: (lightId: string, updates: Partial<Light>) => void;
  onDeleteLight: (lightId: string) => void;
  onClose: () => void;
}

/**
 * Light Editor Panel Component
 * 
 * A reusable component for editing light properties.
 * Extracted from GameBoard.tsx for better separation of concerns.
 */
export const LightEditor: React.FC<LightEditorProps> = ({
  light,
  position,
  colorScheme,
  onUpdateLight,
  onSyncUpdateLight,
  onDeleteLight,
  onClose,
}) => {
  const presetButtonStyle = (background: string, borderColor: string, color = '#fff'): React.CSSProperties => ({
    background,
    borderColor,
    color,
  });

  const handleUpdate = (updates: Partial<Light>, sync: boolean = false) => {
    onUpdateLight(light.id, updates);
    if (sync && onSyncUpdateLight) {
      onSyncUpdateLight(light.id, updates);
    }
  };

  return (
    <Panel
      className="light-editor-panel light-editor-tokenized"
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y + 20,
        backgroundColor: colorScheme?.secondary || colorScheme?.surface || '#2d3748',
        borderColor: colorScheme?.accent || '#ffd700',
        zIndex: 9999,
        minWidth: '280px',
        pointerEvents: 'auto',
        visibility: 'visible',
        transform: 'translate(0, 0)',
      }}
      header={<div className="light-editor-heading"><Icon name="lightbulb" /> Edit Light</div>}
      footer={(
        <div className="light-editor-actions">
          <Button
            variant="danger"
            className="light-editor-action"
            onClick={() => {
              onDeleteLight(light.id);
              onClose();
            }}
          >
            Delete Light
          </Button>
          <Button variant="secondary" className="light-editor-action" onClick={onClose}>
            Close
          </Button>
        </div>
      )}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Light Name */}
      <Input
        label="Name"
          type="text"
          value={light.name}
          onChange={(e) => handleUpdate({ name: e.target.value })}
          onBlur={(e) => handleUpdate({ name: e.currentTarget.value }, true)}
      />
      
      {/* Radius */}
      <Slider
        label={`Radius: ${light.radius}px`}
        min="0"
        max="2000"
        value={light.radius}
          onChange={(e) => {
            const newRadius = parseInt(e.target.value);
            handleUpdate({ radius: newRadius, dimRadius: newRadius * 0.25 });
          }}
          onPointerUp={(e) => {
            const value = parseInt((e.target as HTMLInputElement).value, 10);
            handleUpdate({ radius: value, dimRadius: value * 0.25 }, true);
          }}
      />
      
      {/* Intensity */}
      <Slider
        label={`Intensity: ${light.intensity.toFixed(2)}`}
        min="0"
        max="1"
        step="0.05"
        value={light.intensity}
        onChange={(e) => handleUpdate({ intensity: parseFloat(e.target.value) })}
        onPointerUp={(e) => handleUpdate({ intensity: parseFloat((e.target as HTMLInputElement).value) }, true)}
      />
      
      {/* Alpha */}
      <Slider
        label={`Alpha: ${(light.alpha ?? 1).toFixed(2)}`}
        min="0"
        max="1"
        step="0.05"
        value={light.alpha ?? 1}
        onChange={(e) => handleUpdate({ alpha: parseFloat(e.target.value) })}
        onPointerUp={(e) => handleUpdate({ alpha: parseFloat((e.target as HTMLInputElement).value) }, true)}
      />
      
      {/* Color */}
      <Input
        label="Color"
        className="light-editor-color-input"
          type="color"
          value={`#${light.color.toString(16).padStart(6, '0')}`}
          onChange={(e) => {
            const colorHex = e.target.value.replace('#', '');
            handleUpdate({ color: parseInt(colorHex, 16) });
          }}
          onBlur={(e) => {
            const colorHex = e.currentTarget.value.replace('#', '');
            handleUpdate({ color: parseInt(colorHex, 16) }, true);
          }}
      />
      
      {/* Type */}
      <Dropdown
        label="Type"
          value={light.type}
          onChange={(e) => {
            const newType = e.target.value as 'point' | 'cone' | 'radiance';
            handleUpdate({ type: newType }, true);
          }}
        >
          <option value="point">Point Light</option>
          <option value="cone">Cone Light</option>
          <option value="radiance">Radiance (Ambient)</option>
      </Dropdown>

      {/* Blend Mode */}
      <Dropdown
        label="Blend Mode"
          value={light.blendMode || 'add'}
          onChange={(e) => {
            const blendMode = e.target.value as NonNullable<Light['blendMode']>;
            handleUpdate({ blendMode }, true);
          }}
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
      </Dropdown>

      {/* Light Presets */}
      <div>
        <div className="ui-field__label light-editor-section-label">Quick Presets</div>
        <div className="light-editor-preset-grid">
          {/* Torch */}
          <Button
            onClick={() => handleUpdate({ 
              name: 'Torch',
              radius: 150,
              color: 0xffaa44,
              intensity: 1.0,
              dimRadius: 37,
              effect: 'flicker',
              effectSpeed: 1,
              effectIntensity: 0.5,
              effectColor: 0xffaa00,
              blendMode: 'add'
            }, true)}
            variant="secondary"
            className="light-editor-preset-button"
            style={presetButtonStyle('linear-gradient(135deg, #ffaa44 0%, #ff6600 100%)', '#cc5500')}
            title="Torch - Warm orange, flickering"
          >
            🔥 Torch
          </Button>
          {/* Lantern */}
          <Button
            onClick={() => handleUpdate({ 
              name: 'Lantern',
              radius: 300,
              color: 0xffeedd,
              intensity: 1.2,
              dimRadius: 75,
              effect: 'none',
              blendMode: 'add'
            }, true)}
            variant="secondary"
            className="light-editor-preset-button"
            style={presetButtonStyle('linear-gradient(135deg, #ffeedd 0%, #ccaa88 100%)', '#aa8866')}
            title="Lantern - Bright white, steady"
          >
            🏮 Lantern
          </Button>
          {/* Candle */}
          <Button
            onClick={() => handleUpdate({ 
              name: 'Candle',
              radius: 80,
              color: 0xffaa33,
              intensity: 0.7,
              dimRadius: 20,
              effect: 'flicker',
              effectSpeed: 2,
              effectIntensity: 0.3,
              effectColor: 0xff8800,
              blendMode: 'add'
            }, true)}
            variant="secondary"
            className="light-editor-preset-button"
            style={presetButtonStyle('linear-gradient(135deg, #ffaa33 0%, #ff8800 100%)', '#cc6600')}
            title="Candle - Small, warm, subtle flicker"
          >
            🕯️ Candle
          </Button>
          {/* Sun */}
          <Button
            onClick={() => handleUpdate({ 
              name: 'Sun',
              radius: 500,
              color: 0xffffaa,
              intensity: 1.5,
              dimRadius: 400,
              effect: 'none',
              blendMode: 'screen'
            }, true)}
            variant="secondary"
            className="light-editor-preset-button"
            style={presetButtonStyle('linear-gradient(135deg, #ffffaa 0%, #ffff00 100%)', '#cccc00', '#333')}
            title="Sun - Bright ambient light"
          >
            ☀️ Sun
          </Button>
          {/* Magic */}
          <Button
            onClick={() => handleUpdate({ 
              name: 'Magic Light',
              radius: 200,
              color: 0xaa88ff,
              intensity: 1.0,
              dimRadius: 50,
              effect: 'pulse',
              effectSpeed: 0.5,
              effectIntensity: 0.5,
              effectColor: 0x8844ff,
              blendMode: 'add'
            }, true)}
            variant="secondary"
            className="light-editor-preset-button"
            style={presetButtonStyle('linear-gradient(135deg, #aa88ff 0%, #8844ff 100%)', '#6622cc')}
            title="Magic - Purple, pulsing"
          >
            ✨ Magic
          </Button>
          {/* Dark */}
          <Button
            onClick={() => handleUpdate({ 
              name: 'Darkness',
              radius: 100,
              color: 0x222244,
              intensity: 0.3,
              dimRadius: 0,
              effect: 'none',
              blendMode: 'multiply'
            }, true)}
            variant="secondary"
            className="light-editor-preset-button"
            style={presetButtonStyle('linear-gradient(135deg, #222244 0%, #111122 100%)', '#000011', '#aaa')}
            title="Darkness - Dimming area"
          >
            🌑 Dark
          </Button>
        </div>
      </div>

      {/* Effect Type */}
      <Dropdown
        label="Effect"
          value={light.effect || 'none'}
          onChange={(e) => {
            const effect = e.target.value as Light['effect'];
            handleUpdate({ effect }, true);
          }}
        >
          <option value="none">None (Static)</option>
          <option value="flicker">Flicker</option>
          <option value="pulse">Pulse</option>
          <option value="colorShift">Color Shift</option>
          <option value="swirl">Swirl</option>
      </Dropdown>

      {/* Effect Speed */}
      {(light.effect && light.effect !== 'none') && (
        <Slider
          label={`Effect Speed: ${light.effectSpeed || 1}`}
          min="0.1"
          max="5"
          step="0.1"
            value={light.effectSpeed || 1}
            onChange={(e) => handleUpdate({ effectSpeed: parseFloat(e.target.value) })}
            onPointerUp={(e) => handleUpdate({ effectSpeed: parseFloat((e.target as HTMLInputElement).value) }, true)}
        />
      )}

      {/* Effect Intensity */}
      {(light.effect && light.effect !== 'none') && (
        <Slider
          label={`Effect Intensity: ${(light.effectIntensity ?? 0.5).toFixed(2)}`}
          min="0"
          max="1"
          step="0.05"
            value={light.effectIntensity ?? 0.5}
            onChange={(e) => handleUpdate({ effectIntensity: parseFloat(e.target.value) })}
            onPointerUp={(e) => handleUpdate({ effectIntensity: parseFloat((e.target as HTMLInputElement).value) }, true)}
        />
      )}

      {/* Effect Color (for color shift) */}
      {light.effect === 'colorShift' && (
        <Input
          label="Secondary Color"
          className="light-editor-color-input"
            type="color"
            value={`#${(light.effectColor ?? 0xffaa00).toString(16).padStart(6, '0')}`}
            onChange={(e) => {
              const colorHex = e.target.value.replace('#', '');
              handleUpdate({ effectColor: parseInt(colorHex, 16) });
            }}
            onBlur={(e) => {
              const colorHex = e.currentTarget.value.replace('#', '');
              handleUpdate({ effectColor: parseInt(colorHex, 16) }, true);
            }}
        />
      )}
    </Panel>
  );
};

export default LightEditor;
