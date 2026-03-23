# Token Visual Effects Implementation Plan

## Overview
Add visual effects (filters, tint/color, mesh effects) to the Enchantment panel in VTT, accessible from the token wheel (right-click on token).

## Current Architecture

### Token Wheel (Right-Click Menu)
- **File**: [`client/src/components/TokenActionButtons.tsx`](../client/src/components/TokenActionButtons.tsx)
- Already has "Enchantment" button (id: 'aura') with icon `faWandMagicSparkles`

### Enchantment Panel
- **File**: [`client/src/components/TokenPanel.tsx`](../client/src/components/TokenPanel.tsx) (lines 594-850)
- Component: `AuraSettingsModal`
- Currently handles: aura presets, aura color, radius, opacity, pulse, particles

### Token Rendering
- **File**: [`client/src/components/GameBoard.tsx`](../client/src/components/GameBoard.tsx)
- Uses PixiJS v8
- Token structure has: `sprite`, `auraContainer`, `effectContainer`, `root` container
- Already uses: `tint`, `alpha`, `blendMode`, `BlurFilter` (for shadows)

## Implementation Plan

### 1. Add Token Effect Properties to Store
Extend token `properties` with new fields:
```typescript
// Filter effects
tokenEffectFilter: 'none' | 'blur' | 'glow' | 'displacement' | 'noise' | 'colorMatrix'
tokenFilterIntensity: number // 0-100

// Tint & Color
tokenTintColor: string // hex color
tokenTintEnabled: boolean
tokenAlpha: number // 0-100

// Mesh effects  
tokenMeshEffect: 'none' | 'wave' | 'twist' | 'bulge'
tokenMeshIntensity: number // 0-100
```

### 2. Extend AuraSettingsModal (TokenPanel.tsx)
Add new UI sections to the Enchantment panel:

#### Section A: Filters
- **Filter Type Dropdown**: None, Blur, Glow (ColorMatrix), Displacement, Noise
- **Intensity Slider**: 0-100%
- **Filter Presets**: Ethereal (blur), Fire Glow, Ice Shield, Shadow

#### Section B: Tint & Color
- **Enable Tint Toggle**: ON/OFF
- **Tint Color Picker**: Color input
- **Alpha Slider**: 0-100%
- **Blend Mode**: Normal, Add, Multiply, Screen, Overlay

#### Section C: Mesh Effects
- **Mesh Type Dropdown**: None, Wave, Twist, Bulge
- **Intensity Slider**: 0-100%
- **Speed**: Animation speed for dynamic effects

### 3. Implement Filter Application (GameBoard.tsx)
Create a helper function to apply filters to token sprite:
```typescript
function applyTokenFilters(sprite: PIXI.Sprite, filterType: string, intensity: number) {
  const filters: PIXI.Filter[] = [];
  
  switch (filterType) {
    case 'blur':
      filters.push(new BlurFilter({ strength: intensity / 20 }));
      break;
    case 'glow':
      const colorMatrix = new ColorMatrixFilter();
      colorMatrix.brightness(1 + intensity / 100, false);
      filters.push(colorMatrix);
      break;
    case 'noise':
      filters.push(new NoiseFilter({ noise: intensity / 100 }));
      break;
    // ... more filters
  }
  
  sprite.filters = filters;
}
```

### 4. Implement Mesh Effects (GameBoard.tsx)
Create mesh-based token deformation:
```typescript
function applyMeshEffect(sprite: PIXI.Sprite, meshType: string, intensity: number) {
  if (meshType === 'none') {
    // Reset to regular sprite
    return;
  }
  
  // Convert sprite to mesh with vertex manipulation
  // Use Mesh with custom vertex shader for effects
}
```

### 5. Update Token Rendering Loop
In the token update logic (GameBoard.tsx ~line 3567), add:
```typescript
// Apply visual effects from token properties
const effectProps = (token.properties || {}) as Record<string, unknown>;

// Apply tint
if (effectProps.tokenTintEnabled) {
  sprite.tint = parseInt(String(effectProps.tokenTintColor || '#ffffff').replace('#', ''), 16);
}
sprite.alpha = (effectProps.tokenAlpha ?? 100) / 100;

// Apply filters
const filterType = effectProps.tokenEffectFilter as string || 'none';
const filterIntensity = Number(effectProps.tokenFilterIntensity) || 0;
if (filterType !== 'none') {
  applyTokenFilters(sprite, filterType, filterIntensity);
}
```

## UI Mockup

```
┌─────────────────────────────────────┐
│  Enchantment Aura                   │
├─────────────────────────────────────┤
│  [Existing Aura/Particle Controls]  │
├─────────────────────────────────────┤
│  ▼ FILTERS                          │
│  Filter: [Dropdown: None ▼]        │
│  Intensity: [====●======] 50%       │
│  Presets: [Ethereal] [Fire] [Ice]   │
├─────────────────────────────────────┤
│  ▼ TINT & COLOR                     │
│  Enable Tint: [ON] [OFF]           │
│  Tint Color: [■ #ff8800]            │
│  Alpha: [========●===] 80%          │
│  Blend: [Dropdown: Normal ▼]       │
├─────────────────────────────────────┤
│  ▼ MESH EFFECTS                     │
│  Effect: [Dropdown: None ▼]        │
│  Intensity: [====●======] 50%       │
│  Speed: [====●======] 50%           │
└─────────────────────────────────────┘
```

## File Changes Summary

| File | Changes |
|------|---------|
| `client/src/components/TokenPanel.tsx` | Add filter/tint/mesh UI sections to AuraSettingsModal |
| `client/src/components/GameBoard.tsx` | Add filter/mesh application logic in token rendering |

## PixiJS v8 Filter Options

Available from `pixi.js`:
- `BlurFilter` - Gaussian blur
- `ColorMatrixFilter` - Brightness, contrast, hue, saturation
- `DisplacementFilter` - Wave/distortion with displacement map
- `NoiseFilter` - Random noise
- `AlphaFilter` - Fine alpha control
- `ShockwaveFilter` - Shockwave distortion

Blend modes available on sprite: `normal`, `add`, `multiply`, `screen`, `overlay`, `darken`, `lighten`

## Testing Checklist
- [ ] Filter dropdown changes update token in real-time
- [ ] Tint color picker applies color to token sprite
- [ ] Alpha slider makes token transparent
- [ ] Blend modes combine with background correctly
- [ ] Mesh effects deform token appearance
- [ ] Effects persist after token move/selection
- [ ] Multiple selected tokens can have different effects
