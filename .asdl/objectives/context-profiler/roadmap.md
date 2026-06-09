# Roadmap

## Work

- [ ] Deterministic core: `ts/packages/pi-extensions/src/context-profiler/` with `model.ts` (pure derivation: entries/events → base regions + flat per-turn list with labeled best-effort token estimates), `view.ts`/`render.ts` (overlay with stack view and verbatim content drill-down), `runtime.ts` (live updates from `context` events, with a defined authoritative-source rule vs fallbacks), top-level wiring, and the `.pi/extensions/context-profiler.ts` shim. Land as a small Graphite stack.
      Episode annotations must already be modeled as optional input to the view, not computed structure. Record the cross-harness parity waiver for `/context-profiler` in the parity table as part of this row.
      Evidence: Vitest unit tests for derivation and render logic in `test/context-profiler-*.test.ts` pass alongside relevant repo checks.
- [ ] LM episode segmentation: gateway interface + in-memory fake for the analysis model (fixed cheap model as a single code-level constant, resolved via the model registry), Zod-validated and repaired responses, on-demand trigger (overlay open + manual refresh), explicit truncation/windowing policy for long sessions, and the hard graceful-degradation state ("segmentation unavailable: <reason>"). Decide the within-session caching question before or during this row.
- [ ] Per-episode efficiency/relevance analysis: on-demand per-episode LM judgment (`efficient/mixed/wasteful`, `load-bearing/still-useful/stale/rot`) rendered in the overlay, through the same gateway, schemas, and degradation rules as segmentation. Neutral and descriptive, never advisory.
- [ ] Delegation/subagent detection: surface delegation claims (turn, label, confidence, including the deterministic name-pattern fallback) in the overlay and feed them into episode analysis context.

## Parked
