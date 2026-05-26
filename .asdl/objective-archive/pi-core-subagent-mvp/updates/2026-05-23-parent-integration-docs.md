# Parent Integration, Docs, and Demo Consumer Added

## Summary

The fourth implementation slice adds the first parent-facing consumer of the local child-session helper: a project-local `/child-session-demo <task>` command loaded through `.pi/extensions/child-session-demo.ts`.

The demo command waits for the parent session to become idle, builds a complete child prompt, and calls `runChildSession(pi, { cwd: ctx.cwd, signal: ctx.signal }, options)` with two child-local terminal capture tools: `child_session_demo_complete` for `completed` payloads and `child_session_demo_blocked` for `blocked` payloads. The parent displays the child title, final state/result, terminal payload details, and `sessionFile` through a custom message renderer, with a minimal status/widget while the child runs.

The first consumer did not need stable npm-style package exports or subpaths. The project shim imports the repo-local source module directly.

User-facing docs were added at `docs/pi/child-session-helper.md` and linked from `docs/pi/README.md`. The docs cover the function-call mental model, `pi --mode json -p --no-extensions --extension <generated-runtime> --session <file>` architecture, same-cwd fresh child history, terminal capture schemas, result taxonomy, collision behavior, mixed terminal-plus-sibling protocol limitations, session artifacts, why full transcripts are not injected into the parent, and why this remains extension/package-layer rather than Pi core.

Evidence: local branch diff against Graphite parent `update-child-session-runtime-result-resolution`; the current branch is `add-child-session-demo-command-with-docs-and-tests`. Verification: targeted child-session/demo Bun tests passed, the `@asdl/pi-extensions` TypeScript check passed, and full `just` passed. No real provider/model calls were made. Manual live smoke was skipped because paid/model use was not explicitly authorized.

## Objective Impact

PR 4 is materially complete for first-consumer proof, project shim wiring, parent UI/output presentation, slash-command handoff regression coverage, and user-facing documentation.

The first consumer choice is resolved: the Objective uses a small diagnostic demo command rather than the stack-run extension skeleton or an Objective-stack closeout prototype. Rewriting Objective-stack workflows remains parked.

The parent progress/UI question is narrowed for the MVP. PR 4 exposes final parsed child progress through the result and uses a minimal parent status/widget while waiting; it intentionally does not add a live `onProgress` callback to the runner.

The stable export/subpath question is narrowed: even with a real parent-facing consumer, source-local imports plus a project `.pi/extensions` shim are sufficient for the MVP.

The Objective remains open. Closure should be a separate explicit decision after reviewing whether the MVP completion criteria are satisfactory without a manual live smoke.

## Follow-Ups

- Run an optional manual `/child-session-demo` smoke only when paid/model use is acceptable.
- Close the Objective only after an explicit closure request; do not create `closed.md` implicitly.
- Keep the Objective-stack rewrite parked unless it is explicitly pulled into a later Objective or PR.
