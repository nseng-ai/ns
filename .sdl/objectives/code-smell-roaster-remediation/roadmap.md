# Roadmap

## Work

Each row is one package/area cluster from the code-smell-roaster sweep. Re-verify findings against current code before implementing; record a disposition (fixed / disposed / routed) per finding when the row is checked off, not just a single line for the whole cluster. A cluster may be split into multiple PRs (e.g., by sub-package) when it's too large for one coherent review unit — split the row into sub-rows at pickup time if so.

- [ ] **infra** — 29 findings (4 high / 13 medium / 12 low) across brmem, clinkr, core, exec, git, github, graphite, cli-runtime, cli-theme, time, test-kit. See `references/infra.md`. Check for overlap with `ts-cli-core-structural-cleanup`'s Git/GitHub gateway dedup rows before implementing.
- [ ] **capabilities** — 24 findings (7 high / 13 medium / 4 low) across flow, slot, land. See `references/capabilities.md`. Check for overlap with `ts-cli-core-structural-cleanup`'s Flow land-stack rows before implementing.
- [ ] **local-pi-tools** — 19 findings (5 high / 12 medium / 2 low) across context-profiler, grill, pr-feedback-watch, pr-previews, runner-subagents, thermo-council, backing-skill-commands. See `references/local-pi-tools.md`. Includes two large Divergent Change god-files (`thermo-council/orchestrator.ts`, `pr-feedback-watch/controller.ts`) that may warrant their own sub-slice.
- [ ] **capability-pi** — 13 findings (1 high / 6 medium / 6 low) across branch-context, ccc, flow, handoff, objective. See `references/capability-pi.md`.
- [ ] **tools** — 12 findings (3 high / 7 medium / 2 low) across areg, packagechk, vibechk. See `references/tools.md`. Check for overlap with `ts-cli-core-structural-cleanup`'s areg god-file decomposition row.
- [ ] **hosts** — 8 findings (2 high / 4 medium / 2 low) across hosts/pi, hosts/sdlcc. See `references/hosts.md`. Includes one large Divergent Change finding in `pi/src/commands/cli-extension.ts`.
- [x] **objective** (package) — 6 findings (0 high / 4 medium / 2 low). See `references/objective-package.md`.
  - fixed: Duplicated Objective target resolution; `resolveObjectiveRecordTarget` now owns root, slug, validity, and record-existence resolution shared by read-objective and check-objective while preserving their result field names.
  - fixed: Duplicated Objective list empty/names render helpers; `emptyMessage` and `renderSlugs` are exported from the shared list renderer and reused by the pretty renderer.
  - fixed: Duplicated tracking-gate result construction; `buildTrackingGateResult` now owns the nested result, counts, defaults, and summary derivation for both found and missing Objective paths.
  - fixed: Repeated archive/unarchive path forks; `objectiveArchivePathRules` keeps source/destination record/root path functions together by direction.
  - fixed: Divergent Change in `api.ts`; client facade code now lives in `objective-api-client.ts`, picker/selection orchestration lives in `objective-selection-flow.ts`, and `api.ts` remains the curated export surface.
  - fixed: Duplicated real-storage path-kind classifiers; `kindFromTypeChecks` classifies both `lstat` and `Dirent` values.
  - validation: `pnpm --dir ts --filter @sdl/objective run check`, `pnpm --dir ts --filter @sdl/objective run test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just dprint-check` passed on 2026-06-30.
- [x] **roaster** — 6 findings (0 high / 4 medium / 2 low). See `references/roaster.md`.
  - fixed: Duplicated reviews-directory validation; `requireReviewsDirectory` now owns the missing/not-directory checks shared by list and load path resolution while preserving existing failure types/messages.
  - fixed: Duplicated omitted-input-file rendering; `formatOmittedReviewInputFile` owns the shared omitted file detail string used by capped prompt headers and findings comment input-coverage output.
  - fixed: Duplicated review usage token summing; `renderReviewRun` now uses the exported `reviewUsageTotalInputTokens` helper from `models.ts` and the local duplicate helper was removed.
  - fixed: Repeated review-role switches in skill metadata; `roastSkillEntryFromDefinition` resolves the display role once and role-specific labels/prompts derive from one role table.
  - fixed: Duplicated review-list alias command wiring; `createReviewListCommand` centralizes the shared schema/result/render/handler wiring used by `review list` and `review ls`.
  - fixed: Duplicated GitHub read error handling in inline publication; `callGithubOrEmptyResult` wraps thrown and gateway error results for changed-file and review-comment reads.
  - validation: `pnpm --dir ts --filter @sdl/roaster run check`, `pnpm --dir ts --filter @sdl/roaster run test`, `just ts-format-check`, `just ts-lint`, and `just ts-check` passed on 2026-06-30.
- [ ] **pi-extensions** (`.pi/extensions`, `.pi/lib`) — 5 findings (0 high / 3 medium / 2 low). See `references/pi-extensions.md`.
- [ ] **aretro** — 5 findings (0 high / 3 medium / 2 low). See `references/aretro.md`.
- [ ] **docs-site** — 4 findings (1 high / 2 medium / 1 low). See `references/docs-site.md`.
- [x] **ccc** — 4 findings (1 high / 3 medium / 0 low). See `references/ccc.md`.
  - fixed: Duplicated dispatch prompt pipeline; `dispatchTrackedBranchPrompt` now owns Branch Memory payload storage, Pi launch command construction, cmux slot launch, and success-message formatting for both current-branch and refreshed-trunk dispatch flows.
  - fixed: Duplicated objective-sidebar exec/envelope handling; `runJsonExecCommand` centralizes startup failures, nonzero/killed results, machine-envelope parsing, and stdout-tail diagnostics while leaving slug and summary-specific validation local.
  - fixed: Message chain in dispatch-plan checkout evidence; `resolveCurrentCheckout` now returns `PlanStoreDirectoryEvidence` directly so dispatch-plan code reads `checkout.repoRoot` and `checkout.sourceBranch` without a single-field wrapper.
  - fixed: Speculative Generality in launch status; unused `ts/packages/ccc/src/launch-status.ts` was removed after re-grep found no importers.
  - validation: `pnpm --dir ts --filter @sdl/ccc run check`, `pnpm --dir ts --filter @sdl/ccc run test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just dprint-check` passed on 2026-06-30.
- [x] **handoff** — 4 findings (0 high / 2 medium / 2 low). See `references/handoff.md`.
  - fixed: Middle Man in destructive presentation; handoff delete/gc rendering now imports `renderDestructiveResultBlock` directly from `@sdl/cli-theme`, and the package-local wrapper/type aliases were removed.
  - fixed: Repeated Switches in handoff gc action handling; `gc-actions.ts` now owns domain action, wire value, label, candidate status, and count bucket together, deriving counting, schema, filtering, conversion, and labels from one table.
  - fixed: Duplicated destructive confirmation flow; `confirmDestructiveAction` centralizes the non-interactive gate, prompt, abort, and decline/confirm result shape used by delete and gc while preserving `--yes`, `--force`, and dry-run behavior.
  - fixed: Duplicated optional override spreading in SDL context; `readHandoffOverrides` now uses `optionalEntry` for all override fields.
  - validation: `pnpm --dir ts --filter @sdl/handoff run check`, `pnpm --dir ts --filter @sdl/handoff run test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just dprint-check` passed on 2026-06-30.
- [x] **branch-context** — 3 findings (1 high / 2 medium / 0 low). See `references/branch-context.md`.
  - fixed: Repeated Switches in branch-context CLI error exits; `classifyBranchContextError` now owns each known error's code and data payload together, so the failure mapper no longer maintains parallel class cascades.
  - fixed: Duplicated Brmem result unwrap handling; `throwBranchContextBrmemError` and `unwrapBranchContextBrmemResult` centralize branch-context Brmem error throwing for attach/list/delete/load paths without changing existing messages.
  - fixed: Duplicated fake put/create cache updates; `InMemoryBranchMemoryGateway.recordEntryWriteResult` now owns the branch-context namespace cache synchronization shared by `putEntry` and `createEntry`.
  - validation: `pnpm --dir ts --filter @sdl/branch-context run check`, `pnpm --dir ts --filter @sdl/branch-context run test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just dprint-check` passed on 2026-06-30.
- [x] **cmux** — 3 findings (1 high / 2 medium / 0 low). See `references/cmux.md`.
  - fixed: Speculative Generality in focused terminal tab staging helpers; unused `createCmuxSurface`, `renameCmuxTab`, and `sendCmuxText` exports and their index re-exports were removed, leaving `launchFocusedCmuxTab` as the package's focused-tab orchestration entry point while preserving `identifyCmuxCaller` for its external caller.
  - fixed: Data Clumps for cmux surface identifiers; `CmuxSurfaceRef` now names the shared `workspaceId`/`surfaceId`/optional `windowId` shape used by rename-tab and send-text gateway params.
  - fixed: Duplicated Code in Pi launch model/thinking types; `PiLaunchThinkingLevel` and `PiLaunchModelInfo` are aliases of the canonical `ThinkingLevel` and `ModelInfo` from `types.ts`.
  - validation: `pnpm --dir ts --filter @sdl/cmux run check`, `pnpm --dir ts --filter @sdl/cmux run test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just dprint-check` passed on 2026-06-30.
- [x] **kernel** — 3 findings (1 high / 2 medium / 0 low). See `references/kernel.md`.
  - fixed: Duplicated selected-command loading in the SDL CLI; `resolveSelectedSdlCommand` now owns candidate loading, diagnostic handling, selected command path capture, and command-info refresh for both normal runs and completion resolver invocations.
  - fixed: Duplicated direct-entry discovery handling; `addDirectEntryCommand` now owns the shared `commandForDirectEntry` success/diagnostic push shape for root files and directory indexes.
  - fixed: Duplicated command CLI info projection; `toCommandCliInfo` now owns the optional group/segments/group-description plus description fields used by static listings, catalog output, and external candidate construction.
  - validation: `pnpm --dir ts --filter @sdl/kernel run check`, `pnpm --dir ts --filter @sdl/kernel run test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just dprint-check` passed on 2026-06-30.
- [x] **plans** — 3 findings (1 high / 2 medium / 0 low). See `references/plans.md`.
  - fixed: Duplicated plan-store repository resolution; `resolvePlanStoreRepositoryContext` and `resolvePlanStoreRepoDirectoryFromContext` now own the shared repo-root/repo-identity/repo-directory derivation used by repo-wide and branch-specific plan-store resolution, while preserving the detached-HEAD failure ordering.
  - fixed: Duplicated CLI plan-store option literals; `planStoreOptions` now builds the shared `cwd`/`git`/`planStoreGateway`/optional-root option shape for list, save, and latest-plan resolution paths.
  - fixed: Shotgun Surgery in saved-plan slug word policy; `MIN_PLAN_SLUG_WORDS` and `MAX_PLAN_SLUG_WORDS` are exported from `plan-persistence.ts`, with prompt construction, output repair, and validation messages deriving from the shared constants.
  - validation: `pnpm --dir ts --filter @sdl/plans run check`, `pnpm --dir ts --filter @sdl/plans run test`, `just ts-format-check`, `just ts-lint`, and `just ts-check` passed on 2026-06-30.
- [x] **sdl-capability-kit** — 3 findings (1 high / 1 medium / 1 low). See `references/sdl-capability-kit.md`.
  - fixed: Duplicated text-generation contracts in testing support; `text-generation-testing.ts` now imports and re-exports the canonical request/result/generator types from `text-generation.ts` while preserving `ScriptedTextGenerator` behavior.
  - fixed: Duplicated command-result shells; `command-result.ts` derives the package-local optional-killed command result shape from the shared `ExecResult`, and checkpoint/pending-worktree modules reuse that alias instead of restating fields.
  - fixed: Brmem option data clumps; `BrmemCallContext` now owns the shared `gateway`/`cwd`/timeout/env/signal option group used by brmem command option types.
  - validation: `pnpm --dir ts --filter @sdl/capability-kit run check`, `pnpm --dir ts --filter @sdl/capability-kit run test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, `just dprint-check`, and `just ts-test-typescript-style-guard` passed on 2026-06-30.
- [x] **address** — 3 findings (0 high / 1 medium / 2 low). See `references/address.md`.
  - fixed: Data Clumps for GitHub PR target payloads; `PrTargetPayload`, `prTargetPayloadSchema`, and `buildPrTargetPayload` now own the shared target shape used by download-feedback and pr-checks payloads/schemas, with `head_ref_oid` included only for pr-checks output.
  - disposed: Speculative Generality in `json-input.ts`; re-probe found file JSON input is existing test-covered behavior in `ts/packages/address/test/unit/json-input.test.ts`, and removing it would require behavior/test churn outside this Objective's no-test-source-edit boundary.
  - fixed: Repeated Switches for PR target failures; `prTargetFailureExit` now maps common `git_failure`, `pr_feedback_failure`, and `detached_head` results, leaving download-feedback and pr-checks operations to handle only their success/miss-specific cases.
  - validation: `pnpm --dir ts --filter @sdl/address run test`, `pnpm --dir ts --filter @sdl/address run check`, `just ts-format-check`, `just ts-lint`, and `just ts-check` passed on 2026-06-30.
- [x] **worktree-status** — 3 findings (0 high / 2 medium / 1 low). See `references/worktree-status.md`.
  - fixed: Repeated Switches for `GtCommitStatus`; `formatGtCommitStatus(commits, "full" | "compact")` now owns the variant switch and both status rendering and footer rendering derive their previous strings from it.
  - fixed: Duplicated Code for renderer contracts; `CustomMessage`, `RenderTheme`, `RenderComponent`, and `WorktreeStatusMessageRenderer` are canonical in `types.ts`, with `status.ts` and `extension.ts` importing the shared contracts instead of redeclaring them.
  - fixed: Data Clumps for GitHub PR status details; `GhPrDetails` now names the shared `prNumber`/`url`/`threads`/`checks` shape used by both available and head-mismatch statuses and by PR detail rendering.
  - validation: `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just ts-test` passed on 2026-06-30.
- [x] **ts-root** (`ts/scripts`, `ts/vitest.*.config.ts`) — 2 findings (0 high / 2 medium / 0 low). See `references/ts-root.md`.
  - fixed: Shotgun Surgery in `ts/vitest.config.ts`; default-test exclusions now derive from `SPECIALIZED_TEST_CATEGORIES`, so adding a specialized category is one registry edit plus its category-specific config rather than a manual exclude-list lockstep edit.
  - fixed: Duplicated Code in `ts/vitest.shared.ts`; `testGlobsFor(subdir?)` owns the canonical two-pattern package test glob shape, and the default, integration, and TypeScript style guard configs all derive their include/exclude globs from that helper/registry.
  - validation: `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just ts-test` passed on 2026-06-30.

## Parked

(none)
