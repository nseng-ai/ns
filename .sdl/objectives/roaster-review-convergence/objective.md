# Roaster Review Convergence

## Thesis

Roaster's CI review loop does not converge. Every push re-runs whole-diff,
stateless, non-deterministic reviews, so the human cycle of "resolve feedback →
resubmit → get a fresh batch of findings" repeats indefinitely — including new
nitpicks on code a previous round already blessed. Because feedback is consumed
through the harness download flow rather than the PR UI, this shows up as
redundant *work* re-downloaded each round, not just visual clutter.

Kill the treadmill by treating review as a shared, diff-addressed
memoization: **review each (review-definition × reviewed-diff) pair at most
once, wherever it runs.** Persist the structured result in git-native Branch
Memory refs pushed to origin; have both local runs and CI read that memo.
Re-reviewing an unchanged diff becomes a cache hit that skips the LLM entirely;
already-surfaced findings are suppressed at publish so a re-run shows only what
is genuinely new. A local run can compute a result and push it up so CI never
repeats the work.

Caching is the mechanism; convergence (no thrash) and local→CI reuse are what it
buys.

## Scope

- Separate review **compute** (LLM over a diff → structured findings; cacheable,
  location-independent) from **publish** (post findings to a specific PR;
  CI-only, side-effectful).
- Persist structured `ReviewRunResult` records as the cache unit (JSON, not the
  current lossy rendered markdown), keyed by a diff-content-addressed cache key.
- Make Branch Memory review state durable across ephemeral CI runners by pushing
  `refs/brmem/*` to origin and fetching before runs, building on the existing
  `brmem setup-git` refspec wiring.
- Provide a `brmem sync` primitive (fetch → replay local-only entries onto the
  remote tip → push → retry) that union-merges divergent snapshots, resolving
  the CI matrix race on the shared snapshot ref and local↔CI / local↔local write
  contention. In-scope dependency of this Objective.
- Wire cache lookup into both `sdl roaster review run` and the CI workflow: hit →
  skip the LLM and reuse findings; miss → compute, cache, push.
- Implement finding-level suppression at publish time, so re-runs surface only
  previously-unsurfaced findings. This replaces input-level delta-scoping as the
  convergence mechanism.
- Support the local→CI push-up flow end to end: a local review computes, caches,
  and pushes so CI reuses it.
- CI workflow changes: scope `contents: write` so the model-executing job stays
  read-only and only a no-model persistence (fan-in) job holds write; fetch/push
  brmem refs around the reviews.
- An ADR recording the architecture: compute/publish split, diff-addressed
  shared cache, brmem-ref persistence, and trust boundary.

## Non-Goals

- **Draft-gating / CI trigger changes** (run-on-drafts, `ready_for_review`
  one-shot). Superseded by caching + suppression; explicitly out of this
  Objective.
- **Input-level delta-scoping** (review only `lastReviewedSha..HEAD`) as the
  convergence mechanism. Rejected: it personalizes review input per worker and
  defeats a shared content-addressed cache.
- **Provenance / signing of pushed-up results.** Out while ref-pushers share the
  code-committer trust domain and forks are already excluded.
- **PR-UI presentation** (comment consolidation, inline reconciliation for human
  readers) beyond what suppression naturally yields, since feedback is consumed
  through the harness download flow.
- **Remediation / agentic resolution** of findings (owned elsewhere, e.g. the
  roaster stack workflow).

## Completion Criteria

- ADR merged capturing the compute/publish split, diff-addressed cache key,
  brmem-ref persistence, and trust boundary.
- Structured review results are persisted and retrievable by cache key; a second
  run over an identical diff (local or CI) is a verified cache hit that skips the
  LLM.
- A locally computed and pushed-up review is reused by a CI run on the same diff
  with no repeated LLM call, demonstrated end to end.
- `brmem sync` union-merges concurrent writers without losing entries; the CI
  matrix no longer races on the shared snapshot ref.
- Publishing surfaces only findings not previously surfaced for the branch; a
  resolve→resubmit cycle over unchanged code produces no new findings.
- Evidence: targeted tests and relevant repo checks passed.

## Assumptions and Risks

Assumptions:

- Roaster stays same-repo-PR only (the fork exclusion in `roaster.yml` holds), so
  ref-pushers are within the code-committer trust domain and unsigned cached
  results are acceptable.
- Branch Memory snapshot refs (commit-chained, CAS-updated) plus `brmem
  setup-git` refspec wiring are a sound foundation for origin-pushed durable
  state.
- A stable diff normalization exists that hashes identically from a laptop and a
  CI runner.

Risks:

- **Diff normalization is the load-bearing risk.** If two workers normalize the
  same logical diff differently, the cache silently *misses* (wasted work —
  tolerable); but if normalization *collides* distinct diffs, CI reuses a stale
  or wrong result (unsafe). Must be de-risked before cache hits are trusted. *Not
  yet de-risked.*
- Distributed write contention on the shared `refs/brmem/ns/roaster/<branch>`
  snapshot could drop entries if `sync`'s union-merge/retry is wrong. *Not yet
  de-risked.*
- `contents: write` in CI raises blast radius on a job that runs an LLM over
  attacker-influenceable diff content; mitigated by the fan-in split keeping
  write off the model job, but must be verified. *Partially mitigated.*
- LLM non-determinism means "first result wins" for a given diff; acceptable for
  convergence, but a poor first result is frozen until the definition or diff
  changes. *Accepted trade-off; monitor.*
- Graphite restacks churn commit SHAs; diff-content addressing is the intended
  mitigation, but it depends on the normalization risk above.

## Open Questions

- Cache key granularity: leaning to a diff-content hash for rebase resilience;
  the exact normalization (context lines, base-ref resolution, file ordering,
  rename/copy handling, whitespace) is unresolved.
- Where does `brmem sync` live — a new first-class brmem operation vs
  roaster-local orchestration — and should it stay in this Objective or spin into
  a brmem Objective?
- Should the cache record store the resolved base-ref SHA alongside the diff hash
  for auditability without making it part of the key?
- How is a cached result re-published to a *new* PR (e.g. after branch
  recreation) — is publish keyed to PR identity or to the cached compute?
- Confirm brmem `gc` prunes roaster state on branch merge/delete as desired
  (state lifetime = branch lifetime).
