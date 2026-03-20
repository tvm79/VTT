import { useState, useRef, useEffect, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { Icon } from './Icon';

export function CombatTrackerLegacy() {
  const {
    isInCombat,
    setIsInCombat,
    combatants,
    removeCombatant,
    setCombatantRoll,
    clearCombatants,
    combatTrackerPosition,
    setCombatTrackerPosition,
    combatTrackerSize,
    setCombatTrackerSize,
    combatTrackerVisible,
    setCombatTrackerVisible,
    tokens,
    isGM,
    setCombatantOrder,
    panelFocus,
    setPanelFocus,
    combatRound,
    currentTurnIndex,
  } = useGameStore();

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [draggedCombatantId, setDraggedCombatantId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const getTokenName = (tokenId: string): string => {
    const token = tokens.find((t) => t.id === tokenId);
    return token?.label || token?.name || 'Unknown';
  };

  const sortedCombatants = useMemo(() => {
    return [...combatants].sort((a, b) => b.initiative - a.initiative);
  }, [combatants]);

  const handleDragStart = (e: React.MouseEvent) => {
    if (!isGM) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - combatTrackerPosition.x,
      y: e.clientY - combatTrackerPosition.y,
    });
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setCombatTrackerPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, setCombatTrackerPosition]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(200, e.clientX - combatTrackerPosition.x);
      const newHeight = Math.max(150, e.clientY - combatTrackerPosition.y);
      setCombatTrackerSize({
        width: newWidth,
        height: newHeight,
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, combatTrackerPosition, setCombatTrackerSize]);

  const rollD20 = (tokenId: string) => {
    const roll = Math.floor(Math.random() * 20) + 1;
    setCombatantRoll(tokenId, roll);
  };

  const toggleCombat = () => {
    setIsInCombat(!isInCombat);
  };

  const handleClearCombat = () => {
    clearCombatants();
  };

  const handleReorderStart = (e: React.MouseEvent, tokenId: string) => {
    e.stopPropagation();
    setDraggedCombatantId(tokenId);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (!draggedCombatantId) return;

    const currentIndex = sortedCombatants.findIndex((c) => c.tokenId === draggedCombatantId);
    if (currentIndex === -1 || currentIndex === targetIndex) {
      setDraggedCombatantId(null);
      setDragOverIndex(null);
      return;
    }

    setCombatantOrder(draggedCombatantId, targetIndex);
    setDraggedCombatantId(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedCombatantId(null);
    setDragOverIndex(null);
  };

  if (!isGM) return null;

  return (
    <div
      ref={containerRef}
      className="combat-tracker"
      onClick={() => setPanelFocus('combatTracker')}
      style={{
        position: 'absolute',
        left: combatTrackerPosition.x,
        top: combatTrackerPosition.y,
        width: combatTrackerSize.width,
        minWidth: '212px',
        height: combatTrackerSize.height,
        zIndex: panelFocus === 'combatTracker' ? 5000 : 100,
        display: combatTrackerVisible ? 'flex' : 'none',
      }}
    >
      <div className="combat-tracker-header" onMouseDown={handleDragStart} style={{ cursor: isGM ? 'move' : 'default' }}>
        <div className="combat-tracker-title">
          <Icon name="skull" />
          <span>Combat Tracker</span>
        </div>
        <div className="combat-tracker-header-actions">
          {isInCombat && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#ffd700', minWidth: '50px', textAlign: 'center' }}>
                R{combatRound} T{currentTurnIndex + 1}
              </span>
            </div>
          )}
          <button className={`combat-toggle-btn ${isInCombat ? 'active' : ''}`} onClick={toggleCombat} title={isInCombat ? 'End Combat' : 'Start Combat'}>
            {isInCombat ? 'In Combat' : 'Not in Combat'}
          </button>
          <button className="combat-tracker-close" onClick={() => setCombatTrackerVisible(false)} title="Close Combat Tracker">
            <Icon name="times" />
          </button>
        </div>
      </div>

      <div className="combat-tracker-list">
        <div className="combat-tracker-bg-icon">
          <Icon name="dice-d20" />
        </div>
        {sortedCombatants.length === 0 ? (
          <div className="combat-tracker-empty">
            <p>No combatants</p>
            <p className="hint">Right-click tokens to add them to combat</p>
          </div>
        ) : (
          sortedCombatants.map((combatant, index) => (
            <div
              key={combatant.tokenId}
              className="combat-tracker-item"
              draggable
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              style={{
                opacity: draggedCombatantId === combatant.tokenId ? 0.5 : 1,
                borderTop: dragOverIndex === index ? '2px solid var(--accent)' : undefined,
                background: isInCombat && index === currentTurnIndex ? 'rgba(255, 215, 0, 0.15)' : undefined,
                borderLeft: isInCombat && index === currentTurnIndex ? '3px solid #ffd700' : undefined,
              }}
            >
              <button className="reorder-handle" onMouseDown={(e) => handleReorderStart(e, combatant.tokenId)} title="Drag to reorder">
                <Icon name="grip-lines" />
              </button>
              <span className="combatant-name">{getTokenName(combatant.tokenId)}</span>
              <button className="d20-roll-btn" onClick={() => rollD20(combatant.tokenId)} title="Re-roll?">
                <Icon name="dice-d20" className="d20-icon" />
                <span className="d20-value">{combatant.initiative}</span>
              </button>
              <button className="remove-combatant-btn" onClick={() => removeCombatant(combatant.tokenId)} title="Remove from combat">
                <Icon name="times" />
              </button>
            </div>
          ))
        )}
      </div>

      {sortedCombatants.length > 0 && (
        <div className="combat-tracker-footer">
          <button className="clear-combat-btn" onClick={handleClearCombat}>
            Clear All
          </button>
        </div>
      )}

      <div
        className="combat-tracker-resize"
        onMouseDown={(e) => {
          if (!isGM) return;
          e.stopPropagation();
          setIsResizing(true);
        }}
      />
    </div>
  );
}
