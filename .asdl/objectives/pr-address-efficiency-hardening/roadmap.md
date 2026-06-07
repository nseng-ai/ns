# Roadmap

## Work

- [x] Add deterministic classification templates or equivalent schema guardrails.
  - Delivered: `pr-address exec classification-template` builds a deterministic fill-in scaffold from `prepare-run` or `get-feedback` compact manifests. It prefills review IDs, thread IDs, comment IDs, item pointers, and minimal valid locator refs while leaving semantic judgment fields for the LLM/agent.
  - Evidence: `feedback_classification.py`, `classification_template.py`, scenario tests, unit tests, and CLI reference now cover filled-template validation, unfilled-template rejection, missing/extra locator fields, wrong covered-comment fields, duplicate IDs, omitted unresolved threads, and resolved-thread omission.

- [~] Design the managed run-state boundary for pr-address orchestration.
  - Decide which transient artifacts belong in the payload/session store, which can be ordinary `@file` inputs, and which should disappear behind composite helpers. Preserve the distinction between raw feedback payloads, selected-detail artifacts, classification packets, validation wrappers, and GitHub mutation payloads.
  - Progress: PR #1011 promotes generic JSON option/stdin loading into `asdl_core.clinkr.json_input` and keeps `pr-address` classification and thread-resolution helpers as direct consumers, narrowing shared infrastructure to a reusable CLI input boundary rather than embedding pr-address run state in Clinkr.
  - Evidence: local branch diff against Graphite parent `shared-pr-address-json-input-loader`; PR #1011 corroborates the same file set.
  - Remaining evidence: future agents should not need ad-hoc `/tmp/pr-address-*.json` files for the normal validation and mutation path.

- [x] Improve selected-detail payload ergonomics.
  - Delivered: `pr-address exec read-feedback-details` accepts batch JSON Pointer selections from a raw feedback payload, validates every selected body/item pointer before writing, stores selected values in a same-session `.summary.json` payload artifact, and returns compact stdout metadata with artifact pointers and character counts instead of selected body text.
  - Evidence: `read_feedback_detail.py`, `group.py`, scenario tests, CLI reference, and public skill guidance cover stdin/`--selection-json` input, body and item pointer selections, duplicate/empty/broad-pointer failures, summary artifact references, and sentinel assertions proving selected body text stays out of command output.

- [x] Add deterministic planning support for validated classifications.
  - Delivered: `pr-address exec plan-feedback` accepts the same compact manifest/classification wrapper as validation, validates internally before planning, and emits deterministic actionable batches in skill order with approval gates plus explicit informational review/review-thread/discussion-comment items.
  - Evidence: `feedback_planning.py`, `plan_feedback.py`, `group.py`, scenario tests, CLI reference, and public skill guidance cover stdin/`--payload-json` input, invalid-classification negative behavior, deterministic batch order, approval gates, exact IDs/locators/source context, informational-thread user decisions, prepare-run no-PR handling, and sentinel assertions proving raw body text stays out of plan output.

- [~] Reduce manual GitHub mutation payload assembly.
  - Provide mutation skeletons, file-input support, or a batch checkpoint helper so resolving threads after a commit uses tested shapes rather than agent-authored JSON blobs.
  - Progress: `resolve-thread-batch` accepts JSON via stdin or `--payload-json` through the shared Clinkr JSON loader, so malformed payloads fail before mutation through a tested parser path.
  - Remaining evidence: mutation skeletons or checkpoint helpers still need to remove agent-authored batch JSON shapes from the normal path while preserving canonical reply formatting.

- [ ] Add per-batch evidence/checkpoint support.
  - Capture or surface changed files, validation commands, commit SHA, addressed thread IDs, resolved/replied outcomes, and skipped items for each batch. Keep this as workflow evidence, not a hidden task database.
  - Evidence: a batch can be audited after commit and before/after GitHub resolution without relying on transcript memory.

- [ ] Add finalization support for unresolved feedback summary.
  - Provide one clear final command or finalization path that re-fetches compact feedback in payload mode, reports unresolved threads/comments/reviews, and summarizes commits and GitHub mutation results.
  - Evidence: future `pr-address` runs have an obvious end state even when a session pivots before final verification.

- [~] Update the public `pr-address` skill and CLI reference for the improved happy path.
  - Remove or demote obsolete manual steps once helpers exist. Keep the guarantees: payload by default, classification validation before planning, user approval for cross-cutting/complex work, helper-mediated GitHub mutations, no push.
  - Progress: the CLI reference documents `classification-template`, `validate-feedback-classification`, `plan-feedback`, stdin/option JSON input for classification validation, planning, and thread resolution, the deterministic template and planning contracts, and artifact-backed batch selected-detail lookup. The public skill now routes validated classifications through `plan-feedback`, prefers `read-feedback-details` for multi-body lookup, and keeps `read-feedback-detail` as a one-off inline/debug helper.
  - Remaining evidence: the main public skill should continue to shed manual mutation/finalization instructions as checkpoint and finalization helpers land.

- [ ] Prove the lower-orchestration happy path on a representative PR-addressing run.
  - Use a fixture, scenario test, or real PR with PR-level feedback, unresolved inline threads, discussion comments, and at least two batch types. Compare the workflow qualitatively against the 2026-06-07 PR #999 session.
  - Evidence: the Completion Criteria are met on the representative run.

## Parked

- [ ] Explore whether a fully automatic classifier is desirable.
  - Parked because the current thesis preserves LLM semantic judgment and only hardens deterministic packet structure.

- [ ] Broaden payload artifact lifecycle/GC policy across all agent workflows.
  - Parked unless `pr-address` changes expose a directly blocking shared payload limitation.

- [ ] Build cross-harness UI affordances for pr-address planning and approval gates.
  - Parked until CLI helpers define stable machine-readable planning and finalization outputs.
