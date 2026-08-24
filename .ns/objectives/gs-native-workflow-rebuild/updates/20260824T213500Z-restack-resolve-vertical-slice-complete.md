# Semantic Update: restack-resolve vertical slice complete

## Summary

The local GS restack-resolve vertical slice now includes its portable resolver skill and thin,
directly discovered `/ns:gs:restack-resolve` Pi router. A minimal stable command-surface descriptor and
strict Clinkr envelope schema are exported only through `@nseng-ai/gs/api`; private orchestration remains
inside GS.

The Pi router captures exactly one effective `ns-gs-restack-resolve` skill before CLI mutation, loads a
fresh ns CLI module for each invocation, and runs one `gs restack-resolve --format json --yes` step with
optional explicit `--downstack`. Completion returns without an LM turn. Only a strictly parsed,
process-agreeing conflict stop invokes the exact captured skill with inherited structured evidence and
preserved user resolver context.

## Objective Impact

The restack-resolve roadmap row is complete. Package-local routing and parity tests cover clean
completion, interrupted-rebase continuation evidence, conflict handoff, exact effective-skill capture,
missing/ambiguous skills, malformed/refused/mismatched results, downstack routing, and user context.
Repository composition directly discovers the adapter, and Pi startup/cold-import inventory includes
its exported surfaces.

This slice does not integrate trunk, push or mutate GitHub, release Slots, automatically abort, edit
conflicts in Pi, loop provider advancement, or move provider mechanics into the host adapter. Those
boundaries remain explicit forward constraints. Earlier Semantic Updates remain immutable historical
records; this update supersedes only their statement that the portable skill and Pi router were pending.

## Follow-Ups

Proceed to the native autobranch vertical slice. Settle trunk integration, push/GitHub mutation, and
optional Slot composition only in their later evidence-backed workflow slices; do not widen the
restack-resolve router while doing so.
