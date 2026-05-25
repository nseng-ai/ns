# Land Stack Test Interface Cleanup

## Summary

Candidate 8 has been decided and completed as a small test Interface cleanup.

- Broad `/land-stack` production refactor is parked: keep the external command Interface and the existing internal stage Modules.
- `stack-facts`, `pr-facts`, `worktrees`, `landing-plan`, `landing-operations`, `command-stream`, and `presentation` already pass the deletion test, so splitting them further now would add churn without proven depth.
- Retargeted `land-stack.test.ts` helper coverage to import from canonical internal Modules instead of importing those helpers through the top-level `land-stack.ts` Module.
- Removed the top-level `land-stack.ts` re-exports that existed only to support tests.
- Preserved the full scenario tests and command-order assertions because they remain safety evidence for Graphite/GitHub landing behavior.

Verification: targeted `land-stack` tests passed; `bun run --cwd ts check` passed; `bun run --cwd ts test` passed.

## Objective Impact

Candidate 8 is complete. The Objective records `/land-stack` as already deep enough for now: the current friction was a shallow test-only export Interface, not missing production Modules.

This keeps the deletion-test guardrail sharp. The cleanup reduces the public-looking top-level surface without weakening landing choreography coverage, and it avoids deriving a broad Graphite/GitHub Adapter or command-runtime Module from `/land-stack` alone.

## Follow-Ups

- Continue with Candidate 2 command-runtime triage or `/submit` promotion.
- Revisit `/land-stack` internals only when landing behavior changes or another concrete consumer proves a repeated seam.
- Do not remove conservative scenario coverage unless a replacement test Interface preserves the same landing safety invariants.
