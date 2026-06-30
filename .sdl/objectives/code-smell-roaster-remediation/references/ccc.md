# ts/packages/ccc -- code-smell findings

Source: automated code-smell-roaster sweep (see repo root `.sdl/reviews/code-smell-roaster.md`), adversarially verified. 4 confirmed finding(s) (1 high, 3 medium, 0 low).

Re-verify file paths and line numbers at pickup time -- the repo moves between the sweep and implementation.

## ts/packages/ccc/src

1. **Duplicated Code** (high) -- `ts/packages/ccc/src/cmux/dispatch-from-trunk.ts:76-93`
   - Roast: Two command handlers in two different files independently hand-roll the exact same prompt-dispatch pipeline and success-message block, so the obvious future bug is the one that gets fixed in only one of them.
   - Evidence: dispatch-from-trunk.ts:85-92 reproduces dispatch-prompt.ts:126-133 verbatim: `[\`Opened cmux workspace: ${target.branchName}\`, \`Parent: ${branch.parentBranch}\`, \`Start point: ${branch.startPoint}\`, \`Dispatch payload: ${stored.value.namespace}/${stored.value.key}\`, \`Entry Locator: ${stored.value.refName}\`].join("\n")`, wrapping the same create-branch -> storeDispatchPromptPayload -> openBranchInCmuxSlot sequence found in handleCccSlotDispatchPrompt (dispatch-prompt.ts:85-138).
   - Smallest fix: Extract a shared `dispatchTrackedBranchPrompt({ pi, ctx, branch, content, parentLabel, slotClient, payloadOptions })` helper (and its successMessage formatter) in dispatch-prompt.ts that both handleCccSlotDispatchPrompt and handleCccSlotDispatchFromTrunk call, leaving each file only the branch-resolution strategy that actually differs (current branch vs. refreshed trunk).

2. **Duplicated Code** (medium) -- `ts/packages/ccc/src/cmux/objective-sidebar.ts:91-129`
   - Roast: validateObjectiveSidebarSlug and applyObjectiveSidebarFields are the same four-step exec/check-exit/parse-envelope dance copy-pasted with different argv, so the error-handling logic has two places to drift out of sync.
   - Evidence: Both functions repeat: try { result = await pi.exec(cmd, args, {...}) } catch { return {type:"failed", message: formatStartupFailure(...)} }; then `if (result.killed || result.code !== 0) return {type:"failed", message: formatFailedEnvelopeOrExecFailure(...)}`; then `parseMachineEnvelopeData(result.stdout, {...})` with a `parsed.type !== "valid"` bailout (lines 97-128 and 201-230).
   - Smallest fix: Factor the exec-then-parse-machine-envelope shape into one `runJsonExecCommand(pi, cwd, command, args, label, summary)` helper that both functions call, leaving only the slug/field-specific validation as the differing tail.

3. **Message Chains** (medium) -- `ts/packages/ccc/src/cmux/slot-dispatch-plan.ts:51-53`
   - Roast: Wrapping `PlanStoreDirectoryEvidence` in a single-field `CurrentCheckout` adds an indirection that does nothing but force every caller to spell out `checkout.directory.repoRoot` and `checkout.directory.sourceBranch` over and over.
   - Evidence: `interface CurrentCheckout { directory: PlanStoreDirectoryEvidence; }` (line 51-53), then `checkout.directory.repoRoot` / `checkout.directory.sourceBranch` are walked at lines 148, 159-160, 164, 284-285, 304, 307, 309, 326, and 372 instead of just `checkout.repoRoot`.
   - Smallest fix: Drop the `CurrentCheckout` wrapper and have `resolveCurrentCheckout` return `PlanStoreDirectoryEvidence` (or a result union over it) directly so call sites read `checkout.repoRoot` / `checkout.sourceBranch`.

4. **Speculative Generality** (medium) -- `ts/packages/ccc/src/launch-status.ts:1-15`
   - Roast: This whole file is an abstraction built for a caller that never showed up.
   - Evidence: `LaunchStatusUpdater` and `setLaunchStatus(updater, value)` are exported, but a repo-wide grep for `launch-status` and `setLaunchStatus` outside this file turns up zero importers or callers in ts/ — meanwhile the real call sites (`src/cmux/sidebar.ts`, `src/cmux/slot-open-branch.ts`) hand-roll their own equivalent `hasUI`-guarded `ui.setStatus`/`ui.notify` wrappers instead of using it.
   - Smallest fix: Delete the unused file, or if the unification is actually wanted, replace the duplicated inline guards in sidebar.ts/slot-open-branch.ts with calls to it so it has a real reason to exist.
