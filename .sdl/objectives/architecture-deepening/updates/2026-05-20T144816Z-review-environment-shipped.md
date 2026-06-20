# Semantic Update: Ship `review_environment` seam

## Summary

The asdl-reviewer gateway consolidation now has landed-state evidence to count as shipped. The implementation deletes the four thin gateway packages (`harness_detection`, `local_diff`, `review_definition`, `review_execution`) and replaces them with one `review_environment` gateway backed by real and fake adapters. `workflow.py` now calls through that one seam for review source loading, review-key listing, diff loading, harness detection, and review execution.

The reviewer test surface targets the new interface: workflow unit tests use `FakeReviewEnvironmentGateway`, gateway tests exercise the real and fake composite adapters, and scenario/plugin smoke tests cover the CLI wiring. The targeted reviewer suite passed: `uv run pytest packages/asdl-reviewer/tests/unit/test_workflow.py packages/asdl-reviewer/tests/gateways/test_fakes.py packages/asdl-reviewer/tests/gateways/test_real_gateways.py packages/asdl-reviewer/tests/gateways/test_review_definition_keys.py packages/asdl-reviewer/tests/scenario/test_exec_cli.py packages/asdl-reviewer/tests/scenario/test_harness_cli.py packages/asdl-reviewer/tests/scenario/test_review_cli.py tests/scenario/test_plugins.py`.

## Objective Impact

This ships the **Collapse asdl-reviewer gateways into one review-environment seam** roadmap row. Applying landed-state semantics, the row is `[x]`: the Objective should not remain partially complete merely because the implementation and tracking update are landing together. The deletion-test argument held: the workflow stopped knowing four separate gateway shapes and now depends on the single environment variation point.

The reviewer-gateway risk note was updated from "not fully de-risked until review/merge" to "de-risked for this candidate by the composite real/fake seam and tests." A residual risk remains for the separate harness-invocation candidate: that later work may still reveal harness-specific seams worth restoring or reshaping.

## Follow-Ups

- The next open roadmap implementation row is **Move clinkr operation registration into `ClinkrGroup`**.
- When the **Unify asdl-reviewer harness invocation** row is picked up, start by comparing it against the new `review_environment` seam so the work does not reintroduce the same gateway scattering under a different name.
