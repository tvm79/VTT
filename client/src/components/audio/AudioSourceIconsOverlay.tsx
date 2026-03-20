import React, { useEffect, useRef, useCallback, useState } from 'react';
import * as PIXI from 'pixi.js';
import type { AudioSource } from '../../../../shared/src';

export interface AudioSourceIconsOverlayProps {
  audioSources: AudioSource[];
  selectedAudioSourceIds: string[];
  isGM: boolean;
  tool: string;
  isVisible?: boolean;
  gridCellPx: number;
  stagePosition?: { x: number; y: number };
  stageScale?: number;
  pixiApp?: PIXI.Application;
  draggingAudioSourceId?: string; // ID of audio source being dragged for pull-to-size
  onAudioSourceClick?: (audioSource: AudioSource, screenPos: { x: number; y: number }) => void;
  onAudioSourceDoubleClick?: (audioSource: AudioSource, screenPos: { x: number; y: number }) => void;
  onAudioSourceDrag?: (audioSource: AudioSource, screenPos: { x: number; y: number }) => void;
  onAudioSourceDragEnd?: (audioSource: AudioSource) => void;
  onAudioSourceRadiusDrag?: (audioSource: AudioSource, newRadius: number) => void;
  onAudioSourceRadiusDragEnd?: (audioSource: AudioSource, newRadius: number) => void;
}

// Speaker icon for audio source
const AUDIO_ICON_CHAR = '\uF028';

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
 * Renders audio source icons using PIXI on the canvas.
 * Mirrors the LightIconsOverlay for consistent interaction patterns.
 */
export function AudioSourceIconsOverlay({
  audioSources,
  selectedAudioSourceIds,
  isGM,
  tool,
  isVisible = true,
  gridCellPx,
  stagePosition = { x: 0, y: 0 },
  stageScale = 1,
  pixiApp,
  draggingAudioSourceId,
  onAudioSourceClick,
  onAudioSourceDoubleClick,
  onAudioSourceDrag,
  onAudioSourceDragEnd,
  onAudioSourceRadiusDrag,
  onAudioSourceRadiusDragEnd,
}: AudioSourceIconsOverlayProps) {
  const iconsRef = useRef<Map<string, PIXI.Container>>(new Map());
  const radiusHandlesRef = useRef<Map<string, PIXI.Container>>(new Map());
  const draggingRef = useRef<{ audioSourceId: string; startX: number; startY: number } | null>(null);
  const radiusDraggingRef = useRef<{ audioSourceId: string; originalRadius: number; startPos: { x: number; y: number } } | null>(null);
  const lastClickTimeRef = useRef<{ audioSourceId: string; time: number } | null>(null);
  const justDoubleClickedRef = useRef<boolean>(false);
  const [fontLoaded, setFontLoaded] = useState(false);

  // Simpler approach: Just refresh icons after a short delay to ensure PIXI is ready
  useEffect(() => {
    //console.log('[AudioSourceIconsOverlay] Init effect running');
    
    // Immediate trigger to refresh icons once PIXI is ready
    const refreshTimer = setTimeout(() => {
      //console.log('[AudioSourceIconsOverlay] Immediate refresh trigger');
      setFontLoaded(true);
    }, 100);
    
    // Fallback: Force refresh icons after 5 seconds
    const fallbackTimer = setTimeout(() => {
      //console.log('[AudioSourceIconsOverlay] Fallback trigger - refreshing icons after 5s delay');
      setFontLoaded(true);
    }, 5000);
    
    return () => {
      clearTimeout(refreshTimer);
      clearTimeout(fallbackTimer);
    };
  }, []);

  // Get or create the audioIconsLayer
  const getAudioIconsLayer = useCallback(() => {
    if (!pixiApp) return null;
    return (pixiApp as any).audioIconsLayer as PIXI.Container | null;
  }, [pixiApp]);

  // Create a PIXI icon for an audio source
  const createAudioSourceIcon = useCallback((audioSource: AudioSource, isSelected: boolean): PIXI.Container => {
    const container = new PIXI.Container();
    container.eventMode = 'static';
    container.cursor = 'grab';
    container.sortableChildren = true;

    const iconSize = Math.max(24, (gridCellPx * 0.8) / stageScale);
    const fontSize = Math.max(18, iconSize * 0.75);

    // Create text with speaker icon (Font Awesome)
    const text = new PIXI.Text({
      text: AUDIO_ICON_CHAR,
      style: {
        fontFamily: '"Font Awesome 6 Free", "Font Awesome 5 Free", Arial, sans-serif',
        fontSize: fontSize,
        fontWeight: '900' as const,
        fill: isSelected ? 0x00ff00 : 0x00cc00,
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

    // Always show radius indicator ring (not just when selected) to support pull-to-size
    const radius = audioSource.radius || 200;
    const radiusRing = new PIXI.Graphics();
    radiusRing.circle(0, 0, radius);
    radiusRing.stroke({ 
      width: 2, 
      color: 0x00ff00,  // Always green
      alpha: 0.4 
    });
    radiusRing.zIndex = -1;
    (radiusRing as any).isRadiusRing = true;
    container.addChildAt(radiusRing, 0);

    // Store reference to audio source data
    (container as any).audioSourceId = audioSource.id;

    // Add interaction handlers
    container.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      e.stopPropagation();
      const globalPos = e.global;
      
      // Track if we've moved for drag detection
      (container as any).dragStartPos = { x: globalPos.x, y: globalPos.y };
      
      draggingRef.current = {
        audioSourceId: audioSource.id,
        startX: globalPos.x,
        startY: globalPos.y,
      };
      container.cursor = 'grabbing';
      
      // Track click time for double-click detection
      const now = Date.now();
      if (lastClickTimeRef.current?.audioSourceId === audioSource.id && 
          now - lastClickTimeRef.current.time < 300) {
        // Double click detected
        justDoubleClickedRef.current = true;
        onAudioSourceDoubleClick?.(audioSource, { x: globalPos.x, y: globalPos.y });
        lastClickTimeRef.current = null;
        draggingRef.current = null; // Cancel drag on double click
      } else {
        justDoubleClickedRef.current = false;
        lastClickTimeRef.current = { audioSourceId: audioSource.id, time: now };
        onAudioSourceClick?.(audioSource, { x: globalPos.x, y: globalPos.y });
      }
    });

    container.on('pointerup', () => {
      // Just clear dragging ref - drag end is handled by global pointerup
      container.cursor = 'grab';
      draggingRef.current = null;
      (container as any).dragStartPos = null;
    });

    container.on('pointerupoutside', () => {
      // Just clear dragging ref - drag end is handled by global pointerup
      container.cursor = 'grab';
      draggingRef.current = null;
      (container as any).dragStartPos = null;
    });

    container.on('globalmousemove', (e: PIXI.FederatedPointerEvent) => {
      // Update drag start position tracking
      if (draggingRef.current) {
        (container as any).dragStartPos = { x: e.global.x, y: e.global.y };
      }
    });

    return container;
  }, [gridCellPx, stageScale, fontLoaded, onAudioSourceClick, onAudioSourceDoubleClick, onAudioSourceDragEnd]);

  // Create a radius handle for an audio source
  const createRadiusHandle = useCallback((audioSource: AudioSource): PIXI.Container => {
    const container = new PIXI.Container();
    container.eventMode = 'static';
    container.cursor = 'ew-resize';
    container.sortableChildren = true;

    const handleSize = Math.max(12, (gridCellPx * 0.4) / stageScale);

    // Draw a circle handle
    const handle = new PIXI.Graphics();
    handle.circle(0, 0, handleSize);
    handle.fill({ color: 0x00ff00, alpha: 0.9 });
    handle.stroke({ width: 2, color: 0xffffff });
    container.addChild(handle);

    // Add arrows icon
    const arrows = new PIXI.Text('⇔', {
      fontFamily: 'Arial, sans-serif',
      fontSize: Math.max(10, handleSize * 0.8),
      fontWeight: 'bold' as const,
      fill: 0x000000,
    });
    arrows.anchor.set(0.5);
    container.addChild(arrows);

    // Store reference to audio source data
    (container as any).audioSourceId = audioSource.id;
    (container as any).isRadiusHandle = true;

    // Add interaction handlers for radius dragging
    container.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      
      const globalPos = e.global;
      radiusDraggingRef.current = {
        audioSourceId: audioSource.id,
        originalRadius: audioSource.radius || 200,
        startPos: { x: globalPos.x, y: globalPos.y },
      };
      container.cursor = 'grabbing';
    });

    container.on('pointerup', (e: PIXI.FederatedPointerEvent) => {
      if (radiusDraggingRef.current) {
        // Calculate final radius and send to server
        const audioSource = audioSources.find(a => a.id === radiusDraggingRef.current?.audioSourceId);
        if (audioSource) {
          const globalPos = e.global;
          const stagePos = {
            x: audioSource.x * stageScale + stagePosition.x,
            y: audioSource.y * stageScale + stagePosition.y
          };
          const dx = globalPos.x - stagePos.x;
          const dy = globalPos.y - stagePos.y;
          const newRadius = Math.sqrt(dx * dx + dy * dy);
          onAudioSourceRadiusDragEnd?.(audioSource, newRadius);
        }
      }
      container.cursor = 'ew-resize';
      radiusDraggingRef.current = null;
    });

    container.on('pointerupoutside', (e: PIXI.FederatedPointerEvent) => {
      if (radiusDraggingRef.current) {
        // Calculate final radius and send to server
        const audioSource = audioSources.find(a => a.id === radiusDraggingRef.current?.audioSourceId);
        if (audioSource) {
          const globalPos = e.global;
          const stagePos = {
            x: audioSource.x * stageScale + stagePosition.x,
            y: audioSource.y * stageScale + stagePosition.y
          };
          const dx = globalPos.x - stagePos.x;
          const dy = globalPos.y - stagePos.y;
          const newRadius = Math.sqrt(dx * dx + dy * dy);
          onAudioSourceRadiusDragEnd?.(audioSource, newRadius);
        }
      }
      container.cursor = 'ew-resize';
      radiusDraggingRef.current = null;
    });

    return container;
  }, [gridCellPx, stageScale, onAudioSourceRadiusDragEnd, audioSources, stagePosition, stageScale]);

  // Convert world coordinates to stage coordinates
  const worldToStage = useCallback((worldX: number, worldY: number): { x: number; y: number } => {
    return {
      x: worldX * stageScale + stagePosition.x,
      y: worldY * stageScale + stagePosition.y,
    };
  }, [stageScale, stagePosition]);

  // Update icon positions
  useEffect(() => {
    //console.log('[AudioSourceIconsOverlay] Sync useEffect running, fontLoaded:', fontLoaded);
    
    // Get the layer
    const layer = getAudioIconsLayer();
    
    // Show icons when in audio tool mode OR when isVisible is true (for select mode with filter enabled)
    const shouldShowIcons = isGM && (tool === 'audio' || isVisible) && pixiApp;
    
    if (!shouldShowIcons) {
      // Clear all icons if not in audio tool mode or not visible
      if (layer) {
        layer.removeChildren();
      }
      iconsRef.current.clear();
      radiusHandlesRef.current.clear();
      return;
    }

    if (!layer) return;

    // Recreate icons when fontLoaded changes - runs AFTER visibility check
    if (fontLoaded) {
      //console.log('[AudioSourceIconsOverlay] Recreating all icons due to fontLoaded');
      iconsRef.current.forEach((icon) => {
        layer.removeChild(icon);
        icon.destroy({ children: true });
      });
      iconsRef.current.clear();
    }

    // Track which audio sources need new icons
    const currentIds = new Set(audioSources.map(a => a.id));

    // Remove icons for deleted audio sources
    for (const [id, icon] of iconsRef.current.entries()) {
      if (!currentIds.has(id)) {
        layer.removeChild(icon);
        iconsRef.current.delete(id);
      }
      // Also remove radius handles
      const handle = radiusHandlesRef.current.get(id);
      if (handle) {
        layer.removeChild(handle);
        radiusHandlesRef.current.delete(id);
      }
    }

    // Create/update icons for each audio source
    audioSources.forEach(audioSource => {
      const isSelected = selectedAudioSourceIds.includes(audioSource.id);
      let icon = iconsRef.current.get(audioSource.id);

      if (!icon) {
        icon = createAudioSourceIcon(audioSource, isSelected);
        iconsRef.current.set(audioSource.id, icon);
        layer.addChild(icon);
      } else {
        // Update selection state
        const existingIcon = icon;
        const newIcon = createAudioSourceIcon(audioSource, isSelected);
        // Replace the icon while keeping the same position
        const index = layer.getChildIndex(existingIcon);
        layer.removeChild(existingIcon);
        layer.addChildAt(newIcon, index);
        iconsRef.current.set(audioSource.id, newIcon);
        icon = newIcon;
      }

      // Update icon position - use world coordinates directly (PIXI handles transformation)
      // This is the same approach as LightIconsOverlay - no need for worldToStage conversion
      icon.x = audioSource.x;
      icon.y = audioSource.y;

      // Update or create radius handle for selected sources or sources being dragged
      // Show handle when selected OR when being dragged (for pull-to-size)
      const isBeingDragged = draggingAudioSourceId === audioSource.id;
      if (isSelected || isBeingDragged) {
        let handle = radiusHandlesRef.current.get(audioSource.id);
        if (!handle) {
          handle = createRadiusHandle(audioSource);
          radiusHandlesRef.current.set(audioSource.id, handle);
          layer.addChild(handle);
        }
        // Position handle at edge of radius - use world coordinates directly
        handle.x = audioSource.x + audioSource.radius;
        handle.y = audioSource.y;
      } else {
        const handle = radiusHandlesRef.current.get(audioSource.id);
        if (handle) {
          layer.removeChild(handle);
          radiusHandlesRef.current.delete(audioSource.id);
        }
      }
    });
  }, [
    audioSources, 
    selectedAudioSourceIds, 
    isGM, 
    tool, 
    pixiApp, 
    gridCellPx, 
    stageScale, 
    stagePosition,
    draggingAudioSourceId,
    getAudioIconsLayer,
    createAudioSourceIcon,
    createRadiusHandle,
    worldToStage,
    fontLoaded
  ]);

  // Handle global pointer move and up for dragging
  useEffect(() => {
    if (!pixiApp) return;

    const handlePointerMove = (e: PIXI.FederatedPointerEvent) => {
      const globalPos = { x: e.global.x, y: e.global.y };

      // Handle audio source dragging
      if (draggingRef.current) {
        const audioSource = audioSources.find(a => a.id === draggingRef.current?.audioSourceId);
        if (audioSource) {
          onAudioSourceDrag?.(audioSource, globalPos);
        }
      }

      // Handle radius dragging
      if (radiusDraggingRef.current) {
        const audioSource = audioSources.find(a => a.id === radiusDraggingRef.current?.audioSourceId);
        if (audioSource) {
          // Calculate new radius based on drag distance
          // Convert global mouse position to world coordinates for comparison
          const worldX = (globalPos.x - stagePosition.x) / stageScale;
          const worldY = (globalPos.y - stagePosition.y) / stageScale;
          const dx = worldX - audioSource.x;
          const dy = worldY - audioSource.y;
          const newRadius = Math.sqrt(dx * dx + dy * dy);
          onAudioSourceRadiusDrag?.(audioSource, newRadius);
        }
      }
    };

    const handlePointerUp = () => {
      // Handle position drag end
      if (draggingRef.current) {
        const audioSource = audioSources.find(a => a.id === draggingRef.current?.audioSourceId);
        if (audioSource) {
          onAudioSourceDragEnd?.(audioSource);
        }
        draggingRef.current = null;
      }

      // Handle radius drag end
      if (radiusDraggingRef.current) {
        const audioSource = audioSources.find(a => a.id === radiusDraggingRef.current?.audioSourceId);
        if (audioSource) {
          // Get current radius from the source
          const currentRadius = audioSource.radius || 200;
          onAudioSourceRadiusDragEnd?.(audioSource, currentRadius);
        }
        radiusDraggingRef.current = null;
      }
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
  }, [pixiApp, audioSources, worldToStage, onAudioSourceDrag, onAudioSourceDragEnd, onAudioSourceRadiusDrag, onAudioSourceRadiusDragEnd]);

  return null;
}

export default AudioSourceIconsOverlay;
