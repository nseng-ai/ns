# Roadmap

## Work

- [x] Scaffold the standalone `packages/vibechk` workspace package and `vibechk` CLI with help/version behavior.
- [x] Implement a thin `run -> show -> diff` walking skeleton that can run the same plan in two prepared workdirs and render comparison evidence, even with one real runner, minimal bundle metadata, no `publish`, and some metrics as `null`.
- [x] Add only the bundle store and run-id support required by the walking skeleton: store root resolution, 8-character ids, plan snapshot, raw transcript/artifacts, basic metadata, diff patch, and enough prefix resolution for `show`/`diff`.
- [x] Implement the minimal runner contract plus the first real subprocess adapter and a `FakeRunner` seam; defer full `claude`/`codex`/`pi` parity until the loop works.
- [x] Implement git workdir preconditions, provenance capture, diff capture, local `vibechk/<run-id>` branch creation, and switch-back behavior needed by real runs.
- [x] Make single-run and comparison Markdown reports useful enough to paste into a PR manually, including branch refs, plan, metrics or `null`s, and config differences.
- [~] Harden the store surface after the loop works: collision handling, complete prefix-resolution errors, XDG/$VIBECHK_HOME/--store precedence, and `vibechk runs` tabular/JSON listing.
- [ ] Add remaining runner adapters and normalization coverage for `claude`, `codex`, and `pi`.
- [ ] Implement GitHub PR reference resolution, fence replacement, branch-on-remote validation, and `publish` through `gh`.
- [~] Expand fake-driven unit and scenario coverage for the canonical comparison flow, single-run flow, runner selection and per-runner metric normalization, failure modes, no-change runs, report rendering, publish idempotency, and JSON/tabular listings.
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
