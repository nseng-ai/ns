# @nseng-ai/pi-ns-branch-context

Pi host adapter for the [`@nseng-ai/branch-context`](../../../../extensions/branch-context/README.md) ns extension.

This incubating package preserves the `/ns:branch-context:*` and `/ns:plan:*` Pi commands while keeping Pi registration, prompt/status presentation, plan-save tooling, Grill activation, and session replacement out of the harness-independent Branch Context package. It consumes portable behavior through `@nseng-ai/branch-context/api` and `@nseng-ai/plans/api`, and uses neutral `@nseng-ai/pi-runtime/...` host contracts.

The curated `./session-plan-discovery` export owns conservative Saved Plan discovery from a persisted Pi session. It captures Pi's exact effective `session-plan-discovery` skill and runs a tool-less, isolated `pi --fork` with the configured `plans.session-discovery` model operation. The no-path `/ns:branch-context:from-plan`, `/ns:branch-context:upstack-impl-from-plan`, and `/ns:plan:impl-saved-plan` consumers use these bounded typed outcomes, require Pi UI selection/confirmation, and never fall back to the newest plan. Explicit paths remain deterministic. Dry runs report the candidate, basis, evidence, and required confirmation without saving or mutating. The fork reasons over Pi's effective constructed context. Version 1 does not inspect raw JSONL entries compacted out of that context, so discovery can conservatively return `ambiguous` or `not-found` when exact evidence is unavailable.

The package declares its own `pi.extensions` entrypoint and is loaded directly from `.pi/settings.json`, so each ns worktree runs its own package code. The optional ns Slot development profile omits any global copy of this package to prevent duplicate tool registration. No project-local `.pi` discovery adapter is required.
