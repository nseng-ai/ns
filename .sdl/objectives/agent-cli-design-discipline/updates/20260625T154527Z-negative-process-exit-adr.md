# Semantic Update: Negative Process-Exit ADR

## Summary

ADR 0013 records and implements the Clinkr negative process-exit default: rendered
`negative(...)` now exits process `1` by default, emits JSON envelopes with
`status: "negative"` / `exitCode: 1`, and sends human/markdown negative messages
to stderr. The redundant `--shell-exit-code`, `shellExitCode`, `shellNegative`,
and `shell-negative` split is removed.

The runtime migration kept `failure(...)` / `ClinkrFailure` and `usage_error` at
exit `2`. One audited harmless no-op result, empty `brmem export` selection, was
converted to `ok(...)` with explicit empty data and human output.

## Objective Impact

The negative-default contested decision is resolved. `sdl-cli-design` can teach
the practical Clinkr taxonomy as `ok=0`, `negative=1`, and
`failure/usage_error=2`, with the machine envelope as the detailed semantic
surface. The remaining ADR queue is confirmation/danger tiers.

## Follow-Ups

- Reflect ADR 0013 in the future `sdl-cli-design` skill.
- Carry forward any future ambiguous empty/no-op command semantics as explicit
  command-contract questions rather than using `negative(...)` as harmless
  emptiness.
- Proceed to the confirmation/danger-tier ADR next.
