# CreatureSheet --- Design Token + Component Contract Specification

This specification defines the layout structure, design tokens, and
interaction rules for a Creature / Monster / NPC sheet UI.

The interface is optimized for GM usage during encounters and for rapid
stat visibility.

------------------------------------------------------------------------

# Component Overview

CreatureSheet ├─ Header │ ├─ Portrait │ ├─ CreatureIdentity │ │ ├─
CreatureName │ │ └─ CreatureMeta │ ├─ ProficiencyBlock │ └─
HeaderActions │ ├─ AttributeBar │ ├─ AbilityScore (STR) │ ├─
AbilityScore (DEX) │ ├─ AbilityScore (CON) │ ├─ AbilityScore (INT) │ ├─
AbilityScore (WIS) │ └─ AbilityScore (CHA) │ ├─ CreatureStatsRow │ ├─
Initiative │ ├─ Speed │ ├─ ArmorClass │ ├─ HitPoints │ └─
SpecialResources │ ├─ ContentLayout │ ├─ Sidebar │ │ ├─ Movement │ │ ├─
SkillsList │ │ ├─ Senses │ │ └─ Languages │ │ │ └─ MainPanel │ ├─
SearchBar │ ├─ ActionsSection │ ├─ BonusActionsSection │ ├─
ReactionsSection │ └─ TraitsSection │ └─ UtilityToolbar

------------------------------------------------------------------------

# Data Mapping

  UI Component     JSON Source
  ---------------- ------------------------------------
  CreatureName     actor.name
  CreatureMeta     system.details.type, alignment, cr
  Ability Scores   system.abilities
  HP               system.attributes.hp
  Movement         system.attributes.movement
  Senses           system.attributes.senses
  Languages        system.traits.languages
  Skills           system.skills
  Actions          items\[\] type weapon
  Traits           items\[\] type feat

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

--portrait-size = 120px\
--ability-card-width = 90px\
--sidebar-width = 260px\
--row-height = 40px\
--icon-size = 18px

------------------------------------------------------------------------

## Radius

--panel-radius = medium\
--input-radius = small\
--badge-radius = small

------------------------------------------------------------------------

# Layout Contract

## CreatureSheet Container

display: flex\
flex-direction: column\
width: large modal\
height: viewport constrained\
overflow: hidden

Rules

-   Header fixed
-   AttributeBar fixed
-   Content scrolls vertically

------------------------------------------------------------------------

# Header

Structure

Header ├─ Portrait ├─ CreatureIdentity ├─ ProficiencyBlock └─
HeaderActions

Layout

display: flex\
align-items: center\
gap: var(--space-lg)\
padding: var(--space-lg)

Constraints

-   Portrait fixed square
-   Identity expands
-   HeaderActions aligned right

------------------------------------------------------------------------

# CreatureIdentity

CreatureName\
CreatureMeta

Example

Orc\
Medium • Humanoid (Orc) • Chaotic Evil

------------------------------------------------------------------------

# AttributeBar

AbilityScore ├─ Label ├─ Modifier └─ Value

Hierarchy

Modifier (largest)\
Score value\
Ability label

------------------------------------------------------------------------

# CreatureStatsRow

Structure

CreatureStatsRow ├─ Initiative ├─ Speed ├─ ArmorClass ├─ HitPoints └─
SpecialResources

Example

HP: 15\
Speed: 30 ft

------------------------------------------------------------------------

# Sidebar

Sidebar ├─ Movement ├─ SkillsList ├─ Senses └─ Languages

Layout

width: var(--sidebar-width)\
display: flex\
flex-direction: column\
gap: var(--space-md)

------------------------------------------------------------------------

# SkillsList

SkillItem ├─ SkillName └─ SkillModifier

Example

Arcana -2\
Athletics +3

------------------------------------------------------------------------

# Senses

Senses ├─ Darkvision └─ PassivePerception

Example

Darkvision 60\
Passive Perception 10

------------------------------------------------------------------------

# Languages

Languages ├─ LanguageTag ├─ LanguageTag

Example

Common\
Orc

------------------------------------------------------------------------

# MainPanel

MainPanel ├─ SearchBar ├─ ActionGroup ├─ ActionGroup └─ ActionGroup

------------------------------------------------------------------------

# SearchBar

SearchBar ├─ SearchInput └─ FilterButtons

Behavior

-   Filters visible actions

------------------------------------------------------------------------

# ActionGroup

Actions\
Bonus Actions\
Reactions\
Traits

Structure

ActionGroup ├─ SectionHeader └─ ActionList

------------------------------------------------------------------------

# ActionList

ActionItem ├─ ActionIcon ├─ ActionInfo │ ├─ ActionName │ └─ ActionMeta
├─ Uses ├─ RollValue └─ Formula

Example

Greataxe\
+5 attack\
1d12 + 3 slashing

------------------------------------------------------------------------

# UtilityToolbar

UtilityToolbar ├─ EditButton ├─ EffectsButton ├─ NotesButton ├─
RollButton

Layout

vertical icon column\
aligned to right side

------------------------------------------------------------------------

# Interaction Rules

## Action Roll

click action → roll attack → roll damage

## Expand Action

click expand icon → show description

## Search

input text → filter action list

------------------------------------------------------------------------

# Responsiveness Rules

If viewport width decreases

-   sidebar collapses
-   stats stack vertically
-   toolbar becomes floating

------------------------------------------------------------------------

# Typography Hierarchy

  Element           Importance
  ----------------- ------------
  CreatureName      highest
  AbilityModifier   high
  SectionHeaders    medium
  ActionNames       medium
  Metadata          secondary

------------------------------------------------------------------------

# Implementation Notes

-   Actions must support multiple attack modes
-   Dice formulas rendered as rollable elements
-   Action list supports sorting
-   Sheet must remain readable during combat
