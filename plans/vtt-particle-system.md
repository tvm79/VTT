# VTT Particle System & Editor (WebGL2 Architecture)

## Objective
Replace the existing particle systems in the VTT with a **new unified WebGL2-based particle system** built for **PixiJS v8**.  
The system must include:

- A runtime particle engine
- A preset-based particle editor
- Event bindings to gameplay actions
- Migration of all existing particle effects to the new system

This system is optimized for VTT gameplay effects, not cinematic VFX.

---

## Core Technology

Renderer:
- PixiJS v8
- WebGL2

Runtime Rendering Model:
- Batched `PIXI.Sprite` rendering
- Texture atlas based particle sprites
- Object pooling
- Emitter-based simulation

Do not:
- allocate particles per frame
- create/destroy textures at runtime
- attach particles to React state

The runtime must be fully imperative.

---

## Architecture

### Editor Layer (React)

Files:

```text
/client/src/particles/editor/
  ParticleEditorPanel.tsx
  ParticlePreview.ts
  particlePresetStore.ts
  particleSchema.ts
```

Responsibilities:
- Preset editing
- Preview rendering
- Import/export presets
- Event binding UI
- Saving presets

Editor preview must run the same runtime particle engine used in the game.

### Runtime Layer

Files:

```text
/client/src/particles/runtime/
  ParticleSystem.ts
  ParticleEmitterInstance.ts
  ParticlePool.ts
  particleEventBus.ts
  particleBindings.ts
  particleTextures.ts
```

Responsibilities:
- spawning emitters
- particle simulation
- sprite pooling
- event triggering
- offscreen culling
- layer management

---

## Rendering Model

Use batched Pixi sprites.

Create a root container:

```text
particleRoot
 ├── belowTokenLayer
 ├── atTokenLayer
 ├── aboveTokenLayer
 └── overlayLayer
```

Inside each layer split by blend mode:

```text
normalBlendContainer
addBlendContainer
screenBlendContainer
```

Particles must share textures to maintain batching.

---

## Particle Pool

Particles are reused.

Example struct:

```ts
interface LiveParticle {
  active: boolean
  sprite: PIXI.Sprite

  x: number
  y: number
  vx: number
  vy: number

  ageMs: number
  lifeMs: number

  startSize: number
  endSize: number

  startAlpha: number
  endAlpha: number

  startColor: number
  endColor: number

  rotation: number
  rotationSpeed: number

  motionStretch: boolean
  motionStretchFactor: number
}
```

Rules:
- pool particles
- pool sprites
- reuse arrays
- no allocations in update loop

---

## Preset Schema

```ts
type ParticleEventType =
  | "token_move"
  | "token_stop"
  | "token_attack"
  | "token_hit"
  | "token_crit"
  | "token_heal"
  | "token_die"
  | "spell_cast"
  | "spell_impact"
  | "buff_apply"
  | "debuff_apply"
  | "aura_tick"
  | "manual"

type SpawnShape =
  | "point"
  | "circle"
  | "cone"
  | "ring"

type EmissionMode =
  | "burst"
  | "continuous"

type BlendModeSimple =
  | "normal"
  | "add"
  | "screen"

type AttachMode =
  | "world"
  | "follow-token"
```

Preset:

```ts
interface ParticlePreset {
  id: string
  name: string
  category: "combat" | "movement" | "magic" | "status" | "utility"

  texture: string
  blendMode: BlendModeSimple
  emissionMode: EmissionMode

  maxParticles: number
  emitRate: number
  burstCount: number

  durationMs: number
  cooldownMs: number

  lifetimeMinMs: number
  lifetimeMaxMs: number

  startSize: number
  endSize: number

  startAlpha: number
  endAlpha: number

  startColor: string
  endColor: string

  speedMin: number
  speedMax: number

  directionDeg: number
  spreadDeg: number

  gravityX: number
  gravityY: number
  drag: number

  spawnShape: SpawnShape
  spawnRadius: number
  coneAngleDeg: number

  attachMode: AttachMode

  sortGroup:
    | "below-token"
    | "at-token"
    | "above-token"
    | "overlay"

  zIndex: number

  bindings: ParticleBinding[]
}
```

---

## Event Binding

Bindings connect presets to gameplay events.

```ts
interface ParticleBinding {
  id: string
  event: ParticleEventType
  anchor: "source" | "target" | "path" | "impact"
  throttleMs?: number
}
```

---

## Runtime Trigger API

Game systems must only interact through:

```ts
particleSystem.trigger(trigger)
particleSystem.playPreset(presetId, payload)
particleSystem.stopByToken(tokenId)
particleSystem.stopAll()
```

Trigger:

```ts
interface ParticleTrigger {
  event: ParticleEventType
  sourceTokenId?: string
  targetTokenId?: string
  x?: number
  y?: number
  path?: {x:number,y:number}[]
}
```

---

## Performance Limits

Default caps:

```text
globalMaxParticles = 900
maxEmitters = 48
deltaClampMs = 33
```

Rules:
- clamp delta
- skip spawn when offscreen
- emitter-level sorting only
- avoid filters
- use baked glow textures

---

## Starter Presets

Combat:
- Blood Hit
- Holy Heal
- Crit Spark
- Death Smoke

Movement:
- Dust Step
- Ghost Trail

Magic:
- Fire Cast
- Frost Impact
- Arcane Burst

Status:
- Bless Aura
- Burning Ember

---

## Editor Layout

Three columns.

Left:
- preset list
- search
- categories
- create/delete/import/export

Center:
- Pixi preview
- play
- stop
- test burst
- test loop
- debug stats

Right:
- inspector sections

Sections:

```text
General
Emission
Motion
Visual
Spawn
Runtime
Event Bindings
```

---

## Migration Requirement

All existing particle systems must be removed or replaced.

Steps:
1. Locate all existing particle implementations.
2. Replace them with calls to the new `particleSystem`.
3. Convert old particle configs into new `ParticlePreset`s.
4. Remove legacy particle rendering code.
5. Ensure all combat/spell/token events trigger the new system.

Legacy particle logic must not remain in the codebase.

---

## Implementation Phases

Phase 1
- schema
- particle pool
- emitter runtime
- preview renderer

Phase 2
- editor UI
- preset storage
- event binding

Phase 3
- migration of existing particles
- starter presets
- performance culling

---

## Tight Code AI Implementation Prompt

Use this prompt with your coding AI:

```text
Implement the system described in the attached file:

vtt-particle-system.md

CRITICAL REQUIREMENTS

1. Replace ALL existing particle systems in the project with this new architecture.

2. The new system must be:
   - PixiJS v8
   - WebGL2 renderer
   - pooled particle sprites
   - batched rendering
   - emitter-based

3. No React state inside the particle runtime.

4. All particle spawning must go through:

particleSystem.trigger()
particleSystem.playPreset()

5. Create the following modules:

client/src/particles/runtime
ParticleSystem.ts
ParticleEmitterInstance.ts
ParticlePool.ts
particleEventBus.ts
particleBindings.ts
particleTextures.ts

client/src/particles/editor
ParticleEditorPanel.tsx
ParticlePreview.ts
particlePresetStore.ts
particleSchema.ts

6. Migrate ALL existing particle effects.

Search the codebase for:
- particle
- emitter
- effects
- animation bursts
- spell effects

Convert these to new ParticlePresets.

7. Remove legacy particle rendering code.

8. Add default presets for:
- hit
- heal
- death
- spell impact
- movement trail
- aura

9. Add hard performance limits:
globalMaxParticles = 900
maxEmitters = 48

10. Ensure batching works by reusing textures from a particle atlas.

Do not allocate sprites every frame.
Use pooled PIXI.Sprite objects.

Goal:
A unified WebGL2 particle system with a built-in editor and preset-based event binding suitable for a VTT.
```
