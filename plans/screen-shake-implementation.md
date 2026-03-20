# Screen Shake Implementation Notes

## Summary

A native PIXI screen shake implementation was added to the board runtime so it can respond to token animation events (`damage`, `heal`, `downed`, `attack`, `miss`) without adding third-party camera dependencies.

## Design

- Settings are persisted in `gameStore` as `screenShakeSettings`.
- All toggles default to disabled, including global enable.
- Shake is applied as a temporary offset on top of the existing stage pan/zoom transform.
- Existing pan/zoom logic writes the stage base transform, while shake adds transient offsets.
- Runtime checks `prefers-reduced-motion` and disables shake when enabled by the OS.

## Store schema

Added in `client/src/store/gameStore.ts`:

- `ScreenShakeEventSettings`:
  - `enabled: boolean`
  - `intensity: number` (clamped `0..2`)
- `ScreenShakeSettings`:
  - `enabled: boolean`
  - `durationMs: number` (clamped `80..1200`)
  - per-event settings for `damage`, `heal`, `downed`, `attack`, `miss`

Persistence key: `vtt-screen-shake-settings`.

## Toolbar UI

Added in `client/src/components/Toolbar.tsx` under Settings:

- Collapsible **Screen Shake** section
- Global enable toggle
- Global duration slider
- Per-event toggle + intensity slider
- Reset button that restores disabled defaults

## GameBoard runtime

Added in `client/src/components/GameBoard.tsx`:

- `ScreenShakeRuntimeState` for active shake state
- `applyStageTransformWithShake()` helper to combine base transform + shake offset
- Ticker update loop with damped oscillation and safe reset to base position
- Event listener via `subscribeToTokenAnimations()` that maps event types to amplitude multipliers

This keeps shake decoupled from token animation and particle systems while sharing the existing event bus.

## Extension points

- Add token filtering (e.g., only selected token or owned tokens).
- Add separate duration per event.
- Add camera impulse curves (e.g., trauma model) if stronger cinematic behavior is desired.
- Add hotkey to temporarily suppress shake.

## Acceptance checklist

- Build passes (`npm run build` in `client`).
- Shake remains disabled by default after first load.
- Enabling global + event toggle causes shake on matching event.
- Disabling global or enabling reduced-motion suppresses shake.
- Pan/zoom/drag still behave normally, and stage transform resets cleanly after shake.
