# VTT Token Tweening Implementation Spec

## Goal
Add tweened token animation for core in-game actions so tokens feel responsive and readable instead of snapping instantly.

## Scope
Use tweening for:
- movement
- melee/ranged attack actions
- taking damage
- healing
- optional: death/downed reaction, miss reaction, selection pulse

## Requirements

### 1. Central animation system
Create a token animation layer/service instead of ad-hoc per-component animations.

Suggested API:
```ts
type TokenAnimationType =
  | 'move'
  | 'attack'
  | 'damage'
  | 'heal'
  | 'miss'
  | 'downed'
  | 'select';

interface TokenAnimationRequest {
  tokenId: string;
  type: TokenAnimationType;
  from?: { x: number; y: number };
  to?: { x: number; y: number };
  duration?: number;
  payload?: Record<string, unknown>;
}
```

Suggested methods:
```ts
queueTokenAnimation(req: TokenAnimationRequest): Promise<void>
playTokenAnimation(req: TokenAnimationRequest): Promise<void>
cancelTokenAnimations(tokenId: string): void
clearAllTokenAnimations(): void
```

### 2. Animation rules

#### Move
- Tween token from current position to target position.
- Use eased motion, not linear.
- Default duration:
  - short move: 140-220ms
  - longer move: scale by distance, but cap around 350-450ms
- During movement:
  - sprite position updates every frame
  - logical position updates at end, or keep visual and logical state clearly separated
- Prevent visual desync between authoritative state and rendered state.

#### Attack
- Token should lunge toward target, then return.
- Do not permanently change token position.
- Suggested behavior:
  1. store origin
  2. move 15-25% toward target
  3. quick impact pause or squash
  4. return to origin
- Total duration: ~140-220ms

#### Damage
- Brief hit reaction:
  - small shake, recoil, or knockback-style nudge
  - optional red flash/tint
  - optional scale punch
- Duration: ~120-180ms
- Must restore original tint/scale/position after animation.

#### Heal
- Brief positive feedback:
  - soft upward bob or pulse
  - optional green/blue glow/tint
  - optional scale pulse
- Duration: ~180-260ms
- Restore base visual state afterward.

#### Optional states
- Miss: small recoil or side sway
- Downed/death: fade, desaturate, rotate slightly, or lower alpha
- Selection: looping soft pulse on selected token only

### 3. Queueing and concurrency
- Per-token animation queue.
- Avoid conflicting animations fighting over position/scale/tint.
- Rules:
  - move should usually cancel/replace prior move
  - attack/damage/heal should queue after move unless marked interrupting
  - hit reaction may interrupt attack return if needed, but final transform must be normalized
- Always preserve a clean base transform:
  - base position
  - base scale
  - base rotation
  - base alpha
  - base tint

### 4. Transform composition
Do not let different animations overwrite each other destructively.

Use either:
- separate visual containers:
  - tokenRoot
    - movementContainer
      - effectContainer
        - sprite
- or a composed animation state:
  - base transform
  - move offset
  - attack offset
  - shake offset
  - scale multiplier
  - tint overlay

Then compute final rendered transform each frame.

### 5. Rendering integration
If using PixiJS:
- animate on ticker / requestAnimationFrame
- do not rely on React re-renders for per-frame animation
- token display object should be mutated directly during animation
- React/store should hold authoritative gameplay state, while animation layer handles transient visual state

### 6. Event integration
Hook animation requests into gameplay events:
- token move command -> play move tween
- attack action resolved -> play attack tween
- damage applied -> play damage tween
- healing applied -> play heal tween

Suggested flow:
1. gameplay event fires
2. authoritative state updates
3. animation service resolves visual tween
4. optional floating text / FX trigger in parallel

### 7. Timing defaults
```ts
const TOKEN_ANIMATION_DEFAULTS = {
  moveMin: 160,
  moveMax: 420,
  attack: 180,
  damage: 140,
  heal: 220,
  selectPulse: 900,
};
```

### 8. Easing suggestions
- move: easeInOutCubic or easeOutQuad
- attack lunge out: easeOutCubic
- attack return: easeInOutQuad
- damage shake/punch: easeOutExpo-like or damped oscillation
- heal pulse: easeOutBack / easeOutQuad

### 9. Safety constraints
- No animation should permanently corrupt token transform.
- Cancelling an animation must restore a valid final state.
- Grid-snapped tokens must end exactly on grid position.
- Pan/zoom must not affect tween math incorrectly.
- Multi-token movement should still work.

### 10. Minimal implementation plan
1. Add `TokenAnimationManager`.
2. Store per-token visual animation state.
3. Add ticker-driven update loop.
4. Implement `move` tween.
5. Implement `attack` lunge tween.
6. Implement `damage` hit reaction.
7. Implement `heal` pulse.
8. Add event hooks from existing combat/action pipeline.
9. Normalize transform reset logic.
10. Add debug toggle/logging for active animations.

### 11. Nice extras
- floating damage/heal numbers synced with reactions
- screen-space slash / impact FX
- configurable animation speed in settings
- disable/reduce motion accessibility option
- batch animation support for AOE hits

## Codex implementation notes
- Keep gameplay state authoritative.
- Keep animation state visual and disposable.
- Prefer a small reusable tween utility over hardcoded `setTimeout` chains.
- Avoid React state updates every frame.
- Build for composition so future status effects can reuse the system.


---

# Codex Prompt

Implement a token tween animation system for my VTT.

Context:
- Stack: React + PixiJS v8, canvas renderer
- Tokens currently snap for movement and combat feedback
- I want a reusable animation system for token movement, attacks, damage, and healing
- Animation must be visual-only and must not corrupt authoritative gameplay state

Build this with the following requirements:

1. Create a central TokenAnimationManager / service
- Per-token animation queue
- Public API like:
  - queueTokenAnimation(...)
  - playTokenAnimation(...)
  - cancelTokenAnimations(tokenId)
  - clearAllTokenAnimations()

2. Support animation types
- move
- attack
- damage
- heal
- optional: miss, downed, select pulse

3. Movement animation
- Tween token from current visual position to target
- Use easing, not linear motion
- Duration based on distance with sane min/max cap
- End exactly on the grid-aligned final position
- Must work with pan/zoom and existing token dragging/multi-token movement logic

4. Attack animation
- Lunge token a short distance toward target, then return to origin
- Do not change final token position
- Use fast readable timing

5. Damage animation
- Brief hit reaction using shake/recoil/nudge
- Optional tint flash and/or scale punch
- Restore original transform/tint afterward

6. Heal animation
- Brief positive pulse/bob/glow
- Restore original state afterward

7. Composition
- Do NOT let overlapping animations permanently overwrite position/scale/tint
- Use either nested containers or composed offsets/state so movement + hit reaction + pulse can coexist safely

8. Rendering model
- Use Pixi ticker / requestAnimationFrame for per-frame animation
- Mutate Pixi display objects directly for animation
- Do not use React state for frame-by-frame updates

9. Integration
- Hook into existing gameplay flow so:
  - move command -> move tween
  - attack resolved -> attack tween
  - damage applied -> damage tween
  - heal applied -> heal tween

10. Reliability
- Cancelling animations must leave token in a valid final state
- No transform drift
- No stale tint/scale/alpha after animation
- Multi-token scenarios should still behave correctly

11. Deliverables
- Implementation
- Any required helper tween/easing utilities
- Clear comments on how the animation state is separated from gameplay state
- Short summary of architecture and where to hook additional effects later

Use clean, minimal, production-oriented code. Prefer reusable utilities over one-off animation logic. If current token rendering structure is not animation-safe, refactor it to support composed transforms cleanly.

