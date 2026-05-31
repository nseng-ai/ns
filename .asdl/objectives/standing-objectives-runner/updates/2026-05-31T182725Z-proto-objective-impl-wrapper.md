# Semantic Update: Add proto Objective implementation wrapper

## Summary

The prototype runner now has an opt-in Pi command surface. `.pi/extensions/proto.ts` is a dedicated project-local discovery adapter that delegates to `ts/packages/pi-extensions/src/proto.ts`, which registers `/proto:objective-impl`.

The wrapper accepts an explicit Objective slug/path without running Objective selection, or lists active Objectives and uses the existing active Objective picker behavior when no explicit slug is supplied. It expands `proto-objective-impl` when available and otherwise sends a self-contained fallback prompt with the prototype runner guardrails: explicit preview/confirmation, no hidden ledgers or alternate Objective stores, no canonical `/objective:*` changes, and no PR submission unless the confirmed preview includes submission.

Targeted tests in `ts/packages/pi-extensions/test/proto.test.ts` cover registration, explicit slug routing, fallback prompting, active Objective selection, changed-Objective suggestions, cancellation, no-active and non-UI paths, and command-surface separation from `objective:stack-impl`. Verification passed: `just ts-check`, `just ts-test`, and `just dprint-check`.

## Objective Impact

This completes the roadmap rows **Add the `/proto:objective-impl` Pi wrapper/picker** and **Harden the prototype with targeted tests and validation**. The prototype remains isolated: no `/objective:impl` command was added, existing `/objective:*` behavior is unchanged except for exporting the shared active Objective picker helper for reuse, and canonical Objective docs/schema/lifecycle were not changed.

The Objective now satisfies its listed completion criteria. Closure is ready for human confirmation; dogfooding remains valuable follow-up but is explicitly not required for closure.

## Follow-Ups

- Inspect the stack diff and decide whether to close the Objective as completed.
- Dogfood `/proto:objective-impl` on real bounded and standing Objectives before deciding whether to graduate, keep, or fold the prototype runner.
