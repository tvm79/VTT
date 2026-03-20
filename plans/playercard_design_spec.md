# PlayerCard --- Design Token + Component Contract Specification

This specification defines the **design tokens**, **layout contract**,
and **behavioral rules** for the `PlayerCard` UI component.\
Colors and typography must inherit from the application's global theme.

------------------------------------------------------------------------

# Component Overview

    PlayerCard
     ├─ Header
     │   ├─ Avatar
     │   ├─ IdentityStack
     │   │   ├─ PlayerName
     │   │   └─ PlayerRole
     │   └─ Timestamp
     ├─ TimerBar
     ├─ ResourceRow
     │   ├─ LeftResource (value + icon)
     │   └─ RightResource (value)
     ├─ MainValue
     └─ ControlRow
         ├─ ControlValue
         └─ ExpandButton

The component is a **compact vertical information card** designed for
player status display.

------------------------------------------------------------------------

# Design Tokens

## Spacing

    --space-xs: 4px
    --space-sm: 8px
    --space-md: 12px

Usage:

  Element                    Token
  -------------------------- --------------
  Header gap                 `--space-xs`
  Horizontal padding         `--space-sm`
  Section vertical spacing   `--space-sm`
  Icon gap                   `--space-xs`

------------------------------------------------------------------------

## Size Tokens

    --avatar-size: 28px
    --icon-size: 14px
    --button-size: 22px
    --timer-height: 22px
    --card-width: compact fixed width (~260px)

------------------------------------------------------------------------

## Radius

    --card-radius: small (6–8px)
    --inner-radius: small (4px)

------------------------------------------------------------------------

# Typography Scale

Visual hierarchy:

  Element          Relative Weight
  ---------------- ------------------
  MainValue        Highest emphasis
  PlayerName       Medium emphasis
  ResourceValues   Medium emphasis
  ControlValue     Medium emphasis
  TimerText        Neutral
  PlayerRole       Secondary
  Timestamp        Secondary

------------------------------------------------------------------------

# Layout Contract

## PlayerCard

Layout rules:

    display: flex
    flex-direction: column
    width: var(--card-width)
    overflow: hidden
    border-radius: var(--card-radius)

Constraints:

-   Sections stacked vertically
-   Each section spans full card width
-   Compact spacing between sections

------------------------------------------------------------------------

# Header

Structure

    Header
     ├─ Avatar
     ├─ IdentityStack
     │   ├─ PlayerName
     │   └─ PlayerRole
     └─ Timestamp

Layout

    display: flex
    align-items: center
    gap: var(--space-xs)
    padding-inline: var(--space-sm)

Constraints

-   Avatar is fixed size square
-   IdentityStack grows to fill space
-   Timestamp aligned right using `margin-left: auto`
-   IdentityStack arranged vertically

------------------------------------------------------------------------

# TimerBar

Structure

    TimerBar
     └─ TimerText

Layout

    display: flex
    justify-content: center
    align-items: center
    height: var(--timer-height)
    margin-inline: var(--space-sm)

Constraints

-   Timer text centered horizontally
-   Timer bar spans card width minus margins

Example content:

    2d20kh

------------------------------------------------------------------------

# ResourceRow

Structure

    ResourceRow
     ├─ LeftResource
     │   ├─ Value
     │   └─ Icon
     └─ RightResource
         └─ Value

Layout

    display: flex
    justify-content: space-between
    align-items: center
    padding-inline: var(--space-sm)

Left group

    display: flex
    align-items: center
    gap: var(--space-xs)

Constraints

-   LeftResource aligned left
-   RightResource aligned right
-   Icon size uses `--icon-size`

------------------------------------------------------------------------

# MainValue

Structure

    MainValue
     └─ Value

Layout

    display: flex
    justify-content: center
    align-items: center
    padding-block: var(--space-sm)

Constraints

-   Value centered horizontally
-   Largest typography scale in component

Example

    10

------------------------------------------------------------------------

# ControlRow

Structure

    ControlRow
     ├─ ControlValue
     └─ ExpandButton

Layout

    display: flex
    align-items: center
    justify-content: space-between
    padding-inline: var(--space-sm)

Button constraints

    width: var(--button-size)
    height: var(--button-size)
    display: flex
    align-items: center
    justify-content: center

Constraints

-   ControlValue aligned left
-   ExpandButton aligned right

------------------------------------------------------------------------

# Interaction Contract

## Expand Button

State machine

    collapsed
    expanded

Behavior

    collapsed  -> arrow icon points upward
    expanded   -> arrow rotates 180 degrees

The button toggles the `PlayerCard` expanded state.

------------------------------------------------------------------------

# Alignment Rules

-   All horizontal rows vertically center children
-   Numeric values align visually with icons
-   MainValue always centered

------------------------------------------------------------------------

# Implementation Notes

-   Colors must come from the global theme
-   Fonts must come from the typography system
-   Component must support dynamic values
-   Layout must remain stable with variable text lengths
