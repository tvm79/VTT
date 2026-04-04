import { useState, useEffect, CSSProperties } from 'react';
import { Icon } from './Icon';
import { useGameStore } from '../store/gameStore';
import { RollableText } from './RollableText';
import { parseWeapon } from '../../../shared/src/rollParser';

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
  weaponProficiencies?: string[];
  armorProficiencies?: string[];
  toolProficiencies?: string[];
  inventory: CharacterItem[] | Record<string, CharacterItem[]> | string;
  spellcastingAbility?: string;
  spellSaveDc: number;
  spellAttack: number;
  spells?: CharacterItem[];
  features: any[];
  traits?: string;
  flaws?: string;
  bonds?: string;
  ideals?: string;
  backstory?: string;
  notes?: string;
  race?: string;
  class?: string;
  subclass?: string;
  background?: string;
  alignment?: string;
  imageUrl?: string;
  tokenId?: string;
  subclassData?: {
    id: string;
    name: string;
    system?: any;
    img?: string;
  };
  // NEW: Full object fields for detailed display
  raceData?: {
    id: string;
    name: string;
    system?: any;
    img?: string;
  };
  classData?: {
    id: string;
    name: string;
    system?: {
      hitDie?: string;
      primaryAbility?: string;
      savingThrows?: string[];
      spellcastingAbility?: string;
      startingEquipment?: any;
      startingEquipmentDefault?: any[];
      startingEquipmentOptions?: any[];
      [key: string]: any;
    };
    img?: string;
  };
  backgroundData?: {
    id: string;
    name: string;
    system?: {
      skillProficiencies?: string[];
      toolProficiencies?: string[];
      equipment?: string;
      feature?: string;
      [key: string]: any;
    };
    img?: string;
  };
}

interface CharacterSheetPanelProps {
  character: CharacterSheet | null;
  onUpdate: (id: string, data: Partial<CharacterSheet>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const INVENTORY_ORDER = ['weapon', 'armor', 'gear', 'consumable', 'tool', 'other'];

export function CharacterSheetPanel({ character, onUpdate, onDelete, onClose }: CharacterSheetPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<CharacterSheet>>({});
  const [activeSection, setActiveSection] = useState<'stats' | 'combat' | 'inventory' | 'spells' | 'features' | 'bio'>('stats');
  const [isDragOver, setIsDragOver] = useState(false);
  
  console.log('[DEBUG CharacterSheetPanel] character prop:', character ? JSON.stringify(character).substring(0, 500) : 'null');
  console.log('[DEBUG CharacterSheetPanel] character keys:', character ? Object.keys(character) : []);
  console.log('[DEBUG CharacterSheetPanel] character.name:', character?.name);
  console.log('[DEBUG CharacterSheetPanel] character.strength:', character?.strength);
  console.log('[DEBUG CharacterSheetPanel] character.class:', character?.class);
  console.log('[DEBUG CharacterSheetPanel] character.race:', character?.race);
  console.log('[DEBUG CharacterSheetPanel] character.level:', character?.level);
  
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

  const normalizeInventoryGroups = (value: any): Record<string, CharacterItem[]> => {
    const base: Record<string, CharacterItem[]> = {
      weapon: [],
      armor: [],
      gear: [],
      consumable: [],
      tool: [],
      other: [],
    };

    if (Array.isArray(value)) {
      value.forEach((item) => {
        // Handle wizard-format items: { name: 'Longsword', quantity: 1, source: 'equipment' }
        if (item && item.name && !item.data) {
          const wizardItem: CharacterItem = {
            id: item.id || `inv-${item.name}-${Date.now()}`,
            data: { name: item.name, type: item.source || 'gear', quantity: item.quantity || 1 },
            type: item.source === 'weapon' ? 'weapon' : 'gear',
            addedAt: new Date().toISOString(),
          };
          const group = item.source === 'weapon' ? 'weapon' : (item.source === 'armor' ? 'armor' : 'gear');
          if (!base[group]) base[group] = [];
          base[group].push(wizardItem);
          return;
        }
        const group = getInventoryCategory(item);
        if (!base[group]) base[group] = [];
        base[group].push(item);
      });
      return base;
    }

    if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, items]) => {
        if (!Array.isArray(items)) return;
        base[key] = items as CharacterItem[];
      });
      return base;
    }

    return base;
  };

  const getInventoryGroups = (): Record<string, CharacterItem[]> => {
    if (typeof character.inventory === 'string') {
      try {
        return normalizeInventoryGroups(JSON.parse(character.inventory));
      } catch {
        return normalizeInventoryGroups([]);
      }
    }
    return normalizeInventoryGroups(character.inventory);
  };

  const getInventory = (): CharacterItem[] => {
    const groups = getInventoryGroups();
    return Object.values(groups).flat();
  };

  const getInventoryCategory = (item: CharacterItem): string => {
    const source = item?.data || {};
    const system = source?.system || {};
    const rawType = String(source?.type || item?.type || '').toLowerCase();

    if (typeof system?.vttGroup === 'string' && system.vttGroup) return system.vttGroup;
    if (rawType === 'weapon' || rawType === 'wpn' || system?.weapon === true || typeof system?.dmg1 === 'string' || typeof source?.dmg1 === 'string' || system?.weaponStats) return 'weapon';
    if (rawType === 'consumable' || rawType === 'potion' || rawType === 'scroll') return 'consumable';
    if (rawType === 'tool') return 'tool';
    if (rawType === 'armor' || system?.armor || system?.shield) return 'armor';
    if (rawType === 'equipment' || rawType === 'item') return 'gear';
    return 'other';
  };

  const groupedInventory = getInventoryGroups();

  const orderedInventoryTypes = [
    ...INVENTORY_ORDER,
    ...Object.keys(groupedInventory).filter((type) => !INVENTORY_ORDER.includes(type)),
  ];

  const getTemplateInstance = () => {
    const featuresArray = Array.isArray(character.features)
      ? character.features
      : [];
    const templateFeature = featuresArray.find((f: any) => f?.type === 'instanceTemplate');
    return templateFeature?.data || null;
  };

  const templateInstance = getTemplateInstance();

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

  const getDisplayLabel = (entry: any): string => {
    if (entry == null) return '';
    if (typeof entry === 'string') return entry;
    if (typeof entry?.label === 'string') return entry.label;
    if (typeof entry?.data === 'string') return String(entry.data).split('|')[0].trim();
    if (typeof entry?.name === 'string') return entry.name;
    if (typeof entry?.data?.name === 'string') return entry.data.name;
    if (typeof entry?.entry === 'string') return entry.entry;
    if (typeof entry?.data?.entry === 'string') return entry.data.entry;
    if (typeof entry?.data?.description?.value === 'string') return entry.data.description.value;
    if (typeof entry?.data?.type === 'string') return entry.data.type;
    return JSON.stringify(entry);
  };

  const getDisplayDescription = (entry: any): string => {
    const source = entry?.data || entry;
    if (!source || typeof source !== 'object') return '';
    if (Array.isArray(source?.entries) && typeof source.entries[0] === 'string') return source.entries[0];
    if (typeof source?.system?.description?.value === 'string') return source.system.description.value;
    if (typeof source?.description?.value === 'string') return source.description.value;
    if (typeof source?.system?.description === 'string') return source.system.description;
    if (typeof source?.system?.entries?.[0]?.entries?.[0] === 'string') return source.system.entries[0].entries[0];
    if (typeof source?.system?.entries?.[0] === 'string') return source.system.entries[0];
    if (typeof source?.entries?.[0] === 'string') return source.entries[0];
    if (typeof source?.description === 'string') return source.description;
    return '';
  };

  const getEntrySource = (entry: any): string => {
    const source = entry?.data || entry || {};
    if (typeof entry?.source === 'string' && entry.source.trim()) return entry.source;
    if (typeof source?.system?.source === 'string') return source.system.source;
    if (typeof source?.source === 'string') return source.source;
    if (typeof source?.system?.source?.custom === 'string') return source.system.source.custom;
    if (typeof source?.system?.source?.book === 'string') return source.system.source.book;
    if (typeof source?.module?.name === 'string') return source.module.name;
    return '';
  };

  const getStructuredData = (entry: any) => entry?.data || entry || null;

  const renderObjectPreview = (entry: any) => {
    const structured = getStructuredData(entry);
    if (!structured || typeof structured !== 'object') return null;

    return (
      <details style={{ marginTop: '6px' }}>
        <summary style={{ cursor: 'pointer', color: '#6b8aff', fontSize: '11px' }}>View data</summary>
        <pre style={{
          marginTop: '6px',
          padding: '8px',
          background: '#181818',
          border: '1px solid #333',
          borderRadius: '4px',
          color: '#bbb',
          fontSize: '11px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: '220px',
          overflow: 'auto',
        }}>
          {JSON.stringify(structured, null, 2)}
        </pre>
      </details>
    );
  };

  const getItemFacts = (entry: any): Array<{ label: string; value: string }> => {
    const source = entry?.data || entry || {};
    const system = source?.system || {};
    const root = source || {};
    const facts: Array<{ label: string; value: string }> = [];

    const pushFact = (label: string, value: any) => {
      if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return;
      facts.push({
        label,
        value: Array.isArray(value) ? value.join(', ') : String(value),
      });
    };

    const damageTypeMap: Record<string, string> = {
      S: 'Slashing',
      P: 'Piercing',
      B: 'Bludgeoning',
    };

    const damageTypeIconMap: Record<string, string> = {
      S: '/icons/damage-types/slashing.svg',
      P: '/icons/damage-types/piercing.svg',
      B: '/icons/damage-types/bludgeoning.svg',
      acid: '/icons/damage-types/acid.svg',
      bludgeoning: '/icons/damage-types/bludgeoning.svg',
      cold: '/icons/damage-types/cold.svg',
      fire: '/icons/damage-types/fire.svg',
      force: '/icons/damage-types/force.svg',
      lightning: '/icons/damage-types/lightning.svg',
      necrotic: '/icons/damage-types/necrotic.svg',
      piercing: '/icons/damage-types/piercing.svg',
      poison: '/icons/damage-types/poison.svg',
      psychic: '/icons/damage-types/psychic.svg',
      radiant: '/icons/damage-types/radiant.svg',
      slashing: '/icons/damage-types/slashing.svg',
      thunder: '/icons/damage-types/thunder.svg',
    };

    const propertyMap: Record<string, string> = {
      H: 'One-handed',
      '2H': 'Two-handed',
      V: 'Versatile',
      T: 'Thrown',
      R: 'Reach',
      F: 'Finesse',
      L: 'Light',
      LD: 'Loading',
      A: 'Ammunition',
    };

    pushFact('Type', source?.type || system?.type?.value || system?.weaponCategory || system?.category);
    pushFact('Category', system?.vttGroup);
    pushFact('Source', getEntrySource(entry));
    pushFact('Rarity', system?.rarity);
    pushFact('Weight', system?.weight?.value ?? system?.weight);
    pushFact('Cost',
      system?.price
        ? `${system.price.value ?? ''} ${system.price.denomination || ''}`.trim()
        : system?.value != null
          ? String(system.value)
          : root?.value != null
            ? `${root.value}${root.valueMult ? ` x${root.valueMult}` : ''}`
            : (system?.cost || root?.cost || null)
    );
    pushFact('Weapon Category', system?.weaponCategory || system?.type?.value);
    pushFact('Attack Bonus', system?.weaponStats?.attackBonus != null ? `${system.weaponStats.attackBonus >= 0 ? '+' : ''}${system.weaponStats.attackBonus}` : null);
    pushFact('Damage Formula', system?.weaponStats?.damage || null);
    pushFact('Attack Ability', system?.weaponStats?.ability ? String(system.weaponStats.ability).toUpperCase() : null);
    pushFact('Range', system?.range ? `${system.range.value ?? ''}${system.range.long ? ` / ${system.range.long}` : ''} ${system.range.units || ''}`.trim() : null);
    pushFact('Damage', system?.damage?.base ? `${system.damage.base.number || ''}d${system.damage.base.denomination || ''} ${Array.isArray(system.damage.base.types) ? system.damage.base.types.join(', ') : ''}`.trim() : null);
    pushFact('Damage', !system?.damage?.base && system?.dmg1 ? `${system.dmg1}${system.dmgType ? ` ${damageTypeMap[system.dmgType] || system.dmgType} ${damageTypeIconMap[system.dmgType] || ''}` : ''}`.trim() : null);
    pushFact('Damage', !system?.damage?.base && root?.dmg1 ? `${root.dmg1}${root.dmgType ? ` ${damageTypeMap[root.dmgType] || root.dmgType} ${damageTypeIconMap[root.dmgType] || ''}` : ''}`.trim() : null);
    pushFact('Damage', !system?.damage?.base && root?.damage ? String(root.damage) : null);
    pushFact('To Hit', system?.attackBonus || system?.toHit || system?.bonusWeapon);
    pushFact('To Hit', !system?.attackBonus && root?.bonusWeapon ? String(root.bonusWeapon) : null);
    pushFact('Damage 2', system?.damage?.versatile ? `${system.damage.versatile.number || ''}d${system.damage.versatile.denomination || ''} ${Array.isArray(system.damage.versatile.types) ? system.damage.versatile.types.join(', ') : ''}`.trim() : null);
    pushFact('Damage 2', !system?.damage?.versatile && system?.dmg2 ? `${system.dmg2}${system.dmgType ? ` ${damageTypeMap[system.dmgType] || system.dmgType} ${damageTypeIconMap[system.dmgType] || ''}` : ''}`.trim() : null);
    pushFact('Damage 2', !system?.damage?.versatile && root?.dmg2 ? `${root.dmg2}${root.dmgType ? ` ${damageTypeMap[root.dmgType] || root.dmgType} ${damageTypeIconMap[root.dmgType] || ''}` : ''}`.trim() : null);
    pushFact('Bonus', system?.bonusWeapon || system?.attackBonus || system?.bonus);
    pushFact('Properties', (system?.property || system?.properties || root?.property || root?.properties)?.map?.((prop: string) => propertyMap[prop] || prop) || (system?.property || system?.properties || root?.property || root?.properties));

    return facts;
  };

  const getItemDamageRolls = (entry: any): string[] => {
    const source = entry?.data || entry || {};
    const system = source?.system || {};
    if (typeof system?.weaponStats?.damage === 'string' && system.weaponStats.damage.trim()) {
      return [`Damage: ${system.weaponStats.damage}`];
    }
    const results: string[] = [];

    const pushRoll = (label: string, formula: string | null | undefined) => {
      if (!formula) return;
      const cleaned = String(formula).trim();
      if (!cleaned) return;
      results.push(label ? `${label}: ${cleaned}` : cleaned);
    };

    if (system?.damage?.base) {
      const base = system.damage.base;
      pushRoll('Damage', `${base.number || ''}d${base.denomination || ''}${base.bonus ? ` + ${base.bonus}` : ''} ${Array.isArray(base.types) ? base.types.join(', ') : ''}`.trim());
    }
    if (system?.damage?.versatile) {
      const versatile = system.damage.versatile;
      pushRoll('Damage 2', `${versatile.number || ''}d${versatile.denomination || ''}${versatile.bonus ? ` + ${versatile.bonus}` : ''} ${Array.isArray(versatile.types) ? versatile.types.join(', ') : ''}`.trim());
    }
    if (system?.dmg1) pushRoll('Damage', `${system.dmg1}${system?.dmgType ? ` ${system.dmgType}` : ''}`.trim());
    if (system?.dmg2) pushRoll('Damage 2', `${system.dmg2}${system?.dmgType ? ` ${system.dmgType}` : ''}`.trim());
    if (source?.dmg1) pushRoll('Damage', `${source.dmg1}${source?.dmgType ? ` ${source.dmgType}` : ''}`.trim());
    if (source?.dmg2) pushRoll('Damage 2', `${source.dmg2}${source?.dmgType ? ` ${source.dmgType}` : ''}`.trim());

    if (system?.activities && typeof system.activities === 'object') {
      Object.values(system.activities).forEach((activity: any) => {
        if (activity?.attack?.bonus) pushRoll('To Hit', activity.attack.bonus);
        if (Array.isArray(activity?.damage?.parts)) {
          activity.damage.parts.forEach((part: any, index: number) => {
            pushRoll(`Activity Damage ${index + 1}`, `${part.number || ''}d${part.denomination || ''}${part.bonus ? ` + ${part.bonus}` : ''} ${Array.isArray(part.types) ? part.types.join(', ') : ''}`.trim());
          });
        }
      });
    }

    const parsedWeapon = parseWeapon({
      ...source,
      ...system,
      description: getDisplayDescription(source),
    });

    parsedWeapon.damageRolls.forEach((roll, index) => {
      if (roll?.dice) {
        const dmgType = roll.damageType ? ` ${roll.damageType}` : '';
        pushRoll(index === 0 ? 'Damage' : `Damage ${index + 1}`, `${roll.dice}${dmgType}`);
      }
      Object.entries(roll?.scaling || {}).forEach(([key, value]) => {
        if (key === '0') {
          pushRoll('Damage 2', `${value}${roll.damageType ? ` ${roll.damageType}` : ''}`);
        }
      });
    });

    return Array.from(new Set(results));
  };

  const getDamageTypeIcon = (entry: any): string | null => {
    const source = entry?.data || entry || {};
    const system = source?.system || {};
    const damageType = String(system?.dmgType || source?.dmgType || '').trim();
    const iconMap: Record<string, string> = {
      S: '/icons/damage-types/slashing.svg',
      P: '/icons/damage-types/piercing.svg',
      B: '/icons/damage-types/bludgeoning.svg',
      acid: '/icons/damage-types/acid.svg',
      bludgeoning: '/icons/damage-types/bludgeoning.svg',
      cold: '/icons/damage-types/cold.svg',
      fire: '/icons/damage-types/fire.svg',
      force: '/icons/damage-types/force.svg',
      lightning: '/icons/damage-types/lightning.svg',
      necrotic: '/icons/damage-types/necrotic.svg',
      piercing: '/icons/damage-types/piercing.svg',
      poison: '/icons/damage-types/poison.svg',
      psychic: '/icons/damage-types/psychic.svg',
      radiant: '/icons/damage-types/radiant.svg',
      slashing: '/icons/damage-types/slashing.svg',
      thunder: '/icons/damage-types/thunder.svg',
    };
    if (!damageType) return null;
    return iconMap[damageType] || iconMap[damageType.toUpperCase()] || iconMap[damageType.toLowerCase()] || null;
  };

  const isWeaponItem = (entry: any): boolean => {
    const source = entry?.data || entry || {};
    const system = source?.system || {};
    return source?.type === 'weapon'
      || source?.type === 'wpn'
      || system?.weapon === true
      || Boolean(system?.weaponStats)
      || typeof system?.dmg1 === 'string'
      || typeof source?.dmg1 === 'string'
      || typeof system?.weaponCategory === 'string';
  };

  const getWeaponAttackScore = (entry: any): string | null => {
    const source = entry?.data || entry || {};
    const system = source?.system || {};
    if (system?.weaponStats?.attackBonus != null) {
      const total = Number(system.weaponStats.attackBonus);
      return `${total >= 0 ? '+' : ''}${total}`;
    }
    const properties = Array.isArray(system?.property)
      ? system.property
      : Array.isArray(system?.properties)
        ? system.properties
        : [];

    const strengthMod = mod(character.strength);
    const dexterityMod = mod(character.dexterity);

    const isFinesse = properties.includes('F');
    const isRanged = properties.includes('A') || properties.includes('R') || String(system?.weaponCategory || '').toLowerCase().includes('ranged');

    let abilityMod = strengthMod;
    if (isRanged) abilityMod = dexterityMod;
    if (isFinesse) abilityMod = Math.max(strengthMod, dexterityMod);

    const otherBonus = Number(system?.bonusWeapon || system?.attackBonus || system?.bonus || 0);
    const total = abilityMod + (character.proficiencyBonus || 0) + otherBonus;
    return `${total >= 0 ? '+' : ''}${total}`;
  };

  const getWeaponDamageFormula = (entry: any): string | null => {
    const source = entry?.data || entry || {};
    const system = source?.system || {};
    if (typeof system?.weaponStats?.damage === 'string' && system.weaponStats.damage.trim()) {
      return system.weaponStats.damage;
    }
    const properties = Array.isArray(system?.property)
      ? system.property
      : Array.isArray(system?.properties)
        ? system.properties
        : [];

    const strengthMod = mod(character.strength);
    const dexterityMod = mod(character.dexterity);

    const isFinesse = properties.includes('F');
    const isRanged = properties.includes('A') || properties.includes('R') || String(system?.weaponCategory || '').toLowerCase().includes('ranged');

    let abilityMod = strengthMod;
    if (isRanged) abilityMod = dexterityMod;
    if (isFinesse) abilityMod = Math.max(strengthMod, dexterityMod);

    const baseDice = system?.dmg1 || source?.dmg1 || null;
    if (!baseDice) return null;

    const damageBonus = Number(system?.bonusWeaponDamage || system?.damageBonus || system?.bonusWeapon || source?.bonusWeapon || 0);
    const totalBonus = abilityMod + damageBonus;
    const bonusPart = totalBonus === 0 ? '' : totalBonus > 0 ? ` + ${totalBonus}` : ` - ${Math.abs(totalBonus)}`;

    return `${baseDice}${bonusPart}`;
  };

  const getContainedItems = (entry: any): string[] => {
    const source = entry?.data || entry || {};
    const candidates = [
      ...(Array.isArray(source?.system?.contents) ? source.system.contents : []),
      ...(Array.isArray(source?.system?.container) ? source.system.container : []),
      ...(Array.isArray(source?.system?.items) ? source.system.items : []),
      ...(Array.isArray(source?.items) ? source.items : []),
    ];

    return candidates
      .map((item: any) => getDisplayLabel(item))
      .filter((label: string) => Boolean(label));
  };

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

  const renderProficiencies = () => {
    const skills = character.skills || [];
    const savingThrows = character.savingThrows || [];
    const weaponProfs = character.weaponProficiencies || [];
    const armorProfs = character.armorProficiencies || [];
    const toolProfs = character.toolProficiencies || [];
    
    const allDndSkills = [
      'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception', 'History',
      'Insight', 'Intimidation', 'Investigation', 'Medicine', 'Nature', 'Perception',
      'Performance', 'Persuasion', 'Religion', 'Sleight of Hand', 'Stealth', 'Survival',
    ];
    
    const abilityMap: Record<string, string> = {
      'Acrobatics': 'dexterity', 'Animal Handling': 'wisdom', 'Arcana': 'intelligence',
      'Athletics': 'strength', 'Deception': 'charisma', 'History': 'intelligence',
      'Insight': 'wisdom', 'Intimidation': 'charisma', 'Investigation': 'intelligence',
      'Medicine': 'wisdom', 'Nature': 'intelligence', 'Perception': 'wisdom',
      'Performance': 'charisma', 'Persuasion': 'charisma', 'Religion': 'intelligence',
      'Sleight of Hand': 'dexterity', 'Stealth': 'dexterity', 'Survival': 'wisdom',
    };
    
    const getSkillMod = (skill: string): string => {
      const ability = abilityMap[skill];
      if (!ability) return '+0';
      const val = (character as any)[ability] || 10;
      return modStr(val);
    };
    
    return (
      <div style={{ marginTop: '16px' }}>
        {/* Saving Throws */}
        {savingThrows.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#6b8aff', fontSize: '13px' }}>Saving Throws</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {savingThrows.map((st: string) => {
                const abilityKey = st.toLowerCase();
                const val = (character as any)[abilityKey] || 10;
                return (
                  <span key={st} style={{ padding: '4px 10px', background: '#2a2a2a', borderRadius: '4px', fontSize: '13px', color: '#fff' }}>
                    {st}: {modStr(val)}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        
        {/* Skills */}
        <div style={{ marginBottom: '16px' }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#6b8aff', fontSize: '13px' }}>Skills</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
            {allDndSkills.map(skill => {
              const isProficient = skills.some((s: any) => {
                const skillStr = typeof s === 'string' ? s : (s.name || s.proficiency || '');
                return skillStr.toLowerCase() === skill.toLowerCase();
              });
              return (
                <div key={skill} style={{
                  padding: '4px 8px',
                  fontSize: '13px',
                  color: isProficient ? '#fff' : '#666',
                  background: isProficient ? '#2a2a2a' : 'transparent',
                  borderRadius: '4px',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}>
                  <span>{skill}</span>
                  <span style={{ color: isProficient ? '#6b8aff' : '#888' }}>{getSkillMod(skill)}</span>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Weapon Proficiencies */}
        {weaponProfs.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#6b8aff', fontSize: '13px' }}>Weapon Proficiencies</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {weaponProfs.map((w: any, i: number) => (
                <span key={i} style={{ padding: '4px 10px', background: '#2a2a2a', borderRadius: '4px', fontSize: '13px', color: '#fff' }}>
                  {typeof w === 'string' ? w : (w.name || w.proficiency || JSON.stringify(w))}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {/* Armor Proficiencies */}
        {armorProfs.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#6b8aff', fontSize: '13px' }}>Armor Proficiencies</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {armorProfs.map((a: any, i: number) => (
                <span key={i} style={{ padding: '4px 10px', background: '#2a2a2a', borderRadius: '4px', fontSize: '13px', color: '#fff' }}>
                  {typeof a === 'string' ? a : (a.name || a.proficiency || JSON.stringify(a))}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {/* Tool Proficiencies */}
        {toolProfs.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#6b8aff', fontSize: '13px' }}>Tool Proficiencies</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {toolProfs.map((t: any, i: number) => (
                <span key={i} style={{ padding: '4px 10px', background: '#2a2a2a', borderRadius: '4px', fontSize: '13px', color: '#fff' }}>
                  {typeof t === 'string' ? t : (t.name || t.proficiency || JSON.stringify(t))}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCombat = () => {
    const combatActions = Array.isArray(templateInstance?.actions) ? templateInstance.actions : [];
    // Also get actions from features array (wizard-created characters store actions as features)
    const featureActions = Array.isArray(character.features) ? character.features.filter((f: any) => f.type === 'action' || f.source === 'action') : [];
    // For wizard-created characters, also show class/subclass features as potential actions
    const classFeatures = Array.isArray(character.features) ? character.features.filter((f: any) => f.source === 'class' || f.source === 'subclass') : [];
    const allActions = [...combatActions, ...featureActions];

    return (
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
      {combatActions.length > 0 && (
        <div style={{ background: '#2a2a2a', padding: '12px', borderRadius: '4px', gridColumn: 'span 3' }}>
          <div style={{ fontSize: '10px', color: '#888', marginBottom: '8px' }}>ACTIONS</div>
          <div style={{ display: 'grid', gap: '8px' }}>
            {allActions.map((action: any, index: number) => (
              <div key={action?.id || `combat-action-${index}`} style={{ background: '#222', padding: '8px', borderRadius: '4px' }}>
                <div style={{ color: '#fff', fontWeight: 600 }}>{getDisplayLabel(action)}</div>
                {getDisplayDescription(action) && (
                  <div style={{ color: '#aaa', fontSize: '12px', marginTop: '4px' }}>
                    <RollableText text={getDisplayDescription(action)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
  };

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
          orderedInventoryTypes.map((type) => {
            const items = groupedInventory[type];
            if (!items || items.length === 0) return null;
            
            return (
              <div key={type} className="inventory-category" style={{ marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 8px 0', color: '#6b8aff', textTransform: 'capitalize' }}>
                  {type} ({items.length})
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                  {items.map((item) => {
                    // Handle both Compendium format ({ data: {...}, id: '...' }) and wizard format ({ name: '...', quantity: 1 })
                    const isWizardItem = item && !item.data && item.name;
                    const itemData = isWizardItem ? item : (item.data || {});
                    const itemFacts = isWizardItem ? [] : getItemFacts(itemData);
                    const itemRolls = isWizardItem ? [] : getItemDamageRolls(itemData);
                    const toHit = isWizardItem ? null : (isWeaponItem(itemData) ? getWeaponAttackScore(itemData) : null);
                    const itemName = isWizardItem ? item.name : (getDisplayLabel(itemData) || itemData?.name || itemData?.properties?.name || 'Unknown Item');
                    const descriptionText = isWizardItem ? (item.description || '') : getDisplayDescription(itemData).replace(/<[^>]+>/g, '');
                    const damageFormula = isWizardItem ? null : (isWeaponItem(itemData) ? getWeaponDamageFormula(itemData) : null);
                    const damageIcon = isWizardItem ? null : (isWeaponItem(itemData) ? getDamageTypeIcon(itemData) : null);

                    return (
                      <details
                        key={item.id}
                        className="inventory-item"
                        style={{
                          background: '#2a2a2a',
                          borderRadius: '6px',
                          borderLeft: `3px solid ${getItemColor(item.type)}`,
                          userSelect: 'text',
                          overflow: 'hidden',
                        }}
                      >
                        <summary
                          style={{
                            listStyle: 'none',
                            cursor: 'pointer',
                            padding: '8px 10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px',
                          }}
                        >
                          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={{ fontWeight: 600, color: '#fff' }}>{itemName}</div>
                            <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                              {itemFacts.slice(0, 3).map((fact) => `${fact.label}: ${fact.value}`).join(' • ')}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                            {toHit && (
                              <RollableText text={`1d20${toHit.startsWith('-') ? toHit : `+${toHit.replace(/^\+/, '')}`}`} />
                            )}
                            {itemRolls[0] && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <RollableText text={damageFormula || itemRolls[0].replace(/^Damage:?\s*/i, '').replace(/^Damage 1:?\s*/i, '')} />
                                {damageIcon && <img src={damageIcon} alt="damage type" style={{ width: '16px', height: '16px', opacity: 0.9 }} />}
                              </div>
                            )}
                          </div>
                        </summary>
                        <div style={{ padding: '0 10px 10px 10px', display: 'grid', gap: '6px' }}>
                          {itemFacts.length > 0 && (
                            <div style={{ display: 'grid', gap: '3px' }}>
                              {itemFacts.map((fact, factIndex) => (
                                <div key={`${item.id}-fact-${factIndex}`} style={{ fontSize: '11px', color: '#bdbdbd' }}>
                                  <span style={{ color: '#888' }}>{fact.label}:</span> {fact.value}
                                </div>
                              ))}
                            </div>
                          )}
                          {toHit && isWeaponItem(item.data) && (
                            <div style={{ fontSize: '11px', color: '#d9c27a' }}>
                              <span style={{ color: '#888' }}>To Hit:</span> <RollableText text={`1d20${toHit.startsWith('-') ? toHit : `+${toHit.replace(/^\+/, '')}`}`} />
                            </div>
                          )}
                          {itemRolls.length > 0 && isWeaponItem(item.data) && (
                            <div style={{ display: 'grid', gap: '3px' }}>
                              {itemRolls.map((roll, rollIndex) => {
                                const label = roll.includes(':') ? roll.split(':')[0] : `Damage ${rollIndex + 1}`;
                                const formula = rollIndex === 0 && damageFormula
                                  ? damageFormula
                                  : (roll.includes(':') ? roll.split(':').slice(1).join(':').trim() : roll);
                                return (
                                  <div key={`${item.id}-roll-${rollIndex}`} style={{ fontSize: '11px', color: '#d9c27a' }}>
                                    <span style={{ color: '#888' }}>{label}:</span>{' '}
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                      <RollableText text={formula} />
                                      {damageIcon && <img src={damageIcon} alt="damage type" style={{ width: '14px', height: '14px', opacity: 0.9 }} />}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {getContainedItems(item.data).length > 0 && (
                            <div style={{ fontSize: '11px', color: '#bdbdbd' }}>
                              <span style={{ color: '#888' }}>Contains:</span> {getContainedItems(item.data).join(', ')}
                            </div>
                          )}
                          {descriptionText && (
                            <div style={{ fontSize: '11px', color: '#888', whiteSpace: 'pre-wrap', userSelect: 'text' }}>
                              {descriptionText}
                            </div>
                          )}
                        </div>
                      </details>
                    );
                  })}
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
      if (Array.isArray(spells)) {
        return spells.map((spell: any, index: number) => {
          if (spell && spell.data && spell.id) return spell as CharacterItem;
          return {
            id: spell?.id || `spell-${index}`,
            type: 'spell',
            addedAt: spell?.addedAt || new Date().toISOString(),
            data: spell,
          };
        });
      }
      if (typeof spells === 'string') {
        try {
          const parsed = JSON.parse(spells);
          if (!Array.isArray(parsed)) return [];
          return parsed.map((spell: any, index: number) => {
            if (spell && spell.data && spell.id) return spell as CharacterItem;
            return {
              id: spell?.id || `spell-${index}`,
              type: 'spell',
              addedAt: spell?.addedAt || new Date().toISOString(),
              data: spell,
            };
          });
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

  const renderFeatureList = (title: string, icon: string, entries: any[]) => (
    <div style={{ marginBottom: '16px' }}>
      <h4 style={{ margin: '0 0 8px 0', color: '#888', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Icon name={icon} />
        {title}
      </h4>
      <div style={{ display: 'grid', gap: '8px' }}>
        {entries.map((entry: any, index: number) => (
          <div key={entry?.id || `${title}-${index}`} style={{ background: '#222', padding: '8px', borderRadius: '4px', userSelect: 'text' }}>
            <div style={{ color: '#fff', fontWeight: 600 }}>{getDisplayLabel(entry)}</div>
            {getEntrySource(entry) && (
              <div style={{ color: '#888', fontSize: '11px', marginTop: '4px' }}>
                Source: {getEntrySource(entry)}
              </div>
            )}
            {getDisplayDescription(entry) && (
              <div style={{ color: '#aaa', fontSize: '12px', marginTop: '4px', whiteSpace: 'pre-wrap' }}>
                <RollableText text={getDisplayDescription(entry)} />
              </div>
            )}
            {renderObjectPreview(entry)}
          </div>
        ))}
      </div>
    </div>
  );

  const renderFeatures = () => {
    const features = Array.isArray(character.features) ? character.features : [];
    
    // Group features by source
    const grouped: Record<string, any[]> = {};
    for (const f of features) {
      const source = (f.source || 'other').toLowerCase();
      if (!grouped[source]) grouped[source] = [];
      grouped[source].push(f);
    }
    
    const sourceOrder = ['class', 'subclass', 'race', 'background', 'feat', 'action', 'other'];
    const sourceLabels: Record<string, string> = {
      class: 'Class Features',
      subclass: 'Subclass Features',
      race: 'Racial Traits',
      background: 'Background Features',
      feat: 'Feats',
      action: 'Actions',
      other: 'Other Features',
    };
    const sourceIcons: Record<string, string> = {
      class: 'book',
      subclass: 'layers',
      race: 'user-group',
      background: 'star',
      feat: 'award',
      action: 'dumbbell',
      other: 'file',
    };
    
    return (
      <div className="features-section">
        {sourceOrder.map(source => {
          const items = grouped[source];
          if (!items || items.length === 0) return null;
          return (
            <div key={source} style={{ marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#6b8aff', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icon name={sourceIcons[source] || 'file'} />
                {sourceLabels[source] || source}
              </h4>
              {items.map((f: any, idx: number) => {
                const name = f.name || f.data?.name || 'Unnamed Feature';
                const desc = f.description || f.data?.description || '';
                return (
                  <details key={`${source}-${idx}`} style={{ background: '#2a2a2a', borderRadius: '6px', marginBottom: '6px', borderLeft: '3px solid #6b8aff' }}>
                    <summary style={{ listStyle: 'none', cursor: 'pointer', padding: '8px 10px', color: '#fff', fontWeight: 600, fontSize: '14px' }}>
                      {name}
                    </summary>
                    <div style={{ padding: '0 10px 10px 10px', color: '#ccc', fontSize: '13px', whiteSpace: 'pre-wrap' }}>
                      {typeof desc === 'string' ? desc.replace(/<[^>]+>/g, '') : JSON.stringify(desc)}
                    </div>
                  </details>
                );
              })}
            </div>
          );
        })}
        
        {/* Also show traits, flaws, bonds, ideals from character fields */}
        {[
          { label: 'Traits', field: 'traits' },
          { label: 'Flaws', field: 'flaws' },
          { label: 'Bonds', field: 'bonds' },
          { label: 'Ideals', field: 'ideals' },
        ].map(({ label, field }) => {
          const value = (character as any)[field];
          if (!value) return null;
          // Handle JSON string traits
          let displayValue = value;
          if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
            try {
              const parsed = JSON.parse(value);
              if (Array.isArray(parsed)) {
                displayValue = parsed.map((t: any) => t.name || t).join(', ');
              } else {
                displayValue = JSON.stringify(parsed);
              }
            } catch { /* keep as-is */ }
          }
          return (
            <div key={field} style={{ marginBottom: '12px' }}>
              <h4 style={{ margin: '0 0 4px 0', color: '#888', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icon name={getCharacterFeatureIcon(field)} />
                {label}
              </h4>
              {isEditing ? (
                <textarea
                  value={value}
                  onChange={(e) => handleChange(field as any, e.target.value)}
                  rows={3}
                  style={{ width: '100%', background: '#333', border: '1px solid #444', color: '#fff', resize: 'vertical' }}
                />
              ) : (
                <p style={{ margin: 0, color: '#ccc', fontSize: '13px', whiteSpace: 'pre-wrap' }}>{displayValue}</p>
              )}
            </div>
          );
        })}
        
        {features.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
            <Icon name="star" size="2x" />
            <p>No features or traits yet.</p>
          </div>
        )}
      </div>
    );
  };

  const renderBio = () => (
    <div className="bio-section">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
        {[
          { label: 'Race', value: templateInstance?.race?.name || character.raceData?.name || character.race, detail: typeof character.raceData?.system?.abilityScores === 'string' ? character.raceData.system.abilityScores : null },
          { label: 'Class', value: templateInstance?.class?.name || character.classData?.name || character.class, detail: typeof character.classData?.system?.hitDie === 'string' ? character.classData.system.hitDie : null },
          { label: 'Subclass', value: templateInstance?.subclass?.name || character.subclassData?.name || character.subclass },
          { label: 'Background', value: templateInstance?.background?.name || character.backgroundData?.name || character.background, detail: typeof character.backgroundData?.system?.feature === 'string' ? character.backgroundData.system.feature : null },
          { label: 'Alignment', field: 'alignment' as const },
        ].map(({ label, field, value, detail }) => (
          <div key={label}>
            <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>{label}</div>
            {isEditing ? (
              <input
                type="text"
                value={(editData as any)[field || label.toLowerCase()] || ''}
                onChange={(e) => handleChange(field as any, e.target.value)}
                style={{ width: '100%', background: '#333', border: '1px solid #444', color: '#fff' }}
              />
            ) : (
              <div style={{ color: '#ccc' }}>
                {value || (field ? (character as any)[field] : '-')}
                {detail && <div style={{ fontSize: '10px', color: '#666' }}>{detail}</div>}
              </div>
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
            Level {character.level} {character.classData?.name || character.class}{character.subclassData?.name || character.subclass ? ` (${character.subclassData?.name || character.subclass})` : ''} {character.raceData?.name || character.race}
            {character.classData?.system?.hitDie && <span> • {character.classData.system.hitDie}</span>}
            {character.skills && character.skills.length > 0 && <span> • Skills: {character.skills.join(', ')}</span>}
            {(() => {
              const bgSkills = character.backgroundData?.system?.skillProficiencies;
              if (bgSkills && bgSkills.length) {
                const skillNames = bgSkills.map((s: any) => typeof s === 'string' ? s : (s.name || s.proficiency || ''));
                return <span> • {skillNames.filter(Boolean).join(', ')}</span>;
              }
              return null;
            })()}
            {character.skillProficiencies && character.skillProficiencies.length > 0 && <span> • {character.skillProficiencies.join(', ')}</span>}
            {character.weaponProficiencies && character.weaponProficiencies.length > 0 && <span> • Weapons: {character.weaponProficiencies.join(', ')}</span>}
            {character.armorProficiencies && character.armorProficiencies.length > 0 && <span> • Armor: {character.armorProficiencies.join(', ')}</span>}
            {character.toolProficiencies && character.toolProficiencies.length > 0 && <span> • Tools: {character.toolProficiencies.join(', ')}</span>}
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
        {activeSection === 'stats' && (
          <>
            {renderAbilityScores()}
            {renderProficiencies()}
          </>
        )}
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
