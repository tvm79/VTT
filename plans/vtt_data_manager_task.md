# Data Manager Fix

Goal: Normalize compendium data and assign property types so UI can
render correct controls.

## 1. Normalize Structure

All entries must follow:

    {
      "id": "...",
      "type": "spell|monster|item|class",
      "name": "...",
      "book": "...",
      "publisher": "...",
      "description": "...",
      "system": {}
    }

Rules - move gameplay properties into `system` - `description` must be
separate - use camelCase keys - remove `Category`, infer `type`

## 2. Typed Properties

Map properties to types so UI can render controls.

  type      UI
  --------- ----------------
  boolean   toggle
  enum      dropdown
  number    numeric input
  string    text input
  object    grouped fields

Example:

    damageType: enum
    components: {
      verbal: boolean
      somatic: boolean
      material: boolean
    }
    level: number

## 3. Convert Legacy Data

Examples

    "Damage Type": "cold" → system.damageType = "cold"

    "Components": "V, S, M" →
    system.components = {
      verbal: true,
      somatic: true,
      material: true
    }

    "Category": "Spells" → type: "spell"

## 4. Type Schemas

Spell

    level: number
    school: enum
    castingTime: enum
    range: string
    components: object
    damageType: enum

Monster

    size: enum
    creatureType: string
    alignment: string
    challengeRating: number

## 5. Schema Registry

    schemaRegistry = {
      spell,
      monster,
      item,
      class
    }

Flow

    load entry
    detect type
    apply schema
    normalize fields
    validate
    generate UI

## 6. Validation

Check - required fields - correct types - enum values valid
