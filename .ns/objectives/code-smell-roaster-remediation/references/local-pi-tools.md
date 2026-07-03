# ts/packages/local-pi-tools -- code-smell findings

Source: automated code-smell-roaster sweep (see repo root `.sdl/reviews/code-smell-roaster.md`), adversarially verified. 19 confirmed finding(s) (5 high, 12 medium, 2 low).

Re-verify file paths and line numbers at pickup time -- the repo moves between the sweep and implementation.

## ts/packages/local-pi-tools/context-profiler

1. **Repeated Switches** (high) -- `ts/packages/local-pi-tools/context-profiler/src/view.ts:347-435`
   - Roast: ViewFrame's five-way discriminant gets re-litigated in a fresh switch every time the class needs to know what's on screen, so the frame stack is really five parallel state machines wearing a trenchcoat.
   - Evidence: breadcrumbTitle() (347-363), frameMeta() (365-382), and renderFrameBody() (384-436) each independently switch on frame.type over the same overview/base-detail/turn-list/content/chat cases; handleInput() (245-272) does a fourth, partial version of the same dispatch.
   - Smallest fix: Give each ViewFrame variant a small record of behavior (title, meta, body-renderer) keyed once, e.g. a `FRAME_BEHAVIOR` map or per-frame methods, so adding a frame type means adding one entry instead of editing four switches.

2. **Duplicated Code** (medium) -- `ts/packages/local-pi-tools/context-profiler/src/model.ts:533-539`
   - Roast: The 'spread it in only if it's not undefined' dance for efficiency/relevance/analysisSummary gets typed out twice, character for character, instead of once.
   - Evidence: model.ts's private analysisVerdictFields() builds `{...(source.efficiency===undefined?{}:{efficiency:source.efficiency}), ...(relevance...), ...(analysisSummary...)}`; interrogation-prompt.ts's scopeForRegion() (lines 52-65) repeats the identical three-field optional-spread idiom verbatim for the same domain fields.
   - Smallest fix: Export analysisVerdictFields (or a generic optionalEntries helper) from model.ts and call it from scopeForRegion instead of re-deriving the same optional-field shape.

3. **Duplicated Code** (medium) -- `ts/packages/local-pi-tools/context-profiler/src/segmentation.ts:199-218`
   - Roast: Dedupe-by-snapped-turn-then-sort-then-cap is written out twice with different variable names, so a fix to one repair function won't reach its twin.
   - Evidence: repairEpisodes builds `startsByTurn` via snapStartTurn+Map-dedupe then `.sort(...).slice(0, MAX_EPISODES)` (199-218); repairDelegations (281-296) builds `claimsByTurn` the same way and again `.sort((l,r)=>l.turn-r.turn).slice(0, MAX_DELEGATIONS)`.
   - Smallest fix: Extract a shared `dedupeAndCapByTurn(items, snapTurn, max)` helper used by both repairEpisodes and repairDelegations.

## ts/packages/local-pi-tools/grill

1. **Divergent Change** (high) -- `ts/packages/local-pi-tools/grill/src/extension.ts:85-518`
   - Roast: This file is the protocol definition, the prompt-copy editor, the extension registrar, and the legacy-UI executor all wearing the same trenchcoat, so four unrelated reasons to edit collide in one 550-line module.
   - Evidence: Lines 80-214 define the wire-protocol types (ToolResult, GrillAskOption, GrillAskToolContext, ExtensionAPI, ToolDefinition); lines 216-265 hold long prose constants (FALLBACK_GRILL_UI_SKILL_BLOCK, GRILL_UI_CONTRACT); lines 327-397 register Pi commands/tools; lines 462-545 implement the legacy select/editor execution path and outcome-to-result mapping.
   - Smallest fix: Split into a protocol/types module (the interfaces), a prompts module (the skill-block/contract string constants and builders), and keep extension.ts focused only on registerGrillUiExtension plus its command/tool wiring; move executeLegacyGrillAsk/executeLegacyFreeformAnswer/grillAskOutcomeResult next to result.ts where the outcome-mapping logic already lives.

2. **Repeated Switches** (medium) -- `ts/packages/local-pi-tools/grill/src/view.ts:84-99`
   - Roast: The same switch on GrillAskRow.kind gets re-typed three separate times with three slightly different copies of 'Other / freeform answer' / 'Show current grill status' / 'End grilling session', so a copy edit means hunting down a third sibling clone.
   - Evidence: rowLabel() (lines 84-99) and rowSelectDisplay() (lines 124-143) both switch on row.kind and re-author the same three exceptional-row labels, and render.ts's renderExceptionalRowText (lines 306-338) switches on the identical row.kind set again to attach glyphs to the same three label strings.
   - Smallest fix: Define one ROW_KIND_DISPLAY map (kind -> { glyph, label }) in view.ts and have rowLabel, rowSelectDisplay, and render.ts's renderExceptionalRowText all read from it instead of re-switching and re-typing the strings.

3. **Data Clumps** (low) -- `ts/packages/local-pi-tools/grill/src/render.ts:135-338`
   - Roast: width, theme, and primitives ride shotgun through nearly every function in this file as three loose parameters, which is just a RenderContext object that never got named.
   - Evidence: renderReadZone(input, width, theme, primitives), renderChoicesStacked(input, state, width, theme, primitives), renderChoiceDetails(input, row, selected, width, theme, primitives), renderFreeformEditor(editorLines, width, theme, primitives), and renderRow(row, selected, width, theme, primitives) all thread the same three parameters in the same order.
   - Smallest fix: Bundle { width, theme, primitives } into a single GrillAskRenderContext type and pass that one object through the render call tree instead of three positional params on every function.

## ts/packages/local-pi-tools/pr-feedback-watch

1. **Divergent Change** (high) -- `ts/packages/local-pi-tools/pr-feedback-watch/src/feedback-watch/controller.ts:65-789`
   - Roast: PrFeedbackWatchController is the one class everyone has to touch no matter what they're changing: REST-fingerprint vs heavy-snapshot polling strategy, dirty-tree pausing, status-line rendering and its own refresh timer, session-entry event journaling/restore, and runner discovery are all crammed into the same 800-line file with no internal seams.
   - Evidence: Methods spanning unrelated concerns coexist on one class: pollWithRestFingerprint/pollWithHeavySnapshot (polling strategy), updateStatusRefreshTimer/renderStatus (UI status), appendEvent/restoreState (event-log persistence), resolveRunner (process discovery), pauseIfWorkingTreeDirty (git working-tree policy) — each a distinct reason to edit the class.
   - Smallest fix: Split into cooperating units: a PollingStrategy (REST fingerprint vs heavy snapshot), a StatusPresenter (status line + refresh timer), and an EventJournal (append/restore), with the controller composing them instead of implementing all five responsibilities itself.

2. **Duplicated Code** (medium) -- `ts/packages/local-pi-tools/pr-feedback-watch/src/feedback-watch/controller.ts:244, 388, 424, 466`
   - Roast: The same 'derive active/stopped from isEnabled' ternary is hand-copied four separate times instead of living in one place, so the state-transition rule has four chances to drift out of sync.
   - Evidence: `state: this.state.isEnabled ? "active" : "stopped"` (or the equivalent `this.state = { ...this.state, state: this.state.isEnabled ? "active" : "stopped" }`) appears verbatim at lines 244, 388, 424, and 466.
   - Smallest fix: Extract a single `restingState(isEnabled: boolean)` (or similar) helper and call it from all four sites.

## ts/packages/local-pi-tools/pr-previews

1. **Duplicated Code** (high) -- `ts/packages/local-pi-tools/pr-previews/src/preview-checks-view.ts:55-280`
   - Roast: Two ~300-line TUI view classes (PrPreviewChecksView and PrPreviewFeedbackView) hand-roll the identical border/box/scroll/selection scaffolding from scratch, so every modal-chrome bugfix has to be made twice and will eventually be made once.
   - Evidence: Both classes carry near-identical private methods color()/border()/boxLine() (checks-view.ts:267-280 vs feedback-view.ts:262-275), the same selectedIndex/listScroll/detailScroll fields, the same moveSelection()/scrollDetails() bodies, and near-identical renderBody()/renderEmptyBody()/renderSelectedXDetailLines() shapes that just swap 'checks' for 'threads' (e.g. checks-view.ts:136-181 vs feedback-view.ts:134-181).
   - Smallest fix: Extract a shared PreviewModalChrome (or base Component) owning border/boxLine/color, scroll state, and the list/detail render skeleton, parameterized by a row renderer and item accessor; have both views compose/extend it instead of re-implementing it.

2. **Divergent Change** (medium) -- `ts/packages/local-pi-tools/pr-previews/src/preview-checks-command.ts:107-313`
   - Roast: This file changes for command-arg/exec-orchestration reasons and for completely unrelated LLM-log-summarization-prompt-tuning reasons, so a prompt-wording tweak and a CLI-args tweak collide in the same module.
   - Evidence: runPrPreviewChecksCommand/execPrChecks (107-190) do PR-checks exec/view-model orchestration, while loadCheckLogs/loadGhTextCommand/summarizeCheckLogs/buildLogSummaryPrompt/LOG_SUMMARY_SYSTEM_PROMPT (192-313) implement a separate gh-log-fetch-and-LLM-summarize pipeline with its own prompt constants and timeout handling, all in one file.
   - Smallest fix: Split the gh-log-fetch + LLM-summarization pipeline (loadCheckLogs through buildLogSummaryPrompt/LOG_SUMMARY_SYSTEM_PROMPT) into its own module, e.g. preview-check-logs.ts, imported by the command file.

3. **Duplicated Code** (medium) -- `ts/packages/local-pi-tools/pr-previews/src/preview-checks-command.ts:370-374`
   - Roast: The 'no PR found' fallback message logic is copy-pasted between the checks and feedback commands with the branch/pr_number check order silently flipped, which is exactly how the two surfaces will drift into inconsistent wording.
   - Evidence: preview-checks-command.ts:370-374 checks `target.branch` before `target.pr_number`; preview-feedback-command.ts:305-309 checks `target.pr_number` before `target.branch` for the structurally identical target shape — same logic, different order, different message text.
   - Smallest fix: Move missingPreviewTargetMessage into the shared preview-view-utilities.ts module as one function both commands call against their common target fields.

## ts/packages/local-pi-tools/thermo-council

1. **Divergent Change** (high) -- `ts/packages/local-pi-tools/thermo-council/src/orchestrator.ts:77-601`
   - Roast: This 626-line file is a junk drawer: top-level command sequencing, a hand-rolled concurrency-limited worker pool, live progress-status string rendering, and a whole LLM-based JSON-repair subsystem (prompt building, retry prompts, validation) all live here, so four unrelated kinds of change all land in the same file.
   - Evidence: runThermoCouncilCommand (77-143) drives the top-level flow; runCouncilSeatsWithConcurrencyLimit/createCouncilProgressTracker (180-296) implement worker-pool concurrency and status string formatting; reviewerOutcomeFromRunnerResult through truncateRepairSource (322-589) implement a separate review-payload recovery/repair pipeline with its own prompt templates (buildReviewRepairPrompt, buildReviewRepairRetryPrompt).
   - Smallest fix: Split the payload-recovery/repair pipeline (recoverReviewFromSessionFile, recoverReviewFromPayload, repairReviewWithModel, generateReviewRepairText, validateReviewRepairText, buildReviewRepairPrompt, buildReviewRepairRetryPrompt, truncateRepairSource) into its own module (e.g. review-recovery.ts), and move the progress-tracker/status-rendering helpers into a progress.ts, leaving orchestrator.ts only the top-level sequencing.

2. **Repeated Switches** (medium) -- `ts/packages/local-pi-tools/thermo-council/src/orchestrator.ts:279-288`
   - Roast: ThermoCouncilReviewerOutcome.type gets its own bespoke switch in two different files just to spit out near-identical 'completed/blocked/failed' summary text, so any new outcome variant means hunting down and updating both copies in lockstep.
   - Evidence: orchestrator.ts renderCouncilSeatOutcome (279-288) switches on outcome.type to build a label string per status; report.ts seatDiagnostic (167-176) switches on the same outcome.type union to build a near-identical per-status diagnostic string.
   - Smallest fix: Add one shared `summarizeReviewerOutcome(outcome)` helper (e.g. in contract.ts or a small outcomes.ts) returning the per-type pieces both call sites need, and have orchestrator.ts/report.ts call it instead of re-switching.

3. **Duplicated Code** (medium) -- `ts/packages/local-pi-tools/thermo-council/src/report.ts:22-27`
   - Roast: The 'Scope' markdown block is hand-copied three times with slightly different fields each time, so fixing a wording or field bug means hunting down every near-identical copy instead of editing one place.
   - Evidence: renderThermoCouncilReport (22-27): `"## Scope",`- Working directory: ${scope.cwd}`,`- Base: ...`,`- Head: ...`,`- Changed files: ...`,`- Diff included...`; renderFinalSynthesisFailureReport (83-87) repeats Working directory/Base/Head/Changed files; renderAllSeatsFailedReport (223-225) repeats Base/Head only.
   - Smallest fix: Extract a `renderScopeBlock(scope, { includeWorkingDirectory, includeChangedFiles, includeDiffTruncation })` (or just a single canonical block) and call it from all three report renderers instead of re-listing the lines.

## ts/packages/local-pi-tools/backing-skill-commands

1. **Speculative Generality** (medium) -- `ts/packages/local-pi-tools/backing-skill-commands/src/extension.ts:19-24,59-72`
   - Roast: Two fields and a whole colon-splitting parser exist solely to satisfy a unit test that nobody downstream ever reads.
   - Evidence: DerivedPiCommand carries `namespace` and `command` (lines 19-24), and buildDerivedPiCommand (59-72) does separator math (`surface.indexOf(":")`, boundary checks, `slice`) to populate them — yet registerBackingSkillCommands and backingSkillCommandsParity, the only production consumers of a DerivedPiCommand, read nothing but `.surface` and `.skillName` (confirmed: no `.namespace`/`.command` reads anywhere in src/ or outside the package; the only reader is test/backing-skill-commands.test.ts:67-78).
   - Smallest fix: Drop `namespace`/`command` from DerivedPiCommand and the splitting logic in buildDerivedPiCommand; keep only `surface` and `skillName` until a real caller needs the decomposed parts.

2. **Divergent Change** (medium) -- `ts/packages/local-pi-tools/backing-skill-commands/src/extension.ts:74-151`
   - Roast: One file is simultaneously a spec compiler, a documentation-metadata generator, a Pi command registrar, and a runtime prompt-dispatcher, so four unrelated concerns all reach for the same edit knife.
   - Evidence: genericBackingSkillCommandSpecs/buildDerivedPiCommand (74-81, 59-72) derive specs; backingSkillCommandsParity (83-99) builds doc/parity-report metadata from those specs; registerBackingSkillCommands (101-113) wires live host registration; handleBackingSkillCommand/notifyCommandUi/buildBackingSkillPrompt (117-151) own runtime invocation, UI notification, and prompt formatting — a change to parity-report shape, command registration mechanics, or prompt text all land in this same ~150-line file for unrelated reasons.
   - Smallest fix: Split into a spec-derivation module (DerivedPiCommand + genericBackingSkillCommandSpecs/buildDerivedPiCommand), a parity-metadata module (backingSkillCommandsParity), and a runtime-registration module (registerBackingSkillCommands + handleBackingSkillCommand + its helpers), each importing the specs they need.

## ts/packages/local-pi-tools/runner-subagents

1. **Duplicated Code** (medium) -- `ts/packages/local-pi-tools/runner-subagents/src/presentation.ts:57-72`
   - Roast: Two functions in two files build the exact same 'Forked Pi: / State: / Turns/tools: / Elapsed: / Session:' widget lines, and only one of them is ever wired into a real widget.
   - Evidence: presentation.ts's `formatRunnerSubagentProgressWidgetLines` reconstructs the same title/state/tool/turns-tools/elapsed/session line sequence as widget.ts's `formatRunnerSubagentActivityWidgetLines` (lines 84-116), but a repo-wide grep shows the presentation.ts version is only called from its own test file, never from extension.ts or widget.ts, while widget.ts's version is the one actually called at widget.ts:68 and 76 during dispatch.
   - Smallest fix: Delete the unused presentation.ts formatter and make any progress-only caller invoke widget.ts's formatter with an empty activity object, so there is exactly one place that knows the widget line layout.

2. **Duplicated Code** (medium) -- `ts/packages/local-pi-tools/runner-subagents/src/subagent-process.ts:1014-1114`
   - Roast: Six result-builder functions hand-roll the identical title/elapsedMs/progress/sessionFile envelope, so changing what every RunnerSubagentResult carries means editing the same boilerplate six times and hoping you didn't miss one.
   - Evidence: finalTextResult, stoppedWithoutTerminalResult, stoppedWithoutUsefulTextResult, cancelledResult, errorResult, and protocolErrorResult each repeat: `...(title === undefined ? {} : { title }), elapsedMs: progress.elapsedMs, progress, ...(progress.sessionFile === undefined ? {} : { sessionFile: progress.sessionFile })` verbatim before adding their status-specific fields (terminalCaptureResult even names this shape `base` locally but the other five don't reuse it).
   - Smallest fix: Extract a `resultBase(title, progress)` helper that returns the shared title/elapsedMs/progress/sessionFile object, and have all six (plus terminalCaptureResult) spread it instead of repeating the conditional spreads.

3. **Repeated Switches** (low) -- `ts/packages/local-pi-tools/runner-subagents/src/extension.ts:217-251,348-365`
   - Roast: The same RunnerSubagentResult.status union gets switched over twice in one file, so every time a status is added you must remember to update both exhaustive switches or the second one silently drifts.
   - Evidence: `dispatchRunnerSubagentDetails` switches on `result.status` (completed/blocked, final-text, stopped-without-*, cancelled, error, protocol-error) to populate diagnostic/finalTextChars/stopReason fields, and `readStopReason` switches on the same `result.status` lower in the file to decide which statuses carry a stopReason -- two separate `never`-checked cascades over one discriminated union.
   - Smallest fix: Fold `readStopReason`'s per-status stopReason extraction into the single switch in `dispatchRunnerSubagentDetails` (or a shared per-status lookup table both call), eliminating the second cascade over the same type.
