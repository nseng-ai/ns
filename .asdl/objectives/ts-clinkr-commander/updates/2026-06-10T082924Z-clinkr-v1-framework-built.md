# @asdl/clinkr v1 framework built

## Summary

Roadmap row 1 is complete: `@asdl/clinkr` exists at `ts/packages/clinkr` implementing the full settled v1 design — `ClinkrExit` union with throw-based `ClinkrFailure`, `ClinkrGroup<TContext>` with the injectable `ClinkrIo` seam and `run(argv, {context, io?})` → exit code, schema-first parameter generation from snake_case Zod schemas, `--format human|json` dispatch with the Python-parity envelope, `renderHuman`/`legacyMachine` registration fields, eager `--json-schema` via `z.toJSONSchema`, hidden subgroups, generated help, and the `@asdl/clinkr/testing` subpath export (`runForTest`, `createCaptureIo`, `parseEnvelope`, `machineEnvelopeSchema`).

Evidence: built on branch `clinkr-v1-framework`; clinkr unit suite covers each completion-criterion feature, including envelope byte parity with Python `json.dumps(..., indent=2)` (`ensure_ascii` included) and the never-enveloped usage-error channel; full TS workspace typecheck and test suite passed. Commander `^14` (resolved 14.0.3) and zod `^4.4.3` are the package's dependencies; commander is new to the workspace.

## Objective Impact

- Roadmap row "Build `@asdl/clinkr` v1" is `[x]` with evidence.
- Assumption "commander can host schema-first generation" is de-risked: the generation pattern fit commander's programmatic API. Zod stayed the sole required/default enforcer (commander declares all generated options/arguments optional), which makes the usage-error channel uniform and `--json-schema` eagerness fall out for free.
- Parity behaviors verified empirically and pinned by tests:
  - Python clinkr usage errors print raw to stderr with exit 2 and are never enveloped, even under `--format json` — TS copies this for both commander parse errors and zod validation errors.
  - A bare group invocation prints help to stdout and exits 0 (click behavior). Commander natively errors this to stderr/exit 1, so clinkr group nodes carry an explicit help-printing action. Like click, there is no `help` subcommand — `<cli> help` is a usage error (exit 2).
  - Crashes (non-`ClinkrFailure` throws) propagate raw out of `run()` with nothing written to the envelope channel.

Migration-relevant API findings for the `plans` migration (feed-forward per roadmap row 3):

- v1 `ClinkrGroup` has no `--version` support; `plans` and `planned-branch` expose `--version`/`-V`. Add a small version option on the root group when the first migration needs it.
- `legacyMachine` bodies are serialized indent-2 with `ensure_ascii` (same serializer as the envelope). If a legacy consumer expects compact JSON bytes, that needs either a serializer knob at migration time or confirmation that consumers parse rather than byte-compare.
- Commander camelCases option attributes; clinkr maps back to snake_case keys via `Option.attributeName()` — migrated CLIs never see commander names.

## Follow-Ups

- Roadmap row 2 (scenario-pin the four CLIs) is the next slice; rows were otherwise unchanged.
- `--version` support lands with the `plans` migration when needed (see findings above).
