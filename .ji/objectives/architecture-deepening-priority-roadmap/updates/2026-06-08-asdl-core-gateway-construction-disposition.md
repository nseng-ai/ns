# asdl-core Gateway Construction Disposition Completed

## Summary

Ran a fresh production construction inventory after the Git, PR, and Graphite construction-locality slices. The remaining `asdl_core.git.real_git_gateway.RealGitGateway` production construction sites outside `asdl_core.git.construction` were:

- `packages/asdl-slots/src/asdl_slots/cli/slot/context.py` — repo-root retargeting after slots repo discovery.
- `packages/asdl-slots/src/asdl_slots/cli/slot/checkout.py` — branch-name shell completion helper.
- `packages/asdl-pr-address/src/asdl_pr_address/cli/pr_address/context.py` — intentionally lazy git gateway construction for PR-address operations.
- `packages/aretro/src/aretro/context.py` — intentionally lazy git gateway construction for retrospective evidence collection.

Added `asdl_core.git.construction.build_git_gateway` as the shared lazy production Git gateway builder for command-specific contexts that should not perform eager repo/trunk discovery. Migrated those four production call sites to the shared builder. `build_git_context` now also delegates its adapter construction through `build_git_gateway`, so direct `RealGitGateway` production construction is localized in `asdl_core.git.construction`.

Post-migration inventory shows no production `asdl_core.git.real_git_gateway` imports or `RealGitGateway()` construction outside `asdl_core.git.construction` and the adapter implementation. The remaining `vibechk.git.RealGitGateway` references are package-local to `vibechk` and are tracked by that separate roadmap row, not this `asdl-core` construction-locality row.

Validation evidence:

- `uv run pytest packages/asdl-core/tests/gateways/test_git_construction.py -q`
- `uv run pytest packages/asdl-slots/tests/unit/test_checkout_completion.py -q`
- `uv run pytest packages/asdl-slots/tests/scenario/test_slot_cli.py -q`
- `uv run pytest packages/asdl-slots/tests/scenario/test_slot_checkout_cli.py -q`
- `uv run pytest packages/asdl-core/tests -q`
- `uv run pytest packages/asdl-slots/tests -q`
- `uv run pytest packages/asdl-pr-address/tests -q`
- `uv run pytest packages/aretro/tests -q`
- `just`

## Objective Impact

The roadmap row **Localize `asdl-core` production gateway construction** is now complete. Shared construction surfaces exist for Git, PR/GitHub, and Graphite production gateways, and the fresh inventory found no remaining production `asdl_core` real-gateway construction leak needing command-specific exception treatment.

This completes the third priority project in the Objective while preserving the intended behavior split: mandatory-Git contexts use `build_git_context`, lazy/command-specific contexts use `build_git_gateway`, PR consumers use `build_pr_gateway`, and explicit Graphite consumers use `build_gt_gateway` behind Graphite-named command surfaces.

## Follow-Ups

- Treat `vibechk`'s package-local `RealGitGateway` under the later **Reshape `vibechk` seams around real depth** roadmap row, not as part of `asdl-core` gateway construction locality.
- If future package contexts need new production gateway wiring, route it through the relevant `asdl_core.<domain>.construction` helper rather than importing real adapters directly.
