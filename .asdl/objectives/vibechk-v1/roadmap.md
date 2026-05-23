# Roadmap

## Work

- [ ] Scaffold the standalone `packages/vibechk` workspace package and `vibechk` CLI with help/version behavior.
- [ ] Define bundle store layout, run-id generation, schema models, prefix resolution, and `runs` listing.
- [ ] Implement git workdir preconditions, provenance capture, diff capture, local `vibechk/<run-id>` branch creation, and switch-back behavior.
- [ ] Implement the runner abstraction, `claude-code` subprocess runner, incremental transcript writing, and metric parsing with graceful partial-run handling.
- [ ] Implement `vibechk run` end-to-end against fake-driven test seams.
- [ ] Implement single-run and comparison Markdown renderers for `show` and `diff`.
- [ ] Implement GitHub PR reference resolution, fence replacement, branch-on-remote validation, and `publish` through `gh`.
- [ ] Add fake-driven unit and scenario coverage for the canonical comparison flow, single-run flow, failure modes, no-change runs, report rendering, publish idempotency, and JSON/tabular listings.
- [ ] Run a real GitHub PR publish smoke and record closure evidence for insertion, replacement, and no-op republish behavior.
- [ ] Wire the package into the workspace and run the repo validation suite.

## Parked

- [ ] Import bundle stubs from a published PR report.
- [ ] Verify published evidence or detect tampering.
- [ ] Add N>1 sampling or cohort comparison.
- [ ] Add runners beyond `claude-code`.
- [ ] Add quality signals beyond human review of the captured branch diff.
- [ ] Decide whether to update or close GitHub issue #434 as Objective bookkeeping.
