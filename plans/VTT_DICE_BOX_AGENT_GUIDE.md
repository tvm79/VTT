# Agent Guide: Integrate `@3d-dice/dice-box` (3d-dice/dice-box) into a React + Vite + TypeScript VTT

This guide is written as **step-by-step instructions for an implementation agent**. Follow in order.  
Primary references: the `dice-box` README and the Fantastic Dice docs site. citeturn1view0turn2search1

---

## 0) Preconditions / assumptions

- Frontend: React 18 + TypeScript + Vite.
- You can render an HTML overlay on top of your Pixi canvas (recommended), because `dice-box` renders into its own `<canvas>` element.
- You have a local dev server and a `/public` folder served statically by Vite.

---

## 1) Install the package

From your frontend project root:

```bash
npm i @3d-dice/dice-box
```

The README notes that install may prompt you for a static-asset destination (default `/public/assets`) and that you can always copy assets manually from the package if needed. citeturn1view0

---

## 2) Copy required static assets into your app

`dice-box` requires you to host its assets (models/textures/sounds/worker deps) in your app’s static/public folder and point `assetPath` at them. This is the **only required config**. citeturn1view0

### 2.1 Decide an asset destination (recommended)

Use:

- `client/public/assets/dice-box/`

### 2.2 Copy the assets

Copy everything from:

- `node_modules/@3d-dice/dice-box/src/assets`

Into:

- `client/public/assets/dice-box`

Examples:

```bash
# from your frontend root
mkdir -p public/assets/dice-box
cp -R node_modules/@3d-dice/dice-box/src/assets/* public/assets/dice-box/
```

If you prefer a build-time copy, implement a Vite plugin/script later; start with manual copy first to validate runtime behavior.

---

## 3) Add a Dice Overlay container in your UI (HTML layer)

Create a fixed-position overlay that sits above the Pixi canvas.

**Goal**: a div that dice-box attaches to, with a known size and z-index, and with pointer events enabled only when rolling.

### 3.1 Add an overlay element (e.g. in `App.tsx`)

Add something like:

- A wrapper positioned `fixed; inset: 0; pointer-events: none;`
- An inner container `#dice-box` with `pointer-events: auto;` while open

(You’ll implement the exact styles in your app; keep it minimal.)

---

## 4) Implement a `DiceBoxOverlay` React component

Create: `src/components/DiceBoxOverlay.tsx`

### 4.1 Responsibilities

The component must:

1. Create and hold a single DiceBox instance.
2. Call `await diceBox.init()` once after mount.
3. Expose a `roll(notation: string)` function to the rest of your app.
4. Listen for roll completion (`onRollComplete`) and return results.
5. Cleanup on unmount.

`DiceBox` usage pattern in the README: instantiate → `init()` → `roll("2d20")`. citeturn1view0

### 4.2 Minimal implementation sketch (agent should adapt)

- Import: `import DiceBox from "@3d-dice/dice-box";` citeturn1view0
- Instantiate:

  - selector: `#dice-box`
  - config: `{ assetPath: "/assets/dice-box" }` citeturn1view0

- Initialize inside `useEffect`:
  - `await diceBox.init()`
- Configure callback:
  - `diceBox.onRollComplete = (results) => { ... }`

> Note: dice-box supports simple notation like `2d20` or `2d6+4`. For full Roll20-style notation, you add the parser modules later. citeturn1view0

---

## 5) Provide a simple “roll API” for your VTT

Pick one approach:

### Option A (recommended): Zustand store for dice overlay

- Add a `dice` slice to your Zustand store:
  - `diceReady: boolean`
  - `rollDice: (notation: string) => void`
  - `setDiceApi: (api: { roll: (notation: string) => Promise<any> }) => void`

The overlay component sets `setDiceApi` after init. Any UI can call `rollDice("1d20+5")`.

### Option B: React context

- `DiceContext` provides `roll(notation)` and `ready` flag.

---

## 6) Hook dice rolling into chat / hotkeys / UI

### 6.1 Chat commands

- When user sends `/r 2d20kh1+5`:
  - If you only support simple notation now, validate and reject unsupported tokens.
  - Otherwise, implement advanced notation later (Section 9).

### 6.2 Token context menu integration

- Add menu items:
  - “Roll d20”
  - “Roll initiative”
  - “Roll attack”
- Convert those to notations and call `rollDice(...)`.

---

## 7) Ensure resize works

Your dice overlay must match the viewport.

- Set `#dice-box` width/height to `100%`.
- If dice-box exposes a resize method in docs, call it on window resize; otherwise, rely on CSS sizing (start here).

The README demo CSS shows `#dice-box` at `width: 100%; height: 100%;` and `#dice-box canvas { width: 100%; height: 100%; }`. citeturn1view0

---

## 8) Production hardening checklist

### 8.1 Verify assets are served

In dev tools network tab, confirm assets under:

- `/assets/dice-box/...`

are returned with `200`.

### 8.2 Handle init failures gracefully

If `init()` fails:

- Log a single error with instructions:
  - “dice-box init failed; check assetPath and static assets.”

### 8.3 Avoid multiple instances

Enforce singleton behavior:

- If a DiceBox instance exists, do not re-create it on rerenders.

---

## 9) Optional: advanced dice notation + UI modules

The `dice-box` README explicitly points to other `@3d-dice` modules for advanced notation and UI. citeturn1view0turn0search7turn0search11

### 9.1 Add advanced notation support

Install:

```bash
npm i @3d-dice/dice-parser-interface @3d-dice/dice-roller-parser
```

Then:

- Parse user notation → convert into basic dice-box rolls (`Box.add(...)` / `Box.roll(...)` as supported by the parser interface)
- Merge results back into a final result object (the parser interface is designed to do this). citeturn0search11

### 9.2 Add UI helpers (optional)

Install:

```bash
npm i @3d-dice/dice-ui
```

Use modules like:
- `AdvancedRoller`
- `DisplayResults`
- `BoxControls` citeturn1view0turn0search7

This is useful if you want a quick, polished roller without building your own UI.

---

## 10) Debug playbook (when “nothing happens”)

1. Confirm `DiceBoxOverlay` mounted and `init()` ran.
2. Confirm `#dice-box` exists and has non-zero width/height.
3. Confirm `/assets/dice-box` files are served (network tab).
4. Temporarily add a test button: `roll("2d20")`.
5. If you see a canvas but no dice:
   - try a simpler roll `1d6`
   - disable any overlay CSS that might hide the canvas
6. If init fails intermittently:
   - ensure the component isn’t unmounting/remounting on route changes

---

## 11) Acceptance criteria

- Dice overlay canvas is visible when rolling (or always visible if you choose).
- Calling `rollDice("2d20")` spawns dice and returns a result via `onRollComplete`. citeturn1view0
- Assets load from `/assets/dice-box` without 404s. citeturn1view0
- No duplicate DiceBox instances after rerenders.

---

## References

- `dice-box` README (install, assets, init/roll pattern). citeturn1view0  
- Fantastic Dice docs (intro + getting started). citeturn2search1  
- `dice-ui` repository / examples (optional UI modules). citeturn0search7  
