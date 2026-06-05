# Plan

## Goal and user-visible outcome

Complete the final non-parked roadmap row for the active `.asdl/objectives/cmux-extension-consolidation/` Objective: **Naming normalization**.

User-visible outcome:

- `/cmux-dispatch` is replaced by `/cmux-slot:dispatch-prompt` with no legacy alias.
- The TypeScript cmux sidebar feature consistently uses the noun **sidebar** in module names, exported symbols, command copy, docs, and `skills/cmux-sidebar/SKILL.md`.
- User-facing standalone `CMUX` prose is normalized to lowercase `cmux`, while literal env vars such as `CMUX_WORKSPACE_ID` and `CMUX_TAB_ID` stay uppercase.
- Status-key naming is no longer crossed or ambiguous between the Pi transient UI status and the cmux status key cleared by `asdl exec cmux-workspace-summary`.
- Docs, tests, and Objective tracking record the completed slice and validation evidence.

Do not create a branch, commit, submit a PR, mutate user-local Pi resources, or write Branch Memory as part of loading this plan.

## Planning context and discovered repository facts

Planning was performed in repo root `/Users/schrockn/code/asdl-tools` on branch `cmux-extension-consolidation/open-slot-orchestrator` at commit `b012bc87675a7ef2ed2a6d14166f48a9df41c649`. The working tree was clean.

The active Objective files state that the TypeScript cmux command suite under `ts/packages/pi-extensions/src/cmux/` is the target. The Python cmux gateway/exec layer was originally a non-goal except if the status-key normalization requires a narrow contract change.

All implementation-consolidation rows in `.asdl/objectives/cmux-extension-consolidation/roadmap.md` are complete except the final row:

- Rename `cmux-dispatch` to `cmux-slot:dispatch-prompt`.
- Standardize the sidebar noun and rename TS `workspace-summary`/`summary` symbols to match.
- Normalize user-facing `CMUX` to `cmux`.
- Fix crossed `cmux:sidebar` / `pi-summary` status-key naming.
- Update docs, `CONTEXT.md`, `.pi/extensions/cmux.ts`, tests, and `skills/cmux-sidebar/SKILL.md`.
- Evidence expected afterward: `just ts-check`, `just ts-test`, `just dprint-check`, and grep evidence for no unwanted `cmux-dispatch` or user-facing standalone `CMUX` residue in the scoped suite/docs.

Recent Objective updates show prior rows are done:

- `updates/2026-06-04-canonical-helper-consolidation.md`: canonical command helpers, primitives, slot envelope parsing, and branch-slug consolidation completed.
- `updates/2026-06-04-planned-output-contract.md`: `planned-branch-output.ts` owns the structured output contract.
- `updates/2026-06-04-open-slot-orchestrator.md`: `openBranchInCmuxSlot` owns the shared slot checkout/workspace-open tail; final follow-up is naming normalization.

Current code facts from inspection:

- `ts/packages/pi-extensions/src/cmux/dispatch.ts` currently defines `COMMAND_NAME = "cmux-dispatch"` and `PROMPT_DIR = ~/.pi/agent/cmux-dispatch-prompts`. It exports `registerCmuxDispatchCommand`, `handleCmuxDispatch`, option types, `createTrackedBranchForPrompt`, `writePromptFile`, and `buildLaunchPrompt`. It creates a Graphite-tracked branch for a prompt, writes a launch prompt file, and delegates slot/workspace opening to `openBranchInCmuxSlot(...)`.
- `ts/packages/pi-extensions/src/cmux.ts` imports `registerCmuxDispatchCommand` from `./cmux/dispatch.ts` and registers it with the other cmux commands. `.pi/extensions/cmux.ts` is only a thin adapter importing that package-level registration function.
- `ts/packages/pi-extensions/src/cmux/workspace-summary.ts` currently owns the manual sidebar controller. It defines `/cmux:pr-sidebar`, `/cmux:objective-sidebar`, `SKILL_NAME = "cmux-sidebar"`, `STATUS_KEY = "cmux:sidebar"`, `SUMMARY_MODEL_ENV = "ASDL_CMUX_SUMMARY_MODEL"`, and `DEFAULT_SUMMARY_MODEL_REF = "openai-codex/gpt-5.4-mini"`. It exports `createCmuxWorkspaceSummaryController`, `registerCmuxSidebarCommands`, `getCallerWorkspaceId`, and `buildCmuxSidebarPrompt`.
- The manual sidebar controller queues a model-assisted follow-up for the caller workspace from `CMUX_WORKSPACE_ID` or `CMUX_TAB_ID`; it does not mutate cmux directly. It uses `ctx.ui.setStatus?.(STATUS_KEY, value)` while preparing the follow-up and clears it afterward.
- `src/asdl_tools/cmux/workspace_summary.py` defines `DEFAULT_STATUS_KEY = "pi-summary"`. `asdl exec cmux-workspace-summary` uses that default to clear a cmux status pill after renaming the workspace and setting its description. Root CLI scenario tests and docs currently assert/report `status_key: "pi-summary"`.
- `skills/cmux-sidebar/SKILL.md` instructs the model to generate `title` and one-line `Goal:` description, then run exactly one deterministic `asdl exec cmux-workspace-summary --title ... --description 'Goal: ...' --format json` command. It currently says the command clears the old `pi-summary` cmux status pill.
- `ts/packages/pi-extensions/test/cmux.test.ts` is the main command-handler test surface. It currently expects the registered command set to include `"cmux-dispatch"`, has a test named `"cmux-dispatch opens cmux without sidebar summary"`, and invokes `pi.commands.get("cmux-dispatch")`.
- `docs/pi/cmux-extension-pattern.md`, `docs/pi/README.md`, and `ts/packages/pi-extensions/CONTEXT.md` contain command inventory and terminology with `/cmux-dispatch` and several standalone uppercase `CMUX` occurrences.

## External/off-repo research context

No external or off-repo research was used. All findings came from repository files and local git/rg evidence.

## Likely files and symbols to change

Primary TypeScript files:

- `ts/packages/pi-extensions/src/cmux/dispatch.ts` -> likely rename to `dispatch-prompt.ts`.
- `ts/packages/pi-extensions/src/cmux/workspace-summary.ts` -> likely rename to `sidebar.ts`.
- `ts/packages/pi-extensions/src/cmux.ts` imports/registration.
- `ts/packages/pi-extensions/src/cmux/slot.ts`, `slot-dispatch-plan.ts`, and `slot-open-branch.ts` for user-facing `CMUX` copy.
- `ts/packages/pi-extensions/test/cmux.test.ts`.

Docs/skill/context:

- `.pi/extensions/cmux.ts` only if import paths/comments require it; it should remain a thin adapter.
- `ts/packages/pi-extensions/CONTEXT.md`.
- `docs/pi/cmux-extension-pattern.md`.
- `docs/pi/README.md`.
- `skills/cmux-sidebar/SKILL.md`.

Conditional Python/status-key files if the cmux status-key contract changes:

- `src/asdl_tools/cmux/workspace_summary.py`.
- `src/asdl_tools/exec/cmux_workspace_summary.py`.
- `tests/scenario/test_cli.py`.
- `docs/asdl-exec/cmux-workspace-summary.md`.

Objective tracking files after implementation/validation:

- `.asdl/objectives/cmux-extension-consolidation/roadmap.md`.
- New update file under `.asdl/objectives/cmux-extension-consolidation/updates/`, e.g. `<YYYY-MM-DD>-naming-normalization.md`.
- Possibly `.asdl/objectives/cmux-extension-consolidation/objective.md` if assumptions/risks/open questions need durable adjustment.

## Step-by-step implementation approach

### 1. Load local TypeScript instructions

This is TypeScript work. Before editing, read the repo TypeScript style skill per project instructions:

- `.agents/skills/typescript-style/SKILL.md`.
- `.agents/skills/typescript-style/core-rules.md`.
- The checklist/reference files required by that skill for this kind of extension/API work.

Keep the slice narrow; avoid broad unrelated cleanup.

### 2. Rename prompt dispatch command

Make a breaking rename with no alias.

Recommended edits:

1. Rename `ts/packages/pi-extensions/src/cmux/dispatch.ts` to `ts/packages/pi-extensions/src/cmux/dispatch-prompt.ts`.
2. In the renamed module:
   - Set `COMMAND_NAME = "cmux-slot:dispatch-prompt"`.
   - Rename exported command-specific symbols:
     - `CmuxDispatchOptions` -> `CmuxSlotDispatchPromptOptions`.
     - `ResolvedCmuxDispatchOptions` -> `ResolvedCmuxSlotDispatchPromptOptions`.
     - `HandleCmuxDispatchOptions` -> `HandleCmuxSlotDispatchPromptOptions`.
     - `registerCmuxDispatchCommand` -> `registerCmuxSlotDispatchPromptCommand`.
     - `handleCmuxDispatch` -> `handleCmuxSlotDispatchPrompt`.
   - Rename the default prompt directory away from the old command string, e.g. `~/.pi/agent/cmux-slot-dispatch-prompts`, so scoped grep finds no `cmux-dispatch` residue.
   - Update user-facing errors/notifications from "cmux dispatch" to a lowercase "cmux slot dispatch prompt" wording.
   - Preserve behavior: empty prompt usage error, branch creation/tracking, prompt-file writing, launch command construction, and `openBranchInCmuxSlot(...)` delegation.
3. Update `ts/packages/pi-extensions/src/cmux.ts` to import/register `registerCmuxSlotDispatchPromptCommand` from the renamed module.
4. Update `ts/packages/pi-extensions/test/cmux.test.ts`:
   - Registered command list contains `"cmux-slot:dispatch-prompt"` and not `"cmux-dispatch"`.
   - Test names and `pi.commands.get(...)` calls use `cmux-slot:dispatch-prompt`.
   - Expected prompt-file path is updated if the prompt directory name changed.

### 3. Standardize the sidebar noun in the TS Pi layer

Recommended edits:

1. Rename `ts/packages/pi-extensions/src/cmux/workspace-summary.ts` to `ts/packages/pi-extensions/src/cmux/sidebar.ts`.
2. Rename TypeScript symbols so the feature noun is **sidebar**:
   - `createCmuxWorkspaceSummaryController` -> `createCmuxSidebarController`.
   - `CmuxWorkspaceSummaryController` -> `CmuxSidebarController`.
   - Keep `registerCmuxSidebarCommands`; it already uses the chosen noun.
   - `SUMMARY_MODEL_ENV` -> `SIDEBAR_MODEL_ENV`.
   - `DEFAULT_SUMMARY_MODEL_REF` -> `DEFAULT_SIDEBAR_MODEL_REF`.
   - `switchToFastSummaryModel` -> `switchToFastSidebarModel`.
3. Decide on the env var. Default recommendation: rename user-facing `ASDL_CMUX_SUMMARY_MODEL` to `ASDL_CMUX_SIDEBAR_MODEL` because this config selects the model for sidebar generation. Do not keep both names unless the user explicitly asks for compatibility; aliases increase surface area.
4. Keep the deterministic Python exec command named `asdl exec cmux-workspace-summary` by default. The Objective open question’s default was to keep that command because it is a separate tested CLI contract.

### 4. Fix status-key naming without accidental behavior changes

Current confusing state:

- TypeScript Pi transient status key is the cmux-looking string `cmux:sidebar`.
- Python `asdl exec cmux-workspace-summary` clears cmux status key `pi-summary`, which existing docs describe as an old/legacy cmux pill.

Default narrow fix:

1. In the renamed TypeScript sidebar module, rename `STATUS_KEY` to an ownership-explicit constant such as `PI_SIDEBAR_STATUS_KEY`.
2. Change its value away from `cmux:sidebar`; suggested value: `pi:cmux-sidebar`.
3. Update/add `cmux.test.ts` assertions that `ctx.ui.setStatus` uses the new Pi-owned key and clears it with `undefined` after queuing.
4. Keep Python `DEFAULT_STATUS_KEY = "pi-summary"` if its purpose remains clearing the historical cmux status pill. Update docs/skill wording to call `pi-summary` a **legacy cmux status key**, not the current Pi status key.

If implementation evidence shows the cmux status key itself must be renamed to `cmux:sidebar`, treat that as a deliberate Python CLI contract change, update the Python files/tests/docs listed above, and consider whether the command should clear both the new key and legacy `pi-summary` so old `cmux ready`-style pills are not left behind. Run the Python scenario validation if this path is taken.

### 5. Normalize user-facing `CMUX` casing

Convert standalone user-facing `CMUX` prose to lowercase `cmux` in scoped cmux source/docs/tests. Likely strings include:

- `checking out CMUX slot…` -> `checking out cmux slot…`.
- `opening CMUX slot workspace…` -> `opening cmux slot workspace…`.
- `Checked out branch into a CMUX slot...` -> lowercase `cmux`.
- `Opened branch in CMUX slot...` -> lowercase `cmux`.
- `Failed to check out branch into a CMUX slot.` -> lowercase `cmux`.
- `Dispatch the latest saved plan into a CMUX slot...` -> lowercase `cmux`.
- `No CMUX slot was opened.` -> lowercase `cmux`.

Do not lowercase literal env vars (`CMUX_WORKSPACE_ID`, `CMUX_TAB_ID`), TypeScript `Cmux*` identifiers, or external CLI names/paths.

### 6. Update docs and skill

Update these surfaces to final naming:

- `docs/pi/cmux-extension-pattern.md`:
  - Command suite lists `/cmux-slot:dispatch-prompt`.
  - Automatic-sidebar-disabled list includes `/cmux-slot:dispatch-prompt`.
  - Layering table no longer names `/cmux-dispatch`.
  - Standalone `CMUX` prose is lowercase `cmux`.
  - Model env var docs use `ASDL_CMUX_SIDEBAR_MODEL` if renamed.
  - Keep `asdl exec cmux-workspace-summary` as deterministic apply boundary unless Python contract changed.
- `docs/pi/README.md`:
  - Inventory and disposition rows list `/cmux-slot:dispatch-prompt`.
  - User-facing `CMUX` prose becomes `cmux`.
- `ts/packages/pi-extensions/CONTEXT.md`:
  - `cmux command suite` and `cmux workspace-opening command` definitions list `/cmux-slot:dispatch-prompt`.
  - Sidebar terminology consistently uses sidebar.
- `skills/cmux-sidebar/SKILL.md`:
  - Keep skill name `cmux-sidebar`.
  - Use sidebar consistently.
  - Clarify `pi-summary` as a legacy cmux status key if unchanged.

### 7. Update Objective tracking after implementation and validation

The user explicitly requested Objective updating in the plan. After code/docs/tests and validation are complete:

1. Edit `.asdl/objectives/cmux-extension-consolidation/roadmap.md`:
   - Mark the Naming normalization row `[x]`.
   - Append concise evidence: command rename, sidebar/status-key terminology updates, docs/skill updates, validation commands, and grep results.
2. Create `.asdl/objectives/cmux-extension-consolidation/updates/<YYYY-MM-DD>-naming-normalization.md` with:
   - `# cmux naming normalization complete`.
   - `## Summary`.
   - `## Objective Impact`.
   - `## Follow-Ups`.
3. Record durable Objective facts:
   - `/cmux-dispatch` was replaced by `/cmux-slot:dispatch-prompt` without an alias.
   - TS sidebar module/symbols and docs/skill now use sidebar terminology.
   - Standalone user-facing `CMUX` was normalized to `cmux`, excluding env vars.
   - Status-key naming is explicit/corrected.
   - Validation and grep evidence passed.
4. If all non-parked roadmap rows are `[x]`, state that the Objective appears ready for the normal closure gate. Do not create `closed.md` or add `## Closure` unless the user explicitly confirms closure under the Objective workflow.

## Validation commands and expected results

Run after implementation and after Objective/docs Markdown updates:

```bash
just ts-check
just ts-test
just dprint-check
git diff --check
```

Expected: all pass.

If Python cmux status-key behavior changes, also run:

```bash
uv run pytest tests/scenario/test_cli.py -k cmux_workspace_summary
```

Expected: selected scenario tests pass with updated status-key assertions if applicable.

Grep evidence:

```bash
rg -n "cmux-dispatch" \
  ts/packages/pi-extensions/src/cmux \
  ts/packages/pi-extensions/src/cmux.ts \
  .pi/extensions/cmux.ts \
  ts/packages/pi-extensions/test/cmux.test.ts \
  ts/packages/pi-extensions/CONTEXT.md \
  docs/pi/cmux-extension-pattern.md \
  docs/pi/README.md \
  skills/cmux-sidebar/SKILL.md
```

Expected: no output. Do not include Objective history in this no-output grep; Objective files may legitimately mention the old command as historical context.

```bash
rg -n "\bCMUX\b" \
  ts/packages/pi-extensions/src/cmux \
  ts/packages/pi-extensions/src/cmux.ts \
  .pi/extensions/cmux.ts \
  ts/packages/pi-extensions/test/cmux.test.ts \
  ts/packages/pi-extensions/CONTEXT.md \
  docs/pi/cmux-extension-pattern.md \
  docs/pi/README.md \
  skills/cmux-sidebar/SKILL.md
```

Expected: no standalone uppercase `CMUX` user-facing prose. This pattern should not match `CMUX_WORKSPACE_ID`/`CMUX_TAB_ID` because `_` is a word character.

Status-key review command:

```bash
rg -n "cmux:sidebar|pi-summary|PI_.*STATUS|STATUS_KEY" \
  ts/packages/pi-extensions/src/cmux \
  src/asdl_tools/cmux \
  src/asdl_tools/exec/cmux_workspace_summary.py \
  tests/scenario/test_cli.py \
  docs/pi/cmux-extension-pattern.md \
  docs/asdl-exec/cmux-workspace-summary.md \
  skills/cmux-sidebar/SKILL.md
```

Expected: output should be manually reviewed and demonstrate that the TS Pi transient status key and cmux status clearing are no longer crossed/ambiguous. If `pi-summary` remains, docs/tests should describe it as a legacy cmux status key cleared by the deterministic exec command.

## Risks, assumptions, edge cases, and open questions

Assumptions:

- Removing `/cmux-dispatch` without an alias is acceptable for this private repo-local surface.
- `asdl exec cmux-workspace-summary` can remain named as-is even while the TypeScript feature noun becomes sidebar.
- Uppercase env vars are identifiers, not prose, and should remain uppercase.
- Updating Objective tracking is required; Objective closure is not automatic.

Risks and mitigations:

- Hidden old command references: use targeted `rg` and update all repo-owned scoped references.
- Status-key ambiguity: prefer ownership-explicit constants and docs. If Python default changes, update Python tests/docs and consider legacy cleanup.
- Env var rename compatibility: `ASDL_CMUX_SUMMARY_MODEL` -> `ASDL_CMUX_SIDEBAR_MODEL` may break local config. The Objective favors normalized naming and no aliases, but if that is too disruptive, preserve the old env var as a documented exception.
- Over-broad casing cleanup: do not change env vars, `Cmux*` type names, or external command literals just to satisfy grep.
- Objective history false positives: exclude `.asdl/objectives/...` from no-output grep, then update Objective history deliberately with evidence.

Rejected alternatives:

- Keep `/cmux-dispatch` as an alias: rejected because the roadmap explicitly calls for the rename and prior cleanup avoids legacy aliases.
- Push cmux dispatch orchestration into a shared CLI now: rejected as out of scope; `cross-harness-parity` tracks that separately.
- Rename the Python exec command by default: rejected unless status-key evidence requires it, because it widens the slice and touches tested Python CLI contracts.

## Definition of done

- `/cmux-slot:dispatch-prompt` is the only prompt-dispatch slash command registered by `.pi/extensions/cmux.ts` through `ts/packages/pi-extensions/src/cmux.ts`.
- Sidebar TS module/symbols/docs/skill use the sidebar noun consistently.
- User-facing standalone `CMUX` prose is lowercase `cmux`; literal env vars remain uppercase.
- Status-key naming is explicit and no longer crossed/ambiguous.
- `docs/pi/cmux-extension-pattern.md`, `docs/pi/README.md`, `ts/packages/pi-extensions/CONTEXT.md`, `skills/cmux-sidebar/SKILL.md`, and `ts/packages/pi-extensions/test/cmux.test.ts` are updated.
- `just ts-check`, `just ts-test`, `just dprint-check`, and grep evidence pass.
- `.asdl/objectives/cmux-extension-consolidation/roadmap.md` and a new semantic update record the completed row and evidence; closure is left to the closure gate unless explicitly confirmed.
