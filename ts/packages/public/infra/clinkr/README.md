# @nseng-ai/clinkr

Clinkr is a structured command framework for Node.js applications. It owns route discovery, argument parsing, request-schema validation, result rendering, completion, and process exit semantics without requiring commands to read or write process-global streams.

## Invocation contract

Structured commands receive their request from argv. When `--input-json` is selected, the host provides one finite JSON text value through `jsonInput`; a standalone process adapter may instead provide the deferred `readJsonInput` adapter. Clinkr parses that text and validates it with the selected command's schema. Help, version/runtime, schema, completion, ordinary argv execution, and rejected framework-argument combinations do not acquire JSON input.

Request input is not interactive input. Commands ask for demonstrated user intent through `ClinkrInteraction`, currently confirmation and selection. The host owns those semantic operations: a terminal host may adapt them to line input, an embedded host may use its native UI, and tests should use strict fakes. Clinkr does not expose terminal streams, raw mode, key events, cursor state, or resize behavior as interaction capabilities.

Each invocation may provide:

- `output` for framework and structured text;
- `rawOutput` for exact bytes from raw commands; and
- `canEmitAnsi` to tell renderers whether terminal styling is safe.

Standalone execution defaults to process-backed adapters. Embedded and test hosts should provide invocation-scoped sinks. A custom text sink defaults to non-ANSI output unless the host explicitly enables ANSI. Commands must not infer rendering support from the physical process terminal.

Raw commands remain an explicit escape hatch. They own their argv tail and byte output and do not receive the structured JSON request contract.

## Testing

Use `runForCliTest` from `@nseng-ai/clinkr/app/testing` for in-process command scenarios. It supplies finite JSON input, strict semantic interaction fakes, invocation-local output capture, and non-ANSI rendering by default.

See [Terminal Integration Testing](./docs/terminal-integration-testing.md) when behavior depends on terminal interpretation rather than captured text.
