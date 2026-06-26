# Objective Capability Extension

## Thesis

Objective should become an above-SDK capability extension: the objectives domain currently stranded in the `@sdl/pi` Presentation Host (`@sdl/pi/objectives/{selection,picker,list,extension}.ts`) relocates into its owning `@sdl/objective` Capability, which exposes a curated `@sdl/objective/api` Capability API for in-process sibling consumers (`ccc`, `sdlcc`) over a gateway-injected Domain Core. Because `ccc` reaches into the objectives domain through `@sdl/pi`, this migration is the load-bearing prerequisite for breaking the `@sdl/pi` ↔ `@sdl/ccc` bidirectional package cycle. This child Objective owns that cycle-break end-to-end, but the implementation path is now explicitly split into four independently reviewable slices: neutralize the runner-usage dependency, relocate Objective domain logic into `@sdl/objective/api`, repoint consumers, then perform the riskier Pi→CCC cycle break. The `just ts-guard` topological acyclicity check remains a later follow-up after the real graph is acyclic, not part of the relocation slices.

This is a child Objective of `sdl-extension-architecture` (Phase 2, roadmap step 4 fan-out), and it additionally absorbs the cycle-break + acyclicity-enforcement portion of parent step 5. The parent retains the broader "convert `ccc` into the highest-fan-out clean consumer across all capabilities" work, which depends on the remaining step-4 capability migrations.

## Scope

- Establish `@sdl/objective/api` as the curated Capability API subpath for in-process first-party consumers, following the ratified `@sdl/<cap>/api` convention (ADR 0009 + 0012) and the precedent set by `@sdl/slot/api`, `@sdl/branch-context/api`, and `@sdl/plans/api`.
- Relocate the objectives domain out of `@sdl/pi/objectives/*` (`selection.ts` ~414 lines, `picker.ts` ~202, `list.ts` ~107, `extension.ts` ~860) into the owning `@sdl/objective` Capability, keeping the Pi command/presentation shell thin where Pi still needs a face.
- Refactor the relocated domain logic into a gateway-injected Domain Core (no raw `SdlExtensionApi`/`ctx`), so it is unit-testable with in-memory gateways; `ctx`→gateway conversion stays at the command/presentation edge via `@sdl/capability-kit`.
- Repoint in-process sibling consumers from `@sdl/pi/objectives/*` to `@sdl/objective/api`:
  - `ccc`: `ts/packages/ccc/src/objective-stack-impl.ts` and `ts/packages/ccc/src/cmux/sidebar.ts` (both import `@sdl/pi/objectives/selection`).
  - `sdlcc`: `ts/packages/hosts/sdlcc/src/objective-tab.ts` (imports `@sdl/pi/objectives/list`).
- Resolve the reverse `@sdl/objective` → `@sdl/pi` entanglement: `@sdl/objective` currently declares `@sdl/pi` as a dependency and imports `@sdl/pi/runner-subagents/usage` from `src/operations/runner-subagent-usage.ts`. Decide the correct home for that runner-subagent-usage seam so the capability does not depend back into the Presentation Host.
- Execute the chosen Pi/CCC delegation direction as its own risky slice: `@sdl/ccc` may continue depending on neutral `@sdl/pi` helper subpaths, while `@sdl/pi` must stop importing `@sdl/ccc` and must drop the `@sdl/ccc` package dependency. Current Pi→CCC imports include `worktree-status`, `cmux/focused-terminal-tab`, `trunk-pull`, `objective-stack-impl`, `land`, `handoff-tab`, and `branch-context-up-and-impl`; CCC→Pi neutral-helper imports such as `commands/ack` and `terminal/presentation` may remain.
- After the real package graph is acyclic, land a topological acyclicity check for the Extension Dependency Graph wired into `just ts-guard` (alongside `ts/scripts/guard-typescript-style.mjs`), with self-tests for an acyclic graph passing and a synthetic cycle failing.
- Document the objective capability boundary and the acyclicity invariant in `ts/packages/objective/CONTEXT.md` and register it in `CONTEXT-MAP.md` after the relocation and cycle-break seams have landed.

## Non-Goals

- Do not merge objectives domain logic into the `@sdl/sdl` kernel or into `@sdl/pi`; the Domain Core lives in `@sdl/objective`, and any Pi-facing surface is a thin presentation shell consuming the Capability API.
- Do not make sibling packages deep-import `@sdl/objective/src/...` internals or treat CLI JSON invocation as the Capability API.
- Do not widen `@sdl/sdl/sdk` with objective-specific surface; the Capability API is `@sdl/objective/api`, not new public author SDK.
- Do not take on the rest of parent step 5's "ccc consumes every provider Capability API" work for capabilities other than objective; that depends on the remaining step-4 migrations and stays with the parent.
- Do not migrate the standalone tools or change Pi mirror taxonomy as part of this Objective.

## Completion Criteria

- `@sdl/objective` exposes a curated `@sdl/objective/api` Capability API; the objectives domain no longer lives in `@sdl/pi/objectives/*`.
- The relocated domain logic is a gateway-injected Domain Core with in-memory-gateway unit tests and no raw `ctx` dependency.
- `ccc` (`objective-stack-impl.ts`, `cmux/sidebar.ts`) and `sdlcc` (`objective-tab.ts`) consume `@sdl/objective/api` instead of `@sdl/pi/objectives/*`.
- `@sdl/objective` no longer depends on `@sdl/pi`; the runner-subagent-usage seam has a documented non-Presentation-Host home.
- The `@sdl/pi` ↔ `@sdl/ccc` bidirectional package cycle is gone under the chosen direction: `@sdl/ccc` may import neutral `@sdl/pi` helpers, but `@sdl/pi` imports no `@sdl/ccc` subpaths and does not declare `@sdl/ccc`.
- `just ts-guard` enforces a topological acyclicity check over the Extension Dependency Graph, with self-tests covering an acyclic pass and a synthetic-cycle fail; `just` is green.
- `ts/packages/objective/CONTEXT.md` documents the durable capability/Domain-Core/Capability-API and acyclicity boundary and is registered in `CONTEXT-MAP.md`.

## Definition of Progress

Progress is keepable when:

- A roadmap slice lands as an independently reviewable Graphite branch/PR with one clear thesis and no unrelated ownership moves bundled into it.
- The slice reduces a concrete dependency edge or domain-placement ambiguity recorded in this Objective, and its stale-edge gate is recorded in the slice's Objective update.
- TypeScript tests/typecheck relevant to the touched packages pass, or any failing validation is narrow, understood, and recorded as a blocker before keeping work.
- Objective tracking is updated after each material slice with the files/edges changed, validation run, and the next remaining slice.

Do not keep changes that:

- Reintroduce `@sdl/objective` → `@sdl/pi`, retain a production consumer import from `@sdl/pi/objectives/*` after the consumer-repoint slice, or leave `@sdl/pi` importing `@sdl/ccc` after the cycle-break slice.
- Mix the runner-usage neutralization, Objective API relocation, consumer repoint, and Pi→CCC cycle break into one unreviewable branch without explicit renewed user approval.
- Rename or remove user-visible Pi slash commands merely to satisfy package topology.
- Implement the parked acyclicity guard or final context documentation before the real graph is ready unless the user explicitly changes the slice scope.

Useful evidence includes:

- Stale-edge grep output for the relevant slice, especially `rg "@sdl/pi" ts/packages/objective/src ts/packages/objective/package.json`, `rg "@sdl/pi/objectives" ts/packages`, and `rg "@sdl/ccc" ts/packages/hosts/pi/src ts/packages/hosts/pi/package.json`.
- Package-level tests for touched packages and `pnpm --dir ts run check`/`just ts-check` when practical.
- `git diff --name-status` and package manifest review showing dependency-direction changes are intentional.
- Import smoke checks for changed `.pi/extensions/*.ts` adapters during the Pi→CCC cycle-break slice.

## Runner Policy

This Objective is execution-friendly for `objective-stack-impl` under the boundaries below.

- Direct stack execution is allowed when the preview proposes one to three branches that map to the current open roadmap slices, with at most one branch per slice unless the parent session explains why a slice needs another reviewable split.
- Prefer starting with the bottom runner-usage neutralization slice. Continue to Objective API relocation only after the parent verifies that `@sdl/objective` no longer imports or declares `@sdl/pi`; continue to consumer repoint only after the Objective API exports the needed selection/list helpers; treat the Pi→CCC cycle break as a separate high-risk preview.
- Steer or ask first when a slice requires touching files outside its roadmap row, changing user-visible command names, moving neutral Pi helper subpaths contrary to the chosen CCC→Pi-helper direction, or implementing parked guard/docs work.
- Runner subagents may edit source, tests, package manifests, lockfiles, and Objective tracking files necessary for the confirmed slice, but they must not commit, submit PRs, mutate Branch Memory, or create hidden ledgers. The parent session owns Graphite branch operations, validation interpretation, commits/amends, and Objective updates.
- Validation before keeping work should include the row's stale-edge grep plus targeted package tests and TypeScript typecheck for touched packages; broader `just`/`just ts-*` gates are preferred before stopping a completed stack when practical.
- PR submission, GitHub mutation, Objective closure, acyclicity-guard implementation, and final context documentation will not happen unless explicitly requested or included in a confirmed preview.

## Assumptions and Risks

Assumptions:

- The `@sdl/<cap>/api` convention and gateway-injected-core rule ratified for Slot/Branch-Context/Plans apply cleanly to objective; this is now validated for `ccc`/`sdlcc` consumption through `@sdl/objective/api` without reintroducing an Objective↔Pi package cycle.
- The objectives domain in `@sdl/pi/objectives/*` is separable from genuine Pi presentation concerns; `extension.ts` (~860 lines) likely mixes domain selection/listing logic with Pi-specific presentation that should stay behind a thin shell.
- The current broad implementation plan is too large for one pass; the durable path is four separate slices with independent gates: runner-usage neutralization, Objective API relocation, consumer repoint, and Pi→CCC cycle break.
- The runner-subagent usage JSONL parser/totals seam belongs in neutral `@sdl/core/runner-usage`, so `@sdl/objective` can consume it without importing the Pi Presentation Host.
- The chosen Pi/CCC direction is settled for this Objective: `@sdl/ccc` may continue to import neutral `@sdl/pi` helper subpaths, while `@sdl/pi` must remove all imports of `@sdl/ccc` and its `@sdl/ccc` dependency.
- The topological acyclicity guard should not be implemented until after the real graph is acyclic; use stale-edge greps and TypeScript validation as interim gates.

Risks:

- The old all-in-one relocation/cycle-break plan is too expansive for one implementation branch. Mitigate by treating the four slices as separate branches/PRs where possible, each with its own stale-edge gate.
- The `@sdl/pi/objectives/extension.ts` presentation/domain entanglement is partly de-risked: Objective-owned command specs, list-argument policy, candidate parsing, picker policy, list JSON parsing, and prompt helpers now live behind `@sdl/objective/api`, while Pi retains command registration, acknowledgement, notifications, `sendMessage`, skill expansion, autocomplete wiring, and presentation. Continue to keep production consumer repoints separate from Pi→CCC ownership changes.
- The `@sdl/objective` → `@sdl/pi/runner-subagents/usage` dependency risk is de-risked for the runner-usage seam: the parser/totals primitive now lives in `@sdl/core/runner-usage`, `@sdl/objective` no longer imports or declares `@sdl/pi`, and Pi keeps only a compatibility re-export for remaining callers. Continue to guard against reintroducing `@sdl/objective` → `@sdl/pi` during Objective API relocation.
- The topological acyclicity guard could be over- or under-strict (false greens/reds) if it parses the wrong edge set. Mitigate with explicit acyclic-pass and synthetic-cycle-fail self-tests, mirroring the `SDL_TS_BAN_CAPABILITY_PRIVATE_PEER_IMPORT` self-test pattern.

## Open Questions

- How much of `@sdl/pi/objectives/extension.ts` is genuine Pi presentation that should remain as a thin Pi shell versus domain logic that belongs in the `@sdl/objective` Domain Core?
- During the Pi→CCC cycle-break slice, can every current `/objective:stack-impl`, worktree-status, handoff-tab, branch-context upstack, cmux focused-terminal-tab, land, and trunk-pull behavior be preserved by moving registration/orchestration ownership without renaming user-visible commands?
- Should the later acyclicity check derive the Extension Dependency Graph from `package.json` `workspace:*` edges, from actual import specifiers, or both, to avoid false greens where a `package.json` edge exists without imports (or vice versa)?
