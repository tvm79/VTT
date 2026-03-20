import type { Combatant } from '../types/Combatant';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export function setHP(combatant: Combatant, value: number): Combatant {
  return {
    ...combatant,
    hp_current: clamp(value, 0, combatant.hp_max),
  };
}

export function damage(combatant: Combatant, amount: number): Combatant {
  return setHP(combatant, combatant.hp_current - Math.max(0, amount));
}

export function heal(combatant: Combatant, amount: number): Combatant {
  return setHP(combatant, combatant.hp_current + Math.max(0, amount));
}
