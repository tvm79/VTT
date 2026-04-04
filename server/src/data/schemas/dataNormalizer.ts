/**
 * Generic Data Normalizer for VTT Compendium
 *
 * Goals:
 * - Keep imports system-agnostic (D&D, PF2e, etc.)
 * - Preserve original structure in `raw`
 * - Normalize broad metadata and move gameplay data into `system`
 */

export type PropertyType = 'boolean' | 'enum' | 'number' | 'string' | 'object' | 'array' | 'null';

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
  img?: string;
  imgToken?: string;
  imgSource?: string;
  imgFallback?: string;
  system: Record<string, any>;
  // Preserve original 5eTools data for types with nested features (like classFeature, subclass)
  raw?: Record<string, any>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export const schemaRegistry: Record<string, TypeSchema> = {};

export function getSchemaByType(_type: string): TypeSchema | undefined {
  return undefined;
}

const categoryToTypeMap: Record<string, string> = {
  spells: 'spell',
  monsters: 'monster',
  items: 'item',
  classes: 'class',
  feats: 'feat',
  species: 'species',
  races: 'species',
  backgrounds: 'background',
  conditions: 'condition',
};

const reservedMetaKeys = new Set([
  'id', '_id', 'name', 'type', 'category', 'description', 'desc', 'summary',
  'book', 'source', 'publisher', 'properties', 'system', 'raw', 'slug',
  'img', 'image', 'imageUrl', 'portrait', 'imgToken', 'tokenImage', 'tokenUrl', 'imgSource', 'imgFallback',
  'createdAt', 'updatedAt',
]);

const IMAGE_FIELD_ALIASES = {
  img: ['img', 'image', 'imageUrl', 'portrait'],
  imgToken: ['imgToken', 'tokenImage', 'tokenUrl'],
  imgSource: ['imgSource'],
  imgFallback: ['imgFallback'],
};

function pickStringField(source: Record<string, any>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function extractImageMetadata(data: any): Pick<NormalizedEntry, 'img' | 'imgToken' | 'imgSource' | 'imgFallback'> {
  const fromTopLevel = data && typeof data === 'object' ? data : {};
  const fromSystem = data?.system && typeof data.system === 'object' ? data.system : {};

  return {
    img: pickStringField(fromTopLevel, IMAGE_FIELD_ALIASES.img) || pickStringField(fromSystem, IMAGE_FIELD_ALIASES.img),
    imgToken: pickStringField(fromTopLevel, IMAGE_FIELD_ALIASES.imgToken) || pickStringField(fromSystem, IMAGE_FIELD_ALIASES.imgToken),
    imgSource: pickStringField(fromTopLevel, IMAGE_FIELD_ALIASES.imgSource) || pickStringField(fromSystem, IMAGE_FIELD_ALIASES.imgSource),
    imgFallback: pickStringField(fromTopLevel, IMAGE_FIELD_ALIASES.imgFallback) || pickStringField(fromSystem, IMAGE_FIELD_ALIASES.imgFallback),
  };
}

function normalizeKey(key: string): string {
  return key
    .trim()
    .replace(/[:\s]+$/g, '')
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .replace(/[\s_-]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^./, (c) => c.toLowerCase());
}

function normalizeObjectKeys(input: any): any {
  if (Array.isArray(input)) return input.map(normalizeObjectKeys);
  if (!input || typeof input !== 'object') return input;

  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(input)) {
    out[normalizeKey(k)] = normalizeObjectKeys(v);
  }
  return out;
}

function coercePrimitive(value: any): any {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (trimmed === '') return value;

  const lower = trimmed.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const asNum = Number(trimmed);
    if (!Number.isNaN(asNum)) return asNum;
  }

  return value;
}

function parseComponents(components: any): any {
  if (typeof components === 'object' && components !== null) {
    return {
      verbal: Boolean((components as any).verbal),
      somatic: Boolean((components as any).somatic),
      material: Boolean((components as any).material),
    };
  }

  if (typeof components !== 'string') return components;

  const upper = components.toUpperCase();
  return {
    verbal: upper.includes('V'),
    somatic: upper.includes('S'),
    material: upper.includes('M'),
  };
}

function normalizePropertyValue(key: string, value: any): any {
  if (key === 'components') return parseComponents(value);

  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === 'object' ? normalizeObjectKeys(item) : coercePrimitive(item)));
  }

  if (value && typeof value === 'object') {
    return normalizeObjectKeys(value);
  }

  return coercePrimitive(value);
}

function cleanInlineTags(text: string): string {
  // Convert tags like {@damage 1d6}, {@spell fireball|phb} to readable text.
  return text
    .replace(/\{@([a-zA-Z]+)\s+([^}|]+)(?:\|[^}]+)?\}/g, '$2')
    .replace(/\s+/g, ' ')
    .trim();
}

function flattenEntriesText(value: any): string[] {
  if (value === undefined || value === null) return [];
  if (typeof value === 'string') return [cleanInlineTags(value)];
  if (Array.isArray(value)) return value.flatMap(flattenEntriesText);
  if (typeof value === 'object') {
    const obj = value as Record<string, any>;
    if (typeof obj.entry === 'string') return [cleanInlineTags(obj.entry)];
    if (typeof obj.text === 'string') return [cleanInlineTags(obj.text)];
    if (obj.entries !== undefined) return flattenEntriesText(obj.entries);
    if (obj.items !== undefined) return flattenEntriesText(obj.items);
  }
  return [];
}

function deriveDescription(data: any): string | undefined {
  const direct = data?.description ?? data?.desc ?? data?.summary;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  const fromEntries = flattenEntriesText(data?.entries);
  if (fromEntries.length > 0) return fromEntries.join('\n\n');

  return undefined;
}

export function parseSkillProficiencies(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

export function parseToolProficiencies(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

export function parseAbilityScores(value: string | Record<string, number> | undefined): Record<string, number> {
  if (!value) return {};
  if (typeof value === 'object') return value;

  const result: Record<string, number> = {};
  for (const part of String(value).split(',').map((s) => s.trim())) {
    const match = part.match(/([A-Za-z]+)\s*\+\s*(\d+)/);
    if (match) result[match[1].toUpperCase()] = Number(match[2]);
  }
  return result;
}

export function parseEquipment(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Helper function to detect 5eTools background from nested entries (XPHB format)
// Backgrounds have entries with specific structure: Ability Scores, Feat, Skill Proficiencies, Tool Proficiency, Equipment
function detectBackgroundFromEntries(data: any): boolean {
  const entries = data?.entries;
  if (!entries || !Array.isArray(entries)) {
    console.log('[DEBUG detectBackgroundFromEntries] No entries array found');
    return false;
  }
  
  // Check if entries contain the characteristic background pattern
  // Look for entries with names like "Ability Scores:", "Feat:", "Skill Proficiencies:", etc.
  // Use more flexible matching to handle various 5eTools formats
  const backgroundIndicators = [
    'ability scores',
    'ability score',
    'feat:',
    'feat',
    'skill proficiency',
    'skill proficiencies',
    'tool proficiency',
    'tool proficiencies',
    'equipment:',
    'equipment'
  ];
  
  for (const entry of entries) {
    if (entry && typeof entry === 'object') {
      const name = String(entry.name || '').toLowerCase();
      console.log('[DEBUG detectBackgroundFromEntries] Checking entry name:', name);
      if (backgroundIndicators.some(indicator => name.includes(indicator))) {
        console.log('[DEBUG detectBackgroundFromEntries] MATCH FOUND:', name);
        return true;
      }
    }
  }
  
  console.log('[DEBUG detectBackgroundFromEntries] No match found');
  return false;
}

// Map 5eTools type codes to proper compendium types
const FIVE_TOOLS_TYPE_MAP: Record<string, string> = {
  // Items
  'item': 'item', 'items': 'item',
  'weapon': 'item', 'weapons': 'item', 'wpn': 'item',
  'armor': 'item', 'armors': 'item', 'arm': 'item',
  'gear': 'item', 'equipment': 'item', 'eqp': 'item',
  'tool': 'item', 'tools': 'item',
  'adventure gear': 'item', 'art': 'item', 'g': 'item',
  'wondrous item': 'item', 'wondrous': 'item', 'w': 'item',
  'munition': 'item', 'ammunition': 'item', 'amm': 'item',
  'rod': 'item', 'rods': 'item', 'rod dmg': 'item',
  'staff': 'item', 'staves': 'item', 'staff dmg': 'item',
  'wand': 'item', 'wands': 'item', 'wand dmg': 'item',
  'potion': 'item', 'potions': 'item', 'p': 'item',
  'ring': 'item', 'rings': 'item', 'r': 'item',
  'scroll': 'item', 'scrolls': 'item', 'scf': 'item',
  'trinket': 'item', 'trinkets': 'item', 't': 'item',
  'gem': 'item', 'gems': 'item',
  'jewelry': 'item',
  'art object': 'item', 'art objects': 'item',
  'container': 'item', 'containers': 'item',
  'mount': 'item', 'mounts': 'item', 'm': 'item',
  'vehicle': 'item', 'vehicles': 'item', 'veh': 'item',
  'tack and harness': 'item', 'th': 'item',
  'food and drink': 'item', 'fd': 'item',
  'instrument': 'item', 'instruments': 'item', 'ins': 'item',
  'weapon (simple melee)': 'item', 'weapon (simple ranged)': 'item',
  'weapon (martial melee)': 'item', 'weapon (martial ranged)': 'item',
  'armor (light)': 'item', 'armor (medium)': 'item', 'armor (heavy)': 'item',
  'armor (shield)': 'item',
  // Monsters
  'monster': 'monster', 'monsters': 'monster',
  'beast': 'monster', 'beasts': 'monster',
  'aberration': 'monster', 'celestials': 'monster',
  'construct': 'monster', 'dragon': 'monster', 'dragons': 'monster',
  'elemental': 'monster', 'fey': 'monster', 'fiend': 'monster',
  'giant': 'monster', 'humanoid': 'monster', 'monstrosity': 'monster',
  'ooze': 'monster', 'plant': 'monster', 'undead': 'monster',
  // Feats
  'feat': 'feat', 'feats': 'feat',
  // Conditions
  'condition': 'condition', 'conditions': 'condition',
  'disease': 'condition', 'diseases': 'condition',
  // Spells
  'spell': 'spell', 'spells': 'spell',
  // Classes
  'class': 'class', 'classes': 'class',
  // Subclasses
  'subclass': 'subclass', 'archetype': 'subclass',
  // Class features
  'class feature': 'classFeature', 'class features': 'classFeature',
  'subclass feature': 'subclassFeature', 'subclass features': 'subclassFeature',
  // Races/Species
  'race': 'species', 'races': 'species', 'species': 'species',
  // Backgrounds
  'background': 'background', 'backgrounds': 'background',
  // Optional features
  'optionalfeature': 'optionalfeature', 'optional features': 'optionalfeature',
  'eidolon': 'optionalfeature',
  // Deities
  'deity': 'deity', 'deities': 'deity',
  // Objects
  'object': 'object', 'objects': 'object',
  // Traps
  'trap': 'trap', 'traps': 'trap',
  // Hazards
  'hazard': 'hazard', 'hazards': 'hazard',
  // Rewards
  'reward': 'reward', 'rewards': 'reward',
  // Cults
  'cult': 'cult', 'cults': 'cult',
  // NPCs
  'npc': 'npc', 'npcs': 'npc',
  // Languages
  'language': 'language', 'languages': 'language',
  // Psionics
  'psionic': 'psionic', 'psionics': 'psionic',
  // Table
  'table': 'table', 'tables': 'table', 'tableGroups': 'table',
  // Book
  'book': 'book', 'books': 'book',
  // Note
  'note': 'note', 'notes': 'note',
  // Variantrule
  'variantrule': 'variantrule', 'variantrules': 'variantrule',
  // Adventure
  'adventure': 'adventure', 'adventures': 'adventure',
  // Encounter
  'encounter': 'encounter', 'encounters': 'encounter',
  // Image
  'image': 'image', 'images': 'image',
  // Map
  'map': 'map', 'maps': 'map',
  // Other
  'other': 'other',
};

export function inferType(data: any): string {
  if (typeof data?.type === 'string' && data.type.trim()) {
    let rawType = data.type.trim().toLowerCase();
    
    // Handle compound types like "r|xphb" - use the first part
    if (rawType.includes('|')) {
      rawType = rawType.split('|')[0].trim();
    }
    
    // Check if it's a known 5eTools type code
    if (FIVE_TOOLS_TYPE_MAP[rawType]) {
      return FIVE_TOOLS_TYPE_MAP[rawType];
    }
    // Fall back to normalizeKey for unknown types
    return normalizeKey(data.type).toLowerCase();
  }

  const category = String(data?.category || data?.Category || '').trim().toLowerCase();
  if (category && categoryToTypeMap[category]) return categoryToTypeMap[category];

  const props = data?.properties && typeof data.properties === 'object' ? data.properties : data;
  const normalizedProps = normalizeObjectKeys(props || {});

  // Check for 5eTools background (has skillProficiencies + startingEquipment, which is the signature combo)
  if (normalizedProps.skillProficiencies !== undefined && normalizedProps.startingEquipment !== undefined) {
    return 'background';
  }

  // Check for 5eTools background with nested entries (XPHB format)
  // Backgrounds have entries with specific structure: Ability Scores, Feat, Skill Proficiencies, etc.
  if (detectBackgroundFromEntries(data)) {
    return 'background';
  }

  // Check for 5eTools class (has classFeatures array but NOT subclassFeatures)
  // Classes have classFeatures (their own features), subclasses have subclassFeatures
  if (normalizedProps.classFeatures !== undefined && normalizedProps.subclassFeatures === undefined) {
    return 'class';
  }

  // Check for 5eTools subclass (has subclassFeatures but NOT classFeatures)
  if (normalizedProps.subclassFeatures !== undefined && normalizedProps.classFeatures === undefined) {
    return 'subclass';
  }

  // Check for 5eTools classFeature (has className and level but no hitDie)
  // This must run BEFORE the spell check since classFeature also has level
  if (normalizedProps.className !== undefined && normalizedProps.level !== undefined && normalizedProps.hitDie === undefined) {
    // Could be classFeature or subclassFeature - check for subclass specific fields
    if (normalizedProps.subclassShortName !== undefined || normalizedProps.subclassSource !== undefined) {
      return 'subclassFeature';
    }
    return 'classFeature';
  }

  if (normalizedProps.level !== undefined || normalizedProps.castingTime !== undefined || normalizedProps.school !== undefined) return 'spell';
  if (normalizedProps.challengeRating !== undefined || normalizedProps.cr !== undefined || normalizedProps.hitPoints !== undefined || normalizedProps.hp !== undefined) return 'monster';
  if (normalizedProps.hitDie !== undefined) return 'class';
  if (normalizedProps.prerequisites !== undefined && normalizedProps.benefits !== undefined) return 'feat';
  // 5eTools feats have prerequisites array but no classFeatures/hitDie/etc.
  if (Array.isArray(normalizedProps.prerequisites)) return 'feat';
  // 5eTools conditions have effect descriptions and no gameplay stats
  if (normalizedProps.effect !== undefined || normalizedProps.effects !== undefined) return 'condition';
  // 5eTools feats have prerequisites array but no classFeatures/hitDie/etc.
  if (Array.isArray(normalizedProps.prerequisites)) return 'feat';
  // 5eTools conditions have effect descriptions and no gameplay stats
  if (normalizedProps.effect !== undefined || normalizedProps.effects !== undefined) return 'condition';

  // Check for 5eTools race/species (has ability bonuses, speed, size, traits)
  // 5eTools races have: ability (ability bonuses), speed, size, traits
  if (normalizedProps.ability !== undefined || normalizedProps.abilityBonus !== undefined) {
    if (normalizedProps.speed !== undefined || normalizedProps.size !== undefined || normalizedProps.traitTags !== undefined) {
      return 'species';
    }
  }
  // Also check for speed + size combo without ability (some race formats)
  if (normalizedProps.speed !== undefined && normalizedProps.size !== undefined) {
    if (normalizedProps.traitTags !== undefined || normalizedProps.traits !== undefined) {
      return 'species';
    }
  }

  return 'item';
}

function normalize5eToolsClassData(data: any): Record<string, any> {
  const system: Record<string, any> = {};

  if (data?.hd && typeof data.hd === 'object') {
    system.hitDie = `d${data.hd.faces}`;
  }

  if (Array.isArray(data.proficiency)) {
    const abilityMap: Record<string, string> = {
      str: 'Strength', dex: 'Dexterity', con: 'Constitution',
      int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
    };
    system.savingThrows = data.proficiency
      .map((abbr: string) => abilityMap[String(abbr).toLowerCase()] || String(abbr))
      .join(', ');
  }

  if (Array.isArray(data.primaryAbility) && data.primaryAbility.length > 0) {
    const first = data.primaryAbility[0];
    if (typeof first === 'object') {
      const abilityName = Object.keys(first)[0];
      if (abilityName) {
        const abilityMap: Record<string, string> = {
          str: 'Strength', dex: 'Dexterity', con: 'Constitution',
          int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
        };
        system.primaryAbility = abilityMap[String(abilityName).toLowerCase()] || String(abilityName);
      }
    }
  }

  if (typeof data.spellcastingAbility === 'string') {
    const abilityMap: Record<string, string> = {
      str: 'Strength', dex: 'Dexterity', con: 'Constitution',
      int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
    };
    system.spellcastingAbility = abilityMap[String(data.spellcastingAbility).toLowerCase()] || String(data.spellcastingAbility);
  }

  if (data?.startingProficiencies && typeof data.startingProficiencies === 'object') {
    const sp = data.startingProficiencies;

    if (Array.isArray(sp.armor)) {
      system.armorProficiencies = sp.armor.map((a: any) => {
        if (typeof a === 'string') return a;
        if (typeof a === 'object' && a.proficiency) return a.proficiency;
        if (typeof a === 'object') return Object.keys(a)[0] || String(a);
        return String(a);
      }).filter(Boolean);
    }

    if (Array.isArray(sp.weapons)) {
      system.weaponProficiencies = sp.weapons.map((w: any) => {
        if (typeof w === 'string') {
          return w.replace(/\{@[^}]+\}/g, '').trim();
        }
        return String(w);
      }).filter(Boolean);
    }

    if (Array.isArray(sp.tools)) {
      system.toolProficiencies = sp.tools.map((t: any) => {
        if (typeof t === 'string') {
          return t.replace(/\{@[^}]+\}/g, '').trim();
        }
        if (typeof t === 'object') return Object.keys(t)[0] || String(t);
        return String(t);
      }).filter(Boolean).join(', ');
    } else if (Array.isArray(sp.toolProficiencies)) {
      system.toolProficiencies = sp.toolProficiencies.map((t: any) => {
        if (typeof t === 'object') return Object.keys(t)[0] || String(t);
        return String(t);
      }).filter(Boolean).join(', ');
    }

    if (Array.isArray(sp.skills)) {
      const skillParts: string[] = [];
      const skillChoices: any[] = [];
      for (const skill of sp.skills) {
        if (typeof skill === 'string') {
          skillParts.push(skill);
        } else if (typeof skill === 'object' && skill.choose && Array.isArray(skill.choose.from)) {
          skillChoices.push({
            count: skill.choose.count || 2,
            from: skill.choose.from.map((s: string) => s.replace(/\{@[^}]+\}/g, '').trim()),
          });
        } else if (typeof skill === 'object') {
          skillParts.push(Object.keys(skill).join(', '));
        }
      }
      if (skillParts.length > 0) {
        system.skillProficiencies = skillParts.join('; ');
      }
      if (skillChoices.length > 0) {
        system.skillChoices = skillChoices;
      }
    }
  }

  if (data?.startingEquipment && typeof data.startingEquipment === 'object') {
    // Preserve the raw startingEquipment structure so the client can parse choices
    system.startingEquipment = data.startingEquipment;
  }

  // Store classFeature definitions (full feature data with entries/descriptions)
  // 5eTools format: { "Rage": [{ name: "Rage", source: "PHB", level: 1, entries: [...] }], ... }
  if (data?.classFeature && typeof data.classFeature === 'object') {
    system.classFeature = data.classFeature;
  }

  // Store classFeatures (pipe-delimited name list for reference)
  if (Array.isArray(data.classFeatures)) {
    system.classFeatures = data.classFeatures;
  }

  if (data?.multiclassing && typeof data.multiclassing === 'object') {
    const mc = data.multiclassing;
    if (mc.requirements && typeof mc.requirements === 'object') {
      const reqs = Object.entries(mc.requirements)
        .filter(([k]) => k !== 'choose')
        .map(([k, v]) => {
          const abilityMap: Record<string, string> = {
            str: 'Strength', dex: 'Dexterity', con: 'Constitution',
            int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
          };
          return `${abilityMap[String(k).toLowerCase()] || k} ${v}`;
        });
      if (reqs.length > 0) {
        system.multiclassing = reqs.join(', ');
      }
    }
  }

  if (typeof data.subclassTitle === 'string') {
    system.subclassTitle = data.subclassTitle;
  }

  if (typeof data.casterProgression === 'string') {
    system.casterProgression = data.casterProgression;
  }
  if (typeof data.preparedSpells === 'string') {
    system.preparedSpells = data.preparedSpells;
  }
  if (typeof data.preparedSpellsChange === 'string') {
    system.preparedSpellsChange = data.preparedSpellsChange;
  }
  if (Array.isArray(data.cantripProgression)) {
    system.cantripProgression = data.cantripProgression;
  }

  return system;
}

export function transformLegacyToSystem(data: any, _type: string): Record<string, any> {
  const system: Record<string, any> = {};

  if (_type === 'class' && data?.hd) {
    const classSystem = normalize5eToolsClassData(data);
    Object.assign(system, classSystem);
  }

  const fromProperties = data?.properties && typeof data.properties === 'object' ? data.properties : {};
  for (const [rawKey, rawValue] of Object.entries(fromProperties)) {
    const key = normalizeKey(rawKey);
    if (!key || key === 'category') continue;
    if (system[key] === undefined) {
      system[key] = normalizePropertyValue(key, rawValue);
    }
  }

  for (const [rawKey, rawValue] of Object.entries(data || {})) {
    const key = normalizeKey(rawKey);
    if (!key || reservedMetaKeys.has(key)) continue;
    if (system[key] === undefined) system[key] = normalizePropertyValue(key, rawValue);
  }

  if (data?.system && typeof data.system === 'object') {
    for (const [rawKey, rawValue] of Object.entries(data.system)) {
      const key = normalizeKey(rawKey);
      if (!key) continue;
      system[key] = normalizePropertyValue(key, rawValue);
    }
  }

  return system;
}

export function normalizeEntry(data: any): NormalizedEntry {
  const type = inferType(data);
  const description = deriveDescription(data);
  const imageMeta = extractImageMetadata(data);

  // Preserve the FULL original 5eTools data in raw so API endpoints can return it
  // This ensures img, type, source, classFeature, entries, and all other fields are available
  const raw: Record<string, any> = data && typeof data === 'object' ? { ...data } : {};
  const hasRawData = Object.keys(raw).length > 0;

  const entry: NormalizedEntry = {
    id: data?.id || data?._id,
    type,
    name: data?.name || 'Unknown',
    book: data?.book || data?.source || data?.properties?.book,
    publisher: data?.publisher || data?.properties?.publisher,
    description,
    img: imageMeta.img,
    imgToken: imageMeta.imgToken,
    imgSource: imageMeta.imgSource,
    imgFallback: imageMeta.imgFallback,
    system: transformLegacyToSystem(data, type),
    ...(hasRawData ? { raw } : {}),
  };

  delete entry.system.img;
  delete entry.system.image;
  delete entry.system.imageUrl;
  delete entry.system.portrait;
  delete entry.system.imgToken;
  delete entry.system.tokenImage;
  delete entry.system.tokenUrl;
  delete entry.system.imgSource;
  delete entry.system.imgFallback;

  Object.keys(entry.system).forEach((key) => {
    const value = entry.system[key];
    if (value === undefined || value === null || value === '') delete entry.system[key];
  });

  return entry;
}

export function normalizeEntries(entries: any[]): NormalizedEntry[] {
  return entries.map(normalizeEntry);
}

export function validateEntry(entry: NormalizedEntry): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!entry.name || !entry.name.trim()) errors.push('Name is required');
  if (!entry.type || !entry.type.trim()) errors.push('Type is required');
  if (!entry.system || typeof entry.system !== 'object') errors.push('System must be an object');

  return { valid: errors.length === 0, errors, warnings };
}

export function validateEntries(entries: NormalizedEntry[]): Map<string, ValidationResult> {
  const results = new Map<string, ValidationResult>();
  entries.forEach((entry, i) => {
    const key = entry.id || entry.name || `index-${i}`;
    results.set(key, validateEntry(entry));
  });
  return results;
}

export function getPropertyUIControl(schemaProp: PropertySchema): string {
  switch (schemaProp.type) {
    case 'boolean': return 'toggle';
    case 'enum': return 'dropdown';
    case 'number': return 'numericInput';
    case 'object': return 'groupedFields';
    case 'array': return 'list';
    default: return 'textInput';
  }
}

export function getTypeUIProperties(type: string): Array<{ key: string; schema: PropertySchema; uiControl: string }> {
  const schema = schemaRegistry[type];
  if (!schema) return [];
  return Object.entries(schema.properties).map(([key, propSchema]) => ({
    key,
    schema: propSchema,
    uiControl: getPropertyUIControl(propSchema),
  }));
}

export const schemas = schemaRegistry;
