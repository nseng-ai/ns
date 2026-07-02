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

## Assumptions and Risks

Assumptions:

- Large-stack latency is meaningfully affected by repeated Graphite restack/refresh/delete work, repeated GitHub PR fact reads and merge verification, and per-branch local git/ref commands.
- A shared command/API telemetry layer can be added near existing Flow land and gateway boundaries without forcing a broad instrumentation rewrite.
- Lightweight local JSON diagnostics under XDG/state are sufficient for comparing large-stack runs and quota usage during this Objective.
- GitHub quota can be attributed without extra API calls along a fidelity ladder, verified against the `cli/cli` and `go-gh` sources: (1) a static cost model from known `gh` command shapes (`gh pr view --json` is one GraphQL query; `gh pr merge` is one PR-finder query plus one `mergePullRequest` mutation); (2) opt-in `GH_DEBUG=api` runs, where `gh` logs response headers including `X-RateLimit-*` to stderr and `httpretty`'s default sanitizers redact the auth token; (3) direct GitHub API response headers if a direct-API path lands.

Risks:

- Instrumentation could add overhead or noise if it is too chatty, especially on already slow large-stack runs.
- `GH_DEBUG=api` verbose logging also dumps request/response bodies (including PR titles and bodies) to stderr; quota-header parsing must be opt-in, must filter debug output out of existing stderr-based error and command-stream display paths, and must drop bodies before anything reaches durable diagnostics.
- Changing Graphite restack scope may expose subtle stack-shape or safety regressions if the rolling-maintenance model is not carefully validated.
- Durable diagnostics could accidentally capture sensitive PR titles, bodies, branch names, or repository details; schemas should minimize stored payloads and avoid secrets.
- Direct GitHub API or GraphQL replacement for current `gh` behavior may diverge from existing CLI semantics; the risk is bounded because the `gh` implementation is small and auditable (`gh pr merge` is a PR-finder query plus a `mergePullRequest` mutation whose `expectedHeadOid` input is exactly `--match-head-commit`), but parity still needs test coverage before any migration.

## Open Questions

- What exact XDG/state path and JSON schema should telemetry diagnostics use?
- When, if ever, should a direct GraphQL `mergePullRequest` mutation replace `gh pr merge`? Parity is already confirmed from the `cli/cli` source (see Risks), and the current per-PR sequence triple-fetches overlapping PR facts (pre-merge `gh pr view` gate, `gh pr merge`'s internal PR-finder query, post-merge `gh pr view` verification); the remaining question is whether baseline evidence justifies the migration, not whether parity is achievable.
- Which stack sizes and repository shapes should define the representative large-stack baseline?
