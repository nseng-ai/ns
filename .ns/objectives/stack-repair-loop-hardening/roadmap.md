# Roadmap

## Work

- [ ] Interim rewrite of `skills/code-fix-gh-stack/SKILL.md` against current tooling.
      Reviewed draft exists from the 2026-07-08 planning session: triggers into the
      description, `## Purpose` deleted, negations rephrased, single done definition
      (checks-only; threads inventoried and routed to pr-address, not owned), conflict canon
      (downstack shape canonical, skip duplicates, route to `code-gt-restack-resolve`),
      stale/fresh triage, amend verification, mergeability-as-trailing, delegation guidance.
      Lands stacked on the current extension-descriptor stack tip (skill file originates in
      unmerged PR #3283).
- [ ] Define the enriched `branch-pr-checks` JSON field contract before code: per-check
      timestamps, head-commit push time, stale/fresh, unresolved-thread counts, per-PR
      status, mergeability flagged trailing. Resolve the status-vocabulary open question
      here.
- [ ] Implement and test the `branch-pr-checks` enrichment (edge cases: missing PR,
      pagination, auth failure, no checks, legacy status contexts vs check runs).
- [ ] Implement and test the failed-check log excerpt command, lifting run/job resolution
      from stack-view `check-logs.ts`.
- [ ] Final rewrite of `code-fix-gh-stack`: collapse inventory/triage steps into one
      enriched-command invocation plus JSON interpretation rules.
- [ ] Audit the repair loop for further push-down candidates; record an explicit
      decision per candidate (push down, defer with rationale, reject).
- [ ] Decide the stack-view backend question: consume the enriched command as its data
      source, or keep its GraphQL layer with the duplication documented.

## Parked

- Promotion of stack-view's data layer into a platform package (`ts/packages/*`) as a
  shared single source of truth. Revisit if the backend decision above lands on
  consolidation.
