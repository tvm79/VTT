import type { Combatant } from '../types/Combatant';
import { Icon } from './Icon';

interface CombatantCardProps {
  combatant: Combatant;
  isActive: boolean;
  isSelected: boolean;
  isDragTarget: boolean;
  onSelect: (combatantId: string) => void;
  onRemove: (combatantId: string) => void;
  onRollInitiative: (combatantId: string) => void;
  onDragStart: (combatantId: string) => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
}

export function CombatantCard({
  combatant,
  isActive,
  isSelected,
  isDragTarget,
  onSelect,
  onRemove,
  onRollInitiative,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: CombatantCardProps) {
  const isDead = combatant.hp_current <= 0;

  return (
    <article
      className={[
        'combat-card',
        isActive ? 'active' : '',
        isSelected ? 'selected' : '',
        isDead ? 'dead' : '',
        isDragTarget ? 'drag-target' : '',
      ].join(' ').trim()}
      draggable
      onDragStart={() => onDragStart(combatant.id)}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOver();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      onClick={() => onSelect(combatant.id)}
    >
      <div className="combat-card-portrait">
        {combatant.portrait ? (
          <img src={combatant.portrait} alt={combatant.name} />
        ) : (
          <Icon name="user" />
        )}
      </div>

      <div className="combat-card-body">
        <div className="combat-card-name-row">
          <strong>{combatant.name}</strong>
          <span>Lv {combatant.level}</span>
        </div>
        <div className="combat-card-stats">
          <span>HP {combatant.hp_current}/{combatant.hp_max}</span>
          <span>AC {combatant.ac}</span>
        </div>
      </div>

      <div className="combat-card-actions">
        <button
          type="button"
          className="combat-card-roll"
          onClick={(event) => {
            event.stopPropagation();
            onRollInitiative(combatant.id);
          }}
          title="Roll initiative"
        >
          <Icon name="dice-d20" /> {combatant.initiative}
        </button>
        <button
          type="button"
          className="combat-card-remove"
          onClick={(event) => {
            event.stopPropagation();
            onRemove(combatant.id);
          }}
          title="Remove combatant"
        >
          <Icon name="times" />
        </button>
      </div>
    </article>
  );
}
