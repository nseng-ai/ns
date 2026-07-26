# ADR 0003: Plans Are Inert Markdown

## Status

Accepted

## Context

ns accepts implementation plans authored by agent harnesses, saves or attaches them for later work. Treating plan as executable TypeScript would introduce second planning language, trusted local code evaluation, portability differences across harnesses.

## Decision

Active Saved Plans and Attached Plans are inert Markdown. ns does not evaluate `.plan.ts` files, provides no trusted TypeScript recipe format.

Future executable-plan feature needs new, explicit decision covering product need, trust boundaries, cross-harness portability. Historical recipe design may inform that decision; dormant compatibility code not retained.

## Consequences

- Plan content inspectable and portable without execution.
- Plans and Branch Context extensions need no TypeScript recipe runtime.
- Saving, selecting, attaching, loading plans do not imply trusting plan content as code.

## Alternatives

- **Retain an inactive TypeScript recipe path:** rejected; dormant code keeps cost and ambiguity without supported product surface.
- **Treat the old design as compatibility policy:** rejected; stays historical design input only.
