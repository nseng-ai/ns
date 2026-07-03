# Deterministic core landed

## Summary

The first roadmap row — the deterministic core — is complete. `ts/packages/pi-extensions/src/context-profiler/` now exists as a multi-file module (`model.ts` pure derivation, `view.ts`/`render.ts` overlay, `runtime.ts` live-update glue, top-level wiring) with the standard 2-line shim at `.pi/extensions/context-profiler.ts`, delivered as the `context-profiler-deterministic-core` → `context-profiler-review-fixes` Graphite stack off `master` (tip PR #1207, ready to merge as a stack).

The row's structural requirements were met as specified, not approximated:

- Episode annotations are modeled as optional input — `EpisodeAnnotation` rows are clamped to real turn indices inside `buildLiveRegions(turns, episodes?)`, and the deterministic view is complete without them.
- `runtime.ts` defines the authoritative-source rule the objective demanded: the `context` event is authoritative once one has been received this session; the session-branch fallback applies only before that; the snapshot records which source was used as `liveSource`.
- The `/context-profiler` cross-harness parity waiver row was added to the parity table (WAIVED — TUI-native interactive diagnostic; headless transcript profiling is an explicit Non-Goal).

A review pass on the stack tightened the message-handling layer: raw-message parsing is consolidated into a typed `NormalizedMessage`/`MessagePart` model via `normalizeMessage`, the verbatim content view renders from normalized messages, and overlay state moved into an `OverlaySession` holder.

Verification: full pi-extensions Vitest suite passed, including `test/context-profiler-model.test.ts` and `test/context-profiler-render.test.ts`.

## Objective Impact

- Roadmap: deterministic-core row checked `[x]` with landed evidence; three rows remain (LM segmentation, per-episode analysis, delegation detection).
- Assumptions: the prototype on `model-subagents` is no longer load-bearing for derivation logic — the production module and its tests are now the behavioral reference; the branch is historical.
- Risks: `context` event availability is de-risked by the runtime's explicit authoritative-source rule with `liveSource` provenance. LM response fragility and long-session payload size remain open; they belong to the segmentation row.

## Follow-Ups

- Next row is LM episode segmentation: gateway + in-memory fake, fixed cheap analysis model as a code-level constant, Zod-validated/repaired responses, truncation/windowing policy, and the "segmentation unavailable: <reason>" degradation state. The within-session caching open question must be decided before or during that row.
