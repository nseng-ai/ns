# ts/packages/roaster -- code-smell findings

Source: automated code-smell-roaster sweep (see repo root `.sdl/reviews/code-smell-roaster.md`), adversarially verified. 6 confirmed finding(s) (0 high, 4 medium, 2 low).

Re-verify file paths and line numbers at pickup time -- the repo moves between the sweep and implementation.

## ts/packages/roaster/src

1. **Duplicated Code** (medium) -- `ts/packages/roaster/src/gateways/review-catalog.ts:56-68`
   - Roast: The reviews-dir existence/type check is hand-copied between listReviewKeys and resolveReviewPath with the same two error types and near-identical messages, so the directory-validation rule now has two places that can silently disagree.
   - Evidence: listReviewKeys (lines 56-68) and resolveReviewPath (lines 215-225) both do `directoryStatus(...)` then branch on "missing" -> reviews-dir-missing / not "directory" -> reviews-dir-not-directory with essentially the same message templates.
   - Smallest fix: Pull the missing/not-directory branch into one `requireReviewsDirectory(path): RoasterResult<string>` helper and call it from both listReviewKeys and resolveReviewPath.

2. **Duplicated Code** (medium) -- `ts/packages/roaster/src/gateways/review-runner-diff-cap.ts:76`
   - Roast: The exact same omitted-file-to-markdown-row formula is retyped character-for-character in two files, so anyone who tweaks the omitted-file message has to remember to hunt down its twin or watch the prompt header and the PR comment quietly drift apart.
   - Evidence: review-runner-diff-cap.ts:76 `# - ${file.path} (${file.changeKind}, ${file.byteSize} bytes, ~${file.estimatedTokens} tokens, +${file.addedLines}/-${file.removedLines}; ${file.reason.replaceAll("-", " ")})` is duplicated almost verbatim at findings-comment.ts:196 `- \` ${file.path}\` (${file.changeKind}, ${file.byteSize} bytes, ~${file.estimatedTokens} tokens, +${file.addedLines}/-${file.removedLines}; ${file.reason.replaceAll("-", " ")})`
   - Smallest fix: Extract a shared `formatOmittedReviewInputFile(file): string` (taking just the prefix/wrapper as a param or returning the field list) and call it from both buildCappedDiffHeader and renderInputCoverage.

3. **Duplicated Code** (medium) -- `ts/packages/roaster/src/operations/cli-operations.ts:551-553`
   - Roast: Someone reinvented totalInputTokens three lines after the package already exported a function that does the exact same sum, so the formula now lives in two places waiting to drift apart.
   - Evidence: function totalInputTokens(usage: ReviewUsage): number { return usage.inputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens; } -- byte-identical to models.ts:317-319's exported reviewUsageTotalInputTokens, which is never imported anywhere in the package.
   - Smallest fix: Delete the local totalInputTokens in cli-operations.ts and import reviewUsageTotalInputTokens from ../models.ts instead.

4. **Repeated Switches** (medium) -- `ts/packages/roaster/src/skill-reviews.ts:86-123`
   - Roast: Four functions in a row independently re-derive 'is this a tripwire or a deep review' and hand-roll a different string for each branch, so adding a third review role means hunting down and editing four near-identical if/ternary pairs.
   - Evidence: roastSkillSurfaceForDefinition, roastSkillTitleForDefinition, roastSkillLabel, and roastDefaultPrompt each independently test `roasterReviewDisplayRole(definition.modelProfile) === "tripwire"` (the last two combined with `key.endsWith("-tripwire")` in two of them) to pick between a tripwire-flavored and roast-flavored string.
   - Smallest fix: Replace the four parallel role checks with one lookup keyed by RoasterReviewDisplayRole (e.g. a Record<RoasterReviewDisplayRole, {surfacePrefix, labelPrefix, promptVerb}>) that each function consults once.

5. **Duplicated Code** (low) -- `ts/packages/roaster/src/commands/review-ls.ts:14-24`
   - Roast: review-ls.ts is a byte-for-byte clone of review-list.ts's command wiring (same schema, resultSchema, renderHuman, handler) with only the name/summary swapped, so every future option on `review list` has to be remembered twice for an alias that adds zero behavior of its own.
   - Evidence: Both review-list.ts:16-26 and review-ls.ts:14-24 define `roasterSdlCommand({ schema: reviewListRequestSchema, resultSchema: reviewListResultSchema, renderHuman: (data, _caps) => renderReviewList(data), async handler(runtime, request) { return await runReviewList(runtime, request); } })` verbatim.
   - Smallest fix: Build `roasterReviewLsCommand` by spreading `roasterReviewListCommand`'s config and overriding only name/summary/description, instead of retyping the schema/resultSchema/renderHuman/handler block.

6. **Duplicated Code** (low) -- `ts/packages/roaster/src/inline-publication.ts:26-45`
   - Roast: The fetch-changed-files block and the fetch-review-comments block are the same try/catch-then-check-error-type dance copy-pasted with the variable names swapped, so every future gateway call in this function will keep cloning the same six lines.
   - Evidence: Both `changedFilesResult` (lines 27-35) and `reviewCommentsResult` (lines 37-45) follow the identical shape: declare result var, try { await ctx.github.X(...) } catch { return {...emptyInlineResult(), apiError: formatErrorMessage(caught)} }, then if (result.type === "error") return {...emptyInlineResult(), apiError: result.error.message}.
   - Smallest fix: Extract a small helper like `await callGithubOrEmptyResult(() => ctx.github.getPrChangedFiles(...))` that wraps the try/catch and error-type check once, and call it for both requests.
