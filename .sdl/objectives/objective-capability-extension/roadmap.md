# Roadmap

## Work

- [ ] Establish the `@sdl/objective/api` Capability API surface and the gateway-injected Domain Core boundary.
  - Decide the curated `@sdl/objective/api` export shape that `ccc`/`sdlcc` need (selection + listing surface), following the `@sdl/slot/api`/`@sdl/branch-context/api`/`@sdl/plans/api` precedent. Add the `./api` subpath to `ts/packages/objective/package.json` exports.
  - Define the Domain Core seam so relocated logic takes injected gateways (via `@sdl/capability-kit`), not raw `ctx`.
  - Evidence: `@sdl/objective/api` resolves; a placeholder/curated surface compiles; convention matches existing `/api` capabilities.

- [ ] Relocate the objectives domain out of `@sdl/pi/objectives/*` into `@sdl/objective`.
  - Move `selection.ts`, `picker.ts`, `list.ts`, and the domain portions of `extension.ts` into `@sdl/objective`, refactored into a gateway-injected Domain Core; leave any genuine Pi presentation as a thin shell.
  - Add in-memory-gateway unit tests for the relocated core (selection/listing decisions) with no real subprocess and no raw `ctx`.
  - Evidence: domain logic lives in `@sdl/objective`; `@sdl/pi/objectives/*` is removed or reduced to a thin presentation shell; new unit tests pass.

- [ ] Repoint in-process consumers to `@sdl/objective/api` and resolve the reverse `@sdl/objective` → `@sdl/pi` entanglement.
  - Repoint `ccc/src/objective-stack-impl.ts`, `ccc/src/cmux/sidebar.ts`, and `sdlcc/src/objective-tab.ts` from `@sdl/pi/objectives/*` to `@sdl/objective/api`.
  - Relocate the `@sdl/pi/runner-subagents/usage` seam consumed by `@sdl/objective/src/operations/runner-subagent-usage.ts` to a non-Presentation-Host home so `@sdl/objective` drops its `@sdl/pi` dependency.
  - Evidence: no consumer imports `@sdl/pi/objectives/*`; `@sdl/objective/package.json` no longer declares `@sdl/pi`; typecheck/tests green.

- [ ] Pick the single Pi/CCC delegation direction and break the `@sdl/pi` ↔ `@sdl/ccc` bidirectional cycle (decision + execution).
  - Policy: steer-first — surface the directional options and the full edge inventory before cutting.
  - Inventory edges both directions (`@sdl/pi`→`@sdl/ccc`: worktree-status, cmux/focused-terminal-tab, trunk-pull, objective-stack-impl, land, handoff-tab, branch-context-up-and-impl; `@sdl/ccc`→`@sdl/pi`: commands/ack, terminal/presentation, and the now-removed objectives/selection), choose one direction, and relocate/redirect the offending edges accordingly.
  - Evidence: only one of the two packages depends on the other; neither imports the other's removed side; `just` green.

- [ ] Land the `ts-guard` topological acyclicity check for the Extension Dependency Graph.
  - Add a topological cycle check (extending `ts/scripts/guard-typescript-style.mjs` or a sibling script wired into `just ts-guard`) over the capability/consumer dependency edges, with self-tests for an acyclic-pass and a synthetic-cycle-fail, mirroring the `SDL_TS_BAN_CAPABILITY_PRIVATE_PEER_IMPORT` self-test pattern.
  - Evidence: `just ts-guard` fails on an injected cycle and passes on the real (now-acyclic) graph; self-tests included.

- [ ] Document the objective capability and acyclicity boundary.
  - Policy: steer-first before finalizing durable capability vocabulary.
  - Write `ts/packages/objective/CONTEXT.md` (Command Face / Domain Core / Capability API boundary, runner-subagent-usage home, acyclicity invariant) and register it in `CONTEXT-MAP.md`.
  - Evidence: CONTEXT file exists and is mapped; dprint check passes.

## Parked

- Converting `ccc` into the highest-fan-out clean consumer for capabilities other than objective — owned by parent `sdl-extension-architecture` step 5 and dependent on the remaining step-4 capability migrations.
- Any objective Domain Core timeout/abort/cancellation semantics for in-process callers — deferred unless a concrete consumer needs it (mirrors the Slot follow-up disposition).
