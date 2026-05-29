# Phase 2 Graphite Branch Graph Implemented

## Summary

Implemented the Phase 2 structured Graphite graph support in `asdl_core.gt`. The gateway contract now has `GtGateway.branch_graph(cwd)`, with `GtBranchGraph` and `GtTrackedBranch` models for the configured-trunk reachable Graphite metadata component.

`RealGtGateway.branch_graph()` reads `.graphite_repo_config` for the Graphite trunk and `.graphite_metadata.db` for branch rows, both read-only. It traverses stored child edges from the configured trunk, excludes unreachable metadata rows, reports hard failures for missing config/metadata/schema/trunk prerequisites, and records warnings for malformed children, missing child rows, parent/child disagreement, cycles, and conflicting `TRUNK` markers.

`FakeGtGateway` can seed branch graph results, pass through failures, and track `branch_graph()` calls. The existing current-branch-centered `stack()` API remains stable.

Verification: targeted Graphite type/fake/real gateway tests passed; `uv run ty check` passed; `uv run ruff check` passed; `uv run ruff format --check` passed; full `just` passed.

## Objective Impact

Phase 2 is complete. The Objective now has the structured Graphite graph layer needed by later `objective gt stacks` projection work without parsing `gt ls` and without requiring the current checkout branch to be Graphite-tracked.

This de-risks the earlier concern that `GtGateway.stack()` was too current-branch-centered for stack projection: `branch_graph()` is repo/trunk-centered, while `stack()` remains unchanged for existing consumers.

## Follow-Ups

- Implement the Phase 3 Objective stack projection model over `GtBranchGraph`.
- Define the `objective gt stacks` JSON schema and renderers in the later CLI phase.
- Add the `/objective-gt-stacks` Pi wrapper after the CLI command exists.
