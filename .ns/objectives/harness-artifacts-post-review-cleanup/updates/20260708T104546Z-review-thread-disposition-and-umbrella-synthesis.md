# Review-thread disposition and umbrella synthesis

## Summary

Refreshed unresolved review-thread state for PRs #3121, #3137, #3140, #3158, #3159, #3161, and #3162 with:

```bash
ns address exec pr-review-threads --pr-number <pr> --format json
```

Then replied/resolved evidence-backed fixed or stale threads with repo-owned `ns address exec` primitives only. No raw GitHub API mutation was used. After mutation, the same refresh command showed zero unresolved threads for PRs #3121, #3137, #3140, #3158, #3159, and #3161; PR #3162 has one intentionally unresolved parked AREG-tail thread.

PR #3229 (`Consolidate harness-artifacts schemas and preserve readonly outputs`) is open/submitted at head `d43c4dd46` from `harness-artifacts-schema-duplication-cleanup` to `provision-reconcile-seam-cleanup` and is the PR evidence for the schema/source cleanup bucket.

Disposition table:

| PR    | Thread                  | Bucket                          | Disposition                                                                                                                                           | Mutation result                                            |
| ----- | ----------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| #3158 | `PRRT_kwDOR4YhMs6O7NTb` | home-dir/harness-path ownership | fixed by `NsCliCommandContextInput`, `xdgHomeDir`, `SkillMaterializationContext`, and `HarnessPathContext` ownership cleanup                          | reply + resolve succeeded                                  |
| #3137 | `PRRT_kwDOR4YhMs6Oxej4` | provision/reconcile seams       | fixed by single reconcile action classification path                                                                                                  | reply + resolve succeeded                                  |
| #3121 | `PRRT_kwDOR4YhMs6O0MTk` | provision/reconcile seams       | fixed by shared `conflictingFilesFromDecisions`                                                                                                       | reply + resolve succeeded                                  |
| #3159 | `PRRT_kwDOR4YhMs6OzS1q` | provision/reconcile seams       | fixed by single reconcile outcome builder shape                                                                                                       | reply + resolve succeeded                                  |
| #3159 | `PRRT_kwDOR4YhMs6OzS1u` | provision/reconcile seams       | fixed by roots-once Result-checked path; bare throw removed                                                                                           | reply + resolve succeeded                                  |
| #3159 | `PRRT_kwDOR4YhMs6OzS1w` | provision/reconcile seams       | fixed by shared failure splitting/error adaptation; this thread appeared in the fresh unresolved state though it was omitted from the saved inventory | reply + resolve succeeded                                  |
| #3159 | `PRRT_kwDOR4YhMs6O0K-1` | provision/reconcile seams       | fixed by deleting `previewHarnessArtifactProvision`/`applyHarnessArtifactProvision` and exporting `previewFromPrepared`                               | reply + resolve succeeded                                  |
| #3159 | `PRRT_kwDOR4YhMs6O54-H` | provision/reconcile seams       | fixed by shared `describeProvisionConflict`                                                                                                           | reply + resolve succeeded                                  |
| #3161 | `PRRT_kwDOR4YhMs6OzSl6` | provision/reconcile seams       | fixed by `splitProvisionFirstPartySkillOutcome`                                                                                                       | reply + resolve succeeded                                  |
| #3161 | `PRRT_kwDOR4YhMs6O6UXL` | provision/reconcile seams       | fixed by `ProvisionFirstPartySkillOutcome` using the preview shape                                                                                    | reply + resolve succeeded                                  |
| #3140 | `PRRT_kwDOR4YhMs6Oxehs` | schema/source cleanup           | fixed by readonly Zod array outputs and removal of defensive spreads                                                                                  | reply + resolve succeeded                                  |
| #3140 | `PRRT_kwDOR4YhMs6Oxr-l` | schema/source cleanup           | fixed by shared harness/scope schemas                                                                                                                 | reply + resolve succeeded                                  |
| #3140 | `PRRT_kwDOR4YhMs6Oxr-n` | schema/source cleanup           | fixed by shared diagnostic optional-field metadata                                                                                                    | reply + resolve succeeded                                  |
| #3140 | `PRRT_kwDOR4YhMs6O6Vsp` | schema/source cleanup           | fixed by shared source-type schema/list                                                                                                               | reply + resolve succeeded                                  |
| #3161 | `PRRT_kwDOR4YhMs6O2k90` | schema/source cleanup           | fixed by schema-derived provision plan/file decision types                                                                                            | reply + resolve succeeded                                  |
| #3161 | `PRRT_kwDOR4YhMs6O66dc` | stale                           | current code uses the canonical kernel catalog entry construction path                                                                                | stale reply + resolve succeeded                            |
| #3162 | `PRRT_kwDOR4YhMs6O7Nmh` | stale                           | current code has `export interface ManifestSourceFinding`                                                                                             | stale reply + resolve succeeded                            |
| #3162 | `PRRT_kwDOR4YhMs6O67Wa` | parked/out-of-scope             | AREG `project-fs` error-code literal cleanup is outside this bounded Objective                                                                        | reply-only succeeded; thread intentionally left unresolved |

Mutation command families used:

```bash
ns address exec close-review-threads --thread-ids-json '{"threadIds":[...]}' --body "..." --format json
ns address exec reply-review-thread --thread-id PRRT_kwDOR4YhMs6O67Wa --body "..." --format json
```

Direct evidence rechecked locally before mutation included `NsCliCommandContextInput`, `xdgHomeDir`, `SkillMaterializationContext`, `HarnessPathContext`, `conflictingFilesFromDecisions`, `previewFromPrepared`, `splitProvisionFirstPartySkillOutcome`, `describeProvisionConflict`, shared harness/source schemas, `PROVISION_FILE_DECISION_TYPES`, and `export interface ManifestSourceFinding`. Stale-symbol checks found no live `reconcileConflictedOutcome`, `previewHarnessArtifactProvision`, `applyHarnessArtifactProvision`, local `const harnessSchema`/`const scopeSchema`, source-type enum literal repetition, old provision plan/file decision interfaces, or old per-field `optionalEntry(...)` diagnostic transform calls in the scoped harness-artifacts paths.

Validation evidence relied on the previous completed updates:

- home-dir/harness-path package checks/tests and `just ts-format-check` in `updates/20260707T234420Z-home-dir-harness-path-ownership.md`;
- provision/reconcile package checks/tests, lint, and `just ts-format-check` in `updates/20260708T004545Z-provision-reconcile-seam-cleanup.md`;
- schema/source package check/test and `just ts-format-check` in `updates/20260708T041129Z-schema-source-of-truth-cleanup.md`.

Fresh structural validation for this final disposition row is recorded by the command results run after this update.

## Objective Impact

The final roadmap row, **Disposition PR review threads and synthesize to the umbrella**, is complete. Every relevant fixed or stale thread was replied/resolved with direct evidence; the only remaining unresolved thread is `PRRT_kwDOR4YhMs6O67Wa`, explicitly replied to and parked as AREG-tail work outside this child Objective.

The child Objective is closure-ready and was synthesized into `skill-management-subsystem`. The only known check caveat is the pre-existing immutable-update heading issue in `updates/20260707T234420Z-home-dir-harness-path-ownership.md`; this update does not repair historical provenance.

## Follow-Ups

- If AREG-tail cleanup becomes worthwhile, handle `PRRT_kwDOR4YhMs6O67Wa` in a separate AREG-focused cleanup, not in this closed child Objective.
- Continue umbrella work in the existing rows for `remote-artifact-module-acquisition` and follow-on uninstall/stale-after-upgrade/rename cleanup.
