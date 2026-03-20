# D&D 5e Compendium Architecture Specification

## 1. Core Principle

D&D content types must not share a flat generic structure.

Each type (Spell, Monster, Item, etc.) has distinct semantic fields.
The database must reflect this using:

- A generic metadata entry (CompendiumEntry)
- A strict type discriminator (type)
- A type-specific table with structured columns
- Optional raw JSON storage for traceability
- Indexed fields for performant filtering

Do NOT store everything as a single unstructured JSON blob.

---

# 2. Global Entry Model

Every compendium entry must contain:

id (uuid)
system (string)
type (string)
name (string)
slug (unique)
source (string)
summary (string, optional)
raw (jsonb, optional)
createdAt
updatedAt

All type-specific models reference CompendiumEntry.id.

---

# 3. D&D Content Types and Required Structured Fields

## 3. Spell

level (int)
school (string)
castingTime (string)
components (string)
range (string)
duration (string)
saveType (string, nullable)
damageType (string, nullable)
description (text)

---

## 4. Monster

size (string)
creatureType (string)
challengeRating (float)
hitPoints (int)
armorClass (int)
alignment (string)
actions (jsonb)
traits (jsonb)

---

## 5. Item

itemCategory (string)
rarity (string)
requiresAttune (boolean)
damage (string, nullable)
damageType (string, nullable)
armorClass (int, nullable)
properties (jsonb)

---

## 6. Feat

prerequisites (string)
benefits (text)
repeatable (boolean, optional)

---

## 7. Character Class

hitDie (int)
spellcastingAbility (string, nullable)
features (jsonb)
subclasses (jsonb)

---

## 8. Race

size (string)
speed (int)
abilityBonuses (jsonb)
traits (jsonb)

---

## 9. Background

skillProficiencies (jsonb)
toolProficiencies (jsonb)
feature (text)

---

## 10. Condition

effects (text)

---

# 11. Indexing Strategy (PostgreSQL)

Spell(level)
Spell(school)
Monster(challengeRating)
Monster(size)
Item(itemCategory)
Item(rarity)
CompendiumEntry(system, type)
CompendiumEntry(source)

Full-text search:

search_tsv (tsvector generated column)
GIN(search_tsv)

Optional JSON indexes only where needed.

---

# 12. Normalization Rules

1. Detect type
2. Normalize into canonical structure
3. Extract structured fields into typed model
4. Store raw JSON for traceability
5. Generate slug and contentHash

Never store unstructured property blobs as primary data.

---

# 13. Source Toggle System

CampaignEnabledSource:
campaignId
system
source
enabled (boolean)

Source toggling must not delete data.
Search must respect enabled sources per campaign.

---

# 14. Performance Targets

- Tens of thousands of entries
- Indexed level and CR filtering
- Full-text search via GIN
- Minimal JSON scanning

---

End of specification.
