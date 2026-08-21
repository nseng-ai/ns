# Remove the Claude Handoff Pi Surface and Its Dead-Code Closure

## Goal and outcome

Delete the private, unreleased `/claude:handoff` Pi command and the `claude_handoff_launch` custom tool with no replacement, compatibility alias, deprecation shim, or automated Claude launcher. Maximize deletion by removing the complete production, test, manifest, discovery, parity, documentation, and coding-rule closure that exists only for this workflow.

After the change:

- Pi no longer registers or advertises `/claude:handoff` or `claude_handoff_launch`.
- `@nseng-ai/pi-ns-handoffs` no longer exports or directly discovers `./claude-extension`.
- The repository contains no Claude-specific Handoff prompt, session-name, environment-scrubbing, TUI handover, synchronous `claude` spawn, gateway type, or parity implementation.
- The ordinary portable workflow remains: create a Handoff Artifact with the existing `handoff-create` / `ns handoff create` path, launch the desired harness manually, and pick up the saved artifact with the existing pickup workflow.
- Shared Handoff launch orchestration used by self-handoff and Herdr remains intact.

The user explicitly chose a clean removal. Do not replace the deleted workflow with a CLI, redirect command, or compatibility layer.

## Context and discovered facts

### Repository and initiative context

- The source branch at planning time is `master`; the working tree is clean. Implementation must obey the repository hard gate: never commit on `main`/`master`. Create or switch to a feature branch before any checkpoint/commit, using the repository's Graphite workflow when a branch or commit is needed.
- The repository is private and unreleased, so no external compatibility period is required.
- The active `package-disposition-and-host-ontology` Objective establishes `@nseng-ai/pi-ns-handoffs` as the Pi host adapter over `@nseng-ai/handoffs/api`. This removal preserves that boundary and only shrinks a Pi-native surface.
- ADRs and dated Objective updates are immutable time-in-place records. Do not rewrite historical records merely because they describe the feature when it existed. Current inventories, parity tables, package documentation, context, and standing coding rules must be synchronized with the removal.

### Current workflow

`ts/packages/incubating/hosts/pi/extensions/pi-ns-handoffs/src/claude-command.ts` owns the entire feature:

1. `/claude:handoff` starts the shared create-then-launch prompt flow.
2. The model composes and saves a Handoff Artifact.
3. The model calls `claude_handoff_launch` with the branch and derived slug.
4. Shared launch machinery verifies that the artifact exists.
5. Claude-specific code constructs a pickup prompt and display name, removes Anthropic environment overrides, stops Pi's TUI, synchronously spawns `claude` with inherited stdio, and restores the TUI.

The feature is independently discovered through the package manifest; no `.pi/extensions/*` adapter imports it.

### Confirmed production deletion closure

The following four production files are wholly Claude-workflow-specific and can be deleted:

- `ts/packages/incubating/hosts/pi/extensions/pi-ns-handoffs/src/claude-command.ts`
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-handoffs/src/claude-extension.ts`
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-handoffs/src/interactive-claude.ts`
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-handoffs/src/interactive-spawn.ts`

This removes, among other Claude-only declarations:

- `CLAUDE_HANDOFF_COMMAND_NAME`
- `CLAUDE_HANDOFF_LAUNCH_TOOL_NAME`
- `CLAUDE_HANDOFF_STATUS_KEY`
- `claudeHandoffParity`
- `ClaudeHandoffDeps`, request/options/details types
- Claude create/pickup prompt copy
- `scrubClaudeEnv`
- Claude session-name construction
- interactive-TUI guards and narrowing
- stopped-TUI process orchestration
- Claude exit formatting
- the `InteractiveClaudeInvocation`, `InteractiveClaudeRunResult`, and `RunInteractiveClaude` gateway types
- the sole `spawnSync("claude", ...)` adapter

### Shared code that must remain

Do not over-delete these shared paths:

- `src/launch-flow.ts`: its prompt, create-command, launch-tool, verification, and failure helpers are also used by self-handoff and the declared Handoff launch composition surface.
- `src/handoff-launch.ts` and package export `./handoff-launch`: `@nseng-ai/pi-ns-herdr` consumes this declared adapter-composition surface.
- `src/investigation-sources.ts`: ordinary create, self-handoff, and shared launch flows still use its source-session metadata.
- `src/identity.ts` pickup formatting and `@nseng-ai/handoffs/api`'s `HANDOFF_NAMESPACE` / `handoffSlugToKey`: these have surviving non-Claude callers.
- The default `src/extension.ts`, package root export, Handoff command family, content-derived slug tool, self-handoff workflow, and Herdr Handoff integration.
- `test/handoff-test-fakes.ts`, which has broad non-Claude use.

### Dependency impact

No workspace dependency in `pi-ns-handoffs/package.json` becomes dead solely from this removal. Keep `@nseng-ai/brmem`, `@nseng-ai/extension-kit`, `@nseng-ai/foundation`, `@nseng-ai/handoffs`, `@nseng-ai/pi-runtime`, and `@nseng-ai/sdk`. `node:child_process` disappears with the deleted adapter but is a Node builtin, not a manifest dependency. The lockfile should not require a dependency-edge change; accept only package-manager-normalized changes that are actually produced and justified.

## Files, symbols, tests, and documentation

### Delete

- `ts/packages/incubating/hosts/pi/extensions/pi-ns-handoffs/src/claude-command.ts`
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-handoffs/src/claude-extension.ts`
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-handoffs/src/interactive-claude.ts`
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-handoffs/src/interactive-spawn.ts`
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-handoffs/test/claude-handoff.test.ts`, after relocating the two shared investigation-source test groups described below

### Edit code/config/tests

- `ts/packages/incubating/hosts/pi/extensions/pi-ns-handoffs/package.json`
  - Remove the `./claude-extension` export.
  - Remove `./src/claude-extension.ts` from `pi.extensions`.
  - Keep `.`, `./handoff-launch`, and `./src/extension.ts` discovery.
  - Do not remove dependencies without fresh usage evidence.
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-handoffs/test/handoff-pi-parity.test.ts`
  - Remove the Claude extension/parity import.
  - Stop registering the Claude extension with the fake host.
  - Compare surviving live surfaces only against `handoffParity`.
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-handoffs/test/handoff-launch-flow.test.ts` (preferred existing home) or a narrowly named investigation-source test file
  - Preserve the existing direct edge-case coverage for `deriveSourcePiSessionId` and `resolveSourcePiSessionId` currently near the end of `claude-handoff.test.ts`.
  - Do not preserve tests for Claude session naming, environment scrubbing, prompt construction, tool gating, spawn behavior, or TUI lifecycle; those behaviors are intentionally deleted.
- `ts/packages/incubating/hosts/pi/runtime/pi-runtime/test/integration/node-runtime-imports.test.ts`
  - Remove `@nseng-ai/pi-ns-handoffs/claude-extension` from `PI_HANDOFFS_EXPORT_IMPORTS`.
  - Retain the package-root and `handoff-launch` cold-import checks. The assertion uses array length, so it should adjust without a separate literal count.

### Edit live documentation and standing guidance

- `ts/packages/incubating/hosts/pi/extensions/pi-ns-handoffs/README.md`
  - Remove interactive Claude launch from package ownership.
  - Remove the `./claude-extension` entrypoint description.
  - Continue describing the root extension and `./handoff-launch` composition surface.
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-handoffs/CONTEXT.md`
  - Remove “interactive Claude launch” and “Claude entry” from present-tense package vocabulary.
  - Keep Handoff Pi registration, presentation, launch/session orchestration, parity, and adapter composition terminology where still accurate.
- `CONTEXT-MAP.md`
  - Remove “Claude entry” from the current `@nseng-ai/pi-ns-handoffs` summary.
- `docs/pi/README.md`
  - Delete the dedicated `@nseng-ai/pi-ns-handoffs/claude-extension` inventory row.
  - Keep the general `@nseng-ai/pi-ns-handoffs` and `src/extension.ts` rows.
- `.ns/objectives/cross-harness-parity/parity-table.md`
  - Delete the current `/claude:handoff` WAIVED row because there is no longer a live surface requiring parity accounting.
- `ts/packages/incubating/hosts/pi/runtime/pi-runtime/AGENTS.md`
  - Delete the special synchronous interactive-Claude spawn exception and its stale path reference.
  - Preserve and thereby strengthen the general prohibition on direct/synchronous child-process I/O in extension modules.
- `docs/wayfinding/ontology-reshape/vocab-sweep-capabilities.md`
  - Treat this as a current wayfinding/vocabulary inventory rather than an immutable ADR/update and delete the “Interactive Claude Pickup Spawn” bullet. Avoid opportunistic repair of its unrelated historical path drift.

### Preserve historical records

Do not rewrite or delete these merely to erase mentions of the removed feature:

- `.ns/objectives/cross-harness-parity/updates/2026-06-12T085347Z-fifth-rot-claude-handoff-and-code-workflows-rename.md`
- `.ns/objectives/handoff-capability-extension/updates/2026-06-27T230253Z-handoff-surface-inventory-baseline.md`
- `.ns/objectives/pi-host-decomposition/updates/2026-06-27-pi-host-boundary-inventory.md`
- closed Objective `objective.md` / `roadmap.md` statements that record the architecture at that time
- generated rename/cutover evidence under `.ns/objectives/ji-core-cutover/cutover/` and `.ns/objectives/rename-ji-to-ns/tools/cutover/`

No ADR reference to this surface was found during planning.

## Implementation steps

1. **Revalidate the deletion boundary before editing.**
   - Run bounded whole-repository searches for `/claude:handoff`, `claude_handoff_launch`, `CLAUDE_HANDOFF`, `claude-extension`, `InteractiveClaude`, `runInteractiveClaude`, `interactive-spawn`, `spawnSync("claude"`, and distinctive pickup/session-name text.
   - Classify results into live code/config/docs, tests, and immutable historical evidence. If a new production consumer has appeared, pause and revise the closure rather than deleting through it blindly.

2. **Remove package discovery and public entrypoints.**
   - Update `pi-ns-handoffs/package.json` first so the intended surviving surface is explicit: package root plus `./handoff-launch`, with only `src/extension.ts` directly discovered.
   - Remove the Claude subpath from the cold-import inventory.

3. **Delete the complete Claude production implementation.**
   - Delete the four source files as units; do not retain generic-looking helpers such as environment scrubbing or process result types without a live caller.
   - Let TypeScript and bounded searches reveal any missed imports or exports.

4. **Delete Claude behavior tests while preserving shared helper coverage.**
   - Move the `deriveSourcePiSessionId` table and `resolveSourcePiSessionId` precedence/fallback test from `claude-handoff.test.ts` into `handoff-launch-flow.test.ts` or a dedicated `investigation-sources.test.ts` if that produces a clearer cohesive unit.
   - Delete `claude-handoff.test.ts` in full after the move.
   - Simplify `handoff-pi-parity.test.ts` to register only the surviving default extension and compare only `handoffParity`.
   - Do not convert deleted Claude behavior tests into snapshots or compatibility assertions; absence is the desired behavior.

5. **Synchronize current documentation, context, parity inventory, and coding rules.**
   - Make the targeted edits listed above.
   - Keep terminology consistent: Handoff Artifacts remain portable; only the Pi-native interactive Claude launch is removed.
   - Do not update `CONTEXT.md` ahead of implementation; perform these context edits in the same change as the code deletion.

6. **Run a transitive dead-code and stale-surface sweep.**
   - Repeat bounded searches for all deleted identifiers and paths.
   - Expected remaining matches should be limited to intentionally preserved historical records. Inspect each non-historical result rather than blanket-replacing it.
   - Search for newly unused imports, exports, types, test fakes, manifest dependencies, package subpaths, and special-case documentation. Delete additional items only when no surviving caller exists.
   - Confirm `launch-flow.ts`, `investigation-sources.ts`, `handoff-launch.ts`, and `./handoff-launch` still have the surviving consumers identified above.

7. **Normalize and validate.**
   - Use repository format/lint autofixers if validation requests them; do not hand-format formatter-owned output.
   - Review the final diff for a deletion-heavy result and ensure no replacement feature or compatibility residue was introduced.

## Validation guidance

Use changed-file judgment for focused feedback, then run the repository-required broad validation.

Suggested sequence:

1. Focused Handoff adapter package tests and typecheck through the workspace/package scripts.
2. The Pi runtime integration cold-import test containing `PI_HANDOFFS_EXPORT_IMPORTS`.
3. `just ts-check` or `pnpm --dir ts run check`.
4. `just ts-test` for the full TypeScript suite.
5. `just ts-test-typescript-style-guard`, because the change removes an explicit architecture-rule exception and changes TypeScript package architecture.
6. `just` as the default repository validation entrypoint. If it reports a dprint failure, run `just dprint-fix` and rerun validation; use `just ts-format-fix` / `just ts-lint-fix` for TypeScript formatter/linter failures as directed by repository policy.
7. Run integration validation appropriate to the changed cold-import test (`just ci` if practical, or the repository's focused integration lane) and report any lane not run.

Behavioral assertions to retain:

- The default Handoff Pi extension still registers its surviving command/tool surface and parity metadata exactly.
- `@nseng-ai/pi-ns-handoffs` and `@nseng-ai/pi-ns-handoffs/handoff-launch` cold-import successfully.
- `@nseng-ai/pi-ns-herdr` still composes the Handoff launch surface.
- Shared source Pi session-ID derivation retains its edge-case coverage.
- Package discovery no longer loads the Claude extension.
- No live registration or documentation advertises `/claude:handoff` or `claude_handoff_launch`.

## Risks, assumptions, and open questions

### Settled assumptions

- Clean removal is intentional; manual handoff creation, manual harness launch, and ordinary pickup are sufficient.
- No compatibility alias, deprecation period, replacement CLI, or migration notice is required.
- Historical Objective updates and generated cutover evidence remain as records of past repository state.
- The wayfinding vocabulary sweep is maintained current inventory and should lose the obsolete bullet; if implementation discovers an explicit header declaring that file immutable/time-stamped, preserve it and note that exception in the final report instead.

### Risks

- **Over-deleting shared launch infrastructure:** Claude uses generic launch helpers, but self-handoff and Herdr also use them. Verify surviving references before deleting any shared symbol.
- **Losing non-Claude test coverage:** two investigation-source helper test groups currently live inside the Claude test file. Move them before deleting the file.
- **Stale manifest/discovery references:** deleting source without removing both `exports` and `pi.extensions` would break runtime loading.
- **Historical-document churn:** maximizing code deletion does not authorize rewriting immutable records. Limit historical matches deliberately.
- **False dependency cleanup:** all six declared workspace dependencies retain surviving users according to planning evidence. Recheck usage, but do not remove dependencies merely because Claude imported them too.
- **Planning-time branch state:** implementation may begin from a different branch or changed tree. Revalidate references and never commit directly on `master`.

No material product questions remain.

## Review and remediation

Before declaring completion:

1. Inspect `git diff --stat` and the full diff. The change should be predominantly deletion, with small targeted edits and only a small relocation of shared tests.
2. Run a final bounded repository search for all removed command/tool/file/type identifiers. Explain every remaining match as immutable historical evidence; remove every unexplained live match.
3. Verify package manifest consistency: no export points to a deleted file, and Pi discovery lists only existing entrypoints.
4. Verify parity consistency: the live parity table and package parity test contain no Claude Handoff row or metadata, while surviving Handoff surfaces still match.
5. Verify context synchronization: package README, package `CONTEXT.md`, root `CONTEXT-MAP.md`, and Pi inventory describe the implemented surface, not the removed one.
6. Verify the process-I/O rule no longer grants a dead exception.
7. Confirm the Herdr composition export and self-handoff flow remain tested and unchanged in behavior.
8. If validation reveals additional genuinely dead Claude-only code, extend the deletion closure and rerun the searches and relevant tests. If it reveals a previously unknown live consumer, preserve that shared code and document why it falls outside the deletion closure.
9. In the implementation report, list deleted files, live documentation/config edits, intentionally preserved historical references, validation commands/results, and any additional dead-code deletion discovered during implementation.