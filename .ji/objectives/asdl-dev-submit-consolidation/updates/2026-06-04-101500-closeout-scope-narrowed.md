# Closeout Scope Narrowed for Stack Implementation

## Summary

The Objective has been reframed into final closeout mode so it is a safe target for `objective-stack-impl`. The durable submit implementation, timeout hardening, typed submit causes, and `/code:submit` Pi mirror are treated as landed consolidation evidence. The remaining non-parked work is now one explicit closeout slice: run the strict review against the current `asdl-dev submit` plus `/code:submit` mirror, fix bounded blocking findings inside the existing `asdl-dev` / `pi-extensions` boundaries, record intentional deferrals, run targeted TypeScript validation, and update or close the Objective with final evidence.

The wrapper decision is now settled for this Objective: no dedicated `/code:submit` Pi UX wrapper is required unless final review or validation uncovers a concrete regression that cannot be handled by the generic asdl-dev command adapter. This keeps the completion path from depending on speculative UX work while preserving the boundary that Pi must not own Graphite submit orchestration, output parsing, retries, or failure policy.

## Objective Impact

- `objective.md` now includes `## Definition of Progress` and `## Runner Policy` sections so a future `objective-stack-impl` run has durable execution boundaries.
- The consolidation roadmap row moves to `[x]`; strict review hardening is tracked as the remaining closeout row rather than as incomplete consolidation.
- The thin-wrapper decision row moves to `[x]` with the no-wrapper-by-default closeout decision.
- The only remaining active roadmap work is the final strict review and closeout pass.

## Follow-Ups

- Run `objective-stack-impl asdl-dev-submit-consolidation` as a one-stack closeout. The expected stack should be one review/remediation branch unless the strict review reveals a genuinely separable blocking fix.
- If the final review finds only non-blocking UX caveats, record them as accepted or parked rather than adding wrapper code.
