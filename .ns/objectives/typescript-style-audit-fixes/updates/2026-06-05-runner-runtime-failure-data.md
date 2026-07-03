# Runner Runtime Failure Data Slice Completed

## Summary

Runner subagent runtime parsing/read failures now flow through discriminated returned data instead of parser exceptions at the runtime/process boundaries. `subagent-runtime.ts` added typed config/result parse and read outcomes for valid/loaded, invalid, missing, and read-error cases. `RuntimeResultParseError` and the throw-based runtime result parser path were removed.

The process dispatcher now depends on `RuntimeResultReadResult` and branches on read outcomes when resolving closed subagents. Invalid/read-error runtime sinks preserve the existing diagnostic prefixes: attempted terminal tools still become `protocol-error`, while invalid/read-error sinks without a terminal attempt become `error`. The runtime extension now branches on `RuntimeConfigReadResult` for config startup and still writes the same `config-error` runtime result shape/prefix for malformed config files.

## Objective Impact

This completes the runner runtime parsing portion of the failure-as-data roadmap row. Malformed runtime result JSON, invalid runtime result shapes, malformed runtime config JSON, invalid runtime config shapes, missing result sinks, and non-ENOENT read errors are represented as typed data at the relevant boundaries. Existing public runner result statuses and diagnostics were preserved for valid captures, runtime startup failures, protocol errors, missing result sinks, nonzero child exits, and final-text mode.

Tests were updated so malformed runtime result JSON is asserted as returned failure data rather than a rejected promise. New process tests cover invalid runtime sink data after a terminal attempt (`protocol-error`) and without a terminal attempt (`error`). A runtime extension test covers malformed config data producing a structured `config-error` runtime result.

Validation run:

- `bun test ts/packages/pi-extensions/test/runner-subagent-terminal-tools.test.ts ts/packages/pi-extensions/test/runner-subagent-process.test.ts`
- `bun run --cwd ts/packages/pi-extensions check`
- `bun run --cwd ts/packages/pi-extensions test`
- `just ts-check`
- `just ts-test`
- `just dprint-check`

Focused scans found no remaining `RuntimeResultParseError`, `throw new RuntimeResultParseError`, old throw-based runtime parse helper names, or malformed-runtime-result `rejects.toThrow` assertions in the runner subagent source/tests.

## Follow-Ups

The broader failure-as-data row remains partially open for the separate `handoff`/`objective` parsing slice. `RuntimeConfigValidationError` intentionally remains for caller-supplied terminal tool definition/schema validation before spawn, where `dispatchRunnerSubagentProcess` catches it and returns a structured `error` result. Runtime result write failures also remain throw-based at the terminal tool execution/write boundary so Pi observes tool execution failure after the runtime attempts to persist a structured write-error result.
