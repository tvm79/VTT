import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { socketService } from '../services/socket';
import { Icon } from './Icon';

function parseTokenBars(barsRaw: string): Array<{ name: string; current: number; max: number; color: string }> {
  if (!barsRaw) return [];
  try {
    const parsed = JSON.parse(barsRaw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseConditions(statusRaw: string): Array<{ name: string; duration: number }> {
  if (!statusRaw) return [];
  try {
    const parsed = JSON.parse(statusRaw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
      .map((entry) => ({ name: entry, duration: 0 }));
  } catch {
    return [];
  }
}

export function CombatTracker() {
  const {
    isGM,
    tokens,
    combatants,
    combatTrackerVisible,
    currentTurnIndex,
    combatRound,
    isInCombat,
    setCombatantOrder,
    setCombatantRoll,
    removeCombatant,
    updateCombatantHp,
    nextTurn,
    previousTurn,
    addCombatant,
    autoRollAllInitiative,
  } = useGameStore();

  const [draggedCombatantId, setDraggedCombatantId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [overlayOffset, setOverlayOffset] = useState({ x: 0, y: 0 });
  const [isDraggingOverlay, setIsDraggingOverlay] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Resize state - single source of truth (scale only)
  const [panelScale, setPanelScale] = useState(1);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, scale: 1 });

  // Selected panel drag state
  const [panelOffset, setPanelOffset] = useState({ x: 0, y: 0 });
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const [panelDragStart, setPanelDragStart] = useState({ x: 0, y: 0 });

  const sortedCombatants = useMemo(() => {
    const decorated = combatants.map((combatant, index) => ({ combatant, index }));
    decorated.sort((a, b) => {
      if (b.combatant.initiative !== a.combatant.initiative) {
        return b.combatant.initiative - a.combatant.initiative;
      }
      return a.index - b.index;
    });

    return decorated.map(({ combatant }) => {
      const token = tokens.find((entry) => entry.id === combatant.tokenId);
      if (!token) return combatant;

      const tokenProps = (token.properties || {}) as Record<string, unknown>;
      const bars = parseTokenBars(token.bars);
      const hpBar = bars.find((bar) => bar.name.toLowerCase() === 'hp');
      const hpMax = hpBar?.max && hpBar.max > 0 ? hpBar.max : combatant.hp_max;
      const hpCurrent = hpBar?.current ?? combatant.hp_current;

      return {
        ...combatant,
        name: token.label || token.name || combatant.name,
        portrait: token.imageUrl || combatant.portrait,
        hp_max: hpMax,
        hp_current: Math.max(0, Math.min(hpCurrent, hpMax)),
        ac: typeof tokenProps.ac === 'number' ? tokenProps.ac : combatant.ac,
        movement: typeof tokenProps.movement === 'number' ? tokenProps.movement : combatant.movement,
        spell_dc: typeof tokenProps.spell_dc === 'number' ? tokenProps.spell_dc : combatant.spell_dc,
        level: typeof tokenProps.level === 'number' ? tokenProps.level : combatant.level,
        conditions: parseConditions(token.status),
      };
    });
  }, [combatants, tokens]);

  const selectedCombatant = sortedCombatants.find((combatant) => combatant.id === selectedCardId) || null;

  useEffect(() => {
    if (!isDraggingOverlay) return;

    const onMouseMove = (event: MouseEvent) => {
      setOverlayOffset({
        x: event.clientX - dragStart.x,
        y: event.clientY - dragStart.y,
      });
    };

    const onMouseUp = () => setIsDraggingOverlay(false);

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDraggingOverlay, dragStart]);

  // Handle resizing of the overlay
  useEffect(() => {
    if (!isResizing) return;

    const onMouseMove = (event: MouseEvent) => {
      const deltaX = event.clientX - resizeStart.x;
      const deltaY = event.clientY - resizeStart.y;

      // Scale directly from drag delta (single resize model)
      const scaleX = resizeStart.scale + deltaX / 400;
      const scaleY = resizeStart.scale + deltaY / 300;
      const newScale = Math.max(0.5, Math.min(2, Math.min(scaleX, scaleY)));

      setPanelScale(newScale);
    };

    const onMouseUp = () => setIsResizing(false);

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [isResizing, resizeStart]);

  // Handle dragging of the selected panel
  useEffect(() => {
    if (!isDraggingPanel) return;

    const onMouseMove = (event: MouseEvent) => {
      setPanelOffset({
        x: event.clientX - panelDragStart.x,
        y: event.clientY - panelDragStart.y,
      });
    };

    const onMouseUp = () => setIsDraggingPanel(false);

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDraggingPanel, panelDragStart]);

  const handleDrop = (targetIndex: number) => {
    if (!draggedCombatantId) return;
    const source = sortedCombatants.find((combatant) => combatant.id === draggedCombatantId);
    if (!source) return;

    setCombatantOrder(source.tokenId, targetIndex);
    setDraggedCombatantId(null);
    setDragOverIndex(null);
  };

  const adjustHp = (delta: number) => {
    if (!selectedCombatant) return;

    if (delta < 0) {
      updateCombatantHp(selectedCombatant.id, Math.abs(delta), 'damage');
    } else {
      updateCombatantHp(selectedCombatant.id, delta, 'heal');
    }

    const token = tokens.find((entry) => entry.id === selectedCombatant.tokenId);
    if (!token) return;

    const bars = parseTokenBars(token.bars);
    const hpIndex = bars.findIndex((bar) => bar.name.toLowerCase() === 'hp');

    if (hpIndex >= 0) {
      const hpBar = bars[hpIndex];
      const next = Math.max(0, Math.min(hpBar.max, hpBar.current + delta));
      const updatedBars = [...bars];
      updatedBars[hpIndex] = { ...hpBar, current: next };
      socketService.updateToken(token.id, { bars: JSON.stringify(updatedBars) });
      return;
    }

    const hpMax = selectedCombatant.hp_max > 0 ? selectedCombatant.hp_max : 10;
    const hpCurrent = Math.max(0, Math.min(hpMax, selectedCombatant.hp_current + delta));
    socketService.updateToken(token.id, {
      bars: JSON.stringify([...bars, { name: 'HP', current: hpCurrent, max: hpMax, color: '#e94560' }]),
    });
  };

  const handleAddAllTokens = () => {
    // Get all tokens that are not already in combat
    const existingTokenIds = new Set(combatants.map((c) => c.tokenId));
    tokens.forEach((token) => {
      if (!existingTokenIds.has(token.id)) {
        addCombatant(token.id, token.label || token.name || 'Unknown');
      }
    });
  };

  if (!isGM || !combatTrackerVisible) return null;

  return (
    <>
      <div
        className="combat-cards-overlay"
        style={{
          transform: `translate(-50%, -50%) translate(${overlayOffset.x}px, ${overlayOffset.y + 40}px) scale(${panelScale})`,
          transformOrigin: 'top center',
          cursor: 'move',
        }}
        onMouseDown={(event) => {
          // Only start dragging if not clicking on resize handle
          if ((event.target as HTMLElement).closest('.combat-cards-resize-handle')) return;
          setIsDraggingOverlay(true);
          setDragStart({
            x: event.clientX - overlayOffset.x,
            y: event.clientY - overlayOffset.y,
          });
        }}
      >
        <div className="combat-cards-shell">
          <button type="button" className="combat-cards-nav" onClick={previousTurn} disabled={!isInCombat || sortedCombatants.length === 0}>
            <Icon name="chevron-left" />
          </button>

          <div className="combat-cards-row">
            {sortedCombatants.length === 0 ? (
              <div className="combat-cards-empty">
                <p>No combatants</p>
                <div className="combat-cards-tools combat-cards-tools--empty">
                  <button type="button" className="combat-roll-initiative-square" onClick={autoRollAllInitiative} title="Roll initiative for all combatants">
                    <Icon name="dice-d20" />
                  </button>
                  <button type="button" className="combat-add-all-button" onClick={handleAddAllTokens}>
                    <Icon name="plus" /> Add all tokens
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="combat-cards-tools">
                  <button type="button" className="combat-roll-initiative-square" onClick={autoRollAllInitiative} title="Roll initiative for all combatants">
                    <Icon name="dice-d20" />
                  </button>
                  <button type="button" className="combat-add-all-button" onClick={handleAddAllTokens} title="Add all tokens">
                    <Icon name="plus" />
                  </button>
                </div>
                {sortedCombatants.map((combatant, index) => (
                  <article
                    key={combatant.id}
                    className={[
                      'combat-card',
                      index === currentTurnIndex ? 'active' : '',
                      selectedCardId === combatant.id ? 'selected' : '',
                      combatant.hp_current <= 0 ? 'dead' : '',
                      dragOverIndex === index ? 'drag-target' : '',
                    ].join(' ').trim()}
                    draggable
                    onDragStart={() => setDraggedCombatantId(combatant.id)}
                    onDragEnd={() => {
                      setDraggedCombatantId(null);
                      setDragOverIndex(null);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOverIndex(index);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      handleDrop(index);
                    }}
                    onClick={() => setSelectedCardId(combatant.id)}
                  >
                    <div className="combat-card-portrait">
                      {combatant.portrait ? <img src={combatant.portrait} alt={combatant.name} /> : <Icon name="user" />}
                      <button
                        type="button"
                        className="combat-card-initiative"
                        onClick={(event) => {
                          event.stopPropagation();
                          setCombatantRoll(combatant.tokenId, Math.floor(Math.random() * 20) + 1);
                        }}
                        title={combatant.initiative ? `Initiative: ${combatant.initiative}` : 'Roll initiative'}
                      >
                        <Icon name="dice-d20" />
                        {combatant.initiative && (
                          <span className="combat-card-initiative-value">{combatant.initiative}</span>
                        )}
                      </button>
                    </div>
                    <div className="combat-card-footer">
                      <span className="combat-card-name">{combatant.name}</span>
                      <button
                        type="button"
                        className="combat-card-remove"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeCombatant(combatant.tokenId);
                        }}
                        title="Remove combatant"
                      >
                        <Icon name="times" />
                      </button>
                    </div>
                  </article>
                ))}
              </>
            )}
          </div>

          <button type="button" className="combat-cards-nav" onClick={nextTurn} disabled={!isInCombat || sortedCombatants.length === 0}>
            <Icon name="chevron-right" />
          </button>
        </div>

        <div className="combat-round-pill">Round {combatRound}</div>

        <div
          className="combat-cards-resize-handle"
          title="Resize"
          onMouseDown={(event) => {
            event.stopPropagation();
            setIsResizing(true);
            setResizeStart({ x: event.clientX, y: event.clientY, scale: panelScale });
          }}
        />
      </div>

      {selectedCardId && selectedCombatant && (
  <section
    className="combat-selected-panel"
    style={{
      transform: `translate(${panelOffset.x}px, ${panelOffset.y}px)`,
    }}
    onMouseDown={(event) => {
      const target = event.target as HTMLElement;
      if (target.closest('button, input, select, textarea, a')) return;
      setIsDraggingPanel(true);
      setPanelDragStart({
        x: event.clientX - panelOffset.x,
        y: event.clientY - panelOffset.y,
      });
    }}
  >
    <button
      type="button"
      className="combat-selected-panel-close"
      onClick={() => setSelectedCardId(null)}
    >
      <Icon name="times" />
    </button>

    <div className="combat-header">
      <h3>{selectedCombatant.name}</h3>
      <div className="combat-level">Level {selectedCombatant.level}</div>
    </div>

    <div className="combat-stats">

      <div className="combat-stat combat-stat-hp">
        <span className="combat-stat-label">
          <Icon name="heart" /> HP
        </span>
        <div className="combat-stat-value hp-value">
          {selectedCombatant.hp_current}/{selectedCombatant.hp_max}
        </div>
      </div>

      <div className="combat-stat">
        <span className="combat-stat-label">
          <Icon name="shield" /> AC
        </span>
        <div className="combat-stat-value">
          {selectedCombatant.ac}
        </div>
      </div>

      <div className="combat-stat">
        <span className="combat-stat-label">
          <Icon name="ruler" /> Speed
        </span>
        <div className="combat-stat-value">
          {selectedCombatant.movement} ft
        </div>
      </div>

      <div className="combat-stat">
        <span className="combat-stat-label">
          <Icon name="wand-magic-sparkles" /> Spell DC
        </span>
        <div className="combat-stat-value">
          {selectedCombatant.spell_dc}
        </div>
      </div>

    </div>

    <div className="section-divider"></div>

    <div className="combat-hp-controls">
      <button type="button" onClick={() => adjustHp(-5)}>-5</button>
      <button type="button" onClick={() => adjustHp(-1)}>-1</button>
      <button type="button" onClick={() => adjustHp(1)}>+1</button>
      <button type="button" onClick={() => adjustHp(5)}>+5</button>
    </div>

    <div className="section-divider"></div>


   <div className="combat-conditions">

      <div className="combat-condition-header">Conditions</div>

      {selectedCombatant.conditions.length === 0 ? (
        <span className="combat-no-conditions">No conditions</span>
      ) : (
        selectedCombatant.conditions.map((condition) => (
          <span
            key={`${selectedCombatant.id}-${condition.name}`}
            className="condition-tag"
          >
            {condition.name}
          </span>
        ))
      )}

    </div>
  </section>
)}
    </>
  );
}
