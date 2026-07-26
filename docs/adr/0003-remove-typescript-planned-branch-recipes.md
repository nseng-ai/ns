# ADR 0003: Plans Are Inert Markdown

## Status

Accepted

## Context

ns accepts implementation plans authored by agent harnesses and saves or attaches them for later work. Treating a plan as executable TypeScript would introduce a second planning language, trusted local code evaluation, and portability differences across harnesses.

## Decision

Active Saved Plans and Attached Plans are inert Markdown. ns does not evaluate `.plan.ts` files or provide a trusted TypeScript recipe format.

A future executable-plan feature requires a new, explicit decision covering product need, trust boundaries, and cross-harness portability. Historical recipe design may inform that decision, but dormant compatibility code is not retained.

## Consequences

- Plan content is inspectable and portable without execution.
- The Plans and Branch Context extensions need no TypeScript recipe runtime.
- Saving, selecting, attaching, and loading plans do not imply trusting plan content as code.

## Alternatives

- **Retain an inactive TypeScript recipe path:** rejected because dormant code preserves cost and ambiguity without a supported product surface.
- **Treat the old design as compatibility policy:** rejected; it remains historical design input only.
