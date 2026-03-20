import { useCallback, useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import type { ParticlePreset } from '../../particles/editor/particleSchema';

const PARTICLE_ICON_CLOUD = '\uF0C2';

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

export interface ParticleEmitterIconEntry {
  key: string;
  x: number;
  y: number;
  presetId: string;
  overrides?: Partial<ParticlePreset>;
}

export interface ParticleEmitterIconsOverlayProps {
  emitters: ParticleEmitterIconEntry[];
  selectedEmitterKeys?: string[];
  isVisible?: boolean;
  gridCellPx: number;
  stageScale?: number;
  stagePosition?: { x: number; y: number };
  pixiApp?: PIXI.Application;
  onEmitterClick?: (emitter: ParticleEmitterIconEntry, screenPos: { x: number; y: number }) => void;
  onEmitterDoubleClick?: (emitter: ParticleEmitterIconEntry, screenPos: { x: number; y: number }) => void;
  onEmitterDrag?: (emitter: ParticleEmitterIconEntry, screenPos: { x: number; y: number }) => void;
  onEmitterDragEnd?: (emitter: ParticleEmitterIconEntry) => void;
  presets?: ParticlePreset[];
}

export function ParticleEmitterIconsOverlay({
  emitters,
  selectedEmitterKeys = [],
  isVisible = true,
  gridCellPx,
  stageScale = 1,
  stagePosition = { x: 0, y: 0 },
  pixiApp,
  onEmitterClick,
  onEmitterDoubleClick,
  onEmitterDrag,
  onEmitterDragEnd,
  presets = [],
}: ParticleEmitterIconsOverlayProps) {
  const iconsRef = useRef<Map<string, PIXI.Container>>(new Map());
  const lastClickTimeRef = useRef<{ id: string; time: number } | null>(null);
  const draggingRef = useRef<{ emitterKey: string } | null>(null);
  const presetMapRef = useRef<Map<string, ParticlePreset>>(new Map());
  const [fontLoaded, setFontLoaded] = useState(false);

  // Simpler approach: Just refresh icons after a short delay to ensure PIXI is ready
  useEffect(() => {
    console.log('[ParticleEmitterIconsOverlay] Init effect running');
    
    // Immediate trigger to refresh icons once PIXI is ready
    const refreshTimer = setTimeout(() => {
      console.log('[ParticleEmitterIconsOverlay] Immediate refresh trigger');
      setFontLoaded(true);
    }, 100);
    
    // Fallback: Force refresh icons after 5 seconds
    const fallbackTimer = setTimeout(() => {
      console.log('[ParticleEmitterIconsOverlay] Fallback trigger - refreshing icons after 5s delay');
      setFontLoaded(true);
    }, 5000);
    
    return () => {
      clearTimeout(refreshTimer);
      clearTimeout(fallbackTimer);
    };
  }, []);

  useEffect(() => {
    presetMapRef.current = new Map(presets.map((preset) => [preset.id, preset]));
  }, [presets]);

  const getLayer = useCallback(() => {
    if (!pixiApp) return null;
    return (pixiApp as any).particleIconsLayer as PIXI.Container | null;
  }, [pixiApp]);

  const createIcon = useCallback(
    (emitter: ParticleEmitterIconEntry): PIXI.Container => {
      const container = new PIXI.Container();
      container.eventMode = 'static';
      container.cursor = 'grab';
      container.sortableChildren = true;

      const isSelected = selectedEmitterKeys.includes(emitter.key);

      const size = Math.max(24, (gridCellPx * 0.65) / stageScale);
      const fontSize = Math.max(16, size * 0.7)
      const label = new PIXI.Text({
        text: PARTICLE_ICON_CLOUD,
        style: {
          fontFamily: '"Font Awesome 6 Free", "Font Awesome 5 Free", Arial, sans-serif',
          fontSize: fontSize,
          fontWeight: '900' as const,
          fill: 0xffffff,
          stroke: { color: 0x0f172a, width: fontSize/4 },
        },
      });
      label.anchor.set(0.5);
      container.addChild(label);

      drawSpawnShapeGuide(container, emitter, presetMapRef.current.get(emitter.presetId), stageScale);

      (container as any).emitterKey = emitter.key;

      container.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
        e.stopPropagation();
        draggingRef.current = { emitterKey: emitter.key };
        container.cursor = 'grabbing';
        const now = Date.now();
        const last = lastClickTimeRef.current;
        if (last && last.id === emitter.key && now - last.time < 300) {
          onEmitterDoubleClick?.(emitter, { x: e.global.x, y: e.global.y });
          lastClickTimeRef.current = null;
        } else {
          lastClickTimeRef.current = { id: emitter.key, time: now };
          onEmitterClick?.(emitter, { x: e.global.x, y: e.global.y });
        }
      });

      container.on('pointerup', () => {
        container.cursor = 'grab';
      });

      container.on('pointerupoutside', () => {
        container.cursor = 'grab';
      });

      return container;
    },
    [gridCellPx, stageScale, fontLoaded, onEmitterClick, onEmitterDoubleClick, selectedEmitterKeys]
  );

  const updateIconVisual = useCallback((icon: PIXI.Container, emitter: ParticleEmitterIconEntry) => {
    const preset = presetMapRef.current.get(emitter.presetId);
    drawSpawnShapeGuide(icon, emitter, preset, stageScale);
  }, [stageScale]);

  useEffect(() => {
    const layer = getLayer();
    if (!layer) return;
    layer.visible = isVisible;

    const nextIds = new Set(emitters.map((emitter) => emitter.key));
    for (const [id, icon] of iconsRef.current.entries()) {
      if (!nextIds.has(id)) {
        icon.parent?.removeChild(icon);
        icon.destroy({ children: true });
        iconsRef.current.delete(id);
      }
    }

    // Force recreate icons when fontLoaded changes from false to true
    if (fontLoaded) {
      console.log('[ParticleEmitterIconsOverlay] Force recreating icons due to fontLoaded');
      // Remove existing icons and recreate them
      iconsRef.current.forEach((icon) => {
        icon.parent?.removeChild(icon);
        icon.destroy({ children: true });
      });
      iconsRef.current.clear();
    }

    emitters.forEach((emitter) => {
      let icon = iconsRef.current.get(emitter.key);
      if (!icon) {
        icon = createIcon(emitter);
        iconsRef.current.set(emitter.key, icon);
        layer.addChild(icon);
      }
      icon.x = emitter.x;
      icon.y = emitter.y;
      updateIconVisual(icon, emitter);
    });

    return () => {
      // keep icons alive between renders; cleanup handled on unmount
    };
  }, [emitters, isVisible, getLayer, createIcon, updateIconVisual, presets, fontLoaded]);

  useEffect(() => {
    console.log('[ParticleEmitterIconsOverlay] Second useEffect running, fontLoaded:', fontLoaded);
    const layer = getLayer();
    if (!layer) {
      console.log('[ParticleEmitterIconsOverlay] No layer, skipping');
      return;
    }
    console.log('[ParticleEmitterIconsOverlay] Clearing and recreating all icons');
    for (const icon of iconsRef.current.values()) {
      icon.parent?.removeChild(icon);
      icon.destroy({ children: true });
    }
    iconsRef.current.clear();
    emitters.forEach((emitter) => {
      const icon = createIcon(emitter);
      iconsRef.current.set(emitter.key, icon);
      layer.addChild(icon);
      icon.x = emitter.x;
      icon.y = emitter.y;
      updateIconVisual(icon, emitter);
    });
  }, [stageScale, gridCellPx, getLayer, createIcon, emitters, updateIconVisual, presets, fontLoaded]);

  useEffect(() => {
    const layer = getLayer();
    return () => {
      if (!layer) return;
      for (const icon of iconsRef.current.values()) {
        icon.parent?.removeChild(icon);
        icon.destroy({ children: true });
      }
      iconsRef.current.clear();
    };
  }, [getLayer]);

  useEffect(() => {
    if (!pixiApp) return;

    const handlePointerMove = (e: PIXI.FederatedPointerEvent) => {
      if (!draggingRef.current) return;
      const emitter = emitters.find((entry) => entry.key === draggingRef.current?.emitterKey);
      if (!emitter) return;
      onEmitterDrag?.(emitter, { x: e.global.x, y: e.global.y });
    };

    const handlePointerUp = () => {
      if (!draggingRef.current) return;
      const emitter = emitters.find((entry) => entry.key === draggingRef.current?.emitterKey);
      if (emitter) {
        onEmitterDragEnd?.(emitter);
      }
      draggingRef.current = null;
    };

    const stage = pixiApp.stage;
    stage?.on('pointermove', handlePointerMove);
    stage?.on('pointerup', handlePointerUp);
    stage?.on('pointerupoutside', handlePointerUp);
    return () => {
      stage?.off('pointermove', handlePointerMove);
      stage?.off('pointerup', handlePointerUp);
      stage?.off('pointerupoutside', handlePointerUp);
    };
  }, [pixiApp, emitters, onEmitterDrag, onEmitterDragEnd, stagePosition, stageScale]);

  return null;
}

function drawSpawnShapeGuide(
  container: PIXI.Container,
  emitter: ParticleEmitterIconEntry,
  preset: ParticlePreset | undefined,
  stageScale: number,
): void {
  const existing = container.children.find((child) => (child as any).isSpawnGuide) as PIXI.Graphics | undefined;
  if (existing) {
    container.removeChild(existing);
    existing.destroy();
  }
  if (!preset) return;

  const g = new PIXI.Graphics();
  (g as any).isSpawnGuide = true;
  g.zIndex = -2;

  const merged = { ...preset, ...(emitter.overrides ?? {}) };
  const radius = Math.max(0, merged.spawnRadius ?? 0);
  const width = Math.max(0, merged.spawnWidth ?? 0);
  const height = Math.max(0, merged.spawnHeight ?? 0);
  const dir = ((merged.directionDeg ?? 0) * Math.PI) / 180;
  const coneAngle = ((merged.coneAngleDeg ?? 0) * Math.PI) / 180;

  const minRadius = 10 / Math.max(0.25, stageScale);
  const minDim = 16 / Math.max(0.25, stageScale);
  const drawRadius = Math.max(radius, minRadius);
  const drawWidth = Math.max(width, minDim);
  const drawHeight = Math.max(height, minDim);

  g.stroke({ width: 2 / Math.max(0.25, stageScale), color: 0x93c5fd, alpha: 0.9 });
  g.fill({ color: 0x3b82f6, alpha: 0.08 });

  switch (merged.spawnShape) {
    case 'point': {
      g.circle(0, 0, minRadius * 0.5);
      break;
    }
    case 'circle': {
      g.circle(0, 0, drawRadius);
      g.moveTo(0, 0);
      g.lineTo(Math.cos(dir) * drawRadius, Math.sin(dir) * drawRadius);
      break;
    }
    case 'ring': {
      const ringThickness = Math.max(minRadius * 0.7, drawRadius * 0.35);
      const inner = Math.max(minRadius * 0.45, drawRadius - ringThickness);
      const outer = drawRadius + ringThickness * 0.15;
      g.circle(0, 0, inner);
      g.circle(0, 0, outer);
      g.moveTo(Math.cos(dir) * inner, Math.sin(dir) * inner);
      g.lineTo(Math.cos(dir) * outer, Math.sin(dir) * outer);
      break;
    }
    case 'box': {
      g.rect(-drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      break;
    }
    case 'line': {
      const halfAlong = drawWidth / 2;
      const halfAcross = drawHeight / 2;
      const dirX = Math.cos(dir);
      const dirY = Math.sin(dir);
      const perpX = -dirY;
      const perpY = dirX;
      const ax = -dirX * halfAlong;
      const ay = -dirY * halfAlong;
      const bx = dirX * halfAlong;
      const by = dirY * halfAlong;
      g.moveTo(ax - perpX * halfAcross, ay - perpY * halfAcross);
      g.lineTo(ax + perpX * halfAcross, ay + perpY * halfAcross);
      g.lineTo(bx + perpX * halfAcross, by + perpY * halfAcross);
      g.lineTo(bx - perpX * halfAcross, by - perpY * halfAcross);
      g.closePath();
      break;
    }
    case 'cone': {
      const len = Math.max(drawRadius, minRadius * 2);
      const half = Math.max((20 * Math.PI) / 180, coneAngle / 2);
      const a1 = dir - half;
      const a2 = dir + half;
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a1) * len, Math.sin(a1) * len);
      g.arc(0, 0, len, a1, a2);
      g.lineTo(0, 0);
      g.moveTo(0, 0);
      g.lineTo(Math.cos(dir) * len, Math.sin(dir) * len);
      break;
    }
    default:
      break;
  }

  g.stroke({ width: 1.5 / Math.max(0.25, stageScale), color: 0xffffff, alpha: 0.95 });
  g.moveTo(-minRadius * 0.35, 0);
  g.lineTo(minRadius * 0.35, 0);
  g.moveTo(0, -minRadius * 0.35);
  g.lineTo(0, minRadius * 0.35);

  container.addChildAt(g, 0);
}
