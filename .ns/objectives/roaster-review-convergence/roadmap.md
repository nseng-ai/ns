# Roadmap

## Work

- [ ] Write the ADR: compute/publish split, Review cache vs Review log, full execution-contract Review cache identity, Canonical reviewed diff, Branch Memory Pull/Push, Publication ledger suppression, and CI fan-in trust boundary
- [ ] De-risk Canonical reviewed diff parity: hash the exact full filtered Git diff text after Roaster exclusions, preserving current Git diff defaults beyond today's command shape, and validate laptop↔CI hash parity before enabling LLM-skipping cache hits
      Load-bearing risk — cache lookup may land in shadow mode first, but trusted hits require parity evidence because a collision or wrong canonical match is unsafe.
- [ ] Split roaster review into cacheable compute (structured `ReviewRunResult`) and side-effectful publish; persist Review cache records as JSON keyed by the full execution-contract Review cache identity
- [ ] Add shadow-mode cache lookup to `sdl roaster review run` and CI: report/cache potential hits and misses without skipping the LLM until Canonical reviewed diff parity evidence exists
- [ ] Build first-class Branch Memory Pull / Branch Memory Push for origin-backed Snapshot refs: fetch remote, Entry-union-merge into the local Snapshot, push with non-fast-forward rejection, and require pull-before-retry semantics
- [ ] Make Branch Memory state durable to origin for Roaster: fetch/persist `refs/brmem/*` via Branch Memory Pull/Push, with `contents: write` scoped to a no-model CI fan-in persistence job
- [ ] Enable trusted cache hits after parity evidence: hit skips the LLM and reuses findings; miss computes, caches, and pushes
- [ ] Implement branch-scoped Publication ledger suppression keyed by review key + Finding fingerprint so only previously-unsurfaced findings appear in summary and inline output
- [ ] Demonstrate local→CI push-up end to end: a locally computed review is reused by a CI run on the same diff with no repeated LLM call
      Evidence: targeted tests and relevant repo checks passed.

## Parked

- [ ] Draft-gating / CI trigger changes — non-goal here; revisit only if suppression + caching prove insufficient
- [ ] Provenance / signing of pushed-up cache results — only if the fork-exclusion trust model weakens
