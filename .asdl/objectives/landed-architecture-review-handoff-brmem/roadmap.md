# Roadmap

## Work

- [x] Inventory current handoff and Branch Memory usage.
  - Identified the handoff-save/load skills, Pi `/handoff:*` extension, `asdl-handoff` list/gc CLI, `brmem` primitives, tests, and local non-authoritative Branch Memory examples.
  - Evidence: `updates/2026-06-05-handoff-inventory.md` records the layered map of branch scope, namespace/base behavior, entry-key handling, overwrite preflight, resume selection, stale/deleted handling, consolidation gaps, and focused test results.
- [ ] Define the handoff artifact contract over Branch Memory.
  - Decide whether the current flat `<semantic-slug>.md` Entry Key shape becomes the final contract, whether `session-artifacts/handoffs/...` compatibility normalization should migrate/retire/remain display-only, what metadata must be visible in artifact text, how stale or ambiguous handoffs are handled, and what belongs outside handoff artifacts.
  - Evidence: contract captured in the user-facing skill/docs or implementation boundary where agents will rely on it.
- [ ] Align the smallest necessary implementation, skill, or test surface with the contract.
  - Prefer tightening existing handoff/brmem interactions over introducing new workflow state.
  - Evidence: targeted tests or documented manual checks cover the changed behavior.
- [ ] Exercise normal and failure-oriented resume paths.
  - Cover at least one successful save/load handoff and one missing, stale, ambiguous, or overwrite-sensitive path.
  - Evidence: reusable findings recorded in an Objective update or closure context.

## Parked

None yet. Non-handoff Branch Memory UX improvements should be parked here or split into a separate Objective if discovered.
