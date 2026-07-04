# Flow Land Large-Stack Performance

## Thesis

`/sdl:flow:land` should remain safe while becoming measurably faster and more predictable on large Graphite stacks. The Objective starts by adding shared telemetry for external work — Graphite commands, `gh` CLI calls, direct GitHub API interactions, and GitHub quota snapshots — then uses that evidence to reduce the largest sources of stack-landing latency and API/CLI call volume.

## Scope

- Instrument Flow land's external-call path for `gt`/Graphite operations, `gh` CLI operations, and direct GitHub API interactions.
- Capture timing, exit/status, command/API category, and call counts through a reusable structured telemetry path. Reserve an optional per-call quota/rate-limit field in the schema; populate it per emitter along a fidelity ladder (static cost model → opt-in `GH_DEBUG=api` header parsing → direct-API response headers) rather than treating live quota capture as a first-milestone deliverable.
- Surface telemetry as structured in-process events, human-readable verbose summaries, and lightweight local per-run JSON diagnostics under XDG/state.
- Establish representative large-stack baseline measurements before choosing optimizations.
- Use the telemetry to resolve or explicitly park the major known bottleneck classes: repeated Graphite stack maintenance/restack work, GitHub/`gh` PR-fact and merge-verification call volume including quota visibility, and local git/ref work such as branch probes and backup refs.
- Preserve Flow land's existing safety properties: strict PR/head checks, confirmation behavior, backup refs, Graphite cleanup guards, and conservative failure handling.

## Non-Goals

- No productized metrics database, dashboard, retention policy, or historical analytics system.
- No broad repo-wide observability rollout beyond the shared pieces needed by Flow land and adjacent GitHub/Graphite command gateways.
- No speculative rewrite of landing semantics without baseline evidence.
- No parallel merge execution that would weaken the serial safety model of stack landing.
- No removal of safety gates solely to reduce subprocess count.

## Completion Criteria

- Flow land can emit structured per-run telemetry for Graphite, `gh`, and direct GitHub API interactions, including timing/call counts and a reserved per-call quota field populated at whatever fidelity-ladder level is implemented (at minimum the static cost model).
- Lightweight XDG/state JSON diagnostics and concise human-readable summaries are available for large-stack investigation without requiring a durable metrics service.
- A representative large-stack baseline has been recorded and used to prioritize work.
- The Graphite maintenance/restack bottleneck class is either improved with measured evidence or parked with a documented safety/performance rationale.
- The GitHub/`gh`/API call-volume and quota-visibility bottleneck class is either improved with measured evidence or parked with a documented rationale.
- The local git/ref batching bottleneck class is either improved with measured evidence or parked with a documented rationale.
- Any remaining performance ideas are listed as parked work with enough evidence for future Objectives to resume them.

## Definition of Progress

Progress is keepable when:

- A telemetry slice adds instrumentation at the existing exec seam (`command-exec.ts` / `withCommandStreaming` and adjacent gateway boundaries) with targeted Vitest coverage, `just` passes, and landing semantics are unchanged.
- A baseline slice records measured evidence — per-phase wall time, command/API counts, static-model quota deltas — durably on the relevant roadmap row or in a Semantic Update, in a form a later run can compare against.
- An optimization slice reduces measured wall time or call counts on the baseline scenario with before/after evidence from the same stack shape, while every listed safety property stays intact and covered by tests.
- A bottleneck class is parked with a documented, evidence-backed rationale; that closure counts as progress equal to an improvement.

Do not keep changes that:

- Weaken any Flow land safety property: strict PR/head checks, confirmation behavior, backup refs, Graphite cleanup guards, or conservative failure handling.
- Enable `GH_DEBUG=api` always-on, or write request/response bodies (PR titles, bodies, diffs) into durable diagnostics.
- Introduce durable metrics services, dashboards, retention machinery, or other Non-Goals.
- Add raw wall-clock reads or timers instead of the `@sdl/core/clock` / timer seams.
- Change landing semantics or merge primitives without the baseline evidence this Objective exists to gather.

Useful evidence includes: targeted Vitest runs, before/after per-run JSON diagnostics for the same stack shape, call-count comparisons from fake-backed scenario tests, and static-model quota deltas.

## Runner Policy

This Objective is autonomy-designed for the decomposed Objective Runner (ADR 0024): a parent session drives repeated verified steps — `ns objective exec runner-begin <slug>`, one harness subagent implementing a single coherent slice, `ns objective exec runner-finish <slug>` — with an explicit judgment checkpoint between steps, per the `objective-autorun` loop and the `objective-runner-step` contract. It also remains execution-friendly for single-slice `objective-next` preview-and-confirm work; a human working the loop by hand follows the same boundaries.

Sequencing is a hard gate: telemetry before baseline, baseline before optimization. An optimization row is not actionable until recorded baseline evidence exists for its bottleneck class.

- Direct execution is allowed when: the slice is telemetry plumbing at the existing seams, fake-backed scenario measurement, documentation/evidence recording, or an optimization implementation whose bottleneck class has recorded baseline evidence. Choosing the XDG/state diagnostics path and per-run JSON schema is direct execution — record the choice as row evidence so it can be revisited.
- Steer or ask first when: a change would alter or remove any listed safety property or user-visible confirmation behavior; a real (non-fake) large-stack landing run is wanted for wall-time baseline — real runs merge actual PRs and are human-driven only; a slice would replace `gh pr merge` with a direct GraphQL merge mutation or otherwise change merge primitives; evidence contradicts a load-bearing assumption; or validation fails for reasons outside the slice.
- How work may change files and be left: feature branches only (never `main`/`master`); the step subagent creates its implementation branch off the parent's current branch via branch-context Graphite creation (`skills/branch-context/references/lifecycle.md`), not bare `gt create`; one coherent slice per step and branch; the subagent leaves every change uncommitted and `runner-finish` owns the verified, provenance-trailed commit — stacking across steps is emergent from beginning the next step on the branch the previous one produced.
- Validation before keeping or submitting work: `just` passes; targeted Vitest for touched packages; optimization slices additionally record before/after measurements on the same stack shape as roadmap row evidence.
- What will not happen unless explicitly requested: pushing, submitting, or merging anything during a runner run — the run ends with local stacked branches handed back to the normal Graphite/flow workflow; landing/merging PRs or running `/sdl:flow:land` against real stacks; publishing or external writes; edits to other Objectives; or archive/lifecycle changes to this Objective.

## Assumptions and Risks

Assumptions:

- Large-stack latency is meaningfully affected by repeated Graphite restack/refresh/delete work, repeated GitHub PR fact reads and merge verification, and per-branch local git/ref commands.
- A shared command/API telemetry layer can be added near existing Flow land and gateway boundaries without forcing a broad instrumentation rewrite. (Confirmed by the first milestone: the schema, sink, and per-run collector landed at the `withCommandStreaming`/`LandStackCommandStream` seam in seven files with landing semantics unchanged.)
- Lightweight local JSON diagnostics under XDG/state are sufficient for comparing large-stack runs and quota usage during this Objective.
- GitHub quota can be attributed without extra API calls along a fidelity ladder, verified against the `cli/cli` and `go-gh` sources: (1) a static cost model from known `gh` command shapes (`gh pr view --json` is one GraphQL query; `gh pr merge` is one PR-finder query plus one `mergePullRequest` mutation); (2) opt-in `GH_DEBUG=api` runs, where `gh` logs response headers including `X-RateLimit-*` to stderr and `httpretty`'s default sanitizers redact the auth token; (3) direct GitHub API response headers if a direct-API path lands.

Risks:

- Instrumentation could add overhead or noise if it is too chatty, especially on already slow large-stack runs.
- `GH_DEBUG=api` verbose logging also dumps request/response bodies (including PR titles and bodies) to stderr; quota-header parsing must be opt-in, must filter debug output out of existing stderr-based error and command-stream display paths, and must drop bodies before anything reaches durable diagnostics.
- Changing Graphite restack scope may expose subtle stack-shape or safety regressions if the rolling-maintenance model is not carefully validated.
- Durable diagnostics could accidentally capture sensitive PR titles, bodies, branch names, or repository details; schemas should minimize stored payloads and avoid secrets.
- Direct GitHub API or GraphQL replacement for current `gh` behavior may diverge from existing CLI semantics; the risk is bounded because the `gh` implementation is small and auditable (`gh pr merge` is a PR-finder query plus a `mergePullRequest` mutation whose `expectedHeadOid` input is exactly `--match-head-commit`), but parity still needs test coverage before any migration.

## Open Questions

- ~~What exact XDG/state path and JSON schema should telemetry diagnostics use?~~ Resolved: per-run schema v1 JSON at `$XDG_STATE_HOME/sdl/flow/land/runs/<runId>.json` (fields: `schemaVersion`, `runId`, `command`, start/finish/duration ms, `exitCode`, `totals`, `externalCalls` with minimized per-call payload). Recorded as first-milestone row evidence; revisit only if baseline work demands more fields.
- When, if ever, should a direct GraphQL `mergePullRequest` mutation replace `gh pr merge`? Parity is already confirmed from the `cli/cli` source (see Risks), and the current per-PR sequence triple-fetches overlapping PR facts (pre-merge `gh pr view` gate, `gh pr merge`'s internal PR-finder query, post-merge `gh pr view` verification); the remaining question is whether baseline evidence justifies the migration, not whether parity is achievable.
- Which stack sizes and repository shapes should define the representative large-stack baseline? Partially resolved: fake-backed count/quota baselines use linear 11-PR (preserves the existing chunk-threshold scenario) and linear 25-PR stacks. The shape for the human-driven real wall-time run remains open.
