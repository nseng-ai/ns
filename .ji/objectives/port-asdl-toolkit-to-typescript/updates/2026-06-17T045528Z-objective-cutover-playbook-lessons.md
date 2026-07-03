# Objective Cutover Playbook Lessons

## Summary

`objective` is now a TS-default capability in the umbrella migration ledger. The cutover reused the proven source-shim install model for another formerly Python-backed standalone CLI, retired a Python `asdl` plugin path after inventory found no active callers, deleted `packages/asdl-objectives/`, and recorded rollback/reference evidence as in-repo commit `1b1bb1fa44ad`.

Reusable lessons fed back into the umbrella Objective:

- Checked-in Markdown record handling can stay package-local during a TypeScript port; Objective did not require broad `asdl-core` extraction before cutover.
- A Python plugin path does not need preservation when live callers use the standalone CLI and the child Objective records the retirement decision.
- Repo-local TypeScript source shims continue to be sufficient for active local development and skill/Pi callers when actual consumers do not require checkout-free packaging.
- Some JSON compatibility may be better treated as explicit migration debt than as a blocker to Python deletion. Objective retained local `legacyMachine` projections to keep Pi/CCC consumers compatible while deleting the Python package.

## Objective Impact

The umbrella migration Objective now records `objective` as the completed fourth default TypeScript cutover and advances the default remaining sequence to `asdl-dispatcher` unless new evidence changes the order. The porting playbook now includes Objective evidence for contract inventory, fallback retirement, and distribution decisions. The migration-debt ledger now tracks the Objective-local legacy machine-output projection with a kill action.

## Follow-Ups

- Continue the default capability sequence with `asdl-dispatcher` planning/implementation when selected.
- Burn down the Objective-local `legacyMachine` debt with a coordinated Pi/CCC JSON-consumer migration before closing the umbrella TypeScript migration Objective.
