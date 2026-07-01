# Roadmap

## Work

- [ ] Add Flow land external-call telemetry for Graphite, `gh`, and GitHub API interactions.
  - First milestone. Capture timing, status, category, call counts, and quota snapshots where available. Expose structured in-process events, concise verbose summaries, and lightweight XDG/state JSON per-run diagnostics. Evidence: targeted tests cover emitted facts, log shape, and quota snapshot behavior.
- [ ] Establish a measured large-stack baseline.
  - Run representative stack-landing scenarios or fakes that reveal per-phase wall time, command/API counts, and quota deltas. Use this evidence to order optimization work instead of guessing.
- [ ] Reduce Graphite maintenance cost where measurements justify it.
  - Investigate rolling-frontier maintenance, avoiding repeated `gt restack --upstack` over the remaining stack, and replacing full topology rereads with targeted safety checks where safe.
- [ ] Reduce GitHub/`gh`/API call volume while preserving quota visibility and merge safety.
  - Investigate batched PR fact loading, avoiding redundant pre-merge and post-merge reads, and possible direct GitHub API/GraphQL merge paths only if parity with current squash-merge behavior is proven.
- [ ] Reduce local git/ref subprocess volume where measurements justify it.
  - Investigate batching branch existence/SHA reads, backup ref writes/deletes, and other per-branch local probes without weakening backup or cleanup guarantees.
- [ ] Reconcile results, documentation, and parked follow-ups.
  - Record what improved, what remained unchanged, which assumptions were disproven, and which optimization ideas are deliberately parked for future work.

## Parked

- [ ] Numeric latency or call-count SLA for large-stack landing.
- [ ] Productized telemetry retention, dashboards, aggregation, or query UI.
- [ ] Broad instrumentation rollout to unrelated SDL commands beyond shared surfaces needed by Flow land.
