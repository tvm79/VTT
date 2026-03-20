import type { CommandExecutionContext, SceneCommandPayload } from '../types';

export async function handleSceneCommand(
  payload: SceneCommandPayload,
  context: CommandExecutionContext,
): Promise<void> {
  const visibility = payload.visibility;
  const intro = payload.narration ? `\n${payload.narration}` : '';
  context.sendChatMessage(`🎬 **${payload.title}**${intro}`, { visibility });

  if (payload.weather && context.isGM) {
    const weather = payload.weather;
    if (weather.type) context.weather.setType(weather.type);
    if (typeof weather.intensity === 'number') context.weather.setIntensity(Math.max(0, Math.min(100, weather.intensity)));
    if (typeof weather.speed === 'number') context.weather.setSpeed(Math.max(0, Math.min(100, weather.speed)));
    if (typeof weather.direction === 'number') context.weather.setDirection(weather.direction);
    if (typeof weather.enabled === 'boolean') context.weather.setVisible(weather.enabled);
  }

  if (payload.time && context.isGM) {
    if (typeof payload.time.setSeconds === 'number') {
      context.time.setGameTime(payload.time.setSeconds);
    }
    if (typeof payload.time.advanceBy === 'number') {
      context.time.advanceTime(payload.time.advanceBy);
    }
  }
}

