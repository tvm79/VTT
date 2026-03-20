# Plan: Remove Map Bleed Scene Override from Scene Manager

## Objective
Remove the "Map Bleed Scene Override" section from the Scene Manager and instead save the current global Map Bleed settings (from Header → Map Settings → Map Bleed) when saving a scene.

## Current Behavior
1. Scene Manager has a "Map Bleed Scene Override" section (lines 279-345 in SceneManager.tsx)
2. Contains override toggle and per-scene Map Bleed controls
3. When saving a scene, it saves the `sceneMapBleed*` state values (override values)
4. When loading a scene, applies saved `mapBleed*` values from scene to global settings

## New Behavior
1. Remove the "Map Bleed Scene Override" section entirely from SceneManager.tsx
2. When saving a scene, save the GLOBAL `mapBleed*` values (from Toolbar) instead of `sceneMapBleed*` values
3. When loading a scene, apply the saved Map Bleed values to the global settings (existing behavior)
4. Remove unused `sceneMapBleed*` state variables and their setters from gameStore.ts

---

## Implementation Steps

### Step 1: Modify SceneManager.tsx
**File:** `client/src/components/SceneManager.tsx`

- [ ] **Remove the "Map Bleed Scene Override" section** (lines 267-345)
  - This is the entire `<div>` with the section title "Map Bleed Scene Override"
  - Includes the checkbox for "Save and use scene-specific bleed values"
  - Includes all the sliders for Enabled, Feather, Blur, Vignette, Scale

- [ ] **Remove imports for unused state variables** (lines 27-38)
  - Remove: `sceneMapBleedOverrideEnabled`, `setSceneMapBleedOverrideEnabled`
  - Remove: `sceneMapBleedEnabled`, `setSceneMapBleedEnabled`
  - Remove: `sceneMapBleedFeather`, `setSceneMapBleedFeather`
  - Remove: `sceneMapBleedBlur`, `setSceneMapBleedBlur`
  - Remove: `sceneMapBleedVignette`, `setSceneMapBleedVignette`
  - Remove: `sceneMapBleedScale`, `setSceneMapBleedScale`

### Step 2: Modify gameStore.ts
**File:** `client/src/store/gameStore.ts`

- [ ] **Update saveScene function** (around line 2878)
  - Change from saving `sceneMapBleed*` values to saving global `mapBleed*` values
  - Current: `mapBleedOverrideEnabled: state.sceneMapBleedOverrideEnabled`
  - New: `mapBleedEnabled: state.mapBleedEnabled`
  - Continue with: `mapBleedFeather`, `mapBleedBlur`, `mapBleedVignette`, `mapBleedScale`

- [ ] **Update overwriteScene function** (around line 2964)
  - Same changes as saveScene - use global `mapBleed*` values

- [ ] **Optional: Remove sceneMapBleed* state variables and setters**
  - These may still be used for loading scenes, so keep them for now
  - The scene data structure already has `mapBleed*` fields (not `sceneMapBleed*`)

---

## Files to Modify

| File | Changes |
|------|---------|
| `client/src/components/SceneManager.tsx` | Remove UI section and unused imports |
| `client/src/store/gameStore.ts` | Update saveScene/overwriteScene to use global mapBleed values |

---

## Key Changes Summary

```typescript
// In saveScene and overwriteScene functions:
// OLD (current):
mapBleedOverrideEnabled: state.sceneMapBleedOverrideEnabled,
mapBleedEnabled: state.sceneMapBleedEnabled,
mapBleedFeather: state.sceneMapBleedFeather,
mapBleedBlur: state.sceneMapBleedBlur,
mapBleedVignette: state.sceneMapBleedVignette,
mapBleedScale: state.sceneMapBleedScale,

// NEW:
mapBleedEnabled: state.mapBleedEnabled,
mapBleedFeather: state.mapBleedFeather,
mapBleedBlur: state.mapBleedBlur,
mapBleedVignette: state.mapBleedVignette,
mapBleedScale: state.mapBleedScale,
```

---

## Testing Checklist
- [ ] Save a scene with specific Map Bleed settings in Toolbar
- [ ] Verify the Map Bleed values are saved with the scene
- [ ] Load the scene and verify Map Bleed settings are applied
- [ ] Verify the "Map Bleed Scene Override" section is removed from Scene Manager
- [ ] Create a new scene and verify Map Bleed settings work correctly
