# ADR 0007: Shared Diff Parsing with `@pierre/diffs`

## Status

Accepted

## Context

The Reviews extension needs both full Git diff parsing and inline-comment hunk geometry. Owning custom Git patch grammar duplicates a specialized parser domain and creates inconsistent semantics between those two uses.

## Decision

`@nseng-ai/reviews` uses the published `@pierre/diffs` package root for full-diff parsing and inline hunk geometry. Reviews retains its own DTOs and workflow contracts, adapting Pierre's parsed metadata at the boundary.

Reviews prefers upstream parser semantics over recreating historical edge cases. Its own Git invocation forces canonical `a/` and `b/` prefixes rather than adding a general patch normalizer. It does not copy parser source or deep-import private package internals.

## Consequences

- One upstream parser owns patch grammar and hunk geometry.
- Some semantic details follow Pierre, including its rename/copy and path representations.
- Direct parser callers must provide conventional Git-format diffs.
- Root-export dependency weight is accepted; if it becomes material, the package boundary should be revisited with Pierre rather than by forking a parser.

## Alternatives

- **Custom parsers:** rejected because Reviews should not own Git patch grammar.
- **Preserve every historical edge semantic:** rejected because doing so recreates the parser complexity behind the adapter.
- **Deep import or source copy:** rejected because it couples ns to private layout or creates a maintained fork.
- **User-selectable parser:** rejected because this is an internal implementation choice.
