# Record the prototype's validated UI design as a Scope contract

## Summary

The initial objective treated the prototype's UI as disposable ("fidelity of direction, not of code or exact UI"), but the interaction design of `context-profiler-prototype.ts` on `model-subagents` was iterated on heavily and judged good — those lessons were at risk of being dropped by a from-scratch rewrite. The profiler prototype (~1763 lines) was inventoried and its deliberate UI decisions distilled into a new "UI design" subsection of Scope in `objective.md`: frame-stack navigation with breadcrumbs, the overview row format (selection marker / label / locally-scaled bar / `≈`-token column / percent / dense status column with outcome glyphs, kind abbreviations, and the `⇄` delegation marker), health-based theme colors, small-episode coalescing and turn capping, per-frame claim lines, semantic verbatim content rendering, visible-but-never-blocking LM states, `≈` estimation honesty with `?`-toggled provenance, the frozen-snapshot/`r`-refresh model, and truncate-then-pad column discipline.

The sibling visualizer prototype (`context-visualizer-prototype.ts` across the sidepanel / full-screen-overlay / intelligence-board branches) was reviewed and explicitly rejected as a UI reference — the user judged that direction bad. The Thesis now states the visualizer branches are not carried forward *including as a UI reference*.

## Objective Impact

- Thesis: the rewrite now owes the prototype fidelity of direction **and interaction design**, not of code; visualizer exclusion broadened to cover UI reference use.
- Scope: new "UI design" subsection records the validated interaction contract the production `view.ts`/`render.ts` must implement.
- Roadmap: the deterministic-core row now names that contract as the spec for the view/render work.
- Assumptions: the branch-deletion exposure is reduced — losing `model-subagents` no longer loses the UI lessons, though it remains the behavioral/code reference for derivation logic until the deterministic core lands.

## Follow-Ups

- None. The deterministic-core stack should treat the Scope UI-design subsection as its view-layer spec and flag any deliberate deviations in its own update.
