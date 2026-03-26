import express from 'express';
import { prisma } from '../db.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getTypeFromFilename } from '../data/schemas/index.js';
import { normalizeEntry, validateEntry, transformLegacyToSystem } from '../data/schemas/dataNormalizer.js';
import { getImageFetcherConfig, getPublicImageFetcherConfig } from '../imageFetcherConfig.js';
import { createImageProviderRegistry, resolveImageCandidates } from '../imageProviders.js';

const router = express.Router();

const BASE_URL = 'https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data';
const FIVE_ETOOLS_IMG_BASE_URL = 'https://5e.tools/img';
const IMAGE_FETCHER_CONFIG = getImageFetcherConfig();
const IMAGE_PROVIDERS = createImageProviderRegistry(IMAGE_FETCHER_CONFIG.flags.providers, IMAGE_FETCHER_CONFIG);
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.webp', '.png', '.jpg', '.jpeg', '.gif', '.avif']);
const ITEM_TYPE_LABELS: Record<string, string> = {
  A: 'Ammunition',
  AF: 'Ammunition (Futuristic)',
  AT: 'Artisan Tool',
  EM: 'Eldritch Machine',
  EXP: 'Explosive',
  G: 'Adventuring Gear',
  GS: 'Gaming Set',
  HA: 'Heavy Armor',
  INS: 'Instrument',
  LA: 'Light Armor',
  WPN: 'Weapons',
  MA: 'Medium Armor',
  MNT: 'Mount',
  GV: 'Generic Variant',
  P: 'Potion',
  RD: 'Rod',
  RG: 'Ring',
  ST: 'Staff',
  S: 'Shield',
  SC: 'Scroll',
  SCF: 'Spellcasting Focus',
  OTH: 'Other',
  T: 'Tool',
  TAH: 'Tack and Harness',
  TG: 'Trade Good',
  W: 'Wondrous Item',
  $: 'Treasure',
  VEH: 'Vehicle (Land)',
  SHP: 'Vehicle (Water)',
  AIR: 'Vehicle (Air)',
  WD: 'Wand',
  EQP: 'Equipment',
  CON: 'Consumables',
  LOOT: 'Loot',
  TOOL: 'Tool',
  TRANSPORT: 'Transportation',
};
const ITEM_TYPE_CODES = new Set(Object.keys(ITEM_TYPE_LABELS));

const IMAGE_FETCH_METRICS = {
  resolveCalls: 0,
  resolveCandidatesTotal: 0,
  resolveByProvider: {} as Record<string, number>,
  approvedTotal: 0,
  approvedByProvider: {} as Record<string, number>,
  rejectedTotal: 0,
  backfillRuns: 0,
  backfillScanned: 0,
  backfillUpdated: 0,
};

function incrementMetricBucket(bucket: Record<string, number>, key: string): void {
  const metricKey = String(key || 'unknown').trim() || 'unknown';
  bucket[metricKey] = (bucket[metricKey] || 0) + 1;
}

function getEntrySourceValue(raw: any, fallbackSource?: string | null): string | null {
  const candidates = [
    fallbackSource,
    raw?.source,
    raw?.book,
    raw?.system?.source?.custom,
    raw?.system?.source?.rules,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function getSourceFilterCandidates(source: string): Array<Record<string, any>> {
  const value = String(source || '').trim();
  if (!value) return [];

  return [
    { source: value },
    { raw: { path: ['source'], equals: value } },
    { raw: { path: ['book'], equals: value } },
    { raw: { path: ['system', 'source', 'custom'], equals: value } },
    { raw: { path: ['system', 'source', 'rules'], equals: value } },
  ];
}

function getItemTypeCode(raw: any): string {
  const candidates = [
    raw?.type,
    raw?.itemType,
    raw?.system?.type,
    raw?.system?.itemType,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const normalized = candidate.trim().toUpperCase();
    if (normalized && ITEM_TYPE_CODES.has(normalized)) return normalized;
  }

  // Check for weapons - first check weapon property, then weaponCategory field
  if (raw?.weapon || raw?.system?.weapon) {
    return 'WPN';
  }
  // Check for 5e SRD/5etools style weaponCategory (simple/martial)
  const weaponCategory = raw?.weaponCategory || raw?.system?.weaponCategory;
  if (weaponCategory && typeof weaponCategory === 'string') {
    const normalizedCategory = weaponCategory.trim().toLowerCase();
    if (normalizedCategory === 'simple' || normalizedCategory === 'martial') {
      return 'WPN';
    }
  }
  // Check for 5e SRD/5etools style weapon type
  const typeValue = raw?.type || raw?.system?.type;
  if (typeValue && typeof typeValue === 'string') {
    const normalizedType = typeValue.trim().toLowerCase();
    if (normalizedType === 'weapon') return 'WPN';
  }
  if (raw?.armor || raw?.system?.armor) {
    return 'EQP';
  }
  if (raw?.shield || raw?.system?.shield) return 'EQP';
  if (raw?.potion || raw?.system?.potion) return 'P';
  if (raw?.tool || raw?.system?.tool) return 'T';
  if (raw?.scroll || raw?.system?.scroll) return 'SC';
  if (raw?.ring || raw?.system?.ring) return 'EQP';
  if (raw?.wand || raw?.system?.wand) return 'EQP';
  if (raw?.staff || raw?.system?.staff) return 'ST';
  if (raw?.rod || raw?.system?.rod) return 'EQP';
  if (raw?.wondrous || raw?.system?.wondrous) return 'EQP';
  // Check for trinkets
  if (raw?.trinket || raw?.system?.trinket) return 'EQP';
  // Check for vehicle equipment
  if (raw?.vehicle || raw?.system?.vehicle) return 'EQP';
  // Check for natural armor
  if (raw?.naturalArmor || raw?.system?.naturalArmor) return 'EQP';
  // Check for clothing/general equipment
  if (raw?.equipment || raw?.system?.equipment) return 'EQP';
  return 'G';
}

function getItemTypeLabel(code: string): string {
  const normalized = String(code || '').trim().toUpperCase();
  return ITEM_TYPE_LABELS[normalized] || normalized || 'Item';
}

// Equipment type filter mapping - match raw/system/property metadata explicitly
// Based on actual database structure: raw.type = 'g' for general gear, raw.system.wondrous for wondrous items
const EQUIPMENT_TYPE_FILTERS: Record<string, any> = {
  Clothing: {
    OR: [
      // General gear type code (from actual data)
      { raw: { path: ['type'], equals: 'g' } },
      { raw: { path: ['itemType'], equals: 'g' } },
      { raw: { path: ['system', 'type'], equals: 'g' } },
      // Check for equipment flag
      { raw: { path: ['equipment'], equals: true } },
      { raw: { path: ['system', 'equipment'], equals: true } },
    ],
  },
  'Heavy Armor': {
    OR: [
      // Legacy type codes (lowercase in database)
      { raw: { path: ['type'], equals: 'ha' } },
      { raw: { path: ['itemType'], equals: 'ha' } },
      { raw: { path: ['system', 'type'], equals: 'ha' } },
      // Check for armor value (numeric armor class)
      { raw: { path: ['system', 'armor'], not: null } },
    ],
  },
  'Light Armor': {
    OR: [
      // Legacy type codes (lowercase in database)
      { raw: { path: ['type'], equals: 'la' } },
      { raw: { path: ['itemType'], equals: 'la' } },
      { raw: { path: ['system', 'type'], equals: 'la' } },
      // Check for armor value (numeric armor class)
      { raw: { path: ['system', 'armor'], not: null } },
    ],
  },
  'Medium Armor': {
    OR: [
      // Legacy type codes (lowercase in database)
      { raw: { path: ['type'], equals: 'ma' } },
      { raw: { path: ['itemType'], equals: 'ma' } },
      { raw: { path: ['system', 'type'], equals: 'ma' } },
      // Check for armor value (numeric armor class)
      { raw: { path: ['system', 'armor'], not: null } },
    ],
  },
  Ring: {
    OR: [
      // Legacy type codes (lowercase in database)
      { raw: { path: ['type'], equals: 'rg' } },
      { raw: { path: ['itemType'], equals: 'rg' } },
      { raw: { path: ['system', 'type'], equals: 'rg' } },
    ],
  },
  Rod: {
    OR: [
      // Legacy type codes (lowercase in database)
      { raw: { path: ['type'], equals: 'rd' } },
      { raw: { path: ['itemType'], equals: 'rd' } },
      { raw: { path: ['system', 'type'], equals: 'rd' } },
    ],
  },
  Shield: {
    OR: [
      // Legacy type codes (lowercase in database)
      { raw: { path: ['type'], equals: 's' } },
      { raw: { path: ['itemType'], equals: 's' } },
      { raw: { path: ['system', 'type'], equals: 's' } },
      // Check for shield flag
      { raw: { path: ['system', 'shield'], not: null } },
    ],
  },
  Trinket: {
    OR: [
      // Legacy type codes (lowercase in database)
      { raw: { path: ['type'], equals: 'tr' } },
      { raw: { path: ['itemType'], equals: 'tr' } },
      { raw: { path: ['system', 'type'], equals: 'tr' } },
    ],
  },
  'Vehicle Equipment': {
    OR: [
      // Legacy type codes (lowercase in database)
      { raw: { path: ['type'], equals: 'veh' } },
      { raw: { path: ['itemType'], equals: 'veh' } },
      { raw: { path: ['system', 'type'], equals: 'veh' } },
    ],
  },
  Wand: {
    OR: [
      // Legacy type codes (lowercase in database)
      { raw: { path: ['type'], equals: 'wd' } },
      { raw: { path: ['itemType'], equals: 'wd' } },
      { raw: { path: ['system', 'type'], equals: 'wd' } },
    ],
  },
  'Wondrous Item': {
    OR: [
      // Check for wondrous flag (from actual data: raw.system.wondrous = true)
      { raw: { path: ['system', 'wondrous'], equals: true } },
      // Legacy type codes (lowercase in database)
      { raw: { path: ['type'], equals: 'w' } },
      { raw: { path: ['itemType'], equals: 'w' } },
      { raw: { path: ['system', 'type'], equals: 'w' } },
    ],
  },
  'Natural Armor': {
    OR: [
      // Check for naturalArmor flag
      { raw: { path: ['naturalArmor'], not: null } },
      { raw: { path: ['system', 'naturalArmor'], not: null } },
    ],
  },
};

function getEquipmentTypeFilter(equipmentType: string): any {
  const filter = EQUIPMENT_TYPE_FILTERS[equipmentType];
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[Equipment Filter] selected=${equipmentType} resolved=${filter ? JSON.stringify(filter) : 'null'}`
    );
  }
  return filter || null;
}

// Consumable type filter mappings
const CONSUMABLE_TYPE_FILTERS: Record<string, any> = {
  'Ammunition': {
    OR: [
      { raw: { path: ['type'], equals: 'a' } },
      { raw: { path: ['itemType'], equals: 'a' } },
      { raw: { path: ['system', 'type'], equals: 'a' } },
    ]
  },
  'Potion': {
    OR: [
      { raw: { path: ['type'], equals: 'p' } },
      { raw: { path: ['itemType'], equals: 'p' } },
      { raw: { path: ['system', 'type'], equals: 'p' } },
      { raw: { path: ['system', 'potion'], equals: true } },
    ]
  },
  'Rod': {
    OR: [
      { raw: { path: ['type'], equals: 'rd' } },
      { raw: { path: ['itemType'], equals: 'rd' } },
      { raw: { path: ['system', 'type'], equals: 'rd' } },
    ]
  },
  'Scroll': {
    OR: [
      { raw: { path: ['type'], equals: 'sc' } },
      { raw: { path: ['itemType'], equals: 'sc' } },
      { raw: { path: ['system', 'type'], equals: 'sc' } },
    ]
  },
  'Trinket': {
    OR: [
      { raw: { path: ['type'], equals: 'w' } },
      { raw: { path: ['itemType'], equals: 'w' } },
      { raw: { path: ['system', 'type'], equals: 'w' } },
      { raw: { path: ['system', 'wondrous'], equals: true } },
    ]
  },
  'Vehicle Equipment': {
    OR: [
      { raw: { path: ['type'], equals: 'veh' } },
      { raw: { path: ['itemType'], equals: 'veh' } },
      { raw: { path: ['system', 'type'], equals: 'veh' } },
    ]
  },
  'Wand': {
    OR: [
      { raw: { path: ['type'], equals: 'wd' } },
      { raw: { path: ['itemType'], equals: 'wd' } },
      { raw: { path: ['system', 'type'], equals: 'wd' } },
    ]
  },
  'Wondrous Item': {
    OR: [
      { raw: { path: ['type'], equals: 'w' } },
      { raw: { path: ['itemType'], equals: 'w' } },
      { raw: { path: ['system', 'type'], equals: 'w' } },
      { raw: { path: ['system', 'wondrous'], equals: true } },
    ]
  },
};

function getConsumableTypeFilter(consumableType: string): any {
  const filter = CONSUMABLE_TYPE_FILTERS[consumableType];
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[Consumables Filter] selected=${consumableType} resolved=${filter ? JSON.stringify(filter) : 'null'}`
    );
  }
  return filter || null;
}

// Transportation type filter mappings
const TRANSPORT_TYPE_FILTERS: Record<string, any> = {
  'Mount': {
    OR: [
      { raw: { path: ['type'], equals: 'mnt' } },
      { raw: { path: ['itemType'], equals: 'mnt' } },
      { raw: { path: ['system', 'type'], equals: 'mnt' } },
    ]
  },
  'Vehicle (Land)': {
    OR: [
      { raw: { path: ['type'], equals: 'veh' } },
      { raw: { path: ['itemType'], equals: 'veh' } },
      { raw: { path: ['system', 'type'], equals: 'veh' } },
    ]
  },
  'Vehicle (Water)': {
    OR: [
      { raw: { path: ['type'], equals: 'shp' } },
      { raw: { path: ['itemType'], equals: 'shp' } },
      { raw: { path: ['system', 'type'], equals: 'shp' } },
    ]
  },
};

function getTransportationTypeFilter(transportationType: string): any {
  const filter = TRANSPORT_TYPE_FILTERS[transportationType];
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[Transportation Filter] selected=${transportationType} resolved=${filter ? JSON.stringify(filter) : 'null'}`
    );
  }
  return filter || null;
}

// Tool type filter mappings
const TOOL_TYPE_FILTERS: Record<string, any> = {
  "Artisan's Tools": {
    OR: [
      { raw: { path: ['type'], equals: 'at' } },
      { raw: { path: ['itemType'], equals: 'at' } },
      { raw: { path: ['system', 'type'], equals: 'at' } },
      { raw: { path: ['type'], equals: 't' } },
      { raw: { path: ['itemType'], equals: 't' } },
      { raw: { path: ['system', 'type'], equals: 't' } },
    ]
  },
  'Gaming Set': {
    OR: [
      { raw: { path: ['type'], equals: 'gs' } },
      { raw: { path: ['itemType'], equals: 'gs' } },
      { raw: { path: ['system', 'type'], equals: 'gs' } },
    ]
  },
  'Musical Instrument': {
    OR: [
      { raw: { path: ['type'], equals: 'ins' } },
      { raw: { path: ['itemType'], equals: 'ins' } },
      { raw: { path: ['system', 'type'], equals: 'ins' } },
    ]
  },
};

function getToolTypeFilter(toolType: string): any {
  const filter = TOOL_TYPE_FILTERS[toolType];
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[Tool Filter] selected=${toolType} resolved=${filter ? JSON.stringify(filter) : 'null'}`
    );
  }
  return filter || null;
}

// Loot type filter mappings
const treasureCode = '$';
const LOOT_TYPE_FILTERS: Record<string, any> = {
  'Art Object': {
    OR: [
      { raw: { path: ['type'], equals: 'g' } },
      { raw: { path: ['itemType'], equals: 'g' } },
      { raw: { path: ['system', 'type'], equals: 'g' } },
      { raw: { path: ['system', 'art'], equals: true } },
    ]
  },
  'Adventuring Gear': {
    OR: [
      { raw: { path: ['type'], equals: 'g' } },
      { raw: { path: ['itemType'], equals: 'g' } },
      { raw: { path: ['system', 'type'], equals: 'g' } },
    ]
  },
  'Gemstone': {
    OR: [
      { raw: { path: ['type'], equals: 'g' } },
      { raw: { path: ['itemType'], equals: 'g' } },
      { raw: { path: ['system', 'type'], equals: 'g' } },
      { raw: { path: ['system', 'gem'], equals: true } },
    ]
  },
  'Junk': {
    OR: [
      { raw: { path: ['type'], equals: 'g' } },
      { raw: { path: ['itemType'], equals: 'g' } },
      { raw: { path: ['system', 'type'], equals: 'g' } },
      { raw: { path: ['system', 'junk'], equals: true } },
    ]
  },
  'Material': {
    OR: [
      { raw: { path: ['type'], equals: 'g' } },
      { raw: { path: ['itemType'], equals: 'g' } },
      { raw: { path: ['system', 'type'], equals: 'g' } },
      { raw: { path: ['system', 'material'], equals: true } },
    ]
  },
  'Resource': {
    OR: [
      { raw: { path: ['type'], equals: 'g' } },
      { raw: { path: ['itemType'], equals: 'g' } },
      { raw: { path: ['system', 'type'], equals: 'g' } },
    ]
  },
  'Trade Good': {
    OR: [
      { raw: { path: ['type'], equals: 'tg' } },
      { raw: { path: ['itemType'], equals: 'tg' } },
      { raw: { path: ['system', 'type'], equals: 'tg' } },
    ]
  },
  'Treasure': {
    OR: [
      { raw: { path: ['type'], equals: treasureCode } },
      { raw: { path: ['itemType'], equals: treasureCode } },
      { raw: { path: ['system', 'type'], equals: treasureCode } },
    ]
  },
};

function getLootTypeFilter(lootType: string): any {
  const filter = LOOT_TYPE_FILTERS[lootType];
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[Loot Filter] selected=${lootType} resolved=${filter ? JSON.stringify(filter) : 'null'}`
    );
  }
  return filter || null;
}

function getItemRarityLabel(value: string): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  return normalized
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getItemTypeFilterCandidates(itemType: string): Array<Record<string, any>> {
  const rawValue = String(itemType || '').trim();
  if (!rawValue || rawValue.toLowerCase() === 'magic-item') return [];
  const value = rawValue.toUpperCase();
  const lowerValue = value.toLowerCase();

  const baseFilters = [
    { raw: { path: ['type'], equals: value } },
    { raw: { path: ['type'], equals: lowerValue } },
    { raw: { path: ['itemType'], equals: value } },
    { raw: { path: ['itemType'], equals: lowerValue } },
    { raw: { path: ['system', 'type'], equals: value } },
    { raw: { path: ['system', 'type'], equals: lowerValue } },
    { raw: { path: ['system', 'itemType'], equals: value } },
    { raw: { path: ['system', 'itemType'], equals: lowerValue } },
  ];

  // For 'WPN' (Weapons), also match 5e SRD style 'weapon' type and weaponCategory
  if (value === 'WPN') {
    return [
      ...baseFilters,
      { raw: { path: ['type'], equals: 'weapon' } },
      { raw: { path: ['type'], equals: 'Weapon' } },
      { raw: { path: ['system', 'type'], equals: 'weapon' } },
      { raw: { path: ['system', 'type'], equals: 'Weapon' } },
      // Match by weaponCategory field (simple/martial)
      { raw: { path: ['weaponCategory'], equals: 'simple' } },
      { raw: { path: ['weaponCategory'], equals: 'martial' } },
      { raw: { path: ['weaponCategory'], equals: 'Simple' } },
      { raw: { path: ['weaponCategory'], equals: 'Martial' } },
      { raw: { path: ['system', 'weaponCategory'], equals: 'simple' } },
      { raw: { path: ['system', 'weaponCategory'], equals: 'martial' } },
      { raw: { path: ['system', 'weaponCategory'], equals: 'Simple' } },
      { raw: { path: ['system', 'weaponCategory'], equals: 'Martial' } },
    ];
  }

  return baseFilters;
}

const LOCAL_FALLBACK_IMAGE_BY_TYPE: Record<string, string> = {
  monster: '/icons/monster.svg',
  creature: '/icons/monster.svg',
  npc: '/icons/monster.svg',
  spell: '/dice-icons/d20.svg',
  item: '/dice-icons/d12.svg',
  class: '/dice-icons/d10.svg',
  feat: '/dice-icons/d8.svg',
  species: '/dice-icons/d6.svg',
  race: '/dice-icons/d6.svg',
  background: '/dice-icons/d4.svg',
  condition: '/dice-icons/d100.svg',
};

function normalizeImageType(type: string): string {
  const normalized = String(type || '').trim().toLowerCase();
  if (normalized === 'creature' || normalized === 'npc') return 'monster';
  if (normalized === 'race') return 'species';
  return normalized || 'item';
}

function getLocalFallbackImage(type: string): string {
  return LOCAL_FALLBACK_IMAGE_BY_TYPE[normalizeImageType(type)] || '/icons/monster.svg';
}

function getSourceCodeFromEntry(raw: any, normalized: any): string {
  const candidate = String(
    normalized?.book ||
    raw?.book ||
    raw?.source ||
    raw?.system?.source?.custom ||
    raw?.system?.source?.rules ||
    'MM',
  ).trim();
  const stripped = candidate.replace(/[^a-zA-Z0-9]/g, '');
  return (stripped || 'MM').toUpperCase();
}

function build5eToolsMonsterTokenUrl(sourceCode: string, name: string): string {
  const encodedName = encodeURIComponent(String(name || '').trim());
  return `${FIVE_ETOOLS_IMG_BASE_URL}/bestiary/tokens/${sourceCode}/${encodedName}.webp`;
}

function resolveEntryImages(type: string, raw: any, normalized: any): { img?: string; imgToken?: string; imgSource: string; imgFallback: string } {
  const fallback = getLocalFallbackImage(type);
  const resolved: { img?: string; imgToken?: string; imgSource: string; imgFallback: string } = {
    img: normalized?.img,
    imgToken: normalized?.imgToken,
    imgSource: normalized?.imgSource || 'manual',
    imgFallback: normalized?.imgFallback || fallback,
  };

  if (!IMAGE_FETCHER_CONFIG.flags.enabled) {
    if (!resolved.img) {
      resolved.img = fallback;
      resolved.imgSource = 'fallback';
    }
    return resolved;
  }

  const normalizedType = normalizeImageType(type);

  if (IMAGE_FETCHER_CONFIG.flags.providers['5etools'] && normalizedType === 'monster') {
    const sourceCode = getSourceCodeFromEntry(raw, normalized);
    const tokenUrl = build5eToolsMonsterTokenUrl(sourceCode, normalized?.name || raw?.name || 'Unknown');

    if (!resolved.imgToken) {
      resolved.imgToken = tokenUrl;
      resolved.imgSource = '5etools';
    }
    if (!resolved.img) {
      resolved.img = resolved.imgToken;
      resolved.imgSource = '5etools';
    }
  }

  if (!resolved.img) {
    resolved.img = fallback;
    if (!resolved.imgSource || resolved.imgSource === 'manual') {
      resolved.imgSource = 'fallback';
    }
  }

  return resolved;
}

function isCandidateUrlAllowed(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (IMAGE_FETCHER_CONFIG.deniedHosts.includes(host)) return false;
    if (IMAGE_FETCHER_CONFIG.allowedHosts.length > 0 && !IMAGE_FETCHER_CONFIG.allowedHosts.includes(host)) return false;
    const pathname = parsed.pathname.toLowerCase();
    const extension = pathname.includes('.') ? `.${pathname.split('.').pop()}` : '';
    if (extension && !ALLOWED_IMAGE_EXTENSIONS.has(extension)) return false;
    return true;
  } catch {
    return false;
  }
}

function toImageKind(kind: unknown): 'token' | 'portrait' | 'art' {
  const normalized = String(kind || '').toLowerCase();
  if (normalized === 'token' || normalized === 'portrait' || normalized === 'art') return normalized;
  return 'token';
}

function selectBestCandidate(candidates: any[]): any | null {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => {
    const trustedDelta = Number(Boolean(b.trusted)) - Number(Boolean(a.trusted));
    if (trustedDelta !== 0) return trustedDelta;
    return Number(b.confidence || 0) - Number(a.confidence || 0);
  });
  return sorted[0] || null;
}

router.get('/compendium/images/fetcher-config', async (_req, res) => {
  res.json(getPublicImageFetcherConfig(IMAGE_FETCHER_CONFIG));
});

router.post('/compendium/images/resolve', async (req, res) => {
  if (!IMAGE_FETCHER_CONFIG.flags.enabled) {
    return res.status(400).json({
      error: 'Image fetcher is disabled',
      flags: getPublicImageFetcherConfig(IMAGE_FETCHER_CONFIG).flags,
    });
  }

  const { type, name, source, normalized, raw } = req.body || {};
  if (!type || !name) {
    return res.status(400).json({ error: 'type and name are required' });
  }

  try {
    IMAGE_FETCH_METRICS.resolveCalls += 1;
    const candidates = await resolveImageCandidates(IMAGE_PROVIDERS, {
      type: String(type),
      name: String(name),
      source: source ? String(source) : null,
      normalized: normalized && typeof normalized === 'object' ? normalized : undefined,
      raw: raw && typeof raw === 'object' ? raw : undefined,
    });

    const validatedCandidates = candidates
      .map((candidate) => ({
        ...candidate,
        allowed: isCandidateUrlAllowed(candidate.url),
      }))
      .filter((candidate) => candidate.allowed);

    IMAGE_FETCH_METRICS.resolveCandidatesTotal += validatedCandidates.length;
    validatedCandidates.forEach((candidate) => {
      incrementMetricBucket(IMAGE_FETCH_METRICS.resolveByProvider, candidate.provider || 'unknown');
    });

    const best = selectBestCandidate(validatedCandidates);

    res.json({
      success: true,
      providers: IMAGE_PROVIDERS.map((provider) => provider.id),
      candidateCount: validatedCandidates.length,
      candidates: validatedCandidates,
      bestCandidate: best,
    });
  } catch (error: any) {
    console.error('Error resolving image candidates:', error);
    res.status(500).json({ error: 'Failed to resolve image candidates', message: error?.message || String(error) });
  }
});

router.post('/compendium/images/approve', async (req, res) => {
  const { entryId, candidate, kind } = req.body || {};
  if (!entryId || !candidate?.url) {
    return res.status(400).json({ error: 'entryId and candidate.url are required' });
  }

  if (!isCandidateUrlAllowed(String(candidate.url))) {
    return res.status(400).json({ error: 'Candidate URL is not allowed by host/extension policy' });
  }

  try {
    const entry = await prisma.compendiumEntry.findUnique({
      where: { id: String(entryId) },
      select: { id: true, raw: true, type: true },
    });

    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    const raw = entry.raw && typeof entry.raw === 'object' ? { ...(entry.raw as any) } : {};
    const targetKind = toImageKind(kind || candidate.kind);

    raw.img = targetKind === 'token' ? (raw.img || candidate.url) : candidate.url;
    if (targetKind === 'token') raw.imgToken = candidate.url;
    raw.imgSource = candidate.provider || raw.imgSource || 'manual';
    raw.imgProvider = candidate.provider || null;
    raw.imgConfidence = Number(candidate.confidence || 0);
    raw.imgLicense = candidate.license || null;
    raw.imgAttribution = candidate.attribution || null;
    raw.imgSourceUrl = candidate.sourceUrl || candidate.url;
    raw.imgReviewStatus = 'approved';
    raw.imgResolverTrace = {
      provider: candidate.provider || null,
      reason: candidate.reason || null,
      approvedAt: Date.now(),
    };

    await prisma.compendiumEntry.update({
      where: { id: entry.id },
      data: { raw: raw as any },
    });

    IMAGE_FETCH_METRICS.approvedTotal += 1;
    incrementMetricBucket(IMAGE_FETCH_METRICS.approvedByProvider, String(candidate.provider || 'unknown'));

    res.json({ success: true, entryId: entry.id, kind: targetKind, img: raw.img, imgToken: raw.imgToken || null });
  } catch (error: any) {
    console.error('Error approving image candidate:', error);
    res.status(500).json({ error: 'Failed to approve image candidate', message: error?.message || String(error) });
  }
});

router.post('/compendium/images/reject', async (req, res) => {
  const { entryId, reason } = req.body || {};
  if (!entryId) return res.status(400).json({ error: 'entryId is required' });

  try {
    const entry = await prisma.compendiumEntry.findUnique({
      where: { id: String(entryId) },
      select: { id: true, raw: true },
    });

    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    const raw = entry.raw && typeof entry.raw === 'object' ? { ...(entry.raw as any) } : {};
    raw.imgReviewStatus = 'rejected';
    raw.imgResolverTrace = {
      ...(raw.imgResolverTrace || {}),
      rejectedAt: Date.now(),
      rejectReason: reason ? String(reason) : null,
    };

    await prisma.compendiumEntry.update({
      where: { id: entry.id },
      data: { raw: raw as any },
    });

    IMAGE_FETCH_METRICS.rejectedTotal += 1;

    res.json({ success: true, entryId: entry.id, status: 'rejected' });
  } catch (error: any) {
    console.error('Error rejecting image candidate:', error);
    res.status(500).json({ error: 'Failed to reject image candidate', message: error?.message || String(error) });
  }
});

// Helper function to fetch and combine class files
async function fetchCombinedClassData(classKeys: string[]): Promise<any> {
  const combined: any = { class: [] };
  
  for (const classKey of classKeys) {
    try {
      const response = await fetch(`${BASE_URL}/class/class-${classKey}.json`);
      if (response.ok) {
        const data = await response.json();
        if (data.class && Array.isArray(data.class)) {
          combined.class.push(...data.class);
        }
      }
    } catch (err) {
      console.error(`Error fetching class ${classKey}:`, err);
    }
  }
  
  return combined;
}

async function fetchJsonFrom5eTools(url: string): Promise<any> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'VTT-Importer/1.0',
    },
  });

  if (!response.ok) {
    const error = new Error(`Failed to fetch ${url}: ${response.status}`) as Error & { statusCode?: number; url?: string };
    error.statusCode = response.status;
    error.url = url;
    throw error;
  }

  return response.json();
}

async function fetchCombinedItemData(): Promise<any> {
  const combined: any = { item: [] };
  const itemUrls = [`${BASE_URL}/items-base.json`, `${BASE_URL}/items.json`];

  for (const url of itemUrls) {
    try {
      const data = await fetchJsonFrom5eTools(url);

      for (const key of ['item', 'baseitem', 'magicvariant']) {
        if (Array.isArray(data?.[key])) {
          combined.item.push(...data[key]);
        }
      }
    } catch (err) {
      console.error(`Error fetching items from ${url}:`, err);
    }
  }

  return combined;
}

// PHB classes (core classes)
const PHB_CLASSES = ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard'];

// XPHB classes (2024 classes)
const XPHB_CLASSES = ['artificer', 'bard', 'cleric', 'druid', 'fighter', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard', 'barbarian'];

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 40);
  return base || 'entry';
}

function generateUniqueSlug(base: string): string {
  // Keep randomness first so uniqueness survives even if DB truncates the slug column.
  const token = crypto.randomBytes(16).toString('hex');
  return `${token}-${base}`.substring(0, 80);
}

type FiveEToolsDataset = {
  key: string;
  category: string;
  categoryLabel: string;
  source: string;
  sourceLabel: string;
  label: string;
  defaultName: string;
  url: string;
  type: string;
  rootKeys: string[];
};

const fiveEToolsDatasetCatalog: FiveEToolsDataset[] = [
  {
    key: 'spells-phb',
    category: 'spells',
    categoryLabel: 'Spells',
    source: 'phb',
    sourceLabel: 'PHB',
    label: 'Spells (PHB)',
    defaultName: '5eTools Spells (PHB)',
    url: `${BASE_URL}/spells/spells-phb.json`,
    type: 'spell',
    rootKeys: ['spell'],
  },
  {
    key: 'spells-xphb',
    category: 'spells',
    categoryLabel: 'Spells',
    source: 'xphb',
    sourceLabel: 'XPHB',
    label: 'Spells (XPHB)',
    defaultName: '5eTools Spells (XPHB)',
    url: `${BASE_URL}/spells/spells-xphb.json`,
    type: 'spell',
    rootKeys: ['spell'],
  },
  {
    key: 'spells-xge',
    category: 'spells',
    categoryLabel: 'Spells',
    source: 'xge',
    sourceLabel: 'XGE',
    label: 'Spells (XGE)',
    defaultName: '5eTools Spells (XGE)',
    url: `${BASE_URL}/spells/spells-xge.json`,
    type: 'spell',
    rootKeys: ['spell'],
  },
  {
    key: 'spells-tce',
    category: 'spells',
    categoryLabel: 'Spells',
    source: 'tce',
    sourceLabel: 'TCE',
    label: 'Spells (TCE)',
    defaultName: '5eTools Spells (TCE)',
    url: `${BASE_URL}/spells/spells-tce.json`,
    type: 'spell',
    rootKeys: ['spell'],
  },
  {
    key: 'spells-scc',
    category: 'spells',
    categoryLabel: 'Spells',
    source: 'scc',
    sourceLabel: 'SCC',
    label: 'Spells (SCC)',
    defaultName: '5eTools Spells (SCC)',
    url: `${BASE_URL}/spells/spells-scc.json`,
    type: 'spell',
    rootKeys: ['spell'],
  },
  {
    key: 'spells-egw',
    category: 'spells',
    categoryLabel: 'Spells',
    source: 'egw',
    sourceLabel: 'EGW',
    label: 'Spells (EGW)',
    defaultName: '5eTools Spells (EGW)',
    url: `${BASE_URL}/spells/spells-egw.json`,
    type: 'spell',
    rootKeys: ['spell'],
  },
  {
    key: 'spells-ggr',
    category: 'spells',
    categoryLabel: 'Spells',
    source: 'ggr',
    sourceLabel: 'GGR',
    label: 'Spells (GGR)',
    defaultName: '5eTools Spells (GGR)',
    url: `${BASE_URL}/spells/spells-ggr.json`,
    type: 'spell',
    rootKeys: ['spell'],
  },
  {
    key: 'spells-ftd',
    category: 'spells',
    categoryLabel: 'Spells',
    source: 'ftd',
    sourceLabel: 'FTD',
    label: 'Spells (FTD)',
    defaultName: '5eTools Spells (FTD)',
    url: `${BASE_URL}/spells/spells-ftd.json`,
    type: 'spell',
    rootKeys: ['spell'],
  },
  {
    key: 'spells-ai',
    category: 'spells',
    categoryLabel: 'Spells',
    source: 'ai',
    sourceLabel: 'AI',
    label: 'Spells (AI)',
    defaultName: '5eTools Spells (AI)',
    url: `${BASE_URL}/spells/spells-ai.json`,
    type: 'spell',
    rootKeys: ['spell'],
  },
  {
    key: 'spells-bmt',
    category: 'spells',
    categoryLabel: 'Spells',
    source: 'bmt',
    sourceLabel: 'BMT',
    label: 'Spells (BMT)',
    defaultName: '5eTools Spells (BMT)',
    url: `${BASE_URL}/spells/spells-bmt.json`,
    type: 'spell',
    rootKeys: ['spell'],
  },
  {
    key: 'monsters-mm',
    category: 'monsters',
    categoryLabel: 'Monsters',
    source: 'mm',
    sourceLabel: 'MM',
    label: 'Monsters (MM)',
    defaultName: '5eTools Monsters (MM)',
    url: `${BASE_URL}/bestiary/bestiary-mm.json`,
    type: 'monster',
    rootKeys: ['monster'],
  },
  {
    key: 'monsters-mpmm',
    category: 'monsters',
    categoryLabel: 'Monsters',
    source: 'mpmm',
    sourceLabel: 'MPMM',
    label: 'Monsters (MPMM)',
    defaultName: '5eTools Monsters (MPMM)',
    url: `${BASE_URL}/bestiary/bestiary-mpmm.json`,
    type: 'monster',
    rootKeys: ['monster'],
  },
  {
    key: 'monsters-vgm',
    category: 'monsters',
    categoryLabel: 'Monsters',
    source: 'vgm',
    sourceLabel: 'VGtM',
    label: 'Monsters (VGtM)',
    defaultName: '5eTools Monsters (VGtM)',
    url: `${BASE_URL}/bestiary/bestiary-vgm.json`,
    type: 'monster',
    rootKeys: ['monster'],
  },
  {
    key: 'monsters-mtf',
    category: 'monsters',
    categoryLabel: 'Monsters',
    source: 'mtf',
    sourceLabel: 'MTF',
    label: 'Monsters (MTF)',
    defaultName: '5eTools Monsters (MTF)',
    url: `${BASE_URL}/bestiary/bestiary-mtf.json`,
    type: 'monster',
    rootKeys: ['monster'],
  },
  {
    key: 'monsters-xge',
    category: 'monsters',
    categoryLabel: 'Monsters',
    source: 'xge',
    sourceLabel: 'XGE',
    label: 'Monsters (XGE)',
    defaultName: '5eTools Monsters (XGE)',
    url: `${BASE_URL}/bestiary/bestiary-xge.json`,
    type: 'monster',
    rootKeys: ['monster'],
  },
  {
    key: 'monsters-tce',
    category: 'monsters',
    categoryLabel: 'Monsters',
    source: 'tce',
    sourceLabel: 'TCE',
    label: 'Monsters (TCE)',
    defaultName: '5eTools Monsters (TCE)',
    url: `${BASE_URL}/bestiary/bestiary-tce.json`,
    type: 'monster',
    rootKeys: ['monster'],
  },
  {
    key: 'monsters-mot',
    category: 'monsters',
    categoryLabel: 'Monsters',
    source: 'mot',
    sourceLabel: 'MotM',
    label: 'Monsters (MotM)',
    defaultName: '5eTools Monsters (MotM)',
    url: `${BASE_URL}/bestiary/bestiary-mot.json`,
    type: 'monster',
    rootKeys: ['monster'],
  },
  {
    key: 'monsters-ftd',
    category: 'monsters',
    categoryLabel: 'Monsters',
    source: 'ftd',
    sourceLabel: 'FTD',
    label: 'Monsters (FTD)',
    defaultName: '5eTools Monsters (FTD)',
    url: `${BASE_URL}/bestiary/bestiary-ftd.json`,
    type: 'monster',
    rootKeys: ['monster'],
  },
  {
    key: 'monsters-egw',
    category: 'monsters',
    categoryLabel: 'Monsters',
    source: 'egw',
    sourceLabel: 'EGW',
    label: 'Monsters (EGW)',
    defaultName: '5eTools Monsters (EGW)',
    url: `${BASE_URL}/bestiary/bestiary-egw.json`,
    type: 'monster',
    rootKeys: ['monster'],
  },
  {
    key: 'monsters-ggr',
    category: 'monsters',
    categoryLabel: 'Monsters',
    source: 'ggr',
    sourceLabel: 'GGR',
    label: 'Monsters (GGR)',
    defaultName: '5eTools Monsters (GGR)',
    url: `${BASE_URL}/bestiary/bestiary-ggr.json`,
    type: 'monster',
    rootKeys: ['monster'],
  },
  {
    key: 'monsters-vrgr',
    category: 'monsters',
    categoryLabel: 'Monsters',
    source: 'vrgr',
    sourceLabel: 'VRGR',
    label: 'Monsters (VRGR)',
    defaultName: '5eTools Monsters (VRGR)',
    url: `${BASE_URL}/bestiary/bestiary-vrgr.json`,
    type: 'monster',
    rootKeys: ['monster'],
  },
  {
    key: 'monsters-scc',
    category: 'monsters',
    categoryLabel: 'Monsters',
    source: 'scc',
    sourceLabel: 'SCC',
    label: 'Monsters (SCC)',
    defaultName: '5eTools Monsters (SCC)',
    url: `${BASE_URL}/bestiary/bestiary-scc.json`,
    type: 'monster',
    rootKeys: ['monster'],
  },
  {
    key: 'monsters-ai',
    category: 'monsters',
    categoryLabel: 'Monsters',
    source: 'ai',
    sourceLabel: 'AI',
    label: 'Monsters (AI)',
    defaultName: '5eTools Monsters (AI)',
    url: `${BASE_URL}/bestiary/bestiary-ai.json`,
    type: 'monster',
    rootKeys: ['monster'],
  },
  {
    key: 'monsters-bmt',
    category: 'monsters',
    categoryLabel: 'Monsters',
    source: 'bmt',
    sourceLabel: 'BMT',
    label: 'Monsters (BMT)',
    defaultName: '5eTools Monsters (BMT)',
    url: `${BASE_URL}/bestiary/bestiary-bmt.json`,
    type: 'monster',
    rootKeys: ['monster'],
  },
  {
    key: 'monsters-dmg',
    category: 'monsters',
    categoryLabel: 'Monsters',
    source: 'dmg',
    sourceLabel: 'DMG',
    label: 'Monsters (DMG)',
    defaultName: '5eTools Monsters (DMG)',
    url: `${BASE_URL}/bestiary/bestiary-dmg.json`,
    type: 'monster',
    rootKeys: ['monster'],
  },
  {
    key: 'monsters-cos',
    category: 'monsters',
    categoryLabel: 'Monsters',
    source: 'cos',
    sourceLabel: 'CoS',
    label: 'Monsters (CoS)',
    defaultName: '5eTools Monsters (CoS)',
    url: `${BASE_URL}/bestiary/bestiary-cos.json`,
    type: 'monster',
    rootKeys: ['monster'],
  },
  {
    key: 'monsters-toa',
    category: 'monsters',
    categoryLabel: 'Monsters',
    source: 'toa',
    sourceLabel: 'ToA',
    label: 'Monsters (ToA)',
    defaultName: '5eTools Monsters (ToA)',
    url: `${BASE_URL}/bestiary/bestiary-toa.json`,
    type: 'monster',
    rootKeys: ['monster'],
  },
  {
    key: 'monsters-skT',
    category: 'monsters',
    categoryLabel: 'Monsters',
    source: 'skt',
    sourceLabel: 'SkT',
    label: 'Monsters (SkT)',
    defaultName: '5eTools Monsters (SkT)',
    url: `${BASE_URL}/bestiary/bestiary-skt.json`,
    type: 'monster',
    rootKeys: ['monster'],
  },
  {
    key: 'monsters-llk',
    category: 'monsters',
    categoryLabel: 'Monsters',
    source: 'llk',
    sourceLabel: 'LLK',
    label: 'Monsters (LLK)',
    defaultName: '5eTools Monsters (LLK)',
    url: `${BASE_URL}/bestiary/bestiary-llk.json`,
    type: 'monster',
    rootKeys: ['monster'],
  },
  {
    key: 'monsters-wdh',
    category: 'monsters',
    categoryLabel: 'Monsters',
    source: 'wdh',
    sourceLabel: 'WDH',
    label: 'Monsters (WDH)',
    defaultName: '5eTools Monsters (WDH)',
    url: `${BASE_URL}/bestiary/bestiary-wdh.json`,
    type: 'monster',
    rootKeys: ['monster'],
  },
  {
    key: 'monsters-wdmm',
    category: 'monsters',
    categoryLabel: 'Monsters',
    source: 'wdmm',
    sourceLabel: 'WDMM',
    label: 'Monsters (WDMM)',
    defaultName: '5eTools Monsters (WDMM)',
    url: `${BASE_URL}/bestiary/bestiary-wdmm.json`,
    type: 'monster',
    rootKeys: ['monster'],
  },
  {
    key: 'monsters-lmop',
    category: 'monsters',
    categoryLabel: 'Monsters',
    source: 'lmop',
    sourceLabel: 'LMoP',
    label: 'Monsters (LMoP)',
    defaultName: '5eTools Monsters (LMoP)',
    url: `${BASE_URL}/bestiary/bestiary-lmop.json`,
    type: 'monster',
    rootKeys: ['monster'],
  },
  {
    key: 'monsters-hotdq',
    category: 'monsters',
    categoryLabel: 'Monsters',
    source: 'hotdq',
    sourceLabel: 'HoTDQ',
    label: 'Monsters (HoTDQ)',
    defaultName: '5eTools Monsters (HoTDQ)',
    url: `${BASE_URL}/bestiary/bestiary-hotdq.json`,
    type: 'monster',
    rootKeys: ['monster'],
  },
  {
    key: 'monsters-phb',
    category: 'monsters',
    categoryLabel: 'Monsters',
    source: 'phb',
    sourceLabel: 'PHB',
    label: 'Monsters (PHB)',
    defaultName: '5eTools Monsters (PHB)',
    url: `${BASE_URL}/bestiary/bestiary-phb.json`,
    type: 'monster',
    rootKeys: ['monster'],
  },
  {
    key: 'items-all',
    category: 'items',
    categoryLabel: 'Items',
    source: 'all',
    sourceLabel: 'All',
    label: 'Items (All)',
    defaultName: '5eTools Items (All)',
    url: `${BASE_URL}/items.json`,
    type: 'item',
    rootKeys: ['item', 'baseitem', 'magicvariant'],
  },
  {
    key: 'items-base',
    category: 'items',
    categoryLabel: 'Items',
    source: 'base',
    sourceLabel: 'Base',
    label: 'Items (Core)',
    defaultName: '5eTools Items (Core)',
    url: `${BASE_URL}/items-base.json`,
    type: 'item',
    rootKeys: ['item', 'baseitem', 'magicvariant'],
  },
  {
    key: 'classes-phb',
    category: 'classes',
    categoryLabel: 'Classes',
    source: 'phb',
    sourceLabel: 'PHB',
    label: 'Classes (PHB)',
    defaultName: '5eTools Classes (PHB)',
    url: 'DYNAMIC_CLASS_URL',
    type: 'class',
    rootKeys: ['class'],
  },
  {
    key: 'classes-xphb',
    category: 'classes',
    categoryLabel: 'Classes',
    source: 'xphb',
    sourceLabel: 'XPHB',
    label: 'Classes (XPHB)',
    defaultName: '5eTools Classes (XPHB)',
    url: 'DYNAMIC_CLASS_URL',
    type: 'class',
    rootKeys: ['class'],
  },
  {
    key: 'classes-artificer',
    category: 'classes',
    categoryLabel: 'Classes',
    source: 'artificer',
    sourceLabel: 'Artificer',
    label: 'Artificer',
    defaultName: '5eTools Artificer',
    url: `${BASE_URL}/class/class-artificer.json`,
    type: 'class',
    rootKeys: ['class'],
  },
  {
    key: 'classes-mystic',
    category: 'classes',
    categoryLabel: 'Classes',
    source: 'mystic',
    sourceLabel: 'Mystic',
    label: 'Mystic',
    defaultName: '5eTools Mystic',
    url: `${BASE_URL}/class/class-mystic.json`,
    type: 'class',
    rootKeys: ['class'],
  },
  {
    key: 'classes-sidekick',
    category: 'classes',
    categoryLabel: 'Classes',
    source: 'sidekick',
    sourceLabel: 'Sidekick',
    label: 'Sidekick',
    defaultName: '5eTools Sidekick',
    url: `${BASE_URL}/class/class-sidekick.json`,
    type: 'class',
    rootKeys: ['class'],
  },
  {
    key: 'backgrounds-all',
    category: 'backgrounds',
    categoryLabel: 'Backgrounds',
    source: 'all',
    sourceLabel: 'All',
    label: 'Backgrounds',
    defaultName: '5eTools Backgrounds',
    url: `${BASE_URL}/backgrounds.json`,
    type: 'background',
    rootKeys: ['background'],
  },
  {
    key: 'species-races',
    category: 'species',
    categoryLabel: 'Species/Races',
    source: 'all',
    sourceLabel: 'All',
    label: 'Species/Races',
    defaultName: '5eTools Species',
    url: `${BASE_URL}/races.json`,
    type: 'species',
    rootKeys: ['race'],
  },
  {
    key: 'feats-all',
    category: 'feats',
    categoryLabel: 'Feats',
    source: 'all',
    sourceLabel: 'All',
    label: 'Feats',
    defaultName: '5eTools Feats',
    url: `${BASE_URL}/feats.json`,
    type: 'feat',
    rootKeys: ['feat'],
  },
  {
    key: 'conditions-all',
    category: 'conditions',
    categoryLabel: 'Conditions',
    source: 'all',
    sourceLabel: 'All',
    label: 'Conditions & Diseases',
    defaultName: '5eTools Conditions & Diseases',
    url: `${BASE_URL}/conditionsdiseases.json`,
    type: 'condition',
    rootKeys: ['condition', 'disease'],
  },
];

const fiveEToolsDatasets: Record<string, { url: string; type: string; rootKeys: string[] }> = {
  // Backward-compatible short aliases
  spells: {
    url: `${BASE_URL}/spells/spells-phb.json`,
    type: 'spell',
    rootKeys: ['spell'],
  },
  monsters: {
    url: `${BASE_URL}/bestiary/bestiary-mm.json`,
    type: 'monster',
    rootKeys: ['monster'],
  },
  items: {
    url: `${BASE_URL}/items.json`,
    type: 'item',
    rootKeys: ['item', 'baseitem', 'magicvariant'],
  },
  classes: {
    url: 'DYNAMIC_CLASS_URL',
    type: 'class',
    rootKeys: ['class'],
  },
  backgrounds: {
    url: `${BASE_URL}/backgrounds.json`,
    type: 'background',
    rootKeys: ['background'],
  },
  species: {
    url: `${BASE_URL}/races.json`,
    type: 'species',
    rootKeys: ['race'],
  },
};

for (const dataset of fiveEToolsDatasetCatalog) {
  fiveEToolsDatasets[dataset.key] = {
    url: dataset.url,
    type: dataset.type,
    rootKeys: dataset.rootKeys,
  };
}

function extractDatasetItems(payload: any, rootKeys: string[]): any[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  for (const key of rootKeys) {
    const data = (payload as any)[key];
    if (Array.isArray(data)) return data;
  }

  const firstArray = Object.values(payload).find((value) => Array.isArray(value));
  return Array.isArray(firstArray) ? firstArray : [payload];
}

function parseFiveEToolsDatasetFromDescription(description?: string | null): string | null {
  const match = String(description || '').match(/Imported from 5eTools \(([^)]+)\)/i);
  return match?.[1]?.trim() || null;
}

async function inferFiveEToolsDatasetForModule(moduleId: string, moduleName: string): Promise<string | null> {
  const entries = await prisma.compendiumEntry.findMany({
    where: { moduleId },
    select: { type: true },
    take: 20,
  });

  if (entries.length === 0) return null;

  const types = new Set(entries.map((entry) => String(entry.type || '').toLowerCase()).filter(Boolean));
  const moduleLabel = String(moduleName || '').toLowerCase();

  if (types.size === 1 && types.has('item')) {
    if (moduleLabel.includes('item') || moduleLabel.includes('5etools') || moduleLabel.includes('phb')) {
      return 'items-all';
    }
  }

  return null;
}

async function importFiveEToolsDataset(params: {
  dataset: string;
  name: string;
  system: string;
  version?: string | null;
  description?: string | null;
  moduleId?: string | null;
  replaceExisting?: boolean;
  allowedSources?: string[]; // Optional: filter entries by source
}) {
  const { dataset, name, system, version, description, moduleId, replaceExisting = false, allowedSources } = params;
  const preset = fiveEToolsDatasets[String(dataset)];

  if (!preset) {
    const error = new Error(`Unknown 5eTools dataset "${dataset}"`) as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }

  let payload: any;
  let fetchUrl = preset.url;

  if (preset.url === 'DYNAMIC_CLASS_URL') {
    const classKeys = dataset === 'classes-xphb' ? XPHB_CLASSES : PHB_CLASSES;
    payload = await fetchCombinedClassData(classKeys);
    fetchUrl = `${BASE_URL}/class (combined from ${classKeys.length} files)`;
  } else if (dataset === 'items-all') {
    payload = await fetchCombinedItemData();
    fetchUrl = `${BASE_URL}/items-base.json + ${BASE_URL}/items.json`;
  } else {
    payload = await fetchJsonFrom5eTools(preset.url);
  }

  const items = extractDatasetItems(payload, preset.rootKeys);
  if (items.length === 0) {
    const error = new Error('Dataset returned no importable items') as Error & { statusCode?: number; url?: string };
    error.statusCode = 422;
    error.url = fetchUrl;
    throw error;
  }

  // Optional: Filter items by source (for datasets without per-book JSON files)
  let filteredItems = items;
  if (allowedSources && allowedSources.length > 0) {
    const allowedSet = new Set(allowedSources);
    const totalCount = items.length;
    filteredItems = items.filter((item: any) => {
      const itemSource = item.source;
      return itemSource && allowedSet.has(itemSource);
    });
    console.log(`[Import] Filtered ${totalCount} items by sources [${allowedSources.join(', ')}] -> kept ${filteredItems.length} of ${totalCount}`);
  }

  let module: any = null;
  if (moduleId) {
    module = await prisma.dataModule.findUnique({ where: { id: moduleId } });
    if (!module) {
      const error = new Error(`Module "${moduleId}" not found`) as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }
  } else {
    module = await prisma.dataModule.findFirst({
      where: { name, system },
    });
  }

  if (!module) {
    module = await prisma.dataModule.create({
      data: {
        name,
        system,
        version: version || '5etools',
        description: description || `Imported from 5eTools (${dataset})`,
        itemCount: 0,
      },
    });
  } else if (replaceExisting) {
    await prisma.compendiumEntry.deleteMany({ where: { moduleId: module.id } });
    await prisma.dataModule.update({
      where: { id: module.id },
      data: {
        itemCount: 0,
        ...(version ? { version } : {}),
        ...(description ? { description } : {}),
      },
    });
  }

  let createdCount = 0;
  const batchSize = 50;
  for (let i = 0; i < filteredItems.length; i += batchSize) {
    const batch = filteredItems.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (item: any) => {
        try {
          await createCompendiumEntry(module.id, system, preset.type, item);
          createdCount++;
        } catch (err) {
          console.error('Error creating 5eTools entry:', err);
        }
      }),
    );
  }

  const count = await prisma.compendiumEntry.count({ where: { moduleId: module.id } });
  const updatedModule = await prisma.dataModule.update({
    where: { id: module.id },
    data: { itemCount: count },
  });

  return {
    success: true,
    imported: createdCount,
    fetched: items.length,
    dataset,
    sourceUrl: fetchUrl,
    module: { ...updatedModule, itemCount: count },
  };
}

router.get('/import/5etools/datasets', async (_req, res) => {
  console.log('[DEBUG] Serving datasets from catalog:', fiveEToolsDatasetCatalog.length);
  const categories = fiveEToolsDatasetCatalog.map(d => d.category);
  console.log('[DEBUG] Categories in catalog:', [...new Set(categories)]);
  res.json({
    datasets: fiveEToolsDatasetCatalog.map((dataset) => ({
      key: dataset.key,
      category: dataset.category,
      categoryLabel: dataset.categoryLabel,
      source: dataset.source,
      sourceLabel: dataset.sourceLabel,
      label: dataset.label,
      defaultName: dataset.defaultName,
      type: dataset.type,
    })),
  });
});

// Helper function to normalize and create a compendium entry
async function createCompendiumEntry(
  moduleId: string,
  system: string,
  type: string,
  data: any
) {
  // Normalize the data using our new normalizer
  const normalized = normalizeEntry(data) as any;
  const imageMeta = resolveEntryImages(type, data, normalized);
  normalized.img = imageMeta.img;
  normalized.imgToken = imageMeta.imgToken;
  normalized.imgSource = imageMeta.imgSource;
  normalized.imgFallback = imageMeta.imgFallback;
  
  // Use the inferred type if not provided
  const entryType = type || normalized.type;
  
  const slugBase = generateSlug(normalized.name || 'unnamed');
  const entryData = {
    moduleId,
    system,
    type: entryType,
    name: normalized.name || 'Unknown',
    source: normalized.book || normalized.publisher || null,
    summary: normalized.description || null,
    raw: normalized as any,
  };

  let entry: Awaited<ReturnType<typeof prisma.compendiumEntry.create>> | null = null;
  let lastSlugError: any = null;
  const maxAttempts = 6;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      entry = await prisma.compendiumEntry.create({
        data: {
          ...entryData,
          slug: generateUniqueSlug(slugBase),
        },
      });
      break;
    } catch (error: any) {
      const isSlugCollision =
        error?.code === 'P2002' &&
        Array.isArray(error?.meta?.target) &&
        error.meta.target.includes('slug');

      if (!isSlugCollision) {
        throw error;
      }

      lastSlugError = error;
      console.warn(`Slug collision on attempt ${attempt + 1}/${maxAttempts} for "${normalized.name}"`);
    }
  }

  if (!entry) {
    throw lastSlugError || new Error('Failed to create compendium entry due to slug collisions');
  }

  // Validate the normalized entry
  const validation = validateEntry(normalized);
  if (!validation.valid) {
    console.warn(`Validation warnings for entry ${entry.id}:`, validation.errors);
  }

  return entry;
}

// Get all available modules
router.get('/modules', async (req, res) => {
  try {
    const modules = await prisma.dataModule.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(modules);
  } catch (error: any) {
    console.error('Error fetching modules:', error);
    res.status(500).json({ error: 'Failed to fetch modules', message: error.message });
  }
});

// Get modules for a specific session
router.get('/sessions/:sessionId/modules', async (req, res) => {
  const { sessionId } = req.params;
  
  try {
    const sessionModules = await prisma.sessionModule.findMany({
      where: { sessionId },
      include: {
        module: true,
      },
    });
    res.json(sessionModules);
  } catch (error: any) {
    console.error('Error fetching session modules:', error);
    res.status(500).json({ error: 'Failed to fetch session modules', message: error.message });
  }
});

// Create a new module
router.post('/modules', async (req, res) => {
  const { name, system, version, description } = req.body;
  
  if (!name || !system) {
    return res.status(400).json({ error: 'Name and system are required' });
  }
  
  try {
    const module = await prisma.dataModule.create({
      data: {
        name,
        system,
        version: version || null,
        description: description || null,
        itemCount: 0,
      },
    });
    res.json(module);
  } catch (error: any) {
    console.error('Error creating module:', error);
    res.status(500).json({ error: 'Failed to create module', message: error.message });
  }
});

// Delete a module
router.delete('/modules/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    await prisma.dataModule.delete({
      where: { id },
    });
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting module:', error);
    res.status(500).json({ error: 'Failed to delete module', message: error.message });
  }
});

// Toggle module for a session
router.post('/sessions/:sessionId/modules/:moduleId/toggle', async (req, res) => {
  const { sessionId, moduleId } = req.params;
  
  try {
    // Check if session exists, if not create it (use upsert)
    let session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) {
      // Try to find a default user or use first available
      const defaultUser = await prisma.user.findFirst();
      if (!defaultUser) {
        return res.status(400).json({ error: 'No user found to create session' });
      }
      // Use upsert to handle race condition on roomCode
      session = await prisma.session.upsert({
        where: { id: sessionId },
        create: {
          id: sessionId,
          name: 'Session ' + sessionId.slice(0, 8),
          roomCode: sessionId.slice(0, 8).toUpperCase(),
          gmId: defaultUser.id,
        },
        update: {},
      }).catch(async () => {
        // If unique constraint failed, fetch existing
        return prisma.session.findUnique({ where: { id: sessionId } });
      });
      
      // Ensure session is not null
      if (!session) {
        session = await prisma.session.findUnique({ where: { id: sessionId } });
      }
    }

    if (!session) {
      return res.status(500).json({ error: 'Failed to get or create session' });
    }

    // Check if already linked
    const existing = await prisma.sessionModule.findUnique({
      where: {
        sessionId_moduleId: { sessionId, moduleId },
      },
    });
    
    if (existing) {
      // Toggle the enabled status
      const updated = await prisma.sessionModule.update({
        where: { id: existing.id },
        data: { enabled: !existing.enabled },
        include: { module: true },
      });
      res.json(updated);
    } else {
      // Create new link (disabled by default)
      const created = await prisma.sessionModule.create({
        data: {
          sessionId,
          moduleId,
          enabled: true, // Auto-enable when first added
        },
        include: { module: true },
      });
      res.json(created);
    }
  } catch (error: any) {
    console.error('Error toggling module:', error);
    res.status(500).json({ error: 'Failed to toggle module', message: error.message });
  }
});

// Import items to a module via JSON
router.post('/modules/:moduleId/import', async (req, res) => {
  const { moduleId } = req.params;
  const { items, type } = req.body;
  
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'Items array is required' });
  }
  
  try {
    // Check if module exists
    const module = await prisma.dataModule.findUnique({
      where: { id: moduleId },
    });
    
    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }
    
    // Insert items
    const itemType = type || 'item';
    const createdItems = await Promise.all(
      items.map((item: any) => 
        prisma.dataItem.create({
          data: {
            moduleId,
            name: item.name || 'Unknown',
            type: itemType,
            data: item, // Store entire item as JSON
            source: item.source || null,
          },
        })
      )
    );
    
    // Update module item count
    const count = await prisma.dataItem.count({
      where: { moduleId },
    });
    
    await prisma.dataModule.update({
      where: { id: moduleId },
      data: { itemCount: count },
    });
    
    res.json({ 
      success: true, 
      imported: createdItems.length,
      totalItems: count,
    });
  } catch (error: any) {
    console.error('Error importing items:', error);
    res.status(500).json({ error: 'Failed to import items', message: error.message });
  }
});

// Search items across enabled modules for a session
router.get('/sessions/:sessionId/search', async (req, res) => {
  const { sessionId } = req.params;
  const { query, type } = req.query;
  
  try {
    // Get enabled module IDs for this session
    const sessionModules = await prisma.sessionModule.findMany({
      where: { sessionId, enabled: true },
      select: { moduleId: true },
    });
    
    const enabledModuleIds = sessionModules.map((sm: { moduleId: string }) => sm.moduleId);
    
    if (enabledModuleIds.length === 0) {
      return res.json({ results: [], totalCount: 0 });
    }
    
    // Build where clause
    const where: any = {
      moduleId: { in: enabledModuleIds },
    };
    
    if (query) {
      where.name = { contains: String(query), mode: 'insensitive' };
    }
    
    if (type) {
      where.type = String(type);
    }
    
    const items = await prisma.dataItem.findMany({
      where,
      include: {
        module: {
          select: { name: true, system: true, version: true },
        },
      },
      take: 50,
      orderBy: { name: 'asc' },
    });
    
    const totalCount = await prisma.dataItem.count({ where });
    
    // Normalize the legacy data items using the normalizer library
    const normalizedResults = items.map((item: any) => {
      const raw = item.data || {};
      
      // Use the normalizer library to transform properly based on type
      const itemType = item.type || 'background';
      const system = transformLegacyToSystem(raw, itemType);
      
      return {
        id: item.id,
        type: item.type,
        name: item.name,
        book: item.source || raw.book || raw.publisher,
        publisher: item.module?.name || raw.publisher,
        description: raw.description || raw.desc,
        system,
        slug: item.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        source: item.source,
      };
    });
    
    res.json({ results: normalizedResults, totalCount });
  } catch (error: any) {
    console.error('Error searching items:', error);
    res.status(500).json({ error: 'Failed to search items', message: error.message });
  }
});

// Get items of a specific type (simplified - returns all items regardless of session)
router.get('/items/:type', async (req, res) => {
  const { type } = req.params;
  const { q, limit = '100', offset = '0' } = req.query;
  
  const limitNum = Math.min(parseInt(limit as string) || 100, 500);
  const offsetNum = parseInt(offset as string) || 0;
  
  try {
    const where: any = { type };
    if (q) {
      where.name = { contains: q as string, mode: 'insensitive' };
    }
    
    const items = await prisma.dataItem.findMany({
      where,
      take: limitNum,
      skip: offsetNum,
      orderBy: { name: 'asc' },
    });
    
    const total = await prisma.dataItem.count({ where });
    
    // Normalize the legacy data items using the normalizer library
    const normalizedItems = items.map((item: any) => {
      const raw = item.data || {};
      
      // Use the normalizer library to transform properly based on type
      const itemType = item.type || 'background';
      const system = transformLegacyToSystem(raw, itemType);
      
      return {
        id: item.id,
        type: item.type,
        name: item.name,
        book: item.source || raw.book || raw.publisher,
        publisher: raw.publisher,
        description: raw.description || raw.desc,
        system,
        slug: item.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        source: item.source,
      };
    });
    
    res.json({ data: normalizedItems, total, limit: limitNum, offset: offsetNum });
  } catch (error: any) {
    console.error('Error fetching items:', error);
    res.status(500).json({ error: 'Failed to fetch items', message: error.message });
  }
});

// Get items of a specific type from enabled modules (session-based)
router.get('/sessions/:sessionId/items/:type', async (req, res) => {
  const { sessionId, type } = req.params;
  const { limit = '50', offset = '0' } = req.query;
  
  // Declare these first so we can use in early return
  const limitNum = Math.min(parseInt(limit as string) || 50, 100);
  const offsetNum = parseInt(offset as string) || 0;
  
  try {
    // Check if session exists, if not return empty
    const checkSession = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!checkSession) {
      return res.json({ data: [], total: 0, limit: limitNum, offset: offsetNum });
    }
    
    // Get enabled module IDs
    const sessionModules = await prisma.sessionModule.findMany({
      where: { sessionId, enabled: true },
      select: { moduleId: true },
    });
    
    const enabledModuleIds = sessionModules.map((sm: { moduleId: string }) => sm.moduleId);
    
    if (enabledModuleIds.length === 0) {
      return res.json({ data: [], total: 0 });
    }
    
    const items = await prisma.dataItem.findMany({
      where: {
        moduleId: { in: enabledModuleIds },
        type,
      },
      include: {
        module: {
          select: { name: true, system: true, version: true },
        },
      },
      take: limitNum,
      skip: offsetNum,
      orderBy: { name: 'asc' },
    });
    
    const total = await prisma.dataItem.count({
      where: {
        moduleId: { in: enabledModuleIds },
        type,
      },
    });
    
    // Normalize the legacy data items using the normalizer library
    const normalizedItems = items.map((item: any) => {
      const raw = item.data || {};
      
      // Use the normalizer library to transform properly based on type
      const itemType = item.type || 'background';
      const system = transformLegacyToSystem(raw, itemType);
      
      return {
        id: item.id,
        type: item.type,
        name: item.name,
        book: item.source || raw.book || raw.publisher,
        publisher: item.module?.name || raw.publisher,
        description: raw.description || raw.desc,
        system,
        slug: item.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        source: item.source,
      };
    });
    
    res.json({ data: normalizedItems, total, limit: limitNum, offset: offsetNum });
  } catch (error: any) {
    console.error('Error fetching items:', error);
    res.status(500).json({ error: 'Failed to fetch items', message: error.message });
  }
});

// Get stats for a session's enabled modules
router.get('/sessions/:sessionId/stats', async (req, res) => {
  const { sessionId } = req.params;
  
  try {
    const sessionModules = await prisma.sessionModule.findMany({
      where: { sessionId, enabled: true },
      include: {
        module: true,
      },
    });
    
    const stats = {
      enabledModules: sessionModules.length,
      modules: sessionModules.map((sm: { module: { id: string; name: string; system: string; version: string | null; itemCount: number }; enabled: boolean }) => ({
        id: sm.module.id,
        name: sm.module.name,
        system: sm.module.system,
        version: sm.module.version,
        itemCount: sm.module.itemCount,
        enabled: sm.enabled,
      })),
    };
    
    res.json(stats);
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats', message: error.message });
  }
});

// List available JSON files in data/schemas directory
router.get('/files', async (req, res) => {
  try {
    const schemasDir = path.join(process.cwd(), 'src/data/schemas');
    
    if (!fs.existsSync(schemasDir)) {
      return res.json({ files: [] });
    }
    
    const files = fs.readdirSync(schemasDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(schemasDir, f);
        const stats = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf-8');
        let itemCount = 0;
        try {
          const data = JSON.parse(content);
          itemCount = Array.isArray(data) ? data.length : 1;
        } catch {
          itemCount = 0;
        }
        return {
          filename: f,
          type: getTypeFromFilename(f),
          size: stats.size,
          itemCount,
        };
      });
    
    res.json({ files });
  } catch (error: any) {
    console.error('Error listing files:', error);
    res.status(500).json({ error: 'Failed to list files', message: error.message });
  }
});

// Import a JSON file from data/schemas directory
router.post('/import/file', async (req, res) => {
  const { filename, name, system, version, description } = req.body;
  
  if (!filename || !name || !system) {
    return res.status(400).json({ error: 'Missing required fields: filename, name, system' });
  }
  
  try {
    const schemasDir = path.join(process.cwd(), 'src/data/schemas');
    const filePath = path.join(schemasDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found', filename });
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    const items = Array.isArray(data) ? data : [data];
    const type = getTypeFromFilename(filename);
    
    // Create module
    const module = await prisma.dataModule.create({
      data: {
        name,
        system,
        version: version || '1.0.0',
        description: description || `Imported from ${filename}`,
        itemCount: items.length,
      },
    });
    
    // Create items in batches
    const batchSize = 100;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      await prisma.dataItem.createMany({
        data: batch.map((item: any) => ({
          moduleId: module.id,
          name: item.name || 'Unnamed',
          type,
          data: item,
          source: item.source || item.book || item.publisher,
        })),
      });
    }
    
    // Get final count
    const count = await prisma.dataItem.count({ where: { moduleId: module.id } });
    await prisma.dataModule.update({
      where: { id: module.id },
      data: { itemCount: count },
    });
    
    res.json({ success: true, module: { ...module, itemCount: count } });
  } catch (error: any) {
    console.error('Error importing file:', error);
    res.status(500).json({ error: 'Failed to import file', message: error.message });
  }
});

// ====================
// Compendium Entry Routes (Normalized Structure)
// ====================

// Import file into CompendiumEntry (normalized structure)
router.post('/import/compendium', async (req, res) => {
  const { filename, name, system, version, description } = req.body;
  
  if (!filename || !name || !system) {
    return res.status(400).json({ error: 'Missing required fields: filename, name, system' });
  }
  
  try {
    const schemasDir = path.join(process.cwd(), 'src/data/schemas');
    const filePath = path.join(schemasDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found', filename });
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    const items = Array.isArray(data) ? data : [data];
    const type = getTypeFromFilename(filename);
    
    // Create or find module
    let module = await prisma.dataModule.findFirst({
      where: { name, system },
    });
    
    if (!module) {
      module = await prisma.dataModule.create({
        data: {
          name,
          system,
          version: version || '1.0.0',
          description: description || `Imported from ${filename}`,
          itemCount: 0,
        },
      });
    }
    
    // Create compendium entries in batches
    let createdCount = 0;
    const batchSize = 50;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (item: any) => {
          try {
            await createCompendiumEntry(module.id, system, type, item);
            createdCount++;
          } catch (err) {
            console.error('Error creating entry:', err);
          }
        })
      );
    }
    
    // Update module item count
    const count = await prisma.compendiumEntry.count({ where: { moduleId: module.id } });
    await prisma.dataModule.update({
      where: { id: module.id },
      data: { itemCount: count },
    });
    
    res.json({ success: true, module: { ...module, itemCount: count }, imported: createdCount });
  } catch (error: any) {
    console.error('Error importing compendium:', error);
    res.status(500).json({ error: 'Failed to import compendium', message: error.message });
  }
});

// Import directly from 5eTools dataset presets
router.post('/import/5etools', async (req, res) => {
  const { dataset, name, system, version, description, allowedSources } = req.body;

  if (!dataset || !name || !system) {
    return res.status(400).json({ error: 'Missing required fields: dataset, name, system' });
  }

  try {
    const result = await importFiveEToolsDataset({ dataset, name, system, version: version || null, description: description || null, allowedSources });
    res.json(result);
  } catch (error: any) {
    console.error('Error importing 5eTools dataset:', error);
    res.status(error?.statusCode || 500).json({
      error: 'Failed to import 5eTools dataset',
      message: error.message,
      status: error?.statusCode,
      url: error?.url,
    });
  }
});

router.post('/modules/:moduleId/refresh', async (req, res) => {
  const { moduleId } = req.params;

  try {
    const module = await prisma.dataModule.findUnique({ where: { id: moduleId } });
    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }

    const dataset = String(
      req.body?.dataset ||
      parseFiveEToolsDatasetFromDescription(module.description) ||
      (String(module.version || '').toLowerCase() === '5etools' ? 'items-all' : '') ||
      (await inferFiveEToolsDatasetForModule(module.id, module.name)) ||
      '',
    ).trim();
    if (!dataset) {
      return res.status(400).json({
        error: 'Unable to infer 5eTools dataset for this module',
        message: 'Only modules imported from 5eTools can be refreshed automatically.',
      });
    }

    const result = await importFiveEToolsDataset({
      dataset,
      name: module.name,
      system: module.system,
      version: module.version || null,
      description: module.description || null,
      moduleId: module.id,
      replaceExisting: true,
    });

    res.json({
      ...result,
      refreshed: true,
    });
  } catch (error: any) {
    console.error('Error refreshing module:', error);
    res.status(error?.statusCode || 500).json({
      error: 'Failed to refresh module',
      message: error.message,
      status: error?.statusCode,
      url: error?.url,
    });
  }
});

// Size mapping from abbreviation to full word
const sizeLabels: Record<string, string> = {
  t: 'Tiny',
  tiny: 'Tiny',
  s: 'Small',
  small: 'Small',
  m: 'Medium',
  medium: 'Medium',
  l: 'Large',
  large: 'Large',
  h: 'Huge',
  huge: 'Huge',
  g: 'Gargantuan',
  gargantuan: 'Gargantuan',
};

// Helper function to convert CR string to numeric value
function parseCrValue(cr: string): number {
  if (!cr) return 0;
  
  // Handle fractions like "1/4", "1/2", "1/8"
  if (cr.includes('/')) {
    const [num, den] = cr.split('/').map(Number);
    if (den > 0) return num / den;
  }
  
  // Handle numeric values
  const parsed = parseFloat(cr);
  return isNaN(parsed) ? 0 : parsed;
}

// Monster type mapping from abbreviation to full word
const monsterTypeLabels: Record<string, string> = {
  a: 'Aberration',
  aberration: 'Aberration',
  b: 'Beast',
  beast: 'Beast',
  c: 'Construct',
  construct: 'Construct',
  d: 'Dragon',
  dragon: 'Dragon',
  e: 'Elemental',
  elemental: 'Elemental',
  f: 'Fey',
  fey: 'Fey',
  g: 'Giant',
  giant: 'Giant',
  h: 'Humanoid',
  humanoid: 'Humanoid',
  m: 'Monstrosity',
  monstrosity: 'Monstrosity',
  o: 'Ooze',
  ooze: 'Ooze',
  p: 'Plant',
  plant: 'Plant',
  u: 'Undead',
  undead: 'Undead',
};

// Spell school mapping from abbreviation to full word
const schoolLabels: Record<string, string> = {
  a: 'Abjuration',
  abjuration: 'Abjuration',
  c: 'Conjuration',
  conjuration: 'Conjuration',
  d: 'Divination',
  divination: 'Divination',
  e: 'Enchantment',
  enchantment: 'Enchantment',
  v: 'Evocation',
  ev: 'Evocation',
  evocation: 'Evocation',
  i: 'Illusion',
  illusion: 'Illusion',
  n: 'Necromancy',
  necromancy: 'Necromancy',
  t: 'Transmutation',
  transmutation: 'Transmutation',
};

// Reverse lookup maps
const sizeValueMap: Record<string, string> = {
  tiny: 't', small: 's', medium: 'm', large: 'l', huge: 'h', gargantuan: 'g',
  Tiny: 't', Small: 's', Medium: 'm', Large: 'l', Huge: 'h', Gargantuan: 'g',
};

const monsterTypeValueMap: Record<string, string> = {
  aberration: 'a', beast: 'b', construct: 'c', dragon: 'd', elemental: 'e',
  fey: 'f', giant: 'g', humanoid: 'h', monstrosity: 'm', ooze: 'o', plant: 'p', undead: 'u',
  Aberration: 'a', Beast: 'b', Construct: 'c', Dragon: 'd', Elemental: 'e',
  Fey: 'f', Giant: 'g', Humanoid: 'h', Monstrosity: 'm', Ooze: 'o', Plant: 'p', Undead: 'u',
};

const schoolValueMap: Record<string, string> = {
  abjuration: 'A', conjuration: 'C', divination: 'D', enchantment: 'E', evocation: 'V',
  illusion: 'I', necromancy: 'N', transmutation: 'T',
  Abjuration: 'A', Conjuration: 'C', Divination: 'D', Enchantment: 'E', Evocation: 'V',
  Illusion: 'I', Necromancy: 'N', Transmutation: 'T',
};

function getSizeLabel(value: string): string {
  const normalized = String(value).toLowerCase().trim();
  return sizeLabels[normalized] || value;
}

function getSizeValue(value: string): string {
  const normalized = String(value).toLowerCase().trim();
  // If it's a full word, convert to abbreviation
  if (sizeValueMap[normalized]) {
    return sizeValueMap[normalized];
  }
  // Otherwise return as-is (it's already an abbreviation)
  return value;
}

function getMonsterTypeLabel(value: string): string {
  const normalized = String(value).toLowerCase().trim();
  return monsterTypeLabels[normalized] || value;
}

function getMonsterTypeValue(value: string): string {
  const normalized = String(value).toLowerCase().trim();
  // If it's a full word, convert to abbreviation
  if (monsterTypeValueMap[normalized]) {
    return monsterTypeValueMap[normalized];
  }
  // Otherwise return as-is (it's already an abbreviation)
  return value;
}

function getSchoolLabel(value: string): string {
  const normalized = String(value).toLowerCase().trim();
  return schoolLabels[normalized] || value;
}

function getSchoolValue(value: string): string {
  const normalized = String(value).toLowerCase().trim();
  // If it's a full word, convert to abbreviation
  if (schoolValueMap[normalized]) {
    return schoolValueMap[normalized];
  }
  // Otherwise return as-is (it's already an abbreviation)
  return value;
}

// DEBUG: Get sample item raw data - returns first item with type 'item'
router.get('/compendium/debug/sample-item', async (req, res) => {
  try {
    const item = await prisma.compendiumEntry.findFirst({
      where: { type: 'item' },
      select: { id: true, name: true, raw: true },
      take: 1
    });
    res.json(item);
  } catch (error: any) {
    console.error('Debug error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DEBUG: Count items by type
router.get('/compendium/debug/counts', async (req, res) => {
  try {
    const counts = await prisma.compendiumEntry.groupBy({
      by: ['type'],
      _count: true
    });
    res.json({ counts });
  } catch (error: any) {
    console.error('Debug error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DEBUG: Get items with any raw data that might be equipment
router.get('/compendium/debug/sample-equipment', async (req, res) => {
  try {
    // Try to find items with equipment-related data - just get first 5 items with type='item'
    const items = await prisma.compendiumEntry.findMany({
      where: { type: 'item' },
      select: { id: true, name: true, raw: true },
      take: 5
    });
    res.json({ items, count: items.length });
  } catch (error: any) {
    console.error('Debug error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DEBUG: Get sample armor item
router.get('/compendium/debug/sample-armor', async (req, res) => {
  try {
    // Get first item with armor in the name
    const items = await prisma.compendiumEntry.findMany({
      where: { 
        type: 'item',
        name: { contains: 'armor', mode: 'insensitive' }
      },
      select: { id: true, name: true, raw: true },
      take: 3
    });
    res.json({ items, count: items.length });
  } catch (error: any) {
    console.error('Debug error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get available filter options for a given type
router.get('/compendium/filters/:type', async (req, res) => {
  const requestedType = String(req.params.type || '').toLowerCase();
  const effectiveType = requestedType === 'race' ? 'species' : requestedType;
  const where =
    requestedType === 'race' || requestedType === 'species'
      ? { type: { in: ['species', 'race'] } }
      : { type: effectiveType };

  try {
    const options: Record<string, { value: string; label: string }[]> = {};
    const entries = await prisma.compendiumEntry.findMany({
      where,
      select: { raw: true, source: true },
      take: 5000,
    });

    const sourceSet = new Set<string>();
    entries.forEach((entry: any) => {
      const raw = entry.raw || {};
      const sourceValue = getEntrySourceValue(raw, entry.source);
      if (sourceValue) sourceSet.add(sourceValue);
    });

    options.sources = Array.from(sourceSet).sort().map((source) => ({ value: source, label: source }));

    if (effectiveType === 'spell') {
      const schoolSet = new Set<string>();
      const classSet = new Set<string>();

      entries.forEach((entry: any) => {
        const raw = entry.raw || {};
        const system = raw.system || raw.data || {};

        const school = system.school || system.school?.name;
        if (school) schoolSet.add(school);

        const classPaths = [
          system.classes,
          system.sourceClass,
          system.class,
          raw.classes,
          raw.sourceClass,
          raw.class,
        ];

        for (const classes of classPaths) {
          if (!classes) continue;
          if (Array.isArray(classes)) {
            classes.forEach((c: any) => {
              const className = typeof c === 'object' ? c.name || c.value || c : c;
              if (className) classSet.add(className);
            });
          } else if (typeof classes === 'object') {
            Object.keys(classes).forEach((c) => classSet.add(c));
          } else if (typeof classes === 'string') {
            classSet.add(classes);
          }
        }
      });

      options.schools = Array.from(schoolSet).sort().map((s) => ({ value: getSchoolLabel(s), label: getSchoolLabel(s) }));
      options.classes = Array.from(classSet).sort().map((s) => ({ value: s, label: s }));
      options.levels = Array.from({ length: 10 }, (_, i) => ({
        value: String(i),
        label: i === 0 ? 'Cantrip' : `Level ${i}`,
      }));
    } else if (effectiveType === 'monster') {
      const typeSet = new Set<string>();
      const sizeSet = new Set<string>();

      entries.forEach((entry: any) => {
        const raw = entry.raw || {};
        const system = raw.system || raw.data || {};

        const mtype = raw.type;
        if (typeof mtype === 'string' && mtype.trim()) {
          typeSet.add(mtype.trim());
        }

        const size = system.size;
        if (size) {
          if (Array.isArray(size)) {
            size.forEach((s: string) => sizeSet.add(s));
          } else {
            sizeSet.add(size);
          }
        }
      });

      options.creatureTypes = Array.from(typeSet).sort().map((s) => ({ value: getMonsterTypeValue(s), label: getMonsterTypeLabel(s) }));
      options.sizes = Array.from(sizeSet).sort().map((s) => ({ value: getSizeValue(s), label: getSizeLabel(s) }));
      options.challengeRatings = Array.from({ length: 34 }, (_, i) => ({
        value: String(i / 2),
        label: i / 2 === 0 ? '0' : i / 2 === 0.125 ? '1/8' : i / 2 === 0.25 ? '1/4' : i / 2 === 0.5 ? '1/2' : String(i / 2),
      }));
    } else if (effectiveType === 'item') {
      const typeSet = new Set<string>();
      const rarityMap = new Map<string, string>();
      const weaponCategorySet = new Set<string>();

      entries.forEach((entry: any) => {
        const raw = entry.raw || {};
        const system = raw.system || raw.data || {};

        const rarity = system.rarity || raw.rarity;
        if (typeof rarity === 'string' && rarity.trim()) {
          const normalizedRarity = rarity.trim().toLowerCase();
          if (!rarityMap.has(normalizedRarity)) {
            rarityMap.set(normalizedRarity, getItemRarityLabel(rarity));
          }
        }

        const itemType = getItemTypeCode(raw);
        if (itemType) typeSet.add(itemType);

        // Extract weapon category for weapons
        const weaponCategory = system.weaponCategory || raw.weaponCategory;
        if (weaponCategory && typeof weaponCategory === 'string') {
          weaponCategorySet.add(weaponCategory.trim());
        }
      });

      // Filter the type set: replace equipment types (HA, LA, MA, S, RG, RD, WD, W) with 'EQP'
      const equipmentTypeCodes = new Set(['HA', 'LA', 'MA', 'S', 'RG', 'RD', 'WD', 'W']);
      // Consumable types: A (Ammunition), P (Potion), SC (Scroll), RD (Rod), WD (Wand), W (Wondrous)
      const consumableTypeCodes = new Set(['A', 'P', 'SC', 'RD', 'WD', 'W']);
      // Loot types: G (Adventuring Gear), TG (Trade Goods), $ (Treasure)
      const treasureCode = '$';
      const lootTypeCodes = new Set(['G', 'TG', treasureCode]);
      // Tool types: AT (Artisan Tool), GS (Gaming Set), INS (Instrument), T (Tool)
      const toolTypeCodes = new Set(['AT', 'GS', 'INS', 'T']);
      // Transportation types: MNT (Mount), SHP (Vehicle Water), VEH (Vehicle Land), AIR (Vehicle Air)
      const transportTypeCodes = new Set(['MNT', 'SHP', 'VEH', 'AIR']);
      let hasEquipment = false;
      let hasConsumables = false;
      let hasLoot = false;
      let hasTool = false;
      let hasTransport = false;
      const filteredTypeSet = new Set<string>();
      for (const t of typeSet) {
        if (equipmentTypeCodes.has(t)) {
          hasEquipment = true;
        } else if (consumableTypeCodes.has(t)) {
          hasConsumables = true;
        } else if (lootTypeCodes.has(t)) {
          hasLoot = true;
        } else if (toolTypeCodes.has(t)) {
          hasTool = true;
        } else if (transportTypeCodes.has(t)) {
          hasTransport = true;
        } else {
          filteredTypeSet.add(t);
        }
      }
      if (hasEquipment) {
        filteredTypeSet.add('EQP');
      }
      if (hasConsumables) {
        filteredTypeSet.add('CON');
      }
      if (hasLoot) {
        filteredTypeSet.add('LOOT');
      }
      if (hasTool) {
        filteredTypeSet.add('TOOL');
      }
      if (hasTransport) {
        filteredTypeSet.add('TRANSPORT');
      }

      options.itemTypes = Array.from(filteredTypeSet).sort().map((value) => ({
        value,
        label: getItemTypeLabel(value),
      }));

      options.rarities = Array.from(rarityMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([value, label]) => ({
        value,
        label,
      }));

      options.weaponCategories = Array.from(weaponCategorySet).sort().map((value) => ({
        value,
        label: value.charAt(0).toUpperCase() + value.slice(1),
      }));

      // Add equipment types for EQP item type
      options.equipmentTypes = [
        { value: 'Clothing', label: 'Clothing' },
        { value: 'Heavy Armor', label: 'Heavy Armor' },
        { value: 'Light Armor', label: 'Light Armor' },
        { value: 'Medium Armor', label: 'Medium Armor' },
        { value: 'Natural Armor', label: 'Natural Armor' },
        { value: 'Ring', label: 'Ring' },
        { value: 'Rod', label: 'Rod' },
        { value: 'Shield', label: 'Shield' },
        { value: 'Trinket', label: 'Trinket' },
        { value: 'Vehicle Equipment', label: 'Vehicle Equipment' },
        { value: 'Wand', label: 'Wand' },
        { value: 'Wondrous Item', label: 'Wondrous Item' },
      ];

      // Add consumable types for CON item type
      options.consumableTypes = [
        { value: 'Ammunition', label: 'Ammunition' },
        { value: 'Potion', label: 'Potion' },
        { value: 'Rod', label: 'Rod' },
        { value: 'Scroll', label: 'Scroll' },
        { value: 'Trinket', label: 'Trinket' },
        { value: 'Vehicle Equipment', label: 'Vehicle Equipment' },
        { value: 'Wand', label: 'Wand' },
        { value: 'Wondrous Item', label: 'Wondrous Item' },
      ];

      // Add loot types for LOOT item type
      options.lootTypes = [
        { value: 'Art Object', label: 'Art Object' },
        { value: 'Adventuring Gear', label: 'Adventuring Gear' },
        { value: 'Gemstone', label: 'Gemstone' },
        { value: 'Junk', label: 'Junk' },
        { value: 'Material', label: 'Material' },
        { value: 'Resource', label: 'Resource' },
        { value: 'Trade Good', label: 'Trade Good' },
        { value: 'Treasure', label: 'Treasure' },
      ];

      // Add tool types for TOOL item type
      options.toolTypes = [
        { value: "Artisan's Tools", label: "Artisan's Tools" },
        { value: 'Gaming Set', label: 'Gaming Set' },
        { value: 'Musical Instrument', label: 'Musical Instrument' },
      ];

      // Add transportation types for TRANSPORT item type
      options.transportationTypes = [
        { value: 'Mount', label: 'Mount' },
        { value: 'Vehicle (Land)', label: 'Vehicle (Land)' },
        { value: 'Vehicle (Water)', label: 'Vehicle (Water)' },
      ];
    }

    res.json(options);
  } catch (error: any) {
    console.error('Error getting filter options:', error);
    res.status(500).json({ error: 'Failed to get filter options', message: error.message });
  }
});

// Search compendium entries (must be before /compendium/:type to avoid being caught by it)
router.get('/compendium/search', async (req, res) => {
  const { q, type, system, limit = '50', offset = '0' } = req.query;
  
  // Spell filters
  const level = req.query.level as string | undefined;
  const school = req.query.school as string | undefined;
  const sourceClass = req.query.sourceClass as string | undefined;
  const concentration = req.query.concentration as string | undefined;
  const ritual = req.query.ritual as string | undefined;
  const verbal = req.query.verbal as string | undefined;
  const somatic = req.query.somatic as string | undefined;
  const material = req.query.material as string | undefined;
  const source = req.query.source as string | undefined;
  
  // Monster filters
  const crMin = req.query.crMin as string | undefined;
  const crMax = req.query.crMax as string | undefined;
  const size = req.query.size as string | undefined;
  const creatureType = req.query.creatureType as string | undefined;
  const speedFly = req.query.speedFly as string | undefined;
  const speedSwim = req.query.speedSwim as string | undefined;
  const speedBurrow = req.query.speedBurrow as string | undefined;
  const speedClimb = req.query.speedClimb as string | undefined;
  
  // Item filters
  const itemType = req.query.itemType as string | undefined;
  const rarity = req.query.rarity as string | undefined;
  const magical = req.query.magical as string | undefined;
  const attunement = req.query.attunement as string | undefined;
  const weaponCategory = req.query.weaponCategory as string | undefined;
  const equipmentType = req.query.equipmentType as string | undefined;
  const consumableType = req.query.consumableType as string | undefined;
  const lootType = req.query.lootType as string | undefined;
  const toolType = req.query.toolType as string | undefined;
  const transportationType = req.query.transportationType as string | undefined;
  
  const limitNum = Math.min(parseInt(limit as string) || 100, 500);
  const offsetNum = parseInt(offset as string) || 0;
  
  try {
    const where: any = { type };
    if (q) {
      where.name = { contains: String(q), mode: 'insensitive' };
    }
    if (system) {
      where.system = String(system);
    }
    const sharedFilters: any[] = source ? [{ OR: getSourceFilterCandidates(source) }] : [];
    
    // Build filter conditions based on type
    if (type === 'spell') {
      const spellFilters: any[] = [...sharedFilters];
      
      if (level !== undefined) {
        spellFilters.push({ raw: { path: ['system', 'level'], equals: parseInt(level) } });
      }
      if (school) {
        // Use abbreviation for school matching (database stores as abbreviation like 'C', 'V', etc.)
        const schoolValue = getSchoolValue(school);
        spellFilters.push({ raw: { path: ['system', 'school'], string_contains: schoolValue } });
      }
      if (sourceClass) {
        // Try multiple paths for class matching
        spellFilters.push({
          OR: [
            { raw: { path: ['system', 'classes'], string_contains: sourceClass } },
            { raw: { path: ['system', 'sourceClass'], string_contains: sourceClass } },
            { raw: { path: ['system', 'class'], string_contains: sourceClass } },
            { raw: { path: ['raw', 'classes'], string_contains: sourceClass } }
          ]
        });
      }
      if (concentration === 'true') {
        spellFilters.push({ raw: { path: ['system', 'concentration'], equals: true } });
      }
      if (ritual === 'true') {
        spellFilters.push({ raw: { path: ['system', 'ritual'], equals: true } });
      }
      if (verbal === 'true') {
        spellFilters.push({ raw: { path: ['system', 'components', 'verbal'], equals: true } });
      }
      if (somatic === 'true') {
        spellFilters.push({ raw: { path: ['system', 'components', 'somatic'], equals: true } });
      }
      if (material === 'true') {
        spellFilters.push({ raw: { path: ['system', 'components', 'material'], equals: true } });
      }
      
      if (spellFilters.length > 0) {
        where.AND = spellFilters;
      }
    } else if (type === 'monster') {
      const monsterFilters: any[] = [...sharedFilters];
      
      if (crMin !== undefined) {
        monsterFilters.push({ raw: { path: ['system', 'cr'], gte: parseCrValue(crMin) } });
      }
      if (crMax !== undefined) {
        monsterFilters.push({ raw: { path: ['system', 'cr'], lte: parseCrValue(crMax) } });
      }
      if (size) {
        // Size is stored in raw.system.size as an array like ["H"] for Huge
        // Try matching the array containing the size abbreviation
        const sizeValue = getSizeValue(size).toUpperCase();
        // Use equals to match the exact array element
        monsterFilters.push({ raw: { path: ['system', 'size'], equals: [sizeValue] } });
      }
      if (creatureType) {
        // The type is stored at raw.type (e.g., "monstrosity", "beast")
        const typeValue = getMonsterTypeLabel(creatureType).toLowerCase();
        monsterFilters.push({ raw: { path: ['type'], string_contains: typeValue } });
      }
      if (speedFly === 'true') {
        monsterFilters.push({ raw: { path: ['system', 'speed', 'fly'], not: null } });
      }
      if (speedSwim === 'true') {
        monsterFilters.push({ raw: { path: ['system', 'speed', 'swim'], not: null } });
      }
      if (speedBurrow === 'true') {
        monsterFilters.push({ raw: { path: ['system', 'speed', 'burrow'], not: null } });
      }
      if (speedClimb === 'true') {
        monsterFilters.push({ raw: { path: ['system', 'speed', 'climb'], not: null } });
      }
      
      if (monsterFilters.length > 0) {
        where.AND = monsterFilters;
      }
    } else if (type === 'item') {
      const itemFilters: any[] = [...sharedFilters];

      // Filter by item type - stored in system properties (wondrous, weapon, armor, etc.)
      if (itemType) {
        if (itemType === 'magic-item') {
          // Magic items have a rarity set
          itemFilters.push({ raw: { path: ['system', 'rarity'], not: null } });
        } else if (itemType === 'WPN') {
          // For weapons, match by weaponCategory field (simple/martial) OR legacy weapon flag
          itemFilters.push({
            OR: [
              // Match items with weaponCategory (5e SRD/5etools style)
              { raw: { path: ['system', 'weaponCategory'], not: null } },
              { raw: { path: ['weaponCategory'], not: null } },
              // Match legacy style weapons
              { raw: { path: ['system', 'weapon'], not: null } },
              { raw: { path: ['weapon'], not: null } },
            ]
          });
        } else if (itemType === 'EQP') {
          // If equipmentType is specified, skip the parent filter and rely on the specific equipmentType filter
          // If no equipmentType is specified, add the parent filter to match all equipment
          if (!equipmentType) {
            // For Equipment without specific type, match items that have equipment-related properties
            // Also include wondrous items which are a major category of equipment
            itemFilters.push({
              OR: [
                // Armor types (legacy codes - lowercase in database)
                { raw: { path: ['type'], equals: 'ha' } },
                { raw: { path: ['type'], equals: 'la' } },
                { raw: { path: ['type'], equals: 'ma' } },
                { raw: { path: ['type'], equals: 's' } },
                // Equipment types (legacy codes - lowercase in database)
                { raw: { path: ['type'], equals: 'g' } },
                { raw: { path: ['type'], equals: 'rg' } },
                { raw: { path: ['type'], equals: 'rd' } },
                { raw: { path: ['type'], equals: 'wd' } },
                { raw: { path: ['type'], equals: 'w' } },
                { raw: { path: ['type'], equals: 'tr' } },
                { raw: { path: ['type'], equals: 'veh' } },
                // Same at itemType root
                { raw: { path: ['itemType'], equals: 'ha' } },
                { raw: { path: ['itemType'], equals: 'la' } },
                { raw: { path: ['itemType'], equals: 'ma' } },
                { raw: { path: ['itemType'], equals: 's' } },
                { raw: { path: ['itemType'], equals: 'g' } },
                { raw: { path: ['itemType'], equals: 'rg' } },
                { raw: { path: ['itemType'], equals: 'rd' } },
                { raw: { path: ['itemType'], equals: 'wd' } },
                { raw: { path: ['itemType'], equals: 'w' } },
                { raw: { path: ['itemType'], equals: 'tr' } },
                { raw: { path: ['itemType'], equals: 'veh' } },
                // system.type (lowercase)
                { raw: { path: ['system', 'type'], equals: 'ha' } },
                { raw: { path: ['system', 'type'], equals: 'la' } },
                { raw: { path: ['system', 'type'], equals: 'ma' } },
                { raw: { path: ['system', 'type'], equals: 's' } },
                { raw: { path: ['system', 'type'], equals: 'g' } },
                { raw: { path: ['system', 'type'], equals: 'rg' } },
                { raw: { path: ['system', 'type'], equals: 'rd' } },
                { raw: { path: ['system', 'type'], equals: 'wd' } },
                { raw: { path: ['system', 'type'], equals: 'w' } },
                { raw: { path: ['system', 'type'], equals: 'tr' } },
                { raw: { path: ['system', 'type'], equals: 'veh' } },
                // Wondrous items - check system.wondrous flag
                { raw: { path: ['system', 'wondrous'], equals: true } },
                // Armor property
                { raw: { path: ['system', 'armor'], not: null } },
                // Shield property
                { raw: { path: ['system', 'shield'], not: null } },
              ]
            });
            if (process.env.NODE_ENV !== 'production') {
              console.log('[Equipment Filter] Parent EQP filter applied (no specific type), itemFilters count:', itemFilters.length);
            }
          } else {
            if (process.env.NODE_ENV !== 'production') {
              console.log('[Equipment Filter] Skipping parent EQP filter, using specific equipmentType filter instead');
            }
          }
        } else if (itemType === 'CON') {
          // Consumables: Ammunition (A), Potion (P), Scroll (SC), Rod (RD), Wand (WD), Wondrous (W)
          // If consumableType is specified, use that; otherwise match any consumable type
          if (!consumableType) {
            itemFilters.push({
              OR: [
                // Ammunition
                { raw: { path: ['type'], equals: 'a' } },
                { raw: { path: ['itemType'], equals: 'a' } },
                { raw: { path: ['system', 'type'], equals: 'a' } },
                // Potion
                { raw: { path: ['type'], equals: 'p' } },
                { raw: { path: ['itemType'], equals: 'p' } },
                { raw: { path: ['system', 'type'], equals: 'p' } },
                { raw: { path: ['system', 'potion'], equals: true } },
                // Scroll
                { raw: { path: ['type'], equals: 'sc' } },
                { raw: { path: ['itemType'], equals: 'sc' } },
                { raw: { path: ['system', 'type'], equals: 'sc' } },
                // Rod
                { raw: { path: ['type'], equals: 'rd' } },
                { raw: { path: ['itemType'], equals: 'rd' } },
                { raw: { path: ['system', 'type'], equals: 'rd' } },
                // Wand
                { raw: { path: ['type'], equals: 'wd' } },
                { raw: { path: ['itemType'], equals: 'wd' } },
                { raw: { path: ['system', 'type'], equals: 'wd' } },
                // Wondrous (Trinket, Wondrous Items)
                { raw: { path: ['type'], equals: 'w' } },
                { raw: { path: ['itemType'], equals: 'w' } },
                { raw: { path: ['system', 'type'], equals: 'w' } },
                { raw: { path: ['system', 'wondrous'], equals: true } },
              ]
            });
            if (process.env.NODE_ENV !== 'production') {
              console.log('[Consumables Filter] Parent CON filter applied (no specific type), itemFilters count:', itemFilters.length);
            }
          } else {
            if (process.env.NODE_ENV !== 'production') {
              console.log('[Consumables Filter] Skipping parent CON filter, using specific consumableType filter instead');
            }
          }
        } else if (itemType === 'LOOT') {
          // Loot: G (Adventuring Gear), TG (Trade Goods), $ (Treasure)
          // If lootType is specified, use that; otherwise match any loot type
          const tc = '$';
          if (!lootType) {
            itemFilters.push({
              OR: [
                // Adventuring Gear
                { raw: { path: ['type'], equals: 'g' } },
                { raw: { path: ['itemType'], equals: 'g' } },
                { raw: { path: ['system', 'type'], equals: 'g' } },
                // Trade Goods
                { raw: { path: ['type'], equals: 'tg' } },
                { raw: { path: ['itemType'], equals: 'tg' } },
                { raw: { path: ['system', 'type'], equals: 'tg' } },
                // Treasure
                { raw: { path: ['type'], equals: tc } },
                { raw: { path: ['itemType'], equals: tc } },
                { raw: { path: ['system', 'type'], equals: tc } },
              ]
            });
            if (process.env.NODE_ENV !== 'production') {
              console.log('[Loot Filter] Parent LOOT filter applied (no specific type), itemFilters count:', itemFilters.length);
            }
          } else {
            if (process.env.NODE_ENV !== 'production') {
              console.log('[Loot Filter] Skipping parent LOOT filter, using specific lootType filter instead');
            }
          }
        } else if (itemType === 'TOOL') {
          // Tool: AT (Artisan Tool), GS (Gaming Set), INS (Instrument), T (Tool)
          // If toolType is specified, use that; otherwise match any tool type
          if (!toolType) {
            itemFilters.push({
              OR: [
                // Artisan's Tools
                { raw: { path: ['type'], equals: 'at' } },
                { raw: { path: ['itemType'], equals: 'at' } },
                { raw: { path: ['system', 'type'], equals: 'at' } },
                { raw: { path: ['type'], equals: 't' } },
                { raw: { path: ['itemType'], equals: 't' } },
                { raw: { path: ['system', 'type'], equals: 't' } },
                // Gaming Set
                { raw: { path: ['type'], equals: 'gs' } },
                { raw: { path: ['itemType'], equals: 'gs' } },
                { raw: { path: ['system', 'type'], equals: 'gs' } },
                // Musical Instrument
                { raw: { path: ['type'], equals: 'ins' } },
                { raw: { path: ['itemType'], equals: 'ins' } },
                { raw: { path: ['system', 'type'], equals: 'ins' } },
              ]
            });
            if (process.env.NODE_ENV !== 'production') {
              console.log('[Tool Filter] Parent TOOL filter applied (no specific type), itemFilters count:', itemFilters.length);
            }
          } else {
            if (process.env.NODE_ENV !== 'production') {
              console.log('[Tool Filter] Skipping parent TOOL filter, using specific toolType filter instead');
            }
          }
        } else if (itemType === 'TRANSPORT') {
          // Transportation: MNT (Mount), VEH (Vehicle Land), SHP (Vehicle Water), AIR (Vehicle Air)
          // If transportationType is specified, use that; otherwise match any transportation type
          if (!transportationType) {
            itemFilters.push({
              OR: [
                // Mount
                { raw: { path: ['type'], equals: 'mnt' } },
                { raw: { path: ['itemType'], equals: 'mnt' } },
                { raw: { path: ['system', 'type'], equals: 'mnt' } },
                // Vehicle (Land)
                { raw: { path: ['type'], equals: 'veh' } },
                { raw: { path: ['itemType'], equals: 'veh' } },
                { raw: { path: ['system', 'type'], equals: 'veh' } },
                // Vehicle (Water)
                { raw: { path: ['type'], equals: 'shp' } },
                { raw: { path: ['itemType'], equals: 'shp' } },
                { raw: { path: ['system', 'type'], equals: 'shp' } },
                // Vehicle (Air)
                { raw: { path: ['type'], equals: 'air' } },
                { raw: { path: ['itemType'], equals: 'air' } },
                { raw: { path: ['system', 'type'], equals: 'air' } },
              ]
            });
            if (process.env.NODE_ENV !== 'production') {
              console.log('[Transportation Filter] Parent TRANSPORT filter applied (no specific type), itemFilters count:', itemFilters.length);
            }
          } else {
            if (process.env.NODE_ENV !== 'production') {
              console.log('[Transportation Filter] Skipping parent TRANSPORT filter, using specific transportationType filter instead');
            }
          }
        } else {
          itemFilters.push({ OR: getItemTypeFilterCandidates(itemType) });
        }
      }

      // Filter by rarity - stored at system.rarity
      if (rarity) {
        if (rarity === 'mundane') {
          // Mundane items have rarity 'none' or no rarity
          itemFilters.push({ raw: { path: ['system', 'rarity'], in: ['none', 'common'] } });
        } else {
          itemFilters.push({ raw: { path: ['system', 'rarity'], equals: rarity } });
        }
      }

      // Filter for magical items
      if (magical === 'true') {
        // Items with rarity other than 'none' are magical
        itemFilters.push({ raw: { path: ['system', 'rarity'], not: 'none' } });
      }

      // Filter by attunement
      if (attunement === 'required') {
        itemFilters.push({ raw: { path: ['system', 'reqAttune'], not: null } });
      } else if (attunement === 'not required') {
        itemFilters.push({ OR: [
          { raw: { path: ['system', 'reqAttune'], equals: null } },
          { raw: { path: ['system', 'reqAttune'], not: null } }
        ]});
      }

      // Filter by weapon category (Simple/Martial) - only applies when itemType is 'WPN'
      if (weaponCategory && itemType === 'WPN') {
        itemFilters.push({ 
          OR: [
            { raw: { path: ['system', 'weaponCategory'], equals: weaponCategory } },
            { raw: { path: ['weaponCategory'], equals: weaponCategory } }
          ]
        });
      }

      // Filter by equipment type - only applies when itemType is 'EQP'
      if (equipmentType && itemType === 'EQP') {
        const equipmentTypeFilter = getEquipmentTypeFilter(equipmentType);
        if (equipmentTypeFilter) {
          itemFilters.push(equipmentTypeFilter);

        }
      }

      // Filter by consumable type - only applies when itemType is 'CON'
      if (consumableType && itemType === 'CON') {
        const consumableTypeFilter = getConsumableTypeFilter(consumableType);
        if (consumableTypeFilter) {
          itemFilters.push(consumableTypeFilter);
          if (process.env.NODE_ENV !== 'production') {
            console.log('[Consumables Filter] Applied consumableType filter:', consumableType);
          }
        }
      }

      // Filter by loot type - only applies when itemType is 'LOOT'
      if (lootType && itemType === 'LOOT') {
        const lootTypeFilter = getLootTypeFilter(lootType);
        if (lootTypeFilter) {
          itemFilters.push(lootTypeFilter);
          if (process.env.NODE_ENV !== 'production') {
            console.log('[Loot Filter] Applied lootType filter:', lootType);
          }
        }
      }

      // Filter by tool type - only applies when itemType is 'TOOL'
      if (toolType && itemType === 'TOOL') {
        const toolTypeFilter = getToolTypeFilter(toolType);
        if (toolTypeFilter) {
          itemFilters.push(toolTypeFilter);
          if (process.env.NODE_ENV !== 'production') {
            console.log('[Tool Filter] Applied toolType filter:', toolType);
          }
        }
      }

      // Filter by transportation type - only applies when itemType is 'TRANSPORT'
      if (transportationType && itemType === 'TRANSPORT') {
        const transportationTypeFilter = getTransportationTypeFilter(transportationType);
        if (transportationTypeFilter) {
          itemFilters.push(transportationTypeFilter);
          if (process.env.NODE_ENV !== 'production') {
            console.log('[Transportation Filter] Applied transportationType filter:', transportationType);
          }
        }
      }

      if (itemFilters.length > 0) {
        where.AND = itemFilters;
      }
    }

    if (sharedFilters.length > 0 && !where.AND) {
      where.AND = sharedFilters;
    }

    // Debug: log the final where clause
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Filter Debug] Final where clause:', JSON.stringify(where, null, 2));
    }

    const include: any = {
      module: {
        select: { name: true, system: true, version: true },
      },
    };
    
    const entries = await prisma.compendiumEntry.findMany({
      where,
      include,
      take: limitNum,
      skip: offsetNum,
      orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
    });
    
    const total = await prisma.compendiumEntry.count({ where });
    
    // Transform entries to include type-specific data at top level
    const transformedData = entries.map((entry: any) => {
      const rawSystem =
        entry.raw &&
        typeof entry.raw === 'object' &&
        (entry.raw as any).system &&
        typeof (entry.raw as any).system === 'object'
          ? (entry.raw as any).system
          : {};
      
      const system: Record<string, any> = { ...rawSystem };
      
      return {
        id: entry.id,
        type: entry.type,
        name: entry.name,
        book: entry.source || (entry.raw as any)?.book,
        publisher: entry.module?.name || (entry.raw as any)?.publisher,
        description: entry.summary || (entry.raw as any)?.description,
        img: (entry.raw as any)?.img,
        imgToken: (entry.raw as any)?.imgToken,
        imgSource: (entry.raw as any)?.imgSource,
        imgFallback: (entry.raw as any)?.imgFallback,
        system,
        slug: entry.slug,
        source: entry.source,
        // Include full raw JSON for troubleshooting - all original data from 5e.tools
        raw: entry.raw,
      };
    });
    
    res.json({ data: transformedData, total, limit: limitNum, offset: offsetNum });
  } catch (error: any) {
    console.error('Error fetching compendium entries:', error);
    res.status(500).json({ error: 'Failed to fetch compendium entries', message: error.message });
  }
});

// Get compendium entries by type (normalized) - must be AFTER /compendium/search
router.get('/compendium/:type', async (req, res) => {
  const { type } = req.params;
  const { q, limit = '100', offset = '0', system } = req.query;
  
  const limitNum = Math.min(parseInt(limit as string) || 100, 500);
  const offsetNum = parseInt(offset as string) || 0;
  
  try {
    const where: any = { type };
    if (q) {
      where.name = { contains: String(q), mode: 'insensitive' };
    }
    if (system) {
      where.system = String(system);
    }
    
    const entries = await prisma.compendiumEntry.findMany({
      where,
      include: {
        module: {
          select: { name: true, system: true, version: true },
        },
      },
      take: limitNum,
      skip: offsetNum,
      orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
    });
    
    const total = await prisma.compendiumEntry.count({ where });
    
    // Transform entries
    const results = entries.map((entry: any) => ({
      id: entry.id,
      name: entry.name,
      type: entry.type,
      system: entry.system,
      description: entry.description,
      img: entry.img,
      thumbnail: entry.thumbnail,
      module: entry.module,
    }));
    
    res.json({ data: results, total, limit: limitNum, offset: offsetNum });
  } catch (error: any) {
    console.error('Error fetching compendium entries by type:', error);
    res.status(500).json({ error: 'Failed to fetch compendium entries', message: error.message });
  }
});

// Get single compendium entry by ID
router.get('/compendium/entry/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const entry = await prisma.compendiumEntry.findUnique({
      where: { id },
      include: {
        module: {
          select: { name: true, system: true, version: true },
        },
      },
    });
    
    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    
    const system: Record<string, any> =
      entry.raw &&
      typeof entry.raw === 'object' &&
      (entry.raw as any).system &&
      typeof (entry.raw as any).system === 'object'
        ? { ...(entry.raw as any).system }
        : {};
    
    res.json({
      id: entry.id,
      type: entry.type,
      name: entry.name,
      book: entry.source,
      publisher: entry.module?.name,
      description: entry.summary,
      img: (entry.raw as any)?.img,
      imgToken: (entry.raw as any)?.imgToken,
      imgSource: (entry.raw as any)?.imgSource,
      imgFallback: (entry.raw as any)?.imgFallback,
      system,
      slug: entry.slug,
      source: entry.source,
      // Include full raw JSON for troubleshooting - all original data from 5e.tools
      raw: entry.raw,
    });
  } catch (error: any) {
    console.error('Error fetching compendium entry:', error);
    res.status(500).json({ error: 'Failed to fetch entry', message: error.message });
  }
});

// Update compendium entry by ID
router.put('/compendium/entry/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const existing = await prisma.compendiumEntry.findUnique({
      where: { id },
      select: { id: true, moduleId: true, system: true, source: true, type: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    const {
      name,
      type,
      book,
      source,
      description,
      img,
      imgToken,
      imgSource,
      imgFallback,
      system,
    } = req.body || {};

    const normalized = normalizeEntry({
      id,
      name,
      type,
      book: book ?? source,
      source: source ?? book,
      description,
      img,
      imgToken,
      imgSource,
      imgFallback,
      system: system && typeof system === 'object' ? system : {},
    }) as any;

    const resolvedImageMeta = resolveEntryImages(type || normalized.type || existing.type || 'item', req.body || {}, normalized);
    normalized.img = normalized.img || resolvedImageMeta.img;
    normalized.imgToken = normalized.imgToken || resolvedImageMeta.imgToken;
    normalized.imgSource = normalized.imgSource || resolvedImageMeta.imgSource;
    normalized.imgFallback = normalized.imgFallback || resolvedImageMeta.imgFallback;

    const validation = validateEntry(normalized);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors,
      });
    }

    const updated = await prisma.compendiumEntry.update({
      where: { id },
      data: {
        name: normalized.name || existing.id,
        type: normalized.type || type || 'item',
        source: normalized.book || normalized.publisher || existing.source || null,
        summary: normalized.description || null,
        raw: normalized as any,
      },
      include: {
        module: {
          select: { name: true, system: true, version: true },
        },
      },
    });

    const responseSystem: Record<string, any> =
      updated.raw &&
      typeof updated.raw === 'object' &&
      (updated.raw as any).system &&
      typeof (updated.raw as any).system === 'object'
        ? { ...(updated.raw as any).system }
        : {};

    res.json({
      id: updated.id,
      type: updated.type,
      name: updated.name,
      book: updated.source,
      publisher: updated.module?.name,
      description: updated.summary,
      img: (updated.raw as any)?.img,
      imgToken: (updated.raw as any)?.imgToken,
      imgSource: (updated.raw as any)?.imgSource,
      imgFallback: (updated.raw as any)?.imgFallback,
      system: responseSystem,
      slug: updated.slug,
      source: updated.source,
    });
  } catch (error: any) {
    console.error('Error updating compendium entry:', error);
    res.status(500).json({ error: 'Failed to update entry', message: error.message });
  }
});

// Delete compendium entry by ID
router.delete('/compendium/entry/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const existing = await prisma.compendiumEntry.findUnique({
      where: { id },
      select: { id: true, moduleId: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    await prisma.compendiumEntry.delete({
      where: { id },
    });

    const count = await prisma.compendiumEntry.count({
      where: { moduleId: existing.moduleId },
    });

    await prisma.dataModule.update({
      where: { id: existing.moduleId },
      data: { itemCount: count },
    });

    res.json({ success: true, id });
  } catch (error: any) {
    console.error('Error deleting compendium entry:', error);
    res.status(500).json({ error: 'Failed to delete entry', message: error.message });
  }
});

// Backfill missing image metadata for existing entries
router.post('/compendium/images/backfill', async (req, res) => {
  const { type, limit = 250 } = req.body || {};
  const where: any = {};
  if (type) where.type = String(type);

  const max = Math.min(Math.max(Number(limit) || 250, 1), 2000);

  try {
    const entries = await prisma.compendiumEntry.findMany({
      where,
      select: {
        id: true,
        type: true,
        raw: true,
      },
      take: max,
      orderBy: { createdAt: 'desc' },
    });

    let updatedCount = 0;

    for (const entry of entries as any[]) {
      const raw = entry.raw && typeof entry.raw === 'object' ? { ...(entry.raw as any) } : {};
      const missingAny = !raw.img || !raw.imgFallback || (entry.type === 'monster' && !raw.imgToken);
      if (!missingAny) continue;

      const normalized = normalizeEntry({
        ...(raw || {}),
        id: entry.id,
        type: entry.type,
        name: raw.name || 'Unknown',
      }) as any;

      const resolved = resolveEntryImages(entry.type, raw, normalized);
      const nextRaw = {
        ...raw,
        img: raw.img || resolved.img,
        imgToken: raw.imgToken || resolved.imgToken,
        imgSource: raw.imgSource || resolved.imgSource,
        imgFallback: raw.imgFallback || resolved.imgFallback,
      };

      await prisma.compendiumEntry.update({
        where: { id: entry.id },
        data: { raw: nextRaw as any },
      });
      updatedCount++;
    }

    res.json({
      success: true,
      scanned: entries.length,
      updated: updatedCount,
      type: type || 'all',
    });

    IMAGE_FETCH_METRICS.backfillRuns += 1;
    IMAGE_FETCH_METRICS.backfillScanned += entries.length;
    IMAGE_FETCH_METRICS.backfillUpdated += updatedCount;
  } catch (error: any) {
    console.error('Error backfilling compendium images:', error);
    res.status(500).json({ error: 'Failed to backfill images', message: error?.message || String(error) });
  }
});

router.get('/compendium/images/metrics', async (_req, res) => {
  res.json({
    success: true,
    metrics: IMAGE_FETCH_METRICS,
    timestamp: Date.now(),
  });
});

// Search compendium entries
router.get('/compendium/search', async (req, res) => {
  const { q, type, system, limit = '50', offset = '0' } = req.query;
  
  // Spell filters
  const level = req.query.level as string | undefined;
  const school = req.query.school as string | undefined;
  const sourceClass = req.query.sourceClass as string | undefined;
  const concentration = req.query.concentration as string | undefined;
  const ritual = req.query.ritual as string | undefined;
  const verbal = req.query.verbal as string | undefined;
  const somatic = req.query.somatic as string | undefined;
  const material = req.query.material as string | undefined;
  
  // Monster filters
  const crMin = req.query.crMin as string | undefined;
  const crMax = req.query.crMax as string | undefined;
  const size = req.query.size as string | undefined;
  const creatureType = req.query.creatureType as string | undefined;
  const speedFly = req.query.speedFly as string | undefined;
  const speedSwim = req.query.speedSwim as string | undefined;
  const speedBurrow = req.query.speedBurrow as string | undefined;
  const speedClimb = req.query.speedClimb as string | undefined;
  
  // Item filters
  const itemType = req.query.itemType as string | undefined;
  const rarity = req.query.rarity as string | undefined;
  const magical = req.query.magical as string | undefined;
  const attunement = req.query.attunement as string | undefined;
  const weaponCategory = req.query.weaponCategory as string | undefined;
  const equipmentType = req.query.equipmentType as string | undefined;
  
  const limitNum = Math.min(parseInt(limit as string) || 50, 200);
  const offsetNum = parseInt(offset as string) || 0;
  
  try {
    const where: any = {};
    
    if (q) {
      where.name = { contains: String(q), mode: 'insensitive' };
    }
    if (type) {
      where.type = String(type);
    }
    if (system) {
      where.system = String(system);
    }
    
    // Build filter conditions based on type
    if (type === 'spell') {
      // Use raw JSON query for spell-specific filters
      const spellFilters: any[] = [];
      
      if (level !== undefined) {
        spellFilters.push({ raw: { path: ['system', 'level'], equals: parseInt(level) } });
      }
      if (school) {
        // Use abbreviation for school matching (database stores as abbreviation like 'C', 'V', etc.)
        const schoolValue = getSchoolValue(school);
        spellFilters.push({
          OR: [
            { raw: { path: ['system', 'school'], string_contains: schoolValue } },
            { raw: { path: ['system', 'school', 'name'], string_contains: schoolValue } },
            { raw: { path: ['data', 'school'], string_contains: schoolValue } },
            { raw: { path: ['school'], string_contains: schoolValue } }
          ]
        });
      }
      if (sourceClass) {
        // Try multiple paths for class matching
        spellFilters.push({
          OR: [
            { raw: { path: ['system', 'classes'], string_contains: sourceClass } },
            { raw: { path: ['system', 'sourceClass'], string_contains: sourceClass } },
            { raw: { path: ['system', 'class'], string_contains: sourceClass } },
            { raw: { path: ['data', 'classes'], string_contains: sourceClass } },
            { raw: { path: ['classes'], string_contains: sourceClass } }
          ]
        });
      }
      if (concentration === 'true') {
        spellFilters.push({ raw: { path: ['system', 'concentration'], equals: true } });
      }
      if (ritual === 'true') {
        spellFilters.push({ raw: { path: ['system', 'ritual'], equals: true } });
      }
      if (verbal === 'true') {
        spellFilters.push({ raw: { path: ['system', 'components', 'verbal'], equals: true } });
      }
      if (somatic === 'true') {
        spellFilters.push({ raw: { path: ['system', 'components', 'somatic'], equals: true } });
      }
      if (material === 'true') {
        spellFilters.push({ raw: { path: ['system', 'components', 'material'], equals: true } });
      }
      
      if (spellFilters.length > 0) {
        where.AND = spellFilters;
      }
    } else if (type === 'monster') {
      // Use raw JSON query for monster-specific filters
      const monsterFilters: any[] = [];
      
      if (crMin !== undefined) {
        monsterFilters.push({ raw: { path: ['system', 'cr'], gte: parseCrValue(crMin) } });
      }
      if (crMax !== undefined) {
        monsterFilters.push({ raw: { path: ['system', 'cr'], lte: parseCrValue(crMax) } });
      }
      if (size) {
        // Size is stored in raw.system.size as an array like ["H"] for Huge
        const sizeValue = getSizeValue(size).toUpperCase();
        // Use equals to match the exact array element
        monsterFilters.push({ raw: { path: ['system', 'size'], equals: [sizeValue] } });
      }
      if (creatureType) {
        // The type is stored at raw.type (e.g., "monstrosity", "beast")
        const typeValue = getMonsterTypeLabel(creatureType).toLowerCase();
        monsterFilters.push({ raw: { path: ['type'], string_contains: typeValue } });
      }
      if (speedFly === 'true') {
        monsterFilters.push({ raw: { path: ['system', 'speed', 'fly'], not: null } });
      }
      if (speedSwim === 'true') {
        monsterFilters.push({ raw: { path: ['system', 'speed', 'swim'], not: null } });
      }
      if (speedBurrow === 'true') {
        monsterFilters.push({ raw: { path: ['system', 'speed', 'burrow'], not: null } });
      }
      if (speedClimb === 'true') {
        monsterFilters.push({ raw: { path: ['system', 'speed', 'climb'], not: null } });
      }
      
      if (monsterFilters.length > 0) {
        where.AND = monsterFilters;
      }
    } else if (type === 'item') {
      const itemFilters: any[] = [];

      // Filter by item type - stored in system properties (wondrous, weapon, armor, etc.)
      if (itemType) {
        if (itemType === 'magic-item') {
          itemFilters.push({ raw: { path: ['system', 'rarity'], not: null } });
        } else if (itemType === 'WPN') {
          // For weapons, match by weaponCategory field (simple/martial) OR legacy weapon flag
          itemFilters.push({
            OR: [
              // Match items with weaponCategory (5e SRD/5etools style)
              { raw: { path: ['system', 'weaponCategory'], not: null } },
              { raw: { path: ['weaponCategory'], not: null } },
              // Match legacy style weapons
              { raw: { path: ['system', 'weapon'], not: null } },
              { raw: { path: ['weapon'], not: null } },
            ]
          });
        } else {
          switch (itemType) {
            case 'W':
              itemFilters.push({ raw: { path: ['system', 'wondrous'], equals: true } });
              break;
            case 'M':
              itemFilters.push({ raw: { path: ['system', 'weapon'], not: null } });
              itemFilters.push({ raw: { path: ['system', 'weapon', 'ranged'], not: true } });
              break;
            case 'R':
              itemFilters.push({ raw: { path: ['system', 'weapon', 'ranged'], equals: true } });
              break;
            case 'LA':
              itemFilters.push({ raw: { path: ['system', 'armor'], not: null } });
              break;
            case 'S':
              itemFilters.push({ raw: { path: ['system', 'shield'], equals: true } });
              break;
            case 'P':
              itemFilters.push({ raw: { path: ['system', 'potion'], equals: true } });
              break;
            case 'T':
              itemFilters.push({ raw: { path: ['system', 'tool'], equals: true } });
              break;
            case 'EQP':
              // Equipment - don't add filter here, equipmentType filter will handle it
              break;
            default:
              itemFilters.push({ raw: { path: ['system', 'type'], equals: itemType } });
          }
        }
      }

      // Filter by rarity - stored at system.rarity
      if (rarity) {
        if (rarity === 'mundane') {
          itemFilters.push({ raw: { path: ['system', 'rarity'], in: ['none', 'common'] } });
        } else {
          itemFilters.push({ raw: { path: ['system', 'rarity'], equals: rarity } });
        }
      }

      // Filter for magical items
      if (magical === 'true') {
        itemFilters.push({ raw: { path: ['system', 'rarity'], not: 'none' } });
      }

      // Filter by attunement
      if (attunement === 'required') {
        itemFilters.push({ raw: { path: ['system', 'reqAttune'], not: null } });
      } else if (attunement === 'not required') {
        itemFilters.push({ OR: [
          { raw: { path: ['system', 'reqAttune'], equals: null } },
          { raw: { path: ['system', 'reqAttune'], not: null } }
        ]});
      }

      // Filter by weapon category (Simple/Martial) - only applies when itemType is 'WPN'
      if (weaponCategory && itemType === 'WPN') {
        itemFilters.push({ 
          OR: [
            { raw: { path: ['system', 'weaponCategory'], equals: weaponCategory } },
            { raw: { path: ['weaponCategory'], equals: weaponCategory } }
          ]
        });
      }

      // Filter by equipment type - only applies when itemType is 'EQP'
      if (equipmentType && itemType === 'EQP') {
        const equipmentTypeFilter = getEquipmentTypeFilter(equipmentType);
        if (equipmentTypeFilter) {
          itemFilters.push(equipmentTypeFilter);
        }
      }

      if (itemFilters.length > 0) {
        where.AND = itemFilters;
      }
    }

    const entries = await prisma.compendiumEntry.findMany({
      where,
      include: {
        module: {
          select: { name: true, system: true, version: true },
        },
      },
      take: limitNum,
      skip: offsetNum,
      orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
    });
    
    const total = await prisma.compendiumEntry.count({ where });
    
    // Transform entries to normalized structure
    const results = entries.map((entry: any) => {
      const system: Record<string, any> =
        entry.raw &&
        typeof entry.raw === 'object' &&
        (entry.raw as any).system &&
        typeof (entry.raw as any).system === 'object'
          ? { ...(entry.raw as any).system }
          : {};
      
      return {
        id: entry.id,
        type: entry.type,
        name: entry.name,
        book: entry.source,
        publisher: entry.module?.name,
        description: entry.summary,
        img: (entry.raw as any)?.img,
        imgToken: (entry.raw as any)?.imgToken,
        imgSource: (entry.raw as any)?.imgSource,
        imgFallback: (entry.raw as any)?.imgFallback,
        system,
        slug: entry.slug,
        source: entry.source,
      };
    });
    
    res.json({ results, total, limit: limitNum, offset: offsetNum });
  } catch (error: any) {
    console.error('Error searching compendium:', error);
    res.status(500).json({ error: 'Failed to search compendium', message: error.message });
  }
});

// ====================
// Journal Routes
// ====================

// Get all journals for a session
router.get('/sessions/:sessionId/journals', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { type, search } = req.query;
    
    const where: any = { sessionId };
    
    if (type && type !== 'all') {
      where.type = type as string;
    }
    
    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: 'insensitive' } },
        { content: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    
    const journals = await prisma.journal.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
    
    res.json(journals);
  } catch (error: any) {
    console.error('Error fetching journals:', error);
    res.status(500).json({ error: 'Failed to fetch journals', message: error.message });
  }
});

// Get single journal
router.get('/journals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const journal = await prisma.journal.findUnique({
      where: { id },
    });
    
    if (!journal) {
      return res.status(404).json({ error: 'Journal not found' });
    }
    
    res.json(journal);
  } catch (error: any) {
    console.error('Error fetching journal:', error);
    res.status(500).json({ error: 'Failed to fetch journal', message: error.message });
  }
});

// Create new journal
router.post('/sessions/:sessionId/journals', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { title, type, content, layout, color, icon, tags, isPrivate } = req.body;
    
    const journal = await prisma.journal.create({
      data: {
        sessionId,
        title: title || 'Untitled Journal',
        type: type || 'general',
        content: content || '',
        layout: layout || 'standard',
        color: color || '#2d2d2d',
        icon: icon || null,
        tags: tags || [],
        isPrivate: isPrivate || false,
      },
    });
    
    res.json(journal);
  } catch (error: any) {
    console.error('Error creating journal:', error);
    res.status(500).json({ error: 'Failed to create journal', message: error.message });
  }
});

// Update journal
router.put('/journals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, type, content, layout, color, icon, tags, isPrivate } = req.body;
    
    const journal = await prisma.journal.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(type !== undefined && { type }),
        ...(content !== undefined && { content }),
        ...(layout !== undefined && { layout }),
        ...(color !== undefined && { color }),
        ...(icon !== undefined && { icon }),
        ...(tags !== undefined && { tags }),
        ...(isPrivate !== undefined && { isPrivate }),
      },
    });
    
    res.json(journal);
  } catch (error: any) {
    console.error('Error updating journal:', error);
    res.status(500).json({ error: 'Failed to update journal', message: error.message });
  }
});

// Delete journal
router.delete('/journals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.journal.delete({
      where: { id },
    });
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting journal:', error);
    res.status(500).json({ error: 'Failed to delete journal', message: error.message });
  }
});

// ====================
// Character Sheet Routes
// ====================

// Get all character sheets for a session
router.get('/sessions/:sessionId/characters', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const characters = await prisma.characterSheet.findMany({
      where: { sessionId },
      orderBy: { name: 'asc' },
    });
    
    res.json(characters);
  } catch (error: any) {
    console.error('Error fetching characters:', error);
    res.status(500).json({ error: 'Failed to fetch characters', message: error.message });
  }
});

// Get single character sheet
router.get('/characters/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const character = await prisma.characterSheet.findUnique({
      where: { id },
    });
    
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }
    
    res.json(character);
  } catch (error: any) {
    console.error('Error fetching character:', error);
    res.status(500).json({ error: 'Failed to fetch character', message: error.message });
  }
});

// Create new character sheet
router.post('/sessions/:sessionId/characters', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { name, playerName, level, race, class: charClass, background, alignment } = req.body;
    
    const character = await prisma.characterSheet.create({
      data: {
        sessionId,
        name: name || 'New Character',
        playerName: playerName || null,
        level: level || 1,
        traits: '',
        race: race || null,
        class: charClass || null,
        background: background || null,
        alignment: alignment || null,
      },
    });
    
    res.json(character);
  } catch (error: any) {
    console.error('Error creating character:', error);
    res.status(500).json({ error: 'Failed to create character', message: error.message });
  }
});

// Update character sheet
router.put('/characters/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Remove any fields that shouldn't be updated directly
    delete updateData.id;
    delete updateData.sessionId;
    delete updateData.createdAt;
    delete updateData.updatedAt;
    
    const character = await prisma.characterSheet.update({
      where: { id },
      data: updateData,
    });
    
    res.json(character);
  } catch (error: any) {
    console.error('Error updating character:', error);
    res.status(500).json({ error: 'Failed to update character', message: error.message });
  }
});

// Add item to character inventory
router.post('/characters/:id/inventory', async (req, res) => {
  try {
    const { id } = req.params;
    const { itemId, itemData } = req.body;
    
    const character = await prisma.characterSheet.findUnique({
      where: { id },
    });
    
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }
    
    const inventory = typeof character.inventory === 'string' 
      ? JSON.parse(character.inventory) 
      : character.inventory;
    
    // Add item with type detection for sorting
    const newItem = {
      id: itemId,
      data: itemData,
      addedAt: new Date().toISOString(),
      // Auto-detect item type for sorting
      type: detectItemType(itemData),
    };
    
    inventory.push(newItem);
    
    // Sort inventory by type
    const sortedInventory = sortInventoryByType(inventory);
    
    await prisma.characterSheet.update({
      where: { id },
      data: { inventory: JSON.stringify(sortedInventory) },
    });
    
    res.json({ success: true, inventory: sortedInventory });
  } catch (error: any) {
    console.error('Error adding item to inventory:', error);
    res.status(500).json({ error: 'Failed to add item', message: error.message });
  }
});

// Remove item from character inventory
router.delete('/characters/:id/inventory/:itemId', async (req, res) => {
  try {
    const { id, itemId } = req.params;
    
    const character = await prisma.characterSheet.findUnique({
      where: { id },
    });
    
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }
    
    const inventory = typeof character.inventory === 'string' 
      ? JSON.parse(character.inventory) 
      : character.inventory;
    
    const filtered = inventory.filter((item: any) => item.id !== itemId);
    
    await prisma.characterSheet.update({
      where: { id },
      data: { inventory: JSON.stringify(filtered) },
    });
    
    res.json({ success: true, inventory: filtered });
  } catch (error: any) {
    console.error('Error removing item from inventory:', error);
    res.status(500).json({ error: 'Failed to remove item', message: error.message });
  }
});

// Delete character sheet
router.delete('/characters/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.characterSheet.delete({
      where: { id },
    });
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting character:', error);
    res.status(500).json({ error: 'Failed to delete character', message: error.message });
  }
});

// Helper function to detect item type
function detectItemType(itemData: any): string {
  if (!itemData) return 'misc';
  
  const data = itemData.data || itemData;
  const type = data.type?.toLowerCase() || '';
  const name = data.name?.toLowerCase() || '';
  
  // Weapon types
  if (type === 'weapon' || name.includes('sword') || name.includes('axe') || name.includes('bow') || 
      name.includes('dagger') || name.includes('staff') || name.includes('wand')) {
    return 'weapon';
  }
  
  // Armor types
  if (type === 'armor' || name.includes('armor') || name.includes('shield') || name.includes('helmet') ||
      name.includes('gauntlet') || name.includes('boots')) {
    return 'armor';
  }
  
  // Potion
  if (name.includes('potion') || name.includes('elixir') || name.includes('philter')) {
    return 'potion';
  }
  
  // Scroll
  if (name.includes('scroll') || type === 'scroll') {
    return 'scroll';
  }
  
  // Ring
  if (name.includes('ring')) {
    return 'ring';
  }
  
  // Wondrous Item
  if (type === 'wondrous' || name.includes('wand') || name.includes('rod') || name.includes('staff')) {
    return 'wondrous';
  }
  
  // Tool
  if (type === 'tool' || name.includes('tool') || name.includes('kit') || name.includes('instrument')) {
    return 'tool';
  }
  
  // Consumable
  if (type === 'consumable' || name.includes('arrow') || name.includes('bolt') || name.includes('bullet')) {
    return 'consumable';
  }
  
  return 'misc';
}

// Helper function to sort inventory by type
function sortInventoryByType(inventory: any[]): any[] {
  const typeOrder = ['weapon', 'armor', 'potion', 'scroll', 'ring', 'wondrous', 'tool', 'consumable', 'misc'];
  
  return [...inventory].sort((a, b) => {
    const typeA = (a.type || 'misc').toLowerCase();
    const typeB = (b.type || 'misc').toLowerCase();
    
    const orderA = typeOrder.indexOf(typeA);
    const orderB = typeOrder.indexOf(typeB);
    
    if (orderA !== orderB) return orderA - orderB;
    
    // Secondary sort by name
    const nameA = (a.data?.name || a.data?.properties?.name || '').toLowerCase();
    const nameB = (b.data?.name || b.data?.properties?.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
}

export { router as dataRouter };
