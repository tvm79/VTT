import type { Combatant } from '../types/Combatant';

interface CombatantDetailsProps {
  combatant: Combatant | null;
  onAdjustHp: (combatantId: string, delta: number) => void;
}

export function CombatantDetails({ combatant, onAdjustHp }: CombatantDetailsProps) {
  if (!combatant) {
    return (
      <section className="combat-details">
        <div className="combat-details-empty">Select a combatant to view details.</div>
      </section>
    );
  }

  return (
    <section className="combat-details">
      <div className="combat-details-header">
        {combatant.portrait ? <img src={combatant.portrait} alt={combatant.name} /> : null}
        <div>
          <strong>{combatant.name}</strong>
          <div>Level {combatant.level}</div>
        </div>
      </div>

      <div className="combat-details-grid">
        <span>HP</span><span>{combatant.hp_current}/{combatant.hp_max}</span>
        <span>AC</span><span>{combatant.ac}</span>
        <span>Movement</span><span>{combatant.movement} ft</span>
        <span>Spell DC</span><span>{combatant.spell_dc}</span>
      </div>

      <div className="combat-hp-buttons">
        <button type="button" onClick={() => onAdjustHp(combatant.id, -5)}>-5 HP</button>
        <button type="button" onClick={() => onAdjustHp(combatant.id, -1)}>-1 HP</button>
        <button type="button" onClick={() => onAdjustHp(combatant.id, 1)}>+1 HP</button>
        <button type="button" onClick={() => onAdjustHp(combatant.id, 5)}>+5 HP</button>
      </div>

      <div className="combat-condition-list">
        {combatant.conditions.length === 0 ? (
          <span>No conditions</span>
        ) : (
          combatant.conditions.map((condition) => (
            <span key={`${combatant.id}-${condition.name}`} className="combat-condition-chip">
              {condition.name} {condition.duration > 0 ? `(${condition.duration})` : ''}
            </span>
          ))
        )}
      </div>
    </section>
  );
}
