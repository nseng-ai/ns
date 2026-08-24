# @nseng-ai/pi-ns-branch-context

Pi host adapter for the [`@nseng-ai/branch-context`](../../../../extensions/branch-context/README.md) ns extension.

This incubating package preserves `/ns:plan:save` and the `/ns:branch-context:*` Pi commands while keeping their Pi registration, prompt/status presentation, plan-save tooling, and session replacement out of the harness-independent Branch Context package. Users can review separately with `grill-me`, `grill-with-docs`, `grilling`, or `domain-modeling`, or invoke the portable `plan-grill-and-save` skill when review should end with this package's retained `write_saved_plan_file` tool. There is no separate Pi command for that skill. The package consumes portable behavior through `@nseng-ai/branch-context/api` and `@nseng-ai/plans/api`, and uses neutral `@nseng-ai/pi-runtime/...` host contracts.

The package declares its own `pi.extensions` entrypoint and is loaded directly from `.pi/settings.json`, so each ns worktree runs its own package code. The optional ns Slot development profile omits any global copy of this package to prevent duplicate tool registration. No project-local `.pi` discovery adapter is required.
