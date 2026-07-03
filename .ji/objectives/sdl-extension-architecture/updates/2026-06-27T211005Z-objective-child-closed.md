# Objective child Objective closed

## Summary

The parent architecture Objective was stale relative to the now-closed `objective-capability-extension` child Objective. The child record has `closed.md`, and its `objective.md` closure records the completed Objective capability migration: Objective domain behavior lives behind `@sdl/objective/api`, `ccc` and `sdlcc` consume that Capability API instead of `@sdl/pi/objectives/*`, `@sdl/objective` no longer depends on `@sdl/pi`, `@sdl/pi` no longer imports or declares `@sdl/ccc`, `just ts-guard` enforces the Objective-scoped manifest acyclicity invariant, final context documentation is complete, and `sdl objective ...` is the sole Objective command surface.

This update consumes the parent follow-up from `updates/2026-06-27-objective-child-completion-rebaseline.md`: the child is no longer merely complete-but-open; it is closed.

## Objective Impact

Phase 2 step 4 now records Objective as a closed child migration alongside the previously closed Slot child migration. The parent architecture Objective remains open because the remaining capability migrations, broader `ccc` clean-consumer conversion, deferred manifest-cycle cleanup, and `@sdl/domain-primitives-transitional` deletion are still incomplete.

No parent closure is implied by this update. Step 5 remains partial: the Objective-domain cycle-break and acyclicity guard are complete, but parent-level `ccc` clean-consumer work across the other capabilities still depends on future step-4 child migrations.

## Follow-Ups

- Continue parent Phase 2 step 4 by choosing the next remaining capability child migration among handoff, branch-context, plans, pr-address, roaster, and aretro, ordered by `ccc` consumption and transitional-package retirement pressure.
- Do not start parent step 6 until remaining capability migrations and broader `ccc` clean-consumer work are complete and `@sdl/domain-primitives-transitional` has no live consumers.
