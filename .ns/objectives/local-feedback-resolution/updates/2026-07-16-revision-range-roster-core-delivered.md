# Revision-Range Roster Core Delivered

## Summary

The Reviews production core now supports a return-only Capability API operation over an already-confirmed Git revision-range expression and complete ordered roster. One range diff is loaded and reused for applicability and sequential selected-review execution; checked-in definitions and repository model policy determine models; definition, model-resolution, and runner failures remain visible without aborting later reviews; and typed progress events expose foreground lifecycle state.

The structured result records the confirmed range, one injected-clock timestamp, ordered toggled-off/completed/failed entries, coverage and usage for completed reviews, and verbatim source-attributed findings. Identical findings are distinguished by deterministic per-review content-tuple occurrence. Malformed catalog definitions remain definition-stage failures even when their roster selection is false, because applicability and selection cannot be interpreted from an invalid definition.

## Objective Impact

This completes the first production-core roadmap slice while retaining the existing single-review `ns reviews run` and `ReviewsClient.runReview` compatibility path, including one-run overrides, prior-findings behavior, and per-review Review logs. The new roster path writes no Review logs, gathers or publishes no GitHub findings, and has no checkout-mutation authority.

Focused fake-driven tests cover exact revision-range Git argv, one diff load, complete roster validation, confirmed sequential order, toggled-off behavior, review-local continuation, shared-failure aborts before runner execution, progress callback isolation, coverage retention, source attribution, duplicate occurrence, deterministic time, and the absence of roster-path Review-log writes. `just`, `just ts-test-integration`, and `just ts-test-isolated` passed on the implementation branch.

## Follow-Ups

- Build production aggregation and engineer-correctable manual resolution over this roster result without changing the producer evidence contract.
- Add the later command journey for explicit range and roster confirmation; do not imply that this API-only operation performs confirmation itself.
- Exercise the complete steelthread on representative real changes before judging whether content-tuple occurrence or run-level provenance needs correction.
