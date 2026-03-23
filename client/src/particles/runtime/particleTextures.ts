import { Assets, Texture, Spritesheet } from 'pixi.js';

export const PARTICLE_ATLAS_TEXTURES = ['soft_circle', 'spark', 'smoke', 'ring', 'ember'] as const;

function normalizeCustomTexturePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('data:')) return trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;

  // Uploaded assets are often stored/referenced as /assets/<folder>/<file>,
  // but Pixi texture resolution in this runtime expects the public path directly.
  // Example: /assets/maps/cloud1.webp -> /maps/cloud1.webp
  if (trimmed.startsWith('/assets/')) {
    return trimmed.slice('/assets'.length);
  }

  return trimmed;
}

export interface ParticleTextureAtlas {
  getTexture(name: string): Texture;
  preloadTexture(name: string): Promise<Texture | null>;
  hasTexture(name: string): boolean;
  destroy(): void;
}

let atlasPromise: Promise<ParticleTextureAtlas> | null = null;

export async function loadParticleAtlas(): Promise<ParticleTextureAtlas> {
  if (atlasPromise) return atlasPromise;
  atlasPromise = (async () => {
    const jsonResponse = await fetch('/particle-assets/particle-atlas.json');
    const json = await jsonResponse.json();
    let sheet: Spritesheet;
    try {
      const loaded = await Assets.load('/particle-assets/particle-atlas.json');
      if (loaded instanceof Spritesheet) {
        sheet = loaded;
      } else {
        const baseTexture =
          (loaded as Texture | undefined)?.baseTexture ??
          (await Assets.load<Texture>('/particle-assets/particle-atlas.png')).baseTexture;
        sheet = new Spritesheet(baseTexture, json);
        await sheet.parse();
      }
    } catch {
      const baseTexture = (await Assets.load<Texture>('/particle-assets/particle-atlas.png')).baseTexture;
      sheet = new Spritesheet(baseTexture, json);
      await sheet.parse();
    }
    const textures = sheet.textures;
    const customTextures = new Map<string, Texture>();
    const pendingCustomLoads = new Map<string, Promise<void>>();

    const startCustomLoad = (cacheKey: string, candidates: string[]) => {
      if (pendingCustomLoads.has(cacheKey) || customTextures.has(cacheKey)) return;
      const loadPromise = (async () => {
        for (let i = 0; i < candidates.length; i++) {
          const candidate = candidates[i];
          try {
            const loaded = await Assets.load(candidate);
            if (loaded instanceof Texture) {
              customTextures.set(cacheKey, loaded);
              return;
            }
            const maybeTexture = loaded as Texture | undefined;
            if (maybeTexture?.baseTexture) {
              customTextures.set(cacheKey, maybeTexture);
              return;
            }
          } catch {
            // Try next candidate variant.
          }
        }
        // Silent fallback - no logging needed
      })().finally(() => {
        pendingCustomLoads.delete(cacheKey);
      });
      pendingCustomLoads.set(cacheKey, loadPromise);
    };

    return {
      async preloadTexture(name: string): Promise<Texture | null> {
        if (!name) return null;
        const normalized = normalizeCustomTexturePath(name);
        if (customTextures.has(normalized)) {
          return customTextures.get(normalized) ?? null;
        }
        const candidates = normalized !== name ? [normalized, name] : [name];
        startCustomLoad(normalized, candidates);
        const pending = pendingCustomLoads.get(normalized);
        if (pending) {
          await pending;
        }
        return customTextures.get(normalized) ?? null;
      },
      getTexture(name: string) {
        if (textures[name]) {
          return textures[name];
        }
        const isDataURL = name?.startsWith('data:');
        if (name && (name.includes('/') || name.includes('.') || name.startsWith('http') || isDataURL)) {
          const normalized = normalizeCustomTexturePath(name);
          const candidates = normalized !== name ? [normalized, name] : [name];

          if (!customTextures.has(normalized)) {
            startCustomLoad(normalized, candidates);
          }

          const resolved = customTextures.get(normalized);
          if (resolved) return resolved;
          return Texture.WHITE;
        }
        return Texture.WHITE;
      },
      hasTexture(name: string) {
        return Boolean(textures[name]);
      },
      destroy() {
        customTextures.clear();
        pendingCustomLoads.clear();
        sheet.destroy(true);
      },
    };
  })();
  return atlasPromise;
}

export function resetParticleAtlas(): void {
  atlasPromise = null;
}
