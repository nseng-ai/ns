# ADR 0042: Build Pi Explore Subagents on the Runner-Subagent Substrate

## Status

Renumbered from ADR 0023 on 2026-07-20 to resolve a duplicate number (0023 stays with the earlier-created subpackage-kinds ADR); content otherwise unchanged.

Accepted; the separate model-visible `explore` tool consequence is superseded by ADR 0043 (formerly numbered 0032). The runner-subagent substrate decision remains current.

## Context

The `pi-parallel-subagents` objective needs Claude-Code-style parallel read-only
explore subagents in Pi: a model-invocable fan-out tool, a cheap-model explorer whose
read-only posture is enforced by tool allowlist (no `bash`/`edit`/`write`), a bounded
result preview in parent context with full findings on disk, and live per-task
progress rendering.

At least five existing implementations cover this ground: `tintinweb/pi-subagents`,
`nicobailon/pi-subagents`, `gotgenes/pi-packages` (`pi-subagents`),
`mjakl/pi-subagent`, and oh-my-pi's in-core task system, plus Pi's first-party
`examples/extensions/subagent/` reference. A 2026-07-02 spike surveyed all of them
against fresh heads alongside this repo's own runner-subagent substrate
(`ts/packages/local/pi-tools`: the `dispatchRunnerSubagent` subprocess primitive and
thermo-council's bounded worker pool). Full per-candidate rationale lives in
`.sdl/objectives/pi-parallel-subagents/updates/2026-07-02-adopt-vs-build-decision.md`.

The governing priorities were low maintenance burden and control over prompt
engineering and UX; speed-to-capability was explicitly not a criterion.

## Decision

Build the explore fan-out capability in-house as a thin orchestration layer over the
unchanged `dispatchRunnerSubagent` primitive, living in `ts/packages/local/pi-tools`
alongside `runner-subagents` and surfaced through the standard 3-line
`.pi/extensions/` discovery shim. Children remain hermetic `pi --mode json -p`
subprocesses with `--tools` allowlists; parallelism runs inside the tool's own
`execute` (generalizing thermo-council's `runCouncilSeatsWithConcurrencyLimit`
pattern), since the neutral `@sdl/pi` `ToolDefinition` surface deliberately has no
`executionMode` or `renderResult`.

Third-party extensions are used as design references only — in particular oh-my-pi's
read-only allowlist gate, newline-snapped bounded-preview-plus-pointer result
contract, and per-task progress rows, and the first-party example's tool schema and
parent-facing prompt language.

## Consequences

- SDL owns the tool description, scout output contract, preview economy, and progress
  rendering outright — the exact surfaces every surveyed candidate keeps code-owned
  and fork-only.
- No new upstream to track: every adoptable candidate is a bus-factor-one project
  releasing fast against Pi versions that do not match this repo's pinned
  `@earendil-works/*` 0.79.1 (with a local pi-ai patch). The substrate's Pi coupling
  stays mediated through `@sdl/pi/runtime/*`.
- The subsumption question inverts: rather than a third party absorbing
  `dispatchRunnerSubagent` and thermo-council, the explore tool consumes the
  primitive, and thermo-council consolidation becomes an optional later
  generalization onto the shared orchestration layer.
- The cost is owning the new orchestration code (estimated at a few hundred lines
  plus an explorer agent definition) and continuing to own churn at the Pi SDK
  boundary ourselves.
- Explorers lose shell-based recon (`git log`, `git blame`) because `bash` is
  excluded from the allowlist; if recon quality suffers, the remedy is a vetted
  read-only command tool, not re-admitting `bash`.

## Rejected Alternatives

- **Adopt `tintinweb/pi-subagents`:** closest third-party capability fit (hard
  session-level allowlists, Haiku explorer default, preview + on-disk JSONL, polished
  fleet UI), but in-process coupling to Pi internals on an unversioned `>=0.74`
  floor, a kitchen-sink surface (cron, memory, worktrees, RPC, management TUI), and a
  fork-only result contract and rendering.
- **Adopt `nicobailon/pi-subagents`:** most feature-complete and architecturally
  aligned (subprocess, process-enforced allowlists, structured output), but a ~34k
  LOC opinionated delegation framework dev-pinned to Pi 0.74.0, with fork-only tool
  description and rendering and no cheap read-only explorer default.
- **Fork `gotgenes/pi-subagents`:** the cleanest codebase and closest testing culture
  (fake-driven, DI seams), but 18 breaking major versions in ~5.5 weeks by a single
  author, in-process architecture, and no batch fan-out or structured result contract
  — the fork would still need the central pieces built.
- **Fork `mjakl/pi-subagent`:** lean and subprocess-based, but missing the
  preview+pointer result economy and structured results entirely, and coupled to Pi
  via hand-parsed CLI argv; dormant since 2026-06-18.
- **Adopt oh-my-pi:** the best design reference, but a hard fork of Pi itself
  (renamed package namespace, Rust/native dependencies, ~5,000 commits/month) —
  adopting it means replacing the agent, not extending it.
