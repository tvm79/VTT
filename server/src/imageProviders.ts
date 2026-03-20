import fs from 'fs';
import type {
  ImageCandidate,
  ImageFetcherRuntimeConfig,
  ImageProvider,
  ImageProviderId,
  ImageResolveContext,
} from './imageFetcherConfig.js';

const FIVE_ETOOLS_IMG_BASE_URL = 'https://5e.tools/img';

function normalizeImageType(type: string): string {
  const normalized = String(type || '').trim().toLowerCase();
  if (normalized === 'creature' || normalized === 'npc') return 'monster';
  if (normalized === 'race') return 'species';
  return normalized || 'item';
}

function get5eToolsSourceCodeFromContext(context: ImageResolveContext): string {
  const candidate = String(
    context.source ||
    context.normalized?.book ||
    context.raw?.book ||
    context.raw?.source ||
    context.raw?.system?.source?.custom ||
    context.raw?.system?.source?.rules ||
    'MM',
  ).trim();
  const stripped = candidate.replace(/[^a-zA-Z0-9]/g, '');
  return (stripped || 'MM').toUpperCase();
}

function build5eToolsMonsterTokenUrl(sourceCode: string, name: string): string {
  const encodedName = encodeURIComponent(String(name || '').trim());
  return `${FIVE_ETOOLS_IMG_BASE_URL}/bestiary/tokens/${sourceCode}/${encodedName}.webp`;
}

function create5etoolsProvider(): ImageProvider {
  return {
    id: '5etools',
    async resolveCandidates(context: ImageResolveContext): Promise<ImageCandidate[]> {
      if (normalizeImageType(context.type) !== 'monster') return [];
      const sourceCode = get5eToolsSourceCodeFromContext(context);
      const url = build5eToolsMonsterTokenUrl(sourceCode, context.name || 'Unknown');
      return [
        {
          url,
          provider: '5etools',
          kind: 'token',
          confidence: 0.98,
          trusted: true,
          license: '5etools-source-dependent',
          attribution: '5etools',
          sourceUrl: url,
          reason: `Deterministic 5etools token path (${sourceCode})`,
        },
      ];
    },
  };
}

function createNoopProvider(id: ImageProviderId): ImageProvider {
  return {
    id,
    async resolveCandidates(): Promise<ImageCandidate[]> {
      return [];
    },
  };
}

function createSearchApiProvider(config: ImageFetcherRuntimeConfig): ImageProvider {
  return {
    id: 'search-api',
    async resolveCandidates(context: ImageResolveContext): Promise<ImageCandidate[]> {
      const endpoint = config.searchApi.endpoint;
      const apiKey = config.searchApi.apiKey;
      const engineId = config.searchApi.engineId;

      if (!endpoint || !apiKey || !engineId) return [];

      const normalizedType = normalizeImageType(context.type);
      const queryParts = [context.name, normalizedType, context.source].filter(Boolean);
      const query = queryParts.join(' ');

      const searchUrl = new URL(endpoint);
      searchUrl.searchParams.set('key', apiKey);
      searchUrl.searchParams.set('cx', engineId);
      searchUrl.searchParams.set('q', query);
      searchUrl.searchParams.set('num', '5');
      searchUrl.searchParams.set('searchType', 'image');

      const response = await fetch(searchUrl.toString());
      if (!response.ok) {
        throw new Error(`search-api fetch failed (${response.status})`);
      }

      const payload: any = await response.json();
      const items = Array.isArray(payload?.items) ? payload.items : [];

      return items
        .map((entry: any) => {
          const link = String(entry?.link || '').trim();
          const sourceUrl = String(entry?.image?.contextLink || '').trim() || link;
          if (!link) return null;
          return {
            url: link,
            provider: 'search-api' as const,
            kind: 'token' as const,
            confidence: 0.45,
            trusted: false,
            license: 'unknown',
            attribution: 'search-api',
            sourceUrl,
            reason: 'Image search API candidate',
          };
        })
        .filter((entry: ImageCandidate | null): entry is ImageCandidate => Boolean(entry));
    },
  };
}

type TooManyTokensEntry = {
  name: string;
  source?: string;
  url: string;
  license?: string;
  attribution?: string;
};

let tooManyTokensIndexCache: TooManyTokensEntry[] | null = null;

function normalizeLookupText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getSourceCodeFromContext(context: ImageResolveContext): string {
  const candidate = String(
    context.source ||
    context.normalized?.book ||
    context.raw?.book ||
    context.raw?.source ||
    context.raw?.system?.source?.custom ||
    context.raw?.system?.source?.rules ||
    '',
  ).trim();
  return normalizeLookupText(candidate).replace(/\s+/g, '');
}

async function loadTooManyTokensIndex(config: ImageFetcherRuntimeConfig): Promise<TooManyTokensEntry[]> {
  if (tooManyTokensIndexCache) return tooManyTokensIndexCache;

  const { indexFile, indexUrl } = config.tooManyTokens;
  let payload: any = null;

  if (indexFile && fs.existsSync(indexFile)) {
    const raw = fs.readFileSync(indexFile, 'utf8');
    payload = JSON.parse(raw);
  } else if (indexUrl) {
    const response = await fetch(indexUrl);
    if (!response.ok) {
      throw new Error(`too-many-tokens index fetch failed (${response.status})`);
    }
    payload = await response.json();
  } else {
    tooManyTokensIndexCache = [];
    return [];
  }

  const entries = Array.isArray(payload) ? payload : Array.isArray(payload?.tokens) ? payload.tokens : [];
  tooManyTokensIndexCache = entries
    .map((entry: any) => ({
      name: String(entry?.name || ''),
      source: entry?.source ? String(entry.source) : undefined,
      url: String(entry?.url || entry?.image || ''),
      license: entry?.license ? String(entry.license) : 'unknown',
      attribution: entry?.attribution ? String(entry.attribution) : 'too-many-tokens',
    }))
    .filter((entry: TooManyTokensEntry) => Boolean(entry.name) && Boolean(entry.url));

  return tooManyTokensIndexCache ?? [];
}

function createTooManyTokensProvider(config: ImageFetcherRuntimeConfig): ImageProvider {
  return {
    id: 'too-many-tokens',
    async resolveCandidates(context: ImageResolveContext): Promise<ImageCandidate[]> {
      if (normalizeImageType(context.type) !== 'monster') return [];

      const index = await loadTooManyTokensIndex(config);
      if (index.length === 0) return [];

      const targetName = normalizeLookupText(context.name);
      const targetSource = getSourceCodeFromContext(context);

      const matched = index.filter((entry) => {
        const nameMatch = normalizeLookupText(entry.name) === targetName;
        if (!nameMatch) return false;
        if (!targetSource) return true;
        const sourceCode = normalizeLookupText(entry.source || '').replace(/\s+/g, '');
        return !sourceCode || sourceCode === targetSource;
      });

      return matched.map((entry) => ({
        url: entry.url,
        provider: 'too-many-tokens',
        kind: 'token',
        confidence: targetSource ? 0.9 : 0.84,
        trusted: false,
        license: entry.license || 'unknown',
        attribution: entry.attribution || 'too-many-tokens',
        sourceUrl: entry.url,
        reason: 'Exact name match from too-many-tokens index',
      }));
    },
  };
}

export function createImageProviderRegistry(
  providerFlags: Record<ImageProviderId, boolean>,
  config: ImageFetcherRuntimeConfig,
): ImageProvider[] {
  const registry: ImageProvider[] = [];
  if (providerFlags['5etools']) registry.push(create5etoolsProvider());
  if (providerFlags['too-many-tokens']) registry.push(createTooManyTokensProvider(config));
  if (providerFlags['search-api']) registry.push(createSearchApiProvider(config));
  return registry;
}

export async function resolveImageCandidates(
  providers: ImageProvider[],
  context: ImageResolveContext,
): Promise<ImageCandidate[]> {
  const all: ImageCandidate[] = [];
  for (const provider of providers) {
    try {
      const results = await provider.resolveCandidates(context);
      if (Array.isArray(results) && results.length > 0) {
        all.push(...results);
      }
    } catch (error) {
      console.warn(`[image-fetcher] provider ${provider.id} failed`, error);
    }
  }

  return all.sort((a, b) => b.confidence - a.confidence);
}
