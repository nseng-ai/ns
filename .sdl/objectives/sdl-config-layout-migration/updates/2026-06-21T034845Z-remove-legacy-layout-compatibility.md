# Remove legacy layout compatibility surfaces

## Summary

Implemented the cleanup slice that removes repo-owned legacy layout compatibility from active runtime code, tests, docs, skills, prompt text, and branch-context domain language. Canonical storage is now XDG for user/global state/config/data and checked-in `.sdl/...` for repository-owned resources.

## Runtime changes

Removed active fallback/read/override surfaces:

- Saved/enriched plans now use only `$XDG_STATE_HOME/sdl/enriched-plan` by default. `ts/packages/plans/src/saved-plan-file.ts` no longer imports `legacyHomePath`, no longer lists or resolves `~/.sdl/enriched-plan`, and no longer rejects writes because a same-slug legacy file exists.
- SDL global extensions now search only `$XDG_DATA_HOME/sdl/extensions` between built-ins and project `.sdl/extensions`. `~/.sdl/extensions` is no longer part of extension discovery.
- `brmem exec resolve-prompt <name>` now resolves project prompts from `<repo>/.sdl/prompts/<name>.md`, then global prompts from `$XDG_CONFIG_HOME/sdl/brmem/prompts/<name>.md`. Project `.brmem/prompts` and global `~/.brmem/prompts` are no longer checked.
- Branch-context `plan.md` is no longer a supported attached-plan key. Explicit load/attach of `plan.md` fails with an actionable reattach-under-`<slug>.md` message; auto-selection ignores unsupported `plan.md` and selects a single supported named Markdown key when present. Listing labels `plan.md` as unsupported for diagnostics rather than treating it as readable plan storage.
- Slot roots now resolve only through `$XDG_STATE_HOME/sdl/slots`; `SLOTS_ROOT` support and its unused display constant are removed.
- `legacyHomePath()` was removed from `@sdl/core/xdg` after all active callers were deleted.

## Docs, skills, and domain language

Updated active surfaces to match the new contract:

- `.sdl/prompts/plans-write.md`
- `docs/xdg-base-directory-spec.md`
- `docs/pi/README.md`
- `docs/pi/branch-context-workflow.md`
- `docs/adr/0006-branch-context.md` (current branch-context decision wording only)
- `docs-site/src/content/docs/tools/slot.md`
- `ts/packages/sdl/README.md`
- `ts/packages/slot/README.md`
- `ts/packages/pi-extensions/src/branch-context/enriched-plan-save.ts`
- `skills/branch-context-impl/SKILL.md`
- `skills/branch-context/references/lifecycle.md`
- `skills/branch-context/references/diagnostics-admin.md`
- `skills/brmem/SKILL.md`
- `ts/packages/pi-extensions/CONTEXT.md` deliberately rebaselined Local plan store and Attached plan terminology.

## Retained / not cleanup targets

- Branch Memory Snapshot Refs under `refs/brmem/*` remain canonical storage, not compatibility. No alternate legacy ref-layout fallback was found or removed.
- Submit failure logs and Pi CLI trace logs still use `$XDG_STATE_HOME/sdl/...` defaults with explicit SDL-specific absolute-path overrides; those are not legacy dotdir fallbacks.
- `vibechk` remains outside the SDL `sdl` app namespace cleanup target for this slice.
- Pi-owned `~/.pi/agent/...` paths were not touched.
- Historical Objective/archive records were not mass-edited. ADR 0005's old `~/.sdl/planned-branch/...` provenance remains intentionally historical.

## Stale-term sweep

Final sweep:

```bash
rg -n "~/.sdl|~/.brmem|~/.slots|\.brmem/prompts|BRANCH_CONTEXT_LEGACY_PLAN_KEY|BRANCH_CONTEXT_PLAN_KEY|legacyPlanStoreRoot|SLOTS_ROOT" \
  ts/packages docs skills .sdl/prompts docs-site/src/content/docs \
  --glob '!**/node_modules/**' --glob '!**/dist/**'
```

Remaining hits are classified as acceptable:

- `docs/adr/0005-additive-plan-vocabulary.md`: historical/provenance statement about the old planned-branch store.
- `docs/pi/branch-context-workflow.md`: explicit active note that legacy `~/.sdl/enriched-plan` files are not read, migrated, or dual-written.
- `ts/packages/pi-extensions/src/branch-context/enriched-plan-save.ts` and related tests: explicit no-legacy-fallback prompt/tool assertions.

No hits remain for `~/.brmem`, `~/.slots`, `.brmem/prompts`, `BRANCH_CONTEXT_LEGACY_PLAN_KEY`, `BRANCH_CONTEXT_PLAN_KEY`, `legacyPlanStoreRoot`, or `SLOTS_ROOT`.

## Validation

Focused package tests passed with pnpm dependency-status verification disabled after the initial direct `pnpm --dir ts --filter ... run test` attempt was blocked by pnpm's ignored-build-script dependency check before tests ran:

- `pnpm --dir ts --config.verify-deps-before-run=false --filter @sdl/plans run test`
- `pnpm --dir ts --config.verify-deps-before-run=false --filter @sdl/sdl run test`
- `pnpm --dir ts --config.verify-deps-before-run=false --filter @sdl/brmem run test`
- `pnpm --dir ts --config.verify-deps-before-run=false --filter @sdl/branch-context run test`
- `pnpm --dir ts --config.verify-deps-before-run=false --filter @sdl/slot run test`
- `pnpm --dir ts --config.verify-deps-before-run=false --filter @sdl/pi-extensions run test`
- `pnpm --dir ts --config.verify-deps-before-run=false --filter @sdl/ccc run test`

Full gates passed:

- `just dprint-check`
- `just ts-format-check`
- `just ts-lint`
- `just ts-check`
- `just ts-test` — 296 files / 3000 tests passed
- `just ts-guard`

Autofixers used per repo policy:

- `just dprint-fix`
- `just ts-format-fix`
