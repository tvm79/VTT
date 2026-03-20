# Fix Light Ring Duplication on Zoom

## Problem Summary

The innermost light radius circle visually duplicates and multiplies when zooming in/out. This creates stacked yellow rings at the light origin instead of a single inner boundary. The issue is specifically with the inner radius (dimRadius) rendering.

## Investigation Findings

### 1. Light Rendering Architecture

The light rendering is handled by:
- **[`useLightRenderer.ts`](client/src/components/lighting/useLightRenderer.ts)** - Main hook managing PIXI light containers and sprites
- **[`LightTextureGenerator.ts`](client/src/components/lighting/LightTextureGenerator.ts)** - Generates radial gradient textures for lights
- **[`LightIconsOverlay.tsx`](client/src/components/lighting/LightIconsOverlay.tsx)** - Renders selection rings and radius indicators for selected lights

### 2. Root Cause Analysis

**Issue 1: dimRadius Not Used in Texture Generation**
- In [`useLightRenderer.ts:219`](client/src/components/lighting/useLightRenderer.ts:219), `dimRadius` is extracted but never used:
  ```typescript
  const innerRadius = dimRadius || 0;  // Extracted but not used!
  ```

**Issue 2: Texture Cache Key Missing dimRadius**
- In [`LightTextureGenerator.ts:22`](client/src/components/lighting/LightTextureGenerator.ts:22):
  ```typescript
  const key = `light_${radius}_${color}`;
  ```
  The cache key doesn't include `dimRadius`, so different inner radii return the same cached texture.

**Issue 3: Potential Geometry Accumulation**
- If the container isn't properly cleared before redrawing, or if the zoom triggers additional render passes, circles could accumulate.

### 3. Current Texture Generation

The [`getLightTexture()`](client/src/components/lighting/LightTextureGenerator.ts:21) function creates a radial gradient from center (0) to outer radius with color stops at fixed positions (0.0, 0.2, 0.45, 0.75, 1.0). It doesn't account for an inner radius where light should be full brightness.

## Fix Plan

### Step 1: Fix LightTextureGenerator to Handle dimRadius

**File:** [`client/src/components/lighting/LightTextureGenerator.ts`](client/src/components/lighting/LightTextureGenerator.ts)

**Changes:**
1. Update cache key to include `dimRadius`:
   ```typescript
   const key = `light_${radius}_${color}_${dimRadius || 0}`;
   ```

2. Modify gradient to create solid inner circle then gradient falloff:
   - If dimRadius > 0: Draw solid inner circle, then gradient from dimRadius to outerRadius
   - Use `createRadialGradient` with inner radius parameter

### Step 2: Update useLightRenderer to Pass dimRadius

**File:** [`client/src/components/lighting/useLightRenderer.ts`](client/src/components/lighting/useLightRenderer.ts)

**Changes:**
1. Pass `dimRadius` to texture generation functions
2. Ensure `container.removeChildren()` is called (already present at line 185)

### Step 3: Add Debug Logging (Optional)

Add console.log in texture generation to verify ring count:
```typescript
console.log("Generating ring", radius, "inner:", dimRadius);
```

## Implementation Sequence

1. **Modify LightTextureGenerator.ts** - Update cache key and gradient generation to properly support dimRadius
2. **Modify useLightRenderer.ts** - Pass dimRadius to texture generation functions
3. **Test** - Verify inner ring renders correctly and doesn't duplicate on zoom

## Expected Behavior After Fix

- Inner radius circle (dimRadius) renders exactly once
- Zooming only changes camera scale, not regenerates additional rings
- Ring count remains constant regardless of zoom level
- Different dimRadius values produce different textures (proper caching)