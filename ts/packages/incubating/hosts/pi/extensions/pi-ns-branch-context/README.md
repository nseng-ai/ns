# @nseng-ai/pi-ns-branch-context

Pi host adapter for the [`@nseng-ai/branch-context`](../../../../extensions/branch-context/README.md) ns extension.

This incubating package preserves the `/ns:branch-context:*` and `/ns:plan:*` Pi commands while keeping Pi registration, prompt/status presentation, plan-save tooling, and session replacement out of the harness-independent Branch Context package. Plan review uses the portable `grill-me`, `grill-with-docs`, `grilling`, and `domain-modeling` skills before users invoke `/ns:plan:save`. It consumes portable behavior through `@nseng-ai/branch-context/api` and `@nseng-ai/plans/api`, and uses neutral `@nseng-ai/pi-runtime/...` host contracts.

The package declares its own `pi.extensions` entrypoint and is loaded directly from `.pi/settings.json`, so each ns worktree runs its own package code. The optional ns Slot development profile omits any global copy of this package to prevent duplicate tool registration. No project-local `.pi` discovery adapter is required.
