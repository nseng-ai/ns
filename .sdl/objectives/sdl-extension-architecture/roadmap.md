# Roadmap

## Work

- [x] Reset the SDL CLI kernel and restore `changes` as the first project-local extension.
  - Policy: direct execution after preview.
  - Evidence: the kernel command registry no longer imports or registers privileged domain commands, SDL scenario/unit coverage exercises an empty built-in catalog and selected project-local `changes`, and the command later moved into the grouped flow extension as `.sdl/extensions/flow/src/commands/changes.ts` / `sdl flow changes`. Verification included the full Vitest suite, TypeScript typecheck/lint/format checks, dprint check, and source searches for default command registration and stale built-in/mirror wording.

- [x] Migrate checkpoint creation (`cp`) as a project-local mutating command extension.
  - Policy: direct execution after preview for code/docs/tests; ask before running a real mutating checkpoint command as validation.
  - Evidence: checkpoint creation is restored through `.sdl/extensions/flow/src/commands/cp.ts` as `sdl flow cp`, with `--dry-run` as the non-mutating preview boundary. SDL and Pi tests exercise selected project-extension loading, default faked commit behavior, dry-run no-mutation, model repair/failure paths, branch/clean-worktree refusals, typed git diagnostics, and Pi delegation. The old built-in checkpoint implementation remains removed, old `/code:*` plus nested checkpoint aliases remain absent, and no public SDK helpers were promoted solely for checkpoint convenience.

- [x] Extract repeated worktree helpers inside the project-local extension boundary without promoting new SDK surface.
  - Policy: direct execution after preview for code/docs/tests; keep public SDK promotion behind the documented evidence threshold.
  - Evidence: `.sdl/extensions/flow/src/shared/worktree.ts` is the project-local helper seam for flow commands that need git snapshot loading, env lookup, command detail formatting, pending-worktree errors, and checkpoint commit creation while continuing to treat `@sdl/sdl/sdk` as the public author boundary. This validates extension-owned shared helpers as the middle tier between one-off command-local duplication and public SDK promotion; it does not by itself justify a new kernel or SDK Git helper.

- [x] Migrate PR metadata regeneration as a project-local GitHub-facing command extension.
  - Policy: direct execution after preview for implementation; ask before mutating real GitHub PR state.
  - Evidence: `.sdl/extensions/flow/src/commands/regenerate-pr.ts` restores PR metadata regeneration as `sdl flow regenerate-pr`; `.sdl/extensions/flow/package.json` registers it in the grouped flow extension; SDL scenario coverage exists at `ts/packages/sdl/test/scenario/regenerate-pr-cli.test.ts`; docs and Pi mirrors expose `/sdl:flow:regenerate-pr` without old flat or `/code:*` compatibility aliases. This slice keeps GitHub/PR-description policy in the project-local command/helper layer rather than promoting a broad GitHub Gateway or managed-region API into the public SDL SDK.

- [x] Migrate submit as the highest-pressure project-local command extension.
  - Policy: direct execution after preview for implementation; ask before running real submit, restack, push, PR edit, or other external mutations.
  - Evidence: `.sdl/extensions/flow/src/commands/submit.ts` restores submit as `sdl flow submit` with local/project-helper copies of checkpoint, Graphite submit, GitHub PR metadata, managed PR-description, raw-log, and model failure-summary orchestration; the SDL kernel remains empty of repository workflow built-ins; the old inactive submit built-in wrapper and submit-failure interpretation module were removed. Pi mirrors the grouped `/sdl:flow:submit` surface, old flat/legacy submit aliases remain absent, and the submit behavior matrix is preserved by faked `git`/`gt`/`gh` scenario tests.

- [x] Migrate land as a project-local Graphite/GitHub stack-landing command extension.
  - Policy: direct execution after preview for implementation; ask before running real land, merge, restack, push, PR edit, or other external mutations.
  - Evidence: `.sdl/extensions/flow/src/commands/land.ts` establishes the missing project-local `sdl flow land` CLI surface and delegates to `runLandCli` from `@sdl/ccc/land` with `--yes` and `--dry-run` options. `.sdl/extensions/flow/package.json` registers the command; `ts/packages/pi-extensions/src/sdl-extension.ts` mirrors it as `/sdl:flow:land` with `FULL` CLI parity; `docs/pi/README.md`, `ts/packages/sdl/README.md`, and context docs describe grouped flow ownership and absent legacy aliases. The landing outcome/failure matrix remains covered in CCC land tests; this slice records CCC lower-package delegation as the accepted boundary rather than promoting a public landing/Graphite-stack SDK interface.

- [x] Rework Pi SDL mirrors/adapters for project-local command ownership.
  - Policy: steer first if dynamic Pi registration or command taxonomy changes are proposed.
  - Evidence: Pi now exposes grouped static mirrors under `/sdl:flow:*` for the selected project-local flow commands, including `changes`, `cp`, `autobranch`, `autoslot`, `submit`, `regenerate-pr`, `push`, `land`, and `pull-trunk`. `ts/packages/pi-extensions/src/sdl-extension.ts` delegates through `registerCliCommandExtension` to `sdl flow <name>` and records `FULL` parity for those mirrors; docs state that dynamic arbitrary SDL extension mirroring remains parked and old flat `/sdl:*`, `/sdl:code:*`, and `/code:*` lifecycle aliases are not retained.

- [x] Promote the first command-result evidence helpers into the public SDL SDK.
  - Policy: direct execution after the promotion report selected the proof-of-mechanism surface.
  - Evidence: `@sdl/core/exec` owns `commandSucceeded()` and `formatCommandEvidence()`, `@sdl/sdl/sdk` re-exports them, the jiti virtual SDK module binds them for user-authored `.sdl/extensions/*.ts` modules, and the project-local `push` flow command imports them instead of carrying local copies. SDK type coverage and the virtual-module mirror test cover the public surface; the push scenario validates selected extension loading through `@sdl/sdl/sdk`. The checkpoint helper cleanup deliberately did not widen this public SDK surface.

- [x] Document the emerging SDL kernel and extension SDK model.
  - Policy: direct execution after preview; steer first before finalizing public extension terminology that affects authors.
  - Evidence: SDL README/context language distinguishes the SDL kernel from project-local command policy, records grouped project-local extensions as the current command-first mechanism, keeps future bundled extensions as deferred design space, and documents the command-first SDK promotion rule. The SDK reference states that `@sdl/sdl/sdk` is intentionally small, owns curated lower-package re-exports as first-party author vocabulary, and remains the authoritative export inventory. Pi docs state that SDL extension discovery is CLI-oriented today and exact `/sdl:flow:*` mirrors are static engineered adapters requiring explicit package tests/parity metadata. `.sdl/extensions/AGENTS.md` records the readable extension boundary, helper-promotion escalation path, and generated/bundled artifact caution.

- [x] Record the command-first closure boundary and spawn or park follow-up capability work.
  - Policy: steer first before creating child Objectives for bundled or sophisticated capability migrations.
  - Evidence: `updates/2026-06-23-command-first-closure-boundary.md` records the final command-first disposition without creating child Objectives or closing this Objective. The update separates public SDK promotion, project-local shared helpers, lower-package delegation, static Pi mirrors, and future bundled-extension or sophisticated-workflow design. It parks dynamic Pi mirrors, bundled first-party extensions, nested command trees, and broader Handoff/Objectives/Slots/Branch Context/Roaster/PR Address/CCC/Pi workflow modeling as explicit follow-up space rather than hidden scope creep.

## Flow capability-area consolidation

This track reframes the flow shared-code work from function-level extraction to **capability-area consolidation**: the unit of work is a recurring feature area, not an individual helper. It stays within the internal-migration-export and project-local shared-helper tiers and adds **no** new public `@sdl/sdl/sdk` surface. Public SDK promotion remains deferred (per the Objective's command-first stance and the user's explicit "map readiness only" direction); each area instead carries a tracked SDK-readiness so a future graduation is one steer-first decision away, not a rediscovery. See `updates/2026-06-23-flow-shared-code-track.md` for the originating decision record.

### Maturity ladder

Every flow capability area sits on one rung and the rows below move it toward its target rung:

1. **raw** — command-local logic built directly on kernel primitives (`ctx.exec`, `ctx.textGenerator`, `fs`/`os`/`path`); duplicated per command.
2. **flow-shared** — extracted into `.sdl/extensions/flow/src/shared/`, consumed by ≥2 flow commands.
3. **internal-export** — the real implementation lives in a workspace package and is re-exposed through an `@sdl/sdl/*` internal-migration-export subpath, then re-exported via `flow/src/shared/`. This is the ceiling for this track.
4. **public-sdk** — graduated into `@sdl/sdl/sdk` as author API. **Deferred**; readiness is tracked, promotion is not done here.

The kernel deliberately provides only low-level primitives (`SdlExtensionApi`: `exec`, `textGenerator`, `stdout`/`stderr`/`onOutput`, `confirm`, `env`, `cwd`). Every area below is domain logic layered on top of those primitives, which is why it recurs across commands.

### Capability-area readiness matrix

Durable reference; update the rung/readiness as rows land. "Consumers" lists the flow commands that exercise the area.

| Area                                                                          | Consumers                                                                 | Current rung                                                                                                                                                                                                                                                        | Target rung (this track)                                                                                     | SDK readiness                                   |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| A1 Process exec + evidence                                                    | all                                                                       | public-sdk (`commandSucceeded`/`formatCommandEvidence`) + kernel `exec`; submit no longer carries local `spawn`; command-specific evidence formatting stays in readable command/package owners where no shared helper exists                                        | target met without additional SDK promotion                                                                  | graduated                                       |
| A2 Git repository ops (snapshot/status/diff/branch/commit)                    | cp, changes, autobranch, push; submit/regenerate-pr through package seams | flow-shared local mechanics in `shared/git.ts` + `worktree.ts`, plus package-owned Git gateways in `sdl-flow` shared modules and `@sdl/sdl/pending-worktree`; `push` keeps command-local push policy while using the helper                                         | target met for this track; no new public SDK surface                                                         | high (gateway shape proven ≥3 commands) — defer |
| A3 GitHub-PR access (`gh pr view`, details, patch-id)                         | submit, regenerate-pr                                                     | `sdl-flow`-owned: `shared/pr-description.ts` + `shared/submit.ts` import `RealGithubPrGateway` from `@sdl/core/submit` directly (2026-06-24 relocation), superseding the `@sdl/sdl/submit` / `@sdl/sdl/pr-description` internal-export route                        | target met through package-owned flow seams; standalone `@sdl/sdl/github-pr` subpath dropped                 | n/a — flow-only, not SDK-bound                  |
| A4 PR-description generation (managed region, prompt, truncation, validation) | submit, regenerate-pr                                                     | `sdl-flow`-owned: `shared/pr-description.ts` over `@sdl/core/submit` plus `shared/submit.ts`; both consumers delegate to package-owned PR-description orchestration, and the `@sdl/sdl/pr-description` subpath was removed                                          | target met without adding public SDK surface                                                                 | n/a — flow-only, not SDK-bound                  |
| A5 Model gen + validate/repair loop                                           | changes, cp, autobranch; submit checkpoint path via package seam          | flow-shared command-facing helper in `shared/model-generation.ts` over internal-export shims (`text-generation.ts`, `text-helpers.ts`); package-owned prompt/validation/repair stays in `@sdl/sdl/*`; submit-failure interpretation remains command-local by design | target met without public SDK promotion                                                                      | medium                                          |
| A6 Graphite/stack ops (`gt submit/restack/branch info/trunk`)                 | submit, autobranch (raw); land (CCC delegation)                           | lower-package delegation accepted for flow: submit routes through `sdl-flow` `shared/submit.ts` → `@sdl/graphite/submit`, land through `@sdl/ccc/land`, and autobranch through `@sdl/autobranch` with follow-up direct-`gt` ownership debt                          | target met without a flow-shared `gt` seam; future direct-`gt` cleanup belongs below flow in `@sdl/graphite` | low/deferred; no public SDK surface             |
| A7 CCC CLI delegation (exec-adapter + stdio accumulation + exit→ok/fail)      | land, autoslot, pull-trunk                                                | flow-shared helper completed in `.sdl/extensions/flow/src/shared/ccc-cli.ts`; three commands delegate shared I/O/result mapping there while keeping command-specific CCC inputs local                                                                               | target met without public SDK promotion                                                                      | low (helper only, never SDK)                    |
| A8 Checkpoint/worktree snapshot                                               | cp, autobranch (via `worktree.ts`); submit through `sdl-flow` shared code | `sdl-flow` shared plus internal-export: submit uses relocated `runCheckpointIfPending`/`RealCheckpointGateway` from `shared/checkpoint.ts`, while cp/autobranch use the flow worktree seam                                                                          | target met for checkpoint consumption; remaining generic Git disposition stays in A2                         | medium (overlaps A2)                            |
| A9 Scratch/temp prompt + message I/O (`fs`/`os`/`path`/`crypto`)              | submit, regenerate-pr, autobranch                                         | internal-export (`@sdl/sdl/temp-files`) plus command/package-local callers; current flow shared files are `checkpoint-message.ts`, `git.ts`, `model-generation.ts`, `text-generation.ts`, `text-helpers.ts`, `worktree.ts`, and `ccc-cli.ts`                        | target met for temp-file and message I/O needs; durable submit raw-log policy remains command-local          | low–medium                                      |

### Sequencing rule

Foundational primitives (A1, A9) first; then the gateways `submit` depends on (A2, A3); then generation/PR-description (A4, A5); then the boilerplate cleanups (A7) and the Graphite ownership call (A6); then the `submit` rewrite that consumes all of them; then docs + matrix update. `submit.ts` is a first-class design input throughout — every seam is shaped against its eventual readable delegation so no throwaway helpers are built.

### Work

- [x] A1+A9 — Unify exec failure-formatting and scratch I/O foundations.
  - Policy: direct execution after preview for code/tests.
  - Evidence: `@sdl/sdl/temp-files` exposes core temp-file primitives as an internal-migration export, and flow command-author mechanics are now carried by the actual shared helper set under `.sdl/extensions/flow/src/shared/`: `checkpoint-message.ts`, `git.ts`, `model-generation.ts`, `text-generation.ts`, `text-helpers.ts`, `worktree.ts`, and `ccc-cli.ts`. The submit bundle no longer imports `node:child_process`, no longer defines a local spawn-backed `runCommand`, requires injected gateway runners, and routes feasible PR-body/checkpoint temp files through package-owned temp-file support while leaving durable raw failure logs local. Focused unit/scenario coverage plus lint/type/format checks stayed green.

- [x] A2+A8 — Resolve the remaining Git-ops seam disposition after package-seam extraction.
  - Policy: direct execution after preview for mechanical code/tests; steer first before changing the accepted gateway-layer direction or promoting public SDK surface.
  - Evidence: `.sdl/extensions/flow/src/shared/git.ts` is now the narrow flow-local mechanics seam for plain Git execution and porcelain clean-status checks. `push.ts` routes `git status --porcelain` and `git push` through that helper while preserving command-local push policy, dirty-worktree refusal, submit guidance, and evidence formatting. `worktree.ts` routes checkpoint Git mechanics through the same helper while retaining package-owned pending-worktree and checkpoint seams. Submit/regenerate-pr/checkpoint package seams remain the accepted boundary; Graphite/stack ownership remains A6, CCC delegation remains A7, and no public `@sdl/sdl/sdk` surface was added.

- [x] A3 — Introduce one GitHub-PR access seam for the flow group.
  - Policy: gateway-layer direction confirmed with the user; direct execution after preview for code/tests; ask before mutating real GitHub PR state during validation.
  - Evidence: GitHub PR access now lives behind `sdl-flow` package-owned seams rather than command-local flow code or `@sdl/sdl` internal-export subpaths. `shared/submit.ts` and `shared/pr-description.ts` both build on `@sdl/core/submit`'s `RealGithubPrGateway`; `regenerate-pr` and readable `submit` are represented as consumers; no public `@sdl/sdl/sdk` surface was added. A standalone `@sdl/sdl/github-pr` subpath was dropped because the flow-owned runtime seams were enough for this track. See `updates/2026-06-24-relocate-flow-only-modules.md`.

- [x] A4 — Consolidate PR-description generation behind the internal-export seam.
  - Policy: direct execution after preview for code/tests; ask before mutating real GitHub PR state during validation.
  - Evidence: `sdl-flow` `shared/pr-description.ts` now owns PR-regeneration preparation/application and re-exports the relevant `@sdl/core/submit` PR-description types/helpers, while `shared/submit.ts` wires the same PR-description orchestration into submit. `flow/src/commands/regenerate-pr.ts` delegates to the package seam instead of carrying local PR-description duplication, and `flow/src/commands/submit.ts` uses the submit runtime seam. The `@sdl/sdl/pr-description` subpath was removed rather than widened, and no new public SDK surface was added. See `updates/2026-06-24-relocate-flow-only-modules.md`.

- [x] A5 — Extract the model generate→validate→repair loop into a flow-shared helper.
  - Policy: direct execution after preview for code/tests.
  - Evidence: `.sdl/extensions/flow/src/shared/model-generation.ts` now provides the thin command-facing generation helper over the existing `text-generation.ts` and `text-helpers.ts` shims. `changes`, `cp`, and `autobranch` delegate model wiring through it while package-owned helpers keep prompt construction, validation, repair, and model calls; submit-failure interpretation stays command-local by design, and submit's checkpoint path remains package-owned through `runCheckpointIfPending`. No public `@sdl/sdl/sdk` surface was added.

- [x] A6 — Decide Graphite/stack-ops ownership (decision row).
  - Policy: **steer-first** — disposition chosen after the ownership question was surfaced.
  - Evidence: `updates/2026-06-23-flow-graphite-ownership-disposition.md` records that flow should not introduce a shared `gt` seam. Submit delegates through `@sdl/sdl/submit` into `@sdl/graphite/submit`; land delegates to CCC land orchestration; autobranch and branch-latest-commit delegate to `@sdl/autobranch`. The remaining direct `gt` mechanics in `@sdl/autobranch` are explicit follow-up ownership debt to route through `@sdl/graphite`, not a new flow-local Graphite-owner exception. No public `@sdl/sdl/sdk` surface was added.

- [x] A7 — Consolidate CCC-CLI delegation boilerplate.
  - Policy: direct execution after preview for code/tests.
  - Evidence: `.sdl/extensions/flow/src/shared/ccc-cli.ts` owns the common CCC CLI exec-adapter, durable stdout/stderr forwarding, optional live-output forwarding, and `exitCode → ok/failed` mapping. `land.ts`, `pull-trunk.ts`, and `autoslot.ts` now share that helper while keeping command-specific CCC inputs local and preserving delegation to `@sdl/ccc/*`. Focused helper coverage lives in `ts/packages/sdl/test/unit/extension-shared-ccc-cli.test.ts`; the land scenario remains the command-level confirmation guard. See `updates/2026-06-23-flow-ccc-cli-helper.md`.

- [~] Replace the checked-in submit bundle with a readable delegating command.
  - Policy: direct execution after preview for implementation; ask before running real submit, restack, push, PR edit, or other external mutations.
  - Evidence so far: `flow/src/commands/submit.ts` is now a readable hand-authored command that delegates submit orchestration through `sdl-flow` `shared/submit.ts` and checkpointing through `sdl-flow` `shared/checkpoint.ts`, while keeping command-local terminal output and submit-failure summarization policy in the extension. The prior ~3017-line bundle is gone from the flow command. The submit runtime wrapper (`createSdlSubmitRuntime` + `runSubmitCommand`/`SubmitCommandResult` re-export) delegates to `@sdl/core/submit` + `@sdl/graphite/submit` directly, so remaining work for this row is internal `sdl-flow` shaping, not an `@sdl/sdl` subpath. See `updates/2026-06-24-relocate-flow-only-modules.md`.
  - Remaining: collect clean `just`/submit scenario validation once the local pnpm ignored-build approval issue is unblocked; no additional semantic submit-bundle rewrite work is currently identified.

- [x] Document the area model and refresh the readiness matrix.
  - Policy: direct execution after preview; steer-first before any wording that implies new public author API.
  - Evidence: `.sdl/extensions/AGENTS.md`, `ts/packages/sdl/docs/sdk-reference.md`, `ts/packages/sdl/CONTEXT.md`, and `ts/packages/sdl/README.md` now describe the capability-area maturity ladder, grouped flow helper location, internal-migration-export boundary, and deferred public-SDK promotion decision. The readiness matrix reflects the current flow shared-helper file set and no longer depends on former helper-path claims that do not match the tree. See `updates/2026-06-23-flow-readiness-docs-refresh.md`.

## Architecture endgame (Phase 2)

Driven by `docs/adr/0009-extension-layering-and-peer-dependencies.md` and recorded in `updates/2026-06-24-architecture-endgame-sequence.md`. The goal is the final architecture: `@sdl/domain-primitives-transitional` deleted and all nine product capabilities modeled as extensions. Sequencing rule: foundation packages and conventions first (steps 1–2), then the kernel de-tangle (step 3), then per-capability migration as child Objectives ordered by `ccc`-consumption (step 4), then `ccc` (step 5), then the transitional-package deletion that marks completion (step 6). This Objective owns steps 1–3, 5, 6; step 4 fans out to child Objectives.

### Work

- [~] **1. Stand up `@sdl/extension-kit`** (above-SDK substrate).
  - Policy: direct execution after preview for code/tests.
  - Plan: relocate the `ctx`→gateway adapter (`SdlCommandExecApi`, today in `ts/packages/extensions/flow/src/shared/command-runner.ts`) and shared result/error shapes into a new `@sdl/extension-kit`; rewire flow's `cp`/`push`/`submit` to build gateways through it; add `InMemoryGitGateway`-backed unit tests for the relocated domain cores. Banks the testability win independent of everything else.
  - Evidence so far: `@sdl/extension-kit` exists and owns the SDL host command runner, command execution helper, CLI exec adapter, SDL Git helper, porcelain-status helper, and `createSdlGitGateway`. Flow submit and PR-description runtime construction now build Git gateways through extension-kit; flow shared Git/worktree helpers consume extension-kit while retaining flow policy. `runPushCore()` is gateway-injected and covered by `InMemoryGitGateway` unit tests, while the command face preserves existing `sdl flow push` porcelain output behavior. See `updates/2026-06-24-extension-kit-flow-gateway-boundary.md`.
  - Remaining: explicitly finish or disposition the cp construction seam before marking this row `[x]`.

- [ ] **2. Lock the cross-capability conventions** (decision + docs row).
  - Policy: steer-first — these conventions bind every capability migration.
  - Plan: ratify the Peer API subpath (`@sdl/<cap>/api`), the gateway-injected-core rule, and the exports-map mechanism that forbids deep sibling imports and cycles. Resolve the ADR 0009 open items (peer-subpath mechanics, DAG-enforcement mechanism). Document in the SDK reference + CONTEXT.

- [ ] **3. Stand up `@sdl/domain-primitives-transitional`** (below-SDK holding pen) and de-tangle the kernel.
  - Policy: direct execution after preview for mechanical moves; steer-first before changing consumer import contracts.
  - Plan: extract the SDK-independent domain primitives (`checkpoint-flow`, `pending-worktree`, `text-generation`, `temp-files`, …) out of `@sdl/sdl` into the new package; apply the `internal-migration-export` → `internal workspace export` rename (incl. the `package.json` field); repoint `ccc`/`pi-extensions`/flow consumers.

- [ ] **4. Per-capability migration → child Objectives** (fan-out, ordered by `ccc`-consumption).
  - Policy: steer-first — each capability migration is spawned as its own child Objective when picked up.
  - Plan: model each capability as an above-SDK extension with a thin command face and a gateway-injected domain core, exposing a Peer API where a sibling needs it. Order: capabilities `ccc` already reaches into via internal subpaths first (each retires a transitional dependency), then the rest. Targets: handoff, objective, slot, branch-context, plans, pr-address, roaster, aretro. flow is the in-repo reference, not a child Objective.

- [ ] **5. Convert `ccc` into an orchestrator extension.**
  - Policy: steer-first.
  - Plan: depend on peer capabilities through their `@sdl/<cap>/api` Peer APIs instead of `@sdl/sdl/*` internal subpaths; place `ccc` at the apex of the extension DAG.

- [ ] **6. Delete `@sdl/domain-primitives-transitional`** (completion marker).
  - Policy: direct execution after preview once steps 4–5 are done.
  - Plan: confirm no below-SDK package imports capability domain logic, then remove the transitional package. Its emptiness is the endgame's done-signal.

## Parked

- Bundled first-party extension packaging and discovery semantics.
- Migration of the standalone tools (`packagechk`, `vibechk`, `areg`) into the extension structure — they are off the extension axis.
- Dynamic arbitrary `/sdl:*` Pi mirrors for all project-local SDL extension commands.
- Extension-owned agent resources such as skills, Pi extensions, prompts, or install/update/marketplace behavior.
- Nested SDL CLI command trees such as `sdl handoff list`, `sdl code checkpoint`, or `sdl review address`.
