# Roadmap

## Work

- [x] Add Flow land external-call telemetry for Graphite, `gh`, and GitHub API interactions.
  - First milestone. Capture timing, status, category, and call counts. Reserve an optional per-call quota field in the event schema and populate it from the static cost model of known `gh` command shapes; live quota capture (`GH_DEBUG=api` header parsing, direct-API headers) is a later fidelity level, not part of this milestone. Expose structured in-process events, concise verbose summaries, and lightweight XDG/state JSON per-run diagnostics. Evidence: targeted tests cover emitted facts, log shape, and the reserved quota field.
  - Done via local branch evidence (`impl-flow-land-external-call-telemetry`, `flow-land-per-run-diagnostics`): event schema and sink in `ts/packages/capabilities/flow/src/land/stack/external-call-telemetry.ts` wired through `withCommandStreaming`/`LandStackCommandStream`; per-run diagnostics collector in `external-call-telemetry-run.ts` writing schema v1 JSON to `$XDG_STATE_HOME/sdl/flow/land/runs/<runId>.json` (fallback `~/.local/state/...`); `--verbose` telemetry summary in `sdl flow land`. Durable entries persist only transport/category/operation/elapsed/status/exit/quota estimate — no command strings, PR titles/bodies, or branch names. Static quota model covers Graphite and `gh`; the schema supports a `github-api` transport whose emitter wiring is deferred until a direct API path exists. Targeted Vitest plus full `just` passed on both slices.
- [~] Establish a measured large-stack baseline.
  - Run representative stack-landing scenarios: fakes reveal command/API counts and quota deltas via the static cost model; real large-stack runs are required for per-phase wall time. Add opt-in `GH_DEBUG=api` quota-header parsing here only if the static cost model proves insufficient. Use this evidence to order optimization work instead of guessing.
  - Policy: fake-backed measurement is direct execution; real large-stack landing runs merge actual PRs and are human-driven only — prepare the instrumentation and ask.
  - Original fake-backed call-count/quota baseline recorded (local branch `flow-land-large-baseline/fake-scenarios`), preserving pre-optimization evidence for comparison: linear-11 — 205 total calls (git 97, graphite 54, github-cli 54), static quota 65 GraphQL / 65 rate-limit cost; linear-25 — 457 total calls (git 209, graphite 124, github-cli 124), static quota 149 GraphQL / 149 rate-limit cost. Per-PR ratios ≈ git 8.3, graphite 5, `gh` 5, GraphQL quota 6. Remaining: per-phase wall time from a real large-stack run — human-driven only.
- [ ] Reduce Graphite maintenance cost where measurements justify it.
  - Investigate rolling-frontier maintenance, avoiding repeated `gt restack --upstack` over the remaining stack, and replacing full topology rereads with targeted safety checks where safe.
- [ ] Reduce GitHub/`gh`/API call volume while preserving quota visibility and merge safety.
  - Investigate batched PR fact loading and avoiding redundant reads: the current per-PR sequence fetches overlapping PR facts three times (pre-merge `gh pr view` gate, `gh pr merge`'s internal PR-finder query, post-merge `gh pr view` verification). A direct GraphQL merge path is a known-viable option — `cli/cli` source confirms `gh pr merge` is one finder query plus a `mergePullRequest` mutation with `expectedHeadOid` matching `--match-head-commit` — but adopt it only if baseline evidence justifies it, with parity test coverage.
  - Policy: read-path batching/dedup is direct execution once baseline evidence exists; replacing the merge primitive is steer-first regardless of evidence.
- [~] Reduce local git/ref subprocess volume where measurements justify it.
  - Investigate batching branch existence/SHA reads, backup ref writes/deletes, and other per-branch local probes without weakening backup or cleanup guarantees.
  - First optimization landed via local branch `flow-land-large-stack-performance/gh-pr-view-cache`: Flow land preflight now reuses the existing repo-discovery local-branch tip inventory for branch presence/SHA checks instead of issuing per-landing-branch `show-ref`/`rev-parse` subprocesses. Fake-backed counts improved from linear-11 205→183 total calls (git 97→75) and linear-25 457→407 total calls (git 209→159), with strict merge-time PR/head verification and backup/cleanup gates retained. Follow-up candidates remain backup ref snapshotting/deletion and post-restack guard reads.
- [ ] Reconcile results, documentation, and parked follow-ups.
  - Record what improved, what remained unchanged, which assumptions were disproven, and which optimization ideas are deliberately parked for future work.

## Parked

- [ ] Numeric latency or call-count SLA for large-stack landing.
- [ ] Productized telemetry retention, dashboards, aggregation, or query UI.
- [ ] Broad instrumentation rollout to unrelated SDL commands beyond shared surfaces needed by Flow land.
