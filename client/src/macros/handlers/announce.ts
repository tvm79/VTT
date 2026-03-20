import type { AnnounceCommandPayload, CommandExecutionContext } from '../types';

const TONE_PREFIX: Record<NonNullable<AnnounceCommandPayload['tone']>, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  success: '✅',
  danger: '🔥',
};

export async function handleAnnounceCommand(
  payload: AnnounceCommandPayload,
  context: CommandExecutionContext,
): Promise<void> {
  const tonePrefix = payload.tone ? `${TONE_PREFIX[payload.tone]} ` : '';
  const heading = payload.title ? `**${payload.title}**\n` : '';
  const text = `${tonePrefix}${heading}${payload.message}`.trim();
  context.sendChatMessage(text, { visibility: payload.visibility });
}

