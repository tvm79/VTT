import type { Light, Token } from '../../../shared/src/index';

const TOKEN_LIGHT_COLOR = 0xffdd88;
const TOKEN_LIGHT_EFFECT_COLOR = 0xffaa00;
const MIN_TOKEN_LIGHT_RADIUS = 80;

function getTokenFootprint(token: Token): number {
  return token.size && token.size > 0 ? token.size : 1;
}

export function getTokenLightCenter(token: Token, gridSize: number): { x: number; y: number } {
  const footprint = getTokenFootprint(token);
  const size = footprint * gridSize;
  return {
    x: token.x + size / 2,
    y: token.y + size / 2,
  };
}

export function buildTokenLightPayload(token: Token, boardId: string, gridSize: number): Light {
  const { x, y } = getTokenLightCenter(token, gridSize);
  const footprint = getTokenFootprint(token);
  const radius = Math.max(gridSize * footprint, MIN_TOKEN_LIGHT_RADIUS);
  const id = `token-light-${token.id}-${Date.now()}`;
  // Use Torch preset defaults for better initial lighting
  const TORCH_RADIUS = 150;
  const TORCH_COLOR = 0xffaa44;
  const TORCH_EFFECT_COLOR = 0xff6600;
  return {
    id,
    boardId,
    name: `${token.name || 'Token'} Light`,
    x,
    y,
    radius: TORCH_RADIUS,
    color: TORCH_COLOR,
    intensity: 1,
    alpha: 1,
    effect: 'flicker',
    effectSpeed: 1,
    effectIntensity: 0.8,
    effectColor: TORCH_EFFECT_COLOR,
    type: 'point',
    direction: 0,
    angle: 60,
    dimRadius: Math.max(TORCH_RADIUS * 0.25, 12),
    visible: true,
    blendMode: 'add',
  };
}
