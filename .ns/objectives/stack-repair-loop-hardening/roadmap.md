# Roadmap

## Work

- [ ] Interim rewrite of `skills/code-fix-gh-stack/SKILL.md` against current tooling.
      Requirements (from the 2026-07-08 planning session; the reviewed draft from that
      session is not preserved in the repo, Branch Memory, or handoffs, so this list is
      the surviving spec): triggers into the description, `## Purpose` deleted, negations
      rephrased, single done definition (checks-only; threads inventoried and routed to
      pr-address, not owned), conflict canon (downstack shape canonical, skip duplicates,
      route to `code-gt-restack-resolve`), stale/fresh triage, amend verification,
      mergeability-as-trailing, delegation guidance. Branches from trunk: the skill file
      landed via PR #3283 (commit 4c30d67fa) and still carries the target defects at HEAD
      (`## Purpose` present, "resolve conflicts carefully" no-op, negations un-rephrased);
      the inventory step has since been edited on trunk (commit 1a059cd04 clarified
      structured `ns slot gt exec stack-branches` topology guidance), so start the rewrite
      from the current trunk file.
- [x] Define the enriched `branch-pr-checks` JSON field contract before code: the durable
      contract in `references/branch-pr-checks-json-contract.md` keeps mapping `status`
      separate from stack-view-compatible `pr_status`, defines timestamp freshness and
      exact Graphite trailing recognition, requires complete check/thread pagination, and
      preserves the existing command shape additively.
- [ ] Implement and test the `branch-pr-checks` enrichment (edge cases: missing PR,
      pagination, auth failure, no checks, legacy status contexts vs check runs).
- [ ] Implement and test the failed-check log excerpt command, lifting run/job resolution
      from stack-view `check-logs.ts`.
- [ ] Final rewrite of `code-fix-gh-stack`: collapse inventory/triage steps into one
      enriched-command invocation plus JSON interpretation rules.
- [ ] Audit the repair loop for further push-down candidates; record an explicit
      decision per candidate (push down, defer with rationale, reject).
- [x] Decide the stack-view backend question: the `flow-pi-tier` Objective requires
      promoted stack-view to consume the enriched Address backend rather than retain
      duplicate GraphQL facts.

## Parked

- Promotion of stack-view's data layer into a platform package (`ts/packages/*`) as a
  shared single source of truth. Revisit if the backend decision above lands on
  consolidation.
