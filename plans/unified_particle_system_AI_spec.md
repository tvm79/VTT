
# PixiJS Unified Particle System – AI Agent Implementation Spec

## Objective
Implement a **single particle system** replacing:
- WeatherEffects.tsx
- ParticleAura.tsx

The new system must support:
- weather effects
- token aura effects
- light atmospheric effects
- portals / spells / zones
- PixiJS v8 Canvas renderer
- PixiJS v8 WebGL renderer

Do NOT rely on shader‑only features. All baseline effects must work with the Canvas renderer.

---

# System Overview

Create a central runtime manager.

ParticleSystemManager
- textureCache
- particlePool
- emitters
- presets
- layers
- update(dt)
- syncFromGameState()

Emitter
- id
- kind (world | entity | light | zone)
- presetId
- sourceId
- x,y
- radius/size
- spawnRate
- maxParticles
- particles[]

Particle
- sprite
- age
- life
- x,y
- vx,vy
- alpha
- scale
- rotation
- tint
- custom0, custom1

---

# Required Stage Layers

Create Pixi containers in this order:

mapLayer
weatherParticleLayer
underTokenFxLayer
tokenLayer
overTokenFxLayer
lightFxLayer
uiLayer

All particle layers:
eventMode = 'none'

---

# File Structure

/particles/
 ParticleSystemManager.ts
 ParticlePool.ts
 ParticleTextures.ts
 ParticlePresets.ts
 ParticleTypes.ts
 ParticleLayers.ts

---

# Texture Cache

Generate and cache textures using Canvas2D.

Required textures:

soft-circle  
smoke-blob  
spark  
ember  
ray-gradient  
rune-mark  
light-radial-gradient  

Never regenerate textures per frame.

---

# Particle Pool

Particles and sprites must be reused.

Required pool API:

acquireParticle()
releaseParticle()

acquireParticleSprite(textureKey)
releaseParticleSprite(sprite)

Never allocate particles inside the update loop.

---

# Update Loop

Single ticker loop.

app.ticker.add((ticker)=>{
 const dt = ticker.deltaMS / 1000
 particleSystem.update(dt)
})

Update steps:

1. update emitter transforms
2. spawn particles
3. update particle physics
4. apply sprite transforms
5. recycle expired particles

---

# Preset System

Implement preset families.

weatherPresets
auraPresets
lightFxPresets
zoneFxPresets

Preset schema:

{
 id,
 family,
 layerId,
 textureKey,
 maxParticles,
 spawnRate,
 lifeMin,
 lifeMax,
 scaleMin,
 scaleMax,
 alphaMin,
 alphaMax,
 initParticle(p,e),
 updateParticle(p,e,dt,ctx)
}

---

# Required Weather Presets

lightRain
heavyRain
snow
blizzard
fog
clouds
embers
fireflies
sparkles
ambientDust

---

# Required Aura Presets

flameAura
smokeAura
frostAura
electricAura
holyAura
poisonAura
sparkleAura

Behavior examples:

flameAura
- spawn near token
- rise upward
- warm color
- alpha fade

smokeAura
- slow rise
- scale increase
- low alpha

frostAura
- slow outward drift
- cold tint

electricAura
- short life
- jitter motion

---

# Required Light FX Presets

torchLightFx
fairyLightFx
arcaneLightFx
cursedLightFx
moonbeamDustFx

torchLightFx
- warm particles
- slight upward velocity
- flicker alpha

fairyLightFx
- orbit around light
- alpha pulse

arcaneLightFx
- slow swirl
- purple tint

---

# Required Zone FX Presets

portalSwirl
runeCircle
spellAOE
summoningMist
fogEdgeMist
godRayDust

---

# Atmospheric Effects

Implement using particles only.

Fairy Lights
- orbiting particles around light

Torch Motes
- rising ember particles

Swirling Magic Clouds
- circular motion particles

Portal Swirl
- spiral orbit motion

---

# Cinematic Effects

## God Rays (Canvas Safe)

Use stretched gradient sprites.

Structure:

RayContainer
- 2..6 ray sprites
- alpha pulse
- optional dust emitter

Do NOT use shaders.

---

## Fog of War Mist

Use large fog sprites drifting near fog edges.

Properties:
- low alpha
- slow drift
- large scale

---

## Spell AOE Energy

Structure:

AOEContainer
- ring sprite
- orbiting particles
- rune accents

Particles move tangentially around circle.

---

# Example Preset (Fairy Light)

initParticle
- choose random orbit angle
- orbit radius
- pale yellow tint

updateParticle
- rotate around center
- alpha pulse

---

# Performance Rules

Global particle cap: 1200

Recommended caps:

weather: 300
aura emitter: 12–40
light emitter: 12–30
zone emitter: 20–60

Rules:

- avoid PIXI.Graphics particles
- avoid per-frame allocations
- reuse sprites
- reuse textures
- update via delta time

---

# Renderer Compatibility

Canvas-safe features:

sprites
textures
alpha
scale
rotation
tint
basic blend modes

Avoid:

BlurFilter
displacement filters
shader noise
postprocessing pipelines

Optional future WebGL upgrades may add shader effects.

---

# Data Model Integration

Allow multiple particle effects per object.

Token example:

token.fx = [
 { preset:'flameAura' },
 { preset:'sparkleAura' }
]

Light example:

light.fx = [
 { preset:'torchLightFx' }
]

Board example:

board.weatherFx = [
 { preset:'lightRain' },
 { preset:'fog' }
]

Zone example:

zone.fx = [
 { preset:'spellAOE', radius:180 },
 { preset:'summoningMist' }
]

---

# Acceptance Criteria

Implementation complete when:

1. WeatherEffects.tsx removed
2. ParticleAura.tsx removed
3. New particle manager operational
4. Canvas renderer works
5. WebGL renderer works
6. Weather effects functional
7. Token aura effects functional
8. Light FX functional
9. Portal / spell FX functional
10. No particle layers intercept pointer events

