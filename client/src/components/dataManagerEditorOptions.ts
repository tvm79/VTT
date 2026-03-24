export interface EditorSelectOption {
  value: string;
  label: string;
}

const SPELL_SELECT_OPTIONS_MAP: Record<string, EditorSelectOption[]> = {
  school: [
    { value: 'abjuration', label: 'Abjuration' },
    { value: 'conjuration', label: 'Conjuration' },
    { value: 'divination', label: 'Divination' },
    { value: 'enchantment', label: 'Enchantment' },
    { value: 'evocation', label: 'Evocation' },
    { value: 'illusion', label: 'Illusion' },
    { value: 'necromancy', label: 'Necromancy' },
    { value: 'transmutation', label: 'Transmutation' },
  ],
  ability: [
    { value: 'strength', label: 'Strength' },
    { value: 'dexterity', label: 'Dexterity' },
    { value: 'constitution', label: 'Constitution' },
    { value: 'intelligence', label: 'Intelligence' },
    { value: 'wisdom', label: 'Wisdom' },
    { value: 'charisma', label: 'Charisma' },
  ],
  spellcastingability: [
    { value: 'strength', label: 'Strength' },
    { value: 'dexterity', label: 'Dexterity' },
    { value: 'constitution', label: 'Constitution' },
    { value: 'intelligence', label: 'Intelligence' },
    { value: 'wisdom', label: 'Wisdom' },
    { value: 'charisma', label: 'Charisma' },
  ],
  primaryability: [
    { value: 'strength', label: 'Strength' },
    { value: 'dexterity', label: 'Dexterity' },
    { value: 'constitution', label: 'Constitution' },
    { value: 'intelligence', label: 'Intelligence' },
    { value: 'wisdom', label: 'Wisdom' },
    { value: 'charisma', label: 'Charisma' },
  ],
  sourceclass: [
    { value: 'wizard', label: 'Wizard' },
    { value: 'cleric', label: 'Cleric' },
    { value: 'druid', label: 'Druid' },
    { value: 'sorcerer', label: 'Sorcerer' },
    { value: 'warlock', label: 'Warlock' },
    { value: 'bard', label: 'Bard' },
    { value: 'paladin', label: 'Paladin' },
    { value: 'ranger', label: 'Ranger' },
  ],
  method: [
    { value: 'spellcasting', label: 'Spellcasting' },
    { value: 'innate', label: 'Innate' },
    { value: 'pact', label: 'Pact Magic' },
  ],
  preparation: [
    { value: 'prepared', label: 'Prepared' },
    { value: 'always', label: 'Always Prepared' },
    { value: 'atwill', label: 'At Will' },
  ],
  unit: [
    { value: 'action', label: 'Action' },
    { value: 'bonus', label: 'Bonus Action' },
    { value: 'reaction', label: 'Reaction' },
    { value: 'minute', label: 'Minute' },
    { value: 'hour', label: 'Hour' },
  ],
  type: [
    { value: 'self', label: 'Self' },
    { value: 'touch', label: 'Touch' },
    { value: 'point', label: 'Point' },
    { value: 'line', label: 'Line' },
    { value: 'cone', label: 'Cone' },
    { value: 'sphere', label: 'Sphere' },
  ],
  time: [
    { value: 'instant', label: 'Instant' },
    { value: 'round', label: 'Round' },
    { value: 'minute', label: 'Minute' },
    { value: 'hour', label: 'Hour' },
    { value: 'day', label: 'Day' },
  ],
  // Particle effect fields for spells
  spellCastEffect: [
    { value: '', label: 'None' },
    { value: 'FireCast', label: 'Fire Cast' },
    { value: 'FrostCast', label: 'Frost Cast' },
    { value: 'ArcaneCast', label: 'Arcane Cast' },
    { value: 'HolyCast', label: 'Holy Cast' },
    { value: 'NatureCast', label: 'Nature Cast' },
    { value: 'ShadowCast', label: 'Shadow Cast' },
  ],
  spellImpactEffect: [
    { value: '', label: 'None' },
    { value: 'FireImpact', label: 'Fire Impact' },
    { value: 'FrostImpact', label: 'Frost Impact' },
    { value: 'ArcaneBurst', label: 'Arcane Burst' },
    { value: 'HolyHeal', label: 'Holy Heal' },
    { value: 'BloodHit', label: 'Blood Hit' },
    { value: 'LightningStrike', label: 'Lightning Strike' },
  ],
};

const SHARED_SELECT_OPTIONS_MAP: Record<string, EditorSelectOption[]> = {
  alignment: [
    { value: 'lawful good', label: 'Lawful Good' },
    { value: 'neutral good', label: 'Neutral Good' },
    { value: 'chaotic good', label: 'Chaotic Good' },
    { value: 'lawful neutral', label: 'Lawful Neutral' },
    { value: 'neutral', label: 'Neutral' },
    { value: 'chaotic neutral', label: 'Chaotic Neutral' },
    { value: 'lawful evil', label: 'Lawful Evil' },
    { value: 'neutral evil', label: 'Neutral Evil' },
    { value: 'chaotic evil', label: 'Chaotic Evil' },
    { value: 'unaligned', label: 'Unaligned' },
  ],
  rarity: [
    { value: 'common', label: 'Common' },
    { value: 'uncommon', label: 'Uncommon' },
    { value: 'rare', label: 'Rare' },
    { value: 'very rare', label: 'Very Rare' },
    { value: 'legendary', label: 'Legendary' },
    { value: 'artifact', label: 'Artifact' },
  ],
  damagetype: [
    { value: 'acid', label: 'Acid' },
    { value: 'bludgeoning', label: 'Bludgeoning' },
    { value: 'cold', label: 'Cold' },
    { value: 'fire', label: 'Fire' },
    { value: 'force', label: 'Force' },
    { value: 'lightning', label: 'Lightning' },
    { value: 'necrotic', label: 'Necrotic' },
    { value: 'piercing', label: 'Piercing' },
    { value: 'poison', label: 'Poison' },
    { value: 'psychic', label: 'Psychic' },
    { value: 'radiant', label: 'Radiant' },
    { value: 'slashing', label: 'Slashing' },
    { value: 'thunder', label: 'Thunder' },
  ],
  weaponcategory: [
    { value: 'simple', label: 'Simple' },
    { value: 'martial', label: 'Martial' },
  ],
  hitdie: [
    { value: 'd6', label: 'd6' },
    { value: 'd8', label: 'd8' },
    { value: 'd10', label: 'd10' },
    { value: 'd12', label: 'd12' },
  ],
  attunement: [
    { value: 'none', label: 'No Attunement' },
    { value: 'optional', label: 'Optional Attunement' },
    { value: 'required', label: 'Requires Attunement' },
  ],
  // Particle effect fields for weapons
  weaponAttackEffect: [
    { value: '', label: 'None' },
    { value: 'BloodHit', label: 'Blood Hit' },
    { value: 'Slash', label: 'Slash' },
    { value: 'FireSlash', label: 'Fire Slash' },
    { value: 'FrostSlash', label: 'Frost Slash' },
    { value: 'LightningStrike', label: 'Lightning Strike' },
    { value: 'HolyHeal', label: 'Holy Impact' },
  ],
  weaponHitEffect: [
    { value: '', label: 'None' },
    { value: 'BloodHit', label: 'Blood Hit' },
    { value: 'FireImpact', label: 'Fire Impact' },
    { value: 'FrostImpact', label: 'Frost Impact' },
    { value: 'LightningStrike', label: 'Lightning Strike' },
    { value: 'ArcaneBurst', label: 'Arcane Burst' },
  ],
  cr: [
    { value: '0', label: '0' },
    { value: '1/8', label: '1/8' },
    { value: '1/4', label: '1/4' },
    { value: '1/2', label: '1/2' },
    { value: '1', label: '1' },
    { value: '2', label: '2' },
    { value: '3', label: '3' },
    { value: '4', label: '4' },
    { value: '5', label: '5' },
    { value: '6', label: '6' },
    { value: '7', label: '7' },
    { value: '8', label: '8' },
    { value: '9', label: '9' },
    { value: '10', label: '10' },
    { value: '11', label: '11' },
    { value: '12', label: '12' },
    { value: '13', label: '13' },
    { value: '14', label: '14' },
    { value: '15', label: '15' },
    { value: '16', label: '16' },
    { value: '17', label: '17' },
    { value: '18', label: '18' },
    { value: '19', label: '19' },
    { value: '20', label: '20' },
    { value: '21', label: '21' },
    { value: '22', label: '22' },
    { value: '23', label: '23' },
    { value: '24', label: '24' },
    { value: '25', label: '25' },
    { value: '26', label: '26' },
    { value: '27', label: '27' },
    { value: '28', label: '28' },
    { value: '29', label: '29' },
    { value: '30', label: '30' },
  ],
};

const LAYOUT_SELECT_OPTIONS_MAP: Record<string, Record<string, EditorSelectOption[]>> = {
  creature: {
    type: [
      { value: 'aberration', label: 'Aberration' },
      { value: 'beast', label: 'Beast' },
      { value: 'celestial', label: 'Celestial' },
      { value: 'construct', label: 'Construct' },
      { value: 'dragon', label: 'Dragon' },
      { value: 'elemental', label: 'Elemental' },
      { value: 'fey', label: 'Fey' },
      { value: 'fiend', label: 'Fiend' },
      { value: 'giant', label: 'Giant' },
      { value: 'humanoid', label: 'Humanoid' },
      { value: 'monstrosity', label: 'Monstrosity' },
      { value: 'ooze', label: 'Ooze' },
      { value: 'plant', label: 'Plant' },
      { value: 'undead', label: 'Undead' },
    ],
  },
  species: {
    size: [
      { value: 'S', label: 'Small' },
      { value: 'M', label: 'Medium' },
      { value: 'L', label: 'Large' },
    ],
  },
};

const AUTOCOMPLETE_SUGGESTIONS_MAP: Record<string, string[]> = {
  language: ['Common', 'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc', 'Draconic', 'Sylvan', 'Infernal', 'Celestial', 'Abyssal', 'Primordial', 'Undercommon'],
  languages: ['Common', 'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc', 'Draconic', 'Sylvan', 'Infernal', 'Celestial', 'Abyssal', 'Primordial', 'Undercommon'],
  skill: ['Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception', 'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine', 'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion', 'Sleight of Hand', 'Stealth', 'Survival'],
  skills: ['Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception', 'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine', 'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion', 'Sleight of Hand', 'Stealth', 'Survival'],
  sense: ['Blindsight', 'Darkvision', 'Tremorsense', 'Truesight'],
  senses: ['Blindsight', 'Darkvision', 'Tremorsense', 'Truesight'],
  condition: ['Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious'],
  conditionimmune: ['Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious'],
  source: ['PHB', 'DMG', 'MM', 'XGE', 'TCE', 'MOTM'],
  book: ['PHB', 'DMG', 'MM', 'XGE', 'TCE', 'MOTM'],
};

export function getEditorSelectOptions(field: string, layoutType: string, isSpellItem: boolean): EditorSelectOption[] | null {
  if (isSpellItem && SPELL_SELECT_OPTIONS_MAP[field]) return SPELL_SELECT_OPTIONS_MAP[field];
  if (LAYOUT_SELECT_OPTIONS_MAP[layoutType]?.[field]) return LAYOUT_SELECT_OPTIONS_MAP[layoutType][field];
  if (SHARED_SELECT_OPTIONS_MAP[field]) return SHARED_SELECT_OPTIONS_MAP[field];
  return null;
}

export function getEditorAutocompleteSuggestions(field: string, pathTokens: Array<string | number>): string[] {
  const direct = AUTOCOMPLETE_SUGGESTIONS_MAP[field] || [];
  const pathJoined = pathTokens.map((token) => String(token).toLowerCase()).join('.');
  const byPath = [
    pathJoined.includes('language') ? AUTOCOMPLETE_SUGGESTIONS_MAP.languages || [] : [],
    pathJoined.includes('skill') ? AUTOCOMPLETE_SUGGESTIONS_MAP.skills || [] : [],
    pathJoined.includes('sense') ? AUTOCOMPLETE_SUGGESTIONS_MAP.senses || [] : [],
    pathJoined.includes('condition') ? AUTOCOMPLETE_SUGGESTIONS_MAP.condition || [] : [],
  ].flat();

  return Array.from(new Set([...direct, ...byPath]));
}
