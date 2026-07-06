---
edges:
  - objective: flow-land-large-stack-performance
    annotation: Successor by consolidation; this rollout inherits its unfinished reconcile row, wall-time baseline question, and parked follow-ups, and replaces its steer-first primitive questions with an incremental dogfooded-slice strategy.
---

# Flow Land Incremental Perf Rollout

## Thesis

The performance improvements prototyped in the unmerged stack ending at `flow-land-perf-baselines` are worth having, but landing that stack wholesale is too risky: its top replaces the push and merge primitives and removes a post-merge safety check in bundled commits. This Objective delivers flow-land performance improvements instead as small, freshly derived, individually revertible PRs — one risky slice in flight at a time — where each slice is dogfooded in real `/sdl:flow:land` use and declared sound by the user before the next risky slice lands. Backout is git-native: revert the slice's PR. No runtime feature flags or dual code paths.

## Scope

- Re-derive the reference stack's improvements as fresh slices, using the stack as reading material only (no cherry-picks, no building on its branches): PR node-ID plumbing through land PR facts; targeted trunk fetches replacing mid-loop Graphite refreshes; lease-based push with GraphQL PR base retarget replacing `gt submit`; GraphQL `mergePullRequest` adoption; and — as its own late, separate slice — the decision to retain or remove post-merge PR view verification.
- Split bundled decisions: the reference `flow-land-graphql-merge` branch couples GraphQL merge adoption with verification removal; here they are always distinct slices.
- Per-slice dogfood gate: the user declares each slice sound by judgment; declarations are recorded as roadmap row evidence so future sessions can see where the rollout frontier is.
- Inherited live tail from `flow-land-large-stack-performance` (closed by consolidation into this Objective): the reconcile/documentation row, the human-driven real large-stack wall-time baseline (stack shape still undecided), and the parked follow-up candidates (stale backup deletion, post-restack guard reads, optional descendant restack scope, merge-loop duplicate PR facts) as candidate slices under the same discipline.
- Keep the existing telemetry and fake-backed scenario counts (`land-stack-command-scenarios.test.ts`; current linear-11 = 145 total calls, linear-25 = 313) as the measurement backbone; slices that change call volume record before/after counts on the same shapes.
- Delete the reference stack branches once fully mined.

## Non-Goals

- Landing, rebasing, cherry-picking from, or building on the existing five-branch reference stack.
- Runtime feature flags, kill switches, or retained dual code paths — backout is `git revert` of a slice's PR, by design.
- Removing or weakening flow-land safety properties (strict PR/head checks, confirmation behavior, backup refs, Graphite cleanup guards, conservative failure handling) except where a dedicated slice explicitly proposes retiring one specific check with evidence and user sign-off.
- Parallel merge execution that would weaken the serial landing safety model (inherited).
- Productized metrics databases, dashboards, retention machinery, or broad observability rollout beyond flow-land shared surfaces (inherited).

## Completion Criteria

- Every stack-derived improvement is dispositioned: landed as a fresh slice and declared dogfooded by the user, or explicitly parked/rejected with a recorded rationale.
- The post-merge verification question is decided as its own slice — retained or removed with rationale — never bundled with merge-path adoption.
- The inherited tail is resolved: the reconcile/documentation row is done; real wall-time evidence from a human-driven large-stack run is recorded or explicitly parked; each inherited parked follow-up is dispositioned or re-parked with rationale.
- The reference stack branches are deleted.
- The backout story held throughout: every landed slice was a small independently revertible PR, and any backout that occurred is recorded as evidence rather than hidden.

## Definition of Progress

Progress is keepable when:

- A slice is freshly derived (reference stack consulted as reading material only), implements one human-legible decision, and is small enough that reverting its PR is a credible backout.
- Targeted Vitest and `just` pass; slices that change external-call volume update the fake-backed scenario assertions with before/after counts on the same stack shapes.
- A user dogfood declaration is recorded as row evidence — that recording is progress equal to an implementation slice.
- A candidate improvement is parked or rejected with an evidence-backed rationale.

Do not keep changes that:

- Bundle a merge/push primitive change with a safety-property change in one slice.
- Land or stage a second risky slice while the previous risky slice's dogfood declaration is outstanding.
- Cherry-pick or merge commits from the reference stack branches.
- Introduce runtime flags or dual code paths as a backout mechanism.
- Weaken any listed safety property outside a dedicated, user-approved slice.
- Add raw wall-clock reads or timers instead of the `@sdl/core/clock` / timer seams (inherited).

Useful evidence includes: targeted Vitest runs, before/after fake-backed scenario call counts, per-run JSON diagnostics from real runs (`$XDG_STATE_HOME/sdl/flow/land/runs/`), and recorded user dogfood declarations.

## Runner Policy

This Objective is execution-friendly for `objective-next` and the decomposed Objective Runner under the boundaries below. Rollout control stays human: which slice lands next, whether a slice is dogfooded, and every real landing run are user decisions, not runner steps.

- Direct execution is allowed when: implementing an already-approved slice on a local feature branch; fake-backed scenario measurement; adapting scenario tests or fixtures; documentation and evidence recording.
- Steer or ask first when: choosing or reordering which slice to derive or land next; any design decision on the lease-push/retarget or GraphQL merge slices or anything else touching merge/push primitives or a safety property; behavior appears to diverge from the reference stack in a way the slice did not intend; evidence contradicts a load-bearing assumption; or validation fails for reasons outside the slice.
- Human-driven only: real `/sdl:flow:land` runs against real stacks; dogfood declarations; PR submission and landing; deleting the reference stack branches.
- How work may change files and be left: feature branches only (never `main`/`master`); step subagents create their implementation branch via branch-context Graphite creation, not bare `gt create`; one coherent slice per step and branch; runner steps leave changes uncommitted for `runner-finish` to commit.
- Validation before keeping or submitting work: `just` passes; targeted Vitest for touched packages; call-volume slices record before/after counts on the same fake-backed stack shapes as row evidence.
- What will not happen unless explicitly requested: pushing, submitting, or merging anything; running `/sdl:flow:land` against real stacks; publishing or external writes; edits to other Objectives; archive or lifecycle changes to this Objective.

## Assumptions and Risks

Assumptions:

- The reference stack's improvements are individually separable into fresh slices that each pass review and revert cleanly. The bottom two (node-ID plumbing, trunk fetches) are already slice-sized; the push/retarget and merge changes are the real test of this assumption.
- The existing telemetry and fake-backed scenarios remain a sufficient measurement backbone for slice-level before/after evidence.
- GraphQL merge parity with `gh pr merge` is achievable — confirmed from the `cli/cli` source by the predecessor Objective (`gh pr merge` is one PR-finder query plus a `mergePullRequest` mutation whose `expectedHeadOid` is exactly `--match-head-commit`); the open question is sequencing and safety, not feasibility.
- Real ns stack landings happen often enough that a judgment-based dogfood gate gets meaningful signal between risky slices.

Risks:

- Revert-based backout degrades as slices accumulate: a problem discovered late may require reverting several slices. Mitigated by the one-risky-slice-in-flight rule and dogfooding before the next risky slice lands.
- Re-derivation drift: fresh slices may subtly differ from the tested reference implementation; each slice needs its own test coverage rather than trust inherited from the stack.
- Replacing `gt submit` with lease-based push and GraphQL retarget could diverge from Graphite's metadata expectations and corrupt stack state; this slice needs careful validation against Graphite behavior before landing.
- Removing post-merge verification retires a safety net; deliberately deferred to its own late slice, decided only after the GraphQL merge path has real dogfood history.
- The judgment-based dogfood gate is not durable by itself: future sessions can only see it through recorded declarations, so declarations must be recorded promptly or the rollout frontier becomes ambiguous.

## Open Questions

- What stack shape should the human-driven real wall-time baseline run use? (Inherited; still undecided.)
- Is post-merge verification ultimately retained or removed? Deliberately open until the GraphQL merge path has real dogfood history.
- Do the inherited parked follow-ups (stale backup deletion, post-restack guard reads, descendant restack scope, merge-loop duplicate PR facts) still justify slices given the already-reduced call counts?
