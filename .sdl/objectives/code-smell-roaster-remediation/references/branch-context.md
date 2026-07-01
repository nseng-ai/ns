# ts/packages/branch-context -- code-smell findings

Source: automated code-smell-roaster sweep (see repo root `.sdl/reviews/code-smell-roaster.md`), adversarially verified. 3 confirmed finding(s) (1 high, 2 medium, 0 low).

Re-verify file paths and line numbers at pickup time -- the repo moves between the sweep and implementation.

## ts/packages/branch-context/src

1. **Repeated Switches** (high) -- `ts/packages/branch-context/src/operations.ts:370-417`
   - Roast: branchContextErrorCode and branchContextErrorData run the exact same instanceof cascade over seven error classes back-to-back, so every new branch-context error type means editing two parallel switches that nothing forces you to keep in sync.
   - Evidence: function branchContextErrorCode(error: unknown): string { if (error instanceof NoAttachedBranchContextEntriesError) ... } and immediately below it function branchContextErrorData(error: unknown): Record<string, unknown> { if (error instanceof NoAttachedBranchContextEntriesError) return { branch: error.branch }; ... } repeating the identical instanceof ordering for AmbiguousBranchContextPlanEntryError, UnsupportedBranchContextPlanKeyError, NoSupportedBranchContextPlanEntriesError, RequestedBranchContextPlanKeyNotFoundError, SavedPlanFallbackLoadError, BranchContextNamespaceInvalidError.
   - Smallest fix: Replace the two cascades with one classification table or a single function that returns { code, data } per error type (or move code/data onto the error classes themselves) so both call sites read from one place instead of two switches that can silently drift apart.

2. **Duplicated Code** (medium) -- `ts/packages/branch-context/src/attach.ts:110, 124, 143, 163, 385`
   - Roast: The exact 'unwrap result-or-throw' shape is copy-pasted across attach.ts, attached-plan.ts, and branch-context-creation.ts a dozen-plus times instead of living in one helper.
   - Evidence: Repeated literal pattern: `if (!list.ok) throw new Error(list.error.message);` / `if (presence.type === "error") throw new Error(presence.error.message);` / `if (!deleted.ok) throw new Error(deleted.error.message);` etc., also at attached-plan.ts:220,238 and branch-context-creation.ts:275,286,311,365,381,428.
   - Smallest fix: Extract a single `unwrapBrmemResult(result)` (or similar) helper in branch-memory.ts/context.ts that throws `new Error(result.error.message)` on failure and returns the value otherwise, and call it from all these sites.

3. **Duplicated Code** (medium) -- `ts/packages/branch-context/src/testing/index.ts:149-189`
   - Roast: putEntry and createEntry copy-paste the exact same call-tracking-and-cache-update dance, so the fake now has two places to forget when the entry shape changes.
   - Evidence: Both methods do `this.putEntryCalls.push({ ...options }); const result = await this.fake.<method>(options); if (result.type === "ok" && options.namespace === BRANCH_CONTEXT_NAMESPACE) { this.entries.set(entryKey(...), { branch, key, content, refName: result.value.entry.entryLocator, commit: result.value.commitSha, sourceFile: "" }); } return result;` verbatim except for which `this.fake.*` method is called.
   - Smallest fix: Extract a private helper like `recordPutResult(options, result)` (or a shared `applyEntryWrite(method, options)`) that both putEntry and createEntry call, so the cache-sync logic lives in exactly one place.
