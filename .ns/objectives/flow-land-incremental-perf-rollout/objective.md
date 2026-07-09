---
edges:
  - objective: flow-land-large-stack-performance
    annotation: Successor by consolidation; this rollout inherits its unfinished reconcile row, wall-time baseline question, and parked follow-ups, and replaces its steer-first primitive questions with an incremental dogfooded-slice strategy.
---

# Flow Land Incremental Perf Rollout

## Thesis

The performance improvements prototyped in the unmerged stack ending at `flow-land-perf-baselines` are worth having, but landing that stack wholesale is too risky: its top replaces the push and merge primitives and removes a post-merge safety check in bundled commits. This Objective delivers flow-land performance improvements instead as small, freshly derived, individually revertible PRs — one risky slice in flight at a time — where each slice advances only after local validation and materially relevant evidence are recorded before the next risky slice lands. Backout is git-native: revert the slice's PR. No runtime feature flags or dual code paths.

## Scope

- Re-derive the reference stack's improvements as fresh slices, using the stack as reading material only (no cherry-picks, no building on its branches): PR node-ID plumbing through land PR facts; targeted trunk fetches replacing mid-loop Graphite refreshes; lease-based push with GraphQL PR base retarget replacing `gt submit`; GraphQL `mergePullRequest` adoption; and — as its own late, separate slice — the decision to retain or remove post-merge PR view verification.
- Split bundled decisions: the reference `flow-land-graphql-merge` branch couples GraphQL merge adoption with verification removal; here they are always distinct slices.
- Per-slice validation/evidence gate: each slice records the validation and evidence needed for future sessions to see where the rollout frontier is. Real `/sdl:flow:land` diagnostics may be useful evidence when voluntarily available, but are not required gates.
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

- Every stack-derived improvement is dispositioned: landed as a fresh slice with required validation/evidence recorded, or explicitly parked/rejected with a recorded rationale.
- The post-merge verification question is decided as its own slice — retained or removed with rationale — never bundled with merge-path adoption.
- The inherited tail is resolved: the reconcile/documentation row is done; real wall-time evidence from a human-driven large-stack run is recorded or explicitly parked; each inherited parked follow-up is dispositioned or re-parked with rationale.
- The reference stack branches are deleted.
- The backout story held throughout: every landed slice was a small independently revertible PR, and any backout that occurred is recorded as evidence rather than hidden.

## Definition of Progress

Progress is keepable when:

- A slice is freshly derived (reference stack consulted as reading material only), implements one human-legible decision, and is small enough that reverting its PR is a credible backout.
- Targeted Vitest and `just` pass; slices that change external-call volume update the fake-backed scenario assertions with before/after counts on the same stack shapes.
- Materially relevant evidence is recorded in Objective tracking, such as validation commands, before/after call counts for call-volume slices, optional per-run diagnostics when available, and recorded policy or user decisions.
- A candidate improvement is parked or rejected with an evidence-backed rationale.

Do not keep changes that:

- Bundle a merge/push primitive change with a safety-property change in one slice.
- Land or stage a second risky slice while the previous risky slice lacks required validation/evidence or Objective tracking.
- Cherry-pick or merge commits from the reference stack branches.
- Introduce runtime flags or dual code paths as a backout mechanism.
- Weaken any listed safety property outside a dedicated, user-approved slice.
- Add raw wall-clock reads or timers instead of the `@sdl/core/clock` / timer seams (inherited).

Useful evidence includes: targeted Vitest runs, `just`, before/after fake-backed scenario call counts where relevant, optional per-run JSON diagnostics from real runs (`$XDG_STATE_HOME/sdl/flow/land/runs/`), and recorded policy or user decisions.

## Runner Policy

This Objective is execution-friendly for `objective-next` and the decomposed Objective Runner under the boundaries below. Rollout control stays human for slice ordering and risky design choices; real `/sdl:flow:land` runs, if they occur, are optional human-provided evidence outside agent execution.

- Direct execution is allowed when: implementing an already-approved slice on a local feature branch; fake-backed scenario measurement; adapting scenario tests or fixtures; documentation and evidence recording.
- Steer or ask first when: choosing or reordering which slice to derive or land next; any design decision on the lease-push/retarget or GraphQL merge slices or anything else touching merge/push primitives or a safety property; behavior appears to diverge from the reference stack in a way the slice did not intend; evidence contradicts a load-bearing assumption; or validation fails for reasons outside the slice.
- Human-driven only: real `/sdl:flow:land` runs against real stacks; PR submission and landing; deleting the reference stack branches.
- How work may change files and be left: feature branches only (never `main`/`master`); step subagents create their implementation branch via branch-context Graphite creation, not bare `gt create`; one coherent slice per step and branch; runner steps leave changes uncommitted for `runner-finish` to commit.
- Validation before keeping or submitting work: `just` passes; targeted Vitest for touched packages; call-volume slices record before/after counts on the same fake-backed stack shapes as row evidence.
- What will not happen unless explicitly requested: pushing, submitting, or merging anything; running `/sdl:flow:land` against real stacks; publishing or external writes; edits to other Objectives; archive or lifecycle changes to this Objective.

## Assumptions and Risks

Assumptions:

- The reference stack's improvements are individually separable into fresh slices that each pass review and revert cleanly. The bottom two (node-ID plumbing, trunk fetches) are already slice-sized; the push/retarget and merge changes are the real test of this assumption.
- The existing telemetry and fake-backed scenarios remain a sufficient measurement backbone for slice-level before/after evidence.
- GraphQL merge parity with `gh pr merge` is achievable — confirmed from the `cli/cli` source by the predecessor Objective (`gh pr merge` is one PR-finder query plus a `mergePullRequest` mutation whose `expectedHeadOid` is exactly `--match-head-commit`); the open question is sequencing and safety, not feasibility.
- Local and fake-backed validation can provide enough evidence to advance small, revertible slices when materially relevant evidence is recorded.

Risks:

- Revert-based backout degrades as slices accumulate: a problem discovered late may require reverting several slices. Mitigated by the one-risky-slice-in-flight rule and required validation/evidence before the next risky slice lands.
- Re-derivation drift: fresh slices may subtly differ from the tested reference implementation; each slice needs its own test coverage rather than trust inherited from the stack.
- Replacing `gt submit` with lease-based push and GraphQL retarget could diverge from Graphite's metadata expectations and corrupt stack state; this slice needs careful validation against Graphite behavior before landing.
- Removing post-merge verification retires a safety net; deliberately deferred to its own late slice, decided only after the GraphQL merge path has enough validation/evidence history.
- Local and fake-backed validation may miss real-stack behavior. Mitigations are small revertible slices, call-count scenario evidence where relevant, optional real-run diagnostics when available, and explicit follow-up if later evidence contradicts a load-bearing assumption.

## Open Questions

- What stack shape should the human-driven real wall-time baseline run use? (Inherited; still undecided.)
- Is post-merge verification ultimately retained or removed? Deliberately open until the GraphQL merge path has enough validation/evidence history.
- Do the inherited parked follow-ups (stale backup deletion, post-restack guard reads, descendant restack scope, merge-loop duplicate PR facts) still justify slices given the already-reduced call counts?

## Closure

Closed intentionally, for now, without completing the remaining rollout — a deliberate
pause and deprioritization, not completion. The conservative, low-risk portion of the
work is landed and kept; the risky primitive slices were never derived, and the
remaining roadmap rows (targeted trunk fetches, lease-based push/retarget, GraphQL
merge adoption, the post-merge verification decision, the wall-time baseline, the
inherited parked-follow-up dispositions, and reference-stack deletion) close unresolved.
If this work resumes, start a fresh Objective and treat this record and its updates as
the map of where the frontier stopped.

Key evidence at close:

- Four conservative optimizations plus external-call telemetry are on trunk
  (`ts/packages/capabilities/flow/src/land/stack/external-call-telemetry*.ts`); the
  fake-backed scenario counts (linear-11 = 145, linear-25 = 313 at last recording)
  remain the measurement backbone.
- The architecture gate fully landed on trunk (land plan type unification, single
  `LandContext` threading, fake-testable Graphite maintenance), so a future resumption
  starts from a much better-factored land core than this Objective began with.

Caveats and standing hazards that outlive this record:

- The unmerged five-branch reference stack ending at `flow-land-perf-baselines` still
  exists. The rule that it is reading material only — never landed, rebased,
  cherry-picked, or built upon — was enforced by this Objective's `orientation.md`,
  which leaves the always-load set at close. Durable-rule graduation candidate: either
  delete the reference stack branches (human-driven) or carry the do-not-build-on rule
  into AGENTS.md until they are deleted.
- Land merge/push primitives and safety gates remain unchanged; any future change to
  them should re-adopt this record's small-revertible-slice discipline.

Follow-ups: none scheduled; resumption is a deliberate future decision.
