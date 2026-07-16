# Local Addressing Contract Defined

## Summary

A grilling session resolved the local addressing contract Question Row, working
from the ten evidence questions in
`docs/research/local-feedback-resolution-current-journeys.md`.

1. **Disposition unit: cluster decides, findings inherit.** Triage decisions
   attach to clusters; member findings inherit the disposition, recorded per
   finding for full accounting. A finding deserving different treatment is split
   out of the cluster (the correction mechanism from the multi-reviewer row) —
   there is no second per-finding override layer.
2. **Triage vocabulary: fix / fix-manually / reject / defer.** `fix` enters the
   planned-PR pipeline and resolves through the fix and adoption stages to
   adopted / rejected / failed / unattempted. `fix-manually` is a terminal
   accounted state: the engineer takes the finding into their own hands, outside
   the autofix loop. `reject` and `defer` pass through to final accounting with
   rationale. Batching vocabulary (omnibus/split-out) belongs to the planned-PR
   stage, not triage.
3. **Planned-PR confirmation is lightweight.** A planned PR confirms with title
   plus complete member-cluster list (every included finding traceable through
   cluster membership). Scope details and inter-PR dependency understanding
   emerge during fix attempts; they are not confirmation metadata.
4. **The confirmed set is an ordered list.** Steering produces a sequence; the
   disposable slot attempts planned PRs in that order. No explicit dependency
   graph or cascade metadata exists at confirmation. This revises the
   "dependency-ordered batches" phrasing in the historical
   `2026-07-16-end-to-end-journey-defined.md` update: ordering survives as list
   position; dependency metadata does not. What a failed earlier attempt means
   for later attempts is an autofix-safety-row decision.
5. **Partial-failure accounting is mechanical, with one exit re-disposition
   pass.** Fix-stage outcomes map mechanically: failed attempt → findings
   `failed`; unadopted candidate branch → `rejected (candidate)`; never
   attempted → `unattempted`. The journey-exit report then offers one bulk
   re-disposition so the engineer can honestly convert leftovers (for example,
   defer or fix-manually the still-wanted ones).
6. **Checkpoint staleness is detect-and-report.** Checkpoints record exact range
   identity and rostered definition versions. On resume, drift (new commits,
   rebases, changed definitions) is detected and reported; the engineer
   explicitly chooses reuse or re-run, and the choice is recorded. The
   proposed-and-correctable pattern applied to time: deterministic detection,
   human judgment.
7. **Four GitHub-source-specific behaviors are excluded from the local
   contract:** thread reply/resolution as durable disposition memory (local
   dispositions are the only durable memory); PR-placement/downstack-surgery
   decisions (planned PRs replace them pre-PR); submit/publish steps (objective
   non-goals); and the autonomous fix-without-triage mode (every local fix
   passes the confirmed-triage and planned-PR-confirmation authorization
   boundaries). The shared substance with pr-address is the outcome vocabulary
   and accounting, not GitHub mechanics.

## Objective Impact

- The `(grilling)` local addressing contract Question Row is resolved and marked
  `[x]` in `roadmap.md`.
- Unblocks the autofix safety and outcome semantics row (its only blocker).
- Inherited open point routed forward deliberately: failure-cascade semantics for
  ordered attempts (what a failed earlier planned PR means for later ones) is
  explicitly assigned to the autofix safety row; validation selection stays with
  the validation row.
- Supersedes-in-part note: the end-to-end journey update's "dependency-ordered"
  planned-PR phrasing is refined to ordered-list-only, per decision 4; the
  historical update remains the record of the journey shape otherwise.
- De-risks the unlike-feedback-forced-into-one-workflow risk: the contract now
  names exactly which GitHub behaviors do not transfer, while keeping one
  disposition vocabulary for both sources.

## Follow-Ups

- Autofix safety row must decide: execution semantics of the ordered list on
  failure (continue, skip-dependents-by-conflict, or stop), plus branch/ref
  ownership and partial-failure visibility from the inventory's constraints.
- Reusable-artifact row: per-finding inherited dispositions, cluster membership
  and correction history, checkpoint range/definition identity, reuse-despite-
  staleness choices, and the exit re-disposition record are now required fields
  to carry into that row.
