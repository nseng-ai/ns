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
- [x] Delete the dead `runner` option/field on `RealAregHostGateway` (H).
  - Evidence: `RealAregHostGateway` no longer defines a `runner` field or constructor while command-executing gateways retain runner injection; repo-wide grep found no `new RealAregHostGateway({ runner: ... })` callers; validation passed with `pnpm --dir ts run test -- ts/packages/areg/test/gateways/real-gateways.test.ts` (Vitest observed the full TS suite passing) and `pnpm --dir ts run check`.
- [x] Drop the ignored `cwd`/`env` fields from `AregSkillxWorkspaceCleanupRequest` (I).
  - Evidence: cleanup requests and fake operation logs now carry only `workspaceRoot`; stale cleanup call-site grep shows no callers passing `cwd` or `env`; validation passed with full `pnpm --dir ts run check`, full `pnpm --dir ts run test`, and `pnpm --dir ts exec areg check --path ..`.
- [x] Collapse the eight identity-only `*PathState`/`*TextFileState` aliases to one canonical `AregPathState`/`AregTextFileState` pair (A, alias slice).
  - Evidence: removed the check/init/update/skill-kind path/text aliases from `gateways.ts` and public exports, updated operation imports to use canonical `AregPathState` / `AregTextFileState`, and the stale-symbol grep for `Areg(Check|Init|Update|SkillKind)(PathState|TextFileState)` returned no matches.

### Batch 2 — Unify the skill-kind / replacement model

- [x] Make `areg check` and `areg skill list/show/apply` consume one typed skill-kind classifier; delete bespoke `checkInvokeOnly` (C).
  - Evidence: `check` now builds diagnostics from `inferSkillKindRecord` / typed artifact facts instead of local `checkInvokeOnly`; the slice gate grep for `checkInvokeOnly` and the old local replacement wrapper returned no matches. Scenario coverage proves invoke-only remains valid without Pi exclusion, command-backed facts still require Pi exclusion, and excluded skills still require verified replacement.
- [x] Replace unconditional/global "verified" replacement logic with a real per-surface contract (`hasReplacement(surface)` or verified inventory) (D).
  - Evidence: replacement inspection now exposes `verifiedSurfaces`, fake tests configure exact surfaces, unit tests prove specialized and derived replacements are missing when their surface is absent, and the real gateway populates an areg-visible inventory from the backing-skill command files without changing Pi extension runtime behavior.
  - Follow-up evidence: a later full-suite failure caught drift between the areg-visible replacement inventory and the backing skill command mirror for `ccc-sidebar`; both mirrors now route that skill to the live `ccc:sidebar:pr-summary` command surface, and full `just` passed after the correction.

### Batch 3 — Mutation robustness

- [x] Give `runInit` and `runSkillKindApply` full preflight before any mutation, then apply one composed plan; or surface explicit partial-state evidence (E).
  - Decision: rollback remains out of scope; Batch 3 completes by choosing full preflight for predictable areg-owned mutations plus explicit partial-state evidence when execution still fails.
  - Evidence: PR #1718 adds project-gateway preflight methods, shared per-operation mutation status reporting, init evidence for `npx skills add`, and whole-request planning/preflight for multi-skill `areg skill apply`; validation passed with `pnpm --dir ts run check`, targeted areg mutation/init/skill-apply tests, and `pnpm --dir ts exec areg check --path ..`.

### Batch 4 — Deeper structural decomposition

- [x] Collapse the four project-inspection gateways toward one `AregProjectInspectionGateway` / shared `inspectProject` core and split the `real-gateways.ts`/`fake-gateways.ts` monolith by capability (A, gateway-collapse slice).
  - Decision: finding A is complete via the lower-risk shared operation-layer core + thin wrappers, not a new durable gateway interface.
  - Evidence: `operations/project-inspection.ts` now owns shared core/facet helpers and wrappers for check, skill-kind, init, and update-skills; the branch diff against `areg-preflight-partial-state-evidence` shows those operations importing the shared wrappers instead of each owning bespoke project-inspection choreography.
  - Deferred-with-reason: splitting `real-gateways.ts` / `fake-gateways.ts` by capability is intentionally deferred because this slice did not require real/fake gateway edits, would be a broad monolith-file organization refactor rather than a project-inspection semantics fix, and can be revisited after the remaining `skill-kind.ts` decomposition proves the next capability seam.
- [x] Split `skill-kind.ts` into `{inference, apply-plan, frontmatter-edit}`; document why frontmatter parse and rewrite cannot share one parser (J).
  - Evidence: `ts/packages/areg/src/operations/skill-kind.ts` is now the CLI shell for schemas, handlers, renderers, and project resolution while focused internals live in `skill-kind-inference.ts`, `skill-kind-apply-plan.ts`, and `skill-kind-frontmatter.ts`; inference consumers import the focused module directly and `runSkillKindApply` remains the CLI-facing shell API.
  - Rationale: `skill-kind-frontmatter.ts` documents that inference parses normalized key/value facts while apply planning rewrites source text and must preserve delimiter bounds, line endings, unrelated keys, and body text.
  - Validation: `pnpm --dir ts run check` and `pnpm --dir ts run test -- ts/packages/areg/test/unit/skill-kind-inference.test.ts ts/packages/areg/test/scenario/skill-kind-list-show-cli.test.ts ts/packages/areg/test/scenario/skill-apply-cli.test.ts` passed; the workspace Vitest config observed 240 files / 2476 tests passing for the targeted command.

### Batch 5 — Opportunistic

- [x] Move shim rendering into a tested, shell-quoting generator exercised with adversarial checkout paths (G).
  - Evidence: `ts/packages/areg/test/unit/source-cli-shim.test.ts` exercises the real `ts/scripts/render-cli-shim.py` and `source-cli-shim-template` for `areg` with an adversarial canonical checkout path containing spaces, `&`, `|`, backslash, and a single quote; it asserts no tokens remain, the canonical checkout assignment is shell-quoted rather than raw, `bash -n` accepts the rendered shim, and executing the shim from outside a checkout preserves the exact adversarial path and install hint in the expected exit-2 diagnostic. No renderer change was needed because the existing `shlex.quote` path passed this proof.
  - Validation: `pnpm --dir ts run test -- ts/packages/areg/test/unit/source-cli-shim.test.ts ts/packages/areg/test/unit/package-metadata.test.ts ts/packages/areg/test/scenario/cli-shape.test.ts` and `pnpm --dir ts run check` passed.
- [x] Collapse the version triple source of truth to a single source if `buildCli` can read the package version (K).
  - Evidence: `ts/packages/areg/src/cli.ts` now derives `VERSION` synchronously from `ts/packages/areg/package.json` via `new URL("../package.json", import.meta.url)` and validates that the parsed manifest exposes a string version; the scenario version assertion reads package metadata instead of embedding `0.1.0`, and `package-metadata.test.ts` asserts exported `VERSION` matches the manifest. `package.json` is now the areg version source of truth.
  - Validation: `pnpm --dir ts run test -- ts/packages/areg/test/unit/source-cli-shim.test.ts ts/packages/areg/test/unit/package-metadata.test.ts ts/packages/areg/test/scenario/cli-shape.test.ts` and `pnpm --dir ts run check` passed.

## Parked

(None — all findings are tracked as active Work. Items may be marked deferred-with-reason at closeout rather than parked up front.)
