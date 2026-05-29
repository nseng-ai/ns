# Phase 1 Dirty Marker Implemented

## Summary

`objective list` now marks checkout-local Objective records with outstanding working-tree changes by prefixing the human and Markdown latest-update cell with `(x)`. The detection is path-scoped to `.asdl/objectives/<slug>/` and covers staged, unstaged, and untracked files while ignoring unrelated and archive-root paths.

The record-oriented JSON contract remains unchanged: records still expose only `slug`, `status`, and `latest_update_iso`, and dirty state is kept as renderer-only internal state.

Validation run:

- `uv run pytest packages/asdl-core/tests/gateways/test_fake_git_gateway.py packages/asdl-core/tests/gateways/test_real_git_gateway.py packages/asdl-objectives/tests/unit/test_list.py packages/asdl-objectives/tests/unit/test_list_render.py packages/asdl-objectives/tests/scenario/test_objective_cli.py`
- `uv run ty check`
- `just` after `just fix` resolved ruff-format-only changes

## Objective Impact

This closes the remaining Phase 1 dirty-marker work for checkout-local `objective list`. Phase 1 now has path-scoped Git gateway coverage, fake-driven builder and CLI tests, renderer coverage for `(x) —`, and documentation that JSON stays raw and dirty-state-free.

Graphite stack projection, `/objective-gt-stacks`, and future Pi picker use of checkout-local outstanding-change facts remain out of scope for this slice.

## Follow-Ups

- Implement `objective gt stacks` in the later Graphite phases.
- Add the separate `/objective-gt-stacks` Pi wrapper after the Graphite command exists.
- Decide in a later Pi picker slice whether and how checkout-local dirty facts should influence changed-Objective suggestions.
