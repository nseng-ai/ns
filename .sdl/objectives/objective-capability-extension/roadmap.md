# Roadmap

## Work

- [x] Establish the `@sdl/objective/api` Capability API surface and the gateway-injected Domain Core boundary.
  - Decide the curated `@sdl/objective/api` export shape that `ccc`/`sdlcc` need (selection + listing surface), following the `@sdl/slot/api`/`@sdl/branch-context/api`/`@sdl/plans/api` precedent. Add the `./api` subpath to `ts/packages/objective/package.json` exports.
  - Define the Domain Core seam so relocated logic takes injected gateways (via `@sdl/capability-kit`), not raw `ctx`.
  - Evidence: `ts/packages/objective/src/api.ts` is the `@sdl/objective/api` Capability API — a full `createObjectiveClient(...)` facade (chosen shape #2, mirroring `@sdl/slot/api`'s `createSlotClient`) returning clean `ok/failure` results for `listObjectives`, `readObjective`, and `listActiveCandidates`, with no `ClinkrExit`/command-face leakage. `ts/packages/objective/package.json` exports `./api` and `./command-face`. The Domain Core seam is the already-gateway-injected `ObjectiveCliContext` (git + storage gateways), injectable via `ObjectiveClientOptions.context`. `read-objective.ts`'s inner reader was exported as `readObjectiveRecord` so the API avoids the `ClinkrExit` wrapper. New unit coverage in `test/unit/api.test.ts` exercises active-candidate filtering, default/override status filters, ok/not_found reads, and storage-failure mapping against `FakeObjectiveStorageGateway` + `InMemoryGitGateway`. Validation: `pnpm --dir ts run check` (tsgo), objective suite (73 tests incl. 6 new), `just ts-format-check`, `just ts-lint`, `just ts-guard`, `just ts-deps-check` all green. The Pi selection/skill-prompt surface (`@sdl/pi/objectives/*`) is intentionally not relocated here; it joins this client in row 2.

- [ ] Bottom slice: runner-usage neutralization.
  - Move the shared runner-subagent usage JSONL parser/totals primitives out of `@sdl/pi/runner-subagents/usage` into a neutral export such as `@sdl/core/runner-usage` backed by `ts/packages/sdl-core/src/runner-usage.ts`.
  - Repoint `@sdl/objective` and Pi runtime usage code to import the parser/totals from `@sdl/core/runner-usage`; keep `@sdl/pi/runner-subagents/usage` only as a temporary compatibility wrapper if needed by remaining in-repo imports.
  - Move/adapt parser/totals tests from `ts/packages/pi/test/runner-subagents/usage.test.ts` to `ts/packages/sdl-core/test/...` so core owns the primitive.
  - Remove `@sdl/pi` from `ts/packages/objective/package.json` once `ts/packages/objective/src/operations/runner-subagent-usage.ts` no longer imports the Presentation Host.
  - Gate: `rg "@sdl/pi" ts/packages/objective/src ts/packages/objective/package.json` should have no matches; run relevant core/objective/Pi tests and typecheck for the touched packages.

- [ ] Objective API relocation slice.
  - Move Objective-specific list parsing, picker policy, changed-objective suggestion policy, Objective skill prompt construction, Objective-selection orchestration, `/objective:list` argument/completion policy, and Objective candidate JSON parsing out of `@sdl/pi/objectives/*` into `@sdl/objective`.
  - Export the relocated surface from `@sdl/objective/api` as `createObjectiveClient(...)` plus named helper exports for pure parsers, prompt builders, selection-policy helpers, and small host/context interfaces.
  - Keep Pi runtime concerns in thin Pi shells only: command registration, immediate acknowledgement, Pi `CommandContext` adaptation, notifications, `sendMessage`, skill expansion, and runtime-specific presentation.
  - Move pure/domain tests from Pi to Objective; keep Pi tests only for Pi `CommandContext` adaptation, command registration, acknowledgement/presentation, skill expansion, prompt delivery, and autocomplete integration.
  - Gate: Objective/Pi package tests plus `pnpm --dir ts run check` should pass.

- [ ] Consumer repoint slice.
  - Repoint `ts/packages/ccc/src/objective-stack-impl.ts` and `ts/packages/ccc/src/cmux/sidebar.ts` from `@sdl/pi/objectives/selection` to `@sdl/objective/api` for Objective selection helpers/specs.
  - Repoint `ts/packages/sdlcc/src/objective-tab.ts` and `ts/packages/sdlcc/test/unit/objective-tab.test.ts` from `@sdl/pi/objectives/list` to `@sdl/objective/api`.
  - Adjust package manifests: add `@sdl/objective` to consumers that now import it, keep `@sdl/pi` in `@sdl/ccc` for neutral helper subpaths, and remove `@sdl/pi` from `sdlcc` if no non-Objective imports remain.
  - Gate: `rg "@sdl/pi/objectives" ts/packages` should show no production consumer imports; run relevant ccc/sdlcc/Pi/Objective tests and typecheck.

- [ ] Separate risky slice: Pi→CCC cycle break.
  - Execute the chosen direction: `@sdl/ccc` may depend on neutral `@sdl/pi` helper subpaths, but `@sdl/pi` must stop importing `@sdl/ccc` and must remove `@sdl/ccc` from `ts/packages/pi/package.json`.
  - Move/remove Pi imports of CCC by relocating registration/orchestration ownership for `objective:stack-impl`, worktree-status, handoff-tab, branch-context upstack implementation, cmux focused-terminal-tab, old flow wrappers (`land`, `trunk-pull`), and parity records.
  - Preserve existing user-visible command names and behaviors; only ownership and dependency direction should change. Project-local `.pi/extensions/*.ts` adapters may import CCC directly where they are the discovery/registration surface.
  - Gate: `rg "@sdl/ccc" ts/packages/pi/src ts/packages/pi/package.json` should have no matches; run Pi/CCC tests, `.pi/extensions` import smoke checks for changed adapters, and the TypeScript baseline.

## Parked

- `just ts-guard` topological acyclicity check for the Extension Dependency Graph — implement only after the real package graph is acyclic, with acyclic-pass and synthetic-cycle-fail self-tests.
- `ts/packages/objective/CONTEXT.md` and `CONTEXT-MAP.md` updates for the finalized objective capability boundary and acyclicity invariant — write after the relocation/cycle-break seams have landed enough to document accurately.
- Converting `ccc` into the highest-fan-out clean consumer for capabilities other than objective — owned by parent `sdl-extension-architecture` step 5 and dependent on the remaining step-4 capability migrations.
- Any objective Domain Core timeout/abort/cancellation semantics for in-process callers — deferred unless a concrete consumer needs it (mirrors the Slot follow-up disposition).
