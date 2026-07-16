# Minimal Artifact Baseline Adopted; Provenance and Staleness Decisions Revised

## Summary

Grilling the reusable-artifact requirements row surfaced a design correction from
the user: the accumulating identity/versioning/staleness mechanics indicated an
overcomplex design driven by front-loading requirements for hypothetical future
consumers. The row resolved by collapsing the artifact contract to a minimal
baseline with one rich run record:

1. **Findings are bare verbatim content tuples** attributed by review key:
   `{source review key, path, line, severity, summary, details}`. No finding
   IDs are minted; a finding is identified by its content. Because originals
   are verbatim-immutable (cluster-never-merge), content identity cannot drift;
   exact-duplicate tuples must be disambiguated deterministically (for example,
   by order of appearance) so full accounting never folds two findings into one.
2. **One rich run record per journey** carries the shared context once, since it
   is written once and costs nothing: the confirmed range expression, the roster
   including toggled-off and failed reviews, resolved models per review,
   input-coverage notes, and timestamp. Honesty about gaps lives here, not in
   per-finding fields.
3. **Range identity is the confirmed expression only.** No resolved endpoint
   SHAs, no diff hashes.
4. **No staleness detection.** Stage-boundary checkpoints resume as-is;
   freshness is the engineer's judgment. This deliberately reverses the
   detect-and-report staleness decision (decision 6 in
   `2026-07-16-local-addressing-contract-defined.md`); that update remains the
   historical record of the addressing contract otherwise.
5. **No per-finding definition version, resolved model, or range fields.** This
   revises the full-provenance decision (decision 5 in
   `2026-07-16-engineer-review-control-defined.md`): per-finding provenance is
   the review key; everything else lives at the run-record level. The roster
   record portion of that decision survives inside the run record.
6. **Clusters, dispositions, planned PRs, and the exit re-disposition are simple
   final-state records** referencing findings by content. No event history or
   correction log; the proposed-vs-confirmed distinction survives as markings on
   final state (a cluster or category is either model-proposed or
   engineer-confirmed), not as a history trail.
7. **Future-consumer requirements are deferred until a real consumer exists.**
   The row's original ambition (specifying what TUI/web/human-feedback/external
   consumers must receive) is re-scoped: future consumers get these structured,
   simple records; their real requirements are discovered then, consistent with
   the objective's non-goal of no premature canonical cross-source model.

**Standing steering note for remaining and parked rows:** prefer the simplest
contract that serves the manual loop; resist speculative generality. The parked
autofix and validation rows must inherit this posture when they resume.

## Objective Impact

- The `(grilling)` reusable-artifact requirements Question Row is resolved and
  marked `[x]` in `roadmap.md`.
- The prototype row is now fully unblocked (journey, addressing contract, and
  artifacts all resolved); the manual-slice path to crystallization is prototype
  → crystallize.
- Two prior decisions are revised by this update (staleness detection dropped;
  per-finding full provenance reduced to run-level provenance). The historical
  updates remain immutable records; this update is the corrective record.
- The risk posture shifts deliberately: less machine-checked reproducibility in
  exchange for a radically simpler contract; the engineer owns freshness and
  history judgment. If the prototype shows this loses something real, that is
  exactly the evidence the prototype row exists to produce.

## Follow-Ups

- Prototype row should specifically watch for pain from the cuts: content-tuple
  reference awkwardness, resumed-checkpoint drift surprises, and missing
  provenance when interpreting old findings.
- When parked rows resume, do not silently re-import the reversed decisions;
  re-derive from this baseline.
