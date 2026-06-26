# Roadmap

## Work

- [x] Establish the `@sdl/objective/api` Capability API surface and the gateway-injected Domain Core boundary.
  - Decide the curated `@sdl/objective/api` export shape that `ccc`/`sdlcc` need (selection + listing surface), following the `@sdl/slot/api`/`@sdl/branch-context/api`/`@sdl/plans/api` precedent. Add the `./api` subpath to `ts/packages/objective/package.json` exports.
  - Define the Domain Core seam so relocated logic takes injected gateways (via `@sdl/capability-kit`), not raw `ctx`.
  - Evidence: `ts/packages/objective/src/api.ts` is the `@sdl/objective/api` Capability API — a full `createObjectiveClient(...)` facade (chosen shape #2, mirroring `@sdl/slot/api`'s `createSlotClient`) returning clean `ok/failure` results for `listObjectives`, `readObjective`, and `listActiveCandidates`, with no `ClinkrExit`/command-face leakage. `ts/packages/objective/package.json` exports `./api` and `./command-face`. The Domain Core seam is the already-gateway-injected `ObjectiveCliContext` (git + storage gateways), injectable via `ObjectiveClientOptions.context`. `read-objective.ts`'s inner reader was exported as `readObjectiveRecord` so the API avoids the `ClinkrExit` wrapper. New unit coverage in `test/unit/api.test.ts` exercises active-candidate filtering, default/override status filters, ok/not_found reads, and storage-failure mapping against `FakeObjectiveStorageGateway` + `InMemoryGitGateway`. Validation: `pnpm --dir ts run check` (tsgo), objective suite (73 tests incl. 6 new), `just ts-format-check`, `just ts-lint`, `just ts-guard`, `just ts-deps-check` all green. The Pi selection/skill-prompt surface (`@sdl/pi/objectives/*`) is intentionally not relocated here; it joins this client in row 2.

- [x] Bottom slice: runner-usage neutralization.
  - Moved the shared runner-subagent usage JSONL parser/totals primitives from `@sdl/pi/runner-subagents/usage` to the neutral `@sdl/core/runner-usage` export backed by `ts/packages/infra/core/src/runner-usage.ts`.
  - Repointed `@sdl/objective` and Pi runtime usage code to import the parser/totals from `@sdl/core/runner-usage`; `@sdl/pi/runner-subagents/usage` remains only as a compatibility re-export.
  - Moved/adapted parser/totals tests from `ts/packages/hosts/pi/test/runner-subagents/usage.test.ts` to `ts/packages/infra/core/test/runner-usage.test.ts` so core owns the primitive.
  - Removed `@sdl/pi` from `ts/packages/objective/package.json` after `ts/packages/objective/src/operations/runner-subagent-usage.ts` stopped importing the Presentation Host.
  - Evidence: `rg "@sdl/pi" ts/packages/objective/src ts/packages/objective/package.json` produced no matches. Parent-side validation passed: `pnpm --dir ts --filter @sdl/core test`, `pnpm --dir ts --filter @sdl/pi test`, `pnpm --dir ts --filter @sdl/objective test`, `pnpm --dir ts run check`, `just ts-deps-check`, and `just ts-guard`.

- [x] Objective API relocation slice.
  - Moved Objective-specific list JSON parsing, picker policy, changed-objective suggestion policy, Objective skill prompt construction helpers, `/objective:list` argument/completion policy, Objective candidate JSON parsing, and Objective command specs out of Pi ownership into `@sdl/objective` modules.
  - Exported the relocated surface from `@sdl/objective/api` alongside `createObjectiveClient(...)` as named helper exports for future `ccc`/`sdlcc` consumer repoints.
  - Kept Pi runtime concerns in thin shells: `@sdl/pi/objectives/list` unwraps the Pi machine envelope and delegates Objective list data parsing; `picker` is a compatibility re-export; `selection` retains Pi `CommandContext`/host-command orchestration while consuming Objective-owned prompt/policy helpers; `extension` retains registration, acknowledgement, notifications, `sendMessage`, skill expansion, autocomplete wiring, and presentation.
  - Moved pure/domain tests from Pi to Objective and retained Pi tests for envelope parsing and Pi behavior. `sdlcc` test fixtures were updated for the Objective list record shape while production consumer repoint remains for the next slice.
  - Evidence: `rg "@sdl/pi" ts/packages/objective/src ts/packages/objective/package.json` produced no matches; no machine-envelope module was moved into Objective. Parent-side validation passed: `pnpm --dir ts --filter @sdl/objective test`, `pnpm --dir ts --filter @sdl/pi test`, `pnpm --dir ts --filter sdlcc test`, `pnpm --dir ts --filter @sdl/ccc test`, `pnpm --dir ts run check`, `just ts-format-check`, `just ts-lint`, `just ts-deps-check`, `just ts-guard`, and `just ts-test`.

- [~] Consumer repoint slice.
  - `sdlcc` is fully repointed: `ts/packages/hosts/sdlcc/src/objective-tab.ts` and `ts/packages/hosts/sdlcc/test/unit/objective-tab.test.ts` consume Objective list parsing/types from `@sdl/objective/api`, and `ts/packages/hosts/sdlcc/package.json` declares `@sdl/objective` without `@sdl/pi`.
  - `ccc` is only partially repointed: `ts/packages/ccc/src/objective-stack-impl.ts` and `ts/packages/ccc/src/cmux/sidebar.ts` consume `chooseActiveObjectiveSlug` and selection specs from `@sdl/objective/api`, and `ts/packages/ccc/package.json` declares `@sdl/objective`, but both files still import `objectiveSelectionContextFromCommandContext` from `@sdl/pi/objectives/selection`.
  - Remaining work: remove the two `@sdl/pi/objectives/selection` imports from `ccc` by moving or recreating the command-context adapter at a non-Pi-objectives boundary while preserving the chosen direction that `@sdl/ccc` may still depend on neutral `@sdl/pi` helper subpaths.
  - Evidence: `rg "@sdl/pi/objectives" ts/packages` currently reports exactly the two `ccc` imports above; `rg "@sdl/pi" ts/packages/objective/src ts/packages/objective/package.json` produces no matches; `rg "@sdl/pi" ts/packages/hosts/sdlcc ts/packages/hosts/sdlcc/package.json` produces no matches. Refresh validation was evidence-only; no TypeScript suite was rerun during this rebaseline.

- [ ] Separate risky slice: Pi→CCC cycle break.
  - Execute the chosen direction: `@sdl/ccc` may depend on neutral `@sdl/pi` helper subpaths, but `@sdl/pi` must stop importing `@sdl/ccc` and must remove `@sdl/ccc` from `ts/packages/hosts/pi/package.json`.
  - Move/remove Pi imports of CCC by relocating registration/orchestration ownership for `objective:stack-impl`, worktree-status, handoff-tab, branch-context upstack implementation, cmux focused-terminal-tab, old flow wrappers (`land`, `trunk-pull`), and parity records.
  - Preserve existing user-visible command names and behaviors; only ownership and dependency direction should change. Project-local `.pi/extensions/*.ts` adapters may import CCC directly where they are the discovery/registration surface.
  - Gate: `rg "@sdl/ccc" ts/packages/hosts/pi/src ts/packages/hosts/pi/package.json` should have no matches; run Pi/CCC tests, `.pi/extensions` import smoke checks for changed adapters, and the TypeScript baseline.
  - Policy: treat this as a separate high-risk `objective-stack-impl` preview after the Objective relocation and consumer-repoint slices. Stop before renaming/removing user-visible commands or moving neutral Pi helper subpaths contrary to the chosen CCC→Pi-helper direction.
  - Evidence: record each Pi→CCC edge removed, where registration/orchestration moved, package manifest/lockfile updates, adapter import-smoke results, stale `@sdl/ccc` grep output, and validation commands/results.

## Parked

- `just ts-guard` topological acyclicity check for the Extension Dependency Graph — implement only after the real package graph is acyclic, with acyclic-pass and synthetic-cycle-fail self-tests.
- `ts/packages/objective/CONTEXT.md` and `CONTEXT-MAP.md` updates for the finalized objective capability boundary and acyclicity invariant — write after the relocation/cycle-break seams have landed enough to document accurately.
- Converting `ccc` into the highest-fan-out clean consumer for capabilities other than objective — owned by parent `sdl-extension-architecture` step 5 and dependent on the remaining step-4 capability migrations.
- Any objective Domain Core timeout/abort/cancellation semantics for in-process callers — deferred unless a concrete consumer needs it (mirrors the Slot follow-up disposition).
