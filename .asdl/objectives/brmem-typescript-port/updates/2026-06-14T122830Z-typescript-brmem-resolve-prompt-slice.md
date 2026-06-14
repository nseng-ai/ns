# TypeScript brmem resolve-prompt slice

## Summary

Implemented the hidden TypeScript `brmem exec resolve-prompt <name>` operation in `ts/packages/brmem`. The command now routes to a real operation instead of the prior `not_implemented` placeholder, keeps the `exec` subgroup hidden from top-level help, and uses the positional name `name`.

The implementation adds a package-local prompt-resolution seam separate from the Branch Memory storage gateway. The real resolver uses `git rev-parse --show-toplevel` through the shared command exec API for repository-root discovery, resolves project prompts at `<repo-root>/.brmem/prompts/<name>.md`, resolves global prompts at `<home-root>/.brmem/prompts/<name>.md`, and requires a git checkout before considering the global fallback.

Scenario coverage preserves the accepted structured contract: project-local tier, global fallback tier, project-over-global precedence, JSON `data.path` / `data.tier`, `prompt-not-found` exit-`2` failures with both checked paths and `just install-tools`, and `not-a-git-repo` exit-`2` failures before global fallback. Human mode prints the resolved path to stdout; the Python stderr `tier: <tier>` line is not emitted because current TypeScript Clinkr `renderHuman` has no stderr channel without broader framework work.

Validation passed:

- `pnpm --dir ts/packages/brmem run check`
- `pnpm --dir ts/packages/brmem run test`
- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/clinkr/test packages/brmem/test`
- `pnpm --dir ts run check`
- `pnpm --dir ts run test`

Grep sanity check:

- `rg -n "not_implemented|resolvePromptRequestSchema|notImplementedHandler" ts/packages/brmem/src ts/packages/brmem/test || true` found no stale `not_implemented` expectation and no `notImplementedHandler`; remaining `resolvePromptRequestSchema` hits are the real operation import/export.

## Objective Impact

The roadmap row `Port exec resolve-prompt` is now marked `[x]`. The standalone TypeScript `brmem` operation set now includes the hidden skill-facing prompt resolver alongside the previously ported public operations.

This is Objective-only cutover prep: no public wrapper, public skill docs, default invocation paths, or Python fallback paths were changed.

## Follow-Ups

- Cut over the public skill, wrapper, and distribution paths to the TypeScript default.
- Retire the Python fallback after the public cutover gates are evidenced.
- Feed brmem porting lessons into the umbrella TypeScript porting playbook.
- If future parity work requires Python's human stderr `tier: <tier>` behavior exactly, add or adopt a TypeScript Clinkr stderr-capable rendering API in a dedicated Clinkr slice rather than hiding that framework change inside prompt resolution.
