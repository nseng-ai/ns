# Failure Identity Fallbacks Added

## Summary

Roaster summary-comment formatting now preserves review identity and base identity for ordinary nonzero Clinkr failure envelopes that do not carry structured `data`. `roaster exec format-findings-comment` accepts `--review-name` and `--base-ref` fallback values, the GitHub Actions review job passes `$REVIEW_KEY` and `$BASE_REF`, and parsing still prefers structured envelope identity when present.

This keeps harness/runtime failures as real failing Clinkr envelopes while preventing matrix jobs from collapsing into a shared `<!-- roaster:unknown -->` summary marker.

Verification: targeted roaster publication/exec/workflow tests passed; `just python-check` passed.

## Objective Impact

The roadmap row for preserving review and base identity through failures is now complete. The remaining active hardening work is live summary-comment behavior for matrix races/status semantics on an oversized case, not local failure-identity parsing.

## Follow-Ups

- After the bounded-review branch lands, verify an oversized synthetic or real PR run so GitHub checks/comments show bounded-review coverage, failure identity, run URL, inline-posting status, and latest actionable status as expected.
- Keep semantic sharding parked unless bounded single-call review coverage proves insufficient in practice.
