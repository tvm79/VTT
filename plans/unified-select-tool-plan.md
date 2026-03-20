# Unified Select Tool Implementation Plan

## Overview
Implement a unified select tool that can select and move different object types (tokens, lights) with filter buttons to control what's selectable during box selection.

## Current State
- **Tools**: `'move' | 'token' | 'fog' | 'measure' | 'light'`
- **`move` tool**: Selects and moves tokens only
- **`light` tool**: Creates lights, selects and moves lights
- Box selection works separately for each tool

## Proposed Design

### Tool System Changes
1. **Rename `move` to `select`** - Make it the universal selection/movement tool
2. **Keep `light` tool** - For creating new lights only (not selection)
3. **Add selection filters** - Toggle buttons to control what's selectable

### New Tool Definitions
```typescript
tool: 'select' | 'token' | 'fog' | 'measure' | 'light'
```

- **`select`**: Universal selection and movement tool
- **`token`**: For creating new tokens (future)
- **`fog`**: Fog of war editing (GM only)
- **`measure`**: Distance measurement
- **`light`**: For creating new lights only

### Selection Filter State
```typescript
// In gameStore.ts
selectableTypes: ('token' | 'light')[];  // Default: ['token', 'light']
setSelectableTypes: (types: ('token' | 'light')[]) => void;
toggleSelectableType: (type: 'token' | 'light') => void;
```

## Implementation Steps

### Step 1: Update gameStore.ts
- Add `selectableTypes` state with default `['token', 'light']`
- Add `setSelectableTypes` and `toggleSelectableType` actions
- Rename `tool: 'move'` to `tool: 'select'` in type definition

### Step 2: Update Toolbar.tsx
- Add filter toggle buttons above the tool buttons
- Buttons: Token (icon: theater-masks), Light (icon: lightbulb)
- Visual indication of active/inactive state
- Show filters only when `select` tool is active

### Step 3: Update GameBoard.tsx
- Replace all `currentTool === 'move'` with `currentTool === 'select'`
- Update box selection to check `selectableTypes` filter
- When box selecting, select all object types that are enabled in filter
- Keep light tool for creating lights only (remove selection logic)
- Single click on object selects it regardless of filter (filter only affects box selection)

### Step 4: Update tools array
```typescript
const tools = [
  { id: 'select', icon: 'hand-pointer', label: 'Select' },
  { id: 'measure', icon: 'ruler', label: 'Measure' },
  { id: 'light', icon: 'lightbulb', label: 'Light' },
  { id: 'fog', icon: 'cloud', label: 'Fog' },
];
```

## UI Design

### Filter Buttons Layout
```
┌─────────────────────────────┐
│ [🎭][💡]                    │  <- Small filter toggles (half tool button size)
├─────────────────────────────┤
│  [👆]  [📏]  [💡]  [☁️]     │  <- Tool buttons (regular size)
│ Select Measure Light Fog   │
└─────────────────────────────┘
```

### Filter Button Design
- **Size**: Half the size of regular tool buttons (smaller, compact)
- **Position**: Above the tool buttons, left-aligned
- **Active state**: Highlighted with accent color background
- **Inactive state**: Dimmed/transparent background
- **Show only when**: `select` tool is active

### Tool Buttons (unchanged)
- Keep current size and styling
- Just rename "Move" to "Select"

## Behavior Details

### Box Selection
1. User drags selection rectangle with `select` tool
2. On release, select all objects within rectangle where:
   - Object type is in `selectableTypes` filter
   - For tokens: check if token center is within rectangle
   - For lights: check if light center is within rectangle

### Single Click
1. Click on empty space: Deselect all
2. Click on token: Select that token (regardless of filter)
3. Click on light: Select that light (regardless of filter)

### Drag to Move
1. Click and drag on selected object(s): Move them
2. Works for both tokens and lights

### Light Tool (New Behavior)
1. Click on empty space: Start creating a new light
2. Drag to set light radius
3. No selection functionality - use `select` tool for that

## Files to Modify

1. **client/src/store/gameStore.ts**
   - Add `selectableTypes` state
   - Add toggle actions
   - Update tool type

2. **client/src/components/Toolbar.tsx**
   - Add filter toggle buttons
   - Update tool buttons

3. **client/src/components/GameBoard.tsx**
   - Replace `move` with `select`
   - Update box selection logic
   - Update light tool behavior

## Migration Notes
- Existing sessions with `tool: 'move'` will need migration
- Default `selectableTypes: ['token', 'light']` ensures backward compatibility
