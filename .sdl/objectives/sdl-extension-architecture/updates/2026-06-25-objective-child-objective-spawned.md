# Spawned the Objective per-capability child Objective (Phase 2 step 4)

## Summary

Continuing Phase 2 step 4 (per-capability migration fan-out, ordered by `ccc`-consumption) after Slot, the next child Objective was spawned: `objective-capability-extension` (open, planning-only, no Runner Policy). It was selected because `ccc` reaches the objectives domain through the `@sdl/pi` Presentation Host, making the objective migration the load-bearing prerequisite for the step-5 cycle-break.

Evidence gathered while scoping:

- The objectives domain consumed by siblings lives in `@sdl/pi/objectives/{selection.ts (~414), picker.ts (~202), list.ts (~107), extension.ts (~860)}`, not in `@sdl/objective`.
- In-process consumers of that domain: `ccc/src/objective-stack-impl.ts` and `ccc/src/cmux/sidebar.ts` (`@sdl/pi/objectives/selection`); `sdlcc/src/objective-tab.ts` (`@sdl/pi/objectives/list`).
- Reverse entanglement: `@sdl/objective` declares `@sdl/pi` as a dependency and imports `@sdl/pi/runner-subagents/usage` from `src/operations/runner-subagent-usage.ts`.
- `@sdl/objective` does not yet expose an `./api` subpath (only `.`); `@sdl/slot/api`, `@sdl/branch-context/api`, and `@sdl/plans/api` are the `/api` precedents.
- The `@sdl/pi` ↔ `@sdl/ccc` cycle is bidirectional at the package level (mutual `workspace:*`): `@sdl/pi`→`@sdl/ccc` (worktree-status, cmux/focused-terminal-tab, trunk-pull, objective-stack-impl, land, handoff-tab, branch-context-up-and-impl) and `@sdl/ccc`→`@sdl/pi` (commands/ack, terminal/presentation, objectives/selection).
- `just ts-guard` runs `ts/scripts/guard-typescript-style.mjs` and already hosts `SDL_TS_BAN_CAPABILITY_PRIVATE_PEER_IMPORT` with self-tests — the natural home/pattern for the new topological acyclicity check.

## Objective Impact

- **Steer-first scope decision (user-confirmed):** the child Objective owns the full cycle-break, not just the domain relocation. Its scope is: establish `@sdl/objective/api`, relocate the objectives Domain Core out of `@sdl/pi` (gateway-injected, unit-testable), repoint `ccc`/`sdlcc`, resolve the `@sdl/objective`→`@sdl/pi` entanglement, pick the single Pi/CCC delegation direction, break the `@sdl/pi`↔`@sdl/ccc` cycle, and land the `just ts-guard` acyclicity check.
- Parent roadmap step 4 records the objective child spawn alongside the closed Slot child.
- Parent roadmap step 5 now records that the cycle-break + `ts-guard` acyclicity check are **delegated** to `objective-capability-extension`; what remains in parent step 5 is converting `ccc` into the highest-fan-out clean consumer across the **other** capabilities, which depends on their step-4 migrations.
- No previously-completed roadmap row changed status; the parent Objective stays open.

## Follow-Ups

- Implement `objective-capability-extension` starting with its first roadmap row (establish `@sdl/objective/api` + the gateway-injected Domain Core boundary).
- Continue parent step 4 with the remaining capability migrations (handoff, branch-context, plans, pr-address, roaster, aretro) ordered by `ccc`-consumption.
- When the child lands the acyclicity check and cycle-break, reconcile parent step 5's remaining scope.
