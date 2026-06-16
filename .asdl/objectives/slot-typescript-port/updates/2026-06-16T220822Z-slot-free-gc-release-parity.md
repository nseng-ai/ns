# Slot free/gc release parity

## Summary

Implemented the TypeScript `slot free` and `slot gc` release slice in `ts/packages/slot`. The standalone CLI now registers both commands, supports release selectors, dry-run flows, prompt/cancel behavior, cleanup planning/execution, and JSON result envelopes for free/gc outcomes.

Added a slot-local PR gateway with a real `gh pr view` / `gh pr close` adapter and constructor-state fake. Extended the slot git gateway with force-capable local branch deletion and fake operation logging.

Validation evidence:

- `pnpm --dir ts/packages/slot run test` — 18 files / 85 tests passing.
- `pnpm --dir ts/packages/slot run check` — TypeScript check passing.

## Objective Impact

Completes the roadmap row `Port release: free and gc`. Preserved the important release contracts for selector dedup/order, dry-run no-mutation, JSON-mode `--all --yes` safety, human confirmation defaults (`free` blank declines; `gc` blank accepts), fake-only PR writes in tests, cleanup error counting, and GC PR-state classification.

A minimal implementation adaptation was required because Clinkr array options currently support string arrays only; `free --num/-n` accepts repeated string values at the CLI boundary and parses integers inside the operation while preserving the public flags and behavior.

## Follow-Ups

- Continue with the next roadmap row: Graphite subgroup parity (`slot gt up|down|free-stack` and hidden exec commands).
- Later cutover slices should keep PR-closing tests fake-driven; no live `gh pr close` validation is needed for this release slice.
