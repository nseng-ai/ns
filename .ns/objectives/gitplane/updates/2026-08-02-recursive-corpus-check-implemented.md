# Gitplane Recursive Corpus Check Implemented

## Summary

The local implementation completes the recursive corpus-check slice. Gitplane now loads a source-only configuration, resolves the selected artifact root relative to the invocation, inventories the working tree without following symlinks, discovers all nested attempted boundaries before corpus reads, and applies the fixed deterministic finding vocabulary to generic and optionally registered classified artifacts.

The Clinkr `gitplane check` command now returns source/root/count/finding data for completed checks, distinguishes error findings from operational failure, and does not invoke storage or Git history. The implementation adds the real artifact gateway and config loader, focused core check rules, and fake-driven unit, scenario, integration, and gateway coverage.

## Objective Impact

The recursive discovery, optional kind registration, and `gitplane check` roadmap row is complete in the post-landing Objective state. This preserves the all-or-nothing discovery risk boundary: nested markers short-circuit content reads, while configuration and source failures return no partial corpus result.

Package typecheck and the focused Gitplane suite pass with 88 tests. Repository integration (275 tests), isolated (17 tests), TypeScript style-guard (168 tests), and the full `just` gate (including 6,224 default tests and the Objective edge sweep) also pass; lint reports one unrelated pre-existing Herdr warning.

## Follow-Ups

- Begin the next ordered slice: SQLite control storage, optional target projection, and `gitplane doctor`.
- Preserve the corpus-check boundary when reconciliation later consumes richer lineage and transition semantics.
