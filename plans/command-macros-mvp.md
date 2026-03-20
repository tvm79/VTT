# Command Macros MVP Rollout Plan

## Scope

MVP includes command execution for:

- `announce`
- `randomTable`
- `rollSequence`
- `scene` (GM-only)

Implemented core components:

- Parser: `client/src/macros/commandParser.ts`
- Dispatcher: `client/src/macros/dispatchCommandMacro.ts`
- Handlers: `client/src/macros/handlers/*`
- UI integration: `client/src/components/MacrosPanel.tsx`

## Guarded release strategy

1. Keep command macros GM-authored by default (`isGlobal` configurable per macro).
2. Restrict `scene` execution to GM in dispatcher.
3. On malformed payloads, fail soft by posting a chat error instead of throwing UI errors.
4. Preserve legacy macro compatibility by continuing to read existing `vtt_macros` from localStorage.

## Validation checklist

- [x] Build passes: `npm run build:client`
- [x] Existing `roll` macros still execute with 3D/local fallback
- [x] Existing `chat` macros still execute unchanged
- [x] `command` macros execute via dispatcher
- [x] Parser rejects invalid JSON payloads gracefully
- [x] `scene` command blocked for non-GM
- [x] Default command templates are seeded for discoverability

## UX acceptance checklist

- [x] Macro create form supports `command` type
- [x] Macro edit form supports changing macro type to/from `command`
- [x] Input placeholder adapts for command JSON payloads
- [x] Inline hint explains supported commands

## Post-MVP hardening backlog

1. Add real test runner integration (Vitest/Jest) and convert `client/src/macros/__tests__/commandMacros.spec.ts` into CI-executed tests.
2. Add schema versioning for command payload migration.
3. Add richer authoring UX (structured form builder per command instead of raw JSON).
4. Add optional command-level permission model (GM-only, player-safe, session-owner-only).
5. Add telemetry for command failures to detect malformed payload patterns.

## Dedicated rolltable system (Phase 2 in progress)

- `randomTable` command now supports `tableId`-first payload and can still read legacy inline `entries`.
- Rolltable persistence is stored separately from macros so tables are reusable across commands.
- Macros panel includes rolltable management controls and links `randomTable` commands to table IDs.
- Legacy command payload migration path exists for previously saved inline table macros.
