# Semantic Update: Ship clinkr operation registration deepening

## Summary

The clinkr operation-registration candidate is shipped. The top-level `_register_operation(...)` helper was removed; registration now lives behind `ClinkrGroup._register_operation(...)`, and constructor registration calls that instance-private seam. Aliases now register through `add_alias(...)` instead of writing the alias map directly.

The standalone Pydantic-to-Click params bridge was folded into `group.py` as private helpers. `params.py` and `test_params.py` were deleted after behavior coverage moved up through registered commands in `test_operation_registration.py`. Type-hint extraction is cached per request type with `@cache`, while Click parameter objects are freshly inferred or copied for each command registration.

Verification passed: `uv run pytest packages/asdl-core/tests/unit/clinkr`, representative plugin/CLI scenario suites for plugins, slots, reviewer, and pr-address, and the full `just` gate (`1302 passed`). No current-branch PR evidence was available (`gh pr view` found no PR for the branch).

## Objective Impact

This completes the **Move clinkr operation registration into `ClinkrGroup`** roadmap row. The deletion-test argument held: after deleting the params module and free registration helper, public command behavior remained covered through the group-owned registration seam. Decorator and group constructor APIs stayed unchanged, and aliases, generated args/options/flags, `--format`, and `--json-schema` behavior remain covered.

The clinkr risk note in `objective.md` was updated from prospective mitigation to shipped evidence because the refactor touched command registration surfaces across packages and the representative suites plus repo gate passed.

## Follow-Ups

- No immediate follow-up for the clinkr registration row; it is now shipped.
- The remaining open roadmap row is **Unify asdl-reviewer harness invocation**.
