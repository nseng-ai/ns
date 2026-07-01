# .pi -- code-smell findings

Source: automated code-smell-roaster sweep (see repo root `.sdl/reviews/code-smell-roaster.md`), adversarially verified. 5 confirmed finding(s) (0 high, 3 medium, 2 low).

Re-verify file paths and line numbers at pickup time -- the repo moves between the sweep and implementation.

## .pi

1. **Data Clumps** (medium) -- `.pi/extensions/objective-autopilot.ts:312-1059`
   - Roast: The `(pi: ExtensionAPI, ctx: CommandContext)` pair is dragged through nearly every function signature in this file like a couple that can't be seen apart, and half the `*Options` interfaces exist only to re-bundle that same pair plus one more field.
   - Evidence: git(pi, ctx, args), gitRaw(pi, ctx, args), collectRepoChangeFacts(pi, ctx), assertInitialGuards(pi, ctx, objective), stageChangedFiles(pi, ctx, changedFiles), currentBranchForFailure(pi, ctx), stagedFilesForFailure(pi, ctx), changedFilesForFailure(pi, ctx), formatAutopilotFailure(pi, ctx, error) all take the identical (pi, ctx) lead pair, while ExecCheckedOptions, VerifyAfterChildOptions, SendSummaryOptions, etc. each just re-wrap { pi, ctx, ... }.
   - Smallest fix: Introduce a single AutopilotEnv { pi, ctx } (or fold it into one RunContext) and pass that one value everywhere instead of the recurring pair/duplicated options shapes.

2. **Duplicated Code** (medium) -- `.pi/extensions/objective-autopilot.ts:963-1027`
   - Roast: formatChildProgressWidgetLines/formatChildModel/showChildProgress and formatRecoveryProgressWidgetLines/formatRecoveryModel/showRecoveryProgress are the same widget-rendering function copy-pasted twice with the serial numbers filed off.
   - Evidence: Both blocks build identical lines (`model:`, `turns/tools:`, `elapsed:`, `current tool:`, `activity:`, `last tool[ error]:`, `last result:`, `stderr:`) from a snapshot, and both formatChildModel/formatRecoveryModel have byte-identical bodies checking launch.model / launch.requestedModel / requestedModel / "pending".
   - Smallest fix: Extract one formatProgressWidgetLines(headerLine, snapshot, requestedModel, stderrTail) helper (and one formatRequestedModel helper) shared by both the child and recovery call sites.

3. **Duplicated Code** (medium) -- `.pi/extensions/worktree-status.ts:1-3`
   - Roast: This file hand-rolls the exact same 'reach past Node resolution into the ts workspace' shim — comment included, word for word — that six other extension files paste in independently, while a purpose-built helper for this exact job sits one directory over and goes unused.
   - Evidence: worktree-status.ts: `export { default } from "../../ts/packages/worktree-status/src/extension.ts";` with the identical boilerplate comment also found verbatim in context-profiler.ts, grill-ui.ts, dispatch-runner-subagent.ts, objective-autopilot.ts, and thermo-council.ts, while branch-context.ts, ccc.ts, code.ts, code-workflows.ts, handoff.ts, objective.ts, sdl.ts, and pr.ts instead call `importTypeScriptWorkspaceDefault(...)` from .pi/lib/workspace-packages.ts for the same purpose.
   - Smallest fix: Route worktree-status.ts (and the other five copy-pasted shims) through `importTypeScriptWorkspaceDefault("@sdl/worktree-status/extension")` so the resolution trick lives in exactly one place; if a relative-import variant is still needed for packages without a workspace alias, fold that path into the lib helper instead of repeating the comment+re-export pair file by file.

4. **Duplicated Code** (low) -- `.pi/extensions/objective-autopilot.ts:519-622`
   - Roast: parseReport/assignReportTextField and parseRecoverySupervisorReport/assignRecoveryReportTextField are the same hand-rolled key:value/list-block parser written out twice for two report shapes.
   - Evidence: Both functions scan REPORT_BEGIN..REPORT_END-style markers line by line, switch a `list` accumulator between named array fields on `"name:"` lines, push `"- "`-prefixed entries, and otherwise split on the first colon into a per-field switch (assignReportTextField vs assignRecoveryReportTextField) that just spreads the field onto the report.
   - Smallest fix: Factor a single generic parseMarkerBlock(text, begin, end, { listFields, textFieldSetter }) parser and have both report types supply their field list/setter instead of duplicating the whole parsing loop.

5. **Speculative Generality** (low) -- `.pi/lib/workspace-packages.ts:7-11`
   - Roast: A generic `<T = WorkspaceDefaultExport>` parameter and a separately exported resolver dressed up as reusable infrastructure, but every single call site in the repo uses the default type and nobody outside this file ever calls the resolver on its own.
   - Evidence: `export function resolveTypeScriptWorkspacePackage(specifier: string): string` is exported but only consumed internally by `importTypeScriptWorkspaceDefault` in the same file; the generic `importTypeScriptWorkspaceDefault<T = WorkspaceDefaultExport>` is never instantiated with a non-default `T` anywhere in `.pi/`.
   - Smallest fix: Drop the type parameter (just type the return as `WorkspaceDefaultExport`) and stop exporting `resolveTypeScriptWorkspacePackage` until a real caller needs path resolution without the import; reintroduce both only when an actual use case shows up.
