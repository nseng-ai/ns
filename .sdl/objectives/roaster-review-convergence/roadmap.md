# Roadmap

## Work

- [ ] Write the ADR: compute/publish split, diff-addressed shared review cache, brmem-ref persistence, and trust boundary
- [ ] De-risk diff normalization: define and validate a canonical diff form that hashes identically across laptop and runner (context lines, base-ref resolution, file ordering, rename/copy, whitespace)
  Load-bearing risk — a collision is unsafe, so this gates trusting cache hits. Resolves the primary Open Question on cache key granularity.
- [ ] Split roaster review into cacheable compute (structured `ReviewRunResult`) and side-effectful publish; persist results as JSON keyed by the cache key
- [ ] Make Branch Memory state durable to origin: fetch `refs/brmem/*` before runs and push after, via `brmem setup-git` wiring, with `contents: write` scoped to a no-model persistence job
- [ ] Build `brmem sync` (fetch → replay local-only entries onto remote tip → push → retry) that union-merges divergent snapshots and resolves the CI matrix race
- [ ] Wire cache lookup into `sdl roaster review run` and CI: hit skips the LLM and reuses findings; miss computes, caches, and pushes
- [ ] Implement finding-level suppression at publish so only previously-unsurfaced findings appear (convergence)
- [ ] Demonstrate local→CI push-up end to end: a locally computed review is reused by a CI run on the same diff with no repeated LLM call
  Evidence: targeted tests and relevant repo checks passed.

## Parked

- [ ] Draft-gating / CI trigger changes — non-goal here; revisit only if suppression + caching prove insufficient
- [ ] Provenance / signing of pushed-up cache results — only if the fork-exclusion trust model weakens
