# Run Child Session Text Tool Implemented

## Summary

Evidence: local working-tree implementation adds `ts/packages/pi-extensions/src/run-child-session-text.ts`, registering the generic `run_child_session_text` Pi custom tool. The tool accepts only `title` and `prompt`, launches `runChildSession` in `returnMode: "final-text"` in the current cwd, and returns ordinary tool content with status, title, elapsed/progress data, stop reason when present, child `sessionFile`, capped final text, and diagnostics for non-final-text statuses.

The project-local discovery shim `.pi/extensions/run-child-session-text.ts` now points at the engineered module. The tool intentionally does not expose cwd/model/tool/parallelism/worktree-cleanliness options in v1; those guardrails remain prompt/parent-agent responsibilities.

Verification: `cd ts/packages/pi-extensions && bun test` passed, and `cd ts/packages/pi-extensions && bun run check` passed. PR evidence was not required; local working-tree evidence on top of the final-text helper branch was sufficient.

## Objective Impact

This completes the roadmap rows for the generic parent-callable `run_child_session_text` tool and fake-driven tool coverage. Tests cover registration/schema shape, prompt guidelines naming the tool, current-cwd/title/prompt pass-through without a runtime extension, final-text result formatting, no-useful-text diagnostics, child error preservation, blank argument rejection before spawn, and model-visible truncation with machine-readable details.

The Objective remains open because the `/objective-stack-impl [objective-slug]` prompt and prompt Markdown validation are still pending.

## Follow-Ups

- Add `.pi/prompts/objective-stack-impl.md` with current-session-only parent orchestration instructions and argument hint `[objective-slug]`.
- Ensure the prompt is brmem-free, avoids stack-specific child terminal tools, keeps same-worktree child sessions sequential, and tells the parent agent how to interpret `run_child_session_text` statuses.
- Run the combined TypeScript and Markdown validation once the prompt exists.
