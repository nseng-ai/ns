# Roadmap

Frontier of typed Question Rows (ideation). Rows are unordered beyond their explicit
blocked-by references. Resolve one row per session: record the decision as a Semantic
Update, mark the row `[x]`, graduate newly specifiable Fog into Question Rows, and
rewire or drop rows invalidated by the answer. The Frontier crystallizes when no
requirements questions remain and the work can be expressed as implementation-ready
slices.

## Work

- [x] (grilling) Define the end-to-end local journey and its success states — from
      selecting pre-PR work and applicable adversarial reviews through aggregation,
      triage, fix attempts, validation, inspection, and deliberate promotion or
      discard. Specify what the engineer sees and controls without choosing package or
      storage architecture.
      Resolved 2026-07-16: prompted revision-range selection (suggested
      `merge-base...HEAD`), prompted review roster, foreground runs with visible
      per-review gaps, one aggregated source-attributed findings report with bulk
      triage (downstack-feedback model), triage → steer → planned PRs, one candidate
      branch per planned PR in the disposable slot, evidence-not-gate validation,
      prompted per-branch adoption, full-accounting dispositions, stage-boundary
      resumability. See `updates/2026-07-16-end-to-end-journey-defined.md`.
- [x] (grilling) Define engineer control over adversarial reviews — who authors and
      changes Review definitions, how applicability and model choice are expressed,
      what local overrides are acceptable, and which provenance must survive into
      findings and resolution artifacts.
      Resolved 2026-07-16: repo-only checked-in `.ns/reviews/` definitions (control =
      source control), applicability = `applies_to` glob intersection with the range's
      changed paths, model choice stays profile indirection via ns.toml, no per-run
      overrides beyond range + roster toggling, full provenance per finding (key,
      definition version, resolved model, range) plus run-level roster record
      (toggled-off and failed reviews). See
      `updates/2026-07-16-engineer-review-control-defined.md`.
- [x] (grilling) Define multi-reviewer feedback semantics — how findings retain source
      and evidence while the experience groups duplicates, represents disagreement,
      handles incompatible recommendations, categorizes actionability, and avoids
      presenting model triage as certainty.
      Blocked by: Define engineer control over adversarial reviews.
      Resolved 2026-07-16: cluster-never-merge with originals verbatim; clustering,
      conflict flags, and actionability categories are all model-proposed and
      engineer-correctable (proposed-and-correctable as the single honesty
      mechanism); flagged conflicts excluded from bulk accept; shared severity enum
      becomes the local findings source contract with no aggregation re-scoring.
      See `updates/2026-07-16-multi-reviewer-feedback-semantics-defined.md`.
- [x] (research) Inventory the current local Reviews and Address journeys against the
      Destination — document reusable behavior, assumptions tied to PR/GitHub context,
      missing pre-PR capabilities, existing structured artifacts, and independently
      discovered constraints. This is requirements evidence, not a proposed package
      decomposition.
      Resolved 2026-07-16: Reviews supplies repo-local definitions, glob
      applicability, model/profile resolution, typed single-review outcomes, coverage,
      and logs but not range/roster/aggregation; Address/Pi supplies GitHub primitives
      and the report → prompted-disposition interaction precedent but no durable local
      triage/planning contract (and its old workflow engine was intentionally retired);
      Slots supplies clean worktree placement and plain branch lifecycle but not
      candidate-stack orchestration, validation evidence, adoption, or disposal of
      refs. See `docs/research/local-feedback-resolution-current-journeys.md` and
      `updates/2026-07-16-current-journeys-inventoried.md`.
- [x] (grilling) Define the local addressing contract — which user outcomes from the
      existing addressing workflow must accept local automated findings, which
      GitHub-message behaviors are source-specific, and how selection, grouping,
      deferral, rejection, and completion should appear in one coherent journey.
      Blocked by: Define multi-reviewer feedback semantics; Inventory the current local
      Reviews and Address journeys against the Destination.
      Resolved 2026-07-16: cluster-level dispositions inherited per finding;
      triage vocabulary fix / fix-manually / reject / defer; lightweight planned-PR
      confirmation (title + member clusters, ordered list, no dependency graph);
      mechanical failure accounting with one bulk exit re-disposition;
      detect-and-report checkpoint staleness with recorded engineer choice; thread
      resolution, PR placement, submit/publish, and autonomous fix-without-triage
      excluded as GitHub-source-specific. See
      `updates/2026-07-16-local-addressing-contract-defined.md`.
- [x] (grilling) Define reusable artifact requirements — the information future TUI,
      web, human-feedback, and external-reviewer consumers must receive for the
      manual-loop artifacts: findings with full provenance, proposed/corrected
      clusters, per-finding inherited dispositions, planned PRs, stage-boundary
      checkpoints, staleness/reuse choices, and the exit re-disposition record —
      without designing those surfaces or prematurely fixing an architecture.
      Fix-attempt and validation artifact requirements are deferred with the parked
      rows (staging: `updates/2026-07-16-manual-first-staging-decided.md`).
      Blocked by: Define multi-reviewer feedback semantics; Define the local
      addressing contract.
      Resolved 2026-07-16 with a deliberate simplification: minimal artifact
      baseline — bare verbatim findings attributed by review key (content identity,
      no IDs), one rich run record per journey (range expression, roster with
      toggled-off/failed reviews, resolved models, coverage, timestamp), simple
      final-state records for clusters/dispositions/planned PRs with
      proposed-vs-confirmed markings, no staleness detection (reverses the earlier
      detect-and-report decision), per-finding provenance reduced to run level
      (revises the earlier full-provenance decision), future-consumer requirements
      deferred until a real consumer exists. See
      `updates/2026-07-16-minimal-artifact-baseline-adopted.md`.
- [ ] (prototype) Exercise the specified manual local journey on representative real
      changes — range → roster → runs → aggregated report → bulk triage → steering →
      manual remediation — to find missing requirements, misleading confidence, or
      unusable states before crystallizing implementation slices (re-scoped to the
      manual-first staging).
      Blocked by: Define the end-to-end local journey and its success states; Define the
      local addressing contract; Define reusable artifact requirements.
- [ ] (grilling) Crystallize the resolved requirements into the fewest coherent,
      dependency-ordered implementation slices for the manual-first loop, preserving
      the boundary from Flow submit/ship and broader agentic CI/CD work, and stating
      when the parked autofix/validation rows re-enter the Frontier.
      Blocked by: Exercise the specified manual local journey on representative real
      changes.

## Parked

- (grilling) Define autofix safety and outcome semantics — how candidate fixes are
  chosen, what authority runs inside a disposable ordinary slot/worktree, how
  parallel or conflicting fixes are isolated, what promotion remains explicit, and
  how retained, rejected, failed, rolled-back, and unattempted outcomes are
  represented. Parked 2026-07-16 by the manual-first staging decision; resumes
  inside this Objective after the manual loop lands. Pre-routed questions:
  failure-cascade semantics for the ordered attempt list (addressing contract) and
  branch/ref ownership plus partial-failure visibility (inventory).
- (grilling) Define validation evidence and confidence claims — what validation may
  be selected or supplied, how results attach to fix attempts, how missing or failed
  validation affects retention, and what the experience may truthfully claim about
  safety. Parked 2026-07-16 with the autofix row it depends on.

- TUI feedback browsing and fix interaction, after reusable local artifacts and
  lifecycle requirements are proven.
- Web or dashboard review and autofix experiences.
- Human GitHub-feedback and third-party automated-reviewer ingestion as proved sources;
  the first loop must remain compatible with them but does not deliver them.
- Flow submit/ship integration and other landing, deployment, rollout, observation, or
  rollback consumers; `prod-submit-roast-and-fix` retains that orchestration scope.
