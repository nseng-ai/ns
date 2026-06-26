# Objective Capability Extension

## Thesis

Objective should become an above-SDK capability extension: the objectives domain currently stranded in the `@sdl/pi` Presentation Host (`@sdl/pi/objectives/{selection,picker,list,extension}.ts`) relocates into its owning `@sdl/objective` Capability, which exposes a curated `@sdl/objective/api` Capability API for in-process sibling consumers (`ccc`, `sdlcc`) over a gateway-injected Domain Core. Because `ccc` reaches into the objectives domain through `@sdl/pi`, this migration is the load-bearing prerequisite for breaking the `@sdl/pi` ↔ `@sdl/ccc` bidirectional package cycle. This child Objective owns that cycle-break end-to-end: relocate the domain, expose the Capability API, repoint consumers, pick a single Pi/CCC delegation direction, and land the `just ts-guard` topological acyclicity check that enforces the acyclic Extension Dependency Graph.

This is a child Objective of `sdl-extension-architecture` (Phase 2, roadmap step 4 fan-out), and it additionally absorbs the cycle-break + acyclicity-enforcement portion of parent step 5. The parent retains the broader "convert `ccc` into the highest-fan-out clean consumer across all capabilities" work, which depends on the remaining step-4 capability migrations.

## Scope

- Establish `@sdl/objective/api` as the curated Capability API subpath for in-process first-party consumers, following the ratified `@sdl/<cap>/api` convention (ADR 0009 + 0012) and the precedent set by `@sdl/slot/api`, `@sdl/branch-context/api`, and `@sdl/plans/api`.
- Relocate the objectives domain out of `@sdl/pi/objectives/*` (`selection.ts` ~414 lines, `picker.ts` ~202, `list.ts` ~107, `extension.ts` ~860) into the owning `@sdl/objective` Capability, keeping the Pi command/presentation shell thin where Pi still needs a face.
- Refactor the relocated domain logic into a gateway-injected Domain Core (no raw `SdlExtensionApi`/`ctx`), so it is unit-testable with in-memory gateways; `ctx`→gateway conversion stays at the command/presentation edge via `@sdl/capability-kit`.
- Repoint in-process sibling consumers from `@sdl/pi/objectives/*` to `@sdl/objective/api`:
  - `ccc`: `ts/packages/ccc/src/objective-stack-impl.ts` and `ts/packages/ccc/src/cmux/sidebar.ts` (both import `@sdl/pi/objectives/selection`).
  - `sdlcc`: `ts/packages/sdlcc/src/objective-tab.ts` (imports `@sdl/pi/objectives/list`).
- Resolve the reverse `@sdl/objective` → `@sdl/pi` entanglement: `@sdl/objective` currently declares `@sdl/pi` as a dependency and imports `@sdl/pi/runner-subagents/usage` from `src/operations/runner-subagent-usage.ts`. Decide the correct home for that runner-subagent-usage seam so the capability does not depend back into the Presentation Host.
- Pick the single Pi/CCC delegation direction and break the `@sdl/pi` ↔ `@sdl/ccc` bidirectional package cycle (today both declare each other `workspace:*`; `@sdl/pi` imports `@sdl/ccc/{worktree-status,cmux/focused-terminal-tab,trunk-pull,objective-stack-impl,land,handoff-tab,branch-context-up-and-impl}` while `@sdl/ccc` imports `@sdl/pi/{objectives/selection,commands/ack,terminal/presentation,...}`).
- Land a topological acyclicity check for the Extension Dependency Graph wired into `just ts-guard` (alongside `ts/scripts/guard-typescript-style.mjs`), with self-tests for an acyclic graph passing and a synthetic cycle failing.
- Document the objective capability boundary and the acyclicity invariant in `ts/packages/objective/CONTEXT.md` and register it in `CONTEXT-MAP.md`.

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
- The `@sdl/pi` ↔ `@sdl/ccc` bidirectional package cycle is gone: a single delegation direction is chosen and only that direction's edges remain, with neither package importing the other's removed side.
- `just ts-guard` enforces a topological acyclicity check over the Extension Dependency Graph, with self-tests covering an acyclic pass and a synthetic-cycle fail; `just` is green.
- `ts/packages/objective/CONTEXT.md` documents the durable capability/Domain-Core/Capability-API and acyclicity boundary and is registered in `CONTEXT-MAP.md`.

## Assumptions and Risks

Assumptions:

- The `@sdl/<cap>/api` convention and gateway-injected-core rule ratified for Slot/Branch-Context/Plans apply cleanly to objective; `@sdl/objective/api` can be consumed by `ccc`/`sdlcc` without reintroducing a package cycle (Slot validated this shape for a `ccc`/`sdlcc`-consumed capability).
- The objectives domain in `@sdl/pi/objectives/*` is separable from genuine Pi presentation concerns; `extension.ts` (~860 lines) likely mixes domain selection/listing logic with Pi-specific presentation that should stay behind a thin shell.
- Breaking the Pi↔CCC cycle is mostly unblocked once the objectives domain leaves `@sdl/pi`, because objectives/selection is a primary `ccc`→`@sdl/pi` edge; the remaining `@sdl/pi`→`@sdl/ccc` edges (worktree-status, cmux, land, handoff-tab, branch-context) and `@sdl/ccc`→`@sdl/pi` edges (commands/ack, terminal/presentation) must still be resolved by the chosen delegation direction.

Risks:

- The Pi/CCC delegation-direction choice is a steer-first architectural decision (which package depends on which); picking wrong forces churn. Mitigate by surfacing the directional options and edge inventory before executing the cut.
- `@sdl/pi/objectives/extension.ts` may entangle Pi presentation with domain logic such that a clean Domain-Core extraction is larger than the other three files combined. Mitigate by carving the gateway-injected core first and leaving a thin Pi presentation shell.
- The `@sdl/objective` → `@sdl/pi/runner-subagents/usage` dependency could quietly re-create a cycle if repointed naively. Mitigate by relocating the runner-subagent-usage seam to neutral infra or its owning capability rather than cross-importing the Presentation Host.
- The topological acyclicity guard could be over- or under-strict (false greens/reds) if it parses the wrong edge set. Mitigate with explicit acyclic-pass and synthetic-cycle-fail self-tests, mirroring the `SDL_TS_BAN_CAPABILITY_PRIVATE_PEER_IMPORT` self-test pattern.

## Open Questions

- Which single delegation direction breaks the `@sdl/pi` ↔ `@sdl/ccc` cycle: should the Presentation Host (`@sdl/pi`) depend on `@sdl/ccc` orchestration, or should `@sdl/ccc` compose capabilities so `@sdl/pi` need not depend on it? The objectives domain must leave `@sdl/pi` regardless; the direction choice governs the remaining non-objective edges.
- Where should the `@sdl/pi/runner-subagents/usage` seam that `@sdl/objective` consumes live so neither the capability nor the Presentation Host imports the other — neutral infra, the objective capability itself, or another owner?
- How much of `@sdl/pi/objectives/extension.ts` is genuine Pi presentation that should remain as a thin Pi shell versus domain logic that belongs in the `@sdl/objective` Domain Core?
- Should the acyclicity check derive the Extension Dependency Graph from `package.json` `workspace:*` edges, from actual import specifiers, or both, to avoid false greens where a `package.json` edge exists without imports (or vice versa)?
