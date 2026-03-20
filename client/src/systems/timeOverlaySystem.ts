import * as PIXI from 'pixi.js';
import { 
  getDayProgress, 
  getNightOverlayAlpha, 
  getTimeTint, 
  getSunAngle,
  getFogAlpha,
  getFogTint,
  TIME 
} from '../utils/gameTime';

/**
 * Time Overlay System for PixiJS
 * 
 * Creates and manages a day/night overlay that affects the entire game board.
 * Features:
 * - Smooth 24-hour lighting gradient
 * - Color temperature changes (warm sunrise/sunset, cool night)
 * - Sun position tracking for future shadow calculations
 * - Configurable opacity
 */

export interface TimeOverlayConfig {
  enabled: boolean;
  opacity: number;
  width: number;
  height: number;
}

export class TimeOverlaySystem {
  private overlay: PIXI.Graphics | null = null;
  private fogOverlay: PIXI.Graphics | null = null;
  private stage: PIXI.Container | null = null;
  private currentAlpha: number = 0;
  private currentTint: number = 0xffffff;
  private currentFogAlpha: number = 0;
  private currentFogTint: number = 0xffffff;
  private targetAlpha: number = 0;
  private targetTint: number = 0xffffff;
  private targetFogAlpha: number = 0;
  private targetFogTint: number = 0xffffff;
  private config: TimeOverlayConfig;
  private isInitialized: boolean = false;
  private smoothing: number = 0.1; // Smoothing factor for transitions

  constructor(config: Partial<TimeOverlayConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      opacity: config.opacity ?? 0.7,
      width: config.width ?? 10000,
      height: config.height ?? 10000,
    };
  }

  /**
   * Initialize the time overlay in the PixiJS stage
   * @param stage - The PixiJS stage/container to add the overlay to
   */
  initialize(stage: PIXI.Container): void {
    if (this.isInitialized) {
      return;
    }

    this.stage = stage;
    this.overlay = new PIXI.Graphics();
    this.fogOverlay = new PIXI.Graphics();
    
    // Ensure overlay doesn't block pointer events
    this.overlay.eventMode = 'none';
    this.overlay.interactive = false;
    this.fogOverlay.eventMode = 'none';
    this.fogOverlay.interactive = false;
    
    // Ensure the stage (overlayLayer Container) doesn't capture pointer events
    stage.eventMode = 'none';
    
    // Set initial state
    this.overlay.alpha = 0;
    this.overlay.tint = 0xffffff;
    this.fogOverlay.alpha = 0;
    this.fogOverlay.tint = 0xffffff;

    // Add to stage (will be positioned by updatePosition)
    stage.addChild(this.overlay);
    stage.addChild(this.fogOverlay);
    this.isInitialized = true;
  }

  /**
   * Update overlay position to cover the entire board
   * Should be called when the board dimensions change
   */
  updatePosition(x: number, y: number, width: number, height: number): void {
    if (!this.overlay || !this.fogOverlay) return;

    // Clear existing graphics
    this.overlay.clear();
    this.fogOverlay.clear();
    
    // Draw a full-screen rectangle for night overlay
    this.overlay.rect(x, y, width, height);
    this.overlay.fill({ color: 0x000000 });
    
    // Draw a full-screen rectangle for fog overlay
    this.fogOverlay.rect(x, y, width, height);
    this.fogOverlay.fill({ color: 0xffffff });
    
    // Ensure it's above other game elements but below UI
    this.overlay.zIndex = 999;
    this.fogOverlay.zIndex = 998; // Fog is below night overlay
  }

  /**
   * Update the overlay based on current game time
   * @param gameTimeSeconds - Current game time in seconds
   */
  update(gameTimeSeconds: number): void {
    if (!this.overlay || !this.fogOverlay || !this.config.enabled) {
      if (this.overlay) {
        this.overlay.alpha = 0;
      }
      if (this.fogOverlay) {
        this.fogOverlay.alpha = 0;
      }
      return;
    }

    // Calculate day progress (0-1)
    const dayProgress = getDayProgress(gameTimeSeconds);

    // Calculate target alpha based on light level
    const rawAlpha = getNightOverlayAlpha(dayProgress);
    this.targetAlpha = rawAlpha * this.config.opacity;

    // Calculate target tint based on time of day
    this.targetTint = getTimeTint(dayProgress);

    // Calculate fog overlay based on atmospheric fog setting
    this.targetFogAlpha = getFogAlpha(dayProgress);
    this.targetFogTint = getFogTint(dayProgress);

    // Smooth the transitions
    this.currentAlpha += (this.targetAlpha - this.currentAlpha) * this.smoothing;
    this.currentTint = this.lerpColor(this.currentTint, this.targetTint, this.smoothing);
    this.currentFogAlpha += (this.targetFogAlpha - this.currentFogAlpha) * this.smoothing;
    this.currentFogTint = this.lerpColor(this.currentFogTint, this.targetFogTint, this.smoothing);

    // Apply to overlay
    this.overlay.alpha = this.currentAlpha;
    this.overlay.tint = this.currentTint;
    
    // Apply to fog overlay
    this.fogOverlay.alpha = this.currentFogAlpha;
    this.fogOverlay.tint = this.currentFogTint;
  }

  /**
   * Enable or disable the time overlay
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    if (!enabled && this.overlay) {
      this.overlay.alpha = 0;
    }
  }

  /**
   * Set the overlay opacity
   * @param opacity - Opacity value from 0 to 1
   */
  setOpacity(opacity: number): void {
    this.config.opacity = Math.max(0, Math.min(1, opacity));
  }

  /**
   * Get current configuration
   */
  getConfig(): TimeOverlayConfig {
    return { ...this.config };
  }

  /**
   * Get the sun angle for shadow calculations
   * @param gameTimeSeconds - Current game time in seconds
   * @returns Angle in radians
   */
  getSunAngle(gameTimeSeconds: number): number {
    const dayProgress = getDayProgress(gameTimeSeconds);
    return getSunAngle(dayProgress);
  }

  /**
   * Check if it's currently daytime
   * @param gameTimeSeconds - Current game time in seconds
   * @returns True if it's daytime
   */
  isDaytime(gameTimeSeconds: number): boolean {
    const dayProgress = getDayProgress(gameTimeSeconds);
    return dayProgress > 0.25 && dayProgress < 0.75;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.overlay && this.stage) {
      this.stage.removeChild(this.overlay);
      this.overlay.destroy();
      this.overlay = null;
    }
    if (this.fogOverlay && this.stage) {
      this.stage.removeChild(this.fogOverlay);
      this.fogOverlay.destroy();
      this.fogOverlay = null;
    }
    this.stage = null;
    this.isInitialized = false;
  }

  /**
   * Linear interpolation between two colors
   */
  private lerpColor(color1: number, color2: number, t: number): number {
    const r1 = (color1 >> 16) & 0xff;
    const g1 = (color1 >> 8) & 0xff;
    const b1 = color1 & 0xff;

    const r2 = (color2 >> 16) & 0xff;
    const g2 = (color2 >> 8) & 0xff;
    const b2 = color2 & 0xff;

    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);

    return (r << 16) | (g << 8) | b;
  }
}

// Singleton instance for global access
let timeOverlayInstance: TimeOverlaySystem | null = null;

/**
 * Get the global TimeOverlaySystem instance
 */
export function getTimeOverlaySystem(config?: Partial<TimeOverlayConfig>): TimeOverlaySystem {
  if (!timeOverlayInstance) {
    timeOverlayInstance = new TimeOverlaySystem(config);
  }
  return timeOverlayInstance;
}

/**
 * Create and initialize a new TimeOverlaySystem
 */
export function createTimeOverlaySystem(config?: Partial<TimeOverlayConfig>): TimeOverlaySystem {
  const system = new TimeOverlaySystem(config);
  timeOverlayInstance = system;
  return system;
}
