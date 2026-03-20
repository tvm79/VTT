# Save/Load Fix Plan

## Issues to Fix

### 1. Atmospheric Fog Settings (Not Saved)
The atmospheric fog effect settings are stored in `VISUAL_OPTIONS` in `gameTime.ts` but are NOT part of the Scene interface, so they are never saved or loaded.

**Fields to add:**
- `fogEnabled: boolean`
- `fogIntensity: number`
- `fogSpeed: number`
- `fogShift: number`
- `fogDirection: number`
- `fogColor1: string`
- `fogColor2: string`

### 2. Audio Sources (Not Loaded)
Audio sources ARE saved in `saveScene()` but NOT restored in `loadScene()`. This is a bug.

**Fix:** Add `audioSources: scene.audioSources` to the loadScene state update.

### 3. Grid Opacity (Not Saved)
The grid opacity setting is defined in the Scene interface but not actually saved or loaded.

**Fix:** Add `gridOpacity` to both saveScene and loadScene functions.

## Files to Modify

1. `client/src/store/gameStore.ts`
   - Add atmospheric fog fields to `Scene` interface
   - Update `saveScene` function to persist fog settings and gridOpacity
   - Update `loadScene` function to restore fog settings, audioSources, and gridOpacity

## Implementation Order

1. Add fog fields to Scene interface
2. Update saveScene to save fog settings and gridOpacity  
3. Update loadScene to restore fog settings, audioSources, and gridOpacity
