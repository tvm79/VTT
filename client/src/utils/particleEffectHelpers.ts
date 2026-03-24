/**
 * Helper functions for retrieving particle effect presets from item/spell data
 */

import type { ParticleEventType, ParticleTrigger, ParticlePreset } from '../particles/editor/particleSchema';
import { getParticleSystem } from '../particles/runtime/ParticleSystem';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = Record<string, any>;

/**
 * Get particle effect preset ID for spell cast action from spell data
 */
export function getSpellCastEffect(spellData: AnyData | undefined): string | undefined {
  if (!spellData) return undefined;
  const system = spellData.system || spellData;
  return typeof system.spellCastEffect === 'string' ? system.spellCastEffect : undefined;
}

/**
 * Get particle effect preset ID for spell impact from spell data
 */
export function getSpellImpactEffect(spellData: AnyData | undefined): string | undefined {
  if (!spellData) return undefined;
  const system = spellData.system || spellData;
  return typeof system.spellImpactEffect === 'string' ? system.spellImpactEffect : undefined;
}

/**
 * Get particle effect preset ID for weapon attack from item data
 */
export function getWeaponAttackEffect(itemData: AnyData | undefined): string | undefined {
  if (!itemData) return undefined;
  const system = itemData.system || itemData;
  return typeof system.weaponAttackEffect === 'string' ? system.weaponAttackEffect : undefined;
}

/**
 * Get particle effect preset ID for weapon hit from item data
 */
export function getWeaponHitEffect(itemData: AnyData | undefined): string | undefined {
  if (!itemData) return undefined;
  const system = itemData.system || itemData;
  return typeof system.weaponHitEffect === 'string' ? system.weaponHitEffect : undefined;
}

/**
 * Map particle preset ID to the appropriate particle event type
 */
export function getParticleEventForPreset(presetId: string | undefined): ParticleEventType | null {
  if (!presetId) return null;
  
  // Map preset IDs to events based on naming conventions
  const upperId = presetId.toUpperCase();
  
  if (upperId.includes('CAST')) return 'spell_cast';
  if (upperId.includes('IMPACT') || upperId.includes('HIT') || upperId.includes('STRIKE') || upperId.includes('BURST')) return 'spell_impact';
  if (upperId.includes('ATTACK') || upperId.includes('SLASH')) return 'token_attack';
  
  // Default mapping based on common preset patterns
  return 'spell_impact';
}

/**
 * Trigger a particle effect for a specific preset ID
 * This directly plays the preset rather than relying on event bindings
 */
export async function triggerParticleEffect(
  presetId: string,
  sourceTokenId?: string,
  targetTokenId?: string,
  x?: number,
  y?: number
): Promise<string | null> {
  const system = getParticleSystem();
  if (!system) return null;
  
  return system.playPreset(presetId, {
    sourceTokenId,
    targetTokenId,
    x,
    y,
  });
}

/**
 * Trigger a particle event for an action (spell cast, spell impact, weapon attack, etc.)
 */
export function triggerParticleEvent(
  event: ParticleEventType,
  sourceTokenId?: string,
  targetTokenId?: string,
  x?: number,
  y?: number
): void {
  const trigger: ParticleTrigger = {
    event,
    sourceTokenId,
    targetTokenId,
    x,
    y,
  };
  
  const system = getParticleSystem();
  if (system) {
    system.trigger(trigger);
  }
}
