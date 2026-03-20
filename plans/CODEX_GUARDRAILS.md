# CODEX_GUARDRAILS.md

## Purpose

This file defines **guardrails for Codex** when modifying the VTT
project.

These rules prevent architecture drift, duplicate systems, and
regressions.

------------------------------------------------------------------------

# Architectural Constraints

Codex must **respect the existing architecture**.

Do not introduce new frameworks or systems unless explicitly requested.

Forbidden additions:

-   WindowManager
-   UIManager
-   PanelManager
-   Second global store
-   New rendering engine

The project uses **PixiJS for rendering**.

Do not introduce:

-   Three.js
-   Phaser
-   Konva

------------------------------------------------------------------------

# UI Rules

The UI must maintain this structure:

    App
     ├ Canvas
     ├ DataManager
     │   ├ Compendium
     │   ├ Characters
     │   └ Journals
     └ SheetLayer

Rules:

-   Sheets must render in **SheetLayer**
-   Sheets must not render inside DataManager
-   DataManager is for **data browsing only**

------------------------------------------------------------------------

# Token Interaction Rules

    Single click token → select token
    Double click token → open sheet

Single click must not open UI panels.

------------------------------------------------------------------------

# State Management Rules

The project uses a **single global store**.

Codex must:

-   extend the existing store
-   not create a second store

Example state fields:

    selectedToken
    activeSheet
    openSheet()
    closeSheet()

------------------------------------------------------------------------

# Drag and Drop Protection

The compendium drag-drop pipeline must remain functional.

    Compendium
      ↓
    Drag entry
      ↓
    Drop on canvas
      ↓
    createToken()

If a change risks breaking this flow, stop and report.

------------------------------------------------------------------------

# Safe Refactor Strategy

When modifying large files such as:

    DataManager.tsx

Codex must:

1.  Perform repository discovery
2.  Identify dependencies
3.  Refactor incrementally
4.  Validate behavior after each step

------------------------------------------------------------------------

# Required Agent Workflow

Before modifying code:

    1. Search the repository
    2. Identify related files
    3. Build a dependency map
    4. Propose a change plan

Only after the plan is confirmed should code changes begin.

------------------------------------------------------------------------

# If Architecture Conflict Occurs

If requested changes conflict with existing systems:

    STOP_IMPLEMENTATION
    REPORT_CONFLICT
    PROPOSE_SAFE_ALTERNATIVE
