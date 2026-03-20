import { useGameStore } from '../store/gameStore';

export const useCombatStore = () =>
  useGameStore((state) => ({
    encounter: {
      combatants: state.combatants,
      currentTurnIndex: state.currentTurnIndex,
      round: state.combatRound,
      started: state.isInCombat,
    },
    selectedCombatantId: state.selectedCombatantId,
    addCombatant: state.addCombatant,
    removeCombatant: state.removeCombatant,
    startCombat: state.startCombat,
    endCombat: state.endCombat,
    nextTurn: state.nextTurn,
    previousTurn: state.previousTurn,
    setCombatantRoll: state.setCombatantRoll,
    setCombatantOrder: state.setCombatantOrder,
    selectCombatant: state.selectCombatant,
    updateCombatantHp: state.updateCombatantHp,
    clearCombatants: state.clearCombatants,
  }));
