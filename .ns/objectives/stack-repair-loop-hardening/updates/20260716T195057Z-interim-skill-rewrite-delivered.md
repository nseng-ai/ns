# Interim `code-fix-gh-stack` rewrite delivered

## Summary

The interim rewrite of `skills/code-fix-gh-stack/SKILL.md` is complete against the
roadmap row's surviving spec, executed on recommendation-continuation basis from the
current-session `objective-next` recommendation.

Ground truth first: the target file had drifted further than the last refresh recorded.
Trunk audit commits `02a672763`, `f0472f100`, `521543662`, and `4c9dda77f` had already
removed `## Purpose`, replaced the "resolve conflicts carefully" no-op with routing to
`code-gt-restack-resolve`, normalized the trigger description, and added the
`ns address exec wait-for-checks` settle step. The rewrite therefore started from that
current trunk file and delivered the remaining spec items:

- **Single checks-only done definition.** One `## Done definition`: zero fresh failing
  checks and pending either concluded green or trailing-only. The former done-definition
  bullets about resolved review/check-run blockers and the step-2 "threads as blockers"
  rule are gone; unresolved threads are inventory in the final report, routed to the
  `pr-address` processes, never owned by the loop.
- **Reading checks section** (new reference tier): stale-vs-fresh triage — a failing
  check is evidence only when its `started_at`/`created_at` is at or after the branch
  head's latest push, anchored to the most recent `gt submit` since no head-push
  timestamp ships yet — plus exact `Graphite / mergeability_check` pending recognized as
  trailing (actionable pending = pending minus trailing).
- **Conflict canon section**: already-submitted downstack shape is canonical, duplicate
  commits are skipped, mechanics route through `code-gt-restack-resolve`.
- **Amend verification** in step 7: clean `git status --short` and the fix visible in
  `git show --stat` after `gt modify`.
- **Delegation section**, harness-neutral: mechanical validation/submit sweeps and
  CI-log digs go to a subagent when the harness provides one; conflict resolution and
  semantic fixes stay in the main session.
- **Negations rephrased positive**: "Do not opportunistically rewrite upstack behavior",
  "Do not assume submitted means fixed; do not hand-roll a sleep/re-query loop", "never
  treat a timeout as green", and "never machine-readable topology" are replaced with
  positive statements (scope-to-branch, wait-for-checks as the only settle mechanism,
  timeout leaves the stack unsettled, presentation-vs-topology routing).

The rewrite references only shipped surfaces: today's `branch-pr-checks` per-check
`started_at`/`created_at` fields (verified in
`ts/packages/capabilities/pr-feedback/src/core/pr-checks.ts`), `wait-for-checks`,
`stack-branches`, and the existing `code-gt-restack-resolve` and `pr-address` skills. No
mention of `head_commit_pushed_at`, `pr_status`, freshness fields, or a log-excerpt
command, which remain unimplemented. Validation: repo `just dprint-check` passes; a
defect grep (`## Purpose`, "resolve conflicts carefully", do-not/never phrasing,
unshipped field names) returns no matches.

## Objective Impact

- The interim-rewrite roadmap row is complete; the row now records the trunk-drift
  correction (several target defects had already been fixed by skill-audit commits, so
  the interim slice narrowed to the remaining spec items).
- The completion-criteria bullet for the interim rewrite is satisfied. Remaining open
  work: the `branch-pr-checks` enrichment implementation, the failed-check log excerpt
  command, the final rewrite collapsing inventory/triage into one enriched invocation
  plus interpretation rules, and the push-down audit.
- The stale/fresh triage currently instructs timestamp comparison against the agent's
  own last `gt submit`; the enriched command's `head_commit_pushed_at`/`freshness`
  fields will replace that mental anchor in the final rewrite, which is exactly the
  push-down this Objective's thesis calls for.

## Follow-Ups

- Final rewrite must retire the manual timestamp comparison in `## Reading checks` and
  the manual trailing recognition once the enriched command ships.
- The interim skill's `## Reading checks` vocabulary (fresh/stale/trailing) matches the
  JSON contract's field vocabulary deliberately; keep them synchronized when the
  implementation lands.
