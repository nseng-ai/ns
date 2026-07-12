# Cmux Reshape Slice 5 Executed

## Summary

Slice 5 renamed the dispatch Branch Memory namespace from `ccc-dispatch` to
`cmux-dispatch`, renamed the temporary staging prefix, and replaced
`NS_CCC_SIDEBAR_MODEL` with `NS_CMUX_SIDEBAR_MODEL` across runtime code,
fixtures, tests, and documentation. The touched capability test was renamed
from `ccc.test.ts` to `cmux.test.ts`.

## Objective Impact

Roadmap Slice 5 is complete on local branch `cmux-reshape/ripple-renames`.
Root `just` passed and the bounded live-source grep found no remaining
`ccc-dispatch` or `NS_CCC_` references. The change is intentionally breaking
and carries no compatibility aliases or migration.

Compatibility callouts for later review material:

- Prompts staged before the namespace rename but not yet picked up may be
  orphaned; these prompts are transient and this outcome is accepted.
- `NS_CMUX_SIDEBAR_MODEL` replaces `NS_CCC_SIDEBAR_MODEL` without an alias.

## Follow-Ups

Proceed sequentially to Slice 6 on `cmux-reshape/glossary-and-docs`. Before
that slice can commit, obtain the required human disposition for
`Project-local adapter`.
