import type { CommandExecutionContext, RandomTableCommandPayload } from '../types';

function pickWeightedIndex(weights: number[]): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return 0;

  let roll = Math.random() * total;
  for (let i = 0; i < weights.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

export async function handleRandomTableCommand(
  payload: RandomTableCommandPayload,
  context: CommandExecutionContext,
): Promise<void> {
  const sourceEntries = payload.tableId
    ? context.getRollTableById(payload.tableId)?.rows
    : payload.entries;

  if (!sourceEntries || sourceEntries.length === 0) {
    throw new Error(payload.tableId
      ? `Rolltable not found: ${payload.tableId}`
      : 'Random table has no entries.');
  }

  const normalized = sourceEntries.map((entry) => ({
    ...entry,
    weight: typeof entry.weight === 'number' && entry.weight > 0 ? entry.weight : 1,
  }));

  const selectedIndex = pickWeightedIndex(normalized.map((entry) => entry.weight));
  const selected = normalized[selectedIndex];

  const header = payload.title
    ? `🎲 **${payload.title}**`
    : payload.tableId
      ? `🎲 **Rolltable: ${payload.tableId}**`
      : '🎲 **Random Table**';
  const detail = selected.detail ? `\n${selected.detail}` : '';
  const message = `${header}\nResult: **${selected.label}**${detail}`;

  context.sendChatMessage(message, { visibility: payload.visibility });
}
