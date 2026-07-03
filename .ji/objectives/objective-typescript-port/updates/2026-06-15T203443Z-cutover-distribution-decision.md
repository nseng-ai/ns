# Cutover and distribution decision

## Summary

The Objective port should follow the standalone TypeScript CLI cutover model rather than preserving the `asdl objective` plugin by default.

Accepted direction:

- `objective` remains the user- and skill-facing command surface.
- The TypeScript port should use a repo-local run-from-source shim by default, matching the recent successful TypeScript capability ports unless Objective-specific implementation evidence disproves it.
- `asdl objective` is treated as a compatibility path to retire after final consumer/test review, not as a surface that must be preserved indefinitely.
- Python stays until TypeScript parity, caller/docs/install migration, plugin-retirement evidence, and rollback/reference evidence are recorded.

The closest precedent is `pr-address`: it ended as a standalone TypeScript CLI, retired its `asdl pr-address` plugin surface, deleted the in-repo Python package after parity/caller migration, and kept external rollback/reference evidence instead of an in-repo Python bridge.

## Objective Impact

The roadmap row `Decide the standalone/plugin/distribution cutover plan from inventory evidence` is now complete.

`objective.md` now records the run-from-source shim model as the accepted default and narrows plugin risk to the explicit final consumer/test compatibility review. The open questions now preserve the answered consumer and rollback/default decisions while leaving parser/help/schema and package-context questions open for implementation slices.

The next semantic work is to build the minimal TypeScript package and first deterministic read-only operation slice, starting from a small exec/read-only or list-mode operation that proves checked-in Objective storage and Clinkr envelope behavior.

## Follow-Ups

- During cutover, review and update `tests/scenario/test_plugins.py` before retiring or replacing `asdl objective`.
- Keep Python deletion gated on TypeScript parity, migrated callers/docs/install recipes, plugin-retirement evidence, and rollback/reference evidence.
- Do not create a Python bridge or checkout-free bundle requirement unless Objective-specific evidence reopens that decision.
