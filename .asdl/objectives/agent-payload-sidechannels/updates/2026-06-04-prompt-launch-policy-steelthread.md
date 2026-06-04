# Prompt Launch Policy Steelthread Implemented

## Summary

Implemented the repo-local prompt-resolution and launch-policy steelthread for `asdl-core`. The new `asdl_core.prompts` package provides typed prompt errors, frozen Pydantic resolution/provenance models, packaged embedded fallback loading, and a resolver that accepts exactly one explicit `repo_root` or `prompt_root`. It reads repo-local `.asdl/prompts/<name>.md` files as exact UTF-8 text, rejects unsafe prompt names and subdirectory attempts with stable prompt errors, and falls back to embedded defaults when configured.

Added `.asdl/prompts/subagent-launch.md` as the user-editable launch policy plus an identical packaged Markdown fallback under `asdl_core.prompts.defaults`. The policy is general delegation guidance rather than a PR-specific classification prompt: it covers when to use subagents, path and locator passing, Pi/Claude/Codex launch guidance, fallback behavior when no side-channel subagent is available, structured final-answer expectations, parent-side validation, and fail-closed safety behavior.

## Objective Impact

The roadmap row “Implement the repo-local `.asdl/prompts` launch-policy steelthread” is complete. The checked-in prompt and embedded fallback are protected by a drift test, and the packaged fallback is verified to be included in the built `asdl-core` wheel.

This slice intentionally did not add a generic prompt CLI, update `pr-address` command behavior, update the `pr-address` skill, move the existing payload safe-segment helper, add global/user prompt scopes, or introduce branch-naming or commit-summary policies.

Verification: focused prompt and shared segment unit tests passed; focused Ruff check and Ruff format check passed; focused dprint check for both prompt Markdown files passed; `just ty` passed; an `asdl-core` wheel build included the packaged `subagent-launch.md` fallback.

## Follow-Ups

- Convert `pr-address exec prepare-run` and `get-feedback` to compact sidecar defaults in the next implementation slice.
- Add selected-detail retrieval and PR feedback classification validation after compact manifests exist.
- Update the `pr-address` skill/reference documentation only after sidecar command behavior exists.
- Keep generic prompt CLIs, global/user prompt scopes, branch-naming prompt policies, and commit-summary prompt policies parked unless a later Objective expands the prompt-pluggability surface.
