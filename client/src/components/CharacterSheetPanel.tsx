import { useState, useEffect, CSSProperties } from 'react';
import { Icon } from './Icon';
import { useGameStore } from '../store/gameStore';
import { RollableText } from './RollableText';

// Helper function for spell card visuals (copied from DataManager)
function getSpellCardVisual(): { icon: string; accent: string } {
  return { icon: 'scroll', accent: '#8b5cf6' };
}

function getCharacterFeatureIcon(field: string): string {
  const normalized = String(field || '').trim().toLowerCase();
  if (normalized === 'traits') return 'star';
  if (normalized === 'flaws') return 'face-dizzy';
  if (normalized === 'bonds') return 'link';
  if (normalized === 'ideals') return 'lightbulb';
  return 'file';
}

interface CharacterItem {
  id: string;
  data: any;
  type: string;
  addedAt: string;
}

interface CharacterSheet {
  id: string;
  sessionId: string;
  name: string;
  playerName?: string;
  level: number;
  experience: number;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  armorClass: number;
  initiative: number;
  speed: number;
  maxHp: number;
  currentHp: number;
  tempHp: number;
  hitDice: string;
  hitDiceUsed: number;
  copper: number;
  silver: number;
  gold: number;
  platinum: number;
  proficiencyBonus: number;
  savingThrows: string[];
  skills: string[];
  inventory: CharacterItem[] | string;
  spellcastingAbility?: string;
  spellSaveDc: number;
  spellAttack: number;
  spells?: CharacterItem[]; // Added spells list
  features: any[];
  traits?: string;
  flaws?: string;
  bonds?: string;
  ideals?: string;
  backstory?: string;
  notes?: string;
  race?: string;
  class?: string;
  background?: string;
  alignment?: string;
  imageUrl?: string;
  tokenId?: string;
}

interface CharacterSheetPanelProps {
  character: CharacterSheet | null;
  onUpdate: (id: string, data: Partial<CharacterSheet>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const INVENTORY_ORDER = ['weapon', 'armor', 'potion', 'scroll', 'ring', 'wondrous', 'tool', 'consumable', 'misc'];

export function CharacterSheetPanel({ character, onUpdate, onDelete, onClose }: CharacterSheetPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<CharacterSheet>>({});
  const [activeSection, setActiveSection] = useState<'stats' | 'combat' | 'inventory' | 'spells' | 'features' | 'bio'>('stats');
  const [isDragOver, setIsDragOver] = useState(false);
  
  // Spell browser state
  const [spellSearchQuery, setSpellSearchQuery] = useState('');
  const [spellResults, setSpellResults] = useState<any[]>([]);
  const [searchingSpells, setSearchingSpells] = useState(false);
  const [selectedSpell, setSelectedSpell] = useState<any>(null);
  const [showSpellSearch, setShowSpellSearch] = useState(true);
  
  const { session } = useGameStore();

  useEffect(() => {
    if (character) {
      setEditData(character);
    }
  }, [character]);

  // Refresh character data when switching to spells tab
  useEffect(() => {
    if (activeSection === 'spells' && character) {
      // Force re-render by updating state with current character data
      setEditData({ ...character });
    }
  }, [activeSection, character]);

  if (!character) return null;

  const getInventory = (): CharacterItem[] => {
    if (Array.isArray(character.inventory)) return character.inventory;
    if (typeof character.inventory === 'string') {
      try {
        return JSON.parse(character.inventory);
      } catch {
        return [];
      }
    }
    return [];
  };

  const groupedInventory = getInventory().reduce((acc, item) => {
    const type = item.type || 'misc';
    if (!acc[type]) acc[type] = [];
    acc[type].push(item);
    return acc;
  }, {} as Record<string, CharacterItem[]>);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      
      // This would be handled by the parent component or store
      // For now, emit a custom event that the DataManager can listen to
      const event = new CustomEvent('addItemToCharacter', {
        detail: { characterId: character.id, itemData: data }
      });
      window.dispatchEvent(event);
    } catch (err) {
      console.error('Failed to parse dropped item:', err);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleSave = () => {
    onUpdate(character.id, editData);
    setIsEditing(false);
  };

  const handleChange = (field: keyof CharacterSheet, value: any) => {
    setEditData({ ...editData, [field]: value });
  };

  const mod = (stat: number) => Math.floor((stat - 10) / 2);
  const modStr = (stat: number) => (mod(stat) >= 0 ? `+${mod(stat)}` : `${mod(stat)}`);

  const renderAbilityScores = () => (
    <div className="ability-scores" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
      {['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].map((ability) => {
        const key = ability as keyof typeof editData;
        const value = editData[key] as number || 10;
        return (
          <div key={ability} style={{ textAlign: 'center', background: '#2a2a2a', padding: '8px', borderRadius: '4px' }}>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#888', marginBottom: '4px' }}>
              {ability.slice(0, 3)}
            </div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff' }}>{value}</div>
            <div style={{ fontSize: '14px', color: '#6b8aff' }}>{modStr(value)}</div>
            {isEditing && (
              <input
                type="number"
                value={value}
                onChange={(e) => handleChange(key, parseInt(e.target.value) || 10)}
                min={1}
                max={30}
                style={{ width: '50px', marginTop: '4px', textAlign: 'center' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  const renderCombat = () => (
    <div className="combat-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
      <div style={{ background: '#2a2a2a', padding: '12px', borderRadius: '4px', textAlign: 'center' }}>
        <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>ARMOR CLASS</div>
        <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
          {isEditing ? (
            <input
              type="number"
              value={editData.armorClass || 10}
              onChange={(e) => handleChange('armorClass', parseInt(e.target.value))}
              style={{ width: '60px', textAlign: 'center', fontSize: '20px' }}
            />
          ) : (
            character.armorClass
          )}
        </div>
      </div>
      <div style={{ background: '#2a2a2a', padding: '12px', borderRadius: '4px', textAlign: 'center' }}>
        <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>INITIATIVE</div>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#6b8aff' }}>
          {modStr(character.dexterity)}
        </div>
      </div>
      <div style={{ background: '#2a2a2a', padding: '12px', borderRadius: '4px', textAlign: 'center' }}>
        <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>SPEED</div>
        <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
          {isEditing ? (
            <input
              type="number"
              value={editData.speed || 30}
              onChange={(e) => handleChange('speed', parseInt(e.target.value))}
              style={{ width: '60px', textAlign: 'center', fontSize: '20px' }}
            />
          ) : (
            `${character.speed} ft`
          )}
        </div>
      </div>
      <div style={{ background: '#2a2a2a', padding: '12px', borderRadius: '4px', textAlign: 'center', gridColumn: 'span 3' }}>
        <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>HIT POINTS</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <input
            type="number"
            value={isEditing ? (editData.currentHp || 0) : character.currentHp}
            onChange={(e) => handleChange('currentHp', parseInt(e.target.value))}
            disabled={!isEditing}
            style={{ width: '60px', textAlign: 'center', fontSize: '20px', background: isEditing ? '#333' : 'transparent', border: isEditing ? '1px solid #444' : 'none' }}
          />
          <span style={{ fontSize: '20px' }}>/</span>
          <input
            type="number"
            value={isEditing ? (editData.maxHp || 1) : character.maxHp}
            onChange={(e) => handleChange('maxHp', parseInt(e.target.value))}
            disabled={!isEditing}
            style={{ width: '60px', textAlign: 'center', fontSize: '20px', background: isEditing ? '#333' : 'transparent', border: isEditing ? '1px solid #444' : 'none' }}
          />
          <span style={{ color: '#888', marginLeft: '8px' }}>Temp:</span>
          <input
            type="number"
            value={isEditing ? (editData.tempHp || 0) : character.tempHp}
            onChange={(e) => handleChange('tempHp', parseInt(e.target.value))}
            disabled={!isEditing}
            style={{ width: '50px', textAlign: 'center', background: isEditing ? '#333' : 'transparent', border: isEditing ? '1px solid #444' : 'none' }}
          />
        </div>
      </div>
    </div>
  );

  const renderInventory = () => {
    const inventory = getInventory();
    
    return (
      <div 
        className={`inventory-section ${isDragOver ? 'drag-over' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        style={{
          minHeight: '200px',
          padding: '12px',
          border: isDragOver ? '2px dashed #6b8aff' : '2px dashed transparent',
          borderRadius: '4px',
          transition: 'border-color 0.2s',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, color: '#fff' }}>Inventory</h3>
          <div style={{ fontSize: '12px', color: '#666' }}>
            Drag items from Compendium to add
          </div>
        </div>

        {/* Currency */}
        <div className="currency" style={{ display: 'flex', gap: '8px', marginBottom: '16px', padding: '8px', background: '#222', borderRadius: '4px' }}>
          {[
            { label: 'CP', field: 'copper', color: '#b87333' },
            { label: 'SP', field: 'silver', color: '#c0c0c0' },
            { label: 'GP', field: 'gold', color: '#ffd700' },
            { label: 'PP', field: 'platinum', color: '#e5e4e2' },
          ].map(({ label, field, color }) => (
            <div key={field} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ color, fontWeight: 'bold' }}>{label}:</span>
              {isEditing ? (
                <input
                  type="number"
                  value={(editData as any)[field] || 0}
                  onChange={(e) => handleChange(field as any, parseInt(e.target.value) || 0)}
                  style={{ width: '50px', background: '#333', border: '1px solid #444', color: '#fff' }}
                />
              ) : (
                <span>{(character as any)[field]}</span>
              )}
            </div>
          ))}
        </div>

        {inventory.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
            <Icon name="box-open" size="2x" />
            <p>No items yet. Drag items from the Compendium to add them.</p>
          </div>
        ) : (
          INVENTORY_ORDER.map((type) => {
            const items = groupedInventory[type];
            if (!items || items.length === 0) return null;
            
            return (
              <div key={type} className="inventory-category" style={{ marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 8px 0', color: '#6b8aff', textTransform: 'capitalize' }}>
                  {type} ({items.length})
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="inventory-item"
                      style={{
                        background: '#2a2a2a',
                        padding: '8px',
                        borderRadius: '4px',
                        borderLeft: `3px solid ${getItemColor(item.type)}`,
                      }}
                    >
                      <div style={{ fontWeight: 500 }}>{item.data?.name || item.data?.properties?.name || 'Unknown Item'}</div>
                      {item.data?.properties?.description && (
                        <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                          {item.data.properties.description.substring(0, 50)}...
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  };

  const renderSpells = () => {
    const getCharacterSpells = (): CharacterItem[] => {
      const spells = character.spells;
      if (Array.isArray(spells)) return spells;
      if (typeof spells === 'string') {
        try {
          return JSON.parse(spells);
        } catch {
          return [];
        }
      }
      return [];
    };

    const addSpellToList = (spell: any) => {
      const currentSpells = getCharacterSpells();
      // Check if spell already exists
      if (currentSpells.some(s => s.data?.id === spell.id)) {
        alert('This spell is already in your spell list!');
        return;
      }
      const newSpell: CharacterItem = {
        id: `spell-${Date.now()}`,
        data: spell,
        type: 'spell',
        addedAt: new Date().toISOString(),
      };
      const updatedSpells = [...currentSpells, newSpell];
      onUpdate(character.id, { spells: updatedSpells } as Partial<CharacterSheet>);
    };

    const removeSpellFromList = (spellId: string) => {
      const currentSpells = getCharacterSpells();
      const updatedSpells = currentSpells.filter(s => s.id !== spellId);
      onUpdate(character.id, { spells: updatedSpells } as Partial<CharacterSheet>);
    };

    const searchSpells = async () => {
      if (!session) return;
      setSearchingSpells(true);
      try {
        const params = new URLSearchParams();
        if (spellSearchQuery) params.append('q', spellSearchQuery);
        params.append('limit', '50');
        
        const res = await fetch(`/api/data/compendium/spell?${params}`);
        const data = await res.json();
        setSpellResults(data.data || []);
      } catch (error) {
        console.error('Failed to search spells:', error);
      } finally {
        setSearchingSpells(false);
      }
    };

    const handleSearch = (e: React.FormEvent) => {
      e.preventDefault();
      searchSpells();
    };

    const getSpellLevel = (level: number) => {
      if (level === 0) return 'Cantrip';
      if (level === 1) return '1st';
      if (level === 2) return '2nd';
      if (level === 3) return '3rd';
      return `${level}th`;
    };

    const getSpellSchool = (school: string) => {
      const schools: Record<string, string> = {
        a: 'Abjuration', c: 'Conjuration', d: 'Divination', e: 'Enchantment',
        v: 'Evocation', i: 'Illusion', n: 'Necromancy', t: 'Transmutation',
      };
      return schools[school?.toLowerCase()] || school || 'Unknown';
    };

    return (
      <div className="spell-section">
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
          <div style={{ flex: 1, background: '#2a2a2a', padding: '12px', borderRadius: '4px' }}>
            <div style={{ fontSize: '10px', color: '#888' }}>SPELL ATTACK</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#6b8aff' }}>
              +{character.spellAttack || 0}
            </div>
          </div>
          <div style={{ flex: 1, background: '#2a2a2a', padding: '12px', borderRadius: '4px' }}>
            <div style={{ fontSize: '10px', color: '#888' }}>SPELL SAVE DC</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
              {character.spellSaveDc || 10}
            </div>
          </div>
        </div>

        {/* Spell Search - Toggleable */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h4 style={{ margin: 0, color: '#6b8aff' }}>Search Spells</h4>
            <button
              onClick={() => setShowSpellSearch(!showSpellSearch)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Icon name={showSpellSearch ? 'chevron-up' : 'chevron-down'} />
              {showSpellSearch ? 'Hide Search' : 'Show Search'}
            </button>
          </div>
          {showSpellSearch && (
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={spellSearchQuery}
                onChange={(e) => setSpellSearchQuery(e.target.value)}
                placeholder="Search spells by name..."
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: '#333',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  color: '#fff',
                  fontSize: '13px',
                }}
              />
              <button
                type="submit"
                disabled={searchingSpells}
                style={{
                  padding: '8px 16px',
                  background: '#4a6fa5',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                {searchingSpells ? 'Searching...' : <Icon name="search" />}
              </button>
            </form>
          )}
        </div>

        {/* Spell Results - Only show when search is visible */}
        {showSpellSearch && spellResults.length > 0 ? (
          <div style={{ marginBottom: '16px' }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#888', fontSize: '12px' }}>
              Search Results ({spellResults.length})
            </h4>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', 
              gap: '12px',
              maxHeight: '300px',
              overflowY: 'auto',
            }}>
              {spellResults.map((spell: any) => {
                const visual = getSpellCardVisual();
                const cardStyle = {
                  cursor: 'pointer',
                  '--card-accent': visual.accent,
                } as CSSProperties;
                const isSelected = selectedSpell?.id === spell.id;
                
                return (
                  <div
                    key={spell.id}
                    className={`item-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedSpell(isSelected ? null : spell)}
                    style={cardStyle}
                  >
                    <div className="card-art">
                      <div className="card-type-bg">{getSpellLevel(spell.level)}</div>
                      <Icon name={visual.icon} className="card-art-icon" />
                    </div>
                    <div className="card-header">
                      <span className="card-type">
                        <Icon name={visual.icon} />
                        {getSpellLevel(spell.level)}
                      </span>
                    </div>
                    <div className="card-name">{spell.name}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : showSpellSearch && spellSearchQuery && !searchingSpells ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
            No spells found for "{spellSearchQuery}"
          </div>
        ) : null}

        {/* Selected Spell Details */}
        {selectedSpell && (
          <div style={{ 
            background: '#2a2a2a', 
            padding: '16px', 
            borderRadius: '4px',
            marginTop: '16px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, color: '#fff' }}>{selectedSpell.name}</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={() => addSpellToList(selectedSpell)}
                  style={{ 
                    background: '#4a9055', 
                    border: 'none', 
                    padding: '6px 12px', 
                    borderRadius: '4px', 
                    color: '#fff', 
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Icon name="plus" /> Add to List
                </button>
                <button 
                  onClick={() => setSelectedSpell(null)}
                  style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer' }}
                >
                  <Icon name="times" />
                </button>
              </div>
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>
              <span style={{ color: '#8b5cf6' }}>{getSpellLevel(selectedSpell.level)}</span> • 
              {getSpellSchool(selectedSpell.school)}
              {selectedSpell.school && selectedSpell.subschool && ` (${selectedSpell.subschool})`}
            </div>
            
            {selectedSpell.time && (
              <div style={{ marginBottom: '8px' }}>
                <span style={{ color: '#666', fontSize: '11px' }}>Casting Time: </span>
                <span style={{ color: '#ccc', fontSize: '12px' }}>
                  {Array.isArray(selectedSpell.time) 
                    ? selectedSpell.time.map((t: any) => `${t.number} ${t.unit}`).join(', ')
                    : selectedSpell.time}
                </span>
              </div>
            )}
            
            {selectedSpell.range && (
              <div style={{ marginBottom: '8px' }}>
                <span style={{ color: '#666', fontSize: '11px' }}>Range: </span>
                <span style={{ color: '#ccc', fontSize: '12px' }}>
                  {typeof selectedSpell.range === 'object' 
                    ? `${selectedSpell.range.distance?.amount || ''} ${selectedSpell.range.distance?.type || ''}`.trim()
                    : selectedSpell.range}
                </span>
              </div>
            )}
            
            {selectedSpell.components && (
              <div style={{ marginBottom: '8px' }}>
                <span style={{ color: '#666', fontSize: '11px' }}>Components: </span>
                <span style={{ color: '#ccc', fontSize: '12px' }}>
                  {Array.isArray(selectedSpell.components) 
                    ? selectedSpell.components.join(', ')
                    : selectedSpell.components}
                  {selectedSpell.material && ` (${selectedSpell.material})`}
                </span>
              </div>
            )}
            
            {selectedSpell.duration && (
              <div style={{ marginBottom: '8px' }}>
                <span style={{ color: '#666', fontSize: '11px' }}>Duration: </span>
                <span style={{ color: '#ccc', fontSize: '12px' }}>
                  {Array.isArray(selectedSpell.duration) 
                    ? selectedSpell.duration.map((d: any) => d.type === 'instantaneous' ? d.type : `${d.duration?.amount} ${d.duration?.type}`).join(', ')
                    : selectedSpell.duration}
                </span>
              </div>
            )}
            
            {selectedSpell.description && (
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #444' }}>
                <div style={{ color: '#ccc', fontSize: '13px', lineHeight: '1.5' }}>
                  <RollableText
                    text={Array.isArray(selectedSpell.description)
                      ? selectedSpell.description.map((d: any) =>
                          typeof d === 'string' ? d : d.entry || d.name + ': ' + d.entries?.join(' ')
                        ).join(' ')
                      : String(selectedSpell.description)}
                  />
                </div>
              </div>
            )}
            
            {selectedSpell.higherLevel && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ color: '#6b8aff', fontSize: '11px', fontWeight: 600 }}>AT HIGHER LEVELS</div>
                <div style={{ color: '#ccc', fontSize: '12px', marginTop: '4px' }}>
                  <RollableText
                    text={Array.isArray(selectedSpell.higherLevel)
                      ? selectedSpell.higherLevel.map((h: any) => typeof h === 'string' ? h : h.entry).join(' ')
                      : String(selectedSpell.higherLevel)}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {!showSpellSearch && getCharacterSpells().length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
            <Icon name="magic" size="2x" />
            <p>Click "Show Search" to find and add spells</p>
          </div>
        )}

        {showSpellSearch && !selectedSpell && spellResults.length === 0 && !spellSearchQuery && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
            <Icon name="magic" size="2x" />
            <p>Search for spells to browse your spellbook</p>
          </div>
        )}

        {/* Character's Spell List - Always visible */}
        <div style={{ marginTop: '24px' }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#6b8aff' }}>
            My Spell List ({getCharacterSpells().length})
          </h4>
          {getCharacterSpells().length > 0 ? (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', 
              gap: '12px',
            }}>
              {getCharacterSpells().map((spellItem: CharacterItem) => (
                <div
                  key={spellItem.id}
                  className="item-card"
                  style={{
                    '--card-accent': '#8b5cf6',
                  } as CSSProperties}
                  onClick={() => setSelectedSpell(spellItem.data)}
                >
                  <div className="card-art">
                    <div className="card-type-bg">{getSpellLevel(spellItem.data?.level)}</div>
                    <Icon name="scroll" className="card-art-icon" />
                  </div>
                  <div className="card-header">
                    <span className="card-type">
                      <Icon name="scroll" />
                      {getSpellLevel(spellItem.data?.level)}
                    </span>
                    <button
                      className="card-action-btn card-action-btn-danger"
                      onClick={(e) => { e.stopPropagation(); removeSpellFromList(spellItem.id); }}
                      title="Remove from spell list"
                    >
                      <Icon name="trash" />
                    </button>
                  </div>
                  <div className="card-name">{spellItem.data?.name}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px', color: '#666', background: '#222', borderRadius: '4px' }}>
              <p>No spells in your list yet. Use the search above to find and add spells.</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderFeatures = () => (
    <div className="features-section">
      {[
        { label: 'Traits', field: 'traits' },
        { label: 'Flaws', field: 'flaws' },
        { label: 'Bonds', field: 'bonds' },
        { label: 'Ideals', field: 'ideals' },
      ].map(({ label, field }) => (
        <div key={field} style={{ marginBottom: '12px' }}>
          <h4 style={{ margin: '0 0 4px 0', color: '#888', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Icon name={getCharacterFeatureIcon(field)} />
            {label}
          </h4>
          {isEditing ? (
            <textarea
              value={(editData as any)[field] || ''}
              onChange={(e) => handleChange(field as any, e.target.value)}
              rows={3}
              style={{ width: '100%', background: '#333', border: '1px solid #444', color: '#fff', resize: 'vertical' }}
            />
          ) : (
            <p style={{ margin: 0, color: '#ccc' }}>{(character as any)[field] || 'Not set'}</p>
          )}
        </div>
      ))}
    </div>
  );

  const renderBio = () => (
    <div className="bio-section">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
        {[
          { label: 'Race', field: 'race' },
          { label: 'Class', field: 'class' },
          { label: 'Background', field: 'background' },
          { label: 'Alignment', field: 'alignment' },
          { label: 'Age', field: 'age' },
          { label: 'Height', field: 'height' },
          { label: 'Weight', field: 'weight' },
          { label: 'Eyes', field: 'eyes' },
        ].map(({ label, field }) => (
          <div key={field}>
            <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>{label}</div>
            {isEditing ? (
              <input
                type="text"
                value={(editData as any)[field] || ''}
                onChange={(e) => handleChange(field as any, e.target.value)}
                style={{ width: '100%', background: '#333', border: '1px solid #444', color: '#fff' }}
              />
            ) : (
              <div style={{ color: '#ccc' }}>{(character as any)[field] || '-'}</div>
            )}
          </div>
        ))}
      </div>
      <div style={{ marginTop: '12px' }}>
        <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>Backstory</div>
        {isEditing ? (
          <textarea
            value={editData.backstory || ''}
            onChange={(e) => handleChange('backstory', e.target.value)}
            rows={6}
            style={{ width: '100%', background: '#333', border: '1px solid #444', color: '#fff', resize: 'vertical' }}
          />
        ) : (
          <p style={{ margin: 0, color: '#ccc', whiteSpace: 'pre-wrap' }}>{character.backstory || 'No backstory yet.'}</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="character-sheet-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#1a1a1a' }}>
      {/* Header */}
      <div className="sheet-header" style={{ padding: '12px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {isEditing ? (
            <input
              type="text"
              value={editData.name || ''}
              onChange={(e) => handleChange('name', e.target.value)}
              style={{ fontSize: '18px', fontWeight: 'bold', background: '#333', border: '1px solid #444', color: '#fff' }}
            />
          ) : (
            <h2 style={{ margin: 0, color: '#fff' }}>{character.name}</h2>
          )}
          <div style={{ fontSize: '12px', color: '#888' }}>
            Level {character.level} {character.class} {character.race}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isEditing ? (
            <>
              <button onClick={handleSave} style={{ background: '#4a9055', border: 'none', padding: '6px 12px', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}>
                <Icon name="save" /> Save
              </button>
              <button onClick={() => setIsEditing(false)} style={{ background: '#666', border: 'none', padding: '6px 12px', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}>
                Cancel
              </button>
            </>
          ) : (
            <button onClick={() => setIsEditing(true)} style={{ background: '#4a6fa5', border: 'none', padding: '6px 12px', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}>
              <Icon name="edit" /> Edit
            </button>
          )}
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #444', padding: '6px', borderRadius: '4px', color: '#888', cursor: 'pointer' }}>
            <Icon name="times" />
          </button>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="section-tabs" style={{ display: 'flex', borderBottom: '1px solid #333' }}>
        {[
          { id: 'stats', label: 'Stats', icon: 'user' },
          { id: 'combat', label: 'Combat', icon: 'shield-alt' },
          { id: 'inventory', label: 'Inventory', icon: 'box-open' },
          { id: 'spells', label: 'Spells', icon: 'magic' },
          { id: 'features', label: 'Features', icon: 'star' },
          { id: 'bio', label: 'Bio', icon: 'book' },
        ].map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setActiveSection(id as any)}
            style={{
              flex: 1,
              padding: '10px',
              background: activeSection === id ? '#2a2a2a' : 'transparent',
              border: 'none',
              color: activeSection === id ? '#fff' : '#888',
              borderBottom: activeSection === id ? '2px solid #6b8aff' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <Icon name={icon} /> {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="sheet-content" style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        {activeSection === 'stats' && renderAbilityScores()}
        {activeSection === 'combat' && renderCombat()}
        {activeSection === 'inventory' && renderInventory()}
        {activeSection === 'spells' && renderSpells()}
        {activeSection === 'features' && renderFeatures()}
        {activeSection === 'bio' && renderBio()}
      </div>
    </div>
  );
}

function getItemColor(type: string): string {
  const colors: Record<string, string> = {
    weapon: '#ff6b6b',
    armor: '#4ecdc4',
    potion: '#45b7d1',
    scroll: '#96ceb4',
    ring: '#ffd93d',
    wondrous: '#c9b1ff',
    tool: '#ff9f43',
    consumable: '#a8e6cf',
    misc: '#888',
  };
  return colors[type] || colors.misc;
}
