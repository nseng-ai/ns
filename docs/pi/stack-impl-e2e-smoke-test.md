# Stack Impl E2E Smoke Test Fixture

This file is a deliberately low-stakes docs fixture for Objective `stack-impl-e2e-smoke-test`. It exists so `/stack-impl` can exercise the real supervised workflow while the code change itself stays easy to inspect.

The value of this document is the workflow evidence generated around it: the canonical stack plan, Graphite branches, Branch Memory ledgers, closeout handoffs, Objective Semantic Updates, and `/stack-impl-status` output.

## Planned Stack

Canonical plan location:

- Branch Memory namespace: `stack-plans`
- Branch Memory key: `stack-impl-e2e-smoke-test.md`
- Plan branch: `rename-stack-run-to-stack-impl-pi-extension`

Planned branches, in order:

1. `stack-impl-e2e-smoke-test/seed-fixture`
2. `stack-impl-e2e-smoke-test/extend-fixture`
3. `stack-impl-e2e-smoke-test/finalize-fixture`

## Seed Fixture Slice

Branch: `stack-impl-e2e-smoke-test/seed-fixture`

This first slice seeds the fixture document and records the branch list that later slices will extend. It should remain docs/fixture-only apart from the Objective update under `.asdl/objectives/stack-impl-e2e-smoke-test/`.

Seed-slice validation and closeout expectations:

- Run `just dprint-check` after writing the fixture and Objective update.
- Amend the slice branch with `gt modify` so the branch contains a real docs/fixture commit.
- Call `stack_impl_slice_done` with validation evidence and a concise handoff draft.

Later slices should append status/resume evidence and final acceptance evidence below this seeded section rather than replacing it.
