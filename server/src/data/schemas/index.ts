/**
 * Generic data schema helpers.
 *
 * This file intentionally avoids hardcoded system-specific schemas.
 */

export const dataSchemas: Record<string, any> = {};

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

const filenameTypeHints: Array<{ match: RegExp; type: string }> = [
  { match: /spell/i, type: 'spell' },
  { match: /monster|creature|bestiary/i, type: 'monster' },
  { match: /class/i, type: 'class' },
  { match: /feat/i, type: 'feat' },
  { match: /race|species|ancestr/i, type: 'species' },
  { match: /background/i, type: 'background' },
  { match: /condition|status/i, type: 'condition' },
  { match: /item|equipment|gear|weapon|armor|treasure/i, type: 'item' },
];

export function getTypeFromFilename(filename: string): string {
  const normalized = normalizeName(filename);

  for (const hint of filenameTypeHints) {
    if (hint.match.test(normalized)) return hint.type;
  }

  return 'item';
}
