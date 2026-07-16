# Roadmap

## Work

- [x] Interim rewrite of `skills/code-fix-gh-stack/SKILL.md` against current tooling.
      Delivered 2026-07-16 on `branch-pr-checks-enriched-json-contract` per the surviving
      spec: checks-only done definition, threads inventoried and routed to pr-address,
      conflict canon (downstack shape canonical, skip duplicates, route to
      `code-gt-restack-resolve`), stale/fresh triage and mergeability-as-trailing in a
      Reading checks section, amend verification, delegation guidance, negations
      rephrased. Trunk audit commits (02a672763, f0472f100, 521543662, 4c9dda77f) had
      already removed `## Purpose` and the "resolve conflicts carefully" no-op and added
      `wait-for-checks`; the rewrite started from that current trunk file and references
      only shipped commands. See the 20260716T195057Z update.
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
