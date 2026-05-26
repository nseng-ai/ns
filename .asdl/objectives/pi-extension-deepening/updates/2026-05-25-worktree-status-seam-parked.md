# Worktree Status Seam Parked

## Summary

Candidate 7 has been decided as a parked/rejected internal-seam slice.

- Do not refactor `worktree-status.ts` into new observation/watchers, status-gathering, or rendering seams now.
- Keep the current status command local/vibecoded.
- The current command may continue using already-proven shared helpers for presentation, Branch Memory CLI access, and Machine-envelope parsing, but no new `worktree-status`-specific architecture should be introduced without a concrete future need.
- Decision rationale: any status feature shipped to users should likely have a different product shape rather than inheriting this project-local implementation.

Verification: Objective tracking-only update; no TypeScript code changed.

## Objective Impact

Candidate 7 is complete as a disposition. This narrows the Objective by avoiding investment in a local status workflow that is not intended to become the foundation for a user-facing status product.

The decision preserves the deletion-test guardrail: existing shared helpers remain valid where they already remove repeated policy, but the mixed `worktree-status.ts` implementation is accepted as local workflow glue rather than a module-deepening target.

## Follow-Ups

- Continue with Candidate 8, choose `/submit` promotion, or decide Candidate 2 depending on the next desired slice.
- Revisit `worktree-status` internals only for a concrete local bug or a future product surface, and add characterization tests before changing watcher/session behavior.
- Do not use the current `worktree-status` implementation as the default architecture for a future user-shipped status feature.
