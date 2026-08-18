# Pi GT Context

## Terms

**GT branch from plan** — Pi workflow that selects a Saved Plan, derives a Branch Context slug, creates a local Git branch without checking it out, tracks it with Graphite, and attaches the plan.

**GT branch and implement from plan** — Strict GT creation from a required Saved Plan followed by exact target checkout, fresh Pi session replacement, and Attached Plan dispatch. Missing Saved Plan evidence is terminal before provider, Git, Branch Memory, checkout, or session mutation; existing branches resume through `/ns:branch-context:impl-attached-plan [<key>]`.

## Boundary

This package owns GT-branded Pi command registration and host orchestration. `@nseng-ai/branch-context` owns branch creation and attachment policy; `@nseng-ai/plans` owns Saved Plan selection. This package consumes their curated `/api` exports directly and never composes through another Pi adapter.
