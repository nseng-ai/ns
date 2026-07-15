# Runtime Graphite Dependency Boundary

Routed from the root `AGENTS.md` ("Source Control & GitHub" section). Read before adding any Graphite dependency to runtime package code.

Graphite is the contributor workflow tool for this repo, but runtime package code must not depend on Graphite by default. Before accepting a Graphite gateway, constructing a real Graphite adapter, shelling out to `gt`, or adding Graphite to a CLI context, first check whether the same behavior can be satisfied through the git gateway.

- Use `GitGateway` for ordinary repository facts: current branch, trunk/base branch, local branch existence, refs, commit ranges, patch IDs, and worktrees.
- A command or command group may depend on Graphite only when Graphite is part of its explicit user-facing contract: the command path, help text, and docs should name Graphite or `gt`, and the behavior should require Graphite stack metadata rather than plain git history.
- `slot gt` is the canonical opt-in Graphite command group and should be excluded from Graphite-boundary audits. Its name is the contract.
- Do not parse human-facing Graphite display output (`gt ls`, `gt ls --stack`, `gt log`, `gt branch info`) for machine topology decisions. Use Graphite plumbing such as `gt parent --no-interactive` / `gt children --no-interactive`, or `slot gt exec stack-branches` / `--format json` for current-stack topology. Display commands are fine for human visual confirmation only.
- Do not introduce Graphite dependencies into generic workflows, package contexts, or skill `exec` helpers as a convenience for stack discovery. If a workflow needs Graphite-specific stack semantics, put that behavior behind an explicit Graphite-named command or command group.

## Sanctioned local-dispatch publication exception

Local `ns dispatch prompt` source publication may consume the curated Flow minimal-submit client through `@nseng-ai/flow/api`, but only when the remote source is stale or missing, read-only structured planning has classified the branch as Graphite-tracked and computed the current/downstack impact, and the caller has supplied conditional Tier-3 authorization (TTY confirmation or dispatch `--force/-f`). Dispatch authorization is never forwarded as Graphite `--force`; Flow retains Graphite's remote-divergence safeguards.

This exception exists because an exact remotely reachable source revision is a prerequisite for Vercel dispatch. The Vercel capability must not import Graphite packages, read Graphite metadata itself, invoke `gt`, or carry Flow into Workflow/Sandbox runtime paths. It consumes only Flow's semantic plan/result and conservative mutation-evidence vocabulary at the local dispatch composition boundary.

This is not a general permission for runtime packages to depend on Flow or Graphite. A second consumer, a nearby workflow, or apparent command reuse does not automatically generalize the exception; reapply this convention and justify any broader boundary independently.

## Read-side discipline for agents and skills

The display-output rule above binds agent workflows, not just runtime code. Skills and agents reading Graphite topology use plumbing (`gt parent --no-interactive`, `gt children --no-interactive`) or the structured `ns slot gt exec stack-*` commands, and treat `gt ls`, `gt ls --stack`, `gt log`, and `gt branch info` as human visual confirmation only — never as a machine source of topology or tracking facts. Skills state the commands they actually run and point here for the rule.
