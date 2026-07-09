# Rebaseline AREG-overlap risk prose to the landed reconciliation

## Summary

Trunk-explicit, non-closing rebaseline against ground truth at HEAD. Two bullets in
`## Assumptions and Risks` still described AREG reconciliation as pending work, but the
closed `npm-bundled-artifact-provisioning` and `harness-artifact-vocabulary-reconciliation`
Subobjectives had already landed it. Verified at HEAD:

- **AREG's `npx skills` wrapping is gone.** No `npx skills`/`npx-skills` reference remains
  in `ts/packages/tools/areg/src`; the `npx-skills` gateway, `areg init` bootstrap-clone,
  `update-skills`, and `skillx` temp-workspace surfaces are removed. So the bullet claiming
  "the remaining coordination surface is the landed `@nseng-ai/areg` codebase itself (its
  `npx skills` gateway and `skills-lock.json` operations)" was false.
- **`skills-lock.json` parsing was pushed down.** `ts/packages/tools/areg/src/operations/lockfile.ts`
  no longer exists; the parser lives at
  `ts/packages/capabilities/harness-artifacts/src/skills-lockfile.ts`. Only `check.ts`
  remains among areg's lockfile-adjacent operations.
- **AREG's "managed artifacts" collision is resolved.** Zero "managed artifact" occurrences
  in areg src; `src/operations/skill-kind.ts` now says **harness overlays**, and root
  `CONTEXT.md` carries the harness-artifact / harness-overlay vocabulary cluster. The bullet
  claiming the term "is still live" and that reconciliation "includes renaming AREG's overlay
  sense" was stale — that reconciliation already closed (2026-07-07 vocabulary child).

Other contract facts re-verified unchanged and accurate: all seven frontmatter edges resolve
to real records; the only open children are `remote-artifact-module-acquisition` (live `[~]`
row) and the upstream `ship-objectives-to-customers` edge; `@nseng-ai/harness-artifacts`
exists at `ts/packages/capabilities/harness-artifacts` with `ns skills list/path/install`;
the Pup reference remains at `references/pup-skill-management-report.md`. `ns objective check`
is clean (0 errors, 0 warnings).

Provenance: objective-refresh basis target=a814ebe365b9164fdcd31c3cf09c681be670c4f0 from=trunk-HEAD

## Objective Impact

- `objective.md` `## Assumptions and Risks`: the two AREG-overlap bullets rewritten to landed
  ground truth — the overlap is largely reconciled by the two closed Subobjectives, and the
  only residual coordination surface is the parked areg local-logic push-down row (gated on a
  second runtime consumer). The bare-"artifact" collision bullet now records the vocabulary
  reconciliation as resolved rather than pending.
- No scope, completion-criteria, edge, or roadmap changes; no closure. The umbrella stays
  open because `remote-artifact-module-acquisition` is in flight and the uninstall/stale/rename
  follow-on row remains `[ ]`.

## Follow-Ups

- None new. Keep the `remote-artifact-module-acquisition` `[~]` row current and synthesize its
  closure evidence here when it closes (fire-and-forget defense).
