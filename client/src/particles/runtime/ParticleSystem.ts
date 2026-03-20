import type { Application, Container, Ticker } from 'pixi.js';
import { Container as PixiContainer, Texture } from 'pixi.js';
import type { ParticlePreset, ParticleTrigger, ParticlePlayPayload, ParticleEventType } from '../editor/particleSchema';
import { ParticleEmitterInstance } from './ParticleEmitterInstance';
import { ParticlePool } from './ParticlePool';
import { loadParticleAtlas, type ParticleTextureAtlas } from './particleTextures';
import { buildBindingsForPresets, type ParticleBindingEntry } from './particleBindings';

export interface ParticleSystemConfig {
  app: Application;
  boardWidth: number;
  boardHeight: number;
  gridSizePx?: number;
  globalMaxParticles?: number;
  maxEmitters?: number;
  deltaClampMs?: number;
}

export interface ParticleSystemApi {
  trigger(trigger: ParticleTrigger): void;
  playPreset(presetId: string, payload?: ParticlePlayPayload): string | null;
  stopByToken(tokenId: string): void;
  moveByToken(tokenId: string, x: number, y: number): void;
  updateByToken(tokenId: string, overrides: Partial<ParticlePreset>): void;
  stopAll(): void;
}

const DEFAULT_GLOBAL_MAX = 900;
const DEFAULT_MAX_EMITTERS = 48;
const DEFAULT_DELTA_CLAMP = 33;
const DEFAULT_GRID_SIZE = 50;

export class ParticleSystem implements ParticleSystemApi {
  private readonly app: Application;
  private readonly emitters: ParticleEmitterInstance[] = [];
  private readonly emitterIndex: Map<string, ParticleEmitterInstance> = new Map();
  private readonly bindingThrottle: Map<string, number> = new Map();
  private readonly tokenPositions: Map<string, { x: number; y: number }> = new Map();
  private presets: Map<string, ParticlePreset> = new Map();
  private bindingsByEvent: Map<ParticleEventType, ParticleBindingEntry[]> = new Map();
  private textures: ParticleTextureAtlas | null = null;
  private pool: ParticlePool | null = null;
  private particleRoot: Container | null = null;
  private layers: Map<string, { normal: Container; add: Container; screen: Container }> = new Map();
  private tokenLayer: Container | null = null;
  private tickerFn: ((ticker: Ticker) => void) | null = null;
  private boardWidth: number;
  private boardHeight: number;
  private globalMaxParticles: number;
  private maxEmitters: number;
  private deltaClampMs: number;
  private gridSizePx: number;
  private isReady: boolean = false;

  constructor(config: ParticleSystemConfig) {
    this.app = config.app;
    this.boardWidth = config.boardWidth;
    this.boardHeight = config.boardHeight;
    this.globalMaxParticles = config.globalMaxParticles ?? DEFAULT_GLOBAL_MAX;
    this.maxEmitters = config.maxEmitters ?? DEFAULT_MAX_EMITTERS;
    this.deltaClampMs = config.deltaClampMs ?? DEFAULT_DELTA_CLAMP;
    this.gridSizePx = config.gridSizePx ?? DEFAULT_GRID_SIZE;
  }

  async init(): Promise<void> {
    this.textures = await loadParticleAtlas();
    const defaultTexture = this.textures.getTexture('soft_circle') ?? Texture.WHITE;
    this.pool = new ParticlePool(this.globalMaxParticles, defaultTexture);
    this.particleRoot = this.createRootContainer();
    this.app.stage.addChild(this.particleRoot);
    this.tickerFn = (ticker) => {
      const dtMs = Math.min(ticker.deltaMS, this.deltaClampMs);
      this.update(dtMs);
    };
    this.app.ticker.add(this.tickerFn);
    this.isReady = true;
  }

  destroy(): void {
    if (this.tickerFn) {
      this.app.ticker.remove(this.tickerFn);
    }
    this.stopAll();
    this.particleRoot?.parent?.removeChild(this.particleRoot);
    this.particleRoot?.destroy({ children: true });
    this.pool = null;
    this.textures = null;
    this.emitters.length = 0;
    this.emitterIndex.clear();
    this.isReady = false;
  }

  setPresets(presets: ParticlePreset[]): void {
    this.presets = new Map(presets.map((preset) => [preset.id, preset]));
    this.bindingsByEvent = buildBindingsForPresets(presets);

    if (this.textures) {
      for (let i = 0; i < presets.length; i++) {
        const textureName = presets[i].texture;
        if (!textureName) continue;
        const isCustomTexture =
          textureName.includes('/') ||
          textureName.includes('.') ||
          textureName.startsWith('http') ||
          textureName.startsWith('data:');
        if (isCustomTexture) {
          void this.textures.preloadTexture(textureName);
        }
      }
    }
  }

  setBounds(boardWidth: number, boardHeight: number): void {
    this.boardWidth = boardWidth;
    this.boardHeight = boardHeight;
  }

  setGridSize(gridSizePx: number): void {
    if (!Number.isFinite(gridSizePx) || gridSizePx <= 0) return;
    this.gridSizePx = gridSizePx;
  }

  /** Get the particle root container for attaching to zoom/pan containers */
  getParticleRoot(): Container | null {
    return this.particleRoot;
  }

  setTokenPositions(tokens: Array<{ id: string; x: number; y: number; size?: number }>, gridSize: number): void {
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const size = gridSize * (token.size || 1);
      this.tokenPositions.set(token.id, {
        x: token.x + size / 2,
        y: token.y + size / 2,
      });
    }
  }

  trigger(trigger: ParticleTrigger): void {
    const bindings = this.bindingsByEvent.get(trigger.event);
    if (!bindings || bindings.length === 0) return;
    const nowMs = performance.now();
    for (let i = 0; i < bindings.length; i++) {
      const binding = bindings[i];
      if (binding.throttleMs) {
        const last = this.bindingThrottle.get(binding.id) ?? 0;
        if (nowMs - last < binding.throttleMs) continue;
        this.bindingThrottle.set(binding.id, nowMs);
      }
      const payload = this.resolvePayload(trigger, binding.anchor);
      if (!payload) continue;
      this.playPreset(binding.presetId, payload);
    }
  }

  playPreset(presetId: string, payload?: ParticlePlayPayload): string | null {
    if (!this.isReady || !this.pool || !this.textures || this.emitters.length >= this.maxEmitters) return null;
    const preset = this.presets.get(presetId);
    if (!preset) return null;
    const layer = this.layers.get(preset.sortGroup);
    if (!layer) return null;
    const texture = this.textures.getTexture(preset.texture);
    if (
      texture === Texture.WHITE &&
      (preset.texture.includes('/') ||
        preset.texture.includes('.') ||
        preset.texture.startsWith('http') ||
        preset.texture.startsWith('data:'))
    ) {
      void this.textures.preloadTexture(preset.texture);
      return null;
    }
    const container = this.pickBlendContainer(layer, preset.blendMode);
    const id = `emitter_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const emitter = new ParticleEmitterInstance({
      id,
      preset,
      texture,
      pool: this.pool,
      container: new PixiContainer(),
      x: payload?.x ?? 0,
      y: payload?.y ?? 0,
      sourceTokenId: payload?.sourceTokenId,
      targetTokenId: payload?.targetTokenId,
      overrides: payload?.overrides,
      gridSizePx: this.gridSizePx,
    });
    emitter.applyPayload(payload);
    container.addChild(emitter.container);
    this.emitters.push(emitter);
    this.emitterIndex.set(id, emitter);
    return id;
  }

  stopByToken(tokenId: string): void {
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const emitter = this.emitters[i];
      if (emitter.sourceTokenId === tokenId || emitter.targetTokenId === tokenId) {
        emitter.stop(true);
        this.removeEmitter(i);
      }
    }
  }

  moveByToken(tokenId: string, x: number, y: number): void {
    for (let i = 0; i < this.emitters.length; i++) {
      const emitter = this.emitters[i];
      if (emitter.sourceTokenId === tokenId || emitter.targetTokenId === tokenId) {
        emitter.x = x;
        emitter.y = y;
      }
    }
  }

  updateByToken(tokenId: string, overrides: Partial<ParticlePreset>): void {
    if (!this.textures) return;
    for (let i = 0; i < this.emitters.length; i++) {
      const emitter = this.emitters[i];
      if (emitter.sourceTokenId === tokenId || emitter.targetTokenId === tokenId) {
        const texture = overrides.texture ? this.textures.getTexture(overrides.texture) : undefined;
        emitter.applyOverrides(overrides, texture);
      }
    }
  }

  stopAll(): void {
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const emitter = this.emitters[i];
      emitter.stop(true);
      this.removeEmitter(i);
    }
  }

  getRoot(): Container | null {
    return this.particleRoot;
  }

  attachTokenLayer(tokenLayer: Container): void {
    if (!this.particleRoot) return;
    if (this.tokenLayer && this.tokenLayer.parent) {
      this.tokenLayer.parent.removeChild(this.tokenLayer);
    }
    this.tokenLayer = tokenLayer;
    this.tokenLayer.zIndex = 10;
    this.particleRoot.addChild(this.tokenLayer);
  }

  private update(dtMs: number): void {
    if (!this.pool) return;
    const canSpawnGlobal = this.pool.getActiveCount() < this.globalMaxParticles;
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const emitter = this.emitters[i];
      if (emitter.attachMode === 'follow-token') {
        const followId = emitter.sourceTokenId ?? emitter.targetTokenId;
        const pos = followId ? this.tokenPositions.get(followId) : undefined;
        if (pos) {
          emitter.x = pos.x;
          emitter.y = pos.y;
        }
      }
      const canSpawn = canSpawnGlobal && this.isEmitterOnscreen(emitter);
      emitter.update(dtMs, canSpawn);
      if (emitter.isComplete()) {
        this.removeEmitter(i);
      }
    }
  }

  private isEmitterOnscreen(emitter: ParticleEmitterInstance): boolean {
    const margin = 120;
    return (
      emitter.x >= -margin &&
      emitter.y >= -margin &&
      emitter.x <= this.boardWidth + margin &&
      emitter.y <= this.boardHeight + margin
    );
  }

  private removeEmitter(index: number): void {
    const emitter = this.emitters[index];
    emitter.container.parent?.removeChild(emitter.container);
    this.emitterIndex.delete(emitter.id);
    const lastIndex = this.emitters.length - 1;
    if (index !== lastIndex) {
      this.emitters[index] = this.emitters[lastIndex];
    }
    this.emitters.pop();
  }

  private pickBlendContainer(
    layer: { normal: Container; add: Container; screen: Container },
    blendMode: ParticlePreset['blendMode']
  ): Container {
    if (blendMode === 'add') return layer.add;
    if (blendMode === 'screen') return layer.screen;
    return layer.normal;
  }

  private createRootContainer(): Container {
    const root = new PixiContainer();
    root.sortableChildren = true;
    root.name = 'particleRoot';
    root.zIndex = 10;
    const below = this.createLayerGroup('below-token');
    const at = this.createLayerGroup('at-token');
    const above = this.createLayerGroup('above-token');
    const overlay = this.createLayerGroup('overlay');
    below.container.zIndex = 5;
    at.container.zIndex = 11;
    above.container.zIndex = 15;
    overlay.container.zIndex = 18;
    root.addChild(below.container);
    root.addChild(at.container);
    root.addChild(above.container);
    root.addChild(overlay.container);
    this.layers.set('below-token', below.layers);
    this.layers.set('at-token', at.layers);
    this.layers.set('above-token', above.layers);
    this.layers.set('overlay', overlay.layers);
    return root;
  }

  private createLayerGroup(name: string): { container: Container; layers: { normal: Container; add: Container; screen: Container } } {
    const container = new PixiContainer();
    container.label = name;
    container.sortableChildren = true;
    const normal = new PixiContainer();
    const add = new PixiContainer();
    const screen = new PixiContainer();
    normal.name = `${name}-normal`;
    add.name = `${name}-add`;
    screen.name = `${name}-screen`;
    normal.sortableChildren = true;
    add.sortableChildren = true;
    screen.sortableChildren = true;
    container.addChild(normal);
    container.addChild(add);
    container.addChild(screen);
    return { container, layers: { normal, add, screen } };
  }

  private resolvePayload(trigger: ParticleTrigger, anchor: ParticleBindingEntry['anchor']): ParticlePlayPayload | null {
    if (anchor === 'impact') {
      if (trigger.x !== undefined && trigger.y !== undefined) {
        return { x: trigger.x, y: trigger.y, sourceTokenId: trigger.sourceTokenId, targetTokenId: trigger.targetTokenId };
      }
      const target = trigger.targetTokenId && this.tokenPositions.get(trigger.targetTokenId);
      if (target) return { x: target.x, y: target.y, targetTokenId: trigger.targetTokenId };
      return null;
    }
    if (anchor === 'target' && trigger.targetTokenId) {
      const pos = this.tokenPositions.get(trigger.targetTokenId);
      if (!pos) return null;
      return { x: pos.x, y: pos.y, targetTokenId: trigger.targetTokenId };
    }
    if (anchor === 'source' && trigger.sourceTokenId) {
      const pos = this.tokenPositions.get(trigger.sourceTokenId);
      if (!pos) return null;
      return { x: pos.x, y: pos.y, sourceTokenId: trigger.sourceTokenId };
    }
    if (anchor === 'path' && trigger.path && trigger.path.length > 0) {
      const last = trigger.path[trigger.path.length - 1];
      return { x: last.x, y: last.y, sourceTokenId: trigger.sourceTokenId };
    }
    if (trigger.x !== undefined && trigger.y !== undefined) {
      return { x: trigger.x, y: trigger.y };
    }
    return null;
  }
}

let systemSingleton: ParticleSystem | null = null;

export async function initParticleSystem(config: ParticleSystemConfig): Promise<ParticleSystem> {
  if (systemSingleton) return systemSingleton;
  systemSingleton = new ParticleSystem(config);
  await systemSingleton.init();
  return systemSingleton;
}

export function getParticleSystem(): ParticleSystem | null {
  return systemSingleton;
}

export function destroyParticleSystem(): void {
  if (!systemSingleton) return;
  systemSingleton.destroy();
  systemSingleton = null;
}
