# SpellSheet --- Design Token + Component Contract Specification

This specification defines the layout structure, design tokens, and
interaction rules for a Spell / Ability Sheet UI.

The interface supports two modes:

ViewMode EditMode

Both modes share the same structural layout but render content
differently.

------------------------------------------------------------------------

# Component Overview

SpellSheet ├─ Header │ ├─ SpellIcon │ ├─ TitleBlock │ │ ├─ SpellName │ │
└─ SpellMetadata │ ├─ SourceBadge │ └─ CloseButton │ ├─ TabNavigation │
├─ Tab (Description) │ ├─ Tab (Details) │ ├─ Tab (Activities) │ └─ Tab
(Effects) │ └─ ContentArea ├─ SummaryPanel ├─ Divider └─
SectionContainer ├─ DescriptionSection ├─ DetailsSection ├─
ActivitiesSection └─ EffectsSection

Only one section is visible depending on the active tab.

------------------------------------------------------------------------

# Design Tokens

## Spacing

--space-xs = 4px\
--space-sm = 8px\
--space-md = 12px\
--space-lg = 16px\
--space-xl = 24px

Usage:

  Element           Token
  ----------------- ------------
  Card padding      --space-lg
  Section spacing   --space-md
  Form row gap      --space-sm
  Icon spacing      --space-sm

------------------------------------------------------------------------

## Size Tokens

--sheet-width = modal width\
--icon-size = 64px\
--small-icon = 16px\
--button-size = 32px\
--input-height = medium

------------------------------------------------------------------------

## Radius

--card-radius = medium\
--panel-radius = small\
--input-radius = small

------------------------------------------------------------------------

# Layout Contract

## SpellSheet Container

display: flex\
flex-direction: column\
width: var(--sheet-width)\
max-height: viewport constrained\
overflow-y: auto

Rules

-   Layout behaves as a modal sheet
-   Content scrolls inside the sheet
-   Header and tabs remain fixed at the top

------------------------------------------------------------------------

# Header

Structure

Header ├─ SpellIcon ├─ TitleBlock │ ├─ SpellName │ └─ SpellMetadata ├─
SourceBadge └─ CloseButton

Layout

display: flex\
align-items: center\
gap: var(--space-md)\
padding: var(--space-lg)

Constraints

-   SpellIcon fixed square
-   TitleBlock grows to fill remaining width
-   CloseButton aligned to far right
-   SourceBadge aligned near top right region

------------------------------------------------------------------------

# TitleBlock

Structure

SpellName\
SpellMetadata

Layout

display: flex\
flex-direction: column\
gap: var(--space-xs)

Example metadata format

1st Level • Abjuration • Spellcasting

------------------------------------------------------------------------

# Tab Navigation

Structure

TabNavigation ├─ Tab ├─ Tab ├─ Tab └─ Tab

Layout

display: flex\
justify-content: flex-start\
gap: var(--space-lg)\
padding-inline: var(--space-lg)

Behavior

-   Only one tab active
-   Clicking tab switches section content
-   Active tab visually emphasized

------------------------------------------------------------------------

# Summary Panel (Overview Mode)

Structure

SummaryPanel ├─ StatRow │ ├─ Label │ └─ Value

Example rows

Casting Time\
Range\
Target\
Components\
Duration\
Materials

Layout

display: grid\
grid-template-columns: auto 1fr\
row-gap: var(--space-sm)\
column-gap: var(--space-md)

Constraints

-   Labels right aligned
-   Values left aligned

------------------------------------------------------------------------

# Divider Element

Structure

Divider ├─ Line ├─ Icon └─ Line

Layout

display: flex\
align-items: center\
gap: var(--space-sm)

Rules

-   Decorative icon centered between lines
-   Used to separate overview and description

------------------------------------------------------------------------

# Description Section

Structure

DescriptionSection ├─ SectionHeader └─ DescriptionText

Layout

display: flex\
flex-direction: column\
gap: var(--space-md)

Content supports

-   formatted text
-   inline icons
-   links

------------------------------------------------------------------------

# Edit Mode

In EditMode, sections convert into form panels.

EditSection ├─ SectionHeader └─ FormGrid

------------------------------------------------------------------------

# Form Grid Layout

display: grid\
grid-template-columns: 1fr 1fr\
gap: var(--space-md)

Field structure

Field ├─ Label └─ Input

Supported input types

-   text input
-   numeric input
-   dropdown select
-   toggle
-   checkbox

------------------------------------------------------------------------

# Example Edit Sections

## Spell Details

SpellDetails ├─ SpellLevel ├─ SpellSchool ├─ SpellComponents ├─
SpellcastingMaterials ├─ SpellcastingMethod ├─ SourceClass └─
SpellcastingAbility

------------------------------------------------------------------------

## Casting

Casting ├─ CastingTime ├─ Range ├─ Duration

Range field

Range ├─ ValueInput └─ UnitSelect

------------------------------------------------------------------------

## Targets

Targets ├─ TargetAmount └─ TargetType

------------------------------------------------------------------------

## Area

Area └─ ShapeSelect

------------------------------------------------------------------------

## Usage

Usage ├─ LimitedUses │ ├─ Spent │ └─ Max

------------------------------------------------------------------------

# Interaction Rules

Tabs

click tab → show corresponding section

View/Edit toggle

ViewMode - formatted display - no inputs

EditMode - editable fields - dropdowns enabled

------------------------------------------------------------------------

# Alignment Rules

-   headers left aligned
-   labels above inputs
-   inputs stretch to column width
-   numeric inputs right aligned

------------------------------------------------------------------------

# Typography Hierarchy

  Element         Importance
  --------------- ------------------
  SpellName       highest emphasis
  SectionHeader   medium emphasis
  FieldLabels     medium
  Values          normal
  Metadata        secondary

------------------------------------------------------------------------

# Responsiveness

If viewport height is limited

-   content scrolls
-   header remains fixed
-   tabs remain visible

------------------------------------------------------------------------

# Implementation Notes

-   Colors come from theme system
-   Typography from global tokens
-   Icons from icon library
-   Layout must support long descriptions
