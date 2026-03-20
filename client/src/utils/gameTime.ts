/**
 * Game Time Utility Functions
 * 
 * All time values are stored in seconds.
 * Default start time: 8:00 AM (8 * 3600 = 28800 seconds)
 */

// Time constants
export const TIME = {
  ROUND: 6,
  MINUTE: 60,
  HOUR: 3600,
  DAY: 86400
} as const;

// Default start time: 8:00 AM
export const DEFAULT_GAME_START_TIME = 8 * TIME.HOUR;

/**
 * Optional visual systems
 * Can be toggled via UI checkbox
 */
export const VISUAL_OPTIONS = {
  atmosphericFog: true,
  fogEnabled: false,
  fogIntensity: 0.3,
  fogSpeed: 1.0,
  fogShift: 1.6,
  fogDirection: 180,
  fogColor1: '#776f85',
  fogColor2: '#353645',
  // God Ray options
  godRayEnabled: false,   // Enable standalone god ray effect
  godRayAngle: -90,      // Direction of light rays
  godRayLacunarity: 2.0, // Noise frequency
  godRayGain: 0.5,       // Ray intensity
  godRayIntensity: 1.0,  // Overall brightness
};

/**
 * Toggle function for UI checkbox
 */
export function setAtmosphericFog(enabled: boolean) {
  VISUAL_OPTIONS.atmosphericFog = enabled;
}

export function setFogEnabled(enabled: boolean) {
  VISUAL_OPTIONS.fogEnabled = enabled;
}

export function setFogIntensity(intensity: number) {
  VISUAL_OPTIONS.fogIntensity = intensity;
}

export function setFogSpeed(speed: number) {
  VISUAL_OPTIONS.fogSpeed = speed;
}

export function setFogShift(shift: number) {
  VISUAL_OPTIONS.fogShift = shift;
}

export function setFogDirection(direction: number) {
  VISUAL_OPTIONS.fogDirection = direction;
}

export function setFogColor1(color: string) {
  VISUAL_OPTIONS.fogColor1 = color;
}

export function setFogColor2(color: string) {
  VISUAL_OPTIONS.fogColor2 = color;
}

export function setGodRayEnabled(enabled: boolean) {
  VISUAL_OPTIONS.godRayEnabled = enabled;
}

export function setGodRayAngle(angle: number) {
  VISUAL_OPTIONS.godRayAngle = angle;
}

export function setGodRayLacunarity(value: number) {
  VISUAL_OPTIONS.godRayLacunarity = value;
}

export function setGodRayGain(value: number) {
  VISUAL_OPTIONS.godRayGain = value;
}

export function setGodRayIntensity(value: number) {
  VISUAL_OPTIONS.godRayIntensity = value;
}

/**
 * Convert total seconds to hours and minutes within a day
 */
export function secondsToTime(seconds: number): { hours: number; minutes: number } {
  const daySeconds = seconds % TIME.DAY;
  const hours = Math.floor(daySeconds / TIME.HOUR);
  const minutes = Math.floor((daySeconds % TIME.HOUR) / TIME.MINUTE);
  return { hours, minutes };
}

/**
 * Format hours and minutes to 12-hour format string
 */
export function formatTime(hours: number, minutes: number): string {
  const period = hours >= 12 ? 'PM' : 'AM';
  const h = hours % 12 || 12;
  const m = minutes.toString().padStart(2, '0');
  return `${h}:${m} ${period}`;
}

/**
 * Get the progress through the current day (0-1)
 */
export function getDayProgress(seconds: number): number {
  return (seconds % TIME.DAY) / TIME.DAY;
}

/**
 * Sun or moon state
 */
export function getSunState(progress: number): 'sun' | 'moon' {
  if (progress > 0.25 && progress < 0.75) {
    return 'sun';
  }
  return 'moon';
}

/**
 * Improved light level curve
 * Produces darker nights and longer twilight
 */
export function getLightLevel(progress: number): number {
  const base = Math.cos((progress - 0.5) * Math.PI * 2) * 0.5 + 0.5;

  // Twilight shaping
  const shaped = Math.pow(base, 1.6);

  // Ensure near-black midnight
  const minBrightness = 0.03;

  return Math.max(minBrightness, shaped);
}

/**
 * Color temperature tint
 */
export function getTimeTint(progress: number): number {
  if (progress < 0.25) {
    return 0x000814; // deep night
  } else if (progress < 0.35) {
    return 0xffa64d; // sunrise
  } else if (progress < 0.7) {
    return 0xffffff; // day
  } else if (progress < 0.85) {
    return 0xaa66ff; // sunset
  } else {
    return 0x000814; // night
  }
}

/**
 * Night overlay alpha
 */
export function getNightOverlayAlpha(progress: number): number {
  const light = getLightLevel(progress);
  const darkness = 1 - light;

  // Slightly exaggerate darkness
  return Math.pow(darkness, 0.85);
}

/**
 * Optional atmospheric fog alpha
 * Only active if checkbox enabled
 */
export function getFogAlpha(progress: number): number {
  if (!VISUAL_OPTIONS.atmosphericFog) return 0;

  const darkness = getNightOverlayAlpha(progress);

  // Fog increases at night
  return darkness * 0.6;
}

/**
 * Optional fog tint
 */
export function getFogTint(progress: number): number {
  if (!VISUAL_OPTIONS.atmosphericFog) return 0xffffff;

  if (progress < 0.25 || progress > 0.85) {
    return 0x0a1020; // night fog
  }

  if (progress < 0.35 || progress > 0.7) {
    return 0x443322; // sunset haze
  }

  return 0xffffff;
}

/**
 * Calculate sun position angle
 */
export function getSunAngle(progress: number): number {
  return progress * Math.PI * 2;
}

/**
 * Daytime check
 */
export function isDaytime(progress: number): boolean {
  return progress > 0.25 && progress < 0.75;
}

/**
 * Human readable period
 */
export function getTimePeriodDescription(progress: number): string {
  if (progress < 0.25) return 'Midnight';
  if (progress < 0.35) return 'Sunrise';
  if (progress < 0.45) return 'Morning';
  if (progress < 0.55) return 'Noon';
  if (progress < 0.65) return 'Afternoon';
  if (progress < 0.75) return 'Evening';
  if (progress < 0.85) return 'Sunset';
  return 'Night';
}

/**
 * Advance time
 */
export function advanceGameTime(currentSeconds: number, deltaSeconds: number): number {
  const newTime = currentSeconds + deltaSeconds;

  if (newTime < 0) {
    return TIME.DAY + (newTime % TIME.DAY);
  }

  return newTime;
}

/**
 * Set absolute game time
 */
export function setGameTime(seconds: number): number {
  return ((seconds % TIME.DAY) + TIME.DAY) % TIME.DAY;
}