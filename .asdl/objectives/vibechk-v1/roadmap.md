# Roadmap

## Work

- [x] Scaffold the standalone `packages/vibechk` workspace package and `vibechk` CLI with help/version behavior.
- [ ] Define bundle store layout, run-id generation, schema models, prefix resolution, and `runs` listing.
- [ ] Implement git workdir preconditions, provenance capture, diff capture, local `vibechk/<run-id>` branch creation, and switch-back behavior.
- [ ] Implement the runner abstraction plus `claude`, `codex`, and `pi` subprocess/RPC adapters, incremental raw transcript/event writing, and normalized metric parsing with graceful partial-run handling.
- [ ] Implement `vibechk run` end-to-end against fake-driven test seams.
- [ ] Implement single-run and comparison Markdown renderers for `show` and `diff`.
- [ ] Implement GitHub PR reference resolution, fence replacement, branch-on-remote validation, and `publish` through `gh`.
- [ ] Add fake-driven unit and scenario coverage for the canonical comparison flow, single-run flow, runner selection and per-runner metric normalization, failure modes, no-change runs, report rendering, publish idempotency, and JSON/tabular listings.
- [ ] Run a real GitHub PR publish smoke and record closure evidence for insertion, replacement, and no-op republish behavior.
- [ ] Run the final repo validation suite after the remaining v1 feature work.

## Parked

- [ ] Import bundle stubs from a published PR report.
- [ ] Verify published evidence or detect tampering.
- [ ] Add N>1 sampling or cohort comparison.
- [ ] Add runners beyond `claude`, `codex`, and `pi`.
- [ ] Add Pi-native SDK/session-forking/resource-manifest evaluation or a Pi extension frontend.
- [ ] Add quality signals beyond human review of the captured branch diff.
- [ ] Decide whether to update or close GitHub issue #434 as Objective bookkeeping.
