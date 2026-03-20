function isPlainDataObject(value: any): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function getValueAtPath(target: any, path: Array<string | number>): any {
  return path.reduce((acc, key) => acc?.[key], target);
}

export function setValueAtPath(target: any, path: Array<string | number>, value: any): any {
  if (path.length === 0) return value;

  const [head, ...rest] = path;
  const base = Array.isArray(target) ? [...target] : { ...(target || {}) };

  if (rest.length === 0) {
    (base as any)[head] = value;
    return base;
  }

  (base as any)[head] = setValueAtPath((base as any)[head], rest, value);
  return base;
}

export function removeArrayIndexAtPath(target: any, path: Array<string | number>, index: number): any {
  const current = getValueAtPath(target, path);
  if (!Array.isArray(current)) return target;
  return setValueAtPath(target, path, current.filter((_, currentIndex) => currentIndex !== index));
}

function createValueTemplate(value: any): any {
  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    return createValueTemplate(value[0]);
  }
  if (isPlainDataObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, createValueTemplate(nestedValue)]),
    );
  }
  if (typeof value === 'boolean') return false;
  if (typeof value === 'number') return 0;
  return '';
}

export function addArrayItemAtPath(target: any, path: Array<string | number>, templateSource?: any): any {
  const current = getValueAtPath(target, path);
  if (!Array.isArray(current)) return target;

  const nextItem = templateSource !== undefined
    ? createValueTemplate(templateSource)
    : current.length > 0
      ? createValueTemplate(current[current.length - 1])
      : '';

  return setValueAtPath(target, path, [...current, nextItem]);
}

export function moveArrayItemAtPath(target: any, path: Array<string | number>, fromIndex: number, toIndex: number): any {
  const current = getValueAtPath(target, path);
  if (!Array.isArray(current)) return target;
  if (fromIndex < 0 || fromIndex >= current.length) return target;
  if (toIndex < 0 || toIndex >= current.length) return target;
  if (fromIndex === toIndex) return target;

  const next = [...current];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return setValueAtPath(target, path, next);
}

export function duplicateArrayItemAtPath(target: any, path: Array<string | number>, index: number): any {
  const current = getValueAtPath(target, path);
  if (!Array.isArray(current)) return target;
  if (index < 0 || index >= current.length) return target;
  const duplicate = JSON.parse(JSON.stringify(current[index]));
  const next = [...current];
  next.splice(index + 1, 0, duplicate);
  return setValueAtPath(target, path, next);
}
