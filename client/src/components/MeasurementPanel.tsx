import React from 'react';
import { useGameStore } from '../store/gameStore';
import { Icon } from './Icon';
import type { MeasurementShape } from './measurement/MeasurementTypes';

interface MeasurementPanelProps {
  position: { top: number; left: number };
  isGM: boolean;
}

const measurementShapes: { id: MeasurementShape; icon: string; label: string }[] = [
  { id: 'line', icon: 'measure-line', label: 'Line' },
  { id: 'sphere', icon: 'measure-sphere', label: 'Sphere' },
  { id: 'cube', icon: 'measure-cube', label: 'Cube' },
  { id: 'cone', icon: 'measure-cone', label: 'Cone' },
  { id: 'cylinder', icon: 'measure-cylinder', label: 'Cylinder' },
];

export function MeasurementPanel({ position, isGM }: MeasurementPanelProps) {
  const measurementShape = useGameStore((state) => state.measurementShape);
  const setMeasurementShape = useGameStore((state) => state.setMeasurementShape);
  const gridUnit = useGameStore((state) => state.gridUnit);
  const setGridUnit = useGameStore((state) => state.setGridUnit);
  const clearMeasurements = useGameStore((state) => state.clearMeasurements);
  const measurements = useGameStore((state) => state.measurements);

  const handleClearAll = () => {
    if (window.confirm('Clear all measurements from the board?')) {
      clearMeasurements();
    }
  };

  if (!isGM) return null;

  return (
    <div
      className="settings-panel"
      style={{
        position: 'absolute',
        top: `${position.top}px`,
        left: `${position.left + 93}px`,
        zIndex: 'var(--z-index-overlay)',
        minWidth: '200px',
      }}
    >
      {/* Measurement Shape Selection */}
      <div
        className="toolbar-panel-label"
      >
        Measure Shape
      </div>
      <div
        className="game-toolbar-buttons"
      >
        {measurementShapes.map((shape) => (
          <button
            key={shape.id}
            onClick={() => setMeasurementShape(shape.id)}
            title={shape.label}
            className={`tool-btn toolbar-shape-btn ${measurementShape === shape.id ? 'active' : ''}`}
          >
            <Icon name={shape.icon} />
          </button>
        ))}
      </div>

      {/* Grid Unit Dropdown */}
      <div
        className="toolbar-panel-section"
      >
        <div className="toolbar-panel-label">
          Grid Unit
        </div>
        <select
          value={gridUnit}
          onChange={(e) => setGridUnit(e.target.value as 'ft' | 'km' | 'miles')}
          className="toolbar-select"
        >
          <option value="ft">Feet (ft)</option>
          <option value="km">Kilometers (km)</option>
          <option value="miles">Miles</option>
        </select>
      </div>

      {/* Clear All Button */}
      {measurements.length > 0 && (
        <div className="toolbar-panel-section">
          <button
            onClick={handleClearAll}
            className="toolbar-danger-btn"
          >
            Clear All ({measurements.length})
          </button>
        </div>
      )}
    </div>
  );
}
