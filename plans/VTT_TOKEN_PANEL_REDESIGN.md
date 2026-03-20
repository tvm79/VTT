# VTT Token Context Menu Redesign Specification

## Objective

Redesign the token right-click panel to:

- Improve visual hierarchy
- Prioritize common in-combat actions
- Reduce cognitive load
- Separate gameplay actions from administrative settings
- Improve scalability for future features

Stack: React 18 + TypeScript + Zustand + PixiJS

---

# 1. Structural Reorganization

Split the panel into three functional zones:

1. Token Identity
2. Live State (Primary Gameplay)
3. Administration

---

# 2. Proposed Layout

## HEADER (Token Identity)

- Token Name (bold)
- Size dropdown (inline label)

---

## LIVE STATE (Highest Priority)

Includes frequently used gameplay actions:

- HP toggle
- Mana toggle
- + Custom Bar
- Visibility toggle
- Add to Combat
- Status Effects Grid

### Layout Example

HP   Mana   +Bar  
[ Visible ]   [ Add to Combat ]  

Status Grid Below

---

## STATUS GRID Improvements

- Reduce padding by ~25%
- Inactive = subtle outline
- Active = glow + tinted background
- Add tooltips
- Consider collapsible container if expanded

---

## OWNERSHIP SECTION

Administrative controls:

- Assign to Player (dropdown)
- Controlled By (multi-select)

Visually reduced emphasis compared to Live State.

---

## DISPLAY SECTION

Replace:

OFF | Edit

With:

Display Name:
[ Hidden | Players | GM Only ]

Edit Text

Clearer intent and better UX.

---

## POSITION & LAYER

Use segmented control instead of buttons:

[ Tokens | Tiles | Objects ]

Lower visual weight.

---

## DANGER ZONE

Delete Token

- Move to bottom
- Isolate with spacing
- Use red outline (not filled)
- Require confirmation

---

# 3. Visual Weight Rules

| Action Type | Visual Treatment |
|-------------|------------------|
| Combat | Subtle green outline |
| Active State | Glow highlight |
| Destructive | Red outline |
| Administrative | Neutral |
| Rare | Collapsible |

Avoid large filled red/green blocks.

---

# 4. Spacing Rules

- 8px spacing between buttons
- 16px spacing between sections
- Consistent border radius
- Section headers subtle uppercase + divider line

---

# 5. Component Structure (React)

Split into focused components:

<TokenPanel>
  <TokenHeader />
  <LiveStateSection />
  <StatusGrid />
  <OwnershipSection />
  <DisplaySection />
  <LayerSection />
  <DangerZone />
</TokenPanel>

Use granular Zustand selectors to avoid unnecessary re-renders.

---

# 6. State Flow (Zustand + Pixi)

UI updates -> Zustand store  
Zustand -> Socket emit  
Socket -> Other clients  
Pixi listens to store changes  

UI must not directly mutate Pixi objects.

---

# 7. Optional Enhancements

- Collapsible Advanced section
- Compact Combat Mode
- Radial menu variant for right-click
- Context-sensitive display when token is in combat

---

# 8. Core UX Principle

Design for the 80% use case:

Most common right-click actions:

- Change HP
- Add/remove status
- Add to combat
- Toggle visibility

These must dominate the layout.

Administrative actions must be visually secondary.

---

End of specification.
