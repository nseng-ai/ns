# Roaster Cutover Recorded

## Summary

Recorded Roaster / review workflows as a completed TypeScript-default capability in the umbrella migration Objective.

The child `.asdl/objectives/roaster-typescript-port/` Objective is closed and records that the TypeScript `@asdl/roaster` package replaced the intended CI PR-diff findings slice: `roaster review list` / `run`, hidden publication `exec` commands, the GitHub Actions workflow, source-shim installation, and non-ADR documentation closeout are all TypeScript-backed. The green real-PR workflow run `27610014374` preceded Python deletion, `packages/roaster` is deleted, and TS plugin mounting remains parked outside the completed standalone-CLI scope.

## Objective Impact

The umbrella migration ledger no longer treats Roaster as unstarted. Roaster is now marked TS-default/completed, the repeated capability-subobjective roadmap row includes its completion evidence, and the planned order now advances to Vibe check / `vibechk` as the next default unstarted capability unless new evidence changes the sequence.

This does not close the umbrella migration Objective: `vibechk`, `aretro`, the migration-debt ledger, and final migration cleanup remain open.

## Follow-Ups

- Run `objective-next` on the umbrella Objective to choose between the next default capability slice (`vibechk`) and any more urgent migration-debt or cleanup work.
- Leave TS plugin mounting for Roaster parked unless a separate product decision revives plugin mounting as an active requirement.
- Continue to record only true umbrella-wide migration compromises in `migration-debt.md`; Roaster's standalone-only plugin decision is currently a durable scope decision, not migration debt.
