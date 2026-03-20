import type { ParticleTrigger } from '../editor/particleSchema';

type ParticleEventListener = (trigger: ParticleTrigger) => void;

const listeners = new Set<ParticleEventListener>();

export function emitParticleEvent(trigger: ParticleTrigger): void {
  listeners.forEach((listener) => listener(trigger));
}

export function onParticleEvent(listener: ParticleEventListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
