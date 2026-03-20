import type { Combatant } from '../types/Combatant';
import { CombatantCard } from './CombatantCard';

interface InitiativeBarProps {
  combatants: Combatant[];
  currentTurnIndex: number;
  selectedCombatantId: string | null;
  dragOverIndex: number | null;
  onSelectCombatant: (combatantId: string) => void;
  onRemoveCombatant: (combatantId: string) => void;
  onRollInitiative: (combatantId: string) => void;
  onDragStart: (combatantId: string) => void;
  onDragEnd: () => void;
  onCardDragOver: (index: number) => void;
  onCardDrop: (index: number) => void;
}

export function InitiativeBar({
  combatants,
  currentTurnIndex,
  selectedCombatantId,
  dragOverIndex,
  onSelectCombatant,
  onRemoveCombatant,
  onRollInitiative,
  onDragStart,
  onDragEnd,
  onCardDragOver,
  onCardDrop,
}: InitiativeBarProps) {
  return (
    <section className="initiative-bar">
      {combatants.map((combatant, index) => (
        <CombatantCard
          key={combatant.id}
          combatant={combatant}
          isActive={index === currentTurnIndex}
          isSelected={selectedCombatantId === combatant.id}
          isDragTarget={dragOverIndex === index}
          onSelect={onSelectCombatant}
          onRemove={onRemoveCombatant}
          onRollInitiative={onRollInitiative}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOver={() => onCardDragOver(index)}
          onDrop={() => onCardDrop(index)}
        />
      ))}
      {combatants.length === 0 && (
        <div className="initiative-empty">
          No combatants. Right-click a token and add it to combat.
        </div>
      )}
    </section>
  );
}
