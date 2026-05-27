# Pi Wrapper Landed

## Summary

The TypeScript Pi display wrapper for `objective gt stacks` landed as a focused slice.

Evidence: branch `objective-gt-stacks-rewrite/pi-wrapper` adds `/objective-gt-stacks` to the existing Objective Pi extension. The wrapper waits for idle, runs `objective gt stacks --format markdown` by default, runs `objective gt stacks --help` for help, rejects unsupported arguments before execution, uses a 30-second timeout, and presents success, failure, rejection, startup-failure, killed/timeout, truncation, and stream-size details through `objective-gt-stacks-output` display messages.

Verification: `cd ts/packages/pi-extensions && bun test test/objective.test.ts` passed; `cd ts/packages/pi-extensions && bun run check` passed; `cd ts/packages/pi-extensions && bun test` passed.

## Objective Impact

The Pi wrapper test and implementation roadmap rows are complete. The existing Objective Pi extension remains the right locality: `/objective-gt-stacks` follows the `/objective-list` display-wrapper pattern and stays a presentation adapter over the Python CLI rather than parsing or interpreting the projection.

The Pi wrapper duplication risk is accepted for v1. A shared display-wrapper helper remains parked unless future display commands make the duplication deeper.

## Follow-Ups

- Re-check the roadmap for remaining Python CLI hardening rows, especially data-read failure envelopes and any explicit projection-level archive-root edge coverage still needed before closure.
- Run broader readiness validation such as `just check` once remaining hardening is complete or intentionally deferred.
