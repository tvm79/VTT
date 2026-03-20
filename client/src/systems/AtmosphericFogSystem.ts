import * as PIXI from 'pixi.js';
import { createFogFilter, createFogSprite, createSmokeFilter } from './FogShader';
import { 
  getDayProgress, 
  getFogAlpha, 
  getFogTint,
  VISUAL_OPTIONS 
} from '../utils/gameTime';

/**
 * Configuration options for atmospheric fog
 */
export interface AtmosphericFogConfig {
  enabled: boolean;
  intensity: number;      // 0-1, multiplier for fog alpha
  speed: number;          // Multiplier for fog motion speed
  density: number;        // 0-1, affects the fog noise threshold
  useSmokeShader: boolean; // Use the smoke shader variant instead of basic fog
  shift: number;          // Shift value for smoke shader gradient effect
}

/**
 * Atmospheric Fog System for PixiJS
 * 
 * Creates and manages a procedural atmospheric fog layer driven by game time.
 * Features:
 * - Shader-based fog rendering using Fractal Brownian Motion (FBM) noise
 * - Smooth time-based fog motion
 * - Dynamic fog alpha and tint based on time of day
 * - World-space rendering (pans/zooms with the stage)
 * - Single fullscreen shader pass for performance
 * 
 * This is separate from Fog of War and the existing night overlay system.
 */
export class AtmosphericFogSystem {
  private fogSprite: PIXI.Sprite | null = null;
  private fogFilter: PIXI.Filter | null = null;
  private width: number = 0;
  private height: number = 0;
  private elapsedTime: number = 0;
  public isInitialized: boolean = false;
  private smoothing: number = 0.1;
  private currentAlpha: number = 0;
  private currentTintR: number = 1;
  private currentTintG: number = 1;
  private currentTintB: number = 1;
  private debugCounter: number = 0;
  
  // Configuration options
  private config: AtmosphericFogConfig = {
    enabled: true,
    intensity: 1.0,
    speed: 1.0,
    density: 0.5,
    useSmokeShader: true,
    shift: 1.6
  };

  // Smoke-specific settings
  private smokeDirection: number = 180;  // Direction in degrees
  private smokeColor1: string = '#7e0061';  // Primary color (purple)
  private smokeColor2: string = '#ad00a1';  // Secondary color

  /**
   * Initialize the atmospheric fog system
   * @param overlayLayer - The PIXI overlay layer container to add the fog to
   * @param width - Initial width of the fog layer
   * @param height - Initial height of the fog layer
   */
  initialize(overlayLayer: PIXI.Container, width: number, height: number): void {
    if (this.isInitialized) {
      console.warn('AtmosphericFogSystem: Already initialized');
      return;
    }

    this.width = width;
    this.height = height;

    // Try creating filter first - choose based on config
    let fogFilter = null;
    
    // Use smoke shader by default (more visually interesting)
    if (this.config.useSmokeShader) {
      fogFilter = createSmokeFilter(width, height);
      if (!fogFilter) {
        console.warn('Smoke filter creation failed, falling back to fog filter');
      }
    }
    
    if (!fogFilter) {
      fogFilter = createFogFilter(width, height);
    }
    
    if (fogFilter) {
      // Create sprite with white texture
      const texture = PIXI.Texture.WHITE;
      this.fogSprite = new PIXI.Sprite(texture);
      this.fogSprite.width = width;
      this.fogSprite.height = height;
      this.fogSprite.position.set(0, 0);
      this.fogSprite.alpha = 0.3; // Lower default to let background show through
      this.fogSprite.eventMode = 'none';
      this.fogSprite.interactive = false;
      this.fogSprite.hitArea = null;
      
      // Apply filter
      this.fogFilter = fogFilter;
      this.fogSprite.filters = [this.fogFilter];
      
    } else {
      // Fallback to sprite with noise texture
      const fogSprite = createFogSprite(width, height);
      if (fogSprite) {
        this.fogSprite = fogSprite;
      } else {
        // Ultimate fallback: simple white sprite
        const texture = PIXI.Texture.WHITE;
        this.fogSprite = new PIXI.Sprite(texture);
        this.fogSprite.width = width;
        this.fogSprite.height = height;
        this.fogSprite.position.set(0, 0);
        this.fogSprite.alpha = 0.5;
        this.fogSprite.tint = 0x888888;
        this.fogSprite.eventMode = 'none';
        this.fogSprite.interactive = false;
      }
    }

    this.fogSprite.zIndex = 12;
    overlayLayer.addChild(this.fogSprite);

    this.isInitialized = true;
  }

  /**
   * Update the fog position to cover the entire board
   * Should be called when board dimensions change
   */
  updatePosition(x: number, y: number, width: number, height: number): void {
    if (!this.fogSprite || !this.fogFilter) return;

    this.width = width;
    this.height = height;

    this.fogSprite.position.set(x, y);
    this.fogSprite.width = width;
    this.fogSprite.height = height;

    // Update resolution uniform
    this.updateResolution(width, height);
  }

  /**
   * Update the fog resolution uniform
   */
  private updateResolution(width: number, height: number): void {
    if (!this.fogFilter) return;

    const filterAny = this.fogFilter as any;
    
    // PIXI v8 format - resolution in resources
    if (filterAny.resources?.smokeUniforms?.uniforms) {
      const uniforms = filterAny.resources.smokeUniforms.uniforms;
      uniforms.resolution[0] = width;
      uniforms.resolution[1] = height;
    }
    // Legacy format
    else if (filterAny.uniforms?.uResolution) {
      filterAny.uniforms.uResolution[0] = width;
      filterAny.uniforms.uResolution[1] = height;
    }
    else if (filterAny.uniforms?.resolution) {
      if (Array.isArray(filterAny.uniforms.resolution)) {
        filterAny.uniforms.resolution[0] = width;
        filterAny.uniforms.resolution[1] = height;
      }
    }
  }

  /**
   * Update fog based on game time - call this every frame
   * @param gameTimeSeconds - Current game time in seconds
   * @param elapsedTime - Total elapsed time for continuous animation
   */
  update(gameTimeSeconds: number, elapsedTime: number = 0): void {
    if (!this.fogSprite) return;

    // Read settings from VISUAL_OPTIONS for dynamic updates
    this.config.enabled = VISUAL_OPTIONS.fogEnabled;
    this.config.intensity = VISUAL_OPTIONS.fogIntensity;
    this.config.speed = VISUAL_OPTIONS.fogSpeed;
    this.config.shift = VISUAL_OPTIONS.fogShift;
    this.smokeDirection = VISUAL_OPTIONS.fogDirection;
    this.smokeColor1 = VISUAL_OPTIONS.fogColor1;
    this.smokeColor2 = VISUAL_OPTIONS.fogColor2;

    // Update fog sprite visibility based on enabled state
    this.fogSprite.visible = this.config.enabled;

    // Update elapsed time for continuous fog motion (with speed multiplier)
    this.elapsedTime = elapsedTime * this.config.speed;

    // Get the day progress (0-1)
    const dayProgress = getDayProgress(gameTimeSeconds);

    // Get target fog alpha from gameTime helpers
    const targetAlpha = getFogAlpha(dayProgress);

    // Get target fog tint from gameTime helpers
    const targetTint = getFogTint(dayProgress);

    // Apply intensity multiplier
    const adjustedAlpha = targetAlpha * this.config.intensity;
    

    // Apply intensity changes directly without smoothing for immediate feedback
    this.currentAlpha = adjustedAlpha;
    this.currentAlpha += (adjustedAlpha - this.currentAlpha) * this.smoothing;

    // Smooth the tint transition
    const targetR = ((targetTint >> 16) & 0xff);
    const targetG = ((targetTint >> 8) & 0xff);
    const targetB = (targetTint & 0xff);
    
    const currentR = Math.round(this.currentTintR * 255);
    const currentG = Math.round(this.currentTintG * 255);
    const currentB = Math.round(this.currentTintB * 255);
    
    const newR = Math.round(currentR + (targetR - currentR) * this.smoothing);
    const newG = Math.round(currentG + (targetG - currentG) * this.smoothing);
    const newB = Math.round(currentB + (targetB - currentB) * this.smoothing);
    
    this.currentTintR = newR / 255;
    this.currentTintG = newG / 255;
    this.currentTintB = newB / 255;

    if (this.fogSprite) {
      // If we have a filter, try to update its time uniform for animation
      if (this.fogFilter) {
        const filterAny = this.fogFilter as any;
        
        // PIXI v8 format - uniforms are in resources.smokeUniforms.uniforms
        if (filterAny.resources?.smokeUniforms?.uniforms) {
          const uniforms = filterAny.resources.smokeUniforms.uniforms;
          
          // Update time directly
          uniforms.time = this.elapsedTime;
          
          // Update alpha
          uniforms.alpha = this.config.enabled ? this.currentAlpha : 0;
          
          // Update shift uniform for smoke shader
          uniforms.shift = this.config.shift;
          
          // Update direction (convert degrees to radians for x,y components)
          const dirRad = (this.smokeDirection * Math.PI) / 180;
          uniforms.speed[0] = Math.cos(dirRad) * this.config.speed;
          uniforms.speed[1] = Math.sin(dirRad) * this.config.speed;
          
          // Update colors
          if (uniforms.color1 && uniforms.color2) {
            const c1 = this.hexToRgb(this.smokeColor1);
            const c2 = this.hexToRgb(this.smokeColor2);
            uniforms.color1[0] = c1[0];
            uniforms.color1[1] = c1[1];
            uniforms.color1[2] = c1[2];
            uniforms.color2[0] = c2[0];
            uniforms.color2[1] = c2[1];
            uniforms.color2[2] = c2[2];
          }
        }
        // Fallback for other filter formats
        else if (filterAny.uniforms) {
          if (filterAny.uniforms.time !== undefined) {
            filterAny.uniforms.time = this.elapsedTime;
          }
          if (filterAny.uniforms.alpha !== undefined) {
            filterAny.uniforms.alpha = this.config.enabled ? this.currentAlpha : 0;
          }
          if (filterAny.uniforms.shift !== undefined) {
            filterAny.uniforms.shift = this.config.shift;
          }
        }
      }
      
      // Update sprite properties
      this.fogSprite.alpha = this.config.enabled ? this.currentAlpha : 0;
      this.fogSprite.tint = (newR << 16) | (newG << 8) | newB;
    }
  }

  /**
   * Set fog intensity (0-1)
   */
  setIntensity(intensity: number): void {
    this.config.intensity = Math.max(0, Math.min(1, intensity));
  }

  /**
   * Set fog speed multiplier
   */
  setSpeed(speed: number): void {
    this.config.speed = Math.max(0, speed);
    // Apply immediately if initialized
    if (this.fogFilter && this.isInitialized) {
      this.applySmokeSettings();
    }
  }

  /**
   * Set fog density (0-1)
   */
  setDensity(density: number): void {
    this.config.density = Math.max(0, Math.min(1, density));
  }

  /**
   * Set smoke shader shift value (affects gradient effect)
   */
  setShift(shift: number): void {
    this.config.shift = shift;
    // Apply immediately if initialized
    if (this.fogFilter && this.isInitialized) {
      this.applySmokeSettings();
    }
  }

  /**
   * Enable/disable smoke shader (vs basic fog shader)
   */
  setUseSmokeShader(useSmoke: boolean): void {
    this.config.useSmokeShader = useSmoke;
  }

  /**
   * Enable/disable fog visibility
   */
  setEnabled(enabled: boolean): void {
    if (this.fogSprite) {
      this.fogSprite.visible = enabled;
    }
    this.config.enabled = enabled;
  }

  /**
   * Set smoke direction (0-360 degrees)
   */
  setSmokeDirection(direction: number): void {
    this.smokeDirection = direction % 360;
    // Apply immediately if initialized
    if (this.fogFilter && this.isInitialized) {
      this.applySmokeSettings();
    }
  }

  /**
   * Set smoke primary color
   */
  setSmokeColor1(color: string): void {
    this.smokeColor1 = color;
    // Apply immediately if initialized
    if (this.fogFilter && this.isInitialized) {
      this.applySmokeSettings();
    }
  }

  /**
   * Set smoke secondary color
   */
  setSmokeColor2(color: string): void {
    this.smokeColor2 = color;
    // Apply immediately if initialized
    if (this.fogFilter && this.isInitialized) {
      this.applySmokeSettings();
    }
  }
  
  /**
   * Apply current smoke settings to the filter
   */
  private applySmokeSettings(): void {
    const filterAny = this.fogFilter as any;
    if (!filterAny.resources?.smokeUniforms?.uniforms) return;
    
    const uniforms = filterAny.resources.smokeUniforms.uniforms;
    
    // Update direction
    const dirRad = (this.smokeDirection * Math.PI) / 180;
    uniforms.speed[0] = Math.cos(dirRad) * this.config.speed;
    uniforms.speed[1] = Math.sin(dirRad) * this.config.speed;
    
    // Update colors
    if (uniforms.color1 && uniforms.color2) {
      const c1 = this.hexToRgb(this.smokeColor1);
      const c2 = this.hexToRgb(this.smokeColor2);
      uniforms.color1[0] = c1[0];
      uniforms.color1[1] = c1[1];
      uniforms.color1[2] = c1[2];
      uniforms.color2[0] = c2[0];
      uniforms.color2[1] = c2[1];
      uniforms.color2[2] = c2[2];
    }
  }

  /**
   * Get current config
   */
  getConfig(): AtmosphericFogConfig {
    return { ...this.config };
  }

  /**
   * Check if atmospheric fog is enabled in visual options
   */
  isAtmosphericFogEnabled(): boolean {
    return VISUAL_OPTIONS.atmosphericFog;
  }

  /**
   * Get the fog sprite for external control
   */
  getSprite(): PIXI.Sprite | null {
    return this.fogSprite;
  }

  /**
   * Cleanup and destroy resources
   */
  destroy(): void {
    if (this.fogSprite) {
      this.fogSprite.destroy();
      this.fogSprite = null;
    }
    this.fogFilter = null;
    this.isInitialized = false;
  }

  /**
   * Convert hex color string to RGB array (0-1 range)
   */
  private hexToRgb(hex: string): [number, number, number] {
    // Remove # if present
    hex = hex.replace('#', '');
    
    // Parse hex
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    
    return [r, g, b];
  }
}

// Singleton instance getter
let atmosphericFogSystemInstance: AtmosphericFogSystem | null = null;

export function getAtmosphericFogSystem(): AtmosphericFogSystem {
  if (!atmosphericFogSystemInstance) {
    atmosphericFogSystemInstance = new AtmosphericFogSystem();
  }
  return atmosphericFogSystemInstance;
}

export function createAtmosphericFogSystem(): AtmosphericFogSystem {
  return new AtmosphericFogSystem();
}
