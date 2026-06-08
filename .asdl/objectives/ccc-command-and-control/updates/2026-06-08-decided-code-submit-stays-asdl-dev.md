# Decided Code Submit Stays Below CCC

## Summary

Settled the remaining source-control command/control placement question: `/code:submit` should remain a pure Pi mirror of `asdl-dev submit` for now rather than receiving a CCC wrapper only for command-suite placement.

The current `/code:submit` surface is registered through the generic `asdl-dev` Pi adapter, while `asdl-dev submit` owns checkpoint-before-submit behavior, Graphite submit preflight, optional restack, submit execution, current-PR verification, command running, and failure presentation. That behavior is a lower source-control CLI capability, not current CCC cross-capability orchestration.

## Objective Impact

This completes the source-control command/control roadmap row. CCC now owns the repo-opinionated flows that cross orchestration boundaries: `/code:autobranch`, `/code:land`, and `/code:land-stack`. `asdl-dev` remains the lower home for command runners, pending-worktree snapshots, checkpoint primitives, Vercel preview lookup, lower gateways, and `/code:submit` unless a future workflow needs deeper orchestration than command-suite placement.

Evidence considered: local branch diff against Graphite parent `move-code-land-orchestration-into-ccc`, current PR #1113 file inventory, current `ts/packages/pi-extensions/src/asdl-dev-extension.ts` adapter shape, and current `ts/packages/asdl-dev/src/submit.ts` ownership of submit semantics.

## Follow-Ups

- Continue with the workspace-status split so CCC observability is explicit while generic Pi footer plumbing remains reusable.
- Keep `/code:submit` below CCC unless future behavior coordinates submit with cmux, slots, Objectives, handoffs, planned branches, or another multi-capability CCC workflow.
