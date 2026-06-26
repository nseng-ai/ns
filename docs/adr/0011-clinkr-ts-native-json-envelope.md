# ADR 0011: Clinkr TS-Native JSON Envelope

## Status

Accepted

## Context

ADR 0010 keeps process exit codes coarse and puts detailed failure semantics in
Clinkr's machine envelope. The existing TypeScript Clinkr JSON output still
carries Python-parity assumptions: snake_case envelope keys, comments about
byte-identical JSON serialization, usage errors that bypass JSON envelopes, and
`--json-schema` output that describes only input and success payload schemas.

Agent-era correctness needs one machine contract for success, semantic negative
results, command failures, and usage/invocation errors when a command is running
in JSON mode. TypeScript Clinkr is private/unreleased in this repository, so its
machine contract can reset cleanly instead of preserving transitional Python
compatibility.

## Decision

TypeScript Clinkr owns a TS/JS-native JSON contract. Python byte parity is not
load-bearing for `--format json`, and the current reset is a clean break for
internal consumers.

The JSON machine envelope is a camelCase discriminated union with:

- `status`: one of `ok`, `negative`, `failure`, or `usageError`;
- `exitCode`: the shell-correlating numeric code;
- optional `errorType`, `message`, and `data` where the variant needs them.

Failure-like variants use stable `errorType`, concise `message`, and optional
structured `data`. `shell-negative` remains an internal process-behavior variant
but maps to JSON status `negative`.

Rendered commands in JSON mode should envelope schema/argument validation errors
as `usageError` exits. Human and Markdown modes continue to use human-oriented
usage prose. Commander-level parse errors may be enveloped only when Clinkr can
safely determine JSON mode from argv without parsing Commander human output or
forking Commander internals.

`--json-schema` should expose both the command input schema, the success payload
schema, and the actual machine envelope schema. The schema document itself uses
camelCase keys.

Compact JSON, JSONL/streaming output, pagination/truncation/output-volume
primitives, and a full command-specific error taxonomy are deferred.

## Consequences

- Internal tests, fixtures, and consumers must update from snake_case envelope
  fields to the new camelCase discriminated contract.
- Agents get a single machine-readable shape for normal outcomes and JSON-mode
  usage errors.
- Structured failure data can be preserved through returned and thrown Clinkr
  failures.
- Human output stays separate from the machine envelope.
- Historical docs may still mention the old snake_case envelope as prior state,
  but runtime JSON should not emit dual keys.

## Rejected Alternatives

- **Preserve Python parity.** It keeps old fixtures stable but makes TypeScript
  Clinkr inherit constraints that are no longer product requirements.
- **Emit both snake_case and camelCase keys.** Transitional dual keys create an
  ambiguous contract and let stale consumers survive silently.
- **Add a legacy envelope flag.** The repository is private/unreleased, so a flag
  would add maintenance cost without a public migration need.
- **Do compact JSON, JSONL, or output-volume primitives now.** Those are useful
  follow-ups, but this slice is the core envelope and schema reset.
