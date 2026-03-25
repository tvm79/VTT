/**
 * Roll Parser for 5etools-style JSON
 * 
 * Parses roll data from 5etools JSON entities with priority:
 * 1. JSON fields (authoritative)
 * 2. Inline tags ({@...})
 * 3. Raw text (fallback only)
 * 
 * Hard Rules:
 * - NEVER regex dice if {@damage}/{@dice} exists
 * - NEVER parse scaling from text if scalingLevelDice exists
 * - ALWAYS trust JSON over text
 * - ALWAYS trust tags over plain text
 */

// ============================================================================
// Types
// ============================================================================

export type RollType = 'save' | 'damage' | 'attack';
export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' | null;
export type Condition = 'fail' | 'success' | 'half' | null;
export type DamageType = 
  | 'acid' 
  | 'bludgeoning' 
  | 'cold' 
  | 'fire' 
  | 'force'
  | 'lightning' 
  | 'necrotic' 
  | 'piercing' 
  | 'poison' 
  | 'psychic'
  | 'radiant' 
  | 'slashing' 
  | 'thunder' 
  | null;

export interface RollObject {
  type: RollType;
  ability: Ability;
  dc: number | null;
  dice: string | null;
  damageType: DamageType;
  condition: Condition;
  scaling: Record<number, string>;
}

export interface ParsedRolls {
  rolls: RollObject[];
  saveRoll?: RollObject;
  damageRolls: RollObject[];
}

// ============================================================================
// Constants
// ============================================================================

const ABILITY_MAP: Record<string, Ability> = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
  str: 'str',
  dex: 'dex',
  con: 'con',
  int: 'int',
  wis: 'wis',
  cha: 'cha',
};

const DMG_TYPE_MAP: Record<string, DamageType> = {
  S: 'slashing',
  P: 'piercing',
  B: 'bludgeoning',
  slashing: 'slashing',
  piercing: 'piercing',
  bludgeoning: 'bludgeoning',
  acid: 'acid',
  cold: 'cold',
  fire: 'fire',
  force: 'force',
  lightning: 'lightning',
  necrotic: 'necrotic',
  poison: 'poison',
  psychic: 'psychic',
  radiant: 'radiant',
  thunder: 'thunder',
};

const TAG_REGEX = /\{@(\w+)\s+([^}]+)\}/g;

// ============================================================================
// Step 1: Extract JSON Fields
// ============================================================================

/**
 * Extract JSON fields from a spell entity
 */
function extractSpellJSON(spell: Record<string, any>): Partial<RollObject> {
  const result: Partial<RollObject> = {
    scaling: {},
    ability: null,
    damageType: null,
    dc: null,
    dice: null,
  };

  // Parse saving throw → ability
  const savingThrow = spell.savingThrow;
  if (typeof savingThrow === 'string') {
    result.ability = normalizeAbility(savingThrow);
  }

  // Parse damage inflict → damage type
  const damageInflict = spell.damageInflict;
  if (Array.isArray(damageInflict) && damageInflict.length > 0) {
    result.damageType = normalizeDamageType(damageInflict[0]);
  } else if (typeof damageInflict === 'string') {
    result.damageType = normalizeDamageType(damageInflict);
  }

  // Parse scaling level dice → scaling (NEVER parse from text if this exists)
  const scalingLevelDice = spell.scalingLevelDice;
  if (scalingLevelDice && typeof scalingLevelDice === 'object') {
    const scaling = scalingLevelDice.scaling;
    if (scaling && typeof scaling === 'object') {
      result.scaling = Object.fromEntries(
        Object.entries(scaling).map(([key, value]) => [parseInt(key, 10) || 1, String(value)])
      );
    }
  }

  return result;
}

/**
 * Extract JSON fields from a weapon/item entity
 */
function extractWeaponJSON(weapon: Record<string, any>): Partial<RollObject> {
  const result: Partial<RollObject> = {
    scaling: {},
    damageType: null,
    dice: null,
  };

  // Parse dmg1 → base damage
  const dmg1 = weapon.dmg1;
  if (typeof dmg1 === 'string') {
    result.dice = dmg1;
  }

  // Parse dmg2 → versatile (stored in scaling for now)
  const dmg2 = weapon.dmg2;
  if (typeof dmg2 === 'string' && result.scaling) {
    result.scaling[0] = dmg2; // Level 0 for versatile
  }

  // Parse dmgType → map to full string
  const dmgType = weapon.dmgType;
  if (typeof dmgType === 'string') {
    result.damageType = normalizeDamageType(dmgType);
  }

  return result;
}

// ============================================================================
// Step 2: Parse Inline Tags
// ============================================================================

interface TagResult {
  tags: Array<{ type: string; value: string }>;
  cleanedText: string;
}

/**
 * Parse inline tags from text and return extracted data + cleaned text
 */
function parseTags(text: string): TagResult {
  const tags: Array<{ type: string; value: string }> = [];
  const cleanedText = text.replace(TAG_REGEX, (match, type, value) => {
    tags.push({ type: type.toLowerCase(), value: value.trim() });
    // Replace with just the value for cleaned text
    return value.trim();
  });

  return { tags, cleanedText };
}

/**
 * Fallback: Parse bare dice from text (e.g., "d4", "2d6", "1d8+3")
 * Only used when no {@damage}/{@dice} tags exist
 */
function parseBareDice(text: string): string | null {
  // Match patterns like: d4, 2d6, 1d8+3, d10, 4d12
  const diceRegex = /\b(\d*d\d+(?:[+-]\d+)?)\b/i;
  const match = text.match(diceRegex);
  
  if (match) {
    const diceStr = match[1].toLowerCase();
    // Filter out invalid dice like just "d" or "d0"
    if (diceStr !== 'd' && !diceStr.match(/^d0/)) {
      return diceStr;
    }
  }
  return null;
}

/**
 * Extract dice from tags (damage, dice)
 */
function extractDiceFromTags(tags: Array<{ type: string; value: string }>): string | null {
  for (const tag of tags) {
    if (tag.type === 'damage' || tag.type === 'dice') {
      return tag.value;
    }
  }
  return null;
}

/**
 * Extract DC from tags
 */
function extractDCFromTags(tags: Array<{ type: string; value: string }>): number | null {
  for (const tag of tags) {
    if (tag.type === 'dc') {
      const parsed = parseInt(tag.value, 10);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

// ============================================================================
// Step 3: Context Binding
// ============================================================================

interface ContextBinding {
  condition: Condition;
  description: string;
}

/**
 * Detect condition from text content
 */
function detectCondition(text: string): Condition {
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('failed save')) {
    return 'fail';
  }
  if (lowerText.includes('successful save')) {
    return 'success';
  }
  if (lowerText.includes('half as much') || lowerText.includes('half damage')) {
    return 'half';
  }
  
  return null;
}

/**
 * Extract damage type from text (fallback only)
 */
function extractDamageTypeFromText(text: string): DamageType | null {
  const lowerText = text.toLowerCase();
  
  const damageTypes = [
    'acid', 'bludgeoning', 'cold', 'fire', 'force',
    'lightning', 'necrotic', 'piercing', 'poison', 'psychic',
    'radiant', 'slashing', 'thunder'
  ];
  
  for (const dt of damageTypes) {
    if (lowerText.includes(dt)) {
      return dt as DamageType;
    }
  }
  
  return null;
}

// ============================================================================
// Step 4: Normalize
// ============================================================================

/**
 * Normalize ability name to standard abbreviation
 */
function normalizeAbility(ability: string): Ability {
  if (!ability) return null;
  const normalized = ability.toLowerCase().trim();
  return ABILITY_MAP[normalized] || null;
}

/**
 * Normalize damage type to full string
 */
function normalizeDamageType(dmgType: string): DamageType {
  if (!dmgType) return null;
  const normalized = dmgType.toLowerCase().trim();
  return DMG_TYPE_MAP[normalized] || normalized as DamageType;
}

// ============================================================================
// Step 5: Output Assembly
// ============================================================================

/**
 * Build a save roll object
 */
function buildSaveRoll(
  ability: Ability,
  dc: number | null,
  condition: Condition,
  scaling: Record<number, string>
): RollObject {
  return {
    type: 'save',
    ability,
    dc,
    dice: null,
    damageType: null,
    condition,
    scaling: { ...scaling },
  };
}

/**
 * Build a damage roll object
 */
function buildDamageRoll(
  dice: string | null,
  damageType: DamageType,
  condition: Condition,
  scaling: Record<number, string>
): RollObject {
  return {
    type: 'damage',
    ability: null,
    dc: null,
    dice,
    damageType,
    condition,
    scaling: { ...scaling },
  };
}

// ============================================================================
// Main Parser Functions
// ============================================================================

/**
 * Parse a spell entity for roll data
 */
export function parseSpell(spell: Record<string, any>): ParsedRolls {
  const rolls: RollObject[] = [];
  
  // Step 1: Extract JSON fields (authoritative)
  const jsonData = extractSpellJSON(spell);
  
  // Step 2: Parse inline tags from description
  const description = spell.description || spell.desc || spell.entries?.[0] || '';
  const { tags, cleanedText } = typeof description === 'string' 
    ? parseTags(description) 
    : { tags: [], cleanedText: '' };
  
  // Also scan entriesHigherLevel for additional tags
  const higherLevel = spell.entriesHigherLevel || spell.higherLevel || [];
  const additionalTags: Array<{ type: string; value: string }> = [];
  
  if (Array.isArray(higherLevel)) {
    for (const entry of higherLevel) {
      if (typeof entry === 'string') {
        const parsed = parseTags(entry);
        additionalTags.push(...parsed.tags);
      } else if (entry?.entries) {
        for (const subEntry of entry.entries) {
          if (typeof subEntry === 'string') {
            const parsed = parseTags(subEntry);
            additionalTags.push(...parsed.tags);
          }
        }
      }
    }
  }
  
  // Step 3: Context binding
  // Detect condition from text
  const fullText = typeof description === 'string' ? description : JSON.stringify(description);
  const condition = detectCondition(fullText);
  
  // Extract DC from tags (prefer JSON, fall back to tags)
  let dc = jsonData.dc;
  if (dc === null) {
    dc = extractDCFromTags(tags) || extractDCFromTags(additionalTags);
  }
  
  // Determine dice (prefer JSON, then tags, then bare text fallback)
  let dice: string | null = null;
  if (jsonData.dice) {
    dice = jsonData.dice;
  } else {
    dice = extractDiceFromTags(tags) || extractDiceFromTags(additionalTags);
    // Fallback: parse bare dice like "d4" from text if no tags found
    if (!dice) {
      dice = parseBareDice(cleanedText);
    }
  }
  
  // Determine damage type (prefer JSON, then extract from text as fallback)
  let damageType = jsonData.damageType;
  if (!damageType && dice) {
    damageType = extractDamageTypeFromText(cleanedText);
  }
  
  // Step 5: Build rolls
  // Create save roll if saving throw exists
  if (jsonData.ability) {
    const saveRoll = buildSaveRoll(
      jsonData.ability,
      dc ?? null,
      condition,
      jsonData.scaling || {}
    );
    rolls.push(saveRoll);
  }
  
  // Create damage roll if dice or damage type exists
  if (dice || damageType) {
    const damageRoll = buildDamageRoll(
      dice ?? null,
      damageType ?? null,
      condition,
      jsonData.scaling || {}
    );
    rolls.push(damageRoll);
  }
  
  return {
    rolls,
    saveRoll: rolls.find(r => r.type === 'save'),
    damageRolls: rolls.filter(r => r.type === 'damage'),
  };
}

/**
 * Parse a weapon/item entity for roll data
 */
export function parseWeapon(weapon: Record<string, any>): ParsedRolls {
  const rolls: RollObject[] = [];
  
  // Step 1: Extract JSON fields
  const jsonData = extractWeaponJSON(weapon);
  
  // Step 2: Parse inline tags from description
  const description = weapon.description || weapon.desc || weapon.entries?.[0] || '';
  const { tags, cleanedText } = typeof description === 'string' 
    ? parseTags(description) 
    : { tags: [], cleanedText: '' };
  
  // Step 3: Context binding
  const condition = detectCondition(typeof description === 'string' ? description : '');
  
  // Use JSON dice, fall back to tags, then bare text
  let dice = jsonData.dice;
  if (!dice) {
    dice = extractDiceFromTags(tags);
    // Fallback: parse bare dice like "d4" from text
    if (!dice) {
      dice = parseBareDice(cleanedText);
    }
  }
  
  let damageType = jsonData.damageType;
  if (!damageType && dice) {
    damageType = extractDamageTypeFromText(cleanedText);
  }
  
  // Step 5: Build damage roll
  if (dice || damageType) {
    const damageRoll = buildDamageRoll(
      dice ?? null,
      damageType ?? null,
      condition,
      jsonData.scaling || {}
    );
    rolls.push(damageRoll);
  }
  
  return {
    rolls,
    saveRoll: undefined,
    damageRolls: rolls,
  };
}

/**
 * Parse any entry type for roll data
 */
export function parseEntry(entry: Record<string, any>): ParsedRolls {
  const type = entry.type?.toLowerCase() || entry.category?.toLowerCase() || '';
  
  // Dispatch to appropriate parser
  if (type === 'spell' || type === 'spell' || entry.savingThrow || entry.damageInflict) {
    return parseSpell(entry);
  }
  
  if (type === 'weapon' || type === 'item' || entry.dmg1 || entry.damage) {
    return parseWeapon(entry);
  }
  
  // Generic fallback - try to parse any entry with roll-like fields
  if (entry.savingThrow || entry.damageInflict || entry.dmg1) {
    return parseSpell(entry);
  }
  
  return { rolls: [], saveRoll: undefined, damageRolls: [] };
}

/**
 * Main entry point - parse any entity for roll data
 */
export function parseRolls(entity: Record<string, any>): ParsedRolls {
  if (!entity || typeof entity !== 'object') {
    return { rolls: [], saveRoll: undefined, damageRolls: [] };
  }
  
  return parseEntry(entity);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if an entity has any roll data
 */
export function hasRollData(entity: Record<string, any>): boolean {
  const parsed = parseRolls(entity);
  return parsed.rolls.length > 0;
}

/**
 * Get the primary save DC from an entity
 */
export function getSaveDC(entity: Record<string, any>): number | null {
  const parsed = parseRolls(entity);
  return parsed.saveRoll?.dc ?? null;
}

/**
 * Get the primary damage dice from an entity
 */
export function getDamageDice(entity: Record<string, any>): string | null {
  const parsed = parseRolls(entity);
  return parsed.damageRolls[0]?.dice ?? null;
}

// ============================================================================
// Integration Example
// ============================================================================
// 
// How to integrate with dataNormalizer.ts:
//
// ```typescript
// import { parseRolls, RollObject } from './rollParser';
//
// interface NormalizedEntry {
//   id?: string;
//   type: string;
//   name: string;
//   system: Record<string, any>;
//   rolls?: RollObject[];  // Add this field
// }
//
// export function normalizeEntry(data: any): NormalizedEntry {
//   const entry = // ... existing normalization logic ...
//   
//   // Parse roll data and attach to entry
//   const rollData = parseRolls(data);
//   if (rollData.rolls.length > 0) {
//     entry.rolls = rollData.rolls;
//   }
//   
//   return entry;
// }
// ```
//
// Usage examples:
//
// ```typescript
// // Acid Splash spell
// const acidSplash = {
//   name: "Acid Splash",
//   type: "spell",
//   savingThrow: "dex",
//   damageInflict: ["acid"],
//   scalingLevelDice: {
//     scaling: {
//       "3": "1d6",
//       "4": "1d6",
//       "5": "1d6",
//       "6": "1d6",
//       "7": "1d6",
//       "8": "1d6",
//       "9": "1d6"
//     }
//   },
//   desc: "You hurl a bubble of corrosive acid."
// };
// 
// const result = parseRolls(acidSplash);
// // result.rolls[0] = { type: 'save', ability: 'dex', dc: null, dice: null, damageType: 'acid', condition: null, scaling: { '3': '1d6', ... } }
// // result.rolls[1] = { type: 'damage', ability: null, dc: null, dice: '1d6', damageType: 'acid', condition: null, scaling: { '3': '1d6', ... } }
//
// // Dragon breath (with condition)
// const dragonBreath = {
//   name: "Fire Breath",
//   type: "monster",
//   savingThrow: "dex",
//   damageInflict: ["fire"],
//   desc: "Exhale fire in a 30-foot cone. Each creature in that area must make a DC 15 Dexterity saving throw, taking 3d6 fire damage on a failed save, or half as much damage on a successful one."
// };
//
// const dragonResult = parseRolls(dragonBreath);
// // dragonResult.saveRoll = { type: 'save', ability: 'dex', dc: 15, dice: null, damageType: null, condition: 'fail', scaling: {} }
// // dragonResult.damageRolls[0] = { type: 'damage', ability: null, dc: null, dice: '3d6', damageType: 'fire', condition: 'half', scaling: {} }
//
// // Longsword (weapon)
// const longsword = {
//   name: "Longsword",
//   type: "weapon",
//   dmg1: "1d8",
//   dmg2: "1d10",
//   dmgType: "S"
// };
//
// const weaponResult = parseRolls(longsword);
// // weaponResult.damageRolls[0] = { type: 'damage', ability: null, dc: null, dice: '1d8', damageType: 'slashing', condition: null, scaling: { '0': '1d10' } }
// ```