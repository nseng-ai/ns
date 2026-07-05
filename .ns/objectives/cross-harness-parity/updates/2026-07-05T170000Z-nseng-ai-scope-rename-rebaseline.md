# `@ns`→`@nseng-ai` package-scope rebaseline (eighth parity-rot materialization)

## Summary

Trunk-style refresh against HEAD found the record's `@ns/*` package-scope names stale: the npm workspace scope was renamed again, `@ns/*` → `@nseng-ai/*`, after the 2026-07-03 `@ji`→`ns` rebaseline. Decisive verified evidence:

- **Scope rename confirmed**: no `@ns/` scope name survives under `ts/packages/**/package.json`; git history shows `95d522a96` "Rename workspace package scope from @ns to @nseng-ai" and `423bcdce4` (the last commit to touch `objective.md`, which did not fix the scope). Package names at HEAD: `@nseng-ai/kernel` (bin `ns`), `@nseng-ai/flow`, `@nseng-ai/ccc`, `@nseng-ai/capability-kit`, `@nseng-ai/foundation` (no `@nseng-ai/core`), `@nseng-ai/clinkr`, `@nseng-ai/pi`.
- **`ns` branding unchanged and correct**: CLI bin `ns`, dirs `.ns`, config `ns.toml`, env `NS_*`, Pi surfaces `/ns:flow:*`, wrapper skills `ns-flow-*` all verified present. Only the npm scope prefix moved.
- **Flow parity progress still holds**: `ns flow` command sources exist for the ten commands (changes, cp, autobranch, branch-latest-commit, autoslot, submit, regenerate-pr, push, land, pull-trunk); Pi bridge `flow/src/pi/ns-extension.ts` uses `definePiSurfaceParity` (`piNamespace: "ns:flow"`, `cliName: "ns"`); the four wrapper skills `ns-flow-{autobranch,branch-latest-commit,cp,submit}` are installed in `.claude/skills` and `.agents/skills`.
- **cmux dispatch gap persists**: `ccc/src/cmux/{dispatch-from-trunk,dispatch-prompt,slot-dispatch-plan,slot-open-branch,prompt-file}.ts` and their Pi surfaces exist; no `definePiSurfaceParity` and no parity test anywhere in `@nseng-ai/ccc`; ccc is not wired into `.ns/extensions/`.
- **ccc-bin claim corrected**: the record said the `ccc` bin points at a missing `./src/sdl/cli.ts` and the "hidden `ccc exec autobranch`" path is gone. Verified false: `bin.ccc` = `./src/ns/cli.ts` (exists) which builds a hidden `exec` group exposing `ccc exec autobranch` + `ccc exec cmux-workspace-summary` — but not the dispatch surfaces. Its PATH/install status is unverified; dispatch still has no CLI home.
- **Path corrections**: pi-tools live at `ts/packages/internal/pi-tools/` (record said `local/pi-tools`); the typed gate also covers `capabilities/branch-context`. `focused-terminal-tab.ts` is at `capability-kit/src/cmux/`. Model-slug seam `infra/foundation/src/primitives/model-slug.ts` + `capability-kit/src/kit/model-slug.ts` (both with tests) confirmed.
- **Still verified**: `code-workflows` skill with `parity-review` route (`skills/code-workflows/references/parity-review.md`); `ns handoff list` (`capabilities/handoffs/src/ns/commands/list.ts` over `src/core/operations/list.ts`, Pi `src/pi/registration.ts`); no command-output-summaries implementation exists anywhere in the repo.

## Objective Impact

Eighth parity-table-rot materialization (scope-only rename). Rewrote `objective.md`, `roadmap.md`, and `orientation.md` to the verified `@nseng-ai/*` ground truth: renamed every `@ns/*` package reference to `@nseng-ai/*` (`@ns/core` → `@nseng-ai/foundation`), unified stale `sdl-flow-*` skill mentions to `ns-flow-*`, corrected `local/pi-tools` → `internal/pi-tools`, corrected the "shared TS ≠ shared CLI" risk and cmux-dispatch open question with the accurate `ccc` bin state, updated the rename chain to `@asdl`→`@sdl`→`@ji`→`@ns`→`@nseng-ai` (parity table now three renames behind), and bumped the rot count from seven to eight. Also refreshed only the `parity-table.md` STALE banner and machine-checkable note (meta text carrying the false `@ns/*` scope and `local/pi-tools` path); per-row verdicts remain the parity-review full sweep's job. No scope closed; no completion criterion is newly met — the three live gaps (cmux dispatch, flow skill/doctrine, command-output summaries) all persist.

Provenance: objective-refresh basis target=8fdc6f50661d8df81024bbcce3c722fb7411441d from=trunk-HEAD

## Follow-Ups

- Run the parity-review full sweep covering all three renames, the `/code:*`→`/ns:flow:*` surface changes, the `code-*`→`ns-flow-*` skill renames, and the new smart-restack/stack-squash/code-workflows surfaces.
- Resolve the FULL doctrine (wrapper skill vs typed metadata) and encode it in the parity table rules.
- Decide repair-or-retire for the `ccc` bin alongside the cmux dispatch CLI push-down, and confirm whether `ccc exec autobranch` is actually installed/reachable.
- Re-verify the former `dev-preview-url` / `objective-current` workflows in the sweep.
