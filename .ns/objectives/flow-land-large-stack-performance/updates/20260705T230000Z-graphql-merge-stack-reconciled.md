# GraphQL merge stack landed and fake-backed baselines reconciled

## Summary

The dominant per-PR subprocess costs on the Flow land required path were removed
by a four-PR Graphite stack, then reconciled against the fake-backed scenario
baselines by a fifth PR:

- `flow-land-pr-node-id`: `PullRequestFacts`/`PullRequestSnapshot` now carry the
  required GraphQL node `id`, selected and strict-parsed everywhere, so later
  mutations can address PRs by node id.
- `flow-land-trunk-fetch`: the required mid-loop `gt get <next> --downstack
  --force` is replaced by `git fetch --quiet --no-tags origin
  refs/heads/<trunk>:refs/heads/<trunk>` (fast-forward-only; verbatim `gt get`
  fallback when trunk is checked out; halt on non-fast-forward). The
  optional-descendant path keeps `gt get`.
- `flow-land-lease-push-retarget`: the required per-PR `gt submit --update-only
  --force` (plus its pre-submit `gh pr view` + `git rev-parse`) is replaced by a
  `git push --force-with-lease=refs/heads/<b>:<preRestackSha>` (lease seeded from
  the pre-restack backup-ref snapshot; lease-rejected → halt with a
  backup-recovery hint) plus a GraphQL `updatePullRequest` base retarget. The
  optional-descendant path keeps `gt submit` to resync surviving branches.
- `flow-land-graphql-merge`: `gh pr merge --squash` plus its standalone
  post-merge `gh pr view` verification are replaced by one GraphQL
  `mergePullRequest` mutation (`expectedHeadOid`/`commitHeadline`/`commitBody`
  parity) whose response carries the verification payload for the strict
  MERGED/base/head checks; a single `loadPr` fallback runs only on an
  exit-0-malformed response. Merge and retarget mutation mechanics live in
  capability-kit `github/pr-mutations.ts`, each costing `{graphqlRequests: 1,
  rateLimitCost: 1}` versus the old `gh pr merge` static cost of 2.
- `flow-land-perf-baselines` (this reconciliation): verified the recorded
  fake-backed baselines match the projected per-landed-PR shape and added a
  focused executable-evidence test.

Cumulative fake-backed evidence (`land-stack-command-scenarios.test.ts`),
this-stack baseline → after:

- Total calls: linear-11 145 → 119; linear-25 313 → 259.
- Graphite invocations: linear-11 54 → 34; linear-25 124 → 76.
- github-cli calls: linear-11 45 → 34; linear-25 101 → 76.
- GitHub GraphQL requests (static quota): linear-11 56 → 34; linear-25 126 → 76.
- Static rate-limit cost: linear-11 66 → 44; linear-25 150 → 100.
- git calls rose slightly (linear-11 46 → 51) because the trunk fetch and lease
  push move required work off `gt`/`gh` onto plain git — the projected +2 git per
  landed required-path PR.

The per-landed-PR projection (required path: `gt` 5 → 2, GitHub GraphQL 5–6 → 3,
git +2) reconciles exactly with both scenarios by differencing linear-11 and
linear-25. No recorded baseline needed correction; PRs 2–4 re-recorded their
counts incrementally, so this reconciliation added no baseline churn. A new
scenario test asserts the per-landed-PR command shape directly (`gt delete` +
branch-only `gt restack`, three GraphQL requests, and the trunk fetch + lease
push, with no `gt get`/`gt submit` on the linear required path). `just` passes.

## Objective Impact

Advances the Graphite-maintenance and GitHub/`gh`/API bottleneck rows with
landed, fake-backed before→after evidence and moves the reconcile row to `[~]`.
All three bottleneck classes now have measured call-count/quota reductions at the
fake-backed level while every listed safety property (strict PR/head checks,
backup refs, cleanup guards, serial landing, confirmation behavior) is retained.
The steer-first merge-primitive replacement was authorized and landed as its own
stack with parity coverage, resolving the standing open question in favor of the
direct GraphQL merge path. The Objective remains open: the human-driven real
large-stack wall-time baseline is still outstanding, and the mid-run staleness
rationale plus the parked end-of-run `gt submit` alternative both depend on
real-run evidence to confirm or trigger.

## Follow-Ups

- Human-driven real large-stack landing run for per-phase wall time; its stack
  shape remains the open baseline question. Real runs merge actual PRs and are
  human-driven only.
- Real-run checklist risks to watch: `gt restack`/`gt delete` dependence on
  now-less-frequently-refreshed Graphite metadata; frequency of the
  checked-out-trunk `gt get` topology fallback; mid-run-halt `gt sync`
  reconciliation after a lease-rejected or non-fast-forward halt; and GraphQL
  merge/retarget error-surface readability versus the old `gh` messages.
- Parked: single end-of-run `gt submit` reconciliation pass — adopt only if
  real-run evidence shows surviving-branch Graphite metadata staleness that
  `gt sync` and descendant submits do not already fix.
