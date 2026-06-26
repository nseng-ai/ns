# TypeScript Port Complete — Migration Pause Lifted

## Summary

Trunk-explicit rebaseline of `vibechk-v1` against current repository ground truth at HEAD. The prior record's central framing — remaining v1 feature work "paused while the TypeScript port migrates the implemented surface" — is now stale and has been corrected.

Decisive verification evidence:

- The companion `vibechk-typescript-port` Objective is closed: `.sdl/objectives/vibechk-typescript-port/closed.md` exists and its closure section confirms the TypeScript cutover and Python retirement completed.
- The implemented surface now lives in TypeScript: `ts/packages/tools/vibechk/package.json` declares `@sdl/vibechk`; `ts/packages/tools/vibechk/src/cli.ts` registers `run`, `show`, `diff`, `runs` and reports `runtime: typescript`. No Python `packages/vibechk` files remain (`git ls-files -- 'packages/vibechk*'` is empty).
- Repository namespace was renamed `asdl` -> `sdl` at baseline commit `a1cc7fb2b` ("Rename repository namespace from asdl to sdl"). The remote is `nseng-ai/sdl-tools`. The old record's `.asdl/...` paths and `dagster-io/asdl-tools` issue URL are stale; issue #434 is preserved as a spec anchor without asserting a live link.
- Still-incomplete v1 work confirmed by ground truth: `publish` is not implemented (it appears only in the CLI description string, no command is registered); `buildProductionRunnerRegistry` in `src/runners.ts` returns only `[new ClaudeRunner()]`, so `codex` and `pi` adapters are absent; no real GitHub publish smoke evidence exists.

## Objective Impact

`objective.md` and `roadmap.md` were rewritten from the verified contract:

- Removed the "migration pause" narrative and the Non-Goal that forbade implementing remaining v1 features in Python during the port; remaining v1 work (`publish`, `codex`, `pi`, real publish smoke) is now unblocked and proceeds on the TypeScript implementation.
- Restated the implementation home as `@sdl/vibechk` at `ts/packages/tools/vibechk/` (Python `packages/vibechk` retired) and switched layout/test conventions language from Python to TypeScript/Clinkr/Vitest.
- Updated namespace references (`.asdl` -> `.sdl`) and weakened the issue #434 URL claim.
- Annotated completion criteria and roadmap rows with current implemented-vs-remaining status; the formerly-`[x]` walking-skeleton/store/runner-contract/git/reports/store-hardening rows remain done (now in TypeScript), and the remaining `codex`/`pi`/`publish`/smoke/validation rows stay open.

The Objective remains open as the product source for full v1 behavior. No closure was performed.

Provenance: objective-refresh basis target=HEAD from=a1cc7fb2b

## Follow-Ups

- Implement `publish` (`gh` PR fence insertion/replacement, PR-reference resolution, remote branch validation) on the TypeScript implementation.
- Add `codex` and `pi` runner adapters plus per-runner metric normalization coverage.
- Run and record a real GitHub PR publish smoke before closure.
- Decide the fate of original issue #434 given the `asdl` -> `sdl` repository rename.
