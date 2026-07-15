# Herdr Dispatch Parity Completes the Local Stack

## Summary

The third local stack branch implements prompt dispatch, refreshed-trunk dispatch, workspace plan dispatch, explicit caller-workspace focused-tab plan dispatch, and open-branch workflows under the fixed `/ns:herdr:*` command names.

The implementation retains ns ownership of Graphite, Branch Memory, Saved Plans, Branch Context, and slot checkout. Herdr workspace/tab creation returns opaque pane IDs used for command launch; caller-tab dispatch explicitly passes `--focus`. Real-adapter tests pin CLI argv and response parsing, including malformed JSON, missing IDs, and launch failures, while scenario tests cover dry-run, explicit/inferred selection, confirmation refusal, completions, and gateway failures.

## Objective Impact

Roadmap row 3 and the three-branch local stack are complete. The parity checklist reconciles all selected registrations. Herdr package tests and full `just` pass. A single complete-diff TypeScript style review produced no accepted findings; its only warning misclassified discriminated unions, which correctly remain `type` aliases under the style guide.

## Follow-Ups

Objective/slot/branch metadata reporting remains intentionally parked until the installed Herdr CLI exposes `workspace report-metadata`. Event subscriptions, raw socket support, layouts/plugins, a generic multiplexer abstraction, and a public generic Herdr workspace-summary command remain outside the completed scope.
