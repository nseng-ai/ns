# Systemic #2 — grill-pair shared core reconciled (reconcile-only mechanism)

## Summary

Resolved the last open systemic finding's mechanism question and completed the work.
Investigation of the grill pair showed the recorded "~95% byte-identical shared core
that has already drifted" framing was generous: `pi-grill-with-docs-ui` is a *superset*
of `pi-grill-ui` (22 vs 51 lines), and the genuinely byte-identical shared blocks are
only **3 short paragraphs** — the `grill_ask` usage paragraph, the `ui_unavailable`
prose-fallback paragraph, and the validation-scope paragraph — all of which were already
consistent.

Mechanism decided: **reconcile-only, no drift guard.** A runtime pointer is barred by
the documented self-contained-fallback constraint (each SKILL.md must stand alone when
skill expansion is unavailable), and an install-time generation/templating step is
heavyweight for a 3-paragraph surface. So the copies were reconciled in place and both
files kept self-contained, with no test or generation step.

Drift actually fixed (branch `grill-core-reconcile`, commit `3c37d5c6a`):

- `status_request` opener wording realigned (`do not treat that` → `do not treat it`),
  making the shared opener sentence identical in both skills.
- Shared interview opener realigned (`every aspect of this plan` →
  `every aspect of this plan or design`).
- The normal grill status-field enumeration was inlined into
  `pi-grill-with-docs-ui`'s "Docs-aware status checkpoints" section. It previously
  referenced "the normal grill status fields" without listing them — that list existed
  only in `pi-grill-ui`, a self-containment hole in the docs-aware fallback. The
  enumeration is now byte-identical across both files.

Each skill now holds only its UI-specific delta: `pi-grill-with-docs-ui` keeps the
`Documentation updates:` line and the docs-first preflight / during-session /
docs-aware-checkpoint sections; `pi-grill-ui` stays the minimal core.

## Objective Impact

- Systemic #2 roadmap row moved `[ ]` → `[x]` with the mechanism decision, the
  corrected shared-core sizing, and completion evidence.
- Open Question #2 (grill shared-core mechanism) marked resolved: reconcile-only, no
  guard.
- Risk on the grill mechanism marked resolved: no build/install-time mechanism was
  needed; accepted residual risk is silent re-drift, deemed acceptable given the tiny
  surface.
- Two of the three systemic findings (#1, #3) were already done; with #2 complete, all
  three systemic findings — one full Completion-Criteria clause — are now satisfied.

## Follow-Ups

- Remaining open roadmap work: disclosure surgery on oversized always-loaded blocks, and
  duplication collapse across the high-duplication ≥5 skills (one target,
  `python-fake-driven-test-layout`, may be in-flight on a separate branch — confirm
  before re-doing it).
- Evidence for this slice: `areg check` reported "All skills OK"; both files remain
  self-contained; the shared field enumeration is byte-identical across both.
