# Execution policy expanded for stack implementation

## Summary

The Objective record now contains explicit execution-friendly policy for `objective-next` and `objective-stack-impl`.

Changes made:

- Added a detailed `## Definition of Progress` to distinguish keepable TypeScript port progress from speculative redesign, hidden state, premature Python deletion, or over-broad shared extraction.
- Added a `## Runner Policy` that permits local repository execution after preview and explicit confirmation, while preserving steer-first gates for parser/schema divergence, plugin compatibility, package context decisions, validation failures, and Python deletion.
- Expanded the roadmap from broad phases into independently reviewable vertical slices with row-level `Policy:` and `Evidence:` prose.
- Preserved the default direction from the inventory: standalone TypeScript `objective` command, run-from-source shim, plugin retirement after final review, and rollback/reference evidence before Python deletion.

## Objective Impact

The Objective is now much more executable by the stack implementation workflow. A parent agent can propose a small Graphite stack from the roadmap, dispatch one runner subagent at a time, and judge each slice against explicit progress and evidence criteria.

The next execution-ready slice remains the minimal TypeScript package plus `objective exec read-objective` parity. Later rows now spell out safe execution boundaries for list modes, branch attribution, archive/unarchive, runner telemetry, caller/install migration, plugin retirement, Python deletion, and umbrella Objective feedback.

The policy intentionally does not authorize PR submission, external system mutation, hidden ledgers, Branch Memory state, product redesign, or premature Python removal.

## Follow-Ups

- Use `objective-stack-impl` to preview and confirm an initial 1-3 branch stack before dispatching runner subagents.
- Treat plugin retirement and Python deletion rows as steer-first even though most earlier implementation slices are execution-friendly.
- Record a new Semantic Update after each meaningful vertical slice or accepted divergence.
