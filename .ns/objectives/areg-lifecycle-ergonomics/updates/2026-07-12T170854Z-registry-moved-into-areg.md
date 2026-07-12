# Trunk refresh: registry moved into areg; all five friction points still open

## Summary

Rebaselined against trunk `HEAD` (`c1cb8d5d3e3ef65287230fd1fc9255db3d465797`). Five
commits touched areg since the prior refresh basis (`a814ebe36`); one is material to
this record:

- **Commit `16ea42059` moved the command-backed skill registry into areg.** The path
  cited in Scope item 2 — `ts/packages/hosts/command-backed-skill-registry/src/index.ts`
  — no longer exists (`git ls-files` empty for that package); the registry now lives at
  `ts/packages/tools/areg/src/command-backed-skill-registry.ts` and is exported from
  `@nseng-ai/areg`. Consequence: `@nseng-ai/pi-tools` now depends on `@nseng-ai/areg`
  (package.json dependency plus imports in `backing-skill-commands/specs.ts` and
  `extension.ts`), so the assumption "areg has zero inbound dependents" is no longer
  literally true. Scope item 2, the Assumptions bullet, and the registry-mutation risk
  were corrected; a new open question asks whether the removal-story fix path shifts
  with areg now owning the registry.

All five friction points re-verified still open at HEAD:

- Kind round-trip: `skill` group remains `find`/`list`/`show`/`apply` only
  (`operations/skill-kind.ts`); no `reconcile`.
- Removal/cleanup: no `areg skill remove`, no doctor `--fix`; `doctor skills` uses only
  the per-skill `commandBackedSkillSurface` lookup — no registry-row enumeration, so
  dead rows remain unflagged (doctor-skills.ts changed only for the move's import path).
- Apply ordering: `planPiSettingsOperation` skips when the entry is already present but
  toggle-off filters in place and toggle-on appends at the end — no
  position-preserving/sorted write (logic byte-identical to authoring commit
  `1d3b90e35`).
- Hash semantics: `check.ts` validates `computedHash` format only (placeholder /
  64-hex, lines ~457-470); no `createHash`/content hashing anywhere in areg src; no
  fork marker.
- Implied-kind surfacing: inference module feeds `show`/`check` but no
  mismatch/contradiction signal exists in operations output.

Supporting facts re-verified: `docs/conventions/upstream-skill-melding.md`,
`skills-lock.json`, `@nseng-ai/harness-artifacts` dependency, `skill-management` skill,
and the open `skill-management-subsystem` umbrella all present.

Provenance: objective-refresh basis target=c1cb8d5d3 from=trunk-HEAD

## Objective Impact

No scope, criteria, or roadmap-status change — all five rows remain `[ ]`, record fully
open and planning-stage. `objective.md` was rebaselined: registry location corrected in
Scope item 2, the zero-inbound-dependents assumption weakened to reflect pi-tools'
consumption of the areg-owned registry, the registry-mutation risk reframed as
within-package, and one open question added.

## Follow-Ups

None. Not closure-ready: no friction point is implemented.
