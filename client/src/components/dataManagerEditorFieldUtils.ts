export interface NumericSelectOption {
  value: number;
  label: string;
}

export function getCreatureCrOptions(): NumericSelectOption[] {
  return [
    { value: 0, label: '0' },
    { value: 0.125, label: '1/8' },
    { value: 0.25, label: '1/4' },
    { value: 0.5, label: '1/2' },
    ...Array.from({ length: 30 }, (_, index) => ({ value: index + 1, label: String(index + 1) })),
  ];
}

export function getSpellLevelOptions(): NumericSelectOption[] {
  return [
    { value: 0, label: 'Cantrip' },
    { value: 1, label: '1st Level' },
    { value: 2, label: '2nd Level' },
    { value: 3, label: '3rd Level' },
    { value: 4, label: '4th Level' },
    { value: 5, label: '5th Level' },
    { value: 6, label: '6th Level' },
    { value: 7, label: '7th Level' },
    { value: 8, label: '8th Level' },
    { value: 9, label: '9th Level' },
  ];
}

export function getSizeFieldOptions(): Array<{ value: string; label: string }> {
  return [
    { value: 'T', label: 'Tiny' },
    { value: 'S', label: 'Small' },
    { value: 'M', label: 'Medium' },
    { value: 'L', label: 'Large' },
    { value: 'H', label: 'Huge' },
    { value: 'G', label: 'Gargantuan' },
  ];
}

export function isPrimitiveEditorArray(value: any[]): boolean {
  return value.every((entry) => {
    const t = typeof entry;
    return entry == null || t === 'string' || t === 'number' || t === 'boolean';
  });
}

export function getArrayEntryPreviewLabel(fieldLabel: string, entry: any, index: number): string {
  if (entry && typeof entry === 'object' && typeof entry.name === 'string' && entry.name.trim()) {
    return entry.name.trim();
  }
  if (typeof entry === 'string') {
    const normalized = entry.trim().replace(/\s+/g, ' ');
    return normalized.length > 56 ? `${normalized.slice(0, 56)}…` : normalized || `${fieldLabel} ${index + 1}`;
  }
  return `${fieldLabel} ${index + 1}`;
}

export function getSpellObjectPreferredOrder(normalizedKeyName: string): string[] | null {
  if (normalizedKeyName === 'distance' || normalizedKeyName === 'range') {
    return ['type', 'amount'];
  }
  if (normalizedKeyName === 'components') {
    return ['v', 's', 'm', 'material', 'cost', 'consume', 'consumed'];
  }
  return null;
}

export function getOrderedObjectEntries(
  value: Record<string, any>,
  preferredOrder: string[],
): Array<[string, any]> {
  const entries = Object.entries(value);
  return [
    ...preferredOrder
      .filter((entryKey) => Object.prototype.hasOwnProperty.call(value, entryKey))
      .map((entryKey) => [entryKey, value[entryKey]] as [string, any]),
    ...entries.filter(([entryKey]) => !preferredOrder.includes(entryKey)),
  ];
}
