# Roadmap

## Work

- [ ] Add deterministic classification templates or equivalent schema guardrails.
  - Start here. The template should prefill review IDs, thread IDs, comment IDs, item pointers, and minimal valid body locators from the compact manifest. The LLM should fill only semantic fields such as disposition, summary, action summary, complexity, pre-existing flag, informational reason, and needs-reply where applicable.
  - Evidence: validator accepts a filled template; tests cover missing/extra locator fields, wrong covered-comment fields, duplicate IDs, and omitted unresolved threads.

- [ ] Design the managed run-state boundary for pr-address orchestration.
  - Decide which transient artifacts belong in the payload/session store, which can be ordinary `@file` inputs, and which should disappear behind composite helpers. Preserve the distinction between raw feedback payloads, selected-detail artifacts, classification packets, validation wrappers, and GitHub mutation payloads.
  - Evidence: future agents should not need ad-hoc `/tmp/pr-address-*.json` files for the normal validation and mutation path.

- [ ] Improve selected-detail payload ergonomics.
  - Add a batch selected-detail path or equivalent artifact-backed inspection flow so agents can inspect exactly the bodies needed for classification/execution without printing all selected bodies into the main transcript.
  - Evidence: selected bodies can be stored or referenced through managed artifacts with compact locators and summaries returned to the agent.

- [ ] Add deterministic planning support for validated classifications.
  - Provide a helper or helper output that groups actionable items into the skill’s batch order, marks approval gates, reports informational discussion comments explicitly, and emits exact identities for each batch’s review threads/comments.
  - Evidence: the plan is derived from a validated packet and can be displayed without the agent hand-assembling batch membership.

- [ ] Reduce manual GitHub mutation payload assembly.
  - Provide mutation skeletons, file-input support, or a batch checkpoint helper so resolving threads after a commit uses tested shapes rather than agent-authored JSON blobs.
  - Evidence: helpers reject malformed payloads before mutation and preserve existing canonical reply formatting.

- [ ] Add per-batch evidence/checkpoint support.
  - Capture or surface changed files, validation commands, commit SHA, addressed thread IDs, resolved/replied outcomes, and skipped items for each batch. Keep this as workflow evidence, not a hidden task database.
  - Evidence: a batch can be audited after commit and before/after GitHub resolution without relying on transcript memory.

- [ ] Add finalization support for unresolved feedback summary.
  - Provide one clear final command or finalization path that re-fetches compact feedback in payload mode, reports unresolved threads/comments/reviews, and summarizes commits and GitHub mutation results.
  - Evidence: future `pr-address` runs have an obvious end state even when a session pivots before final verification.

- [ ] Update the public `pr-address` skill and CLI reference for the improved happy path.
  - Remove or demote obsolete manual steps once helpers exist. Keep the guarantees: payload by default, classification validation before planning, user approval for cross-cutting/complex work, helper-mediated GitHub mutations, no push.
  - Evidence: the skill routes agents to deterministic helpers before asking them to write JSON or manually group batches.

- [ ] Prove the lower-orchestration happy path on a representative PR-addressing run.
  - Use a fixture, scenario test, or real PR with PR-level feedback, unresolved inline threads, discussion comments, and at least two batch types. Compare the workflow qualitatively against the 2026-06-07 PR #999 session.
  - Evidence: fewer manual JSON/scratch steps, fewer visible feedback-body dumps, validated classification, successful batch execution evidence, and final unresolved-feedback summary.

## Parked

- [ ] Explore whether a fully automatic classifier is desirable.
  - Parked because the current thesis preserves LLM semantic judgment and only hardens deterministic packet structure.

- [ ] Broaden payload artifact lifecycle/GC policy across all agent workflows.
  - Parked unless `pr-address` changes expose a directly blocking shared payload limitation.

- [ ] Build cross-harness UI affordances for pr-address planning and approval gates.
  - Parked until CLI helpers define stable machine-readable planning and finalization outputs.
