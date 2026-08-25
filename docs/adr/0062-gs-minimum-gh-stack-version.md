# ADR 0062: GS Minimum gh-stack Version

## Status

Accepted

Supersedes ADR 0061 only where that decision requires every GS lifecycle workflow to support exactly gh-stack v0.1.0 and forbids compatibility decisions based on version ordering. ADR 0061's GS ownership, public-command boundary, observed-postcondition rule, failure taxonomy, forward recovery, Flow independence, and optional Slot composition remain accepted.

## Context

ADR 0061 pinned the first GS workflows to the only gh-stack release that ns had tested, v0.1.0. That protected the initial design from unexamined pre-1.0 drift, but an exact global pin also blocks later installed releases before a workflow can inspect its own supported inputs and verify its own postconditions. Autobranch already treats gh-stack output and exit status as evidence rather than proof and halts on any unproved state.

## Decision

GS uses gh-stack v0.1.0 as its minimum tested lifecycle baseline. A workflow may accept a stable numeric gh-stack version at or above v0.1.0 when it uses the same public commands and output contract, independently verifies every required postcondition, and preserves observed state on an unproved result. Each implemented workflow must state its actual accepted range. A workflow may remain pinned more narrowly when its evidence or recovery model requires that restriction.

Version ordering does not prove behavioral compatibility. It only permits the workflow to run its existing guarded contract. Malformed versions, prerelease versions, and versions below v0.1.0 are refused unless later evidence establishes a different rule.

## Consequences

- Autobranch accepts stable numeric gh-stack releases greater than or equal to v0.1.0.
- Restack-resolve remains pinned to v0.1.0 until its implementation and tests adopt the wider rule.
- A later gh-stack release can still produce a known partial or ambiguous failure. GS halts and preserves evidence instead of attempting automatic rollback.
