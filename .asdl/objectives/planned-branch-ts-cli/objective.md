# planned-branch TS CLI

## Thesis

The planned-branch workflow — `write-plan` → `create` → `impl` — should no longer live only inside the Pi extension layer. Extract its deterministic core into a publishable, user-facing TypeScript workspace package, `@asdl/planned-branch` (bin `planned-branch`), so one tested core backs three surfaces:

1. hidden `planned-branch exec ...` primitives for agent/skill invocation;
2. the Pi extension, which imports the core while retaining Pi-only UI/session/model behavior; and
3. public Claude Code skills, which shell out to the bin.

The implementation should make the workflow first-class in Claude Code while preserving Pi↔Claude storage interoperability. This package is the repo's first publishable TypeScript feature CLI and should become the pattern for future TS asdl packages, but actual npm registry publication/release automation is parked.

## Scope

- Create a new workspace package at `ts/packages/planned-branch` named `@asdl/planned-branch`, with a `planned-branch` bin and a package manifest that is publishable (`private` is absent/false). Actual npm publication and release automation are parked.
- Extract the Pi-independent planned-branch core from `ts/packages/pi-extensions/src/planned-branch/*` into the new package, replacing `pi.exec`/`PlanCommandExecApi` coupling with an `Exec` gateway, real adapter, and in-memory/scripted fake per `typescript-fake-driven-testing`.
- Keep the package model-free. Callers must supply saved-plan and planned-branch slugs; slug derivation stays in the harness layer (Claude skills derive inline; Pi keeps the tiny-model slug calls in the extension layer).
- Have the core own deterministic workflow policy for:
  - local saved-plan storage at `~/.asdl/planned-branch/plans/<repo>/<encoded-source-branch>/<slug>.md`;
  - explicit-path and latest-source-branch plan resolution;
  - planned branch creation through `git` or `gt`;
  - Branch Memory attachment through the `brmem` CLI namespace `planned-branch`; and
  - attached-plan selection/loading plus implementation-prompt rendering.
- Implement the hidden CLI operations below. They are the stable contract the Claude skills call; output should support machine-readable JSON for skill use and human-readable errors for diagnostics.
  - `planned-branch exec write-plan-file --slug <saved-plan-slug> [--summary <text>] --stdin|--content-file <path> [--format json]`
  - `planned-branch exec resolve-plan [absolute-or-home-plan-file.md] [--format json]`
  - `planned-branch exec create --slug <planned-branch-slug> --plan-file <path> [--branch <branch>] [--branch-creation plain-git|graphite] [--summary <text>] [--format json]`
  - `planned-branch exec load-plan [key-or-slug] [--format json]`, returning selected attached-plan evidence and a ready-to-send implementation prompt.
- Refactor the Pi extension to import the extracted package core instead of duplicating planned-branch logic. Pi-only responsibilities remain in `@asdl/pi-extensions`: command registration, wait-for-idle/send-message/UI behavior, session-history "latest plan" resolution, and tiny-model slug derivation.
- Rename the Pi slash-command surface to `/planned-branch:write-plan`, `/planned-branch:create`, and `/planned-branch:impl`. Update `.pi/extensions/*` adapters and any cmux helpers that launch or inspect planned-branch outputs.
- Rename storage to the single token `planned-branch`: Branch Memory namespace `brmem-plans` → `planned-branch`, and local store `~/.asdl/plans/...` → `~/.asdl/planned-branch/plans/...`, across code, tests, docs, prompts, and status renderers.
- Author three public Claude Code skills — `planned-branch-write-plan`, `planned-branch-create`, and `planned-branch-impl` — with `skills/<name>` symlinks for discoverability. Skills shell out to the bin and describe CLI operations only; they must not reference internal TypeScript module paths or implementation classes.
- Update workflow documentation (`docs/pi/planned-branch-workflow.md` and related references) to the new package, namespace, local store path, command names, CLI contracts, and cross-harness flow.

## Non-Goals

- No generalized branch-artifacts framework or umbrella CLI above Branch Memory. `brmem` remains the generic substrate; planned-branch is one workflow, sibling to handoff.
- No model/text-generation dependency inside `@asdl/planned-branch`; no CLI-side slug generation.
- No reimplementation of Branch Memory storage in TypeScript. The package shells out to the `brmem` CLI until/unless brmem itself ports to TS.
- No backwards-compatibility shim or data migration for the renamed namespace/store path. This workflow is still unreleased/private enough to accept the break.
- No thin human browsing surface (`planned-branch list` / `planned-branch show`) in this implementation stack.
- No actual npm registry publication, release pipeline, or TS umbrella/plugin-discovery mechanism in this Objective.
- No PR submission, npm publication, or external-system mutation unless explicitly requested after implementation.

## Completion Criteria

- `@asdl/planned-branch` is the single deterministic source of truth: planned-branch creation, storage, loading, prompt rendering, validation, and command output are implemented in the package and tested through fake-driven unit tests plus CLI scenario tests.
- The hidden exec operations work end-to-end from Claude Code skills and from Pi-imported core behavior against the same `planned-branch` Branch Memory namespace and `~/.asdl/planned-branch/plans/...` local store. A plan written from one harness can be branched and implemented from the other.
- `@asdl/pi-extensions` contains only Pi-specific planned-branch orchestration and imports the extracted core. The old `/write-plan`, `/create-planned-branch`, and `/impl-planned-branch` command names are replaced by `/planned-branch:write-plan`, `/planned-branch:create`, and `/planned-branch:impl` in adapters, tests, docs, and cmux launch paths.
- The namespace/store rename is complete across source, tests, docs, prompts, and status rendering: no active planned-branch path still uses `brmem-plans` or `~/.asdl/plans/...` except in historical/transition prose that intentionally explains the break.
- The three public Claude skills exist under `skills/` and are installed/discoverable through `.agents/skills` symlinks; their prose is user-facing and references CLI operations rather than internal implementation details.
- Evidence: `just ts-check` and `just ts-test` pass; the new package has CLI scenario coverage for top-level help/version and each `exec` operation; documentation reflects the new package, namespace, path, and command surface.

## Definition of Progress

Progress is keepable when:

- one reviewable slice has a single clear thesis and leaves the repo in a coherent state for that slice;
- deterministic planned-branch behavior moves from Pi-only code into the package or a Pi/cmux/skill surface is adjusted to the extracted package contract;
- tests or docs demonstrate the same cross-harness storage contract (`planned-branch` namespace and `~/.asdl/planned-branch/plans/...` store);
- validation appropriate to the slice has passed, or a concrete blocker is recorded with no hidden partial external mutation.

Do not keep changes that:

- duplicate deterministic planned-branch logic in both `@asdl/planned-branch` and `@asdl/pi-extensions`;
- add model/text-generation dependencies to the package or CLI;
- silently preserve old command/storage names as compatibility shims;
- broaden the scope into a generic artifact framework, npm release automation, or an `asdl` TS umbrella; or
- leave package extraction half-wired such that Pi and Claude use different storage contracts.

Useful evidence includes:

- fake-driven unit tests for store path derivation, command execution, branch creation, Branch Memory parsing, attached-plan selection, and prompt rendering;
- CLI scenario tests exercising `planned-branch --help`, `planned-branch --version`, and the hidden `exec` operations;
- Pi extension tests proving namespaced commands, session-history latest-plan resolution, tiny-model slug derivation, and imported-core calls;
- skill/docs diffs showing the public flow and command contracts; and
- `just ts-check` / `just ts-test` pass results.

## Runner Policy

This Objective is execution-friendly for `objective-stack-impl` after the normal preview/confirmation gate.

- Direct execution is allowed when the preview plans a small Graphite stack of one to three independently reviewable branches. The expected full implementation stack is:
  1. extract `@asdl/planned-branch` core and CLI exec primitives;
  2. refactor Pi/cmux surfaces to import the package and use the namespaced command/storage contract; and
  3. add Claude skills plus workflow docs and final validation.
- Work may change files under `ts/packages/planned-branch/`, `ts/packages/pi-extensions/`, `.pi/extensions/`, `skills/planned-branch-*`, `.agents/skills/planned-branch-*` symlinks, `.claude/skills/planned-branch-*` symlinks when generated by skill tooling, `docs/pi/`, and this Objective record. It may also update workspace lock/config files required for the new TS package.
- Use the TypeScript style and TypeScript fake-driven testing skills for implementation slices, and the skill-management skill when creating/installing public skills.
- Prefer parent-orchestrated runner subagents one slice at a time. Each subagent prompt should include the selected Objective slug, the current slice thesis, exact expected command/storage names, model-free package boundary, and validation commands.
- Validation before keeping a slice: run targeted `bun test`/`tsc` for changed TS packages when available; run `just ts-check` and `just ts-test` before treating the Objective as fully implemented. Run dprint/markdown formatting checks or autofixes for skill/docs changes when needed.
- Steer or ask first if implementation evidence suggests the CLI contract above is unsuitable, package publication setup must be decided now, the namespace break is no longer acceptable, Pi command backward compatibility is requested, `brmem` JSON contracts differ from current expectations, or cmux behavior needs product choices beyond renaming launch/read paths.
- Do not submit PRs, publish npm packages, mutate GitHub state, add release automation, or migrate old local/Branch Memory data unless explicitly requested after the implementation preview.

## Assumptions and Risks

Assumptions:

- The deterministic modules currently under `ts/packages/pi-extensions/src/planned-branch/*` are extractable with modest adaptation: existing command-runtime and brmem helpers may need to move, be copied, or be re-expressed behind the new package's `Exec` gateway, but Pi UI/session/model behavior can remain outside the package.
- The `brmem` CLI `put`/`get`/`list --namespace ... --format json` contract is stable enough for the new package and skills to shell out to it.
- Claude can derive acceptable kebab-case slugs inline from plan content for the skill workflow; Pi can continue deriving slugs through its tiny-model calls before invoking package core.
- A standalone `ts/packages/planned-branch` feature CLI is the right first TS package boundary; an umbrella `asdl` TS CLI can mount it later if needed.
- Workspace dependency wiring lets private `@asdl/pi-extensions` import the new package without introducing runtime Pi dependencies into `@asdl/planned-branch`.

Risks:

- Renaming `brmem-plans` → `planned-branch` and `~/.asdl/plans/...` → `~/.asdl/planned-branch/plans/...` orphans existing attached/saved plans. This is accepted for implementation, but final docs should call out the break and the final validation pass should confirm no active tests/docs unintentionally depend on the old names.
- The new package's runtime dependency on Python `brmem` dents standalone adoptability. Accepted for now; the package boundary should make a later TS brmem import/adaptor swap straightforward.
- As the first publishable TS package, package manifest/bin/exports details may surface new workspace conventions. Mitigate by keeping publication automation parked and validating local bin/workspace behavior only.
- Pi's session-history latest-plan resolution and tiny-model slug derivation are easy to regress while deleting duplicate logic. Keep those responsibilities explicitly in Pi extension tests.
- cmux helpers and worktree/status renderers contain planned-branch command and namespace references outside the obvious planned-branch extension files; the implementation must search and update those references deliberately.

## Open Questions

- None blocking the implementation stack. Parked questions remain: what a future human `planned-branch list/show` surface should read, and what exact npm publication/release automation should look like when actual publication is requested.
