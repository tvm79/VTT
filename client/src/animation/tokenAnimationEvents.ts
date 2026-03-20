export type TokenAnimationType =
  | 'move'
  | 'attack'
  | 'damage'
  | 'heal'
  | 'miss'
  | 'downed'
  | 'select';

export interface TokenAnimationRequest {
  tokenId: string;
  type: TokenAnimationType;
  from?: { x: number; y: number };
  to?: { x: number; y: number };
  duration?: number;
  payload?: Record<string, unknown>;
  interrupt?: boolean;
}

type TokenAnimationListener = (request: TokenAnimationRequest) => void;

const listeners = new Set<TokenAnimationListener>();

export function emitTokenAnimation(request: TokenAnimationRequest): void {
  listeners.forEach((listener) => listener(request));
}

export function subscribeToTokenAnimations(listener: TokenAnimationListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
