import type { Container, Sprite, Ticker } from 'pixi.js';
import {
  clamp01,
  dampedSine,
  easeInOutCubic,
  easeInOutQuad,
  easeOutBack,
  easeOutCubic,
  easeOutQuad,
  lerp,
  type EasingFunction,
} from './easing';
import type { TokenAnimationRequest, TokenAnimationType } from './tokenAnimationEvents';
import type { TweenAnimationSettings, TweenEasingType } from '../store/gameStore';

export const TOKEN_ANIMATION_DEFAULTS = {
  moveMin: 160,
  moveMax: 420,
  attack: 180,
  damage: 140,
  heal: 220,
  miss: 160,
  downed: 260,
  selectPulse: 900,
} as const;

type TokenAnimationChannel = 'move' | 'action' | 'effect' | 'ambient';

interface TokenAnimationDisplay {
  root: Container;
  effectContainer: Container;
  sprite: Sprite;
}

interface TokenVisualBaseState {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
  tint: number;
  width: number;
  height: number;
}

interface TokenComputedState {
  x: number;
  y: number;
  effectX: number;
  effectY: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
  tint: number;
}

interface ActiveAnimation {
  id: number;
  request: TokenAnimationRequest;
  channel: TokenAnimationChannel;
  startedAt: number;
  duration: number;
  from: { x: number; y: number } | null;
  to: { x: number; y: number } | null;
  resolve: () => void;
}

interface QueuedAnimation {
  id: number;
  request: TokenAnimationRequest;
  resolve: () => void;
}

interface TokenAnimationState {
  display: TokenAnimationDisplay | null;
  base: TokenVisualBaseState;
  queue: QueuedAnimation[];
  active: Partial<Record<TokenAnimationChannel, ActiveAnimation>>;
}

const DEFAULT_BASE_STATE: TokenVisualBaseState = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  alpha: 1,
  tint: 0xffffff,
  width: 1,
  height: 1,
};

function getChannel(type: TokenAnimationType): TokenAnimationChannel {
  switch (type) {
    case 'move':
      return 'move';
    case 'attack':
    case 'miss':
      return 'action';
    case 'select':
      return 'ambient';
    case 'damage':
    case 'heal':
    case 'downed':
    default:
      return 'effect';
  }
}

function mixTint(baseTint: number, flashTint: number, amount: number): number {
  const clamped = clamp01(amount);
  const baseR = (baseTint >> 16) & 0xff;
  const baseG = (baseTint >> 8) & 0xff;
  const baseB = baseTint & 0xff;
  const flashR = (flashTint >> 16) & 0xff;
  const flashG = (flashTint >> 8) & 0xff;
  const flashB = flashTint & 0xff;

  const r = Math.round(lerp(baseR, flashR, clamped));
  const g = Math.round(lerp(baseG, flashG, clamped));
  const b = Math.round(lerp(baseB, flashB, clamped));

  return (r << 16) | (g << 8) | b;
}

export class TokenAnimationManager {
  private readonly tokens = new Map<string, TokenAnimationState>();
  private readonly ticker: Ticker;
  private nextAnimationId = 1;
  private readonly boundUpdate: (ticker: Ticker) => void;
  private customSettings: TweenAnimationSettings | null = null;

  // Mapping from easing type names to easing functions
  private static readonly easingFunctions: Record<TweenEasingType, EasingFunction> = {
    easeOutQuad,
    easeInOutQuad,
    easeInOutCubic,
    easeOutCubic,
    easeOutBack,
  };

  constructor(ticker: Ticker) {
    this.ticker = ticker;
    this.boundUpdate = () => this.update(performance.now());
    this.ticker.add(this.boundUpdate);
  }

  // Update custom settings
  setSettings(settings: TweenAnimationSettings): void {
    this.customSettings = settings;
  }

  // Get current settings or defaults
  private getSettings(): TweenAnimationSettings {
    if (this.customSettings) {
      return this.customSettings;
    }
    // Return defaults with easing functions
    return {
      moveMin: TOKEN_ANIMATION_DEFAULTS.moveMin,
      moveMax: TOKEN_ANIMATION_DEFAULTS.moveMax,
      attack: TOKEN_ANIMATION_DEFAULTS.attack,
      damage: TOKEN_ANIMATION_DEFAULTS.damage,
      heal: TOKEN_ANIMATION_DEFAULTS.heal,
      miss: TOKEN_ANIMATION_DEFAULTS.miss,
      downed: TOKEN_ANIMATION_DEFAULTS.downed,
      selectPulse: TOKEN_ANIMATION_DEFAULTS.selectPulse,
      moveEasing: 'easeInOutCubic',
      attackEasing: 'easeOutCubic',
      damageEasing: 'easeOutCubic',
      healEasing: 'easeOutQuad',
      missEasing: 'easeOutQuad',
      downedEasing: 'easeOutQuad',
      selectEasing: 'easeOutBack',
    };
  }

  // Get easing function by type
  private getEasing(type: TweenEasingType): EasingFunction {
    return TokenAnimationManager.easingFunctions[type] ?? easeInOutCubic;
  }

  destroy(): void {
    this.ticker.remove(this.boundUpdate);
    this.clearAllTokenAnimations();
    this.tokens.clear();
  }

  registerTokenDisplay(tokenId: string, display: TokenAnimationDisplay): void {
    const state = this.getOrCreateState(tokenId);
    state.display = display;
    this.applyStateToDisplay(state, this.computeState(state, performance.now()));
  }

  unregisterTokenDisplay(tokenId: string): void {
    const state = this.tokens.get(tokenId);
    if (!state) return;
    state.display = null;
    this.cancelTokenAnimations(tokenId);
  }

  syncTokenBaseState(tokenId: string, partial: Partial<TokenVisualBaseState>): void {
    const state = this.getOrCreateState(tokenId);
    state.base = { ...state.base, ...partial };
    if (!state.active.move) {
      this.applyStateToDisplay(state, this.computeState(state, performance.now()));
    }
  }

  queueTokenAnimation(request: TokenAnimationRequest): Promise<void> {
    const state = this.getOrCreateState(request.tokenId);
    return new Promise<void>((resolve) => {
      if (request.type === 'move') {
        state.queue = state.queue.filter((queued) => queued.request.type !== 'move');
      }
      state.queue.push({
        id: this.nextAnimationId++,
        request,
        resolve,
      });
      this.startQueuedAnimations(state, performance.now());
    });
  }

  playTokenAnimation(request: TokenAnimationRequest): Promise<void> {
    const state = this.getOrCreateState(request.tokenId);
    return new Promise<void>((resolve) => {
      const channel = getChannel(request.type);
      this.cancelChannel(state, channel);
      if (request.type === 'move') {
        state.queue = state.queue.filter((queued) => getChannel(queued.request.type) !== 'move');
      }
      this.startAnimation(state, {
        id: this.nextAnimationId++,
        request,
        resolve,
      }, performance.now());
    });
  }

  cancelTokenAnimations(tokenId: string): void {
    const state = this.tokens.get(tokenId);
    if (!state) return;
    state.queue.forEach((queued) => queued.resolve());
    state.queue = [];
    (Object.keys(state.active) as TokenAnimationChannel[]).forEach((channel) => this.cancelChannel(state, channel));
    this.applyStateToDisplay(state, this.computeState(state, performance.now()));
  }

  clearAllTokenAnimations(): void {
    this.tokens.forEach((_state, tokenId) => this.cancelTokenAnimations(tokenId));
  }

  private getOrCreateState(tokenId: string): TokenAnimationState {
    const existing = this.tokens.get(tokenId);
    if (existing) return existing;

    const created: TokenAnimationState = {
      display: null,
      base: { ...DEFAULT_BASE_STATE },
      queue: [],
      active: {},
    };
    this.tokens.set(tokenId, created);
    return created;
  }

  private startQueuedAnimations(state: TokenAnimationState, now: number): void {
    let started = true;
    while (started) {
      started = false;
      for (let index = 0; index < state.queue.length; index += 1) {
        const queued = state.queue[index];
        const channel = getChannel(queued.request.type);
        if (state.active[channel]) {
          continue;
        }
        state.queue.splice(index, 1);
        this.startAnimation(state, queued, now);
        started = true;
        break;
      }
    }
  }

  private startAnimation(state: TokenAnimationState, queued: QueuedAnimation, now: number): void {
    const channel = getChannel(queued.request.type);
    const active: ActiveAnimation = {
      id: queued.id,
      request: queued.request,
      channel,
      startedAt: now,
      duration: this.resolveDuration(state, queued.request),
      from: queued.request.from ?? this.resolveFromPosition(state, queued.request.type),
      to: queued.request.to ?? null,
      resolve: queued.resolve,
    };

    state.active[channel] = active;
    this.applyStateToDisplay(state, this.computeState(state, now));
  }

  private resolveDuration(state: TokenAnimationState, request: TokenAnimationRequest): number {
    if (typeof request.duration === 'number' && request.duration > 0) {
      return request.duration;
    }

    const settings = this.getSettings();

    switch (request.type) {
      case 'move': {
        const from = request.from ?? this.resolveFromPosition(state, request.type) ?? { x: state.base.x, y: state.base.y };
        const to = request.to ?? { x: state.base.x, y: state.base.y };
        const distance = Math.hypot(to.x - from.x, to.y - from.y);
        return Math.max(
          settings.moveMin,
          Math.min(settings.moveMax, 140 + distance * 0.45),
        );
      }
      case 'attack':
        return settings.attack;
      case 'damage':
        return settings.damage;
      case 'heal':
        return settings.heal;
      case 'miss':
        return settings.miss;
      case 'downed':
        return settings.downed;
      case 'select':
      default:
        return settings.selectPulse;
    }
  }

  private resolveFromPosition(state: TokenAnimationState, type: TokenAnimationType): { x: number; y: number } | null {
    if (type !== 'move') {
      return null;
    }
    const current = this.computeState(state, performance.now());
    return { x: current.x, y: current.y };
  }

  private cancelChannel(state: TokenAnimationState, channel: TokenAnimationChannel): void {
    const active = state.active[channel];
    if (!active) return;
    delete state.active[channel];
    active.resolve();
  }

  private update(now: number): void {
    this.tokens.forEach((state) => {
      let didFinishAnimation = false;
      (Object.keys(state.active) as TokenAnimationChannel[]).forEach((channel) => {
        const active = state.active[channel];
        if (!active) return;
        const progress = clamp01((now - active.startedAt) / active.duration);
        if (progress >= 1) {
          delete state.active[channel];
          active.resolve();
          didFinishAnimation = true;
        }
      });

      if (didFinishAnimation) {
        this.startQueuedAnimations(state, now);
      }

      this.applyStateToDisplay(state, this.computeState(state, now));
    });
  }

  private computeState(state: TokenAnimationState, now: number): TokenComputedState {
    const computed: TokenComputedState = {
      x: state.base.x,
      y: state.base.y,
      effectX: 0,
      effectY: 0,
      scaleX: state.base.scaleX,
      scaleY: state.base.scaleY,
      alpha: state.base.alpha,
      tint: state.base.tint,
    };

    const settings = this.getSettings();

    (Object.values(state.active) as ActiveAnimation[]).forEach((active) => {
      const progress = clamp01((now - active.startedAt) / active.duration);
      switch (active.request.type) {
        case 'move': {
          const from = active.from ?? { x: state.base.x, y: state.base.y };
          const to = active.to ?? { x: state.base.x, y: state.base.y };
          const eased = this.getEasing(settings.moveEasing)(progress);
          computed.x = lerp(from.x, to.x, eased);
          computed.y = lerp(from.y, to.y, eased);
          break;
        }
        case 'attack': {
          const target = active.request.to ?? active.request.payload?.target;
          const targetPosition = isPointLike(target) ? target : active.to;
          if (!targetPosition) break;
          const origin = active.from ?? { x: state.base.x, y: state.base.y };
          const dx = targetPosition.x - origin.x;
          const dy = targetPosition.y - origin.y;
          const distance = Math.max(1, Math.hypot(dx, dy));
          const lungeDistance = Math.min(Math.max(state.base.width * 0.18, 12), 24);
          const split = 0.45;
          const eased = progress < split
            ? this.getEasing(settings.attackEasing)(progress / split)
            : 1 - this.getEasing(settings.attackEasing)((progress - split) / (1 - split));
          computed.effectX += (dx / distance) * lungeDistance * eased;
          computed.effectY += (dy / distance) * lungeDistance * eased;
          break;
        }
        case 'damage': {
          const amplitude = Math.max(5, Math.min(12, state.base.width * 0.08));
          const recoil = -Math.abs(dampedSine(progress, 2.5, 3.6)) * amplitude * 0.45;
          computed.effectX += dampedSine(progress, 5.5, 4.4) * amplitude;
          computed.effectY += recoil;
          const punch = 1 + Math.max(0, dampedSine(progress, 2.2, 5.2)) * 0.08;
          computed.scaleX *= punch;
          computed.scaleY *= Math.max(0.92, 1 - Math.max(0, dampedSine(progress, 2.2, 5.2)) * 0.04);
          computed.tint = mixTint(computed.tint, 0xff5a5a, (1 - progress) * 0.65);
          break;
        }
        case 'heal': {
          const bob = Math.sin(progress * Math.PI) * Math.max(6, state.base.height * 0.08);
          const pulse = 1 + Math.sin(progress * Math.PI) * 0.08;
          computed.effectY -= bob;
          computed.scaleX *= pulse;
          computed.scaleY *= pulse;
          computed.tint = mixTint(computed.tint, 0x64f0a8, Math.sin(progress * Math.PI) * 0.45);
          break;
        }
        case 'miss': {
          const sway = Math.sin(progress * Math.PI * 2) * Math.max(4, state.base.width * 0.05);
          computed.effectX += sway * (1 - progress);
          break;
        }
        case 'downed': {
          const settle = this.getEasing(settings.downedEasing)(progress);
          computed.effectY += 4 * settle;
          computed.scaleX *= 1 - settle * 0.05;
          computed.scaleY *= 1 - settle * 0.05;
          computed.alpha *= 1 - settle * 0.18;
          computed.tint = mixTint(computed.tint, 0x666666, settle * 0.5);
          break;
        }
        case 'select': {
          const wave = this.getEasing(settings.selectEasing)(Math.sin(progress * Math.PI));
          const pulse = 1 + Math.max(0, wave - 1) * 0.08;
          computed.scaleX *= pulse;
          computed.scaleY *= pulse;
          break;
        }
      }
    });

    return computed;
  }

  private applyStateToDisplay(state: TokenAnimationState, computed: TokenComputedState): void {
    const display = state.display;
    if (!display || !display.root || !display.effectContainer || !display.sprite) return;

    //console.log('[ANIMATION] applyStateToDisplay - tokenId:', state.tokenId, 'x:', computed.x, 'y:', computed.y);
    display.root.position.set(computed.x, computed.y);
    display.effectContainer.position.set(computed.effectX, computed.effectY);
    display.effectContainer.scale.set(computed.scaleX, computed.scaleY);
    display.effectContainer.alpha = computed.alpha;
    display.sprite.tint = computed.tint;
  }
}

function isPointLike(value: unknown): value is { x: number; y: number } {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.x === 'number' && typeof record.y === 'number';
}
