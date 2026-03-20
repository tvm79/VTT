import { parseMacroCommandPayload } from './commandParser';
import { handleAnnounceCommand } from './handlers/announce';
import { handleRandomTableCommand } from './handlers/randomTable';
import { handleRollSequenceCommand } from './handlers/rollSequence';
import { handleSceneCommand } from './handlers/scene';
import type { CommandExecutionContext, MacroDispatchResult } from './types';

export async function dispatchCommandMacro(
  rawInput: string,
  context: CommandExecutionContext,
): Promise<MacroDispatchResult> {
  const parsed = parseMacroCommandPayload(rawInput);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  const { payload } = parsed;

  if (!context.isGM && payload.command === 'scene') {
    return { ok: false, error: 'Only GM can execute scene macros.' };
  }

  try {
    if (payload.command === 'announce') {
      await handleAnnounceCommand(payload, context);
      return { ok: true };
    }
    if (payload.command === 'randomTable') {
      await handleRandomTableCommand(payload, context);
      return { ok: true };
    }
    if (payload.command === 'rollSequence') {
      await handleRollSequenceCommand(payload, context);
      return { ok: true };
    }
    if (payload.command === 'scene') {
      await handleSceneCommand(payload, context);
      return { ok: true };
    }

    return { ok: false, error: 'Unsupported command.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Command execution failed.';
    return { ok: false, error: message };
  }
}

