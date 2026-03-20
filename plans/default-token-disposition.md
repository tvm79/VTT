# Plan: Add Default Token Disposition for Dragged and Dropped Tokens

## Overview
Add a default token disposition setting in Board Settings that will be applied when tokens are dragged and dropped onto the board.

## Current State
- Board Settings already has token display defaults: Name, Your HP, Other HP
- Token disposition options: neutral, friendly, secret, hostile
- When tokens are dropped, they currently have no default disposition set

## Implementation Steps

### Step 1: Update TokenDisplayDefaults interface in gameStore.ts
- Add `defaultTokenDisposition` field to the `TokenDisplayDefaults` interface
- Type: `TokenDisposition | null` (allows no default)

### Step 2: Update DEFAULT_TOKEN_DISPLAY_DEFAULTS in gameStore.ts
- Add default value: `defaultTokenDisposition: null`

### Step 3: Update loadSavedTokenDisplayDefaults in gameStore.ts
- Load the saved default token disposition from localStorage

### Step 4: Update saveTokenDisplayDefaultsToStorage in gameStore.ts
- Save the default token disposition to localStorage

### Step 5: Add state variables in GameState interface (gameStore.ts)
- Add `defaultTokenDisposition: TokenDisposition | null` to the interface

### Step 6: Add initial state in initialState (gameStore.ts)
- Add `defaultTokenDisposition: loadSavedTokenDisplayDefaults().defaultTokenDisposition`

### Step 7: Add setter function in gameStore.ts
- Add `setDefaultTokenDisposition: (disposition: TokenDisposition | null) => void`
- Include persistence to localStorage

### Step 8: Add UI control in Toolbar.tsx
- Add a disposition selector in Board Settings > Token Display Defaults section
- Options: None, Neutral, Friendly, Secret, Hostile
- Use the existing toggle button style pattern

### Step 9: Apply default in GameBoard.tsx
- In the token drop handling code, apply the default disposition when creating new tokens
- Use the pattern: `properties: { disposition: defaultTokenDisposition }` when default is set

## Files to Modify
1. `client/src/store/gameStore.ts` - Add state management
2. `client/src/components/Toolbar.tsx` - Add UI control
3. `client/src/components/GameBoard.tsx` - Apply default on drop
