# AudioPanel.tsx Refactoring Plan

## Overview
The current `AudioPanel.tsx` is **1737 lines** and contains multiple distinct functional areas. This makes it difficult to maintain, test, and understand. The plan below breaks it down into smaller, focused components.

---

## Identified Functional Areas

### 1. Types/Interfaces (Lines 5-25)
Currently embedded in the main file. Should be extracted to a shared types file.

### 2. Audio Playback Engine
Contains:
- Audio element management (ref)
- Fade in/out functions
- Play/pause/stop logic
- Path resolution helpers

### 3. UI Components
The render section contains several logical UI sections:
- Header with drag handle
- Volume controls
- Playlist list with tracks
- Track controls (play/stop)
- Audio source settings
- Context menu

---

## Proposed File Structure

```
client/src/components/audio/
├── types.ts              # AudioTrack, AudioPlaylist interfaces
├── useAudioEngine.ts     # Custom hook for audio playback logic
├── useAudioFade.ts       # Custom hook for fade in/out logic
├── useAudioPaths.ts      # Custom hook for path resolution
├── AudioControls.tsx     # Play/Pause/Stop buttons
├── AudioVolumeControl.tsx # Volume sliders (master + track)
├── AudioSourceSettings.tsx # Server/local mode, upload
├── PlaylistList.tsx     # List of playlists
├── PlaylistItem.tsx      # Single playlist with tracks
├── TrackItem.tsx        # Individual track button
├── TrackContextMenu.tsx # Right-click menu for fade settings
├── NowPlaying.tsx       # Currently playing display
└── AudioPanel.tsx       # Main container component
```

---

## Component Breakdown

### `types.ts`
```typescript
export interface AudioTrack {
  id: string;
  name: string;
  file: string;
  loop?: boolean;
  fadeInDuration?: number;
  fadeOutDuration?: number;
}

export interface AudioPlaylist {
  id: string;
  name: string;
  icon: string;
  tracks: AudioTrack[];
  isCustom?: boolean;
  loopPlaylist?: boolean;
  shufflePlaylist?: boolean;
  repeatTrack?: boolean;
}
```

### `useAudioEngine.ts` (Custom Hook)
- Manages HTMLAudioElement ref
- `handleSelectTrack()` - loads and plays a track
- `handlePlayPause()` - toggles play/pause with fade
- `handleStop()` - stops playback with fade
- `canPlayAudioFormat()` - browser compatibility check

### `useAudioFade.ts` (Custom Hook)
- `fadeIn(duration)` - fades volume up
- `fadeOut(duration, callback)` - fades volume down
- Manages fade interval refs

### `useAudioPaths.ts` (Custom Hook)
- `resolveAudioPath()` - resolves file to URL
- `toAbsoluteAudioUrl()` - converts to absolute URL
- Audio source mode (server/local)
- Server base path configuration

### `AudioControls.tsx`
- Play/Pause button
- Stop button
- Accepts: `isPlaying`, `onPlayPause`, `onStop`, `colorScheme`

### `AudioVolumeControl.tsx`
- Master volume slider
- Track volume slider
- Accepts: `audioVolume`, `trackVolume`, `setAudioVolume`, `setTrackVolume`, `colorScheme`

### `PlaylistItem.tsx`
- Expandable playlist header
- Playlist controls (loop, shuffle, repeat, delete)
- Track list with drag-and-drop
- Add track button/input
- Accepts: `playlist`, `expanded`, `onToggle`, handlers...

### `TrackItem.tsx`
- Track play button
- Loop toggle (custom playlists only)
- Delete button
- Context menu trigger
- Accepts: `track`, `isPlaying`, `isCurrentTrack`, handlers...

### `TrackContextMenu.tsx`
- Right-click menu for fade settings
- Fade in slider
- Fade out slider
- Accepts: `track`, `playlistId`, `position`, handlers...

### `AudioPanel.tsx` (Main Container)
- Imports all sub-components
- Manages panel position/size (drag/resize)
- Manages playlist/track state
- Coordinates all handlers
- Renders composition of sub-components

---

## Migration Strategy

1. **Create directory structure** - Create `client/src/components/audio/`

2. **Extract types** - Move interfaces to `types.ts`

3. **Create custom hooks** - Extract logic to `useAudioEngine.ts`, `useAudioFade.ts`, `useAudioPaths.ts`

4. **Extract UI components** - Create one component at a time:
   - Start with leaf components (`TrackItem`, `TrackContextMenu`)
   - Then compound components (`PlaylistItem`, `PlaylistList`)
   - Finally container components

5. **Update imports** - Modify `AudioPanel.tsx` to import from new files

6. **Test incrementally** - Ensure functionality works after each extraction

---

## Benefits

| Before | After |
|--------|-------|
| Single 1737-line file | Multiple focused files (100-200 lines each) |
| Hard to find related code | Logical grouping by feature |
| Difficult to test | Each component can be unit tested |
| All state in one place | State colocated with relevant UI |
| Mixed concerns | Clear separation of UI, logic, and types |

---

## Estimated Component Sizes

| File | Approx Lines |
|------|-------------|
| types.ts | 25 |
| useAudioEngine.ts | 150 |
| useAudioFade.ts | 80 |
| useAudioPaths.ts | 50 |
| TrackItem.tsx | 80 |
| TrackContextMenu.tsx | 100 |
| PlaylistItem.tsx | 200 |
| AudioControls.tsx | 50 |
| AudioVolumeControl.tsx | 60 |
| AudioSourceSettings.tsx | 100 |
| AudioPanel.tsx | ~400 (reduced from 1737) |
