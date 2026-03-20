import type { DiceRollDieResult } from '../../../shared/src/index';

export interface Dice3DClientRollResult {
  dice: DiceRollDieResult[];
  total: number;
}

type Dice3DRoller = (input: { formula: string; requestId: string }) => Promise<Dice3DClientRollResult | null>;

let activeRoller: Dice3DRoller | null = null;

export function registerDice3DRoller(roller: Dice3DRoller | null): void {
  activeRoller = roller;
}

export function getDice3DRoller(): Dice3DRoller | null {
  return activeRoller;
}
