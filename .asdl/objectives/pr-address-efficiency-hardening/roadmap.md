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

- [x] Reduce manual GitHub mutation payload assembly.
  - Policy: Agents should build resolution payloads through tested helpers from plan output plus explicit per-thread decisions; mutation should still happen only through helper-mediated GitHub commands.
  - Evidence: `resolve-thread-batch` accepts stdin, `--payload-json`, or `--payload-file` through the shared JSON loader, so a large generated batch payload can be written to a file instead of inlined in the transcript; `build-resolve-thread-batch-payload` emits either a validated payload, a no-payload result, or structured semantic errors without mutating GitHub; `record-batch-checkpoint` records the post-mutation evidence that ties the generated payload, mutation result, commit, changed files, validation commands, and skipped/replied outcomes together. Scenario tests cover ready payload generation, skip handling, non-thread batches, invalid decisions, thread mismatches, malformed input, payload-file/source conflicts, mutation compatibility, checkpoint artifacts, and failed/incomplete evidence.

- [x] Add per-batch evidence/checkpoint support.
  - Policy: Capture workflow evidence without turning run state into a hidden task database.
  - Evidence: `pr-address exec record-batch-checkpoint` validates one selected `plan-feedback` batch against explicit changed files, validation commands, commit SHA, `build-resolve-thread-batch-payload` output, `resolve-thread-batch` results, PR-level review/discussion outcomes, and skipped items. It writes a same-session managed summary artifact when the plan is payload-backed, returns a checkpoint reference, keeps raw feedback bodies out of stdout/artifacts, and returns `batch_complete=false` for failed or incomplete evidence. Follow-up hardening split the checkpoint command into typed models plus pure validation logic, moved checkpoint scenarios into a focused test module, added unit coverage for validation policy, and documented `changed_files` as repository-relative forward-slash paths.

- [x] Add finalization support for unresolved feedback summary.
  - Policy: End every run through one clear final verification path that re-fetches compact feedback in payload mode and reports unresolved, skipped, and mutated items.
  - Evidence: `pr-address exec finalize-run` consumes a final compact `get-feedback --include-resolved` manifest plus `record-batch-checkpoint` result data, then reports unresolved threads, unresolved unskipped work, skipped review/thread/discussion items, checkpoint mutation evidence, failed validation, and `ready_to_stop`. Scenario and unit tests cover ready, unresolved, skipped, failed-checkpoint, PR-mismatch, duplicate-batch, empty-checkpoint, and raw-body sentinel cases; `just check` passed.

- [x] Update the public `pr-address` skill and CLI reference for the improved happy path.
  - Policy: Route agents through tested helpers while preserving payload-by-default, validated classification before planning, cost-aware classifier dispatch with escalation, user approval for cross-cutting/complex work, helper-mediated GitHub mutations, and no push.
  - Evidence: The CLI reference documents classification templates, validation, planning, selected-detail lookup, stdin/option/file JSON input for thread resolution, generated mutation payloads, batch checkpoint recording, and finalization. The public skill now routes validated classifications through `plan-feedback`, prefers `read-feedback-details` for multi-body lookup, uses `build-resolve-thread-batch-payload` / `resolve-thread-batch` for inline-thread mutation, records each batch with `record-batch-checkpoint`, and ends with `get-feedback --include-resolved` plus `finalize-run` instead of a manual final summary checklist.

- [x] Harden the stack-address workflow against known schema-shape and output-size failures.
  - Policy: Until stack-native helpers exist, make the safe path explicit: do not pass `stack-feedback-plan` output to per-PR `build-resolve-thread-batch-payload`; detect stack-plan-shaped input with a concise actionable error; keep large helper envelopes in files or payload artifacts with compact stdout summaries.
  - Evidence: `build-resolve-thread-batch-payload` rejects stack-plan-shaped input under `plan` with `stack_feedback_plan_not_supported`, rejects direct stack-plan envelopes before model validation with a concise `invalid_request`, and avoids leaking Pydantic `ValidationError`/`extra_forbidden` noise. The public `pr-address` skill, `internal-pr-stack-address` skill, and CLI reference document that the builder is per-PR-only until stack-native payload building exists. Targeted scenario coverage passed for stack-plan rejection.

- [x] Add stack-native resolution payload building.
  - Policy: A validated `stack-feedback-plan` should be enough provenance for deterministic per-PR/per-batch `resolve-thread-batch` payload generation, given explicit per-thread decisions and a commit SHA; agents should not manually reconstruct per-PR `plan-feedback` wrappers from a merged stack plan.
  - Evidence: `pr-address exec build-stack-resolve-thread-payloads` consumes a valid `stack-feedback-plan` data object, selected stack batch, batch commit SHA, `continue_on_error`, and explicit `(pr_number, thread_id)` decisions, then emits per-PR `resolve-thread-batch` payload entries or structured semantic errors without mutating GitHub. Scenario coverage includes one-PR and multi-PR success, missing and duplicate decisions, wrong PR and wrong batch references, all-skipped batches, mixed fixed/explained/pre-existing outcomes, non-thread ignored items, raw-body sentinels, adjacent per-PR builder regression tests, CLI schema smoke, lint/type checks, and Markdown dprint checks. Follow-up hardening extracts shared resolve/skip decision validation for the stack and per-PR builders, adds duplicate-thread detection for mutation payloads, and moves stack payload scenarios into focused coverage.

- [x] Add current-feedback reconciliation for stack runs.
  - Policy: Before resolving review threads, compare the validated stack plan against freshly fetched current stack feedback and make drift explicit: planned still unresolved, planned already resolved, newly appeared unresolved feedback, and missing or outdated planned threads.
  - Evidence: `pr-address exec stack-feedback-diff-current` compares a valid `stack-feedback-plan` with a fresh `stack-feedback-prep --include-resolved` result without reading raw feedback bodies or mutating GitHub, and returns compact drift categories plus a conservative `safe_to_resolve_planned` decision. Scenario coverage includes unchanged feedback, new unresolved threads, already-resolved planned threads, missing planned threads, outdated/metadata-changed planned threads, mixed multi-PR drift, missing `include_resolved` provenance, PR mismatch, and informational planned-thread handling. CLI schema smoke, adjacent stack tests, lint/type checks, and dprint checks passed.

- [x] Simplify `internal-pr-stack-address` around the stack-native helper path.
  - Policy: Keep the skill focused on safety boundaries, semantic classification, user approval points, and the short command sequence; move fallback mechanics out of the normal path and let tested CLI helpers own deterministic mapping, diffing, payload construction, and summary formatting.
  - Evidence: `skills/internal-pr-stack-address/SKILL.md` now routes normal stack runs through compact `stack-feedback-prep`, validated `stack-feedback-plan`, fresh `stack-feedback-prep --include-resolved`, `stack-feedback-diff-current`, `build-stack-resolve-thread-payloads`, helper-mediated `resolve-thread-batch` mutation, and final verification without manual per-PR `plan-feedback` reconstruction or manual pre-mutation drift comparison.

## Closure Evidence

A representative fixture, dry run, or live PR-addressing run with PR-level feedback, unresolved inline threads, discussion comments, and at least two batch types is required to close the Objective. Treat that as closure evidence for the roadmap, not as a separate implementation work unit.

## Parked

- [ ] Explore whether a fully automatic classifier is desirable.
  - Policy: Keep parked because the current thesis preserves LLM semantic judgment and hardens only deterministic packet structure.

- [ ] Broaden payload artifact lifecycle/GC policy across all agent workflows.
  - Policy: Keep parked unless `pr-address` changes expose a directly blocking shared payload limitation.

- [ ] Build cross-harness UI affordances for `pr-address` planning and approval gates.
  - Policy: Keep parked until CLI helpers define stable machine-readable planning and finalization outputs.
