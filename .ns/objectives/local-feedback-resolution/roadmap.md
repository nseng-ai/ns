# Roadmap

The requirements Frontier crystallized on 2026-07-16 into the manual-first
production steelthread below. Work is ordered by dependency and should land as the
fewest coherent slices that keep the Reviews producer boundary, engineer authority,
and structured artifact contract explicit.

## Work

- [x] Define the manual local journey, engineer control, multi-reviewer semantics,
      local addressing outcomes, and minimal artifact baseline.
      Resolved through the 2026-07-16 Semantic Updates: explicit range and roster;
      continue-on-review-failure execution; cluster-never-merge and
      proposed-and-correctable model judgment; cluster-level triage with per-finding
      accounting; ordered planned PRs; and minimal run/finding/final-state records.
- [x] Extend the Reviews production core from a single base-ref review to one confirmed
      revision-range roster run. The Reviews Capability API now loads one explicit range
      diff for applicability and sequential selected-review execution, resolves models
      declaratively, continues after review-local failures, emits typed foreground
      progress, and returns a timestamped roster record with toggled-off/failed states,
      coverage, and verbatim source-attributed findings. Existing `ns reviews run`
      behavior remains the single-review compatibility path, and focused tests plus
      repository validation cover the delivered read-only contract.
- [x] Add production aggregation and manual resolution over the roster result. The
      Reviews Capability API now performs one schema-constrained LM aggregation call,
      preserves every source-attributed finding verbatim in an exact partition,
      supports iterative must-group/must-separate correction, records proposed versus
      engineer-confirmed cluster and per-finding dispositions, and excludes flagged
      recommendation conflicts from bulk confirmation. Typed failures reject invalid
      requests, model output, constraints, prior state, or accounting without returning
      a partial proposal; the operation remains return-only and read-only.
- [ ] Complete the local command journey with explicit range and roster confirmation,
      report-to-prompt stage boundaries, correction and bulk-triage interaction, and
      steering into an engineer-confirmed ordered planned-PR list (title plus complete
      member-cluster references) for manual remediation. Keep GitHub thread mutation,
      Flow submit/ship, and autonomous fix execution outside this surface.
- [ ] Exercise the real production steelthread on representative pre-PR changes and
      correct only evidence-backed contract gaps. Record focused tests and relevant
      repository checks for range consistency, applicability, toggled-off/failed and
      coverage-gap visibility, cluster correction, conflict handling, bulk disposition,
      planned-PR traceability, resume behavior, and full accounting.

## Parked

- Define and implement autofix safety and outcomes after the manual steelthread lands:
  disposable ordinary slot/worktree authority, ordered-attempt failure semantics,
  branch/ref ownership, candidate adoption, cleanup, and partial-failure visibility.
- Define and implement validation evidence with autofix: selection, attachment to fix
  attempts, missing/failed outcomes, and truthful confidence language.
- TUI or web feedback browsing and fix interaction.
- Human GitHub-feedback and third-party automated-reviewer ingestion as proved sources.
- Flow submit/ship integration and other landing, deployment, rollout, observation, or
  rollback consumers; `prod-submit-roast-and-fix` retains that orchestration scope.
