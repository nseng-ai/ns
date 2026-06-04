# PR Address Payload Workflow Documented

## Summary

Updated the public `pr-address` skill and references so the normal agent workflow now uses the compact payload and classification validation path. The skill chooses and passes a safe payload session id, runs `prepare-run` / `get-feedback` in default payload mode, keeps raw feedback bodies out of the main transcript, delegates semantic classification to a payload-aware subagent/helper when available, and falls back to selected-detail lookup for targeted body inspection.

The classification reference now describes the strict `schema_version: 1` packet accepted by `pr-address exec validate-feedback-classification`, including exact-once review/thread/comment coverage, locator copying, disposition/complexity/informational reason enums, one diagnostic retry, and fail-closed behavior.

## Objective Impact

The roadmap row “Wire the payload-aware LM/subagent summary workflow into `pr-address` documentation and skill behavior” is complete. The public docs now connect the already-implemented payload manifests, `.asdl/prompts/subagent-launch.md` delegation policy, selected-detail lookup command, and deterministic classification validator into the default skill workflow.

Summary persistence was intentionally split out of the skill workflow: the shared payload store supports summary artifacts, but the public skill does not ask agents to save validated `.summary.json` classifications. A separate Objective decision now treats validation-before-acting as sufficient for v1 and defers a supported `pr-address exec` write command until a concrete reload/replay workflow needs it.

Verification: `pr-address exec` schema commands for `prepare-run`, `get-feedback`, `read-feedback-detail`, and `validate-feedback-classification` succeeded; `just dprint-check` passed after formatting; `git diff --check` passed; and the public skill docs contain no reviewed internal implementation-symbol references.

## Follow-Ups

- Keep command-level LLM invocation and ad-hoc internal helper calls out of the public skill workflow.
- Finish steelthread closure evidence without adding routine validation-only roadmap work.
