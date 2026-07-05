# ts/packages/capabilities -- code-smell findings

Source: automated code-smell-roaster sweep (see repo root `.sdl/reviews/code-smell-roaster.md`), adversarially verified. 24 confirmed finding(s) (7 high, 13 medium, 4 low).

Re-verify file paths and line numbers at pickup time -- the repo moves between the sweep and implementation.

## ts/packages/capabilities/flow

1. **Duplicated Code** (high) -- `ts/packages/capabilities/flow/src/autobranch/dirty-worktree.ts:315-319`
   - Roast: The exact same five-line 'check git status, decide isClean, build the (base slug ... unavailable) suffix' block is copy-pasted between the dirty-worktree and latest-commit flows, and a third file string-matches its output, so one tweak now has to land in sync across three files or the UX silently lies.
   - Evidence: dirty-worktree.ts:315-319 and latest-commit.ts:78-82 both run: `const cleanliness = await input.exec("git", ["status", "--porcelain=v1"], GIT_TIMEOUT_MS); const isClean = cleanliness.code === 0 && cleanliness.stdout.trim().length === 0; const suffix = prepared.plan.hasSuffix ? \` (base slug ${prepared.plan.baseSlug} was unavailable)\` : "";`-- and autoslot.ts then does`createdBranch.summary.includes("Working directory is clean.")`, coupling itself to both copies producing identical literal text.
   - Smallest fix: Extract one helper, e.g. `summarizeAutobranchCompletion({ exec, hasSuffix, baseSlug })` returning `{ isClean, suffix, cleanlinessLine }`, in shared.ts (or a new `completion.ts`), and call it from both `runDirtyAutobranchFlow` and `createLatestCommitAutobranchFlow` so the clean-worktree sentence has one source of truth.

2. **Duplicated Code** (high) -- `ts/packages/capabilities/flow/src/land/post-landing-slot-cleanup.ts:68-157`
   - Roast: Four byte-for-byte identical 'build a LandStackFailure, presentBrief it, return failure(...)' blocks sit stacked in one function, and the same shape repeats twice more in land.ts -- a copy-paste macro pretending to be control flow.
   - Evidence: Four separate spots (lines 68-76, 94-101, 124-131, 150-157) each do: `presentBrief({ ctx, fullMessage: landFailure.message, level: landFailure.level, uiMessage: formatFailureNotification(landFailure), kind: landFailureKind(landFailure) }); return failure(landFailure);` -- and land.ts (lines 111-119, 140-147, 322-330, 339-346) repeats the identical shape again.
   - Smallest fix: Extract a single `presentFailureAndReturn(ctx, landFailure)` helper in presentation.ts (sibling to the existing `presentLandStackFailure`) and call it from every one of these sites instead of re-typing the five-field presentBrief call.

3. **Duplicated Code** (high) -- `ts/packages/capabilities/flow/src/submit/github-pr-gateway.ts:102-111,139-148,174-188,209-226,243-254,273-282`
   - Roast: Six methods in RealGithubPrGateway each hand-roll the identical 'build args, run command, wrap result in commandFailure, bail out on err' dance, so the gateway is really one idea copy-pasted six times wearing different hats.
   - Evidence: getPrCommitMessages, getPrDiff, stablePatchIdForPr, editPr, viewPrWithArgs and getLocalPrDiff each repeat: `const result = await this.runGh(args, ...); const failure = commandFailure({ command, args, result, code, message }); if (failure !== undefined) return err(failure);`
   - Smallest fix: Extract a private helper like `runChecked(runner, args, cwd, timeoutMs, { code, message })` returning `GatewayResult<ExecResult>`, and call it from all six sites instead of repeating the args/run/commandFailure/return-err shape.

4. **Duplicated Code** (high) -- `ts/packages/capabilities/flow/src/submit/submit-format.ts:98-118`
   - Roast: Five different failure-output formatters hand-roll the exact same 'ternary reason + blank line + command echo + stdout/stderr sections' recipe, so every tweak to how a failure is rendered means hunting down and editing all five copies in sync.
   - Evidence: formatPreflightFailureOutput (98-118), formatRestackFailureOutput (334-351), and formatSubmitFailureOutput (371-396) all build `output.startupError ? ... : output.killed ? ... : ...` reason text and then return `[reason, "", commandLine, "", formatOutputSection("stdout", ...), formatOutputSection("stderr", ...)].filter(Boolean).join("\n")` -- identical shape, only the literal strings differ.
   - Smallest fix: Extract a single `formatCommandFailureText({ commandDisplay, output, reason })` helper that builds the reason ternary and the stdout/stderr block, and have each of the five callers supply only their distinct copy.

5. **Repeated Switches** (medium) -- `ts/packages/capabilities/flow/src/commands/land.ts:188-243`
   - Roast: routePhase and routeMessage are two independent if/startsWith ladders that both exist to answer one question - 'which land phase is this line?' - and disagree on how to ask it.
   - Evidence: routePhase (188-210) and routeMessage (212-243) each re-implement a text-sniffing cascade mapping raw CLI strings to the same four phase keys ("preflight", "refresh", "cleanup", "merge") via separate startsWith() chains on differently-prefixed text (plain phase text vs '→ '-prefixed notify text).
   - Smallest fix: Replace the two parallel startsWith cascades with one table/map from message-pattern to phase key that both the phaseTransient and richMessage/notifyUi callbacks consult, so a new phase only needs one entry instead of two matching edits.

6. **Data Clumps** (medium) -- `ts/packages/capabilities/flow/src/land-stack/chunked-landing.ts:66-72, 116, 166-172, 201-207`
   - Roast: Four values - ctx, commandStream, landed, landedChunks - get re-typed together at every single failure exit like a ritual incantation nobody dares to name.
   - Evidence: presentLandStackFailure({ ctx, commandStream, landed, landedChunks, failure: ... }) is repeated verbatim four times in this file alone (lines 66-72, 116, 166-172, 201-207), and the identical clump reappears in the sibling landing-coordination.ts at lines 48-54, 138-144, 157-163.
   - Smallest fix: Bundle { ctx, commandStream, landed, landedChunks } into one LandingSession/LandingProgress value created once per run and threaded through, so presentLandStackFailure(session, failure) replaces the four-field clump at every call site.

7. **Repeated Switches** (medium) -- `ts/packages/capabilities/flow/src/shared/pending-worktree-result.ts:37-61`
   - Roast: The same four-way PendingWorktreeError.kind branch gets re-litigated three separate times (command, headline, and again in worktree.ts's formatPendingWorktreeError) instead of once, so adding a fifth probe kind means hunting down three parallel switch statements.
   - Evidence: pendingWorktreeCommand() switches on error.kind to pick a command string, pendingWorktreeHeadline() switches on the same error.kind to pick a headline string, and ts/packages/capabilities/flow/src/shared/worktree.ts:72-81 (formatPendingWorktreeError) if/else-chains over the identical error.kind to build yet another message.
   - Smallest fix: Replace the three independent kind-keyed cascades with a single lookup table (Record<PendingWorktreeError['kind'], { command, headline, plainMessage }>) that all three call sites read from.

8. **Data Clumps** (medium) -- `ts/packages/capabilities/flow/src/submit/submit-pr-metadata-prewrite.ts:329-336`
   - Roast: `env`, `git`, and `textGenerator` travel together everywhere in this module, yet the sibling file already named that exact trio `SubmitPrDescriptionOptions` -- this file just re-spells it as three loose fields twice instead of reusing the type that exists for it.
   - Evidence: `prepareSubmitPrMetadata(input: { cwd, env, gateway, git, textGenerator, onProgress })` (329-336) and `generateMetadataForBranches(input: { cwd, env, git, textGenerator, branches, onProgress })` (411-417) both repeat the same env/git/textGenerator clump that `SubmitPrDescriptionOptions` in submit.ts already bundles.
   - Smallest fix: Accept `Omit<SubmitPrDescriptionOptions, "githubPr">` (or a new shared `PrTextGenerationContext` type) in both signatures instead of three separate fields.

9. **Duplicated Code** (medium) -- `ts/packages/capabilities/flow/src/submit/submit.ts:710-718`
   - Roast: The 'turn an exec/command output into {stdout, stderr, exitCode, optional startupError, optional killed}' literal is copy-pasted four times in one file, so adding a field to SubmitCommandOutput means remembering to touch all four spots by hand.
   - Evidence: toSubmitCommandOutput (710-718), the inline command object in commandFailureTranscript (771-779), and the two inline command objects in postSubmitFailureTranscript (805-825) all repeat `{ stdout, stderr, exitCode, ...(startupError === undefined ? {} : { startupError }), ...(killed === true ? { killed: true } : {}) }`.
   - Smallest fix: Factor a single `toFailureTranscriptCommand(output, commandDisplay)` (or reuse toSubmitCommandOutput) helper that the transcript builders call instead of re-deriving the optional-field spread each time.

10. **Speculative Generality** (low) -- `ts/packages/capabilities/flow/src/land-stack/land-presentation.ts:58-60`

- Roast: renderLandResultBlock exists purely to call renderResultBlock with the same arguments, and not one caller in the package ever bothers to use it.
- Evidence: export function renderLandResultBlock(caps: Caps, input: LandResultBlock): string { return renderResultBlock(caps, input); } — grepping the whole src tree shows this export is never called anywhere outside its own definition (only its sibling renderLandResultBlockFromMessage and the LandResultMessageBlock path are actually used, from land.ts:309).
- Smallest fix: Delete renderLandResultBlock and the unused LandResultBlock interface; if a future caller needs the non-message variant, reintroduce it then by calling renderResultBlock directly.

11. **Duplicated Code** (low) -- `ts/packages/capabilities/flow/src/land-stack/presentation.ts:609-614`

- Roast: The exact same four-line `firstNonEmptyLine` helper is defined twice in this module pair, once exported and once private, so the next person who tweaks the trimming logic will only fix half of it.
- Evidence: `presentation.ts:609` defines `function firstNonEmptyLine(output: string)` with the same body (`output.split("\n").map((line) => line.trim()).find(Boolean)`) as the exported `firstNonEmptyLine` already in `stack-facts.ts:378`.
- Smallest fix: Delete the private copy in presentation.ts and import the exported `firstNonEmptyLine` from stack-facts.ts.

12. **Data Clumps** (low) -- `ts/packages/capabilities/flow/src/submit/github-pr-gateway.ts:55-66,133-138,165-170`

- Roast: The quartet `{ cwd, number, baseRefName, headRefName }` travels together verbatim across the interface and impl for both getPrDiff and stablePatchIdForPr (and again, required, in getLocalPrDiff), as if nobody noticed it's the same PR-diff-locator concept every time.
- Evidence: GithubPrGateway.getPrDiff and GithubPrGateway.stablePatchIdForPr both declare `params: { cwd: string; number: number; baseRefName?: string; headRefName?: string }` verbatim, and the impl repeats the same shape again for both plus a required variant in getLocalPrDiff.
- Smallest fix: Introduce a `PrDiffLocator { cwd: string; number: number; baseRefName?: string; headRefName?: string }` type and use it for getPrDiff, stablePatchIdForPr, and getLocalPrDiff instead of retyping the field list each time.

## ts/packages/capabilities/land

1. **Duplicated Code** (high) -- `ts/packages/capabilities/land/src/preflight.ts:275-395`
   - Roast: The 'does this PR's head/base actually match what we expect' check is hand-written twice, once to hard-fail and once to soft-collect, so the two rules can silently drift apart.
   - Evidence: validateOpenPrBasics checks `pr.headRefOid !== localSha` (line 349) and validateInitialPrPreflight checks `branchPlan.pr.baseRefName !== trunk` for the bottom branch (line 292); collectPrSubmitRequirements re-derives the same two comparisons independently (`branchPlan.pr.headRefOid !== branchPlan.localSha` at line 374, `branchPlan.pr.baseRefName !== expectedBaseRefName` at line 379).
   - Smallest fix: Extract one `diffBranchPlanAgainstExpectations(branchPlan, expectedBaseRefName)` that returns the mismatch reasons, and have both the hard-fail path and the soft-requirements path consume that single computation.

2. **Mysterious Name** (medium) -- `ts/packages/capabilities/land/src/types.ts:122-131`
   - Roast: StackSnapshot ships two fields for 'which branch are we on' and nobody in production code can tell you why both exist.
   - Evidence: StackSnapshot declares both `readonly current: string` and `readonly actualCurrentBranch: string` (types.ts:124-125); every real decision in preflight.ts reads only `stack.actualCurrentBranch` (lines 40, 45, 73, 100), and `scopeStackSnapshot` (preflight.ts:196) just stomps `current` with `actualCurrentBranch`, i.e. discards whatever the graphite-derived `current` meant.
   - Smallest fix: Drop the redundant `current` field from StackSnapshot (or rename it to something that documents how it differs from actualCurrentBranch, e.g. `graphiteReportedCurrent`) and have callers use the one field that actually drives behavior.

3. **Duplicated Code** (low) -- `ts/packages/capabilities/land/src/testing.ts:708-746`
   - Roast: Seven near-identical 'spread the same fields back into a new object' functions is not defensive copying, it's a copy-paste fan club.
   - Evidence: copyRepoRootCall, copyRepoCall, copyBranchCall, copyBranchContainsParentCall, copyStackShapeCall, copyPullRequestFactsCall, and copyClassifyWorktreeCall (lines 708-746) each just rebuild a plain object from the same field names with no logic beyond `{ field: call.field, ... }`.
   - Smallest fix: Replace the per-call copy functions with a single generic shallow-copy helper (e.g. `copyCall = <T extends object>(call: T): T => ({ ...call })`) used by all the `*Calls` getters, since none of these call-log shapes contain anything but primitives/already-copied arrays.

## ts/packages/capabilities/slots

1. **Duplicated Code** (high) -- `ts/packages/capabilities/slots/src/command-face.ts:83-191`
   - Roast: Two files hand-register the exact same seventeen slot subcommands with the same names, schemas, handlers and renderers, so every new `slot` command is a copy-paste tax paid twice.
   - Evidence: command-face.ts:83-191 builds `list`/`ls`/`checkout`/`co`/`goto`/`claim`/`free`/`foreach`/`gc`/`init`/`resize` plus the `gt` group on a `ClinkrGroup`, while extension.ts:225-385 registers the identical set (same schema/resultSchema/handler/renderHuman pairs, even the same `completeCheckoutBranches` helper duplicated at extension.ts:134-147) on a `defineExtension({ commands: [...] })` array.
   - Smallest fix: Extract one declarative command table (name, schema, resultSchema, handler, renderHuman, positionals/options) shared by both adapters, and have command-face.ts and extension.ts each fold it into their respective registration API instead of repeating every entry by hand.

2. **Duplicated Code** (high) -- `ts/packages/capabilities/slots/src/operations/gt/stack-walk.ts:24-26,38-44`
   - Roast: Two functions in the same file each reinvent the exact same 'ancestors + current + descendants, trimmed by downstackOnly' path-building ternary, so anyone changing stack scoping has to remember to fix it twice.
   - Evidence: collectStackEdges: `options.downstackOnly ? [...stack.ancestors, options.current] : [...stack.ancestors, options.current, ...stack.descendants]` vs collectStackBranches: `options.downstackOnly ? (includeCurrent ? [...stack.ancestors, options.current] : [...stack.ancestors]) : (includeCurrent ? [...stack.ancestors, options.current, ...stack.descendants] : [...stack.ancestors, ...stack.descendants])`
   - Smallest fix: Extract a single `selectStackPath(stack, { downstackOnly, includeCurrent })` helper that returns the ordered branch path; have both collectStackEdges and collectStackBranches build on top of it.

3. **Divergent Change** (medium) -- `ts/packages/capabilities/slots/src/extension.ts:98-220`
   - Roast: extension.ts is supposed to be 'wire the slot commands' but also owns an entire unrelated shell-rc-file installer feature, so the file gets edited both when a slot subcommand changes and whenever the shell-integration install flow changes.
   - Evidence: Lines 98-220 define `sdlShellIntegrationBeginMarker`/`runSdlShellShow`/`runSdlShellInstall`/`renderSdlShellShow` (rc-file marker installation, confirmation prompting, shell wrapper rendering) bolted onto the same module that otherwise just proxies the 17 `operations/*` commands into `slotCommand(...)` registrations at lines 222-385; `show`/`install` even bypass `SlotCliContext`/`createSlotExtensionContext` entirely, operating straight on `SdlExtensionApi`.
   - Smallest fix: Move the `sdl shell show`/`install` commands (markers, prompt formatting, render functions) into their own extension/module that isn't keyed off `SlotCliContext`, leaving extension.ts solely responsible for mounting slot domain commands.

4. **Primitive Obsession** (medium) -- `ts/packages/capabilities/slots/src/lifecycle/claim.ts:31-36`
   - Roast: `SlotClaimOutcome` already has a perfectly good `CurrentWorktreeRedirect` type elsewhere in the module, but it gets smashed back into four loosely-related primitives that three separate helper functions exist only to reconstruct.
   - Evidence: `mainWorktreePath`, `mainCheckoutBranch`, `mainRedirectAction`, `mainRedirectRef`, `mainRedirectNote` are stored as independent fields (lines 31-36) derived from one `CurrentWorktreeRedirect | null` via `mainRedirectOf`, `mainCheckoutBranchOf`, and `mainRedirectRefOf` (lines 375-388), all just to flatten-then-reread the same union type.
   - Smallest fix: Carry the resolved `CurrentWorktreeRedirect | null` itself on `SlotClaimOutcome` (or a small `mainRedirect` sub-object) instead of decomposing it into four primitive fields, and delete the three reconstruction helpers.

5. **Duplicated Code** (medium) -- `ts/packages/capabilities/slots/src/lifecycle/free.ts:113-124`
   - Roast: The mapping from ReleaseTargetFailure.reason to a human message is reimplemented twice over the same four-case union — once in free.ts's freeExecutionFailureMessage, once in gc.ts's entryFromReleaseFailure — each with slightly different wording for the same underlying conditions, so a wording fix or a new failure reason has to land twice or silently drift.
   - Evidence: free.ts: switch (failure.reason) { case "slot-not-assigned": return `${failure.slotName} is not currently assigned (state changed during free).`; ... } vs lifecycle/gc.ts's entryFromReleaseFailure: if (failure.reason === "slot-not-assigned") return withAction(entry, "error", `slot ${entry.slotName} was not assigned to ${entry.branchName} during free...`); — same reasons, separately-authored prose.
   - Smallest fix: Extract one shared `describeReleaseTargetFailure(failure, { action: string })` in release-target.ts that both free.ts and gc.ts call, parameterized only by the action-name string each call site already passes around.

6. **Duplicated Code** (medium) -- `ts/packages/capabilities/slots/src/lifecycle/pool.ts:34-37`
   - Roast: pool.ts hand-rolls its own copy of SlotLifecycleFailure right next to common.ts's identical export, so the same two-field error shape now has two independent definitions in the same lifecycle/ directory that someone has to remember to keep in sync.
   - Evidence: export interface SlotLifecycleFailure {
     errorType: string;
     message: string;
     }
     in pool.ts, byte-for-byte the same as the SlotLifecycleFailure already exported from ./common.ts (which pool.ts doesn't import).
   - Smallest fix: Delete the local interface in pool.ts and import SlotLifecycleFailure (and ideally LifecycleResult) from ./common.ts like the rest of the lifecycle module already does.

7. **Repeated Switches** (medium) -- `ts/packages/capabilities/slots/src/operations/gc.ts:216-252`
   - Roast: gcActionText and gcActionIntent each re-walk the exact same seven-case SlotGcAction union just to hand back a label or a paint color, so every new gc outcome means editing two parallel switch statements (plus the type union and countGcActions over in lifecycle/gc.ts) and hoping you didn't miss one.
   - Evidence: function gcActionText(action) { switch (action) { case "freed": return "Freed"; ... } } immediately followed by function gcActionIntent(action) { switch (action) { case "freed": return "success"; ... } } — same case list, two functions.
   - Smallest fix: Replace both switches with one lookup table `const GC_ACTION_PRESENTATION: Record<SlotGcAction, { text: string; intent: ... }>` and read `.text`/`.intent` from it at the two call sites.

8. **Duplicated Code** (medium) -- `ts/packages/capabilities/slots/src/operations/gt/exec/stack-map-branches.ts:276-279`
   - Roast: The 'forked stack' warning sentence is hand-typed a second time instead of reusing the renderer that already exists one file away for the identical case.
   - Evidence: renderStackWarnings: `` `branch ${fork.branch} has ${fork.children.length} Graphite children; descendants follow the first child only` `` duplicates stack-integrity.ts's `renderStackFork` (lines 72-74), which produces the exact same string, even though both files already import shared renderers from `./metadata-warnings.ts`.
   - Smallest fix: Move renderStackFork into metadata-warnings.ts (next to renderChildrenCorruption/renderTrunkMarkerWarnings) and import it from both stack-integrity.ts and stack-map-branches.ts.

9. **Message Chains** (medium) -- `ts/packages/capabilities/slots/src/operations/gt/exec/stack-map-branches.ts:81-100`
   - Roast: Every Graphite exec command has to drill through resolved.repoCtx.repo.root/mainRepoRoot by hand, so the same three-hop chain is copy-pasted into every file that calls resolveRepoAndCurrentBranch.
   - Evidence: `ctx.gt.stack(resolved.repoCtx.repo.root)`, `ctx.gt.stackGraph(resolved.repoCtx.repo.root)`, `mainRepoRoot: resolved.repoCtx.repo.mainRepoRoot` here; the identical `resolved.repoCtx.repo.root` / `.mainRepoRoot` chain is repeated verbatim in quiescence.ts (lines 85, 134), stack-branches.ts (line 34), and free-stack.ts (repoCtx.repo.root / repoCtx.repo.mainRepoRoot).
   - Smallest fix: Have resolveRepoAndCurrentBranch (gt/shared.ts) return flattened `repoRoot`/`mainRepoRoot` fields alongside repoCtx so callers stop reaching through repoCtx.repo each time.
