# Package Scope Renamed to @ji/vibechk

## Summary

Trunk-explicit rebaseline of `vibechk-v1` against repository ground truth at HEAD. One stale material claim was corrected: the implemented surface's workspace package is now named `@ji/vibechk`, not `@sdl/vibechk`. `ts/packages/tools/vibechk/package.json` declares `"name": "@ji/vibechk"`, the package imports `@ji/core/cli-runtime` and `@ji/capability-kit/xdg`, and no `@sdl/*` package names remain anywhere in `ts/packages/` — the TypeScript workspace scope was renamed `@sdl` -> `@ji` after the previous rebaseline. The package path `ts/packages/tools/vibechk/` is unchanged.

All other material claims re-verified against HEAD:

- CLI registers exactly `run`, `show`, `diff`, `runs` (`src/cli.ts`); `publish` appears only in the description string and remains unimplemented.
- `buildProductionRunnerRegistry` in `src/runners.ts` still returns only `[new ClaudeRunner()]`; `codex` and `pi` adapters remain absent.
- Store resolution honors `--store` (per-command option), `VIBECHK_HOME`, and an XDG state-home default (`src/store.ts`).
- Run ids are 8 hex characters (`randomHex(4)` in `src/ids.ts`); result branches use the `vibechk/<run-id>` prefix and are created only when the workdir has changes (`src/workflow.ts`).
- `FakeRunner` seam and fake-driven unit/integration/scenario tests exist under `ts/packages/tools/vibechk/test/`.
- Python `packages/vibechk` remains retired (`git ls-files` empty); `.ji/objectives/vibechk-typescript-port/closed.md` exists, so the port Objective remains closed; the remote is `nseng-ai/sdl-tools`.

## Objective Impact

`objective.md` (Thesis current-state paragraph, Implementation Scope package bullet) and the `roadmap.md` state note were corrected from `@sdl/vibechk` to `@ji/vibechk`, with a thesis clause noting the `@sdl` -> `@ji` workspace scope rename. No scope, criteria, roadmap-row status, assumption, or open-question changes were needed; remaining v1 work is unchanged: `publish`, `codex`/`pi` runner adapters, publish-related coverage, a real GitHub PR publish smoke, and final validation. The earlier update `20260626T210205Z-tsport-complete-pause-lifted.md` names `@sdl/vibechk`; it remains accurate for its time and is superseded on this point by this update.

Provenance: objective-refresh basis target=5668ac5630b2bab397ef85b9e4cfe4d5cd84c420 from=trunk-HEAD

## Follow-Ups

- Implement `publish` (`gh` PR fence insertion/replacement, PR-reference resolution, remote branch validation) on the TypeScript implementation.
- Add `codex` and `pi` runner adapters plus per-runner metric normalization coverage.
- Run and record a real GitHub PR publish smoke before closure.
