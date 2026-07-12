# Refresh: both packaged stacks fully merged; roadmap rebaselined

Provenance: objective-refresh basis target=c1cb8d5d3 from=trunk-HEAD

## Summary

A trunk-style objective-refresh (2026-07-12) forensically verified the record and
found it substantially accurate; the durable news is landing evidence. All thirteen
PRs from the two live packaged stacks are now confirmed **merged** via `gh`:
#3364–#3371 (`extension-feedback/follow-up-cleanups--*`) and #3377–#3381
(`flow-deepening-smush--*`), every one carrying its `[decision]`/`[span]` title
prefix and grammar-conforming `headRefName`. All seven decision PRs' decisions-log
mirrors are flipped to Accepted (run 1's four, pending as of
`updates/2026-07-11T073927Z-decision-lifecycle-first-runs-and-grilling-resolutions.md`,
were subsequently decided and merged). This supersedes that update's "neither has
landed through the land path yet" status line.

Other probe results, all confirming the record: `skills/code-smush/SKILL.md`
matches the replacement-stack rewrite (deterministic packaging rule, `st<num>`
run-segment token, fold/orphan paths absent); all four `references/` artifacts
exist; root `CONTEXT.md` carries the six canonical terms with replacement-stack
and title-prefix wording; `flow-land-incremental-perf-rollout` is closed; no
decide skill, no smush objective-binding input, no `[decision]`/`[span]` handling
in `ts/`, and no `ns-decisions-log` text in the repo — the five open task/prototype
rows are verifiably still open. One narrowing find: flow already has a generic
guard test that human body text outside the managed generated region survives
regeneration (`ts/packages/capabilities/flow/test/scenario/regenerate-pr-command.test.ts`,
predating the decisions-log row), so that row's test deliverable narrows to
covering the marker block specifically.

## Objective Impact

- **Completion criterion 2 advances materially**: packaged stacks now demonstrably
  land — thirteen merged PRs across two runs with classification intact end to end.
  Not yet claimed as met: neither run built a fresh multi-agent commit run per the
  production-side contract (run 1 repackaged an accreted stack), and merge state
  alone does not evidence the flow land path specifically.
- Roadmap corrections applied: the prototype row's stale `s<num>` token corrected
  to the settled `st<num>` run-segment suffix; the smush-authoring row gained a
  superseded-in-part pointer (its fold-based repackaging clauses were pruned by the
  rewrite row); merge confirmations and the guard-test narrowing recorded on their
  rows. `objective.md` verified accurate and untouched.

## Follow-Ups

- The rescoped repackaging prototype row remains the open path to criterion 2's
  full-cycle evidence: one deliberate replacement cycle on a reviewed stack.
- The decisions-log row's test work should build on the existing regenerate-pr
  guard rather than duplicating it.
