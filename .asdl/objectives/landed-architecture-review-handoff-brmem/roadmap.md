# Roadmap

## Work

- [x] Inventory current handoff and Branch Memory usage.
  - Identified the handoff-save/load skills, Pi `/handoff:*` extension, `asdl-handoff` list/delete/gc CLI, `brmem` primitives, tests, and local non-authoritative Branch Memory examples.
  - Evidence: `updates/2026-06-05-handoff-inventory.md` records the layered map of branch scope, namespace/base behavior, entry-key handling, overwrite preflight, resume selection, single-handoff deletion, stale/deleted handling, consolidation gaps, and focused test results.
- [x] Define the handoff artifact contract over Branch Memory.
  - Decision: Handoff Artifacts live in Branch Memory namespace `handoff` with flat keys shaped `<semantic-slug>.md`; normal flows do not read the legacy `handoffs` namespace or `session-artifacts/handoffs/...` as fallback storage.
  - Evidence: `docs/pi/handoff-artifacts.md`, `docs/adr/0002-handoff-namespace-singular.md`, handoff skills, `packages/asdl-handoff/CONTEXT.md`, `ts/packages/pi-extensions/CONTEXT.md`, and `CONTEXT-MAP.md` now agree on the singular namespace and flat key contract.
- [x] Align the smallest necessary implementation, skill, or test surface with the contract.
  - Python `asdl-handoff` inventory/list/delete/gc now uses namespace `handoff`; Pi handoff create/pickup/list/tab prompts and direct `brmem` reads/checks use `handoff`; worktree status no longer normalizes `session-artifacts/handoffs/...` into handoff display.
  - Evidence: Python handoff CLI scenarios, plugin smoke tests, Pi extension tests, TypeScript check, and full `just` passed.
- [x] Exercise normal and failure-oriented resume paths.
  - Normal path evidence: Pi pickup tests list with `handoff list`, read selected content through `brmem get --namespace handoff`, and build pickup prompts from the selected artifact.
  - Failure/edge evidence: Python list ignores legacy-only `handoffs` entries after the namespace switch; worktree status displays legacy `handoffs` and `session-artifacts/handoffs/...` as stored instead of canonicalizing them.

## Parked

None yet. Non-handoff Branch Memory UX improvements should be parked here or split into a separate Objective if discovered.
