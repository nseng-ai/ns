# Seed Fixture Created

## Summary

The first planned branch, `stack-impl-e2e-smoke-test/seed-fixture`, now seeds `docs/pi/stack-impl-e2e-smoke-test.md` with the smoke-test purpose, canonical plan location, planned branch list, and first-slice validation/closeout expectations.

The canonical stack plan was present in Branch Memory before slice work began at namespace `stack-plans`, key `stack-impl-e2e-smoke-test.md`, branch `rename-stack-run-to-stack-impl-pi-extension`. The slice stayed docs/fixture-only apart from Objective tracking.

Verification for this slice: `just dprint-check` passed.

## Objective Impact

This gives the smoke Objective its first real docs fixture change and Objective Semantic Update, proving that the stack can move from accepted plan to a concrete Graphite slice without product-code changes. The roadmap now marks PR 1 complete; the `stack_impl_slice_done` closeout handoff remains the durable evidence for the final closeout step outside the git diff.

The remaining slices should use this seeded document as the base for resume/status evidence and final acceptance evidence.

## Follow-Ups

- PR 2 should resume from the seed handoff, append status/resume evidence, and run `/stack-impl-status` or restart `/stack-impl` to show progress moved forward.
- PR 3 should verify the top branch contains all fixture sections and should run `just` unless a human accepts narrower validation.
