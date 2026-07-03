# Per-episode analysis landed

## Summary

The third roadmap row — per-episode efficiency/relevance analysis — is complete as an on-demand LM layer over ready segmentation episodes.

The implementation keeps the same fixed analysis-model boundary and graceful-degradation posture used by segmentation:

- `analysis-model-gateway.ts` generalizes the old segmentation gateway into one fixed-model gateway with `segmentTurns` and `analyzeEpisode`, using the same model-registry resolution, auth handling, abort handling, request-failure values, and invalid-response values.
- `analysis.ts` owns the neutral per-episode prompt, payload assembly, lenient JSON extraction, and Zod validation for exactly the allowed verdict pairs (`efficient/mixed/wasteful` and `load-bearing/still-useful/stale/rot`).
- `runtime.ts` launches per-episode analysis after segmentation and when reopening cached snapshots with missing verdicts; successful verdicts are cached with the segmentation fingerprint, while failures remain visible and retryable rather than poisoning the cache.
- `model.ts`, `view.ts`, and `render.ts` carry and render verdicts inline as diagnostic claims/status, without compaction advice or other advisory behavior.

Verification: `pnpm --dir ts/packages/pi-extensions run test` passed.

## Objective Impact

- Roadmap: the per-episode efficiency/relevance analysis row is checked `[x]`; delegation/subagent detection is the only remaining non-parked roadmap row.
- Risks: LM response fragility is now de-risked for both segmentation and per-episode analysis through schemas and failure-as-value degradation. Long-session payload risk remains accepted for unusually large individual episodes because analysis sends the full target episode from the capped snapshot rather than introducing a second truncation policy.
- Scope: the profiler remains diagnostic-only and non-mutating; the new verdicts are rendered as neutral descriptions, not recommendations.

## Follow-Ups

- Next substantive row is delegation/subagent detection: surface delegation claims with labels/confidence, include a deterministic name-pattern fallback, render inferred delegations, and feed delegation context into episode analysis.
