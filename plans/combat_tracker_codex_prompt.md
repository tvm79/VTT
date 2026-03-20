# Codex Implementation Prompt --- Combat Tracker

You are implementing a **combat tracker UI** for a tabletop RPG similar
to D&D.

The tool manages:

-   combatants
-   initiative order
-   HP
-   turn order
-   rounds

The UI should look like a **horizontal initiative bar with cards**
representing each combatant.

------------------------------------------------------------------------

# Technical Stack

Use:

    Frontend: React
    Language: TypeScript
    State: Zustand or React Context
    Styling: Tailwind
    Drag reorder: dnd-kit

Single page app.

No backend required.

------------------------------------------------------------------------

# Directory Structure

Create this structure:

    src/

    components/
        InitiativeBar.tsx
        CombatantCard.tsx
        CombatControls.tsx
        CombatantDetails.tsx

    state/
        combatStore.ts

    types/
        Combatant.ts
        Encounter.ts

    utils/
        turnLogic.ts
        hpLogic.ts

    App.tsx
    main.tsx

------------------------------------------------------------------------

# Data Model

## Combatant

    id: string
    name: string
    portrait: string | null

    type: "player" | "enemy" | "npc"

    level: number
    initiative: number

    hp_current: number
    hp_max: number

    ac: number
    movement: number
    spell_dc: number

    conditions: Condition[]

## Condition

    name: string
    duration: number

## Encounter

    combatants: Combatant[]

    currentTurnIndex: number
    round: number
    started: boolean

------------------------------------------------------------------------

# Core Features

## Combatant Cards

Each combatant is displayed as a **card in a horizontal bar**.

Card layout:

    +------------------+
    | portrait         |
    |                  |
    | name             |
    | level            |
    | HP               |
    | AC               |
    +------------------+

Card states:

    normal
    active turn
    selected
    dead

Rules:

    active card → highlight border
    dead → grayscale
    selected → glow border

------------------------------------------------------------------------

# Initiative Bar

Component:

    InitiativeBar

Behavior:

    horizontal scroll
    cards ordered by initiative
    current turn highlighted
    drag reorder enabled

Sorting rule:

    initiative DESC

------------------------------------------------------------------------

# Turn Logic

Create utility:

    utils/turnLogic.ts

Functions:

    startCombat(encounter)

    nextTurn(encounter)

    previousTurn(encounter)

Logic:

    nextTurn:
        turnIndex++

        if turnIndex >= combatants.length
            turnIndex = 0
            round++

    previousTurn:
        turnIndex--

        if turnIndex < 0
            turnIndex = combatants.length - 1
            round--

------------------------------------------------------------------------

# HP Logic

Utility:

    utils/hpLogic.ts

Functions:

    damage(combatant, amount)
    heal(combatant, amount)
    setHP(combatant, value)

Clamp rule:

    hp_current = clamp(0, hp_current, hp_max)

Dead rule:

    if hp_current == 0
        state = dead

------------------------------------------------------------------------

# Global State

Create Zustand store:

    combatStore.ts

Store fields:

    encounter
    selectedCombatantId

Actions:

    addCombatant()
    removeCombatant()

    startCombat()

    nextTurn()
    previousTurn()

    updateHP()
    selectCombatant()
    reorderInitiative()

------------------------------------------------------------------------

# UI Components

## CombatControls

Buttons:

    Add Combatant
    Start Combat
    Next Turn
    Previous Turn
    End Combat

Display:

    Round number
    Current turn

------------------------------------------------------------------------

## InitiativeBar

Renders:

    combatants.map(combatant => CombatantCard)

Highlight rule:

    index == currentTurnIndex

------------------------------------------------------------------------

## CombatantCard

Props:

    combatant
    isActive
    isSelected

Displays:

    portrait
    name
    level
    HP
    AC

Click behavior:

    select combatant

------------------------------------------------------------------------

## CombatantDetails

Displays the selected combatant:

    portrait
    name
    level

    HP current/max
    AC
    movement
    spell DC

    conditions list

Buttons:

    -5 HP
    -1 HP
    +1 HP
    +5 HP

------------------------------------------------------------------------

# Drag Reordering

Use **dnd-kit**.

Dragging a card should:

    reorder combatants array
    update initiative order

During combat:

    do NOT change currentTurnIndex

------------------------------------------------------------------------

# Adding Combatants

Default template:

    {
     name: "New Creature",
     hp_current: 10,
     hp_max: 10,
     ac: 10,
     initiative: 10,
     level: 1
    }

------------------------------------------------------------------------

# Example Encounter State

    {
     round: 1,
     currentTurnIndex: 0,
     started: true,
     combatants: [
      {
       name: "Sol",
       hp_current: 38,
       hp_max: 38,
       ac: 17,
       initiative: 18
      },
      {
       name: "Ogre",
       hp_current: 59,
       hp_max: 59,
       ac: 11,
       initiative: 12
      }
     ]
    }

------------------------------------------------------------------------

# Rendering Rules

Always render cards in **initiative order**.

Active card must be **visually obvious**.

HP changes update immediately.

Dead combatants remain visible.

------------------------------------------------------------------------

# Implementation Order

Follow this exact order.

### Step 1

Create types:

    Combatant
    Encounter

### Step 2

Implement store.

### Step 3

Implement turn logic.

### Step 4

Implement HP logic.

### Step 5

Create card UI.

### Step 6

Create initiative bar.

### Step 7

Add drag reorder.

### Step 8

Add combat controls.

### Step 9

Add combatant details panel.

------------------------------------------------------------------------

# Acceptance Criteria

The system must allow:

-   adding combatants
-   sorting by initiative
-   advancing turns
-   HP editing
-   drag reorder
-   round tracking

The current combatant must be visually highlighted.
