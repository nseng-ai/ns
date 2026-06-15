# Roadmap

## Work

Batched by priority tier (see `review-findings/2026-06-15-areg-ts-cli-combined-review.md`). Batches are ordered; within a batch, order is flexible.

### Batch 1 — Correctness + cheap behavior-preserving cleanup (one tidy commit)

- [ ] Fix git exclude reads to be Git-aware so linked worktrees honor local skill exclusions (F).
  - Policy: direct execution after preview.
  - Evidence: regression test for worktree `.git`-as-file; `areg check` honors exclusions in a linked worktree.
- [ ] Extract verbatim duplications — one `inspectGenericReplacement`, one shared `.pi/settings.json` parser, one `rejectTextState`, one `errorInfo`; delete the dead `errorInfo` export in `init.ts` (B).
  - Evidence: grep shows single definition each; targeted tests pass.
- [ ] Delete the dead `runner` option/field on `RealAregHostGateway` (H).
- [ ] Drop the ignored `cwd`/`env` fields from `AregSkillxWorkspaceCleanupRequest` (I).
- [ ] Collapse the six identity-only `*PathState`/`*TextFileState` aliases to one canonical `AregPathState`/`AregTextFileState` pair (A, alias slice).

### Batch 2 — Unify the skill-kind / replacement model

- [ ] Make `areg check` and `areg skill list/show/apply` consume one typed skill-kind classifier; delete bespoke `checkInvokeOnly` (C).
  - Policy: steer first; confirm any change to `areg check` diagnostics before deleting the bespoke path.
  - Evidence: shared-classifier tests; `check` and `skill` agree on invoke-only/command-converted.
- [ ] Replace unconditional/global "verified" replacement logic with a real per-surface contract (`hasReplacement(surface)` or verified inventory) (D).

### Batch 3 — Mutation robustness

- [ ] Give `runInit` and `runSkillKindApply` full preflight before any mutation, then apply one composed plan; or surface explicit partial-state evidence (E).
  - Policy: steer first; resolve the rollback-vs-preflight open question before implementing.

### Batch 4 — Deeper structural decomposition

- [ ] Collapse the four project-inspection gateways toward one `AregProjectInspectionGateway` / shared `inspectProject` core and split the `real-gateways.ts`/`fake-gateways.ts` monolith by capability (A, gateway-collapse slice).
  - Policy: steer first; confirm the target shape (single gateway vs shared core + thin wrappers) before large edits.
- [ ] Split `skill-kind.ts` into `{inference, apply-plan, frontmatter-edit}`; document why frontmatter parse and rewrite cannot share one parser (J).

### Batch 5 — Opportunistic

- [ ] Move shim rendering into a tested, shell-quoting generator exercised with adversarial checkout paths (G).
- [ ] Collapse the version triple source of truth to a single source if `buildCli` can read the package version (K).

## Parked

(None — all findings are tracked as active Work. Items may be marked deferred-with-reason at closeout rather than parked up front.)
