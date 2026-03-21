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
  onAudioSourceInnerRadiusDrag?: (audioSource: AudioSource, newInnerRadius: number) => void;
  onAudioSourceInnerRadiusDragEnd?: (audioSource: AudioSource, newInnerRadius: number) => void;
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
  onAudioSourceInnerRadiusDrag,
  onAudioSourceInnerRadiusDragEnd,
}: AudioSourceIconsOverlayProps) {
  const iconsRef = useRef<Map<string, PIXI.Container>>(new Map());
  const radiusHandlesRef = useRef<Map<string, PIXI.Container>>(new Map());
  const innerRadiusHandlesRef = useRef<Map<string, PIXI.Container>>(new Map());
  const draggingRef = useRef<{ audioSourceId: string; startX: number; startY: number } | null>(null);
  const radiusDraggingRef = useRef<{ audioSourceId: string; originalRadius: number; startPos: { x: number; y: number } } | null>(null);
  const innerRadiusDraggingRef = useRef<{ audioSourceId: string; originalInnerRadius: number; startPos: { x: number; y: number } } | null>(null);
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
      width: 4, 
      color: 0x00ff00,  // Always green
      alpha: 0.2 
    });
    // Enable pointer events on ring for hover detection (but stop propagation to prevent source dragging)
    radiusRing.eventMode = 'static';
    radiusRing.zIndex = -1;
    (radiusRing as any).isRadiusRing = true;
    (radiusRing as any).audioSourceId = audioSource.id;
    container.addChildAt(radiusRing, 0);
    
    // Stop propagation on ring pointer events to prevent source dragging
    radiusRing.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      e.stopPropagation();
    });
    radiusRing.on('pointerup', (e: PIXI.FederatedPointerEvent) => {
      e.stopPropagation();
      // Handle drag release when mouse is released on the ring
      if (radiusDraggingRef.current && radiusDraggingRef.current.audioSourceId === audioSource.id) {
        const globalPos = e.global;
        const stagePos = {
          x: audioSource.x * stageScale + stagePosition.x,
          y: audioSource.y * stageScale + stagePosition.y
        };
        const dx = globalPos.x - stagePos.x;
        const dy = globalPos.y - stagePos.y;
        const newRadius = Math.sqrt(dx * dx + dy * dy);
        onAudioSourceRadiusDragEnd?.(audioSource, newRadius);
        radiusDraggingRef.current = null;
        
        // Reset cursor
        const handle = radiusHandlesRef.current.get(audioSource.id);
        if (handle) {
          handle.cursor = 'ew-resize';
        }
      }
    });
    
    // Show handle on ring hover and track mouse position to update handle position
    radiusRing.on('pointerover', (e: PIXI.FederatedPointerEvent) => {
      const handle = radiusHandlesRef.current.get(audioSource.id);
      if (handle) {
        handle.visible = true;
        // Position handle at mouse intersection point on the ring
        const localPos = radiusRing.toLocal(e.global);
        const angle = Math.atan2(localPos.y, localPos.x);
        const radius = audioSource.radius || 200;
        handle.x = audioSource.x + radius * Math.cos(angle);
        handle.y = audioSource.y + radius * Math.sin(angle);
      }
    });
    radiusRing.on('pointermove', (e: PIXI.FederatedPointerEvent) => {
      const handle = radiusHandlesRef.current.get(audioSource.id);
      if (handle) {
        // Position handle at mouse intersection point on the ring
        const localPos = radiusRing.toLocal(e.global);
        const angle = Math.atan2(localPos.y, localPos.x);
        const radius = audioSource.radius || 200;
        handle.x = audioSource.x + radius * Math.cos(angle);
        handle.y = audioSource.y + radius * Math.sin(angle);
      }
    });
    radiusRing.on('pointerout', () => {
      if (!radiusDraggingRef.current) {
        const handle = radiusHandlesRef.current.get(audioSource.id);
        if (handle) {
          handle.visible = false;
        }
      }
    });

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

    const handleSize = Math.max(8, (gridCellPx * 0.3) / stageScale);
    const hitAreaSize = Math.max(16, (gridCellPx * 0.5) / stageScale);

    // Set a larger hit area for easier clicking
    container.hitArea = new PIXI.Circle(0, 0, hitAreaSize);

    // Draw a circle handle - yellow like the outer radius ring
    const handle = new PIXI.Graphics();
    handle.circle(0, 0, handleSize);
    handle.fill({ color: 0x00ff00, alpha: 0.8 });
    container.addChild(handle);

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

  // Create an inner radius handle for an audio source
  const createInnerRadiusHandle = useCallback((audioSource: AudioSource): PIXI.Container => {
    const container = new PIXI.Container();
    container.eventMode = 'static';
    container.cursor = 'ew-resize';
    container.sortableChildren = true;

    const handleSize = Math.max(6, (gridCellPx * 0.25) / stageScale);
    const hitAreaSize = Math.max(14, (gridCellPx * 0.4) / stageScale);

    // Set a larger hit area for easier clicking
    container.hitArea = new PIXI.Circle(0, 0, hitAreaSize);

    // Draw a smaller circle handle - blue like the inner radius ring
    const handle = new PIXI.Graphics();
    handle.circle(0, 0, handleSize);
    handle.fill({ color: 0x00ff00, alpha: 0.8 });
    container.addChild(handle);

    // Store reference to audio source data
    (container as any).audioSourceId = audioSource.id;
    (container as any).isInnerRadiusHandle = true;

    // Add interaction handlers for inner radius dragging
    container.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      
      const globalPos = e.global;
      innerRadiusDraggingRef.current = {
        audioSourceId: audioSource.id,
        originalInnerRadius: audioSource.innerRadius || 0,
        startPos: { x: globalPos.x, y: globalPos.y },
      };
      container.cursor = 'grabbing';
    });

    container.on('pointerup', (e: PIXI.FederatedPointerEvent) => {
      if (innerRadiusDraggingRef.current) {
        // Calculate final inner radius and send to server
        const audioSource = audioSources.find(a => a.id === innerRadiusDraggingRef.current?.audioSourceId);
        if (audioSource) {
          const globalPos = e.global;
          const stagePos = {
            x: audioSource.x * stageScale + stagePosition.x,
            y: audioSource.y * stageScale + stagePosition.y
          };
          const dx = globalPos.x - stagePos.x;
          const dy = globalPos.y - stagePos.y;
          const newInnerRadius = Math.sqrt(dx * dx + dy * dy);
          // Ensure inner radius doesn't exceed outer radius
          const clampedInnerRadius = Math.min(newInnerRadius, (audioSource.radius || 200) - 10);
          onAudioSourceInnerRadiusDragEnd?.(audioSource, clampedInnerRadius);
        }
      }
      container.cursor = 'ew-resize';
      innerRadiusDraggingRef.current = null;
    });

    container.on('pointerupoutside', (e: PIXI.FederatedPointerEvent) => {
      if (innerRadiusDraggingRef.current) {
        // Calculate final inner radius and send to server
        const audioSource = audioSources.find(a => a.id === innerRadiusDraggingRef.current?.audioSourceId);
        if (audioSource) {
          const globalPos = e.global;
          const stagePos = {
            x: audioSource.x * stageScale + stagePosition.x,
            y: audioSource.y * stageScale + stagePosition.y
          };
          const dx = globalPos.x - stagePos.x;
          const dy = globalPos.y - stagePos.y;
          const newInnerRadius = Math.sqrt(dx * dx + dy * dy);
          // Ensure inner radius doesn't exceed outer radius
          const clampedInnerRadius = Math.min(newInnerRadius, (audioSource.radius || 200) - 10);
          onAudioSourceInnerRadiusDragEnd?.(audioSource, clampedInnerRadius);
        }
      }
      container.cursor = 'ew-resize';
      innerRadiusDraggingRef.current = null;
    });

    return container;
  }, [gridCellPx, stageScale, onAudioSourceInnerRadiusDragEnd, audioSources, stagePosition, stageScale]);

  // Update inner radius ring for selected audio sources (dashed circle)
  const updateInnerRadiusRing = useCallback((icon: PIXI.Container, audioSource: AudioSource, isSelected: boolean) => {
    // Find existing inner radius ring
    const existingRing = icon.children.find(child => 
      (child as any).isInnerRadiusRing === true
    ) as PIXI.Graphics | undefined;
    
    const innerRadius = audioSource.innerRadius || 0;
    
    // Only show inner radius ring if innerRadius > 0 and audio source is selected
    if (!isSelected || innerRadius <= 0) {
      // If not selected or no innerRadius, remove the inner radius ring if it exists
      if (existingRing) {
        icon.removeChild(existingRing);
        existingRing.destroy();
      }
      return;
    }
    
    if (existingRing) {
      // Update existing ring
      existingRing.clear();
      existingRing.circle(0, 0, innerRadius);
      existingRing.stroke({ 
        width: 3, 
        color: 0x00ff00, 
        alpha: 0.5 
      });
      // Enable pointer events on ring for hover detection (but stop propagation to prevent source dragging)
      existingRing.eventMode = 'static';
    } else if (selectedAudioSourceIds.includes(audioSource.id)) {
      // Create new inner radius ring for selected audio source
      const innerRadiusRing = new PIXI.Graphics();
      innerRadiusRing.circle(0, 0, innerRadius);
      innerRadiusRing.stroke({ 
        width: 3, 
        color: 0x00ff00, 
        alpha: 0.2 
      });
      (innerRadiusRing as any).isInnerRadiusRing = true;
      // Enable pointer events on ring for hover detection (but stop propagation to prevent source dragging)
      innerRadiusRing.eventMode = 'static';
      
      // Stop propagation on ring pointer events to prevent source dragging
      innerRadiusRing.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
        e.stopPropagation();
      });
      innerRadiusRing.on('pointerup', (e: PIXI.FederatedPointerEvent) => {
        e.stopPropagation();
        // Handle drag release when mouse is released on the ring
        if (innerRadiusDraggingRef.current && innerRadiusDraggingRef.current.audioSourceId === audioSource.id) {
          const globalPos = e.global;
          const stagePos = {
            x: audioSource.x * stageScale + stagePosition.x,
            y: audioSource.y * stageScale + stagePosition.y
          };
          const dx = globalPos.x - stagePos.x;
          const dy = globalPos.y - stagePos.y;
          let newInnerRadius = Math.sqrt(dx * dx + dy * dy);
          // Ensure inner radius doesn't exceed outer radius
          newInnerRadius = Math.min(newInnerRadius, (audioSource.radius || 200) - 10);
          onAudioSourceInnerRadiusDragEnd?.(audioSource, newInnerRadius);
          innerRadiusDraggingRef.current = null;
          
          // Reset cursor
          const innerHandle = innerRadiusHandlesRef.current.get(audioSource.id);
          if (innerHandle) {
            innerHandle.cursor = 'ew-resize';
          }
        }
      });
      
      // Show inner handle on ring hover and track mouse position to update handle position
      innerRadiusRing.on('pointerover', (e: PIXI.FederatedPointerEvent) => {
        const innerHandle = innerRadiusHandlesRef.current.get(audioSource.id);
        if (innerHandle) {
          innerHandle.visible = true;
          // Position handle at mouse intersection point on the ring
          const localPos = innerRadiusRing.toLocal(e.global);
          const angle = Math.atan2(localPos.y, localPos.x);
          const innerRadius = audioSource.innerRadius || 0;
          innerHandle.x = audioSource.x + innerRadius * Math.cos(angle);
          innerHandle.y = audioSource.y + innerRadius * Math.sin(angle);
        }
      });
      innerRadiusRing.on('pointermove', (e: PIXI.FederatedPointerEvent) => {
        const innerHandle = innerRadiusHandlesRef.current.get(audioSource.id);
        if (innerHandle) {
          // Position handle at mouse intersection point on the ring
          const localPos = innerRadiusRing.toLocal(e.global);
          const angle = Math.atan2(localPos.y, localPos.x);
          const innerRadius = audioSource.innerRadius || 0;
          innerHandle.x = audioSource.x + innerRadius * Math.cos(angle);
          innerHandle.y = audioSource.y + innerRadius * Math.sin(angle);
        }
      });
      innerRadiusRing.on('pointerout', () => {
        if (!innerRadiusDraggingRef.current) {
          const innerHandle = innerRadiusHandlesRef.current.get(audioSource.id);
          if (innerHandle) {
            innerHandle.visible = false;
          }
        }
      });
      
      icon.addChildAt(innerRadiusRing, 0);
    }
  }, [selectedAudioSourceIds]);

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
      // Also clear all radius handles when fontLoaded triggers
      radiusHandlesRef.current.forEach((handle) => {
        layer.removeChild(handle);
        handle.destroy({ children: true });
      });
      radiusHandlesRef.current.clear();
      
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
    
    // Additional cleanup: remove any handles for audio sources that no longer exist
    // This catches orphaned handles that might not have corresponding icons
    for (const [handleId, handle] of radiusHandlesRef.current.entries()) {
      if (!currentIds.has(handleId)) {
        layer.removeChild(handle);
        radiusHandlesRef.current.delete(handleId);
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

      // Update inner radius ring for selected audio sources
      updateInnerRadiusRing(icon, audioSource, isSelected);

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
        // Keep handle hidden until hover
        handle.visible = false;

        // Add hover listener to show handle on ring hover
        handle.removeAllListeners('pointerover');
        handle.removeAllListeners('pointerout');
        handle.on('pointerover', () => {
          handle.visible = true;
        });
        handle.on('pointerout', () => {
          if (!radiusDraggingRef.current) {
            handle.visible = false;
          }
        });

        // Update or create inner radius handle for selected sources
        if (isSelected && audioSource.innerRadius && audioSource.innerRadius > 0) {
          let innerHandle = innerRadiusHandlesRef.current.get(audioSource.id);
          if (!innerHandle) {
            innerHandle = createInnerRadiusHandle(audioSource);
            innerRadiusHandlesRef.current.set(audioSource.id, innerHandle);
            layer.addChild(innerHandle);
          }
          // Position handle at edge of inner radius
          innerHandle.x = audioSource.x + audioSource.innerRadius;
          innerHandle.y = audioSource.y;
          // Keep handle hidden until hover
          innerHandle.visible = false;

          // Add hover listener to show handle on ring hover
          innerHandle.removeAllListeners('pointerover');
          innerHandle.removeAllListeners('pointerout');
          innerHandle.on('pointerover', () => {
            innerHandle.visible = true;
          });
          innerHandle.on('pointerout', () => {
            if (!innerRadiusDraggingRef.current) {
              innerHandle.visible = false;
            }
          });
        } else {
          const innerHandle = innerRadiusHandlesRef.current.get(audioSource.id);
          if (innerHandle) {
            layer.removeChild(innerHandle);
            innerRadiusHandlesRef.current.delete(audioSource.id);
          }
        }
      } else {
        const handle = radiusHandlesRef.current.get(audioSource.id);
        if (handle) {
          layer.removeChild(handle);
          radiusHandlesRef.current.delete(audioSource.id);
        }
        // Also remove inner radius handle
        const innerHandle = innerRadiusHandlesRef.current.get(audioSource.id);
        if (innerHandle) {
          layer.removeChild(innerHandle);
          innerRadiusHandlesRef.current.delete(audioSource.id);
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
    createInnerRadiusHandle,
    updateInnerRadiusRing,
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
          
          // Also update handle position to follow mouse during drag
          const handle = radiusHandlesRef.current.get(audioSource.id);
          if (handle) {
            handle.x = audioSource.x + newRadius;
            handle.y = audioSource.y;
            handle.visible = true;
          }
        }
      }

      // Handle inner radius dragging
      if (innerRadiusDraggingRef.current) {
        const audioSource = audioSources.find(a => a.id === innerRadiusDraggingRef.current?.audioSourceId);
        if (audioSource) {
          // Calculate new inner radius based on drag distance
          const worldX = (globalPos.x - stagePosition.x) / stageScale;
          const worldY = (globalPos.y - stagePosition.y) / stageScale;
          const dx = worldX - audioSource.x;
          const dy = worldY - audioSource.y;
          let newInnerRadius = Math.sqrt(dx * dx + dy * dy);
          // Ensure inner radius doesn't exceed outer radius
          newInnerRadius = Math.min(newInnerRadius, (audioSource.radius || 200) - 10);
          onAudioSourceInnerRadiusDrag?.(audioSource, newInnerRadius);
          
          // Also update inner handle position to follow mouse during drag
          const innerHandle = innerRadiusHandlesRef.current.get(audioSource.id);
          if (innerHandle) {
            innerHandle.x = audioSource.x + newInnerRadius;
            innerHandle.y = audioSource.y;
            innerHandle.visible = true;
          }
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
      }
      draggingRef.current = null;

      // Handle radius drag end
      if (radiusDraggingRef.current) {
        const audioSource = audioSources.find(a => a.id === radiusDraggingRef.current?.audioSourceId);
        if (audioSource) {
          // Get current radius from the source
          const currentRadius = audioSource.radius || 200;
          onAudioSourceRadiusDragEnd?.(audioSource, currentRadius);
        }
      }
      radiusDraggingRef.current = null;

      // Handle inner radius drag end
      if (innerRadiusDraggingRef.current) {
        const audioSource = audioSources.find(a => a.id === innerRadiusDraggingRef.current?.audioSourceId);
        if (audioSource) {
          // Get current inner radius from the source
          const currentInnerRadius = audioSource.innerRadius || 0;
          onAudioSourceInnerRadiusDragEnd?.(audioSource, currentInnerRadius);
        }
      }
      innerRadiusDraggingRef.current = null;
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
  }, [pixiApp, audioSources, worldToStage, onAudioSourceDrag, onAudioSourceDragEnd, onAudioSourceRadiusDrag, onAudioSourceRadiusDragEnd, onAudioSourceInnerRadiusDrag, onAudioSourceInnerRadiusDragEnd]);

  return null;
}

export default AudioSourceIconsOverlay;
