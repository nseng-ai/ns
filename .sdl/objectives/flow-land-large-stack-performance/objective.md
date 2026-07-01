# Flow Land Large-Stack Performance

## Thesis

`/sdl:flow:land` should remain safe while becoming measurably faster and more predictable on large Graphite stacks. The Objective starts by adding shared telemetry for external work — Graphite commands, `gh` CLI calls, direct GitHub API interactions, and GitHub quota snapshots — then uses that evidence to reduce the largest sources of stack-landing latency and API/CLI call volume.

## Scope

- Instrument Flow land's external-call path for `gt`/Graphite operations, `gh` CLI operations, and direct GitHub API interactions.
- Capture timing, exit/status, command/API category, call counts, and GitHub quota/rate-limit snapshots through a reusable structured telemetry path.
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

- Flow land can emit structured per-run telemetry for Graphite, `gh`, and direct GitHub API interactions, including timing/call counts and quota snapshots where available.
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
- GitHub quota visibility can be captured well enough through direct API responses and/or explicit rate-limit snapshots even when some calls are made through `gh`.

Risks:

- Instrumentation could add overhead or noise if it is too chatty, especially on already slow large-stack runs.
- `gh` may obscure per-request quota details, requiring approximate quota snapshots rather than exact per-call attribution.
- Changing Graphite restack scope may expose subtle stack-shape or safety regressions if the rolling-maintenance model is not carefully validated.
- Durable diagnostics could accidentally capture sensitive PR titles, bodies, branch names, or repository details; schemas should minimize stored payloads and avoid secrets.
- Direct GitHub API or GraphQL replacement for current `gh` behavior may diverge from existing CLI semantics unless parity is tested carefully.

## Open Questions

- What exact XDG/state path and JSON schema should telemetry diagnostics use?
- Should `gh pr merge` eventually remain the merge primitive, or should a GraphQL merge mutation replace it if parity and safety can be proven?
- Which stack sizes and repository shapes should define the representative large-stack baseline?
