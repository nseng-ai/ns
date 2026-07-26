# ADR 0012: Clinkr Output-Volume Discipline

## Status

Accepted

## Context

Large lists, logs, diffs, searches, and inventories can consume an agent's context window or make a partial result look complete. Their useful bounds and continuation models differ, so a generic framework abstraction chosen without repeated command evidence would likely be ceremonial or distort domain contracts.

## Decision

Output volume is a command-local design responsibility until extraction evidence exists. Clinkr does not standardize a generic compact mode, pagination or truncation flag set, bounded-result wrapper, continuation shape, or JSONL protocol merely in anticipation of need.

Commands whose results can grow materially should provide domain-appropriate filters, limits, cursors, ranges, summaries, narrow subcommands, or streaming contracts. A bounded or partial machine result must state whether it is complete, which bounds were applied, and how to continue or narrow the request when continuation is possible.

A shared Clinkr primitive is considered only after either:

- at least two real commands independently need the same reusable output-volume shape; or
- one severe agent-context failure demonstrates that command-local bounds and metadata cannot solve the problem cleanly.

At that point the evidence may justify compact serialization, shared bounds or continuation metadata, or a streaming protocol. Existing command-specific streaming support is not by itself evidence for a generic finite-result API.

## Consequences

- Commands can match bounds and continuation to their domains.
- Review must treat completeness and recovery metadata as part of machine-result correctness.
- Clinkr avoids carrying speculative flags and wrappers.
- Consistency remains review-driven until matching command evidence supports extraction.

## Alternatives

- **Add compact JSON by default:** rejected without demonstrated callers and because serialization size is only one output-volume problem.
- **Standardize pagination or a bounded-result wrapper now:** rejected because list pagination does not naturally model logs, diffs, trees, searches, and streams.
- **Leave output volume undocumented:** rejected because context consumption and ambiguous truncation are correctness concerns for agent-facing commands.
