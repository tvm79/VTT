interface CombatControlsProps {
  round: number;
  currentTurnName: string;
  started: boolean;
  canAdvance: boolean;
  onAddCombatants: () => void;
  onStartCombat: () => void;
  onEndCombat: () => void;
  onNextTurn: () => void;
  onPreviousTurn: () => void;
}

export function CombatControls({
  round,
  currentTurnName,
  started,
  canAdvance,
  onAddCombatants,
  onStartCombat,
  onEndCombat,
  onNextTurn,
  onPreviousTurn,
}: CombatControlsProps) {
  return (
    <section className="combat-controls">
      <div className="combat-controls-main">
        <button type="button" onClick={onAddCombatants}>Add Combatant</button>
        {!started ? (
          <button type="button" onClick={onStartCombat}>Start Combat</button>
        ) : (
          <button type="button" onClick={onEndCombat}>End Combat</button>
        )}
        <button type="button" onClick={onPreviousTurn} disabled={!canAdvance}>Previous Turn</button>
        <button type="button" onClick={onNextTurn} disabled={!canAdvance}>Next Turn</button>
      </div>
      <div className="combat-controls-status">
        <span>Round: {round}</span>
        <span>Current: {currentTurnName || '—'}</span>
      </div>
    </section>
  );
}
