# VTT Enhancement Plan

## Current State Analysis

### Already Implemented ✅
- **GameBoard** - PixiJS canvas rendering with grid (square & hex)
- **Token Management** - Create, move, delete tokens with HP bars, status effects
- **Character Sheets** - Full D&D 5e stats, inventory, spells, abilities
- **Combat Tracker** - Initiative tracking with d20 rolls
- **D&D Data Manager** - 5e compendium (spells, items, monsters from 5etools)
- **Scene Manager** - Save/load board states
- **Weather Effects** - Rain, snow, fog, fireflies, embers, sparkles
- **Fog of War** - Manual reveal/hide
- **Multiplayer** - WebSocket real-time sync via Socket.io
- **Chat System** - Basic text chat
- **Themes** - Custom color schemes
- **Player Management** - GM/Player roles, controlled tokens

### Missing/Incomplete Features ❌
1. **Visual Dice Roller** - No animated 3D/2D dice UI
2. **Dice Commands in Chat** - No `/roll 2d6+3` syntax
3. **Audio System** - No ambient sounds, background music, or sound effects
4. **Drawing Tools** - Can't draw freehand on maps
5. **Dynamic Lighting** - Basic lights but no vision calculation
6. **Macros** - No automation for common actions
7. **Journal** - Basic notes, not structured journal entries
8. **Voice/Video Chat** - No real-time communication
9. **Export/Import** - Limited data portability

---

## Priority Enhancement Plan

### Phase 1: Core Experience Improvements (Week 1-2)

#### 1.1 Visual Dice Roller 🎲
**Priority: HIGH**
- Dedicated dice rolling UI with clickable dice (d4, d6, d8, d10, d12, d20, d100)
- Animated dice rolling visualization
- Roll history panel
- Advantage/disadvantage rolls
- Public vs private (GM-only) rolls
- Integration with character stats

**Implementation:**
- Create `DiceRoller.tsx` component
- Add dice button to toolbar
- Store roll history in game state
- Display results in chat

#### 1.2 Chat Dice Commands 💬
**Priority: HIGH**
- Parse `/roll 2d6+3` or `/r 2d6+3` commands
- Support common dice notation (adv, dis, max, min, etc.)
- Show roll breakdown (individual die results)
- Quick roll buttons for common rolls

**Implementation:**
- Update ChatPanel to parse commands
- Add dice parser utility
- Format roll results nicely

### Phase 2: Audio & Atmosphere (Week 2-3)

#### 2.1 Audio System 🔊
**Priority: MEDIUM**
- Background music player
- Ambient sound effects (rain, wind, fire, tavern, forest)
- Per-scene audio presets
- Volume controls
- Looping audio support

**Implementation:**
- Create `AudioManager.tsx` component
- Add audio assets (royalty-free)
- Integrate with scene manager
- Web Audio API for mixing

#### 2.2 Sound Effects 🎵
**Priority: MEDIUM**
- Token placement sounds
- Combat sounds (attacks, hits, misses)
- UI interaction sounds
- Dice roll sounds

### Phase 3: GM Tools (Week 3-4)

#### 3.1 Drawing Tools ✏️
**Priority: MEDIUM**
- Freehand drawing on map
- Line and arrow tools
- Shape tools (circles, rectangles)
- Color picker
- Undo/redo
- Clear all drawings

**Implementation:**
- Add drawing layer to PixiJS stage
- Create DrawingToolbar component
- Store drawings in scene state

#### 3.2 Macros 📝
**Priority: MEDIUM**
- Create custom macro buttons
- Macro editor with dice rolls
- Token actions (attack, cast spell)
- Chat commands
- Import/export macros

#### 3.3 Enhanced Journal 📔
**Priority: LOW**
- Rich text notes
- Quest tracker
- NPC database
- Location descriptions
- Images and links

### Phase 4: Advanced Features (Week 4-6)

#### 4.1 Dynamic Lighting 💡
**Priority: MEDIUM**
- Vision radius for tokens
- Dynamic light sources
- Day/night cycle
- Torch/fire flicker effects
- Vision blocking by walls

#### 4.2 Encounter Generator ⚔️
**Priority: LOW**
- Random encounter tables
- CR-based creature selection
- One-click combat setup

#### 4.3 Character Builder 🧙
**Priority: LOW**
- Guided character creation
- Point-buy or standard array
- Class feature selection
- Automatic stat calculation

---

## Quick Wins (Can Implement Now)

### 1. Dice Roller (Simple Version)
```
Implementation Steps:
1. Add dice buttons to toolbar (d4, d6, d8, d10, d12, d20)
2. Create modal/popup for rolling
3. Show result in chat with breakdown
4. Add roll history sidebar
```

### 2. Quick Dice in Chat
```
Implementation Steps:
1. Add input parser for /r command
2. Support basic notation: XdY+Z
3. Show individual die results
4. Color code successes/failures
```

### 3. Sound Effects (Basic)
```
Implementation Steps:
1. Add Web Audio API player
2. Pre-load common sounds
3. Trigger on: token drop, dice roll, combat start
4. Add volume slider to settings
```

### 4. Drawing (Simple)
```
Implementation Steps:
1. Add pencil tool to toolbar
2. Create drawing layer in PixiJS
3. Capture mouse/touch paths
4. Save drawings with scene
```

---

## Technical Recommendations

### Performance
- Use PixiJS sprites efficiently
- Lazy load compendium data
- Debounce real-time updates
- Use Web Workers for dice calculations

### UI/UX
- Add keyboard shortcuts
- Improve mobile responsiveness
- Add tooltips and help
- Dark mode by default

### Data
- Add auto-save
- Export sessions as JSON
- Import character sheets
- Backup to cloud (future)

---

## Files to Modify

### New Files to Create
- `client/src/components/DiceRoller.tsx`
- `client/src/components/AudioManager.tsx`
- `client/src/utils/diceParser.ts`
- `client/src/utils/audioPlayer.ts`

### Files to Modify
- `client/src/components/Toolbar.tsx` - Add dice buttons
- `client/src/components/ChatPanel.tsx` - Add dice commands
- `client/src/components/GameBoard.tsx` - Add drawing layer
- `client/src/store/gameStore.ts` - Add audio/dice state

---

## Conclusion

The VTT already has a solid foundation. The highest-impact quick improvements would be:
1. **Visual Dice Roller** - Most requested feature
2. **Dice in Chat** - Natural extension of chat
3. **Sound Effects** - Adds atmosphere quickly
4. **Drawing Tools** - Popular GM feature

I recommend starting with Phase 1 (Dice) as it provides immediate value and is relatively straightforward to implement.
