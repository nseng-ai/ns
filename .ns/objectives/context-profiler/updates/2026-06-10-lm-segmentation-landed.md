# LM episode segmentation landed

## Summary

The second roadmap row — LM episode segmentation — is complete as a production layer over the deterministic profiler.

The implementation adds the segmentation model/payload/repair layer, model-registry gateway, runtime controller, and view integration:

- `segmentation.ts` owns the fixed cheap analysis-model constants (`openai-codex/gpt-5.4-mini`), prompt, payload construction, Zod validation, lenient JSON extraction, response repair to real capped turn indices, seam splitting across elided middle-turn gaps, and the explicit long-session windowing policy.
- `segmentation-gateway.ts` resolves the fixed model through Pi's model registry and returns failures as values for unavailable model, auth, request, invalid-response, and abort cases, preserving the deterministic overlay on every failure path.
- `runtime.ts` triggers segmentation only on demand (overlay open and refresh), reuses a within-session fingerprint cache for unchanged snapshots, and lets the `r` refresh path force recomputation.
- `view.ts` keeps deterministic live rows visible while segmentation is loading or unavailable, then applies ready episodes as an annotation layer over the frozen snapshot.

The caching open question is resolved for this row: segmentation results are cached only within the current profiler state while the snapshot fingerprint holds; manual refresh bypasses that cache. There is no durable or cross-session cache in this objective slice.

Verification: `pnpm --dir ts/packages/pi-extensions run test` passed.

## Objective Impact

- Roadmap: the LM episode segmentation row is checked `[x]` with landed evidence; per-episode analysis and delegation detection remain.
- Risks: LM response fragility is de-risked for segmentation through schemas, lenient parsing, and repair. Long-session payload size is de-risked for segmentation through deterministic turn capping, excerpt-only payloads, and a hard serialized-size cap that drops middle turns while preserving first/last context.
- Open Questions: the segmentation caching question is resolved. The analysis-model configurability question remains open and deferred from initial scope.

## Follow-Ups

- Next substantive row is per-episode efficiency/relevance analysis: add on-demand episode judgments through the same gateway/schema/degradation pattern, render neutral verdicts inline, and keep the profiler diagnostic-only and non-advisory.
- Delegation detection remains the row after analysis unless implementation evidence or design pressure suggests pulling deterministic delegation context earlier.
