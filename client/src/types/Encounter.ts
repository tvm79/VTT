import type { Combatant } from './Combatant';

export interface Encounter {
  combatants: Combatant[];
  currentTurnIndex: number;
  round: number;
  started: boolean;
}
