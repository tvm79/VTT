import type {
  AnnounceCommandPayload,
  MacroCommandParseResult,
  RandomTableCommandPayload,
  RollSequenceCommandPayload,
  SceneCommandPayload,
} from './types';
import type { DiceRollVisibility } from '../../../shared/src/index';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asVisibility(value: unknown): DiceRollVisibility | undefined {
  return value === 'public' || value === 'gm' || value === 'blind' || value === 'self'
    ? value
    : undefined;
}

function parseAnnounce(raw: Record<string, unknown>): MacroCommandParseResult {
  const message = asString(raw.message);
  if (!message) {
    return { ok: false, error: 'announce.message is required.' };
  }

  const payload: AnnounceCommandPayload = {
    command: 'announce',
    message,
    title: asString(raw.title) || undefined,
    tone: raw.tone === 'info' || raw.tone === 'warning' || raw.tone === 'success' || raw.tone === 'danger' ? raw.tone : undefined,
    visibility: asVisibility(raw.visibility),
  };

  return { ok: true, payload };
}

function parseRandomTable(raw: Record<string, unknown>): MacroCommandParseResult {
  const tableId = asString(raw.tableId) || undefined;

  const entriesRaw = raw.entries;
  const entries = Array.isArray(entriesRaw)
    ? entriesRaw
        .map((entry) => {
          if (!isObject(entry)) return null;
          const label = asString(entry.label);
          if (!label) return null;
          const weight = asNumber(entry.weight);
          return {
            id: asString(entry.id) || undefined,
            label,
            detail: asString(entry.detail) || undefined,
            weight: weight && weight > 0 ? weight : undefined,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    : undefined;

  if (!tableId && (!entries || entries.length === 0)) {
    return { ok: false, error: 'randomTable requires tableId or legacy entries.' };
  }

  const payload: RandomTableCommandPayload = {
    command: 'randomTable',
    title: asString(raw.title) || undefined,
    tableId,
    entries,
    visibility: asVisibility(raw.visibility),
  };

  return { ok: true, payload };
}

function parseRollSequence(raw: Record<string, unknown>): MacroCommandParseResult {
  const stepsRaw = raw.steps;
  if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) {
    return { ok: false, error: 'rollSequence.steps must contain at least one step.' };
  }

  const steps = stepsRaw
    .map((step) => {
      if (!isObject(step)) return null;
      const formula = asString(step.formula);
      if (!formula) return null;
      return {
        formula,
        label: asString(step.label) || undefined,
        visibility: asVisibility(step.visibility),
      };
    })
    .filter((step): step is NonNullable<typeof step> => step !== null);

  if (steps.length === 0) {
    return { ok: false, error: 'rollSequence.steps must include valid formula values.' };
  }

  const payload: RollSequenceCommandPayload = {
    command: 'rollSequence',
    title: asString(raw.title) || undefined,
    steps,
    summarize: raw.summarize === false ? false : true,
    visibility: asVisibility(raw.visibility),
  };

  return { ok: true, payload };
}

function parseScene(raw: Record<string, unknown>): MacroCommandParseResult {
  const title = asString(raw.title);
  if (!title) {
    return { ok: false, error: 'scene.title is required.' };
  }

  const payload: SceneCommandPayload = {
    command: 'scene',
    title,
    narration: asString(raw.narration) || undefined,
    visibility: asVisibility(raw.visibility),
  };

  if (isObject(raw.weather)) {
    payload.weather = {
      enabled: typeof raw.weather.enabled === 'boolean' ? raw.weather.enabled : undefined,
      type:
        raw.weather.type === 'none' || raw.weather.type === 'rain' || raw.weather.type === 'snow' || raw.weather.type === 'fog' || raw.weather.type === 'clouds' || raw.weather.type === 'fireflies' || raw.weather.type === 'embers' || raw.weather.type === 'sparkles' || raw.weather.type === 'hearts' || raw.weather.type === 'blizzard'
          ? raw.weather.type
          : undefined,
      intensity: asNumber(raw.weather.intensity) ?? undefined,
      speed: asNumber(raw.weather.speed) ?? undefined,
      direction: asNumber(raw.weather.direction) ?? undefined,
    };
  }

  if (isObject(raw.time)) {
    payload.time = {
      setSeconds: asNumber(raw.time.setSeconds) ?? undefined,
      advanceBy: asNumber(raw.time.advanceBy) ?? undefined,
    };
  }

  return { ok: true, payload };
}

export function parseMacroCommandPayload(input: string): MacroCommandParseResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(input);
  } catch {
    return {
      ok: false,
      error: 'Command payload must be valid JSON.',
    };
  }

  if (!isObject(parsed)) {
    return { ok: false, error: 'Command payload must be a JSON object.' };
  }

  const command = asString(parsed.command);
  if (!command) {
    return { ok: false, error: 'Command payload requires a command field.' };
  }

  if (command === 'announce') return parseAnnounce(parsed);
  if (command === 'randomTable') return parseRandomTable(parsed);
  if (command === 'rollSequence') return parseRollSequence(parsed);
  if (command === 'scene') return parseScene(parsed);

  return {
    ok: false,
    error: `Unsupported command type: ${command}`,
  };
}
