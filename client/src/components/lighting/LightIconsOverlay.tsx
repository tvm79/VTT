import React, { useEffect, useRef, useCallback, useState } from 'react';
import * as PIXI from 'pixi.js';
import type { Light } from '../../../../shared/src';
import { Text } from 'pixi.js';

export interface LightIconsOverlayProps {
  lights: Light[];
  selectedLightIds: string[];
  isGM: boolean;
  tool: string;
  isVisible?: boolean;
  gridCellPx: number;
  stagePosition?: { x: number; y: number };
  stageScale?: number;
  pixiApp?: PIXI.Application;
  onLightClick?: (light: Light, screenPos: { x: number; y: number }) => void;
  onLightDoubleClick?: (light: Light, screenPos: { x: number; y: number }) => void;
  onLightDrag?: (light: Light, screenPos: { x: number; y: number }) => void;
  onLightDragEnd?: (light: Light) => void;
  onLightRadiusDrag?: (light: Light, newRadius: number) => void;
  onLightRadiusDragEnd?: (light: Light, newRadius: number) => void;
  onLightInnerRadiusDrag?: (light: Light, newDimRadius: number) => void;
  onLightInnerRadiusDragEnd?: (light: Light, newDimRadius: number) => void;
}

// Light bulb icon - using Font Awesome (filled version)
const LIGHT_ICON_CHAR = '\uf0eb';

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
 * Renders light icons using PIXI on the lightIconsLayer.
 * This ensures light icons are rendered on the canvas for better performance
 * and proper synchronization with pan/zoom transformations.
 */
export function LightIconsOverlay({
  lights,
  selectedLightIds,
  isGM,
  tool,
  isVisible = true,
  gridCellPx,
  stagePosition = { x: 0, y: 0 },
  stageScale = 1,
  pixiApp,
  onLightClick,
  onLightDoubleClick,
  onLightDrag,
  onLightDragEnd,
  onLightRadiusDrag,
  onLightRadiusDragEnd,
  onLightInnerRadiusDrag,
  onLightInnerRadiusDragEnd,
}: LightIconsOverlayProps) {
  const iconsRef = useRef<Map<string, PIXI.Container>>(new Map());
  const radiusHandlesRef = useRef<Map<string, PIXI.Container>>(new Map());
  const innerRadiusHandlesRef = useRef<Map<string, PIXI.Container>>(new Map());
  const draggingRef = useRef<{ lightId: string; startX: number; startY: number } | null>(null);
  const radiusDraggingRef = useRef<{ lightId: string; originalRadius: number; startPos: { x: number; y: number } } | null>(null);
  const innerRadiusDraggingRef = useRef<{ lightId: string; originalDimRadius: number; startPos: { x: number; y: number } } | null>(null);
  const lastClickTimeRef = useRef<{ lightId: string; time: number } | null>(null);
  const layerInitializedRef = useRef(false);
  const [fontLoaded, setFontLoaded] = useState(false);

  // Force refresh icons multiple times to ensure font is loaded and PIXI has rendered
  useEffect(() => {
    console.log('[LightIconsOverlay] Init effect running');
    
    // First refresh after 500ms
    const timer1 = setTimeout(() => {
      //console.log('[LightIconsOverlay] First refresh trigger (500ms)');
      setFontLoaded(true);
    }, 500);
    
    // Second refresh after 2 seconds
    const timer2 = setTimeout(() => {
      //console.log('[LightIconsOverlay] Second refresh trigger (2s)');
      setFontLoaded(prev => prev); // Trigger re-render
    }, 2000);
    
    // Final fallback after 5 seconds
    const timer3 = setTimeout(() => {
      //console.log('[LightIconsOverlay] Final fallback trigger (5s)');
      setFontLoaded(prev => prev); // Trigger re-render
    }, 5000);
    
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, []);

  // Get or create the lightIconsLayer
  const getLightIconsLayer = useCallback(() => {
    if (!pixiApp) return null;
    
    // If layer doesn't exist yet, create it as fallback
    let lightIconsLayer = (pixiApp as any).lightIconsLayer as PIXI.Container | undefined;
    if (!lightIconsLayer) {
      console.log('[LightIconsOverlay] lightIconsLayer not found, creating fallback layer');
      lightIconsLayer = new PIXI.Container();
      lightIconsLayer.zIndex = 1000;
      lightIconsLayer.sortableChildren = true;
      // Add to stage root (not a specific layer that might not exist yet)
      if (pixiApp.stage) {
        pixiApp.stage.addChild(lightIconsLayer);
      }
      (pixiApp as any).lightIconsLayer = lightIconsLayer;
    }
    return lightIconsLayer;
  }, [pixiApp]);

  // Create a PIXI icon for a light
  const createLightIcon = useCallback((light: Light, isSelected: boolean): PIXI.Container => {
    const container = new PIXI.Container();
    container.eventMode = 'static';
    container.cursor = 'grab';
    container.sortableChildren = true;

    const iconSize = Math.max(24, (gridCellPx * 0.8) / stageScale);
    const fontSize = Math.max(18, iconSize * 0.75);

    // Create text with lightbulb icon (Font Awesome)
    const text = new PIXI.Text({
      text: LIGHT_ICON_CHAR,
      style: {
        fontFamily: '"Font Awesome 6 Free", "Font Awesome 5 Free", Arial, sans-serif',
        fontSize: fontSize,
        fontWeight: '900' as const,
        fill: isSelected ? 0xffff00 : 0xffd700,
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

    // Selection ring removed - inner ring no longer displayed
    // Keep radius indicator ring for selected lights
    if (isSelected) {
      const radius = light.radius || 200;
      const radiusRing = new PIXI.Graphics();
      radiusRing.circle(0, 0, radius);
      radiusRing.stroke({ 
        width: 2, 
        color: 0xffff00, 
        alpha: 0.4 
      });
      // Enable pointer events on ring for hover detection (but stop propagation to prevent light dragging)
      radiusRing.eventMode = 'static';
      radiusRing.zIndex = -1; // Put behind the icon
      (radiusRing as any).isRadiusRing = true;
      (radiusRing as any).lightId = light.id;
      
      // Stop propagation on ring pointer events to prevent light dragging
      radiusRing.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
        e.stopPropagation();
      });
      radiusRing.on('pointerup', (e: PIXI.FederatedPointerEvent) => {
        e.stopPropagation();
        // Handle drag release when mouse is released on the ring
        if (radiusDraggingRef.current && radiusDraggingRef.current.lightId === light.id) {
          const globalPos = e.global;
          // Use stage position and scale calculations instead of pixiApp.stage.toLocal()
          // to avoid pixiApp being possibly undefined
          const stagePos = {
            x: light.x * stageScale + stagePosition.x,
            y: light.y * stageScale + stagePosition.y
          };
          const dx = globalPos.x - stagePos.x;
          const dy = globalPos.y - stagePos.y;
          const newRadius = Math.max(10, Math.sqrt(dx * dx + dy * dy));
          onLightRadiusDragEnd?.(light, newRadius);
          radiusDraggingRef.current = null;
          
          // Reset cursor
          const handle = radiusHandlesRef.current.get(light.id);
          if (handle) {
            handle.cursor = 'ew-resize';
          }
        }
      });
      
      // Show handle on ring hover
      radiusRing.on('pointerover', () => {
        const handle = radiusHandlesRef.current.get(light.id);
        if (handle) {
          handle.visible = true;
        }
      });
      radiusRing.on('pointerout', () => {
        if (!radiusDraggingRef.current) {
          const handle = radiusHandlesRef.current.get(light.id);
          if (handle) {
            handle.visible = false;
          }
        }
      });
      
      container.addChildAt(radiusRing, 0);
    }

    // Store reference to light data
    (container as any).lightId = light.id;

    // Add interaction handlers
    container.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      e.stopPropagation();
      const globalPos = e.global;
      draggingRef.current = {
        lightId: light.id,
        startX: globalPos.x,
        startY: globalPos.y,
      };
      container.cursor = 'grabbing';
      
      // Track click time for double-click detection
      const now = Date.now();
      if (lastClickTimeRef.current?.lightId === light.id && 
          now - lastClickTimeRef.current.time < 300) {
        // Double click detected
        onLightDoubleClick?.(light, { x: globalPos.x, y: globalPos.y });
        lastClickTimeRef.current = null;
      } else {
        lastClickTimeRef.current = { lightId: light.id, time: now };
        onLightClick?.(light, { x: globalPos.x, y: globalPos.y });
      }
    });

    container.on('pointerup', (e: PIXI.FederatedPointerEvent) => {
      container.cursor = 'grab';
      draggingRef.current = null;
    });

    container.on('pointerupoutside', () => {
      container.cursor = 'grab';
      draggingRef.current = null;
    });

    return container;
  }, [gridCellPx, stageScale, onLightClick, onLightDoubleClick]);

  // Create a radius handle for a light (shown on the edge when selected)
  const createRadiusHandle = useCallback((light: Light): PIXI.Container => {
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
    handle.fill({ color: 0xffff00, alpha: 0.9 });
    container.addChild(handle);

    // Store reference to light data
    (container as any).lightId = light.id;
    (container as any).isRadiusHandle = true;

    // Create a bound handler for pointer up
    const handlePointerUp = (e: PIXI.FederatedPointerEvent) => {
      e?.stopPropagation();
      container.cursor = 'ew-resize';
      radiusDraggingRef.current = null;
    };

    // Add interaction handlers for radius dragging
    container.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      
      const globalPos = e.global;
      radiusDraggingRef.current = {
        lightId: light.id,
        originalRadius: light.radius || 200,
        startPos: { x: globalPos.x, y: globalPos.y },
      };
      container.cursor = 'grabbing';
    });

    container.on('pointerup', handlePointerUp);

    container.on('pointerupoutside', (e: PIXI.FederatedPointerEvent) => {
      e.stopPropagation();
      container.cursor = 'ew-resize';
      radiusDraggingRef.current = null;
    });

    return container;
  }, [gridCellPx, stageScale, fontLoaded]);

  // Create an inner radius handle for a light (shown on the inner edge when selected)
  const createInnerRadiusHandle = useCallback((light: Light): PIXI.Container => {
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
    handle.fill({ color: 0xFFFFFF, alpha: 0.9 });
    container.addChild(handle);

    // Store reference to light data
    (container as any).lightId = light.id;
    (container as any).isInnerRadiusHandle = true;

    // Add interaction handlers for inner radius dragging
    container.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      
      const globalPos = e.global;
      innerRadiusDraggingRef.current = {
        lightId: light.id,
        originalDimRadius: light.dimRadius || 0,
        startPos: { x: globalPos.x, y: globalPos.y },
      };
      container.cursor = 'grabbing';
    });

    container.on('pointerup', (e: PIXI.FederatedPointerEvent) => {
      e?.stopPropagation();
      container.cursor = 'ew-resize';
      innerRadiusDraggingRef.current = null;
    });

    container.on('pointerupoutside', (e: PIXI.FederatedPointerEvent) => {
      e.stopPropagation();
      container.cursor = 'ew-resize';
      innerRadiusDraggingRef.current = null;
    });

    return container;
  }, [gridCellPx, stageScale, fontLoaded]);

  // Update radius handle position based on light position and radius
  const updateRadiusHandlePosition = useCallback((handle: PIXI.Container, light: Light) => {
    const radius = light.radius || 200;
    // Position the handle at the right edge of the light (at 0 degrees)
    handle.x = light.x + radius;
    handle.y = light.y;
  }, []);

  // Update inner radius handle position based on light position and dimRadius
  const updateInnerRadiusHandlePosition = useCallback((handle: PIXI.Container, light: Light) => {
    const dimRadius = light.dimRadius || 0;
    // Only show if dimRadius > 0
    if (dimRadius > 0) {
      handle.x = light.x + dimRadius;
      handle.y = light.y;
    }
  }, []);

  // Update icon position based on light position
  const updateIconPosition = useCallback((icon: PIXI.Container, light: Light) => {
    // Position in world coordinates - PIXI handles the transformation
    icon.x = light.x;
    icon.y = light.y;
  }, []);

  // Update icon selection state
  const updateIconSelection = useCallback((icon: PIXI.Container, isSelected: boolean) => {
    // Remove existing selection ring if any (but keep radius ring which has isRadiusRing property)
    const existingRing = icon.children.find(child => 
      child instanceof PIXI.Graphics && child.width > 0 && !(child as any).isRadiusRing
    );
    if (existingRing) {
      icon.removeChild(existingRing);
    }
    // Selection ring is no longer created - inner ring removed
  }, [gridCellPx, stageScale]);

  // Update radius ring for selected lights
  const updateRadiusRing = useCallback((icon: PIXI.Container, light: Light, isSelected: boolean) => {
    // Find existing radius ring
    const existingRing = icon.children.find(child => 
      (child as any).isRadiusRing === true
    ) as PIXI.Graphics | undefined;
    
    const radius = light.radius || 200;
    
    if (!isSelected) {
      // If not selected, remove the radius ring if it exists
      if (existingRing) {
        icon.removeChild(existingRing);
        existingRing.destroy();
      }
      return;
    }
    
    if (existingRing) {
      // Update existing ring
      existingRing.clear();
      existingRing.circle(0, 0, radius);
      existingRing.stroke({ 
        width: 4, 
        color: 0xffff00, 
        alpha: 0.2 
      });
      // Enable pointer events on ring for hover detection (but stop propagation to prevent light dragging)
      existingRing.eventMode = 'static';
    } else if (selectedLightIds.includes(light.id)) {
      // Create new radius ring for selected light
      const radiusRing = new PIXI.Graphics();
      radiusRing.circle(0, 0, radius);
      radiusRing.stroke({ 
        width: 2, 
        color: 0xffff00, 
        alpha: 0.4 
      });
      (radiusRing as any).isRadiusRing = true;
      // Enable pointer events on ring for hover detection (but stop propagation to prevent light dragging)
      radiusRing.eventMode = 'static';
      
      // Stop propagation on ring pointer events to prevent light dragging
      radiusRing.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
        e.stopPropagation();
      });
      radiusRing.on('pointerup', (e: PIXI.FederatedPointerEvent) => {
        e.stopPropagation();
        // Handle drag release when mouse is released on the ring
        if (radiusDraggingRef.current && radiusDraggingRef.current.lightId === light.id) {
          const globalPos = e.global;
          // Use stage position and scale calculations instead of pixiApp.stage.toLocal()
          // to avoid pixiApp being possibly undefined
          const stagePos = {
            x: light.x * stageScale + stagePosition.x,
            y: light.y * stageScale + stagePosition.y
          };
          const dx = globalPos.x - stagePos.x;
          const dy = globalPos.y - stagePos.y;
          const newRadius = Math.max(10, Math.sqrt(dx * dx + dy * dy));
          onLightRadiusDragEnd?.(light, newRadius);
          radiusDraggingRef.current = null;
          
          // Reset cursor
          const handle = radiusHandlesRef.current.get(light.id);
          if (handle) {
            handle.cursor = 'ew-resize';
          }
        }
      });
      
      // Show handle on ring hover and track mouse position to update handle position
      radiusRing.on('pointerover', (e: PIXI.FederatedPointerEvent) => {
        const handle = radiusHandlesRef.current.get(light.id);
        if (handle) {
          handle.visible = true;
          // Position handle at mouse intersection point on the ring
          const localPos = radiusRing.toLocal(e.global);
          const angle = Math.atan2(localPos.y, localPos.x);
          const radius = light.radius || 200;
          handle.x = light.x + radius * Math.cos(angle);
          handle.y = light.y + radius * Math.sin(angle);
        }
      });
      radiusRing.on('pointermove', (e: PIXI.FederatedPointerEvent) => {
        const handle = radiusHandlesRef.current.get(light.id);
        if (handle) {
          // Position handle at mouse intersection point on the ring
          const localPos = radiusRing.toLocal(e.global);
          const angle = Math.atan2(localPos.y, localPos.x);
          const radius = light.radius || 200;
          handle.x = light.x + radius * Math.cos(angle);
          handle.y = light.y + radius * Math.sin(angle);
        }
      });
      radiusRing.on('pointerout', () => {
        if (!radiusDraggingRef.current) {
          const handle = radiusHandlesRef.current.get(light.id);
          if (handle) {
            handle.visible = false;
          }
        }
      });
      
      icon.addChildAt(radiusRing, 0);
    }
  }, [selectedLightIds]);

  // Update inner radius ring for selected lights (dashed circle)
  const updateInnerRadiusRing = useCallback((icon: PIXI.Container, light: Light, isSelected: boolean) => {
    // Find existing inner radius ring
    const existingRing = icon.children.find(child => 
      (child as any).isInnerRadiusRing === true
    ) as PIXI.Graphics | undefined;
    
    const dimRadius = light.dimRadius || 0;
    
    // Only show inner radius ring if dimRadius > 0 and light is selected
    if (!isSelected || dimRadius <= 0) {
      // If not selected or no dimRadius, remove the inner radius ring if it exists
      if (existingRing) {
        icon.removeChild(existingRing);
        existingRing.destroy();
      }
      return;
    }
    
    if (existingRing) {
      // Update existing ring
      existingRing.clear();
      existingRing.circle(0, 0, dimRadius);
      existingRing.stroke({ 
        width: 3, 
        color: 0xFFFFFF, 
        alpha: 0.8
      });
      // Enable pointer events on ring for hover detection (but stop propagation to prevent light dragging)
      existingRing.eventMode = 'static';
    } else if (selectedLightIds.includes(light.id)) {
      // Create new inner radius ring for selected light
      const innerRadiusRing = new PIXI.Graphics();
      innerRadiusRing.circle(0, 0, dimRadius);
      innerRadiusRing.stroke({ 
        width: 3, 
        color: 0xFFFFFF, 
        alpha: 0.8 
      });
      (innerRadiusRing as any).isInnerRadiusRing = true;
      // Enable pointer events on ring for hover detection (but stop propagation to prevent light dragging)
      innerRadiusRing.eventMode = 'static';
      
      // Stop propagation on ring pointer events to prevent light dragging
      innerRadiusRing.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
        e.stopPropagation();
      });
      innerRadiusRing.on('pointerup', (e: PIXI.FederatedPointerEvent) => {
        e.stopPropagation();
        // Handle drag release when mouse is released on the ring
        if (innerRadiusDraggingRef.current && innerRadiusDraggingRef.current.lightId === light.id) {
          const globalPos = e.global;
          // Use stage position and scale calculations instead of pixiApp.stage.toLocal()
          // to avoid pixiApp being possibly undefined
          const stagePos = {
            x: light.x * stageScale + stagePosition.x,
            y: light.y * stageScale + stagePosition.y
          };
          const dx = globalPos.x - stagePos.x;
          const dy = globalPos.y - stagePos.y;
          let newDimRadius = Math.sqrt(dx * dx + dy * dy);
          // Ensure inner radius doesn't exceed outer radius
          newDimRadius = Math.min(newDimRadius, (light.radius || 200) - 10);
          onLightInnerRadiusDragEnd?.(light, newDimRadius);
          innerRadiusDraggingRef.current = null;
          
          // Reset cursor
          const innerHandle = innerRadiusHandlesRef.current.get(light.id);
          if (innerHandle) {
            innerHandle.cursor = 'ew-resize';
          }
        }
      });
      
      // Show inner handle on ring hover and track mouse position to update handle position
      innerRadiusRing.on('pointerover', (e: PIXI.FederatedPointerEvent) => {
        const innerHandle = innerRadiusHandlesRef.current.get(light.id);
        if (innerHandle) {
          innerHandle.visible = true;
          // Position handle at mouse intersection point on the ring
          const localPos = innerRadiusRing.toLocal(e.global);
          const angle = Math.atan2(localPos.y, localPos.x);
          const dimRadius = light.dimRadius || 0;
          innerHandle.x = light.x + dimRadius * Math.cos(angle);
          innerHandle.y = light.y + dimRadius * Math.sin(angle);
        }
      });
      innerRadiusRing.on('pointermove', (e: PIXI.FederatedPointerEvent) => {
        const innerHandle = innerRadiusHandlesRef.current.get(light.id);
        if (innerHandle) {
          // Position handle at mouse intersection point on the ring
          const localPos = innerRadiusRing.toLocal(e.global);
          const angle = Math.atan2(localPos.y, localPos.x);
          const dimRadius = light.dimRadius || 0;
          innerHandle.x = light.x + dimRadius * Math.cos(angle);
          innerHandle.y = light.y + dimRadius * Math.sin(angle);
        }
      });
      innerRadiusRing.on('pointerout', () => {
        if (!innerRadiusDraggingRef.current) {
          const innerHandle = innerRadiusHandlesRef.current.get(light.id);
          if (innerHandle) {
            innerHandle.visible = false;
          }
        }
      });
      
      icon.addChildAt(innerRadiusRing, 0);
    }
  }, [selectedLightIds]);

  // Sync lights with PIXI layer
  useEffect(() => {
    // Get the layer
    const layer = getLightIconsLayer();
    
    // Show icons when in light tool mode OR when isVisible is true (for select mode with filter enabled)
    const shouldShow = isGM && (tool === 'light' || isVisible) && pixiApp;
    if (!shouldShow) {
      // Clear all icons if not in light tool mode or not visible
      if (layer) {
        iconsRef.current.forEach((icon) => {
          layer.removeChild(icon);
          icon.destroy();
        });
        iconsRef.current.clear();
      }
      // Also clear radius handles
      radiusHandlesRef.current.forEach((handle) => {
        layer?.removeChild(handle);
        handle.destroy();
      });
      radiusHandlesRef.current.clear();
      // Also clear inner radius handles
      innerRadiusHandlesRef.current.forEach((handle) => {
        layer?.removeChild(handle);
        handle.destroy();
      });
      innerRadiusHandlesRef.current.clear();
      return;
    }

    if (!layer) {
      console.warn('[LightIconsOverlay] lightIconsLayer not found');
      return;
    }

    // Recreate icons when fontLoaded changes - runs AFTER visibility check
    if (fontLoaded) {
      //console.log('[LightIconsOverlay] Recreating all icons due to fontLoaded');
      iconsRef.current.forEach((icon) => {
        layer.removeChild(icon);
        icon.destroy();
      });
      iconsRef.current.clear();
    }

    // Create a Set of current light IDs for comparison
    const currentLightIds = new Set(lights.map(l => l.id));

    // Remove icons for lights that no longer exist
    iconsRef.current.forEach((icon, lightId) => {
      if (!currentLightIds.has(lightId)) {
        layer.removeChild(icon);
        icon.destroy();
        iconsRef.current.delete(lightId);
      }
    });

    // Remove radius handles for lights that no longer exist or are not selected
    radiusHandlesRef.current.forEach((handle, lightId) => {
      if (!currentLightIds.has(lightId) || !selectedLightIds.includes(lightId)) {
        layer.removeChild(handle);
        handle.destroy();
        radiusHandlesRef.current.delete(lightId);
      }
    });

    // Remove inner radius handles for lights that no longer exist or are not selected
    innerRadiusHandlesRef.current.forEach((handle, lightId) => {
      if (!currentLightIds.has(lightId) || !selectedLightIds.includes(lightId)) {
        layer.removeChild(handle);
        handle.destroy();
        innerRadiusHandlesRef.current.delete(lightId);
      }
    });

    // Update or create icons for each light
    // Always recreate icons when fontLoaded changes to fix placeholder issue
    const shouldRecreateIcons = fontLoaded;
    if (shouldRecreateIcons) {
      //console.log('[LightIconsOverlay] Recreating all icons due to fontLoaded');
      // Clear all existing icons and recreate them
      iconsRef.current.forEach((icon) => {
        layer.removeChild(icon);
        icon.destroy();
      });
      iconsRef.current.clear();
    }
    
    lights.forEach(light => {
      const isSelected = selectedLightIds.includes(light.id);
      let icon = iconsRef.current.get(light.id);

      if (!icon) {
        // Create new icon
        icon = createLightIcon(light, isSelected);
        iconsRef.current.set(light.id, icon);
        layer.addChild(icon);
      }

      // Update position
      updateIconPosition(icon, light);

      // Update selection state
      updateIconSelection(icon, isSelected);

      // Update radius ring for selected lights
      updateRadiusRing(icon, light, isSelected);

      // Update inner radius ring for selected lights
      updateInnerRadiusRing(icon, light, isSelected);

      // Create or update radius handle for selected lights
      if (isSelected) {
        let radiusHandle = radiusHandlesRef.current.get(light.id);

        if (!radiusHandle) {
          radiusHandle = createRadiusHandle(light);
          radiusHandlesRef.current.set(light.id, radiusHandle);
          layer.addChild(radiusHandle);
        }

        // Update radius handle position
        updateRadiusHandlePosition(radiusHandle, light);
        // Keep handle hidden until hover
        radiusHandle.visible = false;

        // Add hover listener to show handle on ring hover
        radiusHandle.removeAllListeners('pointerover');
        radiusHandle.removeAllListeners('pointerout');
        radiusHandle.on('pointerover', () => {
          radiusHandle.visible = true;
        });
        radiusHandle.on('pointerout', () => {
          if (!radiusDraggingRef.current) {
            radiusHandle.visible = false;
          }
        });

        // Create or update inner radius handle for selected lights (if dimRadius > 0)
        if (light.dimRadius && light.dimRadius > 0) {
          let innerRadiusHandle = innerRadiusHandlesRef.current.get(light.id);

          if (!innerRadiusHandle) {
            innerRadiusHandle = createInnerRadiusHandle(light);
            innerRadiusHandlesRef.current.set(light.id, innerRadiusHandle);
            layer.addChild(innerRadiusHandle);
          }

          // Update inner radius handle position
          updateInnerRadiusHandlePosition(innerRadiusHandle, light);
          // Keep handle hidden until hover
          innerRadiusHandle.visible = false;

          // Add hover listener to show handle on ring hover
          innerRadiusHandle.removeAllListeners('pointerover');
          innerRadiusHandle.removeAllListeners('pointerout');
          innerRadiusHandle.on('pointerover', () => {
            innerRadiusHandle.visible = true;
          });
          innerRadiusHandle.on('pointerout', () => {
            if (!innerRadiusDraggingRef.current) {
              innerRadiusHandle.visible = false;
            }
          });
        } else {
          // Hide inner radius handle if no dimRadius
          const innerRadiusHandle = innerRadiusHandlesRef.current.get(light.id);
          if (innerRadiusHandle) {
            innerRadiusHandle.visible = false;
          }
        }
      } else {
        // Hide radius handle if not selected
        const radiusHandle = radiusHandlesRef.current.get(light.id);
        if (radiusHandle) {
          radiusHandle.visible = false;
        }
        // Hide inner radius handle if not selected
        const innerRadiusHandle = innerRadiusHandlesRef.current.get(light.id);
        if (innerRadiusHandle) {
          innerRadiusHandle.visible = false;
        }
      }
    });

    layerInitializedRef.current = true;
  }, [
    lights, 
    selectedLightIds, 
    isGM, 
    tool, 
    pixiApp, 
    getLightIconsLayer, 
    createLightIcon, 
    updateIconPosition, 
    updateIconSelection,
    createRadiusHandle,
    createInnerRadiusHandle,
    updateRadiusHandlePosition,
    updateInnerRadiusHandlePosition,
    updateRadiusRing,
    updateInnerRadiusRing,
    stageScale,
    gridCellPx,
    fontLoaded
  ]);

  // Handle global pointer move for dragging
  useEffect(() => {
    if (!pixiApp) return;

    // Store last known pointer position for use in pointerup
    let lastPointerPos: { x: number; y: number } | null = null;

    const handlePointerMove = (e: PIXI.FederatedPointerEvent) => {
      lastPointerPos = { x: e.global.x, y: e.global.y };
      
      // Handle position dragging
      if (draggingRef.current) {
        const light = lights.find(l => l.id === draggingRef.current?.lightId);
        if (!light) return;

        const globalPos = e.global;
        onLightDrag?.(light, { x: globalPos.x, y: globalPos.y });
      }

      // Handle radius dragging
      if (radiusDraggingRef.current) {
        const light = lights.find(l => l.id === radiusDraggingRef.current?.lightId);
        if (!light) return;

        const globalPos = e.global;
        // Use stage position and scale calculations instead of pixiApp.stage.toLocal()
        // to avoid pixiApp being possibly undefined
        const stagePos = {
          x: light.x * stageScale + stagePosition.x,
          y: light.y * stageScale + stagePosition.y
        };
        
        // Calculate new radius based on distance from light center
        const dx = globalPos.x - stagePos.x;
        const dy = globalPos.y - stagePos.y;
        const newRadius = Math.max(10, Math.sqrt(dx * dx + dy * dy));
        
        onLightRadiusDrag?.(light, newRadius);
        
        // Also update handle position to follow mouse during drag
        const handle = radiusHandlesRef.current.get(light.id);
        if (handle) {
          handle.x = light.x + newRadius;
          handle.y = light.y;
          handle.visible = true;
        }
      }

      // Handle inner radius dragging
      if (innerRadiusDraggingRef.current) {
        const light = lights.find(l => l.id === innerRadiusDraggingRef.current?.lightId);
        if (!light) return;

        const globalPos = e.global;
        // Use stage position and scale calculations instead of pixiApp.stage.toLocal()
        // to avoid pixiApp being possibly undefined
        const stagePos = {
          x: light.x * stageScale + stagePosition.x,
          y: light.y * stageScale + stagePosition.y
        };
        
        // Calculate new dimRadius based on distance from light center
        const dx = globalPos.x - stagePos.x;
        const dy = globalPos.y - stagePos.y;
        let newDimRadius = Math.sqrt(dx * dx + dy * dy);
        // Ensure inner radius doesn't exceed outer radius
        newDimRadius = Math.min(newDimRadius, (light.radius || 200) - 10);
        
        onLightInnerRadiusDrag?.(light, newDimRadius);
        
        // Also update inner handle position to follow mouse during drag
        const innerHandle = innerRadiusHandlesRef.current.get(light.id);
        if (innerHandle) {
          innerHandle.x = light.x + newDimRadius;
          innerHandle.y = light.y;
          innerHandle.visible = true;
        }
      }
    };

    const handlePointerUp = () => {
      // Capture current state of dragging refs before clearing
      const wasRadiusDragging = radiusDraggingRef.current !== null;
      const wasInnerRadiusDragging = innerRadiusDraggingRef.current !== null;
      const radiusDraggingLightId = radiusDraggingRef.current?.lightId;
      const innerRadiusDraggingLightId = innerRadiusDraggingRef.current?.lightId;
      
      // Handle position drag end
      if (draggingRef.current) {
        const light = lights.find(l => l.id === draggingRef.current?.lightId);
        if (light) {
          onLightDragEnd?.(light);
        }
        draggingRef.current = null;
      }

      // Handle radius drag end - unconditionally clear and process
      if (radiusDraggingRef.current && lastPointerPos) {
        const light = lights.find(l => l.id === radiusDraggingRef.current?.lightId);
        if (light) {
          // Use stage position and scale calculations instead of pixiApp.stage.toLocal()
          // to avoid pixiApp being possibly undefined
          const stagePos = {
            x: light.x * stageScale + stagePosition.x,
            y: light.y * stageScale + stagePosition.y
          };
          const dx = lastPointerPos.x - stagePos.x;
          const dy = lastPointerPos.y - stagePos.y;
          const newRadius = Math.max(10, Math.sqrt(dx * dx + dy * dy));
          onLightRadiusDragEnd?.(light, newRadius);
        }
      }
      radiusDraggingRef.current = null;

      // Handle inner radius drag end - unconditionally clear and process
      if (innerRadiusDraggingRef.current && lastPointerPos) {
        const light = lights.find(l => l.id === innerRadiusDraggingRef.current?.lightId);
        if (light) {
          // Use stage position and scale calculations instead of pixiApp.stage.toLocal()
          // to avoid pixiApp being possibly undefined
          const stagePos = {
            x: light.x * stageScale + stagePosition.x,
            y: light.y * stageScale + stagePosition.y
          };
          const dx = lastPointerPos.x - stagePos.x;
          const dy = lastPointerPos.y - stagePos.y;
          let newDimRadius = Math.sqrt(dx * dx + dy * dy);
          // Ensure inner radius doesn't exceed outer radius
          newDimRadius = Math.min(newDimRadius, (light.radius || 200) - 10);
          onLightInnerRadiusDragEnd?.(light, newDimRadius);
        }
      }
      innerRadiusDraggingRef.current = null;
      
      lastPointerPos = null;
    };

    const stage = pixiApp.stage;
    if (stage) {
      stage.on('pointermove', handlePointerMove);
      stage.on('pointerup', handlePointerUp);
      stage.on('pointerupoutside', handlePointerUp);
    }

    return () => {
      if (stage) {
        stage.off('pointermove', handlePointerMove);
        stage.off('pointerup', handlePointerUp);
        stage.off('pointerupoutside', handlePointerUp);
      }
    };
  }, [pixiApp, lights, onLightDrag, onLightDragEnd, onLightRadiusDrag, onLightRadiusDragEnd, onLightInnerRadiusDrag, onLightInnerRadiusDragEnd]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const layer = getLightIconsLayer();
      if (layer) {
        iconsRef.current.forEach((icon) => {
          layer.removeChild(icon);
          icon.destroy();
        });
        iconsRef.current.clear();
        
        radiusHandlesRef.current.forEach((handle) => {
          layer.removeChild(handle);
          handle.destroy();
        });
        radiusHandlesRef.current.clear();

        innerRadiusHandlesRef.current.forEach((handle) => {
          layer.removeChild(handle);
          handle.destroy();
        });
        innerRadiusHandlesRef.current.clear();
      }
    };
  }, [getLightIconsLayer]);

  // This component doesn't render anything - it manages PIXI elements directly
  return null;
}
