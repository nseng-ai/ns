<!--
Canonical `body.md` shape for the objective subsystem. This is the stable
spine of an objective — title, status, durable context, goals, completion
criteria, and the recipe for future sessions.

For architectural redesigns and other multi-PR work:
- use `## Description` for durable context and scope, not running status
- use `## Goals` for the value or outcome this work should deliver
- use `## Completion Criteria` to describe the end state
- keep `Status:` terse and categorical rather than a progress narrative
- the `Status:` line is for human reading only; canonical "open"/"closed" state is signaled by whether the objective lives in active storage or the closed archive via `objective close` / `objective reopen`, not by this prose

The roadmap lives in the sibling `roadmap.md`; durable findings live in the
sibling `notes.md`. Do not fold either back into this file.

Delete this HTML comment before use.
-->

# Objective Title

Status: in progress

## Description

A high-level description of this objective. A reader should be able to
quickly understand the scope, context, and content of what this objective
is setting out to do.

## Goals

- Outcome or capability this work should deliver
- Why this work matters / what better state it creates

## Completion Criteria

- [ ] Concrete, re-checkable end-state criterion
- [ ] Concrete, re-checkable end-state criterion

## How to Make Progress

1. How to pick the next numbered roadmap entry or smallest landable change
2. What current behavior, tests, or help output to inspect before editing
3. What to update after landing the work
