# `@ji` cutover + Flow capability rebaseline (seventh parity-rot materialization)

## Summary

Trunk refresh against `master` HEAD found a second workspace-wide rename plus major delivered parity progress since the 2026-06-26 rebaseline. Decisive verified evidence:

- Scope cutover `@sdl/*` → `@ji/*` (no `@sdl/` remains under `ts/packages/`); `.sdl` → `.ji`, `sdl.toml` → `ji.toml` (commit d6184e4c4); the CLI is a single `ji` bin owned by `@ji/kernel` (`ts/packages/kernel/package.json` bin); model env vars are `JI_*` (`JI_SLUG_MODEL`, `JI_CCC_SIDEBAR_MODEL`, `JI_CHANGES_MODEL`, etc.; `PI_DRAFT_MODEL` unchanged).
- Package tree restructured: capabilities under `ts/packages/capabilities/` (address, aretro, branch-context, ccc, flow, handoff, objective, plans, roaster, slot); `@ji/capability-kit` at `ts/packages/capability-kit/`; the standalone autobranch package is gone — its core lives in `@ji/flow` (`ts/packages/capabilities/flow/src/autobranch/`); the land core moved from ccc into `@ji/flow` (`ts/packages/capabilities/flow/src/land/`); `focused-terminal-tab.ts` moved to `ts/packages/capability-kit/src/cmux/`; model-slug is `ts/packages/infra/core/src/primitives/model-slug.ts` with a kit split at `ts/packages/capability-kit/src/kit/model-slug.ts`.
- **Flow capability parity progress**: `ji flow --help` live-verified ten commands (changes, cp, autobranch, branch-latest-commit, autoslot, submit, regenerate-pr, push, land, pull-trunk). `ji flow land --help` confirms the unified "current PR or Graphite stack" land command with `--dry-run`/`--yes`/`--free`; land tests exist under `capabilities/flow/test/land/` plus hermetic land-stack sandbox integration commits. Pi `/ji:flow:*` commands are thin CLI bridges (`flow/src/pi/ji-extension.ts`, `registerCliCommandExtension`) with typed `definePiSurfaceParity` metadata declaring all ten FULL (`cli: ji flow <name>`, `ownerObjective: cross-harness-parity`). The former `/code:*` flow commands are gone (`@ji/flow/pi/code-extension` registers only smart-restack and stack-squash).
- Skill coverage is partial: wrapper skills exist only as `sdl-flow-autobranch`, `sdl-flow-branch-latest-commit`, `sdl-flow-cp`, `sdl-flow-submit` (renamed from `code-*`, commit 6d51a05b1; installed in `.claude/skills` and `.agents/skills`). No skill drives `ji flow land|push|autoslot|changes|pull-trunk|regenerate-pr` (`rg "ji flow land" skills/` is empty).
- **cmux dispatch gap persists**: `/ccc:workspace:dispatch-plan` (+ `/ccc:surface:dispatch-plan`), `/ccc:workspace:dispatch-prompt`, `/ccc:workspace:open-branch`, `/ccc:claude-plan-tab` are registered Pi-only (`capabilities/ccc/src/pi/`), with no CLI entry, no skill, and no `definePiSurfaceParity` metadata or parity test in `@ji/ccc`.
- The `ccc` bin is dead: `package.json` bin points at `./src/sdl/cli.ts` which does not exist (the file is `./src/ji/cli.ts`), and `ccc` is not on PATH — the previously-recorded hidden `ccc exec autobranch` reachability path is gone; autobranch reachability runs through `ji flow autobranch`.
- Typed parity gate is now distributed: per-package `*-parity.test.ts` fake-host gates in `capabilities/flow`, `capabilities/handoff`, `capabilities/objective`, `local/pi-tools`, plus `hosts/pi/test/parity.test.ts`; the extension definition moved to `ts/packages/hosts/pi/src/runtime/parity-extension.ts` (export `@ji/pi/parity/extension`).
- Still verified: `code-workflows` skill with `parity-review` route (`skills/code-workflows/references/parity-review.md`); handoff CLI is `ji handoff list` with typed metadata; no command-output-summaries implementation exists anywhere in the repo.

## Objective Impact

Seventh parity-table-rot materialization. Rewrote `objective.md`, `roadmap.md`, and `orientation.md` to the verified `@ji/*` ground truth: marked the stack-landing push-down row `[~]` (CLI + Pi bridge delivered; skill leg open), replaced the separate autoslot/push/single-PR decision rows with one flow-family skill/doctrine row (each now has a CLI; `ji flow changes` supersedes the old `/code:changes` waiver), updated the cmux dispatch row to include typed-metadata coverage and the ccc-bin repair-or-retire decision, and updated the delivered typed-gate row to the distributed per-package shape. Refreshed `parity-table.md`'s STALE banner and machine-checkable note only; per-row re-verdicts remain the parity-review full sweep's job, now spanning two renames of drift. New open doctrine question recorded: whether typed FULL metadata without a wrapper skill satisfies this Objective's FULL rule — the flow metadata and the table rule currently disagree.

Provenance: objective-refresh basis target=5668ac5630b2bab397ef85b9e4cfe4d5cd84c420 from=trunk-HEAD

## Follow-Ups

- Run the parity-review full sweep covering both renames, the `/code:*`→`/ji:flow:*` surface changes, the `code-*`→`sdl-flow-*` skill renames, and the new smart-restack/stack-squash/code-workflows surfaces.
- Resolve the FULL doctrine (wrapper skill vs typed metadata) and encode it in the parity table rules.
- Decide repair-or-retire for the broken `ccc` bin alongside the cmux dispatch CLI push-down.
- Re-verify the former `dev-preview-url` / `objective-current` workflows in the sweep (`sdl-submit` is re-covered by `ji flow submit` + `sdl-flow-submit`).
