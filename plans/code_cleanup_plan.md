# Code Review & Improvement Plan

## Executive Summary

This document outlines the findings from a comprehensive code review of the VTT (Virtual Tabletop) project. Multiple issues were identified including code duplication, unused files, excessive debug logging, and architectural concerns.

---

## Issues Found

### 1. Code Duplication - Data Normalizer (HIGH PRIORITY)

**Problem:** Three versions of the same data normalizer file exist:
- `client/src/dataNormalizer.ts` (~10KB)
- `server/src/data/schemas/dataNormalizer.ts` (~10KB)  
- `shared/src/dataNormalizer.ts` (~22KB) - **This is the most complete version**

The client and server versions are nearly identical and are incomplete (missing schema definitions). The shared version contains proper schemas for spells, monsters, items, classes, feats, species, and backgrounds.

**Recommendation:**
1. Remove `client/src/dataNormalizer.ts` 
2. Remove `server/src/data/schemas/dataNormalizer.ts`
3. Configure client and server to import from `shared` package

---

### 2. Unused/Backup Files (MEDIUM PRIORITY)

**Files to Delete:**
| File | Reason |
|------|--------|
| `client/src/components/GameBoard.tsx.backup` | Old backup file (~98KB) |
| `client/src/components/CombatTrackerLegacy.tsx` | Legacy component, likely replaced by CombatTracker.tsx |

---

### 3. Excessive Debug Logging (MEDIUM PRIORITY)

**Problem:** 165+ console.log/warn/error statements in client code, 92+ in server code. Many are clearly debug statements that should be removed or replaced with proper logging.

**Files with most debug statements:**
- `client/src/components/GameBoard.tsx` - ~50+ console.log statements
- `client/src/systems/GodRaySystem.ts` - ~15 console.log statements
- `client/src/utils/gameTime.ts` - 6 console.log statements
- `client/src/services/socket.ts` - 5+ console.log statements

**Recommendation:** Remove excessive debug logging, keep only error logging that helps with production debugging.

---

### 4. Existing Save/Load Plan (IN PROGRESS)

A separate plan exists at [`plans/save_fix_plan.md`](./save_fix_plan.md) addressing:
- Atmospheric fog settings not being saved
- Audio sources not loading
- Grid opacity not being saved

This plan should be completed separately.

---

### 5. Unused/Unreferenced Assets

**Files in `client/assets/effects/unused/`:** 
- `aurora1-4.webp`, `fire_01-02.webp`, `flame_01-04.webp`, `ice.webp`, `ice-background.webp`, etc.
- These should either be removed or documented as备用 assets

---

## Proposed Cleanup Tasks

### Task Group 1: Remove Duplicated Code
- [ ] Delete `client/src/dataNormalizer.ts`
- [ ] Delete `server/src/data/schemas/dataNormalizer.ts`
- [ ] Update imports in client/server to use shared package

### Task Group 2: Remove Backup/Legacy Files  
- [ ] Delete `client/src/components/GameBoard.tsx.backup`
- [ ] Delete `client/src/components/CombatTrackerLegacy.tsx` (verify no imports first)

### Task Group 3: Clean Up Debug Logging
- [ ] Remove debug console.log from `client/src/utils/gameTime.ts`
- [ ] Remove debug console.log from `client/src/systems/GodRaySystem.ts`
- [ ] Remove debug console.log from `client/src/components/GameBoard.tsx`
- [ ] Review and clean debug logging in other files

### Task Group 4: Asset Cleanup
- [ ] Review unused assets in `client/assets/effects/unused/`
- [ ] Decide whether to remove or document them

---

## Impact Assessment

| Task | Complexity | Risk | Benefit |
|------|------------|------|---------|
| Remove duplicated dataNormalizer | Medium | Low | Reduced maintenance burden |
| Delete backup files | Low | Very Low | Cleaner codebase |
| Clean debug logging | Medium | Low | Better production performance |
| Asset cleanup | Low | Very Low | Reduced bundle size |

---

## Next Steps

1. **Approve this plan** - Confirm which tasks should be implemented
2. **Implement in phases** - Start with low-risk tasks (backup file deletion)
3. **Test thoroughly** - Ensure no functionality is broken
4. **Address save/load issues** - Complete the existing `save_fix_plan.md`

---

*Generated: 2026-03-15*
