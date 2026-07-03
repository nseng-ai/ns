# Canonical helper consolidation

## Summary

Completed the behavior-preserving cmux helper consolidation slice. The cmux command suite now reuses `command-runtime.ts` for command formatting, output tailing, and shell quoting; uses a cmux-local `primitives.ts` for targeted shared record/string/error/result helpers; delegates successful slot-checkout envelope parsing through `parseMachineEnvelopeData`; and imports pure branch-slug helpers from the top-level `branch-slug.ts`.

## Objective Impact

The first four roadmap rows are complete. The primitives ownership open question is resolved for this objective: a cmux-local `cmux/primitives.ts` is the appropriate near-term home, while package-wide guard consolidation remains parked. Evidence: local branch diff against `refactor-cmux-extension-consolidation`; `just ts-check`, `just ts-test`, and `git diff --check` passed.

## Follow-Ups

- Continue with the `planned-branch-output` contract slice.
- The Objective remains open: planned-output contract, shared slot orchestrator, and final naming normalization are still outstanding.
