# Streaming machine contract parked for this UX slice

## Summary

Resolved the remaining machine/human emit ambiguity for this Objective: `flow submit` will stay a polished human streaming command in the CLI UX North Star slice, while the durable streaming machine-output contract is parked as follow-on work.

The rationale is product/API scope control. `objective list` is a buffered information query, so preserving `--format json` there is part of the representative rebuild and is already done. `flow submit` is side-effecting orchestration with live progress, raw subprocess transcript policy, final result output, Pi/onOutput behavior, and potential cross-command implications for `flow cp` and future streaming commands. Defining `--format jsonl` or another event protocol would require a real schema and compatibility decision, not just a renderer tweak.

Therefore, for this Objective:

- Buffered machine/human emit means clinkr renderers receive resolved caps while `--format json` continues to emit machine envelopes for buffered commands such as `objective list`.
- Streaming emit means the human stream runs through `@sdl/clinkr/stream`, with TTY in-place rendering and non-TTY/Pi transients through the host live-output path.
- Streaming machine output (JSONL/event stream, stdout/stderr split, transcript inclusion, final envelope, and Pi consumption semantics) is intentionally out of scope and tracked as parked follow-on work.

## Objective Impact

- The machine/human emit row is complete under the clarified scope: buffered machine output is preserved and human streaming emit is implemented.
- The Open Question about the durable streaming machine-output contract is resolved for this Objective by explicitly parking it.
- Completion criteria were narrowed from ambiguous "streaming machine/human emit" wording to buffered machine/human emit plus human streaming emit, avoiding accidental expansion into a protocol-design Objective.

## Follow-Ups

- Future work should define a cross-command streaming machine-output contract (`--format jsonl` or equivalent) for side-effecting flow commands before implementing machine-consumable streaming progress.
- Continue this Objective with the remaining import-boundary enforcement row and closure validation.
