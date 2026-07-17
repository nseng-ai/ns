---
edges:
  - objective: flow-stack-workflows
    annotation: Downstream consumer; it folds the repair loop into Flow's ns-flow-* workflow tier once this record's final skill rewrite and address exec triage push-down land.
  - objective: flow-pi-tier
    annotation: Downstream consumer; it promotes stack:view into Flow's Pi tier consuming this record's enriched branch-pr-checks as backend, resolving the stack-view single-source-of-truth open question.
---

# Stack Repair Loop Hardening

## Thesis

The `code-fix-gh-stack` repair loop works but leaks judgment-session context on mechanical
work and carries prose defects that a real repair session (2026-07-08, the
extension-descriptor stack, PRs #3232–#3281) demonstrated concretely: a fuzzy done
definition invited a premature "stack is green" report while review threads were
unresolved, "resolve conflicts carefully" was a no-op that coincided with a wrong
conflict-side choice costing a multi-hour unwind, and the agent hand-rolled ~8
`gh pr checks | jq` polling loops plus mental stale-vs-fresh classification that belong in
tested CLI code. Harden the loop in both directions: rewrite the skill against
writing-great-skills findings, and push the deterministic triage mechanics down into
`ns address exec` commands so agents decide from compact facts instead of raw logs.

## Scope

- Interim rewrite of `skills/code-fix-gh-stack/SKILL.md` against today's tooling:
  triggers moved into the description (mechanics out), `## Purpose` and duplications
  deleted, negations rephrased positive, single done-definition source of truth, a
  concrete conflict canon (already-submitted downstack shape is canonical; skip
  duplicate commits; route to `code-gt-restack-resolve`), stale-vs-fresh failure triage,
  amend verification (`git status` clean and fix visible in `git show --stat` after
  `gt modify`), Graphite mergeability as a trailing signal, and harness-neutral
  delegation guidance (mechanical validate+submit sweeps and log digs to subagents;
  conflict resolution and semantic fixes stay in the main session).
- Enrich `ns address exec branch-pr-checks` into a stack-triage surface: per-check
  timestamps, head-commit push time, stale/fresh classification, unresolved review-thread
  counts, a per-PR status classification, and `Graphite / mergeability_check`
  pre-classified as trailing. Keep the existing Graphite-neutral `--branches-json` input
  shape fed by `slot gt exec stack-branches`; define the JSON field contract before code.
- A failed-check log excerpt command (e.g. `ns address exec pr-check-log`): resolve
  run/job from PR + check name and return the failed-step tail, lifting the resolution
  logic already present in stack-view's `check-logs.ts`.
- Final skill rewrite once the enriched command ships: collapse the skill's inventory and
  triage steps into one invocation plus JSON interpretation rules.
- Audit the repair loop for further push-down candidates beyond the two above.

## Non-Goals

- Review-thread resolution workflow. The skill's contract is fixing checks/tests; thread
  handling routes to the existing pr-address processes. Done means checks green; the
  final report inventories unresolved threads without owning them.
- Wrapping Graphite mutations (`gt modify`, `gt submit`, `gt restack`) in new commands.
- Making pr-address depend on Graphite; stack topology stays caller-supplied per the
  closed graphite-stack-exec-consolidation objective's boundary.
- Rewriting stack-view itself. Whether stack-view later consumes the enriched command as
  its backend is an open question here, not a deliverable.

## Completion Criteria

- The interim skill rewrite is landed: description carries triggers, one done definition,
  conflict canon and stale/fresh triage present, delegation guidance present, no
  `## Purpose` section, and the two negation sentences replaced with positives.
- `ns address exec branch-pr-checks` returns, per PR: bucketized checks with timestamps,
  stale/fresh classification against head-commit push time, unresolved-thread counts, and
  a per-PR status; the field contract is documented and tested (missing PR, pagination,
  auth failure, no-checks edge cases).
- The failed-check log excerpt command exists and is tested, replacing the
  run-id/job-id/`gh run view --log-failed` sequence with one call.
- The final skill rewrite references only shipped commands, and the inventory/triage
  steps are one invocation plus interpretation rules.
- The push-down audit has an explicit outcome: further candidates listed with a decision
  each (pushed down, deferred with rationale, or rejected).

## Assumptions and Risks

Assumptions:

- `ns address exec branch-pr-checks` (batched GraphQL, `--branches-json` input) is the
  right base to enrich rather than a new sibling command; the additions are fields, not a
  new workflow. If the enrichment bloats the command past a thin primitive, revisit the
  new-command option recorded during planning.
- stack-view's data layer (`snapshot-schema.ts`, `check-logs.ts`, `graphql.ts` under
  `ts/packages/internal/pi-tools/src/stack-view/`) is liftable: its check/thread/status
  model matches what triage needs, so logic can be promoted or mirrored rather than
  designed fresh.
- Stale/fresh classification is deterministic from timestamps (check `startedAt` vs head
  commit push time) and belongs in the CLI, not agent judgment.

Risks:

- Two sources of truth: enriching the ns command while stack-view keeps its own GraphQL
  layer duplicates the check/thread model. Mitigation: the open question below must get
  an explicit decision before this objective closes.
- The interim skill rewrite must target the landed skill, not a stale draft. The skill
  file has now landed on trunk (`skills/code-fix-gh-stack/SKILL.md`, PR #3283 merged
  2026-07-09, commit 4c30d67fa), so the rewrite branches from trunk normally rather than
  stacking on the extension-descriptor stack; the earlier stack-rebase-conflict concern is
  resolved. Rebase the rewrite on current trunk before landing.
- GitHub check-run/status-context duality: `gh pr checks` merges both, but the GraphQL
  enrichment must handle check runs and legacy statuses (Graphite mergeability is a
  status context), or stale/fresh classification will silently miss entries.

## Open Questions

- Should stack-view consume the enriched `branch-pr-checks` output as its backend
  (single source of truth, per the platform-and-consumer promotion path), or keep its own
  GraphQL layer with the duplication documented?
- Exact per-PR status vocabulary: reuse stack-view's enum (`checks-failing`,
  `unresolved`, `ready`, `draft`, `no-pr`) or define a repair-loop-specific one that
  includes stale/fresh at the PR level?

## Closure

Intentionally abandoned on 2026-07-17 after a stale-Objective audit found no material
progress after the initial 2026-07-09 design. The July 12 change was a prose rebaseline,
and the July 14 changes only linked downstream Flow Objectives; all roadmap rows remain
open. No completion claim is made: the skill rewrite, enriched `branch-pr-checks`
contract and implementation, failed-check log command, push-down audit, and backend
decision remain unresolved. The edges are retained as historical coordination context;
`flow-stack-workflows` and `flow-pi-tier` must re-plan rather than assume this Objective
will deliver their described upstream primitives.
