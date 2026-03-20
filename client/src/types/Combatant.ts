export interface Condition {
  name: string;
  duration: number;
}

export type CombatantType = 'player' | 'enemy' | 'npc';

export interface Combatant {
  id: string;
  tokenId: string;
  name: string;
  portrait: string | null;
  type: CombatantType;
  level: number;
  initiative: number;
  hp_current: number;
  hp_max: number;
  ac: number;
  movement: number;
  spell_dc: number;
  conditions: Condition[];
}
