# asdl-slots Release Execution Consolidated

## Summary

The `asdl-slots` release/free/gc workflow row is now represented as shipped Objective state. A real presentation-neutral `asdl_slots.lifecycle.release` module now owns release workflow previews and execution orchestration for explicit frees and GC sweeps.

`slot free` now calls the lifecycle release workflow for plan, cleanup preview, free execution, and cleanup execution, while keeping selector resolution, confirmation prompts, rendering, JSON/Clinkr result mapping, and cleanup error exit conversion in the CLI layer. `slot gc` now calls the lifecycle release workflow for dry-run preview, no-candidate/cancelled outcome conversion, forced execution, and confirmed execution, while preserving request-shape validation, prompt behavior, renderer output, and JSON stdout/stderr responsibilities in the CLI layer.

Verification: focused lifecycle tests passed, affected `slot free`/`slot gc` CLI scenario tests passed, full `asdl-slots` tests passed, and the full `just` gate passed.

## Objective Impact

The roadmap row **Deepen `asdl-slots` release/free/gc workflow** moves from `[~]` to `[x]`. The earlier preview-surface slice established presentation-neutral planning and cleanup previews; this slice completes the follow-up execution-flow consolidation and keeps cleanup accounting, dirty/operation rechecks, PR lookup behavior, partial-failure semantics, and cleanup failure exits covered by lifecycle and scenario tests.

The CLI intentionally remains responsible for presentation and request concerns: selector resolution, confirmation prompts, rendering, JSON/Clinkr result models, and conversion of lifecycle reports into CLI exits.

## Follow-Ups

- Scenario-test demotion remains optional cleanup rather than required Objective scope; existing scenarios continue to protect CLI contract behavior.
- Continue the broader Architecture Deepening Priority Roadmap with the remaining active rows.
