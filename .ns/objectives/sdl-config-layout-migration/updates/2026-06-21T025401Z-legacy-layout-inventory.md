# Legacy layout inventory

## Summary

Completed a read-only inventory of active SDL layout compatibility surfaces and path references for the XDG plus in-repo `.sdl` cleanup Objective. No implementation fallbacks were deleted in this slice. The inventory separates immediate cleanup candidates from intentionally retained compatibility, Branch Memory durable storage, canonical XDG behavior, stale docs/skills, and historical provenance.

Search evidence used focused `rg` sweeps across active source, tests, docs, skills, `.sdl/prompts`, and docs-site content for `~/.sdl`, `~/.slots`, `~/.brmem`, `.brmem/prompts`, `refs/brmem`, `XDG_*_HOME`, `.local/state/sdl`, `.local/share/sdl`, `.config/sdl`, `SLOTS_ROOT`, `legacyHomePath`, `requireSdlStatePath`, and `resolveSdlXdgPath`, excluding `node_modules`, `.git`, build outputs, and historical Objective/archive records when classifying active product surface.

## Objective Impact

The first unchecked roadmap item, inventorying active backwards-compatibility codepaths and path references, is complete enough to drive the deletion and documentation slices. The reviewed classification is:

### Delete-now candidates: active repo-owned legacy filesystem/config fallbacks

- **Saved/enriched plan local store fallback** — `ts/packages/plans/src/saved-plan-file.ts` still computes `legacyPlanStoreRoot()` from `HOME/.sdl/enriched-plan`, includes legacy directories in `listSavedPlans()` / `findLatestSavedPlanFile()`, and checks legacy same-slug collisions when writing to the XDG store. Related tests include `ts/packages/plans/test/saved-plan-file.test.ts`. This is an active read-only legacy fallback and collision guard for `~/.sdl/enriched-plan`; delete when the next slice removes local-plan-store compatibility.
- **SDL global extensions fallback** — `ts/packages/sdl/src/extension-registry.ts` loads legacy global extensions from `HOME/.sdl/extensions` before XDG global extensions and project `.sdl/extensions`. Related tests include `ts/packages/sdl/test/unit/extension-registry.test.ts`; active docs include `ts/packages/sdl/README.md` and `docs/research/xdg-base-directory-spec.md`. This is an active global extension compatibility root; delete when the next slice removes legacy global extension discovery.
- **Branch Memory global prompt fallback** — `ts/packages/brmem/src/prompt-resolution.ts` appends `HOME/.brmem/prompts` after `$XDG_CONFIG_HOME/sdl/brmem/prompts` for global prompt templates. Related tests include `ts/packages/brmem/test/gateways/prompt-resolution.test.ts`, `ts/packages/brmem/test/integration/prompt-resolution.test.ts`, `ts/packages/brmem/test/scenario/resolve-prompt-operation.test.ts`, and `ts/packages/brmem/test/support/run-scenario.ts`; active docs include `docs/research/xdg-base-directory-spec.md`. This is an active global prompt-template compatibility root; delete after deciding that project-local `.brmem/prompts` remains distinct from the old global prompt root.

### Retain with rationale / not a legacy filesystem fallback

- **Slot `SLOTS_ROOT` override** — `ts/packages/slot/src/context.ts` resolves the default slot pool through `$XDG_STATE_HOME/sdl/slots` via `requireSdlStatePath`, with `SLOTS_ROOT` as an explicit absolute override. The implementation no longer defaults to `~/.slots`; mentions in `ts/packages/slot/README.md` and `docs-site/src/content/docs/tools/slot.md` describe an operator-chosen override for existing pools. Keep unless the product intentionally removes the override mechanism, which is broader than deleting automatic legacy fallback reads.
- **Project-local `.brmem/prompts`** — `ts/packages/brmem/src/operations/resolve-prompt.ts` still checks `<repo>/.brmem/prompts/<name>.md` before global prompt roots. This is project-local prompt override behavior, not the legacy global `~/.brmem/prompts` root. Retain unless Branch Memory prompt policy is redesigned.
- **Branch-context `plan.md` attached-plan key** — `ts/packages/branch-context/src/constants.ts`, `attach.ts`, `attached-plan.ts`, `impl-command.ts`, `skills/branch-context-impl/SKILL.md`, and `docs/pi/branch-context-workflow.md` preserve legacy readability for Branch Memory entry key `plan.md`. This is durable Branch Memory entry-key compatibility, not filesystem layout cleanup. Retain or handle with a separate branch-context safety story so existing branch contexts are not hidden accidentally.
- **Branch Memory `refs/brmem/*`** — `ts/packages/brmem/src/ref-layout.ts`, `ts/packages/brmem/src/operations/setup-git.ts`, tests, `ts/packages/brmem/README.md`, `ts/packages/brmem/CONTEXT.md`, and dependent package tests use `refs/brmem/base/*` and `refs/brmem/ns/*` as the canonical Snapshot Ref contract. No alternate legacy ref-layout fallback was found in the active code sweep. Do not delete canonical `refs/brmem/*`; only revisit if a separate compatibility layout is discovered.
- **Submit failure logs and Pi CLI trace logs** — `ts/packages/sdl/src/submit-failure-interpretation.ts` and `ts/packages/pi-extensions/src/cli-command-extension.ts` use `$XDG_STATE_HOME/sdl/...` defaults through `requireSdlStatePath`, with explicit SDL-specific absolute-path overrides (`SDL_SUBMIT_FAILURE_LOG_DIR`, `SDL_PI_CLI_TRACE_PATH`). No legacy dotdir fallback was found.
- **vibechk store** — `ts/packages/vibechk/src/store.ts` uses explicit `--store`, `VIBECHK_HOME`, then `$XDG_STATE_HOME/vibechk` / default XDG state. No `~/.sdl`, `~/.vibechk`, or other legacy dotdir fallback was found in active vibechk implementation. This appears outside SDL's `sdl` app namespace by package contract, not a migration-era fallback to delete.

### Active docs, prompts, skills, and user-facing strings to refresh after deletion

- `.sdl/prompts/plans-write.md` still says the Local plan store path convention is `~/.sdl/enriched-plan/...`; this is stale and should become `$XDG_STATE_HOME/sdl/enriched-plan/...`.
- `skills/branch-context/references/lifecycle.md` and `skills/branch-context/references/diagnostics-admin.md` still show/manual-inspect `~/.sdl/enriched-plan/...`; update with XDG path guidance and narrow inspection under the XDG repo key.
- `ts/packages/pi-extensions/CONTEXT.md` defines Local plan store as `~/.sdl/enriched-plan/...`; because CONTEXT files are domain-language artifacts, update deliberately in the docs/agent-guidance refresh slice, not incidentally.
- `docs/research/xdg-base-directory-spec.md`, `docs/pi/README.md`, and `docs/pi/branch-context-workflow.md` intentionally document current live fallbacks. After code deletion, remove or narrow the fallback prose.
- `ts/packages/sdl/README.md` documents extension precedence including legacy `~/.sdl/extensions`; update after deleting the extension fallback.
- `docs-site/src/content/docs/tools/slot.md` and `ts/packages/slot/README.md` mention `SLOTS_ROOT=~/.slots` as an explicit override for existing pools; keep or rewrite depending on the product decision for retaining `SLOTS_ROOT` as an escape hatch.
- `ts/packages/pi-extensions/src/branch-context/enriched-plan-save.ts` and related tests assert user-facing saved-plan tool descriptions mentioning legacy `~/.sdl/enriched-plan`; update alongside saved-plan fallback deletion.

### Historical/provenance-only hits

- Existing records under `.sdl/objectives/**`, `.sdl/objective-archive/**`, and older planning/prototype directories include many historical mentions of `~/.slots`, `refs/brmem/*`, `.brmem/prompts`, `@asdl`, and old migration state. These are provenance records and should not be mass-edited for this Objective.
- `docs/adr/0005-additive-plan-vocabulary.md` mentions the old `~/.sdl/planned-branch/...` path as historical ADR context; no active compatibility code was found for that pre-enriched-plan path.

## Follow-Ups

- Next implementation slice should remove the three active filesystem/config fallback groups: saved-plan `~/.sdl/enriched-plan`, SDL global `~/.sdl/extensions`, and Branch Memory global `~/.brmem/prompts`, with focused tests adjusted to assert canonical XDG behavior and absence of legacy discovery.
- Keep `SLOTS_ROOT`, project-local `.brmem/prompts`, canonical `refs/brmem/*`, and branch-context `plan.md` readability out of the first deletion slice unless a separate safety decision expands scope.
- After deletion, run a refreshed source-search sweep and update active docs/skills/prompts/user-facing descriptions so remaining legacy-path hits are only historical, explicit override notes, Pi-owned/external, or deliberately retained compatibility.
