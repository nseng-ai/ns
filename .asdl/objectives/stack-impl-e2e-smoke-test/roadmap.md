# Roadmap

## Work

- [ ] PR 1: `stack-impl-e2e-smoke-test/seed-fixture` creates `docs/pi/stack-impl-e2e-smoke-test.md` with the smoke-test purpose, planned branch list, and first-slice validation notes; runs at least `just dprint-check`; writes a Semantic Update; commits with `gt modify`; and calls `stack_impl_slice_done` with a handoff draft.
- [ ] PR 2: `stack-impl-e2e-smoke-test/extend-fixture` resumes from the previous handoff, appends a status/resume evidence section to the fixture document, runs `/stack-impl-status` or restarts `/stack-impl` to show the first incomplete branch moved forward, runs at least `just dprint-check`, writes a Semantic Update, commits with `gt modify`, and calls `stack_impl_slice_done`.
- [ ] PR 3: `stack-impl-e2e-smoke-test/finalize-fixture` appends the final acceptance checklist to the fixture document, verifies the stacked branch contains all prior sections, checks final `/stack-impl-status` output, runs `just` unless a human accepts narrower validation, writes a final Semantic Update, commits with `gt modify`, and calls `stack_impl_slice_done`.

## Parked

- [ ] Turn this smoke workflow into a deterministic automated harness if Pi exposes a suitable non-interactive integration-test seam.
- [ ] Add mechanical closeout verification to `/stack-impl` before treating this smoke Objective as an unattended gate.
- [ ] Define a cleanup recipe for smoke branches and Branch Memory artifacts after repeated e2e runs.
