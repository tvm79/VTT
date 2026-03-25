/**
 * Data Normalizer for VTT Compendium
 * 
 * Normalizes compendium data and assigns property types so UI can
 * render correct controls.
 * 
 * ## Normalized Structure
 * 
 *     {
 *       "id": "...",
 *       "type": "spell|monster|item|class",
 *       "name": "...",
 *       "book": "...",
 *       "publisher": "...",
 *       "description": "...",
 *       "system": {},
 *       "rolls": []
 *     }
 */

import { parseRolls, RollObject } from './rollParser';

// ============================================================================
// Type Definitions
// ============================================================================

export type PropertyType = 'boolean' | 'enum' | 'number' | 'string' | 'object';

export interface PropertySchema {
  type: PropertyType;
  label: string;
  enumValues?: string[];
  properties?: Record<string, PropertySchema>;
  required?: boolean;
  defaultValue?: any;
}

export interface TypeSchema {
  type: string;
  label: string;
  requiredFields: string[];
  properties: Record<string, PropertySchema>;
}

export interface NormalizedEntry {
  id?: string;
  type: string;
  name: string;
  book?: string;
  publisher?: string;
  description?: string;
  system: Record<string, any>;
  rolls?: RollObject[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// Type Schemas
// ============================================================================

// Spell type schema
export const spellSchema: TypeSchema = {
  type: 'spell',
  label: 'Spell',
  requiredFields: ['name'],
  properties: {
    level: {
      type: 'number',
      label: 'Level',
      required: true,
      defaultValue: 0,
    },
    school: {
      type: 'enum',
      label: 'School',
      enumValues: [
        'abjuration', 'conjuration', 'divination', 'enchantment',
        'evocation', 'illusion', 'necromancy', 'transmutation'
      ],
    },
    castingTime: {
      type: 'enum',
      label: 'Casting Time',
      enumValues: [
        '1 action', '1 bonus action', '1 reaction', '1 minute',
        '10 minutes', '1 hour', '8 hours', '12 hours', '24 hours'
      ],
    },
    range: {
      type: 'string',
      label: 'Range',
    },
    components: {
      type: 'object',
      label: 'Components',
      properties: {
        verbal: { type: 'boolean', label: 'Verbal (V)', defaultValue: false },
        somatic: { type: 'boolean', label: 'Somatic (S)', defaultValue: false },
        material: { type: 'boolean', label: 'Material (M)', defaultValue: false },
      },
    },
    duration: {
      type: 'string',
      label: 'Duration',
    },
    damageType: {
      type: 'enum',
      label: 'Damage Type',
      enumValues: [
        'acid', 'bludgeoning', 'cold', 'fire', 'force',
        'lightning', 'necrotic', 'piercing', 'poison', 'psychic',
        'radiant', 'slashing', 'thunder'
      ],
    },
    saveType: {
      type: 'enum',
      label: 'Save Ability',
      enumValues: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'],
    },
    concentration: {
      type: 'boolean',
      label: 'Concentration',
      defaultValue: false,
    },
    ritual: {
      type: 'boolean',
      label: 'Ritual',
      defaultValue: false,
    },
    higherLevel: {
      type: 'string',
      label: 'At Higher Levels',
    },
  },
};

// Monster type schema
export const monsterSchema: TypeSchema = {
  type: 'monster',
  label: 'Monster',
  requiredFields: ['name'],
  properties: {
    size: {
      type: 'enum',
      label: 'Size',
      enumValues: ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'],
    },
    creatureType: {
      type: 'string',
      label: 'Creature Type',
    },
    alignment: {
      type: 'string',
      label: 'Alignment',
    },
    challengeRating: {
      type: 'number',
      label: 'Challenge Rating',
    },
    hitPoints: {
      type: 'number',
      label: 'Hit Points',
    },
    armorClass: {
      type: 'number',
      label: 'Armor Class',
    },
    speed: {
      type: 'string',
      label: 'Speed',
    },
    strength: {
      type: 'number',
      label: 'Strength',
    },
    dexterity: {
      type: 'number',
      label: 'Dexterity',
    },
    constitution: {
      type: 'number',
      label: 'Constitution',
    },
    intelligence: {
      type: 'number',
      label: 'Intelligence',
    },
    wisdom: {
      type: 'number',
      label: 'Wisdom',
    },
    charisma: {
      type: 'number',
      label: 'Charisma',
    },
    damageResistances: {
      type: 'string',
      label: 'Damage Resistances',
    },
    damageImmunities: {
      type: 'string',
      label: 'Damage Immunities',
    },
    conditionImmunities: {
      type: 'string',
      label: 'Condition Immunities',
    },
    senses: {
      type: 'string',
      label: 'Senses',
    },
    languages: {
      type: 'string',
      label: 'Languages',
    },
  },
};

// Item type schema
export const itemSchema: TypeSchema = {
  type: 'item',
  label: 'Item',
  requiredFields: ['name'],
  properties: {
    itemCategory: {
      type: 'enum',
      label: 'Category',
      enumValues: [
        'weapon', 'armor', 'potion', 'scroll', 'wand', 'rod', 'ring',
        'wondrous item', 'tool', 'gear', 'consumable', 'treasure', 'miscellaneous'
      ],
    },
    rarity: {
      type: 'enum',
      label: 'Rarity',
      enumValues: ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'],
    },
    requiresAttunement: {
      type: 'boolean',
      label: 'Requires Attunement',
      defaultValue: false,
    },
    damage: {
      type: 'string',
      label: 'Damage',
    },
    damageType: {
      type: 'enum',
      label: 'Damage Type',
      enumValues: [
        'acid', 'bludgeoning', 'cold', 'fire', 'force',
        'lightning', 'necrotic', 'piercing', 'poison', 'psychic',
        'radiant', 'slashing', 'thunder'
      ],
    },
    armorClass: {
      type: 'number',
      label: 'Armor Class',
    },
    armorType: {
      type: 'enum',
      label: 'Armor Type',
      enumValues: ['light', 'medium', 'heavy', 'shield'],
    },
    price: {
      type: 'string',
      label: 'Price',
    },
    weight: {
      type: 'number',
      label: 'Weight (lbs)',
    },
    properties: {
      type: 'object',
      label: 'Properties',
    },
  },
};

// Class type schema
export const classSchema: TypeSchema = {
  type: 'class',
  label: 'Class',
  requiredFields: ['name'],
  properties: {
    hitDie: {
      type: 'string',
      label: 'Hit Die',
    },
    primaryAbility: {
      type: 'string',
      label: 'Primary Ability',
    },
    savingThrows: {
      type: 'string',
      label: 'Saving Throws',
    },
    armorProficiencies: {
      type: 'string',
      label: 'Armor Proficiencies',
    },
    weaponProficiencies: {
      type: 'string',
      label: 'Weapon Proficiencies',
    },
    toolProficiencies: {
      type: 'string',
      label: 'Tool Proficiencies',
    },
    skillProficiencies: {
      type: 'number',
      label: 'Skill Proficiencies Count',
    },
    spellcastingAbility: {
      type: 'string',
      label: 'Spellcasting Ability',
    },
  },
};

// Feat type schema
export const featSchema: TypeSchema = {
  type: 'feat',
  label: 'Feat',
  requiredFields: ['name'],
  properties: {
    prerequisites: {
      type: 'string',
      label: 'Prerequisites',
    },
    benefits: {
      type: 'string',
      label: 'Benefits',
    },
    repeatable: {
      type: 'boolean',
      label: 'Repeatable',
      defaultValue: false,
    },
  },
};

// Species type schema
export const speciesSchema: TypeSchema = {
  type: 'species',
  label: 'Species',
  requiredFields: ['name'],
  properties: {
    size: {
      type: 'enum',
      label: 'Size',
      enumValues: ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'],
    },
    speed: {
      type: 'string',
      label: 'Speed',
    },
    abilityBonuses: {
      type: 'string',
      label: 'Ability Score Bonuses',
    },
    traits: {
      type: 'string',
      label: 'Traits',
    },
    languages: {
      type: 'string',
      label: 'Languages',
    },
  },
};

// Background type schema
export const backgroundSchema: TypeSchema = {
  type: 'background',
  label: 'Background',
  requiredFields: ['name'],
  properties: {
    skillProficiencies: {
      type: 'string',
      label: 'Skill Proficiencies',
    },
    toolProficiencies: {
      type: 'string',
      label: 'Tool Proficiencies',
    },
    languages: {
      type: 'string',
      label: 'Languages',
    },
    equipment: {
      type: 'string',
      label: 'Equipment',
    },
    feature: {
      type: 'string',
      label: 'Feature',
    },
  },
};

// ============================================================================
// Schema Registry
// ============================================================================

export const schemaRegistry: Record<string, TypeSchema> = {
  spell: spellSchema,
  monster: monsterSchema,
  item: itemSchema,
  class: classSchema,
  feat: featSchema,
  species: speciesSchema,
  background: backgroundSchema,
};

// Get schema by type
export function getSchemaByType(type: string): TypeSchema | undefined {
  return schemaRegistry[type];
}

// ============================================================================
// Legacy Data Conversion
// ============================================================================

// Map Category to type
const categoryToTypeMap: Record<string, string> = {
  'Spells': 'spell',
  'Monsters': 'monster',
  'Items': 'item',
  'Classes': 'class',
  'Feats': 'feat',
  'Species': 'species',
  'Races': 'species',
  'Backgrounds': 'background',
};

// Legacy key mappings (PascalCase -> camelCase)
const legacyKeyMap: Record<string, string> = {
  'Level': 'level',
  'School': 'school',
  'Components': 'components',
  'Casting Time': 'castingTime',
  'Range': 'range',
  'Duration': 'duration',
  'Higher Level': 'higherLevel',
  'Damage': 'damage',
  'Damage Type': 'damageType',
  'Save': 'saveType',
  'Attack Type': 'attackType',
  'CR': 'challengeRating',
  'HP': 'hitPoints',
  'AC': 'armorClass',
  'Size': 'size',
  'Type': 'creatureType',
  'Alignment': 'alignment',
  'Speed': 'speed',
  'STR': 'strength',
  'DEX': 'dexterity',
  'CON': 'constitution',
  'INT': 'intelligence',
  'WIS': 'wisdom',
  'CHA': 'charisma',
  'Rarity': 'rarity',
  'Category': 'itemCategory',
  'Attunement': 'requiresAttune',
  'Price': 'price',
  'Weight': 'weight',
  'Hit Die': 'hitDie',
  'Primary Ability': 'primaryAbility',
  'Saving Throws': 'savingThrows',
  'Armor Proficiencies': 'armorProficiencies',
  'Weapon Proficiencies': 'weaponProficiencies',
  'Tool Proficiencies': 'toolProficiencies',
  'Skill Proficiencies': 'skillProficiencies',
  'Tool Proficiency': 'toolProficiencies',
  'Languages': 'languages',
  'Equipment': 'equipment',
  'Feature': 'feature',
  'Ability Scores': 'abilityScores',
  'Prerequisites': 'prerequisites',
  'Benefits': 'benefits',
  'Repeatable': 'repeatable',
};

// Convert legacy Components string to object
export function parseComponents(componentsStr: string | object): { verbal: boolean; somatic: boolean; material: boolean } {
  if (typeof componentsStr === 'object' && componentsStr !== null) {
    // Already in object form, ensure it has all properties
    const obj = componentsStr as Record<string, any>;
    return {
      verbal: Boolean(obj.verbal),
      somatic: Boolean(obj.somatic),
      material: Boolean(obj.material),
    };
  }
  
  if (typeof componentsStr !== 'string') {
    return { verbal: false, somatic: false, material: false };
  }
  
  const upper = componentsStr.toUpperCase();
  return {
    verbal: upper.includes('V'),
    somatic: upper.includes('S'),
    material: upper.includes('M'),
  };
}

// Parse skill proficiencies string to array
export function parseSkillProficiencies(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

// Parse tool proficiencies string to array
export function parseToolProficiencies(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

// Parse ability scores string to object
export function parseAbilityScores(value: string | Record<string, number> | undefined): Record<string, number> {
  if (!value) return {};
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    const result: Record<string, number> = {};
    const parts = value.split(',').map(s => s.trim());
    for (const part of parts) {
      const match = part.match(/(\w+)\s*\+\s*(\d+)/i);
      if (match) {
        result[match[1].toUpperCase()] = parseInt(match[2], 10);
      }
    }
    return result;
  }
  return {};
}

// Parse equipment to array
export function parseEquipment(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    // Handle "Choose A or B: (A) item1, item2; (B) item3" format
    const items: string[] = [];
    // Split on common delimiters
    const parts = value.split(/[;(]/).map(s => s.trim());
    for (const part of parts) {
      if (part && !part.startsWith('Choose') && !part.startsWith('or')) {
        items.push(part.replace(/^[A-Z]\)\s*/, '').trim());
      }
    }
    return items.filter(Boolean);
  }
  return [];
}

// Infer type from data
export function inferType(data: any): string {
  // Check for explicit type
  if (data.type) return data.type;
  
  // Check for Category field
  if (data.Category) {
    const inferred = categoryToTypeMap[data.Category];
    if (inferred) return inferred;
  }
  
  // Check properties for type hints
  if (data.properties) {
    const props = data.properties;
    
    // Spell indicators
    if (props['Level'] !== undefined || props['Casting Time'] !== undefined || props['School'] !== undefined) {
      return 'spell';
    }
    
    // Monster indicators
    if (props['CR'] !== undefined || props['HP'] !== undefined || props['AC'] !== undefined || props['Type'] !== undefined) {
      return 'monster';
    }
    
    // Item indicators
    if (props['Rarity'] !== undefined || props['Attunement'] !== undefined) {
      return 'item';
    }
    
    // Class indicators
    if (props['Hit Die'] !== undefined) {
      return 'class';
    }
    
    // Feat indicators
    if (props['Prerequisites'] !== undefined && props['Benefits'] !== undefined) {
      return 'feat';
    }
    
    // Species indicators
    if (props['Ability Scores'] !== undefined || props['Size'] !== undefined) {
      return 'species';
    }
  }
  
  return 'item'; // Default
}

// Convert legacy key to camelCase
function toCamelCase(key: string): string {
  return legacyKeyMap[key] || key.charAt(0).toLowerCase() + key.slice(1);
}

// Transform legacy data to normalized system object
export function transformLegacyToSystem(data: any, type: string): Record<string, any> {
  const system: Record<string, any> = {};
  
  // Handle properties object
  if (data.properties) {
    for (const [key, value] of Object.entries(data.properties)) {
      const camelKey = toCamelCase(key);
      
      // Special handling for certain fields
      if (key === 'Components') {
        system[camelKey] = parseComponents(value as string);
      } else if (key === 'Attunement') {
        // Attunement can be string ("Requires Attunement") or boolean
        system[camelKey] = typeof value === 'string' 
          ? value.toLowerCase().includes('require') 
          : Boolean(value);
      } else if (key === 'Category') {
        // Skip Category, we'll infer type instead
        continue;
      } else if (type === 'background') {
        // Special parsing for background fields
        if (key === 'Skill Proficiencies' || key === 'Skill Proficiency') {
          system.skillProficiencies = parseSkillProficiencies(value as string);
        } else if (key === 'Tool Proficiencies' || key === 'Tool Proficiency') {
          system.toolProficiencies = parseToolProficiencies(value as string);
        } else if (key === 'Ability Scores') {
          system.abilityScores = parseAbilityScores(value as string);
        } else if (key === 'Equipment') {
          system.equipment = parseEquipment(value as string);
        } else {
          system[camelKey] = value;
        }
      } else {
        system[camelKey] = value;
      }
    }
  }
  
  // Handle direct properties (some legacy data has them flat)
  for (const [key, value] of Object.entries(data)) {
    if (key === 'name' || key === 'description' || key === 'publisher' || 
        key === 'book' || key === 'source' || key === 'Category' ||
        key === 'properties' || key === 'type') {
      continue;
    }
    
    const camelKey = toCamelCase(key);
    if (system[camelKey] === undefined) {
      system[camelKey] = value;
    }
  }
  
  return system;
}

// ============================================================================
// Normalization
// ============================================================================

// Normalize a single entry
export function normalizeEntry(data: any): NormalizedEntry {
  // Infer or use provided type
  const type = data.type || inferType(data);
  
  // Extract base fields
  const entry: NormalizedEntry = {
    id: data.id || data._id,
    type,
    name: data.name || 'Unknown',
    book: data.book || data.source || data.properties?.book,
    publisher: data.publisher || data.properties?.publisher,
    description: data.description || data.desc,
    system: {},
  };
  
  // Transform legacy data to system
  entry.system = transformLegacyToSystem(data, type);
  
  // Parse roll data from 5etools JSON
  const parsedRolls = parseRolls(data);
  if (parsedRolls.rolls.length > 0) {
    entry.rolls = parsedRolls.rolls;
  }
  
  // Remove empty system properties
  Object.keys(entry.system).forEach(key => {
    if (entry.system[key] === undefined || entry.system[key] === null || entry.system[key] === '') {
      delete entry.system[key];
    }
  });
  
  return entry;
}

// Normalize an array of entries
export function normalizeEntries(entries: any[]): NormalizedEntry[] {
  return entries.map(normalizeEntry);
}

// ============================================================================
// Validation
// ============================================================================

// Validate a single entry
export function validateEntry(entry: NormalizedEntry): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Get schema for type
  const schema = schemaRegistry[entry.type];
  if (!schema) {
    warnings.push(`Unknown type "${entry.type}", using generic validation`);
  }
  
  // Check required fields
  if (!entry.name || entry.name.trim() === '') {
    errors.push('Name is required');
  }
  
  if (!entry.type) {
    errors.push('Type is required');
  }
  
  // Validate system properties against schema
  if (schema && entry.system) {
    for (const [key, schemaProp] of Object.entries(schema.properties)) {
      const value = entry.system[key];
      
      // Check required properties
      if (schemaProp.required && (value === undefined || value === null)) {
        errors.push(`Required property "${schemaProp.label}" is missing`);
        continue;
      }
      
      if (value !== undefined && value !== null) {
        // Type validation
        switch (schemaProp.type) {
          case 'number':
            if (typeof value !== 'number') {
              errors.push(`Property "${key}" must be a number`);
            }
            break;
          case 'boolean':
            if (typeof value !== 'boolean') {
              errors.push(`Property "${key}" must be a boolean`);
            }
            break;
          case 'string':
            if (typeof value !== 'string') {
              errors.push(`Property "${key}" must be a string`);
            }
            break;
          case 'enum':
            if (schemaProp.enumValues && !schemaProp.enumValues.includes(value)) {
              errors.push(`Property "${key}" must be one of: ${schemaProp.enumValues.join(', ')}`);
            }
            break;
          case 'object':
            if (typeof value !== 'object' || Array.isArray(value)) {
              errors.push(`Property "${key}" must be an object`);
            }
            break;
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// Validate multiple entries
export function validateEntries(entries: NormalizedEntry[]): Map<string, ValidationResult> {
  const results = new Map<string, ValidationResult>();
  
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const key = entry.id || entry.name || `index-${i}`;
    results.set(key, validateEntry(entry));
  }
  
  return results;
}

// ============================================================================
// UI Helper Functions
// ============================================================================

// Get UI control type for a property
export function getPropertyUIControl(schemaProp: PropertySchema): string {
  switch (schemaProp.type) {
    case 'boolean':
      return 'toggle';
    case 'enum':
      return 'dropdown';
    case 'number':
      return 'numericInput';
    case 'string':
      return 'textInput';
    case 'object':
      return 'groupedFields';
    default:
      return 'textInput';
  }
}

// Get all properties with their UI control types for a type schema
export function getTypeUIProperties(type: string): Array<{ key: string; schema: PropertySchema; uiControl: string }> {
  const schema = schemaRegistry[type];
  if (!schema) return [];
  
  return Object.entries(schema.properties).map(([key, propSchema]) => ({
    key,
    schema: propSchema,
    uiControl: getPropertyUIControl(propSchema),
  }));
}

// ============================================================================
// Export all schemas for convenience
// ============================================================================

export const schemas = {
  spell: spellSchema,
  monster: monsterSchema,
  item: itemSchema,
  class: classSchema,
  feat: featSchema,
  species: speciesSchema,
  background: backgroundSchema,
};
