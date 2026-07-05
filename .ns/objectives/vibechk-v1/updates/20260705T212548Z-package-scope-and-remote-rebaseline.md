# Package Scope and Remote Rebaseline to @nseng-ai/ns

## Summary

Trunk-explicit rebaseline of `vibechk-v1` against repository ground truth at HEAD. The `ji`→`ns` cutover (commit `bd7fb64d9`, 2026-07-05) mechanically rewrote several namespace tokens in this record, introducing two stale claims that this update corrects:

- The workspace package name was written as `@ns/vibechk`, but the actual npm scope is `@nseng-ai`. `ts/packages/tools/vibechk/package.json` declares `"name": "@nseng-ai/vibechk"`, every workspace package under `ts/packages/` uses the `@nseng-ai/*` scope (20 packages), the vibechk source imports only from `@nseng-ai/*`, and no `@ns/*` package name exists anywhere in `ts/packages/`. The scope-rename chain is `@sdl` → `@ji` → `@nseng-ai`, not `@sdl` → `@ji` → `@ns`.
- The record named the remote as `nseng-ai/sdl-tools`; the actual remote is `github.com/nseng-ai/ns` (`git remote -v`). The repository itself was renamed to `ns`.

All substantive product claims re-verified against HEAD and unchanged:

- CLI (`src/cli.ts`) registers exactly `run`, `show`, `diff`, `runs`; `publish` appears only in the entry description string and is not implemented.
- `buildProductionRunnerRegistry` (`src/runners.ts:125`) returns only `[new ClaudeRunner()]`; `codex` and `pi` adapters remain absent.
- Store resolution honors `--store`, `VIBECHK_HOME`, and an XDG state-home default (`src/store.ts`); run ids are 8 hex chars (`randomHex(4)`, `src/ids.ts`); result branches use the `vibechk/<run-id>` prefix.
- `FakeRunner` seam plus fake-driven unit/integration/scenario tests exist under `ts/packages/tools/vibechk/test/`.
- Python `packages/vibechk` remains retired (`git ls-files` empty); `.ns/objectives/vibechk-typescript-port/closed.md` exists, so the port Objective remains closed.

## Objective Impact

`objective.md` (Thesis: issue/remote paragraph and current-state paragraph; Implementation Scope package bullet) and the `roadmap.md` state note were corrected from `@ns/vibechk` to `@nseng-ai/vibechk`, the scope-rename chain now ends in `@nseng-ai`, and the remote reference now reads `github.com/nseng-ai/ns`. No scope, completion criteria, roadmap-row status, assumption, or open-question changes were needed. Remaining v1 work is unchanged: `publish`, the `codex`/`pi` runner adapters, publish-related coverage, a real GitHub PR publish smoke, and final validation. The Objective remains open; no closure was performed. The earlier update `20260703T171408Z-package-scope-renamed-to-ji.md` named `@ji/vibechk`, accurate for its time and superseded on this point by this update.

Provenance: objective-refresh basis target=8fdc6f50661d8df81024bbcce3c722fb7411441d from=trunk-HEAD

## Follow-Ups

- Implement `publish` (`gh` PR fence insertion/replacement, PR-reference resolution, remote branch validation) on the TypeScript implementation.
- Add `codex` and `pi` runner adapters plus per-runner metric normalization coverage.
- Run and record a real GitHub PR publish smoke before closure.
