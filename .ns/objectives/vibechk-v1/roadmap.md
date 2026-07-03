# Roadmap

## Work

State note: the already-implemented surface now lives in TypeScript as `@ji/vibechk` at `ts/packages/tools/vibechk/`. The TypeScript cutover (owned by the now-closed `vibechk-typescript-port` Objective) is complete and the Python package is retired, so the remaining v1 product rows (`publish`, `codex`, `pi`, real publish smoke) are unblocked and proceed in TypeScript.

- [x] Scaffold the standalone `vibechk` workspace package and `vibechk` CLI with help/version/runtime behavior.
- [x] Implement a thin `run -> show -> diff` walking skeleton that runs the same plan in two prepared workdirs and renders comparison evidence (one real runner, minimal bundle metadata, no `publish`, some metrics `null`).
- [x] Add the bundle store and run-id support: store root resolution, 8-character ids, plan snapshot, raw transcript/artifacts, basic metadata, diff patch, and prefix resolution for `show`/`diff`.
- [x] Implement the minimal runner contract plus the first real subprocess adapter (`claude`) and a `FakeRunner` seam; full `codex`/`pi` parity deferred.
- [x] Implement git workdir preconditions, provenance capture, diff capture, local `vibechk/<run-id>` branch creation, and switch-back behavior needed by real runs.
- [x] Make single-run and comparison Markdown reports useful enough to paste into a PR manually, including branch refs, plan, metrics or `null`s, and config differences.
- [x] Harden the store surface: collision handling, complete prefix-resolution errors, XDG/$VIBECHK_HOME/--store precedence, and `vibechk runs` tabular/JSON listing.
- [ ] Add remaining runner adapters and normalization coverage for `codex` and `pi` (`claude` done).
- [ ] Implement GitHub PR reference resolution, fence replacement, branch-on-remote validation, and `publish` through `gh`.
- [~] Expand fake-driven unit and scenario coverage for the canonical comparison flow, single-run flow, runner selection and per-runner metric normalization, failure modes, no-change runs, and report rendering; publish idempotency and `codex`/`pi` normalization coverage remain.
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
