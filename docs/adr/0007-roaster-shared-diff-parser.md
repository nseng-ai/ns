# ADR 0007: Shared Diff Parsing with `@pierre/diffs`

## Status

Accepted

## Context

Reviews extension needs full Git diff parsing plus inline-comment hunk geometry. Owning custom Git patch grammar duplicates specialized parser domain; creates inconsistent semantics between those two uses.

## Decision

`@nseng-ai/reviews` uses published `@pierre/diffs` package root for full-diff parsing and inline hunk geometry. Reviews keeps own DTOs and workflow contracts, adapting Pierre's parsed metadata at boundary.

Reviews prefers upstream parser semantics over recreating historical edge cases. Own Git invocation forces canonical `a/` and `b/` prefixes instead of general patch normalizer. No parser source copy, no deep-import of private package internals.

## Consequences

- One upstream parser owns patch grammar and hunk geometry.
- Some semantic details follow Pierre, including its rename/copy and path representations.
- Direct parser callers must provide conventional Git-format diffs.
- Root-export dependency weight accepted; if it becomes material, package boundary should be revisited with Pierre rather than parser forked.

## Alternatives

- **Custom parsers:** rejected because Reviews should not own Git patch grammar.
- **Preserve every historical edge semantic:** rejected because it recreates parser complexity behind adapter.
- **Deep import or source copy:** rejected because it couples ns to private layout or creates maintained fork.
- **User-selectable parser:** rejected because this is internal implementation choice.
