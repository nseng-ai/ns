# PR 4 Evidence Aggregation Complete

## Summary

PR 4 adds reusable deterministic evidence aggregation in `asdl_core.sessions.evidence` and wires it into `aretro exec collect-evidence` so the JSON envelope now emits factual `evidence_items` instead of the PR3 placeholder.

The first evidence classes cover tool usage counts, failed tool results, repeated file reads, repeated shell commands, token usage when present, and large or truncated outputs when measurable. The implementation keeps source references with each item, caps source references, bounds oversized command subjects with a hash prefix, and avoids raw prompt, tool-output, command-output, and error text in the emitted payload.

Evidence: local diff for PR #529 against `add-collect-evidence-sessions-json-envelopes`; targeted aggregation, collector, scenario, and plugin tests passed.

## Objective Impact

This completes roadmap PR 4 and de-risks the main collector-value assumption: `collect-evidence` now returns deterministic branch-session evidence that a skill can interpret without re-reading raw transcripts or repeating mechanical aggregation work.

The semantic boundary remains intact. Python still emits factual observations only; recommendation categories, prioritization, and any documentation or code changes stay with the invoking skill and agent. Real-session payload-size validation, threshold tuning, and skill guidance remain for later PRs.

## Follow-Ups

- PR 5 should add remaining scenario/plugin contract coverage not already covered by the PR4 fake-source scenarios, especially any plugin-path JSON or real-source missing-root cases worth preserving.
- PR 6 should update or create the branch retrospective skill to invoke `aretro exec collect-evidence` and turn `evidence_items` into semantic recommendations.
- PR 7 should validate payload size, threshold usefulness, warnings, and association confidence against real Pi session logs.
