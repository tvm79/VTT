# Codex Refactor Task --- VTT DataManager Architecture

## Context

You are working inside a **TypeScript / React VTT project using
PixiJS**.

The current architecture contains a **large `DataManager.tsx`
component** responsible for:

-   Compendium data
-   Characters
-   Journals
-   Rendering entity sheets
-   Managing floating panels

This coupling causes several issues:

1.  Clicking a token opens DataManager unintentionally.
2.  Sheets are rendered inside DataManager and disappear when the panel
    is closed.
3.  DataManager is too large and mixes unrelated responsibilities.

The goal is to **incrementally refactor the UI architecture** without
breaking existing functionality.

------------------------------------------------------------------------

# Desired Architecture

The final UI layout should look like this:

    App
     ├ Canvas (Pixi scene)
     ├ DataManager
     │   ├ Compendium
     │   ├ Characters
     │   └ Journals
     └ SheetLayer

Rules:

-   Sheets must **NOT** render inside DataManager
-   Sheets must render in **SheetLayer**
-   **Single click token → select token**
-   **Double click token → open sheet**

------------------------------------------------------------------------

# Critical Safety Rules

Before implementing anything:

1.  Search the codebase first.
2.  Reuse existing components and patterns.
3.  Do not introduce duplicate systems.

Forbidden new systems:

-   WindowManager
-   UIManager
-   PanelManager
-   Second global store
-   Second rendering engine

Use the existing architecture wherever possible.

------------------------------------------------------------------------

# Phase 1 --- Repository Discovery (Analysis Only)

Before making changes, inspect the codebase and produce:

    CODEBASE_DISCOVERY_REPORT

    UI_ROOT_FILE:
    DATA_MANAGER_FILE:
    DATA_MANAGER_IMPORTERS:

    SHEET_COMPONENTS_FOUND:

    SHEET_STATE_LOCATION:

    TOKEN_EVENT_HANDLERS:

    DRAG_DROP_FLOW:

    STORE_LOCATION:

    WINDOW_SYSTEM_FOUND:

    DEPENDENCY_GRAPH:

    RISK_POINTS:

    REFACTOR_STRATEGY:
    ORDER_OF_OPERATIONS:

Focus on:

### DataManager

Locate:

    DataManager.tsx

Determine:

-   which UI components render inside it
-   which state variables control panels
-   how sheets are rendered

Look for variables such as:

    floatingPanels
    panelForTypedView
    openPanel
    closePanel

------------------------------------------------------------------------

### Sheet Components

Search for components containing:

    Sheet
    Panel

Examples:

    CharacterSheetPanel
    JournalPanel
    CreaturePanel
    SpellPanel

Determine where they are rendered.

------------------------------------------------------------------------

### Token Interaction

Search for Pixi token handlers:

    pointerdown
    pointertap
    dblclick
    selectToken

Determine whether token selection triggers:

    openDataManager
    openSheet
    setActivePanel

Single click must not open UI panels.

------------------------------------------------------------------------

### Drag-Drop System

Identify how tokens are created.

Search for:

    dragstart
    onDrop
    createToken
    spawnToken

Map the flow:

    Compendium → Drag → Canvas → Token creation

Ensure refactor does not break this flow.

------------------------------------------------------------------------

### Global Store

Search for:

    useGameStore
    zustand
    redux
    context

Determine whether the store already contains:

    selectedToken
    activeSheet
    openPanel

If so, extend it rather than creating new state systems.

------------------------------------------------------------------------

# Phase 2 --- Split DataManager

Create three components:

    Compendium.tsx
    Characters.tsx
    Journals.tsx

Do not use the word **Browser**.

Responsibilities:

### Compendium

Handles:

-   monsters
-   items
-   spells
-   compendium search
-   drag-drop sources

### Characters

Handles:

-   character lists
-   player characters
-   NPC actors

### Journals

Handles:

-   journal entries
-   campaign notes
-   lore

### DataManager After Refactor

    <DataManager>
      <Compendium />
      <Characters />
      <Journals />
    </DataManager>

DataManager becomes a **layout container only**.

------------------------------------------------------------------------

# Phase 3 --- Create SheetLayer

Create:

    SheetLayer.tsx

Purpose:

Render active sheets independent of DataManager.

Example structure:

    SheetLayer
     ├ CharacterSheetPanel
     ├ JournalPanel
     ├ CreaturePanel
     └ SpellPanel

Example pattern:

``` tsx
function SheetLayer() {
  const activeSheet = useGameStore(s => s.activeSheet)

  if (!activeSheet) return null

  switch (activeSheet.type) {

    case "character":
      return <CharacterSheetPanel id={activeSheet.id} />

    case "journal":
      return <JournalPanel id={activeSheet.id} />

  }
}
```

------------------------------------------------------------------------

# Phase 4 --- Move Sheet State to Store

Move sheet state from DataManager to the global store.

Add:

    activeSheet
    openSheet(type,id)
    closeSheet()

Example:

    activeSheet = {
     type: "character",
     id: "char_123"
    }

------------------------------------------------------------------------

# Phase 5 --- Remove Sheet Rendering From DataManager

Remove any rendering of:

    CharacterSheetPanel
    CreaturePanel
    SpellPanel
    JournalPanel

DataManager must become **data navigation only**.

------------------------------------------------------------------------

# Phase 6 --- Fix Token Interaction

Single click:

    selectToken(tokenId)

Remove any calls to:

    openDataManager
    openSheet
    openPanel

Double click:

    openSheet("creature", token.actorId)

------------------------------------------------------------------------

# Phase 7 --- Mount SheetLayer

Update root UI layout:

    <App>
      <Canvas />
      <DataManager />
      <SheetLayer />
    </App>

------------------------------------------------------------------------

# Phase 8 --- Validation Tests

### Token selection

    Click token
    → token becomes selected
    → DataManager does NOT open

### Sheet opening

    Double click token
    → sheet opens

### DataManager independence

    Close DataManager
    Double click token
    → sheet still opens

### Drag-drop

    Drag monster from Compendium
    Drop on canvas
    → token created

------------------------------------------------------------------------

# Implementation Strategy

-   Refactor incrementally
-   Do not rewrite DataManager in one step
-   Preserve drag-drop functionality
-   Do not rename existing sheet components
-   Validate after each phase

------------------------------------------------------------------------

# How to Prompt Codex

Start with:

    Follow the instructions in CODEX_REFACTOR_VTT.md.

    Begin with Phase 1 — Repository Discovery.
    Produce the CODEBASE_DISCOVERY_REPORT.
    Do not modify code until the report is complete.

Then continue with:

    Proceed with Phase 2.
    Perform the refactor incrementally.
    Validate after each phase.
