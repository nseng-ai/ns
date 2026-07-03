# asdl-slots Checkout Planning Is Pure

## Summary

`slot checkout --current` now separates pure current-checkout planning from current-worktree redirect execution. Pool-full and branch-in-use preflight failures return before the caller worktree is redirected, while successful checkouts still redirect the caller worktree as part of lifecycle execution.

Verification: targeted checkout planning and checkout CLI scenario tests passed, and the full `just` gate passed.

## Objective Impact

This ships the first `asdl-slots` priority row: checkout planning-time mutation is fixed, and regression evidence covers the user-visible failure mode where failed preflight must not leave the caller worktree redirected.

The release/free/gc workflow row remains separate and unstarted; this slice deliberately avoided combining it with the checkout mutation fix.

## Follow-Ups

- Continue with the next roadmap row, `Deepen asdl-slots release/free/gc workflow`, unless new evidence suggests reprioritization.
- Consider rollback semantics for failures after redirect execution as a separate behavior decision only if implementation evidence shows it is needed; it is not part of this shipped planning-preflight fix.
