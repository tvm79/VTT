# ItemSheet --- Design Token + Component Contract Specification

This specification defines the layout structure, design tokens, and
interaction rules for a Weapon / Item Sheet UI.

The interface supports two modes:

ViewMode EditMode

------------------------------------------------------------------------

# Component Overview

ItemSheet ├─ Header │ ├─ ItemIcon │ ├─ ItemIdentity │ │ ├─ ItemName │ │
└─ ItemMeta │ ├─ ItemStats │ └─ HeaderActions │ ├─ TabNavigation │ ├─
DescriptionTab │ ├─ DetailsTab │ ├─ ActivitiesTab │ └─ EffectsTab │ └─
ContentArea ├─ SummaryBar ├─ Divider └─ SectionContainer ├─
DescriptionSection ├─ DetailsSection ├─ ActivitiesSection └─
EffectsSection

------------------------------------------------------------------------

# Data Mapping

  UI Element    JSON Source
  ------------- --------------------------
  ItemName      item.name
  ItemType      system.type.value
  Damage        system.damage.base
  Properties    system.properties
  Weight        system.weight.value
  Price         system.price.value
  Description   system.description.value
  Activity      system.activities

------------------------------------------------------------------------

# Design Tokens

## Spacing

--space-xs = 4px\
--space-sm = 8px\
--space-md = 12px\
--space-lg = 16px\
--space-xl = 24px

------------------------------------------------------------------------

## Size Tokens

--icon-size-large = 80px\
--icon-size-small = 18px\
--input-height = medium\
--panel-width = modal width

------------------------------------------------------------------------

## Radius

--card-radius = medium\
--panel-radius = small\
--input-radius = small

------------------------------------------------------------------------

# Layout Contract

## ItemSheet Container

display: flex\
flex-direction: column\
width: modal\
height: viewport constrained\
overflow: hidden

Rules

-   Header fixed
-   Tabs fixed
-   Content scrollable

------------------------------------------------------------------------

# Header

Structure

Header ├─ ItemIcon ├─ ItemIdentity │ ├─ ItemName │ └─ ItemMeta ├─
ItemStats └─ HeaderActions

Layout

display: flex\
align-items: center\
gap: var(--space-lg)\
padding: var(--space-lg)

------------------------------------------------------------------------

# ItemIdentity

ItemName\
ItemMeta

Example

Greataxe\
Weapon • Martial Melee

------------------------------------------------------------------------

# ItemStats

Structure

ItemStats ├─ Quantity ├─ Weight └─ Price

Example

Quantity: 1\
Weight: 7 lb\
Price: 30 gp

------------------------------------------------------------------------

# TabNavigation

TabNavigation ├─ Description ├─ Details ├─ Activities └─ Effects

Layout

display: flex\
gap: var(--space-lg)\
padding-inline: var(--space-lg)

------------------------------------------------------------------------

# SummaryBar

Structure

SummaryBar ├─ HitModifier └─ DamageFormula

Example

+5 to hit\
1d12 + 3 slashing

------------------------------------------------------------------------

# Divider

Divider ├─ Line ├─ Icon └─ Line

------------------------------------------------------------------------

# DescriptionSection

Structure

DescriptionSection ├─ SectionHeader └─ DescriptionText

Example content

This enormous axe features two twin crescent blades mounted on either
side of a tall spiked shaft.

------------------------------------------------------------------------

# DetailsSection

Structure

DetailsSection ├─ WeaponDetails ├─ RangeSection ├─ DamageSection └─
UsageSection

------------------------------------------------------------------------

# WeaponDetails

Fields

WeaponType\
BaseWeapon\
ProficiencyLevel\
Mastery

------------------------------------------------------------------------

# WeaponProperties

Structure

PropertyGrid ├─ PropertyToggle ├─ PropertyToggle ├─ PropertyToggle

Examples

Heavy\
Two-Handed\
Reach\
Thrown\
Versatile

------------------------------------------------------------------------

# RangeSection

Structure

RangeSection ├─ DistanceInput └─ UnitSelect

------------------------------------------------------------------------

# DamageSection

Structure

DamageSection ├─ DiceCount ├─ DiceType ├─ Bonus └─ DamageType

Example

1 d12 + 3 slashing

------------------------------------------------------------------------

# UsageSection

Structure

UsageSection ├─ LimitedUses │ ├─ Spent │ └─ Max

------------------------------------------------------------------------

# ActivitiesSection

Structure

ActivitiesSection ├─ ActivityList │ └─ ActivityItem

Example

Attack\
Activation: Action\
Type: Melee Weapon Attack

------------------------------------------------------------------------

# EffectsSection

Structure

EffectsSection └─ ActiveEffectsList

------------------------------------------------------------------------

# Interaction Rules

## Attack Roll

click attack → roll attack → roll damage

## Property Toggle

toggle property → update item properties

## Tab Navigation

click tab → load section

------------------------------------------------------------------------

# Typography Hierarchy

  Element          Importance
  ---------------- ------------
  ItemName         highest
  DamageFormula    high
  SectionHeaders   medium
  FieldLabels      medium
  Metadata         secondary

------------------------------------------------------------------------

# Responsiveness Rules

If viewport height decreases

-   content scrolls
-   tabs remain visible
-   header remains fixed

------------------------------------------------------------------------

# Implementation Notes

-   Damage formulas must support dice parsing
-   Properties stored as token list
-   Activities support multiple attack types
-   Sheet must support non-weapon items
