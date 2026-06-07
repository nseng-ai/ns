# Roadmap

## Work

- [x] Add deterministic classification templates or equivalent schema guardrails.
  - Policy: Keep LLM work focused on semantic judgment; generate review IDs, thread IDs, comment IDs, item pointers, and minimal valid locators deterministically.
  - Evidence: `pr-address exec classification-template`, validation/scenario coverage, and CLI reference updates cover filled-template validation, unfilled-template rejection, malformed locators, wrong covered-comment fields, duplicate IDs, omitted unresolved threads, and resolved-thread omission.

- [x] Add cost-aware classifier model routing.
  - Policy: Use a cheap/fast runner model pattern only for ordinary bounded classification, and require deterministic validation plus escalation to a stronger/default model for schema failures, omissions, ambiguity, or complex cross-file reasoning.
  - Evidence: Pi `dispatch_runner_subagent` accepts an optional model pattern, passes it to child Pi as `--model`, and reports `requestedModel` without claiming the resolved model. Runner tests, TypeScript checks, and dprint checks covered the model option path; the public `pr-address` skill and classifier references document the routing policy.

- [~] Design the managed run-state boundary for `pr-address` orchestration.
  - Policy: Keep raw feedback payloads, selected-detail artifacts, classification packets, validation wrappers, and GitHub mutation payloads clearly scoped; avoid normal ad-hoc `/tmp/pr-address-*.json` state.
  - Evidence: PR #1011 narrowed shared infrastructure to generic JSON option/stdin loading while keeping `pr-address` classification and thread-resolution semantics in `pr-address` helpers. Remaining evidence is that normal validation and mutation paths no longer require ad-hoc JSON scratch files.

- [x] Improve selected-detail payload ergonomics.
  - Policy: Selected body/item lookup should be payload/artifact-backed and should return compact references, not feedback body dumps in the main transcript.
  - Evidence: `pr-address exec read-feedback-details` accepts batch JSON Pointer selections, validates selected pointers, writes same-session summary artifacts, and returns artifact pointers plus counts. Scenario tests and CLI/skill docs cover stdin/`--selection-json`, body/item selections, duplicate/empty/broad-pointer failures, summary references, and sentinel assertions that body text stays out of command output.

- [x] Add deterministic planning support for validated classifications.
  - Policy: Planning must consume validated classification data, preserve approval gates, keep raw body text out of plan output, and order batches deterministically.
  - Evidence: `pr-address exec plan-feedback` validates before planning and emits batches in skill order with exact IDs, locators, source context, approval gates, informational items, and user-decision requirements. Scenario tests and CLI/skill docs cover valid and invalid inputs, deterministic order, prepare-run no-PR behavior, and no raw body text in plan output.

- [~] Reduce manual GitHub mutation payload assembly.
  - Policy: Agents should build resolution payloads through tested helpers from plan output plus explicit per-thread decisions; mutation should still happen only through helper-mediated GitHub commands.
  - Evidence: `resolve-thread-batch` accepts stdin or `--payload-json` through the shared JSON loader, and `build-resolve-thread-batch-payload` emits either a validated payload, a no-payload result, or structured semantic errors without mutating GitHub. Scenario tests cover ready payload generation, skip handling, non-thread batches, invalid decisions, thread mismatches, malformed input, and compatibility with `resolve-thread-batch`. Remaining evidence is per-batch checkpoint support for changed files, validation commands, and final audit state.

- [ ] Add per-batch evidence/checkpoint support.
  - Policy: Capture workflow evidence without turning run state into a hidden task database.
  - Evidence: Closure requires each batch to be auditable after commit and before/after GitHub resolution with changed files, validation commands, commit SHA, addressed thread IDs, resolved/replied outcomes, and skipped items.

- [ ] Add finalization support for unresolved feedback summary.
  - Policy: End every run through one clear final verification path that re-fetches compact feedback in payload mode and reports unresolved, skipped, and mutated items.
  - Evidence: Closure requires future `pr-address` runs to have an obvious end state even when a session pivots before final verification.

- [~] Update the public `pr-address` skill and CLI reference for the improved happy path.
  - Policy: Route agents through tested helpers while preserving payload-by-default, validated classification before planning, cost-aware classifier dispatch with escalation, user approval for cross-cutting/complex work, helper-mediated GitHub mutations, and no push.
  - Evidence: The CLI reference documents classification templates, validation, planning, selected-detail lookup, and stdin/option JSON input for validation, planning, and thread resolution. The public skill now routes validated classifications through `plan-feedback`, prefers `read-feedback-details` for multi-body lookup, and keeps `read-feedback-detail` as one-off inline/debug lookup. Remaining evidence is to shed residual manual mutation/finalization instructions as checkpoint and finalization helpers land.

## Closure Evidence

A representative fixture, dry run, or live PR-addressing run with PR-level feedback, unresolved inline threads, discussion comments, and at least two batch types is required to close the Objective. Treat that as closure evidence for the roadmap, not as a separate implementation work unit.

## Parked

- [ ] Explore whether a fully automatic classifier is desirable.
  - Policy: Keep parked because the current thesis preserves LLM semantic judgment and hardens only deterministic packet structure.

- [ ] Broaden payload artifact lifecycle/GC policy across all agent workflows.
  - Policy: Keep parked unless `pr-address` changes expose a directly blocking shared payload limitation.

- [ ] Build cross-harness UI affordances for `pr-address` planning and approval gates.
  - Policy: Keep parked until CLI helpers define stable machine-readable planning and finalization outputs.
