# ts/packages/capability-pi -- code-smell findings

Source: automated code-smell-roaster sweep (see repo root `.sdl/reviews/code-smell-roaster.md`), adversarially verified. 13 confirmed finding(s) (1 high, 6 medium, 6 low).

Re-verify file paths and line numbers at pickup time -- the repo moves between the sweep and implementation.

## ts/packages/capability-pi/branch-context

1. **Duplicated Code** (high) -- `ts/packages/capability-pi/branch-context/src/from-plan-commands.ts:656-888`
   - Roast: handleCreateBranchContextCommand and handleGtUpstackImplCommand are the same parse-help-progress-resolve-preview-dryrun-create skeleton copy-pasted twice, and they've already started drifting out of sync.
   - Evidence: Both functions repeat: try{parse args}catch CreateBranchContextUsageError{usage message}, args.help branch, sendCommandProgressOrNotify+waitForIdle, setRuntimeStatus('finding saved plan…')+resolveCreateBranchContextPlanFile, setRuntimeStatus('deriving branch slug…')+deriveCreateBranchContextPreview, args.dryRun branch, setRuntimeStatus('creating branch and attaching plan…')+createBranchContextFromPreview — but handleGtUpstackImplCommand additionally special-cases NoSavedPlanAvailableError (lines 806-825) that handleCreateBranchContextCommand doesn't, showing the duplicated copies have already diverged.
   - Smallest fix: Extract the shared resolve→preview→dry-run→create pipeline into one helper parameterized by the post-create tail (plain success message vs. handleGtUpstackImplExistingReuse/runGtUpstackImplLaunchTail), and call it from both command handlers.

2. **Duplicated Code** (medium) -- `ts/packages/capability-pi/branch-context/src/from-plan-commands.ts:335-382, 426-455`
   - Roast: deriveCreateBranchContextPreview and deriveImplCurrentSavedPlanPreview build the exact same 'base object, then branch on selected.type to splice in repoRoot/repoKey/repoIdentitySource/sourceBranch/branchKey/modifiedTimeMs/summary' shape twice, just with different base fields.
   - Evidence: Both end with: `if (selected.type === "explicit") { return { ...base, mode: "explicit" }; } return { ...base, mode: selected.type, repoRoot: selected.plan.repoRoot, repoKey: selected.plan.repoKey, repoIdentitySource: selected.plan.repoIdentitySource, sourceBranch: selected.plan.sourceBranch, branchKey: selected.plan.branchKey, modifiedTimeMs: selected.plan.modifiedTimeMs, ...(selected.type === "session" && selected.plan.summary !== undefined ? { summary: selected.plan.summary } : {}) };`
   - Smallest fix: Pull the selected-plan-to-evidence-fields mapping into one shared helper (e.g. selectedSavedPlanEvidence(selected)) that both deriveCreateBranchContextPreview and deriveImplCurrentSavedPlanPreview spread into their own base object.

3. **Speculative Generality** (low) -- `ts/packages/capability-pi/branch-context/src/gt/upstack-impl-launch.ts:14`
   - Roast: BranchContextGtUpstackImplNewSessionContext is exported as if other modules need a branch-context-specific session-context type, but nothing — not even this file — ever references it.
   - Evidence: `export type BranchContextGtUpstackImplNewSessionContext = ReplacedSessionContext;` — a verbatim re-export with zero usages anywhere in src/ or test/, unlike its siblings BranchContextGtUpstackImplNewSessionOptions/Result which are actually used in this file and tests.
   - Smallest fix: Delete the unused alias; import ReplacedSessionContext directly wherever (if ever) a branch-context caller actually needs it.

## ts/packages/capability-pi/ccc

1. **Duplicated Code** (medium) -- `ts/packages/capability-pi/ccc/src/dispatch-from-trunk.ts:24-26`
   - Roast: Four files reinvent the exact same three-line progress-notifier closure instead of sharing one, so 'how do we report progress' has four separate answers to keep in sync.
   - Evidence: Identical closure `const notifyProgress = (message: string): void => { sendCommandProgressOrNotify({ host: pi, ctx, message }); };` is copy-pasted verbatim in dispatch-from-trunk.ts:24-26, dispatch-prompt.ts:24-26, slot-dispatch-plan.ts:52-54, and slot-open-branch.ts:18-20.
   - Smallest fix: Extract a `makeNotifyProgress(pi, ctx)` helper (e.g. alongside registerCommandWithImmediateAck in @sdl/pi/commands/ack) and call it from all four sites instead of redefining the closure each time.

2. **Duplicated Code** (low) -- `ts/packages/capability-pi/ccc/src/dispatch-prompt.ts:30`
   - Roast: The repo already has a canonical `optionalEntry` helper for exactly this 'spread the field only if defined' shape, and these two files hand-roll it again instead of using it.
   - Evidence: `...(options.slotClient === undefined ? {} : { slotClient: options.slotClient }),` appears identically in dispatch-prompt.ts:30 and dispatch-from-trunk.ts:32, duplicating logic that `optionalEntry` from `@sdl/core/primitives` (ts/packages/infra/core/src/primitives.ts:58) already centralizes and is used for elsewhere in the repo (e.g. ts/packages/sdl-capability-kit/src/brmem-cli.ts).
   - Smallest fix: Replace both inline ternary spreads with `...optionalEntry("slotClient", options.slotClient)`.

## ts/packages/capability-pi/flow

1. **Duplicated Code** (medium) -- `ts/packages/capability-pi/flow/src/smart-restack.ts:46-60`
   - Roast: Two files in the same module hand-roll the identical CommandContext/RegisteredCommand shape instead of sharing one definition, so every future field addition is a two-file (soon three-file) chore.
   - Evidence: smart-restack.ts:46-60 defines `interface CommandContext { cwd; hasUI?; ui: { notify(...); select?(...) }; waitForIdle?(): Promise<void> }` and `interface RegisteredCommand { description?; argumentHint?; handler(...) }`; stack-squash.ts:35-48 defines the same two interfaces nearly verbatim (minus `select`); code-workflows.ts:51-56 separately redefines `RegisteredCommand` again while importing the real `CommandContext` type from @sdl/pi/runtime/extension-types.
   - Smallest fix: Hoist one shared CommandContext/RegisteredCommand pair (or import the canonical CommandContext type that code-workflows.ts already pulls in) into a shared module under flow/src and have smart-restack.ts and stack-squash.ts import it instead of redeclaring.

2. **Duplicated Code** (low) -- `ts/packages/capability-pi/flow/src/stack-squash.ts:246`
   - Roast: The exact same three-deep adapter chain for turning a Pi exec API into a Graphite command runner is copy-pasted between two files, so any change to that wiring has to be repeated by hand in both places.
   - Evidence: stack-squash.ts:246 `runGraphiteCommand(execApiToCommandRunner(piExecApiToCommandExecApi(pi)), { cwd, args, timeoutMs })` is identical in shape to smart-restack.ts:131 `runGraphiteCommand(execApiToCommandRunner(piExecApiToCommandExecApi(pi)), { cwd, args: ["restack"], timeoutMs: GT_RESTACK_TIMEOUT_MS })`.
   - Smallest fix: Extract a shared `runGraphiteCommandForPi(pi, { cwd, args, timeoutMs })` helper (stack-squash.ts already has the start of this as `runGt`) into a common module both extensions import.

## ts/packages/capability-pi/handoff

1. **Duplicated Code** (medium) -- `ts/packages/capability-pi/handoff/src/pickup-list.ts:66-82`
   - Roast: The --branch flag parser was apparently too good not to copy-paste, so it shows up twice, character for character, daring you to update only one.
   - Evidence: parsePickupHandoffArgs (lines 66-82) and parseListHandoffArgs (lines 118-134) each contain the identical 8+8-line block handling `token === "--branch"` and `token.startsWith("--branch=")`, including the same 'Missing value for --branch.' error string.
   - Smallest fix: Extract a shared `consumeBranchFlag(tokens, index, parsed)` (or similar) helper used by both parsePickupHandoffArgs and parseListHandoffArgs so --branch syntax/validation only lives in one place.

2. **Divergent Change** (medium) -- `ts/packages/capability-pi/handoff/src/shared.ts:18-198`
   - Roast: shared.ts is the junk drawer of the package: command-name constants, a giant prompt essay, git-branch resolution, UI status plumbing, and Markdown fencing all live under one roof, so any one of five unrelated changes forces you back into the same file.
   - Evidence: The file mixes command/tool name + timeout constants (18-35), the large CREATE_HANDOFF_FALLBACK prompt literal (37-48), UI-facing resolveCreateFocus/setStatus/createHandoffStartMessage (68-92, 164-182), git exec logic in currentBranch (123-146), generic exec-failure formatting (184-190), and a Markdown fencing helper (192-198) — none of which change for the same reason, yet every other file in the package imports from here.
   - Smallest fix: Split shared.ts along its actual responsibilities: command/name constants, the CREATE_HANDOFF_FALLBACK prompt copy, a git-branch-resolution module, and a small formatting/UI-status module, each changing independently.

3. **Duplicated Code** (low) -- `ts/packages/capability-pi/handoff/src/tab-launch.ts:6-11`
   - Roast: HandoffTabLaunchParams is HandoffLaunchParams wearing a fake mustache so nobody notices it's the same four fields defined twice.
   - Evidence: tab-launch.ts declares `export interface HandoffTabLaunchParams { branch: string; slug: string; key: string; pickupCommand: string; }`, field-for-field identical to `HandoffLaunchParams` already exported from launch-flow.ts (lines 72-77), and tab.ts's launch() hands a HandoffLaunchParams straight through as if it were the other type.
   - Smallest fix: Delete HandoffTabLaunchParams and import/reuse HandoffLaunchParams from launch-flow.ts so the branch/slug/key/pickupCommand clump has one canonical type.

## ts/packages/capability-pi/objective

1. **Middle Man** (medium) -- `ts/packages/capability-pi/objective/src/selection.ts:1-16`
   - Roast: selection.ts is a 16-line module that does nothing but forward three names from @sdl/objective/api, and extension.ts still bothers to import through it instead of going to the source like it does for everything else.
   - Evidence: selection.ts: `export { buildObjectiveSkillPrompt, chooseActiveObjectiveSlug, objectiveSelectionContextFromCommandContext } from "@sdl/objective/api";` with matching type re-exports, while extension.ts:10-14 imports those three names via `./selection.ts` and extension.ts:17-32 imports a dozen other names from `@sdl/objective/api` directly in the same file.
   - Smallest fix: Delete selection.ts (and picker.ts, which has the same shape) and have extension.ts/index.ts import everything directly from @sdl/objective/api; if the package truly needs a curated public surface, make index.ts the single re-export point instead of stacking another pass-through file behind it.

2. **Duplicated Code** (low) -- `ts/packages/capability-pi/objective/src/extension.ts:186-191, 208-213`
   - Roast: The 'stringify the error, then notify if there's a UI' dance is copy-pasted verbatim across two command handlers, so any change to how errors surface has to be made twice and will eventually drift.
   - Evidence: handleObjectiveCreateCommand: `const message = error instanceof Error ? error.message : String(error); if (ctx.hasUI) { ctx.ui.notify(message, "error"); }` and handleObjectiveCommand has the identical block (plus a third near-duplicate message extraction at line 146 inside invokeObjectiveCreateSkill's catch).
   - Smallest fix: Extract a single `notifyCommandError(ctx, error)` helper that does the instanceof-check and conditional notify, and call it from both catch blocks.

3. **Data Clumps** (low) -- `ts/packages/capability-pi/objective/src/extension.ts:95-99, 119-123, 194-199`
   - Roast: The trio (pi, ctx, spec) tags along through every objective-invocation function with no shared type, and even disagrees with itself on parameter order between functions.
   - Evidence: invokeObjectiveSkill(pi, ctx, spec, objective), chooseObjectiveAndInvoke(pi, ctx, spec), and handleObjectiveCommand(pi, spec, args, ctx) all thread the same pi/ctx/spec trio as separate positional params, in inconsistent order, while a sibling flow already bundles the equivalent fields into InvokeObjectiveCreateSkillOptions.
   - Smallest fix: Introduce a small ObjectiveInvocationContext { pi, ctx, spec } type (mirroring InvokeObjectiveCreateSkillOptions) and have invokeObjectiveSkill/chooseObjectiveAndInvoke/handleObjectiveCommand take it instead of separate positional args.
