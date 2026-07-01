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
- Persist structured `ReviewRunResult` records as the Review cache unit (JSON,
  distinct from the existing rendered Review log), keyed by a full
  execution-contract Review cache identity: Canonical reviewed diff hash, Review
  definition content hash, resolved model/profile, and Roaster
  prompt/schema/cache-version identity. Commit SHAs and bounded prompt-input
  coverage are audit fields, not key fields.
- Define the Canonical reviewed diff as the exact full filtered Git diff text
  after Roaster exclusions. V1 intentionally preserves the current Git diff
  command defaults beyond Roaster's existing canonical prefix / `--no-ext-diff`
  shape; therefore cache writes/read probes may land in shadow mode before cache
  hits are allowed to skip the LLM.
- Make Branch Memory review state durable across ephemeral CI runners by pushing
  `refs/brmem/*` to origin and fetching before runs, building on the existing
  `brmem setup-git` refspec wiring.
- Provide first-class Branch Memory Pull / Branch Memory Push semantics (fetch →
  Entry-union-merge remote Snapshot into local Snapshot; push with
  non-fast-forward rejection and pull-before-retry guidance), with any future
  `sync` command only as optional sugar. This resolves the CI matrix race on the
  shared snapshot ref and local↔CI / local↔local write contention.
- Wire cache lookup into both `sdl roaster review run` and the CI workflow:
  before local↔CI Canonical reviewed diff hash parity evidence, hits are reported
  in shadow mode but do not skip the LLM; after parity evidence, hit → skip the
  LLM and reuse findings; miss → compute, cache, push.
- Implement finding-level suppression at publish time using a branch-scoped
  Publication ledger keyed by review key + Finding fingerprint, so re-runs
  surface only previously-unsurfaced findings in both summary and inline output.
  This replaces input-level delta-scoping as the convergence mechanism.
- Support the local→CI push-up flow end to end: a local review computes, caches,
  and pushes so CI reuses it.
- CI workflow changes: scope `contents: write` so the model-executing review
  jobs stay read-only and only a no-model persistence (fan-in) job holds write;
  the fan-in job performs Branch Memory Pull/Push for Review cache and
  Publication ledger state.
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

- ADR merged capturing the compute/publish split, Review cache identity,
  Canonical reviewed diff, Branch Memory Pull/Push persistence, Publication
  ledger suppression, and CI trust boundary.
- Structured Review cache records are persisted and retrievable by full
  execution-contract Review cache identity; Review cache records remain distinct
  from Review log entries.
- Local↔CI Canonical reviewed diff hash parity is demonstrated for
  representative diffs before cache hits are trusted to skip the LLM. Before that
  evidence, cache lookup may run only in shadow mode.
- After parity evidence, a second run over an identical full filtered diff (local
  or CI) is a verified cache hit that skips the LLM.
- A locally computed and pushed-up review is reused by a CI run on the same diff
  with no repeated LLM call, demonstrated end to end.
- Branch Memory Pull/Push union-merges concurrent writers without losing entries;
  the CI matrix no longer races on the shared snapshot ref.
- Publishing uses the branch-scoped Publication ledger to surface only findings
  not previously surfaced for the branch; a resolve→resubmit cycle over unchanged
  code produces no new findings in summary or inline output.
- Evidence: targeted tests and relevant repo checks passed.

## Assumptions and Risks

Assumptions:

- Roaster stays same-repo-PR only (the fork exclusion in `roaster.yml` holds), so
  ref-pushers are within the code-committer trust domain and unsigned cached
  results are acceptable.
- Branch Memory snapshot refs (commit-chained, CAS-updated) plus `brmem
  setup-git` refspec wiring are a sound foundation for origin-pushed durable
  state.
- The Canonical reviewed diff can be hashed identically from a laptop and a CI
  runner for representative diffs even while v1 preserves current Git diff
  defaults beyond Roaster's existing command shape.

Risks:

- **Diff normalization is the load-bearing risk.** If two workers produce
  different Canonical reviewed diff hashes for the same logical diff, the cache
  silently *misses* (wasted work — tolerable); but if the canonical form or key
  ever collides distinct reviewed diffs, CI reuses a stale or wrong result
  (unsafe). Cache lookup may be implemented in shadow mode first, but LLM-skipping
  cache hits are blocked until local↔CI parity evidence exists. *Not yet
  de-risked.*
- Distributed write contention on the shared `refs/brmem/ns/roaster/<branch>`
  snapshot could drop entries if Branch Memory Pull/Push union-merge and
  pull-before-retry semantics are wrong. *Not yet de-risked.*
- `contents: write` in CI raises blast radius on a job that runs an LLM over
  attacker-influenceable diff content; mitigated by the fan-in split keeping
  write off model-executing review jobs, but must be verified. *Partially
  mitigated.*
- LLM non-determinism means "first result wins" for a given diff; acceptable for
  convergence, but a poor first result is frozen until the definition or diff
  changes. *Accepted trade-off; monitor.*
- Graphite restacks churn commit SHAs; diff-content addressing is the intended
  mitigation, but it depends on the normalization risk above.

## Open Questions

- Exact Branch Memory Pull conflict policy for non-cache Entries: Review cache
  records should be content-addressed enough that same-key/different-content is a
  corruption signal, but general Branch Memory Pull may need an explicit strategy.
- Exact representative fixture set for local↔CI Canonical reviewed diff hash
  parity while preserving current Git diff defaults.
- How is a cached result re-published to a *new* PR (e.g. after branch
  recreation) — Publication ledger state is branch-scoped, but GitHub comment
  publication still has PR identity.
- Confirm brmem `gc` prunes Roaster Review cache and Publication ledger state on
  branch merge/delete as desired (state lifetime = branch lifetime).
