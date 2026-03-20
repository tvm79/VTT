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

export function inferType(data: any): string {
  if (typeof data?.type === 'string' && data.type.trim()) return normalizeKey(data.type).toLowerCase();

  const category = String(data?.Category || data?.category || '').trim().toLowerCase();
  if (category && categoryToTypeMap[category]) return categoryToTypeMap[category];

  const props = data?.properties && typeof data.properties === 'object' ? data.properties : data;
  const normalizedProps = normalizeObjectKeys(props || {});

  if (normalizedProps.level !== undefined || normalizedProps.castingTime !== undefined || normalizedProps.school !== undefined) return 'spell';
  if (normalizedProps.challengeRating !== undefined || normalizedProps.cr !== undefined || normalizedProps.hitPoints !== undefined || normalizedProps.hp !== undefined) return 'monster';
  if (normalizedProps.hitDie !== undefined) return 'class';
  if (normalizedProps.prerequisites !== undefined && normalizedProps.benefits !== undefined) return 'feat';
  if (normalizedProps.skillProficiencies !== undefined && normalizedProps.equipment !== undefined) return 'background';

  return 'item';
}

export function transformLegacyToSystem(data: any, _type: string): Record<string, any> {
  const system: Record<string, any> = {};

  const fromProperties = data?.properties && typeof data.properties === 'object' ? data.properties : {};
  for (const [rawKey, rawValue] of Object.entries(fromProperties)) {
    const key = normalizeKey(rawKey);
    if (!key || key === 'category') continue;
    system[key] = normalizePropertyValue(key, rawValue);
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
