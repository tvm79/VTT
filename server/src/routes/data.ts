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
    key: 'items-all',
    category: 'items',
    categoryLabel: 'Items',
    source: 'all',
    sourceLabel: 'All',
    label: 'Items (All)',
    defaultName: '5eTools Items',
    url: `${BASE_URL}/items.json`,
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

router.get('/import/5etools/datasets', async (_req, res) => {
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
  const { dataset, name, system, version, description } = req.body;

  if (!dataset || !name || !system) {
    return res.status(400).json({ error: 'Missing required fields: dataset, name, system' });
  }

  const preset = fiveEToolsDatasets[String(dataset)];
  if (!preset) {
    return res.status(400).json({ error: `Unknown 5eTools dataset "${dataset}"` });
  }

  try {
    let payload: any;
    let fetchUrl = preset.url;

    // Handle dynamic class URL - fetch and combine multiple class files
    if (preset.url === 'DYNAMIC_CLASS_URL') {
      const classKeys = dataset === 'classes-xphb' ? XPHB_CLASSES : PHB_CLASSES;
      payload = await fetchCombinedClassData(classKeys);
      fetchUrl = `${BASE_URL}/class (combined from ${classKeys.length} files)`;
    } else {
      const response = await fetch(preset.url, {
        headers: {
          'User-Agent': 'VTT-Importer/1.0',
        },
      });

      if (!response.ok) {
        return res.status(502).json({ error: 'Failed to fetch dataset from 5eTools', status: response.status, url: preset.url });
      }

      payload = await response.json();
    }

    const items = extractDatasetItems(payload, preset.rootKeys);
    if (items.length === 0) {
      return res.status(422).json({ error: 'Dataset returned no importable items', url: fetchUrl });
    }

    let module = await prisma.dataModule.findFirst({
      where: { name, system },
    });

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
    }

    let createdCount = 0;
    const batchSize = 50;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (item: any) => {
          try {
            await createCompendiumEntry(module!.id, system, preset.type, item);
            createdCount++;
          } catch (err) {
            console.error('Error creating 5eTools entry:', err);
          }
        }),
      );
    }

    const count = await prisma.compendiumEntry.count({ where: { moduleId: module.id } });
    await prisma.dataModule.update({
      where: { id: module.id },
      data: { itemCount: count },
    });

    res.json({
      success: true,
      imported: createdCount,
      fetched: items.length,
      dataset,
      sourceUrl: preset.url,
      module: { ...module, itemCount: count },
    });
  } catch (error: any) {
    console.error('Error importing 5eTools dataset:', error);
    res.status(500).json({ error: 'Failed to import 5eTools dataset', message: error.message });
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

// Get available filter options for a given type
router.get('/compendium/filters/:type', async (req, res) => {
  const { type } = req.params;
  
  try {
    const options: Record<string, { value: string; label: string }[]> = {};
    
    if (type === 'spell') {
      const entries = await prisma.compendiumEntry.findMany({
        where: { type: 'spell' },
        select: { raw: true, source: true },
        take: 5000,
      });
      
      const schoolSet = new Set<string>();
      const classSet = new Set<string>();
      const sourceSet = new Set<string>();
      
      entries.forEach((entry: any) => {
        const raw = entry.raw || {};
        const system = raw.system || raw.data || {};
        
        // Get school - could be direct or nested
        const school = system.school || system.school?.name;
        if (school) schoolSet.add(school);
        
        // Get classes - try multiple possible paths in both raw and system
        const classPaths = [
          system.classes, 
          system.sourceClass, 
          system.class,
          raw.classes,
          raw.sourceClass,
          raw.class
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
        
        if (entry.source) sourceSet.add(entry.source);
      });
      
      options.schools = Array.from(schoolSet).sort().map(s => ({ value: getSchoolLabel(s), label: getSchoolLabel(s) }));
      options.classes = Array.from(classSet).sort().map(s => ({ value: s, label: s }));
      options.sources = Array.from(sourceSet).sort().map(s => ({ value: s, label: s }));
      
      options.levels = Array.from({ length: 10 }, (_, i) => ({
        value: String(i),
        label: i === 0 ? 'Cantrip' : `Level ${i}`,
      }));
      
    } else if (type === 'monster') {
      const entries = await prisma.compendiumEntry.findMany({
        where: { type: 'monster' },
        select: { raw: true, source: true },
        take: 5000,
      });
      
      const typeSet = new Set<string>();
      const sizeSet = new Set<string>();
      const sourceSet = new Set<string>();
      
      entries.forEach((entry: any) => {
        const raw = entry.raw || {};
        const system = raw.system || raw.data || {};
        
        // Get monster type - the type is stored at raw.type directly
        const mtype = raw.type;
        if (mtype) {
          typeSet.add(mtype);
        }
        
        // Get size - it's stored in raw.system.size as an array like ["H"] for Huge
        const size = system.size;
        if (size) {
          if (Array.isArray(size)) {
            size.forEach((s: string) => sizeSet.add(s));
          } else {
            sizeSet.add(size);
          }
        }
        
        if (entry.source) sourceSet.add(entry.source);
      });
      
      options.creatureTypes = Array.from(typeSet).sort().map(s => ({ value: getMonsterTypeValue(s), label: getMonsterTypeLabel(s) }));
      options.sizes = Array.from(sizeSet).sort().map(s => ({ value: getSizeValue(s), label: getSizeLabel(s) }));
      options.sources = Array.from(sourceSet).sort().map(s => ({ value: s, label: s }));
      
      options.challengeRatings = Array.from({ length: 34 }, (_, i) => ({
        value: String(i / 2),
        label: i / 2 === 0 ? '0' : i / 2 === 0.125 ? '1/8' : i / 2 === 0.25 ? '1/4' : i / 2 === 0.5 ? '1/2' : String(i / 2),
      }));
    }
    
    res.json(options);
  } catch (error: any) {
    console.error('Error getting filter options:', error);
    res.status(500).json({ error: 'Failed to get filter options', message: error.message });
  }
});

// Get compendium entries by type (normalized)
router.get('/compendium/:type', async (req, res) => {
  const { type } = req.params;
  const { q, limit = '100', offset = '0', system } = req.query;
  
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
    
    // Build filter conditions based on type
    if (type === 'spell') {
      const spellFilters: any[] = [];
      
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
      const monsterFilters: any[] = [];
      
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
      };
    });
    
    res.json({ data: transformedData, total, limit: limitNum, offset: offsetNum });
  } catch (error: any) {
    console.error('Error fetching compendium entries:', error);
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
