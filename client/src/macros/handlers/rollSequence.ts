import type { CommandExecutionContext, RollSequenceCommandPayload } from '../types';

export async function handleRollSequenceCommand(
  payload: RollSequenceCommandPayload,
  context: CommandExecutionContext,
): Promise<void> {
  const visibility = payload.visibility;
  const lines: string[] = [];

  for (const [index, step] of payload.steps.entries()) {
    const result = await context.rollFormula(step.formula, step.visibility || visibility);
    const label = step.label || `Step ${index + 1}`;
    if (!result) {
      lines.push(`- ${label}: ${step.formula} → failed`);
      continue;
    }
    lines.push(`- ${label}: ${result.formula} = **${result.total}**`);
  }

  if (payload.summarize !== false) {
    const header = payload.title ? `🎯 **${payload.title}**` : '🎯 **Roll Sequence**';
    context.sendChatMessage(`${header}\n${lines.join('\n')}`, { visibility });
  }
}

