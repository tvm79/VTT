import { useRef, useEffect, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import type { BLEND_MODES } from 'pixi.js';
import type { Light } from '../../../../shared/src/index';
import { getLightTexture, getRadianceTexture } from './LightTextureGenerator';

// Blend mode map for light rendering - using string values with type casting
// as used in the original GameBoard.tsx
const lightBlendModeMap: Record<string, BLEND_MODES> = {
  'add': 'add' as BLEND_MODES,
  'screen': 'screen' as BLEND_MODES,
  'normal': 'normal' as BLEND_MODES,
  'multiply': 'multiply' as BLEND_MODES,
  'lighten': 'lighten' as BLEND_MODES,
  'overlay': 'overlay' as BLEND_MODES,
  'darken': 'darken' as BLEND_MODES,
  'color-dodge': 'color-dodge' as BLEND_MODES,
  'color-burn': 'color-burn' as BLEND_MODES,
  'hard-light': 'hard-light' as BLEND_MODES,
  'soft-light': 'soft-light' as BLEND_MODES,
  'difference': 'difference' as BLEND_MODES,
  'exclusion': 'exclusion' as BLEND_MODES,
  'hue': 'hue' as BLEND_MODES,
  'saturation': 'saturation' as BLEND_MODES,
  'color': 'color' as BLEND_MODES,
  'luminosity': 'luminosity' as BLEND_MODES,
};

export interface LightRendererRefs {
  lightsContainer: PIXI.Container | null;
  lightsContainerRef: React.MutableRefObject<PIXI.Container | null>;
  lightsRef: React.MutableRefObject<Map<string, PIXI.Container>>;
  lightIconsRef: React.MutableRefObject<Map<string, PIXI.Text>>;
  lightSpritesRef: React.MutableRefObject<Map<string, PIXI.Sprite>>;
}

export interface UseLightRendererOptions {
  app: PIXI.Application | null;
  lights: Light[];
  selectedLightIds: string[];
  gridCellPx?: number;
  isGM?: boolean;
  tool?: string;
  showIcons?: boolean; // Whether to show light icons (use HTML overlay instead if true)
  enabled?: boolean; // Whether to enable light rendering
  onLightClick?: (light: Light, screenPos: { x: number; y: number }) => void;
  onLightDoubleClick?: (light: Light, screenPos: { x: number; y: number }) => void;
  onLightDragStart?: (light: Light, screenPos: { x: number; y: number }) => void;
  onLightDrag?: (light: Light, screenPos: { x: number; y: number }) => void;
  onLightDragEnd?: (light: Light) => void;
}

export interface UseLightRendererReturn {
  refs: LightRendererRefs;
  initLightLayer: () => PIXI.Container | null;
  getLightIconsLayer: () => PIXI.Container | null;
  renderLights: () => void;
  cleanup: () => void;
}

/**
 * Custom hook for rendering lights on the PIXI canvas.
 * Manages light containers, sprites, icons, and interactions.
 */
export function useLightRenderer(options: UseLightRendererOptions): UseLightRendererReturn {
  const {
    app,
    lights,
    selectedLightIds,
    isGM,
    tool,
    showIcons = false, // Default to not showing icons in PIXI (use HTML overlay instead)
    enabled = true, // Default to enabled
    onLightClick,
    onLightDoubleClick,
    onLightDragStart,
    onLightDrag,
    onLightDragEnd,
  } = options;

  // Refs for managing PIXI objects
  const lightsContainerRef = useRef<PIXI.Container | null>(null);
  const lightsRef = useRef<Map<string, PIXI.Container>>(new Map());
  const lightIconsRef = useRef<Map<string, PIXI.Text>>(new Map());
  const lightSpritesRef = useRef<Map<string, PIXI.Sprite>>(new Map());

  // Track dragging state
  const isDraggingRef = useRef(false);
  const draggedLightRef = useRef<Light | null>(null);

  /**
   * Initialize the light layer in the PIXI application
   */
  const initLightLayer = useCallback((): PIXI.Container | null => {
    // Skip initialization if disabled
    if (!enabled) return null;
    
    if (!app) return null;

    // Check if light layer already exists
    let lightLayer = (app as any).lightLayer as PIXI.Container;
    if (lightLayer) {
      lightsContainerRef.current = lightLayer;
      return lightLayer;
    }

    // Create new light layer
    lightLayer = new PIXI.Container();
    app.stage.addChild(lightLayer);
    (app as any).lightLayer = lightLayer;
    lightsContainerRef.current = lightLayer;

    return lightLayer;
  }, [app]);

  /**
   * Get the light icons layer from the app (creates it if needed)
   */
  const getLightIconsLayer = useCallback((): PIXI.Container | null => {
    if (!app) return null;
    
    let lightIconsLayer = (app as any).lightIconsLayer as PIXI.Container;
    if (lightIconsLayer) {
      return lightIconsLayer;
    }
    
    // Fall back to light layer if icons layer doesn't exist
    return lightsContainerRef.current;
  }, [app]);

  /**
   * Render all lights based on the current lights data
   */
  const renderLights = useCallback(() => {
    // Skip rendering if disabled
    if (!enabled) return;
    
    const lightLayer = lightsContainerRef.current;
    if (!lightLayer || !app) return;

    const existingIds = new Set(lights.map(l => l.id));

    // Remove deleted lights
    for (const [id, container] of lightsRef.current) {
      if (!existingIds.has(id)) {
        lightLayer.removeChild(container);
        container.destroy();
        lightsRef.current.delete(id);
        
        // Also remove the icon reference and icon from correct layer
        const lightIcon = lightIconsRef.current.get(id);
        if (lightIcon) {
          const iconsLayer = getLightIconsLayer();
          if (iconsLayer) {
            iconsLayer.removeChild(lightIcon);
          }
          lightIcon.destroy();
          lightIconsRef.current.delete(id);
        }
      }
    }

    // Clear ALL selection indicators before processing lights
    for (let i = lightLayer.children.length - 1; i >= 0; i--) {
      const child = lightLayer.children[i];
      if ((child as any).isSelectionIndicator) {
        lightLayer.removeChild(child);
        child.destroy();
      }
    }

    // Update or create lights
    lights.forEach(light => {
      let container = lightsRef.current.get(light.id);

      if (!container) {
        container = new PIXI.Container();
        // Use additive blending so lights appear to illuminate through the darkness overlay
        container.blendMode = 'add' as any;
        lightLayer.addChild(container);
        lightsRef.current.set(light.id, container);
      }

      // Clear previous graphics
      container.removeChildren();

      if (!light.visible) {
        container.visible = false;
        return;
      }

      container.visible = true;
      container.x = light.x;
      container.y = light.y;
      
      // Set container to not intercept pointer events - let icons handle clicks
      container.eventMode = 'none';
      container.cursor = 'default';

      // Draw selection indicator if this light is selected
      if (selectedLightIds.includes(light.id)) {
        const { radius: r } = light;
        const selectionGraphics = new PIXI.Graphics();
        (selectionGraphics as any).isSelectionIndicator = true;
        const selectionSize = (r || 200) + 30;
        // Draw filled circle with border for visibility (PixiJS v8 API)
        selectionGraphics.circle(light.x, light.y, selectionSize);
        selectionGraphics.stroke({ width: 3, color: 0x00ff00, alpha: 0.1 });
        selectionGraphics.fill({ color: 0x00ff00, alpha: 0.0 });
        // Make selection graphics ignore pointer events so clicks pass through to light icon
        selectionGraphics.eventMode = 'none';
        lightLayer.addChild(selectionGraphics);
      }

      // Create the light graphic based on type
      const { radius, color, intensity, type, angle, direction, dimRadius } = light;
      const outerRadius = radius || 200;
      const innerRadius = dimRadius || 0;
      const lightAngle = type === 'cone' ? (angle || 60) : 360;
      const lightDirection = direction || 0;
      const safeColor = Number.isFinite(color) ? color : 0xffdd88;
      const requestedBlend = light.blendMode || 'add';
      // Prevent scene-darkening regressions from destructive blend modes.
      const effectiveBlend = requestedBlend === 'multiply' ? 'screen' : requestedBlend;
      const blendMode = lightBlendModeMap[effectiveBlend] ?? ('add' as BLEND_MODES);

      // Use radial gradient texture for point lights (Canvas-compatible)
      if (type !== 'cone') {
        // For radiance type, use a different approach - flatter gradient for ambient lighting
        const lightTexture = type === 'radiance' 
          ? getRadianceTexture(outerRadius, safeColor, intensity)
          : getLightTexture(outerRadius, safeColor, innerRadius);
        const lightSprite = new PIXI.Sprite(lightTexture);
        lightSprite.anchor.set(0.5);
        lightSprite.width = outerRadius * 2;
        lightSprite.height = outerRadius * 2;
        // Use intensity to amplify the light (useful for blend modes like overlay)
        const effectiveAlpha = (light.alpha ?? 1) * intensity;
        lightSprite.alpha = effectiveAlpha;
        lightSprite.blendMode = blendMode;
        // Store reference for effect animation
        (lightSprite as any).originalIntensity = effectiveAlpha;
        (lightSprite as any).lightId = light.id;
        lightSpritesRef.current.set(light.id, lightSprite);
        container.addChild(lightSprite);
      } else {
        // For cone lights, use the original graphics approach with the gradient texture
        const halfAngle = (lightAngle * Math.PI) / 360;
        const directionRadians = (lightDirection * Math.PI) / 180;
        
        // Create a cone-shaped mask using the gradient
        const coneGraphics = new PIXI.Graphics();
        
        // Draw the cone with gradient-like effect using multiple segments
        const segments = 10;
        for (let i = 0; i < segments; i++) {
          const t = i / segments;
          const segmentRadius = outerRadius * t;
          const segmentAlpha = intensity * (1 - t * 0.8);
          
          const startAngle = directionRadians - halfAngle;
          const endAngle = directionRadians + halfAngle;
          
          coneGraphics.circle(
            Math.cos(directionRadians) * segmentRadius,
            Math.sin(directionRadians) * segmentRadius,
            segmentRadius * 0.3
          );
          coneGraphics.fill({ color: safeColor, alpha: Math.max(0.01, segmentAlpha) });
        }
        
        coneGraphics.blendMode = blendMode;
        container.addChild(coneGraphics);
      }

      // Only GM can see the light indicator in edit mode (if not using HTML overlay)
      if (showIcons && isGM && tool === 'light') {
        // Use Font Awesome lightbulb icon
        let lightIcon = lightIconsRef.current.get(light.id);
        
        if (!lightIcon) {
          // Create the Font Awesome text icon
          const faUnicode = '\uF0EB'; // lightbulb icon
          lightIcon = new PIXI.Text(faUnicode, {
            fontSize: 20,
            fill: 0xffff00, // Yellow color
            fontFamily: '"Font Awesome 6 Free", Arial',
            fontWeight: '900',
            stroke: {
              color: 0x000000,
              width: 2,
            },
          });
          lightIcon.anchor.set(0.5);
          lightIcon.eventMode = 'static'; // Enable clicks on the icon
          lightIcon.cursor = 'pointer';
          
          // Track last click time for double-click detection
          let lastClickTime = 0;
          const DOUBLE_CLICK_THRESHOLD = 300;
          
          // Add lightId to identify this as a light icon
          (lightIcon as PIXI.Text & { lightId?: string }).lightId = light.id;
          // Use separate icons layer if provided (to put icons above everything)
          const iconsLayer = getLightIconsLayer() || lightLayer;
          iconsLayer.addChild(lightIcon);
          lightIconsRef.current.set(light.id, lightIcon);

          // Add interaction handlers
          lightIcon.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
            e.stopPropagation();
            
            const nativeEvent = e.data?.originalEvent as unknown as { button?: number; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean };
            if (nativeEvent?.button === 1) return; // Middle click

            const currentTime = Date.now();
            const isDoubleClick = currentTime - lastClickTime < DOUBLE_CLICK_THRESHOLD || e.detail >= 2;

            if (isDoubleClick) {
              const screenPos = app.stage.toGlobal({ x: light.x, y: light.y });
              onLightDoubleClick?.(light, screenPos);
              lastClickTime = 0;
              return;
            }

            lastClickTime = currentTime;
            
            // Start drag
            isDraggingRef.current = true;
            draggedLightRef.current = light;
            const screenPos = app.stage.toGlobal({ x: light.x, y: light.y });
            onLightDragStart?.(light, screenPos);
          });

          lightIcon.on('pointerup', (e: PIXI.FederatedPointerEvent) => {
            e.stopPropagation();
            
            const screenPos = app.stage.toGlobal({ x: light.x, y: light.y });
            
            if (isDraggingRef.current) {
              isDraggingRef.current = false;
              draggedLightRef.current = null;
              onLightDragEnd?.(light);
            } else {
              onLightClick?.(light, screenPos);
            }
          });

          lightIcon.on('pointerupoutside', (e: PIXI.FederatedPointerEvent) => {
            if (isDraggingRef.current) {
              isDraggingRef.current = false;
              draggedLightRef.current = null;
              onLightDragEnd?.(light);
            }
          });

          lightIcon.on('pointermove', (e: PIXI.FederatedPointerEvent) => {
            if (isDraggingRef.current && draggedLightRef.current?.id === light.id) {
              const screenPos = app.stage.toGlobal({ x: light.x, y: light.y });
              onLightDrag?.(light, screenPos);
            }
          });
        }

        // Update position and visibility
        lightIcon.x = light.x;
        lightIcon.y = light.y;
        lightIcon.visible = true;
        
        // Get current stage scale for resolution calculation
        const stageScale = app.stage.scale.x || 1;
        const resolution = Math.max(3, (window.devicePixelRatio || 1) * 3 / stageScale);
        lightIcon.resolution = resolution;
      } else {
        // Hide the light icon if it exists and we're not in light edit mode
        const lightIcon = lightIconsRef.current.get(light.id);
        if (lightIcon) {
          lightIcon.visible = false;
        }
      }
    });
  }, [lights, selectedLightIds, isGM, tool, app, showIcons, getLightIconsLayer, onLightClick, onLightDoubleClick, onLightDragStart, onLightDrag, onLightDragEnd]);

  /**
   * Cleanup all PIXI objects
   */
  const cleanup = useCallback(() => {
    // Destroy all light containers
    lightsRef.current.forEach((container) => {
      container.destroy();
    });
    lightsRef.current.clear();

    // Destroy all light icons
    lightIconsRef.current.forEach((icon) => {
      icon.destroy();
    });
    lightIconsRef.current.clear();

    // Destroy all light sprites
    lightSpritesRef.current.forEach((sprite) => {
      sprite.destroy();
    });
    lightSpritesRef.current.clear();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    refs: {
      lightsContainer: lightsContainerRef.current,
      lightsContainerRef,
      lightsRef,
      lightIconsRef,
      lightSpritesRef,
    },
    initLightLayer,
    getLightIconsLayer,
    renderLights,
    cleanup,
  };
}
