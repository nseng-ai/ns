# Put Session Library in asdl-core

## Summary

Reusable session parsing and analysis should live in `asdl-core`, not inside `aretro`. The `aretro` package remains the standalone/plugin CLI boundary for `aretro`, while the provider-neutral session source/query interfaces, normalized parser models, Pi JSONL adapter, and deterministic analysis helpers are shared core library code.

The first implementation still targets Pi JSONL only. The boundary should leave room for later Claude, Codex, or other session providers, but those adapters stay out of scope for this slice.

## Objective Impact

This shifts roadmap PR 2 from an `aretro`-local parser to a reusable `asdl-core` session library. Later `aretro exec collect-evidence` work should consume that shared library rather than owning provider-specific parsing or aggregation logic.

The assumptions and risks now explicitly track both the value of a shared core boundary and the risk of over-generalizing before non-Pi providers exist.

## Follow-Ups

- Implement PR 2 in `asdl-core` first: provider-neutral source/query models, normalized session facts, Pi JSONL adapter/parser, and unit coverage.
- Keep `aretro` thin when `collect-evidence` is added; it should orchestrate CLI context and render the evidence envelope.
- Do not implement Claude, Codex, or other non-Pi adapters until the Pi steelthread proves the shared contract.
