import React, { useEffect, useRef, useCallback, useState } from 'react';
import * as PIXI from 'pixi.js';
import type { PersistedMeasurement } from './MeasurementTypes';
import { Text } from 'pixi.js';
import { gridCellToWorldCenter } from './MeasurementUtils';

export interface MeasurementIconsOverlayProps {
  measurements: PersistedMeasurement[];
  selectedMeasurementIds: string[];
  isGM: boolean;
  tool: string;
  isVisible?: boolean;
  gridCellPx: number;
  gridOffsetX?: number;
  gridOffsetY?: number;
  stagePosition?: { x: number; y: number };
  stageScale?: number;
  pixiApp?: PIXI.Application;
  onMeasurementClick?: (measurement: PersistedMeasurement, screenPos: { x: number; y: number }) => void;
  onMeasurementDoubleClick?: (measurement: PersistedMeasurement, screenPos: { x: number; y: number }) => void;
  onMeasurementDrag?: (measurement: PersistedMeasurement, screenPos: { x: number; y: number }) => void;
  onMeasurementDragEnd?: (measurement: PersistedMeasurement) => void;
  onMeasurementDragCancel?: (measurement: PersistedMeasurement) => void;
}

// Ruler icon - using Font Awesome
const MEASUREMENT_ICON_CHAR = '\uf545';
const MEASUREMENT_SELECTION_RING_LABEL = 'measurementSelectionRing';

// Wait for Font Awesome font to load before creating icons
const ensureFontLoaded = (): Promise<void> => {
  if (typeof document === 'undefined') return Promise.resolve();
  
  // Check if Font Awesome is already loaded
  if (document.fonts.check('12px Font Awesome')) {
    return Promise.resolve();
  }
  
  // Wait for fonts to load and return void
  return document.fonts.ready.then(() => {});
};

/**
 * Renders measurement icons using PIXI on the measurementIconsLayer.
 * This ensures measurement icons are rendered on the canvas for better performance
 * and proper synchronization with pan/zoom transformations.
 */
export function MeasurementIconsOverlay({
  measurements,
  selectedMeasurementIds,
  isGM,
  tool,
  isVisible = true,
  gridCellPx,
  gridOffsetX = 0,
  gridOffsetY = 0,
  stagePosition = { x: 0, y: 0 },
  stageScale = 1,
  pixiApp,
  onMeasurementClick,
  onMeasurementDoubleClick,
  onMeasurementDrag,
  onMeasurementDragEnd,
  onMeasurementDragCancel,
}: MeasurementIconsOverlayProps) {
  const iconsRef = useRef<Map<string, PIXI.Container>>(new Map());
  const draggingRef = useRef<{ measurementId: string; startX: number; startY: number } | null>(null);
  const dragStartMeasurementRef = useRef<PersistedMeasurement | null>(null);
  const lastClickTimeRef = useRef<{ measurementId: string; time: number } | null>(null);
  const layerInitializedRef = useRef(false);
  const [fontLoaded, setFontLoaded] = useState(false);

  // Force refresh icons multiple times to ensure font is loaded and PIXI has rendered
  useEffect(() => {
    // First refresh after 500ms
    const timer1 = setTimeout(() => {
      setFontLoaded(true);
    }, 500);
    
    // Second refresh after 2 seconds
    const timer2 = setTimeout(() => {
      setFontLoaded(prev => prev);
    }, 2000);
    
    // Final fallback after 5 seconds
    const timer3 = setTimeout(() => {
      setFontLoaded(prev => prev);
    }, 5000);
    
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, []);

  // Get the measurement layer from the pixi app (created in GameBoard)
  const getMeasurementIconsLayer = useCallback(() => {
    if (!pixiApp) return null;
    
    // Use the existing measurementLayer from GameBoard
    const measurementLayer = (pixiApp as any).measurementLayer as PIXI.Container | undefined;
    if (!measurementLayer) {
      console.log('[MeasurementIconsOverlay] measurementLayer not found in pixiApp');
      return null;
    }
    return measurementLayer;
  }, [pixiApp]);

  // Create a PIXI icon for a measurement
  const createMeasurementIcon = useCallback((measurement: PersistedMeasurement, isSelected: boolean): PIXI.Container => {
    const container = new PIXI.Container();
    container.eventMode = 'static';
    container.cursor = 'grab';
    container.sortableChildren = true;

    const iconSize = Math.max(24, (gridCellPx * 0.8) / stageScale);
    const fontSize = Math.max(18, iconSize * 0.75);

    // Create text with ruler icon (Font Awesome)
    const text = new PIXI.Text({
      text: MEASUREMENT_ICON_CHAR,
      style: {
        fontFamily: '"Font Awesome 6 Free", "Font Awesome 5 Free", Arial, sans-serif',
        fontSize: fontSize,
        fontWeight: '900' as const,
        fill: isSelected ? 0x00ff00 : 0x44ff44,
        dropShadow: {
          color: 0x000000,
          distance: 2,
          blur: 2,
          alpha: 0.8,
        },
        stroke: {
          color: 0x000000,
          width: fontSize/6,
        },
      },
    });
    text.anchor.set(0.5);
    container.addChild(text);

    // Selection highlight - green ring around the icon
    if (isSelected) {
      const selectionRing = new PIXI.Graphics();
      selectionRing.circle(0, 0, iconSize * 0.6);
      selectionRing.stroke({ 
        width: 2, 
        color: 0x00ff00, 
        alpha: 0.8 
      });
      selectionRing.zIndex = -1;
      selectionRing.label = MEASUREMENT_SELECTION_RING_LABEL;
      (selectionRing as any).__measurementSelectionRing = true;
      container.addChildAt(selectionRing, 0);
    }

    // Store reference to measurement data
    (container as any).measurementId = measurement.id;
    (container as any).__measurementIcon = true;

    // Add interaction handlers
    container.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      e.stopPropagation();
      const globalPos = e.global;
      draggingRef.current = {
        measurementId: measurement.id,
        startX: globalPos.x,
        startY: globalPos.y,
      };
      dragStartMeasurementRef.current = {
        ...measurement,
        origin: { ...measurement.origin },
        target: measurement.target ? { ...measurement.target } : undefined,
        outlineTarget: measurement.outlineTarget ? { ...measurement.outlineTarget } : undefined,
      };
      container.cursor = 'grabbing';
      
      // Track click time for double-click detection
      const now = Date.now();
      if (lastClickTimeRef.current?.measurementId === measurement.id && 
          now - lastClickTimeRef.current.time < 300) {
        // Double click detected
        onMeasurementDoubleClick?.(measurement, { x: globalPos.x, y: globalPos.y });
        lastClickTimeRef.current = null;
      } else {
        lastClickTimeRef.current = { measurementId: measurement.id, time: now };
        onMeasurementClick?.(measurement, { x: globalPos.x, y: globalPos.y });
      }
    });

    container.on('pointerup', (e: PIXI.FederatedPointerEvent) => {
      container.cursor = 'grab';
      if (draggingRef.current) {
        onMeasurementDragEnd?.(measurement);
      }
      draggingRef.current = null;
      dragStartMeasurementRef.current = null;
    });

    container.on('pointerupoutside', () => {
      container.cursor = 'grab';
      if (draggingRef.current) {
        onMeasurementDragEnd?.(measurement);
      }
      draggingRef.current = null;
      dragStartMeasurementRef.current = null;
    });

    return container;
  }, [gridCellPx, stageScale, onMeasurementClick, onMeasurementDoubleClick, onMeasurementDragEnd]);

  // Update icon position
  const updateIconPosition = useCallback((icon: PIXI.Container, measurement: PersistedMeasurement, gridSize: number, gridOffsetX: number, gridOffsetY: number) => {
    // Use the proper gridCellToWorldCenter function to convert grid cell to world coordinates
    const worldPos = gridCellToWorldCenter(
      measurement.origin,
      gridSize,
      gridOffsetX,
      gridOffsetY,
      measurement.gridKind
    );
    icon.x = worldPos.x;
    icon.y = worldPos.y;
  }, []);

  // Update icon selection state
  const updateIconSelection = useCallback((icon: PIXI.Container, isSelected: boolean, gridCellPx: number, stageScale: number) => {
    const text = icon.children.find(child => child instanceof Text) as Text;
    if (text) {
      text.style.fill = isSelected ? 0x00ff00 : 0x44ff44;
    }

    const existingRings = icon.children.filter((child) =>
      child instanceof PIXI.Graphics &&
      (((child as PIXI.Graphics).label === MEASUREMENT_SELECTION_RING_LABEL) || Boolean((child as any).__measurementSelectionRing))
    ) as PIXI.Graphics[];

    const iconSize = Math.max(24, (gridCellPx * 0.8) / stageScale);

    // Keep at most one ring to avoid duplicate green rings on zoom/update.
    for (let index = 1; index < existingRings.length; index += 1) {
      const ring = existingRings[index];
      if (ring.parent) ring.parent.removeChild(ring);
      ring.destroy();
    }

    const ring = existingRings[0];
    if (!isSelected) {
      if (ring) {
        if (ring.parent) ring.parent.removeChild(ring);
        ring.destroy();
      }
      return;
    }

    const targetRing = ring ?? new PIXI.Graphics();
    targetRing.label = MEASUREMENT_SELECTION_RING_LABEL;
    (targetRing as any).__measurementSelectionRing = true;
    targetRing.clear();
    targetRing.circle(0, 0, iconSize * 0.6);
    targetRing.stroke({
      width: 2,
      color: 0x00ff00,
      alpha: 0.8,
    });
    targetRing.zIndex = -1;

    if (!ring) {
      icon.addChildAt(targetRing, 0);
    }
  }, []);

  // Sync effect - runs when measurements or visibility changes
  useEffect(() => {
    const layer = getMeasurementIconsLayer();
    
    // Don't render if not visible or no layer
    if (!isVisible || !layer) {
      // Clean up icons when not visible
      iconsRef.current.forEach((icon) => {
        layer?.removeChild(icon);
        icon.destroy();
      });
      iconsRef.current.clear();
      return;
    }

    if (!fontLoaded) {
      return;
    }

    // Don't clear the layer - the original measurement rendering in GameBoard handles that
    // Just add our icons on top
    
    // Create/update icons for each measurement
    measurements.forEach(measurement => {
      const isSelected = selectedMeasurementIds.includes(measurement.id);
      let icon = iconsRef.current.get(measurement.id);

      if (!icon) {
        // Create new icon
        icon = createMeasurementIcon(measurement, isSelected);
        iconsRef.current.set(measurement.id, icon);
        layer.addChild(icon);
      }

      // Update position - use grid cell conversion
      const gridSize = gridCellPx;
      updateIconPosition(icon, measurement, gridSize, gridOffsetX, gridOffsetY);

      // Update selection state
      updateIconSelection(icon, isSelected, gridCellPx, stageScale);
    });

    // Remove icons for deleted measurements
    const measurementIdSet = new Set(measurements.map((m) => m.id));
    iconsRef.current.forEach((icon, id) => {
      if (measurementIdSet.has(id)) return;
      if (icon.parent) {
        icon.parent.removeChild(icon);
      }
      icon.destroy();
      iconsRef.current.delete(id);
    });
  }, [
    measurements,
    selectedMeasurementIds,
    isGM,
    tool,
    isVisible,
    gridCellPx,
    gridOffsetX,
    gridOffsetY,
    stagePosition,
    stageScale,
    fontLoaded,
    getMeasurementIconsLayer,
    createMeasurementIcon,
    updateIconPosition,
    updateIconSelection,
  ]);

  // Handle global pointer move for dragging
  useEffect(() => {
    if (!pixiApp) return;

    const handlePointerMove = (e: PIXI.FederatedPointerEvent) => {
      if (draggingRef.current) {
        const measurement = measurements.find(m => m.id === draggingRef.current?.measurementId);
        if (measurement) {
          onMeasurementDrag?.(measurement, { x: e.global.x, y: e.global.y });
        }
      }
    };

    const stage = pixiApp.stage;
    stage.on('pointermove', handlePointerMove);

    return () => {
      stage.off('pointermove', handlePointerMove);
    };
  }, [pixiApp, measurements, onMeasurementDrag]);

  // Ensure dragging always ends even if icon containers are reparented/re-rendered during drag
  useEffect(() => {
    if (!pixiApp) return;

    const clearDragState = () => {
      if (!draggingRef.current) return;
      const measurement = measurements.find((m) => m.id === draggingRef.current?.measurementId);
      if (measurement) {
        onMeasurementDragEnd?.(measurement);
      }
      draggingRef.current = null;
      dragStartMeasurementRef.current = null;
    };

    const stage = pixiApp.stage;
    stage.on('pointerup', clearDragState);
    stage.on('pointerupoutside', clearDragState);

    const onRightClickCancel = (e: PIXI.FederatedPointerEvent) => {
      if (!draggingRef.current || e.button !== 2) return;
      const measurement = measurements.find((m) => m.id === draggingRef.current?.measurementId);
      const startMeasurement = dragStartMeasurementRef.current;
      if (startMeasurement) {
        onMeasurementDragCancel?.(startMeasurement);
      } else if (measurement) {
        onMeasurementDragCancel?.(measurement);
      }
      draggingRef.current = null;
      dragStartMeasurementRef.current = null;
      e.preventDefault();
      e.stopPropagation();
    };
    stage.on('pointerdown', onRightClickCancel);

    return () => {
      stage.off('pointerup', clearDragState);
      stage.off('pointerupoutside', clearDragState);
      stage.off('pointerdown', onRightClickCancel);
    };
  }, [pixiApp, measurements, onMeasurementDragEnd, onMeasurementDragCancel]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      iconsRef.current.forEach((icon) => {
        icon.destroy();
      });
      iconsRef.current.clear();
    };
  }, []);

  return null;
}

export default MeasurementIconsOverlay;
