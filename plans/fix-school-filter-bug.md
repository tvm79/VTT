# Fix School Filter Bug in DataManager Compendiums

## Problem Statement

Filtering spells by School is not working in DataManager Compendiums. The school filter dropdown displays full school names (e.g., "Conjuration") but the database stores schools as abbreviations (e.g., "C"). The filter is not matching because the logic doesn't properly convert between these formats.

## Root Cause Analysis

The issue is in the `/compendium/filters/:type` endpoint at line 1490 in `server/src/routes/data.ts`:

```typescript
options.schools = Array.from(schoolSet).sort().map(s => ({ value: getSchoolValue(s), label: getSchoolLabel(s) }));
```

### Current Behavior:

1. **When building filter options (line 1490):**
   - `getSchoolValue(s)` is used for the `value` field
   - `getSchoolLabel(s)` is used for the `label` field

2. **When filtering (lines 1596 and 2025):**
   - `getSchoolValue(school)` is called on the filter value to convert full words to abbreviations

### The Problem:

The `getSchoolValue` function converts full words to abbreviations:
- Input: "Conjuration" → Output: "c"
- Input: "c" (already abbreviation) → Output: "c" (unchanged)

The `getSchoolLabel` function converts abbreviations to full words:
- Input: "c" → Output: "Conjuration"

**Current code flow:**
1. Database has school value (either abbreviation "C" or full word "Conjuration")
2. `getSchoolValue(s)` is called on database value
   - If abbreviation: returns unchanged (e.g., "C")
   - If full word: converts to abbreviation (e.g., "Conjuration" → "c")
3. User selects option with value (e.g., "C" or "c")
4. Server receives filter value and calls `getSchoolValue(school)` again
5. Query uses `string_contains: "c"` to match database

**The mismatch occurs when:**
- If database stores abbreviations like "C", the option value is "C"
- Server converts to lowercase "c" for query
- Database has "C" (uppercase) - may not match due to case sensitivity

## Solution

Change line 1490 in `server/src/routes/data.ts` to swap the functions:

```typescript
// BEFORE (incorrect):
options.schools = Array.from(schoolSet).sort().map(s => ({ value: getSchoolValue(s), label: getSchoolLabel(s) }));

// AFTER (correct):
options.schools = Array.from(schoolSet).sort().map(s => ({ value: getSchoolLabel(s), label: getSchoolValue(s) }));
```

This ensures:
- The `value` field (sent to server when user selects) contains the full word that `getSchoolValue` can convert to abbreviation
- The `label` field (displayed to user) shows the abbreviation

### Revised Flow:

1. Database has "C" (abbreviation)
2. `getSchoolLabel("C")` → "Conjuration" (full word for value)
3. `getSchoolValue("C")` → "C" (abbreviation for label)
4. Option: { value: "Conjuration", label: "C" }
5. User selects "Conjuration"
6. Server receives "Conjuration"
7. `getSchoolValue("Conjuration")` → "c"
8. Query: `string_contains: "c"` (lowercase)

This ensures proper conversion from full word to abbreviation before database query.

## Files to Modify

1. `server/src/routes/data.ts` - Line 1490

## Implementation Notes

- The server-side filtering code (lines 1596 and 2025) already correctly uses `getSchoolValue()` to convert the incoming filter value to an abbreviation before querying
- No changes needed to client-side code in `FilterPanel.tsx` or `DataManager.tsx`
- The fix only requires changing how the filter options are constructed on the server
