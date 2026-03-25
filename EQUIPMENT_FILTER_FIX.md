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
