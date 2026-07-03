# Prompt Policy Wording Refreshed

## Summary

Refreshed `.asdl/prompts/subagent-launch.md` and the embedded fallback at `packages/asdl-core/src/asdl_core/prompts/defaults/subagent-launch.md` so the subagent launch policy describes artifact-backed inspection with payload artifact paths, payload locators, compact manifests, selected-detail lookup, direct deterministic inspection, delegated inspection, and fail-closed validation.

The prompt files no longer contain stale `side-channel` or `hidden channel` wording, and the checked-in prompt remains byte-identical to the embedded default.

## Objective Impact

The `Refresh prompt-policy wording` roadmap row is complete. The policy remains the same `subagent-launch` surface while matching the payload artifact contract carried forward in this Objective.

Verification: focused stale-terminology search passed for both prompt-policy files; `cmp` confirmed prompt/default byte equality; `uv run pytest packages/asdl-core/tests/unit/prompts/test_resolver.py -k checked_in_subagent_launch_prompt_matches_embedded_default` passed; Markdown formatting passed for the touched Markdown files.

Broader docs and active Objective cleanup remains deferred to the next roadmap row.

## Follow-Ups

- Update current docs and active Objective references so future work cites payload artifact terminology rather than legacy terminology.
- Run the later repo terminology audit and classify any remaining stale hits before closure.
