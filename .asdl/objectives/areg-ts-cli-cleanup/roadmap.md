# Roadmap

## Work

Batched by priority tier (see `review-findings/2026-06-15-areg-ts-cli-combined-review.md`). Batches are ordered; within a batch, order is flexible.

### Batch 1 — Correctness + cheap behavior-preserving cleanup (one tidy commit)

- [x] Fix git exclude reads to be Git-aware so linked worktrees honor local skill exclusions (F).
  - Policy: direct execution after preview.
  - Evidence: added `GitGateway.gitPath` backed by `git rev-parse --path-format=absolute --git-path`, routed `RealAregProjectGateway.readLocallyExcludedSkillNames` through it, and covered normal, linked-worktree-shaped, and git-path-failure local exclusion reads in `ts/packages/areg/test/gateways/real-gateways.test.ts`; validation passed with `pnpm --dir ts run test -- ts/packages/asdl-core/test/git-gateway.test.ts ts/packages/asdl-core/test/git-testing.test.ts`, `pnpm --dir ts run test -- ts/packages/areg/test/gateways/real-gateways.test.ts`, `pnpm --dir ts run check`, and final `pnpm --dir ts run test`.
- [x] Extract verbatim duplications — one `inspectGenericReplacement`, one shared `.pi/settings.json` parser, one `rejectTextState`, one `errorInfo`; delete the dead `errorInfo` export in `init.ts` (B).
  - Progress: shared `.pi/settings.json` parser extracted to `operations/pi-settings.ts` and reused by `check` and `skill-kind`; parser now rejects symlinked/non-file `.pi` inputs, and `check` only parses Pi settings for local skills. Shared file-state validation helpers in `operations/file-state.ts` now own `rejectTextState` and optional-directory rejection across Pi settings, init, and project-agent parsing. The dead exported `errorInfo` helper was removed from `operations/init.ts`, leaving the private `real-gateways.ts` helper as the only live helper; `inspectGenericReplacement` was grep-verified as already singular in `real-gateways.ts`.
  - Evidence: local branch diff against `areg-project-gateway-domain-refactor` includes commits `c81711b01`, `eeb645967`, and `a57dddb7e`; PR #1653 corroborates the parser slice; current validation passed with `pnpm --dir ts run test -- ts/packages/areg/test/unit/init-helpers.test.ts ts/packages/areg/test/gateways/real-gateways.test.ts ts/packages/areg/test/unit/pi-replacement.test.ts` (observed Vitest running the full 225-file suite) and `pnpm --dir ts run check`; final grep found no `errorInfo` in `operations/init.ts` / `init-helpers.test.ts` and one `inspectGenericReplacement` implementation in `real-gateways.ts`.
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
