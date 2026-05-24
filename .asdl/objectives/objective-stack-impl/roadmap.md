# Roadmap

## Work

- [x] Define the final-text child-session contract: `runChildSession` now accepts `returnMode: "final-text"` with `ChildSessionFinalTextResult` and `stopped-without-useful-text` outcomes while preserving terminal-capture result compatibility.
- [x] Teach the child-session JSON parser/runner to capture final assistant text from clean child stops and return it with status, progress, diagnostics, and `sessionFile` evidence.
- [x] Add fake-driven tests for final-text extraction, stopped-without-useful-text behavior, cancellation/error preservation, and terminal-capture compatibility.
- [x] Implement a generic parent-callable `run_child_session_text` tool in `ts/packages/pi-extensions/src/run-child-session-text.ts`, with `.pi/extensions/run-child-session-text.ts` as a thin project-local discovery shim.
- [x] Add fake-driven tests proving `run_child_session_text` passes explicit prompt arguments/current cwd to a child session and returns final text/status/session-path/progress evidence as an ordinary tool result, including diagnostics and truncation.
- [ ] Add `.pi/prompts/objective-stack-impl.md` with argument hint `[objective-slug]` and current-session-only parent-orchestrator instructions.
- [ ] Ensure the prompt is brmem-free, does not depend on legacy rewrite-brief documents, avoids stack-specific child terminal tools, and tells the parent agent to run one same-worktree child slice at a time.
- [ ] Validate the TypeScript package and prompt Markdown formatting; TypeScript package validation for the helper/tool slices currently passes, and prompt Markdown formatting remains pending until the prompt exists.
- [ ] Prepare the work for manual user inspection while leaving the Objective open until the user explicitly requests closure.

## Parked

- [ ] Branch Memory-backed stack plans, slice ledgers, completion handoffs, and automatic recovery.
- [ ] A closed-loop extension command implementation of `/objective-stack-impl`.
- [ ] Creating or switching to a dedicated parent orchestration session.
- [ ] Domain-specific child terminal tools such as `stack_impl_slice_done` and `stack_impl_slice_blocked`.
- [ ] Pi-core parent-decision APIs or extension-side structured queries to the parent LLM.
- [ ] Code heuristics that parse freeform child text to auto-advance.
- [ ] Full deterministic Objective-stack status/recovery command suite.
- [ ] Live Graphite-stack end-to-end smoke test as a prerequisite for asking the user to inspect the implementation.
- [ ] Parallel child sessions or isolated child worktree management.
