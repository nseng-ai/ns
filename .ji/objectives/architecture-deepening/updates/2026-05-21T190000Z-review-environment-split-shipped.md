# Semantic Update: Split `ReviewEnvironmentGateway` into `review_catalog` + `local_diff`; inject `HarnessRuntime` directly into `Workflow`

## Summary

The second Round 2 candidate is shipped. The unified `ReviewEnvironmentGateway` introduced in PR #486 bundled three concerns — review catalog (file-level), local diff (git-level), and harness execution (pure delegation to `HarnessRuntime` after PR #502). The fake gateway's `binary_locator` constructor argument existed only to support the delegated harness methods. This PR splits the three concerns apart along the natural seams:

- `gateways/review_catalog/` — `ReviewCatalogGateway` (ABC) + `RealReviewCatalogGateway` + `FakeReviewCatalogGateway`. Methods: `load_review_source`, `list_review_keys`.
- `gateways/local_diff/` — `LocalDiffGateway` (ABC) + `RealLocalDiffGateway` + `FakeLocalDiffGateway`. Method: `load_diff`.
- `harness/fake.py` — `FakeHarnessRuntime` subclasses the concrete `HarnessRuntime` and overrides `run_review` to record semantic requests. `HarnessRuntime` itself is no longer hidden behind a gateway and is injected directly into `Workflow` and `ReviewerCliContext`.

`gateways/review_environment/` is deleted entirely.

`Workflow.run_review_by_key` now takes three explicit dependencies instead of one composite: `catalog: ReviewCatalogGateway`, `diff: LocalDiffGateway`, `harness_runtime: HarnessRuntime`. `resolve_harness` takes a `harness_runtime` directly. `ReviewerCliContext` now bundles `catalog`, `diff`, `harness_runtime`, `issue_gateway`, and `cwd`. The CLI handlers (`harness/list_harnesses.py`, `harness/show_harness.py`, `review/list_reviews.py`, `review/run.py`) read the appropriate field from the typed context.

## Objective Impact

This completes the second **Round 2** roadmap row. The deletion test held:

- Removing the harness methods from the unified gateway left no orphan callers. `Workflow` can take `HarnessRuntime` directly, and the CLI's `harness list` calls `harness_runtime.list_harnesses()` without a gateway pass-through.
- Catalog and diff have independent fake shapes (fixture file content vs. git-command output) and independent test scenarios. The previously unified gateway was bundling unrelated fakes rather than expressing a real seam — splitting confirms it.
- Real and fake implementations shrunk: the 181-line `RealReviewEnvironmentGateway` became `RealReviewCatalogGateway` (~120 lines) + `RealLocalDiffGateway` (~40 lines), with the 11 lines of harness-method delegation eliminated. The 116-line `FakeReviewEnvironmentGateway` became `FakeReviewCatalogGateway` (~60 lines) + `FakeLocalDiffGateway` (~30 lines) + `FakeHarnessRuntime` (~50 lines), with the `binary_locator` lambda gone from catalog/diff entirely.

The harness layer stays unified inside `HarnessRuntime`; this PR does not return to the four-gateway shape from before #486. It splits back only the parts of the unified gateway that bundled three unrelated concerns.

Both Round 2 roadmap rows are now shipped. The Round 2 closure can be recorded in a follow-up that converts the `closed.md` marker to a full Round 2 Closure section in `objective.md`, mirroring the Round 1 Closure shape.

## Follow-Ups

- Record a `## Round 2 Closure` section in `objective.md` once this PR lands, mirroring Round 1 Closure.
- If a second harness or a second review-input shape appears in the future, evaluate against the new three-dependency shape (`catalog`, `diff`, `harness_runtime`) rather than reintroducing the composite gateway.
