# Equipment Type Filter Fix - Documentation

## Problem
The "Equipment Type" dropdown in the Compendium wasn't filtering correctly when combined with "Equipment" item type.

## Root Causes Found

### 1. Route Order Bug (Server)
- **Location**: `server/src/routes/data.ts`
- **Issue**: The route `/compendium/:type` was defined BEFORE `/compendium/search`
- **Effect**: Express matched `/compendium/search?type=item` as `/compendium/:type` with `type = "search"` instead of the search endpoint
- **Fix**: Moved the `/compendium/search` route before `/compendium/:type`

### 2. Case Sensitivity (Server)
- **Location**: `server/src/routes/data.ts`
- **Issue**: Equipment type filters used uppercase codes ('HA', 'LA', 'MA') but database stores lowercase ('ha', 'la', 'ma')
- **Fix**: Updated `EQUIPMENT_TYPE_FILTERS` and parent EQP filter to use lowercase codes

### 3. Parent EQP Filter Too Restrictive (Server)
- **Location**: `server/src/routes/data.ts`
- **Issue**: When equipmentType was specified, the parent "Equipment" filter was still being applied, causing conflicts
- **Fix**: Skip the parent filter when a specific equipmentType is selected

### 4. Wrong API Endpoint (Client) - **MAIN ISSUE**
- **Location**: `client/src/components/DataManager.tsx` (line ~2065)
- **Issue**: The browse function was calling `/api/data/compendium/${type}` (e.g., `/api/data/compendium/item`) which is a simple endpoint that doesn't support the equipmentType filter
- **Fix**: Changed to use `/api/data/compendium/search` endpoint which supports all filters including equipmentType

## Test Results
- **Item Type: Equipment**: 1197 items ✓
- **Heavy Armor**: 39 items ✓
- **Light Armor**: 31 items ✓
- **Medium Armor**: 43 items ✓
- **Shield**: 20 items ✓
- **Wondrous Item**: 929 items ✓
- **Clothing**: 179 items ✓

## Key Lesson
When fixing filter issues, check BOTH:
1. Server-side - API endpoint logic
2. Client-side - Which API endpoint is being called

The client was calling the wrong endpoint (`/compendium/:type`) instead of the search endpoint (`/compendium/search`) that supports all filters.

---

# Consumables Type Filter - Added in Same Fix

## What Was Added

### 1. Server - Filter Function
- **Location**: `server/src/routes/data.ts`
- Added `getConsumableTypeFilter()` function that returns filters for:
  - Ammunition (A)
  - Food (G with food flag)
  - Poison (G with poison flag)
  - Potion (P)
  - Rod (RD)
  - Scroll (SC)
  - Trinket (W)
  - Vehicle Equipment (VEH)
  - Wand (WD)
  - Wondrous Item (W)

### 2. Server - API Parameter
- **Location**: `server/src/routes/data.ts`
- Added `consumableType` parameter to `/compendium/search` endpoint
- Added filter logic for when `itemType === 'CON'` and `consumableType` is specified

### 3. Server - Filter Options
- **Location**: `server/src/routes/data.ts`
- Added `consumableTypes` to filter options (line ~2673)
- Already had logic to add 'CON' to item types when consumable codes exist in database

### 4. Client - API Call
- **Location**: `client/src/components/DataManager.tsx`
- Added `consumableType` parameter to API call

### 5. Client - Filter UI
- **Location**: `client/src/components/FilterPanel.tsx`
- Added `consumableType` to FilterState interface
- Added `consumableTypes` to FilterOptions interface
- Added logic to clear consumableType when itemType changes from 'CON'
- Added dropdown UI for Consumable Type (shows when 'CON' is selected)

## How It Works
1. User selects "Consumables" from Item Type dropdown
2. "Consumable Type" dropdown appears with options
3. When user selects a consumable type, API is called with:
   - `itemType=CON`
   - `consumableType=<selected type>`
4. Server returns filtered items matching the consumable type
