# ADR 0012: Clinkr Output-Volume Discipline

## Status

Accepted

## Context

Large lists, logs, diffs, searches, inventories can eat agent's context window or make partial result look complete. Their useful bounds and continuation models differ, so generic framework abstraction chosen without repeated command evidence would likely be ceremonial or distort domain contracts.

## Decision

Output volume is command-local design responsibility until extraction evidence exists. Clinkr does not standardize generic compact mode, pagination or truncation flag set, bounded-result wrapper, continuation shape, or JSONL protocol in anticipation of need.

Commands whose results can grow materially should provide domain-appropriate filters, limits, cursors, ranges, summaries, narrow subcommands, or streaming contracts. Bounded or partial machine result must state whether it is complete, which bounds applied, how to continue or narrow request when continuation possible.

Shared Clinkr primitive considered only after either:

- at least two real commands independently need same reusable output-volume shape; or
- one severe agent-context failure shows command-local bounds and metadata cannot solve problem cleanly.

At that point evidence may justify compact serialization, shared bounds or continuation metadata, or streaming protocol. Existing command-specific streaming support is not by itself evidence for generic finite-result API.

## Consequences

- Commands can match bounds and continuation to their domains.
- Review must treat completeness and recovery metadata as part of machine-result correctness.
- Clinkr avoids carrying speculative flags and wrappers.
- Consistency stays review-driven until matching command evidence supports extraction.

## Alternatives

- **Add compact JSON by default:** rejected without demonstrated callers and because serialization size is only one output-volume problem.
- **Standardize pagination or a bounded-result wrapper now:** rejected because list pagination does not naturally model logs, diffs, trees, searches, streams.
- **Leave output volume undocumented:** rejected because context consumption and ambiguous truncation are correctness concerns for agent-facing commands.
