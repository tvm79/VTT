
# Font Awesome → PIXI Particle Texture Fix

## Problem
PIXI cannot reliably use raw SVG data URIs as textures, especially in particle systems.  
This results in fallback to `Texture.WHITE`.

## Solution
Convert SVG → base64 → Image → PIXI.Texture, and ensure textures are loaded before use.

## Implementation

### 1. SVG → Texture (async)
```
function createTextureFromSVG(svgString) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    const encoded = 'data:image/svg+xml;base64,' + btoa(svgString);
    img.src = encoded;

    img.onload = () => {
      const texture = PIXI.Texture.from(img);
      resolve(texture);
    };

    img.onerror = reject;
  });
}
```

### 2. Texture Cache
```
const textureCache = new Map();

async function getParticleTexture(key, svgString) {
  if (textureCache.has(key)) return textureCache.get(key);

  const texture = await createTextureFromSVG(svgString);
  textureCache.set(key, texture);

  return texture;
}
```

### 3. Usage (IMPORTANT: await before emitter init)
```
const texture = await getParticleTexture('shield', shieldSVG);

const emitter = new PIXI.particles.Emitter(container, {
  textures: [texture],
  // other config...
});
```

## Requirements
- SVG must include width + height
- Always use base64 encoding (NOT raw URI)
- Never create textures per particle
- Preload textures before creating emitters
