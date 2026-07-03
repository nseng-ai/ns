# Bounded Review Coverage Policy Selected

## Summary

The durable oversized-roaster policy is now filtered bounded semantic review with disclosed coverage. Roaster applies configured `[roaster.diff].exclude` patterns before prompt budgeting, then applies harness-owned prompt caps of `120_000` estimated diff tokens total and `40_000` estimated tokens per file diff.

When the filtered diff exceeds those caps, roaster omits whole file diff segments from the prompt input instead of skipping the review, hard-failing preflight, or sharding into multiple Claude calls. Successful review JSON carries `input_coverage`, and PR summary comments render a “Review input coverage” section that discloses counts, caps, omitted file segments, and omission reasons. No-findings wording changes to “No findings in the reviewed bounded input” when any filtered-diff file segment was omitted.

## Objective Impact

This completes the policy decision and prompt-bounding implementation rows for the Objective while preserving normal harness failure semantics. The previous hard-fail preflight shape remains intentionally removed: runtime failures still fail, while successful bounded reviews surface partial coverage as review metadata.

Semantic sharding and automatic generated-file detection remain parked. Generated/vendored exclusions continue to be explicit config policy, not heuristic detection.

Verification evidence: targeted roaster harness/workflow/CLI/publication suites passed; full `just python-test`, `just python-check`, and `just dprint-check` passed in the local checkout.

## Follow-Ups

- Verify an oversized synthetic or real PR run after this lands to confirm GitHub check/comment behavior and ordinary deterministic workflow usefulness.
- Revisit semantic sharding only if bounded single-call review coverage is not sufficient in practice.
- Keep monitoring structured failure/comment behavior for live matrix-job race cases; this slice focused on successful bounded coverage disclosure.
