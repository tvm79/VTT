import { useState, useEffect, CSSProperties } from 'react';
import { Icon } from './Icon';
import { useGameStore } from '../store/gameStore';
import './CharacterCreatorWizard.css';

// Types
interface CharacterData {
  name: string;
  playerName: string;
  level: number;
  race: any | null;
  class: any | null;
  background: any | null;
  abilities: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  equipment: any[];
}

interface CharacterCreatorWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onCharacterCreated?: (character: any) => void;
}

// Step definitions
type WizardStep = 'name' | 'race' | 'class' | 'background' | 'abilities' | 'equipment' | 'review';

const STEPS: { key: WizardStep; label: string; icon: string }[] = [
  { key: 'name', label: 'Name', icon: 'user' },
  { key: 'race', label: 'Race', icon: 'user-group' },
  { key: 'class', label: 'Class', icon: 'book' },
  { key: 'background', label: 'Background', icon: 'star' },
  { key: 'abilities', label: 'Abilities', icon: 'dumbbell' },
  { key: 'equipment', label: 'Equipment', icon: 'shield' },
  { key: 'review', label: 'Review', icon: 'check' },
];

// Default ability scores (standard array)
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const ABILITY_NAMES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

export function CharacterCreatorWizard({ isOpen, onClose, onCharacterCreated }: CharacterCreatorWizardProps) {
  const { session } = useGameStore();
  
  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>('name');
  const [characterData, setCharacterData] = useState<CharacterData>({
    name: '',
    playerName: '',
    level: 1,
    race: null,
    class: null,
    background: null,
    abilities: {
      str: 10,
      dex: 10,
      con: 10,
      int: 10,
      wis: 10,
      cha: 10,
    },
    equipment: [],
  });
  
  // Data from DataManager
  const [races, setRaces] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [backgrounds, setBackgrounds] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Search/filter state for each step
  const [searchQuery, setSearchQuery] = useState('');
  
  // Current step index
  const currentStepIndex = STEPS.findIndex(s => s.key === currentStep);
  
  // Fetch data from API
  // Note: Races are stored as 'species' type in the database due to data normalization
  const fetchDataByType = async (type: string): Promise<any[]> => {
    // Map 'race' to 'species' for database queries since races are normalized to 'species'
    const dbTypes = type === 'race' ? ['species', 'race'] : [type];
    
    try {
      const allItems: any[] = [];
      // Try both 'species' and 'race' types to handle both normalized and non-normalized imports
      // Use compendium endpoint which has all 5e.tools data
      for (const dbType of dbTypes) {
        const res = await fetch(`/api/data/compendium/${dbType}?limit=200`);
        if (res.ok) {
          const response = await res.json();
          // Handle both array response and { data: [...] } response
          const data = Array.isArray(response) ? response : (response.data || []);
          allItems.push(...data);
        }
      }
      return allItems;
    } catch (error) {
      console.error('Failed to fetch ' + type + ':', error);
      return [];
    }
  };
  
  // Load data when wizard opens
  useEffect(() => {
    if (!isOpen) return;
    
    const loadData = async () => {
      setLoading(true);
      try {
        const [raceData, classData, bgData, itemData] = await Promise.all([
          fetchDataByType('race'),
          fetchDataByType('class'),
          fetchDataByType('background'),
          fetchDataByType('item'),
        ]);
        setRaces(raceData);
        setClasses(classData);
        setBackgrounds(bgData);
        setItems(itemData.filter((item: any) => {
          const type = item.type?.toLowerCase() || '';
          return type.includes('weapon') || type.includes('armor') || type.includes('equipment');
        }));
      } catch (error) {
        console.error('Failed to load character creation data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [isOpen, session]);
  
  // Filter items based on search
  const filterItems = (items: any[]) => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter(item => 
      item.name?.toLowerCase().includes(query) ||
      item.system?.name?.toLowerCase().includes(query)
    );
  };
  
  // Navigation
  const canGoNext = (): boolean => {
    switch (currentStep) {
      case 'name':
        return characterData.name.trim().length > 0;
      case 'race':
        return true; // Optional
      case 'class':
        return true; // Optional
      case 'background':
        return true; // Optional
      case 'abilities':
        return true;
      case 'equipment':
        return true;
      case 'review':
        return true;
      default:
        return false;
    }
  };
  
  const goNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].key);
      setSearchQuery('');
    }
  };
  
  const goBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].key);
      setSearchQuery('');
    }
  };
  
  // Create character
  const createCharacter = async () => {
    if (!session || !characterData.name.trim()) return;
    
    setIsSaving(true);
    try {
      // Calculate derived stats
      const level = characterData.level;
      const profBonus = Math.ceil(level / 4) + 1;
      
      // Build character sheet data matching CharacterSheet interface
      const characterSheet = {
        sessionId: session.id,
        name: characterData.name,
        playerName: characterData.playerName || undefined,
        level: level,
        experience: 0,
        strength: characterData.abilities.str,
        dexterity: characterData.abilities.dex,
        constitution: characterData.abilities.con,
        intelligence: characterData.abilities.int,
        wisdom: characterData.abilities.wis,
        charisma: characterData.abilities.cha,
        armorClass: 10 + Math.floor((characterData.abilities.dex - 10) / 2),
        initiative: Math.floor((characterData.abilities.dex - 10) / 2),
        speed: 30,
        maxHp: characterData.class?.system?.hitDie ? 
          parseInt(characterData.class.system.hitDie.replace('d', '')) + Math.floor((characterData.abilities.con - 10) / 2) : 
          10 + Math.floor((characterData.abilities.con - 10) / 2),
        currentHp: characterData.class?.system?.hitDie ? 
          parseInt(characterData.class.system.hitDie.replace('d', '')) + Math.floor((characterData.abilities.con - 10) / 2) : 
          10 + Math.floor((characterData.abilities.con - 10) / 2),
        tempHp: 0,
        hitDice: characterData.class?.system?.hitDie || 'd8',
        hitDiceUsed: 0,
        copper: 0,
        silver: 0,
        gold: 0,
        platinum: 0,
        proficiencyBonus: profBonus,
        savingThrows: characterData.class?.system?.savingThrows || [],
        skills: [],
        inventory: characterData.equipment,
        spellcastingAbility: characterData.class?.system?.spellcastingAbility || undefined,
        spellSaveDc: characterData.class?.system?.spellcastingAbility ? 
          8 + profBonus + Math.floor((characterData.abilities[characterData.class.system.spellcastingAbility.toLowerCase() as keyof typeof characterData.abilities] - 10) / 2) : 
          0,
        spellAttack: characterData.class?.system?.spellcastingAbility ? 
          profBonus + Math.floor((characterData.abilities[characterData.class.system.spellcastingAbility.toLowerCase() as keyof typeof characterData.abilities] - 10) / 2) : 
          0,
        features: [],
        traits: characterData.race?.system?.traits || undefined,
        flaws: undefined,
        bonds: undefined,
        ideals: characterData.background?.system?.feature || undefined,
        backstory: undefined,
        notes: undefined,
        race: characterData.race?.name || undefined,
        class: characterData.class?.name || undefined,
        background: characterData.background?.name || undefined,
        alignment: undefined,
        imageUrl: characterData.race?.img || characterData.race?.system?.img || undefined,
      };
      
      const res = await fetch(`/api/data/sessions/${session.id}/characters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(characterSheet),
      });
      
      if (res.ok) {
        const newCharacter = await res.json();
        onCharacterCreated?.(newCharacter);
        onClose();
      } else {
        console.error('Failed to create character');
      }
    } catch (error) {
      console.error('Error creating character:', error);
    } finally {
      setIsSaving(false);
    }
  };
  
  // Apply standard array
  const applyStandardArray = () => {
    const sorted = [...STANDARD_ARRAY].sort((a, b) => b - a);
    setCharacterData(prev => ({
      ...prev,
      abilities: {
        str: sorted[0],
        dex: sorted[1],
        con: sorted[2],
        int: sorted[3],
        wis: sorted[4],
        cha: sorted[5],
      },
    }));
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="character-creator-overlay" onClick={onClose}>
      <div className="character-creator-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="character-creator-header">
          <h2>Create New Character</h2>
          <button className="close-btn" onClick={onClose}>
            <Icon name="times" />
          </button>
        </div>
        
        {/* Progress */}
        <div className="character-creator-progress">
          {STEPS.map((step, index) => (
            <div 
              key={step.key}
              className={`progress-step ${index <= currentStepIndex ? 'completed' : ''} ${index === currentStepIndex ? 'active' : ''}`}
              onClick={() => index <= currentStepIndex ? setCurrentStep(step.key) : undefined}
            >
              <div className="progress-icon">
                <Icon name={step.icon} />
              </div>
              <span className="progress-label">{step.label}</span>
              {index < STEPS.length - 1 && <div className="progress-line" />}
            </div>
          ))}
        </div>
        
        {/* Content */}
        <div className="character-creator-content">
          {loading ? (
            <div className="loading-state">
              <Icon name="spinner" />
              <p>Loading character data...</p>
            </div>
          ) : (
            <>
              {/* Name Step */}
              {currentStep === 'name' && (
                <div className="wizard-step">
                  <h3>Character Details</h3>
                  <p className="step-description">Enter your character's basic information.</p>
                  
                  <div className="form-group">
                    <label>Character Name *</label>
                    <input
                      type="text"
                      value={characterData.name}
                      onChange={e => setCharacterData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter character name"
                      autoFocus
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Player Name</label>
                    <input
                      type="text"
                      value={characterData.playerName}
                      onChange={e => setCharacterData(prev => ({ ...prev, playerName: e.target.value }))}
                      placeholder="Enter player name (optional)"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Starting Level</label>
                    <select
                      value={characterData.level}
                      onChange={e => setCharacterData(prev => ({ ...prev, level: parseInt(e.target.value) }))}
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(lvl => (
                        <option key={lvl} value={lvl}>Level {lvl}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              
              {/* Race Step */}
              {currentStep === 'race' && (
                <div className="wizard-step">
                  <h3>Select Race</h3>
                  <p className="step-description">Choose your character's species or race.</p>
                  
                  <div className="search-box">
                    <Icon name="search" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search races..."
                    />
                  </div>
                  
                  <div className="selection-grid">
                    {filterItems(races).map(race => (
                      <div
                        key={race.id}
                        className={`selection-card ${characterData.race?.id === race.id ? 'selected' : ''}`}
                        onClick={() => setCharacterData(prev => ({ ...prev, race }))}
                      >
                        <div className="card-image">
                          {race.img || race.system?.img ? (
                            <img src={race.img || race.system?.img} alt={race.name} />
                          ) : (
                            <Icon name="user-group" />
                          )}
                        </div>
                        <div className="card-info">
                          <h4>{race.name}</h4>
                          {race.system?.size && <span className="card-meta">Size: {race.system.size}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {races.length === 0 && (
                    <div className="empty-state">
                      <p>No races available. Load a module with race data.</p>
                    </div>
                  )}
                </div>
              )}
              
              {/* Class Step */}
              {currentStep === 'class' && (
                <div className="wizard-step">
                  <h3>Select Class</h3>
                  <p className="step-description">Choose your character's class.</p>
                  
                  <div className="search-box">
                    <Icon name="search" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search classes..."
                    />
                  </div>
                  
                  <div className="selection-grid">
                    {filterItems(classes).map(cls => (
                      <div
                        key={cls.id}
                        className={`selection-card ${characterData.class?.id === cls.id ? 'selected' : ''}`}
                        onClick={() => setCharacterData(prev => ({ ...prev, class: cls }))}
                      >
                        <div className="card-image">
                          {cls.img || cls.system?.img ? (
                            <img src={cls.img || cls.system?.img} alt={cls.name} />
                          ) : (
                            <Icon name="book" />
                          )}
                        </div>
                        <div className="card-info">
                          <h4>{cls.name}</h4>
                          {cls.system?.hitDie && <span className="card-meta">Hit Die: {cls.system.hitDie}</span>}
                          {cls.system?.primaryAbility && <span className="card-meta">Primary: {cls.system.primaryAbility}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {classes.length === 0 && (
                    <div className="empty-state">
                      <p>No classes available. Load a module with class data.</p>
                    </div>
                  )}
                </div>
              )}
              
              {/* Background Step */}
              {currentStep === 'background' && (
                <div className="wizard-step">
                  <h3>Select Background</h3>
                  <p className="step-description">Choose your character's background.</p>
                  
                  <div className="search-box">
                    <Icon name="search" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search backgrounds..."
                    />
                  </div>
                  
                  <div className="selection-grid">
                    {filterItems(backgrounds).map(bg => (
                      <div
                        key={bg.id}
                        className={`selection-card ${characterData.background?.id === bg.id ? 'selected' : ''}`}
                        onClick={() => setCharacterData(prev => ({ ...prev, background: bg }))}
                      >
                        <div className="card-image">
                          {bg.img || bg.system?.img ? (
                            <img src={bg.img || bg.system?.img} alt={bg.name} />
                          ) : (
                            <Icon name="star" />
                          )}
                        </div>
                        <div className="card-info">
                          <h4>{bg.name}</h4>
                          {bg.system?.feature && <span className="card-meta">Feature: {typeof bg.system.feature === 'string' ? bg.system.feature : 'Available'}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {backgrounds.length === 0 && (
                    <div className="empty-state">
                      <p>No backgrounds available. Load a module with background data.</p>
                    </div>
                  )}
                </div>
              )}
              
              {/* Abilities Step */}
              {currentStep === 'abilities' && (
                <div className="wizard-step">
                  <h3>Ability Scores</h3>
                  <p className="step-description">Assign ability scores to your character.</p>
                  
                  <div className="ability-assignment">
                    <button className="btn-standard-array" onClick={applyStandardArray}>
                      <Icon name="dice" /> Apply Standard Array
                    </button>
                    
                    <div className="ability-grid">
                      {ABILITY_NAMES.map(ability => (
                        <div key={ability} className="ability-score">
                          <label>{ability.toUpperCase()}</label>
                          <div className="score-input">
                            <button onClick={() => setCharacterData(prev => ({
                              ...prev,
                              abilities: { ...prev.abilities, [ability]: Math.max(1, prev.abilities[ability] - 1) }
                            }))}>-</button>
                            <span>{characterData.abilities[ability]}</span>
                            <button onClick={() => setCharacterData(prev => ({
                              ...prev,
                              abilities: { ...prev.abilities, [ability]: Math.min(30, prev.abilities[ability] + 1) }
                            }))}>+</button>
                          </div>
                          <span className="modifier">{Math.floor((characterData.abilities[ability] - 10) / 2) >= 0 ? '+' : ''}{Math.floor((characterData.abilities[ability] - 10) / 2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Show race/class bonuses if selected */}
                  {(characterData.race?.system?.abilityScores || characterData.class?.system?.primaryAbility) && (
                    <div className="bonus-info">
                      <h4>Suggested Bonuses</h4>
                      {characterData.race?.system?.abilityScores && (
                        <p>Race provides: {characterData.race.system.abilityScores}</p>
                      )}
                      {characterData.class?.system?.primaryAbility && (
                        <p>Primary class ability: {characterData.class.system.primaryAbility}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
              
              {/* Equipment Step */}
              {currentStep === 'equipment' && (
                <div className="wizard-step">
                  <h3>Starting Equipment</h3>
                  <p className="step-description">Select starting equipment from your class and background.</p>
                  
                  {/* Show starting equipment from class */}
                  {characterData.class?.system?.startingEquipment && (
                    <div className="equipment-section">
                      <h4>Class Starting Equipment</h4>
                      <div className="equipment-list">
                        {Array.isArray(characterData.class.system.startingEquipment) 
                          ? characterData.class.system.startingEquipment.map((eq: any, i: number) => (
                            <div key={i} className="equipment-item">
                              <label>
                                <input
                                  type="checkbox"
                                  checked={characterData.equipment.some(e => e.name === (eq.name || eq))}
                                  onChange={e => {
                                    if (e.target.checked) {
                                      setCharacterData(prev => ({
                                        ...prev,
                                        equipment: [...prev.equipment, { id: `class-${i}`, name: eq.name || eq, type: 'equipment' }]
                                      }));
                                    } else {
                                      setCharacterData(prev => ({
                                        ...prev,
                                        equipment: prev.equipment.filter(eq => !String(eq.name).includes(String((eq as any).name || eq)))
                                      }));
                                    }
                                  }}
                                />
                                {eq.name || eq}
                              </label>
                            </div>
                          ))
                          : <p>{characterData.class.system.startingEquipment}</p>
                        }
                      </div>
                    </div>
                  )}
                  
                  {/* Show equipment from background */}
                  {characterData.background?.system?.equipment && (
                    <div className="equipment-section">
                      <h4>Background Equipment</h4>
                      <p>{characterData.background.system.equipment}</p>
                    </div>
                  )}
                  
                  {/* Allow selection from items */}
                  <div className="equipment-section">
                    <h4>Additional Equipment</h4>
                    <div className="search-box">
                      <Icon name="search" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search equipment..."
                      />
                    </div>
                    
                    <div className="equipment-grid">
                      {filterItems(items).slice(0, 20).map(item => (
                        <div key={item.id} className="equipment-card">
                          <label>
                            <input
                              type="checkbox"
                              checked={characterData.equipment.some(e => e.id === item.id)}
                              onChange={e => {
                                if (e.target.checked) {
                                  setCharacterData(prev => ({
                                    ...prev,
                                    equipment: [...prev.equipment, { id: item.id, name: item.name, type: item.type }]
                                  }));
                                } else {
                                  setCharacterData(prev => ({
                                    ...prev,
                                    equipment: prev.equipment.filter(e => e.id !== item.id)
                                  }));
                                }
                              }}
                            />
                            {item.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Review Step */}
              {currentStep === 'review' && (
                <div className="wizard-step">
                  <h3>Review Character</h3>
                  <p className="step-description">Review your character before creating.</p>
                  
                  <div className="character-summary">
                    <div className="summary-section">
                      <h4>Basic Info</h4>
                      <div className="summary-grid">
                        <div className="summary-item">
                          <span className="label">Name</span>
                          <span className="value">{characterData.name}</span>
                        </div>
                        <div className="summary-item">
                          <span className="label">Player</span>
                          <span className="value">{characterData.playerName || '-'}</span>
                        </div>
                        <div className="summary-item">
                          <span className="label">Level</span>
                          <span className="value">{characterData.level}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="summary-section">
                      <h4>Character Options</h4>
                      <div className="summary-grid">
                        <div className="summary-item">
                          <span className="label">Race</span>
                          <span className="value">{characterData.race?.name || 'Not selected'}</span>
                        </div>
                        <div className="summary-item">
                          <span className="label">Class</span>
                          <span className="value">{characterData.class?.name || 'Not selected'}</span>
                        </div>
                        <div className="summary-item">
                          <span className="label">Background</span>
                          <span className="value">{characterData.background?.name || 'Not selected'}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="summary-section">
                      <h4>Ability Scores</h4>
                      <div className="ability-summary">
                        {ABILITY_NAMES.map(ability => (
                          <div key={ability} className="ability-summary-item">
                            <span className="ability-name">{ability.toUpperCase()}</span>
                            <span className="ability-score">{characterData.abilities[ability]}</span>
                            <span className="ability-modifier">
                              ({Math.floor((characterData.abilities[ability] - 10) / 2) >= 0 ? '+' : ''}{Math.floor((characterData.abilities[ability] - 10) / 2)})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {characterData.equipment.length > 0 && (
                      <div className="summary-section">
                        <h4>Equipment</h4>
                        <ul className="equipment-summary">
                          {characterData.equipment.map((eq, i) => (
                            <li key={i}>{eq.name}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        
        {/* Footer */}
        <div className="character-creator-footer">
          <button 
            className="btn-back" 
            onClick={goBack}
            disabled={currentStepIndex === 0}
          >
            <Icon name="chevron-left" /> Back
          </button>
          
          {currentStep === 'review' ? (
            <button 
              className="btn-create"
              onClick={createCharacter}
              disabled={isSaving || !characterData.name.trim()}
            >
              <Icon name={isSaving ? 'spinner' : 'plus'} />
              {isSaving ? 'Creating...' : 'Create Character'}
            </button>
          ) : (
            <button 
              className="btn-next"
              onClick={goNext}
              disabled={!canGoNext()}
            >
              Next <Icon name="chevron-right" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}