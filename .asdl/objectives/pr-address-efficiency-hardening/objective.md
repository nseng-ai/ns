# PR Address Efficiency Hardening

## Thesis

`pr-address` should make addressing PR feedback feel like a guided, validated state machine rather than a long agent-operated recipe. The agent should supply judgment and engineering changes; deterministic CLI helpers should own payload discipline, schema-safe classification scaffolding, batch planning, mutation payload shapes, progress evidence, and final verification.

This Objective tracks the concrete issues surfaced during the 2026-06-07 `pr-address` run on PR #999 for branch `roaster-stack-skill-first-bakeoff`, plus the retroactive analysis of that session. The run proved that the current payload workflow works, but also showed that the agent still spends too much time manually composing JSON, reading references, building validator wrappers, grouping batches, constructing mutation payloads, and remembering finalization steps.

## Background and Evidence

During the session, `pr-address` correctly used payload mode:

- `prepare-run` returned `payload_mode: "payload"`.
- The raw feedback envelope was written under an asdl session payload path, while the transcript mainly held the compact manifest and locators.
- A payload-aware subagent classified the compact manifest and raw payload artifact.
- Targeted `read-feedback-detail` calls read individual JSON pointers rather than dumping the full raw payload.

The same session exposed several avoidable inefficiencies:

- The classification subagent semantically understood the feedback but returned a packet that failed validation because the packet shape was too easy to get wrong: extra `body_locator` fields, non-contract fields such as path/line, and wrong covered-comment field names.
- The parent agent manually canonicalized the classification, created `/tmp/pr-address-validation-wrapper*.json`, and retried validation. These scratch files were not raw payload artifacts, but they were ad-hoc orchestration state and confused the boundary between managed payloads and agent-local plumbing.
- The agent printed selected feedback bodies in the transcript after `read-feedback-detail`. This was supported selected-detail lookup, not inline raw payload mode, but the ergonomics encouraged visible body dumps rather than payload artifact inspection.
- The agent manually assembled `resolve-thread-batch` JSON payloads and commit-to-thread mappings after each batch.
- The auto-approved work was tested and committed, but the skill’s per-batch validation and final verification expectations still depended on the agent remembering every step.
- A branch retrospective collected 20 sessions and showed broad evidence of high tool orchestration: many `read` and `bash` tool calls, repeated reads of `pr-address` references, repeated large outputs, and repeated shell invocations. For the `pr-address` session itself, there were roughly 51 tool calls, 50 tool results, and 39 assistant messages over about 8 minutes.

The retro recommended that `pr-address` move from “agent follows a long skill recipe” toward “CLI owns deterministic state machine; agent supplies judgment and code edits.”

## Scope

In scope:

- Make current-branch `pr-address` runs faster, less error-prone, and less transcript-heavy.
- Add deterministic classification templates or equivalent schema guardrails so LLMs fill semantic judgments without inventing IDs, locators, or packet structure.
- Improve payload and selected-detail ergonomics so raw or selected feedback bodies remain in managed artifacts unless the human explicitly asks to see them.
- Add file/path-based JSON input affordances or equivalent managed run-state helpers to eliminate confusing ad-hoc `/tmp/pr-address-*.json` scratch files for normal operation.
- Add composite planning/finalization helpers where they reduce deterministic orchestration: batch grouping, approval gates, mutation skeletons, per-batch evidence, and final unresolved-feedback summary.
- Update the `pr-address` skill and CLI reference only where needed to route future agents through the improved path.
- Allow shared payload, CLI, or platform helper changes only when they directly simplify or harden the `pr-address` workflow.

## Non-Goals

- Do not replace LLM judgment with a brittle rule-based classifier. The goal is schema-safe scaffolding plus validated semantic judgment, not full deterministic interpretation of review prose.
- Do not make `pr-address` push, submit, deploy, or perform broad GitHub mutations beyond its existing explicit helper-mediated replies/resolutions without a separate confirmed policy decision.
- Do not turn Objectives, payloads, or pr-address run state into a hidden task database or long-lived workflow controller.
- Do not broaden this Objective into all payload-platform or all agent-efficiency work unless a change is directly needed to improve `pr-address`.
- Do not optimize for fewer commands at the expense of validation, auditability, or user approval gates for cross-cutting/complex feedback.

## Completion Criteria

This Objective is complete when `pr-address` has a materially lower-orchestration happy path, demonstrated by code, tests, docs/skill updates, and at least one real or representative PR-addressing run.

Required closure evidence:

- A deterministic classification template or equivalent guardrail exists, and classification validation failures from locator/ID/schema-shape mistakes are materially harder to produce.
- The normal workflow no longer requires agents to create ad-hoc JSON scratch files for validation wrappers or mutation payloads when using supported helper paths.
- Selected feedback detail can be inspected in a payload/artifact-backed way that does not encourage dumping all selected bodies into the main transcript.
- Planning output groups actionable work by batch, identifies approval gates, and provides exact thread/comment identities and mutation skeletons or follow-up commands.
- Batch execution can record or surface keepable validation evidence per batch: changed files, test/check commands, commit SHA, and addressed thread IDs.
- Final verification can be run through one clear helper or finalization path that reports unresolved feedback, skipped items, and GitHub mutation outcomes.
- The public `pr-address` skill and CLI reference describe the improved path clearly enough that future agents do not need to rediscover this retro.
- Scenario/unit tests cover the new deterministic helpers and at least one end-to-end representative path.

## Definition of Progress

Progress is keepable when it reduces agent-managed ceremony while preserving or improving safety. Useful keepable progress includes:

- A deterministic helper that replaces manual JSON construction, reference re-reading, or fragile shell quoting.
- A schema/template change that makes invalid classification packets less likely while preserving LLM semantic judgment.
- A payload artifact improvement that keeps raw or selected feedback bodies out of the main transcript by default.
- A small workflow helper that turns an implicit skill step into explicit machine-readable state or next-step evidence.
- A skill/reference update that routes agents to a new tested helper and removes obsolete manual instructions.

Do not keep changes that:

- Bypass classification validation or GitHub mutation helpers.
- Hide unresolved feedback, skipped items, or failed mutations.
- Encourage inline raw payload output as the normal path.
- Collapse user approval gates for `cross_cutting`, `complex`, or informational-thread actions.
- Introduce shared infrastructure changes without a direct `pr-address` simplification benefit.

Useful evidence includes targeted unit/scenario tests, a representative dry run or live run on a PR with review threads and discussion comments, compact before/after command counts where available, and transcript/payload evidence showing reduced main-transcript feedback body exposure.

## Runner Policy

This Objective is execution-friendly for `objective-next` under the boundaries below.

- Direct execution is allowed when a future session previews a bounded local slice and the slice affects `pr-address` CLI helpers, tests, skill/reference docs, or directly supporting payload/CLI utilities.
- Steer or ask first when a slice changes the public `pr-address` workflow contract, changes GitHub mutation behavior, broadens scope into shared payload/platform infrastructure, or touches cross-harness agent policy.
- Local code, tests, Markdown skills, and CLI reference files may be changed and left in the worktree when the slice has targeted validation evidence. Commits may be created only when the user or surrounding workflow requests committing.
- Validation before keeping work should match the slice: targeted unit/scenario tests for helper behavior, CLI schema checks where available, relevant lint/format checks, and a representative workflow exercise when changing orchestration semantics.
- External systems are guarded. Do not push, submit PRs, deploy, publish, or mutate GitHub issues/PRs unless a human explicitly previews and confirms that exact external action for the current session. Live `pr-address` reply/resolve operations remain allowed only within an explicitly invoked `pr-address` workflow and through `pr-address exec` helpers.

## Assumptions and Risks

Assumptions:

- The main bottleneck is not payload storage itself; payload mode worked. The bottleneck is the amount of deterministic state and JSON shape management left to the agent.
- LLM classification remains valuable for review prose, but IDs, locators, counts, and packet skeletons should be deterministic.
- `prepare-run` or a nearby helper can emit a classification template without making the manifest too large or coupling too tightly to validator internals.
- Agents will follow improved helpers when the `pr-address` skill and CLI reference make the happy path shorter than the manual path.
- Representative tests can cover most safety regressions without requiring live GitHub mutation in CI.

Risks:

- A composite helper such as `plan-run` could become an opaque mega-command if it owns too much judgment or hides intermediate validation diagnostics.
- Adding run-state files or managed artifacts could create lifecycle/cleanup confusion if they are not clearly scoped to a payload session or explicit artifact role. The selected-detail slice de-risks this for body/item retrieval by writing curated selections as same-session `summary` artifacts with compact stdout references; broader run-state lifecycle questions remain for planning, checkpoints, and finalization.
- File-based JSON input flags could merely formalize scratch files rather than eliminating unnecessary manual plumbing unless paired with better helper design.
- Shared payload/platform changes could expand the Objective beyond `pr-address` and compete with unrelated agent infrastructure work. PR #1011 narrows this risk for JSON input handling by promoting only a generic Clinkr option/stdin loader while leaving pr-address-specific classification and mutation semantics in `pr-address` helpers; broader payload/platform lifecycle questions remain parked unless directly blocking.
- Over-optimizing for speed could weaken the existing safety guarantees: validated classification, user approval for cross-cutting/complex work, helper-mediated GitHub mutations, and no pushing.

## Open Questions

- Should the classification template be emitted directly by `prepare-run`, by a separate `classification-template` helper, or by a validator-owned merge operation that accepts only semantic fills?
- What is the right boundary between `plan-run` and smaller helpers so deterministic orchestration improves without hiding too much from the agent and user?
- Should `resolve-thread-batch` gain `@file`/file-path input support, or should a higher-level batch checkpoint helper own mutation payload generation entirely?
- What representative fixture or live-run protocol should count as closure evidence for the lower-orchestration happy path?
