export type ImageProviderId = '5etools' | 'too-many-tokens' | 'search-api';

export interface ImageFetcherFeatureFlags {
  enabled: boolean;
  autoApproveTrusted: boolean;
  providers: Record<ImageProviderId, boolean>;
}

export interface ImageFetcherRuntimeConfig {
  flags: ImageFetcherFeatureFlags;
  tooManyTokens: {
    indexFile: string | null;
    indexUrl: string | null;
  };
  searchApi: {
    endpoint: string | null;
    apiKey: string | null;
    engineId: string | null;
    hasApiKey: boolean;
    hasEngineId: boolean;
  };
  allowedHosts: string[];
  deniedHosts: string[];
}

export interface ImageResolveContext {
  type: string;
  name: string;
  source?: string | null;
  normalized?: Record<string, any>;
  raw?: Record<string, any>;
}

export interface ImageCandidate {
  url: string;
  provider: ImageProviderId;
  kind: 'token' | 'portrait' | 'art';
  confidence: number;
  trusted: boolean;
  license?: string;
  attribution?: string;
  sourceUrl?: string;
  reason?: string;
}

export interface ImageProvider {
  id: ImageProviderId;
  resolveCandidates: (context: ImageResolveContext) => Promise<ImageCandidate[]>;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function parseList(value: string | undefined, fallback: string[]): string[] {
  if (!value || !value.trim()) return fallback;
  return value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function getImageFetcherConfig(): ImageFetcherRuntimeConfig {
  const allowedHosts = parseList(process.env.IMAGE_FETCHER_ALLOWED_HOSTS, [
    '5e.tools',
    'raw.githubusercontent.com',
    'githubusercontent.com',
  ]);

  return {
    flags: {
      enabled: parseBool(process.env.IMAGE_FETCHER_ENABLED, true),
      autoApproveTrusted: parseBool(process.env.IMAGE_AUTO_APPROVE_TRUSTED, true),
      providers: {
        '5etools': parseBool(process.env.IMAGE_PROVIDER_5ETOOLS_ENABLED, true),
        'too-many-tokens': parseBool(process.env.IMAGE_PROVIDER_TOO_MANY_TOKENS_ENABLED, false),
        'search-api': parseBool(process.env.IMAGE_PROVIDER_SEARCH_API_ENABLED, false),
      },
    },
    tooManyTokens: {
      indexFile: process.env.IMAGE_TOO_MANY_TOKENS_INDEX_FILE || null,
      indexUrl: process.env.IMAGE_TOO_MANY_TOKENS_INDEX_URL || null,
    },
    searchApi: {
      endpoint: process.env.IMAGE_SEARCH_API_ENDPOINT || null,
      apiKey: process.env.IMAGE_SEARCH_API_KEY || null,
      engineId: process.env.IMAGE_SEARCH_API_ENGINE_ID || null,
      hasApiKey: Boolean(process.env.IMAGE_SEARCH_API_KEY),
      hasEngineId: Boolean(process.env.IMAGE_SEARCH_API_ENGINE_ID),
    },
    allowedHosts,
    deniedHosts: parseList(process.env.IMAGE_FETCHER_DENIED_HOSTS, []),
  };
}

export function getPublicImageFetcherConfig(config: ImageFetcherRuntimeConfig) {
  return {
    flags: config.flags,
    tooManyTokens: {
      indexConfigured: Boolean(config.tooManyTokens.indexFile || config.tooManyTokens.indexUrl),
    },
    searchApi: {
      endpoint: config.searchApi.endpoint,
      configured: config.searchApi.hasApiKey && config.searchApi.hasEngineId,
    },
    allowedHosts: config.allowedHosts,
  };
}
