# VTT DATA PIPELINE FIX (CODEX)

## CORE PROBLEM
Raw 5etools data is used directly.  
System must resolve → normalize → hydrate → clone.

---

## DATA MODEL RULES

- NEVER store raw strings from 5etools
- EVERYTHING becomes structured objects
- UI reads ONLY normalized objects

---

## 1. TAG RESOLUTION

INPUT:
`{@item rapier}`

ACTION:
- parse tag
- extract type + name
- lookup in DataManager

OUTPUT:
{
  id,
  name: "Rapier",
  type: "weapon",
  data: {...}
}

FAIL → never render raw tag

---

## 2. FILTER RESOLUTION

INPUT:
`{@filter martial melee weapon}`

ACTION:
- query DataManager with filter
- return full item list

OUTPUT:
options: Item[]

UI must render selectable list  
NOT raw string

---

## 3. CLASS FEATURES (CRITICAL)

5etools structure:
- class.classFeatures = REFERENCES
- classFeature[] = ACTUAL DATA

INPUT:
"Rage|Barbarian||1"

ACTION:
- parse string:
  name | class | source | level
- lookup in `classFeature` dataset
- hydrate full object

OUTPUT:
{
  name: "Rage",
  level: 1,
  entries: [...],
  effects: [...]
}

FAIL → you only get names

---

## 4. FEATURE PIPELINE

FOR EACH FEATURE:
- resolve reference → full object
- attach to character.features[]

DO NOT:
- store strings
- skip lookup

---

## 5. ACTION GENERATION

FROM:
- features
- items (weapons)

GENERATE:
actions[]

EXAMPLES:
- Rage → bonus action
- Weapon → attack action

IF actions[] empty → BUG

---

## 6. EQUIPMENT PIPELINE

INPUT:
mixed:
- items
- text
- tags
- filters

PROCESS:
- resolve tags
- resolve filters
- lookup items
- clone objects

OUTPUT:
inventory: Item[]

NO STRINGS

---

## 7. STARTING GOLD

SOURCE:
- class.startingEquipment.gold
- background.startingEquipment.gold

ACTION:
- parse formula (dice or fixed)
- roll OR assign
- update currency state

---

## 8. INVENTORY SYSTEM

REQUIRE:
- create item
- edit item
- remove item

STATE:
inventory: Item[]
currency: { cp, sp, gp, pp }

---

## 9. UI RULES

UI MUST NOT:
- parse tags
- resolve filters
- interpret strings

UI ONLY:
- render normalized data

---

## 10. PIPELINE (STRICT ORDER)

1. import raw JSON  
2. resolve tags  
3. resolve filters  
4. resolve feature references  
5. hydrate full objects  
6. clone to character  
7. generate actions  
8. render UI  

---

## FAILURE SIGNS

- `{@item ...}` visible → tag failure  
- `{@filter ...}` visible → filter failure  
- features show only names → hydration failure  
- no actions → generation failure  
- no gold → parsing failure  
