# Delegation detection landed

## Summary

The fourth roadmap row — delegation/subagent detection — is complete as a production layer over the context profiler's deterministic turns, LM segmentation, and per-episode analysis.

The implementation adds delegation claims end to end:

- `model.ts` defines delegation confidence/claim types, infers fallback claims from the validated tool-name pattern, and filters claims by inclusive turn spans.
- `segmentation.ts` extends the segmentation prompt and response parser to collect LM delegation claims, normalizes labels/confidence, repairs claimed turns to real capped turns, deduplicates by turn, and caps the claim set.
- `runtime.ts` stores repaired delegations with the segmentation fingerprint cache and replays them on cached snapshots.
- `analysis.ts` includes in-span delegation claims in the target episode payload and teaches the neutral judge that delegation which kept large work out of the current context counts toward efficiency.
- `view.ts` and `render.ts` surface claims with the `⇄` marker, drill-down delegation summaries, `(inferred)` labels for deterministic fallbacks, and per-turn prefixes on delegating turns.

Verification: `pnpm --dir ts/packages/pi-extensions run test` passed; full `just` passed.

## Objective Impact

- Roadmap: the delegation/subagent detection row is checked `[x]`; all four scoped capabilities now have implementation evidence in the stack.
- Risks: LM response fragility for delegation claims is de-risked by the same schema/repair/failure-degradation posture used for segmentation and analysis. Delegation-free model output remains valid, and deterministic inferred claims remain available on non-ready LM paths.
- Scope: the profiler remains diagnostic-only and non-mutating. Delegation output is rendered as claims and payload context, not as advice.

## Follow-Ups

- Closure is still deferred until the Graphite stack is actually landed on `master`, matching the Objective completion criteria and the planned-branch caveat.
- Resolve the current Graphite submission issue separately so `context-profiler-delegation-detection` receives a PR and can land with the rest of the stack.
