# Remaining Focus Narrowed to asdl-core and asdl-pr-address

## Summary

The remaining active implementation scope for the Architecture Deepening Priority Roadmap is narrowed by explicit user direction. The Objective should continue pursuing only two unshipped projects:

- finish the `asdl-core` domain output converters/readers row by inspecting GitHub response mapping and making a Graphite metadata reader disposition;
- deepen `asdl-pr-address` feedback snapshot / prepare-run policy behind an in-process interface.

The `roaster`, `areg`, `vibechk`, and `packagechk` roadmap rows are parked with concise reasons instead of remaining active implementation candidates in this Objective.

## Objective Impact

The roadmap now has two active remaining rows: the partial `asdl-core` adapter conversion/disposition row and the unstarted `asdl-pr-address` feedback workflow row. The `roaster`, `areg`, `vibechk`, and `packagechk` rows move from `## Work` to `## Parked`, satisfying their required durable disposition as parked-with-reason.

The Objective narrative now records the narrowed active focus and revises assumptions/open questions so future continuation work does not treat the full original top-ten list as an active queue.

## Follow-Ups

- For `asdl-core`, inspect current `asdl_core.gh` response mapping first; then reread `asdl_core.gt` metadata parsing and either extract a focused reader or park that remainder with reason if extraction would be churn.
- For `asdl-pr-address`, reread the package audit and current code before designing the feedback snapshot / prepare-run interface.
- Do not unpark `roaster`, `areg`, `vibechk`, or `packagechk` under this Objective without a new explicit direction and current-code revalidation.
