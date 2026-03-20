const FRACTION_TO_CR: Record<string, number> = {
  '0': 0,
  '1/8': 0.125,
  '1/6': 0.1666667,
  '1/4': 0.25,
  '1/3': 0.3333333,
  '1/2': 0.5,
};

interface CRBand {
  max: number;
  color: string;
}

const CR_BANDS: CRBand[] = [
  { max: 0, color: '#22c55e' },
  { max: 2, color: '#84cc16' },
  { max: 4, color: '#facc15' },
  { max: 8, color: '#f59e0b' },
  { max: 12, color: '#f97316' },
  { max: 16, color: '#ef4444' },
  { max: 22, color: '#e11d48' },
  { max: Number.POSITIVE_INFINITY, color: '#a855f7' },
];

export function parseChallengeRating(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (FRACTION_TO_CR[normalized] !== undefined) return FRACTION_TO_CR[normalized];
    const numeric = Number(normalized);
    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
    return null;
  }

  if (value && typeof value === 'object') {
    const maybeObject = value as Record<string, unknown>;
    return (
      parseChallengeRating(maybeObject.cr) ??
      parseChallengeRating(maybeObject.challengeRating) ??
      parseChallengeRating(maybeObject.value) ??
      null
    );
  }

  return null;
}

export function getChallengeRatingColor(crValue: unknown, fallback = '#f97316'): string {
  const cr = parseChallengeRating(crValue);
  if (cr === null) return fallback;
  const band = CR_BANDS.find((entry) => cr <= entry.max);
  return band?.color ?? fallback;
}

export function extractMonsterChallengeRating(item: any): unknown {
  if (!item || typeof item !== 'object') return null;

  return (
    item.cr ??
    item.challengeRating ??
    item.system?.cr ??
    item.system?.challengeRating ??
    item.properties?.cr ??
    item.properties?.challengeRating ??
    item.properties?.['Challenge Rating'] ??
    item.properties?.['challenge rating'] ??
    null
  );
}
