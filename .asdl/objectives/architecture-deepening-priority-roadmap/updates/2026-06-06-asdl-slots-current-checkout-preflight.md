# asdl-slots Current Checkout Preflight Completed

## Summary

The `asdl-slots` checkout planning-time mutation fix is now represented as landed Objective state. The local branch diff against Graphite parent `slot-operation-recovery-messaging-helper` changes `plan_current_checkout` so current-worktree redirect planning is pure, simulates the post-redirect inventory for allocation checks, and moves redirect execution into the checkout lifecycle after pool-full and branch-in-use preflight failures have been handled.

Evidence includes updated unit tests proving `plan_current_checkout` does not call checkout or detach while planning, plus checkout scenario coverage proving pool-full and no-slot failures preserve the caller's current branch without redirect side effects.

## Objective Impact

The first roadmap row, **Fix `asdl-slots` checkout planning-time mutation**, is marked shipped. This de-risks the audit's concrete correctness bug without coupling it to the larger release/free/gc workflow deepening, which remains active as a separate roadmap row.

## Follow-Ups

- Continue with the next active `asdl-slots` row only after rereading the release/free/gc audit evidence and current lifecycle code.
- Keep the release/free/gc workflow work separate unless new evidence shows it should be split into a child Objective.
