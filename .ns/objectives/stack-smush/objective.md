# Stack Smush

## Thesis

Agent-created stacks are unwieldy because PR boundaries mirror how agents happened to
divide the work, not how humans should review it. Stack Smush inverts that: agents —
including subagents working at commit granularity — build one long linear **commit
run**, and a deliberate **packaging** step then slices that run into a stack of a few
**decision PRs** (encoding high-impact choices that shape subsequent work, deserving
careful human review) and **span PRs** (runs of consequence-executing commits that are
eventually squashed, and that humans may or may not review depending on size and risk).
Stacks are packaged, not accreted.

This is an ideation Objective: the Destination is settled, the way there is a Frontier
of Question Rows in `roadmap.md`.

## Scope

- The production-side contract: what makes a commit run packageable — commit
  granularity conventions, whether decision commits are marked at production time or
  inferred at packaging time, and how commit-granularity subagents contribute to one
  linear run.
- The packaging step: precise decision-PR / span-PR semantics, slicing authority,
  the git/Graphite mechanics that turn a linear run into a stack, span-squash timing,
  and how local-only packaging hands a self-describing stack to the user's existing
  submit/land workflow.
- Repackaging under change: how a packaged stack absorbs review feedback without
  chaos.
- Review-policy encoding: durably marking which PRs need careful human review and
  whether agent review (the reviews capability) stands in on span PRs.
- Vocabulary and placement: canonical terms and whether this lives in Flow, a new
  capability, or starts as a consumer practice with a promotion path.

Stack Smush is an **additional path first**, targeting big multi-agent efforts where
the pain is; promotion to the default workflow is a later decision gated on the path
proving out (see Parked).

## Non-Goals

- Modifying Flow land merge/push primitives or safety gates. Packaging composes with
  land as it exists; land-performance work is a separate concern (see the closed
  `flow-land-incremental-perf-rollout` record for its constraints and unmerged
  reference stack, which this Objective must not build on).
- Replacing the current default workflow inside this Objective. The promotion
  decision is in scope; the default-rollout execution is follow-on work.
- Any hidden database, ad-hoc state file, or durable Slice Map: packaging state is
  derived from branch structure, classification-bearing names, commit messages, and
  post-submit PR metadata; transient step-to-step JSON is process input only.

## Completion Criteria

1. **Crystallized design**: every Question Row in `roadmap.md` is resolved and
   recorded — commit-run contract, packaging semantics and mechanics, repackaging
   story, review-policy encoding, vocabulary and placement.
2. **Proved on real work**: at least one real multi-agent effort built a commit run,
   packaged it into decision PRs and span PRs, and landed it through the existing
   land path.
3. **Promotion decision recorded**: an explicit decision, with evidence from the real
   effort, on whether to promote Stack Smush to the default agent workflow (the
   rollout itself is follow-on work).

## Definition of Progress

Progress is keepable when:

- An open Question Row is resolved with its decision recorded in a Semantic Update
  and the roadmap row checked off, including any Fog the answer made specifiable
  graduated into new rows.
- A research or task row's artifact (survey summary, convention draft, design
  proposal) exists, is source-backed — observed `gt` /
  `@nseng-ai/capability-kit/graphite` / Flow behavior, not recall — and is linked
  from its roadmap row.
- After Crystallization: a committed, validated slice of the LM-driven smush skill
  that a human can review as one coherent step. CLI push-downs remain parked until
  real-run evidence justifies graduating them.

Do not keep changes that:

- Resolve a grilling or prototype row without live exchange with the user — those
  rows are decisions; an agent answering its own grill questions has broken the row.
- Build on the closed `flow-land-incremental-perf-rollout` reference stack, or touch
  Flow land merge/push primitives or safety gates.
- Introduce non-git-native state (hidden databases, ad hoc state files).

Useful evidence includes linked survey and proposal documents, Semantic Updates
recording decisions, graduated Question Rows, and passing `just` validation on
committed slices.

## Runner Policy

This Objective is execution-friendly for `objective-next` and designed for
autonomous Objective Runner steps under the boundaries below. Until Crystallization,
autonomy is deliberately scoped: Question Rows are decisions, not autonomous slices,
so only agent-alone rows are autonomous targets.

- Direct execution is allowed when: the target is an open, unblocked, agent-alone
  roadmap row — research and task rows — and the step stays within local repository
  reads, local edits, local validation, and Objective tracking under this record.
  Empirical `gt` observation is in bounds via scratch git repositories outside the
  worktree and local-only `gt` operations; nothing that contacts a remote.
- Steer or ask first when: the row is typed grilling or prototype (always escalate;
  they resolve only through live exchange), the row's scope is ambiguous, a finding
  would change the Destination, Scope, or Non-Goals, or work would touch Flow land
  primitives or another Objective's territory.
- How work may change files and be left: work happens on a feature branch (never
  `master`), committed as one coherent slice per runner step; Objective tracking
  edits stay under `.ns/objectives/stack-smush/`. Exploratory changes not worth
  keeping are discarded, not left dangling in the worktree.
- Validation before keeping work: `just` when code changed; research/doc-only slices
  instead verify links resolve and the roadmap row references the produced artifact.
- What will not happen unless explicitly requested: PR submission or update, pushing
  to any remote, GitHub issue/PR mutation, publishing, deploying, or any external
  write API.

## Assumptions and Risks

- **Assumption — linear runs are buildable.** Commit-granularity subagents can be
  serialized (or linearized after the fact) into one coherent commit run without
  losing the parallelism that makes multi-agent work worthwhile. If this fails, the
  production half needs a different shape and packaging inputs get messier. Decided
  shape (frontier grilling, 2026-07-10): serialize entangled work, parallelize
  declared-disjoint scopes, join by concatenation-rebase — still to be proven on
  real work.
- **Assumption — Graphite can express packaging.** `gt` plus
  `@nseng-ai/capability-kit/graphite` mechanics can slice a linear run into a stack
  and later squash spans without fighting the tool. Survey verdict (2026-07-10,
  `roadmap.md` survey row; observed on gt 1.8.6): **supported for all local
  mechanics** — slicing is pure branch-pointer metadata, fold is its inverse, span
  squash and feedback absorption are non-interactive one-liners. `gt split` remains
  unusable by agents, but v1 deliberately uses LM-orchestrated raw `git branch` / `gt
  track` recipes; a deterministic `ns slot gt exec` slicing push-down is parked until
  real-run evidence warrants it. The remote/PR half (PR fate, review threads, CI
  across fold/re-slice) remains unobserved and shifts onto the repackaging-chaos risk
  below.
- **Risk — repackaging chaos.** Review feedback on a decision PR mid-review forces
  edits beneath a live stack; re-slicing could thrash PRs, reviews, and CI. Largely
  dissolved (2026-07-11, live exchange): repackaging is now **replacement-stack
  construction** — build the new shape alongside from the same commits, verify, the
  user submits and closes the old stack — so the in-place hazards this risk named
  (fold/re-slice PR fate, `gt rename` breaking PR association, incidental orphaned
  close-candidates after `gt fold` without `--close`) are dead paths for
  repackaging. The skill still never mutates or closes PRs; the close-candidate set
  is now deterministic — the entire old stack, reported loudly. The residual has
  narrowed further (2026-07-11, skill rewrite — see
  `updates/2026-07-11T141712Z-code-smush-replacement-rewrite-and-embedded-decisions.md`):
  coexistence naming is settled (`st<num>` run-segment suffix) and carry-forward's
  home is settled (companion post-submit step, decide-skill family), so what
  remains is carry-forward fidelity in practice and disciplined old-stack closure
  by the user — both owned by the rescoped prototype row. `gt rename` remains in
  use only at initial packaging for the tip slice's grammar name (semantics
  verified from gt 1.8.6 help text only). The rescoped prototype row owns
  observing one full replacement cycle on a reviewed stack. Preliminary live evidence
  (2026-07-14) from the nine-branch
  `oidc-mint-harness-registry-pnpm-derived-st2--*` replacement component was positive:
  the user reports the replacement workflow worked well and should no longer block
  downstream work. Detailed feedback-carry-forward, CI-cost, and old-stack closure
  evidence remains to be recorded before this risk is considered fully resolved.
- **Risk — reduced oversight on span PRs.** Skipping human review on spans is the
  point, but it must be a deliberate, durably-encoded policy per PR, not silence;
  agent review may need to stand in. Resolved direction (2026-07-10):
  `decision`/`span` PR labels plus body rationale make skipping deliberate and
  queryable, with agent review standing in on spans. Revised (2026-07-11, live
  grilling): rendering is `[decision]`/`[span]` title prefixes plus the
  grammar-bearing branch names; labels moved to Parked as consumer-less.
- **Risk — workflow bifurcation.** An additional path that never proves out leaves
  two half-workflows. The promotion decision (criterion 3) is the forcing function:
  promote or retire deliberately.

## Open Questions

Fog — in-scope toward the Destination but not yet stateable as precise Question Rows;
graduates into roadmap rows as the Frontier advances:

- Promotion-to-default: what evidence gates it, and what changes (skills, Flow
  defaults, CCC orchestration) when the path becomes the default.
- CI cost and policy for span PRs — many small PRs mean many CI runs. Span squash
  timing no longer interacts (explicit post-creation command leaves PR count
  unchanged); the open question is PR count itself. Sharpened (2026-07-11):
  replacement-stack repackaging re-runs CI across the full new stack, so PR count
  and repackaging frequency now compound.
- Interaction with Objectives, branch-context, and handoffs: smush-time Objective
  binding landed on 2026-07-14 via immutable packaging-event Semantic Updates committed
  into the packaged tip. How commit runs relate to Objective runner steps, attached
  plans, and multi-session handoff continuation remains Fog.
- Run-piece completion signalling and slot lifecycle at the CCC join: dispatched
  slots are never reclaimed automatically today and the concatenation join wants
  piece slots released first; how the orchestrator learns a piece is done (beyond
  human observation via cmux) is undecided and overlaps the dispatch live decision.

## Closure

Closed 2026-07-20 as deferred (intentionally abandoned as an open record).

Outcome: ideation ran its useful course — the Destination (commit runs packaged into decision/span PR stacks), the packaging grammar, smush-time Objective binding (landed 2026-07-14), and the review-policy resolution are all recorded in this record and its roadmap. Every remaining material item is parked behind a real-run evidence gate (deterministic packaging CLI push-downs, slice-map derive command, promotion-to-default, PR classification labels), and that evidence is not currently being generated. Carrying the record as open WIP misstated the portfolio.

Restart pointer: the roadmap's Frontier rows, Parked section, and `## Open Questions` Fog remain the complete restart state. If commit-run packaging becomes active work again, create a fresh execution record (or re-judge this one) starting from the parked evidence gates; nothing here needs re-deciding, only re-activating.

Closure decision made in the 2026-07-20 open-objective portfolio review (reduce concurrent WIP).
