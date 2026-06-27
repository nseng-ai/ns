# clinkr display library and representative rebuild landed

## Summary

Current local stack evidence shows the prototype north star has been rebuilt on real clinkr foundations:

- `@sdl/clinkr/theme` and `@sdl/clinkr/stream` exist as opt-in subpath exports. The core barrel exports caps/emit/io but does not re-export theme or stream; the display subpaths own `ansis` and `log-update` usage.
- `Caps` settled on `{ isTty, colorDepth, columns, supportsUnicode }`, with pure `resolveCaps(snapshot)`, real-process caps for direct terminals, and settled non-interactive caps for callback/hosted sinks.
- The stream sink owns the TTY live region through `log-update`, restores the cursor, decouples spinner repaint from step dwell, and degrades under non-TTY to one settled plain frame plus per-phase transients through the host `onOutput` path.
- `objective list` now uses `@sdl/clinkr/theme` for the human surface while preserving the clinkr `--format json` machine path.
- `flow submit` (and `flow cp`) now drive `@sdl/clinkr/stream`; TTY raw submit transcript text is routed through the live tail so the in-place writer remains the sole stdout owner, while Pi/callback/pipe/test sinks get settled non-interactive caps unless a host caps hint is supplied.

Validation run during this update:

```text
cd ts && pnpm vitest run --config vitest.config.ts packages/infra/clinkr/test packages/objective/test/unit/list-objectives-pretty.test.ts packages/objective/test/scenario/list-objectives-cli.test.ts packages/capabilities/flow/test/unit/phase-stream.test.ts packages/capabilities/flow/test/scenario/submit-command.test.ts packages/capabilities/flow/test/scenario/cp-command.test.ts packages/sdl/test/integration/flow-extension-cli.test.ts
# 29 test files passed; 376 tests passed
```

PR evidence considered: current PR #2221 (open) hardens the clinkr/objective rendering APIs and stream behavior after the rebuild; the selected Objective progress itself is evidenced primarily by the local stack from `master` through the current branch, not by merge state.

## Objective Impact

- The opt-in display-library row is complete: theme and stream subpaths exist, own the heavy display dependencies, and are not exposed through the core clinkr barrel.
- The representative rebuild row is complete for implementation: `objective list` and `flow submit` now use the real foundations and preserve the intended human/machine split for `objective list`.
- The buffered emit portion of the machine/human emit row is done, and the human streaming path is in place. The remaining semantic gap is the streaming machine contract: `flow submit` still declares no `--format` path, so JSONL/stdout semantics remain undecided.
- Import-boundary enforcement is partially de-risked by the core import-isolation canary test, but the formal lint/guard remains open.
- The prior open questions about `objective list` placement and exact `Caps` shape are resolved by implementation.

## Follow-Ups

- Decide and implement the streaming machine-output contract, or explicitly narrow the Objective if `flow submit` should remain human-only.
- Promote the early core import-isolation canary into the intended formal import-boundary lint/guard.
- Run full repo validation (`just`) as closure evidence once the remaining semantic rows are complete.
