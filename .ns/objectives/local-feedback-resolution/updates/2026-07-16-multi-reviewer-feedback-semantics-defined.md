# Multi-Reviewer Feedback Semantics Defined

## Summary

A grilling session resolved the third Question Row: how findings from multiple
reviewers combine into one journey while preserving source and evidence. Grounding
fact: today each review independently emits findings shaped
`{path, line, severity, summary, details}` (shared severity enum,
`ts/packages/capabilities/reviews/src/core/models.ts`); no aggregation exists yet.

1. **Cluster, never merge.** The aggregated report groups likely-duplicate
   findings under one issue; every reviewer's original text, severity, and
   evidence survives verbatim inside the cluster. Triage decisions attach to
   the cluster. No model-authored canonical synthesis replaces originals.
2. **Clustering is model-proposed and engineer-correctable.** A model proposes
   clusters during aggregation; the report labels them as proposed, and the
   engineer can split or merge clusters during triage. Corrections are recorded
   decisions.
3. **Disagreement and incompatible recommendations are actively flagged.**
   Clusters display each reviewer's severity/framing side by side; the
   aggregator marks detected recommendation conflicts (model-proposed, like
   clusters). Flagged conflicts are excluded from bulk accept and require an
   explicit engineer decision during triage — catching incompatibilities before
   the disposable slot burns fix attempts on them.
4. **Actionability categorization is proposed-defaults.** The aggregator
   proposes an actionability category per cluster, visibly marked as
   model-proposed; bulk triage confirms or overrides ("accept all proposed" is
   one action, but an engineer action). Only engineer-confirmed dispositions
   become the durable record.
5. **Severity: shared enum as source contract, no re-scoring.** The existing
   shared severity enum becomes part of the local findings source contract —
   every review definition must emit it. Clusters show the per-reviewer spread
   verbatim; aggregation never re-scores. Divergent future sources (human
   GitHub feedback, external reviewers) map to the enum at ingestion, and that
   mapping is visible provenance — normalization happens once, at the source
   boundary, never inside aggregation.

The row's through-line is one honesty mechanism, **proposed-and-correctable**:
wherever model judgment enters (clusters, conflict flags, actionability
categories), it is visibly marked as proposed, engineer-correctable, and only
human-confirmed decisions become durable dispositions. No confidence scores or
second certainty vocabulary was introduced.

## Objective Impact

- The `(grilling)` multi-reviewer feedback semantics Question Row is resolved
  and marked `[x]` in `roadmap.md`.
- Partially unblocks the local addressing contract row (still gated on the
  Reviews/Address inventory research row) and partially unblocks the reusable
  artifact requirements row (still gated on validation evidence).
- Directly de-risks the two lead risks: aggressive normalization erasing
  provenance (cluster-never-merge, no re-scoring, ingestion-boundary mapping)
  and model triage presenting as certainty (proposed-and-correctable
  everywhere, conflicts excluded from bulk accept).
- Sharpens the reusable-artifact requirements row: artifacts must represent
  clusters (with membership and correction history), conflict flags and their
  resolutions, proposed-vs-confirmed categorization, and per-reviewer severity
  spread.

## Follow-Ups

- The cluster/correction/conflict record shapes are inputs to the reusable
  artifact requirements row; carry the proposed-vs-confirmed distinction into
  its field requirements explicitly.
- The shared-severity-enum-as-contract decision constrains future source
  ingestion (human feedback, external reviewers): mapping obligations sit at
  the source boundary — note this when those parked sources are eventually
  worked.
