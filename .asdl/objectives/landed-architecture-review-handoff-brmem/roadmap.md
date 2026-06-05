# Roadmap

## Work

- [ ] Inventory current handoff and Branch Memory usage.
  - Identify the handoff-save/load skills, any CLI helpers they call, and the exact `brmem` operations or assumptions involved.
  - Evidence: concise map of current branch, namespace/base, entry-key, overwrite, and resume behavior.
- [ ] Define the handoff artifact contract over Branch Memory.
  - Decide the default storage convention, what metadata must be visible in artifact text, how stale or ambiguous handoffs are handled, and what belongs outside handoff artifacts.
  - Evidence: contract captured in the user-facing skill/docs or implementation boundary where agents will rely on it.
- [ ] Align the smallest necessary implementation, skill, or test surface with the contract.
  - Prefer tightening existing handoff/brmem interactions over introducing new workflow state.
  - Evidence: targeted tests or documented manual checks cover the changed behavior.
- [ ] Exercise normal and failure-oriented resume paths.
  - Cover at least one successful save/load handoff and one missing, stale, ambiguous, or overwrite-sensitive path.
  - Evidence: reusable findings recorded in an Objective update or closure context.

## Parked

None yet. Non-handoff Branch Memory UX improvements should be parked here or split into a separate Objective if discovered.
