import type { Encounter } from '../types/Encounter';

export function startCombat(encounter: Encounter): Encounter {
  return {
    ...encounter,
    started: true,
    round: 1,
    currentTurnIndex: 0,
  };
}

export function nextTurn(encounter: Encounter): Encounter {
  if (encounter.combatants.length === 0) {
    return encounter;
  }

  let turnIndex = encounter.currentTurnIndex + 1;
  let round = encounter.round;

  if (turnIndex >= encounter.combatants.length) {
    turnIndex = 0;
    round += 1;
  }

  return {
    ...encounter,
    currentTurnIndex: turnIndex,
    round,
  };
}

export function previousTurn(encounter: Encounter): Encounter {
  if (encounter.combatants.length === 0) {
    return encounter;
  }

  let turnIndex = encounter.currentTurnIndex - 1;
  let round = encounter.round;

  if (turnIndex < 0) {
    turnIndex = encounter.combatants.length - 1;
    round = Math.max(1, round - 1);
  }

  return {
    ...encounter,
    currentTurnIndex: turnIndex,
    round,
  };
}
