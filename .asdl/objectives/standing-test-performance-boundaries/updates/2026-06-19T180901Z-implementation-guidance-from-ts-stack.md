# Implementation Guidance from the TypeScript Fast-Test Stack

## Summary

Reviewing the TypeScript fast-test-boundaries stack produced implementation guidance for future standing test-performance work. The stack succeeded because it was not a generic cleanup or file-shuffle: it created an explicit integration lane, then migrated one boundary family at a time while preserving default-path behavior through narrow seams and retaining real-boundary smoke coverage in integration tests.

Useful implementation lessons captured in the Objective:

- Establish or verify the integration lane before moving coverage.
- Keep PRs sliced by boundary family: runtime smoke, real Git, sqlite/Graphite metadata, worktree-status orchestration, or time/timer behavior.
- Preserve behavior confidence before claiming speed; use fakes and injected seams in the default path and retain small real-adapter integration smoke tests.
- Prove file placement and seam replacement with Vitest listing checks, boundary greps, targeted default/integration validation, and performance evidence.
- Treat repeated helper/config cleanup as a follow-up PR unless it is necessary for the semantic migration.

## Objective Impact

The standing Objective now has a dedicated `## Implementation Guidance` section with concrete PR-shaping and seam-pattern guidance from the completed TypeScript stack. The roadmap guidance now emphasizes one-boundary-family PRs, file-list checks, boundary greps, and separating broad cleanup follow-ups from semantic test-boundary migrations.

The Objective remains open as a standing Objective. This update does not complete or retire the standing work; it improves future runner behavior for repeated implementation slices.

## Follow-Ups

- Future agents should use the new guidance before implementing a test-performance slice.
- Keep the automated slow-test threshold idea parked until repeated manual sweeps show a stable enough signal for enforcement.
