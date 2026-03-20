// Spell school colors based on D&D school themes
const SCHOOL_COLORS: Record<string, string> = {
  // Abbreviation to color
  a: '#3b82f6', // Abjuration - Blue (protective)
  c: '#22c55e', // Conjuration - Green (summoning)
  d: '#8b5cf6', // Divination - Purple (magical knowledge)
  e: '#ec4899', // Enchantment - Pink (charming)
  v: '#f97316', // Evocation - Orange (fire/damage)
  i: '#06b6d4', // Illusion - Cyan (trickery)
  n: '#94a3b8', // Necromancy - Gray (death)
  t: '#84cc16', // Transmutation - Lime (change)
};

// Also handle lowercase versions
const SCHOOL_COLORS_LOWER: Record<string, string> = {
  abjuration: '#3b82f6',
  conjuration: '#22c55e',
  divination: '#8b5cf6',
  enchantment: '#ec4899',
  evocation: '#f97316',
  illusion: '#06b6d4',
  necromancy: '#94a3b8',
  transmutation: '#84cc16',
};

// SVG icon paths for each school (from files)
const SCHOOL_ICONS: Record<string, string> = {
  // Abbreviation to icon file path
  a: '/icons/spellschool/abjuration.svg',
  c: '/icons/spellschool/conjuration.svg',
  d: '/icons/spellschool/divination.svg',
  e: '/icons/spellschool/enchantment.svg',
  v: '/icons/spellschool/evocation.svg',
  i: '/icons/spellschool/illusion.svg',
  n: '/icons/spellschool/necromancy.svg',
  t: '/icons/spellschool/transmutation.svg',
};

const SCHOOL_ICONS_LOWER: Record<string, string> = {
  abjuration: '/icons/spellschool/abjuration.svg',
  conjuration: '/icons/spellschool/conjuration.svg',
  divination: '/icons/spellschool/divination.svg',
  enchantment: '/icons/spellschool/enchantment.svg',
  evocation: '/icons/spellschool/evocation.svg',
  illusion: '/icons/spellschool/illusion.svg',
  necromancy: '/icons/spellschool/necromancy.svg',
  transmutation: '/icons/spellschool/transmutation.svg',
};

export function getSpellSchoolColor(schoolValue: unknown, fallback = '#f97316'): string {
  if (!schoolValue) return fallback;
  
  const normalized = String(schoolValue).toLowerCase().trim();
  
  // Check abbreviation first
  if (SCHOOL_COLORS[normalized]) {
    return SCHOOL_COLORS[normalized];
  }
  
  // Check full word
  if (SCHOOL_COLORS_LOWER[normalized]) {
    return SCHOOL_COLORS_LOWER[normalized];
  }
  
  return fallback;
}

export function getSpellSchoolIcon(schoolValue: unknown): string | null {
  if (!schoolValue) return null;
  
  const normalized = String(schoolValue).toLowerCase().trim();
  
  // Check abbreviation first
  if (SCHOOL_ICONS[normalized]) {
    return SCHOOL_ICONS[normalized];
  }
  
  // Check full word
  if (SCHOOL_ICONS_LOWER[normalized]) {
    return SCHOOL_ICONS_LOWER[normalized];
  }
  
  return null;
}

export function extractSpellSchool(item: any): unknown {
  if (!item || typeof item !== 'object') return null;

  return (
    item.school ??
    item.system?.school ??
    item.system?.school?.name ??
    item.data?.school ??
    item.data?.school?.name ??
    item.properties?.school ??
    null
  );
}
