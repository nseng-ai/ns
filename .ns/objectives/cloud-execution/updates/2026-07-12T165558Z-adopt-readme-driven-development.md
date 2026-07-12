# Adopt README-driven development for this Objective

## Summary

This Objective is now a README-driven-development Objective (user decision,
2026-07-12, shortly after creation): `references/README-draft.md` is the
canonical, exclusively user-facing contract for cloud dispatch, settled
through the readme-driven-development loop (draft → grill → settle) before
and alongside implementation. This retrofits the
`objective-create-readme-driven-development` composition onto an Objective
created minutes earlier, following the `generic-flow-extension` precedent.

Bindings:

- **Canonical README** = `references/README-draft.md`, promoting to the
  dispatch capability package's README under `ts/packages/` once settled
  (exact home decided with the package name in the seam-design row). The
  Objective is not complete while the contract lives only under
  `references/`.
- **Decisions settle in the README.** Seam contracts, credentials rationale,
  and Semantic Updates support the README and never override it; a decision
  counts as settled only when the README states or links it.
- **Execution state stays in `roadmap.md`**, never in the README.

The initial draft records what was already settled at consolidation (command
surface `ns dispatch plan|prompt --target cloud`, git-native return path,
human-review guardrail on scheduled jobs) and surfaces the carried open
questions (completion discovery, plan addressing, credentials surface, repo
scope, nightly advancement policy, slots-in-cloud) as visible README open
questions to be grilled.

First grill pass outcomes (user decisions, 2026-07-12):

1. **The README documents the in-harness experience, Pi first** —
   `/ns:dispatch:prompt` and `/ns:dispatch:plan` as the user's surface,
   dispatch-and-keep-working as the narrative, handoff pickup as the return
   experience — with the `ns dispatch plan|prompt` kernel CLI documented as
   the under-the-hood substrate reachable from other harnesses via wrapper
   skills.
2. **Plan addressing**: `/ns:dispatch:plan` with no argument dispatches the
   latest plan from the Pi session (session sugar, continuing today's
   dispatch-plan UX); the kernel CLI always takes an explicit plan
   reference.
3. **Dispatch jobs status TUI committed**: a terminal UI showing the status
   of all outstanding dispatch jobs. New scope row and roadmap row; where
   run state lives (git-derived vs. queryable executor state) is owned by
   the seam design.
4. **Credentials are Vercel-native**: model keys as sensitive environment
   variables on the dispatch project; executor auth via OIDC federation
   (local dev token via `vercel link` + `vercel env pull`); sandboxes
   secret-free with per-run injected credentials; short-lived repo-scoped
   git credentials as the stance (minting mechanism owned by the
   credentials row). Informed by Vercel's April 2026 env-var breach —
   prefer short-lived/scoped over long-lived tokens.
5. **Repo scope**: dispatch is repo-local — it operates on the repo it runs
   from; no cross-repo dispatch. Objective open question resolved.
6. **Slots stay local**: sandboxes are ephemeral fresh checkouts; nothing
   slot-shaped in the cloud. Resolved as a Non-Goal.
7. **Deferred**: nightly advancement policy (qualification, Runner Policy
   declaration, review loop) stays a visible README open question owned by
   the durable-jobs row.

Second grill pass outcomes (user decisions, 2026-07-12, same session):

1. **Dispatched ref = current branch head.** Dispatch pushes the branch
   first if the remote is missing/behind it. Trunk-default was declined.
2. **Dirty tree refuses.** Dispatch fails on uncommitted changes, listing
   the dirty files; commit or stash and re-dispatch.
3. **Result contract = new child branch + open PR + handoff.** The result
   branch is based at the dispatched commit; the agent never pushes to the
   dispatched branch. The PR description carries the agent's decision log.
4. **Scheduled jobs land the identical contract, PRs included.** The
   guardrail is reworded from "never merge, submit, or publish" to "never
   merge or land" — opening PRs for review is the review loop, not a
   violation. `objective.md` risk and completion criteria and
   `orientation.md` return-path line updated to match.
5. **`cloud` is the default `--target`.** Bare `/ns:dispatch:*` dispatches
   to the cloud; the flag exists for future backends.
6. **Failures are TUI-only.** A failed run lands nothing in git; a handoff
   always means work ready for you. Run state and failure logs come from
   the cloud backend's own observability (Vercel Sandbox / Workflows),
   queried through the backend seam — the executor need not store logs.
7. **Strictly non-interactive runs with a decision log.** The remote agent
   never blocks on a question; judgment calls are recorded and surfaced in
   both the PR description and the run logs.
8. **No validation promise yet.** The remote agent works under the repo's
   normal rules; PR CI enforces. Stated direction: tighten toward
   validated-before-landing as the capability earns confidence.
9. **Harness/model choice is backend detail.** No `--harness`/model flag on
   dispatch surfaces.

Third grill pass outcomes (user live README review, 2026-07-12, same
session; several supersede pass 1–2 decisions):

1. **Automatic result-handoff generation is cut** from the initial happy
   path (supersedes the branch+PR+handoff result contract): results are
   anchor branch + PR only. Parked as a possible later add-on.
2. **`/ns:dispatch:session` added**: continue the current session remotely.
   Implemented as handoff machinery on the *input* side — the session's
   working context is captured as a handoff and dispatched with a
   predefined continuation prompt. The clean-tree rule applies unchanged:
   the user checkpoint-commits and pushes first (the branch carries code
   state, the handoff carries session context).
3. **`--target` dropped** (supersedes "cloud is the default target"): the
   execution backend is preconfigured per repository; no per-dispatch
   backend/harness/model selection. The backend seam remains a design
   obligation without a CLI surface.
4. **The PR opens up front, before job submission**, as the dispatch's
   observability anchor; produced commits land on the anchor branch.
5. **Failed runs leave the anchor PR open and marked failed** (supersedes
   "failures are TUI-only / land nothing in git"): a failure comment with
   reason and logs pointer; triage by re-dispatch, takeover, or close. The
   TUI shows the same state.
6. **Nightly objective advancement demoted to an example**: the README
   presents scheduled jobs generically; automated smart rebases of
   outstanding branches named as a second example (parked in the roadmap).
   Nightly advancement remains the roadmap's proving job.

## Objective Impact

- `objective.md`: thesis names the README as canonical; Scope gains the
  README row; Completion Criteria gain the settle-and-promote criterion;
  Risks gain README-drift mitigation (README settles first, slices cite the
  section they make true).
- `roadmap.md`: new first row — settle the README through the RDD loop
  (in progress); new final row — promote the README and repoint the
  reference.
- `orientation.md`: names the README as the canonical user-facing contract.

## Follow-Ups

- Grill the open README questions with the user; fold answers back into the
  README before the seam-design row hardens contracts.
- The seam-design row must keep vendor-shaped detail out of the README: the
  README documents user-visible behavior; backend specifics stay in seam
  records.
