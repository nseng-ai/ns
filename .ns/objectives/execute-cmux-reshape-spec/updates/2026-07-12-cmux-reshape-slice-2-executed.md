# Cmux Reshape Slice 2 Executed

## Summary

Slice 2 renamed the capability package from `@nseng-ai/ccc` at
`capabilities/ccc` to `@nseng-ai/cmux` at `capabilities/cmux`, renamed its
namesake feature subpackage from `src/cmux` to `src/core`, and replaced
`CCC_PACKAGE_IDENTITY` with `CMUX_PACKAGE_IDENTITY`. The exact package-name
substitution was bounded by a fresh live-source inventory.

Re-enumeration found additional in-scope package-name consumers beyond the
plan's examples, including package self-references, public-package metadata,
the architecture-topology example, and the Pi-host glossary. These were rename
consumers within Slice 2's stated intent rather than new semantic scope.

## Objective Impact

Roadmap Slice 2 is complete on local branch `cmux-reshape/rename-package`.
Root `just` passed, the live-source stale-package-name grep found no remaining
`@nseng-ai/ccc` references outside immutable history, and the substitution diff
was checked against the re-enumerated target set. The drift assumption remains
active but was handled by the required re-enumeration procedure; no stop
condition or guard-semantics change was encountered.

## Follow-Ups

Proceed sequentially to Slice 3 on
`cmux-reshape/rehome-bin-as-extension`. Bare CCC vocabulary and command surfaces
remain intentionally deferred to their later slices.
