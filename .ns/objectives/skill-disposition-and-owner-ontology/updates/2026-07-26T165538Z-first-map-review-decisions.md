# First Destination Map Review Decisions

## Summary

The first review of the complete 58-skill destination map resolved several disposition and
ownership decisions. `brmem` and `slots` are approved exceptions to family nesting and live
as top-level incubating product skills. The handoff umbrella and step skills use their own
`handoff` family rather than sharing a continuity family with Branch Memory.

`code-graphite`, `changelog-update`, and `project-setup` are internal. `pr-make-accountable`
is the first public skill. Proposed ADR 0046 and the Objective narrative now permit narrow
top-level product-skill exceptions while retaining family nesting as the normal shape.

## Objective Impact

The destination map remains complete at 58 unique identities and paths, with a revised
distribution of one public, 23 incubating, and 34 internal skills. The first public verdict
makes dependency closure concrete: `pr-make-accountable` currently describes
`ns flow submit` as required when an interview produces an approved code change. Before the
atomic cutover can claim public closure, that integration must become optional or be removed
from the required workflow so the public skill requires only public-supported surfaces such
as Git and GitHub CLI.

The ADR-plus-map approval gate remains open. These review decisions approve the named
classifications and structural exceptions, not the complete map or migration.

## Follow-Ups

- Continue reviewing the remaining proposed classifications and family vocabulary, then
  explicitly approve ADR 0046 and the complete map together.
- During the approved cutover, make `pr-make-accountable` operationally independent of
  incubating/internal surfaces and verify its public support boundary.
- Preserve flat harness identities for `brmem`, `slots`, handoff skills, and all other moved
  skills despite the canonical path changes.
