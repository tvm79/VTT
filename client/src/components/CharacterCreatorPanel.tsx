import { useState, useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { useGameStore } from '../store/gameStore';
import './CharacterCreatorWizard.css';

let compendiumItemTemplates: any[] = [];

const setCompendiumItemTemplates = (entries: any[]) => {
  compendiumItemTemplates = Array.isArray(entries) ? entries : [];
};

const sanitizeEquipmentText = (value: string) => String(value || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/^\([^)]+\)\s*/, '')
  .replace(/\s+/g, ' ')
  .trim();

const parseLeadingQuantity = (value: string): { quantity: number; text: string } => {
  const cleaned = sanitizeEquipmentText(value);
  const match = cleaned.match(/^(\d+)\s*x?\s+(.+)$/i);
  if (!match) return { quantity: 1, text: cleaned };
  return {
    quantity: Number(match[1]) || 1,
    text: sanitizeEquipmentText(match[2]),
  };
};

const getTemplateSource = (template: any): string => {
  const candidates = [
    template?.source,
    template?.book,
    template?.raw?.source,
    template?.raw?.book,
    template?.system?.source,
    template?.system?.source?.custom,
    template?.system?.source?.book,
  ];

  const match = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim());
  return typeof match === 'string' ? match.trim() : '';
};

const normalizeEquipmentName = (value: string) => String(value || '')
  .toLowerCase()
  .replace(/\{@item\s+/g, '')
  .replace(/\{@filter\s+/g, '')
  .replace(/\|[^}]*\}/g, '')
  .replace(/\|[^|]+$/g, '')
  .replace(/[()]/g, '')
  .replace(/^\d+x?\s+/i, '')
  .replace(/^set of\s+/i, '')
  .replace(/^a\s+|^an\s+|^the\s+/i, '')
  .replace(/\s+/g, ' ')
  .trim();

const isWeaponTemplate = (template: any): boolean => {
  const source = template?.raw || template || {};
  const system = source?.system || template?.system || {};
  const type = String(template?.type || source?.type || system?.type || '').toLowerCase();
  const itemType = String(source?.itemType || system?.itemType || '').toLowerCase();
  const category = String(source?.weaponCategory || system?.weaponCategory || '').toLowerCase();
  return type.includes('weapon')
    || type === 'wpn'
    || itemType === 'wpn'
    || category === 'simple'
    || category === 'martial'
    || Boolean(system?.weaponStats)
    || Boolean(source?.weapon || system?.weapon || source?.dmg1 || system?.dmg1 || source?.dmg2 || system?.dmg2 || system?.damage?.base);
};

const isRangedWeaponTemplate = (template: any): boolean => {
  const source = template?.raw || template || {};
  const system = source?.system || template?.system || {};
  const rangeText = [
    source?.weaponRange,
    system?.weaponRange,
    source?.range,
    system?.range?.units,
    system?.range?.value,
    system?.range?.long,
  ].map((entry) => String(entry || '').toLowerCase()).join(' ');
  const properties = ([] as any[])
    .concat(source?.property || [])
    .concat(system?.property || [])
    .concat(source?.properties || [])
    .concat(system?.properties || []);
  return rangeText.includes('ranged') || properties.some((prop) => ['a', 't', 'thrown', 'ammunition'].includes(String(prop).toLowerCase()));
};

const isMeleeWeaponTemplate = (template: any): boolean => isWeaponTemplate(template) && !isRangedWeaponTemplate(template);

const matchesEquipmentKeyword = (template: any, keyword: string): boolean => {
  const source = template?.raw || template || {};
  const system = source?.system || template?.system || {};
  const haystack = [
    template?.name,
    template?.type,
    source?.type,
    source?.itemType,
    source?.weaponCategory,
    system?.type,
    system?.itemType,
    system?.weaponCategory,
  ].map((entry) => String(entry || '').toLowerCase()).join(' ');

  if (keyword === 'weapon') return isWeaponTemplate(template);
  if (keyword === 'martial') return haystack.includes('martial');
  if (keyword === 'simple') return haystack.includes('simple');
  if (keyword === 'melee') return isMeleeWeaponTemplate(template);
  if (keyword === 'ranged') return isRangedWeaponTemplate(template);
  if (keyword === 'armor') return haystack.includes('armor') || Boolean(source?.armor || system?.armor);
  if (keyword === 'shield') return haystack.includes('shield') || Boolean(source?.shield || system?.shield);
  if (keyword === 'tool') return haystack.includes('tool') || Boolean(source?.tool || system?.tool);
  return haystack.includes(keyword);
};

const resolveItemFilterTemplates = (rawFilter: string): any[] => {
  const inner = String(rawFilter || '').replace(/^\{@filter\s*/i, '').replace(/\}$/g, '');
  const [expression = ''] = inner.split('|');
  const normalizedExpression = sanitizeEquipmentText(expression).toLowerCase();
  if (!normalizedExpression) return [];

  const keywords = normalizedExpression.split(/\s+/).filter(Boolean);
  const matches = compendiumItemTemplates.filter((template) => keywords.every((keyword) => matchesEquipmentKeyword(template, keyword)));
  return matches.slice(0, 50);
};

const findCompendiumItemTemplate = (name: string, source?: string): any | null => {
  const normalizedName = normalizeEquipmentName(name);
  const normalizedSource = String(source || '').trim().toLowerCase();
  const exact = compendiumItemTemplates.find((template) => {
    const templateName = normalizeEquipmentName(template?.name || template?.system?.name || '');
    if (templateName !== normalizedName) return false;
    if (!normalizedSource) return true;
    return getTemplateSource(template).toLowerCase() === normalizedSource;
  });
  if (exact) return exact;

  return compendiumItemTemplates.find((template) => {
    const templateName = normalizeEquipmentName(template?.name || template?.system?.name || '');
    return templateName === normalizedName || templateName.includes(normalizedName) || normalizedName.includes(templateName);
  }) || null;
};

type ExtractedEquipmentReference = {
  name: string;
  quantity?: number;
  raw?: any;
  template?: any;
};

const extractEquipmentReferences = (value: any): ExtractedEquipmentReference[] => {
  if (value == null) return [];

  if (typeof value === 'string') {
    const { quantity, text } = parseLeadingQuantity(value);
    if (!text) return [];

    const itemTagMatches = Array.from(text.matchAll(/\{@item\s+([^}|]+)(?:\|([^}]*))?\}/gi));
    if (itemTagMatches.length > 0) {
      return itemTagMatches.map((match) => {
        const name = sanitizeEquipmentText(match[1] || '');
        const source = sanitizeEquipmentText(match[2] || '');
        const template = findCompendiumItemTemplate(name, source);
        return {
          name: template?.name || name,
          quantity,
          raw: value,
          template: template || undefined,
        };
      });
    }

    if (/\{@filter\s+/i.test(text)) {
      const filterMatches = resolveItemFilterTemplates(text);
      if (filterMatches.length > 0) {
        return filterMatches.map((template) => ({
          name: template?.name || 'Unknown Item',
          quantity,
          raw: value,
          template,
        }));
      }
      return [];
    }

    const cleaned = sanitizeEquipmentText(text.split('|')[0]);
    const template = findCompendiumItemTemplate(cleaned);
    return [{ name: template?.name || cleaned, quantity, raw: value, template: template || undefined }];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractEquipmentReferences(entry));
  }

  if (typeof value === 'object') {
    if (typeof value.item === 'string') {
      const refs = extractEquipmentReferences(value.displayName || value.item);
      return refs.map((entry) => ({
        ...entry,
        quantity: value.quantity || entry.quantity,
        raw: value,
      }));
    }

    if (typeof value.equipmentType === 'string') {
      const templates = resolveItemFilterTemplates(`{@filter ${value.equipmentType}}`);
      return templates.map((template) => ({
        name: template?.name || value.equipmentType,
        quantity: value.quantity || 1,
        raw: value,
        template,
      }));
    }

    if (typeof value.special === 'string') {
      return [{ name: sanitizeEquipmentText(value.special), quantity: value.quantity || 1, raw: value }];
    }

    if (typeof value.displayName === 'string') {
      return extractEquipmentReferences({ item: value.displayName, quantity: value.quantity, raw: value });
    }

    return Object.values(value).flatMap((entry) => extractEquipmentReferences(entry));
  }

  return [];
};

const rollDiceExpression = (formula: string): number => {
  const cleaned = String(formula || '').trim().toLowerCase();
  if (!cleaned) return 0;
  if (/^\d+$/.test(cleaned)) return Number(cleaned);

  const compact = cleaned.replace(/\s+/g, '');
  const match = compact.match(/^(\d*)d(\d+)([+-]\d+)?(?:x(\d+))?$/i);
  if (!match) return 0;

  const count = Number(match[1] || 1);
  const die = Number(match[2] || 0);
  const modifier = Number(match[3] || 0);
  const multiplier = Number(match[4] || 1);
  const rolled = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * die)).reduce((sum: number, value: number) => sum + value, 0);
  return (rolled + modifier) * multiplier;
};

const parseCurrencyFromValue = (value: any): { cp: number; sp: number; gp: number; pp: number } => {
  const currency = { cp: 0, sp: 0, gp: 0, pp: 0 };
  if (value == null) return currency;

  if (typeof value === 'number') {
    currency.gp = value;
    return currency;
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) return currency;

    const explicitMatches = Array.from(normalized.matchAll(/([^,;+/]+?)\s*(cp|sp|gp|pp)\b/gi));
    if (explicitMatches.length > 0) {
      explicitMatches.forEach((match) => {
        const amount = rollDiceExpression(match[1].trim());
        const denom = String(match[2]).toLowerCase() as keyof typeof currency;
        currency[denom] += amount;
      });
      return currency;
    }

    currency.gp = rollDiceExpression(normalized);
    return currency;
  }

  if (typeof value === 'object') {
    (['cp', 'sp', 'gp', 'pp'] as const).forEach((denom) => {
      const candidate = value[denom];
      if (candidate != null) {
        currency[denom] += typeof candidate === 'number' ? candidate : rollDiceExpression(String(candidate));
      }
    });

    if (typeof value.amount !== 'undefined') {
      const denom = String(value.denomination || value.unit || 'gp').toLowerCase() as keyof typeof currency;
      if (denom in currency) {
        currency[denom] += typeof value.amount === 'number' ? value.amount : rollDiceExpression(String(value.amount));
      }
    }
  }

  return currency;
};

const mergeCurrency = (
  base: { cp: number; sp: number; gp: number; pp: number },
  addition: { cp: number; sp: number; gp: number; pp: number },
) => ({
  cp: base.cp + addition.cp,
  sp: base.sp + addition.sp,
  gp: base.gp + addition.gp,
  pp: base.pp + addition.pp,
});

const deriveStartingCurrency = (classData: any, backgroundData: any) => {
  const classSystem = typeof classData?.system === 'object' ? classData.system : {};
  const backgroundSystem = typeof backgroundData?.system === 'object' ? backgroundData.system : {};
  const classGold = classSystem?.startingEquipment?.gold ?? classSystem?.wealth ?? classSystem?.gold;
  const backgroundGold = backgroundSystem?.startingEquipment?.gold ?? backgroundSystem?.wealth ?? backgroundSystem?.gold;
  return mergeCurrency(parseCurrencyFromValue(classGold), parseCurrencyFromValue(backgroundGold));
};

type GroupedInventory = {
  weapon: any[];
  armor: any[];
  gear: any[];
  consumable: any[];
  tool: any[];
  other: any[];
};

const createEmptyGroupedInventory = (): GroupedInventory => ({
  weapon: [],
  armor: [],
  gear: [],
  consumable: [],
  tool: [],
  other: [],
});

const getWeaponProperties = (itemData: any): string[] => {
  const system = itemData?.system || {};
  const rawProperties = system?.property || system?.properties || itemData?.property || itemData?.properties || [];
  return Array.isArray(rawProperties) ? rawProperties.map((value) => String(value)) : [];
};

const detectInventoryGroup = (itemData: any): keyof GroupedInventory => {
  const source = itemData?.raw || itemData || {};
  const system = source?.system || itemData?.system || {};
  const typeText = [itemData?.type, source?.type, source?.itemType, system?.type, system?.itemType]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');

  if (isWeaponTemplate(itemData)) return 'weapon';
  if (typeText.includes('armor') || Boolean(source?.armor || system?.armor || source?.shield || system?.shield)) return 'armor';
  if (typeText.includes('consumable') || typeText.includes('potion') || typeText.includes('scroll') || typeText.includes('ammo')) return 'consumable';
  if (typeText.includes('tool') || Boolean(source?.tool || system?.tool)) return 'tool';
  if (typeText.includes('equipment') || typeText.includes('gear') || typeText.includes('item')) return 'gear';
  return 'other';
};

const getEmbeddedFeaturePool = (entity: any): any[] => {
  // Debug: show top-level keys in entity
  if (entity && typeof entity === 'object') {
    // Entity validation passed
  }
  
  // Look in multiple possible locations for embedded class features
  const system = typeof entity?.system === 'object' ? entity.system : {};
  const raw = typeof entity?.raw === 'object' ? entity.raw : {};
  const root = typeof entity === 'object' ? entity : {};

  console.log('[DEBUG getEmbeddedFeaturePool] entity id:', entity?.id);
  console.log('[DEBUG getEmbeddedFeaturePool] system keys:', Object.keys(system));
  console.log('[DEBUG getEmbeddedFeaturePool] system.subclass exists:', Array.isArray(system.subclass), 'length:', system.subclass?.length);
  if (Array.isArray(system.subclass) && system.subclass.length > 0) {
    console.log('[DEBUG] First subclass has keys:', Object.keys(system.subclass[0]));
    console.log('[DEBUG] First subclass classFeature:', system.subclass[0]?.classFeature);
  }
  // Also check raw
  console.log('[DEBUG getEmbeddedFeaturePool] raw keys:', Object.keys(raw));
  console.log('[DEBUG getEmbeddedFeaturePool] raw.subclass exists:', Array.isArray(raw.subclass), 'length:', raw.subclass?.length);
  if (Array.isArray(raw.subclass) && raw.subclass.length > 0) {
    console.log('[DEBUG] raw First subclass has keys:', Object.keys(raw.subclass[0]));
    console.log('[DEBUG] raw First subclass classFeature:', raw.subclass[0]?.classFeature);
  }
  
  // Also check root
  console.log('[DEBUG getEmbeddedFeaturePool] root keys:', Object.keys(root));
  console.log('[DEBUG getEmbeddedFeaturePool] root.classFeature exists:', Array.isArray(root.classFeature), 'length:', root.classFeature?.length);
  
  // Return embedded feature pool from entity

  // Collect from all possible locations in 5etools data
  // Note: 5etools structures include:
  // - raw.classFeature / raw.subclassFeature (singular, rarely used)
  // - raw.classFeatures / raw.subclassFeatures (plural, in preserved raw data)
  // - system.classFeatures / system.subclassFeatures (plural, at system root)
  // - class.subclass[n].classFeature (features inside each subclass entry)
  //   also subclass[n].features holds subclass features
  const pool: any[] = [
    // Direct classFeature arrays (singular forms)
    ...(Array.isArray(raw?.classFeature) ? raw.classFeature : []),
    ...(Array.isArray(raw?.subclassFeature) ? raw.subclassFeature : []),
    // Root level
    ...(Array.isArray(root?.classFeature) ? root.classFeature : []),
    ...(Array.isArray(root?.subclassFeature) ? root.subclassFeature : []),
    // System - plural forms - include BOTH strings and objects
    ...(Array.isArray(system?.classFeatures) ? system.classFeatures : []),
    ...(Array.isArray(system?.subclassFeatures) ? system.subclassFeatures : []),
    // RAW - plural forms (from preserved 5eTools data)
    ...(Array.isArray(raw?.classFeatures) ? raw.classFeatures : []),
    ...(Array.isArray(raw?.subclassFeatures) ? raw.subclassFeatures : []),
    // Check subclass array - each subclass entry may have classFeature or features
    ...(Array.isArray(system?.subclass) ? system.subclass.flatMap((sc: any) => 
      [
        ...(Array.isArray(sc?.classFeature) ? sc.classFeature : []),
        ...(Array.isArray(sc?.features) ? sc.features : []),
      ]
    ) : []),
    // Also raw.subclass (rare)
    ...(Array.isArray(raw?.subclass) ? raw.subclass.flatMap((sc: any) => 
      [
        ...(Array.isArray(sc?.classFeature) ? sc.classFeature : []),
        ...(Array.isArray(sc?.features) ? sc.features : []),
      ]
    ) : []),
  ];

  console.log('[DEBUG getEmbeddedFeaturePool] Final pool length:', pool.length);
  
  return pool;
};

const computeWeaponStats = (
  itemData: any,
  abilities: CharacterData['abilities'],
  proficiencyBonus: number,
) => {
  const system = itemData?.system || {};
  const properties = getWeaponProperties(itemData);
  const strengthMod = Math.floor((abilities.str - 10) / 2);
  const dexterityMod = Math.floor((abilities.dex - 10) / 2);
  const isFinesse = properties.includes('F');
  const isRanged = properties.includes('A') || properties.includes('R') || String(system?.weaponCategory || itemData?.weaponCategory || '').toLowerCase().includes('ranged');

  let ability: 'str' | 'dex' = 'str';
  let abilityMod = strengthMod;
  if (isRanged) {
    ability = 'dex';
    abilityMod = dexterityMod;
  }
  if (isFinesse && dexterityMod > strengthMod) {
    ability = 'dex';
    abilityMod = dexterityMod;
  }

  const baseDamage = system?.damage?.base
    ? `${system.damage.base.number || ''}d${system.damage.base.denomination || ''}`
    : (system?.dmg1 || itemData?.dmg1 || '');
  const extraAttackBonus = Number(system?.bonusWeapon || system?.attackBonus || itemData?.bonusWeapon || 0);
  const extraDamageBonus = Number(system?.bonusWeaponDamage || system?.damageBonus || system?.bonusWeapon || itemData?.bonusWeapon || 0);
  const attackBonus = proficiencyBonus + abilityMod + extraAttackBonus;
  const damageBonus = abilityMod + extraDamageBonus;
  const damage = baseDamage
    ? `${baseDamage}${damageBonus === 0 ? '' : damageBonus > 0 ? ` + ${damageBonus}` : ` - ${Math.abs(damageBonus)}`}`
    : '';

  return {
    ability,
    abilityModifier: abilityMod,
    proficient: true,
    proficiencyBonus,
    attackBonus,
    damage,
    baseDamage,
  };
};

const groupInventoryEntries = (entries: any[]): GroupedInventory => {
  const grouped = createEmptyGroupedInventory();
  entries.forEach((entry) => {
    const group = detectInventoryGroup(entry?.data || entry);
    grouped[group].push(entry);
  });
  return grouped;
};

const DND_SKILLS = [
  'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception', 'History',
  'Insight', 'Intimidation', 'Investigation', 'Medicine', 'Nature', 'Perception',
  'Performance', 'Persuasion', 'Religion', 'Sleight of Hand', 'Stealth', 'Survival',
] as const;

const ABILITY_SHORT_TO_FULL: Record<string, string> = {
  str: 'str', dex: 'dex', con: 'con', int: 'int', wis: 'wis', cha: 'cha',
  strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha',
};

const parseSkillChoices = (classSystem: any): { count: number; from: string[] } | null => {
  const skills = classSystem?.startingProficiencies?.skills;
  if (!skills) return null;

  if (typeof skills === 'string') {
    const match = skills.match(/choose\s+(\d+)\s+from\s+(.+)/i);
    if (match) {
      const count = parseInt(match[1], 10);
      const from = match[2].split(/[,;]\s*/).map((s: string) => s.trim().replace(/\.$/, ''));
      return { count, from };
    }
  }

  if (typeof skills === 'object' && skills.choose) {
    const count = skills.choose.count || skills.choose?.from?.length || 1;
    const from = skills.choose.from || [];
    return { count, from };
  }

  if (Array.isArray(skills)) {
    return { count: 1, from: skills };
  }

  return null;
};

const parseRacialAbilityBonuses = (raceSystem: any): Record<string, number> => {
  const bonuses: Record<string, number> = {};

  const raw = raceSystem?.abilityBonuses ?? raceSystem?.abilityScores;
  if (!raw) return bonuses;

  if (typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      const fullKey = ABILITY_SHORT_TO_FULL[key.toLowerCase()];
      if (fullKey && typeof value === 'number') {
        bonuses[fullKey] = (bonuses[fullKey] || 0) + value;
      }
    }
  }

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry === 'object') {
        for (const [key, value] of Object.entries(entry)) {
          const fullKey = ABILITY_SHORT_TO_FULL[key.toLowerCase()];
          if (fullKey && typeof value === 'number') {
            bonuses[fullKey] = (bonuses[fullKey] || 0) + value;
          }
        }
      }
    }
  }

  if (typeof raw === 'string') {
    const matches = raw.matchAll(/([+-]?\d+)\s+(strength|dexterity|constitution|intelligence|wisdom|charisma|str|dex|con|int|wis|cha)/gi);
    for (const match of matches) {
      const value = parseInt(match[1], 10);
      const fullKey = ABILITY_SHORT_TO_FULL[match[2].toLowerCase()];
      if (fullKey) {
        bonuses[fullKey] = (bonuses[fullKey] || 0) + value;
      }
    }
  }

  return bonuses;
};

const parseRaceSpeed = (raceSystem: any): number => {
  const speed = raceSystem?.speed;
  if (typeof speed === 'number') return speed;
  if (typeof speed === 'string') {
    const parsed = parseInt(speed, 10);
    if (!isNaN(parsed)) return parsed;
  }
  if (typeof speed === 'object' && speed !== null) {
    const walk = speed.walk ?? speed.fly ?? speed.swim ?? speed.climb ?? speed.burrow;
    if (typeof walk === 'number') return walk;
    if (typeof walk === 'string') {
      const parsed = parseInt(walk, 10);
      if (!isNaN(parsed)) return parsed;
    }
  }
  return 30;
};

const getAvailableSubclasses = (classData: any, level: number, allSubclasses: any[]): any[] => {
  if (!classData || !allSubclasses.length) return [];
  
  const className = classData?.name || classData?.system?.name || '';
  if (!className) return [];
  
  return allSubclasses.filter((sc: any) => {
    // Match by className field (stored in system or at top level)
    const scClassName = sc?.className || sc?.system?.className || sc?.system?.class || '';
    if (scClassName && scClassName.toLowerCase() === className.toLowerCase()) {
      const scLevel = sc?.level ?? sc?.system?.level ?? 3;
      return level >= scLevel;
    }
    // Also try matching by name prefix (e.g. "Arcane Tradition: School of Evocation" -> "Wizard")
    // This is a fallback for when className isn't set
    return false;
  });
};

const isSpellcastingClass = (classData: any): boolean => {
  const system = classData?.system;
  return Boolean(system?.spellcastingAbility);
};

const getSpellcastingAbilityName = (classData: any): string => {
  return classData?.system?.spellcastingAbility || '';
};

const getCantripsKnown = (classData: any, level: number): number => {
  const progression = classData?.system?.cantripProgression;
  if (Array.isArray(progression) && progression[level - 1] != null) {
    return progression[level - 1];
  }
  return 0;
};

const getSpellsKnown = (classData: any, level: number): number => {
  const className = classData?.name?.toLowerCase() || '';
  const spellcastingAbility = classData?.system?.spellcastingAbility;
  if (!spellcastingAbility) return 0;

  if (className.includes('sorcerer')) return Math.max(0, level + 1);
  if (className.includes('bard')) return Math.max(0, level + 2);
  if (className.includes('warlock')) return Math.max(0, level + 1);
  if (className.includes('ranger')) return Math.max(0, Math.floor(level / 2) + 1);
  if (className.includes('paladin')) return Math.max(0, Math.floor(level / 2) + 1);

  return Math.max(0, level * 2);
};

const shouldShowFeatStep = (raceData: any, level: number): boolean => {
  const raceName = raceData?.name?.toLowerCase() || '';
  if (raceName.includes('variant human') || raceName.includes('custom lineage')) return true;
  return level >= 4;
};

const getFeatCount = (raceData: any, level: number): number => {
  let count = 0;
  const raceName = raceData?.name?.toLowerCase() || '';
  if (raceName.includes('variant human') || raceName.includes('custom lineage')) count += 1;

  const asiLevels = [4, 8, 12, 16, 19];
  for (const asiLevel of asiLevels) {
    if (level >= asiLevel) count += 1;
  }

  return count;
};

// Types
interface CharacterData {
  name: string;
  playerName: string;
  level: number;
  race: any | null;
  class: any | null;
  background: any | null;
  subclass: any | null;
  abilities: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  equipment: ParsedEquipment[];
  skillProficiencies: string[];
  knownSpells: any[];
  selectedFeats: any[];
  alignment: string;
  age: string;
  height: string;
  weight: string;
  eyes: string;
  skin: string;
  hair: string;
  backstory: string;
  personalityTraits: string;
  ideals: string;
  bonds: string;
  flaws: string;
}

// Step definitions
type WizardStep = 'name' | 'race' | 'class' | 'subclass' | 'background' | 'abilities' | 'skills' | 'spells' | 'feats' | 'equipment' | 'review';

const STEPS: { key: WizardStep; label: string; icon: string }[] = [
  { key: 'name', label: 'Name', icon: 'user' },
  { key: 'race', label: 'Race', icon: 'user-group' },
  { key: 'class', label: 'Class', icon: 'book' },
  { key: 'subclass', label: 'Subclass', icon: 'layer-group' },
  { key: 'background', label: 'Background', icon: 'star' },
  { key: 'abilities', label: 'Abilities', icon: 'dumbbell' },
  { key: 'skills', label: 'Skills', icon: 'check-circle' },
  { key: 'spells', label: 'Spells', icon: 'scroll' },
  { key: 'feats', label: 'Feats', icon: 'award' },
  { key: 'equipment', label: 'Equipment', icon: 'shield' },
  { key: 'review', label: 'Review', icon: 'check' },
];

// Default ability scores (standard array)
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const ABILITY_NAMES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

// Equipment parsing helpers
interface ParsedEquipment {
  id: string;
  name: string;
  type: string;
  quantity: number;
  source?: string;
  raw?: any;
  template?: any;
}

interface EquipmentChoiceOption {
  id: string;
  label: string;
  items: ParsedEquipment[];
}

interface EquipmentChoiceGroup {
  id: string;
  label: string;
  source: string;
  choose: number;
  options: EquipmentChoiceOption[];
}

const mergeParsedEquipment = (existing: ParsedEquipment[], additions: ParsedEquipment[]) => {
  const result = [...existing];
  additions.forEach((entry) => {
    const normalized = normalizeEquipmentName(entry.name);
    const alreadyExists = result.some((candidate) => normalizeEquipmentName(candidate.name) === normalized);
    if (!alreadyExists) {
      result.push(entry);
    }
  });
  return result;
};

const createParsedEquipmentEntries = (
  value: any,
  type: string,
  source: string,
  prefix: string,
  seed: string,
): ParsedEquipment[] => extractEquipmentReferences(value).map((entry, index) => ({
  id: `${prefix}-${seed}-${index}`,
  name: entry.template?.name || entry.name,
  type,
  quantity: entry.quantity || 1,
  source,
  raw: entry.raw ?? value,
  template: entry.template,
}));

const describeEquipmentChoice = (value: any): string => {
  const refs = extractEquipmentReferences(value);
  if (refs.length > 0) {
    return refs.map((entry) => entry.quantity && entry.quantity > 1 ? `${entry.quantity} × ${entry.name}` : entry.name).join(', ');
  }

  if (typeof value === 'string') {
    return value.replace(/^\([^)]+\)\s*/, '').trim();
  }

  if (typeof value?.displayName === 'string') return value.displayName;
  if (typeof value?.special === 'string') return value.special;
  if (typeof value?.equipmentType === 'string') return value.equipmentType;
  return 'Option';
};

const buildEquipmentChoiceOptions = (
  value: any,
  type: string,
  source: string,
  groupId: string,
): EquipmentChoiceOption[] => {
  if (value == null) return [];

  // Check for " or " FIRST — this handles "(a) ... or (b) ..." choice strings
  // Must come before the {@filter} check because choice strings often contain both
  if (typeof value === 'string' && /\s+or\s+/i.test(value)) {
    return value
      .split(/\s+or\s+/i)
      .map((part, index) => {
        const items = createParsedEquipmentEntries(part, type, source, 'choice', `${groupId}-${index}`);
        if (items.length === 0) return null;
        return {
          id: `${groupId}-option-${index}`,
          label: describeEquipmentChoice(part),
          items,
        };
      })
      .filter(Boolean) as EquipmentChoiceOption[];
  }

  if (typeof value === 'string' && /\{@filter\s+/i.test(value)) {
    return createParsedEquipmentEntries(value, type, source, 'choice', `${groupId}-filter`)
      .map((item, index) => ({
        id: `${groupId}-option-${index}`,
        label: describeEquipmentChoice(item.name),
        items: [item],
      }));
  }

  if (typeof value === 'object' && typeof value?.equipmentType === 'string') {
    return createParsedEquipmentEntries(value, type, source, 'choice', `${groupId}-equipment-type`)
      .map((item, index) => ({
        id: `${groupId}-option-${index}`,
        label: describeEquipmentChoice(item.name),
        items: [item],
      }));
  }

  if (Array.isArray(value)) {
    return value
      .map((entry, index) => {
        const items = createParsedEquipmentEntries(entry, type, source, 'choice', `${groupId}-${index}`);
        if (items.length === 0) return null;
        return {
          id: `${groupId}-option-${index}`,
          label: describeEquipmentChoice(entry),
          items,
        };
      })
      .filter(Boolean) as EquipmentChoiceOption[];
  }

  if (typeof value === 'object') {
    const branchKeys = ['a', 'b', 'c', 'd', 'e'].filter((key) => value[key] != null);
    if (branchKeys.length > 0) {
      return branchKeys
        .map((key, index) => {
          const branchValue = value[key];
          const items = createParsedEquipmentEntries(branchValue, type, source, 'choice', `${groupId}-${key}`);
          if (items.length === 0) return null;
          return {
            id: `${groupId}-option-${index}`,
            label: describeEquipmentChoice(branchValue),
            items,
          };
        })
        .filter(Boolean) as EquipmentChoiceOption[];
    }

    if (Array.isArray(value.from)) {
      return value.from
        .map((entry: any, index: number) => {
          const items = createParsedEquipmentEntries(entry, type, source, 'choice', `${groupId}-from-${index}`);
          if (items.length === 0) return null;
          return {
            id: `${groupId}-option-${index}`,
            label: describeEquipmentChoice(entry),
            items,
          };
        })
        .filter(Boolean) as EquipmentChoiceOption[];
    }
  }

  return [];
};

const applyEquipmentChoiceSelections = (
  granted: ParsedEquipment[],
  groups: EquipmentChoiceGroup[],
  selections: Record<string, string[]>,
): ParsedEquipment[] => {
  let result = [...granted];
  groups.forEach((group) => {
    const selectedIds = selections[group.id] || [];
    group.options.forEach((option) => {
      if (selectedIds.includes(option.id)) {
        result = mergeParsedEquipment(result, option.items);
      }
    });
  });
  return result;
};

// Parse class starting equipment from 5e.tools data structure
const parseClassEquipment = (classData: any, existingEquipment: ParsedEquipment[]): { granted: ParsedEquipment[]; choices: EquipmentChoiceGroup[] } => {
  let equipment: ParsedEquipment[] = [];
  const choices: EquipmentChoiceGroup[] = [];
  const classSystem = classData?.system || {};
  const className = classData?.name || 'Class';
  const classId = classData?.id || 'unknown';

  if (!classSystem) return { granted: equipment, choices };

  const addGranted = (value: any, seed: string) => {
    equipment = mergeParsedEquipment(
      [...existingEquipment, ...equipment],
      createParsedEquipmentEntries(value, 'class', className, 'eq', `${classId}-${seed}`),
    ).filter((entry, index, array) => array.findIndex((candidate) => normalizeEquipmentName(candidate.name) === normalizeEquipmentName(entry.name)) >= index);
  };

  const addChoiceGroup = (value: any, seed: string, label: string, choose: number = 1) => {
    const groupId = `class-choice-${classId}-${seed}`;
    const options = buildEquipmentChoiceOptions(value, 'class', className, groupId);
    if (options.length > 1) {
      choices.push({
        id: groupId,
        label,
        source: className,
        choose: Math.max(1, choose),
        options,
      });
      return true;
    }
    return false;
  };

  const se = classSystem.startingEquipment || 
             classSystem.equipment || 
             classSystem.items;

  if (se) {
    if (se.default && Array.isArray(se.default)) {
      se.default.forEach((item: any, index: number) => {
        if (!addChoiceGroup(item, `default-${index}`, `Choose class equipment (${index + 1})`)) {
          addGranted(item, `default-${index}`);
        }
      });
    }

    if (Array.isArray(se)) {
      se.forEach((item: any, index: number) => {
        if (!addChoiceGroup(item, `array-${index}`, `Choose class equipment (${index + 1})`)) {
          addGranted(item, `array-${index}`);
        }
      });
    }
  }

  const startingEquipmentDefault = classSystem.startingEquipmentDefault;
  if (Array.isArray(startingEquipmentDefault)) {
    startingEquipmentDefault.forEach((entry: any, index: number) => {
      if (!addChoiceGroup(entry, `default-branch-${index}`, `Choose class loadout (${index + 1})`)) {
        addGranted(entry, `default-branch-${index}`);
      }
    });
  }

  const startingEquipmentOptions = classSystem.startingEquipmentOptions;
  if (Array.isArray(startingEquipmentOptions)) {
    startingEquipmentOptions.forEach((entry: any, index: number) => {
      const value = entry?.from ?? entry;
      addChoiceGroup(value, `option-${index}`, entry?.label || `Choose class equipment (${index + 1})`, Number(entry?.count) || 1);
    });
  }

  equipment = mergeParsedEquipment(existingEquipment, equipment).filter((entry) => !existingEquipment.some((candidate) => normalizeEquipmentName(candidate.name) === normalizeEquipmentName(entry.name)));
  return { granted: equipment, choices };
};

// Parse background starting equipment
const parseBackgroundEquipment = (bgData: any, existingEquipment: ParsedEquipment[]): { granted: ParsedEquipment[]; choices: EquipmentChoiceGroup[] } => {
  let equipment: ParsedEquipment[] = [];
  const choices: EquipmentChoiceGroup[] = [];
  const bgSystem = bgData?.system || {};
  const bgName = bgData?.name || 'Background';
  const bgId = bgData?.id || 'unknown';

  if (!bgSystem) return { granted: equipment, choices };

  const addGranted = (value: any, seed: string) => {
    equipment = mergeParsedEquipment(
      [...existingEquipment, ...equipment],
      createParsedEquipmentEntries(value, 'background', bgName, 'bg', `${bgId}-${seed}`),
    ).filter((entry, index, array) => array.findIndex((candidate) => normalizeEquipmentName(candidate.name) === normalizeEquipmentName(entry.name)) >= index);
  };

  const addChoiceGroup = (value: any, seed: string, label: string, choose: number = 1) => {
    const groupId = `background-choice-${bgId}-${seed}`;
    const options = buildEquipmentChoiceOptions(value, 'background', bgName, groupId);
    if (options.length > 1) {
      choices.push({
        id: groupId,
        label,
        source: bgName,
        choose: Math.max(1, choose),
        options,
      });
      return true;
    }
    return false;
  };

  const se = bgSystem.startingEquipment || bgSystem.equipment || bgSystem.items;

  if (se) {
    if (Array.isArray(se)) {
      se.forEach((item: any, index: number) => {
        if (!addChoiceGroup(item, `array-${index}`, `Choose background equipment (${index + 1})`)) {
          addGranted(item, `array-${index}`);
        }
      });
    } else if (se.default && Array.isArray(se.default)) {
      se.default.forEach((item: any, index: number) => {
        if (!addChoiceGroup(item, `default-${index}`, `Choose background equipment (${index + 1})`)) {
          addGranted(item, `default-${index}`);
        }
      });
    } else if (!addChoiceGroup(se, 'single', 'Choose background equipment')) {
      addGranted(se, 'single');
    }
  }

  equipment = mergeParsedEquipment(existingEquipment, equipment).filter((entry) => !existingEquipment.some((candidate) => normalizeEquipmentName(candidate.name) === normalizeEquipmentName(entry.name)));
  return { granted: equipment, choices };
};

export function CharacterCreatorPanel() {
  const {
    characterCreatorWizardVisible,
    setCharacterCreatorWizardVisible,
    characterCreatorWizardPosition,
    setCharacterCreatorWizardPosition,
    characterCreatorWizardSize,
    setCharacterCreatorWizardSize,
    session,
    colorScheme,
    addFloatingPanel,
  } = useGameStore();
  
  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>('name');
  const [characterData, setCharacterData] = useState<CharacterData>({
    name: '',
    playerName: '',
    level: 1,
    race: null,
    class: null,
    background: null,
    subclass: null,
    abilities: {
      str: 10,
      dex: 10,
      con: 10,
      int: 10,
      wis: 10,
      cha: 10,
    },
    equipment: [],
    skillProficiencies: [],
    knownSpells: [],
    selectedFeats: [],
    alignment: '',
    age: '',
    height: '',
    weight: '',
    eyes: '',
    skin: '',
    hair: '',
    backstory: '',
    personalityTraits: '',
    ideals: '',
    bonds: '',
    flaws: '',
  });
  
  // Data from DataManager
  const [races, setRaces] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [subclasses, setSubclasses] = useState<any[]>([]);
  const [backgrounds, setBackgrounds] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [baseEquipment, setBaseEquipment] = useState<ParsedEquipment[]>([]);
  const [equipmentChoiceGroups, setEquipmentChoiceGroups] = useState<EquipmentChoiceGroup[]>([]);
  const [equipmentSelections, setEquipmentSelections] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Search/filter state for each step
  const [searchQuery, setSearchQuery] = useState('');
  const [spellSearch, setSpellSearch] = useState('');
  const [spellResults, setSpellResults] = useState<any[]>([]);
  const [spellLoading, setSpellLoading] = useState(false);
  const [spellLevelFilter, setSpellLevelFilter] = useState(-1);
  const [featSearch, setFeatSearch] = useState('');
  const [featResults, setFeatResults] = useState<any[]>([]);
  const [featLoading, setFeatLoading] = useState(false);
  
  // Current step index
  const currentStepIndex = STEPS.findIndex(s => s.key === currentStep);
  
  // Drag/resize state
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const compendiumCacheRef = useRef<Record<string, any[]>>({});
  
  // Fetch data from API
  const fetchDataByType = async (type: string): Promise<any[]> => {
    const cached = compendiumCacheRef.current[type];
    if (cached) {
      console.log('[DEBUG fetchDataByType] Cache hit for', type, ':', cached.length, 'items');
      return cached;
    }

    const dbTypes = type === 'race' ? ['species', 'race'] : [type];
    const limit = type === 'item' || type === 'spell' || type === 'feat' || type === 'optionalfeature' || type === 'classFeature'
      ? 5000
      : 1000;
    
    try {
      const allItems: any[] = [];
      for (const dbType of dbTypes) {
        const url = `/api/data/compendium/${dbType}?limit=${limit}`;
        console.log('[DEBUG fetchDataByType] Fetching', url);
        const res = await fetch(url);
        if (res.ok) {
          const response = await res.json();
          const data = Array.isArray(response) ? response : (response.data || response.results || []);
          console.log('[DEBUG fetchDataByType]', dbType, '->', data.length, 'items, response keys:', Object.keys(response));
          allItems.push(...data);
        } else {
          console.log('[DEBUG fetchDataByType]', dbType, '-> failed, status:', res.status);
        }
      }
      console.log('[DEBUG fetchDataByType]', type, '-> total:', allItems.length);
      compendiumCacheRef.current[type] = allItems;
      return allItems;
    } catch (error) {
      console.error('Failed to fetch ' + type + ':', error);
      return [];
    }
  };

  const fetchFullCompendiumEntry = async (id: string, fallback: any) => {
    try {
      const res = await fetch(`/api/data/compendium/entry/${encodeURIComponent(id)}`);
      if (!res.ok) return fallback;
      const fullData = await res.json();
      return { ...fallback, ...fullData };
    } catch {
      return fallback;
    }
  };
  
  // Load data when wizard opens
  useEffect(() => {
    if (!characterCreatorWizardVisible) return;
    
    // Clear cache to ensure fresh data
    compendiumCacheRef.current = {};
    
    const loadData = async () => {
      setLoading(true);
      try {
        const [raceData, classData, subclassData, bgData, itemData] = await Promise.all([
          fetchDataByType('race'),
          fetchDataByType('class'),
          fetchDataByType('subclass'),
          fetchDataByType('background'),
          fetchDataByType('item'),
        ]);
        setRaces(raceData);
        console.log('[DEBUG CharacterCreator] Races loaded:', raceData.length, raceData.slice(0, 3).map((r: any) => r.name));
        setClasses(classData);
        setSubclasses(subclassData);
        console.log('[DEBUG CharacterCreator] Subclasses loaded:', subclassData.length, subclassData.slice(0, 3).map((s: any) => s.name));
        setBackgrounds(bgData);
        setItems(itemData);
        setCompendiumItemTemplates(itemData);
      } catch (error) {
        console.error('Failed to load character creation data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [characterCreatorWizardVisible, session]);
  
  // Filter items based on search
  const filterItems = (items: any[]) => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter(item => 
      item.name?.toLowerCase().includes(query) ||
      item.system?.name?.toLowerCase().includes(query)
    );
  };

  // Deduplicate items by id+source to prevent React key warnings from duplicate DB entries
  const deduplicateItems = (items: any[]): any[] => {
    const seen = new Set<string>();
    return items.filter(item => {
      const key = `${item.id}-${item.source || item.book || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const hasRequiredEquipmentSelections = equipmentChoiceGroups.every((group) => {
    const selected = equipmentSelections[group.id] || [];
    return selected.length >= Math.min(group.choose, group.options.length);
  });

  const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

  const normalizeItemName = (value: string) => normalizeEquipmentName(value);

  const findItemTemplateByName = (name: string) => {
    return findCompendiumItemTemplate(name) || items.find((item: any) => {
      const normalized = normalizeItemName(name);
      const itemName = normalizeItemName(item?.name || item?.system?.name || '');
      return itemName === normalized || itemName.includes(normalized) || normalized.includes(itemName);
    }) || null;
  };

  const toInventoryEntry = (entry: any, index: number) => {
    const lookupName = entry?.name || entry?.item || entry?.equipmentType || entry?.special || '';
    const sourceTemplate = entry?.template || findItemTemplateByName(lookupName);
    const templateData = sourceTemplate ? deepClone(sourceTemplate) : {
      name: lookupName || `Item ${index + 1}`,
      type: entry?.type || 'equipment',
      system: {
        quantity: entry?.quantity || 1,
        source: entry?.source || null,
      },
    };

    if (!templateData.system || typeof templateData.system !== 'object') {
      templateData.system = {};
    }

    templateData.system.quantity = entry?.quantity || templateData.system.quantity || 1;
    if (entry?.source && !templateData.system.source) {
      templateData.system.source = entry.source;
    }
    templateData.system.vttGroup = detectInventoryGroup(templateData);

    return {
      id: entry?.id || sourceTemplate?.id || `starting-eq-${index}`,
      type: String(templateData.type || entry?.type || 'equipment').toLowerCase(),
      addedAt: new Date().toISOString(),
      data: templateData,
    };
  };

  const parseReferenceName = (value: any) => {
    if (value == null) return '';
    if (typeof value === 'string') return String(value).split('|')[0].trim();
    if (typeof value?.classFeature === 'string') return String(value.classFeature).split('|')[0].trim();
    if (typeof value?.subclassFeature === 'string') return String(value.subclassFeature).split('|')[0].trim();
    if (typeof value?.item === 'string') return String(value.item).split('|')[0].trim();
    if (typeof value?.name === 'string') return value.name;
    return '';
  };

  const parseFeatureReference = (value: any) => {
    const raw = typeof value === 'string'
      ? value
      : typeof value?.classFeature === 'string'
        ? value.classFeature
        : typeof value?.subclassFeature === 'string'
          ? value.subclassFeature
          : '';

    const [name = '', className = '', source = '', level = ''] = String(raw).split('|');
    return {
      raw,
      name: name.trim(),
      className: className.trim(),
      source: source.trim(),
      level: Number(level) || null,
    };
  };

  const resolveFeatureFromEntity = (feature: any, entity: any) => {
    const ref = parseFeatureReference(feature?.data ?? feature);
    if (!ref.name) {
      return null;
    }


    
    const inlineFeatures = getEmbeddedFeaturePool(entity);

    // Lenient match: first try exact match, fallback to name-only fuzzy
    const match = inlineFeatures.find((entry: any) => {
      const entryName = String(entry?.name || '').trim().toLowerCase();
      const refName = ref.name.toLowerCase();
      // Check name match (exact or partial contains)
      const sameName = entryName === refName || entryName.includes(refName) || refName.includes(entryName);
      // If name matches, don't require extra fields for stricter check
      if (sameName) return true;
      return false;
    });

    if (match) {
      return deepClone(match);
    }
    
    return null;
  };

  const resolveTemplateByName = async (types: string[], rawReference: any) => {
    const referenceName = parseReferenceName(rawReference);
    const featureRef = parseFeatureReference(rawReference);
    if (!referenceName) {
      return null;
    }


    console.log('[DEBUG resolveTemplateByName] referenceName:', referenceName, 'featureRef:', JSON.stringify(featureRef));
    
    const expandedTypes = Array.from(new Set(types.flatMap((type) => {
      const lowered = type.toLowerCase();
      return [type, lowered, lowered.replace(/feature/g, 'feature')];
    })));
    
    console.log('[DEBUG resolveTemplateByName] Expanded types to search:', expandedTypes);

    for (const type of expandedTypes) {
      console.log('[DEBUG resolveTemplateByName] Checking type:', type);
      const records = await fetchDataByType(type);
      console.log('[DEBUG resolveTemplateByName] Found', records.length, 'records for type:', type);
      
      const match = records.find((record: any) => {
        const recordSource = String(record?.source || record?.book || record?.raw?.source || record?.raw?.book || '').trim().toLowerCase();
        const recordClassName = String(record?.system?.className || record?.raw?.className || record?.raw?.class || '').trim().toLowerCase();
        const recordLevel = Number(record?.system?.level ?? record?.raw?.level ?? record?.level);
        const recordName = normalizeItemName(record?.name || record?.system?.name || '');
        const desiredName = normalizeItemName(referenceName);
        const nameMatch = recordName === desiredName || recordName.includes(desiredName) || desiredName.includes(recordName);
        const classMatch = !featureRef.className || recordClassName === featureRef.className.toLowerCase();
        const sourceMatch = !featureRef.source || !recordSource || recordSource === featureRef.source.toLowerCase();
        const levelMatch = featureRef.level == null || Number.isNaN(recordLevel) || recordLevel === featureRef.level;
        return nameMatch && classMatch && sourceMatch && levelMatch;
      });
      if (match) {
        console.log('[DEBUG resolveTemplateByName] FOUND MATCH:', match.name, 'type:', type);
        const fullMatch = await fetchFullCompendiumEntry(match.id, match);
        return deepClone(fullMatch);
      }
    }

    return null;
  };

  const hydrateInventoryEntry = async (entry: any, index: number) => {
    const resolvedTemplate = entry?.template
      ? deepClone(entry.template)
      : await resolveTemplateByName(['item'], entry?.raw ?? entry?.name ?? entry);
    if (!resolvedTemplate) return toInventoryEntry(entry, index);

    if (!resolvedTemplate.system || typeof resolvedTemplate.system !== 'object') {
      resolvedTemplate.system = {};
    }

    resolvedTemplate.system.quantity = entry?.quantity || resolvedTemplate.system.quantity || 1;
    if (entry?.source && !resolvedTemplate.system.source) {
      resolvedTemplate.system.source = entry.source;
    }
    resolvedTemplate.system.vttGroup = detectInventoryGroup(resolvedTemplate);

    return {
      id: entry?.id || resolvedTemplate.id || `starting-eq-${index}`,
      type: String(resolvedTemplate.type || 'equipment').toLowerCase(),
      addedAt: new Date().toISOString(),
      data: resolvedTemplate,
    };
  };

  const hydrateFeatureEntry = async (feature: any, index: number) => {
    // First check if the feature data is already an object with entries
    if (feature?.data && typeof feature.data === 'object' && Array.isArray(feature.data.entries)) {
      return {
        id: feature?.id || `feature-${index}`,
        type: feature?.type || 'feature',
        source: feature?.source || null,
        data: feature.data,
      };
    }
    
    // Try to resolve from compendium
    const resolvedTemplate = await resolveTemplateByName(['classFeature', 'subclassFeature', 'feat', 'optionalfeature'], feature?.data ?? feature);
    if (resolvedTemplate) {
      return {
        id: feature?.id || `feature-${index}`,
        type: feature?.type || 'feature',
        source: feature?.source || null,
        data: resolvedTemplate,
      };
    }
    
    // FALLBACK: If feature data is a string reference like "Bardic Inspiration|Bard||1", parse it into an object
    const featureName = parseFeatureReference(feature?.data ?? feature);
    if (featureName?.name) {
      const fallbackObj = {
        name: featureName.name,
        level: featureName.level,
        className: featureName.className,
        source: featureName.source,
        entries: [
          {
            type: 'paragraph',
            text: `[Feature data pending - ${featureName.name} level ${featureName.level}]`
          }
        ]
      };
      return {
        id: feature?.id || `feature-${index}`,
        type: feature?.type || 'feature',
        source: feature?.source || null,
        data: fallbackObj,
      };
    }
    
    // Last resort: deep clone
    const hydrated = deepClone(feature?.data ?? feature);
    return {
      id: feature?.id || `feature-${index}`,
      type: feature?.type || 'feature',
      source: feature?.source || null,
      data: hydrated,
    };
  };

  const hydrateActionEntry = async (action: any, index: number) => ({
    id: action?.id || `action-${index}`,
    type: action?.type || 'action',
    source: action?.source || null,
      data: deepClone(action?.data ?? action),
  });

  const createWeaponActionFromInventory = (inventoryEntry: any, index: number) => {
    const itemData = inventoryEntry?.data || inventoryEntry;
    const itemName = itemData?.name || `Weapon ${index + 1}`;
    const system = itemData?.system || {};
    const weaponStats = itemData?.system?.weaponStats || {
      attackBonus: Number(system?.attackBonus || system?.bonusWeapon || itemData?.bonusWeapon || 0),
      damage: system?.damage?.base
        ? `${system.damage.base.number || ''}d${system.damage.base.denomination || ''}`
        : (system?.dmg1 || itemData?.dmg1 || ''),
      ability: 'str',
    };
    const damageType = Array.isArray(system?.damage?.base?.types)
      ? system.damage.base.types.join(', ')
      : (system?.dmgType || itemData?.dmgType || '');

    return {
      id: `generated-weapon-action-${index}`,
      type: 'action',
      source: 'inventory',
      data: {
        name: `${itemName} Attack`,
        actionType: 'attack',
        activation: { type: 'action', cost: 1 },
        weapon: deepClone(itemData),
        attackBonus: weaponStats.attackBonus,
        damage: weaponStats.damage,
        damageType,
        ability: weaponStats.ability,
        entries: [`Attack with ${itemName}.`],
      },
    };
  };

  const generatePipelineActions = (features: any[], inventoryEntries: any[], hydratedActions: any[]) => {
    const generated: any[] = [];

    features.forEach((feature, index) => {
      const data = feature?.data || feature || {};
      const featureName = String(data?.name || '').trim();
      if (/^rage$/i.test(featureName)) {
        generated.push({
          id: `generated-feature-action-${index}`,
          type: 'action',
          source: 'feature',
          data: {
            name: 'Rage',
            actionType: 'bonus',
            activation: { type: 'bonus', cost: 1 },
            entries: Array.isArray(data?.entries) ? deepClone(data.entries) : ['Enter a rage as a bonus action.'],
            feature: deepClone(data),
          },
        });
      }
    });

    inventoryEntries.forEach((item, index) => {
      if (isWeaponTemplate(item?.data)) {
        generated.push(createWeaponActionFromInventory(item, index));
      }
    });

    const merged = [...hydratedActions, ...generated];
    const deduped: any[] = [];
    const seen = new Set<string>();
    merged.forEach((entry, index) => {
      const name = String(entry?.data?.name || entry?.name || `action-${index}`).trim().toLowerCase();
      const key = `${entry?.source || 'unknown'}:${name}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(entry);
      }
    });
    return deduped;
  };

  const hydrateSpellEntry = async (spell: any, index: number) => {
    const resolvedTemplate = await resolveTemplateByName(['spell'], spell);
    return {
      id: spell?.id || resolvedTemplate?.id || `spell-${index}`,
      type: 'spell',
      addedAt: new Date().toISOString(),
      data: resolvedTemplate || deepClone(spell),
    };
  };

  const collectEntityFeatures = (entity: any, sourceLabel: string) => {
    const system = typeof entity?.system === 'object' ? entity.system : {};
    const raw = typeof entity?.raw === 'object' ? entity.raw : {};
    
    // Debug entity features structure
    console.log('[DEBUG collectEntityFeatures] entity id:', entity?.id, 'sourceLabel:', sourceLabel);
    
    // Handle undefined raw
    const rawData = raw || {};
    const systemData = system || {};
    
    // Guard against null entity
    if (!entity) {
      console.log('[DEBUG collectEntityFeatures] entity is null/undefined, returning empty array');
      return [];
    }
    
    // Guard against null raw in entity
    if (!rawData) {
      console.log('[DEBUG collectEntityFeatures] raw is null, returning empty array');
      return [];
    }
    
    console.log('[DEBUG] raw keys:', Object.keys(rawData));
    // Check if the original 5eTools data is preserved in raw
    if (rawData.name || rawData.type) {
      console.log('[DEBUG] raw.name:', rawData.name, 'raw.type:', rawData.type);
    }
    // Check system for any additional feature data
    console.log('[DEBUG] system keys:', Object.keys(systemData));
    console.log('[DEBUG] raw.classFeature exists:', Array.isArray(rawData.classFeature), 'length:', rawData.classFeature?.length);
    console.log('[DEBUG] raw.classFeatures exists:', Array.isArray(rawData.classFeatures), 'length:', rawData.classFeatures?.length);
    console.log('[DEBUG] system.classFeatures exists:', Array.isArray(systemData.classFeatures), 'length:', systemData.classFeatures?.length);
    if (systemData.classFeatures?.length > 0) {
      console.log('[DEBUG] First 3 classFeatures:', JSON.stringify(systemData.classFeatures.slice(0, 3)));
      // Check for mixed types (strings vs objects)
      const first3 = systemData.classFeatures.slice(0, 3);
      console.log('[DEBUG] First feature type:', typeof first3[0], 'is object?:', typeof first3[0] === 'object');
      if (typeof first3[0] === 'object' && first3[0]?.classFeature) {
        console.log('[DEBUG] First feature has classFeature key');
      }
    }
    // Check if raw has the full feature data (classFeature with full objects)
    if (Array.isArray(rawData.classFeature) && rawData.classFeature.length > 0) {
      console.log('[DEBUG] raw.classFeature has', rawData.classFeature.length, 'entries');
      console.log('[DEBUG] First raw.classFeature entry:', JSON.stringify(rawData.classFeature[0]));
    }
    
    const candidates = [
      // Check raw first (full 5etools data)
      ...(Array.isArray(rawData.classFeature) ? rawData.classFeature : []),
      ...(Array.isArray(rawData.features) ? rawData.features : []),
      ...(Array.isArray(rawData.classFeatures) ? rawData.classFeatures : []),
      ...(Array.isArray(rawData.subclassFeature) ? rawData.subclassFeature : []),
      // System object - now checking classFeatures
      ...(Array.isArray(systemData.classFeatures) ? systemData.classFeatures : []),
      ...(Array.isArray(systemData.classFeature) ? systemData.classFeature : []),
      ...(Array.isArray(systemData.subclassFeatures) ? systemData.subclassFeatures : []),
      ...(Array.isArray(systemData.subclassFeature) ? systemData.subclassFeature : []),
    ];


    
    return candidates.map((feature: any, index: number) => {
      const id = typeof feature === 'string' 
        ? `${entity?.id || sourceLabel}-feature-${index}`
        : (feature?.id || `${entity?.id || sourceLabel}-feature-${index}`);
      return {
        id,
        type: 'feature',
        source: sourceLabel,
        data: deepClone(feature),
      };
    });
  };

  const collectEntityActions = (entity: any, sourceLabel: string) => {
    // Guard against null entity
    if (!entity) {
      return [];
    }
    
    const system = typeof entity?.system === 'object' ? entity.system : {};
    const candidates = [
      ...(Array.isArray(system.actions) ? system.actions : []),
      ...(Array.isArray(system.action) ? system.action : []),
      ...(Array.isArray(system.bonus) ? system.bonus : []),
      ...(Array.isArray(system.reaction) ? system.reaction : []),
    ];

    return candidates.map((action: any, index: number) => ({
      id: `${entity?.id || sourceLabel}-action-${index}`,
      type: 'action',
      source: sourceLabel,
      data: deepClone(action),
    }));
  };

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

  const searchSpells = async () => {
    setSpellLoading(true);
    try {
      const params = new URLSearchParams();
      if (spellSearch) params.append('q', spellSearch);
      params.append('limit', '200');
      const res = await fetch(`/api/data/compendium/spell?${params}`);
      if (res.ok) {
        const data = await res.json();
        setSpellResults(data.data || data || []);
      }
    } catch (e) {
      console.error('Failed to search spells:', e);
    } finally {
      setSpellLoading(false);
    }
  };
  
  const searchFeats = async () => {
    setFeatLoading(true);
    try {
      const params = new URLSearchParams();
      if (featSearch) params.append('q', featSearch);
      params.append('limit', '200');
      const res = await fetch(`/api/data/compendium/feat?${params}`);
      if (res.ok) {
        const data = await res.json();
        setFeatResults(data.data || data || []);
      }
    } catch (e) {
      console.error('Failed to search feats:', e);
    } finally {
      setFeatLoading(false);
    }
  };
  
  const toggleSpell = (spell: any) => {
    const cantripsKnown = getCantripsKnown(characterData.class, characterData.level);
    const spellsKnown = getSpellsKnown(characterData.class, characterData.level);
    setCharacterData(prev => {
      const current = prev.knownSpells || [];
      const exists = current.some((s: any) => s.id === spell.id || s.name === spell.name);
      if (exists) {
        return { ...prev, knownSpells: current.filter((s: any) => s.id !== spell.id && s.name !== spell.name) };
      }
      if (spell.level === 0 && cantripsKnown > 0 && current.filter((s: any) => s.level === 0).length >= cantripsKnown) {
        return prev;
      }
      if (spell.level > 0 && spellsKnown > 0 && current.filter((s: any) => s.level > 0).length >= spellsKnown) {
        return prev;
      }
      return { ...prev, knownSpells: [...current, spell] };
    });
  };
  
  const toggleFeat = (feat: any) => {
    const featCount = getFeatCount(characterData.race, characterData.level);
    setCharacterData(prev => {
      const current = prev.selectedFeats || [];
      const exists = current.some((f: any) => f.id === feat.id || f.name === feat.name);
      if (exists) {
        return { ...prev, selectedFeats: current.filter((f: any) => f.id !== feat.id && f.name !== feat.name) };
      }
      if (current.length >= featCount) return prev;
      return { ...prev, selectedFeats: [...current, feat] };
    });
  };
  
  // Handle class/background selection to add equipment
  useEffect(() => {
    if (!characterData.class && !characterData.background) return;

    const classSystem = characterData.class?.system;
    const bgSystem = characterData.background?.system;

    let grantedEquipment: ParsedEquipment[] = [];
    const choiceGroups: EquipmentChoiceGroup[] = [];

    if (characterData.class && typeof classSystem === 'object' && classSystem !== null) {
      console.log('[DEBUG Equipment] Class system keys:', Object.keys(classSystem));
      console.log('[DEBUG Equipment] startingEquipment:', JSON.stringify(classSystem.startingEquipment).substring(0, 500));
      const classEquipment = parseClassEquipment(characterData.class, grantedEquipment);
      console.log('[DEBUG Equipment] Class equipment granted:', classEquipment.granted.length, 'choices:', classEquipment.choices.length);
      if (classEquipment.choices.length > 0) {
        console.log('[DEBUG Equipment] First choice group:', JSON.stringify(classEquipment.choices[0]).substring(0, 500));
      }
      grantedEquipment = mergeParsedEquipment(grantedEquipment, classEquipment.granted);
      choiceGroups.push(...classEquipment.choices);
    }

    if (characterData.background && typeof bgSystem === 'object' && bgSystem !== null) {
      const backgroundEquipment = parseBackgroundEquipment(characterData.background, grantedEquipment);
      grantedEquipment = mergeParsedEquipment(grantedEquipment, backgroundEquipment.granted);
      choiceGroups.push(...backgroundEquipment.choices);
    }

    setBaseEquipment(grantedEquipment);
    setEquipmentChoiceGroups(choiceGroups);
    setEquipmentSelections((prev) => {
      const nextSelections: Record<string, string[]> = {};
      choiceGroups.forEach((group) => {
        const validIds = new Set(group.options.map((option) => option.id));
        const preserved = (prev[group.id] || []).filter((id) => validIds.has(id));
        nextSelections[group.id] = preserved.length > 0
          ? preserved.slice(0, group.choose)
          : group.options.slice(0, group.choose).map((option) => option.id);
      });
      return nextSelections;
    });
  }, [characterData.class, characterData.background]);

  useEffect(() => {
    const finalEquipment = applyEquipmentChoiceSelections(baseEquipment, equipmentChoiceGroups, equipmentSelections);
    setCharacterData((prev) => ({
      ...prev,
      equipment: finalEquipment,
    }));
  }, [baseEquipment, equipmentChoiceGroups, equipmentSelections]);
  
  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.wizard-content')) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - characterCreatorWizardPosition.x,
      y: e.clientY - characterCreatorWizardPosition.y,
    });
  };
  
  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      setCharacterCreatorWizardPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    } else if (isResizing) {
      setCharacterCreatorWizardSize({
        width: Math.max(600, e.clientX - resizeStart.x + resizeStart.width),
        height: Math.max(400, e.clientY - resizeStart.y + resizeStart.height),
      });
    }
  };
  
  const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(false);
  };
  
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: characterCreatorWizardSize.width,
      height: characterCreatorWizardSize.height,
    });
  };
  
  useEffect(() => {
    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, dragOffset, resizeStart]);
  
  const canGoNext = (): boolean => {
    switch (currentStep) {
      case 'name':
        return characterData.name.trim().length > 0;
      case 'race':
        return true;
      case 'class':
        return true;
      case 'subclass':
        return true;
      case 'background':
        return true;
      case 'abilities':
        return true;
      case 'skills':
        return true;
      case 'spells':
        return true;
      case 'feats':
        return true;
      case 'equipment':
        return hasRequiredEquipmentSelections;
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
  
  const createCharacter = async () => {
    if (!session || !characterData.name.trim()) return;
    
    setIsSaving(true);
    try {
      const level = characterData.level;
      const profBonus = Math.ceil(level / 4) + 1;
      const classSystem = characterData.class?.system || {};
      const raceSystem = characterData.race?.system || {};
      const backgroundSystem = characterData.background?.system || {};
      
      // Calculate racial ability bonuses
      const racialBonuses = parseRacialAbilityBonuses(raceSystem);
      const finalAbilities = {
        str: characterData.abilities.str + (racialBonuses.str || 0),
        dex: characterData.abilities.dex + (racialBonuses.dex || 0),
        con: characterData.abilities.con + (racialBonuses.con || 0),
        int: characterData.abilities.int + (racialBonuses.int || 0),
        wis: characterData.abilities.wis + (racialBonuses.wis || 0),
        cha: characterData.abilities.cha + (racialBonuses.cha || 0),
      };
      const characterSpeed = parseRaceSpeed(raceSystem);
      // Collect skill proficiencies from class choices + background + user selections
      const skillChoice = parseSkillChoices(classSystem);
      // If class has a skill choice (e.g. "choose 2 from Animal Handling, Athletics..."), use user's selection
      // Otherwise use any direct skill list from the class
      const classSkills = skillChoice
        ? (characterData.skillProficiencies || [])  // User selected from the skill picker
        : (Array.isArray(classSystem?.startingProficiencies?.skills) ? classSystem.startingProficiencies.skills : []);
      const bgSkills = Array.isArray(backgroundSystem?.skillProficiencies) ? backgroundSystem.skillProficiencies : [];
      const allSkillProficiencies = [
        ...classSkills,
        ...bgSkills,
      ].filter((s, i, arr) => typeof s === 'string' && arr.indexOf(s) === i); // deduplicate
      
      // Collect weapon/armor/tool proficiencies
      const weaponProficiencies = Array.isArray(classSystem?.startingProficiencies?.weapons) ? classSystem.startingProficiencies.weapons : [];
      const armorProficiencies = Array.isArray(classSystem?.startingProficiencies?.armor) ? classSystem.startingProficiencies.armor : [];
      const toolProficiencies = [
        ...(Array.isArray(classSystem?.startingProficiencies?.tools) ? classSystem.startingProficiencies.tools : []),
        ...(Array.isArray(backgroundSystem?.toolProficiencies) ? backgroundSystem.toolProficiencies : []),
      ];
      
      // Build features array from raw classFeature definitions (full data with entries)
      const features: any[] = [];
      const classRaw = characterData.class?.raw || {};
      const subclassRaw = characterData.subclass?.raw || {};
      const raceRaw = characterData.race?.raw || {};
      const bgRaw = characterData.background?.raw || {};
      
      // Helper to flatten 5eTools entries array to plain text
      const flattenEntries = (entries: any[]): string => {
        if (!Array.isArray(entries)) return typeof entries === 'string' ? entries : '';
        const parts: string[] = [];
        for (const entry of entries) {
          if (typeof entry === 'string') {
            parts.push(entry);
          } else if (entry && typeof entry === 'object') {
            if (entry.entries) parts.push(flattenEntries(entry.entries));
            if (entry.name) parts.push(entry.name);
            if (entry.text) parts.push(entry.text);
            if (entry.list) parts.push(entry.list.map((item: any) => typeof item === 'string' ? item : (item.text || item.name || '')).join(', '));
          }
        }
        return parts.filter(Boolean).join('\n');
      };
      
      // Helper to add features from a classFeature object, filtered by level
      // classFeature format: { "Rage": [{ name: "Rage", level: 1, entries: [...] }], ... }
      const addClassFeatures = (classFeatureObj: any, sourceLabel: string) => {
        if (!classFeatureObj || typeof classFeatureObj !== 'object') return;
        for (const [featureName, featureDefs] of Object.entries(classFeatureObj)) {
          if (!Array.isArray(featureDefs)) continue;
          for (const def of featureDefs) {
            if (!def || typeof def !== 'object') continue;
            const defLevel = def.level ?? 999;
            // Only include features at or below the character's level
            if (defLevel > level) continue;
            const desc = def.entries ? flattenEntries(def.entries) : '';
            features.push({ name: def.name || featureName, description: desc, source: sourceLabel, level: defLevel });
          }
        }
      };
      
      // Class features (from raw.classFeature)
      addClassFeatures(classRaw.classFeature, 'class');
      
      // Subclass features (from raw.subclassFeature)
      addClassFeatures(subclassRaw.subclassFeature, 'subclass');
      
      // Racial traits (from raw.entries - array of trait objects)
      if (Array.isArray(raceRaw.entries)) {
        for (const trait of raceRaw.entries) {
          if (typeof trait === 'object' && trait !== null) {
            const desc = trait.entries ? flattenEntries(trait.entries) : '';
            features.push({ name: trait.name || 'Racial Trait', description: desc, source: 'race' });
          }
        }
      }
      // Also check race raw.classFeature for species with classFeature-style traits
      addClassFeatures(raceRaw.classFeature, 'race');
      
      // Background features
      if (backgroundSystem.feature) {
        const featText = typeof backgroundSystem.feature === 'string' ? backgroundSystem.feature : '';
        if (featText) features.push({ name: 'Background Feature', description: featText, source: 'background' });
      }
      if (Array.isArray(bgRaw.entries)) {
        for (const be of bgRaw.entries) {
          if (typeof be === 'object' && be !== null) {
            const desc = be.entries ? flattenEntries(be.entries) : '';
            features.push({ name: be.name || 'Background Feature', description: desc, source: 'background' });
          }
        }
      }
      
      // Selected feats
      for (const feat of (characterData.selectedFeats || [])) {
        features.push({ name: feat.name, description: feat.description || feat.system?.description || '', source: 'feat' });
      }
      
      // Build spells array
      const spells = (characterData.knownSpells || []).map((s: any) => ({
        name: s.name,
        level: s.level,
        school: s.school,
        description: s.description || s.system?.description || '',
      }));
      
      // Build inventory from equipment choices
      const inventory = characterData.equipment.map((eq: ParsedEquipment) => ({
        name: eq.name,
        quantity: eq.quantity || 1,
        source: 'equipment',
      }));
      
      const characterSheet = {
        sessionId: session.id,
        name: characterData.name,
        playerName: characterData.playerName || undefined,
        level: level,
        experience: 0,
        strength: finalAbilities.str,
        dexterity: finalAbilities.dex,
        constitution: finalAbilities.con,
        intelligence: finalAbilities.int,
        wisdom: finalAbilities.wis,
        charisma: finalAbilities.cha,
        armorClass: 10 + Math.floor((finalAbilities.dex - 10) / 2),
        initiative: Math.floor((finalAbilities.dex - 10) / 2),
        speed: characterSpeed,
        maxHp: classSystem.hitDie ? 
          parseInt(String(classSystem.hitDie).replace('d', '')) + Math.floor((finalAbilities.con - 10) / 2) : 
          10 + Math.floor((finalAbilities.con - 10) / 2),
        currentHp: classSystem.hitDie ? 
          parseInt(String(classSystem.hitDie).replace('d', '')) + Math.floor((finalAbilities.con - 10) / 2) : 
          10 + Math.floor((finalAbilities.con - 10) / 2),
        tempHp: 0,
        hitDice: classSystem.hitDie || 'd8',
        hitDiceUsed: 0,
        copper: 0,
        silver: 0,
        gold: 15,
        platinum: 0,
        race: characterData.race?.name || '',
        class: characterData.class?.name || '',
        subclass: characterData.subclass?.name || '',
        background: characterData.background?.name || '',
        alignment: characterData.alignment || '',
        proficiencyBonus: profBonus,
        savingThrows: Array.isArray(classSystem.savingThrows) ? classSystem.savingThrows : [],
        skills: allSkillProficiencies,
        weaponProficiencies: weaponProficiencies,
        armorProficiencies: armorProficiencies,
        toolProficiencies: toolProficiencies,
        inventory: inventory.length > 0 ? inventory : undefined,
        spellcastingAbility: classSystem.spellcastingAbility || undefined,
        spellSaveDc: classSystem.spellcastingAbility ? 
          8 + profBonus + Math.floor((finalAbilities[String(classSystem.spellcastingAbility).toLowerCase() as keyof typeof finalAbilities] - 10) / 2) : 
          0,
        spellAttack: classSystem.spellcastingAbility ? 
          profBonus + Math.floor((finalAbilities[String(classSystem.spellcastingAbility).toLowerCase() as keyof typeof finalAbilities] - 10) / 2) : 
          0,
        spells: spells.length > 0 ? spells : undefined,
        features: features.length > 0 ? features : undefined,
        traits: raceSystem.entries ? JSON.stringify(raceSystem.entries) : undefined,
        flaws: characterData.flaws || undefined,
        bonds: characterData.bonds || undefined,
        ideals: characterData.ideals || (typeof backgroundSystem.feature === 'string' ? backgroundSystem.feature : undefined),
        backstory: characterData.backstory || undefined,
        notes: JSON.stringify({ source: 'character-wizard', version: 4, racialBonuses, speed: characterSpeed }),
        raceData: characterData.race ? JSON.parse(JSON.stringify(characterData.race)) : undefined,
        classData: characterData.class ? JSON.parse(JSON.stringify(characterData.class)) : undefined,
        subclassData: characterData.subclass ? JSON.parse(JSON.stringify(characterData.subclass)) : undefined,
        backgroundData: characterData.background ? JSON.parse(JSON.stringify(characterData.background)) : undefined,
        age: characterData.age || undefined,
        height: characterData.height || undefined,
        weight: characterData.weight || undefined,
        eyes: characterData.eyes || undefined,
        skin: characterData.skin || undefined,
        hair: characterData.hair || undefined,
        imageUrl: characterData.race?.img || characterData.race?.system?.img || undefined,
      };
      
      console.log('[DEBUG createCharacter] Sending character:', JSON.stringify(characterSheet, null, 2).substring(0, 500));
      
      const res = await fetch(`/api/data/sessions/${session.id}/characters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(characterSheet),
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[DEBUG createCharacter] Server error:', res.status, errorText);
      }
      
      if (res.ok) {
        const createdCharacter = await res.json();
        console.log('[DEBUG createCharacter] Character created:', createdCharacter.id, createdCharacter.name);
        setCharacterCreatorWizardVisible(false);
        addFloatingPanel?.({
          id: `character-${createdCharacter.id}`,
          item: { ...createdCharacter, type: 'character' },
          position: { x: 100, y: 100 },
          size: { width: 800, height: 600 },
          isEditing: false,
        });
      }
    } catch (error) {
      console.error('Failed to create character:', error);
    } finally {
      setIsSaving(false);
    }
  };
  
  if (!characterCreatorWizardVisible) return null;
  
  return (
    <div
      ref={panelRef}
      className="character-creator-panel"
      style={{
        position: 'fixed',
        left: characterCreatorWizardPosition.x,
        top: characterCreatorWizardPosition.y,
        width: characterCreatorWizardSize.width,
        height: characterCreatorWizardSize.height,
        zIndex: 10000,
        '--bg-primary': colorScheme.background,
        '--bg-secondary': colorScheme.surface,
        '--bg-tertiary': colorScheme.surface,
        '--accent': colorScheme.accent,
        '--border': colorScheme.accent,
        '--text-primary': colorScheme.text,
        '--text-secondary': colorScheme.text,
        '--panel-accent': colorScheme.accent,
      } as React.CSSProperties}
    >
      {/* Header */}
      <div className="panel-header" onMouseDown={handleMouseDown}>
        <div className="panel-title-area">
          <span className="panel-title">Create New Character</span>
          <span className="panel-title-meta">Character Wizard</span>
        </div>
        <button className="close-btn" onClick={() => setCharacterCreatorWizardVisible(false)}>
          <Icon name="times" />
        </button>
      </div>
      
      {/* Progress */}
      <div className="wizard-progress">
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
      <div className="wizard-content">
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
                  {filterItems(deduplicateItems(races)).map((race, idx) => (
                    <div
                      key={`${race.id}-${race.source || race.book || idx}`}
                      className={`selection-card ${characterData.race?.id === race.id ? 'selected' : ''}`}
                      onClick={async () => {
                        const fullRace = await fetchFullCompendiumEntry(race.id, race);
                        setCharacterData(prev => ({ ...prev, race: fullRace }));
                      }}
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
                  {filterItems(deduplicateItems(classes)).map((cls, idx) => (
                    <div
                      key={`${cls.id}-${cls.source || cls.book || idx}`}
                      className={`selection-card ${characterData.class?.id === cls.id ? 'selected' : ''}`}
                      onClick={async () => {
                        const fullClass = await fetchFullCompendiumEntry(cls.id, cls);
                        setCharacterData(prev => ({ ...prev, class: fullClass }));
                      }}
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
                  {filterItems(deduplicateItems(backgrounds)).map((bg, idx) => (
                    <div
                      key={`${bg.id}-${bg.source || bg.book || idx}`}
                      className={`selection-card ${characterData.background?.id === bg.id ? 'selected' : ''}`}
                      onClick={async () => {
                        const fullBackground = await fetchFullCompendiumEntry(bg.id, bg);
                        setCharacterData(prev => ({ ...prev, background: fullBackground }));
                      }}
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
            
            {/* Subclass Step */}
            {currentStep === 'subclass' && (() => {
              const hasClass = !!characterData.class;
              const availableSubclasses = hasClass ? getAvailableSubclasses(characterData.class, characterData.level, subclasses) : [];
              console.log('[DEBUG Subclass Step] class:', characterData.class?.name, 'level:', characterData.level, 'total subclasses:', subclasses.length, 'available:', availableSubclasses.length);
              if (subclasses.length > 0 && hasClass) {
                console.log('[DEBUG Subclass Step] Sample subclass:', JSON.stringify(subclasses[0]));
              }
              return (
                <div className="wizard-step">
                  <h3>Select Subclass</h3>
                  {!hasClass ? (
                    <p className="step-description">Please select a class first.</p>
                  ) : (
                    <p className="step-description">Choose your character's specialization for {characterData.class.name}.</p>
                  )}
                  
                  <div className="selection-grid">
                    {availableSubclasses.map((sc: any, idx: number) => (
                      <div
                        key={`${sc.id || sc.name}-${sc.source || sc.book || idx}`}
                        className={`selection-card ${characterData.subclass?.id === sc.id ? 'selected' : ''}`}
                        onClick={() => setCharacterData(prev => ({ ...prev, subclass: sc }))}
                      >
                        <div className="card-info">
                          <h4>{sc.name || sc.shortName || 'Unknown Subclass'}</h4>
                          {sc.description && <span className="card-meta">{String(sc.description).substring(0, 100)}...</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {!hasClass && (
                    <div className="empty-state">
                      <p>No class selected. Go back and choose a class first.</p>
                    </div>
                  )}
                  {hasClass && availableSubclasses.length === 0 && (
                    <div className="empty-state">
                      <p>No subclasses available for {characterData.class?.name} at level {characterData.level}.</p>
                      <p style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
                        Debug: {subclasses.length} subclasses loaded, className match: "{characterData.class?.name}"
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
            
            {/* Skills Step */}
            {currentStep === 'skills' && (() => {
              const classSystem = characterData.class?.system || {};
              const skillChoice = parseSkillChoices(classSystem);
              const bgSkills = Array.isArray(classSystem?.startingProficiencies?.skills) ? classSystem.startingProficiencies.skills : [];
              const bgSkillList = Array.isArray(characterData.background?.system?.skillProficiencies) ? characterData.background.system.skillProficiencies : [];
              
              const availableSkills = skillChoice?.from || DND_SKILLS;
              const requiredCount = skillChoice?.count || 0;
              const selectedSkills = characterData.skillProficiencies || [];
              
              return (
                <div className="wizard-step">
                  <h3>Skill Proficiencies</h3>
                  <p className="step-description">
                    {requiredCount > 0 
                      ? `Choose ${requiredCount} skill${requiredCount > 1 ? 's' : ''} from your class list.`
                      : 'Select skill proficiencies for your character.'}
                  </p>
                  
                  {requiredCount > 0 && (
                    <div style={{ marginBottom: '12px', padding: '8px 12px', background: 'rgba(107, 143, 255, 0.1)', borderRadius: '6px', fontSize: '14px' }}>
                      Selected: {selectedSkills.length}/{requiredCount}
                    </div>
                  )}
                  
                  {bgSkillList.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#888' }}>Background Skills (auto-granted)</h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {bgSkillList.map((skill: any, idx: number) => {
                          const skillName = typeof skill === 'string' ? skill : Object.keys(skill).join(', ');
                          return (
                            <span key={idx} style={{ padding: '4px 10px', background: 'rgba(76, 175, 80, 0.2)', borderRadius: '4px', fontSize: '13px', color: '#4CAF50' }}>
                              {skillName}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
                    {DND_SKILLS.map(skill => {
                      const isFromClass = availableSkills.some((s: any) => {
                        const skillStr = typeof s === 'string' ? s : (s.name || s.label || s.proficiency || '');
                        return skillStr.toLowerCase() === skill.toLowerCase();
                      });
                      const isSelected = selectedSkills.includes(skill);
                      const isFromBg = bgSkillList.some((s: any) => {
                        const skillStr = typeof s === 'string' ? s : (s.name || s.label || s.proficiency || '');
                        return skillStr.toLowerCase() === skill.toLowerCase();
                      });
                      
                      return (
                        <label
                          key={skill}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 12px',
                            background: isFromBg ? 'rgba(76, 175, 80, 0.1)' : (isFromClass ? 'rgba(107, 143, 255, 0.1)' : 'rgba(255,255,255,0.05)'),
                            borderRadius: '6px',
                            cursor: isFromBg ? 'default' : 'pointer',
                            opacity: isFromClass ? 1 : 0.6,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected || isFromBg}
                            disabled={isFromBg || (!isFromClass && requiredCount > 0 && selectedSkills.length >= requiredCount && !isSelected)}
                            onChange={() => {
                              setCharacterData(prev => {
                                const current = prev.skillProficiencies || [];
                                if (current.includes(skill)) {
                                  return { ...prev, skillProficiencies: current.filter(s => s !== skill) };
                                }
                                if (requiredCount > 0 && current.length >= requiredCount) return prev;
                                return { ...prev, skillProficiencies: [...current, skill] };
                              });
                            }}
                          />
                          <span style={{ fontSize: '13px' }}>{skill}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            
            {/* Spells Step */}
            {currentStep === 'spells' && (() => {
              const isSpellcaster = isSpellcastingClass(characterData.class);
              const cantripsKnown = getCantripsKnown(characterData.class, characterData.level);
              const spellsKnown = getSpellsKnown(characterData.class, characterData.level);
              const spellcastingAbility = getSpellcastingAbilityName(characterData.class);
              const filteredResults = spellResults.filter((spell: any) => {
                if (spellLevelFilter >= 0 && spell.level !== spellLevelFilter) return false;
                return true;
              });
              const knownCantrips = (characterData.knownSpells || []).filter((s: any) => s.level === 0);
              const knownNonCantrips = (characterData.knownSpells || []).filter((s: any) => s.level > 0);
              if (!isSpellcaster) {
                return (<div className="wizard-step"><h3>Spells</h3><p className="step-description">Your class doesn't have spellcasting.</p></div>);
              }
              return (
                <div className="wizard-step">
                  <h3>Spell Selection</h3>
                  <p className="step-description">Choose your spells. Spellcasting ability: <strong>{spellcastingAbility}</strong></p>
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    {cantripsKnown > 0 && (<div style={{ padding: '8px 12px', background: 'rgba(107, 143, 255, 0.1)', borderRadius: '6px' }}>Cantrips: {knownCantrips.length}/{cantripsKnown}</div>)}
                    {spellsKnown > 0 && (<div style={{ padding: '8px 12px', background: 'rgba(107, 143, 255, 0.1)', borderRadius: '6px' }}>Spells Known: {knownNonCantrips.length}/{spellsKnown}</div>)}
                  </div>
                  {knownCantrips.length > 0 && (<div style={{ marginBottom: '16px' }}><h4 style={{ margin: '0 0 6px 0', fontSize: '13px', color: '#888' }}>Known Cantrips</h4><div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>{knownCantrips.map((s: any) => (<span key={s.id || s.name} style={{ padding: '4px 10px', background: 'rgba(139, 92, 246, 0.2)', borderRadius: '4px', fontSize: '13px', color: '#8b5cf6' }}>{s.name}</span>))}</div></div>)}
                  {knownNonCantrips.length > 0 && (<div style={{ marginBottom: '16px' }}><h4 style={{ margin: '0 0 6px 0', fontSize: '13px', color: '#888' }}>Known Spells</h4><div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>{knownNonCantrips.map((s: any) => (<span key={s.id || s.name} style={{ padding: '4px 10px', background: 'rgba(139, 92, 246, 0.2)', borderRadius: '4px', fontSize: '13px', color: '#8b5cf6' }}>{s.name} ({s.level}{s.level === 1 ? 'st' : s.level === 2 ? 'nd' : s.level === 3 ? 'rd' : 'th'})</span>))}</div></div>)}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    <input type="text" value={spellSearch} onChange={e => setSpellSearch(e.target.value)} placeholder="Search spells..." style={{ flex: 1, padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} onKeyDown={e => e.key === 'Enter' && searchSpells()} />
                    <button onClick={searchSpells} disabled={spellLoading} style={{ padding: '8px 16px', background: '#4a6fa5', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer' }}>{spellLoading ? '...' : 'Search'}</button>
                    <select value={spellLevelFilter} onChange={e => setSpellLevelFilter(parseInt(e.target.value))} style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }}>
                      <option value={-1}>All Levels</option><option value={0}>Cantrips</option>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(lvl => (<option key={lvl} value={lvl}>{lvl}{lvl === 1 ? 'st' : lvl === 2 ? 'nd' : lvl === 3 ? 'rd' : 'th'}</option>))}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                    {filteredResults.map((spell: any) => {
                      const known = (characterData.knownSpells || []).some((s: any) => s.id === spell.id || s.name === spell.name);
                      return (<div key={spell.id} onClick={() => toggleSpell(spell)} style={{ padding: '8px 12px', background: known ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.05)', borderRadius: '6px', cursor: 'pointer', border: known ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid rgba(255,255,255,0.1)' }}><div style={{ fontSize: '13px', fontWeight: 600 }}>{spell.name}</div><div style={{ fontSize: '11px', color: '#888' }}>{spell.level === 0 ? 'Cantrip' : `${spell.level}${spell.level === 1 ? 'st' : spell.level === 2 ? 'nd' : spell.level === 3 ? 'rd' : 'th'} level`}</div></div>);
                    })}
                  </div>
                  {spellResults.length === 0 && !spellLoading && (<div className="empty-state"><p>Search for spells to add to your spell list.</p></div>)}
                </div>
              );
            })()}
            
            {/* Feats Step */}
            {currentStep === 'feats' && (() => {
              const showFeats = shouldShowFeatStep(characterData.race, characterData.level);
              const featCount = getFeatCount(characterData.race, characterData.level);
              if (!showFeats) {
                return (<div className="wizard-step"><h3>Feats</h3><p className="step-description">No feats available at this level/race.</p></div>);
              }
              return (
                <div className="wizard-step">
                  <h3>Feat Selection</h3>
                  <p className="step-description">{characterData.race?.name?.toLowerCase()?.includes('variant') || characterData.race?.name?.toLowerCase()?.includes('custom') ? 'Your race grants a feat at level 1.' : `Select feats for your Ability Score Improvement levels.`}</p>
                  <div style={{ marginBottom: '12px', padding: '8px 12px', background: 'rgba(107, 143, 255, 0.1)', borderRadius: '6px', fontSize: '14px' }}>Selected: {(characterData.selectedFeats || []).length}/{featCount}</div>
                  {(characterData.selectedFeats || []).length > 0 && (<div style={{ marginBottom: '16px' }}><h4 style={{ margin: '0 0 6px 0', fontSize: '13px', color: '#888' }}>Selected Feats</h4><div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>{(characterData.selectedFeats || []).map((f: any) => (<span key={f.id || f.name} style={{ padding: '4px 10px', background: 'rgba(255, 152, 0, 0.2)', borderRadius: '4px', fontSize: '13px', color: '#FF9800' }}>{f.name}</span>))}</div></div>)}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    <input type="text" value={featSearch} onChange={e => setFeatSearch(e.target.value)} placeholder="Search feats..." style={{ flex: 1, padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} onKeyDown={e => e.key === 'Enter' && searchFeats()} />
                    <button onClick={searchFeats} disabled={featLoading} style={{ padding: '8px 16px', background: '#4a6fa5', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer' }}>{featLoading ? '...' : 'Search'}</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                    {featResults.map((feat: any) => {
                      const selected = (characterData.selectedFeats || []).some((f: any) => f.id === feat.id || f.name === feat.name);
                      return (<div key={feat.id} onClick={() => toggleFeat(feat)} style={{ padding: '10px 12px', background: selected ? 'rgba(255, 152, 0, 0.2)' : 'rgba(255,255,255,0.05)', borderRadius: '6px', cursor: 'pointer', border: selected ? '1px solid rgba(255, 152, 0, 0.4)' : '1px solid rgba(255,255,255,0.1)' }}><div style={{ fontSize: '13px', fontWeight: 600 }}>{feat.name}</div>{feat.prerequisite && (<div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>Prerequisite: {typeof feat.prerequisite === 'string' ? feat.prerequisite : JSON.stringify(feat.prerequisite)}</div>)}</div>);
                    })}
                  </div>
                  {featResults.length === 0 && !featLoading && (<div className="empty-state"><p>Search for feats to select.</p></div>)}
                </div>
              );
            })()}
            
            {/* Abilities Step */}
            {currentStep === 'abilities' && (() => {
              const racialBonuses = parseRacialAbilityBonuses(characterData.race?.system || {});
              const hasRacialBonuses = Object.keys(racialBonuses).length > 0;
              return (
                <div className="wizard-step">
                  <h3>Ability Scores</h3>
                  <p className="step-description">Assign ability scores to your character.</p>
                  {hasRacialBonuses && (<div style={{ marginBottom: '16px', padding: '10px 14px', background: 'rgba(76, 175, 80, 0.1)', borderRadius: '6px' }}><div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px', color: '#4CAF50' }}>Racial Bonuses</div><div style={{ fontSize: '13px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>{Object.entries(racialBonuses).map(([ability, bonus]) => (<span key={ability}>{ability.toUpperCase()}: +{bonus}</span>))}</div></div>)}
                  <div className="standard-array-btn"><button onClick={applyStandardArray}>Apply Standard Array</button></div>
                  <div className="abilities-grid">
                    {ABILITY_NAMES.map(ability => {
                      const baseScore = characterData.abilities[ability as keyof typeof characterData.abilities];
                      const racialBonus = racialBonuses[ability] || 0;
                      const finalScore = baseScore + racialBonus;
                      const modifier = Math.floor((finalScore - 10) / 2);
                      return (
                        <div key={ability} className="ability-group">
                          <label>{ability.toUpperCase()}</label>
                          <div className="ability-controls">
                            <button onClick={() => setCharacterData(prev => ({ ...prev, abilities: { ...prev.abilities, [ability]: Math.max(1, prev.abilities[ability as keyof typeof prev.abilities] - 1) } }))}>-</button>
                            <span className="ability-value">{baseScore}</span>
                            <button onClick={() => setCharacterData(prev => ({ ...prev, abilities: { ...prev.abilities, [ability]: Math.min(30, prev.abilities[ability as keyof typeof prev.abilities] + 1) } }))}>+</button>
                          </div>
                          {racialBonus > 0 && (<div style={{ fontSize: '11px', color: '#4CAF50' }}>+{racialBonus} racial</div>)}
                          <span className="ability-modifier">{modifier >= 0 ? '+' : ''}{modifier}</span>
                          {racialBonus > 0 && (<div style={{ fontSize: '12px', fontWeight: 600, color: '#6b8aff' }}>Final: {finalScore}</div>)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            
            {/* Equipment Step */}
            {currentStep === 'equipment' && (
              <div className="wizard-step">
                <h3>Equipment</h3>
                <p className="step-description">Your starting equipment from class and background.</p>
                
                <div className="equipment-list">
                  {baseEquipment.length > 0 && (
                    <>
                      <h4>Granted Equipment</h4>
                      {baseEquipment.map((eq: ParsedEquipment, index: number) => (
                        <div key={eq.id || index} className="equipment-item">
                          <input 
                            type="checkbox" 
                            checked={true}
                            disabled={true}
                          />
                          <span className="equipment-name">{eq.name}</span>
                          {eq.source && <span className="equipment-source">from {eq.source}</span>}
                        </div>
                      ))}
                    </>
                  )}

                  {equipmentChoiceGroups.length > 0 && (
                    <>
                      <h4 style={{ marginTop: '16px' }}>Equipment Choices</h4>
                      {equipmentChoiceGroups.map((group) => {
                        const selected = equipmentSelections[group.id] || [];
                        const inputType = group.choose > 1 ? 'checkbox' : 'radio';
                        return (
                          <div key={group.id} style={{ marginBottom: '16px', padding: '12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px' }}>
                            <div style={{ marginBottom: '8px', fontWeight: 600 }}>
                              {group.label} {group.choose > 1 ? `(choose ${group.choose})` : '(choose 1)'}
                            </div>
                            {group.options.map((option) => {
                              const isChecked = selected.includes(option.id);
                              return (
                                <label key={option.id} className="equipment-item" style={{ cursor: 'pointer' }}>
                                  <input
                                    type={inputType}
                                    name={group.id}
                                    checked={isChecked}
                                    onChange={() => {
                                      setEquipmentSelections((prev) => {
                                        const current = prev[group.id] || [];
                                        if (group.choose <= 1) {
                                          return { ...prev, [group.id]: [option.id] };
                                        }

                                        if (current.includes(option.id)) {
                                          return { ...prev, [group.id]: current.filter((id) => id !== option.id) };
                                        }

                                        if (current.length >= group.choose) {
                                          return { ...prev, [group.id]: [...current.slice(1), option.id] };
                                        }

                                        return { ...prev, [group.id]: [...current, option.id] };
                                      });
                                    }}
                                  />
                                  <span className="equipment-name">{option.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        );
                      })}
                    </>
                  )}

                  {characterData.equipment.length > 0 ? (
                    <>
                      <h4 style={{ marginTop: '16px' }}>Final Starting Equipment</h4>
                      {characterData.equipment.map((eq: ParsedEquipment, index: number) => (
                        <div key={eq.id || index} className="equipment-item">
                          <input 
                            type="checkbox" 
                          checked={true}
                          disabled={true}
                        />
                          <span className="equipment-name">{eq.name}</span>
                          {eq.source && <span className="equipment-source">from {eq.source}</span>}
                        </div>
                      ))}
                    </>
                  ) : (
                    <p className="no-equipment">No starting equipment was resolved from the selected class or background.</p>
                  )}
                </div>
              </div>
            )}
            
            {/* Review Step */}
            {currentStep === 'review' && (
              <div className="wizard-step">
                <h3>Review Character</h3>
                <p className="step-description">Review your character before creating.</p>
                
                <div className="review-section">
                  <div className="review-item">
                    <strong>Name:</strong> {characterData.name}
                  </div>
                  {characterData.playerName && (
                    <div className="review-item">
                      <strong>Player:</strong> {characterData.playerName}
                    </div>
                  )}
                  <div className="review-item">
                    <strong>Level:</strong> {characterData.level}
                  </div>
                  <div className="review-item">
                    <strong>Race:</strong> {characterData.race?.name || 'Not selected'}
                  </div>
                  <div className="review-item">
                    <strong>Class:</strong> {characterData.class?.name || 'Not selected'}
                  </div>
                  {characterData.subclass && (
                    <div className="review-item">
                      <strong>Subclass:</strong> {characterData.subclass.name || characterData.subclass.shortName || 'Unknown'}
                    </div>
                  )}
                  <div className="review-item">
                    <strong>Background:</strong> {characterData.background?.name || 'Not selected'}
                  </div>
                  {characterData.alignment && (
                    <div className="review-item">
                      <strong>Alignment:</strong> {characterData.alignment}
                    </div>
                  )}
                  <div className="review-item">
                    <strong>Abilities:</strong>
                    <div className="review-abilities">
                      {ABILITY_NAMES.map(a => {
                        const base = characterData.abilities[a as keyof typeof characterData.abilities];
                        const racialBonuses = parseRacialAbilityBonuses(characterData.race?.system || {});
                        const bonus = racialBonuses[a] || 0;
                        const final = base + bonus;
                        return (
                          <span key={a}>
                            {a.toUpperCase()}: {final}{bonus > 0 ? ` (${base}+${bonus})` : ''}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  {characterData.skillProficiencies.length > 0 && (
                    <div className="review-item">
                      <strong>Skill Proficiencies:</strong>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                        {characterData.skillProficiencies.map(s => (
                          <span key={s} style={{ padding: '2px 8px', background: 'rgba(107, 143, 255, 0.15)', borderRadius: '4px', fontSize: '12px' }}>{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {characterData.knownSpells.length > 0 && (
                    <div className="review-item">
                      <strong>Known Spells:</strong> {characterData.knownSpells.length} spells
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                        {characterData.knownSpells.map((s: any) => (
                          <span key={s.id || s.name} style={{ padding: '2px 8px', background: 'rgba(139, 92, 246, 0.15)', borderRadius: '4px', fontSize: '12px' }}>{s.name}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {characterData.selectedFeats.length > 0 && (
                    <div className="review-item">
                      <strong>Selected Feats:</strong>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                        {characterData.selectedFeats.map((f: any) => (
                          <span key={f.id || f.name} style={{ padding: '2px 8px', background: 'rgba(255, 152, 0, 0.15)', borderRadius: '4px', fontSize: '12px' }}>{f.name}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="review-item">
                    <strong>Equipment:</strong>
                    <ul className="review-equipment">
                      {characterData.equipment.map((eq: ParsedEquipment, i: number) => (
                        <li key={i}>{eq.name}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      
      {/* Footer */}
      <div className="wizard-footer">
        <button 
          className="btn-secondary" 
          onClick={goBack}
          disabled={currentStepIndex === 0}
        >
          <Icon name="chevron-left" /> Back
        </button>
        
        {currentStep === 'review' ? (
          <button 
            className="btn-primary" 
            onClick={createCharacter}
            disabled={isSaving}
          >
            {isSaving ? 'Creating...' : 'Create Character'}
          </button>
        ) : (
          <button 
            className="btn-primary" 
            onClick={goNext}
            disabled={!canGoNext()}
          >
            Next <Icon name="chevron-right" />
          </button>
        )}
      </div>
      
      {/* Resize Handle */}
      <div className="panel-resize" onMouseDown={handleResizeMouseDown} />
    </div>
  );
}
