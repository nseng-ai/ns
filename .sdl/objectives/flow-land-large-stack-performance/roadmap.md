# Roadmap

## Work

- [ ] Add Flow land external-call telemetry for Graphite, `gh`, and GitHub API interactions.
  - First milestone. Capture timing, status, category, and call counts. Reserve an optional per-call quota field in the event schema and populate it from the static cost model of known `gh` command shapes; live quota capture (`GH_DEBUG=api` header parsing, direct-API headers) is a later fidelity level, not part of this milestone. Expose structured in-process events, concise verbose summaries, and lightweight XDG/state JSON per-run diagnostics. Evidence: targeted tests cover emitted facts, log shape, and the reserved quota field.
- [ ] Establish a measured large-stack baseline.
  - Run representative stack-landing scenarios: fakes reveal command/API counts and quota deltas via the static cost model; real large-stack runs are required for per-phase wall time. Add opt-in `GH_DEBUG=api` quota-header parsing here only if the static cost model proves insufficient. Use this evidence to order optimization work instead of guessing.
- [ ] Reduce Graphite maintenance cost where measurements justify it.
  - Investigate rolling-frontier maintenance, avoiding repeated `gt restack --upstack` over the remaining stack, and replacing full topology rereads with targeted safety checks where safe.
- [ ] Reduce GitHub/`gh`/API call volume while preserving quota visibility and merge safety.
  - Investigate batched PR fact loading and avoiding redundant reads: the current per-PR sequence fetches overlapping PR facts three times (pre-merge `gh pr view` gate, `gh pr merge`'s internal PR-finder query, post-merge `gh pr view` verification). A direct GraphQL merge path is a known-viable option — `cli/cli` source confirms `gh pr merge` is one finder query plus a `mergePullRequest` mutation with `expectedHeadOid` matching `--match-head-commit` — but adopt it only if baseline evidence justifies it, with parity test coverage.
- [ ] Reduce local git/ref subprocess volume where measurements justify it.
  - Investigate batching branch existence/SHA reads, backup ref writes/deletes, and other per-branch local probes without weakening backup or cleanup guarantees.
- [ ] Reconcile results, documentation, and parked follow-ups.
  - Record what improved, what remained unchanged, which assumptions were disproven, and which optimization ideas are deliberately parked for future work.

## Parked

- [ ] Numeric latency or call-count SLA for large-stack landing.
- [ ] Productized telemetry retention, dashboards, aggregation, or query UI.
- [ ] Broad instrumentation rollout to unrelated SDL commands beyond shared surfaces needed by Flow land.
