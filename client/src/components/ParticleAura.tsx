/**
 * Particle Aura - Uses the unified particle system
 *
 * This component provides particle auras around tokens using the centralized particle system.
 */

import { useEffect, useRef } from 'react';
import type { Application } from 'pixi.js';
import { getParticleSystem, initParticleSystem } from '../particles/runtime/ParticleSystem';

export interface ParticleAuraProps {
  app: Application;
  tokens: Array<{
    id: string;
    x: number;
    y: number;
    size?: number;
    properties?: Record<string, unknown>;
  }>;
  gridSize: number;
}

// Map old particle types to new aura presets
const PARTICLE_TYPE_TO_PRESET: Record<string, string> = {
  flame: 'BurningEmber',
  smoke: 'DeathSmoke',
  frost: 'FrostImpact',
  electric: 'CritSpark',
  holy: 'BlessAura',
  poison: 'BurningEmber',
  sparkle: 'BlessAura',
  ghost: 'GhostTrail',
  snow: 'FrostImpact',
  spark: 'CritSpark',
  drip: 'BurningEmber',
  shield: 'BlessAura',
};

// Hook for using particle auras in components
export function useParticleAuras({ app, tokens, gridSize }: ParticleAuraProps) {
  const emitterKeysRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const ensureSystem = async () => {
      const system = getParticleSystem() ?? (app ? await initParticleSystem({ app, boardWidth: 2000, boardHeight: 2000 }) : null);
      if (!system || cancelled) return;

      const activeTokenIds = new Set(tokens.map((t) => t.id));
      const tokensWithAuras = tokens.filter((token) => {
        const tokenProps = (token.properties || {}) as Record<string, unknown>;
        return tokenProps.particleEnabled === true;
      });

      const seenEmitterIds = new Set<string>();

      tokensWithAuras.forEach((token) => {
        const tokenProps = (token.properties || {}) as Record<string, unknown>;
        const particleType = String(tokenProps.particleType || 'sparkle');
        const auraRadius = typeof tokenProps.auraRadius === 'number' ? tokenProps.auraRadius : 60;
        const particleColor = typeof tokenProps.particleColor === 'string' ? tokenProps.particleColor : undefined;
        const particleCount = typeof tokenProps.particleCount === 'number' ? tokenProps.particleCount : 20;
        const particleSize = typeof tokenProps.particleSize === 'number' ? tokenProps.particleSize : 10;
        const particleRate = typeof tokenProps.particleRate === 'number' ? tokenProps.particleRate : 5;
        const particleLifetime = typeof tokenProps.particleLifetime === 'number' ? tokenProps.particleLifetime : 3;
        
        // Use particlePresetId if available, otherwise fall back to legacy mapping
        const presetId = (tokenProps.particlePresetId as string) || (PARTICLE_TYPE_TO_PRESET[particleType] || 'BlessAura');
        const size = gridSize * (token.size || 1);
        const tokenCenterX = token.x + size / 2;
        const tokenCenterY = token.y + size / 2;
        const existingEmitterId = emitterKeysRef.current.get(token.id);
        const existingPresetId = emitterKeysRef.current.get(`preset:${token.id}`);

        // If emitter exists but preset has changed, stop the old one and recreate
        if (existingEmitterId && existingPresetId !== presetId) {
          try {
            const system = getParticleSystem();
            if (system) {
              system.stopByToken(token.id);
            }
          } catch (e) {
            // Ignore errors when stopping
          }
          emitterKeysRef.current.delete(token.id);
          emitterKeysRef.current.delete(`preset:${token.id}`);
        }

        if (existingEmitterId && existingPresetId === presetId) {
          seenEmitterIds.add(existingEmitterId);
          // Update existing emitter with new properties
          try {
            const system = getParticleSystem();
            if (system) {
              system.updateByToken(token.id, {
                spawnRadius: auraRadius,
                emitRate: Math.max(6, particleCount),
                startColor: particleColor,
                endColor: particleColor,
                startSize: particleSize,
                endSize: particleSize * 0.5,
                lifetimeMinMs: particleLifetime * 1000,
                lifetimeMaxMs: particleLifetime * 1000,
              });
            }
          } catch (e) {
            // Ignore errors when updating
          }
          return;
        }

        try {
          const key = `aura:${token.id}`;
          system.playPreset(presetId, {
            x: tokenCenterX,
            y: tokenCenterY,
            sourceTokenId: token.id,
            overrides: {
              spawnRadius: auraRadius,
              emitRate: Math.max(6, particleCount),
              startColor: particleColor,
              endColor: particleColor,
              attachMode: 'follow-token',
              startSize: particleSize,
              endSize: particleSize * 0.5,
              lifetimeMinMs: particleLifetime * 1000,
              lifetimeMaxMs: particleLifetime * 1000,
            },
          });
          emitterKeysRef.current.set(token.id, key);
          emitterKeysRef.current.set(`preset:${token.id}`, presetId);
          seenEmitterIds.add(key);
        } catch (e) {
          console.warn('Failed to create aura emitter:', e);
        }
      });

      const tokensToRemove: string[] = [];
      emitterKeysRef.current.forEach((emitterKey, tokenId) => {
        if (!activeTokenIds.has(tokenId) || !seenEmitterIds.has(emitterKey)) {
          system.stopByToken(tokenId);
          tokensToRemove.push(tokenId);
        }
      });

      tokensToRemove.forEach((tokenId) => {
        emitterKeysRef.current.delete(tokenId);
      });
    };
    void ensureSystem();
    return () => {
      cancelled = true;
    };
  }, [app, tokens, gridSize]);
}

// Component wrapper for particle auras
export function ParticleAuraRenderer({ app, tokens, gridSize }: ParticleAuraProps) {
  useParticleAuras({ app, tokens, gridSize });
  return null;
}
