# @nseng-ai/pi-ns-branch-context

Pi host adapter for the [`@nseng-ai/branch-context`](../../../../extensions/branch-context/README.md) ns extension.

This incubating package preserves the provider-independent `/ns:branch-context:*` and `/ns:plan:*` Pi commands and owns the plain-Git `/ns:git:new-branch-from-plan` and `/ns:git:impl-branch-from-plan` pair. It keeps Pi registration, prompt/status presentation, plan-save tooling, Grill activation, and session replacement out of the harness-independent Branch Context package. It consumes portable behavior through `@nseng-ai/branch-context/api` and `@nseng-ai/plans/api`, and uses neutral `@nseng-ai/pi-runtime/...` host contracts.

Graphite and GitHub Stacks commands live in `@nseng-ai/pi-ns-gt` and `@nseng-ai/pi-ns-gs`. This package neither owns Graphite nor makes it the default. Provider choice is explicit in the `git`, `gt`, or `gs` namespace, and provider-selection flags are unsupported.

The package declares its own `pi.extensions` entrypoint and is loaded directly from `.pi/settings.json`, so each ns worktree runs its own package code. The optional ns Slot development profile omits any global copy of this package to prevent duplicate tool registration. No project-local `.pi` discovery adapter is required.
