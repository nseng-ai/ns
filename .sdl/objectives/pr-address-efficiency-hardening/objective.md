# PR Address Efficiency Hardening

## Thesis

`pr-address` should make addressing PR feedback feel like a guided, validated state machine rather than a long agent-operated recipe. The agent should supply judgment and engineering changes; deterministic CLI helpers should own payload discipline, schema-safe classification scaffolding, batch planning, mutation payload shapes, progress evidence, and final verification.

This Objective tracks the concrete issues surfaced during the 2026-06-07 `pr-address` run on PR #999 for branch `roaster-stack-skill-first-bakeoff`, plus the retroactive analysis of that session. The run proved that the current payload workflow works, but also showed that the agent still spends too much time manually composing JSON, reading references, building validator wrappers, grouping batches, constructing mutation payloads, and remembering finalization steps.

## Evidence

The 2026-06-07 PR #999 run showed that payload mode works: raw feedback stayed in a managed payload artifact, compact manifests carried locators, classification used payload-aware context, and selected-detail helpers could fetch individual JSON pointers.

The same run showed where orchestration still leaked to the agent:

- Classification required semantic judgment, but packet structure was too easy to invalidate through invented locator fields, wrong covered-comment names, or non-contract path/line details.
- Validation wrappers, mutation payloads, and commit-to-thread mappings were assembled by hand instead of through durable run-state helpers.
- Selected feedback bodies could be retrieved safely, but the happy path still encouraged copying body text into the main transcript.
- Batch validation, commit evidence, final unresolved-feedback checks, and GitHub mutation outcomes depended on the agent remembering procedural steps.
- Recent retrospectives reinforced the same pattern: repeated reference reads, shell invocations, large tool outputs, and manual state reconciliation. Specific session counts belong in retrospective artifacts, not in this durable Objective.

The `internal-pr-stack-address` retrospective on the runner-subagent stack showed the same pattern at stack scope: the safety model worked, but the agent had to bridge a structural mismatch between `stack-feedback-plan` and per-PR resolution payload builders, manually reconcile changed feedback, and carry too much JSON orchestration in prompt context.

The durable direction is to move from “agent follows a long skill recipe” toward “CLI owns deterministic state machine; agent supplies judgment and code edits.”

## Scope

In scope:

- Make current-branch and stack-wide `pr-address` runs faster, less error-prone, and less transcript-heavy.
- Add deterministic classification templates or equivalent schema guardrails so LLMs fill semantic judgments without inventing IDs, locators, or packet structure.
- Add cost-aware model routing for bounded classification work: default cheap/fast where compact payloads, finite classifier rules, strict JSON, and deterministic validation make it safe; retry or escalate when validation fails, feedback is ambiguous, or complex cross-file reasoning is required.
- Improve payload and selected-detail ergonomics so raw or selected feedback bodies remain in managed artifacts unless the human explicitly asks to see them.
- Add file/path-based JSON input affordances or equivalent managed run-state helpers to eliminate confusing ad-hoc `/tmp/pr-address-*.json` scratch files for normal operation.
- Add composite planning/finalization helpers where they reduce deterministic orchestration: batch grouping, approval gates, mutation skeletons, per-batch evidence, final unresolved-feedback summary, stack-level resolution payload building, and current-feedback reconciliation.
- Update the `pr-address` skill and CLI reference only where needed to route future agents through the improved path.
- Allow shared payload, CLI, or platform helper changes only when they directly simplify or harden the `pr-address` workflow.

## Non-Goals

- Do not replace LLM judgment with a brittle rule-based classifier. The goal is schema-safe scaffolding plus validated semantic judgment, not full deterministic interpretation of review prose.
- Do not make `pr-address` push, submit, deploy, or perform broad GitHub mutations beyond its existing explicit helper-mediated replies/resolutions without a separate confirmed policy decision.
- Do not turn Objectives, payloads, or pr-address run state into a hidden task database or long-lived workflow controller.
- Do not broaden this Objective into all payload-platform or all agent-efficiency work unless a change is directly needed to improve `pr-address`.
- Do not optimize for fewer commands at the expense of validation, auditability, or user approval gates for cross-cutting/complex feedback.

## Completion Criteria

This Objective is complete when `pr-address` has a materially lower-orchestration happy path, demonstrated by code, tests, skill/reference documentation, and a representative PR-addressing run or fixture.

Required closure evidence:

- Classification scaffolding makes locator, ID, and schema-shape mistakes materially harder while preserving LLM semantic judgment.
- Bounded initial classification can request a cheap/fast model or profile where the harness supports it, with validator-driven retry/escalation for schema failures, omissions, ambiguity, or complex cross-file reasoning.
- Supported helper paths eliminate normal ad-hoc JSON scratch files for validation wrappers and GitHub mutation payloads.
- Raw and selected feedback bodies remain in payload/artifact-backed storage by default, with compact transcript references.
- Planning output groups actionable work by batch, identifies approval gates, and provides exact identities plus mutation skeletons or follow-up commands.
- Batch execution records or surfaces keepable evidence: changed files, validation commands, commit SHA, addressed thread IDs, skipped items, and mutation outcomes.
- Final verification has one clear helper or path that reports unresolved feedback, skipped items, and GitHub mutation outcomes.
- Stack-wide feedback addressing can proceed from a validated stack plan to safe per-PR mutation payloads without manual per-PR plan reconstruction, and can deterministically detect newly appeared, disappeared, or already-resolved feedback before mutation.
- The public `pr-address` skill and CLI reference describe the improved path clearly enough that future agents do not need to rediscover this retro.
- Scenario/unit tests cover new deterministic helpers and at least one end-to-end representative path.

## Progress Policy

Keep work only when it reduces agent-managed ceremony while preserving validation, auditability, and approval gates. Good slices replace manual JSON construction, fragile quoting, reference re-reading, transcript body dumps, or implicit state with tested helpers, payload artifacts, or concise skill/reference guidance.

Do not keep changes that bypass classification validation or GitHub mutation helpers, trust cheap-model output without validator coverage and escalation, hide unresolved/skipped/failed items, normalize inline raw payload output, collapse approval gates for `cross_cutting`, `complex`, or informational-thread actions, or broaden shared infrastructure without a direct `pr-address` simplification benefit.

## Runner Policy

This Objective is execution-friendly for `objective-next` under the boundaries below.

- Direct execution is allowed when a future session previews a bounded local slice and the slice affects `pr-address` CLI helpers, tests, skill/reference docs, or directly supporting payload/CLI utilities.
- Steer or ask first when a slice changes the public `pr-address` workflow contract, changes GitHub mutation behavior, broadens scope into shared payload/platform infrastructure, or touches cross-harness agent policy.
- Local code, tests, Markdown skills, and CLI reference files may be changed and left in the worktree when the slice has targeted validation evidence. Commits may be created only when the user or surrounding workflow requests committing.
- Validation before keeping work should match the slice: targeted unit/scenario tests for helper behavior, CLI schema checks where available, relevant lint/format checks, and a representative workflow exercise when changing orchestration semantics.
- External systems are guarded. Do not push, submit PRs, deploy, publish, or mutate GitHub issues/PRs unless a human explicitly previews and confirms that exact external action for the current session. Live `pr-address` reply/resolve operations remain allowed only within an explicitly invoked `pr-address` workflow and through `pr-address exec` helpers.

## Assumptions and Risks

Assumptions:

- The main bottleneck is not payload storage itself; payload mode worked. The bottleneck is the deterministic state and JSON shape management still left to the agent.
- LLM classification remains valuable for review prose, but IDs, locators, counts, and packet skeletons should be deterministic.
- Bounded `pr-address` classification is often suitable for a cheaper/faster model because compact feedback, finite classifier guidance, strict JSON, and deterministic validation bound the risk.
- Agents will follow improved helpers when the `pr-address` skill and CLI reference make the supported path shorter than the manual path.
- Representative tests and fixtures can cover most safety regressions without requiring live GitHub mutation in CI.

Risks:

- A composite helper such as `plan-run` could become an opaque mega-command if it owns too much judgment or hides intermediate validation diagnostics.
- Managed run-state artifacts could create lifecycle/cleanup confusion if they are not scoped clearly to a payload session and explicit artifact role.
- File-based JSON input flags could merely formalize scratch files rather than eliminating unnecessary manual plumbing unless paired with better helper design. De-risked for single-PR thread-resolution batches: `resolve-thread-batch --payload-file` runs through the shared `load_json_input` loader with single-source conflict detection, `build-resolve-thread-batch-payload` produces the tested generated payload, and `record-batch-checkpoint` records compact post-batch evidence without turning payload artifacts into a hidden task database. De-risked for final verification: `finalize-run` consumes the compact final feedback manifest and checkpoint results without reading raw feedback bodies or mutating GitHub. De-risked for stack-wide payload generation: the per-PR payload builder rejects stack-plan-shaped input with concise diagnostics, and `build-stack-resolve-thread-payloads` now builds tested per-PR resolution payloads directly from a validated stack plan plus explicit decisions. Further hardened by sharing canonical resolve/skip decision validation across the per-PR and stack payload builders, reducing divergence risk between helper paths. De-risked for stack current-feedback drift: `stack-feedback-diff-current` compares a validated stack plan with a fresh `stack-feedback-prep --include-resolved` result before mutation and makes already-resolved, new, missing, and metadata-changed feedback explicit without reading raw bodies or touching GitHub.
- Shared payload/platform changes could expand the Objective beyond `pr-address`; keep them parked unless they directly unblock this workflow.
- Over-optimizing for speed could weaken existing safety guarantees: validated classification, user approval for cross-cutting/complex work, helper-mediated GitHub mutations, and no pushing.
- Cross-harness fallback language remains necessary where runner dispatch cannot choose models per launch.

## Open Questions

No closure-blocking open questions remain.

- The Objective landed on smaller, inspectable helpers rather than an opaque `plan-run` command: classification scaffolding, validated planning, selected-detail lookup, mutation payload building, batch checkpoints, finalization, stack current-feedback diffing, and stack-native payload building each own deterministic state without hiding approval gates.
- The `@file` mutation affordance now exists (`resolve-thread-batch --payload-file`, backed by the shared JSON loader), generated mutation payloads come from helper builders, per-batch evidence is recorded by `record-batch-checkpoint`, and final verification is aggregated by `finalize-run` or stack-wide include-resolved prep evidence from compact feedback. A future enhancement could dereference checkpoint artifacts directly, but the normal happy path no longer depends on that decision.
- Representative closure evidence is the scenario fixture `test_representative_stack_address_happy_path_closure_evidence`, which covers PR-level review feedback, unresolved inline review threads, discussion comments, multiple stack batch types, helper-built payloads, fake-only mutation, and final include-resolved verification.
- A first-class stack run artifact remains a possible future enhancement, but closure accepts the current thin stack helper chain because the validated plan, current-feedback diff, per-PR payload generation, and final verification steps are all deterministic and tested.

## Closure

Completed on 2026-06-08. `pr-address` now has a materially lower-orchestration happy path: deterministic helpers own payload discipline, classification scaffolding, validation, planning, mutation payload construction, checkpoint/finalization evidence, stack current-feedback reconciliation, and stack-native resolution payload generation while the agent retains semantic judgment and code-change responsibility.

Closure evidence is the representative stack scenario `packages/asdl-pr-address/tests/scenario/test_stack_feedback_operations.py::test_representative_stack_address_happy_path_closure_evidence`. It covers PR-level review feedback, unresolved inline review threads, PR discussion comments, at least two batch types, stack prep, stack planning, fresh include-resolved current prep, current-feedback diffing, helper-built resolve-thread payloads, fake-only helper-mediated thread mutation, and final include-resolved stack verification without leaking raw sentinel bodies.

Parked ideas remain intentionally out of scope: fully automatic classification, broad payload artifact lifecycle/GC policy, and cross-harness UI affordances. Those do not block closure because the durable helper chain, public guidance, and representative fixture satisfy the completion criteria without requiring live GitHub mutation.
