# PixiJS Canvas-Compatible Lighting Replacement

## Objective
Replace the current multi-circle + BlurFilter light rendering with a **radial gradient texture light** that works with both:

- PixiJS v8 WebGL renderer
- PixiJS v8 Canvas renderer

## Reason

Pixi filters (like `BlurFilter`) are shader-based effects that render to intermediate framebuffers through the FilterSystem pipeline. This pipeline relies on GPU rendering and is not reliably supported in the Canvas renderer.

Instead we generate a **pre-blurred radial gradient texture using Canvas2D**, then render it as a sprite.

Benefits:

- Works in Canvas renderer
- Works in WebGL renderer
- Fewer draw calls
- Smoother falloff
- No filters required

---

# Step 1 — Add helper function

Add this once outside the render loop.

```ts
const lightTextureCache = new Map<string, PIXI.Texture>();

function getLightTexture(radius: number, color: number) {
  const key = `${radius}_${color}`;

  if (lightTextureCache.has(key)) {
    return lightTextureCache.get(key)!;
  }

  const size = radius * 2;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d")!;

  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;

  const gradient = ctx.createRadialGradient(
    radius,
    radius,
    0,
    radius,
    radius,
    radius
  );

  gradient.addColorStop(0.0, `rgba(${r},${g},${b},1)`);
  gradient.addColorStop(0.2, `rgba(${r},${g},${b},0.7)`);
  gradient.addColorStop(0.45, `rgba(${r},${g},${b},0.35)`);
  gradient.addColorStop(0.75, `rgba(${r},${g},${b},0.12)`);
  gradient.addColorStop(1.0, `rgba(${r},${g},${b},0)`);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = PIXI.Texture.from(canvas);

  lightTextureCache.set(key, texture);

  return texture;
}