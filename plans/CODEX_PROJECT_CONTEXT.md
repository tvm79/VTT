# CODEX_PROJECT_CONTEXT.md

## Purpose

This file provides Codex with the **architectural context of the VTT
project** so that it can make correct decisions when modifying the
codebase.

Providing structured repository context improves reliability and
accuracy of coding agents. It helps them understand dependencies,
architecture, and design constraints before making changes.

------------------------------------------------------------------------

# Project Overview

This project is a **Virtual Tabletop (VTT)** built with:

-   React
-   TypeScript
-   PixiJS (Canvas renderer)
-   Zustand-style global state store

The application allows tabletop RPG sessions to run digitally.

Core capabilities include:

-   Scene rendering
-   Token management
-   Combat tracking
-   Compendium browsing
-   Character sheets
-   Journals
-   Audio management

------------------------------------------------------------------------

# Core Architecture

## UI Structure

    App
     ├ Canvas (Pixi Scene)
     ├ UI Controls
     ├ DataManager
     │   ├ Compendium
     │   ├ Characters
     │   └ Journals
     └ SheetLayer

Important rule:

Sheets must **never render inside DataManager**.

Sheets render in:

    SheetLayer

This ensures sheets remain visible even when DataManager is closed.

------------------------------------------------------------------------

# Entity Model

The VTT follows a typical tabletop architecture.

## Actors

Actors represent entities with data.

Examples:

    Monster
    Character
    NPC

Actors contain:

-   stats
-   abilities
-   hit points
-   metadata

------------------------------------------------------------------------

## Tokens

Tokens represent actors **inside scenes**.

    Token
     ├ id
     ├ actorId
     ├ position
     ├ rotation
     └ sceneId

A token references an actor.

    Token → Actor

Tokens are rendered in Pixi.

------------------------------------------------------------------------

## Scenes

Scenes represent maps or battle environments.

Scenes contain:

    Tokens
    Tiles
    Lighting
    Fog of War
    Walls

Scene rendering is handled by Pixi.

------------------------------------------------------------------------

# Interaction Rules

Token interactions must follow strict rules.

    Single click token → select token
    Double click token → open sheet

Selecting a token must **not open UI panels automatically**.

------------------------------------------------------------------------

# Compendium System

The compendium stores reusable game content.

Examples:

    Monsters
    Items
    Spells
    Abilities

Users can:

-   browse entries
-   drag entries to the scene
-   spawn tokens

------------------------------------------------------------------------

# Drag and Drop Flow

    Compendium
       ↓
    Drag entry
       ↓
    Drop on canvas
       ↓
    Create Token

Refactors must **not break this pipeline**.

------------------------------------------------------------------------

# Global State

The project uses a centralized store.

Example state:

    selectedToken
    activeSheet
    sceneData
    tokens
