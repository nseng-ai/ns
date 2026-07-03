# asdl-core PR Construction Context Localized

## Summary

Added `asdl_core.gh.construction.build_pr_gateway` as the canonical production construction surface for shared PRGateway consumers. The builder preserves the existing lazy `gh` behavior by constructing `RealPRGateway` without eager repository, authentication, or availability checks, and forwards an optional explicit `repo` value for callers that already know the target repository.

Production CLI context builders that only need a production PRGateway now use the shared construction path instead of directly constructing `RealPRGateway`:

- `packages/asdl-pr-address/src/asdl_pr_address/cli/pr_address/context.py`
- `packages/asdl-slots/src/asdl_slots/cli/slot/context.py`
- `packages/roaster/src/roaster/cli/roaster/context.py`

Direct real-adapter references remain in the adapter implementation, real gateway tests, construction tests, and opt-in live conformance wiring where naming the real adapter is intentional.

Validation evidence:

- `uv run pytest packages/asdl-core/tests/gateways/test_pr_gateway_construction.py -q`
- `uv run pytest packages/asdl-core/tests/gateways/test_real_pr_gateway.py -q`
- `uv run pytest packages/asdl-core/tests -q`
- `uv run pytest packages/asdl-pr-address/tests -q`
- `uv run pytest packages/asdl-slots/tests -q`
- `uv run pytest packages/roaster/tests -q`
- `just`

## Objective Impact

The roadmap row **Localize `asdl-core` production gateway construction** remains `[~]`. This branch completes the PR/GitHub construction-locality slice for current production PRGateway consumers while preserving existing command behavior and gateway/domain failure surfaces.

The row remains partial because Graphite construction and the command-specific treatment of intentionally deferred direct `RealGitGateway()` construction in `aretro` and `asdl-pr-address` are still out of scope.

## Follow-Ups

- Treat Graphite construction separately while preserving the runtime Graphite dependency boundary.
- Revisit deferred direct `RealGitGateway()` construction in `aretro` and `asdl-pr-address` with command-specific context loading rather than forcing repo-required construction onto operations that should not need it.
