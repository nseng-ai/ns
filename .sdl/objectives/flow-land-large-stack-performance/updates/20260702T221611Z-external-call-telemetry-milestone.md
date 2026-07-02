# External-call telemetry milestone complete

## Summary

The first roadmap row landed across two stacked local branches
(`impl-flow-land-external-call-telemetry`, `flow-land-per-run-diagnostics`; no
PRs yet). Flow land now has a shared external-call telemetry event schema
(transport, category, operation, elapsed ms, status, exit/killed, and a
reserved quota-estimate field populated from the static cost model of known
`gh` command shapes) with a sink wired through the existing
`withCommandStreaming`/`LandStackCommandStream` exec seam, a per-run collector
writing schema v1 JSON diagnostics to
`$XDG_STATE_HOME/sdl/flow/land/runs/<runId>.json`, and a concise `--verbose`
telemetry summary in `sdl flow land`.

Decisions worth keeping: the XDG/state path and schema v1 shape above; durable
per-call entries deliberately omit command display strings, PR titles/bodies,
branch names, and request/response bodies (the privacy risk in
`objective.md`); direct GitHub API emitter wiring is deferred until a direct
API path exists — the schema already carries a `github-api` transport, so no
schema change is expected when one lands.

Validation: targeted Vitest on the telemetry and land-stack helper suites plus
full `just` (including the complete TS test suite) passed on both slices. The
`just ts-test-typescript-style-guard` extra lane fails on a pre-existing
`@sdl/objective` core/runner topology cycle unrelated to this Objective's
changes.

## Objective Impact

Completes the first milestone and confirms the assumption that telemetry could
be added at existing seams without a broad instrumentation rewrite. Resolves
the XDG-path/schema open question. Unblocks the sequencing gate: baseline
measurement work is now actionable; optimization rows remain gated on recorded
baseline evidence.

## Follow-Ups

- Establish the measured large-stack baseline (fake-backed counts/quota deltas
  are direct execution; real large-stack wall-time runs are human-driven only).
- Wire the `github-api` transport emitter if/when a direct API path lands.
