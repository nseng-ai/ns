# Frontier Grilling Session Resolutions

## Summary

A live frontier grilling session (2026-07-10) resolved five of the eight Question
Rows and pre-decided one sub-question of a sixth. The session began as a challenge —
"is this record executable autonomously to completion?" — and the user chose to widen
autonomy by pre-deciding, resolving grilling rows live rather than delegating
decision authority to agents.

Decisions, by row:

**Commit-run contract (resolved)**

- No structured decision markers (no `Smush-Decision:` trailer or equivalent).
  Narrative commit messages carry the signal; packaging infers decisions from prose
  and holds override authority — it may promote unmarked commits or demote weak ones.
- Greenness: the run tip must validate; slice boundaries are verified/made green at
  packaging time; interior span commits may be red (they vanish at span squash).
- The branch is the run: a linear, merge-free sequence `trunk..tip` on a feature
  branch. No run IDs, refs, or manifests.

**Packaging semantics (resolved)**

- Slicing authority is fully agent: packaging slices, creates the stack, and
  submits; the human ratifies the slice map asynchronously and reshapes on
  disagreement.
- Slicing rule: ordered partition. A decision PR is one high-impact choice plus the
  commits needed to judge it in isolation; span PRs are the maximal stretches
  between; span sizing/splitting is packaging judgment narrated in the slice map.

**Review-policy encoding (resolved)**

- `decision` / `span` PR labels plus a body rationale written by packaging; decision
  PRs request careful human review; span PRs get agent review (the reviews
  capability) as the deliberate, durably-marked stand-in.

**Subagent run-building mechanics (resolved)**

- Serialize entangled work; parallelize only declared-disjoint scopes on private
  branches; join by concatenation-rebase as contiguous blocks in a deliberate order,
  never interleaved. A join conflict falsifies the disjointness claim and forces
  serialization. CCC dispatch needs disjoint-scope declarations and a join order.

**Packaging mechanics design (partially decided; row stays gated on the survey)**

- Span squash is an explicit command invoked after the stack exists — never implicit
  in packaging or land. The land path stays untouched (Non-Goal preserved).

**Vocabulary and placement (resolved, ahead of its formal blocker)**

- Placement: a **skill** — an LM-driven approach to mutate a stack after creation;
  deterministic sub-operations push down to CLI per `cli-push-down`.
- Input scope: any existing stack. A contract-conforming commit run is best-case
  input; accreted or feedback-laden stacks are valid degraded input; pre-existing
  PRs are folded via `gt fold`; repackaging under change is the same operation
  re-run.
- Canonical terms adopted into root `CONTEXT.md`: Commit Run, Packaging (smush as
  colloquial/skill name), Decision PR, Span PR, Slice Map, Span Squash.

The record was also made a scoped autoobjective: `## Definition of Progress` and
`## Runner Policy` were added to `objective.md`. Autonomous runner steps are limited
to agent-alone rows (research and task); grilling and prototype rows always escalate;
runner steps branch and commit (never `master`), validate with `just`, and never
push, submit PRs, or perform external writes unless explicitly requested. Scratch
git repositories outside the worktree with local-only `gt` operations are in bounds
for empirical survey work.

## Objective Impact

The Frontier is nearly crystallized: remaining Question Rows are the Graphite
slicing-mechanics survey (research, agent-alone — now expanded to cover `gt fold` on
branches with open PRs, concatenation-rebase joins, and explicit mid-stack span
squash), Packaging mechanics design (gated on the survey), and the repackaging
prototype (now reframed as the hard case of the one general packaging operation, and
elevated to load-bearing by the fully-agent submit decision). Four new agent-alone
task rows graduated from the decisions and Fog: commit-message narration convention,
CCC disjoint-scope dispatch proposal, slice-map ratification surface proposal, and
smush skill authoring. The autonomous surface is now five rows instead of one.

Assumption/risk updates: the linear-runs assumption has a decided shape awaiting
real-work proof; the repackaging-chaos risk is elevated (re-slicing is the normal
correction path); the reduced-oversight risk has a resolved direction (labels +
agent review stand-in). Two Fog items graduated or resolved (reviewer routing;
observability); the CI-cost item was narrowed to PR count.

## Follow-Ups

- Run the Graphite slicing-mechanics survey as the first autonomous runner step.
- Execute the three unblocked task rows (narration convention, CCC dispatch
  proposal, ratification surface proposal) via runner steps.
- Return for live sessions only at: packaging mechanics design (post-survey), the
  repackaging prototype, and any proposal ratifications.
