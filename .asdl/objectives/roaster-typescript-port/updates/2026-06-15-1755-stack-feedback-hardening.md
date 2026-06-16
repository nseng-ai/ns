# Stack Feedback Hardening Landed

## Summary

The TS roaster stack incorporated the non-approval review feedback pass for the currently selected tip branch. The hardening kept the port aligned with repo TypeScript conventions: shared primitive guards/error formatting are reused in config and review-definition parsing, the review-catalog fake no longer mutates a caller-owned map parameter, unified-diff raw text is paired by parsing each raw segment independently, and the GitHub batched-review path cleans up its temporary JSON input with targeted test coverage.

Evidence: local branch diff against `voided-stack-feedback-thread-bucket`; current HEAD contains the TS roaster gateway and parser surfaces being hardened. Verification: `just ts-check`, `just ts-test`, and `just dprint-check` passed after the restack conflict resolution.

## Objective Impact

This does not close the port, but it materially improves confidence in several in-progress slices: pure-core parsing/config, local review-catalog gateway behavior, and the roaster-local GitHub gateway. The roadmap now records those slices as in progress with the specific hardening evidence instead of leaving the gateway rows as untouched.

The remaining Objective gates are still substantial: functional CLI parity, CI cutover on a real PR, remaining approval-required stack feedback, and Python package deletion remain open.

## Follow-Ups

- Resolve or explicitly defer the remaining approval-required stack feedback before treating the port as review-clean.
- Prove the full TS roaster CI path on a real PR before flipping the workflow and deleting the Python package.
