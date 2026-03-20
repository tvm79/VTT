import type { CSSProperties } from 'react';
import { Icon } from './Icon';

interface CharactersProps {
  cardSizeScale: number;
  setCardSizeScale: (value: number) => void;
  createCharacter: () => void;
  characters: any[];
  openCharacterPanel: (character: any) => void;
}

export function Characters({
  cardSizeScale,
  setCardSizeScale,
  createCharacter,
  characters,
  openCharacterPanel,
}: CharactersProps) {
  return (
    <div className="characters-view" style={{ flex: 1, overflow: 'hidden', '--card-size-scale': cardSizeScale } as CSSProperties}>
      <div style={{ padding: '20px' }}>
        <div className="card-size-slider">
          <span className="slider-label">Card Size:</span>
          <input
            type="range"
            min="0.5"
            max="1.5"
            step="0.1"
            value={cardSizeScale}
            onChange={(e) => setCardSizeScale(parseFloat(e.target.value))}
            className="size-slider"
          />
          <span className="slider-value">{Math.round(cardSizeScale * 100)}%</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, color: '#fff' }}>Characters</h3>
          <button
            onClick={createCharacter}
            style={{ background: '#4a6fa5', border: 'none', padding: '8px 16px', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}
          >
            <Icon name="plus" /> New Character
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(calc(200px * var(--card-size-scale, 1)), 1fr))', gap: 'calc(12px * var(--card-size-scale, 1))' }}>
          {characters.map((char) => (
            <div
              key={char.id}
              onClick={() => openCharacterPanel(char)}
              style={{ background: '#2a2a2a', padding: 'calc(16px * var(--card-size-scale, 1))', borderRadius: '4px', cursor: 'pointer', borderLeft: '3px solid #6b8aff' }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#fff', fontSize: 'calc(14px * var(--card-size-scale, 1))' }}>{char.name}</div>
              <div style={{ fontSize: 'calc(12px * var(--card-size-scale, 1))', color: '#888' }}>Level {char.level} {char.class}</div>
              <div style={{ fontSize: 'calc(11px * var(--card-size-scale, 1))', color: '#666', marginTop: '4px' }}>{char.race} - {char.background}</div>
            </div>
          ))}
        </div>
        {characters.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
            <Icon name="user" size="3x" />
            <p>No characters yet. Create one to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
