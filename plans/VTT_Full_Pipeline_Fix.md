# VTT COMPLETE DATA PIPELINE FIX (CODEX)

## CORE RULE
Never use raw 5etools strings in UI.
Always resolve → hydrate → normalize → clone.

---

## 1. TAG RESOLUTION

INPUT:
`{@item rapier}`

ACTION:
- parse tag
- lookup in DataManager

OUTPUT:
{ id, name, type, data }

FAIL → raw tag visible

---

## 2. FILTER RESOLUTION

INPUT:
`{@filter martial melee weapon}`

ACTION:
- query DataManager
- return list of valid items

OUTPUT:
options: Item[]

FAIL → raw filter visible

---

## 3. CLASS FEATURES (CRITICAL)

FACT:
- class.classFeatures = progression references
- classFeature[] = full data

INPUT:
"Rage|Barbarian||1"

ACTION:
- parse → name, class, source, level
- lookup in classFeature[]
- return full object

OUTPUT:
{ name, level, entries, effects }

FAIL → only name/level shown

---

## 4. FEATURE PIPELINE

FOR EACH feature:
- resolve reference
- hydrate full data
- store in character.features[]

NO STRINGS

---

## 5. ACTION GENERATION

FROM:
- features
- weapons

GENERATE:
actions[]

EXAMPLES:
- Rage → bonus action
- weapon → attack

FAIL → empty actions[]

---

## 6. EQUIPMENT PIPELINE

PROCESS:
- resolve tags
- resolve filters
- lookup items
- clone objects

OUTPUT:
inventory: Item[]

NO TEXT

---

## 7. STARTING GOLD

SOURCE:
- class.startingEquipment.gold
- background.startingEquipment.gold

ACTION:
- parse dice or fixed
- assign to currency

FAIL → 0 gold

---

## 8. WEAPON STATS

WHEN type === weapon:

COMPUTE:
- ability (DEX if finesse else STR)
- proficiency
- attackBonus = proficiency + ability
- damage = dice + ability

OUTPUT:
{
  name,
  attackBonus,
  damage,
  ability
}

FAIL → no attack/damage

---

## 9. ITEM GROUPING

GROUP inventory BY:
- weapon
- armor
- gear
- consumable
- tool
- other

OUTPUT:
inventory = {
  weapon: [],
  armor: [],
  ...
}

FAIL → flat list

---

## 10. INVENTORY SYSTEM

REQUIRE:
- create item
- edit item
- delete item

STATE:
inventory + currency

---

## 11. UI RULES

UI MUST NOT:
- parse tags
- resolve filters
- interpret strings

UI ONLY renders normalized data

---

## 12. PIPELINE ORDER

1. import JSON
2. resolve tags
3. resolve filters
4. resolve feature references
5. hydrate objects
6. clone to character
7. compute weapon stats
8. generate actions
9. group inventory
10. render

---

## FAILURE SIGNS

- {@item ...} visible → tag fail
- {@filter ...} visible → filter fail
- features only names → feature fail
- no actions → action fail
- no gold → gold fail
- weapons no stats → weapon fail
- flat inventory → grouping fail
