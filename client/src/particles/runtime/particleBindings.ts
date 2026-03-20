import type { ParticleEventType, ParticlePreset, ParticleBinding } from '../editor/particleSchema';

export interface ParticleBindingEntry extends ParticleBinding {
  presetId: string;
}

const eventTypes: ParticleEventType[] = [
  'token_move',
  'token_stop',
  'token_attack',
  'token_hit',
  'token_crit',
  'token_heal',
  'token_die',
  'spell_cast',
  'spell_impact',
  'buff_apply',
  'debuff_apply',
  'aura_tick',
  'manual',
];

export function buildBindingsForPresets(presets: ParticlePreset[]): Map<ParticleEventType, ParticleBindingEntry[]> {
  const map = new Map<ParticleEventType, ParticleBindingEntry[]>();
  for (let i = 0; i < eventTypes.length; i++) {
    map.set(eventTypes[i], []);
  }
  for (let i = 0; i < presets.length; i++) {
    const preset = presets[i];
    for (let j = 0; j < preset.bindings.length; j++) {
      const binding = preset.bindings[j];
      const list = map.get(binding.event);
      if (!list) continue;
      list.push({ ...binding, presetId: preset.id });
    }
  }
  return map;
}
