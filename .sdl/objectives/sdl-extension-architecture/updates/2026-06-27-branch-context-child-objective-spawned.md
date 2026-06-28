# Branch Context child Objective spawned

## Summary

Spawned `branch-context-capability-extension` as the next focused Phase 2 step-4 child Objective after the closed Objective child. This is a follow-on to the already closed `branch-context-plans-extension` child, not a replacement for it.

Scoping evidence gathered before creation:

- `branch-context-plans-extension` is closed and already established `@sdl/branch-context/api` / `@sdl/plans/api`, migrated CCC/Pi consumers to those Capability APIs, and documented storage-sensitive Branch Context + Plans behavior.
- `ts/packages/branch-context/package.json` still declares `@sdl/pi`.
- `ts/packages/branch-context/src/impl-command.ts` imports and re-exports `IMPL_BRANCH_CONTEXT_COMMAND_NAME` from `@sdl/pi/commands` to format `/sdl:branch-context:impl-attached-plan <key>`.
- Current CCC and Pi Branch Context consumers already import Branch Context behavior from `@sdl/branch-context/api`, so the remaining child scope is the Branch Context → Pi edge and command-surface ownership, not a wholesale API migration.

The confirmed child scope is focused: remove Branch Context's Pi dependency/imports, settle implementation-command slash-surface ownership at the Pi/CCC presentation edge rather than in Branch Context domain code, preserve the current Capability API and storage behavior, and define stale-edge/completion gates. Broader autobranch/branch-context/pi/sdl manifest-cycle cleanup remains out of scope unless it directly blocks the Branch Context de-Pi boundary.

## Objective Impact

Parent Phase 2 step 4 now records Branch Context as an active child Objective: `branch-context-capability-extension`.

This keeps the parent roadmap's child fan-out moving in `ccc`-consumption order while preserving prior closed-child provenance:

- Slot remains closed via `slot-capability-extension`.
- Objective remains closed via `objective-capability-extension`.
- Branch Context now has a focused follow-on child for the remaining layering violation that the earlier Branch Context + Plans API child did not own.

No parent completion criteria are closed by this spawn alone. Parent Phase 2 remains open until remaining child capability migrations, broader CCC clean-consumer work, and `@sdl/domain-primitives-transitional` deletion complete.

## Follow-Ups

- Start `branch-context-capability-extension` at its first roadmap row: inventory the current Branch Context Pi edge and consumer expectations.
- After the child removes the `@sdl/branch-context` → `@sdl/pi` edge, update this parent with stale-edge evidence and any residual graph debt that should move to autobranch or broader CCC clean-consumer work.
- Do not reopen saved-plan storage, Branch Memory key semantics, or the completed Branch Context + Plans API migration unless a separate steer-first decision expands scope.
