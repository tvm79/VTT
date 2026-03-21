import * as PIXI from 'pixi.js';

/**
 * Light Texture Generator
 * 
 * Provides pure functions for generating light textures using Canvas 2D.
 * These textures are then used by PIXI.Sprite to render lights on the canvas.
 */

// Light texture cache for radial gradient textures (Canvas2D-compatible)
const lightTextureCache = new Map<string, PIXI.Texture>();

/**
 * Generates a radial gradient light texture with the given radius and color.
 * Uses a multi-stop gradient for realistic light falloff.
 * Supports an inner radius (dimRadius) where light is at full brightness.
 * 
 * @param radius - The outer radius of the light in pixels
 * @param color - The hex color of the light (e.g., 0xFFAA00)
 * @param dimRadius - The inner radius where light starts fading (optional, defaults to 0)
 * @returns PIXI.Texture - The generated light texture
 */
export function getLightTexture(radius: number, color: number, dimRadius: number = 0): PIXI.Texture {
  const key = `light_${radius}_${color}_${dimRadius}`;

  if (lightTextureCache.has(key)) {
    return lightTextureCache.get(key)!;
  }

  const size = radius * 2;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d")!;

  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;

  let gradient: CanvasGradient;

  if (dimRadius > 0) {
    // When dimRadius is set, create a solid inner circle and gradient from dimRadius to outer radius
    // First draw solid inner circle
    const innerRadiusPixels = dimRadius;
    
    gradient = ctx.createRadialGradient(
      radius,
      radius,
      innerRadiusPixels,
      radius,
      radius,
      radius
    );
    
    // From inner radius to outer radius: full brightness at inner, fading to 0 at outer
    gradient.addColorStop(0.0, `rgba(${r},${g},${b},1)`);
    gradient.addColorStop(0.25, `rgba(${r},${g},${b},0.7)`);
    gradient.addColorStop(0.5, `rgba(${r},${g},${b},0.35)`);
    gradient.addColorStop(0.75, `rgba(${r},${g},${b},0.12)`);
    gradient.addColorStop(1.0, `rgba(${r},${g},${b},0)`);
  } else {
    // Original gradient without inner radius
    gradient = ctx.createRadialGradient(
      radius,
      radius,
      0,
      radius,
      radius,
      radius
    );

    gradient.addColorStop(0.0, `rgba(${r},${g},${b},1)`);
    gradient.addColorStop(0.2, `rgba(${r},${g},${b},0.7)`);
    gradient.addColorStop(0.45, `rgba(${r},${g},${b},0.35)`);
    gradient.addColorStop(0.75, `rgba(${r},${g},${b},0.12)`);
    gradient.addColorStop(1.0, `rgba(${r},${g},${b},0)`);
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = PIXI.Texture.from(canvas);

  lightTextureCache.set(key, texture);

  return texture;
}

/**
 * Generates a radiance texture for ambient lighting.
 * Has a flatter gradient that doesn't fall off as quickly as regular lights.
 * The intensity parameter amplifies the center brightness.
 * 
 * @param radius - The outer radius of the radiance in pixels
 * @param color - The hex color of the radiance (e.g., 0xFFAA00)
 * @param intensity - Intensity multiplier for center brightness (default: 1)
 * @returns PIXI.Texture - The generated radiance texture
 */
export function getRadianceTexture(radius: number, color: number, intensity: number = 1): PIXI.Texture {
  const key = `radiance_${radius}_${color}_${intensity}`;

  if (lightTextureCache.has(key)) {
    return lightTextureCache.get(key)!;
  }

  const size = radius * 2;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d")!;

  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;

  // Flatter gradient for ambient lighting - doesn't fall off as quickly
  // Intensity amplifies the center brightness
  const centerBrightness = Math.min(1, intensity);
  const gradient = ctx.createRadialGradient(
    radius,
    radius,
    0,
    radius,
    radius,
    radius
  );

  gradient.addColorStop(0.0, `rgba(${r},${g},${b},${centerBrightness})`);
  gradient.addColorStop(0.3, `rgba(${r},${g},${b},${centerBrightness * 0.6})`);
  gradient.addColorStop(0.6, `rgba(${r},${g},${b},${centerBrightness * 0.35})`);
  gradient.addColorStop(0.85, `rgba(${r},${g},${b},${centerBrightness * 0.15})`);
  gradient.addColorStop(1.0, `rgba(${r},${g},${b},0)`);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = PIXI.Texture.from(canvas);

  lightTextureCache.set(key, texture);

  return texture;
}

/**
 * Clears the texture cache. Useful for memory management or when
 * textures need to be regenerated (e.g., after theme changes).
 */
export function clearLightTextureCache(): void {
  lightTextureCache.forEach((texture) => {
    texture.destroy(true);
  });
  lightTextureCache.clear();
}

/**
 * Returns the current number of cached textures.
 * Useful for debugging and memory monitoring.
 */
export function getLightTextureCacheSize(): number {
  return lightTextureCache.size;
}
