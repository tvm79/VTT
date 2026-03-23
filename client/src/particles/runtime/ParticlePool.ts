import type { Sprite, Texture } from 'pixi.js';
import { Sprite as PixiSprite } from 'pixi.js';

export interface LiveParticle {
  active: boolean;
  sprite: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ageMs: number;
  lifeMs: number;
  startSize: number;
  endSize: number;
  startAlpha: number;
  endAlpha: number;
  rotation: number;
  rotationSpeed: number;
  startR: number;
  startG: number;
  startB: number;
  endR: number;
  endG: number;
  endB: number;
  motionStretch: boolean;
  motionStretchFactor: number;
  velocityCurveLast: number;
}

export class ParticlePool {
  private readonly freeParticles: LiveParticle[] = [];
  private readonly freeSprites: Sprite[] = [];
  private activeCount: number = 0;
  private readonly maxParticles: number;

  constructor(maxParticles: number, defaultTexture: Texture) {
    this.maxParticles = maxParticles;
    for (let i = 0; i < maxParticles; i++) {
      const sprite = new PixiSprite(defaultTexture);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      sprite.eventMode = 'none';
      this.freeSprites.push(sprite);
      this.freeParticles.push({
        active: false,
        sprite,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        ageMs: 0,
        lifeMs: 0,
        startSize: 1,
        endSize: 1,
        startAlpha: 1,
        endAlpha: 1,
        rotation: 0,
        rotationSpeed: 0,
        startR: 255,
        startG: 255,
        startB: 255,
        endR: 255,
        endG: 255,
        endB: 255,
        motionStretch: false,
        motionStretchFactor: 1,
        velocityCurveLast: 1,
      });
    }
  }

  acquireParticle(): LiveParticle | null {
    if (this.freeParticles.length === 0) return null;
    const particle = this.freeParticles.pop() as LiveParticle;
    particle.active = true;
    this.activeCount += 1;
    return particle;
  }

  releaseParticle(particle: LiveParticle): void {
    particle.active = false;
    const sprite = particle.sprite;
    sprite.visible = false;
    if (sprite.parent) {
      sprite.parent.removeChild(sprite);
    }
    this.activeCount = Math.max(0, this.activeCount - 1);
    this.freeParticles.push(particle);
  }

  acquireSprite(): Sprite | null {
    if (this.freeSprites.length === 0) return null;
    return this.freeSprites.pop() as Sprite;
  }

  releaseSprite(sprite: Sprite): void {
    sprite.visible = false;
    if (sprite.parent) {
      sprite.parent.removeChild(sprite);
    }
    this.freeSprites.push(sprite);
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  getCapacity(): number {
    return this.maxParticles;
  }
}
