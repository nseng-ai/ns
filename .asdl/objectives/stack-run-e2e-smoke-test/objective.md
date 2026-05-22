# Stack Run End-to-End Smoke Test

## Thesis

`/stack-run` needs a live, low-risk Objective that exercises the complete supervised workflow without depending on production code changes. This Objective is that smoke test: a three-slice docs/fixture-only stack that still requires the real stack-run control plane to work end to end.

A successful run should prove that a canonical stack plan can be accepted, slice branches can be created or resumed in order, pointer ledgers and completion handoffs can be stored in Branch Memory, fresh Pi sessions can receive useful kickoff context, Objective updates can be made on each slice, and `/stack-status` can explain progress across the stack.

The work intentionally changes only documentation fixture content. The value is not the final document; the value is the observable workflow evidence generated while moving through the stack.

## Scope

In scope:

- Run this Objective with `/stack-run` using objective slug `stack-run-e2e-smoke-test` and these planned branches, in order:
  - `stack-run-e2e-smoke-test/seed-fixture`
  - `stack-run-e2e-smoke-test/extend-fixture`
  - `stack-run-e2e-smoke-test/finalize-fixture`
- Keep implementation changes docs/fixture-only, preferably centered on `docs/pi/stack-run-e2e-smoke-test.md` plus this Objective's Semantic Updates.
- Make each slice produce a real commit with `gt modify` after validation; do not use placeholder commits.
- Make each slice update this Objective with a Semantic Update before calling `stack_slice_done`.
- Use `stack_slice_done` to queue closeout and store the agent-drafted handoff for each completed slice.
- Exercise resume/status behavior by invoking `/stack-status` or restarting `/stack-run` after at least one slice closeout.
- Treat the final branch as the acceptance point for the whole smoke stack: all fixture-document sections, Objective updates, Branch Memory handoffs, ledgers, and status output should be inspectable from there.

Out of scope:

- Production Python or TypeScript behavior changes.
- New automated test harnesses for Pi, Graphite, or Branch Memory.
- Submitting PRs unless a human explicitly wants the smoke branches reviewed.
- Cleaning up all created branches or Branch Memory artifacts as part of this Objective; cleanup can be manual after the e2e run is inspected.

## Non-Goals

- Do not use this Objective to improve `/stack-run` itself. If the run exposes a defect, record it and create a separate follow-up Objective or bugfix branch.
- Do not add hidden state, registries, or machine-readable workflow metadata beyond normal Objective Markdown and stack-run's existing Branch Memory artifacts.
- Do not broaden the stack into meaningful product documentation work. The docs are fixtures for validating workflow mechanics.
- Do not rely on chat history as evidence. Durable evidence should live in commits, Objective updates, Branch Memory ledgers, Branch Memory handoffs, and status output.

## Completion Criteria

- `/stack-run` accepts a stack plan for `stack-run-e2e-smoke-test` and stores or reuses the canonical Branch Memory plan in namespace `stack-plans` with key `stack-run-e2e-smoke-test.md`.
- The three planned branches exist in the intended Graphite order, each with a real docs/fixture commit created by `gt modify`.
- Each slice branch has a Branch Memory `stack-runs` pointer ledger that references the canonical plan branch, namespace, key, and matching plan hash.
- Each slice branch has a derived `session-artifacts` handoff stored by the `stack_slice_done` closeout path.
- This Objective has at least one Semantic Update per completed slice, capturing material workflow evidence rather than ceremonial progress.
- `docs/pi/stack-run-e2e-smoke-test.md` exists at the top of the stack and contains the seed, extension, and finalization sections produced by the three slices.
- `/stack-status stack-run-e2e-smoke-test.md` or an equivalent inferred status run reports no incomplete branch after final closeout and does not report plan hash drift or invalid ledgers.
- Slice validation evidence is recorded in handoffs. Early docs-only slices should at least run `just dprint-check`; the final slice should run `just` unless a human explicitly accepts a narrower validation command.

## Assumptions and Risks

Assumptions:

- A docs/fixture-only stack is enough to exercise the stack-run control plane because `/stack-run` coordinates branches, sessions, ledgers, closeout, handoffs, and status independently of the semantic code changes made by the agent.
- The local environment running this Objective has the project-local Pi stack-run extension, `brmem`, `gt`, and the repo validation tools installed and usable.
- The chosen branch names are isolated enough that reruns will not collide with active product work.
- Branch Memory artifacts are acceptable durable evidence for this smoke test because stack-run's contract already uses `stack-plans`, `stack-runs`, and `session-artifacts`.

Risks:

- Rerunning the smoke test without cleanup can encounter existing branches, canonical plan content, ledgers, or handoffs. Mitigation: inspect `/stack-status`, use explicit replacement only when intended, or choose a fresh Objective/branch suffix for a new run.
- A trusted `stack_slice_done` call can still record inaccurate validation or handoff content. Mitigation: keep the test supervised and require concise validation evidence in each handoff.
- Graphite metadata can drift if branches are manually restacked during the smoke run. Mitigation: treat the planned branch order as the expected order and record any drift as a stack-run finding rather than silently repairing it.
- The smoke stack may pass while deeper implementation bugs remain because it avoids production code changes. Mitigation: use this Objective as an e2e workflow acceptance test, not as a substitute for unit or integration tests of extension internals.

## Open Questions

Resolved for this Objective:

- The smoke stack is docs/fixture-only and uses three planned branches.
- The fixture target is `docs/pi/stack-run-e2e-smoke-test.md` unless a slice discovers a better docs-only location.
- The test is successful only if closeout handoffs and `/stack-status` evidence show that stack-run advanced through all three slices.

Still open during execution:

- Whether the completed smoke branches should be submitted for review, left local for inspection, or deleted after the workflow evidence is captured.
