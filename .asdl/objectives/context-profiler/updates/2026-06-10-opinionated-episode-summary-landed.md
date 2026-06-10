# Opinionated Per-Episode Summary Landed

## Summary

The opinionated per-episode summary row is implemented on `context-profiler-opinionated-episode-summary` (Graphite parent: `context-profiler-options-objects-and-rename`). The per-episode analysis call now returns `{efficiency, relevance, summary}`; the prompt demands blunt, opinionated-descriptive prose (~4–8 lines), decisive verdicts (`mixed`/`still-useful` only on genuinely divided evidence), `≈`-prefixed token citations, and forbids advice. The summary renders in full at the top of the episode-detail frame under the claim line; the episode list and overview are unchanged. The summary is cached with the verdicts under the segmentation fingerprint and degrades exactly like the verdicts (absent on omission, retryable on failure).

## Objective Impact

- The "Opinionated per-episode summary" roadmap row is `[x]` with implementation and verification evidence.
- All semantic roadmap work is again complete; closure still waits on the stack merging to `master` per the completion criteria.

## Follow-Ups

- Observe real summary quality before deciding on the deferred truncated one-line summary in episode list rows.
- Real-session prompt tuning may be needed if gpt-5.4-mini hedges despite the decisiveness instructions.
